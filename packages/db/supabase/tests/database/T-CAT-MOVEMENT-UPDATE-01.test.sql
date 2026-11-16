-- A gym edits a movement of its own (HU-STUDIO-065, OP-CAT-002, STUDIO-58).
--
-- What has to hold:
-- * While no published version uses it, everything can change.
-- * Once a published version uses it — and every session that trains it came from one —
--   its meaning is frozen: the discipline is fixed and the name may change only in case
--   and spacing. Other names, the variant and the equipment stay editable.
-- * The rule lives in a trigger, so it holds whoever updates the row.
-- * A global movement or another organization's is never edited from here; an archived
--   one is not edited at all; a stale revision is refused.
-- * Every change leaves an append-only revision.
begin;

select plan(30);

insert into identity.people (id, given_name, family_name)
values
  ('019f5702-0000-7000-8000-000000000001', 'Olivia', 'Owner'),
  ('019f5702-0000-7000-8000-000000000002', 'Camilo', 'Coach'),
  ('019f5702-0000-7000-8000-000000000003', 'Sara', 'Staff'),
  ('019f5702-0000-7000-8000-000000000004', 'Otto', 'Other');

insert into organizations.organizations (id, type_code, display_name, responsible_party)
values
  ('019f5702-0000-7000-8000-000000000101', 'studio', 'Edits One',
   '{"party_kind":"legal_entity","party_name":"Edits One SAS","purpose":"studio_operations"}'),
  ('019f5702-0000-7000-8000-000000000102', 'studio', 'Edits Other',
   '{"party_kind":"legal_entity","party_name":"Edits Other SAS","purpose":"studio_operations"}');

insert into organizations.organization_memberships (id, organization_id, person_id)
values
  ('019f5702-0000-7000-8000-000000000201', '019f5702-0000-7000-8000-000000000101', '019f5702-0000-7000-8000-000000000001'),
  ('019f5702-0000-7000-8000-000000000202', '019f5702-0000-7000-8000-000000000101', '019f5702-0000-7000-8000-000000000002'),
  ('019f5702-0000-7000-8000-000000000203', '019f5702-0000-7000-8000-000000000101', '019f5702-0000-7000-8000-000000000003'),
  ('019f5702-0000-7000-8000-000000000204', '019f5702-0000-7000-8000-000000000102', '019f5702-0000-7000-8000-000000000004');

insert into organizations.membership_roles (membership_id, role_code)
values
  ('019f5702-0000-7000-8000-000000000201', 'owner'),
  ('019f5702-0000-7000-8000-000000000202', 'coach'),
  ('019f5702-0000-7000-8000-000000000203', 'staff'),
  ('019f5702-0000-7000-8000-000000000204', 'owner');

insert into catalog.movements (id, discipline_code, name, normalized_name, content_scope, status)
values
  ('019f5702-0000-7000-8000-0000000000f1', 'test_strength', 'Remo global de prueba',
   'remo global de prueba', 'global', 'published'),
  ('019f5702-0000-7000-8000-0000000000f2', 'test_strength', 'Prensa global de prueba',
   'prensa global de prueba', 'global', 'published');

insert into catalog.equipment (id, code, name, content_scope, status, display_order)
values
  ('019f5702-0000-7000-8000-0000000000b1', 'test_rack', 'Rack de prueba', 'global', 'published', 1),
  ('019f5702-0000-7000-8000-0000000000b2', 'test_band', 'Banda de prueba', 'global', 'published', 2);

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

-- The SQLSTATE and message, for refusals that name a state rather than a field.
create function pg_temp.refusal(statement text) returns text
language plpgsql as $$
begin
  execute statement;
  return 'no error';
exception when others then
  return sqlstate || ' ' || sqlerrm;
end
$$;

create function pg_temp.update_call(actor text, movement text, revision integer, changes text)
returns text
language sql as $$
  select format(
    'select * from catalog.update_organization_movement(%L, %L, %L, %s, %L, %L, %L, %L)',
    actor, '019f5702-0000-7000-8000-000000000101', movement, revision, changes,
    gen_random_uuid(), extensions.uuid_generate_v7(), sha256(convert_to(random()::text, 'UTF8')))
$$;

create function pg_temp.routine(movement text) returns jsonb
language sql as $$
  select jsonb_build_object('title', 'Con propio', 'activity_type_id', '019c0000-0000-7000-8000-000000000011',
    'steps', jsonb_build_array(jsonb_build_object('position', 1, 'movement_id', movement,
      'target', jsonb_build_object('family', 'strength', 'target_sets', 3))))
$$;

select set_config('app.actor_kind', 'person', true);
select set_config('app.actor_person_id', '019f5702-0000-7000-8000-000000000002', true);
set local role allfit_api;

-- Camilo creates three: one nobody uses, one he publishes in a routine, one only drafted.
select (catalog.create_organization_movement(
  '019f5702-0000-7000-8000-000000000002', '019f5702-0000-7000-8000-000000000101',
  'test_strength', 'Remo propio', array['Remo uno'], array['test_rack'],
  '{"movement_id":"019f5702-0000-7000-8000-0000000000f1","relation":"variant"}',
  gen_random_uuid(), extensions.uuid_generate_v7(), decode(repeat('b1', 32), 'hex'))).result->>'id' as free \gset
select (catalog.create_organization_movement(
  '019f5702-0000-7000-8000-000000000002', '019f5702-0000-7000-8000-000000000101',
  'test_strength', 'Sentadilla propia', null, null, null,
  gen_random_uuid(), extensions.uuid_generate_v7(), decode(repeat('b2', 32), 'hex'))).result->>'id' as used \gset
select (catalog.create_organization_movement(
  '019f5702-0000-7000-8000-000000000002', '019f5702-0000-7000-8000-000000000101',
  'test_strength', 'Zancada propia', null, null, null,
  gen_random_uuid(), extensions.uuid_generate_v7(), decode(repeat('b3', 32), 'hex'))).result->>'id' as drafted \gset

select (planning.create_session_template(
  '019f5702-0000-7000-8000-000000000002', '019f5702-0000-7000-8000-000000000101',
  'test_strength', 'Publicada', gen_random_uuid(), extensions.uuid_generate_v7(),
  decode(repeat('c1', 32), 'hex'))).result as published_template \gset
select (planning.replace_session_template_draft(
  '019f5702-0000-7000-8000-000000000002', '019f5702-0000-7000-8000-000000000101',
  (:'published_template'::jsonb->>'id')::uuid, :'published_template'::jsonb->'draft'->>'etag',
  pg_temp.routine(:'used'), gen_random_uuid(), extensions.uuid_generate_v7(),
  decode(repeat('c2', 32), 'hex'))).result->>'etag' as published_etag \gset
select (planning.publish_session_template_version(
  '019f5702-0000-7000-8000-000000000002', '019f5702-0000-7000-8000-000000000101',
  (:'published_template'::jsonb->>'id')::uuid, :'published_etag', gen_random_uuid(),
  extensions.uuid_generate_v7(), decode(repeat('c3', 32), 'hex'))).result->>'id' as version \gset

select (planning.create_session_template(
  '019f5702-0000-7000-8000-000000000002', '019f5702-0000-7000-8000-000000000101',
  'test_strength', 'Borrador', gen_random_uuid(), extensions.uuid_generate_v7(),
  decode(repeat('c4', 32), 'hex'))).result as drafted_template \gset
select planning.replace_session_template_draft(
  '019f5702-0000-7000-8000-000000000002', '019f5702-0000-7000-8000-000000000101',
  (:'drafted_template'::jsonb->>'id')::uuid, :'drafted_template'::jsonb->'draft'->>'etag',
  pg_temp.routine(:'drafted'), gen_random_uuid(), extensions.uuid_generate_v7(),
  decode(repeat('c5', 32), 'hex'));

-- Unused: everything changes, and the variant can be removed.
select (catalog.update_organization_movement(
  '019f5702-0000-7000-8000-000000000002', '019f5702-0000-7000-8000-000000000101', :'free'::uuid, 1,
  '{"name":"Remo con pausa","discipline_code":"test_mobility","aliases":["Remo pausado"],"equipment":["test_band"],"variant":null}',
  '57020000-0000-4000-8000-000000000001', '019f5702-0000-7000-8000-00000000c001',
  decode(repeat('d1', 32), 'hex'))).result as edited \gset
select is(
  jsonb_build_object('name', :'edited'::jsonb->'name', 'discipline_code', :'edited'::jsonb->'discipline_code',
    'aliases', :'edited'::jsonb->'aliases', 'equipment', :'edited'::jsonb->'equipment',
    'variant_of', :'edited'::jsonb->'variant_of', 'revision', :'edited'::jsonb->'revision',
    'name_locked', :'edited'::jsonb->'name_locked'),
  '{"name":"Remo con pausa","discipline_code":"test_mobility","aliases":["Remo pausado"],"equipment":["test_band"],"variant_of":null,"revision":2,"name_locked":false}'::jsonb,
  'T-CAT-MOVEMENT-UPDATE-API-01 an unused movement changes name, discipline, names, equipment and variant');
select is(
  (select row(result->>'id', replayed)::text from catalog.update_organization_movement(
    '019f5702-0000-7000-8000-000000000002', '019f5702-0000-7000-8000-000000000101', :'free'::uuid, 1,
    '{"name":"Remo con pausa","discipline_code":"test_mobility","aliases":["Remo pausado"],"equipment":["test_band"],"variant":null}',
    '57020000-0000-4000-8000-000000000001', '019f5702-0000-7000-8000-00000000c001',
    decode(repeat('d1', 32), 'hex'))),
  row(:'free', true)::text,
  'T-CAT-MOVEMENT-UPDATE-IDEM-01 the same edit under the same key replays instead of applying twice');
select is(
  (select (result->>'revision')::integer from catalog.update_organization_movement(
    '019f5702-0000-7000-8000-000000000002', '019f5702-0000-7000-8000-000000000101', :'free'::uuid, 2,
    '{"variant":{"movement_id":"019f5702-0000-7000-8000-0000000000f2","relation":"regression","note":"Más fácil"}}',
    gen_random_uuid(), extensions.uuid_generate_v7(), decode(repeat('d2', 32), 'hex'))),
  3, 'T-CAT-MOVEMENT-UPDATE-API-02 a variant can be set again, at the next revision');
select is(pg_temp.refusal(pg_temp.update_call(
  '019f5702-0000-7000-8000-000000000002', :'free', 2, '{"aliases":["Otro"]}')),
  '40001 stale-movement', 'T-CAT-MOVEMENT-UPDATE-API-03 an edit made against an old revision is refused');

-- Only drafted: a draft is not history, so it still changes.
select is(
  (select result->>'name' from catalog.update_organization_movement(
    '019f5702-0000-7000-8000-000000000002', '019f5702-0000-7000-8000-000000000101', :'drafted'::uuid, 1,
    '{"name":"Zancada con salto"}', gen_random_uuid(), extensions.uuid_generate_v7(),
    decode(repeat('d3', 32), 'hex'))),
  'Zancada con salto', 'T-CAT-MOVEMENT-UPDATE-API-04 a movement that is only in a draft is still renamed');

-- Used in a published version: the meaning is frozen.
select is(
  (select row(result->>'name', result->>'name_locked')::text
   from catalog.update_organization_movement(
    '019f5702-0000-7000-8000-000000000002', '019f5702-0000-7000-8000-000000000101', :'used'::uuid, 1,
    '{"name":"SENTADILLA   propia"}', gen_random_uuid(), extensions.uuid_generate_v7(),
    decode(repeat('d4', 32), 'hex'))),
  row('SENTADILLA propia', 'true')::text,
  'T-CAT-MOVEMENT-UPDATE-API-05 a used movement still takes a fix of case and spacing');
select is(pg_temp.refusal(pg_temp.update_call(
  '019f5702-0000-7000-8000-000000000002', :'used', 2, '{"name":"Sentadilla con salto"}')),
  '55000 movement-in-use', 'T-CAT-MOVEMENT-UPDATE-API-06 but not another name');
select is(pg_temp.refusal(pg_temp.update_call(
  '019f5702-0000-7000-8000-000000000002', :'used', 2, '{"discipline_code":"test_mobility"}')),
  '55000 movement-in-use', 'T-CAT-MOVEMENT-UPDATE-API-07 nor another discipline');
select is(
  (select row(result->'aliases', result->'equipment', result->'variant_of'->>'relation', result->>'revision')::text
   from catalog.update_organization_movement(
    '019f5702-0000-7000-8000-000000000002', '019f5702-0000-7000-8000-000000000101', :'used'::uuid, 2,
    '{"aliases":["Sentadilla de la casa"],"equipment":["test_rack"],"variant":{"movement_id":"019f5702-0000-7000-8000-0000000000f2","relation":"variant"}}',
    gen_random_uuid(), extensions.uuid_generate_v7(), decode(repeat('d5', 32), 'hex'))),
  row('["Sentadilla de la casa"]'::jsonb, '["test_rack"]'::jsonb, 'variant', '3')::text,
  'T-CAT-MOVEMENT-UPDATE-API-08 its other names, equipment and variant still change');

-- What is never edited from here.
select is(pg_temp.failure(pg_temp.update_call(
  '019f5702-0000-7000-8000-000000000002', '019f5702-0000-7000-8000-0000000000f1', 1, '{"aliases":["X"]}')),
  'P0002 ', 'T-CAT-MOVEMENT-UPDATE-API-09 a global movement is not edited from Studio');
select set_config('app.actor_person_id', '019f5702-0000-7000-8000-000000000004', true);
select (catalog.create_organization_movement(
  '019f5702-0000-7000-8000-000000000004', '019f5702-0000-7000-8000-000000000102',
  'test_strength', 'De los otros', null, null, null,
  gen_random_uuid(), extensions.uuid_generate_v7(), decode(repeat('b4', 32), 'hex'))).result->>'id' as foreign_movement \gset
select set_config('app.actor_person_id', '019f5702-0000-7000-8000-000000000002', true);
select is(pg_temp.failure(pg_temp.update_call(
  '019f5702-0000-7000-8000-000000000002', :'foreign_movement', 1, '{"aliases":["X"]}')),
  'P0002 ', 'T-CAT-MOVEMENT-UPDATE-API-10 nor another organization''s');
select set_config('app.actor_person_id', '019f5702-0000-7000-8000-000000000003', true);
select is(pg_temp.failure(pg_temp.update_call(
  '019f5702-0000-7000-8000-000000000003', :'free', 3, '{"aliases":["X"]}')),
  '42501 ', 'T-CAT-MOVEMENT-UPDATE-API-11 staff does not edit content');
select set_config('app.actor_person_id', '019f5702-0000-7000-8000-000000000002', true);
select is(pg_temp.failure(pg_temp.update_call(
  '019f5702-0000-7000-8000-000000000002', :'free', 3, '{}')),
  '22023 ["changes"]', 'T-CAT-MOVEMENT-UPDATE-API-12 an edit that changes nothing is refused');
select is(pg_temp.failure(pg_temp.update_call(
  '019f5702-0000-7000-8000-000000000002', :'free', 3, '{"status":"archived"}')),
  '22023 ["changes"]', 'T-CAT-MOVEMENT-UPDATE-API-13 and so is a field it does not know');
select is(pg_temp.failure(pg_temp.update_call(
  '019f5702-0000-7000-8000-000000000002', :'free', 3, '{"name":" ","aliases":"uno"}')),
  '22023 ["name", "aliases"]', 'T-CAT-MOVEMENT-UPDATE-API-14 every invalid field is named');
select is(pg_temp.failure(pg_temp.update_call(
  '019f5702-0000-7000-8000-000000000002', :'free', 3, '{"name":"zancada CON salto"}')),
  '23505 ', 'T-CAT-MOVEMENT-UPDATE-API-15 a name another of its movements has is refused');

-- Archived: nothing changes any more.
select set_config('app.actor_person_id', '019f5702-0000-7000-8000-000000000001', true);
select catalog.archive_organization_movement(
  '019f5702-0000-7000-8000-000000000001', '019f5702-0000-7000-8000-000000000101', :'drafted'::uuid,
  gen_random_uuid(), extensions.uuid_generate_v7(), decode(repeat('d6', 32), 'hex'));
select set_config('app.actor_person_id', '019f5702-0000-7000-8000-000000000002', true);
select is(pg_temp.refusal(pg_temp.update_call(
  '019f5702-0000-7000-8000-000000000002', :'drafted', 3, '{"aliases":["X"]}')),
  '55000 movement-archived', 'T-CAT-MOVEMENT-UPDATE-API-16 an archived movement is not edited');

reset role;

select is(
  (select step.movement_id::text || ' ' || movement.normalized_name
   from planning.planned_steps as step
   join catalog.movements as movement on movement.id = step.movement_id
   where step.template_version_id = :'version'::uuid),
  :'used' || ' sentadilla propia',
  'T-CAT-MOVEMENT-UPDATE-INT-01 the published version still names what it was published with');

-- The rule holds whoever writes the row.
select is(pg_temp.refusal(format(
  'update catalog.movements set name = %L, normalized_name = %L where id = %L',
  'Otra cosa', 'otra cosa', :'used')),
  '55000 movement-in-use', 'T-CAT-MOVEMENT-UPDATE-INT-02 the trigger refuses a rename of a used movement');
select is(pg_temp.refusal(format(
  'update catalog.movements set discipline_code = %L where id = %L', 'test_mobility', :'used')),
  '55000 movement-in-use', 'T-CAT-MOVEMENT-UPDATE-INT-03 and a change of its discipline');
select is(pg_temp.failure(format(
  'update catalog.movements set owner_organization_id = %L where id = %L',
  '019f5702-0000-7000-8000-000000000102', :'free')),
  '23514 ', 'T-CAT-MOVEMENT-UPDATE-INT-04 a movement never changes organization');
select is(pg_temp.failure(format(
  'update catalog.movements set created_by_membership_id = %L where id = %L',
  '019f5702-0000-7000-8000-000000000201', :'free')),
  '23514 ', 'T-CAT-MOVEMENT-UPDATE-INT-05 nor author');
select is(pg_temp.refusal(format(
  'update catalog.movements set status = %L where id = %L', 'published', :'drafted')),
  '55000 movement-archived', 'T-CAT-MOVEMENT-UPDATE-INT-06 and an archived one is never published again');
select is(pg_temp.failure(format(
  'update catalog.movements set name = %L, normalized_name = %L where id = %L',
  'Remo renombrado', 'remo renombrado', :'free')),
  'no error', 'T-CAT-MOVEMENT-UPDATE-INT-07 an unused one is still renamed at the row');

select is(
  (select row(revision.revision_from, revision.revision_to, revision.actor_membership_id,
              revision.before->>'name', revision.after->>'name',
              revision.before->>'discipline_code', revision.after->>'discipline_code')::text
   from catalog.movement_revisions as revision
   where revision.id = '019f5702-0000-7000-8000-00000000c001'),
  row(1, 2, '019f5702-0000-7000-8000-000000000202', 'Remo propio', 'Remo con pausa',
      'test_strength', 'test_mobility')::text,
  'T-CAT-MOVEMENT-UPDATE-INT-08 the revision keeps who, from which revision, and before and after');
select is(
  (select (revision.before->'aliases') || (revision.after->'aliases')
   from catalog.movement_revisions as revision
   where revision.id = '019f5702-0000-7000-8000-00000000c001'),
  '["Remo uno", "Remo pausado"]'::jsonb,
  'T-CAT-MOVEMENT-UPDATE-INT-09 including the other names it had and has');
select is(
  (select count(*)::integer from catalog.movement_revisions as revision
   where revision.movement_id = :'used'::uuid),
  2, 'T-CAT-MOVEMENT-UPDATE-INT-10 refused edits leave no revision');
select is(pg_temp.failure(format(
  'update catalog.movement_revisions set after = %L where movement_id = %L', '{}', :'used')),
  '42501 ', 'T-CAT-MOVEMENT-UPDATE-INT-11 a revision is never rewritten');
select is(pg_temp.failure(format(
  'delete from catalog.movement_revisions where movement_id = %L', :'used')),
  '42501 ', 'T-CAT-MOVEMENT-UPDATE-INT-12 nor deleted');
select is(
  (select array_agg(event.payload order by (event.payload->>'revision')::integer)
   from system.outbox_events as event
   where event.aggregate_id = :'free'::uuid and event.event_type = 'catalog.private_movement_updated.v1'),
  array[
    jsonb_build_object('movement_id', :'free', 'organization_id', '019f5702-0000-7000-8000-000000000101', 'revision', 2),
    jsonb_build_object('movement_id', :'free', 'organization_id', '019f5702-0000-7000-8000-000000000101', 'revision', 3)],
  'T-CAT-MOVEMENT-UPDATE-INT-13 each edit is one event, with identifiers and the revision');

select * from finish();
rollback;
