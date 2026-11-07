-- T-SUP-BG-SELF-01 — an administrator opens their own break-glass window (ADR-046 decision 2).
--
-- Two administrators never had the two approvers besides the requester that a restricted
-- window needed, and a standard one waited on the other administrator. Asking now opens the
-- window: sixty minutes, whatever the tier. What protected the person stays: a closed
-- purpose and a case, never over your own data, forbidden categories never open, every
-- read is evidence before content, and somebody other than the requester reviews it.

begin;

select plan(25);

insert into identity.people (id, given_name, family_name)
values
  ('019f7000-0000-7000-8000-000000000001', 'Admin', 'Alpha'),
  ('019f7000-0000-7000-8000-000000000002', 'Admin', 'Beta'),
  ('019f7000-0000-7000-8000-000000000003', 'Subject', 'Sigma'),
  ('019f7000-0000-7000-8000-000000000004', 'Outsider', 'Delta');

insert into identity.access_accounts (id, provider, issuer, subject, person_id)
values
  ('019f7000-0000-7000-8000-000000000011', 'workos', 'https://issuer.test', 'alpha', null),
  ('019f7000-0000-7000-8000-000000000012', 'workos', 'https://issuer.test', 'beta', null),
  ('019f7000-0000-7000-8000-000000000014', 'workos', 'https://issuer.test', 'delta',
    '019f7000-0000-7000-8000-000000000004');

select support.bootstrap_backoffice_administrators(
  '019f7000-0000-7000-8000-000000000001', 'alpha',
  '019f7000-0000-7000-8000-000000000002', 'beta',
  'https://issuer.test', null, 'CEREMONY-BG-SELF-01'
);

insert into identity.access_sessions (
  id, access_account_id, provider_session_id, surface, token_hash, token_ciphertext,
  access_token_expires_at, assurance_level, authentication_method,
  assurance_verified_at, last_activity_at, absolute_expires_at
)
select session_id, account_id, 'sid_' || suffix, 'backoffice',
  decode(repeat(hash_byte, 32), 'hex'), 'v1.' || suffix,
  clock_timestamp() + interval '5 minutes', 2, 'password_totp',
  clock_timestamp(), clock_timestamp(), clock_timestamp() + interval '6 hours'
from (values
  ('019f7000-0000-7000-8000-000000000021'::uuid, '019f7000-0000-7000-8000-000000000011'::uuid,
    'alpha', 'c1'),
  ('019f7000-0000-7000-8000-000000000022'::uuid, '019f7000-0000-7000-8000-000000000012'::uuid,
    'beta', 'c2'),
  ('019f7000-0000-7000-8000-000000000024'::uuid, '019f7000-0000-7000-8000-000000000014'::uuid,
    'delta', 'c4')
) as session_row(session_id, account_id, suffix, hash_byte);

select set_config('app.actor_kind', 'support', true),
       set_config('app.actor_person_id', '019f7000-0000-7000-8000-000000000001', true);

-- Asking opens the window ------------------------------------------------------------

select is(
  (select result ->> 'status' from support.request_break_glass(
    '019f7000-0000-7000-8000-000000000001', '019f7000-0000-7000-8000-000000000021',
    '019f7000-0000-7000-8000-000000000003', array['nutrition_guidance'], 'customer_support_request',
    'CASE-2026-S01', '019f7000-0000-7000-8000-000000000101',
    '019f7000-0000-7000-8000-000000000201', decode(repeat('01', 32), 'hex')
  )),
  'approved',
  'asking for a standard window opens it'
);

select is(
  (select result ->> 'status' from support.request_break_glass(
    '019f7000-0000-7000-8000-000000000001', '019f7000-0000-7000-8000-000000000021',
    '019f7000-0000-7000-8000-000000000003', array['health_context'], 'customer_support_request',
    'CASE-2026-S02', '019f7000-0000-7000-8000-000000000102',
    '019f7000-0000-7000-8000-000000000202', decode(repeat('02', 32), 'hex')
  )),
  'approved',
  'and a restricted one too, with nobody else to approve it'
);

select is(
  (select array_agg(distinct sensitivity_tier::text order by sensitivity_tier::text)
    from support.break_glass_requests
    where requester_person_id = '019f7000-0000-7000-8000-000000000001'),
  array['restricted', 'standard'],
  'one window of each tier'
);

select ok(
  (select bool_and(
      required_approvals = 0
      and requested_duration_minutes = 60
      and window_ends_at = window_starts_at + interval '60 minutes'
      and window_starts_at = requested_at)
    from support.break_glass_requests
    where requester_person_id = '019f7000-0000-7000-8000-000000000001'),
  'every window needs no approval and lasts sixty minutes from the moment it is asked for'
);

select is(
  (select count(*) from support.break_glass_approvals as approval
    join support.break_glass_requests as file on file.id = approval.request_id
    where file.requester_person_id = '019f7000-0000-7000-8000-000000000001'),
  0::bigint,
  'and no approval is recorded, because none happened'
);

select is(
  (select count(*) from system.outbox_events
    where aggregate_type = 'break_glass_request'
      and event_type = 'support.break_glass_window_opened.v1'
      and aggregate_id in (
        select id from support.break_glass_requests
        where requester_person_id = '019f7000-0000-7000-8000-000000000001'
      )),
  2::bigint,
  'each opening is announced once'
);

select is(
  (select result -> 'approvals' from support.request_break_glass(
    '019f7000-0000-7000-8000-000000000001', '019f7000-0000-7000-8000-000000000021',
    '019f7000-0000-7000-8000-000000000003', array['nutrition_guidance'], 'customer_support_request',
    'CASE-2026-S01', '019f7000-0000-7000-8000-000000000101',
    '019f7000-0000-7000-8000-000000000201', decode(repeat('01', 32), 'hex')
  )),
  '[]'::jsonb,
  'repeating the command answers the same open window'
);

select is(
  (select count(*) from support.break_glass_requests
    where case_reference = 'CASE-2026-S01'),
  1::bigint,
  'and opens no second one'
);

-- The window is used, and the use is evidence before content.
select is(
  (select support.exercise_break_glass(
    '019f7000-0000-7000-8000-000000000001', '019f7000-0000-7000-8000-000000000021',
    (select id from support.break_glass_requests where case_reference = 'CASE-2026-S01'),
    'nutrition_guidance', 'nutrition.guidance_notes', null
  ) ->> 'outcome'),
  'content_unavailable',
  'the requester exercises the window at once; this category has nothing to show yet'
);

select is(
  (select result from support.break_glass_events
    where request_id = (
      select id from support.break_glass_requests where case_reference = 'CASE-2026-S01'
    )),
  'allowed',
  'and the attempt is recorded as allowed before anything is answered'
);

select is(
  (select count(*) from privacy.access_events
    where subject_person_id = '019f7000-0000-7000-8000-000000000003'
      and actor_person_id = '019f7000-0000-7000-8000-000000000001'),
  1::bigint,
  'and the person can see that read in her history'
);

-- What protected the person stays ----------------------------------------------------

select throws_ok(
  $$ select * from support.request_break_glass(
    '019f7000-0000-7000-8000-000000000001', '019f7000-0000-7000-8000-000000000021',
    '019f7000-0000-7000-8000-000000000003', array['nutrition_media'], 'customer_support_request',
    'CASE-2026-S03', '019f7000-0000-7000-8000-000000000103',
    '019f7000-0000-7000-8000-000000000203', decode(repeat('03', 32), 'hex')
  ) $$,
  '42501',
  null,
  'a forbidden category still never opens'
);

select throws_ok(
  $$ select * from support.request_break_glass(
    '019f7000-0000-7000-8000-000000000001', '019f7000-0000-7000-8000-000000000021',
    '019f7000-0000-7000-8000-000000000001', array['nutrition_guidance'], 'customer_support_request',
    'CASE-2026-S04', '019f7000-0000-7000-8000-000000000104',
    '019f7000-0000-7000-8000-000000000204', decode(repeat('04', 32), 'hex')
  ) $$,
  '42501',
  'a break-glass window is never opened over your own data',
  'nor over your own data'
);

select throws_ok(
  $$ select * from support.request_break_glass(
    '019f7000-0000-7000-8000-000000000001', '019f7000-0000-7000-8000-000000000021',
    '019f7000-0000-7000-8000-000000000003', array['nutrition_guidance'], 'not_a_purpose',
    'CASE-2026-S05', '019f7000-0000-7000-8000-000000000105',
    '019f7000-0000-7000-8000-000000000205', decode(repeat('05', 32), 'hex')
  ) $$,
  '22P02',
  null,
  'the purpose is still one of the closed list'
);

select throws_ok(
  $$ select * from support.request_break_glass(
    '019f7000-0000-7000-8000-000000000001', '019f7000-0000-7000-8000-000000000021',
    '019f7000-0000-7000-8000-000000000003', array['nutrition_guidance'], 'customer_support_request',
    'free text case', '019f7000-0000-7000-8000-000000000106',
    '019f7000-0000-7000-8000-000000000206', decode(repeat('06', 32), 'hex')
  ) $$,
  '23514',
  null,
  'and it still names a traceable case'
);

select throws_ok(
  $$ select * from support.request_break_glass(
    '019f7000-0000-7000-8000-000000000004', '019f7000-0000-7000-8000-000000000024',
    '019f7000-0000-7000-8000-000000000003', array['nutrition_guidance'], 'customer_support_request',
    'CASE-2026-S07', '019f7000-0000-7000-8000-000000000107',
    '019f7000-0000-7000-8000-000000000207', decode(repeat('07', 32), 'hex')
  ) $$,
  '42501',
  null,
  'a Backoffice session without the admin role opens nothing'
);

select hasnt_function(
  'support', 'decide_break_glass',
  'the approval step is gone: there is nobody to wait for'
);

select ok(
  not (support.break_glass_viewer_projection(
    (select id from support.break_glass_requests where case_reference = 'CASE-2026-S02'),
    '019f7000-0000-7000-8000-000000000002'
  ) ? 'viewer_can_decide'),
  'and the tray no longer offers anybody a decision'
);

-- Somebody else reviews it -----------------------------------------------------------

select support.close_break_glass(
  '019f7000-0000-7000-8000-000000000001', '019f7000-0000-7000-8000-000000000021',
  (select id from support.break_glass_requests where case_reference = 'CASE-2026-S01'),
  '019f7000-0000-7000-8000-000000000108', '019f7000-0000-7000-8000-000000000208',
  decode(repeat('08', 32), 'hex')
);

select throws_ok(
  $$ select * from support.review_break_glass(
    '019f7000-0000-7000-8000-000000000001', '019f7000-0000-7000-8000-000000000021',
    (select id from support.break_glass_requests where case_reference = 'CASE-2026-S01'),
    'justified', '019f7000-0000-7000-8000-000000000109',
    '019f7000-0000-7000-8000-000000000209', decode(repeat('09', 32), 'hex')
  ) $$,
  '42501',
  null,
  'whoever opened the window does not review it'
);

select set_config('app.actor_person_id', '019f7000-0000-7000-8000-000000000002', true);

select is(
  (select result ->> 'review_outcome' from support.review_break_glass(
    '019f7000-0000-7000-8000-000000000002', '019f7000-0000-7000-8000-000000000022',
    (select id from support.break_glass_requests where case_reference = 'CASE-2026-S01'),
    'justified', '019f7000-0000-7000-8000-000000000110',
    '019f7000-0000-7000-8000-000000000210', decode(repeat('10', 32), 'hex')
  )),
  'justified',
  'the other administrator does'
);

-- The windows opened before keep their own rules ---------------------------------------

select lives_ok(
  $$ insert into support.break_glass_requests (
       requester_person_id, requester_duty_assignment_id, subject_person_id, categories,
       purpose, case_reference, sensitivity_tier, required_approvals,
       requested_duration_minutes, requested_at, request_expires_at
     ) select '019f7000-0000-7000-8000-000000000001', id,
       '019f7000-0000-7000-8000-000000000003', array['nutrition_guidance'], 'customer_support_request',
       'CASE-2026-S11', 'standard', 1, 30, now(),
       now() + interval '30 minutes'
     from support.platform_duty_assignments
     where person_id = '019f7000-0000-7000-8000-000000000001'
       and duty_code = 'request_break_glass' $$,
  'a standard request from before, with one approval and thirty minutes, is still a valid row'
);

select lives_ok(
  $$ insert into support.break_glass_requests (
       requester_person_id, requester_duty_assignment_id, subject_person_id, categories,
       purpose, case_reference, sensitivity_tier, required_approvals,
       requested_duration_minutes, requested_at, request_expires_at
     ) select '019f7000-0000-7000-8000-000000000001', id,
       '019f7000-0000-7000-8000-000000000003', array['health_context'], 'customer_support_request',
       'CASE-2026-S12', 'restricted', 2, 15, now(),
       now() + interval '30 minutes'
     from support.platform_duty_assignments
     where person_id = '019f7000-0000-7000-8000-000000000001'
       and duty_code = 'request_break_glass' $$,
  'and so is a restricted one with two approvals and fifteen minutes'
);

select lives_ok(
  $$ update support.break_glass_requests set status = 'expired'
     where case_reference = 'CASE-2026-S11' $$,
  'a request from before still moves to its end'
);

select throws_ok(
  $$ insert into support.break_glass_requests (
       requester_person_id, requester_duty_assignment_id, subject_person_id, categories,
       purpose, case_reference, sensitivity_tier, required_approvals,
       requested_duration_minutes, requested_at, request_expires_at
     ) select '019f7000-0000-7000-8000-000000000001', id,
       '019f7000-0000-7000-8000-000000000003', array['health_context'], 'customer_support_request',
       'CASE-2026-S13', 'restricted', 0, 15, now(),
       now() + interval '30 minutes'
     from support.platform_duty_assignments
     where person_id = '019f7000-0000-7000-8000-000000000001'
       and duty_code = 'request_break_glass' $$,
  '23514',
  null,
  'but a mixture of the two rules is not'
);

select throws_ok(
  $$ insert into support.break_glass_requests (
       requester_person_id, requester_duty_assignment_id, subject_person_id, categories,
       purpose, case_reference, sensitivity_tier, required_approvals,
       requested_duration_minutes, requested_at, request_expires_at
     ) select '019f7000-0000-7000-8000-000000000001', id,
       '019f7000-0000-7000-8000-000000000003', array['health_context'], 'customer_support_request',
       'CASE-2026-S14', 'restricted', 0, 90, now(),
       now() + interval '30 minutes'
     from support.platform_duty_assignments
     where person_id = '019f7000-0000-7000-8000-000000000001'
       and duty_code = 'request_break_glass' $$,
  '23514',
  null,
  'nor a window longer than sixty minutes'
);

select * from finish();
rollback;
