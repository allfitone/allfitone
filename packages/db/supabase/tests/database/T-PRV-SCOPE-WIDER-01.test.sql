-- T-PRV-SCOPE-WIDER-01 — HU-BO-024 criterion 3: publishing a wider version does not widen
-- what somebody already granted; whoever accepted the earlier one keeps the earlier one.
--
-- `T-PRV-RLS-01` proved the half it could when it was written: versions are separately
-- addressable and a published one never changes. It left the other half for when grants
-- existed — an existing grant keeping its old version. This is that half, with a real
-- consent: she accepted version one of `body_progress`, the curator publishes a wider
-- version, and her grant still names the version she accepted and cannot be moved onto
-- the new one, because it is bound to her consent and her consent never changes.

begin;

select plan(5);

insert into identity.people (id, given_name, family_name, status)
values
  ('019cc000-0000-7000-8000-000000000001', 'Curadora', 'Uno', 'active'),
  ('019cc000-0000-7000-8000-000000000002', 'Curador', 'Dos', 'active'),
  ('019cc000-0000-7000-8000-000000000006', 'Ana', 'Acepto', 'active'),
  ('019cc000-0000-7000-8000-000000000011', 'Olivia', 'Owner', 'active');

insert into identity.access_accounts (id, provider, issuer, subject, person_id)
values
  ('019cc000-0000-7000-8000-000000000021', 'workos', 'https://issuer.test', 'wider-uno', null),
  ('019cc000-0000-7000-8000-000000000022', 'workos', 'https://issuer.test', 'wider-dos', null);

select support.bootstrap_backoffice_administrators(
  '019cc000-0000-7000-8000-000000000001', 'wider-uno',
  '019cc000-0000-7000-8000-000000000002', 'wider-dos',
  'https://issuer.test', clock_timestamp() + interval '30 days', 'CEREMONY-SCOPE-WIDER-01'
);

insert into identity.access_sessions (
  id, access_account_id, provider_session_id, surface, token_hash, token_ciphertext,
  access_token_expires_at, assurance_level, authentication_method,
  assurance_verified_at, last_activity_at, absolute_expires_at
) values (
  '019cc000-0000-7000-8000-000000000031', '019cc000-0000-7000-8000-000000000021',
  'sid_wider_uno', 'backoffice', decode(repeat('cc', 32), 'hex'), 'v1.wider-uno',
  clock_timestamp() + interval '5 minutes', 2, 'password_totp',
  clock_timestamp(), clock_timestamp(), clock_timestamp() + interval '8 hours'
);

insert into organizations.organizations (id, type_code, display_name, responsible_party)
values ('019cc000-0000-7000-8000-000000000101', 'gym', 'Wider Gym',
  '{"party_kind":"legal_entity","party_name":"Wider SAS","purpose":"studio_operations"}');
insert into organizations.organization_memberships (id, organization_id, person_id, status)
values ('019cc000-0000-7000-8000-000000000201', '019cc000-0000-7000-8000-000000000101',
  '019cc000-0000-7000-8000-000000000011', 'active');
insert into organizations.membership_roles (membership_id, role_code)
values ('019cc000-0000-7000-8000-000000000201', 'owner');

-- The version she accepts: measurements, with body photos excluded.
insert into privacy.scope_definitions (id, scope_code, version_number, status, published_at)
values ('019cc000-0000-7000-8000-000000000301', 'body_progress', 7101, 'draft', null);
insert into privacy.scope_resource_rules (
  scope_definition_id, resource, field, data_classification_code, max_action, is_excluded
) values
  ('019cc000-0000-7000-8000-000000000301', 'identity.body_progress_records', '*', 'body',
    'read', false),
  ('019cc000-0000-7000-8000-000000000301', 'identity.body_photos', '*', 'body', 'read', true);
update privacy.scope_definitions set status = 'published', published_at = clock_timestamp()
where id = '019cc000-0000-7000-8000-000000000301';

-- She accepts it: an invitation, her decision on the option, her consent and her grant.
insert into identity.invitations (
  id, organization_id, issued_by_membership_id, channel, contact,
  token_hash, token_key_version, proposal_hash, responsible_party, status, expires_at
) values (
  '019cc000-0000-7000-8000-000000000401', '019cc000-0000-7000-8000-000000000101',
  '019cc000-0000-7000-8000-000000000201', 'email', 'ana.acepto@example.test',
  extensions.digest('wider-token', 'sha256'), 1, extensions.digest('wider-proposal', 'sha256'),
  '{"party_kind":"legal_entity","party_name":"Wider SAS","purpose":"studio_operations"}',
  'completed', clock_timestamp() + interval '7 days'
);
insert into identity.invitation_intents (id, invitation_id, kind, status, proposed_role_code)
values ('019cc000-0000-7000-8000-000000000501', '019cc000-0000-7000-8000-000000000401',
  'service_relationship', 'pending', null);
insert into privacy.invitation_scope_options (
  id, invitation_intent_id, scope_definition_id, scope_code,
  offered_access_level, purpose, presented_snapshot, decision, decided_at
) values (
  '019cc000-0000-7000-8000-000000000601', '019cc000-0000-7000-8000-000000000501',
  '019cc000-0000-7000-8000-000000000301', 'body_progress', 'read',
  'Seguimiento de progreso', '{"display_name":"Progreso corporal"}'::jsonb,
  'accepted', clock_timestamp()
);
insert into relationships.service_relationships (id, person_id, organization_id, status)
values ('019cc000-0000-7000-8000-000000000701', '019cc000-0000-7000-8000-000000000006',
  '019cc000-0000-7000-8000-000000000101', 'active');
insert into privacy.consent_events (
  id, person_id, relationship_id, organization_id, invitation_scope_option_id,
  scope_definition_id, scope_code, decision, presented_snapshot
) values (
  '019cc000-0000-7000-8000-000000000801', '019cc000-0000-7000-8000-000000000006',
  '019cc000-0000-7000-8000-000000000701', '019cc000-0000-7000-8000-000000000101',
  '019cc000-0000-7000-8000-000000000601', '019cc000-0000-7000-8000-000000000301',
  'body_progress', 'accepted', '{"display_name":"Progreso corporal"}'::jsonb
);
insert into privacy.data_grants (
  id, person_id, relationship_id, organization_id, scope_definition_id, scope_code,
  consent_event_id, access_level, purpose
) values (
  '019cc000-0000-7000-8000-000000000901', '019cc000-0000-7000-8000-000000000006',
  '019cc000-0000-7000-8000-000000000701', '019cc000-0000-7000-8000-000000000101',
  '019cc000-0000-7000-8000-000000000301', 'body_progress',
  '019cc000-0000-7000-8000-000000000801', 'read', 'Seguimiento de progreso'
);

-- The curator publishes the next version, wider: body photos included.
select set_config('app.actor_kind', 'support', true),
       set_config('app.actor_person_id', '019cc000-0000-7000-8000-000000000001', true);

create temporary table wider on commit drop as
select (result->>'id')::uuid as id, (result->>'version_number')::integer as version_number
from privacy.publish_scope_definition(
  '019cc000-0000-7000-8000-000000000001', '019cc000-0000-7000-8000-000000000031',
  'body_progress',
  '[{"resource":"identity.body_progress_records","field":"*","data_classification_code":"body","max_action":"read"},
    {"resource":"identity.body_photos","field":"*","data_classification_code":"body","max_action":"read"}]',
  'cc000000-0000-4000-8000-000000000001', '019cc000-0000-7000-8000-000000000302',
  decode(repeat('cc', 32), 'hex')
);

select cmp_ok(
  (select version_number from wider),
  '>',
  7101,
  'the wider version is published after the one she accepted'
);

select is(
  (select scope_definition_id from privacy.data_grants
   where id = '019cc000-0000-7000-8000-000000000901'),
  '019cc000-0000-7000-8000-000000000301'::uuid,
  'her grant still names the version she accepted'
);

select is(
  (select count(*)::integer from privacy.scope_resource_rules
   where scope_definition_id = '019cc000-0000-7000-8000-000000000301'
     and resource = 'identity.body_photos' and is_excluded),
  1,
  'and that version still excludes her body photos'
);

select is(
  (select count(*)::integer from privacy.scope_resource_rules
   where scope_definition_id = (select id from wider)
     and resource = 'identity.body_photos' and not is_excluded),
  1,
  'while the new one includes them, so the two genuinely differ'
);

select throws_ok(
  format(
    'update privacy.data_grants set scope_definition_id = %L where id = %L',
    (select id from wider), '019cc000-0000-7000-8000-000000000901'
  ),
  '23503',
  null,
  'her grant cannot be moved onto the wider version: it is bound to her consent'
);

select * from finish();

rollback;
