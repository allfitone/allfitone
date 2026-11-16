-- A gym archives a movement of its own (HU-STUDIO-066, OP-CAT-003, STUDIO-59).
--
-- What has to hold:
-- * Only owner and admin archive; a coach composes content but does not retire it.
-- * Archiving converges, keeps the row, and takes the movement out of new content:
--   a draft that uses it no longer publishes.
-- * What was published with it still resolves it, and a referenced movement is never
--   deleted (T-MOV-3).
begin;

select plan(16);

insert into identity.people (id, given_name, family_name)
values
  ('019f5703-0000-7000-8000-000000000001', 'Olivia', 'Owner'),
  ('019f5703-0000-7000-8000-000000000002', 'Camilo', 'Coach'),
  ('019f5703-0000-7000-8000-000000000003', 'Sara', 'Staff'),
  ('019f5703-0000-7000-8000-000000000004', 'Otto', 'Other'),
  ('019f5703-0000-7000-8000-000000000005', 'Ada', 'Admin');

insert into organizations.organizations (id, type_code, display_name, responsible_party)
values
  ('019f5703-0000-7000-8000-000000000101', 'studio', 'Archive One',
   '{"party_kind":"legal_entity","party_name":"Archive One SAS","purpose":"studio_operations"}'),
  ('019f5703-0000-7000-8000-000000000102', 'studio', 'Archive Other',
   '{"party_kind":"legal_entity","party_name":"Archive Other SAS","purpose":"studio_operations"}');

insert into organizations.organization_memberships (id, organization_id, person_id)
values
  ('019f5703-0000-7000-8000-000000000201', '019f5703-0000-7000-8000-000000000101', '019f5703-0000-7000-8000-000000000001'),
  ('019f5703-0000-7000-8000-000000000202', '019f5703-0000-7000-8000-000000000101', '019f5703-0000-7000-8000-000000000002'),
  ('019f5703-0000-7000-8000-000000000203', '019f5703-0000-7000-8000-000000000101', '019f5703-0000-7000-8000-000000000003'),
  ('019f5703-0000-7000-8000-000000000204', '019f5703-0000-7000-8000-000000000102', '019f5703-0000-7000-8000-000000000004'),
  ('019f5703-0000-7000-8000-000000000205', '019f5703-0000-7000-8000-000000000101', '019f5703-0000-7000-8000-000000000005');

insert into organizations.membership_roles (membership_id, role_code)
values
  ('019f5703-0000-7000-8000-000000000201', 'owner'),
  ('019f5703-0000-7000-8000-000000000202', 'coach'),
  ('019f5703-0000-7000-8000-000000000203', 'staff'),
  ('019f5703-0000-7000-8000-000000000204', 'owner'),
  ('019f5703-0000-7000-8000-000000000205', 'admin');

insert into catalog.movements (id, discipline_code, name, normalized_name, content_scope, status)
values ('019f5703-0000-7000-8000-0000000000f1', 'test_strength', 'Global de archivo',
        'global de archivo', 'global', 'published');

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

create function pg_temp.archive_call(actor text, movement text) returns text
language sql as $$
  select format(
    'select * from catalog.archive_organization_movement(%L, %L, %L, %L, %L, %L)',
    actor, '019f5703-0000-7000-8000-000000000101', movement,
    gen_random_uuid(), extensions.uuid_generate_v7(), sha256(convert_to(random()::text, 'UTF8')))
$$;

create function pg_temp.routine(movement text) returns jsonb
language sql as $$
  select jsonb_build_object('title', 'Con propio', 'activity_type_id', '019c0000-0000-7000-8000-000000000011',
    'steps', jsonb_build_array(jsonb_build_object('position', 1, 'movement_id', movement,
      'target', jsonb_build_object('family', 'strength', 'target_sets', 3))))
$$;

select set_config('app.actor_kind', 'person', true);
select set_config('app.actor_person_id', '019f5703-0000-7000-8000-000000000002', true);
set local role allfit_api;

-- Camilo creates it, publishes one routine with it and leaves a second one drafted.
select (catalog.create_organization_movement(
  '019f5703-0000-7000-8000-000000000002', '019f5703-0000-7000-8000-000000000101',
  'test_strength', 'Peso muerto de la casa', null, null, null,
  gen_random_uuid(), extensions.uuid_generate_v7(), decode(repeat('e1', 32), 'hex'))).result->>'id' as movement \gset

select (planning.create_session_template(
  '019f5703-0000-7000-8000-000000000002', '019f5703-0000-7000-8000-000000000101',
  'test_strength', 'Publicada', gen_random_uuid(), extensions.uuid_generate_v7(),
  decode(repeat('e2', 32), 'hex'))).result as published_template \gset
select (planning.replace_session_template_draft(
  '019f5703-0000-7000-8000-000000000002', '019f5703-0000-7000-8000-000000000101',
  (:'published_template'::jsonb->>'id')::uuid, :'published_template'::jsonb->'draft'->>'etag',
  pg_temp.routine(:'movement'), gen_random_uuid(), extensions.uuid_generate_v7(),
  decode(repeat('e3', 32), 'hex'))).result->>'etag' as published_etag \gset
select (planning.publish_session_template_version(
  '019f5703-0000-7000-8000-000000000002', '019f5703-0000-7000-8000-000000000101',
  (:'published_template'::jsonb->>'id')::uuid, :'published_etag', gen_random_uuid(),
  extensions.uuid_generate_v7(), decode(repeat('e4', 32), 'hex'))).result->>'id' as version \gset

select (planning.create_session_template(
  '019f5703-0000-7000-8000-000000000002', '019f5703-0000-7000-8000-000000000101',
  'test_strength', 'Borrador', gen_random_uuid(), extensions.uuid_generate_v7(),
  decode(repeat('e5', 32), 'hex'))).result as drafted_template \gset
select (planning.replace_session_template_draft(
  '019f5703-0000-7000-8000-000000000002', '019f5703-0000-7000-8000-000000000101',
  (:'drafted_template'::jsonb->>'id')::uuid, :'drafted_template'::jsonb->'draft'->>'etag',
  pg_temp.routine(:'movement'), gen_random_uuid(), extensions.uuid_generate_v7(),
  decode(repeat('e6', 32), 'hex'))).result->>'etag' as drafted_etag \gset

select is(pg_temp.failure(pg_temp.archive_call('019f5703-0000-7000-8000-000000000002', :'movement')),
  '42501 ', 'T-CAT-MOVEMENT-ARCHIVE-API-01 a coach does not archive');
select set_config('app.actor_person_id', '019f5703-0000-7000-8000-000000000003', true);
select is(pg_temp.failure(pg_temp.archive_call('019f5703-0000-7000-8000-000000000003', :'movement')),
  '42501 ', 'T-CAT-MOVEMENT-ARCHIVE-API-02 nor does staff');
select set_config('app.actor_person_id', '019f5703-0000-7000-8000-000000000004', true);
select is(pg_temp.failure(pg_temp.archive_call('019f5703-0000-7000-8000-000000000004', :'movement')),
  'P0002 ', 'T-CAT-MOVEMENT-ARCHIVE-API-03 nor somebody from another organization');

select set_config('app.actor_person_id', '019f5703-0000-7000-8000-000000000005', true);
select (catalog.archive_organization_movement(
  '019f5703-0000-7000-8000-000000000005', '019f5703-0000-7000-8000-000000000101', :'movement'::uuid,
  '57030000-0000-4000-8000-000000000001', '019f5703-0000-7000-8000-00000000c001',
  decode(repeat('f1', 32), 'hex'))).result as archived \gset
select is(
  jsonb_build_object('archived', :'archived'::jsonb->'archived', 'revision', :'archived'::jsonb->'revision',
    'name', :'archived'::jsonb->'name'),
  '{"archived":true,"revision":2,"name":"Peso muerto de la casa"}'::jsonb,
  'T-CAT-MOVEMENT-ARCHIVE-API-04 an admin archives it, at the next revision');
select is(
  (select row(result->>'revision', replayed)::text from catalog.archive_organization_movement(
    '019f5703-0000-7000-8000-000000000005', '019f5703-0000-7000-8000-000000000101', :'movement'::uuid,
    '57030000-0000-4000-8000-000000000001', '019f5703-0000-7000-8000-00000000c001',
    decode(repeat('f1', 32), 'hex'))),
  row('2', true)::text, 'T-CAT-MOVEMENT-ARCHIVE-IDEM-01 the same request under its key replays');

select set_config('app.actor_person_id', '019f5703-0000-7000-8000-000000000001', true);
select is(
  (select row(result->>'archived', result->>'revision', replayed)::text
   from catalog.archive_organization_movement(
    '019f5703-0000-7000-8000-000000000001', '019f5703-0000-7000-8000-000000000101', :'movement'::uuid,
    gen_random_uuid(), extensions.uuid_generate_v7(), decode(repeat('f2', 32), 'hex'))),
  row('true', '2', false)::text,
  'T-CAT-MOVEMENT-ARCHIVE-API-05 an owner archiving it again converges without another revision');
select is(pg_temp.failure(pg_temp.archive_call(
  '019f5703-0000-7000-8000-000000000001', '019f5703-0000-7000-8000-0000000000f1')),
  'P0002 ', 'T-CAT-MOVEMENT-ARCHIVE-API-06 a global movement is not archived from Studio');

-- Out of new content.
select set_config('app.actor_person_id', '019f5703-0000-7000-8000-000000000002', true);
select is(pg_temp.failure(format(
  'select * from planning.publish_session_template_version(%L, %L, %L, %L, %L, %L, %L)',
  '019f5703-0000-7000-8000-000000000002', '019f5703-0000-7000-8000-000000000101',
  :'drafted_template'::jsonb->>'id', :'drafted_etag', gen_random_uuid(),
  extensions.uuid_generate_v7(), decode(repeat('f3', 32), 'hex'))),
  '22023 ["movement"]', 'T-CAT-MOVEMENT-ARCHIVE-INT-01 a draft that uses it no longer publishes');
select is(
  (select count(*)::integer
   from jsonb_array_elements((catalog.search_organization_movements(
     '019f5703-0000-7000-8000-000000000002', '019f5703-0000-7000-8000-000000000101',
     'peso muerto de la casa', null, false, 25, null))->'data')),
  0, 'T-CAT-MOVEMENT-ARCHIVE-INT-02 and the search for new content no longer offers it');
select is(
  (catalog.read_organization_movement(
    '019f5703-0000-7000-8000-000000000002', '019f5703-0000-7000-8000-000000000101',
    :'movement'::uuid))->>'archived',
  'true', 'T-CAT-MOVEMENT-ARCHIVE-INT-03 while it is still read, marked archived');

reset role;
set local role allfit_owner;
select set_config('app.actor_org_id', '019f5703-0000-7000-8000-000000000101', true);
select is(
  (select movement.name
   from planning.planned_steps as step
   join catalog.movements as movement on movement.id = step.movement_id
   where step.template_version_id = :'version'::uuid),
  'Peso muerto de la casa',
  'T-CAT-MOVEMENT-ARCHIVE-INT-04 the version published with it still resolves its name');
reset role;

select is(
  (select row(movement.status, movement.revision_number)::text
   from catalog.movements as movement where movement.id = :'movement'::uuid),
  row('archived', 2)::text, 'T-CAT-MOVEMENT-ARCHIVE-INT-05 the row is kept, archived');
select ok(pg_temp.failure(format('delete from catalog.movements where id = %L', :'movement'))
  like '23503 %is still referenced from table "planned_steps".',
  'T-CAT-MOVEMENT-ARCHIVE-INT-06 a movement history references is never deleted (T-MOV-3)');
select is(
  (select row(revision.revision_from, revision.revision_to, revision.actor_membership_id,
              revision.before->>'status', revision.after->>'status')::text
   from catalog.movement_revisions as revision where revision.movement_id = :'movement'::uuid),
  row(1, 2, '019f5703-0000-7000-8000-000000000205', 'published', 'archived')::text,
  'T-CAT-MOVEMENT-ARCHIVE-INT-07 archiving leaves one revision, by who archived it');
select is(
  (select array_agg(event.payload)
   from system.outbox_events as event
   where event.aggregate_id = :'movement'::uuid and event.event_type = 'catalog.private_movement_archived.v1'),
  array[jsonb_build_object('movement_id', :'movement', 'organization_id',
    '019f5703-0000-7000-8000-000000000101', 'revision', 2)],
  'T-CAT-MOVEMENT-ARCHIVE-INT-08 and one event, which converging does not repeat');
select is(
  (select array_agg(capability.role_code order by capability.role_code)
   from organizations.role_capabilities as capability
   where capability.capability_code = 'archive_movements'),
  array['admin', 'owner'],
  'T-CAT-MOVEMENT-ARCHIVE-RLS-01 archiving is the owner''s and the admin''s, never the coach''s');

select * from finish();
rollback;
