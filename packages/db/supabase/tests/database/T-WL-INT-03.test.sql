-- T-WL-INT-03 — the team hears that someone confirmed on the waitlist (`OP-WL-002`;
-- ADR-050): one `waitlist.signup_confirmed.v1` event per sign-up, when its address is
-- confirmed. The event names nobody; the worker reads who it was when it writes the
-- notice, and somebody who left by then is never announced.

begin;

select plan(15);

create function pg_temp.u(n integer) returns uuid language sql immutable as $$
  select ('019d4000-0000-7000-8000-' || lpad(to_hex(n), 12, '0'))::uuid
$$;
create function pg_temp.h(n integer) returns bytea language sql immutable as $$
  select decode(lpad(to_hex(n), 64, '0'), 'hex')
$$;

-- Joins with tokens 2n (confirmation) and 2n + 1 (private).
create function pg_temp.joins(
  p_n integer, p_name text, p_email text, p_language text, p_code text, p_source text,
  p_device integer
) returns text language sql as $$
  select referral_code from waitlist.join(
    p_name, p_email, p_language, true, '2026-11-10', p_code, p_source, null, null,
    pg_temp.h(100000 + p_n), pg_temp.h(200000 + p_device),
    pg_temp.u(2 * p_n), pg_temp.h(2 * p_n), pg_temp.u(2 * p_n + 1), pg_temp.h(2 * p_n + 1),
    1::smallint
  )
$$;

create function pg_temp.events() returns bigint language sql as $$
  select count(*) from system.outbox_events where event_type = 'waitlist.signup_confirmed.v1'
$$;
create function pg_temp.event_of(p_email text) returns uuid language sql as $$
  select outbox.id
  from system.outbox_events as outbox
  join waitlist.signups as signup on signup.id = outbox.aggregate_id
  where outbox.event_type = 'waitlist.signup_confirmed.v1'
    and signup.canonical_email = p_email
$$;
-- What the worker is given to write the notice, on one line.
create function pg_temp.notice(p_event_id uuid) returns text language sql as $$
  select concat_ws('|', delivery_state, person_name, person_email,
                   case when delivery_state = 'ready' then coalesce(utm_source, '-') end,
                   language, referred::text, confirmed_total)
  from waitlist.prepare_team_notice(p_event_id)
$$;

create temporary table ana on commit drop as
select pg_temp.joins(1, 'Ana Ruiz', 'Ana.Ruiz@example.com', 'es', null, 'instagram', 1) as code;
-- Bruno counts for Ana; Carla joins from Ana's own device, so she does not.
select pg_temp.joins(2, 'Bruno Díaz', 'bruno@example.com', 'en', (select code from ana), null, 2);
select pg_temp.joins(3, 'Carla Gil', 'carla@example.com', 'es', (select code from ana), null, 1);

select is(pg_temp.events(), 0::bigint, 'joining tells the team nothing yet');
select isnt(
  (select discard_reason from waitlist.signups where canonical_email = 'carla@example.com'),
  null,
  'and the sign-up from the inviter''s own device is discarded'
);

select waitlist.confirm(pg_temp.h(2), pg_temp.h(900001));
select is(pg_temp.events(), 1::bigint, 'confirming enqueues one event for the team');
select is(
  (select payload from system.outbox_events where id = pg_temp.event_of('ana.ruiz@example.com')),
  jsonb_build_object('confirmed_total', 1),
  'and the event holds the list''s new total and nothing that names the person'
);

select is((select outcome from waitlist.confirm(pg_temp.h(2), pg_temp.h(900001))), 'already_confirmed',
  'the same link used again confirms nothing');
select is(pg_temp.events(), 1::bigint, 'and tells the team nothing twice');

select waitlist.confirm(pg_temp.h(4), pg_temp.h(900001));
select waitlist.confirm(pg_temp.h(6), pg_temp.h(900001));

select is((select outcome from waitlist.confirm(pg_temp.h(999999), pg_temp.h(900001))), 'invalid',
  'an unknown link is invalid');
select is((select outcome from waitlist.confirm(pg_temp.h(3), pg_temp.h(900001))), 'invalid',
  'a private link does not confirm');
select is(pg_temp.events(), 3::bigint, 'and neither tells the team anything');

-- ---------------------------------------------------------------------------
-- Writing the notice
-- ---------------------------------------------------------------------------

select set_config('app.actor_kind', 'worker', true);

select is(
  pg_temp.notice(pg_temp.event_of('ana.ruiz@example.com')),
  'ready|Ana Ruiz|Ana.Ruiz@example.com|instagram|es|false|1',
  'the worker reads who confirmed, as she wrote herself, with her channel and the total'
);
select is(
  pg_temp.notice(pg_temp.event_of('bruno@example.com')),
  'ready|Bruno Díaz|bruno@example.com|-|en|true|2',
  'a sign-up that counts for its inviter says so, and one with no channel carries none'
);
select is(
  pg_temp.notice(pg_temp.event_of('carla@example.com')),
  'ready|Carla Gil|carla@example.com|-|es|false|3',
  'a discarded sign-up confirms and is counted, but is not somebody''s referral'
);
select is(
  pg_temp.notice(pg_temp.u(999999)),
  'skipped',
  'an event that does not exist is skipped'
);
select is(
  pg_temp.notice((
    select id from system.outbox_events where event_type = 'waitlist.email_requested.v1' limit 1
  )),
  'skipped',
  'and so is an event of another kind'
);

-- Bruno leaves before the worker writes his notice.
create temporary table bruno_event on commit drop as
select pg_temp.event_of('bruno@example.com') as id;
select waitlist.leave(pg_temp.h(5), pg_temp.h(900002));
select is(
  pg_temp.notice((select id from bruno_event)),
  'skipped',
  'somebody who left before the notice was written is never announced'
);

select * from finish();
rollback;
