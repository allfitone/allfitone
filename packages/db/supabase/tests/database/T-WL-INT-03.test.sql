-- T-WL-INT-03 — the team hears that someone confirmed on the waitlist (`OP-WL-002`;
-- ADR-050): one `waitlist.signup_confirmed.v1` event per sign-up, when its address is
-- confirmed, naming nobody.

begin;

select plan(12);

create function pg_temp.u(n integer) returns uuid language sql immutable as $$
  select ('019d4000-0000-7000-8000-' || lpad(to_hex(n), 12, '0'))::uuid
$$;
create function pg_temp.h(n integer) returns bytea language sql immutable as $$
  select decode(lpad(to_hex(n), 64, '0'), 'hex')
$$;

-- Joins with tokens 2n (confirmation) and 2n + 1 (private).
create function pg_temp.joins(
  p_n integer, p_email text, p_language text, p_code text, p_source text, p_device integer
) returns text language sql as $$
  select referral_code from waitlist.join(
    'Person ' || p_n, p_email, p_language, true, '2026-11-10', p_code, p_source, null, null,
    pg_temp.h(100000 + p_n), pg_temp.h(200000 + p_device),
    pg_temp.u(2 * p_n), pg_temp.h(2 * p_n), pg_temp.u(2 * p_n + 1), pg_temp.h(2 * p_n + 1),
    1::smallint
  )
$$;

create function pg_temp.notices() returns bigint language sql as $$
  select count(*) from system.outbox_events where event_type = 'waitlist.signup_confirmed.v1'
$$;
create function pg_temp.notice_of(p_email text) returns jsonb language sql as $$
  select outbox.payload
  from system.outbox_events as outbox
  join waitlist.signups as signup on signup.id = outbox.aggregate_id
  where outbox.event_type = 'waitlist.signup_confirmed.v1'
    and signup.canonical_email = p_email
$$;

create temporary table ana on commit drop as
select pg_temp.joins(1, 'ana@example.com', 'es', null, 'instagram', 1) as code;
-- Bruno counts for Ana; Carla joins from Ana's own device, so she does not.
select pg_temp.joins(2, 'bruno@example.com', 'en', (select code from ana), null, 2);
select pg_temp.joins(3, 'carla@example.com', 'es', (select code from ana), null, 1);

select is(pg_temp.notices(), 0::bigint, 'joining tells the team nothing yet');
select isnt(
  (select discard_reason from waitlist.signups where canonical_email = 'carla@example.com'),
  null,
  'and the sign-up from the inviter''s own device is discarded'
);

select waitlist.confirm(pg_temp.h(2), pg_temp.h(900001));
select is(pg_temp.notices(), 1::bigint, 'confirming enqueues one event for the team');
select is(
  pg_temp.notice_of('ana@example.com'),
  jsonb_build_object(
    'utm_source', 'instagram', 'language', 'es', 'referred', false, 'confirmed_total', 1
  ),
  'with the channel, the language, that nobody invited her and the list''s new total'
);
select is(
  (select array_agg(key order by key) from jsonb_object_keys(pg_temp.notice_of('ana@example.com')) as key),
  array['confirmed_total', 'language', 'referred', 'utm_source'],
  'and nothing that names the person'
);

select is((select outcome from waitlist.confirm(pg_temp.h(2), pg_temp.h(900001))), 'already_confirmed',
  'the same link used again confirms nothing');
select is(pg_temp.notices(), 1::bigint, 'and tells the team nothing twice');

select waitlist.confirm(pg_temp.h(4), pg_temp.h(900001));
select is(
  pg_temp.notice_of('bruno@example.com'),
  jsonb_build_object(
    'utm_source', null, 'language', 'en', 'referred', true, 'confirmed_total', 2
  ),
  'a sign-up that counts for its inviter says so, and one with no channel carries none'
);

select waitlist.confirm(pg_temp.h(6), pg_temp.h(900001));
select is(
  pg_temp.notice_of('carla@example.com'),
  jsonb_build_object(
    'utm_source', null, 'language', 'es', 'referred', false, 'confirmed_total', 3
  ),
  'a discarded sign-up confirms and is counted, but is not somebody''s referral'
);

select is((select outcome from waitlist.confirm(pg_temp.h(999999), pg_temp.h(900001))), 'invalid',
  'an unknown link is invalid');
select is((select outcome from waitlist.confirm(pg_temp.h(3), pg_temp.h(900001))), 'invalid',
  'a private link does not confirm');
select is(pg_temp.notices(), 3::bigint, 'and neither tells the team anything');

select * from finish();
rollback;
