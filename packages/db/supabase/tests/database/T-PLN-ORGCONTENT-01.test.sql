-- Organization content stays inside the organization (HU-STUDIO-036..043, STUDIO-29..36).
--
-- What has to hold:
-- * A coach composing an organization program cannot use her own Space routine.
--   The shared guards accepted any template the actor owns, whatever the call was for.
-- * Nobody from another organization creates, publishes, derives or retires content here,
--   staff never compose programs, and a coach never retires one.
-- * A derived draft remembers its source through edits; the version it becomes keeps it,
--   and the draft continues from that version afterwards.
-- * A program version reads back whole, `repeats_forever` included, and only from its
--   own organization, through an audited read.
--
-- Written before the migration and watched failing there: the personal routine was
-- accepted, an edit wiped the source, `repeats_forever` was missing and the program
-- version could not be read at all.
begin;

select plan(45);

insert into identity.people (id, given_name, family_name)
values
  ('019d1300-0000-7000-8000-000000000001', 'Olivia', 'Owner'),
  ('019d1300-0000-7000-8000-000000000002', 'Camilo', 'Coach'),
  ('019d1300-0000-7000-8000-000000000003', 'Sara', 'Staff'),
  ('019d1300-0000-7000-8000-000000000004', 'Otto', 'Other'),
  ('019d1300-0000-7000-8000-000000000005', 'Ada', 'Admin');

insert into organizations.organizations (id, type_code, display_name, responsible_party)
values
  ('019d1300-0000-7000-8000-000000000101', 'studio', 'Content One',
   '{"party_kind":"legal_entity","party_name":"Content One SAS","purpose":"studio_operations"}'),
  ('019d1300-0000-7000-8000-000000000102', 'studio', 'Content Other',
   '{"party_kind":"legal_entity","party_name":"Content Other SAS","purpose":"studio_operations"}');

insert into organizations.organization_memberships (id, organization_id, person_id)
values
  ('019d1300-0000-7000-8000-000000000201', '019d1300-0000-7000-8000-000000000101', '019d1300-0000-7000-8000-000000000001'),
  ('019d1300-0000-7000-8000-000000000202', '019d1300-0000-7000-8000-000000000101', '019d1300-0000-7000-8000-000000000002'),
  ('019d1300-0000-7000-8000-000000000203', '019d1300-0000-7000-8000-000000000101', '019d1300-0000-7000-8000-000000000003'),
  ('019d1300-0000-7000-8000-000000000204', '019d1300-0000-7000-8000-000000000102', '019d1300-0000-7000-8000-000000000004'),
  ('019d1300-0000-7000-8000-000000000205', '019d1300-0000-7000-8000-000000000101', '019d1300-0000-7000-8000-000000000005');

insert into organizations.membership_roles (membership_id, role_code)
values
  ('019d1300-0000-7000-8000-000000000201', 'owner'),
  ('019d1300-0000-7000-8000-000000000202', 'coach'),
  ('019d1300-0000-7000-8000-000000000203', 'staff'),
  ('019d1300-0000-7000-8000-000000000204', 'owner'),
  ('019d1300-0000-7000-8000-000000000205', 'admin');

-- A published Allfit routine and Camilo's own Space routine.
insert into planning.session_templates (id, content_scope, owner_person_id, author_person_id, discipline_code, status)
values
  ('019d1300-0000-7000-8000-000000000301', 'global', null, null, 'test_strength', 'published'),
  ('019d1300-0000-7000-8000-000000000311', 'person', '019d1300-0000-7000-8000-000000000002',
   '019d1300-0000-7000-8000-000000000002', 'test_strength', 'published');
select set_config('app.planning_publication', 'true', true);
insert into planning.session_template_versions (
  id, template_id, version_number, discipline_code, activity_type_id, title, content_hash
) values
  ('019d1300-0000-7000-8000-000000000302', '019d1300-0000-7000-8000-000000000301', 1,
   'test_strength', '019c0000-0000-7000-8000-000000000011', 'Global', decode(repeat('d1', 32), 'hex')),
  ('019d1300-0000-7000-8000-000000000312', '019d1300-0000-7000-8000-000000000311', 1,
   'test_strength', '019c0000-0000-7000-8000-000000000011', 'Personal', decode(repeat('d2', 32), 'hex'));
select set_config('app.planning_publication', '', true);

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

create function pg_temp.program(title text, version_ids text[]) returns jsonb
language sql as $$
  select jsonb_build_object('title', title, 'notes', null, 'repeats_forever', true,
    'sessions', coalesce((
      select jsonb_agg(jsonb_build_object('position', item.position, 'week', 1,
        'day', least(item.position, 7), 'template_version_id', item.id) order by item.position)
      from unnest(version_ids) with ordinality as item(id, position)), '[]'::jsonb))
$$;

create function pg_temp.routine(title text, sets integer) returns jsonb
language sql as $$
  select jsonb_build_object('title', title, 'activity_type_id', '019c0000-0000-7000-8000-000000000011',
    'steps', jsonb_build_array(jsonb_build_object('position', 1,
      'target', jsonb_build_object('family', 'strength', 'target_sets', sets))))
$$;

select set_config('app.actor_kind', 'person', true);

-- The guard itself: whose routines an organization program may hold.
select set_config('app.actor_person_id', '019d1300-0000-7000-8000-000000000002', true);
select is(
  planning.program_content_errors(
    pg_temp.program('Mixto', array['019d1300-0000-7000-8000-000000000312']),
    '019d1300-0000-7000-8000-000000000101', false),
  array['template-version'],
  'T-PLN-ORGCONTENT-RLS-01 an organization program refuses the coach''s own Space routine');
select is(
  planning.program_content_errors(
    pg_temp.program('Global', array['019d1300-0000-7000-8000-000000000302']),
    '019d1300-0000-7000-8000-000000000101', false),
  array[]::text[],
  'T-PLN-ORGCONTENT-RLS-02 and still accepts a published Allfit routine');
select is(
  planning.program_content_errors(
    pg_temp.program('Mío', array['019d1300-0000-7000-8000-000000000312']),
    null, false),
  array[]::text[],
  'T-PLN-ORGCONTENT-RLS-03 while her personal program keeps accepting it');

-- Camilo builds organization content: a routine with two versions and a program.
set local role allfit_api;

select (planning.create_session_template(
  '019d1300-0000-7000-8000-000000000002', '019d1300-0000-7000-8000-000000000101',
  'test_strength', 'Fuerza', '22222222-2222-4222-8222-000000000001',
  extensions.uuid_generate_v7(), decode(repeat('01', 32), 'hex'))).result as created \gset
select (:'created'::jsonb->>'id') as template_id, (:'created'::jsonb->'draft'->>'etag') as etag0 \gset

select (planning.replace_session_template_draft(
  '019d1300-0000-7000-8000-000000000002', '019d1300-0000-7000-8000-000000000101',
  :'template_id'::uuid, :'etag0', pg_temp.routine('Fuerza', 3),
  '22222222-2222-4222-8222-000000000002', extensions.uuid_generate_v7(),
  decode(repeat('02', 32), 'hex'))).result->>'etag' as etag1 \gset
select (planning.publish_session_template_version(
  '019d1300-0000-7000-8000-000000000002', '019d1300-0000-7000-8000-000000000101',
  :'template_id'::uuid, :'etag1', '22222222-2222-4222-8222-000000000003',
  extensions.uuid_generate_v7(), decode(repeat('03', 32), 'hex'))).result->>'id' as v1 \gset

select (planning.create_program(
  '019d1300-0000-7000-8000-000000000002', '019d1300-0000-7000-8000-000000000101', 'Bloque',
  '22222222-2222-4222-8222-000000000004', extensions.uuid_generate_v7(),
  decode(repeat('04', 32), 'hex'))).result as program \gset
select (:'program'::jsonb->>'id') as program_id, (:'program'::jsonb->'draft'->>'etag') as program_etag0 \gset

select is(
  pg_temp.failure(format($sql$ select * from planning.replace_program_draft(
    '019d1300-0000-7000-8000-000000000002', '019d1300-0000-7000-8000-000000000101', %L, %L, %L,
    '22222222-2222-4222-8222-000000000005', extensions.uuid_generate_v7(), decode(repeat('05', 32), 'hex')) $sql$,
    :'program_id', :'program_etag0',
    pg_temp.program('Bloque', array['019d1300-0000-7000-8000-000000000312']))),
  '22023 ["template-version"]',
  'T-PLN-ORGCONTENT-RLS-04 editing the program with her Space routine is refused');

select (planning.replace_program_draft(
  '019d1300-0000-7000-8000-000000000002', '019d1300-0000-7000-8000-000000000101',
  :'program_id'::uuid, :'program_etag0', pg_temp.program('Bloque', array[:'v1']),
  '22222222-2222-4222-8222-000000000006', extensions.uuid_generate_v7(),
  decode(repeat('06', 32), 'hex'))).result->>'etag' as program_etag1 \gset
select (planning.publish_program_version(
  '019d1300-0000-7000-8000-000000000002', '019d1300-0000-7000-8000-000000000101',
  :'program_id'::uuid, :'program_etag1', '22222222-2222-4222-8222-000000000007',
  extensions.uuid_generate_v7(), decode(repeat('07', 32), 'hex'))).result as program_v1 \gset

select is((:'program_v1'::jsonb->>'repeats_forever')::boolean, true,
  'T-PLN-ORGCONTENT-INT-01 the published program version says it has no end');

-- The second routine version, after the program pinned the first.
select (planning.replace_session_template_draft(
  '019d1300-0000-7000-8000-000000000002', '019d1300-0000-7000-8000-000000000101',
  :'template_id'::uuid, :'etag1', pg_temp.routine('Fuerza', 4),
  '22222222-2222-4222-8222-000000000008', extensions.uuid_generate_v7(),
  decode(repeat('08', 32), 'hex'))).result->>'etag' as etag2 \gset
select (planning.publish_session_template_version(
  '019d1300-0000-7000-8000-000000000002', '019d1300-0000-7000-8000-000000000101',
  :'template_id'::uuid, :'etag2', '22222222-2222-4222-8222-000000000009',
  extensions.uuid_generate_v7(), decode(repeat('09', 32), 'hex'))).result->>'id' as v2 \gset

-- A draft that slipped the personal routine in before the fix cannot be published now.
reset role;
update planning.program_drafts
set content = pg_temp.program('Bloque', array[:'v1', '019d1300-0000-7000-8000-000000000312'])
where program_id = :'program_id'::uuid;
select planning.content_etag(content) as program_etag_smuggled
from planning.program_drafts where program_id = :'program_id'::uuid \gset
set local role allfit_api;
select is(
  pg_temp.failure(format($sql$ select * from planning.publish_program_version(
    '019d1300-0000-7000-8000-000000000002', '019d1300-0000-7000-8000-000000000101', %L, %L,
    '22222222-2222-4222-8222-000000000010', extensions.uuid_generate_v7(), decode(repeat('10', 32), 'hex')) $sql$,
    :'program_id', :'program_etag_smuggled')),
  '22023 ["template-version"]',
  'T-PLN-ORGCONTENT-RLS-05 publishing a program that holds her Space routine is refused');
reset role;
update planning.program_drafts set content = pg_temp.program('Bloque', array[:'v1'])
where program_id = :'program_id'::uuid;
set local role allfit_api;

-- Another organization: Otto owns B. With A's identifier he has no membership; with
-- his own, A's resources do not exist. Both answer as absent.
select set_config('app.actor_person_id', '019d1300-0000-7000-8000-000000000004', true);
select throws_ok(
  $$ select * from planning.create_session_template('019d1300-0000-7000-8000-000000000004',
    '019d1300-0000-7000-8000-000000000101', 'test_strength', 'Intruso',
    '22222222-2222-4222-8222-000000000011', extensions.uuid_generate_v7(), decode(repeat('11', 32), 'hex')) $$,
  'P0002', null, 'T-PLN-ORGCONTENT-RLS-06 another organization cannot create a routine here');
select throws_ok(
  $$ select * from planning.create_program('019d1300-0000-7000-8000-000000000004',
    '019d1300-0000-7000-8000-000000000101', 'Intruso',
    '22222222-2222-4222-8222-000000000012', extensions.uuid_generate_v7(), decode(repeat('12', 32), 'hex')) $$,
  'P0002', null, 'T-PLN-ORGCONTENT-RLS-07 another organization cannot create a program here');
select throws_ok(
  format($sql$ select * from planning.publish_session_template_version('019d1300-0000-7000-8000-000000000004',
    '019d1300-0000-7000-8000-000000000102', %L, %L,
    '22222222-2222-4222-8222-000000000013', extensions.uuid_generate_v7(), decode(repeat('13', 32), 'hex')) $sql$,
    :'template_id', :'etag2'),
  'P0002', null, 'T-PLN-ORGCONTENT-RLS-08 another organization cannot publish this routine');
select throws_ok(
  format($sql$ select * from planning.derive_session_template_version('019d1300-0000-7000-8000-000000000004',
    '019d1300-0000-7000-8000-000000000102', %L, 1, %L,
    '22222222-2222-4222-8222-000000000014', extensions.uuid_generate_v7(), decode(repeat('14', 32), 'hex')) $sql$,
    :'template_id', :'etag2'),
  'P0002', null, 'T-PLN-ORGCONTENT-RLS-09 another organization cannot derive from this routine');
select throws_ok(
  format($sql$ select * from planning.deprecate_session_template_version('019d1300-0000-7000-8000-000000000004',
    '019d1300-0000-7000-8000-000000000102', %L, 1,
    '22222222-2222-4222-8222-000000000015', extensions.uuid_generate_v7(), decode(repeat('15', 32), 'hex')) $sql$,
    :'template_id'),
  'P0002', null, 'T-PLN-ORGCONTENT-RLS-10 another organization cannot retire this routine');
select throws_ok(
  format($sql$ select * from planning.replace_program_draft('019d1300-0000-7000-8000-000000000004',
    '019d1300-0000-7000-8000-000000000102', %L, %L, %L,
    '22222222-2222-4222-8222-000000000016', extensions.uuid_generate_v7(), decode(repeat('16', 32), 'hex')) $sql$,
    :'program_id', :'program_etag1', pg_temp.program('Intruso', array[]::text[])),
  'P0002', null, 'T-PLN-ORGCONTENT-RLS-11 another organization cannot edit this program');
select throws_ok(
  format($sql$ select * from planning.publish_program_version('019d1300-0000-7000-8000-000000000004',
    '019d1300-0000-7000-8000-000000000102', %L, %L,
    '22222222-2222-4222-8222-000000000017', extensions.uuid_generate_v7(), decode(repeat('17', 32), 'hex')) $sql$,
    :'program_id', :'program_etag1'),
  'P0002', null, 'T-PLN-ORGCONTENT-RLS-12 another organization cannot publish this program');
select throws_ok(
  format($sql$ select * from planning.deprecate_program_version('019d1300-0000-7000-8000-000000000004',
    '019d1300-0000-7000-8000-000000000102', %L, 1,
    '22222222-2222-4222-8222-000000000018', extensions.uuid_generate_v7(), decode(repeat('18', 32), 'hex')) $sql$,
    :'program_id'),
  'P0002', null, 'T-PLN-ORGCONTENT-RLS-13 another organization cannot retire this program');

-- Inside the organization: staff never compose programs, a coach never retires one.
select set_config('app.actor_person_id', '019d1300-0000-7000-8000-000000000003', true);
select throws_ok(
  $$ select * from planning.create_program('019d1300-0000-7000-8000-000000000003',
    '019d1300-0000-7000-8000-000000000101', 'Staff',
    '22222222-2222-4222-8222-000000000019', extensions.uuid_generate_v7(), decode(repeat('19', 32), 'hex')) $$,
  'P0002', null, 'T-PLN-ORGCONTENT-RLS-14 staff cannot create a program');
select throws_ok(
  format($sql$ select * from planning.replace_program_draft('019d1300-0000-7000-8000-000000000003',
    '019d1300-0000-7000-8000-000000000101', %L, %L, %L,
    '22222222-2222-4222-8222-000000000020', extensions.uuid_generate_v7(), decode(repeat('20', 32), 'hex')) $sql$,
    :'program_id', :'program_etag1', pg_temp.program('Staff', array[]::text[])),
  'P0002', null, 'T-PLN-ORGCONTENT-RLS-15 staff cannot edit a program');
select throws_ok(
  format($sql$ select * from planning.publish_program_version('019d1300-0000-7000-8000-000000000003',
    '019d1300-0000-7000-8000-000000000101', %L, %L,
    '22222222-2222-4222-8222-000000000021', extensions.uuid_generate_v7(), decode(repeat('21', 32), 'hex')) $sql$,
    :'program_id', :'program_etag1'),
  'P0002', null, 'T-PLN-ORGCONTENT-RLS-16 staff cannot publish a program');
select set_config('app.actor_person_id', '019d1300-0000-7000-8000-000000000002', true);
select throws_ok(
  format($sql$ select * from planning.deprecate_program_version('019d1300-0000-7000-8000-000000000002',
    '019d1300-0000-7000-8000-000000000101', %L, 1,
    '22222222-2222-4222-8222-000000000022', extensions.uuid_generate_v7(), decode(repeat('22', 32), 'hex')) $sql$,
    :'program_id'),
  '42501', null, 'T-PLN-ORGCONTENT-RLS-17 a coach cannot retire a program version');

-- A published version is a fixed point: the program keeps the routine version it chose.
reset role;
select is(
  (select array_agg(session.template_version_id::text)
   from planning.program_version_sessions as session
   where session.program_version_id = (:'program_v1'::jsonb->>'id')::uuid),
  array[:'v1'],
  'T-PLN-ORGCONTENT-INT-02 program version 1 still runs routine version 1 after version 2 is out');
set local role allfit_api;

-- Publishing an incomplete routine says what is missing.
select (planning.create_session_template(
  '019d1300-0000-7000-8000-000000000002', '019d1300-0000-7000-8000-000000000101',
  'test_strength', 'Vacía', '22222222-2222-4222-8222-000000000023',
  extensions.uuid_generate_v7(), decode(repeat('23', 32), 'hex'))).result as empty \gset
select (planning.replace_session_template_draft(
  '019d1300-0000-7000-8000-000000000002', '019d1300-0000-7000-8000-000000000101',
  (:'empty'::jsonb->>'id')::uuid, :'empty'::jsonb->'draft'->>'etag',
  '{"title":"Vacía","activity_type_id":"019c0000-0000-7000-8000-000000000011","steps":[]}',
  '22222222-2222-4222-8222-000000000024', extensions.uuid_generate_v7(),
  decode(repeat('24', 32), 'hex'))).result->>'etag' as empty_etag \gset
select is(
  pg_temp.failure(format($sql$ select * from planning.publish_session_template_version(
    '019d1300-0000-7000-8000-000000000002', '019d1300-0000-7000-8000-000000000101', %L, %L,
    '22222222-2222-4222-8222-000000000025', extensions.uuid_generate_v7(), decode(repeat('25', 32), 'hex')) $sql$,
    :'empty'::jsonb->>'id', :'empty_etag')),
  '22023 ["steps"]',
  'T-PLN-ORGCONTENT-INT-03 an incomplete routine is refused with the list of what is missing');

-- Derivation keeps where the draft came from (HU-STUDIO-039 criterion 1).
select (planning.derive_session_template_version(
  '019d1300-0000-7000-8000-000000000002', '019d1300-0000-7000-8000-000000000101',
  :'template_id'::uuid, 1, :'etag2', '22222222-2222-4222-8222-000000000026',
  extensions.uuid_generate_v7(), decode(repeat('26', 32), 'hex'))).result->>'etag' as etag_from_v1 \gset
select (planning.publish_session_template_version(
  '019d1300-0000-7000-8000-000000000002', '019d1300-0000-7000-8000-000000000101',
  :'template_id'::uuid, :'etag_from_v1', '22222222-2222-4222-8222-000000000027',
  extensions.uuid_generate_v7(), decode(repeat('27', 32), 'hex'))).result as v3 \gset
select is((:'v3'::jsonb->>'version_number')::integer, 3,
  'T-PLN-ORGCONTENT-INT-04 content equal to an older version is published as the next one');
select is(:'v3'::jsonb->>'derived_from_version_id', :'v1',
  'T-PLN-ORGCONTENT-INT-05 and records the version it came from');
reset role;
select is(
  (select derived_from_version_id from planning.session_template_drafts where template_id = :'template_id'::uuid),
  null,
  'T-PLN-ORGCONTENT-INT-06 after publishing, the draft continues from the new version');
set local role allfit_api;

select (planning.derive_session_template_version(
  '019d1300-0000-7000-8000-000000000002', '019d1300-0000-7000-8000-000000000101',
  :'template_id'::uuid, 2, :'etag_from_v1', '22222222-2222-4222-8222-000000000028',
  extensions.uuid_generate_v7(), decode(repeat('28', 32), 'hex'))).result->>'etag' as etag_from_v2 \gset
select (planning.replace_session_template_draft(
  '019d1300-0000-7000-8000-000000000002', '019d1300-0000-7000-8000-000000000101',
  :'template_id'::uuid, :'etag_from_v2', pg_temp.routine('Fuerza variante', 5),
  '22222222-2222-4222-8222-000000000029', extensions.uuid_generate_v7(),
  decode(repeat('29', 32), 'hex'))).result as variant \gset
select is(:'variant'::jsonb->>'derived_from_version_id', :'v2',
  'T-PLN-ORGCONTENT-INT-07 editing a derived draft keeps where it came from');
select (planning.publish_session_template_version(
  '019d1300-0000-7000-8000-000000000002', '019d1300-0000-7000-8000-000000000101',
  :'template_id'::uuid, :'variant'::jsonb->>'etag', '22222222-2222-4222-8222-000000000030',
  extensions.uuid_generate_v7(), decode(repeat('30', 32), 'hex'))).result as v4 \gset
select is(:'v4'::jsonb->>'derived_from_version_id', :'v2',
  'T-PLN-ORGCONTENT-INT-08 and the variant it becomes keeps it too');

select (planning.replace_session_template_draft(
  '019d1300-0000-7000-8000-000000000002', '019d1300-0000-7000-8000-000000000101',
  :'template_id'::uuid, :'variant'::jsonb->>'etag', pg_temp.routine('Fuerza variante', 6),
  '22222222-2222-4222-8222-000000000031', extensions.uuid_generate_v7(),
  decode(repeat('31', 32), 'hex'))).result->>'etag' as etag_after_variant \gset
select (planning.publish_session_template_version(
  '019d1300-0000-7000-8000-000000000002', '019d1300-0000-7000-8000-000000000101',
  :'template_id'::uuid, :'etag_after_variant', '22222222-2222-4222-8222-000000000032',
  extensions.uuid_generate_v7(), decode(repeat('32', 32), 'hex'))).result as v5 \gset
select is(:'v5'::jsonb->>'derived_from_version_id', null,
  'T-PLN-ORGCONTENT-INT-09 the next ordinary version is not a derivation');
select is((:'v5'::jsonb->>'version_number')::integer, 5,
  'T-PLN-ORGCONTENT-INT-10 and is numbered after the variant');

-- A retired version is no longer a starting point.
select set_config('app.actor_person_id', '019d1300-0000-7000-8000-000000000001', true);
select is((planning.deprecate_session_template_version(
  '019d1300-0000-7000-8000-000000000001', '019d1300-0000-7000-8000-000000000101',
  :'template_id'::uuid, 1, '22222222-2222-4222-8222-000000000033',
  extensions.uuid_generate_v7(), decode(repeat('33', 32), 'hex'))).result->>'status', 'deprecated',
  'T-PLN-ORGCONTENT-INT-11 the owner retires routine version 1');
select set_config('app.actor_person_id', '019d1300-0000-7000-8000-000000000002', true);
select throws_ok(
  format($sql$ select * from planning.derive_session_template_version('019d1300-0000-7000-8000-000000000002',
    '019d1300-0000-7000-8000-000000000101', %L, 1, %L,
    '22222222-2222-4222-8222-000000000034', extensions.uuid_generate_v7(), decode(repeat('34', 32), 'hex')) $sql$,
    :'template_id', :'etag_after_variant'),
  'P0002', null, 'T-PLN-ORGCONTENT-INT-12 nobody derives from a retired version');
select is(
  pg_temp.failure(format($sql$ select * from planning.replace_program_draft(
    '019d1300-0000-7000-8000-000000000002', '019d1300-0000-7000-8000-000000000101', %L, %L, %L,
    '22222222-2222-4222-8222-000000000035', extensions.uuid_generate_v7(), decode(repeat('35', 32), 'hex')) $sql$,
    :'program_id', :'program_etag1',
    pg_temp.program('Bloque', array[:'v1', :'v2']))),
  'no error',
  'T-PLN-ORGCONTENT-INT-13 a program that already held version 1 keeps it while gaining another');

-- The list carries the same version shape.
select set_config('app.request_id', '22222222-2222-4222-8222-000000000101', true);
select is(
  (select (result->'versions'->0->>'repeats_forever')::boolean
   from planning.list_programs('019d1300-0000-7000-8000-000000000002',
     '019d1300-0000-7000-8000-000000000101', 25, null, null)
   where (result->>'id')::uuid = :'program_id'::uuid),
  true,
  'T-PLN-ORGCONTENT-INT-14 the program list says the version has no end');

-- Runtime keeps no direct path into planned sets.
reset role;
select ok(
  not has_table_privilege('allfit_api', 'planning.planned_sets', 'select')
  and not has_table_privilege('allfit_api', 'planning.planned_sets', 'insert'),
  'T-PLN-ORGCONTENT-RLS-18 runtime reaches planned sets only through closed functions');

-- One published program version, read whole (OP-PLN-021). Last, because before the
-- migration the function does not exist.
set local role allfit_api;
select set_config('app.request_id', '22222222-2222-4222-8222-000000000102', true);
select planning.read_organization_program_version('019d1300-0000-7000-8000-000000000002',
  '019d1300-0000-7000-8000-000000000101', :'program_id'::uuid, 1) as read_v1 \gset
select is(:'read_v1'::jsonb->>'id', :'program_v1'::jsonb->>'id',
  'T-PLN-ORGCONTENT-RLS-19 the coach reads the published program version');
select is(:'read_v1'::jsonb->'sessions'->0->>'template_version_id', :'v1',
  'T-PLN-ORGCONTENT-INT-15 with the exact routine version each day runs');
select is((:'read_v1'::jsonb->>'repeats_forever')::boolean, true,
  'T-PLN-ORGCONTENT-INT-16 and whether it ends');
select is(:'read_v1'::jsonb - 'deprecated_template_version_ids',
  :'program_v1'::jsonb - 'deprecated_template_version_ids',
  'T-PLN-ORGCONTENT-INT-17 it is the same projection publishing answered');
select is(:'read_v1'::jsonb->'deprecated_template_version_ids', jsonb_build_array(:'v1'),
  'T-PLN-ORGCONTENT-INT-19 and it warns that routine version 1 has since been retired');

select set_config('app.actor_person_id', '019d1300-0000-7000-8000-000000000005', true);
select set_config('app.request_id', '22222222-2222-4222-8222-000000000103', true);
select is((planning.read_organization_program_version('019d1300-0000-7000-8000-000000000005',
  '019d1300-0000-7000-8000-000000000101', :'program_id'::uuid, 1))->>'version_number', '1',
  'T-PLN-ORGCONTENT-RLS-20 an admin reads it too');

select set_config('app.actor_person_id', '019d1300-0000-7000-8000-000000000003', true);
select set_config('app.request_id', '22222222-2222-4222-8222-000000000104', true);
select throws_ok(
  format($sql$ select planning.read_organization_program_version('019d1300-0000-7000-8000-000000000003',
    '019d1300-0000-7000-8000-000000000101', %L, 1) $sql$, :'program_id'),
  'P0002', null, 'T-PLN-ORGCONTENT-RLS-21 staff cannot read program content');

select set_config('app.actor_person_id', '019d1300-0000-7000-8000-000000000004', true);
select set_config('app.request_id', '22222222-2222-4222-8222-000000000105', true);
select throws_ok(
  format($sql$ select planning.read_organization_program_version('019d1300-0000-7000-8000-000000000004',
    '019d1300-0000-7000-8000-000000000101', %L, 1) $sql$, :'program_id'),
  'P0002', null, 'T-PLN-ORGCONTENT-RLS-22 another organization cannot read it with this organization');
select throws_ok(
  format($sql$ select planning.read_organization_program_version('019d1300-0000-7000-8000-000000000004',
    '019d1300-0000-7000-8000-000000000102', %L, 1) $sql$, :'program_id'),
  'P0002', null, 'T-PLN-ORGCONTENT-RLS-23 nor with its own');

select set_config('app.actor_person_id', '019d1300-0000-7000-8000-000000000002', true);
select set_config('app.request_id', '22222222-2222-4222-8222-000000000106', true);
select throws_ok(
  format($sql$ select planning.read_organization_program_version('019d1300-0000-7000-8000-000000000002',
    '019d1300-0000-7000-8000-000000000101', %L, 9) $sql$, :'program_id'),
  'P0002', null, 'T-PLN-ORGCONTENT-INT-18 a version that does not exist answers as absent');
select set_config('app.request_id', '', true);
select throws_ok(
  format($sql$ select planning.read_organization_program_version('019d1300-0000-7000-8000-000000000002',
    '019d1300-0000-7000-8000-000000000101', %L, 1) $sql$, :'program_id'),
  '22023', null, 'T-PLN-ORGCONTENT-RLS-24 the read fails closed without a request to audit it under');

reset role;
select is(
  (select count(*) from privacy.access_events
   where request_id in ('22222222-2222-4222-8222-000000000102', '22222222-2222-4222-8222-000000000103')),
  2::bigint,
  'T-PLN-ORGCONTENT-RLS-25 every allowed read is audited in its transaction');
select ok(
  has_function_privilege('allfit_api', 'planning.read_organization_program_version(uuid, uuid, uuid, integer)', 'execute')
  and not has_function_privilege('public', 'planning.read_organization_program_version(uuid, uuid, uuid, integer)', 'execute'),
  'T-PLN-ORGCONTENT-RLS-26 only runtime may call the read');

select * from finish();
rollback;
