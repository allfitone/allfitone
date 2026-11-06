-- T-EXE-PROPOSAL-DECIDE-01 — OP-EXE-013 (HU-SP-063) and OP-SYS-004, T-PROP-1..3, T-REV-1.
--
-- She decides what was proposed to her, and the clock decides what she leaves unanswered:
--
--   · Accepting changes the same set in place and moves the session to its next revision.
--     The revision keeps the original, the change, the reason and the proposal (T-PROP-1);
--     she is who made the change and the value stays declared by her (T-PROP-2).
--   · Rejecting changes nothing. A decided, cancelled or expired proposal is not accepted,
--     even before the sweep has marked it (T-PROP-3); nor is one whose set moved since.
--   · The worker expires what is due in batches, applies nothing, and converges.
--
-- Written before the migration and watched failing.
begin;

select plan(31);

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

set local role allfit_api;
select pg_temp.act('019f5200-0000-7000-8000-000000000012');
select from pg_temp.propose('019f5200-0000-7000-8000-000000000012', '019f5200-0000-7000-8000-000000000001',
  '019f5200-0000-7000-8000-000000000e01', 1, 'load', 62.5, 'kg', 'La barra pesaba 2,5 kg más.', '019f5200-0000-7000-8000-000000000c01');
select from pg_temp.propose('019f5200-0000-7000-8000-000000000012', '019f5200-0000-7000-8000-000000000001',
  '019f5200-0000-7000-8000-000000000e01', 1, 'rpe', 9, null, 'Se la vio más cerca del fallo.', '019f5200-0000-7000-8000-000000000c02');
select from pg_temp.propose('019f5200-0000-7000-8000-000000000012', '019f5200-0000-7000-8000-000000000001',
  '019f5200-0000-7000-8000-000000000e01', 2, 'achieved_reps', 7, null, 'Conté siete.', '019f5200-0000-7000-8000-000000000c03');
select from pg_temp.propose('019f5200-0000-7000-8000-000000000012', '019f5200-0000-7000-8000-000000000001',
  '019f5200-0000-7000-8000-000000000e02', 1, 'load', 102.5, 'kg', 'Discos de 1,25 por lado.', '019f5200-0000-7000-8000-000000000c04');
select from pg_temp.propose('019f5200-0000-7000-8000-000000000012', '019f5200-0000-7000-8000-000000000001',
  '019f5200-0000-7000-8000-000000000e01', 3, 'achieved_reps', 12, null, 'Fueron doce.', '019f5200-0000-7000-8000-000000000c07');
reset role;

-- Two proposed a month ago: past their thirty days, and nobody has swept them yet.
insert into execution.correction_proposals (
  id, person_id, relationship_id, organization_id, proposer_assignment_id, proposer_membership_id,
  executed_session_id, target_strength_set_id, set_order, target_field, current_value,
  current_unit_code, proposed_value, proposed_unit_code, reason, created_at, expires_at
) values
  ('019f5200-0000-7000-8000-000000000c05', '019f5200-0000-7000-8000-000000000001',
   '019f5200-0000-7000-8000-000000000701', '019f5200-0000-7000-8000-000000000101',
   '019f5200-0000-7000-8000-000000000801', '019f5200-0000-7000-8000-000000000212',
   '019f5200-0000-7000-8000-000000000e01', '019f5200-0000-7000-8000-000000000f12', 2, 'load', 70, 'kg',
   72.5, 'kg', 'Hace un mes.', now() - interval '31 days', now() - interval '1 day'),
  ('019f5200-0000-7000-8000-000000000c06', '019f5200-0000-7000-8000-000000000001',
   '019f5200-0000-7000-8000-000000000701', '019f5200-0000-7000-8000-000000000101',
   '019f5200-0000-7000-8000-000000000801', '019f5200-0000-7000-8000-000000000212',
   '019f5200-0000-7000-8000-000000000e02', '019f5200-0000-7000-8000-000000000f21', 1, 'achieved_reps', 5, null,
   6, null, 'Tampoco.', now() - interval '32 days', now() - interval '2 days');

-- ---------------------------------------------------------------------------
-- OP-EXE-013: she accepts
-- ---------------------------------------------------------------------------
set local role allfit_api;
select pg_temp.act('019f5200-0000-7000-8000-000000000001');
select result as accepted, replayed as accepted_replayed from pg_temp.decide(
  '019f5200-0000-7000-8000-000000000001', '019f5200-0000-7000-8000-000000000c01', 'accept',
  '019f5200-0000-7000-8000-000000000b01', 'a3000000-0000-4000-8000-000000000001') \gset
select is(
  array[:'accepted'::jsonb->>'status', (:'accepted'::jsonb->>'settled_at' is not null)::text,
        :'accepted'::jsonb->'proposed'->>'value'],
  array['accepted', 'true', '62.5'],
  'T-EXE-PROPOSAL-DECIDE-API-01 she accepts what was proposed to her');
select is(:'accepted_replayed'::boolean, false, 'T-EXE-PROPOSAL-DECIDE-IDEM-01 the first time it is not a replay');
reset role;
select results_eq(
  $$select id, achieved_reps, load_value, load_unit_code, rpe from execution.strength_sets
    where executed_session_id = '019f5200-0000-7000-8000-000000000e01' and set_order = 1$$,
  $$values ('019f5200-0000-7000-8000-000000000f11'::uuid, 8, 62.5::numeric, 'kg', 8::numeric)$$,
  'T-EXE-PROPOSAL-DECIDE-INT-01 the same set now holds the load, and nothing else in it changed');
select is(
  (select revision_number from execution.executed_sessions where id = '019f5200-0000-7000-8000-000000000e01'),
  1::bigint,
  'T-EXE-PROPOSAL-DECIDE-INT-02 the session moved to its next revision');
select results_eq(
  $$select revision_from, revision_to, reason, correction_proposal_id,
           before->'sets'->0->>'load_value', after->'sets'->0->>'load_value'
    from execution.execution_revisions where executed_session_id = '019f5200-0000-7000-8000-000000000e01'$$,
  $$values (0::bigint, 1::bigint, 'La barra pesaba 2,5 kg más.', '019f5200-0000-7000-8000-000000000c01'::uuid,
            '60', '62.5')$$,
  'T-EXE-PROPOSAL-DECIDE-INT-03 T-PROP-1 the revision keeps the original, the change, his reason and the proposal');
select is(
  (select array[revision.actor_person_id::text, revision.person_id::text, session.capture_provenance::text]
   from execution.execution_revisions as revision
   join execution.executed_sessions as session on session.id = revision.executed_session_id
   where revision.correction_proposal_id = '019f5200-0000-7000-8000-000000000c01'),
  array['019f5200-0000-7000-8000-000000000001', '019f5200-0000-7000-8000-000000000001', 'person_declared'],
  'T-EXE-PROPOSAL-DECIDE-INT-04 T-PROP-2 she made the change and it stays declared by her: he only proposed it');
select is(
  (select status::text from execution.correction_proposals where id = '019f5200-0000-7000-8000-000000000c02'),
  'pending',
  'T-EXE-PROPOSAL-DECIDE-INT-05 a proposal on another field of the same set still waits on her');
select results_eq(
  $$select event_type, (select array_agg(key order by key) from jsonb_object_keys(payload) as key),
           payload->>'decision'
    from system.outbox_events
    where aggregate_id = '019f5200-0000-7000-8000-000000000c01' and event_type = 'execution.correction_decided.v1'$$,
  $$values ('execution.correction_decided.v1',
            array['decision', 'person_id', 'proposal_id', 'relationship_id'], 'accepted')$$,
  'T-EXE-PROPOSAL-DECIDE-INT-06 the decision is recorded as an event that carries no value');
set local role allfit_api;

select pg_temp.act('019f5200-0000-7000-8000-000000000001');
select is(
  (select replayed from pg_temp.decide(
    '019f5200-0000-7000-8000-000000000001', '019f5200-0000-7000-8000-000000000c01', 'accept',
    '019f5200-0000-7000-8000-000000000b01', 'a3000000-0000-4000-8000-000000000001')),
  true,
  'T-EXE-PROPOSAL-DECIDE-IDEM-02 the same decision again is a replay, not a second revision');
select pg_temp.act('019f5200-0000-7000-8000-000000000012');
select is(
  (select document->'execution'->'strength_sets'->0->'load'
   from execution.read_authorized_execution(
     '019f5200-0000-7000-8000-000000000012', '019f5200-0000-7000-8000-000000000101',
     '019f5200-0000-7000-8000-000000000001', '019f5200-0000-7000-8000-000000000e01') as document),
  '{"value": 62.5, "unit": "kg"}'::jsonb,
  'T-EXE-PROPOSAL-DECIDE-API-02 the coach reads the value she accepted');

select pg_temp.act('019f5200-0000-7000-8000-000000000001');
select is(
  (select result->>'status' from pg_temp.decide(
    '019f5200-0000-7000-8000-000000000001', '019f5200-0000-7000-8000-000000000c04', 'accept',
    '019f5200-0000-7000-8000-000000000b04')),
  'accepted',
  'T-EXE-PROPOSAL-DECIDE-API-03 a set she trained on her own changes only because she accepts it');

-- ---------------------------------------------------------------------------
-- She rejects, or cannot decide
-- ---------------------------------------------------------------------------
select is(
  (select result->>'status' from pg_temp.decide(
    '019f5200-0000-7000-8000-000000000001', '019f5200-0000-7000-8000-000000000c03', 'reject',
    '019f5200-0000-7000-8000-000000000b03')),
  'rejected',
  'T-EXE-PROPOSAL-DECIDE-API-04 she rejects one');
reset role;
select is(
  (select array[sets.achieved_reps::text, session.revision_number::text]
   from execution.strength_sets as sets
   join execution.executed_sessions as session on session.id = sets.executed_session_id
   where sets.id = '019f5200-0000-7000-8000-000000000f12'),
  array['6', '1'],
  'T-EXE-PROPOSAL-DECIDE-INT-07 and rejecting changes nothing she declared');
set local role allfit_api;
select pg_temp.act('019f5200-0000-7000-8000-000000000001');
select is(
  array[
    pg_temp.failure($$select * from pg_temp.decide('019f5200-0000-7000-8000-000000000001',
      '019f5200-0000-7000-8000-000000000c03', 'accept', '019f5200-0000-7000-8000-000000000b05')$$),
    pg_temp.failure($$select * from pg_temp.decide('019f5200-0000-7000-8000-000000000001',
      '019f5200-0000-7000-8000-000000000c05', 'accept', '019f5200-0000-7000-8000-000000000b06')$$)
  ],
  array['55000 rejected', '55000 expired'],
  'T-EXE-PROPOSAL-DECIDE-API-05 T-PROP-3 a decided proposal is not decided again, and one past its thirty days is not accepted even before the sweep');
reset role;
select is(
  (select array[status::text, (select load_value::text from execution.strength_sets
                                where id = '019f5200-0000-7000-8000-000000000f12')]
   from execution.correction_proposals where id = '019f5200-0000-7000-8000-000000000c05'),
  array['pending', '70'],
  'T-EXE-PROPOSAL-DECIDE-INT-08 refusing it changed neither the proposal nor her set');
update execution.correction_proposals
set status = 'cancelled', cancel_reason = 'relationship_terminated', settled_at = clock_timestamp()
where id = '019f5200-0000-7000-8000-000000000c02';
set local role allfit_api;
select pg_temp.act('019f5200-0000-7000-8000-000000000001');
select is(
  pg_temp.failure($$select * from pg_temp.decide('019f5200-0000-7000-8000-000000000001',
    '019f5200-0000-7000-8000-000000000c02', 'accept', '019f5200-0000-7000-8000-000000000b07')$$),
  '55000 cancelled',
  'T-EXE-PROPOSAL-DECIDE-API-06 T-PROP-3 a proposal cancelled by the termination is not accepted');
select is(
  pg_temp.failure($$select * from pg_temp.decide('019f5200-0000-7000-8000-000000000001',
    '019f5200-0000-7000-8000-000000000c07', 'maybe', '019f5200-0000-7000-8000-000000000b08')$$),
  '22023 ["decision"]',
  'T-EXE-PROPOSAL-DECIDE-API-07 a decision is to accept or to reject');
select pg_temp.act('019f5200-0000-7000-8000-000000000002');
select is(
  array[
    pg_temp.failure($$select * from pg_temp.decide('019f5200-0000-7000-8000-000000000002',
      '019f5200-0000-7000-8000-000000000c07', 'accept', '019f5200-0000-7000-8000-000000000b09')$$),
    pg_temp.failure($$select * from pg_temp.decide('019f5200-0000-7000-8000-000000000001',
      '019f5200-0000-7000-8000-000000000c07', 'accept', '019f5200-0000-7000-8000-000000000b10')$$)
  ],
  array['P0002', '42501'],
  'T-EXE-PROPOSAL-DECIDE-API-08 another person finds no proposal of hers, and cannot decide as her');

-- A value that moved since it was proposed is not overwritten by a stale one.
select pg_temp.act('019f5200-0000-7000-8000-000000000013');
select from pg_temp.propose('019f5200-0000-7000-8000-000000000013', '019f5200-0000-7000-8000-000000000001',
  '019f5200-0000-7000-8000-000000000e01', 1, 'load', 65, 'kg', 'Yo vi 65.', '019f5200-0000-7000-8000-000000000c08');
reset role;
update execution.strength_sets set load_value = 63 where id = '019f5200-0000-7000-8000-000000000f11';
set local role allfit_api;
select pg_temp.act('019f5200-0000-7000-8000-000000000001');
select is(
  pg_temp.failure($$select * from pg_temp.decide('019f5200-0000-7000-8000-000000000001',
    '019f5200-0000-7000-8000-000000000c08', 'accept', '019f5200-0000-7000-8000-000000000b11')$$),
  '55000',
  'T-EXE-PROPOSAL-DECIDE-API-09 a set that no longer holds what was proposed against is not overwritten');
select is(
  (select array_agg((proposal->>'id') || ':' || (proposal->>'status') order by proposal->>'id')
   from execution.list_my_correction_proposals('019f5200-0000-7000-8000-000000000001', 'expired', 20, null, null)),
  array['019f5200-0000-7000-8000-000000000c05:expired', '019f5200-0000-7000-8000-000000000c06:expired'],
  'T-EXE-PROPOSAL-DECIDE-API-10 past its thirty days it reads as expired before any sweep');
reset role;

-- ---------------------------------------------------------------------------
-- OP-SYS-004: the sweep
-- ---------------------------------------------------------------------------
set local role allfit_owner;
select pg_temp.worker();
select is(
  (select array_agg(id order by id) from execution.correction_proposals),
  array['019f5200-0000-7000-8000-000000000c05', '019f5200-0000-7000-8000-000000000c06']::uuid[],
  'T-EXE-PROPOSAL-SYS-RLS-01 correction_proposals_select_worker: the worker sees only what is due, and none of its content beyond that');
select is(
  pg_temp.failure($$update execution.correction_proposals set status = 'accepted', settled_at = clock_timestamp()
    where id = '019f5200-0000-7000-8000-000000000c05'$$),
  '42501',
  'T-EXE-PROPOSAL-SYS-RLS-02 correction_proposals_update_worker: it only ever expires one');
with changed as (
  update execution.correction_proposals set status = 'expired', settled_at = clock_timestamp()
  where id = '019f5200-0000-7000-8000-000000000c07'
  returning 1
)
select is((select count(*)::integer from changed), 0,
  'T-EXE-PROPOSAL-SYS-RLS-03 and never one still within its thirty days');
reset role;

set local role allfit_api;
select pg_temp.act('019f5200-0000-7000-8000-000000000001');
select is(
  pg_temp.failure($$select execution.expire_correction_proposals(100)$$),
  '42501',
  'T-EXE-PROPOSAL-SYS-01 a person does not run the sweep');
select pg_temp.worker();
select is(
  pg_temp.failure($$select execution.expire_correction_proposals(0)$$),
  '22023',
  'T-EXE-PROPOSAL-SYS-02 a batch has a size');
select is(execution.expire_correction_proposals(1), 1,
  'T-EXE-PROPOSAL-SYS-03 it respects the batch');
select is(execution.expire_correction_proposals(100), 1,
  'T-EXE-PROPOSAL-SYS-04 the next run takes the rest');
select is(execution.expire_correction_proposals(100), 0,
  'T-EXE-PROPOSAL-SYS-05 and converges');
reset role;
select is(
  (select array_agg(status::text || ':' || (settled_at is not null)::text order by id)
   from execution.correction_proposals
   where id in ('019f5200-0000-7000-8000-000000000c05', '019f5200-0000-7000-8000-000000000c06',
                '019f5200-0000-7000-8000-000000000c07')),
  array['expired:true', 'expired:true', 'pending:false'],
  'T-EXE-PROPOSAL-SYS-06 what was due is expired and what is not still waits');
select is(
  array[(select load_value::text from execution.strength_sets where id = '019f5200-0000-7000-8000-000000000f12'),
        (select achieved_reps::text from execution.strength_sets where id = '019f5200-0000-7000-8000-000000000f21')],
  array['70', '5'],
  'T-EXE-PROPOSAL-SYS-07 expiring applies nothing');
select results_eq(
  $$select count(*)::integer,
           bool_and((select array_agg(key order by key) from jsonb_object_keys(payload) as key)
                    = array['person_id', 'proposal_id', 'relationship_id'])
    from system.outbox_events
    where event_type = 'execution.correction_expired.v1'
      and aggregate_id in ('019f5200-0000-7000-8000-000000000c05', '019f5200-0000-7000-8000-000000000c06')$$,
  $$values (2, true)$$,
  'T-EXE-PROPOSAL-SYS-08 each expiry is an event that carries no value');

select * from finish();
rollback;
