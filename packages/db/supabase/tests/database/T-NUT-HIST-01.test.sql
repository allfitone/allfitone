-- T-NUT-HIST-01 — the frozen OP-NUT-011 (HU-STUDIO-070): the goals an ended relationship
-- proposed, read through a historical access case.
--
--   · Only what this relationship proposed by the cut, and what she had decided by then;
--     never her own goals, another gym's, or anything after the cut.
--   · Each proposal says how it stood at the cut, and carries only the fields the frozen
--     version keeps readable afterwards.
--   · A version that keeps nothing readable afterwards answers that the category is
--     required; every read, refused or not, records the case and the frozen mode.
--   · Without a fresh sign-in, a case of somebody else or an expired one, nothing is read.
--
-- The scope versions are 965+ so this runs beside scopes a local seed published.
-- Written before the migration and watched failing.
begin;

select plan(17);

insert into identity.people (id, given_name, family_name, status)
values
  ('019f6300-0000-7000-8000-000000000001', 'Ana', 'Client', 'active'),
  ('019f6300-0000-7000-8000-000000000002', 'Bruno', 'Client', 'active'),
  ('019f6300-0000-7000-8000-000000000011', 'Olivia', 'Owner', 'active'),
  ('019f6300-0000-7000-8000-000000000012', 'Camilo', 'Coach', 'active'),
  ('019f6300-0000-7000-8000-000000000013', 'Fabio', 'Coach', 'active'),
  ('019f6300-0000-7000-8000-000000000021', 'Zoe', 'Elsewhere', 'active');

insert into organizations.organizations (id, type_code, display_name, responsible_party)
values
  ('019f6300-0000-7000-8000-000000000101', 'gym', 'Gym A',
   '{"party_kind":"legal_entity","party_name":"Gym A SAS","purpose":"studio_operations"}'),
  ('019f6300-0000-7000-8000-000000000102', 'gym', 'Gym B',
   '{"party_kind":"legal_entity","party_name":"Gym B SAS","purpose":"studio_operations"}');

insert into organizations.organization_memberships (id, organization_id, person_id, status)
values
  ('019f6300-0000-7000-8000-000000000211', '019f6300-0000-7000-8000-000000000101', '019f6300-0000-7000-8000-000000000011', 'active'),
  ('019f6300-0000-7000-8000-000000000212', '019f6300-0000-7000-8000-000000000101', '019f6300-0000-7000-8000-000000000012', 'active'),
  ('019f6300-0000-7000-8000-000000000213', '019f6300-0000-7000-8000-000000000101', '019f6300-0000-7000-8000-000000000013', 'active'),
  ('019f6300-0000-7000-8000-000000000221', '019f6300-0000-7000-8000-000000000102', '019f6300-0000-7000-8000-000000000021', 'active');
insert into organizations.membership_roles (membership_id, role_code)
values
  ('019f6300-0000-7000-8000-000000000211', 'owner'),
  ('019f6300-0000-7000-8000-000000000212', 'coach'),
  ('019f6300-0000-7000-8000-000000000213', 'coach'),
  ('019f6300-0000-7000-8000-000000000221', 'coach');

insert into relationships.service_relationships (id, person_id, organization_id, status, started_at)
values
  ('019f6300-0000-7000-8000-000000000701', '019f6300-0000-7000-8000-000000000001', '019f6300-0000-7000-8000-000000000101', 'active', clock_timestamp() - interval '60 days'),
  ('019f6300-0000-7000-8000-000000000702', '019f6300-0000-7000-8000-000000000002', '019f6300-0000-7000-8000-000000000101', 'active', clock_timestamp() - interval '60 days'),
  ('019f6300-0000-7000-8000-000000000709', '019f6300-0000-7000-8000-000000000001', '019f6300-0000-7000-8000-000000000102', 'active', clock_timestamp() - interval '60 days');
insert into relationships.relationship_professional_assignments (
  id, relationship_id, person_id, organization_id, membership_id, kind, status, valid_from
) values
  ('019f6300-0000-7000-8000-000000000801', '019f6300-0000-7000-8000-000000000701', '019f6300-0000-7000-8000-000000000001',
   '019f6300-0000-7000-8000-000000000101', '019f6300-0000-7000-8000-000000000212', 'holder', 'active', clock_timestamp() - interval '60 days'),
  ('019f6300-0000-7000-8000-000000000802', '019f6300-0000-7000-8000-000000000702', '019f6300-0000-7000-8000-000000000002',
   '019f6300-0000-7000-8000-000000000101', '019f6300-0000-7000-8000-000000000212', 'holder', 'active', clock_timestamp() - interval '60 days'),
  ('019f6300-0000-7000-8000-000000000809', '019f6300-0000-7000-8000-000000000709', '019f6300-0000-7000-8000-000000000001',
   '019f6300-0000-7000-8000-000000000102', '019f6300-0000-7000-8000-000000000221', 'holder', 'active', clock_timestamp() - interval '60 days');

-- 301 keeps her proposals and decisions readable afterwards, all but the justification;
-- 302 shared them only while the relationship lived.
insert into privacy.scope_definitions (id, scope_code, version_number, status, published_at)
values
  ('019f6300-0000-7000-8000-000000000301', 'nutrition_guidance', 965, 'draft', null),
  ('019f6300-0000-7000-8000-000000000302', 'nutrition_guidance', 966, 'draft', null);
insert into privacy.scope_resource_rules (
  scope_definition_id, resource, field, data_classification_code, max_action, historical_readable
)
select '019f6300-0000-7000-8000-000000000301'::uuid, resource, field, 'nutrition', 'read'::privacy.access_level, true
from (values
  ('nutrition.goal_versions', 'version_number'), ('nutrition.goal_versions', 'origin'),
  ('nutrition.goal_versions', 'status'), ('nutrition.goal_versions', 'author_person_id'),
  ('nutrition.goal_versions', 'origin_relationship_id'), ('nutrition.goal_versions', 'created_at'),
  ('nutrition.goal_versions', 'activated_at'), ('nutrition.goal_versions', 'cancelled_at'),
  ('nutrition.goal_targets', 'nutrient_definition_id'), ('nutrition.goal_targets', 'mode'),
  ('nutrition.goal_targets', 'minimum_value'), ('nutrition.goal_targets', 'maximum_value'),
  ('nutrition.goal_targets', 'exact_value'), ('nutrition.goal_targets', 'unit_code'),
  ('nutrition.goal_decisions', '*')) as kept (resource, field);
insert into privacy.scope_resource_rules (
  scope_definition_id, resource, field, data_classification_code, max_action, historical_readable
) values
  ('019f6300-0000-7000-8000-000000000301', 'nutrition.goal_versions', 'rationale', 'nutrition', 'read', false),
  ('019f6300-0000-7000-8000-000000000302', 'nutrition.goal_sets', '*', 'nutrition', 'read', false),
  ('019f6300-0000-7000-8000-000000000302', 'nutrition.goal_versions', '*', 'nutrition', 'read', false),
  ('019f6300-0000-7000-8000-000000000302', 'nutrition.goal_targets', '*', 'nutrition', 'read', false),
  ('019f6300-0000-7000-8000-000000000302', 'nutrition.goal_decisions', '*', 'nutrition', 'read', false);
update privacy.scope_definitions set status = 'published', published_at = clock_timestamp()
where id in ('019f6300-0000-7000-8000-000000000301', '019f6300-0000-7000-8000-000000000302');

insert into identity.invitations (
  id, organization_id, issued_by_membership_id, channel, contact,
  token_hash, token_key_version, proposal_hash, responsible_party, status, expires_at
)
select ('019f6300-0000-7000-8000-00000000040' || n)::uuid, '019f6300-0000-7000-8000-000000000101',
       '019f6300-0000-7000-8000-000000000211', 'email', 'client' || n || '@example.test',
       extensions.digest('nut-hist-token-' || n, 'sha256'), 1,
       extensions.digest('nut-hist-proposal-' || n, 'sha256'),
       '{"party_kind":"legal_entity","party_name":"Gym A SAS","purpose":"studio_operations"}',
       'completed', clock_timestamp() + interval '7 days'
from generate_series(1, 2) as n;
insert into identity.invitation_intents (id, invitation_id, kind, status, proposed_role_code)
select ('019f6300-0000-7000-8000-00000000050' || n)::uuid, ('019f6300-0000-7000-8000-00000000040' || n)::uuid,
       'service_relationship', 'pending', null
from generate_series(1, 2) as n;
insert into privacy.invitation_scope_options (
  id, invitation_intent_id, scope_definition_id, scope_code,
  offered_access_level, purpose, presented_snapshot, decision, decided_at
)
select ('019f6300-0000-7000-8000-00000000060' || n)::uuid, ('019f6300-0000-7000-8000-00000000050' || n)::uuid,
       ('019f6300-0000-7000-8000-00000000030' || n)::uuid, 'nutrition_guidance', 'read', 'Guide',
       '{"title":"Guidance"}'::jsonb, 'accepted', clock_timestamp()
from generate_series(1, 2) as n;

create function pg_temp.share(relationship uuid, grant_id uuid, option_id uuid)
returns void language plpgsql as $$
declare
  subject record;
  option record;
begin
  select person_id, organization_id into subject
  from relationships.service_relationships where id = relationship;
  select id, scope_definition_id, scope_code into option
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
    option.scope_definition_id, option.scope_code, grant_id, 'read', 'Guide'
  );
end
$$;
select pg_temp.share('019f6300-0000-7000-8000-000000000701', '019f6300-0000-7000-8000-000000000a01', '019f6300-0000-7000-8000-000000000601');
select pg_temp.share('019f6300-0000-7000-8000-000000000702', '019f6300-0000-7000-8000-000000000a11', '019f6300-0000-7000-8000-000000000602');

-- The cut: two days ago.
select clock_timestamp() - interval '2 days' as cut \gset

-- G0 is her own. Gym A proposed P1, which she accepted, and P2, still waiting at the cut;
-- Gym B proposed P4. P3 claims Gym A after the cut, and P5 a decision after it, which no
-- command can do: the end cancels what is still waiting.
insert into nutrition.goal_sets (id, person_id)
values ('019f6300-0000-7000-8000-000000000900', '019f6300-0000-7000-8000-000000000001');
create function pg_temp.goal(g_id uuid, g_number integer, g_status text, g_relationship uuid, g_created timestamptz,
  g_activated timestamptz, g_kcal integer)
returns void language plpgsql as $$
declare
  holder record;
begin
  select a.id, a.membership_id, a.organization_id, m.person_id into holder
  from relationships.relationship_professional_assignments as a
  join organizations.organization_memberships as m on m.id = a.membership_id
  where a.relationship_id = g_relationship and a.kind = 'holder';
  insert into nutrition.goal_versions (id, goal_set_id, person_id, version_number, origin, status, rationale,
    author_person_id, author_membership_id, author_assignment_id, origin_relationship_id, origin_organization_id,
    created_at, activated_at)
  values (g_id, '019f6300-0000-7000-8000-000000000900', '019f6300-0000-7000-8000-000000000001', g_number,
    case when g_relationship is null then 'self' else 'professional' end::nutrition.goal_origin,
    g_status::nutrition.goal_status, case when g_relationship is not null then 'Porque sí.' end,
    coalesce(holder.person_id, '019f6300-0000-7000-8000-000000000001'),
    holder.membership_id, holder.id, g_relationship, holder.organization_id, g_created, g_activated);
  insert into nutrition.goal_targets (goal_version_id, nutrient_definition_id, mode, exact_value, unit_code)
  select g_id, definition.id, 'exact', g_kcal, 'kcal'
  from nutrition.nutrient_definitions as definition where definition.code = 'energy';
end
$$;
select pg_temp.goal('019f6300-0000-7000-8000-000000000e00', 1, 'superseded', null,
  :'cut'::timestamptz - interval '20 days', :'cut'::timestamptz - interval '20 days', 2300);
select pg_temp.goal('019f6300-0000-7000-8000-000000000e01', 2, 'active', '019f6300-0000-7000-8000-000000000701',
  :'cut'::timestamptz - interval '5 days', :'cut'::timestamptz - interval '4 days', 2100);
select pg_temp.goal('019f6300-0000-7000-8000-000000000e02', 3, 'proposed', '019f6300-0000-7000-8000-000000000701',
  :'cut'::timestamptz - interval '3 days', null, 2000);
select pg_temp.goal('019f6300-0000-7000-8000-000000000e04', 5, 'proposed', '019f6300-0000-7000-8000-000000000709',
  :'cut'::timestamptz - interval '2 days', null, 1900);
insert into nutrition.goal_decisions (id, goal_version_id, person_id, decision, decided_at)
values ('019f6300-0000-7000-8000-000000000f01', '019f6300-0000-7000-8000-000000000e01',
  '019f6300-0000-7000-8000-000000000001', 'accepted', :'cut'::timestamptz - interval '4 days');

select relationships.close_relationship('019f6300-0000-7000-8000-000000000701', :'cut', 'professional', 'left');
select relationships.close_relationship('019f6300-0000-7000-8000-000000000702', :'cut', 'professional', 'left');
select pg_temp.goal('019f6300-0000-7000-8000-000000000e03', 4, 'rejected', '019f6300-0000-7000-8000-000000000701',
  :'cut'::timestamptz + interval '1 day', null, 1800);
select pg_temp.goal('019f6300-0000-7000-8000-000000000e05', 6, 'rejected', '019f6300-0000-7000-8000-000000000701',
  :'cut'::timestamptz - interval '1 day', null, 1700);
insert into nutrition.goal_decisions (id, goal_version_id, person_id, decision, decided_at)
values ('019f6300-0000-7000-8000-000000000f05', '019f6300-0000-7000-8000-000000000e05',
  '019f6300-0000-7000-8000-000000000001', 'rejected', :'cut'::timestamptz + interval '1 day');

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
  perform set_config('app.actor_org_id', '019f6300-0000-7000-8000-000000000101', true);
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

-- C1 names Camilo on Ana's; C2 ran out an hour ago; C3 names Camilo on Bruno's.
select pg_temp.member('019f6300-0000-7000-8000-000000000011', '019f6300-0000-7000-8000-000000000211');
insert into privacy.historical_access_cases (
  id, organization_id, relationship_id, person_id, cut_at, authorized_membership_id, opened_by_membership_id,
  purpose, case_reference, justification, opened_at, expires_at, status
) values
  ('019f6300-0000-7000-8000-000000000c01', '019f6300-0000-7000-8000-000000000101', '019f6300-0000-7000-8000-000000000701',
   '019f6300-0000-7000-8000-000000000001', :'cut', '019f6300-0000-7000-8000-000000000212', '019f6300-0000-7000-8000-000000000211',
   'service_dispute', 'CASE-1', 'She disputes a goal', clock_timestamp(), clock_timestamp() + interval '2 hours', 'open'),
  ('019f6300-0000-7000-8000-000000000c02', '019f6300-0000-7000-8000-000000000101', '019f6300-0000-7000-8000-000000000701',
   '019f6300-0000-7000-8000-000000000001', :'cut', '019f6300-0000-7000-8000-000000000212', '019f6300-0000-7000-8000-000000000211',
   'authorized_quality_review', 'CASE-2', 'A review', clock_timestamp() - interval '3 hours', clock_timestamp() - interval '1 hour', 'open'),
  ('019f6300-0000-7000-8000-000000000c03', '019f6300-0000-7000-8000-000000000101', '019f6300-0000-7000-8000-000000000702',
   '019f6300-0000-7000-8000-000000000002', :'cut', '019f6300-0000-7000-8000-000000000212', '019f6300-0000-7000-8000-000000000211',
   'service_dispute', 'CASE-3', 'He disputes a goal', clock_timestamp(), clock_timestamp() + interval '2 hours', 'open');

insert into identity.access_accounts (id, provider, issuer, subject, person_id)
values
  ('019f6300-0000-7000-8000-000000000b12', 'workos', 'https://nut-hist.test', 'camilo', '019f6300-0000-7000-8000-000000000012'),
  ('019f6300-0000-7000-8000-000000000b13', 'workos', 'https://nut-hist.test', 'fabio', '019f6300-0000-7000-8000-000000000013');
create function pg_temp.session(id uuid, account uuid, label text, signed_in interval)
returns void language sql as $$
  insert into identity.access_sessions (
    id, access_account_id, provider_session_id, surface, token_hash, token_ciphertext,
    access_token_expires_at, authenticated_at
  ) values (
    id, account, 'nut-hist-' || label, 'studio', extensions.digest('nut-hist-' || label, 'sha256'),
    'v1.' || label, clock_timestamp() + interval '1 hour', clock_timestamp() - signed_in
  )
$$;
select pg_temp.session('019f6300-0000-7000-8000-000000000d12', '019f6300-0000-7000-8000-000000000b12', 'camilo', interval '1 minute');
select pg_temp.session('019f6300-0000-7000-8000-000000000d10', '019f6300-0000-7000-8000-000000000b12', 'camilo-stale', interval '11 minutes');
select pg_temp.session('019f6300-0000-7000-8000-000000000d13', '019f6300-0000-7000-8000-000000000b13', 'fabio', interval '1 minute');

create function pg_temp.goals(actor uuid, session uuid, case_id uuid,
  relationship uuid default '019f6300-0000-7000-8000-000000000701')
returns jsonb language plpgsql as $$
begin
  perform pg_temp.act(actor);
  return nutrition.list_frozen_goal_versions(actor, session, '019f6300-0000-7000-8000-000000000101',
    relationship, case_id, 20, null, null);
end
$$;
create function pg_temp.ids(page jsonb) returns uuid[] language sql as $$
  select coalesce(array_agg((item ->> 'id')::uuid order by ordinal), '{}')
  from jsonb_array_elements(page -> 'items') with ordinality as listed (item, ordinal)
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

set local role allfit_api;

select pg_temp.goals('019f6300-0000-7000-8000-000000000012', '019f6300-0000-7000-8000-000000000d12',
  '019f6300-0000-7000-8000-000000000c01') as frozen \gset

select is(
  pg_temp.ids(:'frozen'::jsonb),
  array['019f6300-0000-7000-8000-000000000e05', '019f6300-0000-7000-8000-000000000e02',
        '019f6300-0000-7000-8000-000000000e01']::uuid[],
  'T-NUT-HIST-API-01 what this relationship proposed by the cut, newest first; never hers, another gym''s or later');

select is(
  jsonb_build_object('status_at_cut', :'frozen'::jsonb -> 'items' -> 0 -> 'status_at_cut',
                     'decision', :'frozen'::jsonb -> 'items' -> 0 -> 'decision'),
  '{"status_at_cut": "proposed", "decision": null}'::jsonb,
  'T-NUT-HIST-API-14 what she decided after the cut is not told: at the cut it was still waiting');

select is(
  (:'frozen'::jsonb -> 'items' -> 2) - 'created_at',
  jsonb_build_object(
    'id', '019f6300-0000-7000-8000-000000000e01', 'status_at_cut', 'accepted', 'rationale', null,
    'author', jsonb_build_object('kind', 'professional', 'person_id', '019f6300-0000-7000-8000-000000000012'),
    'targets', '[{"nutrient_code": "energy", "mode": "exact", "minimum": null, "maximum": null, "exact": 2100, "unit": "kcal"}]'::jsonb,
    'activated_at', to_jsonb(:'cut'::timestamptz - interval '4 days'),
    'decision', jsonb_build_object('decision', 'accepted', 'decided_at', to_jsonb(:'cut'::timestamptz - interval '4 days'))),
  'T-NUT-HIST-API-02 the one she accepted, with her decision, and without the justification it kept only while it lived');

select is(
  (:'frozen'::jsonb -> 'items' -> 1 ->> 'status_at_cut'),
  'cancelled',
  'T-NUT-HIST-API-03 the one still waiting was cancelled by the end itself');

select is(
  (:'frozen'::jsonb ->> 'scope_version')::integer,
  965,
  'T-NUT-HIST-API-04 read under the version frozen at the cut');

select is(
  pg_temp.events('019f6300-0000-7000-8000-000000000012'),
  array['allowed nutrition_guidance frozen 019f6300-0000-7000-8000-000000000c01'],
  'T-NUT-HIST-API-05 recorded under its category, the case and the frozen mode');

select is(
  pg_temp.goals('019f6300-0000-7000-8000-000000000012', '019f6300-0000-7000-8000-000000000d12',
    '019f6300-0000-7000-8000-000000000c03', '019f6300-0000-7000-8000-000000000702'),
  '{"outcome": "scope_required", "required_scope": {"code": "nutrition_guidance", "level": "read"}}'::jsonb,
  'T-NUT-HIST-API-06 a version that kept nothing readable afterwards reads nothing');

select is(
  pg_temp.events('019f6300-0000-7000-8000-000000000012'),
  array['denied nutrition_guidance frozen 019f6300-0000-7000-8000-000000000c03'],
  'T-NUT-HIST-API-07 and the refusal is recorded');

select is(
  pg_temp.sqlstate($$ select pg_temp.goals('019f6300-0000-7000-8000-000000000012', '019f6300-0000-7000-8000-000000000d10',
    '019f6300-0000-7000-8000-000000000c01') $$),
  'AF401',
  'T-NUT-HIST-API-08 without a fresh sign-in nothing is read');

select is(
  pg_temp.goals('019f6300-0000-7000-8000-000000000012', '019f6300-0000-7000-8000-000000000d12',
    '019f6300-0000-7000-8000-000000000c02') ->> 'outcome',
  'not_found',
  'T-NUT-HIST-API-09 an expired case reads nothing');

select is(
  pg_temp.goals('019f6300-0000-7000-8000-000000000013', '019f6300-0000-7000-8000-000000000d13',
    '019f6300-0000-7000-8000-000000000c01') ->> 'outcome',
  'not_found',
  'T-NUT-HIST-API-10 nor a coach the case does not name');

select is(
  pg_temp.goals('019f6300-0000-7000-8000-000000000012', '019f6300-0000-7000-8000-000000000d12',
    '019f6300-0000-7000-8000-000000000c01', '019f6300-0000-7000-8000-000000000702') ->> 'outcome',
  'not_found',
  'T-NUT-HIST-API-11 and a case opens only its own relationship');

-- Rows reach nobody without the case: the live read refuses an ended relationship.
reset role;
select pg_temp.act('019f6300-0000-7000-8000-000000000012');
set local role allfit_api;
select is(
  pg_temp.sqlstate($$ select nutrition.list_client_goal_versions('019f6300-0000-7000-8000-000000000012',
    '019f6300-0000-7000-8000-000000000101', '019f6300-0000-7000-8000-000000000001', 20, null, null) $$),
  'P0002',
  'T-NUT-HIST-API-12 without a case the ended relationship is not there');

reset role;
set local role allfit_owner;
select pg_temp.member('019f6300-0000-7000-8000-000000000012', '019f6300-0000-7000-8000-000000000212');
select is(
  (select count(*)::integer from nutrition.goal_versions where person_id = '019f6300-0000-7000-8000-000000000001'),
  0,
  'T-NUT-HIST-RLS-01 goal_versions_select_frozen: no frozen-history scope, no row');
select access_control.open_contract_scope('frozen_history', '019f6300-0000-7000-8000-000000000c01');
select is(
  (select array_agg(id order by created_at) from nutrition.goal_versions
   where person_id = '019f6300-0000-7000-8000-000000000001'),
  array['019f6300-0000-7000-8000-000000000e01', '019f6300-0000-7000-8000-000000000e02',
        '019f6300-0000-7000-8000-000000000e05']::uuid[],
  'T-NUT-HIST-RLS-02 goal_versions_select_frozen: through the case, this relationship''s proposals by the cut only');
select is(
  (select array_agg(goal_version_id) from nutrition.goal_decisions
   where person_id = '019f6300-0000-7000-8000-000000000001'),
  array['019f6300-0000-7000-8000-000000000e01']::uuid[],
  'T-NUT-HIST-RLS-03 goal_decisions_select_frozen: and what she had decided by then, nothing after');
reset role;

select pg_temp.act('019f6300-0000-7000-8000-000000000012');
set local role allfit_api;
select is(
  (select array_agg(scope ->> 'code' order by scope ->> 'code')
   from jsonb_array_elements(privacy.read_historical_relationship('019f6300-0000-7000-8000-000000000012',
     '019f6300-0000-7000-8000-000000000d12', '019f6300-0000-7000-8000-000000000101',
     '019f6300-0000-7000-8000-000000000701', '019f6300-0000-7000-8000-000000000c01') -> 'scopes') as scope),
  array['nutrition_guidance'],
  'T-NUT-HIST-API-13 the relationship lists her guidance among what stayed readable');

select * from finish();
rollback;
