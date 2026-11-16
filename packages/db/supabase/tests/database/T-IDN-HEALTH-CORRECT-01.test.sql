-- T-IDN-HEALTH-CORRECT-01 — OP-IDN-067, ADR-052 (`HU-SP-022` for health context). TECH-326.
--
-- **A person corrects her own health claim in place.** Type, description, area and dates
-- are replaced and the earlier wording is not kept; the claim's id, person, provenance and
-- recorded instant never change, whoever tries.
--
-- **A legal hold keeps what the data says**, so under one over `health` nothing is
-- corrected, and neither is a claim whose deletion is already waiting.

begin;

select plan(17);

insert into identity.people (
  id, given_name, family_name, username, contact_email, contact_email_verified_at, status,
  activated_at
)
values
  ('019f7000-0000-7000-8000-000000000001', 'Camila', 'Rojas', 'camila_health_fix',
    'camila.fix@example.test', '2026-07-03 10:00:00+00', 'active', '2026-07-03 10:05:00+00'),
  ('019f7000-0000-7000-8000-000000000002', 'Other', 'Person', 'other_health_fix',
    'other.fix@example.test', '2026-07-04 10:00:00+00', 'active', '2026-07-04 10:05:00+00'),
  ('019f7000-0000-7000-8000-000000000003', 'Officer', 'Legal', 'officer_health_fix',
    'officer.fix@example.test', '2026-07-04 10:00:00+00', 'active', '2026-07-04 10:05:00+00');

insert into identity.access_accounts (id, provider, issuer, subject, person_id, linked_at)
values
  ('019f7000-0000-7000-8000-000000000101', 'workos', 'https://issuer.test', 'user_camila_fix',
    '019f7000-0000-7000-8000-000000000001', '2026-07-03 10:00:00+00'),
  ('019f7000-0000-7000-8000-000000000102', 'workos', 'https://issuer.test', 'user_other_fix',
    '019f7000-0000-7000-8000-000000000002', '2026-07-04 10:00:00+00');

create function pg_temp.declare_claim(p_subject text, p_claim uuid) returns jsonb
language sql as $fn$
  select result from identity.record_health_context(
    'workos', 'https://issuer.test', p_subject, p_claim, 'pain',
    'Me duele la rodilla.', 'knee', '2026-10-01 00:00:00+00', null,
    gen_random_uuid(), extensions.gen_random_bytes(32)
  )
$fn$;

create function pg_temp.correct(
  p_subject text,
  p_claim uuid,
  p_type text default 'recovery',
  p_description text default 'La derecha. Ya camino bien, pero no corro.',
  p_area text default 'knee',
  p_from timestamptz default '2026-10-01 00:00:00+00',
  p_to timestamptz default '2026-12-15 00:00:00+00',
  p_key uuid default gen_random_uuid(),
  p_hash bytea default extensions.gen_random_bytes(32)
) returns table (result jsonb, replayed boolean)
language sql as $fn$
  select * from identity.correct_health_context(
    'workos', 'https://issuer.test', p_subject, p_claim, p_type, p_description, p_area,
    p_from, p_to, p_key, extensions.uuid_generate_v7(), p_hash
  )
$fn$;

select pg_temp.declare_claim('user_camila_fix', '019f7000-0000-7000-8000-000000000501');
select pg_temp.declare_claim('user_other_fix', '019f7000-0000-7000-8000-000000000502');

create temporary table recorded as
select created_at from identity.health_context_claims
where id = '019f7000-0000-7000-8000-000000000501';

-- ---------------------------------------------------------------------------
-- She corrects her own claim
-- ---------------------------------------------------------------------------

select is(
  (select result - 'recorded_at' from pg_temp.correct('user_camila_fix',
     '019f7000-0000-7000-8000-000000000501', p_key => 'c7000000-0000-4000-8000-000000000001',
     p_hash => decode(repeat('e1', 32), 'hex'))),
  jsonb_build_object(
    'id', '019f7000-0000-7000-8000-000000000501',
    'context_type', 'recovery',
    'description', 'La derecha. Ya camino bien, pero no corro.',
    'body_area', 'knee',
    'provenance', 'person_declared',
    'valid_from', '2026-10-01T00:00:00+00:00',
    'valid_to', '2026-12-15T00:00:00+00:00'
  ),
  'the correction answers the claim as it now stands'
);

select results_eq(
  $$ select person_id, provenance::text, created_at = (select created_at from recorded),
            context_type, description
     from identity.health_context_claims where id = '019f7000-0000-7000-8000-000000000501' $$,
  $$ values ('019f7000-0000-7000-8000-000000000001'::uuid, 'person_declared'::text, true,
             'recovery'::text, 'La derecha. Ya camino bien, pero no corro.'::text) $$,
  'it is the same claim, of the same person and origin, recorded when it was'
);

select is(
  (select count(*)::int from identity.health_context_claims
   where person_id = '019f7000-0000-7000-8000-000000000001'),
  1,
  'no second claim and no copy of the earlier wording'
);

select is(
  (select replayed from pg_temp.correct('user_camila_fix',
     '019f7000-0000-7000-8000-000000000501', p_key => 'c7000000-0000-4000-8000-000000000001',
     p_hash => decode(repeat('e1', 32), 'hex'))),
  true,
  'a retried correction replays'
);

select is(
  (select result->>'description' from pg_temp.correct('user_camila_fix',
     '019f7000-0000-7000-8000-000000000501', 'pain', '  Otra vez me duele.  ', null,
     '2026-10-05 00:00:00+00', null)),
  'Otra vez me duele.',
  'a second correction replaces the first, trimmed, and the area may go'
);

-- ---------------------------------------------------------------------------
-- What never changes, and whose claim it is
-- ---------------------------------------------------------------------------

select throws_ok(
  $$ update identity.health_context_claims
     set person_id = '019f7000-0000-7000-8000-000000000002'
     where id = '019f7000-0000-7000-8000-000000000501' $$,
  '55000', null,
  'nobody moves a claim to another person, not even its owner role'
);

select throws_ok(
  $$ update identity.health_context_claims set provenance = 'professional_observation'
     where id = '019f7000-0000-7000-8000-000000000501' $$,
  '55000', null,
  'nor changes where it came from'
);

select throws_ok(
  $$ update identity.health_context_claims set created_at = now() - interval '1 year'
     where id = '019f7000-0000-7000-8000-000000000501' $$,
  '55000', null,
  'nor when it was recorded'
);

select throws_ok(
  $$ select * from pg_temp.correct('user_camila_fix', '019f7000-0000-7000-8000-000000000502') $$,
  'P0002', null,
  'somebody else''s claim answers as if it did not exist'
);

select throws_ok(
  $$ select * from pg_temp.correct('user_camila_fix', gen_random_uuid()) $$,
  'P0002', null,
  'and so does one that does not exist'
);

-- ---------------------------------------------------------------------------
-- The same rules as a declaration
-- ---------------------------------------------------------------------------

select throws_ok(
  $$ select * from pg_temp.correct('user_camila_fix', '019f7000-0000-7000-8000-000000000501',
       'diagnosis') $$,
  '22023', null,
  'three types, nothing else'
);

select throws_ok(
  $$ select * from pg_temp.correct('user_camila_fix', '019f7000-0000-7000-8000-000000000501',
       'pain', '   ') $$,
  '22023', null,
  'a correction still says something'
);

select throws_ok(
  $$ select * from pg_temp.correct('user_camila_fix', '019f7000-0000-7000-8000-000000000501',
       'pain', 'Duele.', 'left_knee') $$,
  '22023', null,
  'an area outside the fourteen is refused'
);

select throws_ok(
  $$ select * from pg_temp.correct('user_camila_fix', '019f7000-0000-7000-8000-000000000501',
       'recovery', 'Duele.', 'knee', '2026-10-01 00:00:00+00', '2026-09-01 00:00:00+00') $$,
  '22023', null,
  'an end before the start is refused'
);

-- ---------------------------------------------------------------------------
-- A legal hold keeps what the claim says
-- ---------------------------------------------------------------------------

insert into privacy.legal_holds (
  id, scope_description, reason_code, case_reference, valid_from, valid_to,
  applied_by_person_id, subject_person_id
) values (
  '019f7000-0000-7000-8000-000000000901', 'Health data of one person', 'judicial_order',
  'CASE-HEALTH-FIX', now() - interval '1 day', now() + interval '30 days',
  '019f7000-0000-7000-8000-000000000003', '019f7000-0000-7000-8000-000000000001'
);
insert into privacy.legal_hold_categories (legal_hold_id, data_classification_code)
values ('019f7000-0000-7000-8000-000000000901', 'health');

select throws_ok(
  $$ select * from pg_temp.correct('user_camila_fix', '019f7000-0000-7000-8000-000000000501') $$,
  '55000', null,
  'under a live hold over her health data nothing is corrected'
);

select is(
  (select result->>'status' from identity.delete_health_context(
     'workos', 'https://issuer.test', 'user_camila_fix', '019f7000-0000-7000-8000-000000000501',
     gen_random_uuid(), extensions.uuid_generate_v7(), extensions.gen_random_bytes(32))),
  'suspended',
  'her deletion waits under the hold'
);

-- The hold expires by hand; the deletion it suspended is still waiting.
set local session_replication_role = replica;
update privacy.legal_holds set valid_to = now() - interval '1 second', valid_from = now() - interval '2 days'
where id = '019f7000-0000-7000-8000-000000000901';
set local session_replication_role = origin;

select throws_ok(
  $$ select * from pg_temp.correct('user_camila_fix', '019f7000-0000-7000-8000-000000000501') $$,
  '55000', null,
  'a claim whose deletion waits is not corrected either'
);

select * from finish();
rollback;
