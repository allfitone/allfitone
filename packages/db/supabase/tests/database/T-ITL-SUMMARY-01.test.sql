-- The weekly summary: a person asks for it, the week is read as herself, a run records
-- what happened and the summary is hers (`OP-ITL-004..006`; HU-SP-126 and HU-SP-127;
-- ADR-053, decisions 6 to 8, 10 and 13).
--
-- Ana has Pro through her gym and holds the AI consent. She trained and ate in both
-- weeks; her neighbour trained too. The refusals come first and read nothing; then the
-- week, the run, the ceiling of four, the summary she lists and deletes, and what the
-- neighbour and the runtime role cannot do.
--
-- No model is asked here: the API does that between the two halves, so each test plays
-- its part by closing the run the way the API would.
--
-- `T-ITL-RLS-08` to `-19` (but `-11`, which rests on the run's own filter) and
-- `T-ITL-INT-19` to `-22` were watched failing against this migration without its
-- policies, its trigger and its actor checks: every forbidden act succeeded.
begin;

select plan(72);

-- ———————————————————————————————— fixture

insert into identity.people (id, given_name, family_name, status)
values ('019f5a00-0000-7000-8000-000000000001', 'Ana', 'Resumida', 'active'),
       ('019f5a00-0000-7000-8000-000000000002', 'La', 'Vecina', 'active'),
       ('019f5a00-0000-7000-8000-000000000003', 'Carla', 'Gratis', 'active'),
       ('019f5a00-0000-7000-8000-000000000004', 'Dora', 'Sinpermiso', 'active'),
       ('019f5a00-0000-7000-8000-0000000000e1', 'Manager', 'Alpha', 'active'),
       ('019f5a00-0000-7000-8000-0000000000e2', 'Manager', 'Beta', 'active'),
       ('019f5a00-0000-7000-8000-0000000000e3', 'Commerce', 'Gamma', 'active'),
       ('019f5a00-0000-7000-8000-0000000000e4', 'Commerce', 'Delta', 'active');

-- Pro, published the only way it can be: proposed by one commercial manager and
-- published by another.
insert into identity.access_accounts (id, provider, issuer, subject, person_id)
values ('019f5a00-0000-7000-8000-0000000000f1', 'workos', 'https://issuer.test', 'alpha_summary', null),
       ('019f5a00-0000-7000-8000-0000000000f2', 'workos', 'https://issuer.test', 'beta_summary', null),
       ('019f5a00-0000-7000-8000-0000000000f3', 'workos', 'https://issuer.test', 'gamma_summary',
         '019f5a00-0000-7000-8000-0000000000e3'),
       ('019f5a00-0000-7000-8000-0000000000f4', 'workos', 'https://issuer.test', 'delta_summary',
         '019f5a00-0000-7000-8000-0000000000e4');
select support.bootstrap_backoffice_administrators(
  '019f5a00-0000-7000-8000-0000000000e1', 'alpha_summary',
  '019f5a00-0000-7000-8000-0000000000e2', 'beta_summary',
  'https://issuer.test', clock_timestamp() + interval '30 days', 'CEREMONY-ITL-SUMMARY-01');
insert into identity.access_sessions (
  id, access_account_id, provider_session_id, surface, token_hash, token_ciphertext,
  access_token_expires_at, assurance_level, authentication_method,
  assurance_verified_at, last_activity_at, absolute_expires_at)
select session_id, account_id, 'sid_' || suffix, 'backoffice', decode(repeat(hash_byte, 32), 'hex'),
  'v1.' || suffix, clock_timestamp() + interval '5 minutes', 2, 'password_totp',
  clock_timestamp(), clock_timestamp(), clock_timestamp() + interval '8 hours'
from (values
  ('019f5a00-0000-7000-8000-0000000000d1'::uuid, '019f5a00-0000-7000-8000-0000000000f1'::uuid, 'alpha_summary', 'b1'),
  ('019f5a00-0000-7000-8000-0000000000d3'::uuid, '019f5a00-0000-7000-8000-0000000000f3'::uuid, 'gamma_summary', 'b3'),
  ('019f5a00-0000-7000-8000-0000000000d4'::uuid, '019f5a00-0000-7000-8000-0000000000f4'::uuid, 'delta_summary', 'b4')
) as session_row(session_id, account_id, suffix, hash_byte);
select support.assign_platform_role(
  '019f5a00-0000-7000-8000-0000000000e1', '019f5a00-0000-7000-8000-0000000000d1',
  person_id, 'allfit_admin', gen_random_uuid(), gen_random_uuid(), extensions.gen_random_bytes(32))
from (values ('019f5a00-0000-7000-8000-0000000000e3'::uuid), ('019f5a00-0000-7000-8000-0000000000e4'::uuid))
  as grant_row(person_id);
select support.assign_platform_duty(
  '019f5a00-0000-7000-8000-0000000000e1', '019f5a00-0000-7000-8000-0000000000d1',
  person_id, 'manage_platform_commercial', clock_timestamp(), clock_timestamp() + interval '30 days',
  'CASE-ITL-SUMMARY', gen_random_uuid(), gen_random_uuid(), extensions.gen_random_bytes(32))
from (values ('019f5a00-0000-7000-8000-0000000000e3'::uuid), ('019f5a00-0000-7000-8000-0000000000e4'::uuid))
  as duty_row(person_id);

select set_config('app.actor_kind', 'support', true);
select set_config('app.actor_person_id', '019f5a00-0000-7000-8000-0000000000e3', true);
select (result->>'id')::uuid as pro_plan from payments.create_platform_plan(
  '019f5a00-0000-7000-8000-0000000000e3', '019f5a00-0000-7000-8000-0000000000d3',
  'pro', 'Pro', 'paid', gen_random_uuid(), extensions.uuid_generate_v7(), extensions.gen_random_bytes(32)) \gset
select (result->'proposal'->>'id')::uuid as pro_version from payments.propose_platform_plan_version(
  '019f5a00-0000-7000-8000-0000000000e3', '019f5a00-0000-7000-8000-0000000000d3',
  :'pro_plan'::uuid, 19900, 'COP', 'month',
  (select jsonb_agg(jsonb_build_object('feature_code', feature.code, 'enabled', true, 'limit_value', null))
   from payments.platform_features as feature),
  gen_random_uuid(), extensions.uuid_generate_v7(), extensions.gen_random_bytes(32)) \gset
select set_config('app.actor_person_id', '019f5a00-0000-7000-8000-0000000000e4', true);
select payments.publish_platform_plan_version(
  '019f5a00-0000-7000-8000-0000000000e4', '019f5a00-0000-7000-8000-0000000000d4',
  :'pro_plan'::uuid, :'pro_version'::uuid,
  gen_random_uuid(), extensions.uuid_generate_v7(), extensions.gen_random_bytes(32));

-- Ana, the neighbour and Dora have Pro through the gym; Carla has no gym.
insert into organizations.organizations (id, type_code, display_name, responsible_party, claimed_at)
values ('019f5a00-0000-7000-8000-000000000301', 'gym', 'Gimnasio del resumen',
  '{"party_kind":"legal_entity","party_name":"Gimnasio del resumen SAS","purpose":"studio_operations"}',
  clock_timestamp());
insert into relationships.service_relationships (id, person_id, organization_id, status)
values ('019f5a00-0000-7000-8000-000000000401', '019f5a00-0000-7000-8000-000000000001',
         '019f5a00-0000-7000-8000-000000000301', 'active'),
       ('019f5a00-0000-7000-8000-000000000402', '019f5a00-0000-7000-8000-000000000002',
         '019f5a00-0000-7000-8000-000000000301', 'active'),
       ('019f5a00-0000-7000-8000-000000000404', '019f5a00-0000-7000-8000-000000000004',
         '019f5a00-0000-7000-8000-000000000301', 'active');

-- A text no migration will ever publish; Dora accepted none.
insert into intelligence.consent_versions (version) values ('2099-02-01'), ('2099-02-02');
insert into intelligence.consents (person_id, text_version)
values ('019f5a00-0000-7000-8000-000000000001', '2099-02-01'),
       ('019f5a00-0000-7000-8000-000000000002', '2099-02-01'),
       ('019f5a00-0000-7000-8000-000000000003', '2099-02-01');

insert into catalog.movements (id, discipline_code, name, normalized_name, content_scope, status)
values ('019f5a00-0000-7000-8000-0000000000a1', 'test_strength', 'Sentadilla del resumen', 'sentadilla del resumen', 'global', 'published'),
       ('019f5a00-0000-7000-8000-0000000000a2', 'test_strength', 'Press del resumen', 'press del resumen', 'global', 'published'),
       ('019f5a00-0000-7000-8000-0000000000a3', 'test_strength', 'Plancha del resumen', 'plancha del resumen', 'global', 'published');

-- The Monday her week starts on, in her zone.
create function pg_temp.monday()
returns date
language sql
stable
as $fn$ select date_trunc('week', clock_timestamp() at time zone 'America/Bogota')::date $fn$;

create function pg_temp.trained(p_id uuid, p_person uuid, p_start timestamp, p_minutes integer)
returns void
language sql
as $fn$
  insert into execution.executed_sessions (
    id, person_id, activity_type_id, result_contract_id, contract_version, is_autonomous,
    started_at, ended_at, timezone,
    execution_status, validation_status, requested_level, achieved_level, capture_source
  ) values (
    p_id, p_person, '019c0000-0000-7000-8000-000000000011', '019c0000-0000-7000-8000-000000000031', 1, true,
    p_start at time zone 'America/Bogota',
    (p_start + make_interval(mins => p_minutes)) at time zone 'America/Bogota', 'America/Bogota',
    'completed', 'valid', 'detailed', 'detailed', 'manual')
$fn$;

-- S0 two Sundays ago at 23:00: outside the two weeks, and heavy enough that no squat
-- after it is a record. S1 last Sunday at 23:00: already Monday in UTC, still her week
-- before. S2 this Monday. S3 annulled and S4 unfinished, this Monday. S5 is the neighbour's.
select pg_temp.trained('019f5a00-0000-7000-8000-000000000b00', '019f5a00-0000-7000-8000-000000000001',
  pg_temp.monday() - 8 + time '23:00', 40);
select pg_temp.trained('019f5a00-0000-7000-8000-000000000b01', '019f5a00-0000-7000-8000-000000000001',
  pg_temp.monday() - 1 + time '23:00', 50);
select pg_temp.trained('019f5a00-0000-7000-8000-000000000b02', '019f5a00-0000-7000-8000-000000000001',
  pg_temp.monday() + time '00:00', 55);
select pg_temp.trained('019f5a00-0000-7000-8000-000000000b03', '019f5a00-0000-7000-8000-000000000001',
  pg_temp.monday() + time '00:00', 30);
select pg_temp.trained('019f5a00-0000-7000-8000-000000000b04', '019f5a00-0000-7000-8000-000000000001',
  pg_temp.monday() + time '00:00', 30);
select pg_temp.trained('019f5a00-0000-7000-8000-000000000b05', '019f5a00-0000-7000-8000-000000000002',
  pg_temp.monday() - 1 + time '10:00', 45);
update execution.executed_sessions
set validation_status = 'annulled', annulled_at = clock_timestamp(), annulment_reason = 'duplicate'
where id = '019f5a00-0000-7000-8000-000000000b03';
update execution.executed_sessions set execution_status = 'in_progress', ended_at = null
where id = '019f5a00-0000-7000-8000-000000000b04';

insert into execution.session_exercises (id, executed_session_id, position, movement_id)
values
  ('019f5a00-0000-7000-8000-000000000c00', '019f5a00-0000-7000-8000-000000000b00', 1, '019f5a00-0000-7000-8000-0000000000a1'),
  ('019f5a00-0000-7000-8000-000000000c01', '019f5a00-0000-7000-8000-000000000b01', 1, '019f5a00-0000-7000-8000-0000000000a1'),
  ('019f5a00-0000-7000-8000-000000000c02', '019f5a00-0000-7000-8000-000000000b01', 2, '019f5a00-0000-7000-8000-0000000000a2'),
  ('019f5a00-0000-7000-8000-000000000c03', '019f5a00-0000-7000-8000-000000000b02', 1, '019f5a00-0000-7000-8000-0000000000a1'),
  ('019f5a00-0000-7000-8000-000000000c04', '019f5a00-0000-7000-8000-000000000b02', 2, '019f5a00-0000-7000-8000-0000000000a2'),
  ('019f5a00-0000-7000-8000-000000000c05', '019f5a00-0000-7000-8000-000000000b02', 3, '019f5a00-0000-7000-8000-0000000000a3'),
  ('019f5a00-0000-7000-8000-000000000c06', '019f5a00-0000-7000-8000-000000000b03', 1, '019f5a00-0000-7000-8000-0000000000a1'),
  ('019f5a00-0000-7000-8000-000000000c07', '019f5a00-0000-7000-8000-000000000b04', 1, '019f5a00-0000-7000-8000-0000000000a1'),
  ('019f5a00-0000-7000-8000-000000000c08', '019f5a00-0000-7000-8000-000000000b05', 1, '019f5a00-0000-7000-8000-0000000000a1');

insert into execution.strength_sets (
  executed_session_id, session_exercise_id, set_order, movement_id, kind, achieved_reps, load_value, load_unit_code)
values
  ('019f5a00-0000-7000-8000-000000000b00', '019f5a00-0000-7000-8000-000000000c00', 1, '019f5a00-0000-7000-8000-0000000000a1', 'normal', 5, 100, 'kg'),
  ('019f5a00-0000-7000-8000-000000000b00', '019f5a00-0000-7000-8000-000000000c00', 2, '019f5a00-0000-7000-8000-0000000000a1', 'normal', 5, 100, 'kg'),
  ('019f5a00-0000-7000-8000-000000000b01', '019f5a00-0000-7000-8000-000000000c01', 1, '019f5a00-0000-7000-8000-0000000000a1', 'warmup', 10, 40, 'kg'),
  ('019f5a00-0000-7000-8000-000000000b01', '019f5a00-0000-7000-8000-000000000c01', 2, '019f5a00-0000-7000-8000-0000000000a1', 'normal', 5, 80, 'kg'),
  ('019f5a00-0000-7000-8000-000000000b01', '019f5a00-0000-7000-8000-000000000c01', 3, '019f5a00-0000-7000-8000-0000000000a1', 'normal', 5, 80, 'kg'),
  ('019f5a00-0000-7000-8000-000000000b01', '019f5a00-0000-7000-8000-000000000c02', 4, '019f5a00-0000-7000-8000-0000000000a2', 'normal', 5, 50, 'kg'),
  ('019f5a00-0000-7000-8000-000000000b02', '019f5a00-0000-7000-8000-000000000c03', 1, '019f5a00-0000-7000-8000-0000000000a1', 'normal', 5, 82.5, 'kg'),
  ('019f5a00-0000-7000-8000-000000000b02', '019f5a00-0000-7000-8000-000000000c03', 2, '019f5a00-0000-7000-8000-0000000000a1', 'normal', 3, 85, 'kg'),
  ('019f5a00-0000-7000-8000-000000000b02', '019f5a00-0000-7000-8000-000000000c04', 3, '019f5a00-0000-7000-8000-0000000000a2', 'normal', 5, 52.5, 'kg'),
  ('019f5a00-0000-7000-8000-000000000b02', '019f5a00-0000-7000-8000-000000000c05', 4, '019f5a00-0000-7000-8000-0000000000a3', 'normal', 30, null, null),
  ('019f5a00-0000-7000-8000-000000000b03', '019f5a00-0000-7000-8000-000000000c06', 1, '019f5a00-0000-7000-8000-0000000000a1', 'normal', 1, 200, 'kg'),
  ('019f5a00-0000-7000-8000-000000000b04', '019f5a00-0000-7000-8000-000000000c07', 1, '019f5a00-0000-7000-8000-0000000000a1', 'normal', 1, 200, 'kg'),
  ('019f5a00-0000-7000-8000-000000000b05', '019f5a00-0000-7000-8000-000000000c08', 1, '019f5a00-0000-7000-8000-0000000000a1', 'normal', 5, 60, 'kg');

select set_config('app.actor_kind', 'person', true);
select set_config('app.actor_person_id', '019f5a00-0000-7000-8000-000000000001', true);

-- Two meals this Monday and one the week before, which says only its energy.
create function pg_temp.ate(p_day date, p_hour text, p_nutrients jsonb)
returns void
language sql
as $fn$
  select nutrition.record_meal('019f5a00-0000-7000-8000-000000000001',
    jsonb_build_object(
      'occurred_at', to_char(p_day, 'YYYY-MM-DD') || 'T' || p_hour || ':00-05:00',
      'timezone', 'America/Bogota', 'meal_type', 'lunch',
      'items', jsonb_build_array(jsonb_build_object('position', 1, 'name', 'Plato',
        'quantity', null, 'quantity_unit', null, 'nutrients', p_nutrients))),
    gen_random_uuid(), extensions.uuid_generate_v7(), extensions.gen_random_bytes(32))
$fn$;
select pg_temp.ate(pg_temp.monday(), '00:00',
  '[{"nutrient_code":"energy","value":600,"unit":"kcal"},{"nutrient_code":"protein","value":40,"unit":"g"}]');
select pg_temp.ate(pg_temp.monday(), '00:00', '[{"nutrient_code":"energy","value":500,"unit":"kcal"}]');
select pg_temp.ate(pg_temp.monday() - 6, '12:00', '[{"nutrient_code":"energy","value":500,"unit":"kcal"}]');

-- Her goal has a reason in her own words, and a target the summary does not speak of.
select nutrition.publish_self_goal_version('019f5a00-0000-7000-8000-000000000001', 'Quiero ganar fuerza',
  '[{"nutrient_code":"protein","mode":"minimum","minimum":140,"maximum":null,"exact":null,"unit":"g"},
    {"nutrient_code":"fiber","mode":"minimum","minimum":25,"maximum":null,"exact":null,"unit":"g"}]'::jsonb,
  gen_random_uuid(), extensions.uuid_generate_v7(), extensions.gen_random_bytes(32));

-- What a refusal says, or what else was raised.
create function pg_temp.refusal(p_sql text)
returns text
language plpgsql
as $fn$
declare
  detail text;
begin
  execute p_sql;
  return 'allowed';
exception when others then
  get stacked diagnostics detail = pg_exception_detail;
  return sqlstate || ':' || coalesce(detail, '');
end
$fn$;

-- Request n of a person: its key and its command follow from the number.
create function pg_temp.command(p_n integer)
returns uuid
language sql
immutable
as $fn$ select ('019f5a00-0000-7000-8000-0000009' || lpad(p_n::text, 5, '0'))::uuid $fn$;

create function pg_temp.ask(
  p_person uuid, p_week date, p_n integer, p_consent text default '2099-02-01', p_hash text default '5a'
)
returns jsonb
language sql
as $fn$
  select intelligence.begin_weekly_summary(p_person, p_week, 'America/Bogota', p_consent, 'weekly-summary/1',
    ('f8111111-1111-4111-8111-1111111' || lpad(p_n::text, 5, '0'))::uuid, pg_temp.command(p_n),
    decode(repeat(p_hash, 32), 'hex'))
$fn$;

create function pg_temp.written(p_overview text)
returns jsonb
language sql
immutable
as $fn$
  select jsonb_build_object('overview', p_overview, 'training', 'Entrenaste una vez.',
    'nutrition', 'Registraste un día.', 'changes', null,
    'sources', jsonb_build_array('training', 'nutrition', 'nutrition_goal'))
$fn$;

-- ———————————————————————————————— refused before anything is read

select is(
  pg_temp.refusal($$ select intelligence.begin_weekly_summary('019f5a00-0000-7000-8000-000000000001',
    pg_temp.monday(), 'Nowhere/Land', '2099-02-01', 'weekly-summary/1',
    gen_random_uuid(), extensions.uuid_generate_v7(), decode(repeat('5a', 32), 'hex')) $$),
  '22023:', 'T-ITL-SUMMARY-01 a zone that does not exist is refused');

select is(
  pg_temp.refusal($$ select pg_temp.ask('019f5a00-0000-7000-8000-000000000001', pg_temp.monday() - 14, 90) $$),
  '22023:', 'T-ITL-SUMMARY-02 a week older than the one before is refused');

select is(
  pg_temp.refusal($$ select pg_temp.ask('019f5a00-0000-7000-8000-000000000001', pg_temp.monday() + 1, 90) $$),
  '22023:', 'T-ITL-SUMMARY-03 and so is a day that is not the Monday of her week');

select is(
  pg_temp.refusal($$ select pg_temp.ask('019f5a00-0000-7000-8000-000000000001', pg_temp.monday(), 90, '2099-02-02') $$),
  'AF432:', 'T-ITL-SUMMARY-04 a consent to an earlier text is not the consent in force');

select set_config('app.actor_person_id', '019f5a00-0000-7000-8000-000000000004', true);
select is(
  pg_temp.refusal($$ select pg_temp.ask('019f5a00-0000-7000-8000-000000000004', pg_temp.monday(), 91) $$),
  'AF432:', 'T-ITL-SUMMARY-05 with Pro and no consent, nothing is asked');

select set_config('app.actor_person_id', '019f5a00-0000-7000-8000-000000000003', true);
select is(
  pg_temp.refusal($$ select pg_temp.ask('019f5a00-0000-7000-8000-000000000003', pg_temp.monday(), 92) $$),
  'AF402:weekly_summary', 'T-ITL-SUMMARY-06 with the consent and no Pro, the refusal names the function');

select is(
  (select count(*)::integer from intelligence.runs), 0,
  'T-ITL-SUMMARY-07 a refusal leaves no run');

select is(
  (select count(*)::integer from system.idempotency_keys where operation_code = 'OP-ITL-004'), 0,
  'T-ITL-SUMMARY-08 and holds no key, so the same request can be sent again once it may');

-- ———————————————————————————————— the week, read as herself (OP-ITL-004)

select set_config('app.actor_person_id', '019f5a00-0000-7000-8000-000000000001', true);

select pg_temp.ask('019f5a00-0000-7000-8000-000000000001', pg_temp.monday(), 1) as opened \gset

select is(
  :'opened'::jsonb - 'logged',
  jsonb_build_object('state', 'opened', 'run_id', pg_temp.command(1)),
  'T-ITL-SUMMARY-09 a request that may be made opens a run, and the run is the command');

select is(
  (:'opened'::jsonb->'logged') - 'sessions' - 'nutrition_days' - 'goal',
  jsonb_build_object('week_starts_on', pg_temp.monday(), 'in_progress', true),
  'T-ITL-SUMMARY-10 the current week says it is still running');

select is(
  :'opened'::jsonb->'logged'->'sessions',
  jsonb_build_array(
    jsonb_build_object('trained_on', pg_temp.monday() - 1, 'duration_seconds', 3000, 'exercises', jsonb_build_array(
      jsonb_build_object('movement_id', '019f5a00-0000-7000-8000-0000000000a1', 'name', 'Sentadilla del resumen',
        'work_sets', 2, 'best_set', jsonb_build_object('load_kg', 80, 'reps', 5), 'volume_kg', 800, 'record', false),
      jsonb_build_object('movement_id', '019f5a00-0000-7000-8000-0000000000a2', 'name', 'Press del resumen',
        'work_sets', 1, 'best_set', jsonb_build_object('load_kg', 50, 'reps', 5), 'volume_kg', 250, 'record', false))),
    jsonb_build_object('trained_on', pg_temp.monday(), 'duration_seconds', 3300, 'exercises', jsonb_build_array(
      jsonb_build_object('movement_id', '019f5a00-0000-7000-8000-0000000000a1', 'name', 'Sentadilla del resumen',
        'work_sets', 2, 'best_set', jsonb_build_object('load_kg', 82.5, 'reps', 5), 'volume_kg', 667.5, 'record', false),
      jsonb_build_object('movement_id', '019f5a00-0000-7000-8000-0000000000a2', 'name', 'Press del resumen',
        'work_sets', 1, 'best_set', jsonb_build_object('load_kg', 52.5, 'reps', 5), 'volume_kg', 262.5, 'record', true),
      jsonb_build_object('movement_id', '019f5a00-0000-7000-8000-0000000000a3', 'name', 'Plancha del resumen',
        'work_sets', 1, 'best_set', null, 'volume_kg', null, 'record', false)))),
  'T-ITL-SUMMARY-11 her finished sessions of the two weeks, by her own day: work sets, best set, kilograms and records');

select is(
  :'opened'::jsonb->'logged'->'nutrition_days',
  jsonb_build_array(
    jsonb_build_object('date', pg_temp.monday() - 6, 'meals', 1, 'energy_kcal', 500,
      'protein_g', null, 'carbohydrates_g', null, 'fat_g', null),
    jsonb_build_object('date', pg_temp.monday(), 'meals', 2, 'energy_kcal', 1100,
      'protein_g', 40, 'carbohydrates_g', null, 'fat_g', null)),
  'T-ITL-SUMMARY-12 the days she logged, and a nutrient nobody wrote stays unknown');

select is(
  :'opened'::jsonb->'logged'->'goal',
  '[{"nutrient": "protein", "minimum": 140, "maximum": null, "exact": null}]'::jsonb,
  'T-ITL-SUMMARY-13 of her goal, only the targets the summary speaks of');

select ok(
  :'opened' !~* 'Ana|Resumida|Quiero ganar fuerza|rationale|title|019f5a00-0000-7000-8000-000000000001',
  'T-ITL-SUMMARY-14 nothing read names her, and her own words stay where she wrote them');

select is(
  (select to_jsonb(run) - 'started_at' from intelligence.runs as run where run.id = pg_temp.command(1)),
  jsonb_build_object('id', pg_temp.command(1), 'capability', 'weekly-summary',
    'actor_person_id', '019f5a00-0000-7000-8000-000000000001',
    'subject_person_id', '019f5a00-0000-7000-8000-000000000001',
    'contract', 'weekly-summary/1', 'week_starts_on', pg_temp.monday(),
    'finished_at', null, 'outcome', null, 'model', null, 'input_tokens', null, 'output_tokens', null),
  'T-ITL-INT-09 the run is open while the model is asked: who, about whom, what and under which contract');

select is(
  (select array_agg(column_name::text order by ordinal_position) from information_schema.columns
   where table_schema = 'intelligence' and table_name = 'runs'),
  array['id', 'capability', 'actor_person_id', 'subject_person_id', 'contract', 'week_starts_on',
        'started_at', 'finished_at', 'outcome', 'model', 'input_tokens', 'output_tokens'],
  'T-ITL-INT-10 a run has no column for a context, a prompt or an answer');

-- ———————————————————————————————— the same request, again

select is(
  pg_temp.refusal($$ select pg_temp.ask('019f5a00-0000-7000-8000-000000000001', pg_temp.monday(), 1) $$),
  '40001:', 'T-ITL-IDEM-04 the same request while the model is asked waits for it');

select is(
  pg_temp.refusal($$ select pg_temp.ask('019f5a00-0000-7000-8000-000000000001', pg_temp.monday(), 1, '2099-02-01', '5b') $$),
  '23505:', 'T-ITL-IDEM-05 the same key for another request is refused');

select intelligence.finish_weekly_summary('019f5a00-0000-7000-8000-000000000001', pg_temp.command(1),
  'answered', 'bedrock/us.anthropic.test-model', 1840, 96, pg_temp.written('Primera versión.')) as first \gset

select is(
  :'first'::jsonb - 'generated_at',
  jsonb_build_object('week_starts_on', pg_temp.monday(), 'overview', 'Primera versión.',
    'training', 'Entrenaste una vez.', 'nutrition', 'Registraste un día.', 'changes', null,
    'sources', jsonb_build_array('training', 'nutrition', 'nutrition_goal'),
    'model', 'bedrock/us.anthropic.test-model'),
  'T-ITL-SUMMARY-15 an answered run keeps the summary, its sources and the exact model');

select is(
  (select jsonb_build_object('outcome', outcome, 'model', model, 'in', input_tokens, 'out', output_tokens,
     'ended', finished_at is not null)
   from intelligence.runs where id = pg_temp.command(1)),
  '{"outcome": "answered", "model": "bedrock/us.anthropic.test-model", "in": 1840, "out": 96, "ended": true}'::jsonb,
  'T-ITL-INT-11 and the run ends with its outcome, its model and its tokens');

select is(
  pg_temp.ask('019f5a00-0000-7000-8000-000000000001', pg_temp.monday(), 1) - 'renews_at',
  jsonb_build_object('state', 'replayed', 'outcome', 'answered', 'week_starts_on', pg_temp.monday()),
  'T-ITL-IDEM-06 the same request afterwards answers what its run became');

select is(
  (select count(*)::integer from intelligence.runs), 1,
  'T-ITL-IDEM-06 and opens no second run');

select is(
  intelligence.finish_weekly_summary('019f5a00-0000-7000-8000-000000000001', pg_temp.command(1),
    'unavailable', null, null, null, null),
  :'first'::jsonb, 'T-ITL-SUMMARY-16 closing a run twice changes nothing');

select is(
  intelligence.read_weekly_summary('019f5a00-0000-7000-8000-000000000001', pg_temp.monday()),
  :'first'::jsonb, 'T-ITL-SUMMARY-17 she reads the summary of that week');

-- ———————————————————————————————— asking again, and the week before

select pg_temp.ask('019f5a00-0000-7000-8000-000000000001', pg_temp.monday(), 2);
select intelligence.finish_weekly_summary('019f5a00-0000-7000-8000-000000000001', pg_temp.command(2),
  'answered', 'bedrock/us.anthropic.test-model', 1900, 80, pg_temp.written('Segunda versión.'));

select is(
  (select jsonb_agg(jsonb_build_object('overview', overview, 'run', run_id))
   from intelligence.weekly_summaries where person_id = '019f5a00-0000-7000-8000-000000000001'),
  jsonb_build_array(jsonb_build_object('overview', 'Segunda versión.', 'run', pg_temp.command(2))),
  'T-ITL-INT-12 asking again replaces it: a week keeps one summary, the last one written');

select is(
  (pg_temp.ask('019f5a00-0000-7000-8000-000000000001', pg_temp.monday() - 7, 3)->'logged')
    - 'sessions' - 'nutrition_days' - 'goal',
  jsonb_build_object('week_starts_on', pg_temp.monday() - 7, 'in_progress', false),
  'T-ITL-SUMMARY-18 the week before can be asked for, and it is over');
select intelligence.finish_weekly_summary('019f5a00-0000-7000-8000-000000000001', pg_temp.command(3),
  'answered', 'bedrock/us.anthropic.test-model', 1700, 70, pg_temp.written('La semana anterior.'));

-- ———————————————————————————————— her list (OP-ITL-005)

select is(
  (select jsonb_agg(item->'overview') from jsonb_array_elements(
     intelligence.list_weekly_summaries('019f5a00-0000-7000-8000-000000000001', null, 20)->'data') as item),
  '["Segunda versión.", "La semana anterior."]'::jsonb,
  'T-ITL-SUMMARY-19 her summaries, the latest week first');

select is(
  intelligence.list_weekly_summaries('019f5a00-0000-7000-8000-000000000001', null, 20)->'page',
  '{"next_cursor": null, "has_more": false}'::jsonb,
  'T-ITL-SUMMARY-20 a list that ends says so');

select is(
  intelligence.list_weekly_summaries('019f5a00-0000-7000-8000-000000000001', null, 1)->'page',
  jsonb_build_object('next_cursor', pg_temp.monday(), 'has_more', true),
  'T-ITL-SUMMARY-21 a page that does not end says where the next one starts');

select is(
  (select jsonb_agg(item->'overview') from jsonb_array_elements(
     intelligence.list_weekly_summaries('019f5a00-0000-7000-8000-000000000001', pg_temp.monday(), 1)->'data') as item),
  '["La semana anterior."]'::jsonb,
  'T-ITL-SUMMARY-22 and the next page starts there');

-- ———————————————————————————————— the ceiling: four that stand in her week

select pg_temp.ask('019f5a00-0000-7000-8000-000000000001', pg_temp.monday(), 4);
select is(
  intelligence.finish_weekly_summary('019f5a00-0000-7000-8000-000000000001', pg_temp.command(4),
    'unavailable', 'bedrock/us.anthropic.test-model', null, null, null),
  null, 'T-ITL-SUMMARY-23 a run the model failed keeps no summary');

select is(
  pg_temp.ask('019f5a00-0000-7000-8000-000000000001', pg_temp.monday(), 5)->>'state',
  'opened', 'T-ITL-SUMMARY-24 and takes no place under the ceiling: three stand, the fourth opens');

select pg_temp.ask('019f5a00-0000-7000-8000-000000000001', pg_temp.monday(), 6) as over \gset

select is(
  :'over'::jsonb,
  jsonb_build_object('state', 'over-ceiling',
    'renews_at', ((pg_temp.monday() + 7)::timestamp at time zone 'America/Bogota')),
  'T-ITL-SUMMARY-25 a fifth while the fourth is still asked is over the ceiling, until her next Monday, and reads nothing');

select is(
  (select jsonb_build_object('outcome', outcome, 'ended', finished_at is not null, 'model', model)
   from intelligence.runs where id = pg_temp.command(6)),
  '{"outcome": "over-ceiling", "ended": true, "model": null}'::jsonb,
  'T-ITL-INT-13 the refusal is a run of its own, ended as it began');

select is(
  pg_temp.ask('019f5a00-0000-7000-8000-000000000001', pg_temp.monday(), 6)->>'outcome',
  'over-ceiling', 'T-ITL-IDEM-07 the refused request, sent again, is refused the same way');

-- The process that opened run 5 died ten minutes ago and never closed it.
set local session_replication_role = replica;
update intelligence.runs set started_at = started_at - interval '10 minutes' where id = pg_temp.command(5);
set local session_replication_role = origin;

select is(
  pg_temp.ask('019f5a00-0000-7000-8000-000000000001', pg_temp.monday(), 7)->>'state',
  'opened', 'T-ITL-SUMMARY-26 a run nobody closed stops holding its place');

select is(
  (select outcome from intelligence.runs where id = pg_temp.command(5)),
  'unavailable', 'T-ITL-INT-14 and ends as a failure');

select is(
  pg_temp.ask('019f5a00-0000-7000-8000-000000000001', pg_temp.monday(), 5)->>'outcome',
  'unavailable', 'T-ITL-IDEM-08 so its request, sent again, is answered and no longer waits');

select intelligence.finish_weekly_summary('019f5a00-0000-7000-8000-000000000001', pg_temp.command(7),
  'refused', 'bedrock/us.anthropic.test-model', 1840, 40, null);

select is(
  (select jsonb_build_object('outcome', outcome, 'in', input_tokens, 'out', output_tokens)
   from intelligence.runs where id = pg_temp.command(7)),
  '{"outcome": "refused", "in": 1840, "out": 40}'::jsonb,
  'T-ITL-SUMMARY-27 an answer that was refused still records what it cost');

select pg_temp.ask('019f5a00-0000-7000-8000-000000000001', pg_temp.monday(), 8);
select intelligence.finish_weekly_summary('019f5a00-0000-7000-8000-000000000001', pg_temp.command(8),
  'answered', 'bedrock/us.anthropic.test-model', 1800, 90, pg_temp.written('Cuarta que vale.'));

select is(
  pg_temp.ask('019f5a00-0000-7000-8000-000000000001', pg_temp.monday() - 7, 9)->>'state',
  'over-ceiling', 'T-ITL-SUMMARY-28 four answered is the ceiling, whichever week they were about');

-- ———————————————————————————————— a week with nothing in it, and how a run may end

select set_config('app.actor_person_id', '019f5a00-0000-7000-8000-000000000002', true);

select pg_temp.ask('019f5a00-0000-7000-8000-000000000002', pg_temp.monday(), 21) as hers \gset

select is(
  jsonb_build_object(
    'days', (select array_agg(session->>'trained_on') from jsonb_array_elements(:'hers'::jsonb->'logged'->'sessions') as session),
    'meals', :'hers'::jsonb->'logged'->'nutrition_days', 'goal', :'hers'::jsonb->'logged'->'goal'),
  jsonb_build_object('days', array[(pg_temp.monday() - 1)::text], 'meals', '[]'::jsonb, 'goal', '[]'::jsonb),
  'T-ITL-SUMMARY-29 the neighbour reads her own week: one session, the week before, and nothing of Ana''s');

select is(
  intelligence.finish_weekly_summary('019f5a00-0000-7000-8000-000000000002', pg_temp.command(21),
    'nothing-logged', null, null, null, null),
  null, 'T-ITL-SUMMARY-30 a week with nothing logged ends its run without a model');

select is(
  (select jsonb_build_object('outcome', outcome, 'model', model) from intelligence.runs
   where id = pg_temp.command(21)),
  '{"outcome": "nothing-logged", "model": null}'::jsonb,
  'T-ITL-INT-15 and the run says so');

select pg_temp.ask('019f5a00-0000-7000-8000-000000000002', pg_temp.monday() - 7, 22);

select is(
  pg_temp.refusal($$ select intelligence.finish_weekly_summary('019f5a00-0000-7000-8000-000000000002',
    pg_temp.command(22), 'answered', 'bedrock/us.anthropic.test-model', 1, 1, null) $$),
  '22023:', 'T-ITL-SUMMARY-31 answered without a summary is not an ending');

select is(
  pg_temp.refusal($$ select intelligence.finish_weekly_summary('019f5a00-0000-7000-8000-000000000002',
    pg_temp.command(22), 'unavailable', null, null, null, pg_temp.written('No debería.')) $$),
  '22023:', 'T-ITL-SUMMARY-32 nor is a failure with one');

select is(
  pg_temp.refusal($$ select intelligence.finish_weekly_summary('019f5a00-0000-7000-8000-000000000002',
    pg_temp.command(22), 'over-ceiling', null, null, null, null) $$),
  '22023:', 'T-ITL-SUMMARY-33 over the ceiling is the database''s to say, never the API''s');

select throws_ok(
  $$ select intelligence.finish_weekly_summary('019f5a00-0000-7000-8000-000000000002',
       pg_temp.command(22), 'answered', null, 1, 1, pg_temp.written('Sin modelo.')) $$,
  '23514', null, 'T-ITL-INT-16 an answer is always of an exact model');

select throws_ok(
  $$ select intelligence.finish_weekly_summary('019f5a00-0000-7000-8000-000000000002',
       pg_temp.command(22), 'answered', 'bedrock/us.anthropic.test-model', 1, 1,
       pg_temp.written('Con parte de más.') || '{"sources": ["training"]}') $$,
  '23514', null, 'T-ITL-INT-17 a summary speaks of nutrition only when nutrition was read');

select is(
  pg_temp.refusal($$ select intelligence.finish_weekly_summary('019f5a00-0000-7000-8000-000000000002',
    extensions.uuid_generate_v7(), 'unavailable', null, null, null, null) $$),
  'P0002:', 'T-ITL-SUMMARY-34 a run that does not exist cannot be closed');

-- ———————————————————————————————— deleting one (OP-ITL-006)

select set_config('app.actor_person_id', '019f5a00-0000-7000-8000-000000000001', true);

select intelligence.delete_weekly_summary('019f5a00-0000-7000-8000-000000000001', pg_temp.monday() - 7,
  'f8111111-1111-4111-8111-111111100031', pg_temp.command(31), decode(repeat('61', 32), 'hex'));

select is(
  (select array_agg(week_starts_on) from intelligence.weekly_summaries
   where person_id = '019f5a00-0000-7000-8000-000000000001'),
  array[pg_temp.monday()], 'T-ITL-SUMMARY-35 she deletes a summary, and only that one goes');

select lives_ok(
  $$ select intelligence.delete_weekly_summary('019f5a00-0000-7000-8000-000000000001', pg_temp.monday() - 7,
       'f8111111-1111-4111-8111-111111100031', pg_temp.command(31), decode(repeat('61', 32), 'hex')) $$,
  'T-ITL-IDEM-09 deleting it again with the same key succeeds');

select is(
  (select count(*)::integer from intelligence.weekly_summaries
   where person_id = '019f5a00-0000-7000-8000-000000000001'),
  1, 'T-ITL-IDEM-09 and deletes nothing more');

select is(
  pg_temp.refusal($$ select intelligence.delete_weekly_summary('019f5a00-0000-7000-8000-000000000001', pg_temp.monday(),
    'f8111111-1111-4111-8111-111111100031', pg_temp.command(31), decode(repeat('62', 32), 'hex')) $$),
  '23505:', 'T-ITL-IDEM-10 the same key for another week is refused');

select is(
  pg_temp.refusal($$ select intelligence.delete_weekly_summary('019f5a00-0000-7000-8000-000000000001', pg_temp.monday() - 7,
    'f8111111-1111-4111-8111-111111100032', pg_temp.command(32), decode(repeat('63', 32), 'hex')) $$),
  'P0002:', 'T-ITL-SUMMARY-36 a week without a summary has nothing to delete');

select is(
  jsonb_build_object(
    'replay', pg_temp.ask('019f5a00-0000-7000-8000-000000000001', pg_temp.monday() - 7, 3)->'outcome',
    'kept', intelligence.read_weekly_summary('019f5a00-0000-7000-8000-000000000001', pg_temp.monday() - 7)),
  '{"replay": "answered", "kept": null}'::jsonb,
  'T-ITL-SUMMARY-37 the request that wrote it, sent again, finds its run and no summary: it is not written again');

select is(
  (select count(*)::integer from intelligence.runs where actor_person_id = '019f5a00-0000-7000-8000-000000000001'),
  9, 'T-ITL-INT-18 deleting a summary deletes no run: what happened stays');

-- ———————————————————————————————— the neighbour

select set_config('app.actor_person_id', '019f5a00-0000-7000-8000-000000000002', true);

select is(
  pg_temp.refusal($$ select execution.read_my_sessions_between('019f5a00-0000-7000-8000-000000000001',
    'America/Bogota', pg_temp.monday() - 7, pg_temp.monday() + 6) $$),
  '42501:', 'T-ITL-RLS-08 the neighbour does not read Ana''s sessions through the summary''s reader');

select is(
  pg_temp.refusal($$ select pg_temp.ask('019f5a00-0000-7000-8000-000000000001', pg_temp.monday(), 41) $$),
  '42501:', 'T-ITL-RLS-09 nor asks for Ana''s summary');

select is(
  pg_temp.refusal($$ select intelligence.finish_weekly_summary('019f5a00-0000-7000-8000-000000000001',
    pg_temp.command(8), 'unavailable', null, null, null, null) $$),
  '42501:', 'T-ITL-RLS-10 nor closes a run in her name');

select is(
  pg_temp.refusal($$ select intelligence.finish_weekly_summary('019f5a00-0000-7000-8000-000000000002',
    pg_temp.command(8), 'unavailable', null, null, null, null) $$),
  'P0002:', 'T-ITL-RLS-11 and Ana''s run is not there for her to close as herself');

select is(
  jsonb_build_object(
    'one', intelligence.read_weekly_summary('019f5a00-0000-7000-8000-000000000001', pg_temp.monday()),
    'list', intelligence.list_weekly_summaries('019f5a00-0000-7000-8000-000000000001', null, 20)->'data'),
  '{"one": null, "list": []}'::jsonb,
  'T-ITL-RLS-12 she reads none of Ana''s summaries, one by one or listed');

select is(
  pg_temp.refusal($$ select intelligence.delete_weekly_summary('019f5a00-0000-7000-8000-000000000001', pg_temp.monday(),
    'f8111111-1111-4111-8111-111111100042', pg_temp.command(42), decode(repeat('64', 32), 'hex')) $$),
  '42501:', 'T-ITL-RLS-13 nor deletes one');

select pg_temp.monday() as monday, pg_temp.command(22) as open_run, pg_temp.command(8) as ended_run \gset

set local role allfit_owner;

select is(
  (select count(*)::integer from intelligence.runs
   where actor_person_id = '019f5a00-0000-7000-8000-000000000001')
  + (select count(*)::integer from intelligence.weekly_summaries
     where person_id = '019f5a00-0000-7000-8000-000000000001'),
  0, 'T-ITL-RLS-14 straight at the tables, the neighbour sees no run and no summary of Ana''s');

select set_config('app.actor_person_id', '019f5a00-0000-7000-8000-000000000001', true);

select is(
  array[(select count(*)::integer from intelligence.runs), (select count(*)::integer from intelligence.weekly_summaries)],
  array[9, 1], 'T-ITL-RLS-15 and Ana sees her own, to prove the neighbour''s zero is the policy');

delete from intelligence.runs;
select is(
  (select count(*)::integer from intelligence.runs), 9,
  'T-ITL-RLS-16 no policy lets a run be deleted, not even her own');

set local role allfit_api;

select throws_ok(
  $$ select count(*) from intelligence.runs $$,
  '42501', null, 'T-ITL-RLS-17 the runtime role has no privilege on the runs');

select throws_ok(
  $$ select count(*) from intelligence.weekly_summaries $$,
  '42501', null, 'T-ITL-RLS-18 nor on the summaries');

select throws_ok(
  format($$ select execution.read_my_sessions_between('019f5a00-0000-7000-8000-000000000001',
    'America/Bogota', %L::date - 7, %L::date + 6) $$, :'monday', :'monday'),
  '42501', null, 'T-ITL-RLS-19 nor a way to the summary''s reader: only the summary calls it');

-- ———————————————————————————————— what happened, with every policy out of the way

reset role;

select throws_ok(
  format($$ delete from intelligence.runs where id = %L $$, :'ended_run'),
  '42501', null, 'T-ITL-INT-19 a run is never deleted, whoever asks');

select throws_ok(
  format($$ update intelligence.runs set outcome = 'answered' where id = %L $$, :'ended_run'),
  '42501', null, 'T-ITL-INT-20 a run that ended does not end again');

select throws_ok(
  format($$ update intelligence.runs set week_starts_on = week_starts_on - 7 where id = %L $$, :'open_run'),
  '42501', null, 'T-ITL-INT-21 an open run changes only by ending');

select throws_ok(
  format($$ update intelligence.runs
            set outcome = 'unavailable', finished_at = clock_timestamp(),
                actor_person_id = '019f5a00-0000-7000-8000-000000000001'
            where id = %L $$, :'open_run'),
  '42501', null, 'T-ITL-INT-22 and ending it does not change who asked');

select * from finish();
rollback;
