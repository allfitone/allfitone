-- Studio searches the global library and its own movements at once
-- (HU-STUDIO-067, OP-CAT-009/010, STUDIO-60).
--
-- What has to hold:
-- * Global published plus this organization's, and nothing of another organization's —
--   not by search, not by id, not by count (T-MOV-1) — not even what the searcher may see
--   as a person because that other gym planned it for him.
-- * The search covers names and other names; archived movements appear only when asked.
-- * Discipline, order and a keyset cursor, as the Space search already does.
-- * Fixtures use test disciplines and words the curated catalogue never has.
begin;

select plan(21);

insert into identity.people (id, given_name, family_name)
values
  ('019f5704-0000-7000-8000-000000000001', 'Olivia', 'Owner'),
  ('019f5704-0000-7000-8000-000000000002', 'Camilo', 'Coach'),
  ('019f5704-0000-7000-8000-000000000003', 'Sara', 'Staff'),
  ('019f5704-0000-7000-8000-000000000004', 'Otto', 'Other'),
  ('019f5704-0000-7000-8000-000000000006', 'Nadie', 'Fuera');

insert into organizations.organizations (id, type_code, display_name, responsible_party)
values
  ('019f5704-0000-7000-8000-000000000101', 'studio', 'Search One',
   '{"party_kind":"legal_entity","party_name":"Search One SAS","purpose":"studio_operations"}'),
  ('019f5704-0000-7000-8000-000000000102', 'studio', 'Search Other',
   '{"party_kind":"legal_entity","party_name":"Search Other SAS","purpose":"studio_operations"}');

insert into organizations.organization_memberships (id, organization_id, person_id)
values
  ('019f5704-0000-7000-8000-000000000201', '019f5704-0000-7000-8000-000000000101', '019f5704-0000-7000-8000-000000000001'),
  ('019f5704-0000-7000-8000-000000000202', '019f5704-0000-7000-8000-000000000101', '019f5704-0000-7000-8000-000000000002'),
  ('019f5704-0000-7000-8000-000000000203', '019f5704-0000-7000-8000-000000000101', '019f5704-0000-7000-8000-000000000003'),
  ('019f5704-0000-7000-8000-000000000204', '019f5704-0000-7000-8000-000000000102', '019f5704-0000-7000-8000-000000000004');

insert into organizations.membership_roles (membership_id, role_code)
values
  ('019f5704-0000-7000-8000-000000000201', 'owner'),
  ('019f5704-0000-7000-8000-000000000202', 'coach'),
  ('019f5704-0000-7000-8000-000000000203', 'staff'),
  ('019f5704-0000-7000-8000-000000000204', 'owner');

insert into catalog.movements (id, discipline_code, name, normalized_name, content_scope, status)
values
  ('019f5704-0000-7000-8000-0000000000f1', 'test_strength', 'Prensazo de prueba',
   'prensazo de prueba', 'global', 'published'),
  ('019f5704-0000-7000-8000-0000000000f2', 'test_strength', 'Remazo de prueba',
   'remazo de prueba', 'global', 'draft'),
  ('019f5704-0000-7000-8000-0000000000f3', 'test_endurance', 'Trotazo de prueba',
   'trotazo de prueba', 'global', 'published');
insert into catalog.movement_aliases (movement_id, locale, name)
values ('019f5704-0000-7000-8000-0000000000f1', 'es', 'Benchazo');

create function pg_temp.failure(statement text) returns text
language plpgsql as $$
declare
  state text;
  detail text;
begin
  execute statement;
  return 'no error';
exception when others then
  get stacked diagnostics state = returned_sqlstate, detail = pg_exception_detail;
  return state || ' ' || coalesce(detail, '');
end
$$;

create function pg_temp.names(page jsonb) returns text[]
language sql as $$
  select coalesce(array_agg(listed.item->>'name' order by listed.position), array[]::text[])
  from jsonb_array_elements(page->'data') with ordinality as listed(item, position)
$$;

select set_config('app.actor_kind', 'person', true);
set local role allfit_api;

select set_config('app.actor_person_id', '019f5704-0000-7000-8000-000000000002', true);
select (catalog.create_organization_movement(
  '019f5704-0000-7000-8000-000000000002', '019f5704-0000-7000-8000-000000000101',
  'test_strength', 'Prensazo de la casa', array['Prensazo casero'], null, null,
  gen_random_uuid(), extensions.uuid_generate_v7(), decode(repeat('a1', 32), 'hex'))).result->>'id' as own \gset
select (catalog.create_organization_movement(
  '019f5704-0000-7000-8000-000000000002', '019f5704-0000-7000-8000-000000000101',
  'test_strength', 'Remazo de la casa', null, null, null,
  gen_random_uuid(), extensions.uuid_generate_v7(), decode(repeat('a2', 32), 'hex'))).result->>'id' as retired \gset
select set_config('app.actor_person_id', '019f5704-0000-7000-8000-000000000001', true);
select catalog.archive_organization_movement(
  '019f5704-0000-7000-8000-000000000001', '019f5704-0000-7000-8000-000000000101', :'retired'::uuid,
  gen_random_uuid(), extensions.uuid_generate_v7(), decode(repeat('a3', 32), 'hex'));
select set_config('app.actor_person_id', '019f5704-0000-7000-8000-000000000004', true);
select (catalog.create_organization_movement(
  '019f5704-0000-7000-8000-000000000004', '019f5704-0000-7000-8000-000000000102',
  'test_strength', 'Prensazo ajeno', array['Prensazo casero'], null, null,
  gen_random_uuid(), extensions.uuid_generate_v7(), decode(repeat('a4', 32), 'hex'))).result->>'id' as foreign_movement \gset

-- Camilo also trains with the other gym, which planned him its own movement: as a person he
-- sees it (OP-PLN-021), and still his gym's library never offers it.
select (planning.create_session_template(
  '019f5704-0000-7000-8000-000000000004', '019f5704-0000-7000-8000-000000000102',
  'test_strength', 'Ajena', gen_random_uuid(), extensions.uuid_generate_v7(),
  decode(repeat('b1', 32), 'hex'))).result as template \gset
select (planning.replace_session_template_draft(
  '019f5704-0000-7000-8000-000000000004', '019f5704-0000-7000-8000-000000000102',
  (:'template'::jsonb->>'id')::uuid, :'template'::jsonb->'draft'->>'etag',
  jsonb_build_object('title', 'Ajena', 'activity_type_id', '019c0000-0000-7000-8000-000000000011',
    'steps', jsonb_build_array(jsonb_build_object('position', 1, 'movement_id', :'foreign_movement',
      'target', jsonb_build_object('family', 'strength', 'target_sets', 3)))),
  gen_random_uuid(), extensions.uuid_generate_v7(), decode(repeat('b2', 32), 'hex'))).result->>'etag' as etag \gset
select (planning.publish_session_template_version(
  '019f5704-0000-7000-8000-000000000004', '019f5704-0000-7000-8000-000000000102',
  (:'template'::jsonb->>'id')::uuid, :'etag', gen_random_uuid(),
  extensions.uuid_generate_v7(), decode(repeat('b3', 32), 'hex'))).result->>'id' as version \gset

reset role;
insert into planning.programs (id, content_scope, status)
values ('019f5704-0000-7000-8000-000000000301', 'global', 'published');
select set_config('app.planning_publication', 'true', true);
insert into planning.program_versions (id, program_id, version_number, title, content_hash)
values ('019f5704-0000-7000-8000-000000000302', '019f5704-0000-7000-8000-000000000301', 1,
  'Plan', decode(repeat('c1', 32), 'hex'));
select set_config('app.planning_publication', '', true);
insert into planning.program_assignments (
  id, person_id, program_version_id, lifecycle, starts_on, timezone, display_order
) values ('019f5704-0000-7000-8000-000000000303', '019f5704-0000-7000-8000-000000000002',
  '019f5704-0000-7000-8000-000000000302', 'personal', current_date, 'America/Bogota', 1);
insert into planning.planned_sessions (
  id, assignment_id, person_id, template_version_id, program_day, week_starts_on, scheduled_at, timezone
) values (
  '019f5704-0000-7000-8000-000000000304', '019f5704-0000-7000-8000-000000000303',
  '019f5704-0000-7000-8000-000000000002', :'version'::uuid, 1,
  date_trunc('week', current_date::timestamp)::date, clock_timestamp(), 'America/Bogota'
);
set local role allfit_api;

select set_config('app.actor_person_id', '019f5704-0000-7000-8000-000000000002', true);
select is(
  pg_temp.names(catalog.search_organization_movements(
    '019f5704-0000-7000-8000-000000000002', '019f5704-0000-7000-8000-000000000101',
    'prensazo', 'test_strength', false, 25, null)),
  array['Prensazo de la casa', 'Prensazo de prueba'],
  'T-CAT-MOVEMENT-SEARCH-API-01 the global library and its own, in name order, and nobody else''s');
select is(
  (select array_agg(item->>'scope' order by item->>'name')
   from jsonb_array_elements((catalog.search_organization_movements(
     '019f5704-0000-7000-8000-000000000002', '019f5704-0000-7000-8000-000000000101',
     'prensazo', 'test_strength', false, 25, null))->'data') as item),
  array['organization', 'global'], 'T-CAT-MOVEMENT-SEARCH-API-02 each result says whose it is');
select is(
  pg_temp.names(catalog.search_organization_movements(
    '019f5704-0000-7000-8000-000000000002', '019f5704-0000-7000-8000-000000000101',
    'casero', null, false, 25, null)),
  array['Prensazo de la casa'], 'T-CAT-MOVEMENT-SEARCH-API-03 its own movement is found by another name');
select is(
  pg_temp.names(catalog.search_organization_movements(
    '019f5704-0000-7000-8000-000000000002', '019f5704-0000-7000-8000-000000000101',
    'benchazo', null, false, 25, null)),
  array['Prensazo de prueba'], 'T-CAT-MOVEMENT-SEARCH-API-04 and so is a global one');
select is(
  pg_temp.names(catalog.search_organization_movements(
    '019f5704-0000-7000-8000-000000000002', '019f5704-0000-7000-8000-000000000101',
    'de la casa', 'test_strength', false, 25, null)),
  array['Prensazo de la casa'], 'T-CAT-MOVEMENT-SEARCH-API-05 an archived movement is not offered');
select is(
  (select array_agg((item->>'name') || ':' || (item->>'archived') order by item->>'name')
   from jsonb_array_elements((catalog.search_organization_movements(
     '019f5704-0000-7000-8000-000000000002', '019f5704-0000-7000-8000-000000000101',
     'de la casa', 'test_strength', true, 25, null))->'data') as item),
  array['Prensazo de la casa:false', 'Remazo de la casa:true'],
  'T-CAT-MOVEMENT-SEARCH-API-06 unless asked for, and then it says it is archived');
select is(
  pg_temp.names(catalog.search_organization_movements(
    '019f5704-0000-7000-8000-000000000002', '019f5704-0000-7000-8000-000000000101',
    'remazo de prueba', null, true, 25, null)),
  array[]::text[], 'T-CAT-MOVEMENT-SEARCH-API-07 a global movement nobody published never appears');
select is(
  pg_temp.names(catalog.search_organization_movements(
    '019f5704-0000-7000-8000-000000000002', '019f5704-0000-7000-8000-000000000101',
    'ajeno', null, true, 100, null)),
  array[]::text[], 'T-CAT-MOVEMENT-SEARCH-API-08 another organization''s never appears, not even one planned for him');
select is(
  pg_temp.names(catalog.search_organization_movements(
    '019f5704-0000-7000-8000-000000000002', '019f5704-0000-7000-8000-000000000101',
    'azo de prueba', 'test_endurance', false, 25, null)),
  array['Trotazo de prueba'], 'T-CAT-MOVEMENT-SEARCH-API-09 the discipline narrows it');

select catalog.search_organization_movements(
  '019f5704-0000-7000-8000-000000000002', '019f5704-0000-7000-8000-000000000101',
  'prensazo', 'test_strength', false, 1, null) as first_page \gset
select is(
  row(pg_temp.names(:'first_page'::jsonb), :'first_page'::jsonb->'page'->>'has_more')::text,
  row(array['Prensazo de la casa'], 'true')::text,
  'T-CAT-MOVEMENT-SEARCH-API-10 a page says when there is more');
select is(
  (select row(pg_temp.names(page), page->'page'->>'has_more', page->'page'->>'next_cursor')::text
   from catalog.search_organization_movements(
     '019f5704-0000-7000-8000-000000000002', '019f5704-0000-7000-8000-000000000101',
     'prensazo', 'test_strength', false, 1, :'first_page'::jsonb->'page'->>'next_cursor') as page),
  row(array['Prensazo de prueba'], 'false', null)::text,
  'T-CAT-MOVEMENT-SEARCH-API-11 and the cursor continues after the last one shown');
select is(pg_temp.failure(format(
  'select catalog.search_organization_movements(%L, %L, null, null, false, 25, %L)',
  '019f5704-0000-7000-8000-000000000002', '019f5704-0000-7000-8000-000000000101', 'no-es-un-cursor')),
  '22023 ', 'T-CAT-MOVEMENT-SEARCH-API-12 a cursor that is not ours is refused');
select is(
  pg_temp.names(catalog.search_organization_movements(
    '019f5704-0000-7000-8000-000000000002', '019f5704-0000-7000-8000-000000000101',
    '%', 'test_strength', true, 100, null)),
  array[]::text[], 'T-CAT-MOVEMENT-SEARCH-API-13 what is typed is matched literally, not as a pattern');
select is(
  (select array_agg(key order by key) from jsonb_object_keys(
    (catalog.search_organization_movements(
      '019f5704-0000-7000-8000-000000000002', '019f5704-0000-7000-8000-000000000101',
      'casero', null, false, 25, null))->'data'->0) as key),
  array['archived', 'demo_object_key', 'discipline_code', 'equipment', 'id', 'muscles', 'name', 'scope'],
  'T-CAT-MOVEMENT-SEARCH-API-14 a result carries exactly what the picker shows');

select set_config('app.actor_person_id', '019f5704-0000-7000-8000-000000000003', true);
select is(pg_temp.failure(format(
  'select catalog.search_organization_movements(%L, %L, null, null, false, 25, null)',
  '019f5704-0000-7000-8000-000000000003', '019f5704-0000-7000-8000-000000000101')),
  '42501 ', 'T-CAT-MOVEMENT-SEARCH-API-15 staff, who compose no content, do not search it');
select set_config('app.actor_person_id', '019f5704-0000-7000-8000-000000000006', true);
select is(pg_temp.failure(format(
  'select catalog.search_organization_movements(%L, %L, null, null, false, 25, null)',
  '019f5704-0000-7000-8000-000000000006', '019f5704-0000-7000-8000-000000000101')),
  'P0002 ', 'T-CAT-MOVEMENT-SEARCH-API-16 somebody outside the organization searches nothing');
select is(pg_temp.failure(format(
  'select catalog.read_organization_movement(%L, %L, %L)',
  '019f5704-0000-7000-8000-000000000006', '019f5704-0000-7000-8000-000000000101', :'own')),
  'P0002 ', 'T-CAT-MOVEMENT-SEARCH-API-17 and reads nothing');

select set_config('app.actor_person_id', '019f5704-0000-7000-8000-000000000002', true);
select is(
  (select jsonb_build_object('name', document->'name', 'aliases', document->'aliases',
     'scope', document->'scope', 'archived', document->'archived')
   from catalog.read_organization_movement(
     '019f5704-0000-7000-8000-000000000002', '019f5704-0000-7000-8000-000000000101', :'own'::uuid) as document),
  '{"name":"Prensazo de la casa","aliases":["Prensazo casero"],"scope":"organization","archived":false}'::jsonb,
  'T-CAT-MOVEMENT-SEARCH-API-18 its own movement reads whole');
select is(
  (select row(document->>'scope', document->>'name_locked', document->'aliases')::text
   from catalog.read_organization_movement(
     '019f5704-0000-7000-8000-000000000002', '019f5704-0000-7000-8000-000000000101',
     '019f5704-0000-7000-8000-0000000000f1') as document),
  row('global', 'true', '["Benchazo"]'::jsonb)::text,
  'T-CAT-MOVEMENT-SEARCH-API-19 a global one reads too, and is never Studio''s to rename');
select is(
  catalog.read_organization_movement(
    '019f5704-0000-7000-8000-000000000002', '019f5704-0000-7000-8000-000000000101', :'foreign_movement'::uuid),
  null, 'T-CAT-MOVEMENT-SEARCH-API-20 another organization''s reads as if it did not exist, planned or not (T-MOV-1)');
select is(
  catalog.read_organization_movement(
    '019f5704-0000-7000-8000-000000000002', '019f5704-0000-7000-8000-000000000101',
    '019f5704-0000-7000-8000-0000000000f2'),
  null, 'T-CAT-MOVEMENT-SEARCH-API-21 and so does a global one nobody published');

select * from finish();
rollback;
