-- T-IDN-AUTHORIZED-01 — OP-IDN-018, OP-IDN-019 and OP-IDN-020 (HU-STUDIO-051..053).
--
-- The coach who attends a person reads her training profile, her measurements and her
-- health context, each under its own category and only as the version she accepted says:
--
--   · Only the holder or an accepted cover reads; being admin or another gym's coach is not
--     enough, and a former client is nobody's to read.
--   · Each category stands alone: sharing training shows no body and no health.
--   · The fields served are the grant's own version's, so two gyms on two versions see two
--     shapes of the same person; a field left out is null, an exclusion beats a wildcard.
--   · The profile carries every live training claim with its origin, never a body or health
--     attribute.
--   · Every read is recorded before it answers, and so is a refused one.
begin;

select plan(43);

insert into identity.people (id, given_name, family_name, status)
values
  ('019f4900-0000-7000-8000-000000000001', 'Ana', 'Client', 'active'),
  ('019f4900-0000-7000-8000-000000000002', 'Bruno', 'Client', 'active'),
  ('019f4900-0000-7000-8000-000000000003', 'Carla', 'Former', 'active'),
  ('019f4900-0000-7000-8000-000000000004', 'Elena', 'Client', 'active'),
  ('019f4900-0000-7000-8000-000000000011', 'Olivia', 'Owner', 'active'),
  ('019f4900-0000-7000-8000-000000000012', 'Camilo', 'Coach', 'active'),
  ('019f4900-0000-7000-8000-000000000013', 'Diana', 'Cover', 'active'),
  ('019f4900-0000-7000-8000-000000000015', 'Fabio', 'Unassigned', 'active'),
  ('019f4900-0000-7000-8000-000000000016', 'Gina', 'Admin', 'active'),
  ('019f4900-0000-7000-8000-000000000021', 'Oscar', 'Owner', 'active'),
  ('019f4900-0000-7000-8000-000000000022', 'Hugo', 'Coach', 'active');

update identity.people set biological_sex = 'female' where id = '019f4900-0000-7000-8000-000000000001';

insert into organizations.organizations (id, type_code, display_name, responsible_party)
values
  ('019f4900-0000-7000-8000-000000000101', 'gym', 'Gym A',
   '{"party_kind":"legal_entity","party_name":"Gym A SAS","purpose":"studio_operations"}'),
  ('019f4900-0000-7000-8000-000000000102', 'gym', 'Gym B',
   '{"party_kind":"legal_entity","party_name":"Gym B SAS","purpose":"studio_operations"}');

insert into organizations.organization_memberships (id, organization_id, person_id, status)
values
  ('019f4900-0000-7000-8000-000000000211', '019f4900-0000-7000-8000-000000000101', '019f4900-0000-7000-8000-000000000011', 'active'),
  ('019f4900-0000-7000-8000-000000000212', '019f4900-0000-7000-8000-000000000101', '019f4900-0000-7000-8000-000000000012', 'active'),
  ('019f4900-0000-7000-8000-000000000213', '019f4900-0000-7000-8000-000000000101', '019f4900-0000-7000-8000-000000000013', 'active'),
  ('019f4900-0000-7000-8000-000000000215', '019f4900-0000-7000-8000-000000000101', '019f4900-0000-7000-8000-000000000015', 'active'),
  ('019f4900-0000-7000-8000-000000000216', '019f4900-0000-7000-8000-000000000101', '019f4900-0000-7000-8000-000000000016', 'active'),
  ('019f4900-0000-7000-8000-000000000221', '019f4900-0000-7000-8000-000000000102', '019f4900-0000-7000-8000-000000000021', 'active'),
  ('019f4900-0000-7000-8000-000000000222', '019f4900-0000-7000-8000-000000000102', '019f4900-0000-7000-8000-000000000022', 'active');

insert into organizations.membership_roles (membership_id, role_code)
values
  ('019f4900-0000-7000-8000-000000000211', 'owner'),
  ('019f4900-0000-7000-8000-000000000212', 'coach'),
  ('019f4900-0000-7000-8000-000000000213', 'coach'),
  ('019f4900-0000-7000-8000-000000000215', 'coach'),
  ('019f4900-0000-7000-8000-000000000216', 'admin'),
  ('019f4900-0000-7000-8000-000000000221', 'owner'),
  ('019f4900-0000-7000-8000-000000000222', 'coach');

-- Ana is a client of both gyms; Bruno and Elena of Gym A; Carla left Gym A.
insert into relationships.service_relationships (id, person_id, organization_id, status, started_at, ended_at, ended_reason)
values
  ('019f4900-0000-7000-8000-000000000701', '019f4900-0000-7000-8000-000000000001', '019f4900-0000-7000-8000-000000000101', 'active', clock_timestamp() - interval '90 days', null, null),
  ('019f4900-0000-7000-8000-000000000702', '019f4900-0000-7000-8000-000000000002', '019f4900-0000-7000-8000-000000000101', 'active', clock_timestamp() - interval '90 days', null, null),
  ('019f4900-0000-7000-8000-000000000703', '019f4900-0000-7000-8000-000000000003', '019f4900-0000-7000-8000-000000000101', 'terminated', clock_timestamp() - interval '90 days', clock_timestamp() - interval '1 day', 'left'),
  ('019f4900-0000-7000-8000-000000000704', '019f4900-0000-7000-8000-000000000004', '019f4900-0000-7000-8000-000000000101', 'active', clock_timestamp() - interval '90 days', null, null),
  ('019f4900-0000-7000-8000-000000000706', '019f4900-0000-7000-8000-000000000001', '019f4900-0000-7000-8000-000000000102', 'active', clock_timestamp() - interval '90 days', null, null);

insert into relationships.relationship_professional_assignments (
  id, relationship_id, person_id, organization_id, membership_id, covers_membership_id,
  kind, status, ends_on, accepted_by_person_at
) values
  ('019f4900-0000-7000-8000-000000000801', '019f4900-0000-7000-8000-000000000701', '019f4900-0000-7000-8000-000000000001',
   '019f4900-0000-7000-8000-000000000101', '019f4900-0000-7000-8000-000000000212', null, 'holder', 'active', null, null),
  ('019f4900-0000-7000-8000-000000000802', '019f4900-0000-7000-8000-000000000702', '019f4900-0000-7000-8000-000000000002',
   '019f4900-0000-7000-8000-000000000101', '019f4900-0000-7000-8000-000000000212', null, 'holder', 'active', null, null),
  ('019f4900-0000-7000-8000-000000000804', '019f4900-0000-7000-8000-000000000704', '019f4900-0000-7000-8000-000000000004',
   '019f4900-0000-7000-8000-000000000101', '019f4900-0000-7000-8000-000000000212', null, 'holder', 'active', null, null),
  ('019f4900-0000-7000-8000-000000000805', '019f4900-0000-7000-8000-000000000701', '019f4900-0000-7000-8000-000000000001',
   '019f4900-0000-7000-8000-000000000101', '019f4900-0000-7000-8000-000000000213', '019f4900-0000-7000-8000-000000000212',
   'substitute', 'active', (clock_timestamp() + interval '10 days')::date, clock_timestamp()),
  ('019f4900-0000-7000-8000-000000000807', '019f4900-0000-7000-8000-000000000706', '019f4900-0000-7000-8000-000000000001',
   '019f4900-0000-7000-8000-000000000102', '019f4900-0000-7000-8000-000000000222', null, 'holder', 'active', null, null);

-- Two versions of each category, written while drafts and then published as they are.
insert into privacy.scope_definitions (id, scope_code, version_number, status)
values
  ('019f4900-0000-7000-8000-000000000301', 'relationship_training', 4, 'draft'),
  ('019f4900-0000-7000-8000-000000000303', 'relationship_training', 3, 'draft'),
  ('019f4900-0000-7000-8000-000000000311', 'body_progress', 2, 'draft'),
  ('019f4900-0000-7000-8000-000000000312', 'body_progress', 1, 'draft'),
  ('019f4900-0000-7000-8000-000000000321', 'health_context', 1, 'draft'),
  ('019f4900-0000-7000-8000-000000000322', 'health_context', 2, 'draft'),
  ('019f4900-0000-7000-8000-000000000313', 'body_progress', 5, 'draft'),
  ('019f4900-0000-7000-8000-000000000323', 'health_context', 3, 'draft');

insert into privacy.scope_resource_rules (scope_definition_id, resource, field, data_classification_code, max_action, is_excluded)
select definition, resource, field, classification, 'read', excluded
from (values
  ('019f4900-0000-7000-8000-000000000301'::uuid, 'identity.fitness_profile_claims', 'attribute_code', 'training', false),
  ('019f4900-0000-7000-8000-000000000301', 'identity.fitness_profile_claims', 'value_text', 'training', false),
  ('019f4900-0000-7000-8000-000000000301', 'identity.fitness_profile_claims', 'value_numeric', 'training', false),
  ('019f4900-0000-7000-8000-000000000301', 'identity.fitness_profile_claims', 'unit_code', 'training', false),
  ('019f4900-0000-7000-8000-000000000301', 'identity.fitness_profile_claims', 'provenance', 'training', false),
  ('019f4900-0000-7000-8000-000000000301', 'identity.fitness_profile_claims', 'valid_from', 'training', false),
  ('019f4900-0000-7000-8000-000000000301', 'identity.people', 'biological_sex', 'training', false),
  ('019f4900-0000-7000-8000-000000000301', 'identity.body_progress_records', '*', 'body', true),
  ('019f4900-0000-7000-8000-000000000301', 'identity.health_context_claims', '*', 'health', true),
  ('019f4900-0000-7000-8000-000000000303', 'identity.fitness_profile_claims', 'attribute_code', 'training', false),
  ('019f4900-0000-7000-8000-000000000303', 'identity.fitness_profile_claims', 'value_text', 'training', false),
  ('019f4900-0000-7000-8000-000000000311', 'identity.body_progress_records', 'metric_code', 'body', false),
  ('019f4900-0000-7000-8000-000000000311', 'identity.body_progress_records', 'value_numeric', 'body', false),
  ('019f4900-0000-7000-8000-000000000311', 'identity.body_progress_records', 'unit_code', 'body', false),
  ('019f4900-0000-7000-8000-000000000311', 'identity.body_progress_records', 'original_value', 'body', false),
  ('019f4900-0000-7000-8000-000000000311', 'identity.body_progress_records', 'original_unit_code', 'body', false),
  ('019f4900-0000-7000-8000-000000000311', 'identity.body_progress_records', 'measured_on', 'body', false),
  ('019f4900-0000-7000-8000-000000000311', 'identity.body_progress_records', 'media_ref', 'body', true),
  ('019f4900-0000-7000-8000-000000000312', 'identity.body_progress_records', 'metric_code', 'body', false),
  ('019f4900-0000-7000-8000-000000000312', 'identity.body_progress_records', 'value_numeric', 'body', false),
  ('019f4900-0000-7000-8000-000000000312', 'identity.body_progress_records', 'unit_code', 'body', false),
  ('019f4900-0000-7000-8000-000000000312', 'identity.body_progress_records', 'measured_on', 'body', false),
  ('019f4900-0000-7000-8000-000000000321', 'identity.health_context_claims', 'context_type', 'health', false),
  ('019f4900-0000-7000-8000-000000000321', 'identity.health_context_claims', 'description', 'health', false),
  ('019f4900-0000-7000-8000-000000000321', 'identity.health_context_claims', 'body_area', 'health', false),
  ('019f4900-0000-7000-8000-000000000321', 'identity.health_context_claims', 'provenance', 'health', false),
  ('019f4900-0000-7000-8000-000000000321', 'identity.health_context_claims', 'valid_from', 'health', false),
  ('019f4900-0000-7000-8000-000000000321', 'identity.health_context_claims', 'valid_to', 'health', false),
  ('019f4900-0000-7000-8000-000000000322', 'identity.health_context_claims', '*', 'health', false),
  ('019f4900-0000-7000-8000-000000000322', 'identity.health_context_claims', 'description', 'health', true),
  ('019f4900-0000-7000-8000-000000000313', 'identity.body_progress_records', 'metric_code', 'body', false),
  ('019f4900-0000-7000-8000-000000000313', 'identity.body_progress_records', 'value_numeric', 'body', false),
  ('019f4900-0000-7000-8000-000000000323', 'identity.health_context_claims', 'context_type', 'health', false),
  ('019f4900-0000-7000-8000-000000000323', 'identity.health_context_claims', 'description', 'health', false)
) as rule (definition, resource, field, classification, excluded);

update privacy.scope_definitions set status = 'published', published_at = clock_timestamp()
where id::text like '019f4900-0000-7000-8000-0000000003%';

-- What each gym offered: Gym A the newer versions, Gym B the older ones.
insert into identity.invitations (
  id, organization_id, issued_by_membership_id, channel, contact,
  token_hash, token_key_version, proposal_hash, responsible_party, status, expires_at
) values
  ('019f4900-0000-7000-8000-000000000401', '019f4900-0000-7000-8000-000000000101',
   '019f4900-0000-7000-8000-000000000211', 'email', 'ana-a@example.test',
   extensions.digest('profile-token-a', 'sha256'), 1, extensions.digest('profile-proposal-a', 'sha256'),
   '{"party_kind":"legal_entity","party_name":"Gym A SAS","purpose":"studio_operations"}',
   'completed', clock_timestamp() + interval '7 days'),
  ('019f4900-0000-7000-8000-000000000402', '019f4900-0000-7000-8000-000000000102',
   '019f4900-0000-7000-8000-000000000221', 'email', 'ana-b@example.test',
   extensions.digest('profile-token-b', 'sha256'), 1, extensions.digest('profile-proposal-b', 'sha256'),
   '{"party_kind":"legal_entity","party_name":"Gym B SAS","purpose":"studio_operations"}',
   'completed', clock_timestamp() + interval '7 days'),
  ('019f4900-0000-7000-8000-000000000403', '019f4900-0000-7000-8000-000000000101',
   '019f4900-0000-7000-8000-000000000211', 'email', 'elena@example.test',
   extensions.digest('profile-token-e', 'sha256'), 1, extensions.digest('profile-proposal-e', 'sha256'),
   '{"party_kind":"legal_entity","party_name":"Gym A SAS","purpose":"studio_operations"}',
   'completed', clock_timestamp() + interval '7 days');
insert into identity.invitation_intents (id, invitation_id, kind, status, proposed_role_code)
values
  ('019f4900-0000-7000-8000-000000000501', '019f4900-0000-7000-8000-000000000401', 'service_relationship', 'pending', null),
  ('019f4900-0000-7000-8000-000000000502', '019f4900-0000-7000-8000-000000000402', 'service_relationship', 'pending', null),
  ('019f4900-0000-7000-8000-000000000503', '019f4900-0000-7000-8000-000000000403', 'service_relationship', 'pending', null);
insert into privacy.invitation_scope_options (
  id, invitation_intent_id, scope_definition_id, scope_code,
  offered_access_level, purpose, presented_snapshot, decision, decided_at
)
select option, intent, definition, scope, 'read', 'Plan the training', '{"title":"Shared"}'::jsonb,
       'accepted', clock_timestamp()
from (values
  ('019f4900-0000-7000-8000-000000000601'::uuid, '019f4900-0000-7000-8000-000000000501'::uuid, '019f4900-0000-7000-8000-000000000301'::uuid, 'relationship_training'),
  ('019f4900-0000-7000-8000-000000000611', '019f4900-0000-7000-8000-000000000501', '019f4900-0000-7000-8000-000000000311', 'body_progress'),
  ('019f4900-0000-7000-8000-000000000621', '019f4900-0000-7000-8000-000000000501', '019f4900-0000-7000-8000-000000000321', 'health_context'),
  ('019f4900-0000-7000-8000-000000000603', '019f4900-0000-7000-8000-000000000502', '019f4900-0000-7000-8000-000000000303', 'relationship_training'),
  ('019f4900-0000-7000-8000-000000000612', '019f4900-0000-7000-8000-000000000502', '019f4900-0000-7000-8000-000000000312', 'body_progress'),
  ('019f4900-0000-7000-8000-000000000622', '019f4900-0000-7000-8000-000000000502', '019f4900-0000-7000-8000-000000000322', 'health_context'),
  ('019f4900-0000-7000-8000-000000000613', '019f4900-0000-7000-8000-000000000503', '019f4900-0000-7000-8000-000000000313', 'body_progress'),
  ('019f4900-0000-7000-8000-000000000623', '019f4900-0000-7000-8000-000000000503', '019f4900-0000-7000-8000-000000000323', 'health_context')
) as offered (option, intent, definition, scope);

create function pg_temp.share(relationship uuid, grant_id uuid, chosen uuid)
returns void language plpgsql as $$
declare
  subject record;
  offered record;
begin
  select person_id, organization_id into subject
  from relationships.service_relationships where id = relationship;
  select id, scope_definition_id, scope_code into offered
  from privacy.invitation_scope_options where id = chosen;
  insert into privacy.consent_events (
    id, person_id, relationship_id, organization_id, invitation_scope_option_id,
    scope_definition_id, scope_code, decision, presented_snapshot
  ) values (
    grant_id, subject.person_id, relationship, subject.organization_id, offered.id,
    offered.scope_definition_id, offered.scope_code, 'accepted', '{"title":"Shared"}'::jsonb
  );
  insert into privacy.data_grants (
    id, person_id, relationship_id, organization_id, scope_definition_id, scope_code,
    consent_event_id, access_level, purpose
  ) values (
    grant_id, subject.person_id, relationship, subject.organization_id,
    offered.scope_definition_id, offered.scope_code, grant_id, 'read', 'Plan the training'
  );
end
$$;

-- Ana shares all three with both gyms; Bruno shares training only; Elena, a body and a health
-- version that leave out the day.
select pg_temp.share('019f4900-0000-7000-8000-000000000701', '019f4900-0000-7000-8000-000000000a01', '019f4900-0000-7000-8000-000000000601');
select pg_temp.share('019f4900-0000-7000-8000-000000000701', '019f4900-0000-7000-8000-000000000a11', '019f4900-0000-7000-8000-000000000611');
select pg_temp.share('019f4900-0000-7000-8000-000000000701', '019f4900-0000-7000-8000-000000000a21', '019f4900-0000-7000-8000-000000000621');
select pg_temp.share('019f4900-0000-7000-8000-000000000706', '019f4900-0000-7000-8000-000000000a03', '019f4900-0000-7000-8000-000000000603');
select pg_temp.share('019f4900-0000-7000-8000-000000000706', '019f4900-0000-7000-8000-000000000a12', '019f4900-0000-7000-8000-000000000612');
select pg_temp.share('019f4900-0000-7000-8000-000000000706', '019f4900-0000-7000-8000-000000000a22', '019f4900-0000-7000-8000-000000000622');
select pg_temp.share('019f4900-0000-7000-8000-000000000702', '019f4900-0000-7000-8000-000000000a31', '019f4900-0000-7000-8000-000000000601');
select pg_temp.share('019f4900-0000-7000-8000-000000000704', '019f4900-0000-7000-8000-000000000a41', '019f4900-0000-7000-8000-000000000613');
select pg_temp.share('019f4900-0000-7000-8000-000000000704', '019f4900-0000-7000-8000-000000000a42', '019f4900-0000-7000-8000-000000000623');

-- What she declared. A pulse is classified health, so no training profile carries it.
insert into identity.profile_attributes (code, name, data_classification_code, value_kind, allowed_values)
values ('test_resting_pulse', 'Pulso en reposo', 'health', 'numeric', null);

insert into identity.fitness_profile_claims (id, person_id, attribute_code, value_text, value_numeric, provenance, captured_by_kind, valid_from, valid_to)
values
  ('019f4900-0000-7000-8000-000000000c01', '019f4900-0000-7000-8000-000000000001', 'primary_training_goal', 'build_muscle', null, 'person_declared', 'person', clock_timestamp() - interval '10 days', null),
  ('019f4900-0000-7000-8000-000000000c02', '019f4900-0000-7000-8000-000000000001', 'training_experience', 'some_practice', null, 'person_declared', 'person', clock_timestamp() - interval '20 days', null),
  ('019f4900-0000-7000-8000-000000000c03', '019f4900-0000-7000-8000-000000000001', 'training_experience', 'experienced', null, 'professional_observation', 'professional', clock_timestamp() - interval '5 days', null),
  ('019f4900-0000-7000-8000-000000000c04', '019f4900-0000-7000-8000-000000000001', 'focus_areas', 'legs', null, 'person_declared', 'person', clock_timestamp() - interval '8 days', null),
  ('019f4900-0000-7000-8000-000000000c05', '019f4900-0000-7000-8000-000000000001', 'focus_areas', 'glutes', null, 'person_declared', 'person', clock_timestamp() - interval '7 days', null),
  ('019f4900-0000-7000-8000-000000000c06', '019f4900-0000-7000-8000-000000000001', 'primary_training_goal', 'lose_weight', null, 'person_declared', 'person', clock_timestamp() - interval '60 days', clock_timestamp() - interval '10 days'),
  ('019f4900-0000-7000-8000-000000000c07', '019f4900-0000-7000-8000-000000000001', 'test_resting_pulse', null, 58, 'person_declared', 'person', clock_timestamp() - interval '3 days', null),
  ('019f4900-0000-7000-8000-000000000c09', '019f4900-0000-7000-8000-000000000002', 'primary_training_goal', 'get_fit', null, 'person_declared', 'person', clock_timestamp() - interval '3 days', null);

insert into identity.body_progress_records (id, person_id, metric_code, value_numeric, unit_code, original_value, original_unit_code, measured_on)
values
  ('019f4900-0000-7000-8000-000000000b01', '019f4900-0000-7000-8000-000000000001', 'body_weight', 70, 'kg', 154.32, 'lb', current_date - 1),
  ('019f4900-0000-7000-8000-000000000b02', '019f4900-0000-7000-8000-000000000001', 'waist', 80, 'cm', null, null, current_date - 1),
  ('019f4900-0000-7000-8000-000000000b03', '019f4900-0000-7000-8000-000000000001', 'body_weight', 72, 'kg', null, null, current_date - 30),
  ('019f4900-0000-7000-8000-000000000b09', '019f4900-0000-7000-8000-000000000002', 'body_weight', 90, 'kg', null, null, current_date - 1),
  ('019f4900-0000-7000-8000-000000000b10', '019f4900-0000-7000-8000-000000000004', 'body_weight', 60, 'kg', null, null, current_date - 1);

insert into identity.health_context_claims (id, person_id, context_type, description, body_area, provenance, valid_from, valid_to)
values
  ('019f4900-0000-7000-8000-000000000d01', '019f4900-0000-7000-8000-000000000001', 'pain', 'Me duele al bajar escaleras', 'knee', 'person_declared', clock_timestamp() - interval '5 days', null),
  ('019f4900-0000-7000-8000-000000000d02', '019f4900-0000-7000-8000-000000000001', 'limitation', 'Sin saltos por ahora', null, 'person_declared', clock_timestamp() - interval '20 days', null),
  ('019f4900-0000-7000-8000-000000000d03', '019f4900-0000-7000-8000-000000000001', 'recovery', 'Duermo poco', null, 'person_declared', clock_timestamp() - interval '40 days', clock_timestamp() - interval '30 days'),
  ('019f4900-0000-7000-8000-000000000d10', '019f4900-0000-7000-8000-000000000004', 'pain', 'Hombro', 'shoulder', 'person_declared', clock_timestamp() - interval '2 days', null);

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
exception when others then
  return sqlstate;
end
$$;

create function pg_temp.ids(document jsonb, field text) returns uuid[] language sql as $$
  select coalesce(array_agg((element ->> 'id')::uuid order by position), '{}')
  from jsonb_array_elements(document -> field) with ordinality as listed (element, position)
$$;

select clock_timestamp() as epoch \gset

-- ---------------------------------------------------------------------------
-- OP-IDN-018: the training profile
-- ---------------------------------------------------------------------------
set local role allfit_api;
select pg_temp.act('019f4900-0000-7000-8000-000000000012');
select current_setting('app.request_id') as camilo_profile \gset
select identity.read_client_training_profile('019f4900-0000-7000-8000-000000000012',
  '019f4900-0000-7000-8000-000000000101', '019f4900-0000-7000-8000-000000000001') as profile_a \gset
select pg_temp.act('019f4900-0000-7000-8000-000000000022');
select identity.read_client_training_profile('019f4900-0000-7000-8000-000000000022',
  '019f4900-0000-7000-8000-000000000102', '019f4900-0000-7000-8000-000000000001') as profile_b \gset
reset role;

select is(
  (:'profile_a'::jsonb ->> 'outcome') || ' ' || (:'profile_a'::jsonb ->> 'scope_version'),
  'found 4',
  'T-IDN-AUTHORIZED-API-01 the holder reads her profile under the version she accepted');
select is(
  pg_temp.ids(:'profile_a'::jsonb, 'attributes'),
  array['019f4900-0000-7000-8000-000000000c05', '019f4900-0000-7000-8000-000000000c04',
        '019f4900-0000-7000-8000-000000000c01',
        '019f4900-0000-7000-8000-000000000c03', '019f4900-0000-7000-8000-000000000c02']::uuid[],
  'T-IDN-AUTHORIZED-API-02 every live training claim, by attribute and newest first; not a superseded one');
select results_eq(
  format($sql$select element ->> 'attribute_code', element ->> 'value_text', element ->> 'provenance'
              from jsonb_array_elements(%L::jsonb -> 'attributes') as element
              where element ->> 'attribute_code' = 'training_experience'$sql$, :'profile_a'),
  $$values ('training_experience', 'experienced', 'professional_observation'),
           ('training_experience', 'some_practice', 'person_declared')$$,
  'T-IDN-AUTHORIZED-API-03 each claim says where it came from, and coexisting claims are both shown');
select is(
  :'profile_a'::jsonb -> 'biological_sex',
  '{"value": "female", "provenance": "person_declared"}'::jsonb,
  'T-IDN-AUTHORIZED-API-04 her biological sex is part of the training profile');
select is(
  (select count(*)::integer from jsonb_array_elements(:'profile_a'::jsonb -> 'attributes') as element
   where element ->> 'attribute_code' not in ('primary_training_goal', 'training_experience', 'focus_areas', 'training_discipline')),
  0,
  'T-IDN-AUTHORIZED-API-05 no attribute classified body or health is in it');
select results_eq(
  format($sql$select element ->> 'value_text', element -> 'provenance', element -> 'valid_from'
              from jsonb_array_elements(%L::jsonb -> 'attributes') as element
              where element ->> 'id' = '019f4900-0000-7000-8000-000000000c01'$sql$, :'profile_b'),
  $$values ('build_muscle', 'null'::jsonb, 'null'::jsonb)$$,
  'T-IDN-AUTHORIZED-API-06 Gym B, on the version she accepted there, gets the value without its origin');
select is(
  :'profile_b'::jsonb -> 'biological_sex',
  'null'::jsonb,
  'T-IDN-AUTHORIZED-API-07 and no biological sex: a field the version leaves out is null');
select results_eq(
  format($sql$select data_grant_id, scope_code, scope_version, relationship_id, resource, actor_membership_id, result, purpose
              from privacy.access_events where request_id = %L$sql$, :'camilo_profile'),
  $$values ('019f4900-0000-7000-8000-000000000a01'::uuid, 'relationship_training', 4,
            '019f4900-0000-7000-8000-000000000701'::uuid, 'identity.fitness_profile_claims',
            '019f4900-0000-7000-8000-000000000212'::uuid, 'allowed', 'studio_profile_review')$$,
  'T-IDN-AUTHORIZED-API-08 the read is recorded with the grant and the version it used');

set local role allfit_api;
select pg_temp.act('019f4900-0000-7000-8000-000000000013');
select is(
  identity.read_client_training_profile('019f4900-0000-7000-8000-000000000013',
    '019f4900-0000-7000-8000-000000000101', '019f4900-0000-7000-8000-000000000001') ->> 'outcome',
  'found',
  'T-IDN-AUTHORIZED-API-09 an accepted cover reads it too');
select pg_temp.act('019f4900-0000-7000-8000-000000000015');
select is(
  pg_temp.sqlstate($$select identity.read_client_training_profile('019f4900-0000-7000-8000-000000000015',
    '019f4900-0000-7000-8000-000000000101', '019f4900-0000-7000-8000-000000000001')$$),
  'P0002',
  'T-IDN-AUTHORIZED-API-10 a coach who does not attend her finds no client');
select pg_temp.act('019f4900-0000-7000-8000-000000000016');
select is(
  pg_temp.sqlstate($$select identity.read_client_training_profile('019f4900-0000-7000-8000-000000000016',
    '019f4900-0000-7000-8000-000000000101', '019f4900-0000-7000-8000-000000000001')$$),
  'P0002',
  'T-IDN-AUTHORIZED-API-11 neither does an admin who is not her coach');
select pg_temp.act('019f4900-0000-7000-8000-000000000022');
select is(
  pg_temp.sqlstate($$select identity.read_client_training_profile('019f4900-0000-7000-8000-000000000022',
    '019f4900-0000-7000-8000-000000000101', '019f4900-0000-7000-8000-000000000001')$$),
  '42501',
  'T-IDN-AUTHORIZED-API-12 another gym''s coach has no membership to read through');
select pg_temp.act('019f4900-0000-7000-8000-000000000012');
select is(
  pg_temp.sqlstate($$select identity.read_client_training_profile('019f4900-0000-7000-8000-000000000012',
    '019f4900-0000-7000-8000-000000000101', '019f4900-0000-7000-8000-000000000003')$$),
  'P0002',
  'T-IDN-AUTHORIZED-API-13 a former client is nobody''s to read');
select pg_temp.act('019f4900-0000-7000-8000-000000000012');
select set_config('app.request_id', '', true);
select is(
  pg_temp.sqlstate($$select identity.read_client_training_profile('019f4900-0000-7000-8000-000000000012',
    '019f4900-0000-7000-8000-000000000101', '019f4900-0000-7000-8000-000000000001')$$),
  '22023',
  'T-IDN-AUTHORIZED-API-14 a read that cannot be recorded does not happen');
reset role;

-- ---------------------------------------------------------------------------
-- Each category stands alone
-- ---------------------------------------------------------------------------
set local role allfit_api;
select pg_temp.act('019f4900-0000-7000-8000-000000000012');
select current_setting('app.request_id') as bruno_body \gset
select is(
  identity.read_client_training_profile('019f4900-0000-7000-8000-000000000012',
    '019f4900-0000-7000-8000-000000000101', '019f4900-0000-7000-8000-000000000002') ->> 'outcome',
  'found',
  'T-IDN-AUTHORIZED-API-15 Bruno shares his training, so his profile is read');
select is(
  identity.list_client_body_progress('019f4900-0000-7000-8000-000000000012',
    '019f4900-0000-7000-8000-000000000101', '019f4900-0000-7000-8000-000000000002', 20, null, null),
  '{"outcome": "scope_required", "scope": "body_progress"}'::jsonb,
  'T-IDN-AUTHORIZED-API-16 but sharing training shows no body: the read names the category it needs');
select is(
  identity.list_client_health_context('019f4900-0000-7000-8000-000000000012',
    '019f4900-0000-7000-8000-000000000101', '019f4900-0000-7000-8000-000000000002', 20, null, null),
  '{"outcome": "scope_required", "scope": "health_context"}'::jsonb,
  'T-IDN-AUTHORIZED-API-17 and no health context');
reset role;
select results_eq(
  format($sql$select data_grant_id, scope_code, scope_version, resource, result
              from privacy.access_events where request_id = %L order by resource$sql$, :'bruno_body'),
  $$values (null::uuid, 'body_progress', null::integer, 'identity.body_progress_records', 'denied'),
           ('019f4900-0000-7000-8000-000000000a31'::uuid, 'relationship_training', 4, 'identity.fitness_profile_claims', 'allowed'),
           (null::uuid, 'health_context', null::integer, 'identity.health_context_claims', 'denied')$$,
  'T-IDN-AUTHORIZED-API-18 each refusal stays on his record, naming the category');

-- ---------------------------------------------------------------------------
-- OP-IDN-019: body progress
-- ---------------------------------------------------------------------------
set local role allfit_api;
select pg_temp.act('019f4900-0000-7000-8000-000000000012');
select current_setting('app.request_id') as camilo_body \gset
select identity.list_client_body_progress('019f4900-0000-7000-8000-000000000012',
  '019f4900-0000-7000-8000-000000000101', '019f4900-0000-7000-8000-000000000001', 20, null, null) as body_a \gset
select pg_temp.act('019f4900-0000-7000-8000-000000000022');
select identity.list_client_body_progress('019f4900-0000-7000-8000-000000000022',
  '019f4900-0000-7000-8000-000000000102', '019f4900-0000-7000-8000-000000000001', 20, null, null) as body_b \gset
reset role;

select is(
  pg_temp.ids(:'body_a'::jsonb, 'items'),
  array['019f4900-0000-7000-8000-000000000b02', '019f4900-0000-7000-8000-000000000b01',
        '019f4900-0000-7000-8000-000000000b03']::uuid[],
  'T-IDN-AUTHORIZED-API-19 her measurements, newest day first, and nobody else''s');
select is(
  (select element from jsonb_array_elements(:'body_a'::jsonb -> 'items') as element
   where element ->> 'id' = '019f4900-0000-7000-8000-000000000b01'),
  jsonb_build_object('id', '019f4900-0000-7000-8000-000000000b01', 'metric_code', 'body_weight',
    'value', 70, 'unit_code', 'kg', 'original_value', 154.32, 'original_unit_code', 'lb',
    'measured_on', current_date - 1),
  'T-IDN-AUTHORIZED-API-20 each in its canonical unit and as she typed it');
select results_eq(
  format($sql$select element -> 'value', element -> 'original_value', element -> 'original_unit_code'
              from jsonb_array_elements(%L::jsonb -> 'items') as element
              where element ->> 'id' = '019f4900-0000-7000-8000-000000000b01'$sql$, :'body_b'),
  $$values ('70'::jsonb, 'null'::jsonb, 'null'::jsonb)$$,
  'T-IDN-AUTHORIZED-API-21 Gym B''s version carries the value but not what she typed');
select results_eq(
  format($sql$select data_grant_id, scope_version, resource, result from privacy.access_events where request_id = %L$sql$, :'camilo_body'),
  $$values ('019f4900-0000-7000-8000-000000000a11'::uuid, 2, 'identity.body_progress_records', 'allowed')$$,
  'T-IDN-AUTHORIZED-API-22 the read of her body is recorded under the body grant');

set local role allfit_api;
select pg_temp.act('019f4900-0000-7000-8000-000000000012');
select is(
  pg_temp.ids(identity.list_client_body_progress('019f4900-0000-7000-8000-000000000012',
    '019f4900-0000-7000-8000-000000000101', '019f4900-0000-7000-8000-000000000001', 2, null, null), 'items'),
  array['019f4900-0000-7000-8000-000000000b02', '019f4900-0000-7000-8000-000000000b01']::uuid[],
  'T-IDN-AUTHORIZED-API-23 a page holds as many as asked');
select is(
  pg_temp.ids(identity.list_client_body_progress('019f4900-0000-7000-8000-000000000012',
    '019f4900-0000-7000-8000-000000000101', '019f4900-0000-7000-8000-000000000001', 2,
    current_date - 1, '019f4900-0000-7000-8000-000000000b01'), 'items'),
  array['019f4900-0000-7000-8000-000000000b03']::uuid[],
  'T-IDN-AUTHORIZED-API-24 and the next one starts after the last it gave');
reset role;

-- ---------------------------------------------------------------------------
-- OP-IDN-020: health context
-- ---------------------------------------------------------------------------
set local role allfit_api;
select pg_temp.act('019f4900-0000-7000-8000-000000000012');
select current_setting('app.request_id') as camilo_health \gset
select identity.list_client_health_context('019f4900-0000-7000-8000-000000000012',
  '019f4900-0000-7000-8000-000000000101', '019f4900-0000-7000-8000-000000000001', 20, null, null) as health_a \gset
select pg_temp.act('019f4900-0000-7000-8000-000000000022');
select identity.list_client_health_context('019f4900-0000-7000-8000-000000000022',
  '019f4900-0000-7000-8000-000000000102', '019f4900-0000-7000-8000-000000000001', 20, null, null) as health_b \gset
reset role;

select date_trunc('milliseconds', valid_from) as d01_ms from identity.health_context_claims
where id = '019f4900-0000-7000-8000-000000000d01' \gset
select date_trunc('milliseconds', valid_from) as d02_ms from identity.health_context_claims
where id = '019f4900-0000-7000-8000-000000000d02' \gset

select is(
  pg_temp.ids(:'health_a'::jsonb, 'items'),
  array['019f4900-0000-7000-8000-000000000d01', '019f4900-0000-7000-8000-000000000d02',
        '019f4900-0000-7000-8000-000000000d03']::uuid[],
  'T-IDN-AUTHORIZED-API-25 what she declared, newest first, including what no longer holds');
select results_eq(
  format($sql$select element ->> 'context_type', element ->> 'description', element ->> 'body_area',
                     element ->> 'provenance', (element ->> 'valid_from')::timestamptz, element -> 'valid_to'
              from jsonb_array_elements(%L::jsonb -> 'items') as element
              where element ->> 'id' = '019f4900-0000-7000-8000-000000000d01'$sql$, :'health_a'),
  format($sql$values ('pain', 'Me duele al bajar escaleras', 'knee', 'person_declared', %L::timestamptz, 'null'::jsonb)$sql$, :'d01_ms'),
  'T-IDN-AUTHORIZED-API-26 a pain with its area, its origin and since when');
select is(
  (select array_agg(element -> 'description' order by element ->> 'id')
   from jsonb_array_elements(:'health_b'::jsonb -> 'items') as element),
  array['null'::jsonb, 'null'::jsonb, 'null'::jsonb],
  'T-IDN-AUTHORIZED-API-27 Gym B''s version shares everything but the words: the exclusion wins');
select is(
  (select element ->> 'body_area' from jsonb_array_elements(:'health_b'::jsonb -> 'items') as element
   where element ->> 'id' = '019f4900-0000-7000-8000-000000000d01'),
  'knee',
  'T-IDN-AUTHORIZED-API-28 while the wildcard still shares the rest');
select results_eq(
  format($sql$select data_grant_id, scope_version, resource, result from privacy.access_events where request_id = %L$sql$, :'camilo_health'),
  $$values ('019f4900-0000-7000-8000-000000000a21'::uuid, 1, 'identity.health_context_claims', 'allowed')$$,
  'T-IDN-AUTHORIZED-API-29 the read of her health is recorded under the health grant');

set local role allfit_api;
select pg_temp.act('019f4900-0000-7000-8000-000000000012');
select is(
  pg_temp.ids(identity.list_client_health_context('019f4900-0000-7000-8000-000000000012',
    '019f4900-0000-7000-8000-000000000101', '019f4900-0000-7000-8000-000000000001', 1,
    :'d01_ms'::timestamptz, '019f4900-0000-7000-8000-000000000d01'), 'items'),
  array['019f4900-0000-7000-8000-000000000d02']::uuid[],
  'T-IDN-AUTHORIZED-API-30 a page of her health starts after the last it gave');
reset role;

-- A version that hides the day shares no row: a page boundary would give the day away.
set local role allfit_api;
select pg_temp.act('019f4900-0000-7000-8000-000000000012');
select is(
  identity.list_client_body_progress('019f4900-0000-7000-8000-000000000012',
    '019f4900-0000-7000-8000-000000000101', '019f4900-0000-7000-8000-000000000004', 20, null, null) -> 'items',
  '[]'::jsonb,
  'T-IDN-AUTHORIZED-API-34 a body version without the day lists no measurement');
select is(
  identity.list_client_health_context('019f4900-0000-7000-8000-000000000012',
    '019f4900-0000-7000-8000-000000000101', '019f4900-0000-7000-8000-000000000004', 20, null, null) -> 'items',
  '[]'::jsonb,
  'T-IDN-AUTHORIZED-API-35 nor does a health version without since when');
reset role;

-- Revoking stops the next read at once, and the attempt is still recorded.
update privacy.data_grants set status = 'revoked', revoked_at = clock_timestamp()
where id = '019f4900-0000-7000-8000-000000000a21';
set local role allfit_api;
select pg_temp.act('019f4900-0000-7000-8000-000000000012');
select current_setting('app.request_id') as revoked_health \gset
select is(
  identity.list_client_health_context('019f4900-0000-7000-8000-000000000012',
    '019f4900-0000-7000-8000-000000000101', '019f4900-0000-7000-8000-000000000001', 20, null, null),
  '{"outcome": "scope_required", "scope": "health_context"}'::jsonb,
  'T-IDN-AUTHORIZED-API-31 once she revokes it, her health context is not shared any more');
reset role;
select results_eq(
  format($sql$select data_grant_id, scope_code, result from privacy.access_events where request_id = %L$sql$, :'revoked_health'),
  $$values (null::uuid, 'health_context', 'denied')$$,
  'T-IDN-AUTHORIZED-API-32 and the refused read is recorded');

-- ---------------------------------------------------------------------------
-- The page cap
-- ---------------------------------------------------------------------------
insert into identity.body_progress_records (id, person_id, metric_code, value_numeric, unit_code, measured_on)
select gen_random_uuid(), '019f4900-0000-7000-8000-000000000001', 'body_fat', 20, 'percent', current_date - 100 - day
from generate_series(1, 101) as day;
set local role allfit_api;
select pg_temp.act('019f4900-0000-7000-8000-000000000012');
select is(
  jsonb_array_length(identity.list_client_body_progress('019f4900-0000-7000-8000-000000000012',
    '019f4900-0000-7000-8000-000000000101', '019f4900-0000-7000-8000-000000000001', 1000, null, null) -> 'items'),
  101,
  'T-IDN-AUTHORIZED-API-33 no page holds more than one hundred and one');
reset role;

-- ---------------------------------------------------------------------------
-- What a version shares
-- ---------------------------------------------------------------------------
select ok(
  privacy.scope_allows('019f4900-0000-7000-8000-000000000301', 'identity.fitness_profile_claims', 'provenance'),
  'T-IDN-AUTHORIZED-UNIT-01 a rule for the field shares it');
select ok(
  privacy.scope_allows('019f4900-0000-7000-8000-000000000322', 'identity.health_context_claims', 'body_area'),
  'T-IDN-AUTHORIZED-UNIT-02 a rule for the whole resource shares each field');
select ok(
  not privacy.scope_allows('019f4900-0000-7000-8000-000000000322', 'identity.health_context_claims', 'description'),
  'T-IDN-AUTHORIZED-UNIT-03 an exclusion of the field beats the wildcard');
select ok(
  not privacy.scope_allows('019f4900-0000-7000-8000-000000000301', 'identity.body_progress_records', 'value_numeric'),
  'T-IDN-AUTHORIZED-UNIT-04 an exclusion of the whole resource shares nothing of it');
select ok(
  not privacy.scope_allows('019f4900-0000-7000-8000-000000000303', 'identity.fitness_profile_claims', 'provenance'),
  'T-IDN-AUTHORIZED-UNIT-05 a field no rule names is not shared, whatever another version says');

-- ---------------------------------------------------------------------------
-- Who may call what
-- ---------------------------------------------------------------------------
select results_eq(
  $$select has_function_privilege('allfit_api', 'identity.read_client_training_profile(uuid, uuid, uuid)', 'execute'),
           has_function_privilege('allfit_api', 'identity.list_client_body_progress(uuid, uuid, uuid, integer, date, uuid)', 'execute'),
           has_function_privilege('allfit_api', 'identity.list_client_health_context(uuid, uuid, uuid, integer, timestamptz, uuid)', 'execute')$$,
  $$values (true, true, true)$$,
  'T-IDN-AUTHORIZED-PRIV-01 the runtime calls the three reads');
select results_eq(
  $$select has_function_privilege('allfit_api', 'privacy.scope_allows(uuid, text, text)', 'execute'),
           has_function_privilege('allfit_api', 'identity.shared_scope(uuid, text)', 'execute'),
           has_function_privilege('allfit_api', 'identity.open_client_category(uuid, uuid, uuid, text, text, text)', 'execute')$$,
  $$values (false, false, false)$$,
  'T-IDN-AUTHORIZED-PRIV-02 and none of the pieces they are made of');
select is(
  (select count(*)::integer from privacy.access_events
   where subject_person_id in ('019f4900-0000-7000-8000-000000000001', '019f4900-0000-7000-8000-000000000002')
     and occurred_at >= :'epoch'::timestamptz and request_id is null),
  0,
  'T-IDN-AUTHORIZED-PRIV-03 every recorded read carries its request');

select * from finish();
rollback;
