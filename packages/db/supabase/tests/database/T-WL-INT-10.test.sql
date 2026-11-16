-- T-WL-INT-10 — proven fraud takes the Founding Member number from the person
-- (`OP-WL-012`, `OP-WL-016`; HU-SP-118, criterion 6; ADR-050, decisions 5 and 11): a
-- sign-up marked after its account exists loses the number, nobody inherits it, and
-- taking the mark back returns the same one.

begin;

select plan(22);

create function pg_temp.h(n integer) returns bytea language sql immutable as $$
  select decode(lpad(to_hex(n), 64, '0'), 'hex')
$$;
create function pg_temp.u(n integer) returns uuid language sql immutable as $$
  select ('019e1300-0000-7000-8000-' || lpad(to_hex(n), 12, '0'))::uuid
$$;

insert into identity.people (id, given_name, family_name, status)
values
  ('019e1301-0000-7000-8000-000000000001', 'Manager', 'Alpha', 'active'),
  ('019e1301-0000-7000-8000-000000000002', 'Manager', 'Beta', 'active'),
  ('019e1301-0000-7000-8000-000000000003', 'Commercial', 'Gamma', 'active');

insert into identity.access_accounts (id, provider, issuer, subject, person_id)
values
  ('019e1301-0000-7000-8000-000000000021', 'workos', 'https://issuer.test', 'alpha-wl13', null),
  ('019e1301-0000-7000-8000-000000000022', 'workos', 'https://issuer.test', 'beta-wl13', null),
  ('019e1301-0000-7000-8000-000000000023', 'workos', 'https://issuer.test', 'gamma-wl13',
    '019e1301-0000-7000-8000-000000000003');

select support.bootstrap_backoffice_administrators(
  '019e1301-0000-7000-8000-000000000001', 'alpha-wl13',
  '019e1301-0000-7000-8000-000000000002', 'beta-wl13',
  'https://issuer.test', clock_timestamp() + interval '30 days', 'CEREMONY-WL-INT-10'
);

insert into identity.access_sessions (
  id, access_account_id, provider_session_id, surface, token_hash, token_ciphertext,
  access_token_expires_at, assurance_level, authentication_method,
  assurance_verified_at, last_activity_at, absolute_expires_at
) values
  ('019e1301-0000-7000-8000-000000000041', '019e1301-0000-7000-8000-000000000021',
    'sid_alpha_wl13', 'backoffice', decode(repeat('a1', 32), 'hex'), 'v1.alpha',
    clock_timestamp() + interval '5 minutes', 2, 'password_totp',
    clock_timestamp(), clock_timestamp(), clock_timestamp() + interval '8 hours'),
  ('019e1301-0000-7000-8000-000000000043', '019e1301-0000-7000-8000-000000000023',
    'sid_gamma_wl13', 'backoffice', decode(repeat('a3', 32), 'hex'), 'v1.gamma',
    clock_timestamp() + interval '5 minutes', 2, 'password_totp',
    clock_timestamp(), clock_timestamp(), clock_timestamp() + interval '8 hours');

select support.assign_platform_role(
  '019e1301-0000-7000-8000-000000000001', '019e1301-0000-7000-8000-000000000041',
  '019e1301-0000-7000-8000-000000000003', 'allfit_admin',
  '019e1301-0000-7000-8000-000000000103', '019e1301-0000-7000-8000-000000000203',
  decode(repeat('c3', 32), 'hex')
);

-- Converges onto the duty the role already brings.
select support.assign_platform_duty(
  '019e1301-0000-7000-8000-000000000001', '019e1301-0000-7000-8000-000000000041',
  '019e1301-0000-7000-8000-000000000003', 'manage_platform_commercial',
  clock_timestamp(), clock_timestamp() + interval '30 days', 'CASE-2026-302',
  '019e1301-0000-7000-8000-000000000113', '019e1301-0000-7000-8000-000000000213',
  decode(repeat('e3', 32), 'hex')
);

select set_config('app.actor_kind', 'support', true),
       set_config('app.actor_person_id', '019e1301-0000-7000-8000-000000000003', true);

-- Joins as `p{n}@example.com` with tokens 2n and 2n + 1, from the connection and the
-- device given.
create function pg_temp.joins(
  p_n integer, p_name text, p_inviter text, p_connection integer, p_device integer
) returns text language sql as $$
  select referral_code from waitlist.join(
    p_name, 'p' || p_n || '@example.com', 'es', true, '2026-11-10', p_inviter, null,
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
create function pg_temp.ana_code() returns text language sql as $$
  select referral_code from waitlist.signups where id = pg_temp.id_of(1)
$$;
-- A sign-up as the Backoffice reads it, found by its address.
create function pg_temp.row_of(p_n integer) returns jsonb language sql as $$
  select signup from waitlist.list_backoffice_signups(
    '019e1301-0000-7000-8000-000000000003', '019e1301-0000-7000-8000-000000000043',
    'p' || p_n || '@example.com', null, 5, null
  )
$$;
create function pg_temp.marks(p_signup_id uuid, p_reason text, p_key integer)
returns table (result jsonb, replayed boolean) language sql as $$
  select * from waitlist.mark_signup_as_fraud(
    '019e1301-0000-7000-8000-000000000003', '019e1301-0000-7000-8000-000000000043',
    p_signup_id, p_reason,
    ('5fab0000-0000-4000-8000-' || lpad(p_key::text, 12, '0'))::uuid,
    pg_temp.u(900000 + p_key), pg_temp.h(700000 + p_key)
  )
$$;
create function pg_temp.withdraws(p_signup_id uuid, p_reason text, p_key integer)
returns table (result jsonb, replayed boolean) language sql as $$
  select * from waitlist.withdraw_fraud_mark(
    '019e1301-0000-7000-8000-000000000003', '019e1301-0000-7000-8000-000000000043',
    p_signup_id, p_reason,
    ('5fac0000-0000-4000-8000-' || lpad(p_key::text, 12, '0'))::uuid,
    pg_temp.u(800000 + p_key), pg_temp.h(600000 + p_key)
  )
$$;

-- Ana invites Bruno and Carla, who confirm; Darío, who does not; Gael, from Bruno's
-- device, which already counts for her; and Hugo, who does not confirm either.
select pg_temp.joins(1, 'Ana Ruiz', null, 500001, 600001);
select pg_temp.joins(2, 'Bruno Díaz', pg_temp.ana_code(), 500002, 600002);
select pg_temp.joins(3, 'Carla Gil', pg_temp.ana_code(), 500003, 600003);
select pg_temp.joins(4, 'Darío Paz', pg_temp.ana_code(), 500004, 600004);
select pg_temp.joins(7, 'Gael Ríos', pg_temp.ana_code(), 500007, 600002);
select pg_temp.joins(8, 'Hugo Rey', pg_temp.ana_code(), 500008, 600008);
select pg_temp.confirms(1), pg_temp.confirms(2), pg_temp.confirms(3);

-- A hundred and three confirm in all: Ana, Bruno and Carla hold #1 to #3, persons 10 to
-- 106 hold #4 to #100, and 107, 108 and 109 wait.
select pg_temp.joins(n, 'Persona ' || n, null, 510000 + n, 610000 + n)
from generate_series(10, 109) as n;
select pg_temp.confirms(n) from generate_series(10, 109) as n order by n;

-- ---------------------------------------------------------------------------
-- Bruno, Founding Member #2, creates his account
-- ---------------------------------------------------------------------------

insert into identity.people (id, given_name, family_name, status)
values
  ('019e1301-0000-7000-8000-000000000302', 'Bruno', 'Díaz', 'active'),
  ('019e1301-0000-7000-8000-000000000310', 'Persona', 'Diez', 'active');

create function pg_temp.links(p_person uuid, p_n integer) returns text language sql as $$
  select outcome from waitlist.link_signup(p_person, 'p' || p_n || '@example.com', 'google_play')
$$;
create function pg_temp.person_number(p_person uuid) returns smallint language sql as $$
  select founding_member_number from identity.people where id = p_person
$$;
create function pg_temp.founding_emails() returns bigint language sql as $$
  select count(*) from system.outbox_events
  where event_type = 'waitlist.founding_number_assigned.v1'
$$;
-- What the latest fraud mark of a sign-up wrote down about its number.
create function pg_temp.mark_record(p_n integer) returns jsonb language sql as $$
  select jsonb_build_object(
    'released', event.released_founding_number, 'withheld', event.withheld_founding_number
  )
  from waitlist.signup_events as event
  where event.signup_id = pg_temp.id_of(p_n)
    and event.event_type = 'waitlist.signup_marked_as_fraud.v1'
  order by event.occurred_at desc, event.id desc
  limit 1
$$;

select set_config('app.actor_kind', 'worker', true);
select is(
  pg_temp.links('019e1301-0000-7000-8000-000000000302', 2), 'linked',
  'the worker links a Founding Member to his account'
);
select set_config('app.actor_kind', 'support', true);

select is(
  array[pg_temp.number_of(2), pg_temp.person_number('019e1301-0000-7000-8000-000000000302')],
  array[2, 2]::smallint[],
  'his number is on the sign-up and on the person'
);

-- ---------------------------------------------------------------------------
-- OP-WL-012 — a fraud mark after the account exists
-- ---------------------------------------------------------------------------

create temporary table emails_before_mark as select pg_temp.founding_emails() as emails;

select is(
  (select jsonb_build_object(
     'discard_reason', result -> 'discard_reason',
     'founding_number', result -> 'founding_number',
     'has_space_account', result -> 'has_space_account',
     'withheld', result -> 'fraud' -> 'withheld_founding_number',
     'replayed', replayed
   )
   from pg_temp.marks(pg_temp.id_of(2), 'Cuentas en serie desde un mismo equipo', 1)),
  jsonb_build_object(
    'discard_reason', 'fraud', 'founding_number', null, 'has_space_account', true,
    'withheld', 2, 'replayed', false
  ),
  'a sign-up marked after its account exists reads without a number, and its mark says which it withheld'
);
select is(
  pg_temp.person_number('019e1301-0000-7000-8000-000000000302'), null::smallint,
  'the person loses the number'
);
select is(
  (select count(*) from waitlist.signups where founding_number = 2), 0::bigint,
  'nobody inherits it, though three confirmed sign-ups wait'
);
select is(
  pg_temp.founding_emails(), (select emails from emails_before_mark),
  'and no Founding Member email goes out'
);
select ok(
  exists (select 1 from waitlist.settled_founding_numbers where founding_number = 2),
  'the number stays settled'
);
select is(
  pg_temp.mark_record(2), jsonb_build_object('released', null, 'withheld', 2),
  'the record says which number was withheld, and that none was released'
);
select is(
  (pg_temp.row_of(1) ->> 'referrals')::integer, 1,
  'the sign-up stops counting for whoever invited it'
);
select is(
  (select replayed
   from pg_temp.marks(pg_temp.id_of(2), 'Cuentas en serie desde un mismo equipo', 1)),
  true,
  'the same mark sent again is answered from its receipt'
);

-- Carla holds #3 and has no account: her number moves on, and #2 is passed over.
select replayed from pg_temp.marks(pg_temp.id_of(3), 'Correos en serie', 2);

select is(
  array[pg_temp.number_of(3), pg_temp.number_of(107)], array[null, 3]::smallint[],
  'a number given up without an account goes to the next in line'
);
select is(
  (select count(*) from waitlist.signups where founding_number = 2), 0::bigint,
  'and the withheld number is still nobody''s'
);

-- ---------------------------------------------------------------------------
-- OP-WL-016 — the mark is taken back
-- ---------------------------------------------------------------------------

create temporary table emails_before_withdrawal as
select pg_temp.founding_emails() as emails;

select is(
  (select jsonb_build_object(
     'discard_reason', result -> 'discard_reason',
     'founding_number', result -> 'founding_number',
     'replayed', replayed
   )
   from pg_temp.withdraws(pg_temp.id_of(2), 'La persona escribió y es real', 1)),
  jsonb_build_object('discard_reason', null, 'founding_number', 2, 'replayed', false),
  'taking the mark back returns the same number to the sign-up'
);
select is(
  pg_temp.person_number('019e1301-0000-7000-8000-000000000302'), 2::smallint,
  'and to the person'
);
select is(
  pg_temp.founding_emails(), (select emails from emails_before_withdrawal),
  'no email announces a number he already had'
);
select is(
  (pg_temp.row_of(1) ->> 'referrals')::integer, 1,
  'he counts again for whoever invited him, and Carla still does not'
);

select replayed from pg_temp.marks(pg_temp.id_of(2), 'Segunda revisión del caso', 3);
select is(
  array[pg_temp.number_of(2), pg_temp.person_number('019e1301-0000-7000-8000-000000000302')],
  array[null, null]::smallint[],
  'marked again, he loses it again'
);
select replayed from pg_temp.withdraws(pg_temp.id_of(2), 'Era un error de la revisión', 2);
select is(
  array[pg_temp.number_of(2), pg_temp.person_number('019e1301-0000-7000-8000-000000000302')],
  array[2, 2]::smallint[],
  'and unmarked again, it is the same number'
);

-- ---------------------------------------------------------------------------
-- A number given up before the account existed is not returned
-- ---------------------------------------------------------------------------

select replayed from pg_temp.marks(pg_temp.id_of(10), 'Correos en serie', 4);
select is(
  array[pg_temp.number_of(10), pg_temp.number_of(108)], array[null, 4]::smallint[],
  'a sign-up marked before its account gave its number to the next in line'
);

select set_config('app.actor_kind', 'worker', true);
select is(
  pg_temp.links('019e1301-0000-7000-8000-000000000310', 10), 'linked',
  'a marked sign-up is still linked to the account created with its email'
);
select set_config('app.actor_kind', 'support', true);

select replayed from pg_temp.withdraws(pg_temp.id_of(10), 'La persona escribió y es real', 3);
select is(
  array[pg_temp.number_of(10), pg_temp.person_number('019e1301-0000-7000-8000-000000000310')],
  array[null, null]::smallint[],
  'its mark taken back, it waits in line: the number it gave up is somebody else''s'
);
select is(
  pg_temp.mark_record(10), jsonb_build_object('released', 4, 'withheld', null),
  'its record says the number was released, not withheld'
);

select * from finish();
rollback;
