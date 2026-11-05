-- T-CAT-CONTRACT-02 — NEW-CAT-CONTRACT-VERSIONS: every version of an activity type's
-- result contracts, as its curator sees them (`HU-BO-023`).
--
-- The screen listed only the versions in force for the chosen type, through the product
-- read. A deprecated version vanished from it, and a version published last week could
-- not be deprecated from anywhere, because nothing listed it.
--
-- **Every version, published and deprecated.** Newest first, with the status that says
-- which. Deprecating one keeps it on the list as deprecated.
--
-- **The curator's read.** `curate_global_catalog` with AAL2, like publishing; the base
-- role is refused, and a type outside the global catalogue is not found.

begin;

select plan(8);

insert into identity.people (id, given_name, family_name)
values
  ('019b5000-0000-7000-8000-000000000001', 'Manager', 'Alpha'),
  ('019b5000-0000-7000-8000-000000000002', 'Manager', 'Beta'),
  ('019b5000-0000-7000-8000-000000000003', 'Curator', 'Gamma');

insert into identity.access_accounts (id, provider, issuer, subject, person_id)
values
  ('019b5000-0000-7000-8000-000000000011', 'workos', 'https://issuer.test', 'alpha_cv', null),
  ('019b5000-0000-7000-8000-000000000012', 'workos', 'https://issuer.test', 'beta_cv', null),
  ('019b5000-0000-7000-8000-000000000013', 'workos', 'https://issuer.test', 'gamma_cv',
    '019b5000-0000-7000-8000-000000000003');

select support.bootstrap_backoffice_administrators(
  '019b5000-0000-7000-8000-000000000001', 'alpha_cv',
  '019b5000-0000-7000-8000-000000000002', 'beta_cv',
  'https://issuer.test', clock_timestamp() + interval '30 days', 'CEREMONY-CAT-CONTRACT-02'
);

insert into identity.access_sessions (
  id, access_account_id, provider_session_id, surface, token_hash, token_ciphertext,
  access_token_expires_at, assurance_level, authentication_method,
  assurance_verified_at, last_activity_at, absolute_expires_at
) values
  ('019b5000-0000-7000-8000-000000000021', '019b5000-0000-7000-8000-000000000011',
    'sid_alpha_cv', 'backoffice', decode(repeat('c1', 32), 'hex'), 'v1.alpha',
    clock_timestamp() + interval '5 minutes', 2, 'password_totp',
    clock_timestamp(), clock_timestamp(), clock_timestamp() + interval '8 hours'),
  ('019b5000-0000-7000-8000-000000000023', '019b5000-0000-7000-8000-000000000013',
    'sid_gamma_cv', 'backoffice', decode(repeat('c3', 32), 'hex'), 'v1.gamma',
    clock_timestamp() + interval '5 minutes', 2, 'password_totp',
    clock_timestamp(), clock_timestamp(), clock_timestamp() + interval '8 hours');

select support.assign_platform_role(
  '019b5000-0000-7000-8000-000000000001', '019b5000-0000-7000-8000-000000000021',
  '019b5000-0000-7000-8000-000000000003', 'allfit_admin',
  '019b5000-0000-7000-8000-000000000101', '019b5000-0000-7000-8000-000000000201',
  decode(repeat('31', 32), 'hex')
);

insert into catalog.disciplines (code, name, status)
values ('test_versions_discipline', 'Versions discipline', 'published');

insert into catalog.activity_types (id, discipline_code, code, name, content_scope, status)
values (
  '019b5000-0000-7000-8000-000000000301', 'test_versions_discipline',
  'test_versions_activity', 'Versions activity', 'global', 'published'
);

select set_config('app.actor_kind', 'support', true),
       set_config('app.actor_person_id', '019b5000-0000-7000-8000-000000000003', true);

select throws_ok(
  $$ select catalog.list_result_contract_versions(
    '019b5000-0000-7000-8000-000000000003', '019b5000-0000-7000-8000-000000000023',
    '019b5000-0000-7000-8000-000000000301'
  ) $$,
  '42501', null,
  'the base role does not read the curator''s versions'
);

select support.assign_platform_duty(
  '019b5000-0000-7000-8000-000000000001', '019b5000-0000-7000-8000-000000000021',
  '019b5000-0000-7000-8000-000000000003', 'curate_global_catalog',
  null, clock_timestamp() + interval '30 days', 'CASE-CURATE-CV',
  '019b5000-0000-7000-8000-000000000103', '019b5000-0000-7000-8000-000000000203',
  decode(repeat('33', 32), 'hex')
);

-- Two versions, the first one published last.
create temporary table first_version on commit drop as
select (result->>'id')::uuid as id
from catalog.publish_result_contract(
  '019b5000-0000-7000-8000-000000000003', '019b5000-0000-7000-8000-000000000023',
  'test.versions', 'strength', '{"kind":"envelope"}'::jsonb, '{"sets":1}'::jsonb,
  '[{"kind":"valid","payload":{"sets":2},"expected":"accepted"},
    {"kind":"invalid","payload":{},"expected":"missing_sets"}]'::jsonb,
  '019b5000-0000-7000-8000-000000000301', true,
  '019b5000-0000-7000-8000-000000000104', '019b5000-0000-7000-8000-000000000204',
  decode(repeat('34', 32), 'hex')
);

select catalog.publish_result_contract(
  '019b5000-0000-7000-8000-000000000003', '019b5000-0000-7000-8000-000000000023',
  'test.versions', 'strength', '{"kind":"envelope"}'::jsonb, '{"sets":2}'::jsonb,
  '[{"kind":"valid","payload":{"sets":3},"expected":"accepted"},
    {"kind":"invalid","payload":{"sets":1},"expected":"too_few_sets"}]'::jsonb,
  '019b5000-0000-7000-8000-000000000301', false,
  '019b5000-0000-7000-8000-000000000105', '019b5000-0000-7000-8000-000000000205',
  decode(repeat('35', 32), 'hex')
);

-- The older version, deprecated from the list — what the screen could not do.
select catalog.deprecate_result_contract(
  '019b5000-0000-7000-8000-000000000003', '019b5000-0000-7000-8000-000000000023',
  (select id from first_version),
  '019b5000-0000-7000-8000-000000000106', '019b5000-0000-7000-8000-000000000206',
  decode(repeat('36', 32), 'hex')
);

create temporary table versions on commit drop as
select catalog.list_result_contract_versions(
  '019b5000-0000-7000-8000-000000000003', '019b5000-0000-7000-8000-000000000023',
  '019b5000-0000-7000-8000-000000000301'
) as body;

select is(
  (select jsonb_array_length(body->'items') from versions),
  2,
  'every version is listed, the deprecated one included'
);

select is(
  (select array_agg(item->>'version_number' || ':' || (item->>'status') order by position)
   from versions,
     jsonb_array_elements(body->'items') with ordinality as entry(item, position)),
  array['2:published', '1:deprecated'],
  'newest first, each with the status that says whether it is in force'
);

select is(
  (select body->'items'->1->>'id' from versions)::uuid,
  (select id from first_version),
  'the deprecated version is the one that was deprecated'
);

select ok(
  (select body->'items'->0 ? 'fixtures' and body->'items'->0 ? 'activity_type_bindings'
   from versions),
  'a version travels as the publication answered it, fixtures and bindings included'
);

select is(
  (select body->>'activity_type_id' from versions)::uuid,
  '019b5000-0000-7000-8000-000000000301'::uuid,
  'the list says which activity type it is about'
);

select throws_ok(
  $$ select catalog.list_result_contract_versions(
    '019b5000-0000-7000-8000-000000000003', '019b5000-0000-7000-8000-000000000023',
    '019b5000-0000-7000-8000-000000000999'
  ) $$,
  'P0002', null,
  'a type outside the global catalogue is not found'
);

select ok(
  has_function_privilege('allfit_api', 'catalog.list_result_contract_versions(uuid, uuid, uuid)',
    'execute'),
  'the runtime role calls the read'
);

select * from finish();

rollback;
