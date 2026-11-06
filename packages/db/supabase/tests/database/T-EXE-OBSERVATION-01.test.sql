-- T-EXE-OBSERVATION-01 — OP-EXE-010 and OP-EXE-011 (HU-STUDIO-057, HU-STUDIO-058),
-- T-OBS-1..5, T-REV-1, and the observations OP-EXE-018 now carries.
--
-- The coach who attends a person leaves his reading of a session, beside hers:
--
--   · Only with her training shared at `contribute`; reading it is not enough (T-OBS-1).
--   · Only on a session of this relationship, the gym's own programme: what she trained
--     on her own is read-only for every gym (ADR-016, `prior_training_history`).
--   · Pain or a limitation is health context: it needs `health_context` at `contribute`
--     to be written and that category to be read, whatever the session's own category.
--   · It never replaces what she declared (T-OBS-4); a transcription of what she said
--     stays hers, and he is only who captured it (T-OBS-3).
--   · Only its author corrects it, while he still attends her; the original and the
--     reason stay, and nobody rewrites them (T-OBS-2, T-REV-1). Termination ends it (T-OBS-5).
--
-- Written before the migration and watched failing.
begin;

select plan(62);

insert into identity.people (id, given_name, family_name, status)
values
  ('019f5000-0000-7000-8000-000000000001', 'Ana', 'Client', 'active'),
  ('019f5000-0000-7000-8000-000000000002', 'Bruno', 'Client', 'active'),
  ('019f5000-0000-7000-8000-000000000011', 'Olivia', 'Owner', 'active'),
  ('019f5000-0000-7000-8000-000000000012', 'Camilo', 'Coach', 'active'),
  ('019f5000-0000-7000-8000-000000000013', 'Diana', 'Cover', 'active'),
  ('019f5000-0000-7000-8000-000000000015', 'Fabio', 'Unassigned', 'active'),
  ('019f5000-0000-7000-8000-000000000016', 'Gina', 'Admin', 'active');

insert into organizations.organizations (id, type_code, display_name, responsible_party)
values ('019f5000-0000-7000-8000-000000000101', 'gym', 'Gym A',
  '{"party_kind":"legal_entity","party_name":"Gym A SAS","purpose":"studio_operations"}');

insert into organizations.organization_memberships (id, organization_id, person_id, status)
values
  ('019f5000-0000-7000-8000-000000000211', '019f5000-0000-7000-8000-000000000101', '019f5000-0000-7000-8000-000000000011', 'active'),
  ('019f5000-0000-7000-8000-000000000212', '019f5000-0000-7000-8000-000000000101', '019f5000-0000-7000-8000-000000000012', 'active'),
  ('019f5000-0000-7000-8000-000000000213', '019f5000-0000-7000-8000-000000000101', '019f5000-0000-7000-8000-000000000013', 'active'),
  ('019f5000-0000-7000-8000-000000000215', '019f5000-0000-7000-8000-000000000101', '019f5000-0000-7000-8000-000000000015', 'active'),
  ('019f5000-0000-7000-8000-000000000216', '019f5000-0000-7000-8000-000000000101', '019f5000-0000-7000-8000-000000000016', 'active');

insert into organizations.membership_roles (membership_id, role_code)
values
  ('019f5000-0000-7000-8000-000000000211', 'owner'),
  ('019f5000-0000-7000-8000-000000000212', 'coach'),
  ('019f5000-0000-7000-8000-000000000213', 'coach'),
  ('019f5000-0000-7000-8000-000000000215', 'coach'),
  ('019f5000-0000-7000-8000-000000000216', 'admin');

insert into relationships.service_relationships (id, person_id, organization_id, status, started_at)
values
  ('019f5000-0000-7000-8000-000000000701', '019f5000-0000-7000-8000-000000000001', '019f5000-0000-7000-8000-000000000101', 'active', clock_timestamp() - interval '30 days'),
  ('019f5000-0000-7000-8000-000000000702', '019f5000-0000-7000-8000-000000000002', '019f5000-0000-7000-8000-000000000101', 'active', clock_timestamp() - interval '30 days');

insert into relationships.relationship_professional_assignments (
  id, relationship_id, person_id, organization_id, membership_id, covers_membership_id,
  kind, status, ends_on, accepted_by_person_at
) values
  ('019f5000-0000-7000-8000-000000000801', '019f5000-0000-7000-8000-000000000701', '019f5000-0000-7000-8000-000000000001',
   '019f5000-0000-7000-8000-000000000101', '019f5000-0000-7000-8000-000000000212', null, 'holder', 'active', null, null),
  ('019f5000-0000-7000-8000-000000000802', '019f5000-0000-7000-8000-000000000702', '019f5000-0000-7000-8000-000000000002',
   '019f5000-0000-7000-8000-000000000101', '019f5000-0000-7000-8000-000000000212', null, 'holder', 'active', null, null),
  ('019f5000-0000-7000-8000-000000000805', '019f5000-0000-7000-8000-000000000701', '019f5000-0000-7000-8000-000000000001',
   '019f5000-0000-7000-8000-000000000101', '019f5000-0000-7000-8000-000000000213', '019f5000-0000-7000-8000-000000000212',
   'substitute', 'active', (clock_timestamp() + interval '10 days')::date, clock_timestamp());

-- IX-06: offering contribute needs a version that admits it, as the V1 rules now do.
insert into privacy.scope_definitions (id, scope_code, version_number, status, published_at)
values
  ('019f5000-0000-7000-8000-000000000301', 'relationship_training', 4, 'draft', null),
  ('019f5000-0000-7000-8000-000000000302', 'prior_training_history', 2, 'published', clock_timestamp()),
  ('019f5000-0000-7000-8000-000000000303', 'health_context', 3, 'draft', null);
insert into privacy.scope_resource_rules (
  scope_definition_id, resource, field, data_classification_code, max_action
) values
  ('019f5000-0000-7000-8000-000000000301', 'execution.professional_observations', '*', 'training', 'contribute'),
  ('019f5000-0000-7000-8000-000000000303', 'execution.professional_observations', '*', 'health', 'contribute');
update privacy.scope_definitions set status = 'published', published_at = clock_timestamp()
where id in ('019f5000-0000-7000-8000-000000000301', '019f5000-0000-7000-8000-000000000303');

insert into identity.invitations (
  id, organization_id, issued_by_membership_id, channel, contact,
  token_hash, token_key_version, proposal_hash, responsible_party, status, expires_at
) values (
  '019f5000-0000-7000-8000-000000000401', '019f5000-0000-7000-8000-000000000101',
  '019f5000-0000-7000-8000-000000000211', 'email', 'ana@example.test',
  extensions.digest('observation-token', 'sha256'), 1, extensions.digest('observation-proposal', 'sha256'),
  '{"party_kind":"legal_entity","party_name":"Gym A SAS","purpose":"studio_operations"}',
  'completed', clock_timestamp() + interval '7 days'
);
insert into identity.invitation_intents (id, invitation_id, kind, status, proposed_role_code)
values ('019f5000-0000-7000-8000-000000000501', '019f5000-0000-7000-8000-000000000401',
  'service_relationship', 'pending', null);
insert into privacy.invitation_scope_options (
  id, invitation_intent_id, scope_definition_id, scope_code,
  offered_access_level, purpose, presented_snapshot, decision, decided_at
) values
  ('019f5000-0000-7000-8000-000000000601', '019f5000-0000-7000-8000-000000000501',
   '019f5000-0000-7000-8000-000000000301', 'relationship_training', 'contribute',
   'Follow the training', '{"title":"Training"}'::jsonb, 'accepted', clock_timestamp()),
  ('019f5000-0000-7000-8000-000000000602', '019f5000-0000-7000-8000-000000000501',
   '019f5000-0000-7000-8000-000000000302', 'prior_training_history', 'read',
   'Know the history', '{"title":"History"}'::jsonb, 'accepted', clock_timestamp()),
  ('019f5000-0000-7000-8000-000000000603', '019f5000-0000-7000-8000-000000000501',
   '019f5000-0000-7000-8000-000000000303', 'health_context', 'contribute',
   'Train around pain', '{"title":"Health"}'::jsonb, 'accepted', clock_timestamp());

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

-- Ana lets Gym A contribute to her training, read her history and read her health.
-- Bruno lets it only read his training.
select pg_temp.share('019f5000-0000-7000-8000-000000000701', '019f5000-0000-7000-8000-000000000a01', 'relationship_training', 'contribute');
select pg_temp.share('019f5000-0000-7000-8000-000000000701', '019f5000-0000-7000-8000-000000000a02', 'prior_training_history', 'read');
select pg_temp.share('019f5000-0000-7000-8000-000000000701', '019f5000-0000-7000-8000-000000000a03', 'health_context', 'read');
select pg_temp.share('019f5000-0000-7000-8000-000000000702', '019f5000-0000-7000-8000-000000000a05', 'relationship_training', 'read');

create function pg_temp.trained(id uuid, person uuid, days integer, context uuid)
returns void language sql as $$
  insert into execution.executed_sessions (
    id, person_id, activity_type_id, result_contract_id, contract_version, is_autonomous,
    context_relationship_id, context_organization_id, started_at, ended_at, timezone,
    execution_status, validation_status, requested_level, achieved_level, capture_source
  ) values (
    id, person, '019c0000-0000-7000-8000-000000000011', '019c0000-0000-7000-8000-000000000031', 1,
    context is null, context, case when context is null then null else '019f5000-0000-7000-8000-000000000101'::uuid end,
    clock_timestamp() - make_interval(days => days), clock_timestamp() - make_interval(days => days) + interval '1 hour',
    'America/Bogota', 'completed', 'valid', 'detailed', 'detailed', 'manual'
  )
$$;

-- S1 inside the relationship; S2 on her own; S3 inside but annulled; S5 inside, still
-- open. S4 is Bruno's, inside his.
select pg_temp.trained('019f5000-0000-7000-8000-000000000e01', '019f5000-0000-7000-8000-000000000001', 2, '019f5000-0000-7000-8000-000000000701');
select pg_temp.trained('019f5000-0000-7000-8000-000000000e02', '019f5000-0000-7000-8000-000000000001', 3, null);
select pg_temp.trained('019f5000-0000-7000-8000-000000000e03', '019f5000-0000-7000-8000-000000000001', 4, '019f5000-0000-7000-8000-000000000701');
select pg_temp.trained('019f5000-0000-7000-8000-000000000e04', '019f5000-0000-7000-8000-000000000002', 2, '019f5000-0000-7000-8000-000000000702');
select pg_temp.trained('019f5000-0000-7000-8000-000000000e05', '019f5000-0000-7000-8000-000000000001', 1, '019f5000-0000-7000-8000-000000000701');
update execution.executed_sessions
set validation_status = 'annulled', annulled_at = clock_timestamp(), annulment_reason = 'duplicate'
where id = '019f5000-0000-7000-8000-000000000e03';
update execution.executed_sessions set execution_status = 'in_progress', ended_at = null
where id = '019f5000-0000-7000-8000-000000000e05';

insert into execution.strength_sets (executed_session_id, set_order, achieved_reps, load_value, load_unit_code, rpe)
values ('019f5000-0000-7000-8000-000000000e01', 1, 8, 60, 'kg', 8);

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
  perform set_config('app.actor_org_id', '019f5000-0000-7000-8000-000000000101', true);
  perform set_config('app.actor_membership_id', membership::text, true);
end
$$;

-- The SQLSTATE, and the detail when it names something: the scope a refusal lacks.
create function pg_temp.failure(statement text) returns text language plpgsql as $$
declare
  state text;
  detail text;
begin
  execute statement;
  return 'no error';
exception when others then
  get stacked diagnostics state = returned_sqlstate, detail = pg_exception_detail;
  return state || coalesce(' ' || nullif(detail, ''), '');
end
$$;

create function pg_temp.observe(actor uuid, subject uuid, session uuid, category text, provenance text,
  content text, command uuid, key uuid default gen_random_uuid(), hash bytea default null)
returns table (result jsonb, replayed boolean) language sql as $$
  select * from execution.record_observation(
    actor, '019f5000-0000-7000-8000-000000000101', subject, session, category, provenance, content,
    key, command, coalesce(hash, extensions.digest(command::text || content, 'sha256')))
$$;

create function pg_temp.revise(actor uuid, observation uuid, expected integer, content text, reason text,
  command uuid, key uuid default gen_random_uuid())
returns table (result jsonb, replayed boolean) language sql as $$
  select * from execution.revise_observation(
    actor, '019f5000-0000-7000-8000-000000000101', observation, expected, content, reason,
    key, command, extensions.digest(command::text || content || reason, 'sha256'))
$$;

-- ---------------------------------------------------------------------------
-- OP-EXE-010: leaving an observation
-- ---------------------------------------------------------------------------
set local role allfit_api;
select pg_temp.act('019f5000-0000-7000-8000-000000000012');
select result as first, replayed as first_replayed from pg_temp.observe(
  '019f5000-0000-7000-8000-000000000012', '019f5000-0000-7000-8000-000000000001',
  '019f5000-0000-7000-8000-000000000e01', 'training', 'professional_observation',
  'Bajó la técnica en la última serie.', '019f5000-0000-7000-8000-000000000c01',
  'a1000000-0000-4000-8000-000000000001') \gset
select is(
  :'first'::jsonb - 'created_at',
  '{"id": "019f5000-0000-7000-8000-000000000c01", "execution_id": "019f5000-0000-7000-8000-000000000e01",
    "category": "training", "provenance": "professional_observation",
    "content": "Bajó la técnica en la última serie.", "revision_number": 1, "revised_at": null,
    "author_name": "Camilo Coach", "authored_by_me": true}'::jsonb,
  'T-EXE-OBSERVATION-API-01 the holder leaves his reading of a session of the relationship');
select is(:'first_replayed'::boolean, false, 'T-EXE-OBSERVATION-IDEM-01 the first time it is not a replay');
reset role;
select results_eq(
  $$select relationship_id, author_assignment_id, author_membership_id, person_id
    from execution.professional_observations where id = '019f5000-0000-7000-8000-000000000c01'$$,
  $$values ('019f5000-0000-7000-8000-000000000701'::uuid, '019f5000-0000-7000-8000-000000000801'::uuid,
            '019f5000-0000-7000-8000-000000000212'::uuid, '019f5000-0000-7000-8000-000000000001'::uuid)$$,
  'T-EXE-OBSERVATION-INT-01 it is signed by his own assignment on that relationship and belongs to her');
select results_eq(
  $$select achieved_reps, load_value, rpe from execution.strength_sets
    where executed_session_id = '019f5000-0000-7000-8000-000000000e01'$$,
  $$values (8, 60::numeric, 8::numeric)$$,
  'T-EXE-OBSERVATION-INT-02 T-OBS-4 what she declared is untouched: the observation sits beside it');
select results_eq(
  $$select event_type, payload ? 'content' from system.outbox_events
    where aggregate_id = '019f5000-0000-7000-8000-000000000c01'$$,
  $$values ('execution.observation_created.v1', false)$$,
  'T-EXE-OBSERVATION-INT-03 the event names what happened and carries none of it');
set local role allfit_api;

select pg_temp.act('019f5000-0000-7000-8000-000000000012');
select is(
  (select replayed from pg_temp.observe(
    '019f5000-0000-7000-8000-000000000012', '019f5000-0000-7000-8000-000000000001',
    '019f5000-0000-7000-8000-000000000e01', 'training', 'professional_observation',
    'Bajó la técnica en la última serie.', '019f5000-0000-7000-8000-000000000c01',
    'a1000000-0000-4000-8000-000000000001')),
  true,
  'T-EXE-OBSERVATION-IDEM-02 the same command again is a replay');
select is(
  pg_temp.failure($$select * from pg_temp.observe(
    '019f5000-0000-7000-8000-000000000012', '019f5000-0000-7000-8000-000000000001',
    '019f5000-0000-7000-8000-000000000e01', 'training', 'professional_observation',
    'Otra cosa.', '019f5000-0000-7000-8000-000000000c01', 'a1000000-0000-4000-8000-000000000001')$$),
  '23505',
  'T-EXE-OBSERVATION-IDEM-03 the same key for a different request is refused');
reset role;
select is(
  (select count(*)::integer from execution.professional_observations where id = '019f5000-0000-7000-8000-000000000c01')
  + (select count(*)::integer from system.outbox_events where aggregate_id = '019f5000-0000-7000-8000-000000000c01'),
  2,
  'T-EXE-OBSERVATION-IDEM-04 and nothing was written twice');
set local role allfit_api;

-- T-OBS-3: what she told him stays hers.
select pg_temp.act('019f5000-0000-7000-8000-000000000012');
select is(
  (select result->>'provenance' from pg_temp.observe(
    '019f5000-0000-7000-8000-000000000012', '019f5000-0000-7000-8000-000000000001',
    '019f5000-0000-7000-8000-000000000e01', 'training', 'person_declared',
    'Dice que durmió cuatro horas.', '019f5000-0000-7000-8000-000000000c02')),
  'person_declared',
  'T-EXE-OBSERVATION-API-02 T-OBS-3 a transcription of what she said stays declared by her');
reset role;
select is(
  (select author_membership_id::text from execution.professional_observations where id = '019f5000-0000-7000-8000-000000000c02'),
  '019f5000-0000-7000-8000-000000000212',
  'T-EXE-OBSERVATION-INT-04 and he is recorded only as who captured it');
set local role allfit_api;

select pg_temp.act('019f5000-0000-7000-8000-000000000013');
select is(
  (select result->>'author_name' from pg_temp.observe(
    '019f5000-0000-7000-8000-000000000013', '019f5000-0000-7000-8000-000000000001',
    '019f5000-0000-7000-8000-000000000e01', 'training', 'professional_observation',
    'Cubro esta semana: buen ritmo.', '019f5000-0000-7000-8000-000000000c03')),
  'Diana Cover',
  'T-EXE-OBSERVATION-API-03 a cover she accepted leaves one too, under his own name');

-- ---------------------------------------------------------------------------
-- What is refused
-- ---------------------------------------------------------------------------
select pg_temp.act('019f5000-0000-7000-8000-000000000012');
select is(
  pg_temp.failure($$select * from pg_temp.observe(
    '019f5000-0000-7000-8000-000000000012', '019f5000-0000-7000-8000-000000000002',
    '019f5000-0000-7000-8000-000000000e04', 'training', 'professional_observation',
    'Sin permiso.', '019f5000-0000-7000-8000-000000000c10')$$),
  'AF430 relationship_training:contribute',
  'T-EXE-OBSERVATION-API-04 T-OBS-1 reading his training is not enough to write on it');
select is(
  pg_temp.failure($$select * from pg_temp.observe(
    '019f5000-0000-7000-8000-000000000012', '019f5000-0000-7000-8000-000000000001',
    '019f5000-0000-7000-8000-000000000e01', 'health', 'professional_observation',
    'Molestia en la rodilla izquierda.', '019f5000-0000-7000-8000-000000000c11')$$),
  'AF430 health_context:contribute',
  'T-EXE-OBSERVATION-API-05 pain is health context: reading her health is not enough to write it');
select is(
  pg_temp.failure($$select * from pg_temp.observe(
    '019f5000-0000-7000-8000-000000000012', '019f5000-0000-7000-8000-000000000001',
    '019f5000-0000-7000-8000-000000000e02', 'training', 'professional_observation',
    'Lo que hizo sola.', '019f5000-0000-7000-8000-000000000c12')$$),
  '22023 ["execution"]',
  'T-EXE-OBSERVATION-API-06 a session she trained on her own is read, never written on');
select is(
  array[
    pg_temp.failure($$select * from pg_temp.observe('019f5000-0000-7000-8000-000000000012', '019f5000-0000-7000-8000-000000000001',
      '019f5000-0000-7000-8000-000000000e03', 'training', 'professional_observation', 'Anulada.', '019f5000-0000-7000-8000-000000000c13')$$),
    pg_temp.failure($$select * from pg_temp.observe('019f5000-0000-7000-8000-000000000012', '019f5000-0000-7000-8000-000000000001',
      '019f5000-0000-7000-8000-000000000e05', 'training', 'professional_observation', 'Abierta.', '019f5000-0000-7000-8000-000000000c14')$$),
    pg_temp.failure($$select * from pg_temp.observe('019f5000-0000-7000-8000-000000000012', '019f5000-0000-7000-8000-000000000001',
      '019f5000-0000-7000-8000-000000000e04', 'training', 'professional_observation', 'Ajena.', '019f5000-0000-7000-8000-000000000c15')$$),
    pg_temp.failure($$select * from pg_temp.observe('019f5000-0000-7000-8000-000000000012', '019f5000-0000-7000-8000-000000000001',
      '019f5000-0000-7000-8000-000000000e99', 'training', 'professional_observation', 'Ninguna.', '019f5000-0000-7000-8000-000000000c16')$$)
  ],
  array['P0002', 'P0002', 'P0002', 'P0002'],
  'T-EXE-OBSERVATION-API-07 an annulled session, an open one, another person''s and none at all are not found');
select is(
  array[
    pg_temp.failure($$select * from pg_temp.observe('019f5000-0000-7000-8000-000000000012', '019f5000-0000-7000-8000-000000000001',
      '019f5000-0000-7000-8000-000000000e01', 'training', 'professional_observation', '   ', '019f5000-0000-7000-8000-000000000c17')$$),
    pg_temp.failure($$select * from pg_temp.observe('019f5000-0000-7000-8000-000000000012', '019f5000-0000-7000-8000-000000000001',
      '019f5000-0000-7000-8000-000000000e01', 'training', 'professional_observation', repeat('x', 2001), '019f5000-0000-7000-8000-000000000c18')$$),
    pg_temp.failure($$select * from pg_temp.observe('019f5000-0000-7000-8000-000000000012', '019f5000-0000-7000-8000-000000000001',
      '019f5000-0000-7000-8000-000000000e01', 'mood', 'professional_observation', 'Feliz.', '019f5000-0000-7000-8000-000000000c19')$$),
    pg_temp.failure($$select * from pg_temp.observe('019f5000-0000-7000-8000-000000000012', '019f5000-0000-7000-8000-000000000001',
      '019f5000-0000-7000-8000-000000000e01', 'training', 'device_observed', 'Del reloj.', '019f5000-0000-7000-8000-000000000c20')$$)
  ],
  array['22023 ["content"]', '22023 ["content"]', '22023 ["category"]', '22023 ["provenance"]'],
  'T-EXE-OBSERVATION-API-08 blank or overlong text, an unknown category and a device origin are refused');

select pg_temp.act('019f5000-0000-7000-8000-000000000015');
select is(
  pg_temp.failure($$select * from pg_temp.observe('019f5000-0000-7000-8000-000000000015', '019f5000-0000-7000-8000-000000000001',
    '019f5000-0000-7000-8000-000000000e01', 'training', 'professional_observation', 'No la atiendo.', '019f5000-0000-7000-8000-000000000c21')$$),
  'P0002', 'T-EXE-OBSERVATION-API-09 a coach who does not attend her finds no such client');
select pg_temp.act('019f5000-0000-7000-8000-000000000016');
select is(
  pg_temp.failure($$select * from pg_temp.observe('019f5000-0000-7000-8000-000000000016', '019f5000-0000-7000-8000-000000000001',
    '019f5000-0000-7000-8000-000000000e01', 'training', 'professional_observation', 'Soy admin.', '019f5000-0000-7000-8000-000000000c22')$$),
  'P0002', 'T-EXE-OBSERVATION-API-10 nor an administrator');
reset role;

-- Without the capability, attending her is not enough.
delete from organizations.role_capabilities where role_code = 'coach' and capability_code = 'observe_training';
set local role allfit_api;
select pg_temp.act('019f5000-0000-7000-8000-000000000012');
select is(
  pg_temp.failure($$select * from pg_temp.observe('019f5000-0000-7000-8000-000000000012', '019f5000-0000-7000-8000-000000000001',
    '019f5000-0000-7000-8000-000000000e01', 'training', 'professional_observation', 'Sin capacidad.', '019f5000-0000-7000-8000-000000000c23')$$),
  '42501', 'T-EXE-OBSERVATION-API-11 a role without observe_training does not observe');
reset role;
insert into organizations.role_capabilities (role_code, capability_code) values ('coach', 'observe_training');

-- While her service is paused the gym reads but does not write (HU-SP-083).
insert into payments.organization_plans (id, organization_id, name, status)
values ('019f5000-0000-7000-8000-000000000903', '019f5000-0000-7000-8000-000000000101', 'Mensual', 'published');
insert into payments.plan_versions (
  id, plan_id, organization_id, version_number, amount_minor, currency_code, billing_period
) values (
  '019f5000-0000-7000-8000-000000000904', '019f5000-0000-7000-8000-000000000903',
  '019f5000-0000-7000-8000-000000000101', 1, 12000000, 'COP', 'month'
);
insert into payments.plan_subscriptions (id, person_id, organization_id, plan_version_id)
values ('019f5000-0000-7000-8000-000000000901', '019f5000-0000-7000-8000-000000000001',
  '019f5000-0000-7000-8000-000000000101', '019f5000-0000-7000-8000-000000000904');
insert into planning.service_access_blocks (
  id, person_id, organization_id, relationship_id, subscription_id, source_kind,
  blocks_future_sessions, blocks_professional_contribution, created_by_kind, created_by_membership_id
) values (
  '019f5000-0000-7000-8000-000000000902', '019f5000-0000-7000-8000-000000000001',
  '019f5000-0000-7000-8000-000000000101', '019f5000-0000-7000-8000-000000000701',
  '019f5000-0000-7000-8000-000000000901', 'subscription_suspension', true, true, 'person',
  '019f5000-0000-7000-8000-000000000211'
);
set local role allfit_api;
select pg_temp.act('019f5000-0000-7000-8000-000000000012');
select is(
  pg_temp.failure($$select * from pg_temp.observe('019f5000-0000-7000-8000-000000000012', '019f5000-0000-7000-8000-000000000001',
    '019f5000-0000-7000-8000-000000000e01', 'training', 'professional_observation', 'En pausa.', '019f5000-0000-7000-8000-000000000c24')$$),
  'AF424', 'T-EXE-OBSERVATION-API-12 while her service is paused nobody writes on her training');
reset role;
update planning.service_access_blocks set ended_at = clock_timestamp()
where id = '019f5000-0000-7000-8000-000000000902';

-- ---------------------------------------------------------------------------
-- Health context, once she lets the gym contribute to it
-- ---------------------------------------------------------------------------
update privacy.data_grants set status = 'revoked', revoked_at = clock_timestamp()
where id = '019f5000-0000-7000-8000-000000000a03';
select pg_temp.share('019f5000-0000-7000-8000-000000000701', '019f5000-0000-7000-8000-000000000a04', 'health_context', 'contribute');
set local role allfit_api;
select pg_temp.act('019f5000-0000-7000-8000-000000000012');
select is(
  (select result->>'category' from pg_temp.observe(
    '019f5000-0000-7000-8000-000000000012', '019f5000-0000-7000-8000-000000000001',
    '019f5000-0000-7000-8000-000000000e01', 'health', 'professional_observation',
    'Molestia en la rodilla izquierda.', '019f5000-0000-7000-8000-000000000c04')),
  'health',
  'T-EXE-OBSERVATION-API-13 with health shared at contribute, pain is written as health context');

-- ---------------------------------------------------------------------------
-- OP-EXE-018 carries them, each under its own category
-- ---------------------------------------------------------------------------
select current_setting('app.request_id') as with_health \gset
select execution.read_authorized_execution(
  '019f5000-0000-7000-8000-000000000012', '019f5000-0000-7000-8000-000000000101',
  '019f5000-0000-7000-8000-000000000001', '019f5000-0000-7000-8000-000000000e01') as detail \gset
select is(
  (select array_agg(item->>'id' || ':' || (item->>'category') || ':' || (item->>'authored_by_me')
     order by item->>'id')
   from jsonb_array_elements(:'detail'::jsonb #> '{execution,observations}') as item),
  array['019f5000-0000-7000-8000-000000000c01:training:true', '019f5000-0000-7000-8000-000000000c02:training:true',
        '019f5000-0000-7000-8000-000000000c03:training:false', '019f5000-0000-7000-8000-000000000c04:health:true'],
  'T-EXE-OBSERVATION-API-14 the session shows every observation of this relationship, and says which are his');
reset role;
select is(
  (select array_agg(scope_code || ':' || resource || ':' || result order by scope_code)
   from privacy.access_events where request_id = :'with_health'),
  array['health_context:execution.professional_observations:allowed',
        'relationship_training:execution.executed_sessions:allowed'],
  'T-EXE-OBSERVATION-API-15 reading the pain written there is recorded under her health, before it is shown');
update privacy.data_grants set status = 'revoked', revoked_at = clock_timestamp()
where id = '019f5000-0000-7000-8000-000000000a04';
set local role allfit_api;
select pg_temp.act('019f5000-0000-7000-8000-000000000012');
select current_setting('app.request_id') as without_health \gset
select is(
  (select array_agg(item->>'category' order by item->>'id')
   from jsonb_array_elements(execution.read_authorized_execution(
     '019f5000-0000-7000-8000-000000000012', '019f5000-0000-7000-8000-000000000101',
     '019f5000-0000-7000-8000-000000000001', '019f5000-0000-7000-8000-000000000e01') #> '{execution,observations}') as item),
  array['training', 'training', 'training'],
  'T-EXE-OBSERVATION-API-16 once she takes her health back, the pain written on her session is gone with it');
reset role;
select is(
  (select count(*)::integer from privacy.access_events where request_id = :'without_health' and scope_code = 'health_context'),
  0,
  'T-EXE-OBSERVATION-API-17 and nothing is recorded under a category that showed nothing');

-- ---------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------
set local role allfit_owner;
select pg_temp.act('019f5000-0000-7000-8000-000000000001');
select is(
  (select count(*)::integer from execution.professional_observations),
  4, 'T-EXE-OBSERVATION-RLS-01 professional_observations_select_self: she sees every observation about her');
select pg_temp.act('019f5000-0000-7000-8000-000000000002');
select is(
  (select count(*)::integer from execution.professional_observations),
  0, 'T-EXE-OBSERVATION-RLS-02 and another person sees none of them');

select pg_temp.member('019f5000-0000-7000-8000-000000000015', '019f5000-0000-7000-8000-000000000215');
select is(
  (select count(*)::integer from execution.professional_observations),
  0, 'T-EXE-OBSERVATION-RLS-03 professional_observations_select_screening: outside a screening a colleague sees none');
select pg_temp.member('019f5000-0000-7000-8000-000000000013', '019f5000-0000-7000-8000-000000000213');
select access_control.open_contract_scope('session_screening', '019f5000-0000-7000-8000-000000000701');
select is(
  (select count(*)::integer from execution.professional_observations),
  3, 'T-EXE-OBSERVATION-RLS-04 inside one for her relationship, the cover sees the training ones it may read');
select access_control.open_contract_scope('session_screening', '019f5000-0000-7000-8000-000000000702');
select is(
  (select count(*)::integer from execution.professional_observations where person_id = '019f5000-0000-7000-8000-000000000001'),
  0, 'T-EXE-OBSERVATION-RLS-05 a screening of another relationship shows none of hers');

-- Only inside a correction of his own does an author find what he wrote: outside one, his
-- reach is the screening's, so taking her health back hides his health notes from him too.
select pg_temp.member('019f5000-0000-7000-8000-000000000012', '019f5000-0000-7000-8000-000000000212');
select access_control.open_contract_scope('observation_revision', '019f5000-0000-7000-8000-000000000c04');
select is(
  (select array_agg(id) from execution.professional_observations),
  array['019f5000-0000-7000-8000-000000000c04'::uuid],
  'T-EXE-OBSERVATION-RLS-06 professional_observations_select_revision: inside one, its author finds that one observation');
select pg_temp.member('019f5000-0000-7000-8000-000000000013', '019f5000-0000-7000-8000-000000000213');
select access_control.open_contract_scope('observation_revision', '019f5000-0000-7000-8000-000000000c01');
select is(
  (select count(*)::integer from execution.professional_observations),
  0, 'T-EXE-OBSERVATION-RLS-07 another professional opening one finds nothing');

select pg_temp.member('019f5000-0000-7000-8000-000000000012', '019f5000-0000-7000-8000-000000000212');
select is(
  pg_temp.failure($$insert into execution.professional_observations (
      id, person_id, executed_session_id, relationship_id, organization_id, author_assignment_id,
      author_membership_id, data_classification_code, provenance, content)
    values ('019f5000-0000-7000-8000-000000000c30', '019f5000-0000-7000-8000-000000000002',
      '019f5000-0000-7000-8000-000000000e04', '019f5000-0000-7000-8000-000000000702',
      '019f5000-0000-7000-8000-000000000101', '019f5000-0000-7000-8000-000000000802',
      '019f5000-0000-7000-8000-000000000212', 'training', 'professional_observation', 'Directo.')$$),
  '42501',
  'T-EXE-OBSERVATION-RLS-08 professional_observations_insert_contribute: not even directly with a read-only grant');
select is(
  pg_temp.failure($$insert into execution.professional_observations (
      id, person_id, executed_session_id, relationship_id, organization_id, author_assignment_id,
      author_membership_id, data_classification_code, provenance, content)
    values ('019f5000-0000-7000-8000-000000000c31', '019f5000-0000-7000-8000-000000000001',
      '019f5000-0000-7000-8000-000000000e01', '019f5000-0000-7000-8000-000000000701',
      '019f5000-0000-7000-8000-000000000101', '019f5000-0000-7000-8000-000000000805',
      '019f5000-0000-7000-8000-000000000213', 'training', 'professional_observation', 'Como Diana.')$$),
  '42501',
  'T-EXE-OBSERVATION-RLS-09 nor signed as another professional');
select is(
  pg_temp.failure($$insert into execution.professional_observations (
      id, person_id, executed_session_id, relationship_id, organization_id, author_assignment_id,
      author_membership_id, data_classification_code, provenance, content)
    values ('019f5000-0000-7000-8000-000000000c32', '019f5000-0000-7000-8000-000000000001',
      '019f5000-0000-7000-8000-000000000e01', '019f5000-0000-7000-8000-000000000701',
      '019f5000-0000-7000-8000-000000000101', '019f5000-0000-7000-8000-000000000801',
      '019f5000-0000-7000-8000-000000000212', 'training', 'professional_observation', 'Propia.')$$),
  'no error',
  'T-EXE-OBSERVATION-RLS-10 while his own, under her training at contribute, is admitted');
select is(
  pg_temp.failure($$insert into execution.professional_observations (
      id, person_id, executed_session_id, relationship_id, organization_id, author_assignment_id,
      author_membership_id, data_classification_code, provenance, content)
    values ('019f5000-0000-7000-8000-000000000c33', '019f5000-0000-7000-8000-000000000001',
      '019f5000-0000-7000-8000-000000000e01', '019f5000-0000-7000-8000-000000000701',
      '019f5000-0000-7000-8000-000000000101', '019f5000-0000-7000-8000-000000000801',
      '019f5000-0000-7000-8000-000000000212', 'health', 'professional_observation', 'Rodilla.')$$),
  '42501',
  'T-EXE-OBSERVATION-RLS-11 and health context needs her health at contribute, whatever her training allows');
select is(
  pg_temp.failure($$insert into execution.professional_observations (
      id, person_id, executed_session_id, relationship_id, organization_id, author_assignment_id,
      author_membership_id, data_classification_code, provenance, content)
    values ('019f5000-0000-7000-8000-000000000c34', '019f5000-0000-7000-8000-000000000001',
      '019f5000-0000-7000-8000-000000000e02', '019f5000-0000-7000-8000-000000000701',
      '019f5000-0000-7000-8000-000000000101', '019f5000-0000-7000-8000-000000000801',
      '019f5000-0000-7000-8000-000000000212', 'training', 'professional_observation', 'Sola.')$$)
    like '23503 %"executed_sessions"%',
  true,
  'T-EXE-OBSERVATION-INT-05 the schema itself keeps an observation off a session she trained on her own');

select access_control.open_contract_scope('session_screening', '019f5000-0000-7000-8000-000000000701');
with changed as (
  update execution.professional_observations set content = 'Propia, corregida.',
    revision_number = revision_number + 1, revised_at = clock_timestamp()
  where id = '019f5000-0000-7000-8000-000000000c32'
  returning 1
)
select is((select count(*)::integer from changed), 1,
  'T-EXE-OBSERVATION-RLS-12 professional_observations_update_author: its author changes his own text');
select pg_temp.member('019f5000-0000-7000-8000-000000000013', '019f5000-0000-7000-8000-000000000213');
select access_control.open_contract_scope('session_screening', '019f5000-0000-7000-8000-000000000701');
with changed as (
  update execution.professional_observations set content = 'Reescrita por otra persona.',
    revision_number = revision_number + 1, revised_at = clock_timestamp()
  where id = '019f5000-0000-7000-8000-000000000c01'
  returning 1
)
select is((select count(*)::integer from changed), 0,
  'T-EXE-OBSERVATION-RLS-13 another professional who reads it changes nothing');
reset role;

select is(
  array[
    pg_temp.failure($$update execution.professional_observations set provenance = 'person_declared'
      where id = '019f5000-0000-7000-8000-000000000c01'$$),
    pg_temp.failure($$update execution.professional_observations set executed_session_id = '019f5000-0000-7000-8000-000000000e03'
      where id = '019f5000-0000-7000-8000-000000000c01'$$),
    pg_temp.failure($$update execution.professional_observations set content = 'Sin revisión.'
      where id = '019f5000-0000-7000-8000-000000000c01'$$)
  ],
  array['23514', '23514', '23514'],
  'T-EXE-OBSERVATION-INT-06 an observation keeps who wrote it, where and as what; its text changes only as a new revision');

-- ---------------------------------------------------------------------------
-- OP-EXE-011: correcting his own observation
-- ---------------------------------------------------------------------------
set local role allfit_api;
select pg_temp.act('019f5000-0000-7000-8000-000000000012');
select result as revised, replayed as revised_replayed from pg_temp.revise(
  '019f5000-0000-7000-8000-000000000012', '019f5000-0000-7000-8000-000000000c01', 1,
  'Bajó la técnica en las dos últimas series.', 'Eran dos series, no una.',
  '019f5000-0000-7000-8000-000000000d01', 'a1000000-0000-4000-8000-000000000011') \gset
select is(
  (:'revised'::jsonb->>'content', :'revised'::jsonb->>'revision_number', :'revised'::jsonb->>'revised_at' is not null)::text,
  '("Bajó la técnica en las dos últimas series.",2,t)',
  'T-EXE-OBSERVATION-REV-API-01 the author corrects his observation: the next revision is in force');
select is(:'revised_replayed'::boolean, false, 'T-EXE-OBSERVATION-REV-IDEM-01 and it is not a replay');
reset role;
select results_eq(
  $$select revision_from, revision_to, before_content, after_content, reason, actor_membership_id, actor_assignment_id
    from execution.observation_revisions where observation_id = '019f5000-0000-7000-8000-000000000c01'$$,
  $$values (1, 2, 'Bajó la técnica en la última serie.', 'Bajó la técnica en las dos últimas series.',
            'Eran dos series, no una.', '019f5000-0000-7000-8000-000000000212'::uuid, '019f5000-0000-7000-8000-000000000801'::uuid)$$,
  'T-EXE-OBSERVATION-REV-INT-01 T-REV-1 the original, the new text, the reason and who changed it are kept');
select is(
  (select count(*)::integer from system.outbox_events
   where aggregate_id = '019f5000-0000-7000-8000-000000000c01' and event_type = 'execution.observation_revised.v1'),
  1, 'T-EXE-OBSERVATION-REV-INT-02 the correction is announced once');
set local role allfit_api;
select pg_temp.act('019f5000-0000-7000-8000-000000000012');
select is(
  (select replayed from pg_temp.revise(
    '019f5000-0000-7000-8000-000000000012', '019f5000-0000-7000-8000-000000000c01', 1,
    'Bajó la técnica en las dos últimas series.', 'Eran dos series, no una.',
    '019f5000-0000-7000-8000-000000000d01', 'a1000000-0000-4000-8000-000000000011')),
  true, 'T-EXE-OBSERVATION-REV-IDEM-02 the same correction again is a replay');
reset role;
select is(
  (select count(*)::integer from execution.observation_revisions where observation_id = '019f5000-0000-7000-8000-000000000c01'),
  1, 'T-EXE-OBSERVATION-REV-IDEM-03 and leaves one revision');
set local role allfit_api;

select pg_temp.act('019f5000-0000-7000-8000-000000000012');
select is(
  pg_temp.failure($$select * from pg_temp.revise('019f5000-0000-7000-8000-000000000012',
    '019f5000-0000-7000-8000-000000000c01', 1, 'Con una versión vieja.', 'Desde otra pestaña.',
    '019f5000-0000-7000-8000-000000000d02')$$) like '40001%',
  true, 'T-EXE-OBSERVATION-REV-API-02 a correction made over an older version is refused as stale');
select is(
  array[
    pg_temp.failure($$select * from pg_temp.revise('019f5000-0000-7000-8000-000000000012',
      '019f5000-0000-7000-8000-000000000c01', 2, 'Bajó la técnica en las dos últimas series.', 'Igual.',
      '019f5000-0000-7000-8000-000000000d03')$$),
    pg_temp.failure($$select * from pg_temp.revise('019f5000-0000-7000-8000-000000000012',
      '019f5000-0000-7000-8000-000000000c01', 2, 'Texto nuevo.', '  ',
      '019f5000-0000-7000-8000-000000000d04')$$)
  ],
  array['22023 ["content"]', '22023 ["reason"]'],
  'T-EXE-OBSERVATION-REV-API-03 a correction that changes nothing, or gives no reason, is refused');
select pg_temp.act('019f5000-0000-7000-8000-000000000013');
select is(
  pg_temp.failure($$select * from pg_temp.revise('019f5000-0000-7000-8000-000000000013',
    '019f5000-0000-7000-8000-000000000c01', 2, 'Lo corrijo yo.', 'Soy su suplente.',
    '019f5000-0000-7000-8000-000000000d05')$$),
  'P0002', 'T-EXE-OBSERVATION-REV-API-04 T-OBS-2 another professional''s observation is not his to correct');
reset role;

-- Reading her training is not enough to correct what he wrote on it.
update privacy.data_grants set status = 'revoked', revoked_at = clock_timestamp()
where id = '019f5000-0000-7000-8000-000000000a01';
select pg_temp.share('019f5000-0000-7000-8000-000000000701', '019f5000-0000-7000-8000-000000000a06', 'relationship_training', 'read');
set local role allfit_api;
select pg_temp.act('019f5000-0000-7000-8000-000000000012');
select is(
  pg_temp.failure($$select * from pg_temp.revise('019f5000-0000-7000-8000-000000000012',
    '019f5000-0000-7000-8000-000000000c01', 2, 'Con lectura.', 'Solo leo.',
    '019f5000-0000-7000-8000-000000000d06')$$),
  'AF430 relationship_training:contribute',
  'T-EXE-OBSERVATION-REV-API-05 a correction needs contribute as much as the observation did');
reset role;

-- Revisions are append-only, for every role.
select is(
  pg_temp.failure($$update execution.observation_revisions set reason = 'otra'$$),
  '42501', 'T-EXE-OBSERVATION-REV-INT-03 a revision is never rewritten');
select is(
  pg_temp.failure($$delete from execution.observation_revisions$$),
  '42501', 'T-EXE-OBSERVATION-REV-INT-04 nor removed');

set local role allfit_owner;
select pg_temp.act('019f5000-0000-7000-8000-000000000001');
select is((select count(*)::integer from execution.observation_revisions), 1,
  'T-EXE-OBSERVATION-REV-RLS-01 observation_revisions_select_self: she sees how what was written about her changed');
select pg_temp.act('019f5000-0000-7000-8000-000000000002');
select is((select count(*)::integer from execution.observation_revisions), 0,
  'T-EXE-OBSERVATION-REV-RLS-02 another person does not');
select pg_temp.member('019f5000-0000-7000-8000-000000000012', '019f5000-0000-7000-8000-000000000212');
select is((select count(*)::integer from execution.observation_revisions), 0,
  'T-EXE-OBSERVATION-REV-RLS-03 nor does its author read her record of how it changed');
select pg_temp.member('019f5000-0000-7000-8000-000000000013', '019f5000-0000-7000-8000-000000000213');
select access_control.open_contract_scope('observation_revision', '019f5000-0000-7000-8000-000000000c01');
select is(
  pg_temp.failure($$insert into execution.observation_revisions (
      id, observation_id, person_id, revision_from, revision_to, actor_assignment_id,
      actor_membership_id, reason, before_content, after_content)
    values ('019f5000-0000-7000-8000-000000000d40', '019f5000-0000-7000-8000-000000000c01',
      '019f5000-0000-7000-8000-000000000001', 2, 3, '019f5000-0000-7000-8000-000000000805',
      '019f5000-0000-7000-8000-000000000213', 'Ajena.', 'a', 'b')$$),
  '42501',
  'T-EXE-OBSERVATION-REV-RLS-04 observation_revisions_insert_author: nobody records a revision of someone else''s');
reset role;

-- A screening shows an observation only beside its session: her health shared without her
-- training leaves the session out of sight, and the pain written on it with it.
select pg_temp.share('019f5000-0000-7000-8000-000000000701', '019f5000-0000-7000-8000-000000000a07', 'health_context', 'read');
set local role allfit_owner;
select pg_temp.member('019f5000-0000-7000-8000-000000000013', '019f5000-0000-7000-8000-000000000213');
select access_control.open_contract_scope('session_screening', '019f5000-0000-7000-8000-000000000701');
select is(
  (select count(*)::integer from execution.professional_observations where data_classification_code = 'health'),
  1, 'T-EXE-OBSERVATION-RLS-14 with her training and her health shared, the pain shows beside its session');
reset role;
update privacy.data_grants set status = 'revoked', revoked_at = clock_timestamp()
where id = '019f5000-0000-7000-8000-000000000a06';
set local role allfit_owner;
select pg_temp.member('019f5000-0000-7000-8000-000000000013', '019f5000-0000-7000-8000-000000000213');
select access_control.open_contract_scope('session_screening', '019f5000-0000-7000-8000-000000000701');
select is(
  (select count(*)::integer from execution.professional_observations),
  0, 'T-EXE-OBSERVATION-RLS-15 professional_observations_select_screening: with only her health shared, no observation shows without its session');
reset role;

-- ---------------------------------------------------------------------------
-- T-OBS-5: once the relationship ends
-- ---------------------------------------------------------------------------
update relationships.service_relationships
set status = 'terminated', ended_at = clock_timestamp(), ended_reason = 'left'
where id = '019f5000-0000-7000-8000-000000000701';
set local role allfit_api;
select pg_temp.act('019f5000-0000-7000-8000-000000000012');
select is(
  array[
    pg_temp.failure($$select * from pg_temp.observe('019f5000-0000-7000-8000-000000000012', '019f5000-0000-7000-8000-000000000001',
      '019f5000-0000-7000-8000-000000000e01', 'training', 'professional_observation', 'Ya terminó.', '019f5000-0000-7000-8000-000000000c40')$$),
    pg_temp.failure($$select * from pg_temp.revise('019f5000-0000-7000-8000-000000000012',
      '019f5000-0000-7000-8000-000000000c01', 2, 'Después de terminar.', 'Tarde.', '019f5000-0000-7000-8000-000000000d07')$$)
  ],
  array['P0002', 'P0002'],
  'T-EXE-OBSERVATION-API-18 T-OBS-5 after termination nothing new is written and nothing is corrected');
reset role;

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------
select ok(
  has_function_privilege('allfit_api', 'execution.record_observation(uuid, uuid, uuid, uuid, text, text, text, uuid, uuid, bytea)', 'execute')
  and has_function_privilege('allfit_api', 'execution.revise_observation(uuid, uuid, uuid, integer, text, text, uuid, uuid, bytea)', 'execute'),
  'T-EXE-OBSERVATION-API-19 the API runs both commands');
select ok(
  not has_function_privilege('public', 'execution.record_observation(uuid, uuid, uuid, uuid, text, text, text, uuid, uuid, bytea)', 'execute')
  and not has_function_privilege('public', 'execution.revise_observation(uuid, uuid, uuid, integer, text, text, uuid, uuid, bytea)', 'execute'),
  'T-EXE-OBSERVATION-API-20 nobody else does');
select ok(
  not has_table_privilege('allfit_api', 'execution.professional_observations', 'select')
  and not has_table_privilege('allfit_api', 'execution.professional_observations', 'insert')
  and not has_table_privilege('allfit_api', 'execution.observation_revisions', 'select'),
  'T-EXE-OBSERVATION-API-21 and nothing touches the tables directly');

select * from finish();
rollback;
