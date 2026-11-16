-- Who sees a gym's own movement outside the gym (HU-STUDIO-066 criterion 2, OP-PLN-021).
--
-- What has to hold:
-- * A person sees a gym's movement only inside what she was planned or what she trained:
--   a step of a version planned for her, or an exercise, set or mobility result of a
--   session of hers. Nothing else of that gym's library opens to her.
-- * Its other names follow the movement; the Space search and detail stay global.
-- * A movement's revisions are read only by members of its organization.
-- Written before the policies, and watched failing: she saw none of them.
begin;

select plan(22);

insert into identity.people (id, given_name, family_name)
values
  ('019f5705-0000-7000-8000-000000000001', 'Olivia', 'Owner'),
  ('019f5705-0000-7000-8000-000000000002', 'Camilo', 'Coach'),
  ('019f5705-0000-7000-8000-000000000003', 'Sara', 'Staff'),
  ('019f5705-0000-7000-8000-000000000004', 'Otto', 'Other'),
  ('019f5705-0000-7000-8000-000000000011', 'Paula', 'Planned'),
  ('019f5705-0000-7000-8000-000000000012', 'Quique', 'Trained'),
  ('019f5705-0000-7000-8000-000000000013', 'Zoe', 'Nothing');

insert into organizations.organizations (id, type_code, display_name, responsible_party)
values
  ('019f5705-0000-7000-8000-000000000101', 'studio', 'Seen One',
   '{"party_kind":"legal_entity","party_name":"Seen One SAS","purpose":"studio_operations"}'),
  ('019f5705-0000-7000-8000-000000000102', 'studio', 'Seen Other',
   '{"party_kind":"legal_entity","party_name":"Seen Other SAS","purpose":"studio_operations"}');

insert into organizations.organization_memberships (id, organization_id, person_id)
values
  ('019f5705-0000-7000-8000-000000000201', '019f5705-0000-7000-8000-000000000101', '019f5705-0000-7000-8000-000000000001'),
  ('019f5705-0000-7000-8000-000000000202', '019f5705-0000-7000-8000-000000000101', '019f5705-0000-7000-8000-000000000002'),
  ('019f5705-0000-7000-8000-000000000203', '019f5705-0000-7000-8000-000000000101', '019f5705-0000-7000-8000-000000000003'),
  ('019f5705-0000-7000-8000-000000000204', '019f5705-0000-7000-8000-000000000102', '019f5705-0000-7000-8000-000000000004');

insert into organizations.membership_roles (membership_id, role_code)
values
  ('019f5705-0000-7000-8000-000000000201', 'owner'),
  ('019f5705-0000-7000-8000-000000000202', 'coach'),
  ('019f5705-0000-7000-8000-000000000203', 'staff'),
  ('019f5705-0000-7000-8000-000000000204', 'owner');

insert into catalog.movements (id, discipline_code, name, normalized_name, content_scope, status)
values ('019f5705-0000-7000-8000-0000000000f1', 'test_strength', 'Global visible de prueba',
        'global visible de prueba', 'global', 'published');
insert into catalog.equipment (id, code, name, content_scope, status, display_order)
values ('019f5705-0000-7000-8000-0000000000b1', 'test_kettle', 'Pesa rusa de prueba', 'global', 'published', 1);

create function pg_temp.routine(movement text) returns jsonb
language sql as $$
  select jsonb_build_object('title', 'Planificada', 'activity_type_id', '019c0000-0000-7000-8000-000000000011',
    'steps', jsonb_build_array(jsonb_build_object('position', 1, 'movement_id', movement,
      'target', jsonb_build_object('family', 'strength', 'target_sets', 3))))
$$;

create function pg_temp.create_movement(name text, aliases text[]) returns uuid
language sql as $$
  select (result->>'id')::uuid from catalog.create_organization_movement(
    '019f5705-0000-7000-8000-000000000002', '019f5705-0000-7000-8000-000000000101',
    'test_strength', name, aliases, null, null,
    gen_random_uuid(), extensions.uuid_generate_v7(), sha256(convert_to(name, 'UTF8')))
$$;

select set_config('app.actor_kind', 'person', true);
select set_config('app.actor_person_id', '019f5705-0000-7000-8000-000000000002', true);
set local role allfit_api;

select pg_temp.create_movement('Planificado de la casa', array['Plan casero']) as planned \gset
select pg_temp.create_movement('Ejercicio de la casa', array['Ejercicio casero']) as exercised \gset
select pg_temp.create_movement('Serie de la casa', null) as set_only \gset
select pg_temp.create_movement('Movilidad de la casa', null) as mobility \gset
select pg_temp.create_movement('Nunca usado de la casa', null) as unused \gset
select catalog.update_organization_movement(
  '019f5705-0000-7000-8000-000000000002', '019f5705-0000-7000-8000-000000000101', :'unused'::uuid, 1,
  '{"aliases":["Sin uso"]}', gen_random_uuid(), extensions.uuid_generate_v7(), decode(repeat('a9', 32), 'hex'));

select (planning.create_session_template(
  '019f5705-0000-7000-8000-000000000002', '019f5705-0000-7000-8000-000000000101',
  'test_strength', 'Planificada', gen_random_uuid(), extensions.uuid_generate_v7(),
  decode(repeat('b1', 32), 'hex'))).result as template \gset
select (planning.replace_session_template_draft(
  '019f5705-0000-7000-8000-000000000002', '019f5705-0000-7000-8000-000000000101',
  (:'template'::jsonb->>'id')::uuid, :'template'::jsonb->'draft'->>'etag',
  pg_temp.routine(:'planned'), gen_random_uuid(), extensions.uuid_generate_v7(),
  decode(repeat('b2', 32), 'hex'))).result->>'etag' as etag \gset
select (planning.publish_session_template_version(
  '019f5705-0000-7000-8000-000000000002', '019f5705-0000-7000-8000-000000000101',
  (:'template'::jsonb->>'id')::uuid, :'etag', gen_random_uuid(),
  extensions.uuid_generate_v7(), decode(repeat('b3', 32), 'hex'))).result->>'id' as version \gset

reset role;

-- Paula has a session planned on that version; Quique trained the others.
insert into planning.programs (id, content_scope, status)
values ('019f5705-0000-7000-8000-000000000301', 'global', 'published');
select set_config('app.planning_publication', 'true', true);
insert into planning.program_versions (id, program_id, version_number, title, content_hash)
values ('019f5705-0000-7000-8000-000000000302', '019f5705-0000-7000-8000-000000000301', 1,
  'Plan', decode(repeat('c1', 32), 'hex'));
select set_config('app.planning_publication', '', true);
insert into planning.program_assignments (
  id, person_id, program_version_id, lifecycle, starts_on, timezone, display_order
) values ('019f5705-0000-7000-8000-000000000303', '019f5705-0000-7000-8000-000000000011',
  '019f5705-0000-7000-8000-000000000302', 'personal', current_date, 'America/Bogota', 1);
insert into planning.planned_sessions (
  id, assignment_id, person_id, template_version_id, program_day, week_starts_on, scheduled_at, timezone
) values (
  '019f5705-0000-7000-8000-000000000304', '019f5705-0000-7000-8000-000000000303',
  '019f5705-0000-7000-8000-000000000011', :'version'::uuid, 1,
  date_trunc('week', current_date::timestamp)::date, clock_timestamp(), 'America/Bogota'
);

insert into execution.executed_sessions (
  id, person_id, activity_type_id, result_contract_id, contract_version, is_autonomous,
  started_at, ended_at, timezone, execution_status, validation_status, requested_level,
  achieved_level, capture_source
) values
  ('019f5705-0000-7000-8000-000000000401', '019f5705-0000-7000-8000-000000000012',
   '019c0000-0000-7000-8000-000000000011', '019c0000-0000-7000-8000-000000000031', 1, true,
   clock_timestamp() - interval '2 hours', clock_timestamp() - interval '1 hour', 'America/Bogota',
   'completed', 'valid', 'detailed', 'detailed', 'manual'),
  ('019f5705-0000-7000-8000-000000000402', '019f5705-0000-7000-8000-000000000012',
   '019c0000-0000-7000-8000-000000000014', '019c0000-0000-7000-8000-000000000034', 1, true,
   clock_timestamp() - interval '4 hours', clock_timestamp() - interval '3 hours', 'America/Bogota',
   'completed', 'valid', 'detailed', 'detailed', 'manual');
insert into execution.session_exercises (executed_session_id, position, movement_id)
values ('019f5705-0000-7000-8000-000000000401', 1, :'exercised'::uuid);
insert into execution.strength_sets (executed_session_id, set_order, movement_id, kind, achieved_reps)
values ('019f5705-0000-7000-8000-000000000401', 1, :'set_only'::uuid, 'normal', 8);
insert into execution.mobility_results (executed_session_id, sequence_position, movement_id, hold_duration_seconds)
values ('019f5705-0000-7000-8000-000000000402', 1, :'mobility'::uuid, 30);

create function pg_temp.seen(person text) returns text[]
language plpgsql as $$
declare
  names text[];
begin
  perform set_config('app.actor_kind', 'person', true);
  perform set_config('app.actor_person_id', person, true);
  perform set_config('app.actor_org_id', '', true);
  execute 'set local role allfit_owner';
  select coalesce(array_agg(movement.name order by movement.name), array[]::text[]) into names
  from catalog.movements as movement where movement.content_scope = 'organization'
    and movement.owner_organization_id = '019f5705-0000-7000-8000-000000000101';
  execute 'reset role';
  return names;
end
$$;

create function pg_temp.aliases_seen(person text) returns text[]
language plpgsql as $$
declare
  names text[];
begin
  perform set_config('app.actor_kind', 'person', true);
  perform set_config('app.actor_person_id', person, true);
  perform set_config('app.actor_org_id', '', true);
  execute 'set local role allfit_owner';
  select coalesce(array_agg(alias.name order by alias.name), array[]::text[]) into names
  from catalog.movement_aliases as alias
  where alias.name in ('Plan casero', 'Ejercicio casero', 'Sin uso');
  execute 'reset role';
  return names;
end
$$;

create function pg_temp.revisions_seen(person text, organization text) returns integer
language plpgsql as $$
declare
  seen integer;
begin
  perform set_config('app.actor_kind', 'person', true);
  perform set_config('app.actor_person_id', person, true);
  perform set_config('app.actor_org_id', coalesce(organization, ''), true);
  execute 'set local role allfit_owner';
  select count(*)::integer into seen from catalog.movement_revisions;
  execute 'reset role';
  return seen;
end
$$;

select is(pg_temp.seen('019f5705-0000-7000-8000-000000000011'), array['Planificado de la casa'],
  'T-CAT-MOVEMENT-RLS-03 she sees the gym''s movement in a step of a version planned for her, and nothing else of the gym''s');
select is(pg_temp.seen('019f5705-0000-7000-8000-000000000012'),
  array['Ejercicio de la casa', 'Movilidad de la casa', 'Serie de la casa'],
  'T-CAT-MOVEMENT-RLS-04 he sees what he trained, by exercise, by set and by mobility result, and not her plan');
select is(pg_temp.seen('019f5705-0000-7000-8000-000000000013'), array[]::text[],
  'T-CAT-MOVEMENT-RLS-05 somebody with neither sees none of them');
select is(pg_temp.seen('019f5705-0000-7000-8000-000000000004'), array[]::text[],
  'T-CAT-MOVEMENT-RLS-06 nor does a member of another organization');
select is(
  (select pg_temp.seen('019f5705-0000-7000-8000-000000000002') @> array['Nunca usado de la casa']),
  false, 'T-CAT-MOVEMENT-RLS-07 a member without the organization set sees nothing of it either');

select is(pg_temp.aliases_seen('019f5705-0000-7000-8000-000000000011'), array['Plan casero'],
  'T-CAT-MOVEMENT-RLS-08 its other names follow it to her, and no others');
select is(pg_temp.aliases_seen('019f5705-0000-7000-8000-000000000013'), array[]::text[],
  'T-CAT-MOVEMENT-RLS-09 and to nobody who cannot see it');

select set_config('app.actor_kind', 'person', true);
select set_config('app.actor_person_id', '019f5705-0000-7000-8000-000000000011', true);
set local role allfit_api;
select is(catalog.read_movement('019f5705-0000-7000-8000-000000000011', :'planned'::uuid), null,
  'T-CAT-MOVEMENT-RLS-10 the Space detail stays the global library''s');
select is(
  (select count(*)::integer from jsonb_array_elements((catalog.read_movements(
    '019f5705-0000-7000-8000-000000000011', 'test_strength', 'de la casa', 100))->'data')),
  0, 'T-CAT-MOVEMENT-RLS-11 and so does the Space search');
reset role;

select is(pg_temp.revisions_seen('019f5705-0000-7000-8000-000000000002', '019f5705-0000-7000-8000-000000000101'),
  1, 'T-CAT-MOVEMENT-RLS-12 a member of the organization reads its movements'' revisions');
select is(pg_temp.revisions_seen('019f5705-0000-7000-8000-000000000004', '019f5705-0000-7000-8000-000000000102'),
  0, 'T-CAT-MOVEMENT-RLS-13 a member of another organization reads none');
select is(pg_temp.revisions_seen('019f5705-0000-7000-8000-000000000004', '019f5705-0000-7000-8000-000000000101'),
  0, 'T-CAT-MOVEMENT-RLS-14 even claiming the organization he does not belong to');
select is(pg_temp.revisions_seen('019f5705-0000-7000-8000-000000000011', null),
  0, 'T-CAT-MOVEMENT-RLS-15 and a person who trains with it reads none');
select ok(
  not has_table_privilege('allfit_api', 'catalog.movement_revisions', 'select')
  and not has_table_privilege('allfit_api', 'catalog.movement_revisions', 'insert'),
  'T-CAT-MOVEMENT-RLS-16 the runtime has no direct access to revisions');

-- Writing the children directly, as the commands do under the hood.
create function pg_temp.as_member(person text, organization text, statement text) returns text
language plpgsql as $$
begin
  perform set_config('app.actor_kind', 'person', true);
  perform set_config('app.actor_person_id', person, true);
  perform set_config('app.actor_org_id', organization, true);
  perform set_config('app.actor_membership_id', (
    select membership.id::text from organizations.organization_memberships as membership
    where membership.person_id = person::uuid and membership.organization_id = organization::uuid), true);
  execute 'set local role allfit_owner';
  execute statement;
  execute 'reset role';
  return 'no error';
exception when others then
  execute 'reset role';
  return sqlstate;
end
$$;

select is(pg_temp.as_member('019f5705-0000-7000-8000-000000000002', '019f5705-0000-7000-8000-000000000101',
  format('insert into catalog.movement_aliases (movement_id, name) values (%L, %L)', :'unused', 'Directo')),
  'no error', 'T-CAT-MOVEMENT-RLS-17 a coach of the organization writes another name of its movement');
select is(pg_temp.as_member('019f5705-0000-7000-8000-000000000003', '019f5705-0000-7000-8000-000000000101',
  format('insert into catalog.movement_aliases (movement_id, name) values (%L, %L)', :'unused', 'De staff')),
  '42501', 'T-CAT-MOVEMENT-RLS-18 staff of the same organization does not');
select is(pg_temp.as_member('019f5705-0000-7000-8000-000000000004', '019f5705-0000-7000-8000-000000000102',
  format('insert into catalog.movement_aliases (movement_id, name) values (%L, %L)', :'unused', 'Ajeno')),
  '42501', 'T-CAT-MOVEMENT-RLS-19 nor does another organization');
select is(pg_temp.as_member('019f5705-0000-7000-8000-000000000004', '019f5705-0000-7000-8000-000000000102',
  format('insert into catalog.movement_equipment (movement_id, equipment_id) values (%L, %L)',
    :'unused', '019f5705-0000-7000-8000-0000000000b1')),
  '42501', 'T-CAT-MOVEMENT-RLS-20 nor its equipment');
select is(pg_temp.as_member('019f5705-0000-7000-8000-000000000002', '019f5705-0000-7000-8000-000000000101',
  format('insert into catalog.movement_equipment (movement_id, equipment_id) values (%L, %L)',
    :'unused', '019f5705-0000-7000-8000-0000000000b1')),
  'no error', 'T-CAT-MOVEMENT-RLS-21 which the organization''s coach does write');
select is(pg_temp.as_member('019f5705-0000-7000-8000-000000000002', '019f5705-0000-7000-8000-000000000101',
  format('insert into catalog.movement_variants (base_movement_id, variant_movement_id) values (%L, %L)',
    :'planned', :'unused')),
  '42501', 'T-CAT-MOVEMENT-RLS-22 a variant is of a global movement, never of the gym''s own');
select is(pg_temp.as_member('019f5705-0000-7000-8000-000000000002', '019f5705-0000-7000-8000-000000000101',
  format('insert into catalog.movement_variants (base_movement_id, variant_movement_id) values (%L, %L)',
    '019f5705-0000-7000-8000-0000000000f1', :'unused')),
  'no error', 'T-CAT-MOVEMENT-RLS-23 and of a global one it is written');
select is(pg_temp.as_member('019f5705-0000-7000-8000-000000000004', '019f5705-0000-7000-8000-000000000102',
  format('insert into catalog.movement_revisions (id, movement_id, organization_id, revision_from, revision_to, actor_membership_id, before, after) values (%L, %L, %L, 2, 3, %L, %L, %L)',
    extensions.uuid_generate_v7(), :'unused', '019f5705-0000-7000-8000-000000000101',
    '019f5705-0000-7000-8000-000000000204', '{}', '{}')),
  '42501', 'T-CAT-MOVEMENT-RLS-24 nobody writes a revision for another organization');

select * from finish();
rollback;
