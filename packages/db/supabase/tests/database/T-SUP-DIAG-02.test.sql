-- T-SUP-DIAG-02 — what failed silently, now in the diagnosis (`HU-BO-031` c2).
--
-- Three things went wrong without leaving a trace the Backoffice could read:
--
-- **A delivery nobody picked up.** A notification a worker consumes that sat `pending`
-- for a quarter of an hour never read as stuck. The kinds a worker consumes are the
-- ones it opened a delivery circuit for; every other `pending` row is a domain record
-- nobody waits on and stays `pending`, so the feed does not fill with them.
--
-- **A scheduled job that failed.** The worker reported its jobs to telemetry only.
-- `system.job_runs` keeps every run, the feed shows the failed ones, and the job health
-- read says when each job last ran — which is how a worker that stopped is noticed.
--
-- **A store notice that was refused.** The webhook answered 400 or 503 and kept nothing.
-- It now counts refusals per store, reason and hour: bounded, because the webhook is
-- unauthenticated, and with nothing from the notice itself.

begin;

select plan(18);

insert into identity.people (id, given_name, family_name, status)
values
  ('019b6000-0000-7000-8000-000000000001', 'Manager', 'Alpha', 'active'),
  ('019b6000-0000-7000-8000-000000000002', 'Manager', 'Beta', 'active'),
  ('019b6000-0000-7000-8000-000000000003', 'Diagnostician', 'Gamma', 'active'),
  ('019b6000-0000-7000-8000-000000000004', 'Outsider', 'Delta', 'active');

insert into identity.access_accounts (id, provider, issuer, subject, person_id)
values
  ('019b6000-0000-7000-8000-000000000011', 'workos', 'https://issuer.test', 'alpha_dg', null),
  ('019b6000-0000-7000-8000-000000000012', 'workos', 'https://issuer.test', 'beta_dg', null),
  ('019b6000-0000-7000-8000-000000000013', 'workos', 'https://issuer.test', 'gamma_dg',
    '019b6000-0000-7000-8000-000000000003'),
  ('019b6000-0000-7000-8000-000000000014', 'workos', 'https://issuer.test', 'delta_dg',
    '019b6000-0000-7000-8000-000000000004');

select support.bootstrap_backoffice_administrators(
  '019b6000-0000-7000-8000-000000000001', 'alpha_dg',
  '019b6000-0000-7000-8000-000000000002', 'beta_dg',
  'https://issuer.test', clock_timestamp() + interval '30 days', 'CEREMONY-SUP-DIAG-02'
);

insert into identity.access_sessions (
  id, access_account_id, provider_session_id, surface, token_hash, token_ciphertext,
  access_token_expires_at, assurance_level, authentication_method,
  assurance_verified_at, last_activity_at, absolute_expires_at
) values
  ('019b6000-0000-7000-8000-000000000021', '019b6000-0000-7000-8000-000000000011',
    'sid_alpha_dg', 'backoffice', decode(repeat('d1', 32), 'hex'), 'v1.alpha',
    clock_timestamp() + interval '5 minutes', 2, 'password_totp',
    clock_timestamp(), clock_timestamp(), clock_timestamp() + interval '8 hours'),
  ('019b6000-0000-7000-8000-000000000023', '019b6000-0000-7000-8000-000000000013',
    'sid_gamma_dg', 'backoffice', decode(repeat('d3', 32), 'hex'), 'v1.gamma',
    clock_timestamp() + interval '5 minutes', 2, 'password_totp',
    clock_timestamp(), clock_timestamp(), clock_timestamp() + interval '8 hours'),
  ('019b6000-0000-7000-8000-000000000024', '019b6000-0000-7000-8000-000000000014',
    'sid_delta_dg', 'backoffice', decode(repeat('d4', 32), 'hex'), 'v1.delta',
    clock_timestamp() + interval '5 minutes', 2, 'password_totp',
    clock_timestamp(), clock_timestamp(), clock_timestamp() + interval '8 hours');

-- Delta keeps a Backoffice session but never the role: the refusal ADR-046 leaves.
select support.assign_platform_role(
  '019b6000-0000-7000-8000-000000000001', '019b6000-0000-7000-8000-000000000021',
  '019b6000-0000-7000-8000-000000000003', 'allfit_admin',
  '019b6000-0000-7000-8000-000000000101', '019b6000-0000-7000-8000-000000000201',
  decode(repeat('41', 32), 'hex')
);

-- Converges onto the duty the role already brings.
select support.assign_platform_duty(
  '019b6000-0000-7000-8000-000000000001', '019b6000-0000-7000-8000-000000000021',
  '019b6000-0000-7000-8000-000000000003', 'diagnose_support_metadata',
  clock_timestamp(), clock_timestamp() + interval '30 days', 'CASE-2026-DIAG',
  '019b6000-0000-7000-8000-000000000103', '019b6000-0000-7000-8000-000000000203',
  decode(repeat('43', 32), 'hex')
);

-- A worker consumes invitations: it opened their circuit. Nobody consumes the other kind.
insert into system.outbox_delivery_circuits (event_type)
values ('test.diagnosis_delivery.v1')
on conflict (event_type) do nothing;

insert into system.outbox_events (
  id, aggregate_type, aggregate_id, event_type, payload_schema_version, payload,
  occurred_at, available_at, attempt_count, last_error_code, published_at, dead_lettered_at
) values
  ('019b6000-0000-7000-8000-000000000301', 'invitation',
    '019b6000-0000-7000-8000-000000000401', 'test.diagnosis_delivery.v1', 1, '{}',
    clock_timestamp() - interval '30 minutes', clock_timestamp() - interval '30 minutes',
    0, null, null, null),
  ('019b6000-0000-7000-8000-000000000302', 'organization',
    '019b6000-0000-7000-8000-000000000402', 'test.diagnosis_record.v1', 1, '{}',
    clock_timestamp() - interval '2 hours', clock_timestamp() - interval '2 hours',
    0, null, null, null),
  ('019b6000-0000-7000-8000-000000000303', 'invitation',
    '019b6000-0000-7000-8000-000000000403', 'test.diagnosis_delivery.v1', 1, '{}',
    clock_timestamp() - interval '5 minutes', clock_timestamp() - interval '5 minutes',
    0, null, null, null);

create temporary table feed_state as
select subject_id, state
from support.list_operational_events(
  '019b6000-0000-7000-8000-000000000003', '019b6000-0000-7000-8000-000000000023',
  'notification', null, null, 100, null, null
)
where subject_id in (
  '019b6000-0000-7000-8000-000000000401', '019b6000-0000-7000-8000-000000000402',
  '019b6000-0000-7000-8000-000000000403'
);

select is(
  (select state from feed_state where subject_id = '019b6000-0000-7000-8000-000000000401'),
  'stalled',
  'a delivery a worker consumes, pending for half an hour, reads as stuck'
);

select is(
  (select state from feed_state where subject_id = '019b6000-0000-7000-8000-000000000402'),
  'pending',
  'a domain record nobody consumes stays pending however old it is'
);

select is(
  (select state from feed_state where subject_id = '019b6000-0000-7000-8000-000000000403'),
  'pending',
  'and a delivery queued minutes ago is simply not sent yet'
);

-- ---------------------------------------------------------------------------
-- Scheduled jobs leave a run behind
-- ---------------------------------------------------------------------------

select set_config('app.actor_kind', 'support', true);

select throws_ok(
  $$ select system.record_job_run(
    'privacy_disposition', clock_timestamp(), 'failed', 'privacy_disposition_failed'
  ) $$,
  '42501', null,
  'only the worker records a run of its jobs'
);

select set_config('app.actor_kind', 'worker', true);

select throws_ok(
  $$ select system.record_job_run('privacy_disposition', clock_timestamp(), 'maybe', null) $$,
  '22023', null,
  'a run either succeeded or failed'
);

-- A run of two days ago is pruned when the job runs again; a failure is kept longer.
insert into system.job_runs (job_name, started_at, finished_at, outcome, error_code)
values
  ('test_job_pruned', clock_timestamp() - interval '3 days', clock_timestamp() - interval '3 days',
    'succeeded', null);

select system.record_job_run('test_job_pruned', clock_timestamp(), 'succeeded', null);
select system.record_job_run(
  'privacy_disposition', clock_timestamp() - interval '1 minute', 'failed',
  'privacy_disposition_failed'
);
select system.record_job_run(
  'invitation_delivery', clock_timestamp() - interval '1 minute', 'succeeded', null
);

select is(
  (select count(*)::integer from system.job_runs where job_name = 'test_job_pruned'),
  1,
  'old successful runs of a job are pruned when it runs again'
);

select set_config('app.actor_kind', 'support', true),
       set_config('app.actor_person_id', '019b6000-0000-7000-8000-000000000003', true);

create temporary table job_feed as
select *
from support.list_operational_events(
  '019b6000-0000-7000-8000-000000000003', '019b6000-0000-7000-8000-000000000023',
  'job', null, null, 100, null, null
);

select is(
  (select array_agg(label || ':' || state || ':' || coalesce(last_error_code, '-')) from job_feed),
  array['privacy_disposition:failed:privacy_disposition_failed'],
  'the feed shows the failed run, and only that, with its error'
);

select is(
  (select subject_kind from job_feed),
  'job',
  'a run is about a job, not about anybody'
);

create temporary table health as
select support.list_job_health(
  '019b6000-0000-7000-8000-000000000003', '019b6000-0000-7000-8000-000000000023'
) as body;

select is(
  (select item->>'last_outcome' || ':' || (item->>'failures_24h')
   from health, jsonb_array_elements(body->'items') as item
   where item->>'job_name' = 'privacy_disposition'),
  'failed:1',
  'the job health says how the last run went and how many failed in a day'
);

select ok(
  (select item->>'last_failure_at' is null and item->>'last_run_at' is not null
   from health, jsonb_array_elements(body->'items') as item
   where item->>'job_name' = 'invitation_delivery'),
  'and when each job last ran, which is how a stopped worker is noticed'
);

select set_config('app.actor_person_id', '019b6000-0000-7000-8000-000000000004', true);

select throws_ok(
  $$ select support.list_job_health(
    '019b6000-0000-7000-8000-000000000004', '019b6000-0000-7000-8000-000000000024'
  ) $$,
  '42501', null,
  'a Backoffice session without the admin role does not read the job health'
);

select set_config('app.actor_person_id', '019b6000-0000-7000-8000-000000000003', true);

-- ---------------------------------------------------------------------------
-- A refused store notice is counted
-- ---------------------------------------------------------------------------

select payments.record_store_notification_rejection('app_store', 'unverified');
select payments.record_store_notification_rejection('app_store', 'unverified');
select payments.record_store_notification_rejection('google_play', 'not_applied');

select throws_ok(
  $$ select payments.record_store_notification_rejection('app_store', 'because') $$,
  '22023', null,
  'a refusal names one of its closed reasons'
);

create temporary table store_feed as
select *
from support.list_operational_events(
  '019b6000-0000-7000-8000-000000000003', '019b6000-0000-7000-8000-000000000023',
  'store_notification', null, null, 100, null, null
);

select is(
  (select count(*)::integer from store_feed),
  2,
  'refusals are counted per store and reason in the hour, not one row each'
);

select is(
  (select attempt_count || ':' || last_error_code || ':' || state from store_feed
   where label = 'app_store'),
  '2:unverified:failed',
  'a refused notice says how many times, why, and that it failed'
);

select is(
  (select count(*)::integer from store_feed where subject_id is not null),
  0,
  'and nothing from the notice itself, not even whose it was'
);

select throws_ok(
  $$ select * from support.list_operational_events(
    '019b6000-0000-7000-8000-000000000003', '019b6000-0000-7000-8000-000000000023',
    'webhook', null, null, 100, null, null
  ) $$,
  '22023', null,
  'a source outside the closed list is refused'
);

select ok(
  has_function_privilege('allfit_api', 'system.record_job_run(text, timestamptz, text, text)',
    'execute')
  and has_function_privilege('allfit_api',
    'payments.record_store_notification_rejection(text, text)', 'execute')
  and has_function_privilege('allfit_api', 'support.list_job_health(uuid, uuid)', 'execute'),
  'the runtime role records runs and refusals and reads the job health'
);

select ok(
  not has_table_privilege('allfit_api', 'system.job_runs', 'select')
  and not has_table_privilege('allfit_api', 'payments.store_notification_rejections', 'select'),
  'and reads neither table directly'
);

select * from finish();

rollback;
