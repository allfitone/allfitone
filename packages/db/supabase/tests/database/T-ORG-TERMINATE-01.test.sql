-- OP-ORG-009: terminating a membership ends its authority, never the relationship.
begin;
select no_plan();

insert into identity.people (id, given_name, family_name)
select ('019d1400-0000-7000-8000-' || lpad(n::text, 12, '0'))::uuid, 'Termination', 'Fixture'
from generate_series(1, 6) n;
insert into organizations.organizations (id, type_code, display_name, responsible_party)
values ('019d1400-0000-7000-8000-000000000101', 'gym', 'Termination fixture',
  '{"party_kind":"legal_entity","party_name":"Termination fixture","purpose":"studio_operations"}');
insert into organizations.organization_memberships (id, organization_id, person_id)
select ('019d1400-0000-7000-8000-' || lpad((200+n)::text, 12, '0'))::uuid,
  '019d1400-0000-7000-8000-000000000101',
  ('019d1400-0000-7000-8000-' || lpad(n::text, 12, '0'))::uuid
from generate_series(1,4) n;
insert into organizations.membership_roles (membership_id, role_code)
values
  ('019d1400-0000-7000-8000-000000000201', 'owner'),
  ('019d1400-0000-7000-8000-000000000202', 'admin'),
  ('019d1400-0000-7000-8000-000000000202', 'coach'),
  ('019d1400-0000-7000-8000-000000000202', 'staff'),
  ('019d1400-0000-7000-8000-000000000203', 'staff'),
  ('019d1400-0000-7000-8000-000000000204', 'coach');
insert into relationships.service_relationships (id, person_id, organization_id, status)
values ('019d1400-0000-7000-8000-000000000301', '019d1400-0000-7000-8000-000000000005',
  '019d1400-0000-7000-8000-000000000101', 'active');

-- A second tenant shares the professional, never the membership or its assignments.
insert into organizations.organizations (id, type_code, display_name, responsible_party)
values ('019d1400-0000-7000-8000-000000000102', 'gym', 'Other tenant',
  '{"party_kind":"legal_entity","party_name":"Other tenant","purpose":"studio_operations"}');
insert into organizations.organization_memberships (id, organization_id, person_id)
values ('019d1400-0000-7000-8000-000000000205', '019d1400-0000-7000-8000-000000000102',
  '019d1400-0000-7000-8000-000000000002');
insert into organizations.membership_roles (membership_id, role_code)
values ('019d1400-0000-7000-8000-000000000205', 'owner'),
  ('019d1400-0000-7000-8000-000000000205', 'coach');
insert into relationships.service_relationships (id, person_id, organization_id, status)
values ('019d1400-0000-7000-8000-000000000302', '019d1400-0000-7000-8000-000000000006',
  '019d1400-0000-7000-8000-000000000101', 'active'),
  ('019d1400-0000-7000-8000-000000000303', '019d1400-0000-7000-8000-000000000005',
  '019d1400-0000-7000-8000-000000000102', 'active');
insert into relationships.relationship_professional_assignments
  (id, relationship_id, person_id, organization_id, membership_id, kind, status,
   valid_from, ends_on, accepted_by_person_at, covers_membership_id)
values
  ('019d1400-0000-7000-8000-000000000401', '019d1400-0000-7000-8000-000000000302',
   '019d1400-0000-7000-8000-000000000006', '019d1400-0000-7000-8000-000000000101',
   '019d1400-0000-7000-8000-000000000202', 'substitute', 'active',
   current_date + interval '2 days', current_date + 5, clock_timestamp(),
   '019d1400-0000-7000-8000-000000000204'),
  ('019d1400-0000-7000-8000-000000000402', '019d1400-0000-7000-8000-000000000301',
   '019d1400-0000-7000-8000-000000000005', '019d1400-0000-7000-8000-000000000101',
   '019d1400-0000-7000-8000-000000000202', 'substitute', 'proposed',
   current_date + interval '3 days', current_date + 6, null,
   '019d1400-0000-7000-8000-000000000204'),
  ('019d1400-0000-7000-8000-000000000403', '019d1400-0000-7000-8000-000000000303',
   '019d1400-0000-7000-8000-000000000005', '019d1400-0000-7000-8000-000000000102',
   '019d1400-0000-7000-8000-000000000205', 'holder', 'active', clock_timestamp(), null, null, null);

insert into privacy.scope_definitions (id, scope_code, version_number, status, published_at)
values ('019d1400-0000-7000-8000-000000000501', 'health_context', 1, 'published', clock_timestamp());
insert into identity.invitations
  (id, organization_id, issued_by_membership_id, channel, contact, token_hash,
   token_key_version, proposal_hash, responsible_party, status, expires_at)
values ('019d1400-0000-7000-8000-000000000502', '019d1400-0000-7000-8000-000000000101',
  '019d1400-0000-7000-8000-000000000201', 'email', 'termination@example.test',
  extensions.digest('termination-token','sha256'), 1, extensions.digest('termination-proposal','sha256'),
  '{"party_kind":"legal_entity","party_name":"Termination fixture","purpose":"studio_operations"}',
  'completed', clock_timestamp() + interval '7 days'),
  -- Authored by the member who leaves: authorship must survive the termination.
  ('019d1400-0000-7000-8000-000000000507', '019d1400-0000-7000-8000-000000000101',
  '019d1400-0000-7000-8000-000000000202', 'email', 'authored@example.test',
  extensions.digest('authored-token','sha256'), 1, extensions.digest('authored-proposal','sha256'),
  '{"party_kind":"legal_entity","party_name":"Termination fixture","purpose":"studio_operations"}',
  'completed', clock_timestamp() + interval '7 days');
insert into identity.invitation_intents (id, invitation_id, kind, status)
values ('019d1400-0000-7000-8000-000000000503', '019d1400-0000-7000-8000-000000000502', 'service_relationship', 'pending');
insert into privacy.invitation_scope_options
  (id, invitation_intent_id, scope_definition_id, scope_code, offered_access_level,
   purpose, presented_snapshot, decision, decided_at)
values ('019d1400-0000-7000-8000-000000000504', '019d1400-0000-7000-8000-000000000503',
  '019d1400-0000-7000-8000-000000000501', 'health_context', 'read', 'Training',
  '{"title":"Health"}', 'accepted', clock_timestamp());
insert into privacy.consent_events
  (id, person_id, relationship_id, organization_id, invitation_scope_option_id,
   scope_definition_id, scope_code, decision, presented_snapshot)
values ('019d1400-0000-7000-8000-000000000505', '019d1400-0000-7000-8000-000000000005',
  '019d1400-0000-7000-8000-000000000301', '019d1400-0000-7000-8000-000000000101',
  '019d1400-0000-7000-8000-000000000504', '019d1400-0000-7000-8000-000000000501',
  'health_context', 'accepted', '{"title":"Health"}');
insert into privacy.data_grants
  (id, person_id, relationship_id, organization_id, scope_definition_id, scope_code,
   consent_event_id, access_level, purpose)
values ('019d1400-0000-7000-8000-000000000506', '019d1400-0000-7000-8000-000000000005',
  '019d1400-0000-7000-8000-000000000301', '019d1400-0000-7000-8000-000000000101',
  '019d1400-0000-7000-8000-000000000501', 'health_context',
  '019d1400-0000-7000-8000-000000000505', 'read', 'Training');
create temporary table original_grant as select to_jsonb(g) as value from privacy.data_grants g
where id = '019d1400-0000-7000-8000-000000000506';
create temporary table original_authored as select to_jsonb(i) as value from identity.invitations i
where id = '019d1400-0000-7000-8000-000000000507';
create temporary table other_tenant as
select (select to_jsonb(m) from organizations.organization_memberships m
        where id = '019d1400-0000-7000-8000-000000000205') as membership,
       (select to_jsonb(a) from relationships.relationship_professional_assignments a
        where id = '019d1400-0000-7000-8000-000000000403') as assignment;
create temporary table termination_result (result jsonb);
grant select, insert on termination_result to allfit_api;

create function pg_temp.terminate(command_number integer, member_number integer default 202)
returns table(result jsonb, replayed boolean)
language sql as $$
  select * from organizations.terminate_membership(
    access_control.person(), '019d1400-0000-7000-8000-000000000101',
    ('019d1400-0000-7000-8000-' || lpad(member_number::text, 12, '0'))::uuid,
    ('019d1400-0000-4000-8000-' || lpad(command_number::text, 12, '0'))::uuid,
    ('019d1400-0000-7000-8000-' || lpad(command_number::text, 12, '0'))::uuid,
    extensions.digest('terminate' || member_number::text, 'sha256'));
$$;

set local role allfit_api;
select set_config('app.actor_kind', 'person', true),
       set_config('app.actor_person_id', '019d1400-0000-7000-8000-000000000001', true);
select throws_ok($$select * from pg_temp.terminate(901, 201)$$,
  '22023', null, 'T-ORG-RLS-TERM-01 a membership holding owner cannot be terminated');
select set_config('app.actor_person_id', '019d1400-0000-7000-8000-000000000003', true);
select throws_ok($$select * from pg_temp.terminate(902)$$,
  '42501', null, 'T-ORG-RLS-TERM-02 staff cannot terminate memberships');
select set_config('app.actor_person_id', '019d1400-0000-7000-8000-000000000004', true);
select throws_ok($$select * from pg_temp.terminate(903)$$,
  '42501', null, 'T-ORG-RLS-TERM-03 coach cannot terminate memberships');
select set_config('app.actor_person_id', '019d1400-0000-7000-8000-000000000005', true);
select throws_ok($$select * from pg_temp.terminate(904)$$,
  'P0002', null, 'T-ORG-RLS-TERM-04 outsider cannot address this tenant');
select set_config('app.actor_person_id', '019d1400-0000-7000-8000-000000000001', true);
select throws_ok($$select * from pg_temp.terminate(905, 999)$$,
  'P0002', null, 'T-ORG-RLS-TERM-05 unknown membership is hidden');
select throws_ok($$select * from pg_temp.terminate(906, 205)$$,
  'P0002', null, 'T-ORG-RLS-TERM-06 a membership in another tenant is hidden');
select throws_ok($$update organizations.organization_memberships
  set status = 'terminated', ended_at = clock_timestamp()
  where id = '019d1400-0000-7000-8000-000000000202'$$,
  '42501', null, 'T-ORG-RLS-TERM-07 direct runtime DML is denied');
select throws_ok($$select * from organizations.terminate_membership(
  '019d1400-0000-7000-8000-000000000002', '019d1400-0000-7000-8000-000000000101',
  '019d1400-0000-7000-8000-000000000203', gen_random_uuid(), gen_random_uuid(),
  extensions.digest('spoof', 'sha256'))$$,
  '42501', null, 'T-ORG-RLS-TERM-08 actor parameters cannot impersonate another person');
select set_config('app.actor_person_id', '019d1400-0000-7000-8000-000000000002', true);
select lives_ok($$select * from pg_temp.terminate(907, 203)$$,
  'T-ORG-RLS-TERM-09 an administrator can terminate a membership');
select throws_ok($$select * from pg_temp.terminate(913, 202)$$,
  '22023', null, 'T-ORG-RLS-TERM-11 an administrator cannot terminate their own membership');
select set_config('app.actor_person_id', '019d1400-0000-7000-8000-000000000001', true);
select lives_ok($$select * from relationships.assign_relationship_holder(
  '019d1400-0000-7000-8000-000000000001', '019d1400-0000-7000-8000-000000000101',
  '019d1400-0000-7000-8000-000000000301', '019d1400-0000-7000-8000-000000000202',
  gen_random_uuid(), gen_random_uuid(), extensions.digest('holder', 'sha256'))$$,
  'T-ORG-INT-TERM-01 fixture starts with an assigned holder');

reset role;
create function pg_temp.fail_termination_event() returns trigger language plpgsql as $$
begin
  if new.event_type = 'organization.membership_terminated.v1' then
    raise exception 'injected evidence failure' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger test_fail_termination_event before insert on organizations.membership_events
for each row execute function pg_temp.fail_termination_event();
set local role allfit_api;
select throws_ok($$select * from pg_temp.terminate(909)$$,
  'P0001', 'injected evidence failure', 'T-ORG-INT-TERM-02 event failure rolls back the command');
reset role;
select is((select status::text from organizations.organization_memberships
  where id = '019d1400-0000-7000-8000-000000000202'), 'active',
  'T-ORG-INT-TERM-03 failed command keeps the membership active');
select is((select count(*)::int from organizations.membership_roles
  where membership_id = '019d1400-0000-7000-8000-000000000202' and valid_to is null), 3,
  'T-ORG-INT-TERM-04 failed command keeps every role open');
select is((select count(*)::int from relationships.relationship_professional_assignments
  where membership_id = '019d1400-0000-7000-8000-000000000202' and status = 'active'), 2,
  'T-ORG-INT-TERM-05 helper writes roll back with the coordinator');
select is((select count(*)::int from system.idempotency_keys
  where command_id = '019d1400-0000-7000-8000-000000000909'), 0,
  'T-ORG-INT-TERM-06 failed transaction leaves no receipt');
drop trigger test_fail_termination_event on organizations.membership_events;
set local role allfit_api;

select set_config('app.actor_org_id', '', true);
insert into termination_result select result from pg_temp.terminate(910);
reset role;
select ok((select result->>'membership_id' = '019d1400-0000-7000-8000-000000000202'
  and result ? 'ended_at' from termination_result),
  'T-ORG-IDEM-TERM-01 first command returns the membership and its closing instant');
select ok((select status = 'terminated'
  and ended_at = (select (result->>'ended_at')::timestamptz from termination_result)
  from organizations.organization_memberships
  where id = '019d1400-0000-7000-8000-000000000202'),
  'T-ORG-INT-TERM-07 membership is terminated at the returned instant');
select is((select count(*)::int from organizations.membership_roles
  where membership_id = '019d1400-0000-7000-8000-000000000202'
  and (valid_to is null
    or valid_to <> (select (result->>'ended_at')::timestamptz from termination_result))), 0,
  'T-ORG-INT-TERM-08 every role closes at the same instant');
select is((select count(*)::int from relationships.relationship_professional_assignments
  where membership_id = '019d1400-0000-7000-8000-000000000202' and status = 'active'), 0,
  'T-ORG-INT-TERM-09 holder and accepted cover end in the same transaction');
select ok((select relationship.status = 'active' and not exists (
    select 1 from relationships.relationship_professional_assignments as assignment
    where assignment.relationship_id = relationship.id
      and assignment.kind = 'holder' and assignment.status = 'active')
  from relationships.service_relationships as relationship
  where relationship.id = '019d1400-0000-7000-8000-000000000301'),
  'T-ORG-INT-TERM-10 the relationship survives without a responsible professional');
select is((select status::text from relationships.relationship_professional_assignments
  where id = '019d1400-0000-7000-8000-000000000402'), 'proposed',
  'T-ORG-INT-TERM-11 unaccepted cover remains pending');
select ok((select membership = (select to_jsonb(m) from organizations.organization_memberships m
    where id = '019d1400-0000-7000-8000-000000000205')
  and assignment = (select to_jsonb(a) from relationships.relationship_professional_assignments a
    where id = '019d1400-0000-7000-8000-000000000403')
  from other_tenant),
  'T-ORG-INT-TERM-12 the same person keeps the other tenant untouched');
select is((select to_jsonb(g) from privacy.data_grants g
  where id = '019d1400-0000-7000-8000-000000000506'), (select value from original_grant),
  'T-ORG-INT-TERM-13 consent grant survives byte for byte');
select is((select to_jsonb(i) from identity.invitations i
  where id = '019d1400-0000-7000-8000-000000000507'), (select value from original_authored),
  'T-ORG-INT-TERM-14 authorship survives the termination');
select ok((select "before"->>'status' = 'active' and "after"->>'status' = 'terminated'
  from organizations.membership_events
  where membership_id = '019d1400-0000-7000-8000-000000000202'
  and event_type = 'organization.membership_terminated.v1'),
  'T-ORG-INT-TERM-15 the event records the transition');

set local role allfit_api;
select ok((select replayed and result = (select result from termination_result)
  from pg_temp.terminate(910)),
  'T-ORG-IDEM-TERM-02 same command replays the original answer');
select ok((select not replayed and result = (select result from termination_result)
  from pg_temp.terminate(911)),
  'T-ORG-IDEM-TERM-03 another command converges on the closing instant');
reset role;
select is((select count(*)::int from organizations.membership_events
  where membership_id = '019d1400-0000-7000-8000-000000000202'
  and event_type = 'organization.membership_terminated.v1'), 1,
  'T-ORG-IDEM-TERM-04 converging commands do not duplicate evidence');
set local role allfit_api;
select throws_ok($$select * from organizations.terminate_membership(
  '019d1400-0000-7000-8000-000000000001', '019d1400-0000-7000-8000-000000000101',
  '019d1400-0000-7000-8000-000000000202',
  '019d1400-0000-4000-8000-000000000910', '019d1400-0000-7000-8000-000000000910',
  extensions.digest('changed', 'sha256'))$$, '23505', null,
  'T-ORG-IDEM-TERM-05 changed hash cannot replay a receipt');
select throws_ok($$select * from relationships.assign_relationship_holder(
  '019d1400-0000-7000-8000-000000000001', '019d1400-0000-7000-8000-000000000101',
  '019d1400-0000-7000-8000-000000000301', '019d1400-0000-7000-8000-000000000202',
  gen_random_uuid(), gen_random_uuid(), extensions.digest('terminated-holder', 'sha256'))$$,
  '42501', null, 'T-ORG-INT-TERM-16 a terminated member cannot receive a new assignment');
select throws_ok($$update relationships.relationship_professional_assignments
  set status = 'active', accepted_by_person_at = clock_timestamp()
  where id = '019d1400-0000-7000-8000-000000000402'$$, '42501', null,
  'T-ORG-INT-TERM-17 accepting a pending proposal cannot restore a terminated member');
select set_config('app.actor_person_id', '019d1400-0000-7000-8000-000000000002', true);
select throws_ok($$select * from pg_temp.terminate(912, 204)$$,
  'P0002', null, 'T-ORG-RLS-TERM-10 a terminated administrator no longer reaches the tenant');
reset role;
select * from finish();
rollback;
