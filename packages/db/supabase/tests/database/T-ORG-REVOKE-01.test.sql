-- OP-ORG-008: role revocation preserves the relationship and consent.
begin;
select no_plan();

insert into identity.people (id, given_name, family_name)
select ('019d1300-0000-7000-8000-' || lpad(n::text, 12, '0'))::uuid, 'Role', 'Fixture'
from generate_series(1, 6) n;
insert into organizations.organizations (id, type_code, display_name, responsible_party)
values ('019d1300-0000-7000-8000-000000000101', 'gym', 'Role fixture',
  '{"party_kind":"legal_entity","party_name":"Role fixture","purpose":"studio_operations"}');
insert into organizations.organization_memberships (id, organization_id, person_id)
select ('019d1300-0000-7000-8000-' || lpad((200+n)::text, 12, '0'))::uuid,
  '019d1300-0000-7000-8000-000000000101',
  ('019d1300-0000-7000-8000-' || lpad(n::text, 12, '0'))::uuid
from generate_series(1,4) n;
insert into organizations.membership_roles (membership_id, role_code)
values
  ('019d1300-0000-7000-8000-000000000201', 'owner'),
  ('019d1300-0000-7000-8000-000000000202', 'admin'),
  ('019d1300-0000-7000-8000-000000000202', 'coach'),
  ('019d1300-0000-7000-8000-000000000202', 'staff'),
  ('019d1300-0000-7000-8000-000000000203', 'staff'),
  ('019d1300-0000-7000-8000-000000000204', 'coach');
insert into relationships.service_relationships (id, person_id, organization_id, status)
values ('019d1300-0000-7000-8000-000000000301', '019d1300-0000-7000-8000-000000000005',
  '019d1300-0000-7000-8000-000000000101', 'active');

-- A second tenant shares the professional, never the role or assignments.
insert into organizations.organizations (id, type_code, display_name, responsible_party)
values ('019d1300-0000-7000-8000-000000000102', 'gym', 'Other tenant',
  '{"party_kind":"legal_entity","party_name":"Other tenant","purpose":"studio_operations"}');
insert into organizations.organization_memberships (id, organization_id, person_id)
values ('019d1300-0000-7000-8000-000000000205', '019d1300-0000-7000-8000-000000000102',
  '019d1300-0000-7000-8000-000000000002');
insert into organizations.membership_roles (membership_id, role_code)
values ('019d1300-0000-7000-8000-000000000205', 'owner'),
  ('019d1300-0000-7000-8000-000000000205', 'coach');
insert into relationships.service_relationships (id, person_id, organization_id, status)
values ('019d1300-0000-7000-8000-000000000302', '019d1300-0000-7000-8000-000000000006',
  '019d1300-0000-7000-8000-000000000101', 'active'),
  ('019d1300-0000-7000-8000-000000000303', '019d1300-0000-7000-8000-000000000005',
  '019d1300-0000-7000-8000-000000000102', 'active');
insert into relationships.relationship_professional_assignments
  (id, relationship_id, person_id, organization_id, membership_id, kind, status,
   valid_from, ends_on, accepted_by_person_at, covers_membership_id)
values
  ('019d1300-0000-7000-8000-000000000401', '019d1300-0000-7000-8000-000000000302',
   '019d1300-0000-7000-8000-000000000006', '019d1300-0000-7000-8000-000000000101',
   '019d1300-0000-7000-8000-000000000202', 'substitute', 'active',
   current_date + interval '2 days', current_date + 5, clock_timestamp(),
   '019d1300-0000-7000-8000-000000000204'),
  ('019d1300-0000-7000-8000-000000000402', '019d1300-0000-7000-8000-000000000301',
   '019d1300-0000-7000-8000-000000000005', '019d1300-0000-7000-8000-000000000101',
   '019d1300-0000-7000-8000-000000000202', 'substitute', 'proposed',
   current_date + interval '3 days', current_date + 6, null,
   '019d1300-0000-7000-8000-000000000204'),
  ('019d1300-0000-7000-8000-000000000403', '019d1300-0000-7000-8000-000000000303',
   '019d1300-0000-7000-8000-000000000005', '019d1300-0000-7000-8000-000000000102',
   '019d1300-0000-7000-8000-000000000205', 'holder', 'active', clock_timestamp(), null, null, null);

insert into privacy.scope_definitions (id, scope_code, version_number, status, published_at)
values ('019d1300-0000-7000-8000-000000000501', 'health_context', 1, 'published', clock_timestamp());
insert into identity.invitations
  (id, organization_id, issued_by_membership_id, channel, contact, token_hash,
   token_key_version, proposal_hash, responsible_party, status, expires_at)
values ('019d1300-0000-7000-8000-000000000502', '019d1300-0000-7000-8000-000000000101',
  '019d1300-0000-7000-8000-000000000201', 'email', 'role@example.test',
  extensions.digest('role-token','sha256'), 1, extensions.digest('role-proposal','sha256'),
  '{"party_kind":"legal_entity","party_name":"Role fixture","purpose":"studio_operations"}',
  'completed', clock_timestamp() + interval '7 days');
insert into identity.invitation_intents (id, invitation_id, kind, status)
values ('019d1300-0000-7000-8000-000000000503', '019d1300-0000-7000-8000-000000000502', 'service_relationship', 'pending');
insert into privacy.invitation_scope_options
  (id, invitation_intent_id, scope_definition_id, scope_code, offered_access_level,
   purpose, presented_snapshot, decision, decided_at)
values ('019d1300-0000-7000-8000-000000000504', '019d1300-0000-7000-8000-000000000503',
  '019d1300-0000-7000-8000-000000000501', 'health_context', 'read', 'Training',
  '{"title":"Health"}', 'accepted', clock_timestamp());
insert into privacy.consent_events
  (id, person_id, relationship_id, organization_id, invitation_scope_option_id,
   scope_definition_id, scope_code, decision, presented_snapshot)
values ('019d1300-0000-7000-8000-000000000505', '019d1300-0000-7000-8000-000000000005',
  '019d1300-0000-7000-8000-000000000301', '019d1300-0000-7000-8000-000000000101',
  '019d1300-0000-7000-8000-000000000504', '019d1300-0000-7000-8000-000000000501',
  'health_context', 'accepted', '{"title":"Health"}');
insert into privacy.data_grants
  (id, person_id, relationship_id, organization_id, scope_definition_id, scope_code,
   consent_event_id, access_level, purpose)
values ('019d1300-0000-7000-8000-000000000506', '019d1300-0000-7000-8000-000000000005',
  '019d1300-0000-7000-8000-000000000301', '019d1300-0000-7000-8000-000000000101',
  '019d1300-0000-7000-8000-000000000501', 'health_context',
  '019d1300-0000-7000-8000-000000000505', 'read', 'Training');
create temporary table original_grant as select to_jsonb(g) as value from privacy.data_grants g
where id = '019d1300-0000-7000-8000-000000000506';

create function pg_temp.revoke_role(role_code text, command_number integer, member_number integer default 202)
returns table(result jsonb, replayed boolean)
language sql as $$
  select * from organizations.revoke_membership_role(
    access_control.person(), '019d1300-0000-7000-8000-000000000101',
    ('019d1300-0000-7000-8000-' || lpad(member_number::text, 12, '0'))::uuid,
    role_code,
    ('019d1300-0000-4000-8000-' || lpad(command_number::text, 12, '0'))::uuid,
    ('019d1300-0000-7000-8000-' || lpad(command_number::text, 12, '0'))::uuid,
    extensions.digest(role_code || member_number::text, 'sha256'));
$$;

set local role allfit_api;
select set_config('app.actor_kind', 'person', true),
       set_config('app.actor_person_id', '019d1300-0000-7000-8000-000000000001', true);
select throws_ok($$select * from pg_temp.revoke_role('owner', 901, 201)$$,
  '22023', null, 'T-ORG-RLS-REV-01 owner role cannot be revoked');
select throws_ok($$select * from relationships.end_assignments_for_membership(
  '019d1300-0000-7000-8000-000000000101', '019d1300-0000-7000-8000-000000000202',
  clock_timestamp(), gen_random_uuid())$$, '42501', null, 'T-ORG-RLS-REV-02 helper is not a runtime entry point');
select set_config('app.actor_person_id', '019d1300-0000-7000-8000-000000000003', true);
select throws_ok($$select * from pg_temp.revoke_role('coach', 902)$$,
  '42501', null, 'T-ORG-RLS-REV-03 staff cannot revoke roles');
select set_config('app.actor_person_id', '019d1300-0000-7000-8000-000000000004', true);
select throws_ok($$select * from pg_temp.revoke_role('coach', 903)$$,
  '42501', null, 'T-ORG-RLS-REV-04 coach cannot revoke roles');
select set_config('app.actor_person_id', '019d1300-0000-7000-8000-000000000005', true);
select throws_ok($$select * from pg_temp.revoke_role('coach', 904)$$,
  'P0002', null, 'T-ORG-RLS-REV-05 outsider cannot address this tenant');
select set_config('app.actor_person_id', '019d1300-0000-7000-8000-000000000001', true);
select throws_ok($$select * from pg_temp.revoke_role('coach', 905, 999)$$,
  'P0002', null, 'T-ORG-RLS-REV-06 unknown membership is hidden');
select throws_ok($$select * from pg_temp.revoke_role('coach', 906, 205)$$,
  'P0002', null, 'T-ORG-RLS-REV-07 a membership in another tenant is hidden');
select throws_ok($$update organizations.membership_roles set valid_to = clock_timestamp()
  where membership_id = '019d1300-0000-7000-8000-000000000202'$$,
  '42501', null, 'T-ORG-RLS-REV-08 direct runtime DML is denied');
select throws_ok($$select * from organizations.revoke_membership_role(
  '019d1300-0000-7000-8000-000000000002', '019d1300-0000-7000-8000-000000000101',
  '019d1300-0000-7000-8000-000000000202', 'coach', gen_random_uuid(), gen_random_uuid(),
  extensions.digest('spoof', 'sha256'))$$,
  '42501', null, 'T-ORG-RLS-REV-09 actor parameters cannot impersonate another person');
select set_config('app.actor_person_id', '019d1300-0000-7000-8000-000000000002', true);
select lives_ok($$select * from pg_temp.revoke_role('staff', 907, 203)$$,
  'T-ORG-RLS-REV-10 an administrator can revoke roles');
select set_config('app.actor_person_id', '019d1300-0000-7000-8000-000000000001', true);
select lives_ok($$select * from relationships.assign_relationship_holder(
  '019d1300-0000-7000-8000-000000000001', '019d1300-0000-7000-8000-000000000101',
  '019d1300-0000-7000-8000-000000000301', '019d1300-0000-7000-8000-000000000202',
  gen_random_uuid(), gen_random_uuid(), extensions.digest('holder', 'sha256'))$$,
  'T-ORG-INT-REV-01 fixture starts with an effective coach');

reset role;
create function pg_temp.fail_revocation_event() returns trigger language plpgsql as $$
begin
  if new.event_type = 'organization.role_revoked.v1' then
    raise exception 'injected evidence failure' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger test_fail_revocation_event before insert on organizations.membership_events
for each row execute function pg_temp.fail_revocation_event();
set local role allfit_api;
select throws_ok($$select * from pg_temp.revoke_role('coach', 909)$$,
  'P0001', 'injected evidence failure', 'T-ORG-INT-REV-12 event failure rolls back the command');
reset role;
select is((select count(*)::int from organizations.membership_roles
  where membership_id = '019d1300-0000-7000-8000-000000000202'
  and role_code = 'coach' and valid_to is null), 1,
  'T-ORG-INT-REV-13 failed command retains coach role');
select is((select count(*)::int from relationships.relationship_professional_assignments
  where membership_id = '019d1300-0000-7000-8000-000000000202' and status = 'active'), 2,
  'T-ORG-INT-REV-14 helper writes roll back with the coordinator');
select is((select count(*)::int from system.idempotency_keys
  where command_id = '019d1300-0000-7000-8000-000000000909'), 0,
  'T-ORG-INT-REV-15 failed transaction leaves no receipt');
drop trigger test_fail_revocation_event on organizations.membership_events;
set local role allfit_api;

select set_config('app.actor_org_id', '', true);
select is((select replayed from pg_temp.revoke_role('admin', 910)), false,
  'T-ORG-IDEM-REV-01 first command executes');
reset role;
select is((select count(*)::int from relationships.relationship_professional_assignments
  where membership_id = '019d1300-0000-7000-8000-000000000202' and status = 'active'), 2,
  'T-ORG-INT-REV-02 removing admin preserves coach assignments');
set local role allfit_api;
select is((select replayed from pg_temp.revoke_role('staff', 911)), false,
  'T-ORG-INT-REV-03 owner can remove staff');
select set_config('app.actor_org_id', '', true);
select is((select replayed from pg_temp.revoke_role('coach', 912)), false,
  'T-ORG-IDEM-REV-02 coach revocation executes');
select is((select replayed from pg_temp.revoke_role('coach', 912)), true,
  'T-ORG-IDEM-REV-03 same command replays');
select lives_ok($$select * from pg_temp.revoke_role('coach', 913)$$,
  'T-ORG-IDEM-REV-04 another command converges');
reset role;
select is((select count(*)::int from relationships.relationship_professional_assignments
  where membership_id = '019d1300-0000-7000-8000-000000000202' and status = 'active'), 0,
  'T-ORG-INT-REV-04 coach assignments close immediately');
select is((select to_jsonb(g) from privacy.data_grants g
  where id = '019d1300-0000-7000-8000-000000000506'), (select value from original_grant),
  'T-ORG-INT-REV-07 consent grant survives byte for byte');
select ok((select status = 'ended' and valid_to = valid_from and accepted_by_person_at is not null
  from relationships.relationship_professional_assignments
  where id = '019d1300-0000-7000-8000-000000000401'),
  'T-ORG-INT-REV-08 future accepted cover closes with empty interval and retains acceptance');
select is((select status::text from relationships.relationship_professional_assignments
  where id = '019d1300-0000-7000-8000-000000000402'), 'proposed',
  'T-ORG-INT-REV-09 unaccepted cover remains pending');
select is((select status::text from relationships.relationship_professional_assignments
  where id = '019d1300-0000-7000-8000-000000000403'), 'active',
  'T-ORG-INT-REV-10 the same professional retains another tenant assignment');
select throws_ok($$update relationships.relationship_professional_assignments
  set status = 'active', accepted_by_person_at = clock_timestamp()
  where id = '019d1300-0000-7000-8000-000000000402'$$, '42501', null,
  'T-ORG-INT-REV-11 accepting a pending proposal cannot restore revoked authority');
select is((select status::text from relationships.service_relationships
  where id = '019d1300-0000-7000-8000-000000000301'), 'active',
  'T-ORG-INT-REV-05 the client relationship survives');
select is((select count(*)::int from organizations.membership_events
  where membership_id = '019d1300-0000-7000-8000-000000000202'
  and event_type = 'organization.role_revoked.v1' and "after"->>'role_code' = 'coach'), 1,
  'T-ORG-IDEM-REV-05 converging commands do not duplicate evidence');
set local role allfit_api;
select throws_ok($$select * from organizations.revoke_membership_role(
  '019d1300-0000-7000-8000-000000000001', '019d1300-0000-7000-8000-000000000101',
  '019d1300-0000-7000-8000-000000000202', 'coach',
  '019d1300-0000-4000-8000-000000000912', '019d1300-0000-7000-8000-000000000912',
  extensions.digest('changed', 'sha256'))$$, '23505', null,
  'T-ORG-IDEM-REV-09 changed hash cannot replay a receipt');
select throws_ok($$select * from relationships.assign_relationship_holder(
  '019d1300-0000-7000-8000-000000000001', '019d1300-0000-7000-8000-000000000101',
  '019d1300-0000-7000-8000-000000000301', '019d1300-0000-7000-8000-000000000202',
  gen_random_uuid(), gen_random_uuid(), extensions.digest('revoked-holder', 'sha256'))$$,
  '42501', null, 'T-ORG-INT-REV-06 a historical coach role cannot create a new assignment');
select lives_ok($$select * from organizations.grant_membership_role(
  '019d1300-0000-7000-8000-000000000001', '019d1300-0000-7000-8000-000000000101',
  '019d1300-0000-7000-8000-000000000202', 'coach', gen_random_uuid(), gen_random_uuid(),
  extensions.digest('grant-again', 'sha256'))$$, 'T-ORG-IDEM-REV-06 regrant is a new role period');
select is((select replayed from pg_temp.revoke_role('coach', 912)), true,
  'T-ORG-IDEM-REV-07 old revoke still replays after regrant');
reset role;
select is((select count(*)::int from organizations.membership_roles
  where membership_id = '019d1300-0000-7000-8000-000000000202' and role_code = 'coach'
  and valid_to is null), 1, 'T-ORG-IDEM-REV-08 replay does not revoke the new role');
update organizations.organization_memberships set status = 'terminated', ended_at = clock_timestamp()
where id = '019d1300-0000-7000-8000-000000000204';
set local role allfit_api;
select throws_ok($$select * from pg_temp.revoke_role('coach', 914, 204)$$,
  '22023', null, 'T-ORG-RLS-REV-11 inactive target cannot be changed');
select set_config('app.actor_person_id', '019d1300-0000-7000-8000-000000000002', true);
select throws_ok($$select * from pg_temp.revoke_role('coach', 915)$$,
  '42501', null, 'T-ORG-RLS-REV-12 revoked admin authority is checked from current state');
reset role;
select * from finish();
rollback;
