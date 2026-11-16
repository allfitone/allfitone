-- T-WL-INT-11 — the counter says registered and active (`OP-WL-001`, `OP-WL-004`;
-- HU-SP-117; ADR-050, decision 6; TECH-334): registered are the referrals that confirmed
-- and count, active are those of them the rewards count, and both travel to the page
-- and to every waitlist email.

begin;

select plan(13);

create function pg_temp.u(n integer) returns uuid language sql immutable as $$
  select ('019e1400-0000-7000-8000-' || lpad(to_hex(n), 12, '0'))::uuid
$$;
create function pg_temp.h(n integer) returns bytea language sql immutable as $$
  select decode(lpad(to_hex(n), 64, '0'), 'hex')
$$;

-- Joins as `p{n}@example.com` with tokens 2n (confirmation) and 2n + 1 (private).
create function pg_temp.joins(p_n integer, p_name text, p_inviter text, p_device integer)
returns text language sql as $$
  select concat_ws('|', outcome, referrals, active_referrals) from waitlist.join(
    p_name, 'p' || p_n || '@example.com', 'es', true, '2026-11-10', p_inviter, null, null,
    null, pg_temp.h(100000 + p_n), pg_temp.h(200000 + p_device),
    pg_temp.u(2 * p_n), pg_temp.h(2 * p_n), pg_temp.u(2 * p_n + 1), pg_temp.h(2 * p_n + 1),
    1::smallint
  )
$$;
create function pg_temp.confirms(p_n integer) returns text language sql as $$
  select outcome from waitlist.confirm(pg_temp.h(2 * p_n), pg_temp.h(900000 + p_n))
$$;
create function pg_temp.id_of(p_n integer) returns uuid language sql as $$
  select id from waitlist.signups where canonical_email = 'p' || p_n || '@example.com'
$$;
create function pg_temp.ana_code() returns text language sql as $$
  select referral_code from waitlist.signups where id = pg_temp.id_of(1)
$$;
-- The counter as «mi link» reads it, each read from its own connection.
create function pg_temp.counter(p_n integer, p_read integer) returns text language sql as $$
  select concat_ws('|', outcome, referrals, active_referrals)
  from waitlist.read_my_link(pg_temp.h(2 * p_n + 1), pg_temp.h(800000 + p_read))
$$;
create function pg_temp.person(p_n integer) returns uuid language sql immutable as $$
  select ('019e1401-0000-7000-8000-' || lpad(to_hex(p_n), 12, '0'))::uuid
$$;

select is(
  pg_temp.joins(1, 'Ana Ruiz', null, 1), 'joined|0|0',
  'a sign-up made this moment has nobody registered and nobody active'
);
select pg_temp.confirms(1);

-- Bruno, Carla and Darío join with Ana's code and confirm. Elena joins from Bruno's
-- device, which already counts for Ana, and Fabio never confirms.
select pg_temp.joins(2, 'Bruno Díaz', pg_temp.ana_code(), 2);
select pg_temp.joins(3, 'Carla Gil', pg_temp.ana_code(), 3);
select pg_temp.joins(4, 'Darío Paz', pg_temp.ana_code(), 4);
select pg_temp.joins(5, 'Elena Mora', pg_temp.ana_code(), 2);
select pg_temp.joins(6, 'Fabio Luna', pg_temp.ana_code(), 6);
select pg_temp.confirms(2), pg_temp.confirms(3), pg_temp.confirms(4), pg_temp.confirms(5);

select is(
  pg_temp.counter(1, 1), 'found|3|0',
  'registered are the referrals that confirmed and count, and nobody is active yet'
);

insert into identity.people (id, given_name, family_name, status)
values
  (pg_temp.person(2), 'Bruno', 'Díaz', 'active'),
  (pg_temp.person(3), 'Carla', 'Gil', 'active'),
  (pg_temp.person(5), 'Elena', 'Mora', 'active');

select set_config('app.actor_kind', 'worker', true);
select waitlist.link_signup(pg_temp.person(2), 'p2@example.com', 'app_store');
select waitlist.link_signup(pg_temp.person(3), 'p3@example.com', 'google_play');
select waitlist.link_signup(pg_temp.person(5), 'p5@example.com', 'app_store');
select set_config('app.actor_kind', '', true);

select is(
  pg_temp.counter(1, 2), 'found|3|0',
  'an account alone does not make a referral active'
);

update waitlist.signups set active_at = clock_timestamp() where id = pg_temp.id_of(2);

select is(
  pg_temp.counter(1, 3), 'found|3|1',
  'a referral marked active counts once for whoever invited it'
);
select is(
  pg_temp.counter(2, 4), 'found|0|0',
  'and not for itself'
);

update waitlist.signups set active_at = clock_timestamp() where id = pg_temp.id_of(5);

select is(
  pg_temp.counter(1, 5), 'found|3|1',
  'a referral the list discarded is active for nobody'
);
select throws_ok(
  $$ update waitlist.signups set active_at = clock_timestamp() where id = pg_temp.id_of(4) $$,
  '23514', null,
  'a sign-up without an account cannot be active'
);

-- ---------------------------------------------------------------------------
-- The emails carry the same two figures
-- ---------------------------------------------------------------------------

select waitlist.request_email(
  'p1@example.com', pg_temp.h(700001), pg_temp.u(9001), pg_temp.h(9001), pg_temp.u(9002),
  pg_temp.h(9002), 1::smallint
);

select set_config('app.actor_kind', 'worker', true);

select is(
  (select concat_ws('|', delivery_state, email_kind, referrals, active_referrals)
   from waitlist.prepare_email_delivery((
     select id from system.outbox_events
     where payload ->> 'private_token_id' = pg_temp.u(9002)::text
   ))),
  'ready|link|3|1',
  'the email with her link says how many registered and how many are active'
);
select is(
  (select concat_ws('|', delivery_state, referrals, active_referrals, founding_number)
   from waitlist.prepare_founding_email((
     select outbox.id from system.outbox_events as outbox
     where outbox.event_type = 'waitlist.founding_number_assigned.v1'
       and outbox.aggregate_id = pg_temp.id_of(1)
   ))),
  'ready|3|1|1',
  'and so does «Eres Founding Member»'
);
select is(
  (select concat_ws('|', delivery_state, referrals, active_referrals)
   from waitlist.prepare_founding_email(pg_temp.u(424242))),
  'skipped',
  'an email that is not sent carries no figure'
);

select set_config('app.actor_kind', '', true);

-- ---------------------------------------------------------------------------
-- Who reaches them
-- ---------------------------------------------------------------------------

select ok(
  has_function_privilege(
    'allfit_api',
    'waitlist.join(text,text,text,boolean,text,text,text,text,text,bytea,bytea,uuid,bytea,uuid,bytea,smallint)',
    'EXECUTE'
  )
    and has_function_privilege('allfit_api', 'waitlist.read_my_link(bytea,bytea)', 'EXECUTE')
    and has_function_privilege('allfit_api', 'waitlist.prepare_email_delivery(uuid)', 'EXECUTE')
    and has_function_privilege('allfit_api', 'waitlist.prepare_founding_email(uuid)', 'EXECUTE'),
  'the runtime role still executes the four entry points that answer the counter'
);
select ok(
  not has_function_privilege('allfit_api', 'waitlist.active_referral_count(uuid)', 'EXECUTE'),
  'and not the helper that counts the active'
);
select ok(
  not has_column_privilege('allfit_api', 'waitlist.signups', 'active_at', 'UPDATE')
    and not has_column_privilege('allfit_api', 'waitlist.signups', 'active_at', 'SELECT'),
  'nor the mark that makes a referral active'
);

select * from finish();
rollback;
