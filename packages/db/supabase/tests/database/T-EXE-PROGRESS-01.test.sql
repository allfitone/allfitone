-- T-EXE-PROGRESS-01 — OP-EXE-019 (HU-STUDIO-056), T-DERIV-2/3/5, T-EXEC-3.
--
-- The coach who attends a person reads how her training is going, computed only from
-- what she lets that relationship see:
--
--   · Every figure is computed when it is read, from the sessions the screening admits:
--     inside the relationship under `relationship_training`, on her own under
--     `prior_training_history` and never one she hid. Nothing outside them moves a number.
--   · Hiding a session withdraws it from every total and every best that included it;
--     taking the hiding back brings it back. Nothing is stored that could outlive it.
--   · Nothing is approximated: with nothing shared there is no figure at all, a set with
--     no load adds nothing rather than zero, and a movement only she can name has no name.
--   · No adherence, no programme, no body weight: only what training sets say.
--   · Every read is recorded before it answers, and a refused one too.
--
-- Written before the migration and watched failing.
begin;

select plan(31);

insert into identity.people (id, given_name, family_name, status)
values
  ('019f4900-0000-7000-8000-000000000001', 'Ana', 'Client', 'active'),
  ('019f4900-0000-7000-8000-000000000002', 'Bruno', 'Client', 'active'),
  ('019f4900-0000-7000-8000-000000000011', 'Olivia', 'Owner', 'active'),
  ('019f4900-0000-7000-8000-000000000012', 'Camilo', 'Coach', 'active'),
  ('019f4900-0000-7000-8000-000000000015', 'Fabio', 'Unassigned', 'active'),
  ('019f4900-0000-7000-8000-000000000016', 'Gina', 'Admin', 'active'),
  ('019f4900-0000-7000-8000-000000000021', 'Oscar', 'Owner', 'active');

insert into organizations.organizations (id, type_code, display_name, responsible_party)
values
  ('019f4900-0000-7000-8000-000000000101', 'gym', 'Gym A',
   '{"party_kind":"legal_entity","party_name":"Gym A SAS","purpose":"studio_operations"}'),
  ('019f4900-0000-7000-8000-000000000102', 'gym', 'Gym B',
   '{"party_kind":"legal_entity","party_name":"Gym B SAS","purpose":"studio_operations"}');

insert into organizations.organization_memberships (id, organization_id, person_id, status)
values
  ('019f4900-0000-7000-8000-000000000211', '019f4900-0000-7000-8000-000000000101', '019f4900-0000-7000-8000-000000000011', 'active'),
  ('019f4900-0000-7000-8000-000000000212', '019f4900-0000-7000-8000-000000000101', '019f4900-0000-7000-8000-000000000012', 'active'),
  ('019f4900-0000-7000-8000-000000000215', '019f4900-0000-7000-8000-000000000101', '019f4900-0000-7000-8000-000000000015', 'active'),
  ('019f4900-0000-7000-8000-000000000216', '019f4900-0000-7000-8000-000000000101', '019f4900-0000-7000-8000-000000000016', 'active'),
  ('019f4900-0000-7000-8000-000000000221', '019f4900-0000-7000-8000-000000000102', '019f4900-0000-7000-8000-000000000021', 'active');

insert into organizations.membership_roles (membership_id, role_code)
values
  ('019f4900-0000-7000-8000-000000000211', 'owner'),
  ('019f4900-0000-7000-8000-000000000212', 'coach'),
  ('019f4900-0000-7000-8000-000000000215', 'coach'),
  ('019f4900-0000-7000-8000-000000000216', 'admin'),
  ('019f4900-0000-7000-8000-000000000221', 'owner');

insert into relationships.service_relationships (id, person_id, organization_id, status, started_at)
values
  ('019f4900-0000-7000-8000-000000000701', '019f4900-0000-7000-8000-000000000001', '019f4900-0000-7000-8000-000000000101', 'active', clock_timestamp() - interval '60 days'),
  ('019f4900-0000-7000-8000-000000000702', '019f4900-0000-7000-8000-000000000002', '019f4900-0000-7000-8000-000000000101', 'active', clock_timestamp() - interval '60 days'),
  ('019f4900-0000-7000-8000-000000000706', '019f4900-0000-7000-8000-000000000001', '019f4900-0000-7000-8000-000000000102', 'active', clock_timestamp() - interval '60 days');

insert into relationships.relationship_professional_assignments (
  id, relationship_id, person_id, organization_id, membership_id, kind, status
) values
  ('019f4900-0000-7000-8000-000000000801', '019f4900-0000-7000-8000-000000000701', '019f4900-0000-7000-8000-000000000001',
   '019f4900-0000-7000-8000-000000000101', '019f4900-0000-7000-8000-000000000212', 'holder', 'active'),
  ('019f4900-0000-7000-8000-000000000802', '019f4900-0000-7000-8000-000000000702', '019f4900-0000-7000-8000-000000000002',
   '019f4900-0000-7000-8000-000000000101', '019f4900-0000-7000-8000-000000000212', 'holder', 'active');

insert into privacy.scope_definitions (id, scope_code, version_number, status, published_at)
values
  ('019f4900-0000-7000-8000-000000000301', 'relationship_training', 4, 'published', clock_timestamp()),
  ('019f4900-0000-7000-8000-000000000302', 'prior_training_history', 2, 'published', clock_timestamp());

insert into identity.invitations (
  id, organization_id, issued_by_membership_id, channel, contact,
  token_hash, token_key_version, proposal_hash, responsible_party, status, expires_at
) values (
  '019f4900-0000-7000-8000-000000000401', '019f4900-0000-7000-8000-000000000101',
  '019f4900-0000-7000-8000-000000000211', 'email', 'ana@example.test',
  extensions.digest('progress-token', 'sha256'), 1, extensions.digest('progress-proposal', 'sha256'),
  '{"party_kind":"legal_entity","party_name":"Gym A SAS","purpose":"studio_operations"}',
  'completed', clock_timestamp() + interval '7 days'
);
insert into identity.invitation_intents (id, invitation_id, kind, status, proposed_role_code)
values ('019f4900-0000-7000-8000-000000000501', '019f4900-0000-7000-8000-000000000401',
  'service_relationship', 'pending', null);
insert into privacy.invitation_scope_options (
  id, invitation_intent_id, scope_definition_id, scope_code,
  offered_access_level, purpose, presented_snapshot, decision, decided_at
) values
  ('019f4900-0000-7000-8000-000000000601', '019f4900-0000-7000-8000-000000000501',
   '019f4900-0000-7000-8000-000000000301', 'relationship_training', 'read',
   'Follow the training', '{"title":"Training"}'::jsonb, 'accepted', clock_timestamp()),
  ('019f4900-0000-7000-8000-000000000602', '019f4900-0000-7000-8000-000000000501',
   '019f4900-0000-7000-8000-000000000302', 'prior_training_history', 'read',
   'Know the history', '{"title":"History"}'::jsonb, 'accepted', clock_timestamp());

create function pg_temp.share(relationship uuid, grant_id uuid, scope text)
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
    option.scope_definition_id, scope, grant_id, 'read', 'Follow the training'
  );
end
$$;

-- At first Ana shares only what she trains inside Gym A. Bruno shares nothing.
select pg_temp.share('019f4900-0000-7000-8000-000000000701', '019f4900-0000-7000-8000-000000000a01', 'relationship_training');

insert into catalog.movements (id, discipline_code, name, normalized_name, content_scope, owner_person_id, status)
values
  ('019f4900-0000-7000-8000-0000000000a1', 'test_strength', 'Press de prueba', 'press de prueba', 'global', null, 'published'),
  ('019f4900-0000-7000-8000-0000000000a2', 'test_strength', 'Lo que solo Ana nombra', 'lo que solo ana nombra', 'person',
   '019f4900-0000-7000-8000-000000000001', 'published');
insert into catalog.muscles (id, code, name, region, status, display_order)
values ('019f4900-0000-7000-8000-0000000000b1', 'test_progress_chest', 'Pecho de progreso', 'upper', 'published', 0);
insert into catalog.movement_muscles (movement_id, muscle_id, is_primary)
values ('019f4900-0000-7000-8000-0000000000a1', '019f4900-0000-7000-8000-0000000000b1', true);

create function pg_temp.trained(id uuid, person uuid, weeks_back integer, hour integer, context uuid, org uuid)
returns void language sql as $$
  insert into execution.executed_sessions (
    id, person_id, activity_type_id, result_contract_id, contract_version, is_autonomous,
    context_relationship_id, context_organization_id, started_at, ended_at, timezone,
    execution_status, validation_status, requested_level, achieved_level, capture_source
  ) values (
    id, person, '019c0000-0000-7000-8000-000000000011', '019c0000-0000-7000-8000-000000000031', 1,
    context is null, context, org,
    ((date_trunc('week', clock_timestamp() at time zone 'America/Bogota')::date - 7 * weeks_back)::timestamp
       + make_interval(hours => hour)) at time zone 'America/Bogota',
    ((date_trunc('week', clock_timestamp() at time zone 'America/Bogota')::date - 7 * weeks_back)::timestamp
       + make_interval(hours => hour + 1)) at time zone 'America/Bogota',
    'America/Bogota', 'completed', 'valid', 'detailed', 'detailed', 'manual'
  )
$$;

-- S1 inside Gym A last week. On her own: S2 two weeks ago, S3 annulled, S4 still open,
-- S5 with a movement only she can name. S6 inside Gym B. Bruno trained once.
select pg_temp.trained('019f4900-0000-7000-8000-000000000e01', '019f4900-0000-7000-8000-000000000001', 1, 10,
  '019f4900-0000-7000-8000-000000000701', '019f4900-0000-7000-8000-000000000101');
select pg_temp.trained('019f4900-0000-7000-8000-000000000e02', '019f4900-0000-7000-8000-000000000001', 2, 10, null, null);
select pg_temp.trained('019f4900-0000-7000-8000-000000000e03', '019f4900-0000-7000-8000-000000000001', 1, 12, null, null);
select pg_temp.trained('019f4900-0000-7000-8000-000000000e04', '019f4900-0000-7000-8000-000000000001', 1, 14, null, null);
select pg_temp.trained('019f4900-0000-7000-8000-000000000e05', '019f4900-0000-7000-8000-000000000001', 1, 16, null, null);
select pg_temp.trained('019f4900-0000-7000-8000-000000000e06', '019f4900-0000-7000-8000-000000000001', 1, 18,
  '019f4900-0000-7000-8000-000000000706', '019f4900-0000-7000-8000-000000000102');
select pg_temp.trained('019f4900-0000-7000-8000-000000000e11', '019f4900-0000-7000-8000-000000000002', 1, 10, null, null);
update execution.executed_sessions
set validation_status = 'annulled', annulled_at = clock_timestamp(), annulment_reason = 'duplicate'
where id = '019f4900-0000-7000-8000-000000000e03';
update execution.executed_sessions set execution_status = 'in_progress', ended_at = null
where id = '019f4900-0000-7000-8000-000000000e04';

insert into execution.strength_sets (executed_session_id, set_order, movement_id, kind, achieved_reps, load_value, load_unit_code)
values
  ('019f4900-0000-7000-8000-000000000e01', 1, '019f4900-0000-7000-8000-0000000000a1', 'warmup', 10, 40, 'kg'),
  ('019f4900-0000-7000-8000-000000000e01', 2, '019f4900-0000-7000-8000-0000000000a1', 'normal', 5, 100, 'kg'),
  ('019f4900-0000-7000-8000-000000000e01', 3, '019f4900-0000-7000-8000-0000000000a1', 'normal', 10, null, null),
  ('019f4900-0000-7000-8000-000000000e02', 1, '019f4900-0000-7000-8000-0000000000a1', 'normal', 3, 120, 'kg'),
  ('019f4900-0000-7000-8000-000000000e03', 1, '019f4900-0000-7000-8000-0000000000a1', 'normal', 1, 200, 'kg'),
  ('019f4900-0000-7000-8000-000000000e04', 1, '019f4900-0000-7000-8000-0000000000a1', 'normal', 1, 210, 'kg'),
  ('019f4900-0000-7000-8000-000000000e05', 1, '019f4900-0000-7000-8000-0000000000a2', 'normal', 5, 50, 'kg'),
  ('019f4900-0000-7000-8000-000000000e06', 1, '019f4900-0000-7000-8000-0000000000a1', 'normal', 1, 300, 'kg'),
  ('019f4900-0000-7000-8000-000000000e11', 1, '019f4900-0000-7000-8000-0000000000a1', 'normal', 1, 90, 'kg');

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

create function pg_temp.sqlstate(statement text) returns text language plpgsql as $$
begin
  execute statement;
  return 'no error';
exception when others then
  return sqlstate;
end
$$;

create function pg_temp.progress(subject uuid, period text default 'week', periods integer default 4)
returns jsonb language sql as $$
  select execution.read_client_progress(
    '019f4900-0000-7000-8000-000000000012', '019f4900-0000-7000-8000-000000000101',
    subject, 'America/Bogota', period, periods)
$$;

create function pg_temp.total(document jsonb, field text) returns numeric language sql as $$
  select sum((period->>field)::numeric) from jsonb_array_elements(document->'periods') as period
$$;

create function pg_temp.movement(document jsonb, movement uuid) returns jsonb language sql as $$
  select item from jsonb_array_elements(document->'movements') as item
  where item->>'movement_id' = movement::text
$$;

-- ---------------------------------------------------------------------------
-- Who may read, and nothing shared
-- ---------------------------------------------------------------------------
set local role allfit_api;

select pg_temp.act('019f4900-0000-7000-8000-000000000015');
select is(
  pg_temp.sqlstate($$select execution.read_client_progress(
    '019f4900-0000-7000-8000-000000000015', '019f4900-0000-7000-8000-000000000101',
    '019f4900-0000-7000-8000-000000000001', 'America/Bogota', 'week', 4)$$),
  'P0002', 'T-EXE-PROGRESS-API-01 a coach who does not attend her finds no such client');
select pg_temp.act('019f4900-0000-7000-8000-000000000016');
select is(
  pg_temp.sqlstate($$select execution.read_client_progress(
    '019f4900-0000-7000-8000-000000000016', '019f4900-0000-7000-8000-000000000101',
    '019f4900-0000-7000-8000-000000000001', 'America/Bogota', 'week', 4)$$),
  'P0002', 'T-EXE-PROGRESS-API-02 nor an administrator: being one is not attending her');

select pg_temp.act('019f4900-0000-7000-8000-000000000012');
select current_setting('app.request_id') as bruno_read \gset
select is(
  pg_temp.progress('019f4900-0000-7000-8000-000000000002'),
  '{"outcome": "scope_required", "required_scope": {"code": "relationship_training", "level": "read"}}'::jsonb,
  'T-EXE-PROGRESS-API-03 with nothing shared there is no figure at all, only the category it lacks');
reset role;
select results_eq(
  format($sql$select relationship_id, data_grant_id, result, resource
              from privacy.access_events where request_id = %L$sql$, :'bruno_read'),
  $$values ('019f4900-0000-7000-8000-000000000702'::uuid, null::uuid, 'denied', 'execution.executed_sessions')$$,
  'T-EXE-PROGRESS-API-04 and the attempt stays on his record as refused');
set local role allfit_api;

-- ---------------------------------------------------------------------------
-- Only what is trained inside the relationship
-- ---------------------------------------------------------------------------
select pg_temp.act('019f4900-0000-7000-8000-000000000012');
select current_setting('app.request_id') as inside_read \gset
select pg_temp.progress('019f4900-0000-7000-8000-000000000001') as inside \gset
select is(:'inside'::jsonb->>'outcome', 'found', 'T-EXE-PROGRESS-API-05 the holder reads her progress');
select is(
  :'inside'::jsonb->'sources',
  '[{"code": "relationship_training", "version": 4}]'::jsonb,
  'T-EXE-PROGRESS-API-06 it names the one category it was computed from, and its version');
select is(
  (pg_temp.total(:'inside'::jsonb, 'sessions'), pg_temp.total(:'inside'::jsonb, 'work_sets'),
   pg_temp.total(:'inside'::jsonb, 'volume_kg'))::text,
  '(1,2,500.00)',
  'T-EXE-PROGRESS-API-07 one session, two work sets: no warm-up, and a set with no load adds nothing rather than zero');
select is(
  pg_temp.movement(:'inside'::jsonb, '019f4900-0000-7000-8000-0000000000a1') - 'name',
  '{"movement_id": "019f4900-0000-7000-8000-0000000000a1", "best_kg": 100.00, "previous_best_kg": null,
    "change_kg": null, "best_e1rm_kg": 116.67, "bests": [null, null, 100.00, null]}'::jsonb,
  'T-EXE-PROGRESS-API-08 the best of a movement comes only from sessions she shares: the one she did alone does not count');
select is(
  jsonb_array_length(:'inside'::jsonb->'movements'),
  1,
  'T-EXE-PROGRESS-API-09 nothing trained on her own or inside another gym appears');
select is(
  (select jsonb_agg(muscle) from jsonb_array_elements(:'inside'::jsonb->'periods') as period,
     jsonb_array_elements(period->'muscles') as muscle),
  '[{"code": "test_progress_chest", "name": "Pecho de progreso", "sets": 2}]'::jsonb,
  'T-EXE-PROGRESS-API-10 the work sets fall on the movement''s primary muscle');
reset role;
select results_eq(
  format($sql$select data_grant_id, scope_code, scope_version, result
              from privacy.access_events where request_id = %L$sql$, :'inside_read'),
  $$values ('019f4900-0000-7000-8000-000000000a01'::uuid, 'relationship_training', 4, 'allowed')$$,
  'T-EXE-PROGRESS-API-11 the read is recorded under the grant it used');
set local role allfit_owner;
select is(
  (select count(*)::integer from execution.executed_sessions where person_id = '019f4900-0000-7000-8000-000000000001'),
  0,
  'T-EXE-PROGRESS-API-12 the read closes the screening it opened');
reset role;

-- ---------------------------------------------------------------------------
-- What she trained on her own, once she shares it
-- ---------------------------------------------------------------------------
select pg_temp.share('019f4900-0000-7000-8000-000000000701', '019f4900-0000-7000-8000-000000000a02', 'prior_training_history');
set local role allfit_api;
select pg_temp.act('019f4900-0000-7000-8000-000000000012');
select current_setting('app.request_id') as both_read \gset
select pg_temp.progress('019f4900-0000-7000-8000-000000000001') as shared \gset
select is(
  :'shared'::jsonb->'sources',
  '[{"code": "relationship_training", "version": 4}, {"code": "prior_training_history", "version": 2}]'::jsonb,
  'T-EXE-PROGRESS-API-13 with her history shared too, it names both categories');
select is(
  pg_temp.total(:'shared'::jsonb, 'sessions'),
  3::numeric,
  'T-EXE-PROGRESS-API-14 her finished sessions on her own count; the annulled, the open one and another gym''s do not');
select is(
  pg_temp.movement(:'shared'::jsonb, '019f4900-0000-7000-8000-0000000000a1') - 'name',
  '{"movement_id": "019f4900-0000-7000-8000-0000000000a1", "best_kg": 100.00, "previous_best_kg": 120.00,
    "change_kg": -20.00, "best_e1rm_kg": 132.00, "bests": [null, 120.00, 100.00, null]}'::jsonb,
  'T-EXE-PROGRESS-API-15 the best she lifted on her own two weeks ago now stands against last week');
select is(
  pg_temp.movement(:'shared'::jsonb, '019f4900-0000-7000-8000-0000000000a2') ->> 'name',
  null,
  'T-EXE-PROGRESS-API-16 a movement only she can name is counted, and comes back with no name');
reset role;
select is(
  (select array_agg(scope_code || ':' || result order by scope_code)
   from privacy.access_events where request_id = :'both_read'),
  array['prior_training_history:allowed', 'relationship_training:allowed'],
  'T-EXE-PROGRESS-API-17 the read is recorded under each category it used');

-- ---------------------------------------------------------------------------
-- Hiding a session invalidates what included it
-- ---------------------------------------------------------------------------
insert into privacy.session_visibility_denials (person_id, executed_session_id, relationship_id, status, denied_at)
values ('019f4900-0000-7000-8000-000000000001', '019f4900-0000-7000-8000-000000000e02',
        '019f4900-0000-7000-8000-000000000701', 'active', clock_timestamp());
set local role allfit_api;
select pg_temp.act('019f4900-0000-7000-8000-000000000012');
select pg_temp.progress('019f4900-0000-7000-8000-000000000001') as hidden \gset
select is(
  (pg_temp.total(:'hidden'::jsonb, 'sessions'), pg_temp.total(:'hidden'::jsonb, 'volume_kg'))::text,
  '(2,750.00)',
  'T-EXE-PROGRESS-API-18 a session she hid leaves every total');
select is(
  pg_temp.movement(:'hidden'::jsonb, '019f4900-0000-7000-8000-0000000000a1') - 'name',
  '{"movement_id": "019f4900-0000-7000-8000-0000000000a1", "best_kg": 100.00, "previous_best_kg": null,
    "change_kg": null, "best_e1rm_kg": 116.67, "bests": [null, null, 100.00, null]}'::jsonb,
  'T-EXE-PROGRESS-API-19 and every best it held: no record, no estimate, no trace of it');
reset role;
update privacy.session_visibility_denials set status = 'reverted', restored_at = clock_timestamp()
where executed_session_id = '019f4900-0000-7000-8000-000000000e02';
set local role allfit_api;
select pg_temp.act('019f4900-0000-7000-8000-000000000012');
select is(
  pg_temp.movement(pg_temp.progress('019f4900-0000-7000-8000-000000000001'), '019f4900-0000-7000-8000-0000000000a1')
    ->> 'previous_best_kg',
  '120.00',
  'T-EXE-PROGRESS-API-20 once she shows it again, its best comes back');
reset role;

-- A correction of hers is what the next read computes from: nothing stored lags behind.
update execution.strength_sets set load_value = 110
where executed_session_id = '019f4900-0000-7000-8000-000000000e01' and set_order = 2;
set local role allfit_api;
select pg_temp.act('019f4900-0000-7000-8000-000000000012');
select is(
  pg_temp.movement(pg_temp.progress('019f4900-0000-7000-8000-000000000001'), '019f4900-0000-7000-8000-0000000000a1')
    ->> 'best_kg',
  '110.00',
  'T-EXE-PROGRESS-API-21 a value she corrects is the one the next read uses');

-- ---------------------------------------------------------------------------
-- Only training: what the document says and what it never says
-- ---------------------------------------------------------------------------
select pg_temp.progress('019f4900-0000-7000-8000-000000000001', 'month', 2) as monthly \gset
select is(
  (select array_agg(key order by key) from jsonb_object_keys(:'monthly'::jsonb) as key),
  array['algorithm', 'movements', 'outcome', 'period', 'periods', 'sources'],
  'T-EXE-PROGRESS-API-22 the document holds figures and where they came from, and nothing else');
select is(
  (select array_agg(key order by key) from jsonb_object_keys(:'monthly'::jsonb #> '{periods,0}') as key),
  array['ends_before', 'muscles', 'sessions', 'starts_on', 'trained_seconds', 'volume_kg', 'work_sets'],
  'T-EXE-PROGRESS-API-23 a period says what was trained, never what was planned or which programme');
select is(
  (select array_agg(key order by key) from jsonb_object_keys(:'monthly'::jsonb #> '{movements,0}') as key),
  array['best_e1rm_kg', 'best_kg', 'bests', 'change_kg', 'movement_id', 'name', 'previous_best_kg'],
  'T-EXE-PROGRESS-API-24 a movement says its loads, never her body weight');
select is(
  :'monthly'::jsonb->'algorithm',
  '{"e1rm": "epley", "version": 1}'::jsonb,
  'T-EXE-PROGRESS-API-25 the estimate names the formula it was computed with');
select is(
  (:'monthly'::jsonb->>'period', jsonb_array_length(:'monthly'::jsonb->'periods'))::text,
  '(month,2)',
  'T-EXE-PROGRESS-API-26 months read as well as weeks');

-- ---------------------------------------------------------------------------
-- Refused requests
-- ---------------------------------------------------------------------------
select is(
  array[
    pg_temp.sqlstate($$select pg_temp.progress('019f4900-0000-7000-8000-000000000001', 'day', 4)$$),
    pg_temp.sqlstate($$select pg_temp.progress('019f4900-0000-7000-8000-000000000001', 'week', 0)$$),
    pg_temp.sqlstate($$select pg_temp.progress('019f4900-0000-7000-8000-000000000001', 'week', 13)$$),
    pg_temp.sqlstate($$select execution.read_client_progress(
      '019f4900-0000-7000-8000-000000000012', '019f4900-0000-7000-8000-000000000101',
      '019f4900-0000-7000-8000-000000000001', 'Mars/Olympus', 'week', 4)$$)
  ],
  array['22023', '22023', '22023', '22023'],
  'T-EXE-PROGRESS-API-27 a period that is not a week or a month, a count outside 1 to 12 and an unknown zone are refused');
select set_config('app.request_id', '', true);
select is(
  pg_temp.sqlstate($$select pg_temp.progress('019f4900-0000-7000-8000-000000000001')$$),
  '22023', 'T-EXE-PROGRESS-API-28 a read with no request to record it under is refused');
reset role;

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------
select ok(
  has_function_privilege('allfit_api', 'execution.read_client_progress(uuid, uuid, uuid, text, text, integer)', 'execute'),
  'T-EXE-PROGRESS-API-29 the API runs the read');
select ok(
  not has_function_privilege('public', 'execution.read_client_progress(uuid, uuid, uuid, text, text, integer)', 'execute'),
  'T-EXE-PROGRESS-API-30 nobody else does');
select ok(
  not has_function_privilege('allfit_api', 'execution.require_category_grant(uuid, text, privacy.access_level)', 'execute'),
  'T-EXE-PROGRESS-API-31 and the grant check it shares stays internal');

select * from finish();
rollback;
