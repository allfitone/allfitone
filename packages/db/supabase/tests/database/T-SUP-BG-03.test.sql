-- T-SUP-BG-03 — a window is exercised only open, and only from a live AAL2 Backoffice
-- session (`HU-BO-008` c6, `HU-BO-009` c6).
--
-- `support.exercise_break_glass` checks the requester, the duty on the session, the
-- window and the scope before it returns anything. The duty and window
-- checks had no assertion of their own: a revoked session, a session from another
-- surface — which can never be AAL2 for the Backoffice — a window closed by hand and one
-- past its end. Every refusal still leaves its evidence.

begin;

select plan(7);

insert into identity.people (id, given_name, family_name, status)
values
  ('019bb000-0000-7000-8000-000000000001', 'Manager', 'Alpha', 'active'),
  ('019bb000-0000-7000-8000-000000000002', 'Manager', 'Beta', 'active'),
  ('019bb000-0000-7000-8000-000000000003', 'Requester', 'Gamma', 'active'),
  ('019bb000-0000-7000-8000-000000000006', 'Subject', 'Zeta', 'active');

insert into identity.access_accounts (id, provider, issuer, subject, person_id)
values
  ('019bb000-0000-7000-8000-000000000011', 'workos', 'https://issuer.test', 'alpha_bg3', null),
  ('019bb000-0000-7000-8000-000000000012', 'workos', 'https://issuer.test', 'beta_bg3', null),
  ('019bb000-0000-7000-8000-000000000013', 'workos', 'https://issuer.test', 'gamma_bg3',
    '019bb000-0000-7000-8000-000000000003');

select support.bootstrap_backoffice_administrators(
  '019bb000-0000-7000-8000-000000000001', 'alpha_bg3',
  '019bb000-0000-7000-8000-000000000002', 'beta_bg3',
  'https://issuer.test', clock_timestamp() + interval '30 days', 'CEREMONY-BG-03'
);

insert into identity.access_sessions (
  id, access_account_id, provider_session_id, surface, token_hash, token_ciphertext,
  access_token_expires_at, assurance_level, authentication_method,
  assurance_verified_at, last_activity_at, absolute_expires_at, revoked_at
)
select session_id, account_id, 'sid_' || suffix, 'backoffice', decode(repeat(hash_byte, 32), 'hex'),
  'v1.' || suffix, clock_timestamp() + interval '5 minutes', 2, 'password_totp',
  clock_timestamp(), clock_timestamp(), clock_timestamp() + interval '8 hours', revoked
from (values
  ('019bb000-0000-7000-8000-000000000021'::uuid, '019bb000-0000-7000-8000-000000000011'::uuid,
    'alpha_bg3', 'f1', null::timestamptz),
  ('019bb000-0000-7000-8000-000000000023'::uuid, '019bb000-0000-7000-8000-000000000013'::uuid,
    'gamma_bg3', 'f3', null::timestamptz),
  -- The requester's earlier Backoffice session, already revoked.
  ('019bb000-0000-7000-8000-000000000033'::uuid, '019bb000-0000-7000-8000-000000000013'::uuid,
    'gamma_old_bg3', 'e3', clock_timestamp() - interval '1 minute')
) as session_row(session_id, account_id, suffix, hash_byte, revoked);

-- The requester's Studio session: not a Backoffice session, so never AAL2 for it.
insert into identity.access_sessions (
  id, access_account_id, provider_session_id, surface, token_hash, token_ciphertext,
  access_token_expires_at
) values (
  '019bb000-0000-7000-8000-000000000043', '019bb000-0000-7000-8000-000000000013',
  'sid_gamma_studio_bg3', 'studio', decode(repeat('a3', 32), 'hex'), 'v1.studio',
  clock_timestamp() + interval '5 minutes'
);

select support.assign_platform_role(
  '019bb000-0000-7000-8000-000000000001', '019bb000-0000-7000-8000-000000000021',
  person_id, 'allfit_admin', key, command, decode(repeat(hash_byte, 32), 'hex')
)
from (values
  ('019bb000-0000-7000-8000-000000000003'::uuid, '019bb000-0000-7000-8000-000000000103'::uuid,
    '019bb000-0000-7000-8000-000000000203'::uuid, '73')
) as role_row(person_id, key, command, hash_byte);

select support.assign_platform_duty(
  '019bb000-0000-7000-8000-000000000001', '019bb000-0000-7000-8000-000000000021',
  person_id, duty_code, clock_timestamp(), clock_timestamp() + interval '30 days',
  'CASE-2026-BG3', key, command, decode(repeat(hash_byte, 32), 'hex')
)
from (values
  ('019bb000-0000-7000-8000-000000000003'::uuid, 'request_break_glass',
    '019bb000-0000-7000-8000-000000000113'::uuid, '019bb000-0000-7000-8000-000000000213'::uuid, '83')
) as duty_row(person_id, duty_code, key, command, hash_byte);

select set_config('app.actor_kind', 'support', true),
       set_config('app.actor_person_id', '019bb000-0000-7000-8000-000000000003', true);

-- Asking opens the window (ADR-046 decision 2).
create temporary table window_file as
select (result->>'id')::uuid as id
from support.request_break_glass(
  '019bb000-0000-7000-8000-000000000003', '019bb000-0000-7000-8000-000000000023',
  '019bb000-0000-7000-8000-000000000006', array['nutrition_guidance'],
  'customer_support_request', 'CASE-2026-BG3',
  '11111111-1111-4111-8111-111111114001', '019bb000-0000-7000-8000-000000000301',
  decode(repeat('91', 32), 'hex')
);

select isnt(
  (select support.exercise_break_glass(
    '019bb000-0000-7000-8000-000000000003', '019bb000-0000-7000-8000-000000000023',
    (select id from window_file), 'nutrition_guidance', 'nutrition.guidance_notes', null
  )->>'outcome'),
  'denied',
  'the requester, on a live Backoffice session, reaches the open window'
);

select is(
  (select support.exercise_break_glass(
    '019bb000-0000-7000-8000-000000000003', '019bb000-0000-7000-8000-000000000033',
    (select id from window_file), 'nutrition_guidance', 'nutrition.guidance_notes', null
  )->>'reason_code'),
  'duty_not_effective',
  'a revoked session carries no duty, so it reaches nothing'
);

select is(
  (select support.exercise_break_glass(
    '019bb000-0000-7000-8000-000000000003', '019bb000-0000-7000-8000-000000000043',
    (select id from window_file), 'nutrition_guidance', 'nutrition.guidance_notes', null
  )->>'reason_code'),
  'duty_not_effective',
  'nor does a session from another surface, which is never AAL2 for the Backoffice'
);

select is(
  support.effective_break_glass_status(
    'approved', clock_timestamp() + interval '1 hour', clock_timestamp() - interval '1 second'
  ) = 'approved',
  false,
  'a window past its end is no longer an open window, whatever its stored status'
);

select support.close_break_glass(
  '019bb000-0000-7000-8000-000000000003', '019bb000-0000-7000-8000-000000000023',
  (select id from window_file),
  '11111111-1111-4111-8111-111111114003', '019bb000-0000-7000-8000-000000000303',
  decode(repeat('93', 32), 'hex')
);

select is(
  (select support.exercise_break_glass(
    '019bb000-0000-7000-8000-000000000003', '019bb000-0000-7000-8000-000000000023',
    (select id from window_file), 'nutrition_guidance', 'nutrition.guidance_notes', null
  )->>'reason_code'),
  'window_not_open',
  'a window closed by hand is not exercised, even by its requester on a live session'
);

select is(
  (select array_agg(reason_code order by reason_code) from support.break_glass_events
    where request_id = (select id from window_file) and result = 'denied'),
  array['duty_not_effective', 'duty_not_effective', 'window_not_open'],
  'every refusal is recorded with its reason'
);

select is(
  (select count(*)::integer from privacy.access_events
    where subject_person_id = '019bb000-0000-7000-8000-000000000006'
      and access_mode = 'break_glass'::privacy.access_mode and result = 'denied'),
  3,
  'and the person sees each refused attempt in their own trail'
);

select * from finish();

rollback;
