-- T-PRV-HIST-02 — OP-PRV-020 (HU-STUDIO-062): reading what an ended relationship froze.
--
-- With an open case that names him, the authorized member reads, read only:
--
--   · what the frozen categories mark as readable afterwards — sessions she executed and
--     her structured body measurements — and nothing else: no health, photos, notes,
--     programs or profile;
--   · only what existed at the cut: a session that ended later, was corrected later or
--     that she hid (then or since) does not exist for the case, nor does a measurement
--     recorded after it, whatever day it claims;
--   · every read records the case and the frozen mode, and so does a refused one;
--   · a case of somebody else, expired or closed, a session without a fresh sign-in, a
--     revoked permission: the history is not there.
--
-- The scope versions are 952 so this runs beside scopes a local seed published.
-- Written before the migration and watched failing.
begin;

select plan(40);

insert into identity.people (id, given_name, family_name, status)
values
  ('019f5700-0000-7000-8000-000000000001', 'Ana', 'Client', 'active'),
  ('019f5700-0000-7000-8000-000000000002', 'Bruno', 'Client', 'active'),
  ('019f5700-0000-7000-8000-000000000011', 'Olivia', 'Owner', 'active'),
  ('019f5700-0000-7000-8000-000000000012', 'Camilo', 'Coach', 'active'),
  ('019f5700-0000-7000-8000-000000000013', 'Fabio', 'Coach', 'active'),
  ('019f5700-0000-7000-8000-000000000016', 'Gina', 'Admin', 'active');

insert into organizations.organizations (id, type_code, display_name, responsible_party)
values ('019f5700-0000-7000-8000-000000000101', 'gym', 'Gym A',
  '{"party_kind":"legal_entity","party_name":"Gym A SAS","purpose":"studio_operations"}');

insert into organizations.organization_memberships (id, organization_id, person_id, status)
values
  ('019f5700-0000-7000-8000-000000000211', '019f5700-0000-7000-8000-000000000101', '019f5700-0000-7000-8000-000000000011', 'active'),
  ('019f5700-0000-7000-8000-000000000212', '019f5700-0000-7000-8000-000000000101', '019f5700-0000-7000-8000-000000000012', 'active'),
  ('019f5700-0000-7000-8000-000000000213', '019f5700-0000-7000-8000-000000000101', '019f5700-0000-7000-8000-000000000013', 'active'),
  ('019f5700-0000-7000-8000-000000000216', '019f5700-0000-7000-8000-000000000101', '019f5700-0000-7000-8000-000000000016', 'active');
insert into organizations.membership_roles (membership_id, role_code)
values
  ('019f5700-0000-7000-8000-000000000211', 'owner'),
  ('019f5700-0000-7000-8000-000000000212', 'coach'),
  ('019f5700-0000-7000-8000-000000000213', 'coach'),
  ('019f5700-0000-7000-8000-000000000216', 'admin');

insert into relationships.service_relationships (id, person_id, organization_id, status, started_at)
values
  ('019f5700-0000-7000-8000-000000000701', '019f5700-0000-7000-8000-000000000001', '019f5700-0000-7000-8000-000000000101', 'active', clock_timestamp() - interval '60 days'),
  ('019f5700-0000-7000-8000-000000000702', '019f5700-0000-7000-8000-000000000002', '019f5700-0000-7000-8000-000000000101', 'active', clock_timestamp() - interval '60 days');
insert into relationships.relationship_professional_assignments (
  id, relationship_id, person_id, organization_id, membership_id, kind, status, valid_from
) values (
  '019f5700-0000-7000-8000-000000000801', '019f5700-0000-7000-8000-000000000701', '019f5700-0000-7000-8000-000000000001',
  '019f5700-0000-7000-8000-000000000101', '019f5700-0000-7000-8000-000000000212', 'holder', 'active',
  clock_timestamp() - interval '60 days'
);

-- What each category lets anybody read afterwards. Original values and photos only now.
insert into privacy.scope_definitions (id, scope_code, version_number, status, published_at)
values
  ('019f5700-0000-7000-8000-000000000301', 'relationship_training', 952, 'draft', null),
  ('019f5700-0000-7000-8000-000000000302', 'prior_training_history', 952, 'draft', null),
  ('019f5700-0000-7000-8000-000000000303', 'body_progress', 952, 'draft', null),
  ('019f5700-0000-7000-8000-000000000304', 'health_context', 952, 'draft', null);
insert into privacy.scope_resource_rules (
  scope_definition_id, resource, field, data_classification_code, max_action, historical_readable
) values
  ('019f5700-0000-7000-8000-000000000301', 'execution.executed_sessions', '*', 'training', 'read', true),
  ('019f5700-0000-7000-8000-000000000301', 'execution.strength_sets', '*', 'training', 'read', true),
  ('019f5700-0000-7000-8000-000000000302', 'execution.executed_sessions', '*', 'training', 'read', true),
  ('019f5700-0000-7000-8000-000000000302', 'execution.strength_sets', '*', 'training', 'read', true),
  ('019f5700-0000-7000-8000-000000000303', 'identity.body_progress_records', 'metric_code', 'body', 'read', true),
  ('019f5700-0000-7000-8000-000000000303', 'identity.body_progress_records', 'value_numeric', 'body', 'read', true),
  ('019f5700-0000-7000-8000-000000000303', 'identity.body_progress_records', 'unit_code', 'body', 'read', true),
  ('019f5700-0000-7000-8000-000000000303', 'identity.body_progress_records', 'measured_on', 'body', 'read', true),
  ('019f5700-0000-7000-8000-000000000303', 'identity.body_progress_records', 'original_value', 'body', 'read', false),
  ('019f5700-0000-7000-8000-000000000303', 'identity.body_progress_records', 'original_unit_code', 'body', 'read', false),
  ('019f5700-0000-7000-8000-000000000303', 'identity.body_photos', 'taken_on', 'body', 'read', false),
  ('019f5700-0000-7000-8000-000000000304', 'identity.health_context_claims', 'description', 'health', 'read', false);
update privacy.scope_definitions set status = 'published', published_at = clock_timestamp()
where id in ('019f5700-0000-7000-8000-000000000301', '019f5700-0000-7000-8000-000000000302',
             '019f5700-0000-7000-8000-000000000303', '019f5700-0000-7000-8000-000000000304');

insert into identity.invitations (
  id, organization_id, issued_by_membership_id, channel, contact,
  token_hash, token_key_version, proposal_hash, responsible_party, status, expires_at
) values (
  '019f5700-0000-7000-8000-000000000401', '019f5700-0000-7000-8000-000000000101',
  '019f5700-0000-7000-8000-000000000211', 'email', 'ana@example.test',
  extensions.digest('hist2-token', 'sha256'), 1, extensions.digest('hist2-proposal', 'sha256'),
  '{"party_kind":"legal_entity","party_name":"Gym A SAS","purpose":"studio_operations"}',
  'completed', clock_timestamp() + interval '7 days'
);
insert into identity.invitation_intents (id, invitation_id, kind, status, proposed_role_code)
values ('019f5700-0000-7000-8000-000000000501', '019f5700-0000-7000-8000-000000000401',
  'service_relationship', 'pending', null);
insert into privacy.invitation_scope_options (
  id, invitation_intent_id, scope_definition_id, scope_code,
  offered_access_level, purpose, presented_snapshot, decision, decided_at
)
select ('019f5700-0000-7000-8000-00000000060' || n)::uuid, '019f5700-0000-7000-8000-000000000501',
       ('019f5700-0000-7000-8000-00000000030' || n)::uuid, code, 'read', 'Follow',
       '{"title":"Shared"}'::jsonb, 'accepted', clock_timestamp()
from (values (1, 'relationship_training'), (2, 'prior_training_history'),
             (3, 'body_progress'), (4, 'health_context')) as offered (n, code);

create function pg_temp.share(relationship uuid, grant_id uuid, scope text)
returns void language plpgsql as $$
declare
  subject record;
  option record;
begin
  select person_id, organization_id into subject
  from relationships.service_relationships where id = relationship;
  select id, scope_definition_id into option
  from privacy.invitation_scope_options where scope_code = scope;
  insert into privacy.consent_events (
    id, person_id, relationship_id, organization_id, invitation_scope_option_id,
    scope_definition_id, scope_code, decision, presented_snapshot
  ) values (
    grant_id, subject.person_id, relationship, subject.organization_id, option.id,
    option.scope_definition_id, scope, 'accepted', '{"title":"Shared"}'::jsonb
  );
  insert into privacy.data_grants (
    id, person_id, relationship_id, organization_id, scope_definition_id, scope_code,
    consent_event_id, access_level, purpose
  ) values (
    grant_id, subject.person_id, relationship, subject.organization_id,
    option.scope_definition_id, scope, grant_id, 'read', 'Follow'
  );
end
$$;
select pg_temp.share('019f5700-0000-7000-8000-000000000701', '019f5700-0000-7000-8000-000000000a01', 'relationship_training');
select pg_temp.share('019f5700-0000-7000-8000-000000000701', '019f5700-0000-7000-8000-000000000a02', 'prior_training_history');
select pg_temp.share('019f5700-0000-7000-8000-000000000701', '019f5700-0000-7000-8000-000000000a03', 'body_progress');
select pg_temp.share('019f5700-0000-7000-8000-000000000701', '019f5700-0000-7000-8000-000000000a04', 'health_context');
select pg_temp.share('019f5700-0000-7000-8000-000000000702', '019f5700-0000-7000-8000-000000000a21', 'prior_training_history');

-- The cut: two days ago.
select clock_timestamp() - interval '2 days' as cut \gset

-- What Ana trained, around the cut. Bruno trained once too.
create function pg_temp.trained(id uuid, person uuid, started timestamptz, context uuid)
returns void language sql as $$
  insert into execution.executed_sessions (
    id, person_id, activity_type_id, result_contract_id, contract_version, is_autonomous,
    context_relationship_id, context_organization_id, started_at, ended_at, timezone,
    execution_status, validation_status, requested_level, achieved_level, capture_source
  ) values (
    id, person, '019c0000-0000-7000-8000-000000000011', '019c0000-0000-7000-8000-000000000031', 1,
    context is null, context, case when context is null then null else '019f5700-0000-7000-8000-000000000101'::uuid end,
    started, started + interval '1 hour',
    'America/Bogota', 'completed', 'valid', 'detailed', 'detailed', 'manual'
  )
$$;
-- S1 inside the relationship and S2 alone, before the cut: readable.
select pg_temp.trained('019f5700-0000-7000-8000-000000000e01', '019f5700-0000-7000-8000-000000000001',
  :'cut'::timestamptz - interval '3 days', '019f5700-0000-7000-8000-000000000701');
select pg_temp.trained('019f5700-0000-7000-8000-000000000e02', '019f5700-0000-7000-8000-000000000001',
  :'cut'::timestamptz - interval '4 days', null);
-- S3 hidden from the gym when it ended.
select pg_temp.trained('019f5700-0000-7000-8000-000000000e03', '019f5700-0000-7000-8000-000000000001',
  :'cut'::timestamptz - interval '5 days', null);
-- S4 began before the cut and ended after it; S5 after it altogether.
select pg_temp.trained('019f5700-0000-7000-8000-000000000e04', '019f5700-0000-7000-8000-000000000001',
  :'cut'::timestamptz - interval '30 minutes', null);
select pg_temp.trained('019f5700-0000-7000-8000-000000000e05', '019f5700-0000-7000-8000-000000000001',
  :'cut'::timestamptz + interval '1 day', null);
-- S6 corrected after the cut; S7 hidden after it; S8 hidden then and restored since.
select pg_temp.trained('019f5700-0000-7000-8000-000000000e06', '019f5700-0000-7000-8000-000000000001',
  :'cut'::timestamptz - interval '6 days', null);
select pg_temp.trained('019f5700-0000-7000-8000-000000000e07', '019f5700-0000-7000-8000-000000000001',
  :'cut'::timestamptz - interval '7 days', null);
select pg_temp.trained('019f5700-0000-7000-8000-000000000e08', '019f5700-0000-7000-8000-000000000001',
  :'cut'::timestamptz - interval '8 days', null);
-- S9 annulled; S10 hidden and restored before the cut: readable again.
select pg_temp.trained('019f5700-0000-7000-8000-000000000e09', '019f5700-0000-7000-8000-000000000001',
  :'cut'::timestamptz - interval '9 days', null);
select pg_temp.trained('019f5700-0000-7000-8000-000000000e10', '019f5700-0000-7000-8000-000000000001',
  :'cut'::timestamptz - interval '10 days', null);
select pg_temp.trained('019f5700-0000-7000-8000-000000000e11', '019f5700-0000-7000-8000-000000000002',
  :'cut'::timestamptz - interval '3 days', null);
update execution.executed_sessions
set validation_status = 'annulled', annulled_at = :'cut'::timestamptz - interval '8 days', annulment_reason = 'duplicate'
where id = '019f5700-0000-7000-8000-000000000e09';

insert into execution.strength_sets (executed_session_id, set_order, achieved_reps, load_value, load_unit_code, rpe)
values ('019f5700-0000-7000-8000-000000000e01', 1, 8, 60, 'test_kg', 8);

insert into execution.execution_revisions (
  executed_session_id, person_id, revision_from, revision_to, actor_person_id, reason, before, after, created_at
) values
  ('019f5700-0000-7000-8000-000000000e01', '019f5700-0000-7000-8000-000000000001', 1, 2,
   '019f5700-0000-7000-8000-000000000001', 'typo', '{}', '{}', :'cut'::timestamptz - interval '1 day'),
  ('019f5700-0000-7000-8000-000000000e06', '019f5700-0000-7000-8000-000000000001', 1, 2,
   '019f5700-0000-7000-8000-000000000001', 'typo', '{}', '{}', :'cut'::timestamptz + interval '1 day');

-- B1 measured and recorded before the cut; B2 after; B3 recorded after, dated before.
insert into identity.body_progress_records (
  id, person_id, metric_code, value_numeric, unit_code, original_value, original_unit_code, measured_on, created_at
) values
  ('019f5700-0000-7000-8000-000000000b01', '019f5700-0000-7000-8000-000000000001', 'body_weight', 70, 'kg', 154.32, 'lb',
   (:'cut'::timestamptz - interval '3 days')::date, :'cut'::timestamptz - interval '3 days'),
  ('019f5700-0000-7000-8000-000000000b02', '019f5700-0000-7000-8000-000000000001', 'body_weight', 69, 'kg', null, null,
   current_date, clock_timestamp()),
  ('019f5700-0000-7000-8000-000000000b03', '019f5700-0000-7000-8000-000000000001', 'body_weight', 71, 'kg', null, null,
   (:'cut'::timestamptz - interval '10 days')::date, clock_timestamp()),
  ('019f5700-0000-7000-8000-000000000b11', '019f5700-0000-7000-8000-000000000002', 'body_weight', 80, 'kg', null, null,
   (:'cut'::timestamptz - interval '3 days')::date, :'cut'::timestamptz - interval '3 days');

select relationships.close_relationship('019f5700-0000-7000-8000-000000000701', :'cut', 'professional', 'left');

insert into privacy.session_visibility_denials (
  person_id, executed_session_id, relationship_id, status, denied_at, restored_at, frozen_denied_at
) values
  ('019f5700-0000-7000-8000-000000000001', '019f5700-0000-7000-8000-000000000e03', '019f5700-0000-7000-8000-000000000701',
   'active', :'cut'::timestamptz - interval '4 days', null, :'cut'),
  ('019f5700-0000-7000-8000-000000000001', '019f5700-0000-7000-8000-000000000e07', '019f5700-0000-7000-8000-000000000701',
   'active', :'cut'::timestamptz + interval '1 day', null, null),
  ('019f5700-0000-7000-8000-000000000001', '019f5700-0000-7000-8000-000000000e08', '019f5700-0000-7000-8000-000000000701',
   'reverted', :'cut'::timestamptz - interval '4 days', :'cut'::timestamptz + interval '1 day', :'cut'),
  ('019f5700-0000-7000-8000-000000000001', '019f5700-0000-7000-8000-000000000e10', '019f5700-0000-7000-8000-000000000701',
   'reverted', :'cut'::timestamptz - interval '9 days', :'cut'::timestamptz - interval '5 days', null);

create function pg_temp.act(person uuid) returns void language plpgsql as $$
begin
  perform set_config('app.actor_kind', 'person', true);
  perform set_config('app.actor_person_id', person::text, true);
  perform set_config('app.actor_org_id', '', true);
  perform set_config('app.actor_membership_id', '', true);
  perform set_config('app.purpose', '', true);
  perform set_config('app.contract_scope_purpose', '', true);
  perform set_config('app.contract_scope_id', '', true);
  perform set_config('app.contract_scope_token', '', true);
  perform set_config('app.historical_access_case_id', '', true);
  perform set_config('app.request_id', gen_random_uuid()::text, true);
end
$$;

create function pg_temp.member(person uuid, membership uuid) returns void language plpgsql as $$
begin
  perform pg_temp.act(person);
  perform set_config('app.actor_org_id', '019f5700-0000-7000-8000-000000000101', true);
  perform set_config('app.actor_membership_id', membership::text, true);
end
$$;

create function pg_temp.sqlstate(statement text) returns text language plpgsql as $$
begin
  execute statement;
  return 'no error';
exception when assert_failure or others then
  return sqlstate;
end
$$;

-- Cases are written as the owner would; the commands are T-PRV-HIST-01's.
-- C1 names Camilo, C2 Olivia herself; C3 ran out an hour ago; C4 was closed.
select pg_temp.member('019f5700-0000-7000-8000-000000000011', '019f5700-0000-7000-8000-000000000211');
insert into privacy.historical_access_cases (
  id, organization_id, relationship_id, person_id, cut_at, authorized_membership_id, opened_by_membership_id,
  purpose, case_reference, justification, opened_at, expires_at, status, closed_at, closed_reason, closed_by_membership_id
) values
  ('019f5700-0000-7000-8000-000000000c01', '019f5700-0000-7000-8000-000000000101', '019f5700-0000-7000-8000-000000000701',
   '019f5700-0000-7000-8000-000000000001', :'cut', '019f5700-0000-7000-8000-000000000212', '019f5700-0000-7000-8000-000000000211',
   'service_dispute', 'CASE-1', 'She disputes a charge', clock_timestamp(), clock_timestamp() + interval '2 hours',
   'open', null, null, null),
  ('019f5700-0000-7000-8000-000000000c02', '019f5700-0000-7000-8000-000000000101', '019f5700-0000-7000-8000-000000000701',
   '019f5700-0000-7000-8000-000000000001', :'cut', '019f5700-0000-7000-8000-000000000211', '019f5700-0000-7000-8000-000000000211',
   'security_investigation', 'CASE-2', 'An alert', clock_timestamp(), clock_timestamp() + interval '2 hours',
   'open', null, null, null),
  ('019f5700-0000-7000-8000-000000000c03', '019f5700-0000-7000-8000-000000000101', '019f5700-0000-7000-8000-000000000701',
   '019f5700-0000-7000-8000-000000000001', :'cut', '019f5700-0000-7000-8000-000000000212', '019f5700-0000-7000-8000-000000000211',
   'authorized_quality_review', 'CASE-3', 'A review', clock_timestamp() - interval '3 hours', clock_timestamp() - interval '1 hour',
   'open', null, null, null),
  ('019f5700-0000-7000-8000-000000000c04', '019f5700-0000-7000-8000-000000000101', '019f5700-0000-7000-8000-000000000701',
   '019f5700-0000-7000-8000-000000000001', :'cut', '019f5700-0000-7000-8000-000000000212', '019f5700-0000-7000-8000-000000000211',
   'customer_support_request', 'CASE-4', 'A request', clock_timestamp() - interval '3 hours', clock_timestamp() + interval '1 hour',
   'closed', clock_timestamp() - interval '2 hours', 'closed_by_manager', '019f5700-0000-7000-8000-000000000211');

insert into identity.access_accounts (id, provider, issuer, subject, person_id)
values
  ('019f5700-0000-7000-8000-000000000b11', 'workos', 'https://hist2.test', 'olivia', '019f5700-0000-7000-8000-000000000011'),
  ('019f5700-0000-7000-8000-000000000b12', 'workos', 'https://hist2.test', 'camilo', '019f5700-0000-7000-8000-000000000012'),
  ('019f5700-0000-7000-8000-000000000b13', 'workos', 'https://hist2.test', 'fabio', '019f5700-0000-7000-8000-000000000013');
create function pg_temp.session(id uuid, account uuid, label text, signed_in interval)
returns void language sql as $$
  insert into identity.access_sessions (
    id, access_account_id, provider_session_id, surface, token_hash, token_ciphertext,
    access_token_expires_at, authenticated_at
  ) values (
    id, account, 'hist2-' || label, 'studio', extensions.digest('hist2-' || label, 'sha256'),
    'v1.' || label, clock_timestamp() + interval '1 hour', clock_timestamp() - signed_in
  )
$$;
select pg_temp.session('019f5700-0000-7000-8000-000000000d11', '019f5700-0000-7000-8000-000000000b11', 'olivia', interval '1 minute');
select pg_temp.session('019f5700-0000-7000-8000-000000000d12', '019f5700-0000-7000-8000-000000000b12', 'camilo', interval '1 minute');
select pg_temp.session('019f5700-0000-7000-8000-000000000d10', '019f5700-0000-7000-8000-000000000b12', 'camilo-stale', interval '11 minutes');
select pg_temp.session('019f5700-0000-7000-8000-000000000d13', '019f5700-0000-7000-8000-000000000b13', 'fabio', interval '1 minute');

-- Every read as `actor` through `session` and `case_id`, on Ana's ended relationship.
create function pg_temp.sessions(actor uuid, session uuid, case_id uuid,
  relationship uuid default '019f5700-0000-7000-8000-000000000701', page integer default 20,
  after_started timestamptz default null, after_id uuid default null)
returns jsonb language plpgsql as $$
begin
  perform pg_temp.act(actor);
  return execution.list_frozen_executions(actor, session, '019f5700-0000-7000-8000-000000000101',
    relationship, case_id, page, after_started, after_id);
end
$$;
create function pg_temp.ids(page jsonb) returns uuid[] language sql as $$
  select coalesce(array_agg((item ->> 'id')::uuid order by ordinal), '{}')
  from jsonb_array_elements(page -> 'items') with ordinality as listed (item, ordinal)
$$;
create function pg_temp.session_detail(actor uuid, session uuid, case_id uuid, execution_id uuid)
returns jsonb language plpgsql as $$
begin
  perform pg_temp.act(actor);
  return execution.read_frozen_execution(actor, session, '019f5700-0000-7000-8000-000000000101',
    '019f5700-0000-7000-8000-000000000701', case_id, execution_id);
end
$$;
create function pg_temp.body(actor uuid, session uuid, case_id uuid)
returns jsonb language plpgsql as $$
begin
  perform pg_temp.act(actor);
  return identity.list_frozen_body_progress(actor, session, '019f5700-0000-7000-8000-000000000101',
    '019f5700-0000-7000-8000-000000000701', case_id, 20, null, null);
end
$$;
create function pg_temp.summary(actor uuid, session uuid, case_id uuid)
returns jsonb language plpgsql as $$
begin
  perform pg_temp.act(actor);
  return privacy.read_historical_relationship(actor, session, '019f5700-0000-7000-8000-000000000101',
    '019f5700-0000-7000-8000-000000000701', case_id);
end
$$;
-- Read as the test's superuser: the runtime role never reads the access record.
create function pg_temp.events(actor uuid) returns text[] language sql security definer as $$
  select coalesce(array_agg(event.result || ' ' || coalesce(event.scope_code, '-') || ' '
                            || event.access_mode::text || ' ' || coalesce(event.historical_access_case_id::text, '-')
                            order by event.result, event.scope_code), '{}')
  from privacy.access_events as event
  where event.actor_person_id = actor
    and event.request_id = current_setting('app.request_id')::uuid
$$;

-- ---------------------------------------------------------------------------
-- Row policies, under the frozen-history scope only
-- ---------------------------------------------------------------------------
reset role;
set local role allfit_owner;
create temporary table fixture_sessions (id uuid) on commit drop;
reset role;
insert into fixture_sessions
select id from execution.executed_sessions
where person_id in ('019f5700-0000-7000-8000-000000000001', '019f5700-0000-7000-8000-000000000002');

set local role allfit_owner;
select pg_temp.member('019f5700-0000-7000-8000-000000000012', '019f5700-0000-7000-8000-000000000212');
select is(
  (select count(*)::integer from execution.executed_sessions where id in (select id from fixture_sessions)),
  0,
  'T-PRV-HIST-RLS-11 without a case open no session of hers is visible to the former holder');
select access_control.open_contract_scope('frozen_history', '019f5700-0000-7000-8000-000000000c01');
select is(
  (select array_agg(id order by started_at desc) from execution.executed_sessions where id in (select id from fixture_sessions)),
  array['019f5700-0000-7000-8000-000000000e01', '019f5700-0000-7000-8000-000000000e02',
        '019f5700-0000-7000-8000-000000000e09', '019f5700-0000-7000-8000-000000000e10']::uuid[],
  'T-PRV-HIST-RLS-12 executed_sessions_select_frozen: what existed at the cut, never what she hid, corrected or did later');
select is(
  (select count(*)::integer from execution.strength_sets
   where executed_session_id = '019f5700-0000-7000-8000-000000000e01'),
  1,
  'T-PRV-HIST-RLS-13 and what a visible session recorded comes with it');
select is(
  (select count(*)::integer from privacy.session_visibility_denials
   where relationship_id = '019f5700-0000-7000-8000-000000000701'),
  4,
  'T-PRV-HIST-RLS-14 session_visibility_denials_select_frozen: the case reads that relationship''s denials, so it can exclude them');
select is(
  (select count(*)::integer from execution.execution_revisions
   where person_id = '019f5700-0000-7000-8000-000000000001'),
  2,
  'T-PRV-HIST-RLS-15 execution_revisions_select_frozen: and her corrections, so it can tell what changed after the cut');
select access_control.open_contract_scope('frozen_history', '019f5700-0000-7000-8000-000000000c03');
select is(
  (select count(*)::integer from execution.executed_sessions where id in (select id from fixture_sessions))
  + (select count(*)::integer from privacy.session_visibility_denials)
  + (select count(*)::integer from execution.execution_revisions where person_id = '019f5700-0000-7000-8000-000000000001'),
  0,
  'T-PRV-HIST-RLS-16 an expired case opens nothing');
select pg_temp.member('019f5700-0000-7000-8000-000000000011', '019f5700-0000-7000-8000-000000000211');
select access_control.open_contract_scope('frozen_history', '019f5700-0000-7000-8000-000000000c01');
select is(
  (select count(*)::integer from execution.executed_sessions where id in (select id from fixture_sessions))
  + (select count(*)::integer from privacy.session_visibility_denials)
  + (select count(*)::integer from execution.execution_revisions where person_id = '019f5700-0000-7000-8000-000000000001'),
  0,
  'T-PRV-HIST-RLS-17 nor does somebody else''s case, even for the owner who opened it');
reset role;

-- ---------------------------------------------------------------------------
-- The former holder reads through his case
-- ---------------------------------------------------------------------------
set local role allfit_api;

select is(
  pg_temp.sqlstate($$select pg_temp.sessions('019f5700-0000-7000-8000-000000000012',
    '019f5700-0000-7000-8000-000000000d10', '019f5700-0000-7000-8000-000000000c01')$$),
  'AF401',
  'T-PRV-HIST-AUTH-11 a sign-in older than ten minutes reads nothing');
select is(
  pg_temp.sqlstate($$select pg_temp.sessions('019f5700-0000-7000-8000-000000000012',
    '019f5700-0000-7000-8000-000000000d11', '019f5700-0000-7000-8000-000000000c01')$$),
  'AF401',
  'T-PRV-HIST-AUTH-12 nor does somebody else''s session');

select pg_temp.sessions('019f5700-0000-7000-8000-000000000012', '019f5700-0000-7000-8000-000000000d12',
  '019f5700-0000-7000-8000-000000000c01') as listed \gset
select is(:'listed'::jsonb ->> 'outcome', 'found', 'T-PRV-HIST-API-01 the case opens her frozen sessions');
select is(
  pg_temp.ids(:'listed'::jsonb),
  array['019f5700-0000-7000-8000-000000000e01', '019f5700-0000-7000-8000-000000000e02',
        '019f5700-0000-7000-8000-000000000e10']::uuid[],
  'T-PRV-HIST-API-02 newest first, only what existed at the cut');
select is(
  (select array_agg(item ->> 'origin' order by ordinal)
   from jsonb_array_elements(:'listed'::jsonb -> 'items') with ordinality as listed (item, ordinal)),
  array['relationship', 'prior', 'prior'],
  'T-PRV-HIST-API-03 each says whether it was trained inside the relationship or before');
select ok(
  not exists (select 1 from jsonb_array_elements(:'listed'::jsonb -> 'items') as item
              where item ? 'planned_session_id'),
  'T-PRV-HIST-API-04 without the plan it came from: programs did not stay readable');
select is(
  pg_temp.events('019f5700-0000-7000-8000-000000000012'),
  array['allowed prior_training_history frozen 019f5700-0000-7000-8000-000000000c01',
        'allowed relationship_training frozen 019f5700-0000-7000-8000-000000000c01'],
  'T-PRV-HIST-API-05 the read is recorded under each category, in frozen mode, with the case');

select is(
  pg_temp.ids(pg_temp.sessions('019f5700-0000-7000-8000-000000000012', '019f5700-0000-7000-8000-000000000d12',
    '019f5700-0000-7000-8000-000000000c01', page => 1,
    after_started => date_trunc('milliseconds', :'cut'::timestamptz - interval '3 days'),
    after_id => '019f5700-0000-7000-8000-000000000e01')),
  array['019f5700-0000-7000-8000-000000000e02']::uuid[],
  'T-PRV-HIST-API-06 a page at a time, after the last one seen');

select pg_temp.session_detail('019f5700-0000-7000-8000-000000000012', '019f5700-0000-7000-8000-000000000d12',
  '019f5700-0000-7000-8000-000000000c01', '019f5700-0000-7000-8000-000000000e01') as detail \gset
select is(:'detail'::jsonb ->> 'outcome', 'found', 'T-PRV-HIST-API-07 one session opens');
select is(
  jsonb_array_length(:'detail'::jsonb -> 'execution' -> 'strength_sets'), 1,
  'T-PRV-HIST-API-08 with what she recorded');
select is(
  :'detail'::jsonb -> 'execution' -> 'applied_scope' ->> 'code', 'relationship_training',
  'T-PRV-HIST-API-09 under the category that covered it');
select ok(
  not (:'detail'::jsonb -> 'execution' ?| array['observations', 'planned_session_id', 'status', 'contract', 'capture_source']),
  'T-PRV-HIST-API-10 and without notes, plan or how it was captured');

select is(
  (select array_agg(pg_temp.session_detail('019f5700-0000-7000-8000-000000000012', '019f5700-0000-7000-8000-000000000d12',
     '019f5700-0000-7000-8000-000000000c01', hidden) ->> 'outcome' order by hidden)
   from unnest(array['019f5700-0000-7000-8000-000000000e03', '019f5700-0000-7000-8000-000000000e04',
                     '019f5700-0000-7000-8000-000000000e05', '019f5700-0000-7000-8000-000000000e06',
                     '019f5700-0000-7000-8000-000000000e07', '019f5700-0000-7000-8000-000000000e08',
                     '019f5700-0000-7000-8000-000000000e09', '019f5700-0000-7000-8000-000000000e11']::uuid[]) as hidden),
  array_fill('not_found'::text, array[8]),
  'T-PRV-HIST-API-11 by id, what is not in the list does not exist: later, corrected, hidden, annulled, somebody else''s');
select is(
  pg_temp.events('019f5700-0000-7000-8000-000000000012'),
  array['denied - frozen 019f5700-0000-7000-8000-000000000c01'],
  'T-PRV-HIST-API-12 and asking for one is recorded as refused');

select pg_temp.body('019f5700-0000-7000-8000-000000000012', '019f5700-0000-7000-8000-000000000d12',
  '019f5700-0000-7000-8000-000000000c01') as measured \gset
select is(
  pg_temp.ids(:'measured'::jsonb),
  array['019f5700-0000-7000-8000-000000000b01']::uuid[],
  'T-PRV-HIST-API-13 measurements recorded before the cut only, whatever day a later one claims');
select is(
  (:'measured'::jsonb -> 'items' -> 0 ->> 'value')::numeric, 70::numeric,
  'T-PRV-HIST-API-14 with the fields the category kept readable');
select ok(
  (:'measured'::jsonb -> 'items' -> 0 -> 'original_value') = 'null'::jsonb,
  'T-PRV-HIST-API-15 and never one it shared only while the relationship lived');
select is(
  pg_temp.events('019f5700-0000-7000-8000-000000000012'),
  array['allowed body_progress frozen 019f5700-0000-7000-8000-000000000c01'],
  'T-PRV-HIST-API-16 recorded under its category');

select pg_temp.summary('019f5700-0000-7000-8000-000000000012', '019f5700-0000-7000-8000-000000000d12',
  '019f5700-0000-7000-8000-000000000c01') as summary \gset
select is(
  (select array_agg(scope ->> 'code' order by scope ->> 'code')
   from jsonb_array_elements(:'summary'::jsonb -> 'scopes') as scope),
  array['body_progress', 'prior_training_history', 'relationship_training'],
  'T-PRV-HIST-API-17 the relationship lists the frozen categories that stayed readable, never her health');
select is(
  (:'summary'::jsonb -> 'relationship' ->> 'ended_at')::timestamptz, :'cut'::timestamptz,
  'T-PRV-HIST-API-18 and the instant it was cut');

-- ---------------------------------------------------------------------------
-- Nobody else, and no other case
-- ---------------------------------------------------------------------------
select is(
  pg_temp.sessions('019f5700-0000-7000-8000-000000000011', '019f5700-0000-7000-8000-000000000d11',
    '019f5700-0000-7000-8000-000000000c01') ->> 'outcome',
  'not_found',
  'T-PRV-HIST-API-19 the owner who opened Camilo''s case cannot read through it');
select is(
  pg_temp.events('019f5700-0000-7000-8000-000000000011'),
  array['denied - frozen 019f5700-0000-7000-8000-000000000c01'],
  'T-PRV-HIST-API-20 and the attempt stays on Ana''s record');
select is(
  pg_temp.ids(pg_temp.sessions('019f5700-0000-7000-8000-000000000011', '019f5700-0000-7000-8000-000000000d11',
    '019f5700-0000-7000-8000-000000000c02')),
  array['019f5700-0000-7000-8000-000000000e01', '019f5700-0000-7000-8000-000000000e02',
        '019f5700-0000-7000-8000-000000000e10']::uuid[],
  'T-PRV-HIST-API-21 through her own case she reads the same history');
select is(
  pg_temp.sessions('019f5700-0000-7000-8000-000000000012', '019f5700-0000-7000-8000-000000000d12',
    '019f5700-0000-7000-8000-000000000c03') ->> 'outcome',
  'not_found',
  'T-PRV-HIST-API-22 an expired case reads nothing');
select is(
  pg_temp.events('019f5700-0000-7000-8000-000000000012'),
  array['denied - frozen 019f5700-0000-7000-8000-000000000c03'],
  'T-PRV-HIST-API-23 and the attempt is recorded against it');
select is(
  pg_temp.sessions('019f5700-0000-7000-8000-000000000012', '019f5700-0000-7000-8000-000000000d12',
    '019f5700-0000-7000-8000-000000000c04') ->> 'outcome',
  'not_found',
  'T-PRV-HIST-API-24 nor does a closed one');
select is(
  pg_temp.sessions('019f5700-0000-7000-8000-000000000013', '019f5700-0000-7000-8000-000000000d13',
    '019f5700-0000-7000-8000-000000000c01') ->> 'outcome',
  'not_found',
  'T-PRV-HIST-API-25 a coach the case does not name reads nothing');
select is(
  pg_temp.sessions('019f5700-0000-7000-8000-000000000012', '019f5700-0000-7000-8000-000000000d12',
    '019f5700-0000-7000-8000-000000000c01', relationship => '019f5700-0000-7000-8000-000000000702') ->> 'outcome',
  'not_found',
  'T-PRV-HIST-API-26 and a case opens only its own relationship');

-- The live read still refuses an ended relationship.
select pg_temp.act('019f5700-0000-7000-8000-000000000012');
select is(
  pg_temp.sqlstate($$select * from execution.list_authorized_executions('019f5700-0000-7000-8000-000000000012',
      '019f5700-0000-7000-8000-000000000101', '019f5700-0000-7000-8000-000000000001', 20, null, null)$$),
  'P0002',
  'T-PRV-HIST-API-27 without a case the ended relationship is not there');

-- She revokes what she shared of her training before the gym.
select pg_temp.act('019f5700-0000-7000-8000-000000000001');
select status from privacy.revoke_my_grant(
  '019f5700-0000-7000-8000-000000000001', '019f5700-0000-7000-8000-000000000a02',
  '019f5700-0000-4000-8000-0000000000f2', extensions.uuid_generate_v7(), extensions.digest('ana-revokes-prior', 'sha256'));
select is(
  pg_temp.sessions('019f5700-0000-7000-8000-000000000012', '019f5700-0000-7000-8000-000000000d12',
    '019f5700-0000-7000-8000-000000000c01') ->> 'outcome',
  'not_found',
  'T-PRV-HIST-API-28 once she revokes a frozen permission the case is closed and reads nothing');
reset role;

select is(
  (select count(*)::integer from privacy.access_events where access_mode = 'frozen' and historical_access_case_id is null),
  0,
  'T-PRV-HIST-INT-11 no frozen read is ever recorded without its case');
select ok(
  not has_function_privilege('allfit_api', 'access_control.can_read_frozen(uuid, text, text)', 'execute'),
  'T-PRV-HIST-INT-12 the runtime role cannot ask the predicate directly');
select ok(
  not exists (select 1 from privacy.access_events
              where resource like 'identity.health%' and historical_access_case_id is not null),
  'T-PRV-HIST-INT-13 and no case ever read her health');

select * from finish();
rollback;
