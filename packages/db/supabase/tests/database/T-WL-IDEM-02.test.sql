-- T-WL-IDEM-02 — marking a sign-up as fraud is idempotent (`OP-WL-012`; HU-BO-035): the
-- same command sent again answers what the first one did, and leaves one record.

begin;

select plan(6);

create function pg_temp.h(n integer) returns bytea language sql immutable as $$
  select decode(lpad(to_hex(n), 64, '0'), 'hex')
$$;
create function pg_temp.u(n integer) returns uuid language sql immutable as $$
  select ('019e0700-0000-7000-8000-' || lpad(to_hex(n), 12, '0'))::uuid
$$;

insert into identity.people (id, given_name, family_name, status)
values
  ('019e0701-0000-7000-8000-000000000001', 'Manager', 'Alpha', 'active'),
  ('019e0701-0000-7000-8000-000000000002', 'Manager', 'Beta', 'active'),
  ('019e0701-0000-7000-8000-000000000003', 'Commercial', 'Gamma', 'active');

insert into identity.access_accounts (id, provider, issuer, subject, person_id)
values
  ('019e0701-0000-7000-8000-000000000021', 'workos', 'https://issuer.test', 'alpha-wl7', null),
  ('019e0701-0000-7000-8000-000000000022', 'workos', 'https://issuer.test', 'beta-wl7', null),
  ('019e0701-0000-7000-8000-000000000023', 'workos', 'https://issuer.test', 'gamma-wl7',
    '019e0701-0000-7000-8000-000000000003');

select support.bootstrap_backoffice_administrators(
  '019e0701-0000-7000-8000-000000000001', 'alpha-wl7',
  '019e0701-0000-7000-8000-000000000002', 'beta-wl7',
  'https://issuer.test', clock_timestamp() + interval '30 days', 'CEREMONY-WL-IDEM-02'
);

insert into identity.access_sessions (
  id, access_account_id, provider_session_id, surface, token_hash, token_ciphertext,
  access_token_expires_at, assurance_level, authentication_method,
  assurance_verified_at, last_activity_at, absolute_expires_at
) values
  ('019e0701-0000-7000-8000-000000000041', '019e0701-0000-7000-8000-000000000021',
    'sid_alpha_wl7', 'backoffice', decode(repeat('a1', 32), 'hex'), 'v1.alpha',
    clock_timestamp() + interval '5 minutes', 2, 'password_totp',
    clock_timestamp(), clock_timestamp(), clock_timestamp() + interval '8 hours'),
  ('019e0701-0000-7000-8000-000000000043', '019e0701-0000-7000-8000-000000000023',
    'sid_gamma_wl7', 'backoffice', decode(repeat('a3', 32), 'hex'), 'v1.gamma',
    clock_timestamp() + interval '5 minutes', 2, 'password_totp',
    clock_timestamp(), clock_timestamp(), clock_timestamp() + interval '8 hours');

select support.assign_platform_role(
  '019e0701-0000-7000-8000-000000000001', '019e0701-0000-7000-8000-000000000041',
  '019e0701-0000-7000-8000-000000000003', 'allfit_admin',
  '019e0701-0000-7000-8000-000000000103', '019e0701-0000-7000-8000-000000000203',
  decode(repeat('c3', 32), 'hex')
);

-- Converges onto the duty the role already brings.
select support.assign_platform_duty(
  '019e0701-0000-7000-8000-000000000001', '019e0701-0000-7000-8000-000000000041',
  '019e0701-0000-7000-8000-000000000003', 'manage_platform_commercial',
  clock_timestamp(), clock_timestamp() + interval '30 days', 'CASE-2026-302',
  '019e0701-0000-7000-8000-000000000113', '019e0701-0000-7000-8000-000000000213',
  decode(repeat('e3', 32), 'hex')
);

select set_config('app.actor_kind', 'support', true),
       set_config('app.actor_person_id', '019e0701-0000-7000-8000-000000000003', true);

select waitlist.join(
  'Ana Ruiz', 'ana@example.com', 'es', true, '2026-11-10', null, null, null, null,
  pg_temp.h(500001), pg_temp.h(600001),
  pg_temp.u(2), pg_temp.h(2), pg_temp.u(3), pg_temp.h(3), 1::smallint
);
select waitlist.confirm(pg_temp.h(2), pg_temp.h(900001));

create function pg_temp.ana() returns uuid language sql as $$
  select id from waitlist.signups where canonical_email = 'ana@example.com'
$$;
-- The command with the key, the command identifier and the request hash given.
create function pg_temp.marks(p_key integer, p_command integer, p_hash integer)
returns table (result jsonb, replayed boolean) language sql as $$
  select * from waitlist.mark_signup_as_fraud(
    '019e0701-0000-7000-8000-000000000003', '019e0701-0000-7000-8000-000000000043',
    pg_temp.ana(), 'Correos en serie desde un mismo equipo',
    ('5f7b0000-0000-4000-8000-' || lpad(p_key::text, 12, '0'))::uuid,
    pg_temp.u(9000 + p_command), pg_temp.h(9000 + p_hash)
  )
$$;

create temporary table answers on commit drop as
select 1 as attempt, marked.result, marked.replayed from pg_temp.marks(1, 1, 1) as marked;
insert into answers select 2, marked.result, marked.replayed from pg_temp.marks(1, 1, 1) as marked;
insert into answers select 3, marked.result, marked.replayed from pg_temp.marks(2, 1, 1) as marked;

select is(
  (select array_agg(replayed order by attempt) from answers), array[false, true, true],
  'the first command marks; the same key again, or the same command, is a replay'
);
select is(
  (select count(distinct result) from answers), 1::bigint,
  'every one of them answers the same sign-up, read the same'
);
select is(
  (select result ->> 'discard_reason' from answers where attempt = 2), 'fraud',
  'which is the sign-up as the first command left it'
);
select is(
  (select count(*) from waitlist.signup_events), 1::bigint,
  'and the three leave one record'
);
select throws_ok(
  $$ select * from pg_temp.marks(1, 1, 2) $$,
  '23505', null,
  'a key used again for a different request is refused'
);
select throws_ok(
  $$ select * from pg_temp.marks(3, 3, 3) $$,
  '55000', null,
  'and a new command for a sign-up already marked is a conflict, not a replay'
);

select * from finish();
rollback;
