-- T-IDN-ACTIVATION-02 — what activation tells the rest of the platform (`OP-IDN-003`,
-- `OP-IDN-012`; HU-SP-119; ADR-050, decisions 5 and 7). Activating a person writes one
-- event, keeps the store of her phone, and from then on her identity carries the Founding
-- Member number the waitlist hands over.

begin;

select plan(14);

create function pg_temp.h(n integer) returns bytea language sql immutable as $$
  select decode(lpad(to_hex(n), 64, '0'), 'hex')
$$;
create function pg_temp.key(n integer) returns uuid language sql immutable as $$
  select ('92222222-2222-4222-8222-' || lpad(n::text, 12, '0'))::uuid
$$;
create function pg_temp.activations(p_person uuid) returns bigint language sql as $$
  select count(*) from system.outbox_events
  where event_type = 'identity.person_activated.v1' and aggregate_id = p_person
$$;
create function pg_temp.prepared(p_person uuid) returns text language sql as $$
  select concat_ws('|', link_state, person_id, verified_email, coalesce(store, '-'))
  from identity.prepare_account_link((
    select id from system.outbox_events
    where event_type = 'identity.person_activated.v1' and aggregate_id = p_person
  ))
$$;

insert into identity.access_accounts (id, provider, issuer, subject)
values
  ('019f4100-0000-7000-8000-000000000001', 'workos', 'https://issuer.test', 'activation_space'),
  ('019f4100-0000-7000-8000-000000000002', 'workos', 'https://issuer.test', 'activation_web'),
  ('019f4100-0000-7000-8000-000000000003', 'workos', 'https://issuer.test', 'activation_studio');

-- ---------------------------------------------------------------------------
-- In the app: the person exists since her name, and is activated at the end
-- ---------------------------------------------------------------------------

select set_config('app.actor_kind', 'account', true),
       set_config('app.actor_account_id', '019f4100-0000-7000-8000-000000000001', true);

create temporary table attempt_space as
select attempt_id from identity.start_onboarding_attempt(
  '019f4100-0000-7000-8000-000000000001', pg_temp.key(1), pg_temp.key(2), pg_temp.h(1)
);
select identity.record_adult_eligibility(
  '019f4100-0000-7000-8000-000000000001', (select attempt_id from attempt_space), true,
  pg_temp.key(3), pg_temp.key(4), pg_temp.h(2)
);
create temporary table person_space as
select person_id from identity.declare_fitness_id(
  '019f4100-0000-7000-8000-000000000001', (select attempt_id from attempt_space),
  'Ada', 'Lovelace', 'ada_founding', 'ada.founding@example.test', true,
  pg_temp.key(5), pg_temp.key(6), pg_temp.h(3)
);

select throws_ok(
  $$ select identity.activate_person(
    '019f4100-0000-7000-8000-000000000001', (select attempt_id from attempt_space),
    'Ada', 'Lovelace', true, true, pg_temp.key(7), pg_temp.key(8), pg_temp.h(4), 'galaxy_store'
  ) $$,
  '22023', 'unknown store',
  'a store that is neither of the two is refused'
);
select is(
  pg_temp.activations((select person_id from person_space)), 0::bigint,
  'and a refused completion announces nobody'
);

select identity.activate_person(
  '019f4100-0000-7000-8000-000000000001', (select attempt_id from attempt_space),
  'Ada', 'Lovelace', true, true, pg_temp.key(7), pg_temp.key(8), pg_temp.h(4), 'google_play'
);

select is(
  (select payload from system.outbox_events
   where event_type = 'identity.person_activated.v1'
     and aggregate_id = (select person_id from person_space)),
  jsonb_build_object('person_id', (select person_id from person_space)),
  'activation writes one event, which names nobody'
);
select is(
  (select activation_store from identity.onboarding_attempts
   where id = (select attempt_id from attempt_space)),
  'google_play',
  'the attempt keeps the store the onboarding was completed on'
);

select identity.activate_person(
  '019f4100-0000-7000-8000-000000000001', (select attempt_id from attempt_space),
  'Ada', 'Lovelace', true, true, pg_temp.key(7), pg_temp.key(8), pg_temp.h(4), 'google_play'
);
select is(
  pg_temp.activations((select person_id from person_space)), 1::bigint,
  'the same completion sent again writes no second event'
);

-- ---------------------------------------------------------------------------
-- On the web: no store, and the nine arguments everybody else still sends
-- ---------------------------------------------------------------------------

select set_config('app.actor_account_id', '019f4100-0000-7000-8000-000000000002', true);

create temporary table attempt_web as
select attempt_id from identity.start_onboarding_attempt(
  '019f4100-0000-7000-8000-000000000002', pg_temp.key(11), pg_temp.key(12), pg_temp.h(11)
);
select identity.record_adult_eligibility(
  '019f4100-0000-7000-8000-000000000002', (select attempt_id from attempt_web), true,
  pg_temp.key(13), pg_temp.key(14), pg_temp.h(12)
);
create temporary table person_web as
select person_id from identity.declare_fitness_id(
  '019f4100-0000-7000-8000-000000000002', (select attempt_id from attempt_web),
  'Grace', 'Hopper', 'grace_founding', 'grace.founding@example.test', true,
  pg_temp.key(15), pg_temp.key(16), pg_temp.h(13)
);
select identity.activate_person(
  '019f4100-0000-7000-8000-000000000002', (select attempt_id from attempt_web),
  'Grace', 'Hopper', true, true, pg_temp.key(17), pg_temp.key(18), pg_temp.h(14)
);

-- Studio: no person until this call, and no contact email afterwards.
select set_config('app.actor_account_id', '019f4100-0000-7000-8000-000000000003', true);

create temporary table attempt_studio as
select attempt_id from identity.start_onboarding_attempt(
  '019f4100-0000-7000-8000-000000000003', pg_temp.key(21), pg_temp.key(22), pg_temp.h(21)
);
select identity.record_adult_eligibility(
  '019f4100-0000-7000-8000-000000000003', (select attempt_id from attempt_studio), true,
  pg_temp.key(23), pg_temp.key(24), pg_temp.h(22)
);
create temporary table person_studio as
select identity.activate_person(
  '019f4100-0000-7000-8000-000000000003', (select attempt_id from attempt_studio),
  'Linus', 'Coach', true, true, pg_temp.key(27), pg_temp.key(28), pg_temp.h(24)
) as person_id;

select throws_ok(
  $$ select pg_temp.prepared((select person_id from person_space)) $$,
  '42501', 'worker actor required',
  'an account cannot read what the worker is given'
);

-- ---------------------------------------------------------------------------
-- What the worker reads
-- ---------------------------------------------------------------------------

select set_config('app.actor_kind', 'worker', true);

select is(
  pg_temp.prepared((select person_id from person_space)),
  'ready|' || (select person_id from person_space) || '|ada.founding@example.test|google_play',
  'the worker reads the person, her verified email and her store'
);
select is(
  pg_temp.prepared((select person_id from person_web)),
  'ready|' || (select person_id from person_web) || '|grace.founding@example.test|-',
  'a completion that sends no store is read without one'
);
select is(
  pg_temp.prepared((select person_id from person_studio)),
  'skipped|-',
  'a person activated in Studio has no email to look her up by, and is skipped'
);
select is(
  (select link_state from identity.prepare_account_link(pg_temp.key(99))),
  'skipped',
  'and so is an event that does not exist'
);

-- ---------------------------------------------------------------------------
-- The number on the person
-- ---------------------------------------------------------------------------

select is(
  identity.read_own_identity('workos', 'https://issuer.test', 'activation_space')
    -> 'founding_member_number',
  'null'::jsonb,
  'a person without a number reads none'
);

select identity.record_founding_number((select person_id from person_space), 37::smallint);
select identity.record_founding_number((select person_id from person_space), 37::smallint);

select is(
  identity.read_own_identity('workos', 'https://issuer.test', 'activation_space')
    ->> 'founding_member_number',
  '37',
  'once it is hers she reads it, and being given it twice changes nothing'
);
select throws_ok(
  $$ select identity.record_founding_number(
    (select person_id from person_space), 38::smallint
  ) $$,
  '23514', null,
  'a person who holds a number is never given another'
);
select throws_ok(
  $$ select identity.record_founding_number(
    (select person_id from person_web), 37::smallint
  ) $$,
  '23505', null,
  'and a number has one holder'
);

select * from finish();
rollback;
