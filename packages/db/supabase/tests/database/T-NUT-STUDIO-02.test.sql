-- T-NUT-STUDIO-02 — OP-NUT-012 (HU-STUDIO-071), IX-31 and IX-33.
--
-- The coach who attends a person proposes a version of her nutrition goals:
--
--   · Only with the three at once: `guide_nutrition`, a verified nutrition credential in
--     force, and her guidance shared at `contribute`. Missing one, nothing is created.
--   · Proposing never touches her active goal; she decides. A justification is required.
--   · A new proposal replaces the one of this relationship still waiting; ending the
--     relationship cancels it. Neither can be decided afterwards.
--   · The command is idempotent on its key, and the event carries no targets or reasons.
--
-- The scope versions are 963+ so this runs beside scopes a local seed published.
-- Written before the migration and watched failing.
begin;

select plan(30);

insert into identity.people (id, given_name, family_name, status)
values
  ('019f6200-0000-7000-8000-000000000001', 'Ana', 'Client', 'active'),
  ('019f6200-0000-7000-8000-000000000002', 'Bruno', 'Client', 'active'),
  ('019f6200-0000-7000-8000-000000000003', 'Carla', 'Client', 'active'),
  ('019f6200-0000-7000-8000-000000000011', 'Olivia', 'Owner', 'active'),
  ('019f6200-0000-7000-8000-000000000012', 'Camilo', 'Coach', 'active'),
  ('019f6200-0000-7000-8000-000000000013', 'Diana', 'Cover', 'active'),
  ('019f6200-0000-7000-8000-000000000015', 'Fabio', 'Unassigned', 'active'),
  ('019f6200-0000-7000-8000-000000000017', 'Ivan', 'Admin', 'active'),
  ('019f6200-0000-7000-8000-000000000018', 'Kim', 'Trainer', 'active'),
  ('019f6200-0000-7000-8000-000000000019', 'Lia', 'Revoked', 'active'),
  ('019f6200-0000-7000-8000-000000000020', 'Mia', 'Retired', 'active'),
  ('019f6200-0000-7000-8000-000000000022', 'Nora', 'Lapsed', 'active');

insert into organizations.organizations (id, type_code, display_name, responsible_party)
values ('019f6200-0000-7000-8000-000000000101', 'gym', 'Gym A',
  '{"party_kind":"legal_entity","party_name":"Gym A SAS","purpose":"studio_operations"}');

insert into organizations.organization_memberships (id, organization_id, person_id, status)
values
  ('019f6200-0000-7000-8000-000000000211', '019f6200-0000-7000-8000-000000000101', '019f6200-0000-7000-8000-000000000011', 'active'),
  ('019f6200-0000-7000-8000-000000000212', '019f6200-0000-7000-8000-000000000101', '019f6200-0000-7000-8000-000000000012', 'active'),
  ('019f6200-0000-7000-8000-000000000213', '019f6200-0000-7000-8000-000000000101', '019f6200-0000-7000-8000-000000000013', 'active'),
  ('019f6200-0000-7000-8000-000000000215', '019f6200-0000-7000-8000-000000000101', '019f6200-0000-7000-8000-000000000015', 'active'),
  ('019f6200-0000-7000-8000-000000000217', '019f6200-0000-7000-8000-000000000101', '019f6200-0000-7000-8000-000000000017', 'active');
insert into organizations.membership_roles (membership_id, role_code)
values
  ('019f6200-0000-7000-8000-000000000211', 'owner'),
  ('019f6200-0000-7000-8000-000000000212', 'coach'),
  ('019f6200-0000-7000-8000-000000000213', 'coach'),
  ('019f6200-0000-7000-8000-000000000215', 'coach'),
  ('019f6200-0000-7000-8000-000000000217', 'admin');

insert into relationships.service_relationships (id, person_id, organization_id, status, started_at)
values
  ('019f6200-0000-7000-8000-000000000701', '019f6200-0000-7000-8000-000000000001', '019f6200-0000-7000-8000-000000000101', 'active', clock_timestamp() - interval '60 days'),
  ('019f6200-0000-7000-8000-000000000702', '019f6200-0000-7000-8000-000000000002', '019f6200-0000-7000-8000-000000000101', 'active', clock_timestamp() - interval '60 days'),
  ('019f6200-0000-7000-8000-000000000703', '019f6200-0000-7000-8000-000000000003', '019f6200-0000-7000-8000-000000000101', 'active', clock_timestamp() - interval '60 days');

insert into relationships.relationship_professional_assignments (
  id, relationship_id, person_id, organization_id, membership_id, covers_membership_id,
  kind, status, ends_on, accepted_by_person_at
) values
  ('019f6200-0000-7000-8000-000000000801', '019f6200-0000-7000-8000-000000000701', '019f6200-0000-7000-8000-000000000001',
   '019f6200-0000-7000-8000-000000000101', '019f6200-0000-7000-8000-000000000212', null, 'holder', 'active', null, null),
  ('019f6200-0000-7000-8000-000000000802', '019f6200-0000-7000-8000-000000000702', '019f6200-0000-7000-8000-000000000002',
   '019f6200-0000-7000-8000-000000000101', '019f6200-0000-7000-8000-000000000212', null, 'holder', 'active', null, null),
  ('019f6200-0000-7000-8000-000000000803', '019f6200-0000-7000-8000-000000000703', '019f6200-0000-7000-8000-000000000003',
   '019f6200-0000-7000-8000-000000000101', '019f6200-0000-7000-8000-000000000212', null, 'holder', 'active', null, null),
  ('019f6200-0000-7000-8000-000000000805', '019f6200-0000-7000-8000-000000000701', '019f6200-0000-7000-8000-000000000001',
   '019f6200-0000-7000-8000-000000000101', '019f6200-0000-7000-8000-000000000213', '019f6200-0000-7000-8000-000000000212',
   'substitute', 'active', (clock_timestamp() + interval '10 days')::date, clock_timestamp());

-- 301 only lets Gym A read her goals; 302 lets it propose too (IX-06 needs the rule).
insert into privacy.scope_definitions (id, scope_code, version_number, status, published_at)
values
  ('019f6200-0000-7000-8000-000000000301', 'nutrition_guidance', 963, 'draft', null),
  ('019f6200-0000-7000-8000-000000000302', 'nutrition_guidance', 964, 'draft', null);
insert into privacy.scope_resource_rules (
  scope_definition_id, resource, field, data_classification_code, max_action
)
select definition, resource, '*', 'nutrition', action::privacy.access_level
from (values ('019f6200-0000-7000-8000-000000000301'::uuid, 'read'),
             ('019f6200-0000-7000-8000-000000000302'::uuid, 'contribute')) as version (definition, action)
cross join (values ('nutrition.goal_sets'), ('nutrition.goal_versions'), ('nutrition.goal_targets')) as resources (resource);
insert into privacy.scope_resource_rules (
  scope_definition_id, resource, field, data_classification_code, max_action
) values
  ('019f6200-0000-7000-8000-000000000301', 'nutrition.goal_decisions', '*', 'nutrition', 'read'),
  ('019f6200-0000-7000-8000-000000000302', 'nutrition.goal_decisions', '*', 'nutrition', 'read');
update privacy.scope_definitions set status = 'published', published_at = clock_timestamp()
where id in ('019f6200-0000-7000-8000-000000000301', '019f6200-0000-7000-8000-000000000302');

insert into identity.invitations (
  id, organization_id, issued_by_membership_id, channel, contact,
  token_hash, token_key_version, proposal_hash, responsible_party, status, expires_at
)
select ('019f6200-0000-7000-8000-00000000040' || n)::uuid, '019f6200-0000-7000-8000-000000000101',
       '019f6200-0000-7000-8000-000000000211', 'email', 'client' || n || '@example.test',
       extensions.digest('nut-propose-token-' || n, 'sha256'), 1,
       extensions.digest('nut-propose-proposal-' || n, 'sha256'),
       '{"party_kind":"legal_entity","party_name":"Gym A SAS","purpose":"studio_operations"}',
       'completed', clock_timestamp() + interval '7 days'
from generate_series(1, 2) as n;
insert into identity.invitation_intents (id, invitation_id, kind, status, proposed_role_code)
select ('019f6200-0000-7000-8000-00000000050' || n)::uuid, ('019f6200-0000-7000-8000-00000000040' || n)::uuid,
       'service_relationship', 'pending', null
from generate_series(1, 2) as n;
insert into privacy.invitation_scope_options (
  id, invitation_intent_id, scope_definition_id, scope_code,
  offered_access_level, purpose, presented_snapshot, decision, decided_at
) values
  ('019f6200-0000-7000-8000-000000000601', '019f6200-0000-7000-8000-000000000501',
   '019f6200-0000-7000-8000-000000000302', 'nutrition_guidance', 'contribute', 'Guide',
   '{"title":"Guidance"}'::jsonb, 'accepted', clock_timestamp()),
  ('019f6200-0000-7000-8000-000000000602', '019f6200-0000-7000-8000-000000000502',
   '019f6200-0000-7000-8000-000000000301', 'nutrition_guidance', 'read', 'Guide',
   '{"title":"Guidance"}'::jsonb, 'accepted', clock_timestamp());

create function pg_temp.share(relationship uuid, grant_id uuid, option_id uuid)
returns void language plpgsql as $$
declare
  subject record;
  option record;
begin
  select person_id, organization_id into subject
  from relationships.service_relationships where id = relationship;
  select id, scope_definition_id, scope_code, offered_access_level into option
  from privacy.invitation_scope_options where id = option_id;
  insert into privacy.consent_events (
    id, person_id, relationship_id, organization_id, invitation_scope_option_id,
    scope_definition_id, scope_code, decision, presented_snapshot
  ) values (
    grant_id, subject.person_id, relationship, subject.organization_id, option.id,
    option.scope_definition_id, option.scope_code, 'accepted', '{"title":"Shared"}'::jsonb
  );
  insert into privacy.data_grants (
    id, person_id, relationship_id, organization_id, scope_definition_id, scope_code,
    consent_event_id, access_level, purpose
  ) values (
    grant_id, subject.person_id, relationship, subject.organization_id,
    option.scope_definition_id, option.scope_code, grant_id, option.offered_access_level, 'Guide'
  );
end
$$;
-- Ana and Carla let Gym A propose; Bruno only lets it read.
select pg_temp.share('019f6200-0000-7000-8000-000000000701', '019f6200-0000-7000-8000-000000000a01', '019f6200-0000-7000-8000-000000000601');
select pg_temp.share('019f6200-0000-7000-8000-000000000702', '019f6200-0000-7000-8000-000000000a11', '019f6200-0000-7000-8000-000000000602');
select pg_temp.share('019f6200-0000-7000-8000-000000000703', '019f6200-0000-7000-8000-000000000a21', '019f6200-0000-7000-8000-000000000601');

-- The credentials staff verified. Camilo's is in force; Diana's verification ran out; Kim's
-- is not about nutrition; Lia's was revoked since; Mia retired hers; Nora's itself expired.
insert into identity.professional_profiles (id, person_id, headline, bio, practice_started_year)
select ('019f6200-0000-7000-8000-0000000009' || right(person::text, 2))::uuid, person, 'Profesional', 'Acompaña.', 2015
from unnest(array['019f6200-0000-7000-8000-000000000012', '019f6200-0000-7000-8000-000000000013',
                  '019f6200-0000-7000-8000-000000000018', '019f6200-0000-7000-8000-000000000019',
                  '019f6200-0000-7000-8000-000000000020', '019f6200-0000-7000-8000-000000000022']::uuid[]) as person;
insert into identity.professional_credentials (
  id, professional_profile_id, credential_type_code, issuer, name, expires_on, status, retired_at
) values
  ('019f6200-0000-7000-8000-000000000b12', '019f6200-0000-7000-8000-000000000912', 'nutrition_professional', 'Colegio', 'Nutricionista', null, 'active', null),
  ('019f6200-0000-7000-8000-000000000b13', '019f6200-0000-7000-8000-000000000913', 'nutrition_professional', 'Colegio', 'Nutricionista', null, 'active', null),
  ('019f6200-0000-7000-8000-000000000b18', '019f6200-0000-7000-8000-000000000918', 'professional_license', 'Coldeportes', 'Entrenador', null, 'active', null),
  ('019f6200-0000-7000-8000-000000000b19', '019f6200-0000-7000-8000-000000000919', 'nutrition_professional', 'Colegio', 'Nutricionista', null, 'active', null),
  ('019f6200-0000-7000-8000-000000000b20', '019f6200-0000-7000-8000-000000000920', 'nutrition_professional', 'Colegio', 'Nutricionista', null, 'retired', clock_timestamp() - interval '1 day'),
  ('019f6200-0000-7000-8000-000000000b22', '019f6200-0000-7000-8000-000000000922', 'nutrition_professional', 'Colegio', 'Nutricionista', current_date - 1, 'active', null);
create function pg_temp.verified(id uuid, credential uuid, result text, decided interval, valid_from interval, valid_to interval)
returns void language sql as $$
  insert into identity.professional_credential_verifications (
    id, professional_credential_id, verifier_person_id, policy_code, method, source_authority,
    source_jurisdiction, source_reference, source_status, source_checked_at, evidence_fingerprint,
    result, decided_at, valid_from, valid_to, revoked_at
  ) values (
    id, credential, '019f6200-0000-7000-8000-000000000011', 'v1', 'official_registry_lookup', 'Colegio',
    'CO', 'REF-' || id, 'active', clock_timestamp() - decided, extensions.digest(id::text, 'sha256'),
    result, clock_timestamp() - decided,
    case when result = 'verified' then clock_timestamp() - valid_from end,
    case when result = 'verified' then clock_timestamp() + valid_to end,
    case when result = 'revoked' then clock_timestamp() - decided end
  )
$$;
select pg_temp.verified('019f6200-0000-7000-8000-000000000c12', '019f6200-0000-7000-8000-000000000b12', 'verified', '1 day', '1 day', '180 days');
select pg_temp.verified('019f6200-0000-7000-8000-000000000c13', '019f6200-0000-7000-8000-000000000b13', 'verified', '400 days', '400 days', '-40 days');
select pg_temp.verified('019f6200-0000-7000-8000-000000000c18', '019f6200-0000-7000-8000-000000000b18', 'verified', '1 day', '1 day', '180 days');
select pg_temp.verified('019f6200-0000-7000-8000-000000000c19', '019f6200-0000-7000-8000-000000000b19', 'verified', '10 days', '10 days', '180 days');
select pg_temp.verified('019f6200-0000-7000-8000-000000000c91', '019f6200-0000-7000-8000-000000000b19', 'revoked', '1 day', '0', '0');
select pg_temp.verified('019f6200-0000-7000-8000-000000000c20', '019f6200-0000-7000-8000-000000000b20', 'verified', '1 day', '1 day', '180 days');
select pg_temp.verified('019f6200-0000-7000-8000-000000000c22', '019f6200-0000-7000-8000-000000000b22', 'verified', '1 day', '1 day', '180 days');

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
create function pg_temp.member(person uuid, membership uuid) returns void language plpgsql as $$
begin
  perform pg_temp.act(person);
  perform set_config('app.actor_org_id', '019f6200-0000-7000-8000-000000000101', true);
  perform set_config('app.actor_membership_id', membership::text, true);
end
$$;
-- The SQLSTATE, and the detail when it names something.
create function pg_temp.failure(statement text) returns text language plpgsql as $$
declare
  state text;
  detail text;
begin
  execute statement;
  return 'no error';
exception when others or assert_failure then
  get stacked diagnostics state = returned_sqlstate, detail = pg_exception_detail;
  return state || coalesce(' ' || nullif(detail, ''), '');
end
$$;
create function pg_temp.propose(actor uuid, subject uuid, rationale text, targets jsonb, command uuid,
  key uuid default gen_random_uuid(), salt text default '')
returns table (result jsonb, replayed boolean) language plpgsql as $$
begin
  perform pg_temp.act(actor);
  return query select * from nutrition.propose_goal_version(
    actor, '019f6200-0000-7000-8000-000000000101', subject, rationale, targets, key, command,
    extensions.digest(command::text || coalesce(rationale, '') || coalesce(targets::text, '') || salt, 'sha256'));
end
$$;
create function pg_temp.statuses() returns text[] language sql as $$
  select array_agg(version_number || ' ' || status::text order by version_number)
  from nutrition.goal_versions where person_id = '019f6200-0000-7000-8000-000000000001'
$$;

-- Her own goal, active before anybody proposes anything.
select pg_temp.act('019f6200-0000-7000-8000-000000000001');
select nutrition.publish_self_goal_version('019f6200-0000-7000-8000-000000000001', null,
  '[{"nutrient_code":"energy","mode":"exact","minimum":null,"maximum":null,"exact":2300,"unit":"kcal"}]'::jsonb,
  gen_random_uuid(), '019f6200-0000-7000-8000-000000000e01', decode(repeat('51', 32), 'hex'));

-- ---------------------------------------------------------------------------
-- The credential in force
-- ---------------------------------------------------------------------------
select is(identity.effective_credential_verification('019f6200-0000-7000-8000-000000000012', 'nutrition_professional'),
  '019f6200-0000-7000-8000-000000000c12'::uuid, 'T-IDN-CREDENTIAL-NUT-01 a verified nutrition credential in force counts');
select is(identity.effective_credential_verification('019f6200-0000-7000-8000-000000000013', 'nutrition_professional'),
  null, 'T-IDN-CREDENTIAL-NUT-02 not once its verification ran out');
select is(identity.effective_credential_verification('019f6200-0000-7000-8000-000000000018', 'nutrition_professional'),
  null, 'T-IDN-CREDENTIAL-NUT-03 a credential of another kind does not');
select is(identity.effective_credential_verification('019f6200-0000-7000-8000-000000000019', 'nutrition_professional'),
  null, 'T-IDN-CREDENTIAL-NUT-04 the latest decision rules: a verification revoked since does not');
select is(identity.effective_credential_verification('019f6200-0000-7000-8000-000000000020', 'nutrition_professional'),
  null, 'T-IDN-CREDENTIAL-NUT-05 nor a retired credential');
select is(identity.effective_credential_verification('019f6200-0000-7000-8000-000000000022', 'nutrition_professional'),
  null, 'T-IDN-CREDENTIAL-NUT-06 nor one that expired itself');

-- ---------------------------------------------------------------------------
-- IX-31 in the base: a proposal row needs its author's credential in force
-- ---------------------------------------------------------------------------
-- Each insert runs and is undone: P0001 says the row was let in, 42501 that it was not.
create function pg_temp.inserted_as(actor uuid, membership uuid, assignment uuid, credential uuid)
returns text language plpgsql as $$
declare
  target_set uuid;
begin
  select goal_set.id into target_set
  from nutrition.goal_sets as goal_set where goal_set.person_id = '019f6200-0000-7000-8000-000000000001';
  perform pg_temp.member(actor, membership);
  return pg_temp.failure(format($sql$
    do $do$ begin
      set local role allfit_owner;
      insert into nutrition.goal_versions (id, goal_set_id, person_id, version_number, origin, status, rationale,
        author_person_id, author_membership_id, author_assignment_id, origin_relationship_id,
        origin_organization_id, credential_verification_id)
      values (gen_random_uuid(), %L, '019f6200-0000-7000-8000-000000000001', 90, 'professional', 'proposed',
        'Directo.', %L, %L, %L, '019f6200-0000-7000-8000-000000000701', '019f6200-0000-7000-8000-000000000101', %L);
      raise exception 'undone' using errcode = 'P0001';
    end $do$ $sql$, target_set, actor, membership, assignment, credential));
end
$$;

select is(
  pg_temp.inserted_as('019f6200-0000-7000-8000-000000000012', '019f6200-0000-7000-8000-000000000212',
    '019f6200-0000-7000-8000-000000000801', '019f6200-0000-7000-8000-000000000c12'),
  'P0001',
  'T-NUT-RLS-18 the attending coach with his credential in force may write a proposal');

select is(
  pg_temp.inserted_as('019f6200-0000-7000-8000-000000000013', '019f6200-0000-7000-8000-000000000213',
    '019f6200-0000-7000-8000-000000000805', '019f6200-0000-7000-8000-000000000c13'),
  '42501',
  'T-NUT-RLS-19 not with a verification that ran out');

select is(
  pg_temp.inserted_as('019f6200-0000-7000-8000-000000000013', '019f6200-0000-7000-8000-000000000213',
    '019f6200-0000-7000-8000-000000000805', '019f6200-0000-7000-8000-000000000c12'),
  '42501',
  'T-NUT-RLS-19 nor with somebody else''s');

-- ---------------------------------------------------------------------------
-- OP-NUT-012: proposing
-- ---------------------------------------------------------------------------
set local role allfit_api;

select result as first, replayed as first_replayed from pg_temp.propose(
  '019f6200-0000-7000-8000-000000000012', '019f6200-0000-7000-8000-000000000001',
  '  Para tu fase de definición.  ',
  '[{"nutrient_code":"energy","mode":"exact","minimum":null,"maximum":null,"exact":2100,"unit":"kcal"},
    {"nutrient_code":"protein","mode":"minimum","minimum":140,"maximum":null,"exact":null,"unit":"g"}]',
  '019f6200-0000-7000-8000-000000000e02', 'a3000000-0000-4000-8000-000000000001') \gset

select is(
  :'first'::jsonb - 'created_at',
  '{"id": "019f6200-0000-7000-8000-000000000e02", "status": "proposed", "rationale": "Para tu fase de definición.",
    "author": {"kind": "professional", "person_id": "019f6200-0000-7000-8000-000000000012"},
    "targets": [{"nutrient_code": "energy", "mode": "exact", "minimum": null, "maximum": null, "exact": 2100, "unit": "kcal"},
                {"nutrient_code": "protein", "mode": "minimum", "minimum": 140, "maximum": null, "exact": null, "unit": "g"}],
    "activated_at": null, "cancelled_at": null, "decision": null}'::jsonb,
  'T-NUT-API-08 the coach proposes, and sees the proposal as Studio shows it');

select is(:'first_replayed'::boolean, false, 'T-NUT-IDEM-05 a first proposal is no replay');

reset role;
select is(
  (select jsonb_build_object('origin', origin, 'number', version_number, 'credential', credential_verification_id,
     'assignment', author_assignment_id, 'relationship', origin_relationship_id)
   from nutrition.goal_versions where id = '019f6200-0000-7000-8000-000000000e02'),
  '{"origin": "professional", "number": 2, "credential": "019f6200-0000-7000-8000-000000000c12",
    "assignment": "019f6200-0000-7000-8000-000000000801", "relationship": "019f6200-0000-7000-8000-000000000701"}'::jsonb,
  'T-NUT-INT-03 it keeps who proposed it, from which assignment, and the verification that let him');

select is(pg_temp.statuses(), array['1 active', '2 proposed'],
  'T-NUT-INT-04 proposing does not touch her active goal');

select is(
  (select jsonb_build_object('type', event_type, 'carries', payload ?| array['rationale', 'targets'])
   from system.outbox_events where aggregate_id = '019f6200-0000-7000-8000-000000000e02'),
  '{"type": "nutrition.goal_version_proposed.v1", "carries": false}'::jsonb,
  'T-NUT-INT-05 she is told something was proposed, never what or why');
set local role allfit_api;

select is(
  (select row(result ->> 'id', replayed)::text from pg_temp.propose(
     '019f6200-0000-7000-8000-000000000012', '019f6200-0000-7000-8000-000000000001',
     '  Para tu fase de definición.  ',
     '[{"nutrient_code":"energy","mode":"exact","minimum":null,"maximum":null,"exact":2100,"unit":"kcal"},
       {"nutrient_code":"protein","mode":"minimum","minimum":140,"maximum":null,"exact":null,"unit":"g"}]',
     '019f6200-0000-7000-8000-000000000e02', 'a3000000-0000-4000-8000-000000000001')),
  '(019f6200-0000-7000-8000-000000000e02,t)',
  'T-NUT-IDEM-05 the same request again answers the same proposal, and makes no second one');

select is(
  pg_temp.failure($$ select * from pg_temp.propose(
     '019f6200-0000-7000-8000-000000000012', '019f6200-0000-7000-8000-000000000001',
     'Otra cosa.', '[{"nutrient_code":"energy","mode":"exact","minimum":null,"maximum":null,"exact":1900,"unit":"kcal"}]',
     '019f6200-0000-7000-8000-000000000e02', 'a3000000-0000-4000-8000-000000000001') $$),
  '23505',
  'T-NUT-IDEM-05 the same key for a different request is refused');

select is(
  (select result ->> 'status' from pg_temp.propose(
     '019f6200-0000-7000-8000-000000000012', '019f6200-0000-7000-8000-000000000001', 'Mejor así.',
     '[{"nutrient_code":"energy","mode":"exact","minimum":null,"maximum":null,"exact":2000,"unit":"kcal"}]',
     '019f6200-0000-7000-8000-000000000e03')),
  'proposed',
  'T-NUT-INT-06 a new proposal is made');

reset role;
select is(pg_temp.statuses(), array['1 active', '2 superseded', '3 proposed'],
  'T-NUT-INT-06 IX-33 and replaces the one of this relationship still waiting');

select pg_temp.act('019f6200-0000-7000-8000-000000000001');
select is(
  pg_temp.failure($$ select nutrition.decide_goal_version('019f6200-0000-7000-8000-000000000001',
     '019f6200-0000-7000-8000-000000000e02', 'accepted', gen_random_uuid(), extensions.uuid_generate_v7(),
     decode(repeat('52', 32), 'hex')) $$),
  '23514',
  'T-NUT-INT-06 she can no longer accept the one it replaced');
set local role allfit_api;

-- ---------------------------------------------------------------------------
-- Who may not, and what is not a proposal
-- ---------------------------------------------------------------------------
select is(
  pg_temp.failure($$ select * from pg_temp.propose('019f6200-0000-7000-8000-000000000013',
     '019f6200-0000-7000-8000-000000000001', 'Cubriendo.',
     '[{"nutrient_code":"energy","mode":"exact","minimum":null,"maximum":null,"exact":2000,"unit":"kcal"}]',
     extensions.uuid_generate_v7()) $$),
  'AF431',
  'T-NUT-RLS-19 the cover whose verification ran out proposes nothing');

select is(
  pg_temp.failure($$ select * from pg_temp.propose('019f6200-0000-7000-8000-000000000015',
     '019f6200-0000-7000-8000-000000000001', 'Sin asignación.',
     '[{"nutrient_code":"energy","mode":"exact","minimum":null,"maximum":null,"exact":2000,"unit":"kcal"}]',
     extensions.uuid_generate_v7()) $$),
  'P0002',
  'T-NUT-RLS-18 a coach who does not attend her finds no client');

select is(
  pg_temp.failure($$ select * from pg_temp.propose('019f6200-0000-7000-8000-000000000012',
     '019f6200-0000-7000-8000-000000000002', 'Solo lectura.',
     '[{"nutrient_code":"energy","mode":"exact","minimum":null,"maximum":null,"exact":2000,"unit":"kcal"}]',
     extensions.uuid_generate_v7()) $$),
  'AF430 nutrition_guidance:contribute',
  'T-NUT-RLS-19 her guidance shared to read lets nobody propose');

reset role;
delete from organizations.role_capabilities where role_code = 'coach' and capability_code = 'guide_nutrition';
set local role allfit_api;
select is(
  pg_temp.failure($$ select * from pg_temp.propose('019f6200-0000-7000-8000-000000000012',
     '019f6200-0000-7000-8000-000000000003', 'Sin capacidad.',
     '[{"nutrient_code":"energy","mode":"exact","minimum":null,"maximum":null,"exact":2000,"unit":"kcal"}]',
     extensions.uuid_generate_v7()) $$),
  '42501',
  'T-NUT-RLS-18 attending her without guide_nutrition proposes nothing');
reset role;
insert into organizations.role_capabilities (role_code, capability_code) values ('coach', 'guide_nutrition');
set local role allfit_api;

select is(
  pg_temp.failure($$ select * from pg_temp.propose('019f6200-0000-7000-8000-000000000012',
     '019f6200-0000-7000-8000-000000000001', '   ',
     '[{"nutrient_code":"energy","mode":"exact","minimum":null,"maximum":null,"exact":2000,"unit":"kcal"}]',
     extensions.uuid_generate_v7()) $$),
  '22023 ["rationale"]',
  'T-NUT-INT-07 a proposal says why');

select is(
  pg_temp.failure(format($$ select * from pg_temp.propose('019f6200-0000-7000-8000-000000000012',
     '019f6200-0000-7000-8000-000000000001', %L,
     '[{"nutrient_code":"energy","mode":"exact","minimum":null,"maximum":null,"exact":2000,"unit":"kcal"}]',
     extensions.uuid_generate_v7()) $$, repeat('x', 2001))),
  '22023 ["rationale"]',
  'T-NUT-INT-07 in at most two thousand characters');

select is(
  pg_temp.failure($$ select * from pg_temp.propose('019f6200-0000-7000-8000-000000000012',
     '019f6200-0000-7000-8000-000000000001', 'Nada.', '[]', extensions.uuid_generate_v7()) $$),
  '22023 ["targets"]',
  'T-NUT-INT-07 and proposes at least one target');

select is(
  pg_temp.failure($$ select * from pg_temp.propose('019f6200-0000-7000-8000-000000000012',
     '019f6200-0000-7000-8000-000000000001', 'Una comida.',
     '[{"nutrient_code":"bread","mode":"exact","minimum":null,"maximum":null,"exact":2,"unit":"g"}]',
     extensions.uuid_generate_v7()) $$),
  '23514',
  'T-NUT-INT-07 a target is a nutrient the catalogue publishes, never a food or a menu');

-- ---------------------------------------------------------------------------
-- IX-33: ending the relationship cancels what still waits
-- ---------------------------------------------------------------------------
reset role;
select clock_timestamp() as ended \gset
select relationships.close_relationship('019f6200-0000-7000-8000-000000000701', :'ended', 'professional', 'left');

select is(
  (select jsonb_build_object('status', status, 'cancelled_at', cancelled_at = :'ended'::timestamptz)
   from nutrition.goal_versions where id = '019f6200-0000-7000-8000-000000000e03'),
  '{"status": "cancelled", "cancelled_at": true}'::jsonb,
  'T-NUT-INT-06 ending the relationship cancels its proposal still waiting, at the instant it ends');

select pg_temp.act('019f6200-0000-7000-8000-000000000001');
select is(
  pg_temp.failure($$ select nutrition.decide_goal_version('019f6200-0000-7000-8000-000000000001',
     '019f6200-0000-7000-8000-000000000e03', 'accepted', gen_random_uuid(), extensions.uuid_generate_v7(),
     decode(repeat('53', 32), 'hex')) $$),
  '23514',
  'T-NUT-INT-06 and she can no longer accept it');
set local role allfit_api;

select is(
  pg_temp.failure($$ select * from pg_temp.propose('019f6200-0000-7000-8000-000000000012',
     '019f6200-0000-7000-8000-000000000001', 'Después del final.',
     '[{"nutrient_code":"energy","mode":"exact","minimum":null,"maximum":null,"exact":2000,"unit":"kcal"}]',
     extensions.uuid_generate_v7()) $$),
  'P0002',
  'T-NUT-RLS-18 nor does the coach propose once it ended');

select * from finish();
rollback;
