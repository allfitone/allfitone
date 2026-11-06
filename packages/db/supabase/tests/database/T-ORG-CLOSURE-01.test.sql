-- OP-ORG-012 (HU-STUDIO-013): closing an organization ends everything it operates, in one
-- transaction, and keeps nothing it does not own.
begin;
select no_plan();

insert into identity.people (id, given_name, family_name, contact_email)
values
  ('019d1100-0000-7000-8000-000000000001', 'Olga', 'Owner', 'owner@example.test'),
  ('019d1100-0000-7000-8000-000000000002', 'Ada', 'Admin', 'admin@example.test'),
  ('019d1100-0000-7000-8000-000000000003', 'Cora', 'Coach', null),
  ('019d1100-0000-7000-8000-000000000004', 'Cami', 'Cover', null),
  ('019d1100-0000-7000-8000-000000000005', 'Cli', 'Ent', 'client@example.test'),
  ('019d1100-0000-7000-8000-000000000006', 'Mute', 'Client', null),
  ('019d1100-0000-7000-8000-000000000007', 'Out', 'Sider', null),
  ('019d1100-0000-7000-8000-000000000008', 'Otto', 'Other', null);
insert into organizations.organizations (id, type_code, display_name, responsible_party)
values
  ('019d1100-0000-7000-8000-000000000101', 'gym', 'Closing gym',
   '{"party_kind":"legal_entity","party_name":"Closing gym","purpose":"studio_operations"}'),
  ('019d1100-0000-7000-8000-000000000102', 'gym', 'Other tenant',
   '{"party_kind":"legal_entity","party_name":"Other tenant","purpose":"studio_operations"}');
insert into organizations.organization_memberships (id, organization_id, person_id)
values
  ('019d1100-0000-7000-8000-000000000201', '019d1100-0000-7000-8000-000000000101', '019d1100-0000-7000-8000-000000000001'),
  ('019d1100-0000-7000-8000-000000000202', '019d1100-0000-7000-8000-000000000101', '019d1100-0000-7000-8000-000000000002'),
  ('019d1100-0000-7000-8000-000000000203', '019d1100-0000-7000-8000-000000000101', '019d1100-0000-7000-8000-000000000003'),
  ('019d1100-0000-7000-8000-000000000204', '019d1100-0000-7000-8000-000000000101', '019d1100-0000-7000-8000-000000000004'),
  ('019d1100-0000-7000-8000-000000000208', '019d1100-0000-7000-8000-000000000102', '019d1100-0000-7000-8000-000000000008'),
  ('019d1100-0000-7000-8000-000000000209', '019d1100-0000-7000-8000-000000000102', '019d1100-0000-7000-8000-000000000003');
insert into organizations.membership_roles (membership_id, role_code)
values
  ('019d1100-0000-7000-8000-000000000201', 'owner'),
  ('019d1100-0000-7000-8000-000000000202', 'admin'),
  ('019d1100-0000-7000-8000-000000000203', 'coach'),
  ('019d1100-0000-7000-8000-000000000204', 'coach'),
  ('019d1100-0000-7000-8000-000000000208', 'owner'),
  ('019d1100-0000-7000-8000-000000000209', 'coach');
insert into relationships.service_relationships
  (id, person_id, organization_id, status, ended_at, started_at)
values
  ('019d1100-0000-7000-8000-000000000301', '019d1100-0000-7000-8000-000000000005',
   '019d1100-0000-7000-8000-000000000101', 'active', null, clock_timestamp() - interval '30 days'),
  ('019d1100-0000-7000-8000-000000000302', '019d1100-0000-7000-8000-000000000006',
   '019d1100-0000-7000-8000-000000000101', 'active', null, clock_timestamp() - interval '30 days'),
  -- Already over before the closure: it keeps the instant it ended.
  ('019d1100-0000-7000-8000-000000000303', '019d1100-0000-7000-8000-000000000007',
   '019d1100-0000-7000-8000-000000000101', 'terminated', clock_timestamp() - interval '1 day', clock_timestamp() - interval '30 days'),
  ('019d1100-0000-7000-8000-000000000304', '019d1100-0000-7000-8000-000000000005',
   '019d1100-0000-7000-8000-000000000102', 'active', null, clock_timestamp() - interval '30 days');
insert into relationships.relationship_professional_assignments
  (id, relationship_id, person_id, organization_id, membership_id, kind, status, valid_from,
   accepted_by_person_at, covers_membership_id, ends_on)
values
  ('019d1100-0000-7000-8000-000000000401', '019d1100-0000-7000-8000-000000000301',
   '019d1100-0000-7000-8000-000000000005', '019d1100-0000-7000-8000-000000000101',
   '019d1100-0000-7000-8000-000000000203', 'holder', 'active', clock_timestamp(), null, null, null),
  -- A cover nobody answered: its relationship ending is what keeps it from ever running.
  ('019d1100-0000-7000-8000-000000000402', '019d1100-0000-7000-8000-000000000301',
   '019d1100-0000-7000-8000-000000000005', '019d1100-0000-7000-8000-000000000101',
   '019d1100-0000-7000-8000-000000000204', 'substitute', 'proposed', clock_timestamp(), null,
   '019d1100-0000-7000-8000-000000000203', (clock_timestamp() + interval '7 days')::date),
  ('019d1100-0000-7000-8000-000000000403', '019d1100-0000-7000-8000-000000000304',
   '019d1100-0000-7000-8000-000000000005', '019d1100-0000-7000-8000-000000000102',
   '019d1100-0000-7000-8000-000000000209', 'holder', 'active', clock_timestamp(), null, null, null);

-- What the person shared: one grant live, one she already revoked.
insert into privacy.scope_definitions (id, scope_code, version_number, status, published_at)
values ('019d1100-0000-7000-8000-000000000501', 'health_context', 1, 'published', clock_timestamp());
insert into identity.invitations
  (id, organization_id, issued_by_membership_id, channel, contact, token_hash,
   token_key_version, proposal_hash, responsible_party, status, expires_at)
values
  ('019d1100-0000-7000-8000-000000000502', '019d1100-0000-7000-8000-000000000101',
   '019d1100-0000-7000-8000-000000000201', 'email', 'accepted@example.test',
   extensions.digest('close-accepted','sha256'), 1, extensions.digest('close-accepted-p','sha256'),
   '{"party_kind":"legal_entity","party_name":"Closing gym","purpose":"studio_operations"}',
   'completed', clock_timestamp() + interval '7 days'),
  ('019d1100-0000-7000-8000-000000000511', '019d1100-0000-7000-8000-000000000101',
   '019d1100-0000-7000-8000-000000000201', 'email', 'pending-client@example.test',
   extensions.digest('close-pending','sha256'), 1, extensions.digest('close-pending-p','sha256'),
   '{"party_kind":"legal_entity","party_name":"Closing gym","purpose":"studio_operations"}',
   'pending', clock_timestamp() + interval '7 days'),
  ('019d1100-0000-7000-8000-000000000513', '019d1100-0000-7000-8000-000000000101',
   '019d1100-0000-7000-8000-000000000201', 'email', 'pending-staff@example.test',
   extensions.digest('close-staff','sha256'), 1, extensions.digest('close-staff-p','sha256'),
   '{"party_kind":"legal_entity","party_name":"Closing gym","purpose":"studio_operations"}',
   'pending', clock_timestamp() + interval '7 days'),
  ('019d1100-0000-7000-8000-000000000515', '019d1100-0000-7000-8000-000000000102',
   '019d1100-0000-7000-8000-000000000208', 'email', 'elsewhere@example.test',
   extensions.digest('close-other','sha256'), 1, extensions.digest('close-other-p','sha256'),
   '{"party_kind":"legal_entity","party_name":"Other tenant","purpose":"studio_operations"}',
   'pending', clock_timestamp() + interval '7 days');
insert into identity.invitation_intents (id, invitation_id, kind, status, proposed_role_code)
values
  ('019d1100-0000-7000-8000-000000000503', '019d1100-0000-7000-8000-000000000502', 'service_relationship', 'pending', null),
  ('019d1100-0000-7000-8000-000000000512', '019d1100-0000-7000-8000-000000000511', 'service_relationship', 'pending', null),
  ('019d1100-0000-7000-8000-000000000514', '019d1100-0000-7000-8000-000000000513', 'membership', 'pending', 'coach'),
  ('019d1100-0000-7000-8000-000000000516', '019d1100-0000-7000-8000-000000000515', 'service_relationship', 'pending', null);
insert into privacy.invitation_scope_options
  (id, invitation_intent_id, scope_definition_id, scope_code, offered_access_level,
   purpose, presented_snapshot, decision, decided_at)
values ('019d1100-0000-7000-8000-000000000504', '019d1100-0000-7000-8000-000000000503',
  '019d1100-0000-7000-8000-000000000501', 'health_context', 'read', 'Training',
  '{"title":"Health"}', 'accepted', clock_timestamp());
insert into privacy.consent_events
  (id, person_id, relationship_id, organization_id, invitation_scope_option_id,
   scope_definition_id, scope_code, decision, presented_snapshot)
values
  ('019d1100-0000-7000-8000-000000000505', '019d1100-0000-7000-8000-000000000005',
   '019d1100-0000-7000-8000-000000000301', '019d1100-0000-7000-8000-000000000101',
   '019d1100-0000-7000-8000-000000000504', '019d1100-0000-7000-8000-000000000501',
   'health_context', 'accepted', '{"title":"Health"}'),
  ('019d1100-0000-7000-8000-000000000507', '019d1100-0000-7000-8000-000000000005',
   '019d1100-0000-7000-8000-000000000301', '019d1100-0000-7000-8000-000000000101',
   '019d1100-0000-7000-8000-000000000504', '019d1100-0000-7000-8000-000000000501',
   'health_context', 'accepted', '{"title":"Health"}');
insert into privacy.data_grants
  (id, person_id, relationship_id, organization_id, scope_definition_id, scope_code,
   consent_event_id, access_level, purpose, status, revoked_at)
values
  ('019d1100-0000-7000-8000-000000000506', '019d1100-0000-7000-8000-000000000005',
   '019d1100-0000-7000-8000-000000000301', '019d1100-0000-7000-8000-000000000101',
   '019d1100-0000-7000-8000-000000000501', 'health_context',
   '019d1100-0000-7000-8000-000000000505', 'read', 'Training', 'active', null),
  ('019d1100-0000-7000-8000-000000000508', '019d1100-0000-7000-8000-000000000005',
   '019d1100-0000-7000-8000-000000000301', '019d1100-0000-7000-8000-000000000101',
   '019d1100-0000-7000-8000-000000000501', 'health_context',
   '019d1100-0000-7000-8000-000000000507', 'read', 'Training', 'revoked',
   clock_timestamp() - interval '1 hour');

-- Nutrition goals a coach of this gym proposed: pending ones end, decided ones stay hers.
insert into nutrition.goal_sets (id, person_id)
values ('019d1100-0000-7000-8000-000000000601', '019d1100-0000-7000-8000-000000000005');
insert into nutrition.goal_versions
  (id, goal_set_id, person_id, version_number, origin, status, rationale, author_person_id,
   author_membership_id, author_assignment_id, origin_relationship_id, origin_organization_id,
   activated_at)
values
  ('019d1100-0000-7000-8000-000000000602', '019d1100-0000-7000-8000-000000000601',
   '019d1100-0000-7000-8000-000000000005', 1, 'professional', 'active', 'Base',
   '019d1100-0000-7000-8000-000000000003', '019d1100-0000-7000-8000-000000000203',
   '019d1100-0000-7000-8000-000000000401', '019d1100-0000-7000-8000-000000000301',
   '019d1100-0000-7000-8000-000000000101', clock_timestamp()),
  ('019d1100-0000-7000-8000-000000000603', '019d1100-0000-7000-8000-000000000601',
   '019d1100-0000-7000-8000-000000000005', 2, 'professional', 'proposed', 'More protein',
   '019d1100-0000-7000-8000-000000000003', '019d1100-0000-7000-8000-000000000203',
   '019d1100-0000-7000-8000-000000000401', '019d1100-0000-7000-8000-000000000301',
   '019d1100-0000-7000-8000-000000000101', null),
  ('019d1100-0000-7000-8000-000000000604', '019d1100-0000-7000-8000-000000000601',
   '019d1100-0000-7000-8000-000000000005', 3, 'professional', 'proposed', 'Elsewhere',
   '019d1100-0000-7000-8000-000000000003', '019d1100-0000-7000-8000-000000000209',
   '019d1100-0000-7000-8000-000000000403', '019d1100-0000-7000-8000-000000000304',
   '019d1100-0000-7000-8000-000000000102', null);

-- The client follows a program from each gym: only the closing gym's is detached.
insert into planning.session_templates (id, content_scope, owner_organization_id, author_person_id, discipline_code, status)
values
  ('019d1100-0000-7000-8000-000000000801', 'organization', '019d1100-0000-7000-8000-000000000101', '019d1100-0000-7000-8000-000000000003', 'test_strength', 'published'),
  ('019d1100-0000-7000-8000-000000000802', 'organization', '019d1100-0000-7000-8000-000000000102', '019d1100-0000-7000-8000-000000000003', 'test_strength', 'published');
insert into planning.programs (id, content_scope, owner_organization_id, author_person_id, status)
values
  ('019d1100-0000-7000-8000-000000000803', 'organization', '019d1100-0000-7000-8000-000000000101', '019d1100-0000-7000-8000-000000000003', 'published'),
  ('019d1100-0000-7000-8000-000000000804', 'organization', '019d1100-0000-7000-8000-000000000102', '019d1100-0000-7000-8000-000000000003', 'published');
select set_config('app.planning_publication', 'true', true);
insert into planning.session_template_versions (id, template_id, version_number, discipline_code, activity_type_id, title, content_hash)
values
  ('019d1100-0000-7000-8000-000000000805', '019d1100-0000-7000-8000-000000000801', 1, 'test_strength', '019c0000-0000-7000-8000-000000000011', 'Closing', decode(repeat('c3', 32), 'hex')),
  ('019d1100-0000-7000-8000-000000000806', '019d1100-0000-7000-8000-000000000802', 1, 'test_strength', '019c0000-0000-7000-8000-000000000011', 'Other', decode(repeat('c4', 32), 'hex'));
insert into planning.program_versions (id, program_id, version_number, title, content_hash)
values
  ('019d1100-0000-7000-8000-000000000807', '019d1100-0000-7000-8000-000000000803', 1, 'Closing block', decode(repeat('c5', 32), 'hex')),
  ('019d1100-0000-7000-8000-000000000808', '019d1100-0000-7000-8000-000000000804', 1, 'Other block', decode(repeat('c6', 32), 'hex'));
select set_config('app.planning_publication', '', true);
insert into planning.program_assignments (id, person_id, program_version_id, origin_relationship_id, lifecycle, starts_on, timezone, display_order)
values
  ('019d1100-0000-7000-8000-000000000811', '019d1100-0000-7000-8000-000000000005', '019d1100-0000-7000-8000-000000000807', '019d1100-0000-7000-8000-000000000301', 'active', current_date, 'UTC', 0),
  ('019d1100-0000-7000-8000-000000000812', '019d1100-0000-7000-8000-000000000005', '019d1100-0000-7000-8000-000000000808', '019d1100-0000-7000-8000-000000000304', 'active', current_date, 'UTC', 1);
insert into planning.assignment_management_periods (assignment_id, person_id, relationship_id, started_at)
values
  ('019d1100-0000-7000-8000-000000000811', '019d1100-0000-7000-8000-000000000005', '019d1100-0000-7000-8000-000000000301', clock_timestamp() - interval '1 day'),
  ('019d1100-0000-7000-8000-000000000812', '019d1100-0000-7000-8000-000000000005', '019d1100-0000-7000-8000-000000000304', clock_timestamp() - interval '1 day');
insert into planning.planned_sessions (id, assignment_id, person_id, template_version_id, scheduled_at, timezone, status, week_starts_on, program_day)
values
  ('019d1100-0000-7000-8000-000000000813', '019d1100-0000-7000-8000-000000000811', '019d1100-0000-7000-8000-000000000005', '019d1100-0000-7000-8000-000000000805', clock_timestamp() + interval '2 days', 'UTC', 'scheduled',
   date_trunc('week', clock_timestamp() + interval '2 days')::date, 1),
  ('019d1100-0000-7000-8000-000000000814', '019d1100-0000-7000-8000-000000000812', '019d1100-0000-7000-8000-000000000005', '019d1100-0000-7000-8000-000000000806', clock_timestamp() + interval '2 days', 'UTC', 'scheduled',
   date_trunc('week', clock_timestamp() + interval '2 days')::date, 1);

create temporary table untouched as
  select (select to_jsonb(p) from identity.people p
          where id = '019d1100-0000-7000-8000-000000000005') as person,
         (select to_jsonb(r) from relationships.service_relationships r
          where id = '019d1100-0000-7000-8000-000000000303') as ended_before,
         (select to_jsonb(r) from relationships.service_relationships r
          where id = '019d1100-0000-7000-8000-000000000304') as other_relationship,
         (select to_jsonb(a) from relationships.relationship_professional_assignments a
          where id = '019d1100-0000-7000-8000-000000000403') as other_assignment,
         (select to_jsonb(m) from organizations.organization_memberships m
          where id = '019d1100-0000-7000-8000-000000000209') as other_membership,
         (select to_jsonb(g) from privacy.data_grants g
          where id = '019d1100-0000-7000-8000-000000000508') as revoked_grant,
         (select to_jsonb(i) from identity.invitations i
          where id = '019d1100-0000-7000-8000-000000000502') as completed_invitation,
         (select to_jsonb(i) from identity.invitations i
          where id = '019d1100-0000-7000-8000-000000000515') as other_invitation;
create temporary table closure_result (result jsonb, replayed boolean);
grant select, insert on closure_result to allfit_api;

create function pg_temp.as_person(person_number integer) returns void language sql as $$
  select set_config('app.actor_kind', 'person', true),
         set_config('app.actor_person_id',
           '019d1100-0000-7000-8000-' || lpad(person_number::text, 12, '0'), true),
         set_config('app.request_id', gen_random_uuid()::text, true);
$$;
create function pg_temp.close(command_number integer, organization_number integer default 101)
returns table(result jsonb, replayed boolean)
language sql as $$
  select * from organizations.close_organization(
    access_control.person(),
    ('019d1100-0000-7000-8000-' || lpad(organization_number::text, 12, '0'))::uuid,
    ('019d1100-0000-4000-8000-' || lpad(command_number::text, 12, '0'))::uuid,
    ('019d1100-0000-7000-8000-' || lpad(command_number::text, 12, '0'))::uuid,
    extensions.digest('close' || organization_number, 'sha256'));
$$;

-- ———————————————————————————————————————— who may close
set local role allfit_api;
select pg_temp.as_person(2);
select throws_ok($$select * from pg_temp.close(901)$$, '42501', null,
  'T-ORG-CLOSURE-RLS-01 an administrator cannot close the organization');
select pg_temp.as_person(7);
select throws_ok($$select * from pg_temp.close(902)$$, 'P0002', null,
  'T-ORG-CLOSURE-RLS-02 a person outside it cannot even find it');
select pg_temp.as_person(1);
select throws_ok($$select * from organizations.close_organization(
    '019d1100-0000-7000-8000-000000000002', '019d1100-0000-7000-8000-000000000101',
    gen_random_uuid(), gen_random_uuid(), extensions.digest('x', 'sha256'))$$,
  '42501', null, 'T-ORG-CLOSURE-RLS-03 nobody closes in another person''s name');
select throws_ok($$select relationships.terminate_for_organization(
    '019d1100-0000-7000-8000-000000000101', clock_timestamp(), gen_random_uuid())$$,
  '42501', null, 'T-ORG-CLOSURE-RLS-04 the runtime cannot call a closure contract directly');
reset role;

-- ———————————————————————————————————————— fail closed
-- A client still paying through the gym blocks the closure: no contract ends that charge.
insert into payments.organization_plans (id, organization_id, name)
values ('019d1100-0000-7000-8000-000000000701', '019d1100-0000-7000-8000-000000000101', 'Mensual');
insert into payments.plan_versions
  (id, plan_id, organization_id, version_number, amount_minor, currency_code, billing_period)
values ('019d1100-0000-7000-8000-000000000702', '019d1100-0000-7000-8000-000000000701',
  '019d1100-0000-7000-8000-000000000101', 1, 100000, 'COP', 'month');
insert into payments.plan_subscriptions
  (id, person_id, organization_id, plan_version_id, status, current_period_end)
values ('019d1100-0000-7000-8000-000000000703', '019d1100-0000-7000-8000-000000000006',
  '019d1100-0000-7000-8000-000000000101', '019d1100-0000-7000-8000-000000000702', 'active',
  (clock_timestamp() + interval '30 days')::date);
set local role allfit_api;
select pg_temp.as_person(1);
select throws_ok($$select * from pg_temp.close(903)$$, '22023', null,
  'T-ORG-CLOSURE-INT-01 a live subscription refuses the closure');
reset role;
update payments.plan_subscriptions
set status = 'ended', ended_at = clock_timestamp(), ended_by_kind = 'person'
where id = '019d1100-0000-7000-8000-000000000703';

-- A grant left live on a relationship that already ended: Privacy refuses, so nothing closes.
update relationships.service_relationships
set status = 'active', ended_at = null
where id = '019d1100-0000-7000-8000-000000000303';
insert into privacy.consent_events
  (id, person_id, relationship_id, organization_id, invitation_scope_option_id,
   scope_definition_id, scope_code, decision, presented_snapshot)
values ('019d1100-0000-7000-8000-000000000509', '019d1100-0000-7000-8000-000000000007',
  '019d1100-0000-7000-8000-000000000303', '019d1100-0000-7000-8000-000000000101',
  '019d1100-0000-7000-8000-000000000504', '019d1100-0000-7000-8000-000000000501',
  'health_context', 'accepted', '{"title":"Health"}');
insert into privacy.data_grants
  (id, person_id, relationship_id, organization_id, scope_definition_id, scope_code,
   consent_event_id, access_level, purpose)
values ('019d1100-0000-7000-8000-000000000510', '019d1100-0000-7000-8000-000000000007',
  '019d1100-0000-7000-8000-000000000303', '019d1100-0000-7000-8000-000000000101',
  '019d1100-0000-7000-8000-000000000501', 'health_context',
  '019d1100-0000-7000-8000-000000000509', 'read', 'Training');
update relationships.service_relationships
set status = 'terminated', ended_at = clock_timestamp() - interval '1 day'
where id = '019d1100-0000-7000-8000-000000000303';
set local role allfit_api;
select pg_temp.as_person(1);
select throws_ok($$select * from pg_temp.close(904)$$, '55000', null,
  'T-ORG-CLOSURE-INT-02 a grant still live after the terminations refuses the closure');
reset role;
select ok(
  (select status = 'active' from organizations.organizations
   where id = '019d1100-0000-7000-8000-000000000101')
  and (select status = 'active' from relationships.service_relationships
       where id = '019d1100-0000-7000-8000-000000000301')
  and (select status = 'active' from privacy.data_grants
       where id = '019d1100-0000-7000-8000-000000000506')
  and (select status = 'pending' from identity.invitations
       where id = '019d1100-0000-7000-8000-000000000511')
  and (select status = 'proposed' from nutrition.goal_versions
       where id = '019d1100-0000-7000-8000-000000000603')
  and (select count(*) = 4 from organizations.organization_memberships
       where organization_id = '019d1100-0000-7000-8000-000000000101' and status = 'active'),
  'T-ORG-CLOSURE-INT-03 a refused closure leaves no part of it behind');
update privacy.data_grants set status = 'revoked', revoked_at = clock_timestamp()
where id = '019d1100-0000-7000-8000-000000000510';
-- The fixture above rewrote this relationship; what must hold from here is its current shape.
update untouched set ended_before = (select to_jsonb(r) from relationships.service_relationships r
  where id = '019d1100-0000-7000-8000-000000000303');

-- ———————————————————————————————————————— the closure
set local role allfit_api;
select pg_temp.as_person(1);
insert into closure_result select * from pg_temp.close(905);
select ok((select not replayed
            and result->>'organization_id' = '019d1100-0000-7000-8000-000000000101'
            and (result->>'relationships_terminated')::int = 2
  from closure_result), 'T-ORG-CLOSURE-INT-04 the owner closes and learns what ended');
reset role;

create temporary table closed_at as
  select (result->>'closed_at')::timestamptz as value from closure_result;
grant select on closed_at to allfit_api;
select is((select status::text from organizations.organizations
  where id = '019d1100-0000-7000-8000-000000000101'), 'closed',
  'T-ORG-CLOSURE-INT-05 the organization is closed');
select ok((select bool_and(status = 'terminated' and ended_at = (select value from closed_at))
  from relationships.service_relationships
  where id in ('019d1100-0000-7000-8000-000000000301', '019d1100-0000-7000-8000-000000000302')),
  'T-ORG-CLOSURE-INT-06 every live relationship ends at the one closing instant');
select ok((select status = 'frozen' and frozen_at = (select value from closed_at)
  from privacy.data_grants where id = '019d1100-0000-7000-8000-000000000506'),
  'T-ORG-CLOSURE-INT-07 what the person shared is frozen, not deleted');
select is((select to_jsonb(g) from privacy.data_grants g
  where id = '019d1100-0000-7000-8000-000000000508'), (select revoked_grant from untouched),
  'T-ORG-CLOSURE-INT-08 a grant she revoked stays revoked');
select ok((select status = 'ended' from relationships.relationship_professional_assignments
           where id = '019d1100-0000-7000-8000-000000000401')
  and (select status = 'proposed' and valid_to is null
       from relationships.relationship_professional_assignments
       where id = '019d1100-0000-7000-8000-000000000402'),
  'T-ORG-CLOSURE-INT-09 the coach stops; an unanswered cover stays unanswered, as in OP-REL-008');
select ok((select bool_and(status = 'revoked') from identity.invitations
           where id in ('019d1100-0000-7000-8000-000000000511',
                        '019d1100-0000-7000-8000-000000000513'))
  and (select bool_and(status = 'revoked' and decided_at = (select value from closed_at))
       from identity.invitation_intents
       where id in ('019d1100-0000-7000-8000-000000000512',
                    '019d1100-0000-7000-8000-000000000514')),
  'T-ORG-CLOSURE-INT-10 nobody can accept an invitation from a closed organization');
select ok((select bool_and(status = 'terminated' and ended_at = (select value from closed_at))
  from organizations.organization_memberships
  where organization_id = '019d1100-0000-7000-8000-000000000101')
  and not exists (select 1 from organizations.membership_roles role
    join organizations.organization_memberships m on m.id = role.membership_id
    where m.organization_id = '019d1100-0000-7000-8000-000000000101' and role.valid_to is null),
  'T-ORG-CLOSURE-INT-11 every membership closes, the owner''s included');
select is((select count(*)::int from organizations.membership_events event
  join organizations.organization_memberships m on m.id = event.membership_id
  where m.organization_id = '019d1100-0000-7000-8000-000000000101'
    and event.event_type = 'organization.membership_terminated.v1'), 4,
  'T-ORG-CLOSURE-INT-12 each closed membership is recorded');
select ok((select actor_membership_id = '019d1100-0000-7000-8000-000000000201'
             and before_snapshot->>'status' = 'active' and after_snapshot->>'status' = 'closed'
             and occurred_at = (select value from closed_at)
  from organizations.organization_events
  where organization_id = '019d1100-0000-7000-8000-000000000101'
    and event_type = 'organization.closed.v1'),
  'T-ORG-CLOSURE-INT-13 the closure is recorded with who closed it');
select is((select count(*)::int from system.outbox_events
  where event_type = 'relationship.terminated.v1'
    and aggregate_id = '019d1100-0000-7000-8000-000000000301'
    and payload->>'contact_email' = 'client@example.test'), 1,
  'T-ORG-CLOSURE-INT-14 a client with an address is told');
select is((select count(*)::int from system.outbox_events
  where event_type = 'relationship.terminated.v1'
    and aggregate_id = '019d1100-0000-7000-8000-000000000302'), 0,
  'T-ORG-CLOSURE-INT-15 a client without one is not');
select ok((select status = 'cancelled' and cancelled_at = (select value from closed_at)
           from nutrition.goal_versions where id = '019d1100-0000-7000-8000-000000000603')
  and (select status = 'active' from nutrition.goal_versions
       where id = '019d1100-0000-7000-8000-000000000602')
  and (select status = 'proposed' from nutrition.goal_versions
       where id = '019d1100-0000-7000-8000-000000000604'),
  'T-ORG-CLOSURE-INT-16 pending nutrition proposals end; her decisions and other gyms stay');
select ok((select person from untouched) = (select to_jsonb(p) from identity.people p
           where id = '019d1100-0000-7000-8000-000000000005')
  and (select ended_before from untouched) = (select to_jsonb(r)
       from relationships.service_relationships r
       where id = '019d1100-0000-7000-8000-000000000303')
  and (select completed_invitation from untouched) = (select to_jsonb(i) from identity.invitations i
       where id = '019d1100-0000-7000-8000-000000000502'),
  'T-ORG-CLOSURE-INT-17 the Fitness ID and what already ended are not touched');
select ok((select other_relationship from untouched) = (select to_jsonb(r)
           from relationships.service_relationships r
           where id = '019d1100-0000-7000-8000-000000000304')
  and (select other_assignment from untouched) = (select to_jsonb(a)
       from relationships.relationship_professional_assignments a
       where id = '019d1100-0000-7000-8000-000000000403')
  and (select other_membership from untouched) = (select to_jsonb(m)
       from organizations.organization_memberships m
       where id = '019d1100-0000-7000-8000-000000000209')
  and (select other_invitation from untouched) = (select to_jsonb(i) from identity.invitations i
       where id = '019d1100-0000-7000-8000-000000000515'),
  'T-ORG-CLOSURE-INT-18 another tenant keeps everything, the same coach included');

-- ———————————————————————————————————————— retries
set local role allfit_api;
select pg_temp.as_person(1);
select ok((select replayed and (result->>'closed_at')::timestamptz = (select value from closed_at)
  from pg_temp.close(905)), 'T-ORG-CLOSURE-IDEM-01 a retry replays the same closure');
select ok((select (result->>'closed_at')::timestamptz = (select value from closed_at)
  from pg_temp.close(906)), 'T-ORG-CLOSURE-IDEM-02 a new command converges on the closure that holds');
select pg_temp.as_person(7);
select throws_ok($$select * from pg_temp.close(907)$$, 'P0002', null,
  'T-ORG-CLOSURE-RLS-05 a closed organization is still not found by an outsider');
reset role;

-- ———————————————————————————————————————— the scope that lets Nutrition act
set local role allfit_owner;
select pg_temp.as_person(1);
select set_config('app.contract_scope_purpose', 'organization_closure', true),
       set_config('app.contract_scope_id', '019d1100-0000-7000-8000-000000000102', true),
       set_config('app.contract_scope_token', repeat('0', 64), true);
select is((select count(*)::int from nutrition.goal_versions
  where origin_organization_id = '019d1100-0000-7000-8000-000000000102'), 0,
  'T-ORG-CLOSURE-RLS-06 a forged closure scope reveals no nutrition proposal');
reset role;
set local role allfit_api;
select throws_ok($$select * from access_control.contract_scope_keys$$, '42501', null,
  'T-ORG-CLOSURE-RLS-07 the runtime cannot read the scope key');
reset role;

-- ———————————————————————————————————————— what the organization managed, and what is still to come
select is((select array_agg(lifecycle::text order by id) from planning.program_assignments
    where id in ('019d1100-0000-7000-8000-000000000811', '019d1100-0000-7000-8000-000000000812')),
  array['detached_pending_choice', 'active'],
  'T-ORG-CLOSURE-INT-19 the programs the closing gym managed are detached; another gym''s are not');
select is((select count(*)::int from planning.assignment_management_periods as period
    join relationships.service_relationships as relationship on relationship.id = period.relationship_id
    where period.assignment_id = '019d1100-0000-7000-8000-000000000811' and period.end_reason = 'relationship_ended'
      and period.ended_at = relationship.ended_at),
  1, 'T-ORG-CLOSURE-INT-21 at the instant the closure ended the relationship');
select is((select array_agg(status order by assignment_id) from planning.planned_sessions
    where id in ('019d1100-0000-7000-8000-000000000813', '019d1100-0000-7000-8000-000000000814')),
  array['paused', 'scheduled'],
  'T-ORG-CLOSURE-INT-22 its sessions ahead pause and the other gym''s stay planned');
-- An observation needs nothing at closure: once the relationship ends nobody writes or corrects one.
-- A correction proposal is cancelled by close_relationship, which the closure runs for each
-- relationship (T-EXE-PROPOSAL-CANCEL-INT-06). A new table here needs the same decision.
select set_eq($$select table_name::text from information_schema.tables
    where table_schema = 'execution' and table_type = 'BASE TABLE'$$,
  array['correction_proposals', 'endurance_laps', 'executed_sessions', 'execution_revisions',
    'interval_results', 'mobility_results', 'observation_revisions', 'planned_session_executions',
    'professional_observations', 'round_results', 'session_exercises', 'session_segments',
    'strength_sets'],
  'T-ORG-CLOSURE-INT-20 every Execution table has been decided for the closure: '
  || 'when this fails, decide what closing the organization does to the new one');

select * from finish();
rollback;
