-- T-WL-RLS-01 — the waitlist is reachable only through its functions (ADR-050,
-- invariants 3 and 4).
--
-- A sign-up belongs to somebody with no account, so no row policy could admit an actor.
-- The runtime role holds no privilege on the tables and executes only the four entry
-- points; the helpers that write tokens or count attempts are not its to call.

begin;

select plan(7);

select ok(
  not has_table_privilege('allfit_api', 'waitlist.signups', 'SELECT')
    and not has_table_privilege('allfit_api', 'waitlist.signups', 'INSERT')
    and not has_table_privilege('allfit_api', 'waitlist.signup_tokens', 'SELECT')
    and not has_table_privilege('allfit_api', 'waitlist.rate_windows', 'SELECT'),
  'the runtime role holds no privilege on the waitlist tables'
);

select ok(
  (select bool_and(relrowsecurity and relforcerowsecurity)
   from pg_class
   where relnamespace = 'waitlist'::regnamespace and relkind = 'r'),
  'every waitlist table has row security enabled and forced'
);

select ok(
  has_function_privilege(
    'allfit_api',
    'waitlist.join(text,text,text,boolean,text,text,text,text,text,bytea,bytea,uuid,bytea,uuid,bytea,smallint)',
    'EXECUTE'
  )
    and has_function_privilege('allfit_api', 'waitlist.confirm(bytea,bytea)', 'EXECUTE')
    and has_function_privilege(
      'allfit_api', 'waitlist.request_email(text,bytea,uuid,bytea,uuid,bytea,smallint)', 'EXECUTE'
    )
    and has_function_privilege('allfit_api', 'waitlist.prepare_email_delivery(uuid)', 'EXECUTE'),
  'the runtime role executes the four entry points'
);

select ok(
  not has_function_privilege(
    'allfit_api', 'waitlist.issue_signup_email(uuid,uuid,bytea,uuid,bytea,smallint)', 'EXECUTE'
  )
    and not has_function_privilege(
      'allfit_api', 'waitlist.consume_rate_window(text,bytea,interval,integer)', 'EXECUTE'
    )
    and not has_function_privilege('allfit_api', 'waitlist.referral_count(uuid)', 'EXECUTE')
    and not has_function_privilege('allfit_api', 'waitlist.new_referral_code()', 'EXECUTE'),
  'and none of the helpers behind them'
);

select waitlist.join(
  'Ana', 'ana@example.com', 'en', true, '2026-11-10', null, null, null, null,
  decode(repeat('a1', 32), 'hex'), null,
  '019d1000-0000-7000-8000-000000000001', decode(repeat('b1', 32), 'hex'),
  '019d1000-0000-7000-8000-000000000002', decode(repeat('b2', 32), 'hex'),
  1::smallint
);

set local role allfit_api;

select throws_ok(
  $$ select count(*) from waitlist.signups $$,
  '42501',
  null,
  'the runtime role cannot read a sign-up from the table'
);

select throws_ok(
  $$ select * from waitlist.prepare_email_delivery(
    (select '019d1000-0000-7000-8000-000000000009'::uuid)
  ) $$,
  '42501',
  'worker actor required',
  'an actor that is not the worker cannot ask what an email carries'
);

select set_config('app.actor_kind', 'worker', true);
select is(
  (select delivery_state from waitlist.prepare_email_delivery(
     '019d1000-0000-7000-8000-000000000009'::uuid
   )),
  'skipped',
  'the worker can, and an event that does not exist is skipped'
);

reset role;

select * from finish();
rollback;
