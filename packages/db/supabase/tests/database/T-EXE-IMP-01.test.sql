-- T-EXE-IMP-01 — a person brings their history from another app (ADR-044, OP-EXE-027..030).
--
-- What must hold: staging touches no history and the same file answers the same import;
-- committing creates every new session finished, with its source, and records count it;
-- a later file only adds what is missing; undoing annuls the import and frees it to come
-- back; the person's choices are remembered; nobody else reads, commits or undoes it.
-- A long history commits in calls of 25 that resume where the last one stopped, keep the
-- zone and names the first one fixed (a later call's choices are not read), and can be
-- undone half way.
--
-- Written before the functions and watched failing; the deny cases were also watched
-- passing with row security switched off, so they do depend on the policies.

begin;

select plan(40);

insert into identity.people (id, given_name, family_name)
values ('019ef800-0000-7000-8000-000000000001', 'Quien', 'Migra'),
       ('019ef800-0000-7000-8000-000000000002', 'La', 'Vecina'),
       ('019ef800-0000-7000-8000-000000000003', 'Mucho', 'Historial');

insert into catalog.movements (id, discipline_code, name, normalized_name, content_scope, status)
values ('019ef800-0000-7000-8000-0000000000a1', 'test_strength', 'Press de banca', 'press de banca', 'global', 'published'),
       ('019ef800-0000-7000-8000-0000000000b1', 'test_strength', 'Sentadilla con barra', 'sentadilla con barra', 'global', 'published');
insert into catalog.movement_aliases (movement_id, locale, name)
values ('019ef800-0000-7000-8000-0000000000a1', 'es', 'barbell bench press');
insert into catalog.external_movement_names (source, external_name, movement_id)
values ('hevy_csv', 'squat (barbell)', '019ef800-0000-7000-8000-0000000000b1');

-- The first file: a push day with an exercise the catalogue does not know, and a leg day.
create temporary table first_file as select '[
  {"fingerprint":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","title":"Push","started_local":"2026-01-10T09:00","ended_local":"2026-01-10T10:00","description":"Heavy",
   "exercises":[
     {"position":1,"source_name":"Bench Press (Barbell)","note":"Pause","superset_group":null,"sets":[
       {"order":1,"kind":"warmup","load_kg":40,"reps":10,"rpe":null},
       {"order":2,"kind":"normal","load_kg":60,"reps":8,"rpe":8}]},
     {"position":2,"source_name":"Squat (Barbell)","note":null,"superset_group":null,"sets":[
       {"order":1,"kind":"normal","load_kg":100,"reps":5,"rpe":null}]},
     {"position":3,"source_name":"Mystery Move","note":null,"superset_group":null,"sets":[
       {"order":1,"kind":"to_failure","load_kg":null,"reps":12,"rpe":null}]}]},
  {"fingerprint":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb","title":"Legs","started_local":"2026-01-12T09:00","ended_local":"2026-01-12T09:50","description":null,
   "exercises":[
     {"position":1,"source_name":"Squat (Barbell)","note":null,"superset_group":null,"sets":[
       {"order":1,"kind":"normal","load_kg":110,"reps":5,"rpe":9}]}]}
]'::jsonb as sessions;
grant select on first_file to allfit_owner;

create function pg_temp.stage(p_sessions jsonb, p_sha text, p_key text, p_command text)
returns jsonb
language sql
as $fn$
  select execution.stage_history_import(
    '019ef800-0000-7000-8000-000000000001', 'hevy_csv', 1, 'test_strength', 'America/Bogota',
    decode(repeat(p_sha, 32), 'hex'), p_sessions, '[{"row":7,"code":"unsupported_set"}]'::jsonb,
    p_key::uuid, p_command::uuid, decode(repeat(p_sha, 32), 'hex'))
$fn$;

create function pg_temp.mine()
returns integer
language sql
as $fn$
  select count(*)::integer from execution.executed_sessions
  where person_id = '019ef800-0000-7000-8000-000000000001' and annulled_at is null
$fn$;

select set_config('app.actor_kind', 'person', true);
select set_config('app.actor_person_id', '019ef800-0000-7000-8000-000000000001', true);

set local role allfit_owner;

-- ———————————————————————————————————————— staging

select pg_temp.stage((select sessions from first_file), '01',
  'f8111111-1111-4111-8111-111111111101', '019ef800-0000-7000-8000-000000000101') as staged \gset

select is(
  (select jsonb_build_object('status', :'staged'::jsonb->>'status',
     'sessions', (:'staged'::jsonb->>'session_count')::integer,
     'sets', (:'staged'::jsonb->>'set_count')::integer,
     'imported', :'staged'::jsonb->'imported_count',
     'new', (:'staged'::jsonb->'preview'->>'new_sessions')::integer,
     'duplicates', (:'staged'::jsonb->'preview'->>'duplicate_sessions')::integer,
     'from', :'staged'::jsonb->'preview'->>'first_started_local',
     'issues', :'staged'::jsonb->'issues')),
  '{"status":"staged","sessions":2,"sets":5,"imported":0,"new":2,"duplicates":0,"from":"2026-01-10T09:00","issues":[{"row":7,"code":"unsupported_set"}]}'::jsonb,
  'T-EXE-IMP-01 staging answers a preview of what would enter');

select is(
  (select jsonb_object_agg(item->>'source_name', jsonb_build_array(item->>'resolution', item->'movement'->>'name'))
   from jsonb_array_elements(:'staged'::jsonb->'preview'->'exercises') as item),
  '{"Bench Press (Barbell)":["suggested","Press de banca"],"Squat (Barbell)":["catalogue","Sentadilla con barra"],"Mystery Move":["unmatched",null]}'::jsonb,
  'T-EXE-IMP-02 each name meets the catalogue: curated, suggested by alias, or not at all');

select is(pg_temp.mine(), 0, 'T-EXE-IMP-03 staging touches no history');

select is(
  pg_temp.stage((select sessions from first_file), '01',
    'f8111111-1111-4111-8111-111111111101', '019ef800-0000-7000-8000-000000000101')->>'id',
  '019ef800-0000-7000-8000-000000000101',
  'T-EXE-IMP-04 a retry with the same key answers the same import');

select is(
  pg_temp.stage((select sessions from first_file), '01',
    'f8111111-1111-4111-8111-111111111102', '019ef800-0000-7000-8000-000000000102')->>'id',
  '019ef800-0000-7000-8000-000000000101',
  'T-EXE-IMP-05 the same file with a new key lands on the import already alive');

select is(
  (select count(*)::integer from execution.history_imports),
  1,
  'T-EXE-IMP-06 and leaves a single import');

-- ———————————————————————————————————————— somebody else

select set_config('app.actor_person_id', '019ef800-0000-7000-8000-000000000002', true);

select throws_ok(
  $$ select pg_temp.stage((select sessions from first_file), '09',
       'f8111111-1111-4111-8111-111111111109', '019ef800-0000-7000-8000-000000000109') $$,
  '42501', null,
  'T-EXE-IMP-07 nobody stages an import for somebody else');

select is(
  (select array[(select count(*) from execution.history_imports),
                (select count(*) from execution.history_import_sessions)]::integer[]),
  array[0, 0],
  'T-EXE-IMP-08 RLS: the neighbour reads no import and no staged session');

select throws_ok(
  $$ select execution.read_history_import('019ef800-0000-7000-8000-000000000002',
       '019ef800-0000-7000-8000-000000000101') $$,
  'P0002', null,
  'T-EXE-IMP-09 and asking for it by id finds nothing');

select throws_ok(
  $$ select execution.commit_history_import('019ef800-0000-7000-8000-000000000002',
       '019ef800-0000-7000-8000-000000000101', 'America/Bogota', '[]'::jsonb,
       'f8111111-1111-4111-8111-111111111110', extensions.uuid_generate_v7(), decode(repeat('10', 32), 'hex')) $$,
  '42501', null,
  'T-EXE-IMP-10 nobody commits somebody else''s import');

select set_config('app.actor_person_id', '019ef800-0000-7000-8000-000000000001', true);

select is(
  (select array[(select count(*) from execution.history_imports),
                (select count(*) from execution.history_import_sessions)]::integer[]),
  array[1, 2],
  'T-EXE-IMP-11 RLS: the person reads their own import and its staged sessions');

-- ———————————————————————————————————————— committing

select execution.commit_history_import(
  '019ef800-0000-7000-8000-000000000001', '019ef800-0000-7000-8000-000000000101', 'America/Bogota',
  '[{"external_name":"Bench Press (Barbell)","movement_id":"019ef800-0000-7000-8000-0000000000a1"},
    {"external_name":"Mystery Move","movement_id":null}]'::jsonb,
  'f8111111-1111-4111-8111-111111111111', '019ef800-0000-7000-8000-000000000111',
  decode(repeat('11', 32), 'hex')) as committed \gset

select is(
  (select jsonb_build_object('status', :'committed'::jsonb->>'status',
     'imported', (:'committed'::jsonb->>'imported_count')::integer,
     'preview', :'committed'::jsonb->'preview')),
  '{"status":"committed","imported":2,"preview":null}'::jsonb,
  'T-EXE-IMP-12 committing brings both sessions in');

select is(
  (select array_agg(array[execution_status::text, validation_status::text, capture_source,
                          capture_provenance::text, is_autonomous::text, timezone]
                    order by started_at)
   from execution.executed_sessions where person_id = '019ef800-0000-7000-8000-000000000001'),
  array[array['completed', 'valid', 'import', 'person_declared', 'true', 'America/Bogota'],
        array['completed', 'valid', 'import', 'person_declared', 'true', 'America/Bogota']],
  'T-EXE-IMP-13 each one finished, valid, autonomous, imported and declared by the person');

select is(
  (select array_agg(started_at order by started_at)
   from execution.executed_sessions where person_id = '019ef800-0000-7000-8000-000000000001'),
  array['2026-01-10 14:00:00+00'::timestamptz, '2026-01-12 14:00:00+00'::timestamptz],
  'T-EXE-IMP-14 the local start is read in the timezone the person confirmed');

select is(
  (select jsonb_agg(jsonb_build_array(sets.set_order, sets.kind, sets.load_value, sets.load_unit_code,
                                      sets.achieved_reps, sets.rpe) order by sets.set_order)
   from execution.strength_sets as sets
   join execution.imported_sessions as imported on imported.executed_session_id = sets.executed_session_id
   where imported.source_title = 'Push'),
  '[[1,"warmup",40,"kg",10,null],[2,"normal",60,"kg",8,8],[3,"normal",100,"kg",5,null],[4,"to_failure",null,null,12,null]]'::jsonb,
  'T-EXE-IMP-15 every set arrives with its kind, its load in kilos or none, and its effort');

select is(
  (select jsonb_agg(jsonb_build_array(item.position, movement.name, origin.source_name, origin.source_note)
                    order by item.position)
   from execution.session_exercises as item
   join execution.imported_sessions as imported on imported.executed_session_id = item.executed_session_id
   join execution.imported_exercises as origin on origin.session_exercise_id = item.id
   left join catalog.movements as movement on movement.id = item.movement_id
   where imported.source_title = 'Push'),
  '[[1,"Press de banca","Bench Press (Barbell)","Pause"],[2,"Sentadilla con barra","Squat (Barbell)",null],[3,null,"Mystery Move",null]]'::jsonb,
  'T-EXE-IMP-16 a confirmed suggestion and a curated name get their movement; the unknown keeps its name');

select is(
  (select array[(select count(*) from execution.history_import_sessions)::integer,
                (select count(*) from execution.person_movement_choices)::integer]),
  array[0, 2],
  'T-EXE-IMP-17 the staging area is emptied and the person''s choices are kept');

select is(
  (select execution.commit_history_import(
     '019ef800-0000-7000-8000-000000000001', '019ef800-0000-7000-8000-000000000101', 'America/Bogota', '[]'::jsonb,
     'f8111111-1111-4111-8111-111111111111', '019ef800-0000-7000-8000-000000000111',
     decode(repeat('11', 32), 'hex'))->>'imported_count'),
  '2',
  'T-EXE-IMP-18 a retry of the commit answers the same and creates nothing');

select throws_ok(
  $$ select execution.commit_history_import('019ef800-0000-7000-8000-000000000001',
       '019ef800-0000-7000-8000-000000000101', 'America/Bogota', '[]'::jsonb,
       'f8111111-1111-4111-8111-111111111112', extensions.uuid_generate_v7(), decode(repeat('12', 32), 'hex')) $$,
  '55000', null,
  'T-EXE-IMP-19 a committed import cannot be committed again');

select is(pg_temp.mine(), 2, 'T-EXE-IMP-20 two sessions, no more');

-- ———————————————————————————————————————— it is the person's training

select is(
  (select jsonb_agg(jsonb_build_array(item->>'title', item->>'source', (item->>'is_free')::boolean)
                    order by item->>'started_at')
   from jsonb_array_elements(execution.list_my_executions(
     '019ef800-0000-7000-8000-000000000001', 'America/Bogota', null, null, null, null, null, null, 50)->'data') as item),
  '[["Push","hevy_csv",true],["Legs","hevy_csv",true]]'::jsonb,
  'T-EXE-IMP-21 the history lists them with their own title and their source');

select is(
  (select (execution.read_finished_execution('019ef800-0000-7000-8000-000000000001', imported.executed_session_id,
                                             'America/Bogota')->>'record_count')::integer > 0
   from execution.imported_sessions as imported where imported.source_title = 'Legs'),
  true,
  'T-EXE-IMP-22 a heavier squat after an imported one is a record: imports count');

select is(
  (select jsonb_build_array(detail->>'source', detail->>'source_description', detail->'exercises'->2->>'source_name')
   from (select execution.read_finished_execution('019ef800-0000-7000-8000-000000000001', imported.executed_session_id,
                                                  'America/Bogota') as detail
         from execution.imported_sessions as imported where imported.source_title = 'Push') as read),
  '["hevy_csv","Heavy","Mystery Move"]'::jsonb,
  'T-EXE-IMP-23 the detail says the source, its description and the name an exercise arrived with');

-- ———————————————————————————————————————— a later file

select pg_temp.stage(
  ((select sessions from first_file) - 0) || '[
    {"fingerprint":"cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc","title":"Pull","started_local":"2026-01-14T09:00","ended_local":"2026-01-14T09:40","description":null,
     "exercises":[{"position":1,"source_name":"Mystery Move","note":null,"superset_group":null,"sets":[
       {"order":1,"kind":"normal","load_kg":null,"reps":10,"rpe":null}]}]}]'::jsonb,
  '02', 'f8111111-1111-4111-8111-111111111121', '019ef800-0000-7000-8000-000000000121') as second \gset

select is(
  (select jsonb_build_array((:'second'::jsonb->'preview'->>'new_sessions')::integer,
                            (:'second'::jsonb->'preview'->>'duplicate_sessions')::integer,
                            (select item->>'resolution' from jsonb_array_elements(:'second'::jsonb->'preview'->'exercises') as item
                             where item->>'source_name' = 'Mystery Move'))),
  '[1,1,"chosen"]'::jsonb,
  'T-EXE-IMP-24 a later file finds what is already here, and the person''s earlier choice');

select execution.commit_history_import(
  '019ef800-0000-7000-8000-000000000001', '019ef800-0000-7000-8000-000000000121', 'America/Bogota', '[]'::jsonb,
  'f8111111-1111-4111-8111-111111111122', extensions.uuid_generate_v7(), decode(repeat('22', 32), 'hex'));

select is(pg_temp.mine(), 3, 'T-EXE-IMP-25 and only what was missing enters');

-- ———————————————————————————————————————— undoing

select set_config('app.actor_person_id', '019ef800-0000-7000-8000-000000000002', true);
select throws_ok(
  $$ select execution.undo_history_import('019ef800-0000-7000-8000-000000000002',
       '019ef800-0000-7000-8000-000000000101',
       'f8111111-1111-4111-8111-111111111130', extensions.uuid_generate_v7(), decode(repeat('30', 32), 'hex')) $$,
  '42501', null,
  'T-EXE-IMP-26 nobody undoes somebody else''s import');
select set_config('app.actor_person_id', '019ef800-0000-7000-8000-000000000001', true);

select execution.undo_history_import(
  '019ef800-0000-7000-8000-000000000001', '019ef800-0000-7000-8000-000000000101',
  'f8111111-1111-4111-8111-111111111131', '019ef800-0000-7000-8000-000000000131',
  decode(repeat('31', 32), 'hex'));

select is(
  (select array[pg_temp.mine()::text,
                (select string_agg(distinct annulment_reason, ',') from execution.executed_sessions
                 where person_id = '019ef800-0000-7000-8000-000000000001' and annulled_at is not null),
                (select status from execution.history_imports where id = '019ef800-0000-7000-8000-000000000101')]),
  array['1', 'import_undone', 'undone'],
  'T-EXE-IMP-27 undoing annuls the sessions of that import only');

select is(
  (select execution.undo_history_import(
     '019ef800-0000-7000-8000-000000000001', '019ef800-0000-7000-8000-000000000101',
     'f8111111-1111-4111-8111-111111111131', '019ef800-0000-7000-8000-000000000131',
     decode(repeat('31', 32), 'hex'))->>'status'),
  'undone',
  'T-EXE-IMP-28 a retry of the undo answers the same');

select is(
  (pg_temp.stage((select sessions from first_file), '01',
     'f8111111-1111-4111-8111-111111111141', '019ef800-0000-7000-8000-000000000141')->'preview'->>'new_sessions')::integer,
  2,
  'T-EXE-IMP-29 after undoing, the same file can come back whole');

select is(
  (select jsonb_agg(item->>'status')
   from jsonb_array_elements(execution.list_history_imports('019ef800-0000-7000-8000-000000000001')) as item),
  '["staged","committed","undone"]'::jsonb,
  'T-EXE-IMP-30 the person lists their imports, newest first');

-- ———————————————————————————————————————— a long history, in calls

-- `p_count` sessions of one exercise, a day apart, fingerprints and dates of their own.
create function pg_temp.many(p_letter text, p_count integer, p_first date)
returns jsonb
language sql
as $fn$
  select jsonb_agg(jsonb_build_object(
           'fingerprint', lpad(to_hex(n), 64, p_letter), 'title', 'Day ' || n,
           'started_local', to_char(p_first + n, 'YYYY-MM-DD') || 'T09:00',
           'ended_local', to_char(p_first + n, 'YYYY-MM-DD') || 'T10:00', 'description', null,
           'exercises', '[{"position":1,"source_name":"Mystery Move","note":null,"superset_group":null,
                           "sets":[{"order":1,"kind":"normal","load_kg":20,"reps":10,"rpe":null}]}]'::jsonb)
         order by n)
  from generate_series(1, p_count) as n
$fn$;

create function pg_temp.long(p_import text, p_timezone text, p_choices jsonb, p_key text)
returns jsonb
language sql
as $fn$
  select execution.commit_history_import('019ef800-0000-7000-8000-000000000003', p_import::uuid,
    p_timezone, p_choices, p_key::uuid, extensions.uuid_generate_v7(), decode(repeat('5a', 32), 'hex'))
$fn$;

create function pg_temp.theirs()
returns integer
language sql
as $fn$
  select count(*)::integer from execution.executed_sessions
  where person_id = '019ef800-0000-7000-8000-000000000003' and annulled_at is null
$fn$;

select set_config('app.actor_person_id', '019ef800-0000-7000-8000-000000000003', true);

select execution.stage_history_import(
  '019ef800-0000-7000-8000-000000000003', 'hevy_csv', 1, 'test_strength', 'America/Bogota',
  decode(repeat('c3', 32), 'hex'), pg_temp.many('c', 30, '2025-01-01'), '[]'::jsonb,
  'f8111111-1111-4111-8111-111111111150', '019ef800-0000-7000-8000-000000000150',
  decode(repeat('c3', 32), 'hex')) \gset

select pg_temp.long('019ef800-0000-7000-8000-000000000150', 'America/Bogota',
  '[{"external_name":"Mystery Move","movement_id":"019ef800-0000-7000-8000-0000000000a1"}]',
  'f8111111-1111-4111-8111-111111111151') as first_call \gset

select is(
  (select jsonb_build_array(:'first_call'::jsonb->>'status', (:'first_call'::jsonb->>'imported_count')::integer,
                            (:'first_call'::jsonb->>'pending_count')::integer, :'first_call'::jsonb->'committed_at',
                            pg_temp.theirs())),
  '["committing",25,5,null,25]'::jsonb,
  'T-EXE-IMP-33 a long history enters 25 sessions per call and says how many are pending');

select is(
  (select count(*)::integer from execution.history_import_sessions
   where import_id = '019ef800-0000-7000-8000-000000000150'),
  5,
  'T-EXE-IMP-34 what entered leaves the staging area; what is pending stays');

select is(
  (pg_temp.long('019ef800-0000-7000-8000-000000000150', 'America/Bogota',
     '[{"external_name":"Mystery Move","movement_id":"019ef800-0000-7000-8000-0000000000a1"}]',
     'f8111111-1111-4111-8111-111111111151')->>'imported_count')::integer + pg_temp.theirs(),
  50,
  'T-EXE-IMP-35 a retry of the same call answers again and writes nothing more');

select throws_ok(
  $$ select pg_temp.long('019ef800-0000-7000-8000-000000000150', 'Europe/Madrid',
       '[{"external_name":"Mystery Move","movement_id":"019ef800-0000-7000-8000-0000000000a1"}]',
       'f8111111-1111-4111-8111-111111111152') $$,
  '55000', null,
  'T-EXE-IMP-36 a commit in progress does not continue in another zone');

select is(
  execution.stage_history_import(
    '019ef800-0000-7000-8000-000000000003', 'hevy_csv', 1, 'test_strength', 'America/Bogota',
    decode(repeat('c3', 32), 'hex'), pg_temp.many('c', 30, '2025-01-01'), '[]'::jsonb,
    'f8111111-1111-4111-8111-111111111154', '019ef800-0000-7000-8000-000000000154',
    decode(repeat('c4', 32), 'hex'))->>'id',
  '019ef800-0000-7000-8000-000000000150',
  'T-EXE-IMP-37 the same file while it commits lands on the import in progress');

-- The names were resolved when the commit began: neither a later change of mind nor the
-- last call's empty choices split it.
reset role;
update execution.person_movement_choices set movement_id = null
where person_id = '019ef800-0000-7000-8000-000000000003';
set local role allfit_owner;

select pg_temp.long('019ef800-0000-7000-8000-000000000150', 'America/Bogota', '[]',
  'f8111111-1111-4111-8111-111111111155') as last_call \gset

select is(
  (select jsonb_build_array(:'last_call'::jsonb->>'status', (:'last_call'::jsonb->>'imported_count')::integer,
                            :'last_call'::jsonb->'pending_count', :'last_call'::jsonb->'committed_at' is not null,
                            pg_temp.theirs(),
                            (select count(*)::integer from execution.history_import_sessions
                             where import_id = '019ef800-0000-7000-8000-000000000150'))),
  '["committed",30,null,true,30,0]'::jsonb,
  'T-EXE-IMP-38 the call that takes the last session closes the import');

select is(
  (select array_agg(distinct coalesce(item.movement_id::text, 'none'))
   from execution.session_exercises as item
   join execution.imported_sessions as imported on imported.executed_session_id = item.executed_session_id
   where imported.import_id = '019ef800-0000-7000-8000-000000000150'),
  array['019ef800-0000-7000-8000-0000000000a1'],
  'T-EXE-IMP-39 every call writes the names as the first one resolved them');

select execution.stage_history_import(
  '019ef800-0000-7000-8000-000000000003', 'hevy_csv', 1, 'test_strength', 'America/Bogota',
  decode(repeat('d4', 32), 'hex'), pg_temp.many('d', 30, '2024-01-01'), '[]'::jsonb,
  'f8111111-1111-4111-8111-111111111160', '019ef800-0000-7000-8000-000000000160',
  decode(repeat('d4', 32), 'hex')) \gset
select pg_temp.long('019ef800-0000-7000-8000-000000000160', 'America/Bogota', '[]',
  'f8111111-1111-4111-8111-111111111161') \gset
select execution.undo_history_import(
  '019ef800-0000-7000-8000-000000000003', '019ef800-0000-7000-8000-000000000160',
  'f8111111-1111-4111-8111-111111111162', extensions.uuid_generate_v7(), decode(repeat('62', 32), 'hex')) \gset

select is(
  (select jsonb_build_array(
     (select status from execution.history_imports where id = '019ef800-0000-7000-8000-000000000160'),
     pg_temp.theirs(),
     (select count(*)::integer from execution.history_import_sessions
      where import_id = '019ef800-0000-7000-8000-000000000160'),
     (select count(*)::integer from execution.executed_sessions as session
      join execution.imported_sessions as imported on imported.executed_session_id = session.id
      where imported.import_id = '019ef800-0000-7000-8000-000000000160'
        and session.annulment_reason = 'import_undone'))),
  '["undone",30,0,25]'::jsonb,
  'T-EXE-IMP-40 a commit left half way is undone whole: what entered is annulled, the rest dropped');

select set_config('app.actor_person_id', '019ef800-0000-7000-8000-000000000001', true);

-- ———————————————————————————————————————— expiry and privileges

reset role;
update execution.history_imports set created_at = clock_timestamp() - interval '8 days'
where id = '019ef800-0000-7000-8000-000000000141';
set local role allfit_owner;

select throws_ok(
  $$ select execution.commit_history_import('019ef800-0000-7000-8000-000000000001',
       '019ef800-0000-7000-8000-000000000141', 'America/Bogota', '[]'::jsonb,
       'f8111111-1111-4111-8111-111111111142', extensions.uuid_generate_v7(), decode(repeat('42', 32), 'hex')) $$,
  '55000', null,
  'T-EXE-IMP-31 an import left waiting more than seven days has expired');

reset role;
select is(
  (select array_agg(has_function_privilege('allfit_api', signature, 'execute')::text || '/'
                    || has_function_privilege('public', signature, 'execute')::text order by signature)
   from unnest(array[
     'execution.stage_history_import(uuid, text, integer, text, text, bytea, jsonb, jsonb, uuid, uuid, bytea)',
     'execution.commit_history_import(uuid, uuid, text, jsonb, uuid, uuid, bytea)',
     'execution.undo_history_import(uuid, uuid, uuid, uuid, bytea)',
     'execution.list_history_imports(uuid)',
     'execution.read_history_import(uuid, uuid)']) as signature),
  array['true/false', 'true/false', 'true/false', 'true/false', 'true/false'],
  'T-EXE-IMP-32 the API runs the five commands and reads; the public runs none');

select * from finish();
rollback;
