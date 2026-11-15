-- T-WL-INT-04 — the first hundred confirmed are Founding Members (`OP-WL-002`,
-- `OP-WL-007`; HU-SP-118; ADR-050, decision 5 and invariant 5): a number from 1 to 100 in
-- confirmation order, at most one holder each, and a number its holder gives up goes to
-- the earliest-confirmed sign-up without one.

begin;

select plan(27);

create function pg_temp.u(n integer) returns uuid language sql immutable as $$
  select ('019d5000-0000-7000-8000-' || lpad(to_hex(n), 12, '0'))::uuid
$$;
create function pg_temp.h(n integer) returns bytea language sql immutable as $$
  select decode(lpad(to_hex(n), 64, '0'), 'hex')
$$;

-- Joins with tokens 2n (confirmation) and 2n + 1 (private), each from its own device.
create function pg_temp.joins(p_n integer, p_name text) returns text language sql as $$
  select referral_code from waitlist.join(
    p_name, 'p' || p_n || '@example.com', 'es', true, '2026-11-10', null, null, null, null,
    pg_temp.h(100000 + p_n), pg_temp.h(200000 + p_n),
    pg_temp.u(2 * p_n), pg_temp.h(2 * p_n), pg_temp.u(2 * p_n + 1), pg_temp.h(2 * p_n + 1),
    1::smallint
  )
$$;
-- Each confirmation comes from its own connection, so no limit gets in the way.
create function pg_temp.confirms(p_n integer) returns text language sql as $$
  select outcome || '|' || coalesce(founding_number::text, '-')
  from waitlist.confirm(pg_temp.h(2 * p_n), pg_temp.h(900000 + p_n))
$$;
create function pg_temp.number_of(p_n integer) returns smallint language sql as $$
  select founding_number from waitlist.signups where canonical_email = 'p' || p_n || '@example.com'
$$;
create function pg_temp.events() returns bigint language sql as $$
  select count(*) from system.outbox_events
  where event_type = 'waitlist.founding_number_assigned.v1'
$$;
create function pg_temp.event_of(p_n integer) returns uuid language sql as $$
  select outbox.id
  from system.outbox_events as outbox
  join waitlist.signups as signup on signup.id = outbox.aggregate_id
  where outbox.event_type = 'waitlist.founding_number_assigned.v1'
    and signup.canonical_email = 'p' || p_n || '@example.com'
$$;
-- What the worker is given to write «Eres Founding Member», on one line.
create function pg_temp.email(p_event_id uuid) returns text language sql as $$
  select concat_ws('|', delivery_state, recipient_name, recipient_email, language,
                   referrals, founding_number, private_token_id, token_key_version)
  from waitlist.prepare_founding_email(p_event_id)
$$;

select pg_temp.joins(1, 'Ana Ruiz');
select pg_temp.joins(2, 'Bruno Díaz');
select pg_temp.joins(3, 'Carla Gil');

select is(
  (select count(*) from waitlist.signups where founding_number is not null), 0::bigint,
  'joining gives nobody a number'
);

select is(pg_temp.confirms(1), 'confirmed|1', 'the first to confirm is Founding Member #1');
select is(
  (select payload from system.outbox_events where id = pg_temp.event_of(1)),
  jsonb_build_object('founding_number', 1),
  'and one event asks for her email, holding the number and nothing that names her'
);
select is(pg_temp.confirms(1), 'already_confirmed|1',
  'the same link used again answers with the number she already holds');
select is(pg_temp.events(), 1::bigint, 'and asks for no second email');

select is(pg_temp.confirms(2), 'confirmed|2', 'the second to confirm is #2');
select is(pg_temp.confirms(3), 'confirmed|3', 'and the third is #3');

select is(
  (select confirmed::text || '|' || founding_number
   from waitlist.read_my_link(pg_temp.h(3), pg_temp.h(800001))),
  'true|1',
  'her private link reads her number'
);

-- ---------------------------------------------------------------------------
-- What the worker reads
-- ---------------------------------------------------------------------------

select set_config('app.actor_kind', 'worker', true);

select is(
  pg_temp.email(pg_temp.event_of(1)),
  'ready|Ana Ruiz|p1@example.com|es|0|1|' || pg_temp.u(3) || '|1',
  'the worker reads who holds the number, and the private link her email carries'
);
select is(
  (select founding_number
   from waitlist.prepare_team_notice((
     select outbox.id
     from system.outbox_events as outbox
     join waitlist.signups as signup on signup.id = outbox.aggregate_id
     where outbox.event_type = 'waitlist.signup_confirmed.v1'
       and signup.canonical_email = 'p2@example.com'
   ))),
  2::smallint,
  'and the team''s notice says which number the person took'
);
select is(pg_temp.email(pg_temp.u(999999)), 'skipped', 'an event that does not exist is skipped');

select set_config('app.actor_kind', '', true);

-- ---------------------------------------------------------------------------
-- The hundred
-- ---------------------------------------------------------------------------

select pg_temp.joins(n, 'Person ' || n) from generate_series(4, 105) as n;
select is(
  (select founding_number from waitlist.read_my_link(pg_temp.h(9), pg_temp.h(800001))),
  null::smallint,
  'a sign-up that has not confirmed holds no number'
);

do $$
begin
  for n in 4..99 loop
    perform pg_temp.confirms(n);
  end loop;
end
$$;

select is(pg_temp.confirms(100), 'confirmed|100', 'the hundredth to confirm is #100');
select is(pg_temp.confirms(101), 'confirmed|-', 'the next one confirms and gets no number');
select is(pg_temp.confirms(102), 'confirmed|-', 'and neither does the one after');
select is(pg_temp.confirms(103), 'confirmed|-', 'nor a third');
select is(pg_temp.events(), 100::bigint, 'a hundred emails were asked for, and no more');
select is(
  (select count(*) || '|' || count(distinct founding_number) || '|' || min(founding_number)
     || '|' || max(founding_number)
   from waitlist.signups where founding_number is not null),
  '100|100|1|100',
  'a hundred numbers are held, each by one sign-up, from 1 to 100'
);

-- ---------------------------------------------------------------------------
-- A number its holder gives up
-- ---------------------------------------------------------------------------

create temporary table bruno_event on commit drop as select pg_temp.event_of(2) as id;

-- An unconfirmed sign-up leaves: nothing moves.
select waitlist.leave(pg_temp.h(2 * 104 + 1), pg_temp.h(800002));
select is(pg_temp.events(), 100::bigint, 'somebody without a number leaves and nothing moves');

-- Bruno, #2, leaves.
select waitlist.leave(pg_temp.h(5), pg_temp.h(800002));
select is(
  pg_temp.number_of(101) || '|' || coalesce(pg_temp.number_of(102)::text, '-'),
  '2|-',
  'the number of someone who leaves goes to the earliest-confirmed sign-up without one'
);
select is(
  (select payload from system.outbox_events where id = pg_temp.event_of(101)),
  jsonb_build_object('founding_number', 2),
  'and that person is told'
);

-- The team marks the next in line as fraud, then Carla, #3, leaves.
update waitlist.signups set discard_reason = 'fraud' where canonical_email = 'p102@example.com';
select waitlist.leave(pg_temp.h(7), pg_temp.h(800002));
select is(
  coalesce(pg_temp.number_of(102)::text, '-') || '|' || pg_temp.number_of(103),
  '-|3',
  'a sign-up marked as fraud is passed over'
);
select is(
  (select count(*) || '|' || count(distinct founding_number)
   from waitlist.signups where founding_number is not null),
  '100|100',
  'and a hundred numbers are held again, each by one sign-up'
);

-- Filling again finds nothing to do.
select waitlist.fill_founding_numbers();
select is(pg_temp.events(), 102::bigint, 'filling the numbers twice gives nothing twice');

select set_config('app.actor_kind', 'worker', true);

select is(
  pg_temp.email((select id from bruno_event)),
  'skipped',
  'the email of somebody who left is never written'
);

-- A number taken away before its email is written: the email would say what is no longer true.
update waitlist.signups
set founding_number = null, founding_assigned_at = null, discard_reason = 'fraud'
where canonical_email = 'p10@example.com';
select is(
  pg_temp.email(pg_temp.event_of(10)),
  'skipped',
  'and neither is the email of a number its sign-up no longer holds'
);

select throws_ok(
  $$ update waitlist.signups set founding_number = 1 where canonical_email = 'p105@example.com' $$,
  '23514',
  null,
  'a number cannot be held without the moment it was given, nor before confirming'
);

select * from finish();
rollback;
