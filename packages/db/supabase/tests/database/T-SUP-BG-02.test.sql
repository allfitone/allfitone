-- T-SUP-BG-02 — a requester's tray holds their own requests (`HU-BO-008` and `HU-BO-009`,
-- break-glass cycle).
--
-- The tray answered every request to anybody holding `request_break_glass`, so a
-- requester read the subject and the case reference of their colleagues' requests: who
-- was being looked at, and why, with no duty that needed it. Approving and auditing do
-- need it — an approver decides on requests that are not theirs and an auditor reviews
-- them all — so those duties keep the whole tray. A requester sees their own, whatever
-- they ask for.
--
-- Since ADR-046 every admin holds the approving and auditing duties through the role, so
-- every admin reads the whole tray, the requester included. Asking for their own still
-- answers only theirs, and a Backoffice session without the role reads no tray at all.

begin;

select plan(5);

insert into identity.people (id, given_name, family_name, status)
values
  ('019b9000-0000-7000-8000-000000000001', 'Manager', 'Alpha', 'active'),
  ('019b9000-0000-7000-8000-000000000002', 'Manager', 'Beta', 'active'),
  ('019b9000-0000-7000-8000-000000000003', 'Requester', 'Gamma', 'active'),
  ('019b9000-0000-7000-8000-000000000004', 'Approver', 'Delta', 'active'),
  ('019b9000-0000-7000-8000-000000000006', 'Subject', 'Zeta', 'active'),
  ('019b9000-0000-7000-8000-000000000007', 'Requester', 'Eta', 'active'),
  ('019b9000-0000-7000-8000-000000000008', 'Outsider', 'Theta', 'active');

insert into identity.access_accounts (id, provider, issuer, subject, person_id)
values
  ('019b9000-0000-7000-8000-000000000011', 'workos', 'https://issuer.test', 'alpha_bg2', null),
  ('019b9000-0000-7000-8000-000000000012', 'workos', 'https://issuer.test', 'beta_bg2', null),
  ('019b9000-0000-7000-8000-000000000013', 'workos', 'https://issuer.test', 'gamma_bg2',
    '019b9000-0000-7000-8000-000000000003'),
  ('019b9000-0000-7000-8000-000000000014', 'workos', 'https://issuer.test', 'delta_bg2',
    '019b9000-0000-7000-8000-000000000004'),
  ('019b9000-0000-7000-8000-000000000017', 'workos', 'https://issuer.test', 'eta_bg2',
    '019b9000-0000-7000-8000-000000000007'),
  ('019b9000-0000-7000-8000-000000000018', 'workos', 'https://issuer.test', 'theta_bg2',
    '019b9000-0000-7000-8000-000000000008');

select support.bootstrap_backoffice_administrators(
  '019b9000-0000-7000-8000-000000000001', 'alpha_bg2',
  '019b9000-0000-7000-8000-000000000002', 'beta_bg2',
  'https://issuer.test', clock_timestamp() + interval '30 days', 'CEREMONY-BG-02'
);

insert into identity.access_sessions (
  id, access_account_id, provider_session_id, surface, token_hash, token_ciphertext,
  access_token_expires_at, assurance_level, authentication_method,
  assurance_verified_at, last_activity_at, absolute_expires_at
)
select session_id, account_id, 'sid_' || suffix, 'backoffice', decode(repeat(hash_byte, 32), 'hex'),
  'v1.' || suffix, clock_timestamp() + interval '5 minutes', 2, 'password_totp',
  clock_timestamp(), clock_timestamp(), clock_timestamp() + interval '8 hours'
from (values
  ('019b9000-0000-7000-8000-000000000021'::uuid, '019b9000-0000-7000-8000-000000000011'::uuid,
    'alpha_bg2', 'f1'),
  ('019b9000-0000-7000-8000-000000000023'::uuid, '019b9000-0000-7000-8000-000000000013'::uuid,
    'gamma_bg2', 'f3'),
  ('019b9000-0000-7000-8000-000000000024'::uuid, '019b9000-0000-7000-8000-000000000014'::uuid,
    'delta_bg2', 'f4'),
  ('019b9000-0000-7000-8000-000000000027'::uuid, '019b9000-0000-7000-8000-000000000017'::uuid,
    'eta_bg2', 'f7'),
  ('019b9000-0000-7000-8000-000000000028'::uuid, '019b9000-0000-7000-8000-000000000018'::uuid,
    'theta_bg2', 'f8')
) as session_row(session_id, account_id, suffix, hash_byte);

select support.assign_platform_role(
  '019b9000-0000-7000-8000-000000000001', '019b9000-0000-7000-8000-000000000021',
  person_id, 'allfit_admin', key, command, decode(repeat(hash_byte, 32), 'hex')
)
from (values
  ('019b9000-0000-7000-8000-000000000003'::uuid, '019b9000-0000-7000-8000-000000000103'::uuid,
    '019b9000-0000-7000-8000-000000000203'::uuid, '73'),
  ('019b9000-0000-7000-8000-000000000004'::uuid, '019b9000-0000-7000-8000-000000000104'::uuid,
    '019b9000-0000-7000-8000-000000000204'::uuid, '74'),
  ('019b9000-0000-7000-8000-000000000007'::uuid, '019b9000-0000-7000-8000-000000000107'::uuid,
    '019b9000-0000-7000-8000-000000000207'::uuid, '77')
) as role_row(person_id, key, command, hash_byte);

-- Each grant converges onto the duty the role already brings.
select support.assign_platform_duty(
  '019b9000-0000-7000-8000-000000000001', '019b9000-0000-7000-8000-000000000021',
  person_id, duty_code, clock_timestamp(), clock_timestamp() + interval '30 days',
  'CASE-2026-BG2', key, command, decode(repeat(hash_byte, 32), 'hex')
)
from (values
  ('019b9000-0000-7000-8000-000000000003'::uuid, 'request_break_glass',
    '019b9000-0000-7000-8000-000000000113'::uuid, '019b9000-0000-7000-8000-000000000213'::uuid, '83'),
  ('019b9000-0000-7000-8000-000000000007'::uuid, 'request_break_glass',
    '019b9000-0000-7000-8000-000000000117'::uuid, '019b9000-0000-7000-8000-000000000217'::uuid, '87'),
  ('019b9000-0000-7000-8000-000000000004'::uuid, 'approve_break_glass',
    '019b9000-0000-7000-8000-000000000114'::uuid, '019b9000-0000-7000-8000-000000000214'::uuid, '84')
) as duty_row(person_id, duty_code, key, command, hash_byte);

-- Each requester asks for a window over the same person, on a case of their own.
select set_config('app.actor_kind', 'support', true),
       set_config('app.actor_person_id', '019b9000-0000-7000-8000-000000000003', true);
select support.request_break_glass(
  '019b9000-0000-7000-8000-000000000003', '019b9000-0000-7000-8000-000000000023',
  '019b9000-0000-7000-8000-000000000006', array['nutrition_guidance'],
  'customer_support_request', 'CASE-GAMMA-1',
  '11111111-1111-4111-8111-111111113001', '019b9000-0000-7000-8000-000000000301',
  decode(repeat('91', 32), 'hex')
);

select set_config('app.actor_person_id', '019b9000-0000-7000-8000-000000000007', true);
select support.request_break_glass(
  '019b9000-0000-7000-8000-000000000007', '019b9000-0000-7000-8000-000000000027',
  '019b9000-0000-7000-8000-000000000006', array['nutrition_guidance'],
  'customer_support_request', 'CASE-ETA-1',
  '11111111-1111-4111-8111-111111113002', '019b9000-0000-7000-8000-000000000302',
  decode(repeat('92', 32), 'hex')
);

select set_config('app.actor_person_id', '019b9000-0000-7000-8000-000000000003', true);

select is(
  (select array_agg(result->>'case_reference' order by result->>'case_reference')
   from support.list_break_glass_requests(
     '019b9000-0000-7000-8000-000000000003', '019b9000-0000-7000-8000-000000000023',
     false, null, 50
   )),
  array['CASE-ETA-1', 'CASE-GAMMA-1'],
  'a requester holds the approving duty through the role, so reads the whole tray'
);

select set_config('app.actor_person_id', '019b9000-0000-7000-8000-000000000008', true);

select throws_ok(
  $$ select * from support.list_break_glass_requests(
     '019b9000-0000-7000-8000-000000000008', '019b9000-0000-7000-8000-000000000028',
     false, null, 50
   ) $$,
  '42501',
  'reading the break-glass tray requires an effective duty',
  'a Backoffice session without the role reads no request, nor a colleague''s subject and case'
);

select set_config('app.actor_person_id', '019b9000-0000-7000-8000-000000000003', true);

select is(
  (select array_agg(result->>'case_reference')
   from support.list_break_glass_requests(
     '019b9000-0000-7000-8000-000000000003', '019b9000-0000-7000-8000-000000000023',
     true, null, 50
   )),
  array['CASE-GAMMA-1'],
  'asking for their own answers only their own request'
);

select set_config('app.actor_person_id', '019b9000-0000-7000-8000-000000000004', true);

select is(
  (select array_agg(result->>'case_reference' order by result->>'case_reference')
   from support.list_break_glass_requests(
     '019b9000-0000-7000-8000-000000000004', '019b9000-0000-7000-8000-000000000024',
     false, null, 50
   )),
  array['CASE-ETA-1', 'CASE-GAMMA-1'],
  'an approver decides on requests that are not theirs, so they read the whole tray'
);

select is(
  (select count(*)::integer
   from support.list_break_glass_requests(
     '019b9000-0000-7000-8000-000000000004', '019b9000-0000-7000-8000-000000000024',
     true, null, 50
   )),
  0,
  'and asking for their own answers the requests they made, which is none'
);

select * from finish();

rollback;
