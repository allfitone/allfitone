-- T-SUP-STANDING-01 — an Allfit admin holds every duty for as long as they are one
-- (ADR-046, superseding ADR-028 items 2 and 5 for administrators).
--
-- Two administrators could not run ADR-028: every operation waited on the other one
-- to grant its duty for at most ninety days, and the duty that grants the rest lapsed
-- for both at once. The base role now brings the thirteen duties with it, recorded as
-- rows so every command still names the exact assignment it acted under.
--
-- What stays: the role is never self-granted, revoking it revokes every duty, and a
-- Backoffice session without the role holds nothing. The session limits are sixty idle
-- minutes and twelve hours.

begin;

select plan(30);

insert into identity.people (id, given_name, family_name)
values
  ('019f6000-0000-7000-8000-000000000001', 'Admin', 'Alpha'),
  ('019f6000-0000-7000-8000-000000000002', 'Admin', 'Beta'),
  ('019f6000-0000-7000-8000-000000000003', 'Admin', 'Gamma'),
  ('019f6000-0000-7000-8000-000000000004', 'Outsider', 'Delta');

insert into identity.access_accounts (id, provider, issuer, subject, person_id)
values
  ('019f6000-0000-7000-8000-000000000011', 'workos', 'https://issuer.test', 'alpha', null),
  ('019f6000-0000-7000-8000-000000000012', 'workos', 'https://issuer.test', 'beta', null),
  ('019f6000-0000-7000-8000-000000000013', 'workos', 'https://issuer.test', 'gamma',
    '019f6000-0000-7000-8000-000000000003'),
  ('019f6000-0000-7000-8000-000000000014', 'workos', 'https://issuer.test', 'delta',
    '019f6000-0000-7000-8000-000000000004');

select support.bootstrap_backoffice_administrators(
  '019f6000-0000-7000-8000-000000000001', 'alpha',
  '019f6000-0000-7000-8000-000000000002', 'beta',
  'https://issuer.test', clock_timestamp() + interval '30 days', 'CEREMONY-STANDING-01'
);

insert into identity.access_sessions (
  id, access_account_id, provider_session_id, surface, token_hash, token_ciphertext,
  access_token_expires_at, assurance_level, authentication_method,
  assurance_verified_at, last_activity_at, absolute_expires_at
)
select session_id, account_id, 'sid_' || suffix, 'backoffice',
  decode(repeat(hash_byte, 32), 'hex'), 'v1.' || suffix,
  clock_timestamp() + interval '5 minutes', 2, 'password_totp',
  clock_timestamp() - interval '2 hours', clock_timestamp() - idle,
  clock_timestamp() + interval '6 hours'
from (values
  ('019f6000-0000-7000-8000-000000000021'::uuid, '019f6000-0000-7000-8000-000000000011'::uuid,
    'alpha', 'b1', interval '0 minutes'),
  ('019f6000-0000-7000-8000-000000000022'::uuid, '019f6000-0000-7000-8000-000000000011'::uuid,
    'alpha_59', 'b2', interval '59 minutes'),
  ('019f6000-0000-7000-8000-000000000023'::uuid, '019f6000-0000-7000-8000-000000000011'::uuid,
    'alpha_61', 'b3', interval '61 minutes'),
  ('019f6000-0000-7000-8000-000000000024'::uuid, '019f6000-0000-7000-8000-000000000013'::uuid,
    'gamma', 'b4', interval '0 minutes'),
  ('019f6000-0000-7000-8000-000000000025'::uuid, '019f6000-0000-7000-8000-000000000014'::uuid,
    'delta', 'b5', interval '0 minutes'),
  ('019f6000-0000-7000-8000-000000000026'::uuid, '019f6000-0000-7000-8000-000000000012'::uuid,
    'beta_61', 'b6', interval '61 minutes')
) as session_row(session_id, account_id, suffix, hash_byte, idle);

-- The role brings the duties ----------------------------------------------------------

select is(
  (select count(*) from support.platform_duty_assignments
    where person_id = '019f6000-0000-7000-8000-000000000001'),
  13::bigint,
  'the ceremony grants the role, and the role brings exactly the thirteen duties'
);

select is(
  (select count(distinct duty_code) from support.platform_duty_assignments
    where person_id = '019f6000-0000-7000-8000-000000000001'
      and basis = 'admin_role' and status = 'active'),
  13::bigint,
  'one of each duty, in force, held through the role'
);

select ok(
  (select bool_and(
      valid_to = '9999-12-31 00:00:00+00'
      and granted_by_person_id = '019f6000-0000-7000-8000-000000000002'
      and reason_code = 'admin_role')
    from support.platform_duty_assignments
    where person_id = '019f6000-0000-7000-8000-000000000001'),
  'they never lapse, and whoever granted the role is their grantor'
);

select is(
  (select string_agg(actor_mode || ':' || held, ',' order by actor_mode)
    from (
      select actor_mode, count(*) as held from support.platform_duty_assignments
      where person_id = '019f6000-0000-7000-8000-000000000001'
      group by actor_mode
    ) as modes),
  'A10:5,A11:3,A12:5',
  'each duty carries the mode it derives'
);

select ok(
  access_control.has_platform_duty(
    '019f6000-0000-7000-8000-000000000001', '019f6000-0000-7000-8000-000000000021',
    'curate_global_catalog'
  ),
  'an admin exercises a duty nobody granted one by one'
);

select is(
  support.platform_duty_assignment_projection(
    (select id from support.platform_duty_assignments
      where person_id = '019f6000-0000-7000-8000-000000000001'
        and duty_code = 'manage_platform_access')
  ) ->> 'basis',
  'admin_role',
  'the projection says the duty is held through the role'
);

-- A role granted later brings them too.
select support.assign_platform_role(
  '019f6000-0000-7000-8000-000000000001', '019f6000-0000-7000-8000-000000000021',
  '019f6000-0000-7000-8000-000000000003', 'allfit_admin',
  '019f6000-0000-7000-8000-000000000101', '019f6000-0000-7000-8000-000000000201',
  decode(repeat('01', 32), 'hex')
);

select is(
  (select count(*) from support.platform_duty_assignments
    where person_id = '019f6000-0000-7000-8000-000000000003'
      and basis = 'admin_role' and status = 'active'
      and granted_by_person_id = '019f6000-0000-7000-8000-000000000001'),
  13::bigint,
  'a base role granted in Backoffice brings the thirteen duties, granted by its grantor'
);

select ok(
  access_control.has_platform_duty(
    '019f6000-0000-7000-8000-000000000003', '019f6000-0000-7000-8000-000000000024',
    'approve_break_glass'
  ),
  'the new admin holds a security duty at once'
);

select ok(
  not access_control.has_platform_duty(
    '019f6000-0000-7000-8000-000000000004', '019f6000-0000-7000-8000-000000000025',
    'view_platform_metrics'
  ),
  'a Backoffice session without the role holds no duty'
);

select ok(
  not access_control.has_platform_role(
    '019f6000-0000-7000-8000-000000000004', '019f6000-0000-7000-8000-000000000025',
    'allfit_admin'
  ),
  'and no role'
);

-- Granting converges on the duty the role already holds.
select is(
  (select result ->> 'basis' from support.assign_platform_duty(
    '019f6000-0000-7000-8000-000000000001', '019f6000-0000-7000-8000-000000000021',
    '019f6000-0000-7000-8000-000000000003', 'view_platform_metrics',
    null, clock_timestamp() + interval '30 days', 'TICKET-STANDING-1',
    '019f6000-0000-7000-8000-000000000102', '019f6000-0000-7000-8000-000000000202',
    decode(repeat('02', 32), 'hex')
  )),
  'admin_role',
  'granting an admin a duty they hold through the role answers with that duty'
);

select is(
  (select count(*) from support.platform_duty_assignments
    where person_id = '019f6000-0000-7000-8000-000000000003'
      and duty_code = 'view_platform_metrics'),
  1::bigint,
  'and adds no second row'
);

-- A duty held through the role follows the role ----------------------------------------

select throws_ok(
  $$ select support.suspend_platform_duty(
    '019f6000-0000-7000-8000-000000000001', '019f6000-0000-7000-8000-000000000021',
    (select id from support.platform_duty_assignments
      where person_id = '019f6000-0000-7000-8000-000000000003'
        and duty_code = 'curate_global_catalog'),
    '019f6000-0000-7000-8000-000000000103', '019f6000-0000-7000-8000-000000000203',
    decode(repeat('03', 32), 'hex')
  ) $$,
  '23514',
  'a duty held through the admin role follows the role',
  'it is not suspended on its own'
);

select throws_ok(
  $$ select support.revoke_platform_duty(
    '019f6000-0000-7000-8000-000000000001', '019f6000-0000-7000-8000-000000000021',
    (select id from support.platform_duty_assignments
      where person_id = '019f6000-0000-7000-8000-000000000003'
        and duty_code = 'curate_global_catalog'),
    '019f6000-0000-7000-8000-000000000104', '019f6000-0000-7000-8000-000000000204',
    decode(repeat('04', 32), 'hex')
  ) $$,
  '23514',
  'a duty held through the admin role follows the role',
  'nor revoked on its own'
);

select throws_ok(
  $$ select support.recertify_platform_duty(
    '019f6000-0000-7000-8000-000000000001', '019f6000-0000-7000-8000-000000000021',
    (select id from support.platform_duty_assignments
      where person_id = '019f6000-0000-7000-8000-000000000003'
        and duty_code = 'curate_global_catalog'),
    '019f6000-0000-7000-8000-000000000105', '019f6000-0000-7000-8000-000000000205',
    decode(repeat('05', 32), 'hex')
  ) $$,
  '23514',
  'a duty held through the admin role follows the role',
  'nor recertified: the role is what is attested'
);

select throws_ok(
  $$ update support.platform_duty_assignments set basis = 'granted'
     where person_id = '019f6000-0000-7000-8000-000000000003'
       and duty_code = 'curate_global_catalog' $$,
  '23514',
  'platform duty history is append-only',
  'how a duty is held cannot be rewritten'
);

select throws_ok(
  $$ insert into support.platform_duty_assignments (
       person_id, duty_code, actor_mode, status, valid_from, valid_to,
       granted_by_person_id, reason_code, basis
     ) values (
       '019f6000-0000-7000-8000-000000000004', 'view_platform_metrics', 'A10', 'active',
       clock_timestamp(), clock_timestamp() + interval '10 days',
       '019f6000-0000-7000-8000-000000000001', 'admin_role', 'admin_role'
     ) $$,
  '23514',
  null,
  'a duty held through the role has no end of its own'
);

select throws_ok(
  $$ insert into support.platform_duty_assignments (
       person_id, duty_code, actor_mode, status, valid_from, valid_to,
       granted_by_person_id, reason_code
     ) values (
       '019f6000-0000-7000-8000-000000000001', 'view_platform_metrics', 'A10', 'active',
       clock_timestamp(), clock_timestamp() + interval '91 days',
       '019f6000-0000-7000-8000-000000000002', 'TICKET-STANDING-2'
     ) $$,
  '23514',
  null,
  'a granted duty still lasts at most ninety days'
);

-- What production already holds: a temporary duty beside the one the role brings.
select lives_ok(
  $$ insert into support.platform_duty_assignments (
       person_id, duty_code, actor_mode, status, valid_from, valid_to,
       granted_by_person_id, reason_code
     ) values (
       '019f6000-0000-7000-8000-000000000001', 'manage_platform_access', 'A12', 'active',
       clock_timestamp(), clock_timestamp() + interval '10 days',
       '019f6000-0000-7000-8000-000000000002', 'TICKET-STANDING-3'
     ) $$,
  'a temporary duty lives beside the same duty held through the role'
);

select throws_ok(
  $$ insert into support.platform_duty_assignments (
       person_id, duty_code, actor_mode, status, valid_from, valid_to,
       granted_by_person_id, reason_code
     ) values (
       '019f6000-0000-7000-8000-000000000001', 'manage_platform_access', 'A12', 'active',
       clock_timestamp(), clock_timestamp() + interval '20 days',
       '019f6000-0000-7000-8000-000000000002', 'TICKET-STANDING-4'
     ) $$,
  '23505',
  null,
  'but never two temporary ones'
);

-- Sixty idle minutes and twelve hours ---------------------------------------------------

select ok(
  access_control.has_platform_duty(
    '019f6000-0000-7000-8000-000000000001', '019f6000-0000-7000-8000-000000000022',
    'view_platform_metrics'
  ),
  'a session idle for fifty-nine minutes still carries a duty'
);

select ok(
  not access_control.has_platform_duty(
    '019f6000-0000-7000-8000-000000000001', '019f6000-0000-7000-8000-000000000023',
    'view_platform_metrics'
  ),
  'one idle for sixty-one does not'
);

select ok(
  access_control.has_platform_role(
    '019f6000-0000-7000-8000-000000000001', '019f6000-0000-7000-8000-000000000022',
    'allfit_admin'
  ),
  'the role resolves at fifty-nine idle minutes'
);

select ok(
  not access_control.has_platform_role(
    '019f6000-0000-7000-8000-000000000001', '019f6000-0000-7000-8000-000000000023',
    'allfit_admin'
  ),
  'and not at sixty-one'
);

-- A policy asks for any live session: Beta has only one, idle for sixty-one minutes.
select set_config('app.actor_person_id', '019f6000-0000-7000-8000-000000000002', true);

select ok(
  not access_control.holds_backoffice_duty('view_platform_metrics'),
  'a policy sees no duty through a session idle for sixty-one minutes'
);

insert into identity.access_sessions (
  id, access_account_id, provider_session_id, surface, token_hash, token_ciphertext,
  access_token_expires_at, assurance_level, authentication_method,
  assurance_verified_at, last_activity_at, absolute_expires_at
) values (
  '019f6000-0000-7000-8000-000000000027', '019f6000-0000-7000-8000-000000000012',
  'sid_beta_59', 'backoffice', decode(repeat('b7', 32), 'hex'), 'v1.beta_59',
  clock_timestamp() + interval '5 minutes', 2, 'password_totp',
  clock_timestamp() - interval '2 hours', clock_timestamp() - interval '59 minutes',
  clock_timestamp() + interval '6 hours'
);

select ok(
  access_control.holds_backoffice_duty('view_platform_metrics'),
  'and sees it through one idle for fifty-nine'
);

select set_config('app.actor_person_id', '', true);

select is(
  (select count(*) from identity.load_backoffice_access_session(decode(repeat('b2', 32), 'hex'))),
  1::bigint,
  'presenting a session idle for fifty-nine minutes keeps it'
);

select is(
  (select count(*) from identity.load_backoffice_access_session(decode(repeat('b3', 32), 'hex'))),
  0::bigint,
  'presenting one idle for sixty-one ends it'
);

-- Revoking the role revokes every duty -------------------------------------------------

select support.revoke_platform_role(
  '019f6000-0000-7000-8000-000000000001', '019f6000-0000-7000-8000-000000000021',
  (select id from support.platform_role_assignments
    where person_id = '019f6000-0000-7000-8000-000000000003' and status = 'active'),
  '019f6000-0000-7000-8000-000000000106', '019f6000-0000-7000-8000-000000000206',
  decode(repeat('06', 32), 'hex')
);

select is(
  (select count(*) from support.platform_duty_assignments
    where person_id = '019f6000-0000-7000-8000-000000000003'
      and status = 'revoked'
      and revoked_by_person_id = '019f6000-0000-7000-8000-000000000001'),
  13::bigint,
  'withdrawing the role revokes the thirteen duties, by whoever withdrew it'
);

select ok(
  not access_control.has_platform_duty(
    '019f6000-0000-7000-8000-000000000003', '019f6000-0000-7000-8000-000000000024',
    'approve_break_glass'
  ),
  'and the former admin holds none'
);

select * from finish();
rollback;
