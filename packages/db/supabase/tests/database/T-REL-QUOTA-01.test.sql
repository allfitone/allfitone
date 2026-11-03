-- HU-STUDIO-087: a gym cannot fill more places than Allfit sold it.
--
-- Runs as `allfit_api`, so row-level security is real. That is the point: the
-- coach who invites cannot read the gym's directory, and the person who accepts
-- can read only her own relationship, yet both must meet the full count.
begin;
select no_plan();

insert into identity.people (id, given_name, family_name)
select ('019d1580-0000-7000-8000-' || lpad(n::text, 12, '0'))::uuid, 'Quota', 'Fixture'
from generate_series(1, 9) n;
insert into organizations.organizations
  (id, type_code, display_name, responsible_party, guest_quota_seats)
values
  ('019d1580-0000-7000-8000-000000000101', 'gym', 'Quota gym',
   '{"party_kind":"legal_entity","party_name":"Quota gym","purpose":"studio_operations"}', 3),
  ('019d1580-0000-7000-8000-000000000102', 'gym', 'Unlimited gym',
   '{"party_kind":"legal_entity","party_name":"Unlimited gym","purpose":"studio_operations"}', null);
insert into organizations.organization_memberships (id, organization_id, person_id)
values
  ('019d1580-0000-7000-8000-000000000201', '019d1580-0000-7000-8000-000000000101',
   '019d1580-0000-7000-8000-000000000001'),
  ('019d1580-0000-7000-8000-000000000202', '019d1580-0000-7000-8000-000000000101',
   '019d1580-0000-7000-8000-000000000002'),
  ('019d1580-0000-7000-8000-000000000209', '019d1580-0000-7000-8000-000000000102',
   '019d1580-0000-7000-8000-000000000009');
insert into organizations.membership_roles (membership_id, role_code)
values
  ('019d1580-0000-7000-8000-000000000201', 'owner'),
  -- A coach may invite but holds no `view_directory`: it sees none of the gym's clients.
  ('019d1580-0000-7000-8000-000000000202', 'coach'),
  ('019d1580-0000-7000-8000-000000000209', 'owner');
insert into relationships.service_relationships (id, person_id, organization_id, status)
values ('019d1580-0000-7000-8000-000000000301', '019d1580-0000-7000-8000-000000000005',
  '019d1580-0000-7000-8000-000000000101', 'active');
insert into privacy.scope_definitions (id, scope_code, version_number, status, published_at)
values ('019d1580-0000-7000-8000-000000000401', 'relationship_training', 1, 'published',
  clock_timestamp());

-- The runtime cannot read invitations, so the test resolves the intent it answers.
create temporary table open_intents (contact text, intent_id uuid);
grant select on open_intents to allfit_api;

create function pg_temp.as_person(person_number integer, email text default null)
returns void language sql as $$
  select set_config('app.actor_kind', 'person', true),
         set_config('app.actor_person_id',
           '019d1580-0000-7000-8000-' || lpad(person_number::text, 12, '0'), true),
         set_config('app.actor_verified_email', coalesce(email, ''), true),
         set_config('app.request_id', gen_random_uuid()::text, true);
$$;
create function pg_temp.invite(contact text, command_number integer,
  organization_number integer default 101)
returns table(invitation_id uuid, reused boolean, replayed boolean)
language sql as $$
  select invitation_id, reused, replayed from identity.issue_client_invitation(
    access_control.person(),
    ('019d1580-0000-7000-8000-' || lpad(organization_number::text, 12, '0'))::uuid,
    'email', contact,
    '[{"scope_code":"relationship_training","access_level":"contribute","purpose":"Entrenar",
       "presented_snapshot":{"title":"Entrenamiento"}}]'::jsonb,
    extensions.digest(contact, 'sha256'), 1::smallint,
    ('019d1580-0000-4000-8000-' || lpad(command_number::text, 12, '0'))::uuid,
    ('019d1580-0000-7000-8000-' || lpad(command_number::text, 12, '0'))::uuid,
    extensions.digest('invite' || contact, 'sha256'));
$$;
create function pg_temp.accept(contact text, command_number integer)
returns table(relationship_id uuid)
language sql as $$
  select relationship_id from identity.decide_client_invitation(
    access_control.person(), extensions.digest(contact, 'sha256'),
    (select intent_id from open_intents where open_intents.contact = accept.contact),
    'accepted', '{"relationship_training":"accepted"}'::jsonb,
    ('019d1580-0000-4000-8000-' || lpad(command_number::text, 12, '0'))::uuid,
    ('019d1580-0000-7000-8000-' || lpad(command_number::text, 12, '0'))::uuid,
    extensions.digest('accept' || contact, 'sha256'));
$$;

-- One relationship is live, so two places are left.
set local role allfit_api;
select pg_temp.as_person(2);
select lives_ok($$select * from pg_temp.invite('six@example.test', 901)$$,
  'T-REL-QUOTA-INT-01 a coach invites while places are left');
select lives_ok($$select * from pg_temp.invite('seven@example.test', 902)$$,
  'T-REL-QUOTA-INT-02 the last place can be taken');
select throws_ok($$select * from pg_temp.invite('eight@example.test', 903)$$,
  'AF409', null,
  'T-REL-QUOTA-RLS-01 a coach who cannot read the directory still meets the full count');
select ok((select replayed from pg_temp.invite('seven@example.test', 902)),
  'T-REL-QUOTA-IDEM-01 a retry of an invitation that took a place still replays');
select pg_temp.as_person(1);
select ok((select reused from pg_temp.invite('six@example.test', 904)),
  'T-REL-QUOTA-INT-03 reissuing a pending offer takes no second place');
reset role;
select is((select count(*)::int from identity.invitations
  where contact = 'eight@example.test'), 0,
  'T-REL-QUOTA-INT-04 a refused invitation leaves nothing behind');

-- An invitation that ran out of time frees its place, swept or not.
update identity.invitations
set created_at = clock_timestamp() - interval '8 days',
    expires_at = clock_timestamp() - interval '1 minute'
where contact = 'seven@example.test';
set local role allfit_api;
select pg_temp.as_person(2);
select lives_ok($$select * from pg_temp.invite('eight@example.test', 905)$$,
  'T-REL-QUOTA-INT-05 an expired invitation frees its place');

-- Allfit lowers the quota below what the gym already holds.
reset role;
insert into open_intents
  select invitation.contact::text, intent.id
  from identity.invitations invitation
  join identity.invitation_intents intent on intent.invitation_id = invitation.id;
update organizations.organizations set guest_quota_seats = 2
where id = '019d1580-0000-7000-8000-000000000101';
set local role allfit_api;
select pg_temp.as_person(6, 'six@example.test');
select throws_ok($$select * from pg_temp.accept('six@example.test', 906)$$,
  'AF409', null, 'T-REL-QUOTA-RLS-02 a person accepting over the quota is refused');
reset role;
select ok((select invitation.status = 'pending' and intent.status = 'pending'
  from identity.invitations invitation
  join identity.invitation_intents intent on intent.invitation_id = invitation.id
  where invitation.contact = 'six@example.test'),
  'T-REL-QUOTA-INT-06 the refused acceptance leaves the invitation open');
select is((select count(*)::int from relationships.service_relationships
  where person_id = '019d1580-0000-7000-8000-000000000006'), 0,
  'T-REL-QUOTA-INT-07 the refused acceptance creates no relationship');
select is((select count(*)::int from privacy.data_grants grant_row
  join relationships.service_relationships relationship on relationship.id = grant_row.relationship_id
  where relationship.person_id = '019d1580-0000-7000-8000-000000000006'), 0,
  'T-REL-QUOTA-INT-08 the refused acceptance grants nothing');
select is((select status::text from relationships.service_relationships
  where id = '019d1580-0000-7000-8000-000000000301'), 'active',
  'T-REL-QUOTA-INT-09 lowering the quota never ends a relationship');

-- Accepting converts the place the invitation already held.
update organizations.organizations set guest_quota_seats = 3
where id = '019d1580-0000-7000-8000-000000000101';
set local role allfit_api;
select pg_temp.as_person(6, 'six@example.test');
select lives_ok($$select * from pg_temp.accept('six@example.test', 907)$$,
  'T-REL-QUOTA-INT-10 an acceptance within the quota converts its own place');

select pg_temp.as_person(9);
select lives_ok($$select * from pg_temp.invite('a@example.test', 911, 102);
  select * from pg_temp.invite('b@example.test', 912, 102);
  select * from pg_temp.invite('c@example.test', 913, 102);
  select * from pg_temp.invite('d@example.test', 914, 102)$$,
  'T-REL-QUOTA-INT-11 no quota means no limit, not zero');
reset role;

-- The counting path reveals nothing outside the function that owns it.
select is((select relationships_active from organizations.organization_guest_occupancy(
  '019d1580-0000-7000-8000-000000000101')), 2,
  'T-REL-QUOTA-INT-12 the occupancy counts every live relationship');
set local role allfit_owner;
select pg_temp.as_person(2);
select set_config('app.actor_org_id', '019d1580-0000-7000-8000-000000000101', true),
       set_config('app.occupancy_count_org', '019d1580-0000-7000-8000-000000000101', true),
       set_config('app.occupancy_count_token', repeat('0', 64), true);
select is((select count(*)::int from relationships.service_relationships
  where organization_id = '019d1580-0000-7000-8000-000000000101'), 0,
  'T-REL-QUOTA-RLS-03 a forged counting token reveals no relationship');
select set_config('app.occupancy_count_token', '', true);
select is((select occupied from organizations.organization_guest_occupancy(
  '019d1580-0000-7000-8000-000000000101')), 3,
  'T-REL-QUOTA-INT-13 the coach context still gets the full count');
select is((select count(*)::int from relationships.service_relationships
  where organization_id = '019d1580-0000-7000-8000-000000000101'), 0,
  'T-REL-QUOTA-RLS-04 the counting token does not outlive the count');
reset role;
set local role allfit_api;
select throws_ok($$select * from relationships.occupancy_count_keys$$,
  '42501', null, 'T-REL-QUOTA-RLS-05 the runtime cannot read the counting key');
reset role;

select * from finish();
rollback;
