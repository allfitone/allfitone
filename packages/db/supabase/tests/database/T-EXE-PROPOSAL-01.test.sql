-- T-EXE-PROPOSAL-01 — OP-EXE-012 and OP-EXE-020 (HU-STUDIO-059, HU-STUDIO-060, HU-SP-062),
-- T-PROP-1 and T-PROP-4.
--
-- The coach who attends a person proposes a correction to a strength set she declared:
--
--   · Only with her training shared at `contribute`, and only on a set she declared and
--     shows him: never what a device captured, a session she annulled or one she hid.
--   · Proposing changes nothing (T-PROP-1): not the set, its revision or its history.
--     There is no destructive patch of results by any path (T-PROP-4).
--   · One field of one set waits on her for one proposal at a time, for thirty days, and
--     she is told by email; a proposal she cannot be told about is not made.
--   · Studio lists what each professional proposed, never her value; Space lists what
--     was proposed to her, with what she had, what he proposes, why and who.
--
-- Written before the migration and watched failing.
begin;

select plan(49);

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

-- ---------------------------------------------------------------------------
-- OP-EXE-012: proposing
-- ---------------------------------------------------------------------------
set local role allfit_api;
select pg_temp.act('019f5200-0000-7000-8000-000000000012');
select result as first, replayed as first_replayed from pg_temp.propose(
  '019f5200-0000-7000-8000-000000000012', '019f5200-0000-7000-8000-000000000001',
  '019f5200-0000-7000-8000-000000000e01', 1, 'load', 62.5, 'kg', 'La barra pesaba 2,5 kg más.',
  '019f5200-0000-7000-8000-000000000c01', 'a2000000-0000-4000-8000-000000000001') \gset
select is(
  :'first'::jsonb - 'created_at' - 'expires_at',
  '{"id": "019f5200-0000-7000-8000-000000000c01",
    "client": {"person_id": "019f5200-0000-7000-8000-000000000001", "name": "Ana Client"},
    "target": {"execution_id": "019f5200-0000-7000-8000-000000000e01", "set_order": 1},
    "field": "load", "proposed": {"value": 62.5, "unit": "kg"},
    "reason": "La barra pesaba 2,5 kg más.", "status": "pending", "cancel_reason": null,
    "settled_at": null}'::jsonb,
  'T-EXE-PROPOSAL-API-01 the holder proposes a load for a set she declared, and sees only his side of it');
select is(:'first_replayed'::boolean, false, 'T-EXE-PROPOSAL-IDEM-01 the first time it is not a replay');
reset role;
select is(
  (select array[sets.achieved_reps::text, sets.load_value::text, sets.load_unit_code, sets.rpe::text,
                session.revision_number::text,
                (select count(*)::text from execution.execution_revisions
                 where executed_session_id = '019f5200-0000-7000-8000-000000000e01')]
   from execution.strength_sets as sets
   join execution.executed_sessions as session on session.id = sets.executed_session_id
   where sets.id = '019f5200-0000-7000-8000-000000000f11'),
  array['8', '60', 'kg', '8', '0', '0'],
  'T-EXE-PROPOSAL-INT-01 T-PROP-1 proposing changes nothing: not the set, its revision or its history');
select results_eq(
  $$select proposer_assignment_id, proposer_membership_id, target_strength_set_id, current_value,
           current_unit_code, status::text, expires_at = created_at + interval '30 days'
    from execution.correction_proposals where id = '019f5200-0000-7000-8000-000000000c01'$$,
  $$values ('019f5200-0000-7000-8000-000000000801'::uuid, '019f5200-0000-7000-8000-000000000212'::uuid,
            '019f5200-0000-7000-8000-000000000f11'::uuid, 60::numeric, 'kg', 'pending', true)$$,
  'T-EXE-PROPOSAL-INT-02 it keeps who proposed it, the set, what she had declared, and thirty days');
select results_eq(
  $$select event_type, (select array_agg(key order by key) from jsonb_object_keys(payload) as key),
           payload->>'contact'
    from system.outbox_events where aggregate_id = '019f5200-0000-7000-8000-000000000c01'$$,
  $$values ('execution.correction_proposed.v1',
            array['contact', 'expires_at', 'organization_name', 'person_name', 'proposal_id', 'proposer_name'],
            'ana@example.test')$$,
  'T-EXE-PROPOSAL-INT-03 she is told, and the message carries neither value');
set local role allfit_api;

select pg_temp.act('019f5200-0000-7000-8000-000000000012');
select is(
  (select replayed from pg_temp.propose(
    '019f5200-0000-7000-8000-000000000012', '019f5200-0000-7000-8000-000000000001',
    '019f5200-0000-7000-8000-000000000e01', 1, 'load', 62.5, 'kg', 'La barra pesaba 2,5 kg más.',
    '019f5200-0000-7000-8000-000000000c01', 'a2000000-0000-4000-8000-000000000001')),
  true,
  'T-EXE-PROPOSAL-IDEM-02 the same command again is a replay');
select is(
  pg_temp.failure($$select * from pg_temp.propose(
    '019f5200-0000-7000-8000-000000000012', '019f5200-0000-7000-8000-000000000001',
    '019f5200-0000-7000-8000-000000000e01', 1, 'load', 65, 'kg', 'Otra cosa.',
    '019f5200-0000-7000-8000-000000000c01', 'a2000000-0000-4000-8000-000000000001')$$),
  '23505',
  'T-EXE-PROPOSAL-IDEM-03 the same key for a different request is refused');
reset role;
select is(
  (select count(*)::integer from execution.correction_proposals where id = '019f5200-0000-7000-8000-000000000c01')
  + (select count(*)::integer from system.outbox_events where aggregate_id = '019f5200-0000-7000-8000-000000000c01'),
  2,
  'T-EXE-PROPOSAL-IDEM-04 and nothing was written twice');
set local role allfit_api;

select pg_temp.act('019f5200-0000-7000-8000-000000000012');
select is(
  (select result->'proposed' from pg_temp.propose(
    '019f5200-0000-7000-8000-000000000012', '019f5200-0000-7000-8000-000000000001',
    '019f5200-0000-7000-8000-000000000e01', 1, 'rpe', 9, null, 'Se la vio más cerca del fallo.',
    '019f5200-0000-7000-8000-000000000c02')),
  '{"value": 9, "unit": null}'::jsonb,
  'T-EXE-PROPOSAL-API-02 another field of the same set takes its own proposal');

select pg_temp.act('019f5200-0000-7000-8000-000000000013');
select is(
  pg_temp.failure($$select * from pg_temp.propose(
    '019f5200-0000-7000-8000-000000000013', '019f5200-0000-7000-8000-000000000001',
    '019f5200-0000-7000-8000-000000000e01', 1, 'load', 65, 'kg', 'Yo vi 65.',
    '019f5200-0000-7000-8000-000000000c03')$$),
  '23505',
  'T-EXE-PROPOSAL-API-03 a field already waiting on her takes no second proposal, from anybody');
select is(
  (select result->>'field' from pg_temp.propose(
    '019f5200-0000-7000-8000-000000000013', '019f5200-0000-7000-8000-000000000001',
    '019f5200-0000-7000-8000-000000000e01', 2, 'achieved_reps', 7, null, 'Conté siete.',
    '019f5200-0000-7000-8000-000000000c04')),
  'achieved_reps',
  'T-EXE-PROPOSAL-API-04 a cover she accepted proposes too');

select pg_temp.act('019f5200-0000-7000-8000-000000000012');
select is(
  (select result->'target' from pg_temp.propose(
    '019f5200-0000-7000-8000-000000000012', '019f5200-0000-7000-8000-000000000001',
    '019f5200-0000-7000-8000-000000000e02', 1, 'load', 102.5, 'kg', 'Discos de 1,25 por lado.',
    '019f5200-0000-7000-8000-000000000c05')),
  '{"execution_id": "019f5200-0000-7000-8000-000000000e02", "set_order": 1}'::jsonb,
  'T-EXE-PROPOSAL-API-05 a set she trained on her own and shows him takes a proposal: nothing changes until she says so');

-- ---------------------------------------------------------------------------
-- What is refused
-- ---------------------------------------------------------------------------
select is(
  pg_temp.failure($$select * from pg_temp.propose(
    '019f5200-0000-7000-8000-000000000012', '019f5200-0000-7000-8000-000000000002',
    '019f5200-0000-7000-8000-000000000e07', 1, 'load', 62.5, 'kg', 'Sin permiso.',
    '019f5200-0000-7000-8000-000000000c10')$$),
  'AF430 relationship_training:contribute',
  'T-EXE-PROPOSAL-API-06 reading his training is not enough to propose on it');
select pg_temp.act('019f5200-0000-7000-8000-000000000015');
select is(
  pg_temp.failure($$select * from pg_temp.propose(
    '019f5200-0000-7000-8000-000000000015', '019f5200-0000-7000-8000-000000000001',
    '019f5200-0000-7000-8000-000000000e01', 2, 'load', 72.5, 'kg', 'No la atiendo.',
    '019f5200-0000-7000-8000-000000000c11')$$),
  'P0002',
  'T-EXE-PROPOSAL-API-07 a colleague who does not attend her finds nobody');
select pg_temp.act('019f5200-0000-7000-8000-000000000012');
select is(
  array[
    pg_temp.failure($$select * from pg_temp.propose(
      '019f5200-0000-7000-8000-000000000012', '019f5200-0000-7000-8000-000000000001',
      '019f5200-0000-7000-8000-000000000e03', 1, 'load', 42.5, 'kg', 'El reloj se equivocó.',
      '019f5200-0000-7000-8000-000000000c12')$$),
    pg_temp.failure($$select * from pg_temp.propose(
      '019f5200-0000-7000-8000-000000000012', '019f5200-0000-7000-8000-000000000001',
      '019f5200-0000-7000-8000-000000000e06', 1, 'load', 52.5, 'kg', 'No lo declaró ella.',
      '019f5200-0000-7000-8000-000000000c13')$$)
  ],
  array['22023 ["execution"]', '22023 ["execution"]'],
  'T-EXE-PROPOSAL-API-08 only what she declared takes a proposal: not what a device captured or anyone observed');
select is(
  array[
    pg_temp.failure($$select * from pg_temp.propose(
      '019f5200-0000-7000-8000-000000000012', '019f5200-0000-7000-8000-000000000001',
      '019f5200-0000-7000-8000-000000000e04', 1, 'load', 52.5, 'kg', 'Anulada.',
      '019f5200-0000-7000-8000-000000000c14')$$),
    pg_temp.failure($$select * from pg_temp.propose(
      '019f5200-0000-7000-8000-000000000012', '019f5200-0000-7000-8000-000000000001',
      '019f5200-0000-7000-8000-000000000e05', 1, 'load', 52.5, 'kg', 'Oculta.',
      '019f5200-0000-7000-8000-000000000c15')$$)
  ],
  array['P0002', 'P0002'],
  'T-EXE-PROPOSAL-API-09 a session she annulled, or hid from this gym, is not there to propose on');
select is(
  array[
    pg_temp.failure($$select * from pg_temp.propose(
      '019f5200-0000-7000-8000-000000000012', '019f5200-0000-7000-8000-000000000001',
      '019f5200-0000-7000-8000-000000000e01', 9, 'load', 52.5, 'kg', 'No existe.',
      '019f5200-0000-7000-8000-000000000c16')$$),
    pg_temp.failure($$select * from pg_temp.propose(
      '019f5200-0000-7000-8000-000000000012', '019f5200-0000-7000-8000-000000000001',
      '019f5200-0000-7000-8000-000000000e01', 3, 'load', 20, 'kg', 'No anotó peso.',
      '019f5200-0000-7000-8000-000000000c17')$$),
    pg_temp.failure($$select * from pg_temp.propose(
      '019f5200-0000-7000-8000-000000000012', '019f5200-0000-7000-8000-000000000001',
      '019f5200-0000-7000-8000-000000000e01', 3, 'achieved_reps', 10, null, 'Lo mismo.',
      '019f5200-0000-7000-8000-000000000c18')$$)
  ],
  array['22023 ["set_order"]', '22023 ["field"]', '22023 ["value"]'],
  'T-EXE-PROPOSAL-API-10 a set that is not there, a value she never declared, and a value she already has');
select is(
  array[
    pg_temp.failure($$select * from pg_temp.propose('019f5200-0000-7000-8000-000000000012', '019f5200-0000-7000-8000-000000000001',
      '019f5200-0000-7000-8000-000000000e01', 3, 'achieved_reps', 0, null, 'Cero.', '019f5200-0000-7000-8000-000000000c19')$$),
    pg_temp.failure($$select * from pg_temp.propose('019f5200-0000-7000-8000-000000000012', '019f5200-0000-7000-8000-000000000001',
      '019f5200-0000-7000-8000-000000000e01', 3, 'achieved_reps', 8.5, null, 'Media.', '019f5200-0000-7000-8000-000000000c19')$$),
    pg_temp.failure($$select * from pg_temp.propose('019f5200-0000-7000-8000-000000000012', '019f5200-0000-7000-8000-000000000001',
      '019f5200-0000-7000-8000-000000000e01', 2, 'rpe', 11, null, 'Once.', '019f5200-0000-7000-8000-000000000c19')$$),
    pg_temp.failure($$select * from pg_temp.propose('019f5200-0000-7000-8000-000000000012', '019f5200-0000-7000-8000-000000000001',
      '019f5200-0000-7000-8000-000000000e01', 2, 'load', -1, 'kg', 'Negativo.', '019f5200-0000-7000-8000-000000000c19')$$),
    pg_temp.failure($$select * from pg_temp.propose('019f5200-0000-7000-8000-000000000012', '019f5200-0000-7000-8000-000000000001',
      '019f5200-0000-7000-8000-000000000e01', 2, 'load', 72.5, 'cm', 'Longitud.', '019f5200-0000-7000-8000-000000000c19')$$),
    pg_temp.failure($$select * from pg_temp.propose('019f5200-0000-7000-8000-000000000012', '019f5200-0000-7000-8000-000000000001',
      '019f5200-0000-7000-8000-000000000e01', 2, 'load', 72.5, null, 'Sin unidad.', '019f5200-0000-7000-8000-000000000c19')$$),
    pg_temp.failure($$select * from pg_temp.propose('019f5200-0000-7000-8000-000000000012', '019f5200-0000-7000-8000-000000000001',
      '019f5200-0000-7000-8000-000000000e01', 3, 'achieved_reps', 9, 'kg', 'Reps en kilos.', '019f5200-0000-7000-8000-000000000c19')$$),
    pg_temp.failure($$select * from pg_temp.propose('019f5200-0000-7000-8000-000000000012', '019f5200-0000-7000-8000-000000000001',
      '019f5200-0000-7000-8000-000000000e01', 2, 'tempo', 3, null, 'Tempo.', '019f5200-0000-7000-8000-000000000c19')$$),
    pg_temp.failure($$select * from pg_temp.propose('019f5200-0000-7000-8000-000000000012', '019f5200-0000-7000-8000-000000000001',
      '019f5200-0000-7000-8000-000000000e01', 0, 'rpe', 7, null, '  ', '019f5200-0000-7000-8000-000000000c19')$$),
    pg_temp.failure(format($$select * from pg_temp.propose('019f5200-0000-7000-8000-000000000012', '019f5200-0000-7000-8000-000000000001',
      '019f5200-0000-7000-8000-000000000e01', 2, 'rpe', 7, null, %L, '019f5200-0000-7000-8000-000000000c19')$$, repeat('x', 501)))
  ],
  array['22023 ["value"]', '22023 ["value"]', '22023 ["value"]', '22023 ["value"]', '22023 ["unit"]',
        '22023 ["unit"]', '22023 ["unit"]', '22023 ["field"]', '22023 ["set_order", "reason"]', '22023 ["reason"]'],
  'T-EXE-PROPOSAL-API-11 a proposal names a field, a value that field can hold, its unit only for a load, and a reason');
reset role;
select is(
  (select count(*)::integer from execution.correction_proposals where id = '019f5200-0000-7000-8000-000000000c19'),
  0, 'T-EXE-PROPOSAL-API-12 and none of them left anything behind');

reset role;
update identity.people set contact_email = null where id = '019f5200-0000-7000-8000-000000000001';
set local role allfit_api;
select pg_temp.act('019f5200-0000-7000-8000-000000000012');
select is(
  pg_temp.failure($$select * from pg_temp.propose('019f5200-0000-7000-8000-000000000012', '019f5200-0000-7000-8000-000000000001',
    '019f5200-0000-7000-8000-000000000e01', 2, 'load', 72.5, 'kg', 'Sin correo.', '019f5200-0000-7000-8000-000000000c20')$$),
  'P0004',
  'T-EXE-PROPOSAL-API-13 a proposal she cannot be told about is not made');
reset role;
update identity.people set contact_email = 'ana@example.test' where id = '019f5200-0000-7000-8000-000000000001';

delete from organizations.role_capabilities where role_code = 'coach' and capability_code = 'propose_corrections';
set local role allfit_api;
select pg_temp.act('019f5200-0000-7000-8000-000000000012');
select is(
  pg_temp.failure($$select * from pg_temp.propose('019f5200-0000-7000-8000-000000000012', '019f5200-0000-7000-8000-000000000001',
    '019f5200-0000-7000-8000-000000000e01', 2, 'load', 72.5, 'kg', 'Sin capacidad.', '019f5200-0000-7000-8000-000000000c21')$$),
  '42501', 'T-EXE-PROPOSAL-API-14 a role without propose_corrections proposes nothing');
reset role;
insert into organizations.role_capabilities (role_code, capability_code) values ('coach', 'propose_corrections');

select expires_at as c01_expires from execution.correction_proposals
where id = '019f5200-0000-7000-8000-000000000c01' \gset

-- ---------------------------------------------------------------------------
-- OP-EXE-020: what each side sees
-- ---------------------------------------------------------------------------
set local role allfit_api;
select pg_temp.act('019f5200-0000-7000-8000-000000000012');
select is(
  (select array_agg((proposal->>'id')::uuid) from execution.list_proposed_corrections(
    '019f5200-0000-7000-8000-000000000012', '019f5200-0000-7000-8000-000000000101', null, 20, null, null)),
  array['019f5200-0000-7000-8000-000000000c01', '019f5200-0000-7000-8000-000000000c02',
        '019f5200-0000-7000-8000-000000000c05']::uuid[],
  'T-EXE-PROPOSAL-LIST-01 Studio lists what he proposed in this gym, soonest to expire first');
select is(
  (select bool_and(not (proposal ? 'current') and proposal->'client'->>'name' = 'Ana Client')
   from execution.list_proposed_corrections(
    '019f5200-0000-7000-8000-000000000012', '019f5200-0000-7000-8000-000000000101', null, 20, null, null)),
  true,
  'T-EXE-PROPOSAL-LIST-02 with whom, and never her value');
select is(
  (select array_agg((proposal->>'id')::uuid) from execution.list_proposed_corrections(
    '019f5200-0000-7000-8000-000000000012', '019f5200-0000-7000-8000-000000000101', null, 1,
    :'c01_expires'::timestamptz,
    '019f5200-0000-7000-8000-000000000c01')),
  array['019f5200-0000-7000-8000-000000000c02']::uuid[],
  'T-EXE-PROPOSAL-LIST-03 the cursor continues after the last one seen');
select is(
  (select count(*)::integer from execution.list_proposed_corrections(
    '019f5200-0000-7000-8000-000000000012', '019f5200-0000-7000-8000-000000000101', 'accepted', 20, null, null)),
  0,
  'T-EXE-PROPOSAL-LIST-04 a status narrows it');
select pg_temp.act('019f5200-0000-7000-8000-000000000013');
select is(
  (select array_agg((proposal->>'id')::uuid) from execution.list_proposed_corrections(
    '019f5200-0000-7000-8000-000000000013', '019f5200-0000-7000-8000-000000000101', null, 20, null, null)),
  array['019f5200-0000-7000-8000-000000000c04']::uuid[],
  'T-EXE-PROPOSAL-LIST-05 each professional sees his own, not a colleague''s');
select pg_temp.act('019f5200-0000-7000-8000-000000000015');
select is(
  (select count(*)::integer from execution.list_proposed_corrections(
    '019f5200-0000-7000-8000-000000000015', '019f5200-0000-7000-8000-000000000101', null, 20, null, null)),
  0,
  'T-EXE-PROPOSAL-LIST-06 one who proposed nothing sees nothing');
select pg_temp.act('019f5200-0000-7000-8000-000000000001');
select is(
  pg_temp.failure($$select * from execution.list_proposed_corrections(
    '019f5200-0000-7000-8000-000000000001', '019f5200-0000-7000-8000-000000000101', null, 20, null, null)$$),
  '42501',
  'T-EXE-PROPOSAL-LIST-07 somebody outside the gym lists nothing in it');

select is(
  (select array_agg((proposal->>'id')::uuid) from execution.list_my_correction_proposals(
    '019f5200-0000-7000-8000-000000000001', null, 20, null, null)),
  array['019f5200-0000-7000-8000-000000000c01', '019f5200-0000-7000-8000-000000000c02',
        '019f5200-0000-7000-8000-000000000c04', '019f5200-0000-7000-8000-000000000c05']::uuid[],
  'T-EXE-PROPOSAL-LIST-08 Space lists every proposal made to her, soonest to expire first');
select is(
  (select proposal - 'created_at' - 'expires_at' from execution.list_my_correction_proposals(
    '019f5200-0000-7000-8000-000000000001', null, 1, null, null)),
  '{"id": "019f5200-0000-7000-8000-000000000c01",
    "execution_id": "019f5200-0000-7000-8000-000000000e01", "set_order": 1,
    "movement_id": null, "movement_name": null, "field": "load",
    "current": {"value": 60, "unit": "kg"}, "proposed": {"value": 62.5, "unit": "kg"},
    "reason": "La barra pesaba 2,5 kg más.", "status": "pending", "cancel_reason": null,
    "settled_at": null, "proposer_name": "Camilo Coach", "organization_name": "Gym A"}'::jsonb,
  'T-EXE-PROPOSAL-LIST-09 she sees what she had, what he proposes, why, who and from where');
select pg_temp.act('019f5200-0000-7000-8000-000000000002');
select is(
  (select count(*)::integer from execution.list_my_correction_proposals(
    '019f5200-0000-7000-8000-000000000002', null, 20, null, null)),
  0,
  'T-EXE-PROPOSAL-LIST-10 another person sees none of hers');
select is(
  pg_temp.failure($$select * from execution.list_my_correction_proposals(
    '019f5200-0000-7000-8000-000000000001', null, 20, null, null)$$),
  '42501',
  'T-EXE-PROPOSAL-LIST-11 nor asks as her');
reset role;

-- ---------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------
set local role allfit_owner;
select pg_temp.act('019f5200-0000-7000-8000-000000000001');
select is((select count(*)::integer from execution.correction_proposals), 4,
  'T-EXE-PROPOSAL-RLS-01 correction_proposals_select_self: she sees every proposal made to her');
select pg_temp.act('019f5200-0000-7000-8000-000000000002');
select is((select count(*)::integer from execution.correction_proposals), 0,
  'T-EXE-PROPOSAL-RLS-02 and another person sees none of them');
select pg_temp.member('019f5200-0000-7000-8000-000000000012', '019f5200-0000-7000-8000-000000000212');
select is((select count(*)::integer from execution.correction_proposals), 3,
  'T-EXE-PROPOSAL-RLS-03 correction_proposals_select_proposer: a professional sees what he proposed');
select pg_temp.member('019f5200-0000-7000-8000-000000000012', '019f5200-0000-7000-8000-000000000213');
select is((select count(*)::integer from execution.correction_proposals), 0,
  'T-EXE-PROPOSAL-RLS-04 and not by naming a colleague''s membership');

select pg_temp.member('019f5200-0000-7000-8000-000000000012', '019f5200-0000-7000-8000-000000000212');
select is(
  pg_temp.failure($$insert into execution.correction_proposals (
      id, person_id, relationship_id, organization_id, proposer_assignment_id, proposer_membership_id,
      executed_session_id, target_strength_set_id, set_order, target_field, current_value,
      current_unit_code, proposed_value, proposed_unit_code, reason, expires_at, created_at)
    values ('019f5200-0000-7000-8000-000000000c30', '019f5200-0000-7000-8000-000000000002',
      '019f5200-0000-7000-8000-000000000702', '019f5200-0000-7000-8000-000000000101',
      '019f5200-0000-7000-8000-000000000802', '019f5200-0000-7000-8000-000000000212',
      '019f5200-0000-7000-8000-000000000e07', '019f5200-0000-7000-8000-000000000f71', 1, 'load', 60, 'kg',
      62.5, 'kg', 'Directo.', now() + interval '30 days', now())$$),
  '42501',
  'T-EXE-PROPOSAL-RLS-05 correction_proposals_insert_contribute: not even directly with a read-only grant');
select is(
  pg_temp.failure($$insert into execution.correction_proposals (
      id, person_id, relationship_id, organization_id, proposer_assignment_id, proposer_membership_id,
      executed_session_id, target_strength_set_id, set_order, target_field, current_value,
      current_unit_code, proposed_value, proposed_unit_code, reason, expires_at, created_at)
    values ('019f5200-0000-7000-8000-000000000c31', '019f5200-0000-7000-8000-000000000001',
      '019f5200-0000-7000-8000-000000000701', '019f5200-0000-7000-8000-000000000101',
      '019f5200-0000-7000-8000-000000000805', '019f5200-0000-7000-8000-000000000213',
      '019f5200-0000-7000-8000-000000000e01', '019f5200-0000-7000-8000-000000000f12', 2, 'load', 70, 'kg',
      72.5, 'kg', 'Como Diana.', now() + interval '30 days', now())$$),
  '42501',
  'T-EXE-PROPOSAL-RLS-06 nor signed as another professional');
-- IX-20 reads the set as he does: through the screening of her relationship.
select access_control.open_contract_scope('session_screening', '019f5200-0000-7000-8000-000000000701');
select is(
  pg_temp.failure($$insert into execution.correction_proposals (
      id, person_id, relationship_id, organization_id, proposer_assignment_id, proposer_membership_id,
      executed_session_id, target_strength_set_id, set_order, target_field, current_value,
      current_unit_code, proposed_value, proposed_unit_code, reason, expires_at, created_at)
    values ('019f5200-0000-7000-8000-000000000c32', '019f5200-0000-7000-8000-000000000001',
      '019f5200-0000-7000-8000-000000000701', '019f5200-0000-7000-8000-000000000101',
      '019f5200-0000-7000-8000-000000000801', '019f5200-0000-7000-8000-000000000212',
      '019f5200-0000-7000-8000-000000000e01', '019f5200-0000-7000-8000-000000000f12', 2, 'load', 70, 'kg',
      72.5, 'kg', 'Propia.', now() + interval '30 days', now())$$),
  'no error',
  'T-EXE-PROPOSAL-RLS-07 while his own, under her training at contribute, is admitted');
with changed as (
  update execution.correction_proposals set status = 'rejected', settled_at = clock_timestamp()
  where id = '019f5200-0000-7000-8000-000000000c32'
  returning 1
)
select is((select count(*)::integer from changed), 0,
  'T-EXE-PROPOSAL-RLS-08 who proposed it does not decide it');

select pg_temp.act('019f5200-0000-7000-8000-000000000002');
with changed as (
  update execution.correction_proposals set status = 'rejected', settled_at = clock_timestamp()
  where id = '019f5200-0000-7000-8000-000000000c32'
  returning 1
)
select is((select count(*)::integer from changed), 0,
  'T-EXE-PROPOSAL-RLS-09 correction_proposals_update_self: nor does another person');
select pg_temp.act('019f5200-0000-7000-8000-000000000001');
select is(
  pg_temp.failure($$update execution.correction_proposals
    set status = 'cancelled', cancel_reason = 'target_changed', settled_at = clock_timestamp()
    where id = '019f5200-0000-7000-8000-000000000c32'$$),
  '42501',
  'T-EXE-PROPOSAL-RLS-10 she decides, but a cancellation is not hers to write');
with changed as (
  update execution.correction_proposals set status = 'rejected', settled_at = clock_timestamp()
  where id = '019f5200-0000-7000-8000-000000000c32'
  returning 1
)
select is((select count(*)::integer from changed), 1,
  'T-EXE-PROPOSAL-RLS-11 while a decision on one made to her is hers');
reset role;

-- ---------------------------------------------------------------------------
-- What the schema keeps
-- ---------------------------------------------------------------------------
select is(
  array[
    pg_temp.failure($$update execution.correction_proposals set proposed_value = 70
      where id = '019f5200-0000-7000-8000-000000000c01'$$),
    pg_temp.failure($$update execution.correction_proposals set status = 'pending', settled_at = null
      where id = '019f5200-0000-7000-8000-000000000c32'$$)
  ],
  array['23514', '23514'],
  'T-EXE-PROPOSAL-INT-04 a proposal keeps what it proposed, and a settled one is never pending again');
select is(
  array[
    pg_temp.failure($$insert into execution.correction_proposals (
        id, person_id, relationship_id, organization_id, proposer_assignment_id, proposer_membership_id,
        executed_session_id, target_strength_set_id, set_order, target_field, current_value,
        current_unit_code, proposed_value, proposed_unit_code, reason, expires_at, created_at)
      values ('019f5200-0000-7000-8000-000000000c33', '019f5200-0000-7000-8000-000000000001',
        '019f5200-0000-7000-8000-000000000701', '019f5200-0000-7000-8000-000000000101',
        '019f5200-0000-7000-8000-000000000801', '019f5200-0000-7000-8000-000000000212',
        '019f5200-0000-7000-8000-000000000e01', '019f5200-0000-7000-8000-000000000f71', 1, 'load', 60, 'kg',
        62.5, 'kg', 'Serie de Bruno.', now() + interval '30 days', now())$$),
    pg_temp.failure($$insert into execution.correction_proposals (
        id, person_id, relationship_id, organization_id, proposer_assignment_id, proposer_membership_id,
        executed_session_id, target_strength_set_id, set_order, target_field, current_value,
        current_unit_code, proposed_value, proposed_unit_code, reason, expires_at, created_at)
      values ('019f5200-0000-7000-8000-000000000c34', '019f5200-0000-7000-8000-000000000001',
        '019f5200-0000-7000-8000-000000000701', '019f5200-0000-7000-8000-000000000101',
        '019f5200-0000-7000-8000-000000000801', '019f5200-0000-7000-8000-000000000212',
        '019f5200-0000-7000-8000-000000000e01', '019f5200-0000-7000-8000-000000000f12', 2, 'load', 70, 'kg',
        72.5, 'cm', 'Longitud.', now() + interval '30 days', now())$$),
    pg_temp.failure($$insert into execution.correction_proposals (
        id, person_id, relationship_id, organization_id, proposer_assignment_id, proposer_membership_id,
        executed_session_id, target_strength_set_id, set_order, target_field, current_value,
        current_unit_code, proposed_value, proposed_unit_code, reason, expires_at, created_at)
      values ('019f5200-0000-7000-8000-000000000c35', '019f5200-0000-7000-8000-000000000001',
        '019f5200-0000-7000-8000-000000000701', '019f5200-0000-7000-8000-000000000101',
        '019f5200-0000-7000-8000-000000000801', '019f5200-0000-7000-8000-000000000212',
        '019f5200-0000-7000-8000-000000000e01', '019f5200-0000-7000-8000-000000000f12', 2, 'load', 65, 'kg',
        72.5, 'kg', 'No era eso.', now() + interval '30 days', now())$$)
  ],
  array['23514', '23514', '23514'],
  'T-EXE-PROPOSAL-INT-05 IX-20 the target is a set of that session of hers, a load is a mass, and what she had is what she declared');

-- While her service is paused the gym reads but does not write (HU-SP-083).
insert into payments.organization_plans (id, organization_id, name, status)
values ('019f5200-0000-7000-8000-000000000903', '019f5200-0000-7000-8000-000000000101', 'Mensual', 'published');
insert into payments.plan_versions (
  id, plan_id, organization_id, version_number, amount_minor, currency_code, billing_period
) values (
  '019f5200-0000-7000-8000-000000000904', '019f5200-0000-7000-8000-000000000903',
  '019f5200-0000-7000-8000-000000000101', 1, 12000000, 'COP', 'month'
);
insert into payments.plan_subscriptions (id, person_id, organization_id, plan_version_id)
values ('019f5200-0000-7000-8000-000000000901', '019f5200-0000-7000-8000-000000000001',
  '019f5200-0000-7000-8000-000000000101', '019f5200-0000-7000-8000-000000000904');
insert into planning.service_access_blocks (
  id, person_id, organization_id, relationship_id, subscription_id, source_kind,
  blocks_future_sessions, blocks_professional_contribution, created_by_kind, created_by_membership_id
) values (
  '019f5200-0000-7000-8000-000000000902', '019f5200-0000-7000-8000-000000000001',
  '019f5200-0000-7000-8000-000000000101', '019f5200-0000-7000-8000-000000000701',
  '019f5200-0000-7000-8000-000000000901', 'subscription_suspension', true, true, 'person',
  '019f5200-0000-7000-8000-000000000211'
);
set local role allfit_api;
select pg_temp.act('019f5200-0000-7000-8000-000000000012');
select is(
  pg_temp.failure($$select * from pg_temp.propose('019f5200-0000-7000-8000-000000000012', '019f5200-0000-7000-8000-000000000001',
    '019f5200-0000-7000-8000-000000000e01', 2, 'load', 72.5, 'kg', 'En pausa.', '019f5200-0000-7000-8000-000000000c22')$$),
  'AF424', 'T-EXE-PROPOSAL-API-15 while her service is paused nobody proposes on her training');
reset role;

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------
select ok(
  has_function_privilege('allfit_api', 'execution.propose_correction(uuid, uuid, uuid, uuid, integer, text, numeric, text, text, uuid, uuid, bytea)', 'execute')
  and has_function_privilege('allfit_api', 'execution.decide_correction_proposal(uuid, uuid, text, uuid, uuid, bytea)', 'execute')
  and has_function_privilege('allfit_api', 'execution.list_proposed_corrections(uuid, uuid, text, integer, timestamptz, uuid)', 'execute')
  and has_function_privilege('allfit_api', 'execution.list_my_correction_proposals(uuid, text, integer, timestamptz, uuid)', 'execute')
  and has_function_privilege('allfit_api', 'execution.expire_correction_proposals(integer)', 'execute'),
  'T-EXE-PROPOSAL-API-16 the runtime runs the commands, the lists and the sweep');
select ok(
  not has_function_privilege('public', 'execution.propose_correction(uuid, uuid, uuid, uuid, integer, text, numeric, text, text, uuid, uuid, bytea)', 'execute')
  and not has_function_privilege('public', 'execution.decide_correction_proposal(uuid, uuid, text, uuid, uuid, bytea)', 'execute')
  and not has_function_privilege('allfit_api', 'execution.cancel_relationship_correction_proposals(uuid, timestamptz)', 'execute'),
  'T-EXE-PROPOSAL-API-17 nobody else does, and only closing a relationship cancels its proposals');
select ok(
  not has_table_privilege('allfit_api', 'execution.correction_proposals', 'select')
  and not has_table_privilege('allfit_api', 'execution.correction_proposals', 'insert')
  and not has_table_privilege('allfit_api', 'execution.correction_proposals', 'update')
  and not has_table_privilege('allfit_api', 'execution.strength_sets', 'update'),
  'T-EXE-PROPOSAL-API-18 T-PROP-4 nothing touches a proposal or a result directly: no destructive patch by any path');

select * from finish();
rollback;
