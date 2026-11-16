-- T-WL-INT-09 — a sign-up is linked to the Allfit Space account created with its email
-- (`OP-WL-006`; HU-SP-119; ADR-050, decisions 5 and 7): the link is made when the person
-- finishes the onboarding, by the canonical email; an unconfirmed sign-up is confirmed by
-- it; and a number that reached a person is never given to anybody else.

begin;

select plan(29);

create function pg_temp.h(n integer) returns bytea language sql immutable as $$
  select decode(lpad(to_hex(n), 64, '0'), 'hex')
$$;
create function pg_temp.u(n integer) returns uuid language sql immutable as $$
  select ('019e1000-0000-7000-8000-' || lpad(to_hex(n), 12, '0'))::uuid
$$;
create function pg_temp.key(n integer) returns uuid language sql immutable as $$
  select ('91111111-1111-4111-8111-' || lpad(n::text, 12, '0'))::uuid
$$;

-- Joins with tokens 2n (confirmation) and 2n + 1 (private), each from its own device.
create function pg_temp.joins(p_n integer, p_name text, p_email text) returns text
language sql as $$
  select referral_code from waitlist.join(
    p_name, p_email, 'es', true, '2026-11-10', null, null, null, null,
    pg_temp.h(100000 + p_n), pg_temp.h(200000 + p_n),
    pg_temp.u(2 * p_n), pg_temp.h(2 * p_n), pg_temp.u(2 * p_n + 1), pg_temp.h(2 * p_n + 1),
    1::smallint
  )
$$;
create function pg_temp.confirms(p_n integer) returns text language sql as $$
  select outcome || '|' || coalesce(founding_number::text, '-')
  from waitlist.confirm(pg_temp.h(2 * p_n), pg_temp.h(900000 + p_n))
$$;
create function pg_temp.id_of(p_email text) returns uuid language sql as $$
  select id from waitlist.signups where email::text = p_email
$$;
create function pg_temp.links(p_person uuid, p_email text, p_store text) returns text
language sql as $$
  select outcome || '|' || coalesce(founding_number::text, '-')
  from waitlist.link_signup(p_person, p_email, p_store)
$$;
create function pg_temp.number_of(p_person uuid) returns smallint language sql as $$
  select founding_member_number from identity.people where id = p_person
$$;
create function pg_temp.activations() returns bigint language sql as $$
  select count(*) from system.outbox_events where event_type = 'identity.person_activated.v1'
$$;

insert into identity.people (id, given_name, family_name, status)
values
  (pg_temp.u(9001), 'Ana', 'Ruiz', 'active'),
  (pg_temp.u(9002), 'Carla', 'Mora', 'active'),
  (pg_temp.u(9003), 'Nadia', 'Soto', 'active'),
  (pg_temp.u(9004), 'Ana', 'Otra', 'active'),
  (pg_temp.u(9005), 'Zoe', 'Lara', 'active');

select pg_temp.joins(1, 'Ana Ruiz', 'ana.ruiz+promo@gmail.com');
select pg_temp.joins(2, 'Bruno Díaz', 'bruno@example.com');
select pg_temp.joins(3, 'Dana Gil', 'dana@example.com');
select pg_temp.joins(4, 'Carla Mora', 'carla@example.com');
select pg_temp.confirms(1);
select pg_temp.confirms(2);
select pg_temp.confirms(3);

-- ---------------------------------------------------------------------------
-- Dana creates her account in the app: the event is written when she finishes
-- ---------------------------------------------------------------------------

insert into identity.access_accounts (id, provider, issuer, subject)
values (pg_temp.u(8001), 'workos', 'https://issuer.test', 'link_dana');

select set_config('app.actor_kind', 'account', true),
       set_config('app.actor_account_id', pg_temp.u(8001)::text, true);

create temporary table attempt as
select attempt_id from identity.start_onboarding_attempt(
  pg_temp.u(8001), pg_temp.key(1), pg_temp.key(2), pg_temp.h(1)
);
select identity.record_adult_eligibility(
  pg_temp.u(8001), (select attempt_id from attempt), true,
  pg_temp.key(3), pg_temp.key(4), pg_temp.h(2)
);
create temporary table dana as
select person_id from identity.declare_fitness_id(
  pg_temp.u(8001), (select attempt_id from attempt),
  'Dana', 'Gil', 'dana_link', 'dana@example.com', true,
  pg_temp.key(5), pg_temp.key(6), pg_temp.h(3)
);

select is(pg_temp.activations(), 0::bigint, 'giving her name is not having an account yet');

select identity.activate_person(
  pg_temp.u(8001), (select attempt_id from attempt), 'Dana', 'Gil', true, true,
  pg_temp.key(7), pg_temp.key(8), pg_temp.h(4), 'app_store'
);

select is(
  (select aggregate_type || '|' || aggregate_id
   from system.outbox_events where event_type = 'identity.person_activated.v1'),
  'person|' || (select person_id from dana),
  'finishing the onboarding announces the person'
);

select identity.activate_person(
  pg_temp.u(8001), (select attempt_id from attempt), 'Dana', 'Gil', true, true,
  pg_temp.key(7), pg_temp.key(8), pg_temp.h(4), 'app_store'
);
select is(pg_temp.activations(), 1::bigint, 'and a completion sent again announces nothing more');

-- ---------------------------------------------------------------------------
-- The worker links her
-- ---------------------------------------------------------------------------

select set_config('app.actor_kind', 'worker', true);

select is(
  (select concat_ws('|', link_state, person_id, verified_email, store)
   from identity.prepare_account_link((
     select id from system.outbox_events where event_type = 'identity.person_activated.v1'
   ))),
  'ready|' || (select person_id from dana) || '|dana@example.com|app_store',
  'the worker reads who she is, her verified email and the store of her phone'
);

select is(
  pg_temp.links((select person_id from dana), 'dana@example.com', 'app_store'),
  'linked|3',
  'her sign-up is linked, and the answer carries her number'
);
select is(
  (select concat_ws('|', person_id, store, (linked_at is not null)::text)
   from waitlist.signups where id = pg_temp.id_of('dana@example.com')),
  (select person_id from dana) || '|app_store|true',
  'the sign-up keeps the person, the store and when it was linked'
);
select is(
  pg_temp.number_of((select person_id from dana)), 3::smallint,
  'the number is copied to the person'
);
select is(
  identity.read_own_identity('workos', 'https://issuer.test', 'link_dana')
    ->> 'founding_member_number',
  '3',
  'and she reads it with her identity'
);

-- Reading her identity made her the actor; the worker takes over again.
select set_config('app.actor_kind', 'worker', true);

select is(
  pg_temp.links(pg_temp.u(9001), 'anaruiz@gmail.com', 'google_play'),
  'linked|1',
  'an account whose address is the same mailbox written another way finds the sign-up'
);

-- ---------------------------------------------------------------------------
-- A sign-up that never confirmed
-- ---------------------------------------------------------------------------

select is(
  pg_temp.links(pg_temp.u(9002), 'carla@example.com', null),
  'linked|4',
  'a sign-up that never confirmed is confirmed by the account, and takes its number'
);
select is(
  (select (confirmed_at is not null)::text || '|' || coalesce(store, '-')
   from waitlist.signups where id = pg_temp.id_of('carla@example.com')),
  'true|-',
  'it is confirmed from that moment; an account made on the web has no store'
);
select is(
  (select payload from system.outbox_events
   where event_type = 'waitlist.signup_confirmed.v1'
     and aggregate_id = pg_temp.id_of('carla@example.com')),
  jsonb_build_object('confirmed_total', 4),
  'the team hears of it as of any other confirmation'
);
select is(
  (select count(*) from system.outbox_events
   where event_type = 'waitlist.founding_number_assigned.v1'
     and aggregate_id = pg_temp.id_of('carla@example.com')),
  1::bigint,
  'and her Founding Member email is asked for'
);

-- ---------------------------------------------------------------------------
-- What is not linked
-- ---------------------------------------------------------------------------

select is(
  pg_temp.links(pg_temp.u(9003), 'nadia@example.com', 'app_store'),
  'no_signup|-',
  'an account whose email is not on the list links nothing'
);
select is(
  pg_temp.links(pg_temp.u(9004), 'a.naruiz@gmail.com', 'app_store'),
  'conflict|-',
  'a second account of the same mailbox does not take the sign-up'
);
select is(
  (select person_id from waitlist.signups
   where id = pg_temp.id_of('ana.ruiz+promo@gmail.com')),
  pg_temp.u(9001),
  'which stays with the first one'
);
select is(
  pg_temp.links(pg_temp.u(9001), 'bruno@example.com', null),
  'conflict|-',
  'and a person who has a sign-up does not take a second one'
);
select is(
  concat_ws('|',
    waitlist.backoffice_signup_projection(pg_temp.id_of('dana@example.com'))
      ->> 'has_space_account',
    waitlist.backoffice_signup_projection(pg_temp.id_of('bruno@example.com'))
      ->> 'has_space_account'),
  'true|false',
  'the Backoffice reads which sign-ups have an account'
);
select is(
  array(select founding_number from waitlist.settled_founding_numbers order by 1),
  array[1, 3, 4]::smallint[],
  'the numbers that reached a person are written down'
);

-- ---------------------------------------------------------------------------
-- The number stops moving
-- ---------------------------------------------------------------------------

-- Bruno has no account, Dana has one. Both leave the list.
select waitlist.forget_signup(pg_temp.id_of('bruno@example.com'));
select waitlist.forget_signup(pg_temp.id_of('dana@example.com'));

select pg_temp.joins(5, 'Eva Paz', 'eva@example.com');
select pg_temp.joins(6, 'Fabio Rey', 'fabio@example.com');

select is(
  pg_temp.confirms(5), 'confirmed|2',
  'the number of somebody who left without an account goes to the next in line'
);
select is(
  pg_temp.confirms(6), 'confirmed|5',
  'the number of somebody with an account is never given again'
);
select is(
  pg_temp.number_of((select person_id from dana)), 3::smallint,
  'and she keeps it'
);

-- ---------------------------------------------------------------------------
-- A number that arrives after the link
-- ---------------------------------------------------------------------------

-- Ninety-five more confirm: with Dana's number, the hundred are spoken for.
select count(pg_temp.joins(n, 'Persona ' || n, 'q' || n || '@example.com'))
from generate_series(10, 104) as n;
select count(pg_temp.confirms(n)) from generate_series(10, 104) as n;

select pg_temp.joins(200, 'Zoe Lara', 'zoe@example.com');
select is(pg_temp.confirms(200), 'confirmed|-', 'the next to confirm finds no number free');

select is(
  pg_temp.links(pg_temp.u(9005), 'zoe@example.com', 'google_play'),
  'linked|-',
  'a sign-up without a number is linked all the same'
);
select is(pg_temp.number_of(pg_temp.u(9005)), null::smallint, 'and the person holds none');

select waitlist.forget_signup(pg_temp.id_of('q10@example.com'));

select is(
  pg_temp.number_of(pg_temp.u(9005)), 6::smallint,
  'a number that reaches a linked sign-up later is the person''s at once'
);
select ok(
  exists (select 1 from waitlist.settled_founding_numbers where founding_number = 6),
  'and it is written down as hers'
);

-- ---------------------------------------------------------------------------
-- The sign-up goes with the person
-- ---------------------------------------------------------------------------

reset role;
delete from identity.people where id = pg_temp.u(9005);

select is(
  (select count(*) from waitlist.signups where email::text = 'zoe@example.com'),
  0::bigint,
  'when a person is deleted, her sign-up is deleted with her'
);

select pg_temp.joins(201, 'Yago Luna', 'yago@example.com');
select is(
  pg_temp.confirms(201), 'confirmed|-',
  'and nobody inherits the number she had'
);

select * from finish();
rollback;
