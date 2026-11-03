-- OP-ORG-010: leaving an organization ends your authority and tells its administration.
begin;
select no_plan();

insert into identity.people (id, given_name, family_name, contact_email)
values
  ('019d1500-0000-7000-8000-000000000001', 'Olga', 'Owner', 'owner@example.test'),
  ('019d1500-0000-7000-8000-000000000002', 'Ada', 'Admin', 'admin@example.test'),
  ('019d1500-0000-7000-8000-000000000003', 'Cora', 'Coach', 'coach@example.test'),
  ('019d1500-0000-7000-8000-000000000004', 'Sam', 'Staff', 'staff@example.test'),
  ('019d1500-0000-7000-8000-000000000005', 'Cli', 'Ent', null),
  ('019d1500-0000-7000-8000-000000000006', 'Out', 'Sider', null),
  ('019d1500-0000-7000-8000-000000000007', 'Nora', 'Noroles', null),
  ('019d1500-0000-7000-8000-000000000008', 'Otto', 'Other', 'other@example.test'),
  ('019d1500-0000-7000-8000-000000000009', 'Mute', 'Admin', null);
insert into organizations.organizations (id, type_code, display_name, responsible_party)
values
  ('019d1500-0000-7000-8000-000000000101', 'gym', 'Resignation gym',
   '{"party_kind":"legal_entity","party_name":"Resignation gym","purpose":"studio_operations"}'),
  ('019d1500-0000-7000-8000-000000000102', 'gym', 'Other tenant',
   '{"party_kind":"legal_entity","party_name":"Other tenant","purpose":"studio_operations"}');
insert into organizations.organization_memberships (id, organization_id, person_id)
values
  ('019d1500-0000-7000-8000-000000000201', '019d1500-0000-7000-8000-000000000101', '019d1500-0000-7000-8000-000000000001'),
  ('019d1500-0000-7000-8000-000000000202', '019d1500-0000-7000-8000-000000000101', '019d1500-0000-7000-8000-000000000002'),
  ('019d1500-0000-7000-8000-000000000203', '019d1500-0000-7000-8000-000000000101', '019d1500-0000-7000-8000-000000000003'),
  ('019d1500-0000-7000-8000-000000000204', '019d1500-0000-7000-8000-000000000101', '019d1500-0000-7000-8000-000000000004'),
  ('019d1500-0000-7000-8000-000000000207', '019d1500-0000-7000-8000-000000000101', '019d1500-0000-7000-8000-000000000007'),
  ('019d1500-0000-7000-8000-000000000210', '019d1500-0000-7000-8000-000000000101', '019d1500-0000-7000-8000-000000000009'),
  -- The same professional in a second tenant keeps that membership and its work.
  ('019d1500-0000-7000-8000-000000000208', '019d1500-0000-7000-8000-000000000102', '019d1500-0000-7000-8000-000000000003'),
  ('019d1500-0000-7000-8000-000000000209', '019d1500-0000-7000-8000-000000000102', '019d1500-0000-7000-8000-000000000008');
insert into organizations.membership_roles (membership_id, role_code)
values
  ('019d1500-0000-7000-8000-000000000201', 'owner'),
  ('019d1500-0000-7000-8000-000000000202', 'admin'),
  ('019d1500-0000-7000-8000-000000000203', 'coach'),
  ('019d1500-0000-7000-8000-000000000203', 'staff'),
  ('019d1500-0000-7000-8000-000000000204', 'staff'),
  ('019d1500-0000-7000-8000-000000000210', 'admin'),
  ('019d1500-0000-7000-8000-000000000208', 'coach'),
  ('019d1500-0000-7000-8000-000000000209', 'owner');
insert into relationships.service_relationships (id, person_id, organization_id, status)
values
  ('019d1500-0000-7000-8000-000000000301', '019d1500-0000-7000-8000-000000000005',
   '019d1500-0000-7000-8000-000000000101', 'active'),
  ('019d1500-0000-7000-8000-000000000302', '019d1500-0000-7000-8000-000000000005',
   '019d1500-0000-7000-8000-000000000102', 'active');
insert into relationships.relationship_professional_assignments
  (id, relationship_id, person_id, organization_id, membership_id, kind, status, valid_from)
values
  ('019d1500-0000-7000-8000-000000000401', '019d1500-0000-7000-8000-000000000301',
   '019d1500-0000-7000-8000-000000000005', '019d1500-0000-7000-8000-000000000101',
   '019d1500-0000-7000-8000-000000000203', 'holder', 'active', clock_timestamp()),
  ('019d1500-0000-7000-8000-000000000402', '019d1500-0000-7000-8000-000000000302',
   '019d1500-0000-7000-8000-000000000005', '019d1500-0000-7000-8000-000000000102',
   '019d1500-0000-7000-8000-000000000208', 'holder', 'active', clock_timestamp());
-- Authored by the member who leaves: authorship must survive the resignation.
insert into identity.invitations
  (id, organization_id, issued_by_membership_id, channel, contact, token_hash,
   token_key_version, proposal_hash, responsible_party, status, expires_at)
values ('019d1500-0000-7000-8000-000000000501', '019d1500-0000-7000-8000-000000000101',
  '019d1500-0000-7000-8000-000000000203', 'email', 'authored@example.test',
  extensions.digest('resign-token','sha256'), 1, extensions.digest('resign-proposal','sha256'),
  '{"party_kind":"legal_entity","party_name":"Resignation gym","purpose":"studio_operations"}',
  'completed', clock_timestamp() + interval '7 days');

create temporary table original_authored as
  select to_jsonb(i) as value from identity.invitations i
  where id = '019d1500-0000-7000-8000-000000000501';
create temporary table other_tenant as
  select (select to_jsonb(m) from organizations.organization_memberships m
          where id = '019d1500-0000-7000-8000-000000000208') as membership,
         (select to_jsonb(a) from relationships.relationship_professional_assignments a
          where id = '019d1500-0000-7000-8000-000000000402') as assignment;
create temporary table resignation_result (result jsonb);
grant select, insert on resignation_result to allfit_api;

create function pg_temp.as_person(person_number integer) returns void language sql as $$
  select set_config('app.actor_kind', 'person', true),
         set_config('app.actor_person_id',
           '019d1500-0000-7000-8000-' || lpad(person_number::text, 12, '0'), true);
$$;
create function pg_temp.resign(command_number integer, hash_seed text default 'resign')
returns table(result jsonb, replayed boolean)
language sql as $$
  select * from organizations.resign_membership(
    access_control.person(), '019d1500-0000-7000-8000-000000000101',
    ('019d1500-0000-4000-8000-' || lpad(command_number::text, 12, '0'))::uuid,
    ('019d1500-0000-7000-8000-' || lpad(command_number::text, 12, '0'))::uuid,
    extensions.digest(hash_seed, 'sha256'));
$$;

set local role allfit_api;
select pg_temp.as_person(1);
select throws_ok($$select * from pg_temp.resign(901)$$,
  '22023', null, 'T-ORG-RLS-RESIGN-01 an owner cannot resign without transferring ownership');
select pg_temp.as_person(6);
select throws_ok($$select * from pg_temp.resign(902)$$,
  'P0002', null, 'T-ORG-RLS-RESIGN-02 an outsider has no membership to resign');
select pg_temp.as_person(8);
select throws_ok($$select * from pg_temp.resign(903)$$,
  'P0002', null, 'T-ORG-RLS-RESIGN-03 a member of another tenant cannot address this one');
select pg_temp.as_person(3);
select throws_ok($$select * from organizations.resign_membership(
    '019d1500-0000-7000-8000-000000000004', '019d1500-0000-7000-8000-000000000101',
    gen_random_uuid(), gen_random_uuid(), extensions.digest('impersonate', 'sha256'))$$,
  '42501', null, 'T-ORG-RLS-RESIGN-04 actor parameters cannot resign for another person');
select pg_temp.as_person(7);
select lives_ok($$select * from pg_temp.resign(904)$$,
  'T-ORG-RLS-RESIGN-05 a member with no roles left can still resign');

reset role;
create function pg_temp.fail_resignation_notice() returns trigger language plpgsql as $$
begin
  if new.event_type = 'organization.membership_resigned.v1' then
    raise exception 'injected notice failure' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger test_fail_resignation_notice before insert on system.outbox_events
for each row execute function pg_temp.fail_resignation_notice();
set local role allfit_api;
select pg_temp.as_person(3);
select throws_ok($$select * from pg_temp.resign(905)$$,
  'P0001', null, 'T-ORG-INT-RESIGN-01 a notice that cannot be written rolls the resignation back');
reset role;
drop trigger test_fail_resignation_notice on system.outbox_events;
select is((select status::text from organizations.organization_memberships
  where id = '019d1500-0000-7000-8000-000000000203'), 'active',
  'T-ORG-INT-RESIGN-02 the failed resignation keeps the membership active');
select is((select status::text from relationships.relationship_professional_assignments
  where id = '019d1500-0000-7000-8000-000000000401'), 'active',
  'T-ORG-INT-RESIGN-03 the failed resignation keeps the assignment active');

set local role allfit_api;
select pg_temp.as_person(3);
insert into resignation_result select result from pg_temp.resign(906);
reset role;

select ok((select result->>'membership_id' = '019d1500-0000-7000-8000-000000000203'
  from resignation_result), 'T-ORG-INT-RESIGN-04 the membership resolves from the actor');
select ok((select status = 'terminated'
    and ended_at = ((select result->>'ended_at' from resignation_result))::timestamptz
  from organizations.organization_memberships
  where id = '019d1500-0000-7000-8000-000000000203'),
  'T-ORG-INT-RESIGN-05 the membership ends at the returned instant');
select is((select count(*)::int from organizations.membership_roles r
  join organizations.organization_memberships m on m.id = r.membership_id
  where r.membership_id = '019d1500-0000-7000-8000-000000000203'
    and r.valid_to is distinct from m.ended_at), 0,
  'T-ORG-INT-RESIGN-06 every role closes at the same instant');
select ok((select status = 'ended' and valid_to = (select ended_at
    from organizations.organization_memberships where id = '019d1500-0000-7000-8000-000000000203')
  from relationships.relationship_professional_assignments
  where id = '019d1500-0000-7000-8000-000000000401'),
  'T-ORG-INT-RESIGN-07 effective assignments close unconditionally');
select is((select status::text from relationships.service_relationships
  where id = '019d1500-0000-7000-8000-000000000301'), 'active',
  'T-ORG-INT-RESIGN-08 the service relationship survives without a professional');
select ok((select membership = (select to_jsonb(m) from organizations.organization_memberships m
    where id = '019d1500-0000-7000-8000-000000000208')
  and assignment = (select to_jsonb(a) from relationships.relationship_professional_assignments a
    where id = '019d1500-0000-7000-8000-000000000402') from other_tenant),
  'T-ORG-INT-RESIGN-09 the other tenant is untouched');
select is((select to_jsonb(i) from identity.invitations i
  where id = '019d1500-0000-7000-8000-000000000501'), (select value from original_authored),
  'T-ORG-INT-RESIGN-10 authorship is preserved');
select ok((select "before"->>'status' = 'active' and "after"->>'status' = 'terminated'
  from organizations.membership_events
  where membership_id = '019d1500-0000-7000-8000-000000000203'
    and event_type = 'organization.membership_resigned.v1'),
  'T-ORG-INT-RESIGN-11 the membership event records the resignation');
select is((select array_agg(payload->>'contact' order by payload->>'contact')
  from system.outbox_events
  where aggregate_id = '019d1500-0000-7000-8000-000000000203'
    and event_type = 'organization.membership_resigned.v1'),
  array['admin@example.test', 'owner@example.test'],
  'T-ORG-INT-RESIGN-12 each owner and administrator with a contact is notified, nobody else');
select ok((select bool_and(payload->>'organization_name' = 'Resignation gym'
    and payload->>'member_name' = 'Cora Coach'
    and (payload->>'ended_at')::timestamptz = (select ended_at
      from organizations.organization_memberships where id = '019d1500-0000-7000-8000-000000000203'))
  from system.outbox_events
  where aggregate_id = '019d1500-0000-7000-8000-000000000203'
    and event_type = 'organization.membership_resigned.v1'),
  'T-ORG-INT-RESIGN-13 the notice says who left, from where and when');

set local role allfit_api;
select pg_temp.as_person(3);
select ok((select replayed and result = (select result from resignation_result)
  from pg_temp.resign(906)), 'T-ORG-IDEM-RESIGN-01 a retry replays the original resignation');
select ok((select not replayed and result = (select result from resignation_result)
  from pg_temp.resign(907)), 'T-ORG-IDEM-RESIGN-02 a new command converges on the original instant');
select throws_ok($$select * from pg_temp.resign(906, 'changed')$$,
  '23505', null, 'T-ORG-IDEM-RESIGN-03 a reused key with another request is rejected');
reset role;
select is((select count(*)::int from organizations.membership_events
  where membership_id = '019d1500-0000-7000-8000-000000000203'
    and event_type = 'organization.membership_resigned.v1'), 1,
  'T-ORG-IDEM-RESIGN-04 convergence writes no second event');
select is((select count(*)::int from system.outbox_events
  where aggregate_id = '019d1500-0000-7000-8000-000000000203'
    and event_type = 'organization.membership_resigned.v1'), 2,
  'T-ORG-IDEM-RESIGN-05 convergence sends no second notice');

-- A membership an administrator terminated was not resigned, so it does not converge.
set local role allfit_api;
select pg_temp.as_person(2);
select lives_ok($$select * from organizations.terminate_membership(
    '019d1500-0000-7000-8000-000000000002', '019d1500-0000-7000-8000-000000000101',
    '019d1500-0000-7000-8000-000000000204', gen_random_uuid(), gen_random_uuid(),
    extensions.digest('terminate-staff', 'sha256'))$$,
  'T-ORG-INT-RESIGN-14 fixture: an administrator terminates the staff member');
select pg_temp.as_person(4);
select throws_ok($$select * from pg_temp.resign(908)$$,
  'P0002', null, 'T-ORG-RLS-RESIGN-06 a terminated member has nothing left to resign');
select pg_temp.as_person(3);
select throws_ok($$select * from organizations.terminate_membership(
    '019d1500-0000-7000-8000-000000000003', '019d1500-0000-7000-8000-000000000101',
    '019d1500-0000-7000-8000-000000000202', gen_random_uuid(), gen_random_uuid(),
    extensions.digest('after-resign', 'sha256'))$$,
  'P0002', null, 'T-ORG-RLS-RESIGN-07 a resigned member no longer reaches the tenant');

select * from finish();
rollback;
