-- T-SUP-RLS-03 — PR-22 / OP-SUP-005: the minimised support projection.
--
-- Covers `HU-BO-006` and `HU-BO-007`. A Backoffice session without the admin role
-- opens nothing; the projection never carries a name, a full contact or the provider's subject;
-- there is no exploratory search; and a search that found nobody is recorded
-- anyway, which is the whole reason `support.metadata_queries` exists.

begin;

select plan(31);

insert into identity.people (
  id, given_name, family_name, contact_email, contact_phone, status
) values
  ('019a5000-0000-7000-8000-000000000001', 'Manager', 'Alpha', null, null, 'active'),
  ('019a5000-0000-7000-8000-000000000002', 'Manager', 'Beta', null, null, 'active'),
  ('019a5000-0000-7000-8000-000000000003', 'Diagnostician', 'Gamma', null, null, 'active'),
  ('019a5000-0000-7000-8000-000000000004', 'Outsider', 'Delta', null, null, 'active'),
  ('019a5000-0000-7000-8000-000000000005', 'Subject', 'Epsilon',
    'subject.epsilon@example.test', '+573001234567', 'active');

insert into identity.access_accounts (id, provider, issuer, subject, person_id)
values
  ('019a5000-0000-7000-8000-000000000011', 'workos', 'https://issuer.test', 'alpha', null),
  ('019a5000-0000-7000-8000-000000000012', 'workos', 'https://issuer.test', 'beta', null),
  ('019a5000-0000-7000-8000-000000000013', 'workos', 'https://issuer.test', 'gamma',
    '019a5000-0000-7000-8000-000000000003'),
  ('019a5000-0000-7000-8000-000000000014', 'workos', 'https://issuer.test', 'delta',
    '019a5000-0000-7000-8000-000000000004'),
  ('019a5000-0000-7000-8000-000000000015', 'workos', 'https://issuer.test',
    'subject-external-secret', '019a5000-0000-7000-8000-000000000005');

select support.bootstrap_backoffice_administrators(
  '019a5000-0000-7000-8000-000000000001', 'alpha',
  '019a5000-0000-7000-8000-000000000002', 'beta',
  'https://issuer.test', clock_timestamp() + interval '30 days', 'CEREMONY-SUP-03'
);

insert into identity.access_sessions (
  id, access_account_id, provider_session_id, surface, token_hash, token_ciphertext,
  access_token_expires_at, assurance_level, authentication_method,
  assurance_verified_at, last_activity_at, absolute_expires_at
) values
  ('019a5000-0000-7000-8000-000000000021', '019a5000-0000-7000-8000-000000000011',
    'sid_alpha_3', 'backoffice', decode(repeat('c1', 32), 'hex'), 'v1.alpha',
    clock_timestamp() + interval '5 minutes', 2, 'password_totp',
    clock_timestamp(), clock_timestamp(), clock_timestamp() + interval '8 hours'),
  ('019a5000-0000-7000-8000-000000000023', '019a5000-0000-7000-8000-000000000013',
    'sid_gamma_3', 'backoffice', decode(repeat('c3', 32), 'hex'), 'v1.gamma',
    clock_timestamp() + interval '5 minutes', 2, 'password_totp',
    clock_timestamp(), clock_timestamp(), clock_timestamp() + interval '8 hours'),
  ('019a5000-0000-7000-8000-000000000024', '019a5000-0000-7000-8000-000000000014',
    'sid_delta_3', 'backoffice', decode(repeat('c4', 32), 'hex'), 'v1.delta',
    clock_timestamp() + interval '5 minutes', 2, 'password_totp',
    clock_timestamp(), clock_timestamp(), clock_timestamp() + interval '8 hours');

-- Both candidates hold an AAL2 Backoffice session; only Gamma gets the role, which brings
-- every duty (ADR-046), so the denial below is about the role.
select support.assign_platform_role(
  '019a5000-0000-7000-8000-000000000001', '019a5000-0000-7000-8000-000000000021',
  '019a5000-0000-7000-8000-000000000003', 'allfit_admin',
  '019a5000-0000-7000-8000-000000000101', '019a5000-0000-7000-8000-000000000201',
  decode(repeat('31', 32), 'hex')
);
-- Converges onto the duty the role already brings.
select support.assign_platform_duty(
  '019a5000-0000-7000-8000-000000000001', '019a5000-0000-7000-8000-000000000021',
  '019a5000-0000-7000-8000-000000000003', 'diagnose_support_metadata',
  clock_timestamp(), clock_timestamp() + interval '30 days', 'CASE-2026-003',
  '019a5000-0000-7000-8000-000000000103', '019a5000-0000-7000-8000-000000000203',
  decode(repeat('33', 32), 'hex')
);

-- The API opens every support read as the operator who asked, transaction-local.
select set_config('app.actor_kind', 'support', true),
       set_config('app.actor_person_id', '019a5000-0000-7000-8000-000000000003', true);

-- ---------------------------------------------------------------------------
-- A Backoffice session without the admin role opens nothing
-- ---------------------------------------------------------------------------

select throws_ok(
  $$ select * from support.search_people(
    '019a5000-0000-7000-8000-000000000004', '019a5000-0000-7000-8000-000000000024',
    'CASE-2026-100', 'email', 'subject.epsilon@example.test'
  ) $$,
  '42501',
  'reading support metadata requires an effective duty',
  'a Backoffice session without the admin role cannot search for a person'
);

select throws_ok(
  $$ select support.person_metadata(
    '019a5000-0000-7000-8000-000000000004', '019a5000-0000-7000-8000-000000000024',
    'CASE-2026-100', '019a5000-0000-7000-8000-000000000005'
  ) $$,
  '42501',
  'reading support metadata requires an effective duty',
  'a Backoffice session without the admin role cannot open an operational state'
);

select is(
  (select count(*) from support.metadata_queries)::integer,
  0,
  'a refused search is not recorded as a search: it never happened'
);

-- ---------------------------------------------------------------------------
-- HU-BO-006 — exact match, and nothing else
-- ---------------------------------------------------------------------------

select is(
  (select (result->>'person_id')::uuid from support.search_people(
    '019a5000-0000-7000-8000-000000000003', '019a5000-0000-7000-8000-000000000023',
    'CASE-2026-101', 'email', 'subject.epsilon@example.test'
  )),
  '019a5000-0000-7000-8000-000000000005'::uuid,
  'an exact email finds the person who handed it over'
);

select is(
  (select count(*) from support.search_people(
    '019a5000-0000-7000-8000-000000000003', '019a5000-0000-7000-8000-000000000023',
    'CASE-2026-102', 'email', 'subject.epsilon'
  ))::integer,
  0,
  'a partial email matches nothing: there is no exploratory search'
);

select is(
  (select count(*) from support.search_people(
    '019a5000-0000-7000-8000-000000000003', '019a5000-0000-7000-8000-000000000023',
    'CASE-2026-103', 'phone', '+573001234567'
  ))::integer,
  1,
  'an exact phone finds the person too'
);

select is(
  (select array_agg(key order by key)
   from support.search_people(
     '019a5000-0000-7000-8000-000000000003', '019a5000-0000-7000-8000-000000000023', 'CASE-2026-110', 'identifier', '019a5000-0000-7000-8000-000000000005'
   ) as found, jsonb_object_keys(found.result) as key),
  array['account_status', 'contact_email_masked', 'contact_phone_masked', 'person_id'],
  'T-SUP-SEARCH-INT-01 a match carries the identifier, the masked contact and the account state, nothing else'
);

select is(
  (select count(*)::integer from privacy.access_events
   where subject_person_id = '019a5000-0000-7000-8000-000000000005' and resource = 'support.person_search'
     and purpose = 'support_diagnosis' and access_mode = 'support_metadata'::privacy.access_mode),
  3,
  'T-SUP-SEARCH-INT-02 every search that found the person is in her own access log'
);

select throws_ok(
  $$ select * from support.search_people(
    '019a5000-0000-7000-8000-000000000003', '019a5000-0000-7000-8000-000000000023',
    'CASE-2026-104', 'name', 'Epsilon'
  ) $$,
  '22023',
  'a support search is by identifier, email or phone',
  'searching by name is refused by the function, not by a convention'
);

-- ---------------------------------------------------------------------------
-- The record every search leaves, found or not
-- ---------------------------------------------------------------------------

select is(
  (select result_count from support.metadata_queries where case_reference = 'CASE-2026-102'),
  0,
  'a search that found nobody is recorded, with its empty result'
);

select is(
  (select count(*) from support.metadata_queries where case_reference = 'CASE-2026-104')::integer,
  0,
  'a malformed search is refused before it becomes a record'
);

select ok(
  (select lookup_hash = extensions.digest('subject.epsilon@example.test', 'sha256')
   from support.metadata_queries where case_reference = 'CASE-2026-101'),
  'the looked-up value is stored as a digest, never in clear'
);

select is(
  (select actor_person_id from support.metadata_queries where case_reference = 'CASE-2026-101'),
  '019a5000-0000-7000-8000-000000000003'::uuid,
  'the record names who searched'
);

select throws_ok(
  $$ update support.metadata_queries set result_count = 99 $$,
  '55000',
  'the record of a support search is append-only',
  'a search record cannot be rewritten'
);

select throws_ok(
  $$ delete from support.metadata_queries $$,
  '55000',
  'the record of a support search is append-only',
  'a search record cannot be deleted'
);

select throws_ok(
  $$ select support.search_people(
    '019a5000-0000-7000-8000-000000000003', '019a5000-0000-7000-8000-000000000023',
    'el usuario no puede entrar', 'email', 'subject.epsilon@example.test'
  ) $$,
  '23514',
  null,
  'a case reference cannot be free prose'
);

-- ---------------------------------------------------------------------------
-- HU-BO-007 criterion 2 — what exists around the person, with states and dates
-- ---------------------------------------------------------------------------

-- A gym she trains at, where she granted one permission, and a gym she left.
insert into organizations.organizations (id, type_code, display_name, responsible_party)
values
  ('019a5000-0000-7000-8000-000000000301', 'gym', 'Ficha Activa',
    '{"party_kind":"legal_entity","party_name":"Ficha Activa","purpose":"studio_operations"}'),
  ('019a5000-0000-7000-8000-000000000302', 'gym', 'Ficha Anterior',
    '{"party_kind":"legal_entity","party_name":"Ficha Anterior","purpose":"studio_operations"}');
insert into organizations.organization_memberships (id, organization_id, person_id)
values ('019a5000-0000-7000-8000-000000000311', '019a5000-0000-7000-8000-000000000301', '019a5000-0000-7000-8000-000000000001'), ('019a5000-0000-7000-8000-000000000312', '019a5000-0000-7000-8000-000000000302', '019a5000-0000-7000-8000-000000000001');
insert into organizations.membership_roles (membership_id, role_code)
values ('019a5000-0000-7000-8000-000000000311', 'owner'), ('019a5000-0000-7000-8000-000000000312', 'owner');
insert into privacy.scope_definitions (id, scope_code, version_number, status, published_at)
values ('019a5000-0000-7000-8000-000000000401', 'relationship_training', 1, 'draft', null);

-- IX-06: offering contribute needs a published contribute rule, as the real
-- relationship_training has. A rule is written while its version is a draft.
insert into privacy.scope_resource_rules (
  scope_definition_id, resource, field, data_classification_code, max_action
) values ('019a5000-0000-7000-8000-000000000401', 'planning.program_assignments', '*', 'training', 'contribute');
update privacy.scope_definitions
   set status = 'published', published_at = clock_timestamp()
 where id = '019a5000-0000-7000-8000-000000000401';

select set_config('app.actor_kind', 'person', true),
       set_config('app.actor_person_id', '019a5000-0000-7000-8000-000000000001', true),
       set_config('app.request_id', gen_random_uuid()::text, true);
create temporary table issued on commit drop as
select invitation_id from identity.issue_client_invitation(
  '019a5000-0000-7000-8000-000000000001', '019a5000-0000-7000-8000-000000000301', 'email', 'subject.epsilon@example.test',
  '[{"scope_code":"relationship_training","access_level":"contribute","purpose":"Entrenar",
     "presented_snapshot":{"title":"Entrenamiento"}}]'::jsonb,
  extensions.digest('T-SUP-RLS-03 invitation', 'sha256'), 1::smallint,
  'c0000000-0000-4000-8000-000000000501', '019a5000-0000-7000-8000-000000000501', decode(repeat('e1', 32), 'hex')
);
select set_config('app.actor_person_id', '019a5000-0000-7000-8000-000000000005', true),
       set_config('app.actor_verified_email', 'subject.epsilon@example.test', true);
select relationship_id from identity.decide_client_invitation(
  '019a5000-0000-7000-8000-000000000005', extensions.digest('T-SUP-RLS-03 invitation', 'sha256'),
  (select intent.id from identity.invitation_intents as intent
   join issued on intent.invitation_id = issued.invitation_id),
  'accepted', '{"relationship_training":"accepted"}'::jsonb,
  'c0000000-0000-4000-8000-000000000502', '019a5000-0000-7000-8000-000000000502', decode(repeat('e2', 32), 'hex')
);
insert into relationships.service_relationships (
  id, person_id, organization_id, status, started_at, ended_at, ended_reason, ended_by_kind
) values (
  '019a5000-0000-7000-8000-000000000321', '019a5000-0000-7000-8000-000000000005', '019a5000-0000-7000-8000-000000000302', 'terminated', clock_timestamp() - interval '40 days',
  clock_timestamp() - interval '2 days', 'person_left', 'person'
);

select set_config('app.actor_kind', 'support', true),
       set_config('app.actor_person_id', '019a5000-0000-7000-8000-000000000003', true);

create temporary table opened on commit drop as
select support.person_metadata('019a5000-0000-7000-8000-000000000003', '019a5000-0000-7000-8000-000000000023', 'CASE-2026-111', '019a5000-0000-7000-8000-000000000005') as file;

select results_eq(
  $$ select (file->'relationships'->>'active')::integer, (file->'relationships'->>'ended')::integer,
            file->'relationships'->>'last_started_at' is not null,
            file->'relationships'->>'last_ended_at' is not null
     from opened $$,
  $$ values (1, 1, true, true) $$,
  'T-SUP-FILE-INT-01 the file says how many gyms she trains at and has left, and when'
);

select results_eq(
  $$ select (file->'permissions'->>'active')::integer, (file->'permissions'->>'frozen')::integer,
            (file->'permissions'->>'revoked')::integer,
            file->'permissions'->>'last_granted_at' is not null,
            file->'permissions'->>'last_revoked_at' is null
     from opened $$,
  $$ values (1, 0, 0, true, true) $$,
  'T-SUP-FILE-INT-02 and how many permissions she has granted, by state, with their dates'
);

select results_eq(
  $$ select file->'plan'->>'status', file->'pro'->>'source',
            (file->'professional_profile'->>'exists')::boolean
     from opened $$,
  $$ values (null::text, 'none'::text, false) $$,
  'T-SUP-FILE-INT-03 never subscribed reads as the free plan, and with no Pro plan published nobody has Pro'
);

select ok(
  (select position('Ficha' in file::text) = 0
     and position('019a5000-0000-7000-8000-000000000301' in file::text) = 0
     and position('relationship_training' in file::text) = 0
   from opened),
  'T-SUP-FILE-INT-04 the file never names the gyms or what was shared: existence, states and dates only'
);

select set_config('app.actor_kind', 'person', true);
select throws_ok(
  $$ select support.person_metadata('019a5000-0000-7000-8000-000000000003', '019a5000-0000-7000-8000-000000000023', 'CASE-2026-112', '019a5000-0000-7000-8000-000000000005') $$,
  '42501',
  null,
  'T-SUP-FILE-RLS-01 the file opens only as the operator asking, or its counts could not be trusted'
);
select set_config('app.actor_kind', 'support', true);

-- The policy that lets the file count permissions: an admin, through the duty, nobody else.
set local role allfit_owner;
select is(
  (select count(*)::integer from privacy.data_grants where person_id = '019a5000-0000-7000-8000-000000000005'),
  1,
  'T-SUP-FILE-RLS-02 a diagnostician reads that her permission exists'
);
select set_config('app.actor_kind', 'person', true);
select is(
  (select count(*)::integer from privacy.data_grants where person_id = '019a5000-0000-7000-8000-000000000005'),
  0,
  'T-SUP-FILE-RLS-03 the same staff member outside a support request reads none of it'
);
select set_config('app.actor_kind', 'support', true),
       set_config('app.actor_person_id', '019a5000-0000-7000-8000-000000000004', true);
select is(
  (select count(*)::integer from privacy.data_grants where person_id = '019a5000-0000-7000-8000-000000000005'),
  0,
  'T-SUP-FILE-RLS-04 nor does a Backoffice session without the admin role'
);
reset role;
select set_config('app.actor_person_id', '019a5000-0000-7000-8000-000000000003', true);

-- ---------------------------------------------------------------------------
-- HU-BO-007 — minimisation
-- ---------------------------------------------------------------------------

select ok(
  (select support.person_metadata(
    '019a5000-0000-7000-8000-000000000003', '019a5000-0000-7000-8000-000000000023',
    'CASE-2026-105', '019a5000-0000-7000-8000-000000000005'
  ) ?& array['person_id', 'account_status', 'contact_email_masked', 'email_verified_at']),
  'the operational state carries identifiers, states and timestamps'
);

select ok(
  not (
    select support.person_metadata(
      '019a5000-0000-7000-8000-000000000003', '019a5000-0000-7000-8000-000000000023',
      'CASE-2026-106', '019a5000-0000-7000-8000-000000000005'
    ) ?| array['given_name', 'family_name', 'display_name', 'username', 'contact_email',
               'contact_phone', 'subject']
  ),
  'no name, no full contact and no provider subject ever leave the projection'
);

select is(
  (select support.person_metadata(
    '019a5000-0000-7000-8000-000000000003', '019a5000-0000-7000-8000-000000000023',
    'CASE-2026-107', '019a5000-0000-7000-8000-000000000005'
  )->>'contact_email_masked'),
  '••••••••on@example.test',
  'the contact is masked to what confirms a case, not to what identifies a person'
);

select throws_ok(
  $$ select support.person_metadata(
    '019a5000-0000-7000-8000-000000000003', '019a5000-0000-7000-8000-000000000023',
    'CASE-2026-109', '019a5000-0000-7000-8000-0000000009ff'
  ) $$,
  'P0002',
  'person not found in the support projection',
  'a person outside the projection is not found rather than empty'
);

select ok(
  (select count(*) from privacy.access_events
   where subject_person_id = '019a5000-0000-7000-8000-000000000005'
     and resource = 'support.v_support_metadata'
     and purpose = 'support_diagnosis') >= 4,
  'every opened operational state was recorded before its content travelled'
);

select ok(
  not exists (
    select 1 from privacy.access_events
    where resource = 'support.v_support_metadata'
      and access_mode <> 'support_metadata'::privacy.access_mode
  ),
  'a support read is recorded under its own mode, not mixed in with product reads'
);

-- ---------------------------------------------------------------------------
-- Minimal grants
-- ---------------------------------------------------------------------------

select ok(
  has_function_privilege(
    'allfit_api', 'support.search_people(uuid,uuid,text,text,text)', 'EXECUTE'
  )
    and has_function_privilege(
      'allfit_api', 'support.person_metadata(uuid,uuid,text,uuid)', 'EXECUTE'
    )
    and not has_function_privilege(
      'allfit_api', 'support.require_support_diagnostician(uuid,uuid)', 'EXECUTE'
    )
    and not has_table_privilege('allfit_api', 'support.v_support_metadata', 'SELECT')
    and not has_table_privilege('allfit_api', 'support.metadata_queries', 'SELECT'),
  'the runtime role executes the two operations and reaches neither the guard nor the tables'
);

select * from finish();
rollback;
