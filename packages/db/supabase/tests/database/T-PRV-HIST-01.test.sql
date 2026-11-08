-- T-PRV-HIST-01 — OP-PRV-018, OP-PRV-019 and OP-PRV-025 (HU-STUDIO-061, HU-STUDIO-063).
--
-- An owner or admin opens a case to read what an ended relationship froze, and closes it:
--
--   · Opening needs `manage_historical_access` and a sign-in less than ten minutes old on
--     this very Studio session; the capability alone reads nothing.
--   · The purpose comes from a closed list, the case lasts at most 24 hours, and it names
--     one membership: the opener herself, or the professional who held the relationship
--     when it ended. Never staff, never another admin, never a coach with no part in it.
--   · Only an ended relationship of this organization with something still frozen.
--   · One open case per relationship, membership and purpose; a closed one never reopens.
--   · Closing converges and deletes nothing; the case also closes on its own when she
--     revokes what was frozen or the authorized membership stops qualifying.
--   · Whoever manages cases lists them all; the authorized member lists only his own.
--
-- The scope versions are 951 and up so this runs beside scopes a local seed published.
-- Written before the migration and watched failing.
begin;

select plan(58);

insert into identity.people (id, given_name, family_name, status)
values
  ('019f5600-0000-7000-8000-000000000001', 'Ana', 'Client', 'active'),
  ('019f5600-0000-7000-8000-000000000002', 'Bruno', 'Client', 'active'),
  ('019f5600-0000-7000-8000-000000000003', 'Carla', 'Client', 'active'),
  ('019f5600-0000-7000-8000-000000000004', 'Diana', 'Client', 'active'),
  ('019f5600-0000-7000-8000-000000000011', 'Olivia', 'Owner', 'active'),
  ('019f5600-0000-7000-8000-000000000012', 'Camilo', 'Coach', 'active'),
  ('019f5600-0000-7000-8000-000000000013', 'Fabio', 'Coach', 'active'),
  ('019f5600-0000-7000-8000-000000000014', 'Sara', 'Staff', 'active'),
  ('019f5600-0000-7000-8000-000000000015', 'Teo', 'Coach', 'active'),
  ('019f5600-0000-7000-8000-000000000016', 'Gina', 'Admin', 'active'),
  ('019f5600-0000-7000-8000-000000000021', 'Hugo', 'Owner', 'active');

insert into organizations.organizations (id, type_code, display_name, responsible_party)
values
  ('019f5600-0000-7000-8000-000000000101', 'gym', 'Gym A',
   '{"party_kind":"legal_entity","party_name":"Gym A SAS","purpose":"studio_operations"}'),
  ('019f5600-0000-7000-8000-000000000102', 'gym', 'Gym B',
   '{"party_kind":"legal_entity","party_name":"Gym B SAS","purpose":"studio_operations"}');

insert into organizations.organization_memberships (id, organization_id, person_id, status)
values
  ('019f5600-0000-7000-8000-000000000211', '019f5600-0000-7000-8000-000000000101', '019f5600-0000-7000-8000-000000000011', 'active'),
  ('019f5600-0000-7000-8000-000000000212', '019f5600-0000-7000-8000-000000000101', '019f5600-0000-7000-8000-000000000012', 'active'),
  ('019f5600-0000-7000-8000-000000000213', '019f5600-0000-7000-8000-000000000101', '019f5600-0000-7000-8000-000000000013', 'active'),
  ('019f5600-0000-7000-8000-000000000214', '019f5600-0000-7000-8000-000000000101', '019f5600-0000-7000-8000-000000000014', 'active'),
  ('019f5600-0000-7000-8000-000000000215', '019f5600-0000-7000-8000-000000000101', '019f5600-0000-7000-8000-000000000015', 'active'),
  ('019f5600-0000-7000-8000-000000000216', '019f5600-0000-7000-8000-000000000101', '019f5600-0000-7000-8000-000000000016', 'active'),
  ('019f5600-0000-7000-8000-000000000221', '019f5600-0000-7000-8000-000000000102', '019f5600-0000-7000-8000-000000000021', 'active');

insert into organizations.membership_roles (membership_id, role_code)
values
  ('019f5600-0000-7000-8000-000000000211', 'owner'),
  ('019f5600-0000-7000-8000-000000000212', 'coach'),
  ('019f5600-0000-7000-8000-000000000213', 'coach'),
  ('019f5600-0000-7000-8000-000000000214', 'staff'),
  ('019f5600-0000-7000-8000-000000000216', 'admin'),
  ('019f5600-0000-7000-8000-000000000221', 'owner');
insert into organizations.membership_roles (membership_id, role_code, valid_from)
values ('019f5600-0000-7000-8000-000000000215', 'coach', clock_timestamp() - interval '60 days');

-- Ana and Carla trained at Gym A and Ana at Gym B too; Bruno still does at Gym A.
insert into relationships.service_relationships (id, person_id, organization_id, status, started_at)
values
  ('019f5600-0000-7000-8000-000000000701', '019f5600-0000-7000-8000-000000000001', '019f5600-0000-7000-8000-000000000101', 'active', clock_timestamp() - interval '60 days'),
  ('019f5600-0000-7000-8000-000000000702', '019f5600-0000-7000-8000-000000000002', '019f5600-0000-7000-8000-000000000101', 'active', clock_timestamp() - interval '60 days'),
  ('019f5600-0000-7000-8000-000000000703', '019f5600-0000-7000-8000-000000000003', '019f5600-0000-7000-8000-000000000101', 'active', clock_timestamp() - interval '60 days'),
  ('019f5600-0000-7000-8000-000000000704', '019f5600-0000-7000-8000-000000000001', '019f5600-0000-7000-8000-000000000102', 'active', clock_timestamp() - interval '60 days'),
  ('019f5600-0000-7000-8000-000000000705', '019f5600-0000-7000-8000-000000000004', '019f5600-0000-7000-8000-000000000101', 'active', clock_timestamp() - interval '60 days');

insert into relationships.relationship_professional_assignments (
  id, relationship_id, person_id, organization_id, membership_id, kind, status, valid_from
) values
  ('019f5600-0000-7000-8000-000000000801', '019f5600-0000-7000-8000-000000000701', '019f5600-0000-7000-8000-000000000001',
   '019f5600-0000-7000-8000-000000000101', '019f5600-0000-7000-8000-000000000212', 'holder', 'active',
   clock_timestamp() - interval '60 days'),
  ('019f5600-0000-7000-8000-000000000802', '019f5600-0000-7000-8000-000000000702', '019f5600-0000-7000-8000-000000000002',
   '019f5600-0000-7000-8000-000000000101', '019f5600-0000-7000-8000-000000000212', 'holder', 'active',
   clock_timestamp() - interval '60 days'),
  ('019f5600-0000-7000-8000-000000000805', '019f5600-0000-7000-8000-000000000705', '019f5600-0000-7000-8000-000000000004',
   '019f5600-0000-7000-8000-000000000101', '019f5600-0000-7000-8000-000000000215', 'holder', 'active',
   clock_timestamp() - interval '60 days');

insert into privacy.scope_definitions (id, scope_code, version_number, status, published_at)
values
  ('019f5600-0000-7000-8000-000000000301', 'relationship_training', 951, 'published', clock_timestamp()),
  ('019f5600-0000-7000-8000-000000000302', 'body_progress', 951, 'published', clock_timestamp());

insert into identity.invitations (
  id, organization_id, issued_by_membership_id, channel, contact,
  token_hash, token_key_version, proposal_hash, responsible_party, status, expires_at
) values (
  '019f5600-0000-7000-8000-000000000401', '019f5600-0000-7000-8000-000000000101',
  '019f5600-0000-7000-8000-000000000211', 'email', 'ana@example.test',
  extensions.digest('hist-token', 'sha256'), 1, extensions.digest('hist-proposal', 'sha256'),
  '{"party_kind":"legal_entity","party_name":"Gym A SAS","purpose":"studio_operations"}',
  'completed', clock_timestamp() + interval '7 days'
);
insert into identity.invitation_intents (id, invitation_id, kind, status, proposed_role_code)
values ('019f5600-0000-7000-8000-000000000501', '019f5600-0000-7000-8000-000000000401',
  'service_relationship', 'pending', null);
insert into privacy.invitation_scope_options (
  id, invitation_intent_id, scope_definition_id, scope_code,
  offered_access_level, purpose, presented_snapshot, decision, decided_at
) values
  ('019f5600-0000-7000-8000-000000000601', '019f5600-0000-7000-8000-000000000501',
   '019f5600-0000-7000-8000-000000000301', 'relationship_training', 'read',
   'Follow the training', '{"title":"Training"}'::jsonb, 'accepted', clock_timestamp()),
  ('019f5600-0000-7000-8000-000000000602', '019f5600-0000-7000-8000-000000000501',
   '019f5600-0000-7000-8000-000000000302', 'body_progress', 'read',
   'Follow the body', '{"title":"Body"}'::jsonb, 'accepted', clock_timestamp());

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

select pg_temp.share('019f5600-0000-7000-8000-000000000701', '019f5600-0000-7000-8000-000000000a01', 'relationship_training');
select pg_temp.share('019f5600-0000-7000-8000-000000000701', '019f5600-0000-7000-8000-000000000a02', 'body_progress');
select pg_temp.share('019f5600-0000-7000-8000-000000000702', '019f5600-0000-7000-8000-000000000a21', 'relationship_training');
select pg_temp.share('019f5600-0000-7000-8000-000000000703', '019f5600-0000-7000-8000-000000000a31', 'relationship_training');
select pg_temp.share('019f5600-0000-7000-8000-000000000704', '019f5600-0000-7000-8000-000000000a41', 'relationship_training');
select pg_temp.share('019f5600-0000-7000-8000-000000000705', '019f5600-0000-7000-8000-000000000a51', 'relationship_training');

-- Carla took hers back before leaving, so nothing of hers froze.
update privacy.data_grants set status = 'revoked', revoked_at = clock_timestamp()
where id = '019f5600-0000-7000-8000-000000000a31';

-- Ana's and Carla's relationships end two days ago; Camilo held Ana's at that instant.
select clock_timestamp() - interval '2 days' as cut \gset
select relationships.close_relationship('019f5600-0000-7000-8000-000000000701', :'cut', 'professional', 'left');
select relationships.close_relationship('019f5600-0000-7000-8000-000000000703', :'cut', 'professional', 'left');
select relationships.close_relationship('019f5600-0000-7000-8000-000000000704', :'cut', 'professional', 'left');
select relationships.close_relationship('019f5600-0000-7000-8000-000000000705', :'cut', 'professional', 'left');

-- Teo held Diana's at the cut and has been staff only since yesterday.
update organizations.membership_roles set valid_to = clock_timestamp() - interval '1 day'
where membership_id = '019f5600-0000-7000-8000-000000000215' and role_code = 'coach';
insert into organizations.membership_roles (membership_id, role_code, valid_from)
values ('019f5600-0000-7000-8000-000000000215', 'staff', clock_timestamp() - interval '1 day');

-- Studio sessions, with when WorkOS says each person last authenticated. Gina's stale one
-- twenty minutes ago; Olivia's plain one carries no instant at all.
insert into identity.access_accounts (id, provider, issuer, subject, person_id)
values
  ('019f5600-0000-7000-8000-000000000b11', 'workos', 'https://hist.test', 'olivia', '019f5600-0000-7000-8000-000000000011'),
  ('019f5600-0000-7000-8000-000000000b12', 'workos', 'https://hist.test', 'camilo', '019f5600-0000-7000-8000-000000000012'),
  ('019f5600-0000-7000-8000-000000000b14', 'workos', 'https://hist.test', 'sara', '019f5600-0000-7000-8000-000000000014'),
  ('019f5600-0000-7000-8000-000000000b16', 'workos', 'https://hist.test', 'gina', '019f5600-0000-7000-8000-000000000016'),
  ('019f5600-0000-7000-8000-000000000b21', 'workos', 'https://hist.test', 'hugo', '019f5600-0000-7000-8000-000000000021');

create function pg_temp.session(id uuid, account uuid, label text, signed_in interval)
returns void language sql as $$
  insert into identity.access_sessions (
    id, access_account_id, provider_session_id, surface, token_hash, token_ciphertext,
    access_token_expires_at, authenticated_at
  ) values (
    id, account, 'hist-' || label, 'studio', extensions.digest('hist-' || label, 'sha256'),
    'v1.' || label, clock_timestamp() + interval '1 hour',
    case when signed_in is null then null else clock_timestamp() - signed_in end
  )
$$;
select pg_temp.session('019f5600-0000-7000-8000-000000000c11', '019f5600-0000-7000-8000-000000000b11', 'olivia', interval '1 minute');
select pg_temp.session('019f5600-0000-7000-8000-000000000c10', '019f5600-0000-7000-8000-000000000b11', 'olivia-plain', null);
select pg_temp.session('019f5600-0000-7000-8000-000000000c12', '019f5600-0000-7000-8000-000000000b12', 'camilo', interval '1 minute');
select pg_temp.session('019f5600-0000-7000-8000-000000000c14', '019f5600-0000-7000-8000-000000000b14', 'sara', interval '1 minute');
select pg_temp.session('019f5600-0000-7000-8000-000000000c16', '019f5600-0000-7000-8000-000000000b16', 'gina', interval '1 minute');
select pg_temp.session('019f5600-0000-7000-8000-000000000c15', '019f5600-0000-7000-8000-000000000b16', 'gina-stale', interval '20 minutes');
select pg_temp.session('019f5600-0000-7000-8000-000000000c21', '019f5600-0000-7000-8000-000000000b21', 'hugo', interval '1 minute');

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
  perform set_config('app.request_id', gen_random_uuid()::text, true);
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

-- Opens as `actor` with `session`; every call carries its own idempotency key.
create function pg_temp.open(actor uuid, session uuid, org uuid, relationship uuid,
  authorized uuid, purpose text, hours integer, label text)
returns jsonb language plpgsql as $$
declare
  opened jsonb;
begin
  perform pg_temp.act(actor);
  select document into opened from privacy.open_historical_access_case(
    actor, session, org, relationship, authorized, purpose, 'CASE-' || label,
    'Reason ' || label, hours,
    ('019f5600-0000-4000-8000-' || lpad(to_hex(abs(hashtext(label))), 12, '0'))::uuid,
    extensions.uuid_generate_v7(), extensions.digest(label, 'sha256'));
  return opened;
end
$$;

create function pg_temp.open_sql(actor text, session text, org text, relationship text,
  authorized text, purpose text, hours integer, label text)
returns text language sql as $$
  select format('select pg_temp.open(%L, %L, %L, %L, %L, %L, %s, %L)',
    actor, session, org, relationship, authorized, purpose, hours, label)
$$;

create function pg_temp.close(actor uuid, org uuid, case_id uuid, label text)
returns jsonb language plpgsql as $$
declare
  closed jsonb;
begin
  perform pg_temp.act(actor);
  select document into closed from privacy.close_historical_access_case(
    actor, org, case_id,
    ('019f5600-0000-4000-8000-' || lpad(to_hex(abs(hashtext(label))), 12, '0'))::uuid,
    extensions.uuid_generate_v7(), extensions.digest(label, 'sha256'));
  return closed;
end
$$;

create function pg_temp.listed(actor uuid, org uuid)
returns uuid[] language plpgsql as $$
declare
  found uuid[];
begin
  perform pg_temp.act(actor);
  select coalesce(array_agg(id order by opened_at desc, id desc), '{}') into found
  from privacy.list_historical_access_cases(actor, org, null, 50, null, null);
  return found;
end
$$;

-- ---------------------------------------------------------------------------
-- The table is the database's, not the runtime's
-- ---------------------------------------------------------------------------
select ok(
  (select relrowsecurity and relforcerowsecurity from pg_class
   where oid = 'privacy.historical_access_cases'::regclass),
  'T-PRV-HIST-RLS-01 cases are under forced row security');
select ok(
  not has_table_privilege('allfit_api', 'privacy.historical_access_cases', 'select,insert,update,delete'),
  'T-PRV-HIST-RLS-02 the runtime role touches the table only through closed functions');
select is(
  pg_temp.sqlstate($$insert into identity.access_sessions (access_account_id, provider_session_id, surface,
                       token_hash, token_ciphertext, access_token_expires_at, authenticated_at)
                     values ('019f5600-0000-7000-8000-000000000b11', 'hist-backoffice', 'backoffice',
                       extensions.digest('hist-backoffice', 'sha256'), 'v1.backoffice', clock_timestamp(), clock_timestamp())$$),
  '23514',
  'T-PRV-HIST-INT-01 only a Studio session says when its person last authenticated');

set local role allfit_api;
select is(
  pg_temp.sqlstate($$select identity.create_access_session('019f5600-0000-7000-8000-000000000b11', 'hist-future',
                       'studio', extensions.digest('hist-future', 'sha256'), 'v1.future',
                       clock_timestamp() + interval '1 hour', clock_timestamp() + interval '5 minutes')$$),
  '22023',
  'T-PRV-HIST-INT-06 a login cannot claim an authentication that has not happened yet');
select identity.create_access_session('019f5600-0000-7000-8000-000000000b11', 'hist-login', 'studio',
  extensions.digest('hist-login', 'sha256'), 'v1.login', clock_timestamp() + interval '1 hour',
  '2026-11-01 10:00:00+00') as login_session \gset
select is(
  (select recent_authentication_expires_at from identity.load_access_session(
     extensions.digest('hist-login', 'sha256'), 'studio')),
  '2026-11-01 10:10:00+00'::timestamptz,
  'T-PRV-HIST-INT-07 the session says until when its sign-in counts as recent: ten minutes after it');
reset role;

-- ---------------------------------------------------------------------------
-- Who opens, and with which sign-in
-- ---------------------------------------------------------------------------
set local role allfit_api;

select is(
  pg_temp.sqlstate(pg_temp.open_sql('019f5600-0000-7000-8000-000000000011', '019f5600-0000-7000-8000-000000000c10',
    '019f5600-0000-7000-8000-000000000101', '019f5600-0000-7000-8000-000000000701',
    '019f5600-0000-7000-8000-000000000211', 'service_dispute', 24, 'plain')),
  'AF401',
  'T-PRV-HIST-AUTH-01 a session that does not say when its person authenticated opens nothing');
select is(
  pg_temp.sqlstate(pg_temp.open_sql('019f5600-0000-7000-8000-000000000016', '019f5600-0000-7000-8000-000000000c15',
    '019f5600-0000-7000-8000-000000000101', '019f5600-0000-7000-8000-000000000701',
    '019f5600-0000-7000-8000-000000000216', 'service_dispute', 24, 'stale')),
  'AF401',
  'T-PRV-HIST-AUTH-02 nor one whose person authenticated twenty minutes ago');
select is(
  pg_temp.sqlstate(pg_temp.open_sql('019f5600-0000-7000-8000-000000000011', '019f5600-0000-7000-8000-000000000c16',
    '019f5600-0000-7000-8000-000000000101', '019f5600-0000-7000-8000-000000000701',
    '019f5600-0000-7000-8000-000000000211', 'service_dispute', 24, 'borrowed')),
  'AF401',
  'T-PRV-HIST-AUTH-03 nor somebody else''s fresh session');
select is(
  pg_temp.sqlstate(pg_temp.open_sql('019f5600-0000-7000-8000-000000000012', '019f5600-0000-7000-8000-000000000c12',
    '019f5600-0000-7000-8000-000000000101', '019f5600-0000-7000-8000-000000000701',
    '019f5600-0000-7000-8000-000000000212', 'service_dispute', 24, 'coach')),
  '42501',
  'T-PRV-HIST-AUTH-04 the coach who held it cannot open a case for himself');
select is(
  pg_temp.sqlstate(pg_temp.open_sql('019f5600-0000-7000-8000-000000000014', '019f5600-0000-7000-8000-000000000c14',
    '019f5600-0000-7000-8000-000000000101', '019f5600-0000-7000-8000-000000000701',
    '019f5600-0000-7000-8000-000000000214', 'service_dispute', 24, 'staff')),
  '42501',
  'T-PRV-HIST-AUTH-05 nor can staff');
select is(
  pg_temp.sqlstate(pg_temp.open_sql('019f5600-0000-7000-8000-000000000021', '019f5600-0000-7000-8000-000000000c21',
    '019f5600-0000-7000-8000-000000000101', '019f5600-0000-7000-8000-000000000701',
    '019f5600-0000-7000-8000-000000000221', 'service_dispute', 24, 'other-gym')),
  '42501',
  'T-PRV-HIST-AUTH-06 nor the owner of another gym');

-- ---------------------------------------------------------------------------
-- What a case may say
-- ---------------------------------------------------------------------------
select is(
  pg_temp.sqlstate(pg_temp.open_sql('019f5600-0000-7000-8000-000000000011', '019f5600-0000-7000-8000-000000000c11',
    '019f5600-0000-7000-8000-000000000101', '019f5600-0000-7000-8000-000000000701',
    '019f5600-0000-7000-8000-000000000211', 'marketing', 24, 'marketing')),
  '22023',
  'T-PRV-HIST-VAL-01 marketing is not a purpose');
select is(
  pg_temp.sqlstate(pg_temp.open_sql('019f5600-0000-7000-8000-000000000011', '019f5600-0000-7000-8000-000000000c11',
    '019f5600-0000-7000-8000-000000000101', '019f5600-0000-7000-8000-000000000701',
    '019f5600-0000-7000-8000-000000000211', 'service_dispute', 25, 'long')),
  '22023',
  'T-PRV-HIST-VAL-02 a case lasts at most 24 hours');
select is(
  pg_temp.sqlstate(pg_temp.open_sql('019f5600-0000-7000-8000-000000000011', '019f5600-0000-7000-8000-000000000c11',
    '019f5600-0000-7000-8000-000000000101', '019f5600-0000-7000-8000-000000000701',
    '019f5600-0000-7000-8000-000000000211', 'service_dispute', 0, 'empty')),
  '22023',
  'T-PRV-HIST-VAL-03 and lasts at all');
select is(
  pg_temp.sqlstate(pg_temp.open_sql('019f5600-0000-7000-8000-000000000011', '019f5600-0000-7000-8000-000000000c11',
    '019f5600-0000-7000-8000-000000000101', '019f5600-0000-7000-8000-000000000702',
    '019f5600-0000-7000-8000-000000000211', 'service_dispute', 24, 'live')),
  'P0002',
  'T-PRV-HIST-VAL-04 a live relationship has no frozen history to open');
select is(
  pg_temp.sqlstate(pg_temp.open_sql('019f5600-0000-7000-8000-000000000011', '019f5600-0000-7000-8000-000000000c11',
    '019f5600-0000-7000-8000-000000000101', '019f5600-0000-7000-8000-000000000704',
    '019f5600-0000-7000-8000-000000000211', 'service_dispute', 24, 'foreign')),
  'P0002',
  'T-PRV-HIST-VAL-05 and another gym''s relationship reads as one that does not exist');
select is(
  pg_temp.sqlstate(pg_temp.open_sql('019f5600-0000-7000-8000-000000000011', '019f5600-0000-7000-8000-000000000c11',
    '019f5600-0000-7000-8000-000000000101', '019f5600-0000-7000-8000-000000000703',
    '019f5600-0000-7000-8000-000000000211', 'service_dispute', 24, 'nothing')),
  'P0004',
  'T-PRV-HIST-VAL-06 nothing is left to read when she took everything back before it ended');
select is(
  pg_temp.sqlstate(pg_temp.open_sql('019f5600-0000-7000-8000-000000000011', '019f5600-0000-7000-8000-000000000c11',
    '019f5600-0000-7000-8000-000000000101', '019f5600-0000-7000-8000-000000000701',
    '019f5600-0000-7000-8000-000000000213', 'service_dispute', 24, 'bystander')),
  '23514',
  'T-PRV-HIST-VAL-07 a coach with no part in the relationship is not eligible');
select is(
  pg_temp.sqlstate(pg_temp.open_sql('019f5600-0000-7000-8000-000000000011', '019f5600-0000-7000-8000-000000000c11',
    '019f5600-0000-7000-8000-000000000101', '019f5600-0000-7000-8000-000000000701',
    '019f5600-0000-7000-8000-000000000214', 'service_dispute', 24, 'to-staff')),
  '23514',
  'T-PRV-HIST-VAL-08 staff is never eligible');
select is(
  pg_temp.sqlstate(pg_temp.open_sql('019f5600-0000-7000-8000-000000000011', '019f5600-0000-7000-8000-000000000c11',
    '019f5600-0000-7000-8000-000000000101', '019f5600-0000-7000-8000-000000000701',
    '019f5600-0000-7000-8000-000000000216', 'service_dispute', 24, 'to-admin')),
  '23514',
  'T-PRV-HIST-VAL-09 nor is another admin: the case names herself or the former holder');
select is(
  pg_temp.sqlstate(pg_temp.open_sql('019f5600-0000-7000-8000-000000000011', '019f5600-0000-7000-8000-000000000c11',
    '019f5600-0000-7000-8000-000000000101', '019f5600-0000-7000-8000-000000000705',
    '019f5600-0000-7000-8000-000000000215', 'service_dispute', 24, 'holder-now-staff')),
  '23514',
  'T-PRV-HIST-VAL-10 nor the coach who held it, once he is only staff');

-- ---------------------------------------------------------------------------
-- Opening
-- ---------------------------------------------------------------------------
select pg_temp.open('019f5600-0000-7000-8000-000000000011', '019f5600-0000-7000-8000-000000000c11',
  '019f5600-0000-7000-8000-000000000101', '019f5600-0000-7000-8000-000000000701',
  '019f5600-0000-7000-8000-000000000211', 'service_dispute', 24, 'olivia-self') as self_case \gset

select is(:'self_case'::jsonb ->> 'status', 'open', 'T-PRV-HIST-OPEN-01 the case opens');
select ok(
  (:'self_case'::jsonb ->> 'expires_at')::timestamptz - (:'self_case'::jsonb ->> 'opened_at')::timestamptz = interval '24 hours',
  'T-PRV-HIST-OPEN-02 for the hours asked, from the instant it opened');
select is(
  :'self_case'::jsonb -> 'authorized' ->> 'membership_id', '019f5600-0000-7000-8000-000000000211',
  'T-PRV-HIST-OPEN-03 naming the membership that may read');
select is(
  :'self_case'::jsonb -> 'person' ->> 'id', '019f5600-0000-7000-8000-000000000001',
  'T-PRV-HIST-OPEN-04 and whose history it is');

select pg_temp.act('019f5600-0000-7000-8000-000000000011');
select is(
  (select replayed from privacy.open_historical_access_case(
     '019f5600-0000-7000-8000-000000000011', '019f5600-0000-7000-8000-000000000c11',
     '019f5600-0000-7000-8000-000000000101', '019f5600-0000-7000-8000-000000000701',
     '019f5600-0000-7000-8000-000000000211', 'service_dispute', 'CASE-olivia-self', 'Reason olivia-self', 24,
     ('019f5600-0000-4000-8000-' || lpad(to_hex(abs(hashtext('olivia-self'))), 12, '0'))::uuid,
     extensions.uuid_generate_v7(), extensions.digest('olivia-self', 'sha256'))),
  true,
  'T-PRV-HIST-IDEM-01 the same request again replays the case it opened');
select is(
  pg_temp.sqlstate(pg_temp.open_sql('019f5600-0000-7000-8000-000000000011', '019f5600-0000-7000-8000-000000000c11',
    '019f5600-0000-7000-8000-000000000101', '019f5600-0000-7000-8000-000000000701',
    '019f5600-0000-7000-8000-000000000211', 'service_dispute', 12, 'olivia-again')),
  '23505',
  'T-PRV-HIST-IDEM-02 a second open case for the same membership and purpose is refused');

-- Gina opens one for Camilo, who held the relationship when it ended.
select pg_temp.open('019f5600-0000-7000-8000-000000000016', '019f5600-0000-7000-8000-000000000c16',
  '019f5600-0000-7000-8000-000000000101', '019f5600-0000-7000-8000-000000000701',
  '019f5600-0000-7000-8000-000000000212', 'legal_or_regulatory_obligation', 2, 'for-camilo') as coach_case \gset
select is(
  :'coach_case'::jsonb -> 'authorized' ->> 'membership_id', '019f5600-0000-7000-8000-000000000212',
  'T-PRV-HIST-OPEN-05 the former holder can be named while his membership is active');
select is(
  :'coach_case'::jsonb -> 'opened_by' ->> 'membership_id', '019f5600-0000-7000-8000-000000000216',
  'T-PRV-HIST-OPEN-06 and the case says who opened it');
reset role;

select is(
  (select count(*)::integer from system.outbox_events
   where event_type = 'privacy.historical_access_case_opened.v1'
     and payload ->> 'relationship_id' = '019f5600-0000-7000-8000-000000000701'),
  2,
  'T-PRV-HIST-EVT-01 each opening is announced once');
select ok(
  not exists (select 1 from system.outbox_events
              where event_type = 'privacy.historical_access_case_opened.v1'
                and (payload ? 'justification' or payload ? 'case_reference')),
  'T-PRV-HIST-EVT-02 without the justification or the reference');

-- ---------------------------------------------------------------------------
-- Who lists what
-- ---------------------------------------------------------------------------
set local role allfit_api;
select is(
  cardinality(pg_temp.listed('019f5600-0000-7000-8000-000000000011', '019f5600-0000-7000-8000-000000000101')),
  2,
  'T-PRV-HIST-LIST-01 the owner lists every case of the gym');
select is(
  pg_temp.listed('019f5600-0000-7000-8000-000000000012', '019f5600-0000-7000-8000-000000000101'),
  array[(:'coach_case'::jsonb ->> 'id')::uuid],
  'T-PRV-HIST-LIST-02 the former holder lists only the case that names him');
select is(
  pg_temp.listed('019f5600-0000-7000-8000-000000000013', '019f5600-0000-7000-8000-000000000101'),
  '{}'::uuid[],
  'T-PRV-HIST-LIST-03 another coach lists nothing');
select is(
  pg_temp.listed('019f5600-0000-7000-8000-000000000014', '019f5600-0000-7000-8000-000000000101'),
  '{}'::uuid[],
  'T-PRV-HIST-LIST-04 neither does staff');
select is(
  pg_temp.sqlstate($$select pg_temp.listed('019f5600-0000-7000-8000-000000000021', '019f5600-0000-7000-8000-000000000101')$$),
  '42501',
  'T-PRV-HIST-LIST-05 and another gym''s owner is refused');
reset role;

-- ---------------------------------------------------------------------------
-- What never changes
-- ---------------------------------------------------------------------------
select is(
  pg_temp.sqlstate(format($$update privacy.historical_access_cases set justification = 'other' where id = %L$$,
    :'self_case'::jsonb ->> 'id')),
  '23514',
  'T-PRV-HIST-INT-02 what a case says is never rewritten');
select is(
  pg_temp.sqlstate(format($$delete from privacy.historical_access_cases where id = %L$$,
    :'self_case'::jsonb ->> 'id')),
  '23514',
  'T-PRV-HIST-INT-03 and a case is never deleted');
select is(
  pg_temp.sqlstate(format($$insert into privacy.historical_access_cases (
       organization_id, relationship_id, person_id, cut_at, authorized_membership_id, opened_by_membership_id,
       purpose, case_reference, justification, opened_at, expires_at)
     values ('019f5600-0000-7000-8000-000000000101', '019f5600-0000-7000-8000-000000000701',
       '019f5600-0000-7000-8000-000000000001', %L, '019f5600-0000-7000-8000-000000000211',
       '019f5600-0000-7000-8000-000000000211', 'security_investigation', 'X', 'Y',
       clock_timestamp(), clock_timestamp() + interval '25 hours')$$, :'cut')),
  '23514',
  'T-PRV-HIST-INT-04 the table itself refuses a window longer than 24 hours');

-- ---------------------------------------------------------------------------
-- Closing
-- ---------------------------------------------------------------------------
set local role allfit_api;
select is(
  pg_temp.sqlstate(format($$select pg_temp.close(%L, %L, %L, 'coach-closes')$$,
    '019f5600-0000-7000-8000-000000000012', '019f5600-0000-7000-8000-000000000101', :'coach_case'::jsonb ->> 'id')),
  '42501',
  'T-PRV-HIST-CLOSE-01 the authorized member does not close his own case');
select is(
  pg_temp.sqlstate(format($$select pg_temp.close(%L, %L, %L, 'hugo-closes')$$,
    '019f5600-0000-7000-8000-000000000021', '019f5600-0000-7000-8000-000000000101', :'coach_case'::jsonb ->> 'id')),
  '42501',
  'T-PRV-HIST-CLOSE-02 nor does another gym');
select is(
  pg_temp.sqlstate(format($$select pg_temp.close(%L, %L, %L, 'unknown')$$,
    '019f5600-0000-7000-8000-000000000011', '019f5600-0000-7000-8000-000000000101', '019f5600-0000-7000-8000-00000000ffff')),
  'P0002',
  'T-PRV-HIST-CLOSE-03 an unknown case is not found');

select pg_temp.close('019f5600-0000-7000-8000-000000000011', '019f5600-0000-7000-8000-000000000101',
  (:'coach_case'::jsonb ->> 'id')::uuid, 'olivia-closes') as closed_case \gset
select is(:'closed_case'::jsonb ->> 'status', 'closed', 'T-PRV-HIST-CLOSE-04 the owner closes it');
select is(:'closed_case'::jsonb ->> 'closed_reason', 'closed_by_manager', 'T-PRV-HIST-CLOSE-05 by hand');
select is(
  pg_temp.close('019f5600-0000-7000-8000-000000000016', '019f5600-0000-7000-8000-000000000101',
    (:'coach_case'::jsonb ->> 'id')::uuid, 'gina-closes-again') ->> 'closed_at',
  :'closed_case'::jsonb ->> 'closed_at',
  'T-PRV-HIST-CLOSE-06 closing it again converges on the first closing');
reset role;

select is(
  (select count(*)::integer from system.outbox_events
   where event_type = 'privacy.historical_access_case_closed.v1'
     and aggregate_id = (:'coach_case'::jsonb ->> 'id')::uuid),
  1,
  'T-PRV-HIST-EVT-03 the closing is announced once');
select is(
  pg_temp.sqlstate(format($$update privacy.historical_access_cases set status = 'open', closed_at = null,
       closed_reason = null, closed_by_membership_id = null where id = %L$$, :'coach_case'::jsonb ->> 'id')),
  '23514',
  'T-PRV-HIST-INT-05 a closed case never reopens');

-- A new need is a new case, with its own justification.
set local role allfit_api;
select pg_temp.open('019f5600-0000-7000-8000-000000000016', '019f5600-0000-7000-8000-000000000c16',
  '019f5600-0000-7000-8000-000000000101', '019f5600-0000-7000-8000-000000000701',
  '019f5600-0000-7000-8000-000000000212', 'legal_or_regulatory_obligation', 2, 'for-camilo-again') as second_coach_case \gset
reset role;
select isnt(
  :'second_coach_case'::jsonb ->> 'id', :'coach_case'::jsonb ->> 'id',
  'T-PRV-HIST-CLOSE-07 asking again opens a different case');

-- ---------------------------------------------------------------------------
-- A case that ran out
-- ---------------------------------------------------------------------------
-- Written as the owner would, an hour after it ran out.
select pg_temp.act('019f5600-0000-7000-8000-000000000011');
select set_config('app.actor_org_id', '019f5600-0000-7000-8000-000000000101', true),
       set_config('app.actor_membership_id', '019f5600-0000-7000-8000-000000000211', true);
insert into privacy.historical_access_cases (
  id, organization_id, relationship_id, person_id, cut_at, authorized_membership_id, opened_by_membership_id,
  purpose, case_reference, justification, opened_at, expires_at
) values (
  '019f5600-0000-7000-8000-000000000e01', '019f5600-0000-7000-8000-000000000101',
  '019f5600-0000-7000-8000-000000000701', '019f5600-0000-7000-8000-000000000001', :'cut',
  '019f5600-0000-7000-8000-000000000211', '019f5600-0000-7000-8000-000000000211',
  'authorized_quality_review', 'CASE-old', 'Old reason',
  clock_timestamp() - interval '24 hours', clock_timestamp() - interval '1 hour'
);

set local role allfit_api;
select pg_temp.act('019f5600-0000-7000-8000-000000000011');
select is(
  (select document ->> 'status' from privacy.list_historical_access_cases('019f5600-0000-7000-8000-000000000011',
     '019f5600-0000-7000-8000-000000000101', null, 50, null, null)
   where id = '019f5600-0000-7000-8000-000000000e01'),
  'expired',
  'T-PRV-HIST-EXP-01 a case past its hours reads as expired without anybody marking it');
select pg_temp.open('019f5600-0000-7000-8000-000000000011', '019f5600-0000-7000-8000-000000000c11',
  '019f5600-0000-7000-8000-000000000101', '019f5600-0000-7000-8000-000000000701',
  '019f5600-0000-7000-8000-000000000211', 'authorized_quality_review', 1, 'quality-again') as quality_case \gset
reset role;
select is(
  (select closed_reason from privacy.historical_access_cases where id = '019f5600-0000-7000-8000-000000000e01'),
  'expired',
  'T-PRV-HIST-EXP-02 opening the same again closes the expired one as expired');
select is(:'quality_case'::jsonb ->> 'status', 'open', 'T-PRV-HIST-EXP-03 and opens a fresh case');

-- ---------------------------------------------------------------------------
-- When the authorized membership stops qualifying, or she takes it back
-- ---------------------------------------------------------------------------
set local role allfit_api;
select pg_temp.open('019f5600-0000-7000-8000-000000000016', '019f5600-0000-7000-8000-000000000c16',
  '019f5600-0000-7000-8000-000000000101', '019f5600-0000-7000-8000-000000000701',
  '019f5600-0000-7000-8000-000000000216', 'security_investigation', 4, 'gina-self') as gina_case \gset
reset role;

-- Gina is no longer an admin.
update organizations.membership_roles set valid_to = clock_timestamp()
where membership_id = '019f5600-0000-7000-8000-000000000216' and role_code = 'admin';
select is(
  (select status::text || ' ' || closed_reason from privacy.historical_access_cases
   where id = (:'gina_case'::jsonb ->> 'id')::uuid),
  'closed membership_ineligible',
  'T-PRV-HIST-AUTO-01 a self-authorized admin who loses the role loses the case');

-- Camilo leaves the gym.
update organizations.organization_memberships set status = 'terminated', ended_at = clock_timestamp()
where id = '019f5600-0000-7000-8000-000000000212';
select is(
  (select status::text || ' ' || closed_reason from privacy.historical_access_cases
   where id = (:'second_coach_case'::jsonb ->> 'id')::uuid),
  'closed membership_ineligible',
  'T-PRV-HIST-AUTO-02 the former holder who leaves the gym loses his case');
select is(
  (select status::text from privacy.historical_access_cases where id = (:'self_case'::jsonb ->> 'id')::uuid),
  'open',
  'T-PRV-HIST-AUTO-03 the owner''s own case is untouched by either');

-- Ana revokes what her training froze.
set local role allfit_api;
select pg_temp.act('019f5600-0000-7000-8000-000000000001');
select status from privacy.revoke_my_grant(
  '019f5600-0000-7000-8000-000000000001', '019f5600-0000-7000-8000-000000000a01',
  '019f5600-0000-4000-8000-0000000000f1', extensions.uuid_generate_v7(), extensions.digest('ana-revokes', 'sha256'));
reset role;
select is(
  (select array_agg(distinct status::text || ' ' || closed_reason) from privacy.historical_access_cases
   where id in ((:'self_case'::jsonb ->> 'id')::uuid, (:'quality_case'::jsonb ->> 'id')::uuid)),
  array['closed grant_revoked'],
  'T-PRV-HIST-AUTO-04 revoking a frozen permission closes every open case of the relationship');
select is(
  (select count(*)::integer from system.outbox_events
   where event_type = 'privacy.historical_access_case_closed.v1'
     and payload ->> 'closed_reason' = 'grant_revoked'),
  2,
  'T-PRV-HIST-AUTO-05 and announces each closing');
select is(
  (select count(*)::integer from privacy.historical_access_cases
   where relationship_id = '019f5600-0000-7000-8000-000000000701'),
  6,
  'T-PRV-HIST-AUTO-06 every case is still there: closing deletes nothing');

-- Diana's relationship froze her training only, so her measurements name what is missing.
select pg_temp.open('019f5600-0000-7000-8000-000000000011', '019f5600-0000-7000-8000-000000000c11',
  '019f5600-0000-7000-8000-000000000101', '019f5600-0000-7000-8000-000000000705',
  '019f5600-0000-7000-8000-000000000211', 'service_dispute', 2, 'diana-self') as diana_case \gset
select pg_temp.act('019f5600-0000-7000-8000-000000000011');
select is(
  identity.list_frozen_body_progress('019f5600-0000-7000-8000-000000000011',
    '019f5600-0000-7000-8000-000000000c11', '019f5600-0000-7000-8000-000000000101',
    '019f5600-0000-7000-8000-000000000705', (:'diana_case'::jsonb ->> 'id')::uuid, 20, null, null),
  '{"outcome": "scope_required", "required_scope": {"code": "body_progress", "level": "read"}}'::jsonb,
  'T-PRV-HIST-READ-01 a category that did not freeze is named, as the live reads name it');

select * from finish();
rollback;
