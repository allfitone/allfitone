-- T-IDN-EMAIL-CHANGE-01 — OP-IDN-021 and OP-IDN-022, the email half (`HU-SP-076`,
-- `HU-SP-077`). TECH-44.
--
-- **The email she signs in with changes only once the new one is proven and WorkOS took
-- it.** Asking opens a request and nothing more; the worker emails a code to the new
-- address and keeps only its hash; the right code hands the change to the worker, which
-- promotes the address after the provider confirms. A refusal anywhere leaves the old
-- address in force.
--
-- **Nothing here says who else has an account.** A malformed address, her own and one
-- somebody else holds are refused alike.
--
-- **Backoffice's recoveries do not see these requests.** They share the table; the
-- recovery reads, the daily limit and «can start» look at recoveries only.

begin;

select plan(45);

insert into identity.people (
  id, given_name, family_name, username, contact_email, contact_email_verified_at, status,
  activated_at
)
values
  ('019f5000-0000-7000-8000-000000000001', 'Camila', 'Rojas', 'camila_email',
    'camila@example.test', '2026-07-03 10:00:00+00', 'active', '2026-07-03 10:05:00+00'),
  ('019f5000-0000-7000-8000-000000000002', 'Other', 'Person', 'other_email',
    'taken@example.test', '2026-07-04 10:00:00+00', 'active', '2026-07-04 10:05:00+00'),
  ('019f5000-0000-7000-8000-000000000003', 'Pending', 'Person', 'pending_email',
    'pending@example.test', null, 'pending_activation', null);

insert into identity.access_accounts (id, provider, issuer, subject, person_id, linked_at)
values
  ('019f5000-0000-7000-8000-000000000101', 'workos', 'https://issuer.test', 'user_camila',
    '019f5000-0000-7000-8000-000000000001', '2026-07-03 10:00:00+00'),
  ('019f5000-0000-7000-8000-000000000102', 'workos', 'https://issuer.test', 'user_other',
    '019f5000-0000-7000-8000-000000000002', '2026-07-04 10:00:00+00'),
  ('019f5000-0000-7000-8000-000000000103', 'workos', 'https://issuer.test', 'user_pending',
    '019f5000-0000-7000-8000-000000000003', '2026-07-05 10:00:00+00');

create function pg_temp.ask(
  p_subject text, p_email text,
  p_command uuid default extensions.uuid_generate_v7(),
  p_key uuid default gen_random_uuid(),
  p_hash bytea default extensions.gen_random_bytes(32)
) returns table (result jsonb, replayed boolean)
language sql as $fn$
  select * from identity.request_email_change(
    'workos', 'https://issuer.test', p_subject, p_email, p_key, p_command, p_hash
  )
$fn$;

create function pg_temp.answer(
  p_subject text, p_code text,
  p_session text default 'session_main',
  p_key uuid default gen_random_uuid(),
  p_command uuid default extensions.uuid_generate_v7(),
  p_hash bytea default extensions.gen_random_bytes(32)
) returns table (result jsonb, replayed boolean)
language sql as $fn$
  select * from identity.verify_email_change(
    'workos', 'https://issuer.test', p_subject, p_session, p_code, p_key, p_command, p_hash
  )
$fn$;

create function pg_temp.event(p_request uuid, p_type text) returns uuid
language sql as $fn$
  select id from system.outbox_events
  where aggregate_id = p_request and event_type = p_type
  order by occurred_at desc, id desc limit 1
$fn$;

create function pg_temp.as_worker() returns void
language sql as $fn$ select set_config('app.actor_kind', 'worker', true) $fn$;

create function pg_temp.request(p_id uuid) returns identity.identity_action_requests
language sql as $fn$ select * from identity.identity_action_requests where id = p_id $fn$;

-- ---------------------------------------------------------------------------
-- Asking for the change
-- ---------------------------------------------------------------------------

select is(
  (select result - 'expires_at' from pg_temp.ask('user_camila', ' Camila.Nueva@Example.TEST ',
     '019f5000-0000-7000-8000-000000000501', 'a5000000-0000-4000-8000-000000000001',
     decode(repeat('c1', 32), 'hex'))),
  jsonb_build_object('address', 'camila.nueva@example.test', 'status', 'awaiting_code'),
  'she asks to change to a new address, trimmed and lower-cased, and a code is on its way'
);

select results_eq(
  $$ select action_kind::text, status::text, initiated_by_kind, proposed_email::text,
            code_hash is null, expires_at > clock_timestamp() + interval '29 minutes'
     from identity.identity_action_requests where id = '019f5000-0000-7000-8000-000000000501' $$,
  $$ values ('email_change', 'initiated', 'person', 'camila.nueva@example.test', true, true) $$,
  'the request is hers, holds the proposed address and no code yet, for thirty minutes'
);

select is(
  (select contact_email::text from identity.people where id = '019f5000-0000-7000-8000-000000000001'),
  'camila@example.test',
  'asking changes nothing in force'
);

select is(
  (select payload from system.outbox_events
   where aggregate_id = '019f5000-0000-7000-8000-000000000501'
     and event_type = 'identity.contact_changed.v1'),
  jsonb_build_object('request_id', '019f5000-0000-7000-8000-000000000501'),
  'the worker is told which request, and nothing else'
);

select is(
  (select replayed from pg_temp.ask('user_camila', 'camila.nueva@example.test',
     '019f5000-0000-7000-8000-000000000501', 'a5000000-0000-4000-8000-000000000001',
     decode(repeat('c1', 32), 'hex'))),
  true,
  'a retried request replays instead of opening another'
);

select throws_ok(
  $$ select * from pg_temp.ask('user_camila', 'not-an-address') $$,
  '22023', 'that email cannot be used',
  'a malformed address is refused'
);

select throws_ok(
  $$ select * from pg_temp.ask('user_camila', 'CAMILA@example.test') $$,
  '22023', 'that email cannot be used',
  'her own address is refused with the same words'
);

select throws_ok(
  $$ select * from pg_temp.ask('user_camila', 'taken@example.test') $$,
  '22023', 'that email cannot be used',
  'and so is one somebody else holds: nothing says that it exists'
);

select throws_ok(
  $$ select * from pg_temp.ask('user_pending', 'pending.two@example.test') $$,
  '42501', null,
  'a Fitness ID still in onboarding changes nothing here'
);

-- ---------------------------------------------------------------------------
-- The worker emails the code
-- ---------------------------------------------------------------------------

select throws_ok(
  $$ select * from identity.prepare_email_change_delivery(
       pg_temp.event('019f5000-0000-7000-8000-000000000501', 'identity.contact_changed.v1')) $$,
  '42501', null,
  'only the worker prepares a delivery'
);

select pg_temp.as_worker();

select results_eq(
  $$ select delivery_state, request_id, contact
     from identity.prepare_email_change_delivery(
       pg_temp.event('019f5000-0000-7000-8000-000000000501', 'identity.contact_changed.v1')) $$,
  $$ values ('ready'::text, '019f5000-0000-7000-8000-000000000501'::uuid,
             'camila.nueva@example.test'::text) $$,
  'the worker learns the new address the code goes to'
);

select throws_ok(
  $$ select identity.record_email_change_code(
       pg_temp.event('019f5000-0000-7000-8000-000000000501', 'identity.contact_changed.v1'),
       '12ab') $$,
  '22023', null,
  'a code is six digits'
);

select lives_ok(
  $$ select identity.record_email_change_code(
       pg_temp.event('019f5000-0000-7000-8000-000000000501', 'identity.contact_changed.v1'),
       '111111') $$,
  'a first code is recorded'
);

select lives_ok(
  $$ select identity.record_email_change_code(
       pg_temp.event('019f5000-0000-7000-8000-000000000501', 'identity.contact_changed.v1'),
       '482913') $$,
  'a retry records another, which replaces it'
);

select results_eq(
  $$ select status::text, code_attempts, code_hash = extensions.digest(
              convert_to('019f5000-0000-7000-8000-000000000501:482913', 'UTF8'), 'sha256'),
            position('482913' in encode(code_hash, 'escape')) = 0
     from identity.identity_action_requests where id = '019f5000-0000-7000-8000-000000000501' $$,
  $$ values ('awaiting_verification'::text, 0::smallint, true, true) $$,
  'only the hash of the last code is kept, never the code'
);

-- ---------------------------------------------------------------------------
-- She answers with the code
-- ---------------------------------------------------------------------------

select is(
  (select result from pg_temp.answer('user_camila', '111111')),
  jsonb_build_object('outcome', 'wrong_code'),
  'the replaced code no longer works'
);

select is(
  (select code_attempts from identity.identity_action_requests
   where id = '019f5000-0000-7000-8000-000000000501'),
  1::smallint,
  'and the wrong answer is counted, not rolled back'
);

select is(
  (select result -> 'pending' ->> 'status' from (
     select identity.read_own_identity('workos', 'https://issuer.test', 'user_camila') -> 'email'
       as result) as read),
  'awaiting_code',
  'her identity says a code is awaited'
);

select is(
  (select result from pg_temp.answer('user_other', '482913')),
  jsonb_build_object('outcome', 'expired'),
  'somebody else with her code has nothing to confirm'
);

select results_eq(
  $$ select result, replayed from pg_temp.answer('user_camila', '482913', 'session_main',
       'a5000000-0000-4000-8000-000000000002', '019f5000-0000-7000-8000-000000000601',
       decode(repeat('d1', 32), 'hex')) $$,
  $$ values (jsonb_build_object('outcome', 'applying'), false) $$,
  'the right code hands the change to the worker'
);

select results_eq(
  $$ select result, replayed from pg_temp.answer('user_camila', '482913', 'session_main',
       'a5000000-0000-4000-8000-000000000002', '019f5000-0000-7000-8000-000000000601',
       decode(repeat('d1', 32), 'hex')) $$,
  $$ values (jsonb_build_object('outcome', 'applying'), true) $$,
  'a retried confirmation replays the same answer'
);

select results_eq(
  $$ select status::text, confirming_session_id, confirmed_at is null
     from identity.identity_action_requests where id = '019f5000-0000-7000-8000-000000000501' $$,
  $$ values ('applying'::text, 'session_main'::text, true) $$,
  'the request is applying and remembers the session that confirmed it'
);

select is(
  (select contact_email::text from identity.people where id = '019f5000-0000-7000-8000-000000000001'),
  'camila@example.test',
  'the right code still changes nothing in force: WorkOS has not answered'
);

select is(
  (select (identity.read_own_identity('workos', 'https://issuer.test', 'user_camila')
     -> 'email' -> 'pending') - 'expires_at'::text),
  jsonb_build_object('address', 'camila.nueva@example.test', 'status', 'applying'),
  'her identity says the change is being applied'
);

select throws_ok(
  $$ select * from pg_temp.ask('user_camila', 'camila.otra@example.test') $$,
  '55000', null,
  'a change being applied is not replaced by another'
);

-- ---------------------------------------------------------------------------
-- The worker applies it after WorkOS
-- ---------------------------------------------------------------------------

select pg_temp.as_worker();

select results_eq(
  $$ select apply_state, subject, new_email, previous_email, keep_session
     from identity.prepare_email_change_apply(
       pg_temp.event('019f5000-0000-7000-8000-000000000501', 'identity.contact_verified.v1')) $$,
  $$ values ('ready'::text, 'user_camila'::text, 'camila.nueva@example.test'::text,
             'camila@example.test'::text, 'session_main'::text) $$,
  'the worker learns whom to update in WorkOS, the old address to warn and the session to keep'
);

select lives_ok(
  $$ select identity.complete_email_change(
       pg_temp.event('019f5000-0000-7000-8000-000000000501', 'identity.contact_verified.v1')) $$,
  'once WorkOS took it, the change completes'
);

select results_eq(
  $$ select contact_email::text, contact_email_verified_at is not null
     from identity.people where id = '019f5000-0000-7000-8000-000000000001' $$,
  $$ values ('camila.nueva@example.test'::text, true) $$,
  'the new address is in force and verified'
);

select results_eq(
  $$ select status::text, confirmed_at is not null
     from identity.identity_action_requests where id = '019f5000-0000-7000-8000-000000000501' $$,
  $$ values ('confirmed'::text, true) $$,
  'and the request is confirmed'
);

select lives_ok(
  $$ select identity.complete_email_change(
       pg_temp.event('019f5000-0000-7000-8000-000000000501', 'identity.contact_verified.v1')) $$,
  'completing again is harmless'
);

select is(
  (select apply_state from identity.prepare_email_change_apply(
     pg_temp.event('019f5000-0000-7000-8000-000000000501', 'identity.contact_verified.v1'))),
  'skipped',
  'and a finished change is skipped'
);

select is(
  (select identity.read_own_identity('workos', 'https://issuer.test', 'user_camila')
     -> 'email' -> 'pending'),
  'null'::jsonb,
  'nothing is pending any more'
);

-- ---------------------------------------------------------------------------
-- When it fails, the address in force does not move
-- ---------------------------------------------------------------------------

select is(
  (select result ->> 'status' from pg_temp.ask('user_camila', 'camila.tres@example.test',
     '019f5000-0000-7000-8000-000000000502')),
  'awaiting_code',
  'she asks again'
);

select is(
  (select result ->> 'status' from pg_temp.ask('user_camila', 'camila.cuatro@example.test',
     '019f5000-0000-7000-8000-000000000503')),
  'awaiting_code',
  'and again, which replaces the open request'
);

select is(
  (pg_temp.request('019f5000-0000-7000-8000-000000000502')).status::text,
  'cancelled',
  'the replaced request is cancelled'
);

select pg_temp.as_worker();
select identity.record_email_change_code(
  pg_temp.event('019f5000-0000-7000-8000-000000000503', 'identity.contact_changed.v1'), '777777');

-- One statement per answer, as every request is.
select * from pg_temp.answer('user_camila', '000000');
select * from pg_temp.answer('user_camila', '000000');
select * from pg_temp.answer('user_camila', '000000');
select * from pg_temp.answer('user_camila', '000000');

select is(
  (select result ->> 'outcome' from pg_temp.answer('user_camila', '000000')),
  'too_many_attempts',
  'the fifth wrong code ends the request'
);

select results_eq(
  $$ select status::text, failure_code from identity.identity_action_requests
     where id = '019f5000-0000-7000-8000-000000000503' $$,
  $$ values ('failed'::text, 'too_many_attempts'::text) $$,
  'it fails for too many attempts'
);

select is(
  (select result from pg_temp.answer('user_camila', '777777')),
  jsonb_build_object('outcome', 'expired'),
  'and the right code comes too late'
);

select is(
  (select result ->> 'status' from pg_temp.ask('user_camila', 'camila.cinco@example.test',
     '019f5000-0000-7000-8000-000000000504')),
  'awaiting_code',
  'a fourth request in the hour still goes through'
);

select pg_temp.as_worker();
select identity.record_email_change_code(
  pg_temp.event('019f5000-0000-7000-8000-000000000504', 'identity.contact_changed.v1'), '555555');
select * from pg_temp.answer('user_camila', '555555');
select pg_temp.as_worker();
select identity.fail_email_change_apply(
  pg_temp.event('019f5000-0000-7000-8000-000000000504', 'identity.contact_verified.v1'));

select results_eq(
  $$ select (select status::text from identity.identity_action_requests
             where id = '019f5000-0000-7000-8000-000000000504'),
            (select failure_code from identity.identity_action_requests
             where id = '019f5000-0000-7000-8000-000000000504'),
            (select contact_email::text from identity.people
             where id = '019f5000-0000-7000-8000-000000000001') $$,
  $$ values ('failed'::text, 'provider_rejected'::text, 'camila.nueva@example.test'::text) $$,
  'when WorkOS refuses, the request fails and the address in force stays'
);

select lives_ok(
  $$ select * from pg_temp.ask('user_camila', 'camila.seis@example.test') $$,
  'a fifth request in the hour goes through'
);

select throws_ok(
  $$ select * from pg_temp.ask('user_camila', 'camila.siete@example.test') $$,
  '55000', null,
  'a sixth is too many'
);

-- ---------------------------------------------------------------------------
-- Backoffice's recoveries do not see these requests
-- ---------------------------------------------------------------------------

select lives_ok(
  $$ select identity.consume_account_recovery_send('019f5000-0000-7000-8000-000000000001') $$,
  'her email changes do not spend the daily recovery emails'
);

select ok(
  not exists (
    select 1 from identity.identity_action_requests
    where action_kind = 'email_change' and initiated_by_kind <> 'person'
  ),
  'every email change was started by its own person'
);

select ok(
  has_function_privilege('allfit_api',
    'identity.request_email_change(text, text, text, text, uuid, uuid, bytea)', 'execute')
  and has_function_privilege('allfit_api',
    'identity.verify_email_change(text, text, text, text, text, uuid, uuid, bytea)', 'execute')
  and has_function_privilege('allfit_api', 'identity.complete_email_change(uuid)', 'execute')
  and not has_function_privilege('public',
    'identity.request_email_change(text, text, text, text, uuid, uuid, bytea)', 'execute'),
  'the API runs the commands, and nobody else'
);

select * from finish();
rollback;
