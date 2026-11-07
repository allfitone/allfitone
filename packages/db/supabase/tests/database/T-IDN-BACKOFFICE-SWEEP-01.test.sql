-- T-IDN-BACKOFFICE-SWEEP-01 — a Backoffice session that ends on its own is revoked with
-- the provider (`HU-BO-002` c3, `HU-BO-001` c5).
--
-- A session past its sixty idle minutes or its twelve hours was revoked lazily, by the
-- next request that presented it. One nobody presented again kept its provider session
-- alive forever: `identity.backoffice_session_revocation_requested.v1` was never queued.
-- The worker now sweeps them every minute, the same way the lazy path does it.
--
-- These are also the first assertions on the two limits themselves: sixty minutes idle
-- and twelve hours in all (ADR-046), each just over and just under.

begin;

select plan(10);

insert into identity.people (id, given_name, family_name, status)
values ('019b7000-0000-7000-8000-000000000001', 'Operator', 'Sweep', 'active');

insert into identity.access_accounts (id, provider, issuer, subject, person_id)
values ('019b7000-0000-7000-8000-000000000011', 'workos', 'https://issuer.test', 'sweep_op',
  '019b7000-0000-7000-8000-000000000001');

insert into identity.access_sessions (
  id, access_account_id, provider_session_id, surface, token_hash, token_ciphertext,
  access_token_expires_at, assurance_level, authentication_method,
  assurance_verified_at, last_activity_at, absolute_expires_at, revoked_at, created_at
)
select session_id, '019b7000-0000-7000-8000-000000000011', 'sid_' || suffix, 'backoffice',
  decode(repeat(hash_byte, 32), 'hex'), 'v1.' || suffix,
  clock_timestamp() + interval '5 minutes', 2, 'password_totp',
  clock_timestamp() - interval '1 hour', last_activity, absolute_end, revoked,
  clock_timestamp() - interval '13 hours'
from (values
  -- Idle for sixty-one minutes: over.
  ('019b7000-0000-7000-8000-000000000021'::uuid, 'idle', 'a1',
    clock_timestamp() - interval '61 minutes', clock_timestamp() + interval '4 hours',
    null::timestamptz),
  -- Idle for fifty-nine minutes: under.
  ('019b7000-0000-7000-8000-000000000022'::uuid, 'quiet', 'a2',
    clock_timestamp() - interval '59 minutes', clock_timestamp() + interval '4 hours',
    null::timestamptz),
  -- Active a moment ago, but past its twelve hours.
  ('019b7000-0000-7000-8000-000000000023'::uuid, 'old', 'a3',
    clock_timestamp() - interval '1 minute', clock_timestamp() - interval '1 second',
    null::timestamptz),
  -- Already revoked: left as it is.
  ('019b7000-0000-7000-8000-000000000024'::uuid, 'done', 'a4',
    clock_timestamp() - interval '2 hours', clock_timestamp() - interval '1 hour',
    clock_timestamp() - interval '90 minutes')
) as session_row(session_id, suffix, hash_byte, last_activity, absolute_end, revoked);

select set_config('app.actor_kind', 'support', true);

select throws_ok(
  $$ select identity.expire_backoffice_sessions(100) $$,
  '42501', null,
  'only the worker sweeps sessions'
);

select set_config('app.actor_kind', 'worker', true);

select throws_ok(
  $$ select identity.expire_backoffice_sessions(0) $$,
  '42501', null,
  'a sweep takes at least one session'
);

create temporary table first_sweep as
select identity.expire_backoffice_sessions(100) as swept;

select is((select swept from first_sweep), 2, 'the idle session and the old one are swept');

select ok(
  (select revoked_at is not null from identity.access_sessions
    where id = '019b7000-0000-7000-8000-000000000021'),
  'sixty-one idle minutes is past the sixty'
);

select ok(
  (select revoked_at is null from identity.access_sessions
    where id = '019b7000-0000-7000-8000-000000000022'),
  'fifty-nine is not'
);

select ok(
  (select revoked_at is not null from identity.access_sessions
    where id = '019b7000-0000-7000-8000-000000000023'),
  'twelve hours end a session however active it is'
);

select ok(
  (select revoked_at < clock_timestamp() - interval '80 minutes' from identity.access_sessions
    where id = '019b7000-0000-7000-8000-000000000024'),
  'a session already revoked keeps the moment it was revoked'
);

select is(
  (select array_agg(aggregate_id order by aggregate_id) from system.outbox_events
    where event_type = 'identity.backoffice_session_revocation_requested.v1'
      and aggregate_id in (
        '019b7000-0000-7000-8000-000000000021', '019b7000-0000-7000-8000-000000000022',
        '019b7000-0000-7000-8000-000000000023', '019b7000-0000-7000-8000-000000000024'
      )),
  array['019b7000-0000-7000-8000-000000000021', '019b7000-0000-7000-8000-000000000023']::uuid[],
  'each swept session asks the provider to revoke it, and only those'
);

select is(
  identity.expire_backoffice_sessions(100),
  0,
  'sweeping again finds nothing: a session is swept once'
);

select ok(
  has_function_privilege('allfit_api', 'identity.expire_backoffice_sessions(integer)', 'execute'),
  'the runtime role calls the sweep, as the worker'
);

select * from finish();

rollback;
