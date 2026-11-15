-- T-WL-RLS-02 — who reviews the Allfit Space waitlist in the Backoffice (`OP-WL-011`,
-- `OP-WL-012`; HU-BO-035, criteria 5 and 6; ADR-050, decision 3): a person of the team
-- with the commercial duty in a live Backoffice session, and nobody else. The runtime role
-- reaches the list and its record through three functions, and never a hash.

begin;

select plan(19);

create function pg_temp.h(n integer) returns bytea language sql immutable as $$
  select decode(lpad(to_hex(n), 64, '0'), 'hex')
$$;
create function pg_temp.u(n integer) returns uuid language sql immutable as $$
  select ('019e0200-0000-7000-8000-' || lpad(to_hex(n), 12, '0'))::uuid
$$;

insert into identity.people (id, given_name, family_name, status)
values
  ('019e0201-0000-7000-8000-000000000001', 'Manager', 'Alpha', 'active'),
  ('019e0201-0000-7000-8000-000000000002', 'Manager', 'Beta', 'active'),
  ('019e0201-0000-7000-8000-000000000003', 'Commercial', 'Gamma', 'active'),
  ('019e0201-0000-7000-8000-000000000007', 'Outsider', 'Eta', 'active'),
  ('019e0201-0000-7000-8000-000000000011', 'Commercial', 'Lambda', 'active');

insert into identity.access_accounts (id, provider, issuer, subject, person_id)
values
  ('019e0201-0000-7000-8000-000000000021', 'workos', 'https://issuer.test', 'alpha-wl2', null),
  ('019e0201-0000-7000-8000-000000000022', 'workos', 'https://issuer.test', 'beta-wl2', null),
  ('019e0201-0000-7000-8000-000000000023', 'workos', 'https://issuer.test', 'gamma-wl2',
    '019e0201-0000-7000-8000-000000000003'),
  ('019e0201-0000-7000-8000-000000000027', 'workos', 'https://issuer.test', 'eta-wl2',
    '019e0201-0000-7000-8000-000000000007'),
  ('019e0201-0000-7000-8000-000000000031', 'workos', 'https://issuer.test', 'lambda-wl2',
    '019e0201-0000-7000-8000-000000000011');

select support.bootstrap_backoffice_administrators(
  '019e0201-0000-7000-8000-000000000001', 'alpha-wl2',
  '019e0201-0000-7000-8000-000000000002', 'beta-wl2',
  'https://issuer.test', clock_timestamp() + interval '30 days', 'CEREMONY-WL-RLS-02'
);

-- AAL2 is not asserted by its absence: `ck_access_sessions_backoffice_assurance` makes a
-- Backoffice session AAL2 or no session at all. What a duty loses is its session.
insert into identity.access_sessions (
  id, access_account_id, provider_session_id, surface, token_hash, token_ciphertext,
  access_token_expires_at, assurance_level, authentication_method,
  assurance_verified_at, last_activity_at, absolute_expires_at, revoked_at
) values
  ('019e0201-0000-7000-8000-000000000041', '019e0201-0000-7000-8000-000000000021',
    'sid_alpha_wl2', 'backoffice', decode(repeat('a1', 32), 'hex'), 'v1.alpha',
    clock_timestamp() + interval '5 minutes', 2, 'password_totp',
    clock_timestamp(), clock_timestamp(), clock_timestamp() + interval '8 hours', null),
  ('019e0201-0000-7000-8000-000000000043', '019e0201-0000-7000-8000-000000000023',
    'sid_gamma_wl2', 'backoffice', decode(repeat('a3', 32), 'hex'), 'v1.gamma',
    clock_timestamp() + interval '5 minutes', 2, 'password_totp',
    clock_timestamp(), clock_timestamp(), clock_timestamp() + interval '8 hours', null),
  ('019e0201-0000-7000-8000-000000000047', '019e0201-0000-7000-8000-000000000027',
    'sid_eta_wl2', 'backoffice', decode(repeat('a7', 32), 'hex'), 'v1.eta',
    clock_timestamp() + interval '5 minutes', 2, 'password_totp',
    clock_timestamp(), clock_timestamp(), clock_timestamp() + interval '8 hours', null),
  -- The commercial duty on a session somebody already closed.
  ('019e0201-0000-7000-8000-000000000051', '019e0201-0000-7000-8000-000000000031',
    'sid_lambda_wl2', 'backoffice', decode(repeat('b1', 32), 'hex'), 'v1.lambda',
    clock_timestamp() + interval '5 minutes', 2, 'password_totp',
    clock_timestamp(), clock_timestamp(), clock_timestamp() + interval '8 hours',
    clock_timestamp());

-- Eta keeps a live Backoffice session and is never granted the role.
select support.assign_platform_role(
  '019e0201-0000-7000-8000-000000000001', '019e0201-0000-7000-8000-000000000041',
  person_id, 'allfit_admin', key, command, decode(repeat(hash_byte, 32), 'hex')
)
from (values
  ('019e0201-0000-7000-8000-000000000003'::uuid, '019e0201-0000-7000-8000-000000000103'::uuid,
    '019e0201-0000-7000-8000-000000000203'::uuid, 'c3'),
  ('019e0201-0000-7000-8000-000000000011'::uuid, '019e0201-0000-7000-8000-000000000111'::uuid,
    '019e0201-0000-7000-8000-000000000211'::uuid, 'd1')
) as grant_row(person_id, key, command, hash_byte);

-- Converges onto the duty the role already brings.
select support.assign_platform_duty(
  '019e0201-0000-7000-8000-000000000001', '019e0201-0000-7000-8000-000000000041',
  person_id, 'manage_platform_commercial',
  clock_timestamp(), clock_timestamp() + interval '30 days', 'CASE-2026-302',
  key, command, decode(repeat(hash_byte, 32), 'hex')
)
from (values
  ('019e0201-0000-7000-8000-000000000003'::uuid, '019e0201-0000-7000-8000-000000000113'::uuid,
    '019e0201-0000-7000-8000-000000000213'::uuid, 'e3'),
  ('019e0201-0000-7000-8000-000000000011'::uuid, '019e0201-0000-7000-8000-000000000121'::uuid,
    '019e0201-0000-7000-8000-000000000221'::uuid, 'f1')
) as duty_row(person_id, key, command, hash_byte);

select waitlist.join(
  'Ana Ruiz', 'ana@example.com', 'es', true, '2026-11-10', null, null, null, null,
  pg_temp.h(500001), pg_temp.h(600001),
  pg_temp.u(2), pg_temp.h(2), pg_temp.u(3), pg_temp.h(3), 1::smallint
);

create function pg_temp.ana() returns uuid language sql as $$
  select id from waitlist.signups where canonical_email = 'ana@example.com'
$$;
create function pg_temp.marks(p_person text, p_session text, p_key integer) returns jsonb
language sql as $$
  select result from waitlist.mark_signup_as_fraud(
    p_person::uuid, p_session::uuid, pg_temp.ana(), 'Correos en serie desde un mismo equipo',
    ('5f3b0000-0000-4000-8000-' || lpad(p_key::text, 12, '0'))::uuid,
    pg_temp.u(9000 + p_key), pg_temp.h(9000 + p_key)
  )
$$;

-- ---------------------------------------------------------------------------
-- What the runtime role reaches
-- ---------------------------------------------------------------------------

select ok(
  not has_table_privilege('allfit_api', 'waitlist.signup_events', 'SELECT')
    and not has_table_privilege('allfit_api', 'waitlist.signup_events', 'INSERT'),
  'the runtime role neither reads nor writes the record of a review'
);
select ok(
  (select relrowsecurity and relforcerowsecurity from pg_class
   where oid = 'waitlist.signup_events'::regclass),
  'whose table enables and forces row level security'
);
select ok(
  has_function_privilege(
    'allfit_api', 'waitlist.list_backoffice_signups(uuid,uuid,text,text,integer,uuid)', 'EXECUTE'
  )
    and has_function_privilege(
      'allfit_api', 'waitlist.read_backoffice_totals(uuid,uuid)', 'EXECUTE'
    )
    and has_function_privilege(
      'allfit_api', 'waitlist.mark_signup_as_fraud(uuid,uuid,uuid,text,uuid,uuid,bytea)',
      'EXECUTE'
    ),
  'it reaches the list, the totals and the fraud mark through their functions'
);
select ok(
  not has_function_privilege(
    'allfit_api', 'waitlist.backoffice_signup_projection(uuid)', 'EXECUTE'
  )
    and not has_function_privilege(
      'allfit_api', 'waitlist.require_waitlist_reviewer(uuid,uuid)', 'EXECUTE'
    ),
  'and never the projection or the duty check on their own'
);

-- ---------------------------------------------------------------------------
-- Who is refused
-- ---------------------------------------------------------------------------

select set_config('app.actor_kind', 'support', true),
       set_config('app.actor_person_id', '019e0201-0000-7000-8000-000000000007', true);

select throws_ok(
  $$ select * from waitlist.list_backoffice_signups(
    '019e0201-0000-7000-8000-000000000007', '019e0201-0000-7000-8000-000000000047',
    null, null, 25, null
  ) $$,
  '42501', null,
  'a Backoffice session without the admin role does not list the waitlist'
);
select throws_ok(
  $$ select waitlist.read_backoffice_totals(
    '019e0201-0000-7000-8000-000000000007', '019e0201-0000-7000-8000-000000000047'
  ) $$,
  '42501', null,
  'nor read its totals'
);
select throws_ok(
  $$ select pg_temp.marks(
    '019e0201-0000-7000-8000-000000000007', '019e0201-0000-7000-8000-000000000047', 1
  ) $$,
  '42501', null,
  'nor mark a sign-up as fraud'
);

select set_config('app.actor_person_id', '019e0201-0000-7000-8000-000000000011', true);

select throws_ok(
  $$ select * from waitlist.list_backoffice_signups(
    '019e0201-0000-7000-8000-000000000011', '019e0201-0000-7000-8000-000000000051',
    null, null, 25, null
  ) $$,
  '42501', null,
  'the commercial duty on a session that was closed lists nothing'
);
select throws_ok(
  $$ select waitlist.read_backoffice_totals(
    '019e0201-0000-7000-8000-000000000011', '019e0201-0000-7000-8000-000000000051'
  ) $$,
  '42501', null,
  'reads no totals'
);
select throws_ok(
  $$ select pg_temp.marks(
    '019e0201-0000-7000-8000-000000000011', '019e0201-0000-7000-8000-000000000051', 2
  ) $$,
  '42501', null,
  'and marks nothing'
);

-- The actor of the transaction and the actor named in the call are one person.
select set_config('app.actor_person_id', '019e0201-0000-7000-8000-000000000001', true);

select throws_ok(
  $$ select * from waitlist.list_backoffice_signups(
    '019e0201-0000-7000-8000-000000000003', '019e0201-0000-7000-8000-000000000043',
    null, null, 25, null
  ) $$,
  '42501', null,
  'the list is not read for an actor other than the one acting'
);
select throws_ok(
  $$ select pg_temp.marks(
    '019e0201-0000-7000-8000-000000000003', '019e0201-0000-7000-8000-000000000043', 3
  ) $$,
  '42501', null,
  'and a sign-up is not marked for them either'
);

select is(
  (select count(*) from waitlist.signup_events)::integer
    + (select count(*) from waitlist.signups where discard_reason is not null)::integer,
  0,
  'every refusal left the sign-up and the record untouched'
);

-- ---------------------------------------------------------------------------
-- Who reviews
-- ---------------------------------------------------------------------------

select set_config('app.actor_person_id', '019e0201-0000-7000-8000-000000000003', true);

select is(
  (select count(*) from waitlist.list_backoffice_signups(
    '019e0201-0000-7000-8000-000000000003', '019e0201-0000-7000-8000-000000000043',
    null, null, 25, null
  )),
  1::bigint,
  'the commercial duty in a live session lists the waitlist'
);
select is(
  (select array_agg(key order by key) from jsonb_object_keys((
    select signup from waitlist.list_backoffice_signups(
      '019e0201-0000-7000-8000-000000000003', '019e0201-0000-7000-8000-000000000043',
      null, null, 25, null
    )
  )) as key),
  array[
    'channel', 'confirmed_at', 'discard_reason', 'email', 'founding_number', 'fraud',
    'fraud_withdrawal', 'id', 'invited_by', 'joined_at', 'language', 'name',
    'referral_code', 'referrals', 'referrals_sharing_connection'
  ],
  'and what it reads of a sign-up holds no hash of the connection or the device'
);
select is(
  (select waitlist.read_backoffice_totals(
    '019e0201-0000-7000-8000-000000000003', '019e0201-0000-7000-8000-000000000043'
  ) ->> 'signups'),
  '1',
  'it reads the totals'
);
select is(
  (select pg_temp.marks(
    '019e0201-0000-7000-8000-000000000003', '019e0201-0000-7000-8000-000000000043', 4
  ) ->> 'discard_reason'),
  'fraud',
  'and it marks a sign-up as fraud'
);

-- ---------------------------------------------------------------------------
-- The record is append-only
-- ---------------------------------------------------------------------------

select throws_ok(
  $$ update waitlist.signup_events set reason = 'Otro motivo' $$,
  '55000', null,
  'the record of a review is never rewritten'
);
select throws_ok(
  $$ delete from waitlist.signup_events $$,
  '55000', null,
  'nor deleted'
);

select * from finish();
rollback;
