-- T-PRV-HOLD-02 — HU-BO-033 criteria 1, 3 and 4: a legal hold that keeps what it names.
--
-- T-PRV-HOLD-01 proves who may hold and release. This file proves that holding works.
--
-- **A hold names a person and kinds of data, before anyone asks to delete them.** A
-- person's own deletion used to open its disposition and run it in the same
-- transaction, so nothing ever waited for a hold to stop: the person could delete
-- exactly what the hold existed to keep. Now the deletion looks for a live hold over
-- that person's data of that kind; under one, the record stays, the disposition waits
-- suspended, and the person is told why and until when.
--
-- **There are no indefinite holds.** A hold stops holding at `valid_to` whether or not
-- the sweep has run: an expired hold suspends nothing new, and the worker lapses it and
-- lets what it held continue. Another live hold over the same data takes it over
-- instead, so renewing an order never opens a gap.
--
-- **Released, the deletion follows its course.** What a hold lets go waits as pending
-- and the privacy worker executes it: the record goes, the case closes, and the
-- execution is attributed to the worker. The worker reaches a meal only while a due
-- disposition names it.

begin;

select plan(43);

-- ---------------------------------------------------------------------------
-- People, sessions, roles and duties
-- ---------------------------------------------------------------------------

insert into identity.people (id, given_name, family_name, status)
values
  ('019af000-0000-7000-8000-000000000001', 'Manager', 'Alpha', 'active'),
  ('019af000-0000-7000-8000-000000000002', 'Manager', 'Beta', 'active'),
  ('019af000-0000-7000-8000-000000000003', 'Officer', 'Gamma', 'active'),
  ('019af000-0000-7000-8000-000000000004', 'Operator', 'Delta', 'active'),
  ('019af000-0000-7000-8000-000000000007', 'Officer', 'Theta', 'active'),
  ('019af000-0000-7000-8000-000000000005', 'Subject', 'Zeta', 'active'),
  ('019af000-0000-7000-8000-000000000006', 'Subject', 'Eta', 'active');

insert into identity.access_accounts (id, provider, issuer, subject, person_id)
values
  ('019af000-0000-7000-8000-000000000011', 'workos', 'https://issuer.test', 'alphaK', null),
  ('019af000-0000-7000-8000-000000000012', 'workos', 'https://issuer.test', 'betaK', null),
  ('019af000-0000-7000-8000-000000000013', 'workos', 'https://issuer.test', 'gammaK',
    '019af000-0000-7000-8000-000000000003'),
  ('019af000-0000-7000-8000-000000000014', 'workos', 'https://issuer.test', 'deltaK',
    '019af000-0000-7000-8000-000000000004'),
  ('019af000-0000-7000-8000-000000000017', 'workos', 'https://issuer.test', 'thetaK',
    '019af000-0000-7000-8000-000000000007'),
  ('019af000-0000-7000-8000-000000000015', 'workos', 'https://issuer.test', 'zetaK',
    '019af000-0000-7000-8000-000000000005');

select support.bootstrap_backoffice_administrators(
  '019af000-0000-7000-8000-000000000001', 'alphaK',
  '019af000-0000-7000-8000-000000000002', 'betaK',
  'https://issuer.test', clock_timestamp() + interval '30 days', 'CEREMONY-HOLD-02'
);

insert into identity.access_sessions (
  id, access_account_id, provider_session_id, surface, token_hash, token_ciphertext,
  access_token_expires_at, assurance_level, authentication_method,
  assurance_verified_at, last_activity_at, absolute_expires_at
)
select
  session_id, account_id, 'sid_' || suffix, 'backoffice', decode(repeat(hash_byte, 32), 'hex'),
  'v1.' || suffix, clock_timestamp() + interval '5 minutes', 2, 'password_totp',
  clock_timestamp(), clock_timestamp(), clock_timestamp() + interval '8 hours'
from (values
  ('019af000-0000-7000-8000-000000000021'::uuid, '019af000-0000-7000-8000-000000000011'::uuid,
    'alphaK', 'f1'),
  ('019af000-0000-7000-8000-000000000023'::uuid, '019af000-0000-7000-8000-000000000013'::uuid,
    'gammaK', 'f3'),
  ('019af000-0000-7000-8000-000000000024'::uuid, '019af000-0000-7000-8000-000000000014'::uuid,
    'deltaK', 'f4'),
  ('019af000-0000-7000-8000-000000000027'::uuid, '019af000-0000-7000-8000-000000000017'::uuid,
    'thetaK', 'f7')
) as session_row(session_id, account_id, suffix, hash_byte);

select support.assign_platform_role(
  '019af000-0000-7000-8000-000000000001', '019af000-0000-7000-8000-000000000021',
  person_id, 'allfit_admin', key, command, decode(repeat(hash_byte, 32), 'hex')
)
from (values
  ('019af000-0000-7000-8000-000000000003'::uuid, '019af000-0000-7000-8000-000000000103'::uuid,
    '019af000-0000-7000-8000-000000000203'::uuid, 'c3'),
  ('019af000-0000-7000-8000-000000000004'::uuid, '019af000-0000-7000-8000-000000000104'::uuid,
    '019af000-0000-7000-8000-000000000204'::uuid, 'c4'),
  ('019af000-0000-7000-8000-000000000007'::uuid, '019af000-0000-7000-8000-000000000107'::uuid,
    '019af000-0000-7000-8000-000000000207'::uuid, 'c7')
) as grant_row(person_id, key, command, hash_byte);

select support.assign_platform_duty(
  '019af000-0000-7000-8000-000000000001', '019af000-0000-7000-8000-000000000021',
  person_id, 'manage_privacy_requests', clock_timestamp(),
  clock_timestamp() + interval '30 days', 'CASE-HOLD-02', key, command,
  decode(repeat(hash_byte, 32), 'hex')
)
from (values
  ('019af000-0000-7000-8000-000000000003'::uuid, '019af000-0000-7000-8000-000000000113'::uuid,
    '019af000-0000-7000-8000-000000000213'::uuid, 'd3'),
  ('019af000-0000-7000-8000-000000000007'::uuid, '019af000-0000-7000-8000-000000000117'::uuid,
    '019af000-0000-7000-8000-000000000217'::uuid, 'd7')
) as duty_row(person_id, key, command, hash_byte);

-- ---------------------------------------------------------------------------
-- What Zeta recorded
-- ---------------------------------------------------------------------------

insert into identity.body_progress_records (
  id, person_id, metric_code, value_numeric, unit_code, measured_on
) values
  ('019af000-0000-7000-8000-000000000301', '019af000-0000-7000-8000-000000000005',
    'body_weight', 70, 'kg', date '2026-10-01'),
  ('019af000-0000-7000-8000-000000000302', '019af000-0000-7000-8000-000000000005',
    'waist', 80, 'cm', date '2026-10-01');

insert into identity.health_context_claims (
  id, person_id, context_type, description, body_area, provenance, valid_from
) values (
  '019af000-0000-7000-8000-000000000401', '019af000-0000-7000-8000-000000000005',
  'pain', 'Molestia declarada', 'knee', 'person_declared', clock_timestamp()
);

insert into nutrition.meals (
  id, person_id, occurred_at, timezone, local_date, meal_type, media_ref, has_media
) values
  ('019af000-0000-7000-8000-000000000501', '019af000-0000-7000-8000-000000000005',
    timestamptz '2026-10-01 17:00:00+00', 'America/Bogota', date '2026-10-01', 'lunch',
    'nutrition/019af000-0000-7000-8000-000000000005/019af000-0000-7000-8000-000000000501/a.jpg',
    true),
  ('019af000-0000-7000-8000-000000000502', '019af000-0000-7000-8000-000000000005',
    timestamptz '2026-10-02 17:00:00+00', 'America/Bogota', date '2026-10-02', 'lunch',
    null, false);

-- How Space reaches each deletion: body and health by the token's subject, a meal with
-- the person already resolved and set as the actor.
create function pg_temp.forget_body(p_record uuid, p_key uuid, p_command uuid, p_hash text)
returns table (result jsonb, replayed boolean)
language sql as $fn$
  select * from identity.delete_body_progress(
    'workos', 'https://issuer.test', 'zetaK', p_record, p_key, p_command,
    decode(repeat(p_hash, 32), 'hex')
  )
$fn$;

create function pg_temp.forget_claim(p_claim uuid, p_key uuid, p_command uuid, p_hash text)
returns table (result jsonb, replayed boolean)
language sql as $fn$
  select * from identity.delete_health_context(
    'workos', 'https://issuer.test', 'zetaK', p_claim, p_key, p_command,
    decode(repeat(p_hash, 32), 'hex')
  )
$fn$;

create function pg_temp.forget_meal(p_meal uuid, p_key uuid, p_command uuid, p_hash text)
returns jsonb
language plpgsql as $fn$
begin
  perform set_config('app.actor_kind', 'person', true);
  perform set_config('app.actor_person_id', '019af000-0000-7000-8000-000000000005', true);
  return nutrition.delete_meal(
    '019af000-0000-7000-8000-000000000005', p_meal, p_key, p_command,
    decode(repeat(p_hash, 32), 'hex')
  );
end
$fn$;

create function pg_temp.as_worker() returns void
language sql as $fn$
  select set_config('app.actor_kind', 'worker', true);
  select set_config('app.actor_person_id', '', true);
$fn$;

-- ---------------------------------------------------------------------------
-- Criterion 1 — a hold names a person and kinds of data
-- ---------------------------------------------------------------------------

select throws_ok(
  $$ select * from privacy.apply_legal_hold(
    '019af000-0000-7000-8000-000000000003', '019af000-0000-7000-8000-000000000023',
    'Historial de entrenamiento', 'judicial_order', 'JUZGADO-2026-300',
    clock_timestamp() + interval '90 days',
    '019af000-0000-7000-8000-000000000005', array['training'],
    '019af000-0000-4000-8000-000000000900', '019af000-0000-7000-8000-000000000a00',
    decode(repeat('90', 32), 'hex')
  ) $$,
  '22023',
  null,
  'a hold over data nothing here disposes of is refused: it would promise what no deletion reaches'
);

select throws_ok(
  $$ select * from privacy.apply_legal_hold(
    '019af000-0000-7000-8000-000000000003', '019af000-0000-7000-8000-000000000023',
    'Mediciones', 'judicial_order', 'JUZGADO-2026-300',
    clock_timestamp() + interval '90 days',
    '019af000-0000-7000-8000-000000000999', array['body'],
    '019af000-0000-4000-8000-000000000901', '019af000-0000-7000-8000-000000000a01',
    decode(repeat('91', 32), 'hex')
  ) $$,
  'P0002',
  null,
  'a hold over somebody who does not exist is refused, not filed empty'
);

create temporary table first_hold on commit drop as
select * from privacy.apply_legal_hold(
  '019af000-0000-7000-8000-000000000003', '019af000-0000-7000-8000-000000000023',
  'Mediciones y comidas del expediente 2026-301', 'judicial_order', 'JUZGADO-2026-301',
  clock_timestamp() + interval '90 days',
  '019af000-0000-7000-8000-000000000005', array['nutrition', 'body'],
  '019af000-0000-4000-8000-000000000902', '019af000-0000-7000-8000-000000000a02',
  decode(repeat('92', 32), 'hex')
);

select results_eq(
  $$ select result->>'subject_person_id', result->'data_classification_codes',
            (result->>'suspended_items')::int, result->>'status'
     from first_hold $$,
  $$ values ('019af000-0000-7000-8000-000000000005'::text, '["body", "nutrition"]'::jsonb, 0,
             'active'::text) $$,
  'the hold names whose data and which kinds, and stops nothing yet because nothing waited'
);

-- ---------------------------------------------------------------------------
-- Criterion 3 — the person's own deletion, under a live hold
-- ---------------------------------------------------------------------------

create temporary table held_body on commit drop as
select * from pg_temp.forget_body(
  '019af000-0000-7000-8000-000000000301',
  '019af000-0000-4000-8000-000000000910', '019af000-0000-7000-8000-000000000a10', 'a0'
);

select is(
  (select result->>'status' from held_body),
  'suspended',
  'deleting held data answers that the deletion is suspended, not that it happened'
);

select results_eq(
  $$ select result->'hold'->>'reason_code',
            date_trunc('day', (result->'hold'->>'valid_to')::timestamptz)
     from held_body $$,
  $$ values ('judicial_order'::text, date_trunc('day', clock_timestamp() + interval '90 days')) $$,
  'and tells the person on what ground and until when'
);

select is(
  (select array_agg(field order by field) from held_body, jsonb_object_keys(result->'hold') as field),
  array['reason_code', 'valid_to']::text[],
  'and nothing else about the hold: not the case, its scope or who applied it'
);

select is(
  (select count(*)::int from identity.body_progress_records
    where id = '019af000-0000-7000-8000-000000000301'),
  1,
  'the measurement stays'
);

select results_eq(
  $$ select item.status::text, dcase.status, application.legal_hold_id
     from privacy.disposition_items as item
     join privacy.disposition_cases as dcase on dcase.id = item.disposition_case_id
     join privacy.hold_applications as application
       on application.disposition_item_id = item.id and application.status = 'active'
     where item.target_body_progress_id = '019af000-0000-7000-8000-000000000301' $$,
  $$ select 'suspended'::text, 'open'::text, (result->>'id')::uuid from first_hold $$,
  'its disposition waits suspended in an open case, under the hold that stopped it'
);

select throws_ok(
  $$ delete from identity.body_progress_records
     where id = '019af000-0000-7000-8000-000000000301' $$,
  '23503',
  null,
  'and nothing deletes the measurement around the hold: its disposition still names it'
);

create temporary table asked_again on commit drop as
select * from pg_temp.forget_body(
  '019af000-0000-7000-8000-000000000301',
  '019af000-0000-4000-8000-000000000911', '019af000-0000-7000-8000-000000000a11', 'a1'
);

select results_eq(
  $$ select (select result->>'disposition_case_id' from asked_again),
            (select count(*)::int from privacy.disposition_items
              where subject_person_id = '019af000-0000-7000-8000-000000000005'
                and data_classification_code = 'body') $$,
  $$ select result->>'disposition_case_id', 1 from held_body $$,
  'asking again answers the same case instead of opening another'
);

select results_eq(
  $$ select result->>'status', replayed
     from pg_temp.forget_body(
       '019af000-0000-7000-8000-000000000301',
       '019af000-0000-4000-8000-000000000910', '019af000-0000-7000-8000-000000000a10', 'a0'
     ) $$,
  $$ values ('suspended'::text, true) $$,
  'a retried request answers what is true: still suspended'
);

create temporary table forgotten_claim on commit drop as
select * from pg_temp.forget_claim(
  '019af000-0000-7000-8000-000000000401',
  '019af000-0000-4000-8000-000000000912', '019af000-0000-7000-8000-000000000a12', 'a2'
);

select results_eq(
  $$ select result->>'status',
            (select count(*)::int from identity.health_context_claims
              where id = '019af000-0000-7000-8000-000000000401')
     from forgotten_claim $$,
  $$ values ('deleted'::text, 0) $$,
  'data of a kind the hold does not name is deleted at once, as before'
);

create temporary table held_meal on commit drop as
select pg_temp.forget_meal(
  '019af000-0000-7000-8000-000000000501',
  '019af000-0000-4000-8000-000000000913', '019af000-0000-7000-8000-000000000a13', 'a3'
) as result;

select results_eq(
  $$ select result->'deleted', result->'disposed_media_ref', result->'hold'->>'reason_code'
     from held_meal $$,
  $$ values ('false'::jsonb, 'null'::jsonb, 'judicial_order'::text) $$,
  'a held meal is not deleted, its photo is not released, and the person is told why'
);

select results_eq(
  $$ select
       (select count(*)::int from nutrition.meals
         where id = '019af000-0000-7000-8000-000000000501'),
       (select count(*)::int from nutrition.media_disposals
         where person_id = '019af000-0000-7000-8000-000000000005'),
       (select count(*)::int from system.outbox_events
         where event_type = 'nutrition.meal_deleted.v1'
           and aggregate_id = '019af000-0000-7000-8000-000000000501') $$,
  $$ values (1, 0, 0) $$,
  'the meal and its photo stay, and nobody is told it was deleted'
);

-- ---------------------------------------------------------------------------
-- The worker, and only the worker
-- ---------------------------------------------------------------------------

select set_config('app.actor_kind', 'support', true);

select throws_ok(
  $$ select privacy.execute_due_dispositions(100) $$,
  '42501',
  null,
  'executing dispositions is the worker''s, never a request''s'
);

select throws_ok(
  $$ select privacy.lapse_legal_holds() $$,
  '42501',
  null,
  'and so is lapsing holds'
);

select pg_temp.as_worker();

create temporary table idle_sweep on commit drop as
select privacy.execute_due_dispositions(100) as executed;

select results_eq(
  $$ select executed,
            (select count(*)::int from identity.body_progress_records
              where id = '019af000-0000-7000-8000-000000000301'),
            (select count(*)::int from nutrition.meals
              where id = '019af000-0000-7000-8000-000000000501')
     from idle_sweep $$,
  $$ values (0, 1, 1) $$,
  'while the hold is live the worker executes nothing it holds'
);

-- Row-level security as the runtime sees it, not as the test's superuser.
set local role allfit_owner;
select set_config('app.actor_kind', 'worker', true);

select is(
  (select count(*)::int from nutrition.meals),
  0,
  'the worker sees no meal that no due disposition names'
);

delete from nutrition.meals where id = '019af000-0000-7000-8000-000000000502';

select throws_ok(
  $$ insert into nutrition.media_disposals (person_id, media_ref) values (
    '019af000-0000-7000-8000-000000000005',
    'nutrition/019af000-0000-7000-8000-000000000005/019af000-0000-7000-8000-000000000501/a.jpg'
  ) $$,
  '42501',
  null,
  'nor queue a photo for removal on its own'
);

reset role;

select is(
  (select count(*)::int from nutrition.meals where id = '019af000-0000-7000-8000-000000000502'),
  1,
  'and the meal it tried to delete is still there'
);

-- ---------------------------------------------------------------------------
-- Criterion 1 — no indefinite holds, and no gap when an order is renewed
-- ---------------------------------------------------------------------------

create temporary table second_hold on commit drop as
select * from privacy.apply_legal_hold(
  '019af000-0000-7000-8000-000000000007', '019af000-0000-7000-8000-000000000027',
  'Mediciones del expediente 2026-301, prorrogado', 'judicial_order', 'JUZGADO-2026-302',
  clock_timestamp() + interval '180 days',
  '019af000-0000-7000-8000-000000000005', array['body'],
  '019af000-0000-4000-8000-000000000903', '019af000-0000-7000-8000-000000000a03',
  decode(repeat('93', 32), 'hex')
);

select results_eq(
  $$ select (select result->>'status' from second_hold),
            array_agg(application.legal_hold_id)
     from privacy.hold_applications as application
     join privacy.disposition_items as item on item.id = application.disposition_item_id
     where item.target_body_progress_id = '019af000-0000-7000-8000-000000000301'
       and application.status = 'active' $$,
  $$ select 'active'::text, array[(result->>'id')::uuid] from first_hold $$,
  'a second hold over the same data is a new order, and the first keeps what it holds'
);

-- The first order ends. Nobody released it.
update privacy.legal_holds
set valid_from = clock_timestamp() - interval '2 days',
    valid_to = clock_timestamp() - interval '1 second'
where id = (select (result->>'id')::uuid from first_hold);

select is(
  privacy.legal_hold_projection((select (result->>'id')::uuid from first_hold))->>'status',
  'lapsed',
  'an expired hold reads as lapsed before any sweep runs'
);

select results_eq(
  $$ select result->'deleted', result->'hold'
     from (select pg_temp.forget_meal(
       '019af000-0000-7000-8000-000000000502',
       '019af000-0000-4000-8000-000000000914', '019af000-0000-7000-8000-000000000a14', 'a4'
     ) as result) as forgotten $$,
  $$ values ('true'::jsonb, 'null'::jsonb) $$,
  'and suspends nothing new: a deletion asked after its end goes through'
);

select pg_temp.as_worker();

select is(
  privacy.lapse_legal_holds(),
  1,
  'the worker lapses the hold that ended'
);

select results_eq(
  $$ select status, lapsed_at is not null, released_at is null, released_by_person_id is null
     from privacy.legal_holds
     where id = (select (result->>'id')::uuid from first_hold) $$,
  $$ values ('lapsed'::text, true, true, true) $$,
  'it lapsed by the calendar, and nobody is recorded as having released it'
);

select results_eq(
  $$ select item.status::text, application.legal_hold_id
     from privacy.disposition_items as item
     join privacy.hold_applications as application
       on application.disposition_item_id = item.id and application.status = 'active'
     where item.target_body_progress_id = '019af000-0000-7000-8000-000000000301' $$,
  $$ select 'suspended'::text, (result->>'id')::uuid from second_hold $$,
  'the measurement passes to the order still in force, so it is never left unheld'
);

select results_eq(
  $$ select item.status::text,
            (select count(*)::int from privacy.hold_applications as application
              where application.legal_hold_id = (select (result->>'id')::uuid from first_hold)
                and application.status = 'active')
     from privacy.disposition_items as item
     where item.target_nutrition_meal_id = '019af000-0000-7000-8000-000000000501' $$,
  $$ values ('pending'::text, 0) $$,
  'the meal, which nothing else holds, goes back to waiting its turn'
);

select is(
  (select count(*)::int from system.outbox_events
    where event_type = 'privacy.legal_hold_lapsed.v1'
      and aggregate_id = (select (result->>'id')::uuid from first_hold)),
  1,
  'and the platform hears that the hold lapsed'
);

select is(
  privacy.lapse_legal_holds(),
  0,
  'a second sweep finds nothing left to lapse'
);

-- ---------------------------------------------------------------------------
-- Criterion 4 — what a hold lets go is deleted
-- ---------------------------------------------------------------------------

select is(
  privacy.execute_due_dispositions(100),
  1,
  'the worker executes the one disposition that is due'
);

select results_eq(
  $$ select
       (select count(*)::int from nutrition.meals
         where id = '019af000-0000-7000-8000-000000000501'),
       (select media_ref from nutrition.media_disposals
         where person_id = '019af000-0000-7000-8000-000000000005' and sealed_at is null),
       (select count(*)::int from system.outbox_events
         where event_type = 'nutrition.meal_deleted.v1'
           and aggregate_id = '019af000-0000-7000-8000-000000000501') $$,
  $$ values (0,
    'nutrition/019af000-0000-7000-8000-000000000005/019af000-0000-7000-8000-000000000501/a.jpg',
    1) $$,
  'the meal is gone, its photo is queued for removal, and the deletion is announced'
);

select results_eq(
  $$ select item.status::text, item.target_nutrition_meal_id is null, dcase.status, event.result
     from privacy.disposition_events as event
     join privacy.disposition_items as item on item.id = event.disposition_item_id
     join privacy.disposition_cases as dcase on dcase.id = item.disposition_case_id
     where event.actor = 'privacy_worker' $$,
  $$ values ('executed'::text, true, 'closed'::text, 'deleted'::text) $$,
  'its case closes on an execution attributed to the worker, with no pointer left behind'
);

select is(
  (select count(*)::int from identity.body_progress_records
    where id = '019af000-0000-7000-8000-000000000301'),
  1,
  'what the order still in force holds stays'
);

select results_eq(
  $$ select (result->>'status'), (result->>'suspended_items')::int
     from privacy.release_legal_hold(
       '019af000-0000-7000-8000-000000000003', '019af000-0000-7000-8000-000000000023',
       (select (result->>'id')::uuid from second_hold),
       '019af000-0000-4000-8000-000000000904', '019af000-0000-7000-8000-000000000a04',
       decode(repeat('94', 32), 'hex')
     ) $$,
  $$ values ('released'::text, 0) $$,
  'releasing the second order holds nothing back'
);

select pg_temp.as_worker();

create temporary table final_sweep on commit drop as
select privacy.execute_due_dispositions(100) as executed;

select results_eq(
  $$ select executed,
            (select count(*)::int from identity.body_progress_records
              where id = '019af000-0000-7000-8000-000000000301'),
            (select dcase.status from privacy.disposition_cases as dcase
              where dcase.id = (select (result->>'disposition_case_id')::uuid from held_body))
     from final_sweep $$,
  $$ values (1, 0, 'closed'::text) $$,
  'and the deletion the person asked for follows its course'
);

select results_eq(
  $$ select result->>'status', result->'hold', replayed
     from pg_temp.forget_body(
       '019af000-0000-7000-8000-000000000301',
       '019af000-0000-4000-8000-000000000910', '019af000-0000-7000-8000-000000000a10', 'a0'
     ) $$,
  $$ values ('deleted'::text, 'null'::jsonb, true) $$,
  'so the same request, retried now, answers that it was deleted'
);

-- ---------------------------------------------------------------------------
-- What the officer reads
-- ---------------------------------------------------------------------------

select throws_ok(
  $$ select privacy.list_legal_holds(
    '019af000-0000-7000-8000-000000000004', '019af000-0000-7000-8000-000000000024',
    'ended', 50
  ) $$,
  '42501',
  null,
  'the platform administrator role alone cannot read the holds'
);

create temporary table ended_holds on commit drop as
select privacy.list_legal_holds(
  '019af000-0000-7000-8000-000000000003', '019af000-0000-7000-8000-000000000023',
  'ended', 50
) as page;

select results_eq(
  $$ select array_agg(hold->>'status' order by hold->>'status'), bool_and(hold->>'subject_person_id'
       = '019af000-0000-7000-8000-000000000005')
     from ended_holds, jsonb_array_elements(page->'items') as hold $$,
  $$ values (array['lapsed', 'released']::text[], true) $$,
  'the ended holds read as lapsed or released, each naming whose data it covered'
);

select is(
  (select count(*)::int from privacy.access_events
    where actor_person_id = '019af000-0000-7000-8000-000000000003'
      and subject_person_id = '019af000-0000-7000-8000-000000000005'
      and resource = 'privacy.legal_holds'),
  1,
  'reading them records one access per person they reveal'
);

select lives_ok(
  $$ select * from privacy.apply_legal_hold(
    '019af000-0000-7000-8000-000000000007', '019af000-0000-7000-8000-000000000027',
    'Contexto de salud del expediente 2026-400', 'regulatory_request', 'SIC-2026-400',
    clock_timestamp() + interval '30 days',
    '019af000-0000-7000-8000-000000000006', array['health'],
    '019af000-0000-4000-8000-000000000905', '019af000-0000-7000-8000-000000000a05',
    decode(repeat('95', 32), 'hex')
  ) $$,
  'a hold over somebody with nothing recorded yet is still a hold'
);

select results_eq(
  $$ select jsonb_array_length(page->'items'), page->'items'->0->>'subject_person_id',
            page->'items'->0->'data_classification_codes', page->'has_more'
     from (select privacy.list_legal_holds(
       '019af000-0000-7000-8000-000000000003', '019af000-0000-7000-8000-000000000023',
       'active', 50
     ) as page) as active_holds $$,
  $$ values (1, '019af000-0000-7000-8000-000000000006'::text, '["health"]'::jsonb,
             'false'::jsonb) $$,
  'the holds in force list apart from the ended ones'
);

select throws_ok(
  $$ select privacy.list_legal_holds(
    '019af000-0000-7000-8000-000000000003', '019af000-0000-7000-8000-000000000023',
    'whatever', 50
  ) $$,
  '22023',
  null,
  'a hold is either in force or ended'
);

select ok(
  has_function_privilege('allfit_api', 'privacy.list_legal_holds(uuid,uuid,text,integer)', 'EXECUTE')
  and has_function_privilege('allfit_api', 'privacy.execute_due_dispositions(integer)', 'EXECUTE')
  and has_function_privilege('allfit_api', 'privacy.lapse_legal_holds()', 'EXECUTE')
  and not has_function_privilege('allfit_api',
    'privacy.dispose_on_owner_request(uuid,text,text,uuid)', 'EXECUTE'),
  'the runtime runs the read and the two sweeps, and nothing behind them'
);

select * from finish();

rollback;
