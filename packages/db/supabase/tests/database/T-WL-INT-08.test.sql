-- T-WL-INT-08 — the team takes a fraud mark back (`OP-WL-016`; HU-BO-035; ADR-050,
-- decisions 3 and 5): the sign-up returns to what it was before the mark, counts again
-- for its inviter unless its device came to count in the meantime, and waits in line
-- for the next Founding Member number instead of taking back the one it gave up.

begin;

select plan(22);

create function pg_temp.h(n integer) returns bytea language sql immutable as $$
  select decode(lpad(to_hex(n), 64, '0'), 'hex')
$$;
create function pg_temp.u(n integer) returns uuid language sql immutable as $$
  select ('019e0a00-0000-7000-8000-' || lpad(to_hex(n), 12, '0'))::uuid
$$;

insert into identity.people (id, given_name, family_name, status)
values
  ('019e0a01-0000-7000-8000-000000000001', 'Manager', 'Alpha', 'active'),
  ('019e0a01-0000-7000-8000-000000000002', 'Manager', 'Beta', 'active'),
  ('019e0a01-0000-7000-8000-000000000003', 'Commercial', 'Gamma', 'active');

insert into identity.access_accounts (id, provider, issuer, subject, person_id)
values
  ('019e0a01-0000-7000-8000-000000000021', 'workos', 'https://issuer.test', 'alpha-wl10', null),
  ('019e0a01-0000-7000-8000-000000000022', 'workos', 'https://issuer.test', 'beta-wl10', null),
  ('019e0a01-0000-7000-8000-000000000023', 'workos', 'https://issuer.test', 'gamma-wl10',
    '019e0a01-0000-7000-8000-000000000003');

select support.bootstrap_backoffice_administrators(
  '019e0a01-0000-7000-8000-000000000001', 'alpha-wl10',
  '019e0a01-0000-7000-8000-000000000002', 'beta-wl10',
  'https://issuer.test', clock_timestamp() + interval '30 days', 'CEREMONY-WL-INT-08'
);

insert into identity.access_sessions (
  id, access_account_id, provider_session_id, surface, token_hash, token_ciphertext,
  access_token_expires_at, assurance_level, authentication_method,
  assurance_verified_at, last_activity_at, absolute_expires_at
) values
  ('019e0a01-0000-7000-8000-000000000041', '019e0a01-0000-7000-8000-000000000021',
    'sid_alpha_wl10', 'backoffice', decode(repeat('a1', 32), 'hex'), 'v1.alpha',
    clock_timestamp() + interval '5 minutes', 2, 'password_totp',
    clock_timestamp(), clock_timestamp(), clock_timestamp() + interval '8 hours'),
  ('019e0a01-0000-7000-8000-000000000043', '019e0a01-0000-7000-8000-000000000023',
    'sid_gamma_wl10', 'backoffice', decode(repeat('a3', 32), 'hex'), 'v1.gamma',
    clock_timestamp() + interval '5 minutes', 2, 'password_totp',
    clock_timestamp(), clock_timestamp(), clock_timestamp() + interval '8 hours');

select support.assign_platform_role(
  '019e0a01-0000-7000-8000-000000000001', '019e0a01-0000-7000-8000-000000000041',
  '019e0a01-0000-7000-8000-000000000003', 'allfit_admin',
  '019e0a01-0000-7000-8000-000000000103', '019e0a01-0000-7000-8000-000000000203',
  decode(repeat('c3', 32), 'hex')
);

-- Converges onto the duty the role already brings.
select support.assign_platform_duty(
  '019e0a01-0000-7000-8000-000000000001', '019e0a01-0000-7000-8000-000000000041',
  '019e0a01-0000-7000-8000-000000000003', 'manage_platform_commercial',
  clock_timestamp(), clock_timestamp() + interval '30 days', 'CASE-2026-302',
  '019e0a01-0000-7000-8000-000000000113', '019e0a01-0000-7000-8000-000000000213',
  decode(repeat('e3', 32), 'hex')
);

select set_config('app.actor_kind', 'support', true),
       set_config('app.actor_person_id', '019e0a01-0000-7000-8000-000000000003', true);

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
    '019e0a01-0000-7000-8000-000000000003', '019e0a01-0000-7000-8000-000000000043',
    'p' || p_n || '@example.com', null, 5, null
  )
$$;
create function pg_temp.marks(p_signup_id uuid, p_reason text, p_key integer)
returns table (result jsonb, replayed boolean) language sql as $$
  select * from waitlist.mark_signup_as_fraud(
    '019e0a01-0000-7000-8000-000000000003', '019e0a01-0000-7000-8000-000000000043',
    p_signup_id, p_reason,
    ('5fab0000-0000-4000-8000-' || lpad(p_key::text, 12, '0'))::uuid,
    pg_temp.u(900000 + p_key), pg_temp.h(700000 + p_key)
  )
$$;
create function pg_temp.withdraws(p_signup_id uuid, p_reason text, p_key integer)
returns table (result jsonb, replayed boolean) language sql as $$
  select * from waitlist.withdraw_fraud_mark(
    '019e0a01-0000-7000-8000-000000000003', '019e0a01-0000-7000-8000-000000000043',
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

select replayed from pg_temp.marks(pg_temp.id_of(2), 'Correos en serie desde un mismo equipo', 1);

select is(
  array[pg_temp.number_of(2), pg_temp.number_of(107)], array[null, 2]::smallint[],
  'a marked sign-up gave its number to the one that waited'
);

-- ---------------------------------------------------------------------------
-- OP-WL-016 — what is refused
-- ---------------------------------------------------------------------------

select throws_ok(
  $$ select * from pg_temp.withdraws(pg_temp.id_of(2), '   ', 1) $$,
  '22023', null,
  'a fraud mark is not taken back without a reason'
);
select throws_ok(
  $$ select * from pg_temp.withdraws(pg_temp.id_of(2), 'no', 2) $$,
  '22023', null,
  'nor with one too short to say anything'
);
select throws_ok(
  $$ select * from pg_temp.withdraws(pg_temp.id_of(2), E'Escribió\ny es real', 3) $$,
  '22023', null,
  'nor with one spread over several lines'
);
select throws_ok(
  $$ select * from pg_temp.withdraws(pg_temp.u(424242), 'La persona escribió y es real', 4) $$,
  'P0002', null,
  'a sign-up that is not on the list is not found'
);
select throws_ok(
  $$ select * from pg_temp.withdraws(pg_temp.id_of(3), 'La persona escribió y es real', 5) $$,
  '55000', null,
  'and a sign-up that is not marked has no mark to take back'
);
select is(
  (select count(*) from waitlist.signup_events), 1::bigint,
  'none of them left a record'
);

-- ---------------------------------------------------------------------------
-- OP-WL-016 — what taking a mark back does
-- ---------------------------------------------------------------------------

select is(
  (pg_temp.row_of(1) ->> 'referrals')::integer, 1,
  'while it is marked, a sign-up does not count for whoever invited it'
);
select is(
  (select jsonb_build_object(
     'discard_reason', result -> 'discard_reason',
     'fraud', result -> 'fraud',
     'reason', result -> 'fraud_withdrawal' -> 'reason',
     'withdrawn', (result -> 'fraud_withdrawal' ->> 'withdrawn_at') is not null,
     'founding_number', result -> 'founding_number',
     'replayed', replayed
   )
   from pg_temp.withdraws(pg_temp.id_of(2), '  La persona escribió y es real ', 10)),
  jsonb_build_object(
    'discard_reason', null, 'fraud', null, 'reason', 'La persona escribió y es real',
    'withdrawn', true, 'founding_number', null, 'replayed', false
  ),
  'a sign-up whose mark was taken back reads unmarked, with the reason of the withdrawal'
);
select is(
  (pg_temp.row_of(1) ->> 'referrals')::integer, 2,
  'it counts again for whoever invited it'
);
select is(
  array[pg_temp.number_of(2), pg_temp.number_of(107)], array[null, 2]::smallint[],
  'the number it gave up stays with whoever received it'
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
     and event.event_type = 'waitlist.signup_fraud_mark_withdrawn.v1'),
  jsonb_build_object(
    'reason', 'La persona escribió y es real', 'previous', null, 'released', null,
    'actor', '019e0a01-0000-7000-8000-000000000003', 'duty', 'manage_platform_commercial'
  ),
  'the record keeps the reason and the duty assignment acted under'
);

-- Person 10 leaves and frees #4. Bruno confirmed before 108 and 109.
select waitlist.forget_signup(pg_temp.id_of(10));

select is(
  array[pg_temp.number_of(2), pg_temp.number_of(108)], array[4, null]::smallint[],
  'it is back in line where its confirmation puts it, and takes the next number freed'
);

-- Carla holds #3 and gives it to 108; #5 goes to 109, and nobody waits for #6.
select replayed from pg_temp.marks(pg_temp.id_of(3), 'Dirección de un servicio temporal', 2);
select waitlist.forget_signup(pg_temp.id_of(11));
select waitlist.forget_signup(pg_temp.id_of(12));

select is(
  (select jsonb_build_object('founding_number', result -> 'founding_number')
   from pg_temp.withdraws(pg_temp.id_of(3), 'El dominio es de su empresa', 11)),
  jsonb_build_object('founding_number', 6),
  'with a number free, the sign-up takes it as its mark is taken back'
);
select is(
  (select array_agg((outbox.payload ->> 'founding_number')::integer
                    order by (outbox.payload ->> 'founding_number')::integer)
   from system.outbox_events as outbox
   where outbox.event_type = 'waitlist.founding_number_assigned.v1'
     and outbox.aggregate_id = pg_temp.id_of(3)),
  array[3, 6],
  'and it is told of the new number by one event, like every Founding Member'
);

-- Darío never confirmed. #7 is freed while nobody waits.
select replayed from pg_temp.marks(pg_temp.id_of(4), 'Nombre de un personaje de ficción', 3);
select waitlist.forget_signup(pg_temp.id_of(13));
select replayed from pg_temp.withdraws(pg_temp.id_of(4), 'Es su nombre artístico', 12);

select ok(
  pg_temp.number_of(4) is null
    and not exists (select 1 from waitlist.signups where founding_number = 7),
  'a sign-up that never confirmed is given no number, and the free one stays free'
);

-- Gael was discarded when he joined, from a device that already counted for Ana.
select replayed from pg_temp.marks(pg_temp.id_of(7), 'Mismo equipo que otra inscripción', 4);

select is(
  pg_temp.row_of(7) -> 'fraud' ->> 'previous_discard_reason', 'same_device',
  'a mark says why the sign-up did not count before it'
);
select is(
  (select result ->> 'discard_reason'
   from pg_temp.withdraws(pg_temp.id_of(7), 'Comparte equipo con su hermano', 13)),
  'same_device',
  'and taking it back returns the sign-up to that, not to counting'
);

-- While Hugo is marked, Iván joins from Hugo's device and counts for Ana.
select replayed from pg_temp.marks(pg_temp.id_of(8), 'Correos en serie desde un mismo equipo', 5);
select pg_temp.joins(9, 'Iván Soto', pg_temp.ana_code(), 500009, 600008);

select is(
  (select jsonb_build_object(
     'ivan', (select discard_reason from waitlist.signups where id = pg_temp.id_of(9)),
     'hugo', result -> 'discard_reason'
   )
   from pg_temp.withdraws(pg_temp.id_of(8), 'La persona escribió y es real', 14)),
  jsonb_build_object('ivan', null, 'hugo', 'same_device'),
  'a device that came to count for the inviter in the meantime is not counted twice'
);

-- ---------------------------------------------------------------------------
-- A mark taken back can be made again
-- ---------------------------------------------------------------------------

select is(
  (select jsonb_build_object(
     'discard_reason', result -> 'discard_reason',
     'reason', result -> 'fraud' -> 'reason',
     'fraud_withdrawal', result -> 'fraud_withdrawal'
   )
   from pg_temp.marks(pg_temp.id_of(2), 'Volvió a inscribir direcciones en serie', 6)),
  jsonb_build_object(
    'discard_reason', 'fraud', 'reason', 'Volvió a inscribir direcciones en serie',
    'fraud_withdrawal', null
  ),
  'a sign-up is marked again, and reads with the reason of its latest mark'
);
select is(
  (select array_agg(event.event_type order by event.occurred_at)
   from waitlist.signup_events as event
   where event.signup_id = pg_temp.id_of(2)),
  array[
    'waitlist.signup_marked_as_fraud.v1', 'waitlist.signup_fraud_mark_withdrawn.v1',
    'waitlist.signup_marked_as_fraud.v1'
  ],
  'and the record keeps the mark, its withdrawal and the new mark'
);
select is(
  (waitlist.read_backoffice_totals(
     '019e0a01-0000-7000-8000-000000000003', '019e0a01-0000-7000-8000-000000000043'
   ) ->> 'marked_as_fraud')::integer,
  1,
  'the totals count only the marks that stand'
);

select * from finish();
rollback;
