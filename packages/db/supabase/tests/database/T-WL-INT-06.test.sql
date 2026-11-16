-- T-WL-INT-06 — the team reviews the waitlist and marks fraud (`OP-WL-011`, `OP-WL-012`;
-- HU-BO-035; ADR-050, decisions 3 and 5): the list says what each sign-up is without a
-- hash, the totals count the whole list by channel, and a sign-up marked as fraud stops
-- counting for its inviter and gives its Founding Member number to the next in line.

begin;

select plan(47);

create function pg_temp.h(n integer) returns bytea language sql immutable as $$
  select decode(lpad(to_hex(n), 64, '0'), 'hex')
$$;
create function pg_temp.u(n integer) returns uuid language sql immutable as $$
  select ('019e0600-0000-7000-8000-' || lpad(to_hex(n), 12, '0'))::uuid
$$;

insert into identity.people (id, given_name, family_name, status)
values
  ('019e0601-0000-7000-8000-000000000001', 'Manager', 'Alpha', 'active'),
  ('019e0601-0000-7000-8000-000000000002', 'Manager', 'Beta', 'active'),
  ('019e0601-0000-7000-8000-000000000003', 'Commercial', 'Gamma', 'active');

insert into identity.access_accounts (id, provider, issuer, subject, person_id)
values
  ('019e0601-0000-7000-8000-000000000021', 'workos', 'https://issuer.test', 'alpha-wl6', null),
  ('019e0601-0000-7000-8000-000000000022', 'workos', 'https://issuer.test', 'beta-wl6', null),
  ('019e0601-0000-7000-8000-000000000023', 'workos', 'https://issuer.test', 'gamma-wl6',
    '019e0601-0000-7000-8000-000000000003');

select support.bootstrap_backoffice_administrators(
  '019e0601-0000-7000-8000-000000000001', 'alpha-wl6',
  '019e0601-0000-7000-8000-000000000002', 'beta-wl6',
  'https://issuer.test', clock_timestamp() + interval '30 days', 'CEREMONY-WL-INT-06'
);

insert into identity.access_sessions (
  id, access_account_id, provider_session_id, surface, token_hash, token_ciphertext,
  access_token_expires_at, assurance_level, authentication_method,
  assurance_verified_at, last_activity_at, absolute_expires_at
) values
  ('019e0601-0000-7000-8000-000000000041', '019e0601-0000-7000-8000-000000000021',
    'sid_alpha_wl6', 'backoffice', decode(repeat('a1', 32), 'hex'), 'v1.alpha',
    clock_timestamp() + interval '5 minutes', 2, 'password_totp',
    clock_timestamp(), clock_timestamp(), clock_timestamp() + interval '8 hours'),
  ('019e0601-0000-7000-8000-000000000043', '019e0601-0000-7000-8000-000000000023',
    'sid_gamma_wl6', 'backoffice', decode(repeat('a3', 32), 'hex'), 'v1.gamma',
    clock_timestamp() + interval '5 minutes', 2, 'password_totp',
    clock_timestamp(), clock_timestamp(), clock_timestamp() + interval '8 hours');

select support.assign_platform_role(
  '019e0601-0000-7000-8000-000000000001', '019e0601-0000-7000-8000-000000000041',
  '019e0601-0000-7000-8000-000000000003', 'allfit_admin',
  '019e0601-0000-7000-8000-000000000103', '019e0601-0000-7000-8000-000000000203',
  decode(repeat('c3', 32), 'hex')
);

-- Converges onto the duty the role already brings.
select support.assign_platform_duty(
  '019e0601-0000-7000-8000-000000000001', '019e0601-0000-7000-8000-000000000041',
  '019e0601-0000-7000-8000-000000000003', 'manage_platform_commercial',
  clock_timestamp(), clock_timestamp() + interval '30 days', 'CASE-2026-302',
  '019e0601-0000-7000-8000-000000000113', '019e0601-0000-7000-8000-000000000213',
  decode(repeat('e3', 32), 'hex')
);

select set_config('app.actor_kind', 'support', true),
       set_config('app.actor_person_id', '019e0601-0000-7000-8000-000000000003', true);

-- Joins as `p{n}@example.com` with tokens 2n and 2n + 1, from the connection and the
-- device given.
create function pg_temp.joins(
  p_n integer, p_name text, p_inviter text, p_source text, p_connection integer, p_device integer
) returns text language sql as $$
  select referral_code from waitlist.join(
    p_name, 'p' || p_n || '@example.com', 'es', true, '2026-11-10', p_inviter, p_source,
    null, null, pg_temp.h(p_connection), pg_temp.h(p_device),
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
create function pg_temp.number_of(p_n integer) returns smallint language sql as $$
  select founding_number from waitlist.signups where id = pg_temp.id_of(p_n)
$$;
create function pg_temp.lists(p_query text, p_filter text, p_limit integer, p_before uuid)
returns table (id uuid, signup jsonb) language sql as $$
  select * from waitlist.list_backoffice_signups(
    '019e0601-0000-7000-8000-000000000003', '019e0601-0000-7000-8000-000000000043',
    p_query, p_filter, p_limit, p_before
  )
$$;
-- A sign-up as the Backoffice reads it, found by its address.
create function pg_temp.row_of(p_n integer) returns jsonb language sql as $$
  select signup from pg_temp.lists('p' || p_n || '@example.com', null, 5, null)
$$;
create function pg_temp.totals() returns jsonb language sql as $$
  select waitlist.read_backoffice_totals(
    '019e0601-0000-7000-8000-000000000003', '019e0601-0000-7000-8000-000000000043'
  )
$$;
create function pg_temp.marks(p_signup_id uuid, p_reason text, p_key integer)
returns table (result jsonb, replayed boolean) language sql as $$
  select * from waitlist.mark_signup_as_fraud(
    '019e0601-0000-7000-8000-000000000003', '019e0601-0000-7000-8000-000000000043',
    p_signup_id, p_reason,
    ('5f6b0000-0000-4000-8000-' || lpad(p_key::text, 12, '0'))::uuid,
    pg_temp.u(900000 + p_key), pg_temp.h(700000 + p_key)
  )
$$;
create function pg_temp.number_events() returns bigint language sql as $$
  select count(*) from system.outbox_events
  where event_type = 'waitlist.founding_number_assigned.v1'
$$;

-- Ana invites three people: Bruno and Carla join from one connection, Darío from Ana's
-- own, and Gael from Bruno's device, which already counts for her.
select pg_temp.joins(1, 'Ana Ruiz', null, null, 500001, 600001);
select pg_temp.joins(
  2, 'Bruno Díaz', (select referral_code from waitlist.signups where id = pg_temp.id_of(1)),
  'Instagram', 500002, 600002
);
select pg_temp.joins(
  3, 'Carla Gil', (select referral_code from waitlist.signups where id = pg_temp.id_of(1)),
  null, 500002, 600003
);
select pg_temp.joins(
  4, 'Darío Paz', (select referral_code from waitlist.signups where id = pg_temp.id_of(1)),
  null, 500001, 600004
);
select pg_temp.joins(5, 'Elena Mora', null, ' TikTok ', 500005, 600005);
select pg_temp.joins(6, 'Fabio Lara', null, null, 500006, 600006);
select pg_temp.joins(
  7, 'Gael Ríos', (select referral_code from waitlist.signups where id = pg_temp.id_of(1)),
  null, 500007, 600002
);
select pg_temp.confirms(1), pg_temp.confirms(2), pg_temp.confirms(3), pg_temp.confirms(6);

-- ---------------------------------------------------------------------------
-- OP-WL-011 — what the list says of a sign-up
-- ---------------------------------------------------------------------------

select is(
  (select count(*) from pg_temp.lists(null, null, 25, null)), 7::bigint,
  'the list holds every sign-up, confirmed or not'
);
select is(
  pg_temp.row_of(2) - 'id' - 'joined_at' - 'confirmed_at' - 'referral_code' - 'invited_by',
  jsonb_build_object(
    'name', 'Bruno Díaz', 'email', 'p2@example.com', 'language', 'es', 'founding_number', 2,
    'channel', jsonb_build_object('kind', 'source', 'source', 'instagram'),
    'discard_reason', null, 'fraud', null, 'fraud_withdrawal', null, 'referrals', 0,
    'referrals_sharing_connection', 0, 'has_space_account', false
  ),
  'a sign-up reads with its name, its email, its number, the source its link named, and no account yet'
);
select is(
  pg_temp.row_of(2) -> 'invited_by',
  (select jsonb_build_object('name', 'Ana Ruiz', 'referral_code', referral_code)
   from waitlist.signups where id = pg_temp.id_of(1)),
  'and who invited it, by name and code'
);
select ok(
  (pg_temp.row_of(2) ->> 'confirmed_at') is not null
    and (pg_temp.row_of(4) ->> 'confirmed_at') is null,
  'it says who confirmed and who did not'
);
select is(
  array[
    pg_temp.row_of(3) -> 'channel', pg_temp.row_of(6) -> 'channel', pg_temp.row_of(5) -> 'channel'
  ],
  array[
    jsonb_build_object('kind', 'referral', 'source', null),
    jsonb_build_object('kind', 'direct', 'source', null),
    jsonb_build_object('kind', 'source', 'source', 'tiktok')
  ],
  'without a source the channel is a referral or direct, and a source reads trimmed in lower case'
);
select is(
  (pg_temp.row_of(1) ->> 'referrals')::integer, 2,
  'the counter holds the referrals that confirmed and count'
);
select is(
  (pg_temp.row_of(1) ->> 'referrals_sharing_connection')::integer, 3,
  'and the signal counts the two that share a connection and the one on the inviter''s own'
);
select is(
  pg_temp.row_of(7) ->> 'discard_reason', 'same_device',
  'a discarded sign-up says why it does not count'
);

-- ---------------------------------------------------------------------------
-- OP-WL-011 — searching, filtering and paging
-- ---------------------------------------------------------------------------

select is(
  (select array_agg(signup ->> 'name') from pg_temp.lists('  BRUN ', null, 25, null)),
  array['Bruno Díaz'],
  'a search finds a sign-up by part of its name, in any case'
);
select is(
  (select array_agg(signup ->> 'name') from pg_temp.lists('p3@example', null, 25, null)),
  array['Carla Gil'],
  'by part of its email'
);
select is(
  (select array_agg(signup ->> 'name') from pg_temp.lists(
    (select lower(referral_code) from waitlist.signups where id = pg_temp.id_of(6)), null, 25, null
  )),
  array['Fabio Lara'],
  'and by its code'
);
select is(
  (select count(*) from pg_temp.lists('100%', null, 25, null)), 0::bigint,
  'a wildcard typed into the search is read as the character it is'
);
select throws_ok(
  $$ select * from pg_temp.lists('a', null, 25, null) $$,
  '22023', null,
  'a search of one character is refused'
);
select throws_ok(
  $$ select * from pg_temp.lists(null, 'everyone', 25, null) $$,
  '22023', null,
  'and so is a filter the list does not know'
);
select is(
  array[
    (select count(*) from pg_temp.lists(null, 'confirmed', 25, null)),
    (select count(*) from pg_temp.lists(null, 'unconfirmed', 25, null)),
    (select count(*) from pg_temp.lists(null, 'founding_members', 25, null)),
    (select count(*) from pg_temp.lists(null, 'discarded', 25, null))
  ],
  array[4, 3, 4, 1]::bigint[],
  'the filters read the confirmed, the unconfirmed, the Founding Members and the discarded'
);

create temporary table pages on commit drop as
select 1 as page, listed.id, row_number() over () as position
from pg_temp.lists(null, null, 3, null) as listed;
insert into pages
select 2, listed.id, row_number() over ()
from pg_temp.lists(null, null, 3, (select id from pages where page = 1 order by position desc limit 1)) as listed;
insert into pages
select 3, listed.id, row_number() over ()
from pg_temp.lists(null, null, 3, (select id from pages where page = 2 order by position desc limit 1)) as listed;

select is(
  (select array_agg(amount order by page) from (
    select page, count(*) as amount from pages group by page
  ) as counted),
  array[3, 3, 1]::bigint[],
  'pages of three hold three, three and one'
);
select is(
  (select count(distinct id) from pages), 7::bigint,
  'and together every sign-up once'
);
select ok(
  (select bool_and(later.id < earlier.id)
   from pages as earlier
   join pages as later
     on (later.page, later.position) > (earlier.page, earlier.position)),
  'newest first, across the pages'
);

-- ---------------------------------------------------------------------------
-- OP-WL-011 — the totals
-- ---------------------------------------------------------------------------

select is(
  pg_temp.totals(),
  jsonb_build_object(
    'signups', 7, 'confirmed', 4, 'founding_members', 4, 'marked_as_fraud', 0,
    'with_account', 0,
    'channels', jsonb_build_array(
      jsonb_build_object(
        'channel', jsonb_build_object('kind', 'referral', 'source', null),
        'signups', 3, 'confirmed', 1
      ),
      jsonb_build_object(
        'channel', jsonb_build_object('kind', 'direct', 'source', null),
        'signups', 2, 'confirmed', 2
      ),
      jsonb_build_object(
        'channel', jsonb_build_object('kind', 'source', 'source', 'instagram'),
        'signups', 1, 'confirmed', 1
      ),
      jsonb_build_object(
        'channel', jsonb_build_object('kind', 'source', 'source', 'tiktok'),
        'signups', 1, 'confirmed', 0
      )
    )
  ),
  'the totals count the whole list, and each channel with its confirmed, largest first'
);

-- A hundred more confirm: 25 arrive from a source of their own, the rest directly. The
-- numbers 5 to 100 go to the first 96, and four wait.
select pg_temp.joins(
  n, 'Persona ' || n, null, case when n < 35 then 'src' || n end, 510000 + n, 610000 + n
)
from generate_series(10, 109) as n;
select pg_temp.confirms(n) from generate_series(10, 109) as n order by n;

select is(
  array[pg_temp.number_of(105), pg_temp.number_of(106)], array[100, null]::smallint[],
  'the hundred numbers are held, and the next to confirm waits'
);
select is(
  array[
    jsonb_array_length(pg_temp.totals() -> 'channels'),
    (pg_temp.totals() -> 'channels' -> 0 ->> 'signups')::integer
  ],
  array[21, 77],
  'past the twenty largest channels the rest are one row'
);
select is(
  pg_temp.totals() -> 'channels' -> 20,
  jsonb_build_object(
    'channel', jsonb_build_object('kind', 'other', 'source', null), 'signups', 9, 'confirmed', 8
  ),
  'which adds up what it folds'
);

-- ---------------------------------------------------------------------------
-- OP-WL-012 — a fraud mark needs a reason and a sign-up
-- ---------------------------------------------------------------------------

select throws_ok(
  $$ select * from pg_temp.marks(pg_temp.id_of(2), '   ', 1) $$,
  '22023', null,
  'a sign-up is not marked as fraud without a reason'
);
select throws_ok(
  $$ select * from pg_temp.marks(pg_temp.id_of(2), 'no', 2) $$,
  '22023', null,
  'nor with one too short to say anything'
);
select throws_ok(
  $$ select * from pg_temp.marks(pg_temp.id_of(2), E'Correos en serie\nmismo equipo', 3) $$,
  '22023', null,
  'nor with one spread over several lines'
);
select throws_ok(
  $$ select * from pg_temp.marks(pg_temp.u(424242), 'Correos en serie desde un equipo', 4) $$,
  'P0002', null,
  'and a sign-up that is not on the list is not found'
);
select is(
  (select count(*) from waitlist.signup_events), 0::bigint,
  'none of them left a record'
);

-- ---------------------------------------------------------------------------
-- OP-WL-012 — what marking does
-- ---------------------------------------------------------------------------

-- Bruno counts for Ana and holds #2.
select is(
  (select jsonb_build_object(
     'discard_reason', result -> 'discard_reason',
     'founding_number', result -> 'founding_number',
     'reason', result -> 'fraud' -> 'reason',
     'marked', (result -> 'fraud' ->> 'marked_at') is not null,
     'replayed', replayed
   )
   from pg_temp.marks(pg_temp.id_of(2), '  Correos en serie desde un mismo equipo ', 10)),
  jsonb_build_object(
    'discard_reason', 'fraud', 'founding_number', null,
    'reason', 'Correos en serie desde un mismo equipo', 'marked', true, 'replayed', false
  ),
  'a marked sign-up reads as fraud, with its reason and without its number'
);
select is(
  array[pg_temp.number_of(106), pg_temp.number_of(107)], array[2, null]::smallint[],
  'its number goes to the earliest-confirmed sign-up that waited, and to nobody else'
);
select is(
  (select array_agg(outbox.payload)
   from system.outbox_events as outbox
   where outbox.event_type = 'waitlist.founding_number_assigned.v1'
     and outbox.aggregate_id = pg_temp.id_of(106)),
  array[jsonb_build_object('founding_number', 2)],
  'who is told by one event, like every Founding Member'
);
select is(
  (pg_temp.row_of(1) ->> 'referrals')::integer, 1,
  'and it stops counting for whoever invited it'
);
select is(
  (select jsonb_build_object(
     'reason', event.reason, 'previous', event.previous_discard_reason,
     'released', event.released_founding_number, 'actor', event.actor_person_id,
     'duty', assignment.duty_code
   )
   from waitlist.signup_events as event
   join support.platform_duty_assignments as assignment
     on assignment.id = event.actor_duty_assignment_id
   where event.signup_id = pg_temp.id_of(2)
     and event.event_type = 'waitlist.signup_marked_as_fraud.v1'),
  jsonb_build_object(
    'reason', 'Correos en serie desde un mismo equipo', 'previous', null, 'released', 2,
    'actor', '019e0601-0000-7000-8000-000000000003', 'duty', 'manage_platform_commercial'
  ),
  'the record keeps the reason, the number released and the duty assignment acted under'
);
select throws_ok(
  $$ select * from pg_temp.marks(pg_temp.id_of(2), 'Otro motivo distinto', 11) $$,
  '55000', null,
  'a sign-up already marked is not marked again'
);

-- Persona 107 confirmed and waits for a number.
select is(
  (select jsonb_build_object(
     'discard_reason', result -> 'discard_reason', 'events', pg_temp.number_events()
   )
   from pg_temp.marks(pg_temp.id_of(107), 'Dirección de un servicio temporal', 12)),
  jsonb_build_object('discard_reason', 'fraud', 'events', 101),
  'marking a sign-up that holds no number gives nobody a number'
);

select waitlist.forget_signup(pg_temp.id_of(6));

select is(
  array[pg_temp.number_of(107), pg_temp.number_of(108)], array[null, 4]::smallint[],
  'and the next number freed passes over the marked sign-up'
);
-- Gael was discarded when he joined, from a device that already counted for Ana.
select replayed from pg_temp.marks(pg_temp.id_of(7), 'Mismo equipo que otra inscripción', 13);

select is(
  (select event.previous_discard_reason
   from waitlist.signup_events as event
   where event.signup_id = pg_temp.id_of(7)),
  'same_device',
  'the record keeps why a sign-up did not count before it was marked'
);
select is(
  pg_temp.totals() - 'channels',
  jsonb_build_object(
    'signups', 106, 'confirmed', 103, 'founding_members', 100, 'marked_as_fraud', 3,
    'with_account', 0
  ),
  'the totals count the marked sign-ups, and the hundred numbers stay held'
);
select is(
  (select array_agg(signup ->> 'name' order by signup ->> 'name')
   from pg_temp.lists(null, 'discarded', 25, null)),
  array['Bruno Díaz', 'Gael Ríos', 'Persona 107'],
  'and the discarded filter lists them'
);

-- ---------------------------------------------------------------------------
-- The record lives as long as its sign-up
-- ---------------------------------------------------------------------------

create temp table pg_temp_gael as select pg_temp.id_of(7) as id;

select throws_ok(
  $$ delete from waitlist.signup_events as event
     where event.signup_id = (select id from pg_temp_gael) $$,
  '55000', null,
  'the record of a sign-up that is still on the list is not deleted'
);

select waitlist.forget_signup((select id from pg_temp_gael));

select is(
  (select count(*) from waitlist.signup_events as event
   where event.signup_id = (select id from pg_temp_gael)),
  0::bigint,
  'when a sign-up leaves the list, the record of its review is deleted with it'
);
select is(
  (select count(*) from waitlist.signup_events as event
   where event.signup_id = pg_temp.id_of(2)),
  1::bigint,
  'and the record of the sign-ups that stay is untouched'
);

-- ---------------------------------------------------------------------------
-- A sign-up with an account (`OP-WL-006`)
-- ---------------------------------------------------------------------------

insert into identity.people (id, given_name, family_name, status)
values ('019e0601-0000-7000-8000-000000000301', 'Holder', 'Linked', 'active');

create temp table pg_temp_holder as
select id, email::text as email, founding_number
from waitlist.signups
where founding_number is not null and discard_reason is null
order by founding_number
limit 1;

select set_config('app.actor_kind', 'worker', true);
select is(
  (select outcome from waitlist.link_signup(
    '019e0601-0000-7000-8000-000000000301', (select email from pg_temp_holder), 'app_store'
  )),
  'linked',
  'the worker links a Founding Member to her account'
);
select set_config('app.actor_kind', 'support', true);

select is(
  pg_temp.totals() ->> 'with_account', '1',
  'the totals count the sign-ups with an account'
);
select is(
  (select signup -> 'has_space_account'
   from pg_temp.lists((select email from pg_temp_holder), null, 5, null)),
  'true'::jsonb,
  'and the list says which they are'
);

-- With an account the number is the person's: a fraud mark stops the sign-up counting
-- for whoever invited it, and takes no number.
select is(
  (select concat_ws('|', result ->> 'discard_reason', result ->> 'founding_number')
   from pg_temp.marks((select id from pg_temp_holder), 'Cuenta duplicada', 90)),
  (select 'fraud|' || founding_number from pg_temp_holder),
  'a fraud mark leaves a linked sign-up its number'
);
select is(
  (select event.released_founding_number
   from waitlist.signup_events as event
   where event.signup_id = (select id from pg_temp_holder)),
  null::smallint,
  'the record says no number was released'
);
select is(
  (select founding_member_number from identity.people
   where id = '019e0601-0000-7000-8000-000000000301'),
  (select founding_number from pg_temp_holder),
  'and the person keeps it'
);

select * from finish();
rollback;
