-- T-SUP-RECERT-01 — OP-SUP-010: recertifying a duty, and windows that close with it.
--
-- `HU-BO-028` criteria 4 and 5, `HU-BO-029` criterion 2. ADR-028 asks every duty for an
-- independent, quarterly recertification by security and privacy. The columns existed
-- and nothing wrote them, so «última recertificación» was always empty.
--
-- Criterion 5 asked more than the duty commands did: withdrawing the base role and a
-- duty running out of time must also close the requester's break-glass windows. Both
-- left them `approved` until their own end. A lapsed window could not be exercised,
-- because exercising rechecks the duty, but the inbox said it was open.
--
-- Since ADR-046 an admin holds every duty through the role, and those follow the role:
-- they are neither recertified nor lapse. What is recertified, and what lapses, is a duty
-- granted on its own (`basis = 'granted'`), as production still holds.

begin;

select plan(13);

insert into identity.people (id, given_name, family_name, status)
values
  ('019a8100-0000-7000-8000-000000000001', 'Manager', 'Alpha', 'active'),
  ('019a8100-0000-7000-8000-000000000002', 'Manager', 'Beta', 'active'),
  ('019a8100-0000-7000-8000-000000000003', 'Requester', 'Gamma', 'active'),
  ('019a8100-0000-7000-8000-000000000004', 'Approver', 'Delta', 'active'),
  ('019a8100-0000-7000-8000-000000000006', 'Subject', 'Zeta', 'active'),
  ('019a8100-0000-7000-8000-000000000007', 'Requester', 'Eta', 'active'),
  ('019a8100-0000-7000-8000-000000000008', 'Outsider', 'Theta', 'active');

insert into identity.access_accounts (id, provider, issuer, subject, person_id)
values
  ('019a8100-0000-7000-8000-000000000011', 'workos', 'https://issuer.test', 'alpha81', null),
  ('019a8100-0000-7000-8000-000000000012', 'workos', 'https://issuer.test', 'beta81', null),
  ('019a8100-0000-7000-8000-000000000013', 'workos', 'https://issuer.test', 'gamma81',
    '019a8100-0000-7000-8000-000000000003'),
  ('019a8100-0000-7000-8000-000000000014', 'workos', 'https://issuer.test', 'delta81',
    '019a8100-0000-7000-8000-000000000004'),
  ('019a8100-0000-7000-8000-000000000017', 'workos', 'https://issuer.test', 'eta81',
    '019a8100-0000-7000-8000-000000000007'),
  ('019a8100-0000-7000-8000-000000000018', 'workos', 'https://issuer.test', 'theta81',
    '019a8100-0000-7000-8000-000000000008');

select support.bootstrap_backoffice_administrators(
  '019a8100-0000-7000-8000-000000000001', 'alpha81',
  '019a8100-0000-7000-8000-000000000002', 'beta81',
  'https://issuer.test', clock_timestamp() + interval '30 days', 'CEREMONY-RECERT-01'
);

insert into identity.access_sessions (
  id, access_account_id, provider_session_id, surface, token_hash, token_ciphertext,
  access_token_expires_at, assurance_level, authentication_method,
  assurance_verified_at, last_activity_at, absolute_expires_at
)
select
  session_id, account_id, 'sid_' || suffix, 'backoffice', decode(repeat(hash_byte, 32), 'hex'),
  'v1.' || suffix, clock_timestamp() + interval '5 minutes', 2, 'password_totp',
  clock_timestamp(), clock_timestamp(), clock_timestamp() + interval '8 hours'
from (values
  ('019a8100-0000-7000-8000-000000000021'::uuid, '019a8100-0000-7000-8000-000000000011'::uuid,
    'alpha81', 'a1'),
  ('019a8100-0000-7000-8000-000000000023'::uuid, '019a8100-0000-7000-8000-000000000013'::uuid,
    'gamma81', 'a3'),
  ('019a8100-0000-7000-8000-000000000024'::uuid, '019a8100-0000-7000-8000-000000000014'::uuid,
    'delta81', 'a4'),
  ('019a8100-0000-7000-8000-000000000027'::uuid, '019a8100-0000-7000-8000-000000000017'::uuid,
    'eta81', 'a7'),
  ('019a8100-0000-7000-8000-000000000028'::uuid, '019a8100-0000-7000-8000-000000000018'::uuid,
    'theta81', 'a8')
) as session_row(session_id, account_id, suffix, hash_byte);

select support.assign_platform_role(
  '019a8100-0000-7000-8000-000000000001', '019a8100-0000-7000-8000-000000000021',
  person_id, 'allfit_admin', key, command, decode(repeat(hash_byte, 32), 'hex')
)
from (values
  ('019a8100-0000-7000-8000-000000000003'::uuid, '019a8100-0000-7000-8000-000000000103'::uuid,
    '019a8100-0000-7000-8000-000000000203'::uuid, '63'),
  ('019a8100-0000-7000-8000-000000000004'::uuid, '019a8100-0000-7000-8000-000000000104'::uuid,
    '019a8100-0000-7000-8000-000000000204'::uuid, '64'),
  ('019a8100-0000-7000-8000-000000000007'::uuid, '019a8100-0000-7000-8000-000000000107'::uuid,
    '019a8100-0000-7000-8000-000000000207'::uuid, '67')
) as grant_row(person_id, key, command, hash_byte);

-- Granting an admin converges on the duty the role brings, so the granted duties this
-- test recertifies and lapses are written as the ones production already holds.
insert into support.platform_duty_assignments (
  person_id, duty_code, actor_mode, status, valid_from, valid_to,
  granted_by_person_id, reason_code
)
select person_id, duty_code, actor_mode, 'active', clock_timestamp(),
  clock_timestamp() + interval '30 days', '019a8100-0000-7000-8000-000000000001', 'CASE-2026-081'
from (values
  ('019a8100-0000-7000-8000-000000000003'::uuid, 'request_break_glass', 'A10'),
  ('019a8100-0000-7000-8000-000000000004'::uuid, 'approve_break_glass', 'A12'),
  ('019a8100-0000-7000-8000-000000000007'::uuid, 'request_break_glass', 'A10'),
  ('019a8100-0000-7000-8000-000000000007'::uuid, 'view_platform_metrics', 'A10')
) as duty_row(person_id, duty_code, actor_mode);

create temporary table duty on commit drop as
select assignment.person_id, assignment.duty_code, assignment.basis, assignment.id
from support.platform_duty_assignments as assignment;

select set_config('app.actor_kind', 'support', true),
       set_config('app.actor_person_id', '019a8100-0000-7000-8000-000000000001', true);

-- ---------------------------------------------------------------------------
-- Recertifying (HU-BO-028 c4, HU-BO-029 c2)
-- ---------------------------------------------------------------------------

create temporary table recertified on commit drop as
select * from support.recertify_platform_duty(
  '019a8100-0000-7000-8000-000000000001', '019a8100-0000-7000-8000-000000000021',
  (select id from duty where person_id = '019a8100-0000-7000-8000-000000000003'
     and duty_code = 'request_break_glass' and basis = 'granted'),
  'c1000000-0000-4000-8000-000000000001', '019a8100-0000-7000-8000-000000000301',
  decode(repeat('91', 32), 'hex')
);

select ok(
  (select result->>'recertified_by_person_id' = '019a8100-0000-7000-8000-000000000001'
     and result->>'recertified_at' is not null and not replayed
   from recertified),
  'T-SUP-RECERT-INT-01 a manager recertifies somebody else''s duty, and it says who and when'
);

select is(
  (select replayed from support.recertify_platform_duty(
     '019a8100-0000-7000-8000-000000000001', '019a8100-0000-7000-8000-000000000021',
     (select id from duty where person_id = '019a8100-0000-7000-8000-000000000003'
        and duty_code = 'request_break_glass' and basis = 'granted'),
     'c1000000-0000-4000-8000-000000000001', '019a8100-0000-7000-8000-000000000301',
     decode(repeat('91', 32), 'hex')
   )),
  true,
  'T-SUP-RECERT-IDEM-01 the same command answers from its receipt'
);

select throws_ok(
  $$ select * from support.recertify_platform_duty(
    '019a8100-0000-7000-8000-000000000001', '019a8100-0000-7000-8000-000000000021',
    (select id from duty where person_id = '019a8100-0000-7000-8000-000000000001'
       and duty_code = 'manage_platform_access'),
    'c1000000-0000-4000-8000-000000000002', '019a8100-0000-7000-8000-000000000302',
    decode(repeat('92', 32), 'hex')
  ) $$,
  '42501',
  null,
  'T-SUP-RECERT-RLS-01 nobody recertifies their own duty: recertification is independent'
);

-- Every admin holds the access-management duty through the role; Theta has a Backoffice
-- session and no role.
select throws_ok(
  $$ select * from support.recertify_platform_duty(
    '019a8100-0000-7000-8000-000000000008', '019a8100-0000-7000-8000-000000000028',
    (select id from duty where person_id = '019a8100-0000-7000-8000-000000000004'
       and basis = 'granted'),
    'c1000000-0000-4000-8000-000000000003', '019a8100-0000-7000-8000-000000000303',
    decode(repeat('93', 32), 'hex')
  ) $$,
  '42501',
  null,
  'T-SUP-RECERT-RLS-02 recertifying needs the access-management duty, which a session without the role lacks'
);

select support.revoke_platform_duty(
  '019a8100-0000-7000-8000-000000000001', '019a8100-0000-7000-8000-000000000021',
  (select id from duty where duty_code = 'view_platform_metrics' and basis = 'granted'),
  'c1000000-0000-4000-8000-000000000004', '019a8100-0000-7000-8000-000000000304',
  decode(repeat('94', 32), 'hex')
);

select throws_ok(
  $$ select * from support.recertify_platform_duty(
    '019a8100-0000-7000-8000-000000000001', '019a8100-0000-7000-8000-000000000021',
    (select id from duty where duty_code = 'view_platform_metrics' and basis = 'granted'),
    'c1000000-0000-4000-8000-000000000005', '019a8100-0000-7000-8000-000000000305',
    decode(repeat('95', 32), 'hex')
  ) $$,
  '23514',
  null,
  'T-SUP-RECERT-INT-02 a duty no longer in force is not recertified: it is granted again'
);

-- Each request is its own transaction in production; checking the duty-role rule now
-- keeps the recertification apart from the role withdrawal below.
set constraints support.trg_platform_duty_assignments_change_require_role immediate;
set constraints support.trg_platform_duty_assignments_change_require_role deferred;

-- ---------------------------------------------------------------------------
-- Withdrawing the base role closes the requester's windows (HU-BO-028 c5)
-- ---------------------------------------------------------------------------

-- Asking opens the window (ADR-046 decision 2).
create temporary table gamma_window on commit drop as
select result from support.request_break_glass(
  '019a8100-0000-7000-8000-000000000003', '019a8100-0000-7000-8000-000000000023',
  '019a8100-0000-7000-8000-000000000006', array['relationship_training'],
  'customer_support_request', 'CASE-2026-082',
  'c1000000-0000-4000-8000-000000000006', '019a8100-0000-7000-8000-000000000306',
  decode(repeat('96', 32), 'hex')
);

select support.revoke_platform_role(
  '019a8100-0000-7000-8000-000000000001', '019a8100-0000-7000-8000-000000000021',
  (select id from support.platform_role_assignments
   where person_id = '019a8100-0000-7000-8000-000000000003' and status = 'active'),
  'c1000000-0000-4000-8000-000000000008', '019a8100-0000-7000-8000-000000000308',
  decode(repeat('98', 32), 'hex')
);

select ok(
  (select status = 'closed' and closed_at is not null from support.break_glass_requests
   where id = (select (result->>'id')::uuid from gamma_window)),
  'T-SUP-RECERT-INT-03 withdrawing the base role closes the window the requester had open'
);

-- ---------------------------------------------------------------------------
-- A duty that runs out of time lapses, and closes its windows (HU-BO-028 c5)
-- ---------------------------------------------------------------------------

create temporary table eta_window on commit drop as
select result from support.request_break_glass(
  '019a8100-0000-7000-8000-000000000007', '019a8100-0000-7000-8000-000000000027',
  '019a8100-0000-7000-8000-000000000006', array['relationship_training'],
  'customer_support_request', 'CASE-2026-083',
  'c1000000-0000-4000-8000-000000000009', '019a8100-0000-7000-8000-000000000309',
  decode(repeat('99', 32), 'hex')
);

-- The worker may close an open window and nothing else.
select set_config('test.eta_window', (select result->>'id' from eta_window), true),
       set_config('app.actor_kind', 'worker', true);
set local role allfit_owner;
select throws_ok(
  $$ update support.break_glass_requests
     set window_ends_at = window_ends_at + interval '1 hour'
     where id = current_setting('test.eta_window')::uuid $$,
  '42501',
  null,
  'T-SUP-RECERT-RLS-04 the worker cannot keep a window open, only close it'
);
reset role;
select set_config('app.actor_kind', 'support', true);

-- The clock moves for one assignment only; its window guard is the test's to lift.
select set_config('test.eta_duty', (select id::text from duty
  where person_id = '019a8100-0000-7000-8000-000000000007' and duty_code = 'request_break_glass'
    and basis = 'granted'), true);
set constraints support.trg_platform_duty_assignments_change_require_role immediate;
set constraints support.trg_platform_duty_assignments_change_require_role deferred;
set local role allfit_owner;
alter table support.platform_duty_assignments disable trigger user;
update support.platform_duty_assignments
set valid_from = clock_timestamp() - interval '31 days',
    valid_to = clock_timestamp() - interval '1 minute'
where id = current_setting('test.eta_duty')::uuid;
alter table support.platform_duty_assignments enable trigger user;
reset role;

-- The sweep runs from the worker, under its own actor and nobody else's.
select set_config('app.actor_kind', 'worker', true),
       set_config('app.actor_person_id', '', true);

select is(
  support.lapse_platform_duties(),
  1,
  'T-SUP-RECERT-INT-04 the sweep lapses the one duty whose window has passed'
);

select is(
  (select status from support.platform_duty_assignments
   where id = (select id from duty where person_id = '019a8100-0000-7000-8000-000000000007'
                 and duty_code = 'request_break_glass' and basis = 'granted')),
  'expired',
  'T-SUP-RECERT-INT-05 and the row says expired, not only the clock'
);

-- The window was opened under the duty the role brings, which is still in force: the
-- sweep closes windows only when no assignment of `request_break_glass` is left.
select ok(
  (select status = 'approved' and closed_at is null from support.break_glass_requests
   where id = (select (result->>'id')::uuid from eta_window)),
  'T-SUP-RECERT-INT-06 its requester''s window stays open while the role still brings the duty'
);

select is(
  (select status from support.platform_duty_assignments
   where id = (select id from duty where person_id = '019a8100-0000-7000-8000-000000000004'
                 and basis = 'granted')),
  'active',
  'T-SUP-RECERT-INT-07 a duty still in force is left alone'
);

select is(
  support.lapse_platform_duties(),
  0,
  'T-SUP-RECERT-IDEM-02 sweeping again finds nothing left to lapse'
);

-- ---------------------------------------------------------------------------
-- Minimal grants
-- ---------------------------------------------------------------------------

select ok(
  has_function_privilege(
    'allfit_api',
    'support.recertify_platform_duty(uuid,uuid,uuid,uuid,uuid,bytea)',
    'EXECUTE'
  )
    and has_function_privilege('allfit_api', 'support.lapse_platform_duties()', 'EXECUTE')
    and not has_function_privilege(
      'public', 'support.recertify_platform_duty(uuid,uuid,uuid,uuid,uuid,bytea)', 'EXECUTE'
    ),
  'T-SUP-RECERT-RLS-03 the runtime role runs the command and the sweep; nobody else does'
);

select * from finish();
rollback;
