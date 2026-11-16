-- T-WL-RLS-04 — who links a sign-up to an account (`OP-WL-006`; HU-SP-119; ADR-050,
-- decision 7): the worker, through the two entry points, and nobody else. The runtime
-- role reaches neither the helpers behind them nor the table of settled numbers.

begin;

select plan(11);

create function pg_temp.h(n integer) returns bytea language sql immutable as $$
  select decode(lpad(to_hex(n), 64, '0'), 'hex')
$$;
create function pg_temp.u(n integer) returns uuid language sql immutable as $$
  select ('019e1200-0000-7000-8000-' || lpad(to_hex(n), 12, '0'))::uuid
$$;

select ok(
  has_function_privilege('allfit_api', 'waitlist.link_signup(uuid,text,text)', 'EXECUTE')
    and has_function_privilege('allfit_api', 'identity.prepare_account_link(uuid)', 'EXECUTE'),
  'the runtime role executes the two entry points of the link'
);
select ok(
  not has_function_privilege('allfit_api', 'waitlist.settle_founding_number(uuid)', 'EXECUTE')
    and not has_function_privilege(
      'allfit_api', 'identity.record_founding_number(uuid,smallint)', 'EXECUTE'
    ),
  'and neither of the helpers that write a number'
);
select ok(
  not has_table_privilege('allfit_api', 'waitlist.settled_founding_numbers', 'SELECT')
    and not has_table_privilege('allfit_api', 'waitlist.settled_founding_numbers', 'INSERT')
    and not has_table_privilege('allfit_api', 'waitlist.settled_founding_numbers', 'DELETE'),
  'nor the table of settled numbers'
);

insert into identity.people (
  id, given_name, family_name, contact_email, contact_email_verified_at, status, activated_at
) values (
  '019e1201-0000-7000-8000-000000000001', 'Ana', 'Ruiz', 'ana@example.com',
  clock_timestamp(), 'active', clock_timestamp()
);

select waitlist.join(
  'Ana Ruiz', 'ana@example.com', 'es', true, '2026-11-10', null, null, null, null,
  pg_temp.h(1), pg_temp.h(2), pg_temp.u(1), pg_temp.h(3), pg_temp.u(2), pg_temp.h(4),
  1::smallint
);
select waitlist.confirm(pg_temp.h(3), pg_temp.h(5));

create temporary table activation as
select system.enqueue_outbox_event(
  'person', '019e1201-0000-7000-8000-000000000001', 'identity.person_activated.v1',
  jsonb_build_object('person_id', '019e1201-0000-7000-8000-000000000001')
) as event_id;
grant select on activation to allfit_api;

set local role allfit_api;

select throws_ok(
  $$ select * from waitlist.link_signup(
    '019e1201-0000-7000-8000-000000000001'::uuid, 'ana@example.com', 'app_store'
  ) $$,
  '42501', 'worker actor required',
  'a request without an actor cannot link a sign-up'
);
select throws_ok(
  $$ select * from identity.prepare_account_link((select event_id from activation)) $$,
  '42501', 'worker actor required',
  'nor read who was activated'
);

select set_config('app.actor_kind', 'person', true),
       set_config('app.actor_person_id', '019e1201-0000-7000-8000-000000000001', true);

select throws_ok(
  $$ select * from waitlist.link_signup(
    '019e1201-0000-7000-8000-000000000001'::uuid, 'ana@example.com', 'app_store'
  ) $$,
  '42501', 'worker actor required',
  'the person herself cannot link her own sign-up'
);
select throws_ok(
  $$ select * from identity.prepare_account_link((select event_id from activation)) $$,
  '42501', 'worker actor required',
  'nor ask what the worker is given'
);
select throws_ok(
  $$ select count(*) from waitlist.settled_founding_numbers $$,
  '42501', null,
  'the runtime role cannot read the settled numbers'
);
select throws_ok(
  $$ select identity.record_founding_number(
    '019e1201-0000-7000-8000-000000000001'::uuid, 1::smallint
  ) $$,
  '42501', null,
  'nor give a person a number'
);

select set_config('app.actor_kind', 'worker', true),
       set_config('app.actor_person_id', '', true);

select is(
  (select concat_ws('|', link_state, person_id, verified_email)
   from identity.prepare_account_link((select event_id from activation))),
  'ready|019e1201-0000-7000-8000-000000000001|ana@example.com',
  'the worker reads who was activated'
);
select is(
  (select outcome from waitlist.link_signup(
    '019e1201-0000-7000-8000-000000000001'::uuid, 'ana@example.com', 'app_store'
  )),
  'linked',
  'and links her sign-up'
);

select * from finish();
rollback;
