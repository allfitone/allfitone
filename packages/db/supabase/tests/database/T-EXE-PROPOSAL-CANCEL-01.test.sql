-- T-EXE-PROPOSAL-CANCEL-01 — what cancels a pending correction proposal (HU-STUDIO-059,
-- OP-REL-007/008, OP-ORG-012).
--
-- A proposal names one set as it was. Whatever makes that set, its session or the
-- relationship no longer what was proposed against cancels it, with why:
--
--   · `target_changed` when she corrects the session herself: its sets are written anew.
--   · `session_annulled` when she annuls it, `session_hidden` when she hides it from the gym.
--   · `relationship_terminated` when the relationship ends, by any of its three paths:
--     she ends it, the gym ends it, or the organization closes.
--
-- Only those contracts cancel, each inside its own scope. A cancelled proposal stays
-- listed for both of them, cancelled, rather than disappearing.
--
-- Written before the migration and watched failing.
begin;

select plan(20);

insert into identity.people (id, given_name, family_name, contact_email, status)
values
  ('019f5200-0000-7000-8000-000000000001', 'Ana', 'Client', 'ana@example.test', 'active'),
  ('019f5200-0000-7000-8000-000000000002', 'Bruno', 'Client', 'bruno@example.test', 'active'),
  ('019f5200-0000-7000-8000-000000000011', 'Olivia', 'Owner', null, 'active'),
  ('019f5200-0000-7000-8000-000000000012', 'Camilo', 'Coach', null, 'active'),
  ('019f5200-0000-7000-8000-000000000013', 'Diana', 'Cover', null, 'active'),
  ('019f5200-0000-7000-8000-000000000015', 'Fabio', 'Unassigned', null, 'active');

insert into organizations.organizations (id, type_code, display_name, responsible_party)
values ('019f5200-0000-7000-8000-000000000101', 'gym', 'Gym A',
  '{"party_kind":"legal_entity","party_name":"Gym A SAS","purpose":"studio_operations"}');

insert into organizations.organization_memberships (id, organization_id, person_id, status)
values
  ('019f5200-0000-7000-8000-000000000211', '019f5200-0000-7000-8000-000000000101', '019f5200-0000-7000-8000-000000000011', 'active'),
  ('019f5200-0000-7000-8000-000000000212', '019f5200-0000-7000-8000-000000000101', '019f5200-0000-7000-8000-000000000012', 'active'),
  ('019f5200-0000-7000-8000-000000000213', '019f5200-0000-7000-8000-000000000101', '019f5200-0000-7000-8000-000000000013', 'active'),
  ('019f5200-0000-7000-8000-000000000215', '019f5200-0000-7000-8000-000000000101', '019f5200-0000-7000-8000-000000000015', 'active');

insert into organizations.membership_roles (membership_id, role_code)
values
  ('019f5200-0000-7000-8000-000000000211', 'owner'),
  ('019f5200-0000-7000-8000-000000000212', 'coach'),
  ('019f5200-0000-7000-8000-000000000213', 'coach'),
  ('019f5200-0000-7000-8000-000000000215', 'coach');

insert into relationships.service_relationships (id, person_id, organization_id, status, started_at)
values
  ('019f5200-0000-7000-8000-000000000701', '019f5200-0000-7000-8000-000000000001', '019f5200-0000-7000-8000-000000000101', 'active', clock_timestamp() - interval '30 days'),
  ('019f5200-0000-7000-8000-000000000702', '019f5200-0000-7000-8000-000000000002', '019f5200-0000-7000-8000-000000000101', 'active', clock_timestamp() - interval '30 days');

insert into relationships.relationship_professional_assignments (
  id, relationship_id, person_id, organization_id, membership_id, covers_membership_id,
  kind, status, ends_on, accepted_by_person_at
) values
  ('019f5200-0000-7000-8000-000000000801', '019f5200-0000-7000-8000-000000000701', '019f5200-0000-7000-8000-000000000001',
   '019f5200-0000-7000-8000-000000000101', '019f5200-0000-7000-8000-000000000212', null, 'holder', 'active', null, null),
  ('019f5200-0000-7000-8000-000000000802', '019f5200-0000-7000-8000-000000000702', '019f5200-0000-7000-8000-000000000002',
   '019f5200-0000-7000-8000-000000000101', '019f5200-0000-7000-8000-000000000212', null, 'holder', 'active', null, null),
  ('019f5200-0000-7000-8000-000000000805', '019f5200-0000-7000-8000-000000000701', '019f5200-0000-7000-8000-000000000001',
   '019f5200-0000-7000-8000-000000000101', '019f5200-0000-7000-8000-000000000213', '019f5200-0000-7000-8000-000000000212',
   'substitute', 'active', (clock_timestamp() + interval '10 days')::date, clock_timestamp());

-- IX-06: offering contribute needs a version that admits it.
insert into privacy.scope_definitions (id, scope_code, version_number, status, published_at)
values
  ('019f5200-0000-7000-8000-000000000301', 'relationship_training', 4, 'draft', null),
  ('019f5200-0000-7000-8000-000000000302', 'prior_training_history', 2, 'published', clock_timestamp());
insert into privacy.scope_resource_rules (
  scope_definition_id, resource, field, data_classification_code, max_action
) values
  ('019f5200-0000-7000-8000-000000000301', 'execution.correction_proposals', '*', 'training', 'contribute');
update privacy.scope_definitions set status = 'published', published_at = clock_timestamp()
where id = '019f5200-0000-7000-8000-000000000301';

insert into identity.invitations (
  id, organization_id, issued_by_membership_id, channel, contact,
  token_hash, token_key_version, proposal_hash, responsible_party, status, expires_at
) values (
  '019f5200-0000-7000-8000-000000000401', '019f5200-0000-7000-8000-000000000101',
  '019f5200-0000-7000-8000-000000000211', 'email', 'ana@example.test',
  extensions.digest('proposal-token', 'sha256'), 1, extensions.digest('proposal-proposal', 'sha256'),
  '{"party_kind":"legal_entity","party_name":"Gym A SAS","purpose":"studio_operations"}',
  'completed', clock_timestamp() + interval '7 days'
);
insert into identity.invitation_intents (id, invitation_id, kind, status, proposed_role_code)
values ('019f5200-0000-7000-8000-000000000501', '019f5200-0000-7000-8000-000000000401',
  'service_relationship', 'pending', null);
insert into privacy.invitation_scope_options (
  id, invitation_intent_id, scope_definition_id, scope_code,
  offered_access_level, purpose, presented_snapshot, decision, decided_at
) values
  ('019f5200-0000-7000-8000-000000000601', '019f5200-0000-7000-8000-000000000501',
   '019f5200-0000-7000-8000-000000000301', 'relationship_training', 'contribute',
   'Follow the training', '{"title":"Training"}'::jsonb, 'accepted', clock_timestamp()),
  ('019f5200-0000-7000-8000-000000000602', '019f5200-0000-7000-8000-000000000501',
   '019f5200-0000-7000-8000-000000000302', 'prior_training_history', 'read',
   'Know the history', '{"title":"History"}'::jsonb, 'accepted', clock_timestamp());

create function pg_temp.share(relationship uuid, grant_id uuid, scope text, level privacy.access_level)
returns void language plpgsql as $$
declare
  subject record;
  option record;
begin
  select person_id, organization_id into subject
  from relationships.service_relationships where id = relationship;
  select id, scope_definition_id into option
  from privacy.invitation_scope_options where scope_code = scope;
  insert into privacy.consent_events (
    id, person_id, relationship_id, organization_id, invitation_scope_option_id,
    scope_definition_id, scope_code, decision, presented_snapshot
  ) values (
    grant_id, subject.person_id, relationship, subject.organization_id, option.id,
    option.scope_definition_id, scope, 'accepted', '{"title":"Shared"}'::jsonb
  );
  insert into privacy.data_grants (
    id, person_id, relationship_id, organization_id, scope_definition_id, scope_code,
    consent_event_id, access_level, purpose
  ) values (
    grant_id, subject.person_id, relationship, subject.organization_id,
    option.scope_definition_id, scope, grant_id, level, 'Follow the training'
  );
end
$$;

-- Ana lets Gym A contribute to her training and read her history; Bruno only lets it read.
select pg_temp.share('019f5200-0000-7000-8000-000000000701', '019f5200-0000-7000-8000-000000000a01', 'relationship_training', 'contribute');
select pg_temp.share('019f5200-0000-7000-8000-000000000701', '019f5200-0000-7000-8000-000000000a02', 'prior_training_history', 'read');
select pg_temp.share('019f5200-0000-7000-8000-000000000702', '019f5200-0000-7000-8000-000000000a05', 'relationship_training', 'read');

create function pg_temp.trained(id uuid, person uuid, days integer, context uuid)
returns void language sql as $$
  insert into execution.executed_sessions (
    id, person_id, activity_type_id, result_contract_id, contract_version, is_autonomous,
    context_relationship_id, context_organization_id, started_at, ended_at, timezone,
    execution_status, validation_status, requested_level, achieved_level, capture_source
  ) values (
    id, person, '019c0000-0000-7000-8000-000000000011', '019c0000-0000-7000-8000-000000000031', 1,
    context is null, context, case when context is null then null else '019f5200-0000-7000-8000-000000000101'::uuid end,
    clock_timestamp() - make_interval(days => days), clock_timestamp() - make_interval(days => days) + interval '1 hour',
    'America/Bogota', 'completed', 'valid', 'detailed', 'detailed', 'manual'
  )
$$;

-- E1 inside the relationship; E2 on her own; E3 captured by a device; E4 annulled; E5 on
-- her own and hidden from this gym; E6 recorded as observed, not declared. E7 is Bruno's.
select pg_temp.trained('019f5200-0000-7000-8000-000000000e01', '019f5200-0000-7000-8000-000000000001', 2, '019f5200-0000-7000-8000-000000000701');
select pg_temp.trained('019f5200-0000-7000-8000-000000000e02', '019f5200-0000-7000-8000-000000000001', 3, null);
select pg_temp.trained('019f5200-0000-7000-8000-000000000e03', '019f5200-0000-7000-8000-000000000001', 4, '019f5200-0000-7000-8000-000000000701');
select pg_temp.trained('019f5200-0000-7000-8000-000000000e04', '019f5200-0000-7000-8000-000000000001', 5, '019f5200-0000-7000-8000-000000000701');
select pg_temp.trained('019f5200-0000-7000-8000-000000000e05', '019f5200-0000-7000-8000-000000000001', 6, null);
select pg_temp.trained('019f5200-0000-7000-8000-000000000e06', '019f5200-0000-7000-8000-000000000001', 7, '019f5200-0000-7000-8000-000000000701');
select pg_temp.trained('019f5200-0000-7000-8000-000000000e07', '019f5200-0000-7000-8000-000000000002', 2, '019f5200-0000-7000-8000-000000000702');
update execution.executed_sessions set capture_source = 'device'
where id = '019f5200-0000-7000-8000-000000000e03';
update execution.executed_sessions
set validation_status = 'annulled', annulled_at = clock_timestamp(), annulment_reason = 'duplicate'
where id = '019f5200-0000-7000-8000-000000000e04';
update execution.executed_sessions set capture_provenance = 'device_observed'
where id = '019f5200-0000-7000-8000-000000000e06';

insert into execution.strength_sets (
  id, executed_session_id, movement_id, set_order, achieved_reps, load_value, load_unit_code, rpe, kind
) values
  ('019f5200-0000-7000-8000-000000000f11', '019f5200-0000-7000-8000-000000000e01', null, 1, 8, 60, 'kg', 8, 'normal'),
  ('019f5200-0000-7000-8000-000000000f12', '019f5200-0000-7000-8000-000000000e01', null, 2, 6, 70, 'kg', null, 'normal'),
  ('019f5200-0000-7000-8000-000000000f13', '019f5200-0000-7000-8000-000000000e01', null, 3, 10, null, null, null, 'warmup'),
  ('019f5200-0000-7000-8000-000000000f21', '019f5200-0000-7000-8000-000000000e02', null, 1, 5, 100, 'kg', 9, 'normal'),
  ('019f5200-0000-7000-8000-000000000f31', '019f5200-0000-7000-8000-000000000e03', null, 1, 10, 40, 'kg', null, 'normal'),
  ('019f5200-0000-7000-8000-000000000f41', '019f5200-0000-7000-8000-000000000e04', null, 1, 8, 50, 'kg', null, 'normal'),
  ('019f5200-0000-7000-8000-000000000f51', '019f5200-0000-7000-8000-000000000e05', null, 1, 8, 50, 'kg', null, 'normal'),
  ('019f5200-0000-7000-8000-000000000f61', '019f5200-0000-7000-8000-000000000e06', null, 1, 8, 50, 'kg', null, 'normal'),
  ('019f5200-0000-7000-8000-000000000f71', '019f5200-0000-7000-8000-000000000e07', null, 1, 8, 60, 'kg', null, 'normal');

insert into privacy.session_visibility_denials (id, person_id, executed_session_id, relationship_id, status, denied_at)
values ('019f5200-0000-7000-8000-000000000d05', '019f5200-0000-7000-8000-000000000001',
  '019f5200-0000-7000-8000-000000000e05', '019f5200-0000-7000-8000-000000000701', 'active', clock_timestamp());

create function pg_temp.act(person uuid) returns void language plpgsql as $$
begin
  perform set_config('app.actor_kind', 'person', true);
  perform set_config('app.actor_person_id', person::text, true);
  perform set_config('app.actor_org_id', '', true);
  perform set_config('app.actor_membership_id', '', true);
  perform set_config('app.purpose', '', true);
  perform set_config('app.contract_scope_purpose', '', true);
  perform set_config('app.contract_scope_id', '', true);
  perform set_config('app.contract_scope_token', '', true);
  perform set_config('app.request_id', gen_random_uuid()::text, true);
end
$$;

create function pg_temp.member(person uuid, membership uuid) returns void language plpgsql as $$
begin
  perform pg_temp.act(person);
  perform set_config('app.actor_org_id', '019f5200-0000-7000-8000-000000000101', true);
  perform set_config('app.actor_membership_id', membership::text, true);
end
$$;

create function pg_temp.worker() returns void language plpgsql as $$
begin
  perform pg_temp.act(null);
  perform set_config('app.actor_kind', 'worker', true);
  perform set_config('app.actor_person_id', '', true);
end
$$;

-- The SQLSTATE, and the detail when it names something. P0004 is `assert_failure`, which
-- `others` does not catch.
create function pg_temp.failure(statement text) returns text language plpgsql as $$
declare
  state text;
  detail text;
begin
  execute statement;
  return 'no error';
exception when others or assert_failure then
  get stacked diagnostics state = returned_sqlstate, detail = pg_exception_detail;
  return state || coalesce(' ' || nullif(detail, ''), '');
end
$$;

create function pg_temp.propose(actor uuid, subject uuid, session uuid, set_order integer, field text,
  value numeric, unit text, reason text, command uuid, key uuid default gen_random_uuid())
returns table (result jsonb, replayed boolean) language sql as $$
  select * from execution.propose_correction(
    actor, '019f5200-0000-7000-8000-000000000101', subject, session, set_order, field, value, unit,
    reason, key, command,
    extensions.digest(command::text || coalesce(field, '') || coalesce(value::text, '')
      || coalesce(unit, '') || coalesce(reason, ''), 'sha256'))
$$;

create function pg_temp.decide(person uuid, proposal uuid, decision text, command uuid,
  key uuid default gen_random_uuid())
returns table (result jsonb, replayed boolean) language sql as $$
  select * from execution.decide_correction_proposal(
    person, proposal, decision, key, command,
    extensions.digest(command::text || proposal::text || coalesce(decision, ''), 'sha256'))
$$;

-- Carla, the third client, only to see the organization close; E8 is another session Ana
-- trained on her own; Bruno's E7 gets a second set.
insert into identity.people (id, given_name, family_name, contact_email, status)
values ('019f5200-0000-7000-8000-000000000003', 'Carla', 'Client', null, 'active');
insert into relationships.service_relationships (id, person_id, organization_id, status, started_at)
values ('019f5200-0000-7000-8000-000000000703', '019f5200-0000-7000-8000-000000000003',
  '019f5200-0000-7000-8000-000000000101', 'active', clock_timestamp() - interval '30 days');
insert into relationships.relationship_professional_assignments (
  id, relationship_id, person_id, organization_id, membership_id, kind, status
) values ('019f5200-0000-7000-8000-000000000803', '019f5200-0000-7000-8000-000000000703',
  '019f5200-0000-7000-8000-000000000003', '019f5200-0000-7000-8000-000000000101',
  '019f5200-0000-7000-8000-000000000212', 'holder', 'active');
select pg_temp.trained('019f5200-0000-7000-8000-000000000e08', '019f5200-0000-7000-8000-000000000001', 8, null);
select pg_temp.trained('019f5200-0000-7000-8000-000000000e09', '019f5200-0000-7000-8000-000000000003', 2, '019f5200-0000-7000-8000-000000000703');
insert into execution.strength_sets (
  id, executed_session_id, movement_id, set_order, achieved_reps, load_value, load_unit_code, rpe, kind
) values
  ('019f5200-0000-7000-8000-000000000f72', '019f5200-0000-7000-8000-000000000e07', null, 2, 6, 70, 'kg', null, 'normal'),
  ('019f5200-0000-7000-8000-000000000f81', '019f5200-0000-7000-8000-000000000e08', null, 1, 5, 80, 'kg', null, 'normal'),
  ('019f5200-0000-7000-8000-000000000f91', '019f5200-0000-7000-8000-000000000e09', null, 1, 8, 40, 'kg', null, 'normal');

set local role allfit_api;
select pg_temp.act('019f5200-0000-7000-8000-000000000012');
select from pg_temp.propose('019f5200-0000-7000-8000-000000000012', '019f5200-0000-7000-8000-000000000001',
  '019f5200-0000-7000-8000-000000000e01', 1, 'load', 62.5, 'kg', 'La barra pesaba más.', '019f5200-0000-7000-8000-000000000c01');
select from pg_temp.propose('019f5200-0000-7000-8000-000000000012', '019f5200-0000-7000-8000-000000000001',
  '019f5200-0000-7000-8000-000000000e02', 1, 'load', 102.5, 'kg', 'Discos de 1,25.', '019f5200-0000-7000-8000-000000000c03');
select from pg_temp.propose('019f5200-0000-7000-8000-000000000012', '019f5200-0000-7000-8000-000000000001',
  '019f5200-0000-7000-8000-000000000e08', 1, 'load', 82.5, 'kg', 'Lo vi en el video.', '019f5200-0000-7000-8000-000000000c04');
select pg_temp.act('019f5200-0000-7000-8000-000000000013');
select from pg_temp.propose('019f5200-0000-7000-8000-000000000013', '019f5200-0000-7000-8000-000000000001',
  '019f5200-0000-7000-8000-000000000e01', 2, 'achieved_reps', 7, null, 'Conté siete.', '019f5200-0000-7000-8000-000000000c02');
reset role;

-- Bruno's and Carla's are written directly: what cancels them does not care how they came.
insert into execution.correction_proposals (
  id, person_id, relationship_id, organization_id, proposer_assignment_id, proposer_membership_id,
  executed_session_id, target_strength_set_id, set_order, target_field, current_value,
  current_unit_code, proposed_value, proposed_unit_code, reason, created_at, expires_at
) values
  ('019f5200-0000-7000-8000-000000000c06', '019f5200-0000-7000-8000-000000000002',
   '019f5200-0000-7000-8000-000000000702', '019f5200-0000-7000-8000-000000000101',
   '019f5200-0000-7000-8000-000000000802', '019f5200-0000-7000-8000-000000000212',
   '019f5200-0000-7000-8000-000000000e07', '019f5200-0000-7000-8000-000000000f71', 1, 'load', 60, 'kg',
   62.5, 'kg', 'Bruno.', now(), now() + interval '30 days'),
  ('019f5200-0000-7000-8000-000000000c07', '019f5200-0000-7000-8000-000000000003',
   '019f5200-0000-7000-8000-000000000703', '019f5200-0000-7000-8000-000000000101',
   '019f5200-0000-7000-8000-000000000803', '019f5200-0000-7000-8000-000000000212',
   '019f5200-0000-7000-8000-000000000e09', '019f5200-0000-7000-8000-000000000f91', 1, 'load', 40, 'kg',
   42.5, 'kg', 'Carla.', now(), now() + interval '30 days'),
  ('019f5200-0000-7000-8000-000000000c08', '019f5200-0000-7000-8000-000000000002',
   '019f5200-0000-7000-8000-000000000702', '019f5200-0000-7000-8000-000000000101',
   '019f5200-0000-7000-8000-000000000802', '019f5200-0000-7000-8000-000000000212',
   '019f5200-0000-7000-8000-000000000e07', '019f5200-0000-7000-8000-000000000f71', 1, 'achieved_reps', 8, null,
   9, null, 'Para la política.', now(), now() + interval '30 days'),
  ('019f5200-0000-7000-8000-000000000c09', '019f5200-0000-7000-8000-000000000002',
   '019f5200-0000-7000-8000-000000000702', '019f5200-0000-7000-8000-000000000101',
   '019f5200-0000-7000-8000-000000000802', '019f5200-0000-7000-8000-000000000212',
   '019f5200-0000-7000-8000-000000000e07', '019f5200-0000-7000-8000-000000000f72', 2, 'load', 70, 'kg',
   72.5, 'kg', 'Para la otra política.', now(), now() + interval '30 days');

-- ---------------------------------------------------------------------------
-- Row-level security: only the contracts that cancel do
-- ---------------------------------------------------------------------------
set local role allfit_owner;
select pg_temp.member('019f5200-0000-7000-8000-000000000015', '019f5200-0000-7000-8000-000000000215');
select is((select count(*)::integer from execution.correction_proposals), 0,
  'T-EXE-PROPOSAL-CANCEL-RLS-01 outside a contract an unrelated professional sees none');
with changed as (
  update execution.correction_proposals
  set status = 'cancelled', cancel_reason = 'target_changed', settled_at = clock_timestamp()
  where id = '019f5200-0000-7000-8000-000000000c08'
  returning 1
)
select is((select count(*)::integer from changed), 0,
  'T-EXE-PROPOSAL-CANCEL-RLS-02 and cancels none');
select access_control.open_contract_scope('correction_cancellation', '019f5200-0000-7000-8000-000000000e01');
select is((select array_agg(id order by id) from execution.correction_proposals),
  array['019f5200-0000-7000-8000-000000000c01', '019f5200-0000-7000-8000-000000000c02']::uuid[],
  'T-EXE-PROPOSAL-CANCEL-RLS-03 correction_proposals_select_cancellation: a cancellation of a session sees what waits on it');
with changed as (
  update execution.correction_proposals
  set status = 'cancelled', cancel_reason = 'target_changed', settled_at = clock_timestamp()
  where id = '019f5200-0000-7000-8000-000000000c08'
  returning 1
)
select is((select count(*)::integer from changed), 0,
  'T-EXE-PROPOSAL-CANCEL-RLS-04 correction_proposals_update_cancellation: not what waits on another session');
select access_control.open_contract_scope('correction_cancellation', '019f5200-0000-7000-8000-000000000e07');
select is(
  pg_temp.failure($$update execution.correction_proposals set status = 'accepted', settled_at = clock_timestamp()
    where id = '019f5200-0000-7000-8000-000000000c08'$$),
  '42501',
  'T-EXE-PROPOSAL-CANCEL-RLS-05 and it only ever cancels');
with changed as (
  update execution.correction_proposals
  set status = 'cancelled', cancel_reason = 'target_changed', settled_at = clock_timestamp()
  where id = '019f5200-0000-7000-8000-000000000c08'
  returning 1
)
select is((select count(*)::integer from changed), 1,
  'T-EXE-PROPOSAL-CANCEL-RLS-06 while what waits on its own session it cancels');

select access_control.open_contract_scope('relationship_detachment', '019f5200-0000-7000-8000-000000000701');
select is((select count(*)::integer from execution.correction_proposals where relationship_id <> '019f5200-0000-7000-8000-000000000701'), 0,
  'T-EXE-PROPOSAL-CANCEL-RLS-07 correction_proposals_select_detachment: closing one relationship sees nothing of another');
with changed as (
  update execution.correction_proposals
  set status = 'cancelled', cancel_reason = 'relationship_terminated', settled_at = clock_timestamp()
  where id = '019f5200-0000-7000-8000-000000000c09'
  returning 1
)
select is((select count(*)::integer from changed), 0,
  'T-EXE-PROPOSAL-CANCEL-RLS-08 correction_proposals_update_detachment: and cancels nothing of it');
select access_control.open_contract_scope('relationship_detachment', '019f5200-0000-7000-8000-000000000702');
select is((select count(*)::integer from execution.correction_proposals), 3,
  'T-EXE-PROPOSAL-CANCEL-RLS-09 while closing its own it sees what was proposed on it');
with changed as (
  update execution.correction_proposals
  set status = 'cancelled', cancel_reason = 'relationship_terminated', settled_at = clock_timestamp()
  where id = '019f5200-0000-7000-8000-000000000c09'
  returning 1
)
select is((select count(*)::integer from changed), 1,
  'T-EXE-PROPOSAL-CANCEL-RLS-10 and cancels it');
reset role;

-- ---------------------------------------------------------------------------
-- What she does to her own session cancels what waits on it
-- ---------------------------------------------------------------------------
set local role allfit_api;
select pg_temp.act('019f5200-0000-7000-8000-000000000001');
select from execution.revise_execution(
  '019f5200-0000-7000-8000-000000000001', '019f5200-0000-7000-8000-000000000e01', 0,
  '[{"family": "strength", "set_order": 1, "achieved_reps": 8, "load_value": 61, "load_unit_code": "kg", "rpe": 8},
    {"family": "strength", "set_order": 2, "achieved_reps": 6, "load_value": 70, "load_unit_code": "kg"},
    {"family": "strength", "set_order": 3, "achieved_reps": 10, "kind": "warmup"}]'::jsonb,
  null, clock_timestamp() - interval '2 days', clock_timestamp() - interval '2 days' + interval '1 hour',
  'a4000000-0000-4000-8000-000000000001', 'a4000000-0000-4000-8000-000000000001',
  extensions.digest('ana-revises', 'sha256'));
reset role;
select is(
  (select array_agg(id::text || ':' || status::text || ':' || coalesce(cancel_reason, '-') order by id)
   from execution.correction_proposals
   where id in ('019f5200-0000-7000-8000-000000000c01', '019f5200-0000-7000-8000-000000000c02',
                '019f5200-0000-7000-8000-000000000c03')),
  array['019f5200-0000-7000-8000-000000000c01:cancelled:target_changed',
        '019f5200-0000-7000-8000-000000000c02:cancelled:target_changed',
        '019f5200-0000-7000-8000-000000000c03:pending:-'],
  'T-EXE-PROPOSAL-CANCEL-INT-01 correcting the session herself cancels what waited on its sets, and nothing on another');

set local role allfit_api;
select pg_temp.act('019f5200-0000-7000-8000-000000000001');
select from execution.annul_execution(
  '019f5200-0000-7000-8000-000000000001', '019f5200-0000-7000-8000-000000000e02', 'Duplicada',
  'a4000000-0000-4000-8000-000000000002', 'a4000000-0000-4000-8000-000000000002',
  extensions.digest('ana-annuls', 'sha256'));
select from privacy.hide_session(
  '019f5200-0000-7000-8000-000000000001', '019f5200-0000-7000-8000-000000000e08',
  '019f5200-0000-7000-8000-000000000701',
  'a4000000-0000-4000-8000-000000000003', 'a4000000-0000-4000-8000-000000000003',
  extensions.digest('ana-hides', 'sha256'));
reset role;
select is(
  (select array_agg(status::text || ':' || coalesce(cancel_reason, '-') order by id)
   from execution.correction_proposals
   where id in ('019f5200-0000-7000-8000-000000000c03', '019f5200-0000-7000-8000-000000000c04')),
  array['cancelled:session_annulled', 'cancelled:session_hidden'],
  'T-EXE-PROPOSAL-CANCEL-INT-02 annulling a session, or hiding it from the gym, cancels what waited on it');

-- The revised session's sets are new: a proposal now lands on them.
set local role allfit_api;
select pg_temp.act('019f5200-0000-7000-8000-000000000012');
select is(
  (select result->>'status' from pg_temp.propose('019f5200-0000-7000-8000-000000000012', '019f5200-0000-7000-8000-000000000001',
    '019f5200-0000-7000-8000-000000000e01', 1, 'load', 62.5, 'kg', 'Sigue pesando más.', '019f5200-0000-7000-8000-000000000c05')),
  'pending',
  'T-EXE-PROPOSAL-CANCEL-API-01 the corrected set takes a new proposal');

-- ---------------------------------------------------------------------------
-- Termination, by each of its three paths
-- ---------------------------------------------------------------------------
select pg_temp.act('019f5200-0000-7000-8000-000000000001');
select from relationships.end_my_relationship(
  '019f5200-0000-7000-8000-000000000001', '019f5200-0000-7000-8000-000000000701', null,
  'a4000000-0000-4000-8000-000000000004', 'a4000000-0000-4000-8000-000000000004',
  extensions.digest('ana-ends', 'sha256'));
reset role;
select is(
  (select array[proposal.status::text, proposal.cancel_reason, (proposal.settled_at = relationship.ended_at)::text]
   from execution.correction_proposals as proposal
   join relationships.service_relationships as relationship on relationship.id = proposal.relationship_id
   where proposal.id = '019f5200-0000-7000-8000-000000000c05'),
  array['cancelled', 'relationship_terminated', 'true'],
  'T-EXE-PROPOSAL-CANCEL-INT-03 when she ends the relationship, what waited is cancelled at that instant');
select is(
  (select array_agg(cancel_reason order by id) from execution.correction_proposals
   where person_id = '019f5200-0000-7000-8000-000000000001'),
  array['target_changed', 'target_changed', 'session_annulled', 'session_hidden', 'relationship_terminated'],
  'T-EXE-PROPOSAL-CANCEL-INT-04 and what was already settled keeps why');

set local role allfit_api;
select pg_temp.act('019f5200-0000-7000-8000-000000000012');
select is(
  (select array[proposal->>'status', proposal->>'cancel_reason', coalesce(proposal->>'target', 'null')]
   from execution.list_proposed_corrections(
    '019f5200-0000-7000-8000-000000000012', '019f5200-0000-7000-8000-000000000101', null, 20, null, null) as proposal
   where proposal->>'id' = '019f5200-0000-7000-8000-000000000c05'),
  array['cancelled', 'relationship_terminated', 'null'],
  'T-EXE-PROPOSAL-CANCEL-LIST-01 Studio still lists it, cancelled, with nothing of her session once he no longer attends her');
select pg_temp.act('019f5200-0000-7000-8000-000000000001');
select is(
  (select array_agg(proposal->>'status' order by proposal->>'id')
   from execution.list_my_correction_proposals('019f5200-0000-7000-8000-000000000001', null, 20, null, null) as proposal),
  array['cancelled', 'cancelled', 'cancelled', 'cancelled', 'cancelled'],
  'T-EXE-PROPOSAL-CANCEL-LIST-02 and she still sees every one of them, cancelled, not gone');

select pg_temp.act('019f5200-0000-7000-8000-000000000011');
select from relationships.terminate_relationship(
  '019f5200-0000-7000-8000-000000000011', '019f5200-0000-7000-8000-000000000101',
  '019f5200-0000-7000-8000-000000000702', null,
  'a4000000-0000-4000-8000-000000000005', 'a4000000-0000-4000-8000-000000000005',
  extensions.digest('gym-ends', 'sha256'));
reset role;
select is(
  (select array_agg(status::text || ':' || coalesce(cancel_reason, '-') order by id)
   from execution.correction_proposals where person_id = '019f5200-0000-7000-8000-000000000002'),
  array['cancelled:relationship_terminated', 'cancelled:target_changed', 'cancelled:relationship_terminated'],
  'T-EXE-PROPOSAL-CANCEL-INT-05 when the gym ends it, the same');

set local role allfit_api;
select pg_temp.act('019f5200-0000-7000-8000-000000000011');
select from organizations.close_organization(
  '019f5200-0000-7000-8000-000000000011', '019f5200-0000-7000-8000-000000000101',
  'a4000000-0000-4000-8000-000000000006', 'a4000000-0000-4000-8000-000000000006',
  extensions.digest('gym-closes', 'sha256'));
reset role;
select is(
  (select status::text || ':' || cancel_reason from execution.correction_proposals
   where id = '019f5200-0000-7000-8000-000000000c07'),
  'cancelled:relationship_terminated',
  'T-EXE-PROPOSAL-CANCEL-INT-06 and when the organization closes (OP-ORG-012), the same');
select is(
  (select count(*)::integer from execution.correction_proposals where status = 'pending'
     and organization_id = '019f5200-0000-7000-8000-000000000101'),
  0,
  'T-EXE-PROPOSAL-CANCEL-INT-07 nothing of a closed gym waits on anybody');

select * from finish();
rollback;
