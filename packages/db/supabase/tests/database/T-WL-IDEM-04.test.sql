-- T-WL-IDEM-04 — linking is idempotent (`OP-WL-006`; HU-SP-119; ADR-050, decision 7): the
-- worker may be handed the same event twice, and the second link changes nothing.

begin;

select plan(7);

create function pg_temp.h(n integer) returns bytea language sql immutable as $$
  select decode(lpad(to_hex(n), 64, '0'), 'hex')
$$;
create function pg_temp.u(n integer) returns uuid language sql immutable as $$
  select ('019e1100-0000-7000-8000-' || lpad(to_hex(n), 12, '0'))::uuid
$$;
create function pg_temp.joins(p_n integer, p_name text, p_email text) returns text
language sql as $$
  select referral_code from waitlist.join(
    p_name, p_email, 'es', true, '2026-11-10', null, null, null, null,
    pg_temp.h(100000 + p_n), pg_temp.h(200000 + p_n),
    pg_temp.u(2 * p_n), pg_temp.h(2 * p_n), pg_temp.u(2 * p_n + 1), pg_temp.h(2 * p_n + 1),
    1::smallint
  )
$$;
create function pg_temp.links(p_person uuid, p_email text, p_store text) returns text
language sql as $$
  select outcome || '|' || coalesce(founding_number::text, '-')
  from waitlist.link_signup(p_person, p_email, p_store)
$$;
create function pg_temp.events(p_type text) returns bigint language sql as $$
  select count(*) from system.outbox_events where event_type = p_type
$$;

insert into identity.people (id, given_name, family_name, status)
values
  (pg_temp.u(9001), 'Ana', 'Ruiz', 'active'),
  (pg_temp.u(9002), 'Carla', 'Mora', 'active');

select pg_temp.joins(1, 'Ana Ruiz', 'ana@example.com');
select pg_temp.joins(2, 'Carla Mora', 'carla@example.com');
select waitlist.confirm(pg_temp.h(2), pg_temp.h(900001));

select set_config('app.actor_kind', 'worker', true);

select is(
  pg_temp.links(pg_temp.u(9001), 'ana@example.com', 'app_store'), 'linked|1',
  'the first link is made'
);
create temporary table first_link as
select linked_at, store from waitlist.signups where email::text = 'ana@example.com';

select is(
  pg_temp.links(pg_temp.u(9001), 'ana@example.com', 'google_play'), 'already_linked|1',
  'the same link again answers what the first one did'
);
select is(
  (select signup.linked_at = first_link.linked_at and signup.store = first_link.store
   from waitlist.signups as signup, first_link
   where signup.email::text = 'ana@example.com'),
  true,
  'and moves neither the moment nor the store'
);
select is(
  (select count(*) from waitlist.settled_founding_numbers), 1::bigint,
  'her number is written down once'
);

-- Carla never confirmed: the link confirms her, once.
select pg_temp.links(pg_temp.u(9002), 'carla@example.com', null);
select is(
  pg_temp.links(pg_temp.u(9002), 'carla@example.com', null), 'already_linked|2',
  'a link that confirmed a sign-up answers the same when it is repeated'
);
select is(
  pg_temp.events('waitlist.signup_confirmed.v1'), 2::bigint,
  'the team hears of each confirmation once'
);
select is(
  pg_temp.events('waitlist.founding_number_assigned.v1'), 2::bigint,
  'and each Founding Member email is asked for once'
);

select * from finish();
rollback;
