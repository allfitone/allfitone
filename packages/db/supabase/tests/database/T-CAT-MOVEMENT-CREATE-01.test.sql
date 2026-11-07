-- A gym creates a movement of its own (HU-STUDIO-064, OP-CAT-001, STUDIO-57).
--
-- What has to hold:
-- * Owner, admin and coach create; staff and outsiders cannot.
-- * Only a published discipline, and a name the organization does not already use. The
--   same name in another organization, or the same as a global one, is not a duplicate.
-- * Aliases, equipment and a variant of a global movement are optional and validated.
-- * It replays under its key, and the event carries identifiers only.
-- * Disciplines stay the platform's: the runtime has no way to write one.
begin;

select plan(36);

insert into identity.people (id, given_name, family_name)
values
  ('019f5701-0000-7000-8000-000000000001', 'Olivia', 'Owner'),
  ('019f5701-0000-7000-8000-000000000002', 'Camilo', 'Coach'),
  ('019f5701-0000-7000-8000-000000000003', 'Sara', 'Staff'),
  ('019f5701-0000-7000-8000-000000000004', 'Otto', 'Other'),
  ('019f5701-0000-7000-8000-000000000005', 'Ada', 'Admin');

insert into organizations.organizations (id, type_code, display_name, responsible_party)
values
  ('019f5701-0000-7000-8000-000000000101', 'studio', 'Movements One',
   '{"party_kind":"legal_entity","party_name":"Movements One SAS","purpose":"studio_operations"}'),
  ('019f5701-0000-7000-8000-000000000102', 'studio', 'Movements Other',
   '{"party_kind":"legal_entity","party_name":"Movements Other SAS","purpose":"studio_operations"}');

insert into organizations.organization_memberships (id, organization_id, person_id)
values
  ('019f5701-0000-7000-8000-000000000201', '019f5701-0000-7000-8000-000000000101', '019f5701-0000-7000-8000-000000000001'),
  ('019f5701-0000-7000-8000-000000000202', '019f5701-0000-7000-8000-000000000101', '019f5701-0000-7000-8000-000000000002'),
  ('019f5701-0000-7000-8000-000000000203', '019f5701-0000-7000-8000-000000000101', '019f5701-0000-7000-8000-000000000003'),
  ('019f5701-0000-7000-8000-000000000204', '019f5701-0000-7000-8000-000000000102', '019f5701-0000-7000-8000-000000000004'),
  ('019f5701-0000-7000-8000-000000000205', '019f5701-0000-7000-8000-000000000101', '019f5701-0000-7000-8000-000000000005');

insert into organizations.membership_roles (membership_id, role_code)
values
  ('019f5701-0000-7000-8000-000000000201', 'owner'),
  ('019f5701-0000-7000-8000-000000000202', 'coach'),
  ('019f5701-0000-7000-8000-000000000203', 'staff'),
  ('019f5701-0000-7000-8000-000000000204', 'owner'),
  ('019f5701-0000-7000-8000-000000000205', 'admin');

insert into catalog.disciplines (id, code, name, status)
values ('019f5701-0000-7000-8000-000000000301', 'test_unpublished', 'Sin publicar', 'draft');

insert into catalog.movements (id, discipline_code, name, normalized_name, content_scope, status)
values
  ('019f5701-0000-7000-8000-0000000000f1', 'test_strength', 'Sentadilla de prueba',
   'sentadilla de prueba', 'global', 'published'),
  ('019f5701-0000-7000-8000-0000000000f2', 'test_strength', 'Remo de prueba',
   'remo de prueba', 'global', 'draft'),
  ('019f5701-0000-7000-8000-0000000000f3', 'test_strength', 'Peso muerto de prueba',
   'peso muerto de prueba', 'global', 'archived');

insert into catalog.equipment (id, code, name, content_scope, status, display_order)
values
  ('019f5701-0000-7000-8000-0000000000b1', 'test_bar', 'Barra de prueba', 'global', 'published', 1),
  ('019f5701-0000-7000-8000-0000000000b2', 'test_box', 'Cajón de prueba', 'global', 'published', 2),
  ('019f5701-0000-7000-8000-0000000000b3', 'test_sled', 'Trineo sin publicar', 'global', 'draft', 3);

-- The SQLSTATE and detail a statement fails with, so a refusal is asserted by its reason.
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

-- One create call, with a fresh identity unless one is given.
create function pg_temp.create_call(
  actor text, organization text, discipline text, name text,
  aliases text, equipment text, variant text
) returns text
language sql as $$
  select format(
    'select * from catalog.create_organization_movement(%L, %L, %L, %L, %s, %s, %s, %L, %L, %L)',
    actor, organization, discipline, name, aliases, equipment, variant,
    gen_random_uuid(), extensions.uuid_generate_v7(), sha256(convert_to(random()::text, 'UTF8')))
$$;

select set_config('app.actor_kind', 'person', true);
set local role allfit_api;

-- Camilo, a coach, creates one with everything the operation allows.
select set_config('app.actor_person_id', '019f5701-0000-7000-8000-000000000002', true);
select (catalog.create_organization_movement(
  '019f5701-0000-7000-8000-000000000002', '019f5701-0000-7000-8000-000000000101',
  'test_strength', '  Sentadilla   búlgara con pausa ',
  array['Bulgarian split squat', 'Zancada búlgara'], array['test_box', 'test_bar'],
  '{"movement_id":"019f5701-0000-7000-8000-0000000000f1","relation":"progression","note":"Más glúteo"}',
  '57010000-0000-4000-8000-000000000001', '019f5701-0000-7000-8000-00000000c001',
  decode(repeat('a1', 32), 'hex'))).result as created \gset

select is(:'created'::jsonb->>'name', 'Sentadilla búlgara con pausa',
  'T-CAT-MOVEMENT-API-01 a coach creates one, its name trimmed and its spaces collapsed');
select is(
  jsonb_build_object(
    'scope', :'created'::jsonb->'scope', 'discipline_code', :'created'::jsonb->'discipline_code',
    'archived', :'created'::jsonb->'archived', 'revision', :'created'::jsonb->'revision',
    'name_locked', :'created'::jsonb->'name_locked', 'muscles', :'created'::jsonb->'muscles'),
  '{"scope":"organization","discipline_code":"test_strength","archived":false,"revision":1,"name_locked":false,"muscles":[]}'::jsonb,
  'T-CAT-MOVEMENT-API-02 it is the organization''s, published, at revision one, and free to rename');
select is(:'created'::jsonb->'aliases', '["Bulgarian split squat", "Zancada búlgara"]'::jsonb,
  'T-CAT-MOVEMENT-API-03 its other names come back in order');
select is(:'created'::jsonb->'equipment', '["test_bar", "test_box"]'::jsonb,
  'T-CAT-MOVEMENT-API-04 and the equipment it uses, in the catalogue''s order');
select is(:'created'::jsonb->'variant_of',
  '{"id":"019f5701-0000-7000-8000-0000000000f1","name":"Sentadilla de prueba","relation":"progression","note":"Más glúteo"}'::jsonb,
  'T-CAT-MOVEMENT-API-05 related to the global movement it is a variant of');

select set_config('app.actor_person_id', '019f5701-0000-7000-8000-000000000005', true);
select is((select result->>'scope' from catalog.create_organization_movement(
  '019f5701-0000-7000-8000-000000000005', '019f5701-0000-7000-8000-000000000101',
  'test_strength', 'Plancha con peso', null, null, null,
  gen_random_uuid(), extensions.uuid_generate_v7(), decode(repeat('a2', 32), 'hex'))),
  'organization', 'T-CAT-MOVEMENT-API-06 an admin creates one, with nothing optional');

select set_config('app.actor_person_id', '019f5701-0000-7000-8000-000000000001', true);
select is((select result->>'name' from catalog.create_organization_movement(
  '019f5701-0000-7000-8000-000000000001', '019f5701-0000-7000-8000-000000000101',
  'test_strength', 'Sentadilla de prueba', null, null, null,
  gen_random_uuid(), extensions.uuid_generate_v7(), decode(repeat('a3', 32), 'hex'))),
  'Sentadilla de prueba', 'T-CAT-MOVEMENT-API-07 an owner creates one named like a global movement');

select set_config('app.actor_person_id', '019f5701-0000-7000-8000-000000000003', true);
select is(pg_temp.failure(pg_temp.create_call(
  '019f5701-0000-7000-8000-000000000003', '019f5701-0000-7000-8000-000000000101',
  'test_strength', 'Lo de staff', 'null', 'null', 'null')),
  '42501 ', 'T-CAT-MOVEMENT-API-08 staff cannot create content');

select set_config('app.actor_person_id', '019f5701-0000-7000-8000-000000000004', true);
select is(pg_temp.failure(pg_temp.create_call(
  '019f5701-0000-7000-8000-000000000004', '019f5701-0000-7000-8000-000000000101',
  'test_strength', 'Ajeno', 'null', 'null', 'null')),
  'P0002 ', 'T-CAT-MOVEMENT-API-09 nobody creates in an organization they do not belong to');
select is((select result->>'name' from catalog.create_organization_movement(
  '019f5701-0000-7000-8000-000000000004', '019f5701-0000-7000-8000-000000000102',
  'test_strength', 'sentadilla BÚLGARA con pausa', null, null, null,
  gen_random_uuid(), extensions.uuid_generate_v7(), decode(repeat('a4', 32), 'hex'))),
  'sentadilla BÚLGARA con pausa',
  'T-CAT-MOVEMENT-API-10 another organization uses the same name without colliding');

select set_config('app.actor_person_id', '019f5701-0000-7000-8000-000000000002', true);
select is(pg_temp.failure(pg_temp.create_call(
  '019f5701-0000-7000-8000-000000000002', '019f5701-0000-7000-8000-000000000101',
  'test_strength', 'SENTADILLA búlgara  con pausa', 'null', 'null', 'null')),
  '23505 ', 'T-CAT-MOVEMENT-API-11 a name the organization already uses is refused, not duplicated');
select is(pg_temp.failure(pg_temp.create_call(
  '019f5701-0000-7000-8000-000000000002', '019f5701-0000-7000-8000-000000000101',
  'test_unpublished', 'Algo', 'null', 'null', 'null')),
  '22023 ["discipline_code"]', 'T-CAT-MOVEMENT-API-12 a discipline nobody published is refused');
select is(pg_temp.failure(pg_temp.create_call(
  '019f5701-0000-7000-8000-000000000002', '019f5701-0000-7000-8000-000000000101',
  'test_invented', 'Algo', 'null', 'null', 'null')),
  '22023 ["discipline_code"]', 'T-CAT-MOVEMENT-API-13 and so is one that does not exist');
select is(pg_temp.failure(pg_temp.create_call(
  '019f5701-0000-7000-8000-000000000002', '019f5701-0000-7000-8000-000000000101',
  'test_strength', '   ', 'null', 'null', 'null')),
  '22023 ["name"]', 'T-CAT-MOVEMENT-API-14 a blank name is refused');
select is(pg_temp.failure(pg_temp.create_call(
  '019f5701-0000-7000-8000-000000000002', '019f5701-0000-7000-8000-000000000101',
  'test_strength', repeat('a', 121), 'null', 'null', 'null')),
  '22023 ["name"]', 'T-CAT-MOVEMENT-API-15 and so is one past 120 characters');
select is(pg_temp.failure(pg_temp.create_call(
  '019f5701-0000-7000-8000-000000000002', '019f5701-0000-7000-8000-000000000101',
  'test_strength', 'Con alias',
  quote_literal((select array_agg('alias ' || n) from generate_series(1, 11) as n)::text) || '::text[]',
  'null', 'null')),
  '22023 ["aliases"]', 'T-CAT-MOVEMENT-API-16 more than ten other names is refused');
select is(pg_temp.failure(pg_temp.create_call(
  '019f5701-0000-7000-8000-000000000002', '019f5701-0000-7000-8000-000000000101',
  'test_strength', 'Con alias', 'array[''Uno'', '' uno '']', 'null', 'null')),
  '22023 ["aliases"]', 'T-CAT-MOVEMENT-API-17 two other names that are the same name are refused');
select is(pg_temp.failure(pg_temp.create_call(
  '019f5701-0000-7000-8000-000000000002', '019f5701-0000-7000-8000-000000000101',
  'test_strength', 'Con alias', 'array[''con ALIAS'']', 'null', 'null')),
  '22023 ["aliases"]', 'T-CAT-MOVEMENT-API-18 and so is another name that is its own name');
select is(pg_temp.failure(pg_temp.create_call(
  '019f5701-0000-7000-8000-000000000002', '019f5701-0000-7000-8000-000000000101',
  'test_strength', 'Con alias', 'array['' '']', 'null', 'null')),
  '22023 ["aliases"]', 'T-CAT-MOVEMENT-API-19 and a blank one');
select is(pg_temp.failure(pg_temp.create_call(
  '019f5701-0000-7000-8000-000000000002', '019f5701-0000-7000-8000-000000000101',
  'test_strength', 'Con equipo', 'null', 'array[''test_sled'']', 'null')),
  '22023 ["equipment"]', 'T-CAT-MOVEMENT-API-20 equipment nobody published is refused');
select is(pg_temp.failure(pg_temp.create_call(
  '019f5701-0000-7000-8000-000000000002', '019f5701-0000-7000-8000-000000000101',
  'test_strength', 'Con equipo', 'null', 'array[''test_bar'', ''test_bar'']', 'null')),
  '22023 ["equipment"]', 'T-CAT-MOVEMENT-API-21 and so is the same equipment twice');
select is(pg_temp.failure(pg_temp.create_call(
  '019f5701-0000-7000-8000-000000000002', '019f5701-0000-7000-8000-000000000101',
  'test_strength', 'Variante', 'null', 'null',
  quote_literal('{"movement_id":"019f5701-0000-7000-8000-0000000000f2","relation":"variant"}'))),
  '22023 ["variant"]', 'T-CAT-MOVEMENT-API-22 a variant of a global movement nobody published is refused');
select is(pg_temp.failure(pg_temp.create_call(
  '019f5701-0000-7000-8000-000000000002', '019f5701-0000-7000-8000-000000000101',
  'test_strength', 'Variante', 'null', 'null',
  quote_literal('{"movement_id":"019f5701-0000-7000-8000-0000000000f3","relation":"variant"}'))),
  '22023 ["variant"]', 'T-CAT-MOVEMENT-API-23 and of an archived one');
select is(pg_temp.failure(pg_temp.create_call(
  '019f5701-0000-7000-8000-000000000002', '019f5701-0000-7000-8000-000000000101',
  'test_strength', 'Variante', 'null', 'null',
  quote_literal(jsonb_build_object('movement_id', :'created'::jsonb->>'id', 'relation', 'variant')))),
  '22023 ["variant"]', 'T-CAT-MOVEMENT-API-24 and of one of the organization''s own');
select is(pg_temp.failure(pg_temp.create_call(
  '019f5701-0000-7000-8000-000000000002', '019f5701-0000-7000-8000-000000000101',
  'test_strength', 'Variante', 'null', 'null',
  quote_literal('{"movement_id":"019f5701-0000-7000-8000-0000000000f1","relation":"cousin"}'))),
  '22023 ["variant"]', 'T-CAT-MOVEMENT-API-25 a relation that is not variant, regression or progression');
select is(pg_temp.failure(pg_temp.create_call(
  '019f5701-0000-7000-8000-000000000002', '019f5701-0000-7000-8000-000000000101',
  'test_strength', 'Variante', 'null', 'null',
  quote_literal('{"movement_id":"019f5701-0000-7000-8000-0000000000f1","relation":"variant","note":" "}'))),
  '22023 ["variant"]', 'T-CAT-MOVEMENT-API-26 and a blank note');
select is(pg_temp.failure(pg_temp.create_call(
  '019f5701-0000-7000-8000-000000000002', '019f5701-0000-7000-8000-000000000101',
  'test_strength', '', 'array['''']', 'array[''test_sled'']', 'null')),
  '22023 ["name", "aliases", "equipment"]', 'T-CAT-MOVEMENT-API-27 every problem is named at once');

-- Replay.
select is(
  (select row(result->>'id', replayed)::text from catalog.create_organization_movement(
    '019f5701-0000-7000-8000-000000000002', '019f5701-0000-7000-8000-000000000101',
    'test_strength', '  Sentadilla   búlgara con pausa ',
    array['Bulgarian split squat', 'Zancada búlgara'], array['test_box', 'test_bar'],
    '{"movement_id":"019f5701-0000-7000-8000-0000000000f1","relation":"progression","note":"Más glúteo"}',
    '57010000-0000-4000-8000-000000000001', '019f5701-0000-7000-8000-00000000c001',
    decode(repeat('a1', 32), 'hex'))),
  row(:'created'::jsonb->>'id', true)::text,
  'T-CAT-MOVEMENT-IDEM-01 the same request under the same key answers the same movement');
select is(pg_temp.failure(format(
  'select * from catalog.create_organization_movement(%L, %L, %L, %L, null, null, null, %L, %L, %L)',
  '019f5701-0000-7000-8000-000000000002', '019f5701-0000-7000-8000-000000000101',
  'test_strength', 'Otra cosa', '57010000-0000-4000-8000-000000000001',
  '019f5701-0000-7000-8000-00000000c001', decode(repeat('ff', 32), 'hex'))),
  '23505 ', 'T-CAT-MOVEMENT-IDEM-02 the same key with another request is a conflict');

reset role;

select is(
  (select row(movement.content_scope, movement.owner_organization_id, movement.owner_person_id,
              movement.created_by_membership_id, movement.status, movement.normalized_name)::text
   from catalog.movements as movement where movement.id = (:'created'::jsonb->>'id')::uuid),
  row('organization', '019f5701-0000-7000-8000-000000000101', null,
      '019f5701-0000-7000-8000-000000000202', 'published', 'sentadilla búlgara con pausa')::text,
  'T-CAT-MOVEMENT-INT-01 the row is the organization''s, by its author, published and normalized');
select is(
  (select array_agg(alias.name || '/' || alias.locale order by alias.name)
   from catalog.movement_aliases as alias where alias.movement_id = (:'created'::jsonb->>'id')::uuid),
  array['Bulgarian split squat/es', 'Zancada búlgara/es'],
  'T-CAT-MOVEMENT-INT-02 its other names are stored in Spanish');
select is(
  (select row(link.base_movement_id, link.relation, link.note)::text
   from catalog.movement_variants as link
   where link.variant_movement_id = (:'created'::jsonb->>'id')::uuid),
  row('019f5701-0000-7000-8000-0000000000f1', 'progression', 'Más glúteo')::text,
  'T-CAT-MOVEMENT-INT-03 the global movement is the base and hers is the variant');
select is(
  (select array_agg(row(event.event_type, event.payload)::text)
   from system.outbox_events as event where event.aggregate_id = (:'created'::jsonb->>'id')::uuid),
  array[row('catalog.private_movement_created.v1',
    jsonb_build_object('movement_id', :'created'::jsonb->>'id',
                       'organization_id', '019f5701-0000-7000-8000-000000000101'))::text],
  'T-CAT-MOVEMENT-INT-04 one event, carrying identifiers and nothing else');
select is(
  (select count(*)::integer from catalog.movement_revisions as revision
   where revision.movement_id = (:'created'::jsonb->>'id')::uuid),
  0, 'T-CAT-MOVEMENT-INT-05 creating is not a revision');

select ok(
  not has_table_privilege('allfit_api', 'catalog.movements', 'insert')
  and not has_table_privilege('allfit_api', 'catalog.movements', 'update')
  and not has_table_privilege('allfit_api', 'catalog.movement_aliases', 'insert')
  and not has_table_privilege('allfit_api', 'catalog.movement_variants', 'insert'),
  'T-CAT-MOVEMENT-RLS-01 the runtime writes movements only through the command');
select ok(
  not has_table_privilege('allfit_api', 'catalog.disciplines', 'insert')
  and not has_table_privilege('allfit_api', 'catalog.activity_types', 'insert'),
  'T-CAT-MOVEMENT-RLS-02 and never a discipline or an activity type (T-CAT-1)');

select * from finish();
rollback;
