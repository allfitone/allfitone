-- T-ORG-SUSPEND-02 — HU-BO-016 criterion 2: a suspended gym gains no client.
--
-- Suspending stops a gym from inviting, but an invitation sent before the suspension
-- was still pending, and accepting it never looked at the gym. The relationship it
-- created was born after the suspension wrote one block per person the gym served, so
-- it carried none: the stopped gym gained a client it could work with.
--
-- Suspending is not cancelling, so the invitation is not revoked. Accepting is refused
-- while the gym is stopped, the invitation stays open until it expires, and declining
-- is always allowed. Runs as `allfit_api`, so row-level security is real.
begin;
select plan(8);

insert into identity.people (id, given_name, family_name)
select ('019d1600-0000-7000-8000-' || lpad(n::text, 12, '0'))::uuid, 'Suspend', 'Fixture'
from generate_series(1, 4) n;
insert into organizations.organizations (id, type_code, display_name, responsible_party)
values ('019d1600-0000-7000-8000-000000000101', 'gym', 'Paused gym',
  '{"party_kind":"legal_entity","party_name":"Paused gym","purpose":"studio_operations"}');
insert into organizations.organization_memberships (id, organization_id, person_id)
values ('019d1600-0000-7000-8000-000000000201', '019d1600-0000-7000-8000-000000000101',
  '019d1600-0000-7000-8000-000000000001');
insert into organizations.membership_roles (membership_id, role_code)
values ('019d1600-0000-7000-8000-000000000201', 'owner');
insert into privacy.scope_definitions (id, scope_code, version_number, status, published_at)
values ('019d1600-0000-7000-8000-000000000401', 'relationship_training', 1, 'draft',
  null);

-- IX-06: offering contribute needs a published contribute rule, as the real
-- relationship_training has. A rule is written while its version is a draft.
insert into privacy.scope_resource_rules (
  scope_definition_id, resource, field, data_classification_code, max_action
) values ('019d1600-0000-7000-8000-000000000401', 'planning.program_assignments', '*', 'training', 'contribute');
update privacy.scope_definitions
   set status = 'published', published_at = clock_timestamp()
 where id = '019d1600-0000-7000-8000-000000000401';

-- The runtime cannot read invitations, so the test resolves the intent it answers.
create temporary table open_intents (contact text, intent_id uuid);
grant select on open_intents to allfit_api;

create function pg_temp.as_person(person_number integer, email text default null)
returns void language sql as $$
  select set_config('app.actor_kind', 'person', true),
         set_config('app.actor_person_id',
           '019d1600-0000-7000-8000-' || lpad(person_number::text, 12, '0'), true),
         set_config('app.actor_verified_email', coalesce(email, ''), true),
         set_config('app.request_id', gen_random_uuid()::text, true);
$$;
create function pg_temp.invite(contact text, command_number integer)
returns table(invitation_id uuid)
language sql as $$
  select invitation_id from identity.issue_client_invitation(
    access_control.person(), '019d1600-0000-7000-8000-000000000101'::uuid,
    'email', contact,
    '[{"scope_code":"relationship_training","access_level":"contribute","purpose":"Entrenar",
       "presented_snapshot":{"title":"Entrenamiento"}}]'::jsonb,
    extensions.digest(contact, 'sha256'), 1::smallint,
    ('019d1600-0000-4000-8000-' || lpad(command_number::text, 12, '0'))::uuid,
    ('019d1600-0000-7000-8000-' || lpad(command_number::text, 12, '0'))::uuid,
    extensions.digest('invite' || contact, 'sha256'));
$$;
create function pg_temp.decide(contact text, decision text, command_number integer)
returns table(relationship_id uuid)
language sql as $$
  select relationship_id from identity.decide_client_invitation(
    access_control.person(), extensions.digest(contact, 'sha256'),
    (select intent_id from open_intents where open_intents.contact = decide.contact),
    decision, '{"relationship_training":"accepted"}'::jsonb,
    ('019d1600-0000-4000-8000-' || lpad(command_number::text, 12, '0'))::uuid,
    ('019d1600-0000-7000-8000-' || lpad(command_number::text, 12, '0'))::uuid,
    extensions.digest(decision || contact, 'sha256'));
$$;

-- Two invitations go out while the gym operates.
set local role allfit_api;
select pg_temp.as_person(1);
select lives_ok($$select * from pg_temp.invite('ana@example.test', 901)$$,
  'T-ORG-SUSPEND-INT-01 an operating gym invites');
select lives_ok($$select * from pg_temp.invite('bea@example.test', 902)$$,
  'T-ORG-SUSPEND-INT-02 and invites again');
reset role;
insert into open_intents
  select invitation.contact::text, intent.id
  from identity.invitations invitation
  join identity.invitation_intents intent on intent.invitation_id = invitation.id;

update organizations.organizations
set status = 'suspended', suspended_at = clock_timestamp()
where id = '019d1600-0000-7000-8000-000000000101';

set local role allfit_api;
select pg_temp.as_person(3, 'ana@example.test');
select throws_ok($$select * from pg_temp.decide('ana@example.test', 'accepted', 903)$$,
  'AF423', null,
  'T-ORG-SUSPEND-INT-03 accepting an invitation from a suspended gym is refused');
reset role;
select ok((select invitation.status = 'pending' and intent.status = 'pending'
  from identity.invitations invitation
  join identity.invitation_intents intent on intent.invitation_id = invitation.id
  where invitation.contact = 'ana@example.test'),
  'T-ORG-SUSPEND-INT-04 the invitation stays open: suspending is not cancelling');
select is((select count(*)::int from relationships.service_relationships
  where organization_id = '019d1600-0000-7000-8000-000000000101'), 0,
  'T-ORG-SUSPEND-INT-05 and the suspended gym gained no client');

set local role allfit_api;
select pg_temp.as_person(4, 'bea@example.test');
select lives_ok($$select * from pg_temp.decide('bea@example.test', 'rejected', 904)$$,
  'T-ORG-SUSPEND-INT-06 a person may always decline, whatever state the gym is in');
reset role;

update organizations.organizations
set status = 'active', suspended_at = null
where id = '019d1600-0000-7000-8000-000000000101';

set local role allfit_api;
select pg_temp.as_person(3, 'ana@example.test');
select isnt((select relationship_id from pg_temp.decide('ana@example.test', 'accepted', 905)),
  null,
  'T-ORG-SUSPEND-INT-07 once the gym operates again, the same invitation is accepted');
reset role;
select is((select count(*)::int from relationships.service_relationships
  where organization_id = '019d1600-0000-7000-8000-000000000101' and status = 'active'), 1,
  'T-ORG-SUSPEND-INT-08 and the client it gains is the one who accepted, not the one who declined');

select * from finish();
rollback;
