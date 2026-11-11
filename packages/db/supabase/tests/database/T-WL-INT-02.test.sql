-- T-WL-INT-02 — «mi link» and leaving the waitlist (`OP-WL-004`, `OP-WL-005`; ADR-050
-- invariants 4 and 6, and the retention rule's "what survives is a count").

begin;

select plan(21);

create function pg_temp.u(n integer) returns uuid language sql immutable as $$
  select ('019d3000-0000-7000-8000-' || lpad(to_hex(n), 12, '0'))::uuid
$$;
create function pg_temp.h(n integer) returns bytea language sql immutable as $$
  select decode(lpad(to_hex(n), 64, '0'), 'hex')
$$;

-- Joins with tokens 2n (confirmation) and 2n + 1 (private), each from its own device.
create function pg_temp.joins(p_n integer, p_email text, p_code text, p_source text)
returns text language sql as $$
  select referral_code from waitlist.join(
    'Person ' || p_n, p_email, 'es', true, '2026-11-10', p_code, p_source, null, null,
    pg_temp.h(100000 + p_n), pg_temp.h(200000 + p_n),
    pg_temp.u(2 * p_n), pg_temp.h(2 * p_n), pg_temp.u(2 * p_n + 1), pg_temp.h(2 * p_n + 1),
    1::smallint
  )
$$;

create temporary table ana on commit drop as
select pg_temp.joins(1, 'ana@example.com', null, 'instagram') as code;
select pg_temp.joins(2, 'bruno@example.com', (select code from ana), null);
select pg_temp.joins(3, 'carla@example.com', (select code from ana), null);
select waitlist.confirm(pg_temp.h(2), pg_temp.h(900001));
select waitlist.confirm(pg_temp.h(4), pg_temp.h(900001));

-- ---------------------------------------------------------------------------
-- Reading «mi link»
-- ---------------------------------------------------------------------------

select is(
  (select outcome || '|' || (referral_code = (select code from ana)) || '|' || referrals
     || '|' || language || '|' || confirmed
   from waitlist.read_my_link(pg_temp.h(3), pg_temp.h(900002))),
  'found|true|1|es|true',
  'the private link reads the person''s own code, counter and state'
);
select is(
  (select outcome || '|' || referrals || '|' || confirmed
   from waitlist.read_my_link(pg_temp.h(7), pg_temp.h(900002))),
  'found|0|false',
  'an unconfirmed sign-up reads its link too, and says it has not confirmed'
);
select is(
  (select outcome || '|' || coalesce(referral_code, '-')
   from waitlist.read_my_link(pg_temp.h(999999), pg_temp.h(900002))),
  'invalid|-',
  'an unknown link reads nothing'
);
select is(
  (select outcome from waitlist.read_my_link(pg_temp.h(2), pg_temp.h(900002))),
  'invalid',
  'a confirmation token is not a private link'
);
select is(
  (select array_agg(parameter order by parameter)
   from unnest(proargnames) as parameter
   where parameter !~ '^p_'),
  array['confirmed', 'language', 'outcome', 'referral_code', 'referrals'],
  'and what it returns names nobody the person invited'
) from pg_proc where oid = 'waitlist.read_my_link(bytea,bytea)'::regprocedure;

-- ---------------------------------------------------------------------------
-- Leaving
-- ---------------------------------------------------------------------------

select is((select outcome from waitlist.leave(pg_temp.h(2), pg_temp.h(900003))), 'invalid',
  'a confirmation token cannot leave the list');
select is((select outcome from waitlist.leave(pg_temp.h(999999), pg_temp.h(900003))), 'invalid',
  'an unknown link cannot leave the list');
select is((select count(*) from waitlist.signups), 3::bigint,
  'and neither deleted anything');

-- A second email gives Ana a second private link; both must die when she leaves.
select waitlist.request_email(
  'ana@example.com', pg_temp.h(900004),
  pg_temp.u(40), pg_temp.h(40), pg_temp.u(41), pg_temp.h(41), 1::smallint
);

select is((select outcome from waitlist.leave(pg_temp.h(3), pg_temp.h(900003))), 'left',
  'the private link leaves the list');
select is(
  (select count(*) from waitlist.signups where canonical_email = 'ana@example.com'),
  0::bigint,
  'the sign-up is gone: name, email, code and hashes'
);
select is(
  (select count(*) from waitlist.signup_tokens where id in (pg_temp.u(2), pg_temp.u(3), pg_temp.u(41))),
  0::bigint,
  'and so is every token it ever had'
);
select is((select outcome from waitlist.read_my_link(pg_temp.h(41), pg_temp.h(900002))), 'invalid',
  'her other link stops reading');
select is((select outcome from waitlist.leave(pg_temp.h(3), pg_temp.h(900003))), 'invalid',
  'leaving again answers like a link that never existed');

select is(
  (select count(*) || '|' || count(invited_by_signup_id) from waitlist.signups),
  '2|0',
  'the people she invited stay on the list, and count for nobody'
);

select is(
  (select joined_on = (clock_timestamp() at time zone 'America/Bogota')::date
     and utm_source = 'instagram' and language = 'es' and signups = 1 and confirmed = 1
   from waitlist.departed_daily_totals),
  true,
  'what survives is a count by day, channel and language'
);
select is(
  (select string_agg(attname, ',' order by attnum)
   from pg_attribute
   where attrelid = 'waitlist.departed_daily_totals'::regclass and attnum > 0 and not attisdropped),
  'joined_on,utm_source,language,signups,confirmed',
  'and that table has no column that could hold a person'
);

select waitlist.leave(pg_temp.h(7), pg_temp.h(900003));
select is(
  (select string_agg(utm_source || ':' || signups || ':' || confirmed, ',' order by utm_source)
   from waitlist.departed_daily_totals),
  ':1:0,instagram:1:1',
  'a sign-up without a channel that never confirmed is counted as such'
);

-- An email still waiting for a sign-up that left is skipped, not sent.
select set_config('app.actor_kind', 'worker', true);
select is(
  (select delivery_state from waitlist.prepare_email_delivery((
     select id from system.outbox_events
     where payload ->> 'private_token_id' = pg_temp.u(41)::text
   ))),
  'skipped',
  'an email queued for somebody who left is never sent'
);
select set_config('app.actor_kind', '', true);

-- ---------------------------------------------------------------------------
-- The limit and the grants
-- ---------------------------------------------------------------------------

update waitlist.rate_windows
set attempt_count = 60
where scope = 'private_link' and scope_hash = pg_temp.h(900002);
select is((select outcome from waitlist.read_my_link(pg_temp.h(5), pg_temp.h(900002))), 'rate_limited',
  'past sixty reads in an hour from one connection, the link stops answering');

select ok(
  has_function_privilege('allfit_api', 'waitlist.read_my_link(bytea,bytea)', 'EXECUTE')
    and has_function_privilege('allfit_api', 'waitlist.leave(bytea,bytea)', 'EXECUTE')
    and not has_function_privilege('allfit_api', 'waitlist.forget_signup(uuid)', 'EXECUTE'),
  'the runtime role reads and leaves through the link, and cannot delete a sign-up by its id'
);
select ok(
  not has_table_privilege('allfit_api', 'waitlist.departed_daily_totals', 'SELECT')
    and (select relrowsecurity and relforcerowsecurity
         from pg_class where oid = 'waitlist.departed_daily_totals'::regclass),
  'and holds nothing on the totals table'
);

select * from finish();
rollback;
