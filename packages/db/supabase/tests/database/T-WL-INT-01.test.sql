-- T-WL-INT-01 — the Allfit Space waitlist: joining, what does not count, confirming and
-- asking for the email again (`OP-WL-001`, `OP-WL-002`, `OP-WL-003`; ADR-050
-- invariants 1, 2, 6 and 9's database half).
--
-- Every scenario runs through the functions the API calls, never through the tables: the
-- tables are closed to the runtime role, and `T-WL-RLS-01` proves that.

begin;

select plan(38);

-- Deterministic identifiers and hashes, so each call names its own tokens.
create function pg_temp.u(n integer) returns uuid language sql immutable as $$
  select ('019d0000-0000-7000-8000-' || lpad(to_hex(n), 12, '0'))::uuid
$$;
create function pg_temp.h(n integer) returns bytea language sql immutable as $$
  select decode(lpad(to_hex(n), 64, '0'), 'hex')
$$;

-- Joins with tokens 2n (confirmation) and 2n + 1 (private).
create function pg_temp.joins(
  p_n integer, p_name text, p_email text, p_code text, p_connection integer, p_device integer
) returns table (outcome text, referral_code text, referrals integer) language sql as $$
  select * from waitlist.join(
    p_name, p_email, 'es', true, '2026-11-10', p_code, 'instagram', null, null,
    pg_temp.h(100000 + p_connection),
    case when p_device is null then null else pg_temp.h(200000 + p_device) end,
    pg_temp.u(2 * p_n), pg_temp.h(2 * p_n), pg_temp.u(2 * p_n + 1), pg_temp.h(2 * p_n + 1),
    1::smallint
  )
$$;

create function pg_temp.asks(p_n integer, p_email text, p_connection integer)
returns text language sql as $$
  select outcome from waitlist.request_email(
    p_email, pg_temp.h(100000 + p_connection),
    pg_temp.u(2 * p_n), pg_temp.h(2 * p_n), pg_temp.u(2 * p_n + 1), pg_temp.h(2 * p_n + 1),
    1::smallint
  )
$$;

create function pg_temp.code_of(p_email text) returns text language sql as $$
  select referral_code from waitlist.signups where canonical_email = waitlist.canonical_email(p_email)
$$;
create function pg_temp.discard_of(p_email text) returns text language sql as $$
  select discard_reason from waitlist.signups where canonical_email = waitlist.canonical_email(p_email)
$$;

-- ---------------------------------------------------------------------------
-- One sign-up per mailbox
-- ---------------------------------------------------------------------------

select is(waitlist.canonical_email(' Ana.Ruiz+x@Gmail.com '), 'anaruiz@gmail.com',
  'a Gmail address loses its case, its tag and its dots');
select is(waitlist.canonical_email('a.b@googlemail.com'), 'ab@gmail.com',
  'googlemail.com is the same mailbox as gmail.com');
select is(waitlist.canonical_email('Ana.Ruiz+x@outlook.com'), 'ana.ruiz@outlook.com',
  'another provider keeps its dots and loses only the tag');
select is(waitlist.canonical_email('not an address'), null,
  'what is not an address has no canonical form');

-- ---------------------------------------------------------------------------
-- No authorization, no data (invariant 1)
-- ---------------------------------------------------------------------------

select throws_ok(
  $$ select * from waitlist.join(
    'Ana', 'ana.ruiz@gmail.com', 'es', false, '2026-11-10', null, null, null, null,
    pg_temp.h(100001), pg_temp.h(200001),
    pg_temp.u(2), pg_temp.h(2), pg_temp.u(3), pg_temp.h(3), 1::smallint
  ) $$,
  '22023',
  'the waitlist needs the data authorization',
  'joining without the authorization is refused'
);
select is((select count(*) from waitlist.signups), 0::bigint,
  'and nothing was written: no sign-up');
select is((select count(*) from waitlist.rate_windows), 0::bigint,
  'and nothing was written: not even the attempt');

-- ---------------------------------------------------------------------------
-- Joining
-- ---------------------------------------------------------------------------

create temporary table ana on commit drop as
select * from pg_temp.joins(1, '  Ana Ruiz ', 'ana.ruiz@gmail.com', null, 1, 1);

select is((select outcome from ana), 'joined', 'a new address joins');
select ok((select referral_code ~ '^[A-HJKMNP-Z2-9]{8}$' from ana),
  'and gets a code without 0, O, 1, I or L');
select is((select referrals from ana), 0, 'with a counter at zero');
select is(
  (select name || '|' || language || '|' || consent_policy_version || '|' || utm_source
   from waitlist.signups),
  'Ana Ruiz|es|2026-11-10|instagram',
  'the sign-up keeps the trimmed name, the language, the policy version and the channel'
);
select is(
  (select payload from system.outbox_events where event_type = 'waitlist.email_requested.v1'),
  jsonb_build_object('kind', 'confirmation',
    'confirmation_token_id', pg_temp.u(2), 'private_token_id', pg_temp.u(3)),
  'joining enqueues the confirmation email, with token identifiers and no personal data'
);

-- ---------------------------------------------------------------------------
-- A repeated address (invariant 2)
-- ---------------------------------------------------------------------------

create temporary table ana_again on commit drop as
select * from pg_temp.joins(2, 'Somebody else', 'AnaRuiz+promo@googlemail.com', null, 1, 9);

select is(
  (select outcome || '|' || coalesce(referral_code, '-') || '|' || coalesce(referrals::text, '-')
   from ana_again),
  'already_listed|-|-',
  'the same mailbox written another way answers without code or counter'
);
select is(
  (select count(*) || '|' || min(name) from waitlist.signups),
  '1|Ana Ruiz',
  'and there is still one sign-up, under the name it first gave'
);
select ok(
  (select voided_at is not null from waitlist.signup_tokens where id = pg_temp.u(2))
    and (select voided_at is null from waitlist.signup_tokens where id = pg_temp.u(4)),
  'the confirmation email goes out again, and its new link voids the previous one'
);

-- ---------------------------------------------------------------------------
-- What does not count (invariant 6)
-- ---------------------------------------------------------------------------

select pg_temp.joins(3, 'Bruno', 'bruno@example.com', (select referral_code from ana), 1, 1);
select is(pg_temp.discard_of('bruno@example.com'), 'self_referral',
  'a sign-up from the inviter''s own device does not count');

select pg_temp.joins(4, 'Carla', 'carla@example.com', lower((select referral_code from ana)), 2, 3);
select is(pg_temp.discard_of('carla@example.com'), null,
  'a sign-up from another device counts, whatever the case of the code');

select pg_temp.joins(5, 'Dario', 'dario@example.com', (select referral_code from ana), 4, 3);
select is(pg_temp.discard_of('dario@example.com'), 'same_device',
  'a device that already counts for the inviter does not count again');

select pg_temp.joins(6, 'Elena', 'elena@example.com', (select referral_code from ana), 3, 11);
select pg_temp.joins(7, 'Fabio', 'fabio@example.com', (select referral_code from ana), 3, 12);
select pg_temp.joins(8, 'Gina', 'gina@example.com', (select referral_code from ana), 3, 13);
select pg_temp.joins(9, 'Hugo', 'hugo@example.com', (select referral_code from ana), 3, 14);
select is(
  (select string_agg(coalesce(discard_reason, 'counts'), ',' order by created_at)
   from waitlist.signups
   where canonical_email in ('elena@example.com', 'fabio@example.com', 'gina@example.com', 'hugo@example.com')),
  'counts,counts,counts,counts',
  'friends on one shared connection all count for their inviter, however many join'
);

select pg_temp.joins(10, 'Irene', 'irene@example.com', pg_temp.code_of('carla@example.com'), 3, 15);
select is(
  (select count(*)::integer from waitlist.signups where connection_hash = pg_temp.h(100003)),
  5,
  'each sign-up keeps the connection it came from, so the team can review a shared one'
);

select pg_temp.joins(11, 'Julia', 'julia@example.com', 'NOSUCHCODE', 5, 16);
select is(
  (select invited_by_signup_id from waitlist.signups where canonical_email = 'julia@example.com'),
  null,
  'an unknown code joins without an inviter'
);

-- ---------------------------------------------------------------------------
-- Confirming
-- ---------------------------------------------------------------------------

select is(waitlist.referral_count((select id from waitlist.signups where name = 'Ana Ruiz')), 0,
  'nobody counts before confirming');

select is((select outcome from waitlist.confirm(pg_temp.h(8), pg_temp.h(100002))), 'confirmed',
  'the confirmation link confirms');
select is(waitlist.referral_count((select id from waitlist.signups where name = 'Ana Ruiz')), 1,
  'and the confirmed sign-up counts for its inviter');
select is((select outcome from waitlist.confirm(pg_temp.h(8), pg_temp.h(100002))), 'already_confirmed',
  'confirming again changes nothing and says so');

select waitlist.confirm(pg_temp.h(6), pg_temp.h(100001));
select is(waitlist.referral_count((select id from waitlist.signups where name = 'Ana Ruiz')), 1,
  'a discarded sign-up never counts, confirmed or not');

select is((select outcome from waitlist.confirm(pg_temp.h(999999), pg_temp.h(100002))), 'invalid',
  'an unknown link is invalid');
select is((select outcome from waitlist.confirm(pg_temp.h(2), pg_temp.h(100002))), 'invalid',
  'a voided link answers like one that never existed');
select is((select outcome from waitlist.confirm(pg_temp.h(3), pg_temp.h(100002))), 'invalid',
  'a private link does not confirm');

update waitlist.signup_tokens
set created_at = clock_timestamp() - interval '8 days',
    expires_at = clock_timestamp() - interval '1 day'
where id = pg_temp.u(10);
select is((select outcome from waitlist.confirm(pg_temp.h(10), pg_temp.h(100002))), 'invalid',
  'a link past its seven days is invalid');
select is(
  (select confirmed_at from waitlist.signups where canonical_email = 'dario@example.com'),
  null,
  'and it confirmed nothing'
);

-- ---------------------------------------------------------------------------
-- Asking for the email again
-- ---------------------------------------------------------------------------

create temporary table events_before on commit drop as
select count(*) as n from system.outbox_events where event_type = 'waitlist.email_requested.v1';

select is(pg_temp.asks(20, 'nobody@example.com', 6), 'accepted',
  'asking for an address that is not on the list answers the same');
select is(
  (select count(*) from system.outbox_events where event_type = 'waitlist.email_requested.v1'),
  (select n from events_before),
  'and sends nothing'
);

select pg_temp.asks(21, 'carla@example.com', 6);
select is(
  (select payload from system.outbox_events
   where event_type = 'waitlist.email_requested.v1' order by occurred_at desc, id desc limit 1),
  jsonb_build_object('kind', 'link', 'private_token_id', pg_temp.u(43)),
  'a confirmed address gets its link, not another confirmation'
);

select pg_temp.asks(22, 'x@example.com', 6);
select pg_temp.asks(23, 'x@example.com', 6);
select pg_temp.asks(24, 'x@example.com', 6);
select is(pg_temp.asks(25, 'x@example.com', 6), 'rate_limited',
  'a sixth request from one connection within the hour is refused');

-- Ana already got two emails. Three more from other connections reach the daily five.
select pg_temp.asks(30, 'ana.ruiz@gmail.com', 7);
select pg_temp.asks(31, 'ana.ruiz@gmail.com', 8);
select pg_temp.asks(32, 'ana.ruiz@gmail.com', 9);
select pg_temp.asks(33, 'ana.ruiz@gmail.com', 10);
select is(
  (select count(*) from waitlist.signup_tokens as token
   join waitlist.signups as signup on signup.id = token.signup_id
   where signup.name = 'Ana Ruiz' and token.kind = 'private'),
  5::bigint,
  'one address gets at most five waitlist emails in a day, whoever asks'
);

-- ---------------------------------------------------------------------------
-- Delivery
-- ---------------------------------------------------------------------------

select set_config('app.actor_kind', 'worker', true);

select is(
  (select delivery_state || '|' || email_kind || '|' || recipient_name || '|' || recipient_email
     || '|' || language || '|' || referrals || '|' || (confirmation_token_id = pg_temp.u(64))
   from waitlist.prepare_email_delivery((
     select id from system.outbox_events
     where payload ->> 'confirmation_token_id' = pg_temp.u(64)::text
   ))),
  'ready|confirmation|Ana Ruiz|ana.ruiz@gmail.com|es|1|true',
  'the worker gets the newest confirmation email with the address as it was typed'
);
select is(
  (select delivery_state from waitlist.prepare_email_delivery((
     select id from system.outbox_events
     where payload ->> 'confirmation_token_id' = pg_temp.u(2)::text
   ))),
  'skipped',
  'and skips the email whose link a newer one voided'
);

select * from finish();
rollback;
