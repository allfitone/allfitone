-- T-WL-RLS-03 — who takes a fraud mark back (`OP-WL-016`; HU-BO-035): a person of the
-- team with the commercial duty in a live Backoffice session, and nobody else. Every
-- refusal is tried against a mark that stands, so a refusal is what kept it standing.

begin;

select plan(7);

create function pg_temp.h(n integer) returns bytea language sql immutable as $$
  select decode(lpad(to_hex(n), 64, '0'), 'hex')
$$;
create function pg_temp.u(n integer) returns uuid language sql immutable as $$
  select ('019e0800-0000-7000-8000-' || lpad(to_hex(n), 12, '0'))::uuid
$$;

insert into identity.people (id, given_name, family_name, status)
values
  ('019e0801-0000-7000-8000-000000000001', 'Manager', 'Alpha', 'active'),
  ('019e0801-0000-7000-8000-000000000002', 'Manager', 'Beta', 'active'),
  ('019e0801-0000-7000-8000-000000000003', 'Commercial', 'Gamma', 'active'),
  ('019e0801-0000-7000-8000-000000000007', 'Outsider', 'Eta', 'active'),
  ('019e0801-0000-7000-8000-000000000011', 'Commercial', 'Lambda', 'active');

insert into identity.access_accounts (id, provider, issuer, subject, person_id)
values
  ('019e0801-0000-7000-8000-000000000021', 'workos', 'https://issuer.test', 'alpha-wl8', null),
  ('019e0801-0000-7000-8000-000000000022', 'workos', 'https://issuer.test', 'beta-wl8', null),
  ('019e0801-0000-7000-8000-000000000023', 'workos', 'https://issuer.test', 'gamma-wl8',
    '019e0801-0000-7000-8000-000000000003'),
  ('019e0801-0000-7000-8000-000000000027', 'workos', 'https://issuer.test', 'eta-wl8',
    '019e0801-0000-7000-8000-000000000007'),
  ('019e0801-0000-7000-8000-000000000031', 'workos', 'https://issuer.test', 'lambda-wl8',
    '019e0801-0000-7000-8000-000000000011');

select support.bootstrap_backoffice_administrators(
  '019e0801-0000-7000-8000-000000000001', 'alpha-wl8',
  '019e0801-0000-7000-8000-000000000002', 'beta-wl8',
  'https://issuer.test', clock_timestamp() + interval '30 days', 'CEREMONY-WL-RLS-03'
);

-- AAL2 is not asserted by its absence: `ck_access_sessions_backoffice_assurance` makes a
-- Backoffice session AAL2 or no session at all. What a duty loses is its session.
insert into identity.access_sessions (
  id, access_account_id, provider_session_id, surface, token_hash, token_ciphertext,
  access_token_expires_at, assurance_level, authentication_method,
  assurance_verified_at, last_activity_at, absolute_expires_at, revoked_at
) values
  ('019e0801-0000-7000-8000-000000000041', '019e0801-0000-7000-8000-000000000021',
    'sid_alpha_wl8', 'backoffice', decode(repeat('a1', 32), 'hex'), 'v1.alpha',
    clock_timestamp() + interval '5 minutes', 2, 'password_totp',
    clock_timestamp(), clock_timestamp(), clock_timestamp() + interval '8 hours', null),
  ('019e0801-0000-7000-8000-000000000043', '019e0801-0000-7000-8000-000000000023',
    'sid_gamma_wl8', 'backoffice', decode(repeat('a3', 32), 'hex'), 'v1.gamma',
    clock_timestamp() + interval '5 minutes', 2, 'password_totp',
    clock_timestamp(), clock_timestamp(), clock_timestamp() + interval '8 hours', null),
  ('019e0801-0000-7000-8000-000000000047', '019e0801-0000-7000-8000-000000000027',
    'sid_eta_wl8', 'backoffice', decode(repeat('a7', 32), 'hex'), 'v1.eta',
    clock_timestamp() + interval '5 minutes', 2, 'password_totp',
    clock_timestamp(), clock_timestamp(), clock_timestamp() + interval '8 hours', null),
  -- The commercial duty on a session somebody already closed.
  ('019e0801-0000-7000-8000-000000000051', '019e0801-0000-7000-8000-000000000031',
    'sid_lambda_wl8', 'backoffice', decode(repeat('b1', 32), 'hex'), 'v1.lambda',
    clock_timestamp() + interval '5 minutes', 2, 'password_totp',
    clock_timestamp(), clock_timestamp(), clock_timestamp() + interval '8 hours',
    clock_timestamp());

-- Eta keeps a live Backoffice session and is never granted the role.
select support.assign_platform_role(
  '019e0801-0000-7000-8000-000000000001', '019e0801-0000-7000-8000-000000000041',
  person_id, 'allfit_admin', key, command, decode(repeat(hash_byte, 32), 'hex')
)
from (values
  ('019e0801-0000-7000-8000-000000000003'::uuid, '019e0801-0000-7000-8000-000000000103'::uuid,
    '019e0801-0000-7000-8000-000000000203'::uuid, 'c3'),
  ('019e0801-0000-7000-8000-000000000011'::uuid, '019e0801-0000-7000-8000-000000000111'::uuid,
    '019e0801-0000-7000-8000-000000000211'::uuid, 'd1')
) as grant_row(person_id, key, command, hash_byte);

-- Converges onto the duty the role already brings.
select support.assign_platform_duty(
  '019e0801-0000-7000-8000-000000000001', '019e0801-0000-7000-8000-000000000041',
  person_id, 'manage_platform_commercial',
  clock_timestamp(), clock_timestamp() + interval '30 days', 'CASE-2026-302',
  key, command, decode(repeat(hash_byte, 32), 'hex')
)
from (values
  ('019e0801-0000-7000-8000-000000000003'::uuid, '019e0801-0000-7000-8000-000000000113'::uuid,
    '019e0801-0000-7000-8000-000000000213'::uuid, 'e3'),
  ('019e0801-0000-7000-8000-000000000011'::uuid, '019e0801-0000-7000-8000-000000000121'::uuid,
    '019e0801-0000-7000-8000-000000000221'::uuid, 'f1')
) as duty_row(person_id, key, command, hash_byte);

select waitlist.join(
  'Ana Ruiz', 'ana@example.com', 'es', true, '2026-11-10', null, null, null, null,
  pg_temp.h(500001), pg_temp.h(600001),
  pg_temp.u(2), pg_temp.h(2), pg_temp.u(3), pg_temp.h(3), 1::smallint
);

create function pg_temp.ana() returns uuid language sql as $$
  select id from waitlist.signups where canonical_email = 'ana@example.com'
$$;
create function pg_temp.withdraws(p_person text, p_session text, p_key integer) returns jsonb
language sql as $$
  select result from waitlist.withdraw_fraud_mark(
    p_person::uuid, p_session::uuid, pg_temp.ana(), 'La persona escribió y es real',
    ('5f8b0000-0000-4000-8000-' || lpad(p_key::text, 12, '0'))::uuid,
    pg_temp.u(9000 + p_key), pg_temp.h(9000 + p_key)
  )
$$;

-- Gamma marks Ana. Everyone below tries to take that mark back.
select set_config('app.actor_kind', 'support', true),
       set_config('app.actor_person_id', '019e0801-0000-7000-8000-000000000003', true);

select replayed from waitlist.mark_signup_as_fraud(
  '019e0801-0000-7000-8000-000000000003', '019e0801-0000-7000-8000-000000000043',
  pg_temp.ana(), 'Correos en serie desde un mismo equipo',
  '5f8b0000-0000-4000-8000-000000000900', pg_temp.u(9900), pg_temp.h(9900)
);

-- ---------------------------------------------------------------------------
-- What the runtime role reaches
-- ---------------------------------------------------------------------------

select ok(
  has_function_privilege(
    'allfit_api', 'waitlist.withdraw_fraud_mark(uuid,uuid,uuid,text,uuid,uuid,bytea)', 'EXECUTE'
  ),
  'the runtime role takes a fraud mark back through its function'
);

-- ---------------------------------------------------------------------------
-- Who is refused
-- ---------------------------------------------------------------------------

select set_config('app.actor_person_id', '019e0801-0000-7000-8000-000000000007', true);

select throws_ok(
  $$ select pg_temp.withdraws(
    '019e0801-0000-7000-8000-000000000007', '019e0801-0000-7000-8000-000000000047', 1
  ) $$,
  '42501', null,
  'a Backoffice session without the admin role does not take a fraud mark back'
);

select set_config('app.actor_person_id', '019e0801-0000-7000-8000-000000000011', true);

select throws_ok(
  $$ select pg_temp.withdraws(
    '019e0801-0000-7000-8000-000000000011', '019e0801-0000-7000-8000-000000000051', 2
  ) $$,
  '42501', null,
  'nor does the commercial duty on a session that was closed'
);

-- The actor of the transaction and the actor named in the call are one person.
select set_config('app.actor_person_id', '019e0801-0000-7000-8000-000000000001', true);

select throws_ok(
  $$ select pg_temp.withdraws(
    '019e0801-0000-7000-8000-000000000003', '019e0801-0000-7000-8000-000000000043', 3
  ) $$,
  '42501', null,
  'and a mark is not taken back for an actor other than the one acting'
);

select is(
  (select jsonb_build_object(
     'discard_reason', (select discard_reason from waitlist.signups where id = pg_temp.ana()),
     'records', (select count(*) from waitlist.signup_events)
   )),
  jsonb_build_object('discard_reason', 'fraud', 'records', 1),
  'every refusal left the mark standing and the record as it was'
);

-- ---------------------------------------------------------------------------
-- Who takes a mark back
-- ---------------------------------------------------------------------------

select set_config('app.actor_person_id', '019e0801-0000-7000-8000-000000000003', true);

select is(
  pg_temp.withdraws(
    '019e0801-0000-7000-8000-000000000003', '019e0801-0000-7000-8000-000000000043', 4
  ) -> 'discard_reason',
  'null'::jsonb,
  'the commercial duty in a live session takes the mark back'
);
select is(
  (select array_agg(assignment.duty_code order by event.occurred_at)
   from waitlist.signup_events as event
   join support.platform_duty_assignments as assignment
     on assignment.id = event.actor_duty_assignment_id),
  array['manage_platform_commercial', 'manage_platform_commercial'],
  'and the record names the duty assignment acted under, for the mark and for its withdrawal'
);

select * from finish();
rollback;
