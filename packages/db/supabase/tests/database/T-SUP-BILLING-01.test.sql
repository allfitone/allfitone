-- T-SUP-BILLING-01 — NEW-SUP-BILLING-FOLLOW-UP: the charges to follow up
-- (`HU-BO-005` c1 and c5, `HU-BO-020` c3 and c4).
--
-- The attention panel counts failed charges and suspended subscriptions, and the count
-- led nowhere: a person's payments opened only for somebody whose identifier was
-- already known. This is the list the count stands for.
--
-- **It names payers, so it is a billing read.** `view_billing_metadata` (every admin holds
-- it through the role, ADR-046; a session without the role does not), a case that is
-- traceable when given, as for one person's payments (`HU-BO-020` c4; optional since
-- ADR-046 decision 5), and one access record per person listed, written before the list
-- travels.
--
-- **Only what needs following up.** A suspended subscription, one in its grace period,
-- or a charge that failed in the last thirty days. A failure from two months ago and a
-- person whose charges all went through are not on it.
--
-- **Nothing a store could be asked with.** No subscription reference and no transaction
-- id: the row says who, what state, since when and why the last charge failed.

begin;

select plan(14);

insert into identity.people (id, given_name, family_name, status)
values
  ('019b4000-0000-7000-8000-000000000001', 'Manager', 'Alpha', 'active'),
  ('019b4000-0000-7000-8000-000000000002', 'Manager', 'Beta', 'active'),
  ('019b4000-0000-7000-8000-000000000003', 'Billing', 'Gamma', 'active'),
  ('019b4000-0000-7000-8000-000000000004', 'Outsider', 'Delta', 'active'),
  ('019b4000-0000-7000-8000-000000000011', 'Suscripcion', 'Suspendida', 'active'),
  ('019b4000-0000-7000-8000-000000000012', 'En', 'Gracia', 'active'),
  ('019b4000-0000-7000-8000-000000000013', 'Cobro', 'Fallido', 'active'),
  ('019b4000-0000-7000-8000-000000000014', 'Fallo', 'Viejo', 'active'),
  ('019b4000-0000-7000-8000-000000000015', 'Paga', 'Bien', 'active');

insert into identity.access_accounts (id, provider, issuer, subject, person_id)
values
  ('019b4000-0000-7000-8000-000000000021', 'workos', 'https://issuer.test', 'alpha_fu', null),
  ('019b4000-0000-7000-8000-000000000022', 'workos', 'https://issuer.test', 'beta_fu', null),
  ('019b4000-0000-7000-8000-000000000023', 'workos', 'https://issuer.test', 'gamma_fu',
    '019b4000-0000-7000-8000-000000000003'),
  ('019b4000-0000-7000-8000-000000000024', 'workos', 'https://issuer.test', 'delta_fu',
    '019b4000-0000-7000-8000-000000000004');

select support.bootstrap_backoffice_administrators(
  '019b4000-0000-7000-8000-000000000001', 'alpha_fu',
  '019b4000-0000-7000-8000-000000000002', 'beta_fu',
  'https://issuer.test', clock_timestamp() + interval '30 days', 'CEREMONY-SUP-BILLING-01'
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
  ('019b4000-0000-7000-8000-000000000041'::uuid, '019b4000-0000-7000-8000-000000000021'::uuid,
    'alpha_fu', 'd1'),
  ('019b4000-0000-7000-8000-000000000043'::uuid, '019b4000-0000-7000-8000-000000000023'::uuid,
    'gamma_fu', 'd3'),
  ('019b4000-0000-7000-8000-000000000044'::uuid, '019b4000-0000-7000-8000-000000000024'::uuid,
    'delta_fu', 'd4')
) as session_row(session_id, account_id, suffix, hash_byte);

select support.assign_platform_role(
  '019b4000-0000-7000-8000-000000000001', '019b4000-0000-7000-8000-000000000041',
  person_id, 'allfit_admin', key, command, decode(repeat(hash_byte, 32), 'hex')
)
from (values
  ('019b4000-0000-7000-8000-000000000003'::uuid, '019b4000-0000-7000-8000-000000000103'::uuid,
    '019b4000-0000-7000-8000-000000000203'::uuid, '73')
) as role_row(person_id, key, command, hash_byte);

-- Delta keeps a live Backoffice session and is never granted the role.
-- Converges onto the duty the role already brings.
select support.assign_platform_duty(
  '019b4000-0000-7000-8000-000000000001', '019b4000-0000-7000-8000-000000000041',
  person_id, duty_code, clock_timestamp(), clock_timestamp() + interval '30 days',
  'CASE-2026-FU', key, command, decode(repeat(hash_byte, 32), 'hex')
)
from (values
  ('019b4000-0000-7000-8000-000000000003'::uuid, 'view_billing_metadata',
    '019b4000-0000-7000-8000-000000000113'::uuid, '019b4000-0000-7000-8000-000000000213'::uuid,
    '83')
) as duty_row(person_id, duty_code, key, command, hash_byte);

insert into payments.platform_plans (
  id, code, name, plan_kind, status, created_by_person_id, created_by_duty_assignment_id
)
select '019b4000-0000-7000-8000-000000000301', 'pro', 'Pro', 'paid', 'published',
  '019b4000-0000-7000-8000-000000000001', duty.id
from support.platform_duty_assignments as duty
where duty.person_id = '019b4000-0000-7000-8000-000000000003'
  and duty.duty_code = 'view_billing_metadata';

insert into payments.platform_plan_versions (
  id, platform_plan_id, plan_kind, version_number, amount_minor, currency_code,
  billing_period, status, proposed_by_person_id, proposed_by_duty_assignment_id,
  published_by_person_id, published_by_duty_assignment_id, published_at
)
select '019b4000-0000-7000-8000-000000000302', '019b4000-0000-7000-8000-000000000301',
  'paid', 1, 1990000, 'COP', 'month', 'published',
  '019b4000-0000-7000-8000-000000000001', duty.id,
  '019b4000-0000-7000-8000-000000000002', duty.id, clock_timestamp()
from support.platform_duty_assignments as duty
where duty.person_id = '019b4000-0000-7000-8000-000000000003'
  and duty.duty_code = 'view_billing_metadata';

insert into payments.platform_store_products (store, product_id, platform_plan_version_id)
values ('google_play', 'allfit.pro.monthly.fu', '019b4000-0000-7000-8000-000000000302');

insert into payments.platform_subscriptions (
  id, person_id, platform_plan_version_id, store, store_product_id, store_subscription_ref,
  environment, status, auto_renews, current_period_end, grace_until, suspended_at,
  last_observed_at
)
select subscription_id, person_id, '019b4000-0000-7000-8000-000000000302', 'google_play',
  'allfit.pro.monthly.fu', 'ref-' || subscription_id::text, 'production',
  status::payments.platform_subscription_status, true, clock_timestamp() + interval '10 days',
  grace_until, suspended_at, clock_timestamp()
from (values
  ('019b4000-0000-7000-8000-000000000311'::uuid, '019b4000-0000-7000-8000-000000000011'::uuid,
    'suspended', null::timestamptz, clock_timestamp() - interval '4 days'),
  ('019b4000-0000-7000-8000-000000000312'::uuid, '019b4000-0000-7000-8000-000000000012'::uuid,
    'grace', clock_timestamp() + interval '3 days', null::timestamptz),
  ('019b4000-0000-7000-8000-000000000313'::uuid, '019b4000-0000-7000-8000-000000000013'::uuid,
    'active', null::timestamptz, null::timestamptz),
  ('019b4000-0000-7000-8000-000000000314'::uuid, '019b4000-0000-7000-8000-000000000014'::uuid,
    'active', null::timestamptz, null::timestamptz),
  ('019b4000-0000-7000-8000-000000000315'::uuid, '019b4000-0000-7000-8000-000000000015'::uuid,
    'active', null::timestamptz, null::timestamptz)
) as subscription_row(subscription_id, person_id, status, grace_until, suspended_at);

insert into payments.platform_payment_records (
  platform_subscription_id, person_id, store, store_transaction_id, amount_minor,
  currency_code, result, failure_code, occurred_at
)
values
  ('019b4000-0000-7000-8000-000000000313', '019b4000-0000-7000-8000-000000000013',
    'google_play', 'txn-fu-1', 1990000, 'COP', 'failed', 'billing_retry',
    clock_timestamp() - interval '2 days'),
  ('019b4000-0000-7000-8000-000000000314', '019b4000-0000-7000-8000-000000000014',
    'google_play', 'txn-fu-2', 1990000, 'COP', 'failed', 'billing_retry',
    clock_timestamp() - interval '40 days'),
  ('019b4000-0000-7000-8000-000000000315', '019b4000-0000-7000-8000-000000000015',
    'google_play', 'txn-fu-3', 1990000, 'COP', 'succeeded', null,
    clock_timestamp() - interval '2 days');

-- ---------------------------------------------------------------------------
-- A billing read, refused to a session without the admin role
-- ---------------------------------------------------------------------------

select set_config('app.actor_kind', 'support', true),
       set_config('app.actor_person_id', '019b4000-0000-7000-8000-000000000004', true);

select throws_ok(
  $$ select support.billing_follow_up(
    '019b4000-0000-7000-8000-000000000004', '019b4000-0000-7000-8000-000000000044',
    'CASE-2026-FU', 50
  ) $$,
  '42501', null,
  'a Backoffice session without the admin role does not open who fails to pay'
);

select set_config('app.actor_person_id', '019b4000-0000-7000-8000-000000000003', true);

select throws_ok(
  $$ select support.billing_follow_up(
    '019b4000-0000-7000-8000-000000000003', '019b4000-0000-7000-8000-000000000043',
    'sin caso', 50
  ) $$,
  '22023', null,
  'a case given to the list in free text is refused (HU-BO-020 c4)'
);

select throws_ok(
  $$ select support.billing_follow_up(
    '019b4000-0000-7000-8000-000000000003', '019b4000-0000-7000-8000-000000000043',
    'CASE-2026-FU', 0
  ) $$,
  '22023', null,
  'a page holds at least one row'
);

-- ---------------------------------------------------------------------------
-- What needs following up, most urgent first
-- ---------------------------------------------------------------------------

create temporary table follow_up on commit drop as
select support.billing_follow_up(
  '019b4000-0000-7000-8000-000000000003', '019b4000-0000-7000-8000-000000000043',
  'CASE-2026-FU', 50
) as body;

select is(
  (select array_agg((item.value->>'person_id')::uuid order by item.position)
   from follow_up,
     jsonb_array_elements(body->'items') with ordinality as item(value, position)),
  array[
    '019b4000-0000-7000-8000-000000000011', '019b4000-0000-7000-8000-000000000012',
    '019b4000-0000-7000-8000-000000000013'
  ]::uuid[],
  'suspended, then in grace, then a recent failed charge; an old failure and a payer are not on it'
);

select is(
  (select array(select key from jsonb_object_keys(body->'items'->0) as key order by key)
   from follow_up),
  array[
    'failed_charges', 'grace_until', 'last_failed_charge', 'person_id', 'plan_name', 'store',
    'subscription_status', 'suspended_at'
  ],
  'a row says who, what state, since when and the last failure, and no store reference'
);

select is(
  (select body->'items'->0->>'subscription_status' from follow_up),
  'suspended',
  'the suspended subscription says so'
);

select ok(
  (select (body->'items'->0->>'suspended_at')::timestamptz < clock_timestamp() from follow_up),
  'and since when'
);

select ok(
  (select (body->'items'->1->>'grace_until')::timestamptz > clock_timestamp() from follow_up),
  'the one in grace says until when it keeps Pro'
);

select is(
  (select (body->'items'->2->'last_failed_charge') - 'occurred_at' from follow_up),
  '{"failure_code": "billing_retry", "amount_minor": 1990000, "currency_code": "COP"}'::jsonb,
  'a failed charge says why it failed and how much it was'
);

select is(
  (select (body->'items'->2->>'failed_charges')::integer from follow_up),
  1,
  'counted within the window'
);

select is(
  (select body->>'window_days' from follow_up),
  '30',
  'and the window is stated'
);

-- ---------------------------------------------------------------------------
-- Recorded against each person before the list travels
-- ---------------------------------------------------------------------------

select is(
  (select array_agg(subject_person_id order by subject_person_id)
   from privacy.access_events
   where resource = 'payments.billing_follow_up'
     and actor_person_id = '019b4000-0000-7000-8000-000000000003'),
  array[
    '019b4000-0000-7000-8000-000000000011', '019b4000-0000-7000-8000-000000000012',
    '019b4000-0000-7000-8000-000000000013'
  ]::uuid[],
  'one access record per person listed, and none for those not on it'
);

select is(
  (select jsonb_array_length(page->'items')::text || ':' || (page->>'has_more')
   from (select support.billing_follow_up(
     '019b4000-0000-7000-8000-000000000003', '019b4000-0000-7000-8000-000000000043',
     'CASE-2026-FU', 2
   ) as page) as limited),
  '2:true',
  'a page says when there is more'
);

select ok(
  has_function_privilege('allfit_api', 'support.billing_follow_up(uuid, uuid, text, integer)',
    'execute'),
  'the runtime role calls the read'
);

select * from finish();

rollback;
