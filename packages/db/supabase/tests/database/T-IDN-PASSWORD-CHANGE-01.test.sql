-- T-IDN-PASSWORD-CHANGE-01 — OP-IDN-066 (`HU-SP-005`), ADR-051. TECH-325.
--
-- **WorkOS holds the password; PostgreSQL holds what happened.** The API checks and sets the
-- password in WorkOS inside the request, then records the change here, which closes the
-- receipt and hands the other sessions to the worker. Nothing derived from a password is
-- stored: not in the row, not in the receipt, not in the event.
--
-- **A wrong current password is counted**, five in an hour at most, and the count cannot be
-- dodged by reusing a command id. **A replay is answered here**, never by asking WorkOS
-- again: after the change the old password is no longer the current one.

begin;

select plan(24);

insert into identity.people (
  id, given_name, family_name, username, contact_email, contact_email_verified_at, status,
  activated_at
)
values
  ('019f6000-0000-7000-8000-000000000001', 'Camila', 'Rojas', 'camila_password',
    'camila@example.test', '2026-07-03 10:00:00+00', 'active', '2026-07-03 10:05:00+00'),
  ('019f6000-0000-7000-8000-000000000002', 'Other', 'Person', 'other_password',
    'other@example.test', '2026-07-04 10:00:00+00', 'active', '2026-07-04 10:05:00+00'),
  ('019f6000-0000-7000-8000-000000000003', 'Pending', 'Person', 'pending_password',
    'pending@example.test', null, 'pending_activation', null);

insert into identity.access_accounts (id, provider, issuer, subject, person_id, linked_at)
values
  ('019f6000-0000-7000-8000-000000000101', 'workos', 'https://issuer.test', 'user_camila',
    '019f6000-0000-7000-8000-000000000001', '2026-07-03 10:00:00+00'),
  ('019f6000-0000-7000-8000-000000000102', 'workos', 'https://issuer.test', 'user_other',
    '019f6000-0000-7000-8000-000000000002', '2026-07-04 10:00:00+00'),
  ('019f6000-0000-7000-8000-000000000103', 'workos', 'https://issuer.test', 'user_pending',
    '019f6000-0000-7000-8000-000000000003', '2026-07-05 10:00:00+00');

create function pg_temp.prepare(p_subject text, p_key uuid default gen_random_uuid())
returns table (password_state text, sign_in_email text)
language sql as $fn$
  select * from identity.prepare_password_change('workos', 'https://issuer.test', p_subject, p_key)
$fn$;

create function pg_temp.reject(p_subject text) returns void
language sql as $fn$
  select identity.reject_password_change('workos', 'https://issuer.test', p_subject)
$fn$;

create function pg_temp.record(
  p_subject text,
  p_command uuid default extensions.uuid_generate_v7(),
  p_key uuid default gen_random_uuid(),
  p_session text default 'session_phone',
  p_hash bytea default extensions.gen_random_bytes(32)
) returns boolean
language sql as $fn$
  select replayed from identity.record_password_change(
    'workos', 'https://issuer.test', p_subject, p_session, p_key, p_command, p_hash
  )
$fn$;

create function pg_temp.event(p_change uuid) returns uuid
language sql as $fn$
  select id from system.outbox_events
  where aggregate_id = p_change and event_type = 'identity.password_changed.v1'
$fn$;

-- ---------------------------------------------------------------------------
-- Before WorkOS: who she signs in as, and whether she may try
-- ---------------------------------------------------------------------------

select results_eq(
  $$ select * from pg_temp.prepare('user_camila') $$,
  $$ values ('ready'::text, 'camila@example.test'::text) $$,
  'the API learns the address she signs in with, to check her current password'
);

select throws_ok(
  $$ select * from pg_temp.prepare('user_pending') $$,
  '42501', null,
  'a Fitness ID still in onboarding changes no password here'
);

-- ---------------------------------------------------------------------------
-- A wrong current password is counted
-- ---------------------------------------------------------------------------

select lives_ok(
  $$ select pg_temp.reject('user_camila') $$,
  'a wrong current password is recorded'
);

select is(
  (select count(*)::int from system.outbox_events as event
   join identity.password_changes as change on change.id = event.aggregate_id
   where change.person_id = '019f6000-0000-7000-8000-000000000001'),
  0,
  'a refusal enqueues nothing: no session closes'
);

select pg_temp.reject('user_camila');
select pg_temp.reject('user_camila');
select pg_temp.reject('user_camila');

select is(
  (select password_state from pg_temp.prepare('user_camila')),
  'ready',
  'four wrong ones in an hour still let her try'
);

select pg_temp.reject('user_camila');

select results_eq(
  $$ select * from pg_temp.prepare('user_camila') $$,
  $$ values ('too_many_attempts'::text, null::text) $$,
  'the fifth wrong one in an hour stops the next attempt before WorkOS is asked'
);

select is(
  (select password_state from pg_temp.prepare('user_other')),
  'ready',
  'somebody else''s refusals do not count against her'
);

-- The clock moves by hand, past the append-only trigger, which only the test may skip.
set local session_replication_role = replica;
update identity.password_changes
set created_at = clock_timestamp() - interval '61 minutes'
where person_id = '019f6000-0000-7000-8000-000000000001';
set local session_replication_role = origin;

select is(
  (select password_state from pg_temp.prepare('user_camila')),
  'ready',
  'after an hour she may try again'
);

select throws_ok(
  $$ delete from identity.password_changes $$,
  '55000', null,
  'the record is append-only, for its owner too'
);

-- ---------------------------------------------------------------------------
-- WorkOS took the new password: record it
-- ---------------------------------------------------------------------------

select is(
  pg_temp.record('user_camila', '019f6000-0000-7000-8000-000000000501',
    'b6000000-0000-4000-8000-000000000001', 'session_phone', decode(repeat('d1', 32), 'hex')),
  false,
  'the change is recorded'
);

select results_eq(
  $$ select person_id, access_account_id, outcome, keep_session_id
     from identity.password_changes where id = '019f6000-0000-7000-8000-000000000501' $$,
  $$ values ('019f6000-0000-7000-8000-000000000001'::uuid,
             '019f6000-0000-7000-8000-000000000101'::uuid, 'changed'::text, 'session_phone'::text) $$,
  'it is hers, on her account, and keeps the session it came from'
);

select is(
  (select payload from system.outbox_events
   where id = pg_temp.event('019f6000-0000-7000-8000-000000000501')),
  jsonb_build_object('change_id', '019f6000-0000-7000-8000-000000000501'),
  'the worker is told which change, and nothing else'
);

select results_eq(
  $$ select status::text, http_status, operation_code
     from system.idempotency_keys
     where aggregate_id = '019f6000-0000-7000-8000-000000000501' $$,
  $$ values ('succeeded'::text, 204::smallint, 'OP-IDN-066'::text) $$,
  'the receipt closes as the 204 the API answered'
);

select is(
  pg_temp.record('user_camila', '019f6000-0000-7000-8000-000000000501',
    'b6000000-0000-4000-8000-000000000001', 'session_phone', decode(repeat('d1', 32), 'hex')),
  true,
  'recording it again with the same key replays'
);

select is(
  (select count(*)::int from system.outbox_events
   where aggregate_id = '019f6000-0000-7000-8000-000000000501'),
  1,
  'and enqueues nothing more'
);

select results_eq(
  $$ select * from pg_temp.prepare('user_camila', 'b6000000-0000-4000-8000-000000000001') $$,
  $$ values ('replayed'::text, null::text) $$,
  'a retry with that key is answered from the receipt, without asking WorkOS'
);

select is(
  (select password_state from pg_temp.prepare('user_other', 'b6000000-0000-4000-8000-000000000001')),
  'ready',
  'her key means nothing for somebody else'
);

select throws_ok(
  $$ select pg_temp.record('user_camila', extensions.uuid_generate_v7(),
       gen_random_uuid(), '') $$,
  '23514', null,
  'a change keeps a real session'
);

-- ---------------------------------------------------------------------------
-- The worker closes the other sessions and sends the notice
-- ---------------------------------------------------------------------------

select throws_ok(
  $$ select * from identity.prepare_password_change_notice(
       pg_temp.event('019f6000-0000-7000-8000-000000000501')) $$,
  '42501', null,
  'only the worker prepares the notice'
);

select set_config('app.actor_kind', 'worker', true);

select results_eq(
  $$ select notice_state, subject, sign_in_email, keep_session
     from identity.prepare_password_change_notice(
       pg_temp.event('019f6000-0000-7000-8000-000000000501')) $$,
  $$ values ('ready'::text, 'user_camila'::text, 'camila@example.test'::text,
             'session_phone'::text) $$,
  'the worker learns whose sessions to close, which one stays and where to warn her'
);

select results_eq(
  $$ select notice_state from identity.prepare_password_change_notice(gen_random_uuid()) $$,
  $$ values ('skipped'::text) $$,
  'an event that is not a password change is skipped'
);

-- ---------------------------------------------------------------------------
-- Nothing derived from a password, and nobody else
-- ---------------------------------------------------------------------------

select is(
  (select array_agg(column_name::text order by column_name::text)
   from information_schema.columns
   where table_schema = 'identity' and table_name = 'password_changes'),
  array['access_account_id', 'created_at', 'id', 'keep_session_id', 'outcome', 'person_id'],
  'the record has no column a password could hide in'
);

select ok(
  not has_table_privilege('allfit_api', 'identity.password_changes', 'select')
  and not has_table_privilege('allfit_api', 'identity.password_changes', 'insert'),
  'the API reaches the table only through its functions'
);

select ok(
  has_function_privilege('allfit_api',
    'identity.prepare_password_change(text, text, text, uuid)', 'execute')
  and has_function_privilege('allfit_api',
    'identity.reject_password_change(text, text, text)', 'execute')
  and has_function_privilege('allfit_api',
    'identity.record_password_change(text, text, text, text, uuid, uuid, bytea)', 'execute')
  and has_function_privilege('allfit_api',
    'identity.prepare_password_change_notice(uuid)', 'execute')
  and not has_function_privilege('public',
    'identity.record_password_change(text, text, text, text, uuid, uuid, bytea)', 'execute'),
  'the API runs the functions, and nobody else'
);

select * from finish();
rollback;
