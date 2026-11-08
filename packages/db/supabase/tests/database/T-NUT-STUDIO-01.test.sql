-- T-NUT-STUDIO-01 — OP-NUT-009, OP-NUT-010, OP-NUT-013 and the live OP-NUT-011
-- (HU-STUDIO-068, HU-STUDIO-069, HU-STUDIO-072, HU-STUDIO-070).
--
-- The coach who attends a person reads what she shares about what she eats:
--
--   · Her meals need `nutrition_intake`; their photo also needs `nutrition_media`, and one
--     never grants the other. Only the fields her version shares come back, and never the
--     storage key: the photo is served by the API, rechecked and recorded on every view.
--   · Daily totals are added up from what he may see, and only that.
--   · Her goals need `nutrition_guidance`: what this relationship proposed, with what she
--     decided, and her active goal, which says nothing of where it came from unless it is
--     this relationship's.
--   · Every read is recorded before it answers; an admin, an owner or a coach who does not
--     attend her reads nothing, and a revocation applies to the next request.
--
-- The scope versions are 961+ so this runs beside scopes a local seed published.
-- Written before the migration and watched failing.
begin;

select plan(46);

insert into identity.people (id, given_name, family_name, status)
values
  ('019f6100-0000-7000-8000-000000000001', 'Ana', 'Client', 'active'),
  ('019f6100-0000-7000-8000-000000000002', 'Bruno', 'Client', 'active'),
  ('019f6100-0000-7000-8000-000000000003', 'Carla', 'Client', 'active'),
  ('019f6100-0000-7000-8000-000000000011', 'Olivia', 'Owner', 'active'),
  ('019f6100-0000-7000-8000-000000000012', 'Camilo', 'Coach', 'active'),
  ('019f6100-0000-7000-8000-000000000013', 'Diana', 'Cover', 'active'),
  ('019f6100-0000-7000-8000-000000000015', 'Fabio', 'Unassigned', 'active'),
  ('019f6100-0000-7000-8000-000000000016', 'Gina', 'Admin', 'active'),
  ('019f6100-0000-7000-8000-000000000021', 'Zoe', 'Elsewhere', 'active');

insert into organizations.organizations (id, type_code, display_name, responsible_party)
values
  ('019f6100-0000-7000-8000-000000000101', 'gym', 'Gym A',
   '{"party_kind":"legal_entity","party_name":"Gym A SAS","purpose":"studio_operations"}'),
  ('019f6100-0000-7000-8000-000000000102', 'gym', 'Gym B',
   '{"party_kind":"legal_entity","party_name":"Gym B SAS","purpose":"studio_operations"}');

insert into organizations.organization_memberships (id, organization_id, person_id, status)
values
  ('019f6100-0000-7000-8000-000000000211', '019f6100-0000-7000-8000-000000000101', '019f6100-0000-7000-8000-000000000011', 'active'),
  ('019f6100-0000-7000-8000-000000000212', '019f6100-0000-7000-8000-000000000101', '019f6100-0000-7000-8000-000000000012', 'active'),
  ('019f6100-0000-7000-8000-000000000213', '019f6100-0000-7000-8000-000000000101', '019f6100-0000-7000-8000-000000000013', 'active'),
  ('019f6100-0000-7000-8000-000000000215', '019f6100-0000-7000-8000-000000000101', '019f6100-0000-7000-8000-000000000015', 'active'),
  ('019f6100-0000-7000-8000-000000000216', '019f6100-0000-7000-8000-000000000101', '019f6100-0000-7000-8000-000000000016', 'active'),
  ('019f6100-0000-7000-8000-000000000221', '019f6100-0000-7000-8000-000000000102', '019f6100-0000-7000-8000-000000000021', 'active');
insert into organizations.membership_roles (membership_id, role_code)
values
  ('019f6100-0000-7000-8000-000000000211', 'owner'),
  ('019f6100-0000-7000-8000-000000000212', 'coach'),
  ('019f6100-0000-7000-8000-000000000213', 'coach'),
  ('019f6100-0000-7000-8000-000000000215', 'coach'),
  ('019f6100-0000-7000-8000-000000000216', 'admin'),
  ('019f6100-0000-7000-8000-000000000221', 'coach');

insert into relationships.service_relationships (id, person_id, organization_id, status, started_at)
values
  ('019f6100-0000-7000-8000-000000000701', '019f6100-0000-7000-8000-000000000001', '019f6100-0000-7000-8000-000000000101', 'active', clock_timestamp() - interval '60 days'),
  ('019f6100-0000-7000-8000-000000000702', '019f6100-0000-7000-8000-000000000002', '019f6100-0000-7000-8000-000000000101', 'active', clock_timestamp() - interval '60 days'),
  ('019f6100-0000-7000-8000-000000000703', '019f6100-0000-7000-8000-000000000003', '019f6100-0000-7000-8000-000000000101', 'active', clock_timestamp() - interval '60 days'),
  ('019f6100-0000-7000-8000-000000000709', '019f6100-0000-7000-8000-000000000001', '019f6100-0000-7000-8000-000000000102', 'active', clock_timestamp() - interval '60 days');

insert into relationships.relationship_professional_assignments (
  id, relationship_id, person_id, organization_id, membership_id, covers_membership_id,
  kind, status, ends_on, accepted_by_person_at
) values
  ('019f6100-0000-7000-8000-000000000801', '019f6100-0000-7000-8000-000000000701', '019f6100-0000-7000-8000-000000000001',
   '019f6100-0000-7000-8000-000000000101', '019f6100-0000-7000-8000-000000000212', null, 'holder', 'active', null, null),
  ('019f6100-0000-7000-8000-000000000802', '019f6100-0000-7000-8000-000000000702', '019f6100-0000-7000-8000-000000000002',
   '019f6100-0000-7000-8000-000000000101', '019f6100-0000-7000-8000-000000000212', null, 'holder', 'active', null, null),
  ('019f6100-0000-7000-8000-000000000803', '019f6100-0000-7000-8000-000000000703', '019f6100-0000-7000-8000-000000000003',
   '019f6100-0000-7000-8000-000000000101', '019f6100-0000-7000-8000-000000000212', null, 'holder', 'active', null, null),
  ('019f6100-0000-7000-8000-000000000805', '019f6100-0000-7000-8000-000000000701', '019f6100-0000-7000-8000-000000000001',
   '019f6100-0000-7000-8000-000000000101', '019f6100-0000-7000-8000-000000000213', '019f6100-0000-7000-8000-000000000212',
   'substitute', 'active', (clock_timestamp() + interval '10 days')::date, clock_timestamp()),
  ('019f6100-0000-7000-8000-000000000809', '019f6100-0000-7000-8000-000000000709', '019f6100-0000-7000-8000-000000000001',
   '019f6100-0000-7000-8000-000000000102', '019f6100-0000-7000-8000-000000000221', null, 'holder', 'active', null, null);

-- 301 shares her whole log; 304 only when and what, without notes, zone or nutrients;
-- 305 shares photos without keeping where a photo is.
insert into privacy.scope_definitions (id, scope_code, version_number, status, published_at)
values
  ('019f6100-0000-7000-8000-000000000301', 'nutrition_intake', 961, 'draft', null),
  ('019f6100-0000-7000-8000-000000000302', 'nutrition_media', 961, 'draft', null),
  ('019f6100-0000-7000-8000-000000000303', 'nutrition_guidance', 961, 'draft', null),
  ('019f6100-0000-7000-8000-000000000304', 'nutrition_intake', 962, 'draft', null),
  ('019f6100-0000-7000-8000-000000000305', 'nutrition_media', 962, 'draft', null);
insert into privacy.scope_resource_rules (
  scope_definition_id, resource, field, data_classification_code, max_action, is_excluded
) values
  ('019f6100-0000-7000-8000-000000000301', 'nutrition.meals', 'occurred_at', 'nutrition', 'read', false),
  ('019f6100-0000-7000-8000-000000000301', 'nutrition.meals', 'timezone', 'nutrition', 'read', false),
  ('019f6100-0000-7000-8000-000000000301', 'nutrition.meals', 'local_date', 'nutrition', 'read', false),
  ('019f6100-0000-7000-8000-000000000301', 'nutrition.meals', 'meal_type', 'nutrition', 'read', false),
  ('019f6100-0000-7000-8000-000000000301', 'nutrition.meals', 'note', 'nutrition', 'read', false),
  ('019f6100-0000-7000-8000-000000000301', 'nutrition.meal_items', '*', 'nutrition', 'read', false),
  ('019f6100-0000-7000-8000-000000000301', 'nutrition.meal_nutrient_values', '*', 'nutrition', 'read', false),
  ('019f6100-0000-7000-8000-000000000301', 'nutrition.meals', 'media_ref', 'nutrition', 'read', true),
  ('019f6100-0000-7000-8000-000000000302', 'nutrition.meals', 'media_ref', 'nutrition', 'read', false),
  ('019f6100-0000-7000-8000-000000000303', 'nutrition.goal_sets', '*', 'nutrition', 'read', false),
  ('019f6100-0000-7000-8000-000000000303', 'nutrition.goal_versions', '*', 'nutrition', 'read', false),
  ('019f6100-0000-7000-8000-000000000303', 'nutrition.goal_targets', '*', 'nutrition', 'read', false),
  ('019f6100-0000-7000-8000-000000000303', 'nutrition.goal_decisions', '*', 'nutrition', 'read', false),
  ('019f6100-0000-7000-8000-000000000304', 'nutrition.meals', 'occurred_at', 'nutrition', 'read', false),
  ('019f6100-0000-7000-8000-000000000304', 'nutrition.meals', 'local_date', 'nutrition', 'read', false),
  ('019f6100-0000-7000-8000-000000000304', 'nutrition.meals', 'meal_type', 'nutrition', 'read', false),
  ('019f6100-0000-7000-8000-000000000304', 'nutrition.meal_items', 'position', 'nutrition', 'read', false),
  ('019f6100-0000-7000-8000-000000000304', 'nutrition.meal_items', 'name', 'nutrition', 'read', false),
  ('019f6100-0000-7000-8000-000000000305', 'nutrition.meals', 'local_date', 'nutrition', 'read', false);
update privacy.scope_definitions set status = 'published', published_at = clock_timestamp()
where id in ('019f6100-0000-7000-8000-000000000301', '019f6100-0000-7000-8000-000000000302',
             '019f6100-0000-7000-8000-000000000303', '019f6100-0000-7000-8000-000000000304',
             '019f6100-0000-7000-8000-000000000305');

-- One invitation offers the first three; another the narrower log.
insert into identity.invitations (
  id, organization_id, issued_by_membership_id, channel, contact,
  token_hash, token_key_version, proposal_hash, responsible_party, status, expires_at
)
select ('019f6100-0000-7000-8000-00000000040' || n)::uuid, '019f6100-0000-7000-8000-000000000101',
       '019f6100-0000-7000-8000-000000000211', 'email', 'client' || n || '@example.test',
       extensions.digest('nut-studio-token-' || n, 'sha256'), 1,
       extensions.digest('nut-studio-proposal-' || n, 'sha256'),
       '{"party_kind":"legal_entity","party_name":"Gym A SAS","purpose":"studio_operations"}',
       'completed', clock_timestamp() + interval '7 days'
from generate_series(1, 2) as n;
insert into identity.invitation_intents (id, invitation_id, kind, status, proposed_role_code)
select ('019f6100-0000-7000-8000-00000000050' || n)::uuid, ('019f6100-0000-7000-8000-00000000040' || n)::uuid,
       'service_relationship', 'pending', null
from generate_series(1, 2) as n;
insert into privacy.invitation_scope_options (
  id, invitation_intent_id, scope_definition_id, scope_code,
  offered_access_level, purpose, presented_snapshot, decision, decided_at
)
select ('019f6100-0000-7000-8000-00000000060' || n)::uuid, ('019f6100-0000-7000-8000-00000000050' || intent)::uuid,
       ('019f6100-0000-7000-8000-00000000030' || n)::uuid, code, 'read', 'Follow',
       '{"title":"Shared"}'::jsonb, 'accepted', clock_timestamp()
from (values (1, 1, 'nutrition_intake'), (2, 1, 'nutrition_media'), (3, 1, 'nutrition_guidance'),
             (4, 2, 'nutrition_intake'), (5, 2, 'nutrition_media')) as offered (n, intent, code);

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
    option.scope_definition_id, option.scope_code, grant_id, 'read', 'Follow'
  );
end
$$;
-- Ana shares all three with Gym A; Bruno only when and what he ate; Carla only photos.
select pg_temp.share('019f6100-0000-7000-8000-000000000701', '019f6100-0000-7000-8000-000000000a01', '019f6100-0000-7000-8000-000000000601');
select pg_temp.share('019f6100-0000-7000-8000-000000000701', '019f6100-0000-7000-8000-000000000a02', '019f6100-0000-7000-8000-000000000602');
select pg_temp.share('019f6100-0000-7000-8000-000000000701', '019f6100-0000-7000-8000-000000000a03', '019f6100-0000-7000-8000-000000000603');
select pg_temp.share('019f6100-0000-7000-8000-000000000702', '019f6100-0000-7000-8000-000000000a11', '019f6100-0000-7000-8000-000000000604');
select pg_temp.share('019f6100-0000-7000-8000-000000000703', '019f6100-0000-7000-8000-000000000a21', '019f6100-0000-7000-8000-000000000602');

select (clock_timestamp() at time zone 'America/Bogota')::date as today \gset

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

-- She records what she ate, as Space does: M1 and M2 yesterday, M3 forty days ago.
create function pg_temp.ate(person uuid, meal uuid, days integer, hour integer, kind text, note text, nutrients jsonb)
returns void language plpgsql as $$
begin
  perform pg_temp.act(person);
  perform nutrition.record_meal(person,
    jsonb_build_object(
      'occurred_at', to_char((clock_timestamp() at time zone 'America/Bogota')::date - days, 'YYYY-MM-DD') || 'T' || lpad(hour::text, 2, '0') || ':00:00-05:00',
      'timezone', 'America/Bogota', 'meal_type', kind, 'note', note,
      'items', jsonb_build_array(jsonb_build_object(
        'position', 1, 'name', 'Plato', 'quantity', 250, 'quantity_unit', 'g', 'nutrients', nutrients))),
    gen_random_uuid(), meal, extensions.digest(meal::text, 'sha256'));
end
$$;
select pg_temp.ate('019f6100-0000-7000-8000-000000000001', '019f6100-0000-7000-8000-000000000c01', 1, 12, 'lunch', 'Con prisa',
  '[{"nutrient_code":"energy","value":600,"unit":"kcal"},{"nutrient_code":"protein","value":40,"unit":"g"}]');
select pg_temp.ate('019f6100-0000-7000-8000-000000000001', '019f6100-0000-7000-8000-000000000c02', 1, 20, 'dinner', null,
  '[{"nutrient_code":"energy","value":500,"unit":"kcal"},{"nutrient_code":"fat","value":20,"unit":"g"}]');
select pg_temp.ate('019f6100-0000-7000-8000-000000000001', '019f6100-0000-7000-8000-000000000c03', 40, 12, 'lunch', null,
  '[{"nutrient_code":"energy","value":700,"unit":"kcal"}]');
select pg_temp.ate('019f6100-0000-7000-8000-000000000002', '019f6100-0000-7000-8000-000000000c11', 1, 13, 'lunch', 'Solo',
  '[{"nutrient_code":"energy","value":800,"unit":"kcal"}]');
select pg_temp.ate('019f6100-0000-7000-8000-000000000003', '019f6100-0000-7000-8000-000000000c21', 1, 13, 'lunch', null,
  '[{"nutrient_code":"energy","value":300,"unit":"kcal"}]');
-- The photos Space kept for M1, Bruno's and Carla's meals.
update nutrition.meals set media_ref = 'nutrition/' || person_id || '/' || id || '/photo.jpg', has_media = true
where id in ('019f6100-0000-7000-8000-000000000c01', '019f6100-0000-7000-8000-000000000c11',
             '019f6100-0000-7000-8000-000000000c21');

create function pg_temp.meals(actor uuid, subject uuid, from_day date, to_day date,
  page integer default 20, after_at timestamptz default null, after_id uuid default null)
returns jsonb language plpgsql as $$
begin
  perform pg_temp.act(actor);
  return nutrition.list_client_meals(actor, '019f6100-0000-7000-8000-000000000101', subject,
    from_day, to_day, page, after_at, after_id);
end
$$;
create function pg_temp.days(actor uuid, subject uuid, from_day date, to_day date)
returns jsonb language plpgsql as $$
begin
  perform pg_temp.act(actor);
  return nutrition.read_client_daily_summaries(actor, '019f6100-0000-7000-8000-000000000101', subject,
    from_day, to_day);
end
$$;
create function pg_temp.photo(actor uuid, subject uuid, meal uuid)
returns jsonb language plpgsql as $$
begin
  perform pg_temp.act(actor);
  return nutrition.open_client_meal_photo(actor, '019f6100-0000-7000-8000-000000000101', subject, meal);
end
$$;
create function pg_temp.goals(actor uuid, subject uuid)
returns jsonb language plpgsql as $$
begin
  perform pg_temp.act(actor);
  return nutrition.list_client_goal_versions(actor, '019f6100-0000-7000-8000-000000000101', subject, 20, null, null);
end
$$;
create function pg_temp.ids(page jsonb) returns uuid[] language sql as $$
  select coalesce(array_agg((item ->> 'id')::uuid order by ordinal), '{}')
  from jsonb_array_elements(page -> 'items') with ordinality as listed (item, ordinal)
$$;
create function pg_temp.sqlstate(statement text) returns text language plpgsql as $$
begin
  execute statement;
  return 'no error';
exception when assert_failure or others then
  return sqlstate;
end
$$;
-- Read as the test's superuser: the runtime role never reads the access record.
create function pg_temp.events(actor uuid) returns text[] language sql security definer as $$
  select coalesce(array_agg(event.result || ' ' || coalesce(event.scope_code, '-') || ' '
                            || event.access_mode::text order by event.result, event.scope_code), '{}')
  from privacy.access_events as event
  where event.actor_person_id = actor
    and event.request_id = current_setting('app.request_id')::uuid
$$;

set local role allfit_api;

-- ---------------------------------------------------------------------------
-- OP-NUT-009: her meals
-- ---------------------------------------------------------------------------
select pg_temp.meals('019f6100-0000-7000-8000-000000000012', '019f6100-0000-7000-8000-000000000001',
  :'today'::date - 7, :'today'::date) as ana \gset

select is(
  pg_temp.ids(:'ana'::jsonb),
  array['019f6100-0000-7000-8000-000000000c02', '019f6100-0000-7000-8000-000000000c01']::uuid[],
  'T-NUT-RLS-04 the holder reads her meals in the range, newest first, and nothing outside it');

select is(
  (:'ana'::jsonb -> 'items' -> 1) - 'occurred_at' - 'local_date',
  '{"id": "019f6100-0000-7000-8000-000000000c01", "timezone": "America/Bogota", "meal_type": "lunch",
    "note": "Con prisa", "has_photo": true,
    "items": [{"position": 1, "name": "Plato", "quantity": 250, "quantity_unit": "g", "serving": null,
               "origin": "typed",
               "nutrients": [{"nutrient_code": "energy", "value": 600, "unit": "kcal"},
                             {"nutrient_code": "protein", "value": 40, "unit": "g"}]}]}'::jsonb,
  'T-NUT-API-06 a meal as Studio sees it: what she shares, whether it has a photo, never where it is kept');

select is(
  pg_temp.events('019f6100-0000-7000-8000-000000000012'),
  array['allowed nutrition_intake live', 'allowed nutrition_media live'],
  'T-NUT-RLS-06 the read is recorded under her log and under her photos, before it answers');

select is(
  (:'ana'::jsonb ->> 'outcome'),
  'found',
  'T-NUT-RLS-04 and it is found');

select is(
  pg_temp.ids(pg_temp.meals('019f6100-0000-7000-8000-000000000013', '019f6100-0000-7000-8000-000000000001',
    :'today'::date - 7, :'today'::date)),
  array['019f6100-0000-7000-8000-000000000c02', '019f6100-0000-7000-8000-000000000c01']::uuid[],
  'T-NUT-RLS-04 the cover she accepted reads the same');

select is(
  pg_temp.sqlstate($$ select pg_temp.meals('019f6100-0000-7000-8000-000000000015', '019f6100-0000-7000-8000-000000000001',
    current_date - 7, current_date) $$),
  'P0002',
  'T-NUT-RLS-07 a coach who does not attend her finds no client');

select is(
  pg_temp.sqlstate($$ select pg_temp.meals('019f6100-0000-7000-8000-000000000011', '019f6100-0000-7000-8000-000000000001',
    current_date - 7, current_date) $$),
  'P0002',
  'T-NUT-RLS-08 the owner reads nothing by being the owner');

select is(
  pg_temp.sqlstate($$ select pg_temp.meals('019f6100-0000-7000-8000-000000000016', '019f6100-0000-7000-8000-000000000001',
    current_date - 7, current_date) $$),
  'P0002',
  'T-NUT-RLS-08 nor an admin by being an admin');

select pg_temp.meals('019f6100-0000-7000-8000-000000000012', '019f6100-0000-7000-8000-000000000002',
  :'today'::date - 7, :'today'::date) as bruno \gset
select is(
  (:'bruno'::jsonb -> 'items' -> 0) - 'id' - 'occurred_at' - 'local_date',
  '{"timezone": null, "meal_type": "lunch", "note": null, "has_photo": null,
    "items": [{"position": 1, "name": "Plato", "quantity": null, "quantity_unit": null, "serving": null,
               "origin": null, "nutrients": null}]}'::jsonb,
  'T-NUT-RLS-09 what his version does not share comes back empty, and without her photos nothing says one exists');

select is(
  pg_temp.events('019f6100-0000-7000-8000-000000000012'),
  array['allowed nutrition_intake live'],
  'T-NUT-RLS-09 a read that used no photo permission records none');

select is(
  pg_temp.meals('019f6100-0000-7000-8000-000000000012', '019f6100-0000-7000-8000-000000000003',
    :'today'::date - 7, :'today'::date),
  '{"outcome": "scope_required", "scope": "nutrition_intake"}'::jsonb,
  'T-NUT-RLS-10 her photos alone share no meal');

select is(
  pg_temp.events('019f6100-0000-7000-8000-000000000012'),
  array['denied nutrition_intake live'],
  'T-NUT-RLS-10 and the refusal is recorded');

select is(
  pg_temp.sqlstate($$ select pg_temp.meals('019f6100-0000-7000-8000-000000000012', '019f6100-0000-7000-8000-000000000001',
    current_date - 31, current_date) $$),
  '22023',
  'T-NUT-API-10 a page covers at most thirty-one days');

select is(
  pg_temp.sqlstate($$ select pg_temp.meals('019f6100-0000-7000-8000-000000000012', '019f6100-0000-7000-8000-000000000001',
    current_date, current_date - 1) $$),
  '22023',
  'T-NUT-API-10 and never ends before it starts');

select pg_temp.meals('019f6100-0000-7000-8000-000000000012', '019f6100-0000-7000-8000-000000000001',
  :'today'::date - 7, :'today'::date, 1) as first_page \gset
select is(
  pg_temp.ids(:'first_page'::jsonb),
  array['019f6100-0000-7000-8000-000000000c02']::uuid[],
  'T-NUT-API-10 a page holds what was asked for');

select is(
  pg_temp.ids(pg_temp.meals('019f6100-0000-7000-8000-000000000012', '019f6100-0000-7000-8000-000000000001',
    :'today'::date - 7, :'today'::date, 20,
    (:'first_page'::jsonb -> 'items' -> 0 ->> 'occurred_at')::timestamptz,
    (:'first_page'::jsonb -> 'items' -> 0 ->> 'id')::uuid)),
  array['019f6100-0000-7000-8000-000000000c01']::uuid[],
  'T-NUT-API-10 and the next one starts after it');

-- ---------------------------------------------------------------------------
-- OP-NUT-010: her days
-- ---------------------------------------------------------------------------
select pg_temp.days('019f6100-0000-7000-8000-000000000012', '019f6100-0000-7000-8000-000000000001',
  :'today'::date - 2, :'today'::date) as week \gset

select is(
  (select array_agg(jsonb_build_object('day', d ->> 'local_date', 'meals', (d ->> 'meal_count')::int)
                    order by d ->> 'local_date')
   from jsonb_array_elements(:'week'::jsonb -> 'days') as d),
  array[jsonb_build_object('day', :'today'::date - 2, 'meals', 0),
        jsonb_build_object('day', :'today'::date - 1, 'meals', 2),
        jsonb_build_object('day', :'today'::date, 'meals', 0)],
  'T-NUT-API-07 every day of the range, in order');

select is(
  :'week'::jsonb -> 'days' -> 1 -> 'nutrient_totals',
  '[{"nutrient_code": "energy", "value": 1100, "unit": "kcal"}, {"nutrient_code": "fat", "value": 20, "unit": "g"},
    {"nutrient_code": "protein", "value": 40, "unit": "g"}]'::jsonb,
  'T-NUT-RLS-14 a day adds up what she recorded and he may see');

select is(
  :'week'::jsonb -> 'days' -> 0 -> 'nutrient_totals',
  '[]'::jsonb,
  'T-NUT-RLS-14 a day with nothing has no totals, not zeros');

select is(
  pg_temp.events('019f6100-0000-7000-8000-000000000012'),
  array['allowed nutrition_intake live'],
  'T-NUT-RLS-06 and the totals are recorded as a read of her log');

select is(
  pg_temp.days('019f6100-0000-7000-8000-000000000012', '019f6100-0000-7000-8000-000000000002',
    :'today'::date - 1, :'today'::date - 1) -> 'days' -> 0,
  jsonb_build_object('local_date', :'today'::date - 1, 'meal_count', 1, 'nutrient_totals', null),
  'T-NUT-RLS-15 a version that shares no nutrients adds up none: a total never reveals what it hides');

select is(
  pg_temp.days('019f6100-0000-7000-8000-000000000012', '019f6100-0000-7000-8000-000000000003',
    :'today'::date - 1, :'today'::date),
  '{"outcome": "scope_required", "scope": "nutrition_intake"}'::jsonb,
  'T-NUT-RLS-10 without her log there are no totals either');

select is(
  pg_temp.sqlstate($$ select pg_temp.days('019f6100-0000-7000-8000-000000000012', '019f6100-0000-7000-8000-000000000001',
    current_date - 31, current_date) $$),
  '22023',
  'T-NUT-API-07 a summary covers at most thirty-one days');

-- ---------------------------------------------------------------------------
-- OP-NUT-013: a photo
-- ---------------------------------------------------------------------------
select is(
  pg_temp.photo('019f6100-0000-7000-8000-000000000012', '019f6100-0000-7000-8000-000000000001',
    '019f6100-0000-7000-8000-000000000c01'),
  '{"outcome": "found", "media_ref": "nutrition/019f6100-0000-7000-8000-000000000001/019f6100-0000-7000-8000-000000000c01/photo.jpg"}'::jsonb,
  'T-NUT-API-05 with both permissions the API learns where the photo is kept, and only the API');

select is(
  pg_temp.events('019f6100-0000-7000-8000-000000000012'),
  array['allowed nutrition_media live'],
  'T-NUT-RLS-16 each view is recorded on its own');

select is(
  pg_temp.photo('019f6100-0000-7000-8000-000000000012', '019f6100-0000-7000-8000-000000000001',
    '019f6100-0000-7000-8000-000000000c02'),
  '{"outcome": "not_found"}'::jsonb,
  'T-NUT-API-12 a meal without a photo has none');

select is(
  pg_temp.events('019f6100-0000-7000-8000-000000000012'),
  array['denied nutrition_media live'],
  'T-NUT-RLS-16 and the miss is recorded too');

select is(
  pg_temp.photo('019f6100-0000-7000-8000-000000000012', '019f6100-0000-7000-8000-000000000002',
    '019f6100-0000-7000-8000-000000000c11'),
  '{"outcome": "not_found"}'::jsonb,
  'T-NUT-RLS-11 without her photos permission the photo is not found');

select is(
  pg_temp.photo('019f6100-0000-7000-8000-000000000012', '019f6100-0000-7000-8000-000000000003',
    '019f6100-0000-7000-8000-000000000c21'),
  '{"outcome": "not_found"}'::jsonb,
  'T-NUT-RLS-12 nor with her photos alone: a photo never reveals a meal by itself');

select is(
  pg_temp.photo('019f6100-0000-7000-8000-000000000012', '019f6100-0000-7000-8000-000000000001',
    '019f6100-0000-7000-8000-000000000c11'),
  '{"outcome": "not_found"}'::jsonb,
  'T-NUT-RLS-13 nor a photo of somebody else asked through her');

select is(
  pg_temp.sqlstate($$ select pg_temp.photo('019f6100-0000-7000-8000-000000000015', '019f6100-0000-7000-8000-000000000001',
    '019f6100-0000-7000-8000-000000000c01') $$),
  'P0002',
  'T-NUT-RLS-07 a coach who does not attend her finds no client, and the API answers the same not found');

-- Bruno now shares his photos too, under a version that does not keep where a photo is.
reset role;
select pg_temp.share('019f6100-0000-7000-8000-000000000702', '019f6100-0000-7000-8000-000000000a12', '019f6100-0000-7000-8000-000000000605');
set local role allfit_api;

select is(
  pg_temp.photo('019f6100-0000-7000-8000-000000000012', '019f6100-0000-7000-8000-000000000002',
    '019f6100-0000-7000-8000-000000000c11'),
  '{"outcome": "not_found"}'::jsonb,
  'T-NUT-RLS-11 nor under a photos version that does not keep where the photo is');

select pg_temp.meals('019f6100-0000-7000-8000-000000000012', '019f6100-0000-7000-8000-000000000002',
  :'today'::date - 7, :'today'::date) as bruno_photos \gset
select is(
  jsonb_build_object('has_photo', :'bruno_photos'::jsonb -> 'items' -> 0 -> 'has_photo',
                     'photo_scope_version', :'bruno_photos'::jsonb -> 'photo_scope_version'),
  '{"has_photo": null, "photo_scope_version": null}'::jsonb,
  'T-NUT-RLS-09 and his meals say nothing of a photo, nor name that version');

-- ---------------------------------------------------------------------------
-- OP-NUT-011 live: her goals
-- ---------------------------------------------------------------------------
-- G1 is her own; Gym A proposed P1, which she rejected, and P3, still waiting; Gym B
-- proposed P2, which she accepted, so her active goal is not Gym A's.
reset role;
select pg_temp.act('019f6100-0000-7000-8000-000000000001');
select nutrition.publish_self_goal_version('019f6100-0000-7000-8000-000000000001', null,
  '[{"nutrient_code":"energy","mode":"exact","minimum":null,"maximum":null,"exact":2300,"unit":"kcal"}]'::jsonb,
  gen_random_uuid(), '019f6100-0000-7000-8000-000000000e01', decode(repeat('41', 32), 'hex'));
create function pg_temp.proposed(p_id uuid, p_number integer, p_relationship uuid, p_organization uuid,
  p_author uuid, p_membership uuid, p_assignment uuid, p_rationale text, p_kcal integer)
returns void language plpgsql as $$
begin
  insert into nutrition.goal_versions (id, goal_set_id, person_id, version_number, origin, status, rationale,
    author_person_id, author_membership_id, author_assignment_id, origin_relationship_id, origin_organization_id)
  select p_id, goal_set.id, goal_set.person_id, p_number, 'professional', 'proposed', p_rationale,
         p_author, p_membership, p_assignment, p_relationship, p_organization
  from nutrition.goal_sets as goal_set where goal_set.person_id = '019f6100-0000-7000-8000-000000000001';
  insert into nutrition.goal_targets (goal_version_id, nutrient_definition_id, mode, exact_value, unit_code)
  select p_id, definition.id, 'exact', p_kcal, 'kcal'
  from nutrition.nutrient_definitions as definition where definition.code = 'energy';
end
$$;
select pg_temp.proposed('019f6100-0000-7000-8000-000000000e02', 2, '019f6100-0000-7000-8000-000000000701',
  '019f6100-0000-7000-8000-000000000101', '019f6100-0000-7000-8000-000000000012',
  '019f6100-0000-7000-8000-000000000212', '019f6100-0000-7000-8000-000000000801', 'Menos energía.', 2000);
select nutrition.decide_goal_version('019f6100-0000-7000-8000-000000000001', '019f6100-0000-7000-8000-000000000e02',
  'rejected', gen_random_uuid(), '019f6100-0000-7000-8000-000000000f02', decode(repeat('42', 32), 'hex'));
select pg_temp.proposed('019f6100-0000-7000-8000-000000000e03', 3, '019f6100-0000-7000-8000-000000000709',
  '019f6100-0000-7000-8000-000000000102', '019f6100-0000-7000-8000-000000000021',
  '019f6100-0000-7000-8000-000000000221', '019f6100-0000-7000-8000-000000000809', 'Desde Gym B.', 2100);
select nutrition.decide_goal_version('019f6100-0000-7000-8000-000000000001', '019f6100-0000-7000-8000-000000000e03',
  'accepted', gen_random_uuid(), '019f6100-0000-7000-8000-000000000f03', decode(repeat('43', 32), 'hex'));
select pg_temp.proposed('019f6100-0000-7000-8000-000000000e04', 4, '019f6100-0000-7000-8000-000000000701',
  '019f6100-0000-7000-8000-000000000101', '019f6100-0000-7000-8000-000000000012',
  '019f6100-0000-7000-8000-000000000212', '019f6100-0000-7000-8000-000000000801', 'Un poco más.', 2200);
set local role allfit_api;

select pg_temp.goals('019f6100-0000-7000-8000-000000000012', '019f6100-0000-7000-8000-000000000001') as goals \gset

select is(
  pg_temp.ids(:'goals'::jsonb),
  array['019f6100-0000-7000-8000-000000000e04', '019f6100-0000-7000-8000-000000000e02']::uuid[],
  'T-NUT-RLS-20 what this relationship proposed, newest first; never her own goals nor another gym''s');

select is(
  (:'goals'::jsonb -> 'items' -> 1) - 'created_at' - 'decision',
  '{"id": "019f6100-0000-7000-8000-000000000e02", "status": "rejected", "rationale": "Menos energía.",
    "author": {"kind": "professional", "person_id": "019f6100-0000-7000-8000-000000000012"},
    "targets": [{"nutrient_code": "energy", "mode": "exact", "minimum": null, "maximum": null, "exact": 2000, "unit": "kcal"}],
    "activated_at": null, "cancelled_at": null}'::jsonb,
  'T-NUT-API-14 a proposal with its targets and its author, by id only');

select is(
  :'goals'::jsonb -> 'items' -> 1 -> 'decision' ->> 'decision',
  'rejected',
  'T-NUT-RLS-20 with what she decided');

select is(
  (:'goals'::jsonb -> 'active') - 'activated_at',
  '{"goal_version_id": null, "from_this_relationship": false,
    "targets": [{"nutrient_code": "energy", "mode": "exact", "minimum": null, "maximum": null, "exact": 2100, "unit": "kcal"}]}'::jsonb,
  'T-NUT-RLS-29 her active goal, without a word of who set it when it was not this relationship');

select is(
  pg_temp.events('019f6100-0000-7000-8000-000000000012'),
  array['allowed nutrition_guidance live'],
  'T-NUT-RLS-06 her goals are recorded as a read of her guidance');

-- The policies alone, without the filters the function adds on top.
reset role;
select pg_temp.act('019f6100-0000-7000-8000-000000000012');
select set_config('app.actor_org_id', '019f6100-0000-7000-8000-000000000101', true),
       set_config('app.actor_membership_id', '019f6100-0000-7000-8000-000000000212', true);
set local role allfit_owner;
select access_control.open_contract_scope('nutrition_review', '019f6100-0000-7000-8000-000000000701');
select is(
  (select array_agg(id order by version_number) from nutrition.goal_versions),
  array['019f6100-0000-7000-8000-000000000e02', '019f6100-0000-7000-8000-000000000e03',
        '019f6100-0000-7000-8000-000000000e04']::uuid[],
  'T-NUT-RLS-20 goal_versions_select_review: this relationship''s proposals and her active goal, nothing else');
select is(
  (select array_agg(id) from nutrition.goal_decisions),
  array['019f6100-0000-7000-8000-000000000f02']::uuid[],
  'T-NUT-RLS-20 goal_decisions_select_review: her decisions on this relationship''s proposals only');
select is(
  (select array_agg(id order by id) from nutrition.meals),
  array['019f6100-0000-7000-8000-000000000c01', '019f6100-0000-7000-8000-000000000c02',
        '019f6100-0000-7000-8000-000000000c03']::uuid[],
  'T-NUT-RLS-10 meals_select_review: her meals, never another client''s');

reset role;
select pg_temp.act('019f6100-0000-7000-8000-000000000001');
select nutrition.decide_goal_version('019f6100-0000-7000-8000-000000000001', '019f6100-0000-7000-8000-000000000e04',
  'accepted', gen_random_uuid(), '019f6100-0000-7000-8000-000000000f04', decode(repeat('44', 32), 'hex'));
set local role allfit_api;

select is(
  (pg_temp.goals('019f6100-0000-7000-8000-000000000012', '019f6100-0000-7000-8000-000000000001') -> 'active')
    - 'activated_at' - 'targets',
  '{"goal_version_id": "019f6100-0000-7000-8000-000000000e04", "from_this_relationship": true}'::jsonb,
  'T-NUT-RLS-29 once it is this relationship''s, it says so');

select is(
  pg_temp.goals('019f6100-0000-7000-8000-000000000012', '019f6100-0000-7000-8000-000000000002'),
  '{"outcome": "scope_required", "scope": "nutrition_guidance"}'::jsonb,
  'T-NUT-RLS-30 without her guidance there are no goals');

-- ---------------------------------------------------------------------------
-- A revocation applies to the next request
-- ---------------------------------------------------------------------------
reset role;
update privacy.data_grants set status = 'revoked', revoked_at = clock_timestamp()
where id in ('019f6100-0000-7000-8000-000000000a01', '019f6100-0000-7000-8000-000000000a02');
set local role allfit_api;

select is(
  pg_temp.meals('019f6100-0000-7000-8000-000000000012', '019f6100-0000-7000-8000-000000000001',
    :'today'::date - 7, :'today'::date),
  '{"outcome": "scope_required", "scope": "nutrition_intake"}'::jsonb,
  'T-NUT-RLS-15 once she revokes her log, the next read finds none');

select is(
  pg_temp.photo('019f6100-0000-7000-8000-000000000012', '019f6100-0000-7000-8000-000000000001',
    '019f6100-0000-7000-8000-000000000c01'),
  '{"outcome": "not_found"}'::jsonb,
  'T-NUT-RLS-16 nor the photo it showed a request ago');

reset role;
select pg_temp.act('019f6100-0000-7000-8000-000000000012');
select set_config('app.actor_org_id', '019f6100-0000-7000-8000-000000000101', true),
       set_config('app.actor_membership_id', '019f6100-0000-7000-8000-000000000212', true);
set local role allfit_owner;
select access_control.open_contract_scope('nutrition_review', '019f6100-0000-7000-8000-000000000701');
select is(
  (select count(*)::integer from nutrition.meals) + (select count(*)::integer from nutrition.meal_items)
  + (select count(*)::integer from nutrition.meal_nutrient_values),
  0,
  'T-NUT-RLS-15 meals_select_review, meal_items_select_review, meal_nutrient_values_select_review: revoked, no row');

select * from finish();
rollback;
