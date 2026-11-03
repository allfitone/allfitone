-- T-EXE-PHY-01 — writing sets does not ask the Backoffice question once per set.
--
-- `executed_sessions_select_platform_metrics` asks whether the reader holds the metrics
-- duty, a security definer lookup. Every set written checks its session through that
-- table, so with the call evaluated per row a 340-session import asked it ~21,000 times
-- (~11 of its ~15 s). Wrapped as an InitPlan it is asked once per statement, so two
-- sessions that differ only in how many sets they have ask it the same number of times.
--
-- Written before the change and watched failing (2 sets against 40 asked differently).

begin;

select plan(3);

set local track_functions = 'all';

insert into identity.people (id, given_name, family_name)
values ('019ef900-0000-7000-8000-000000000001', 'Muchas', 'Series');

select set_config('app.actor_kind', 'person', true);
select set_config('app.actor_person_id', '019ef900-0000-7000-8000-000000000001', true);

-- One session of one exercise with `p_sets` sets, staged and committed as its own import.
create function pg_temp.import_one(p_sets integer, p_tag text)
returns void
language plpgsql
as $fn$
declare
  staged jsonb;
begin
  staged := execution.stage_history_import(
    '019ef900-0000-7000-8000-000000000001', 'hevy_csv', 1, 'test_strength', 'America/Bogota',
    decode(repeat(p_tag, 32), 'hex'),
    jsonb_build_array(jsonb_build_object(
      'fingerprint', repeat(p_tag, 32), 'title', 'Day ' || p_tag,
      'started_local', '2026-02-0' || length(p_tag)::text || 'T09:00',
      'ended_local', '2026-02-0' || length(p_tag)::text || 'T10:00', 'description', null,
      'exercises', jsonb_build_array(jsonb_build_object(
        'position', 1, 'source_name', 'Mystery Move', 'note', null, 'superset_group', null,
        'sets', (select jsonb_agg(jsonb_build_object(
                   'order', n, 'kind', 'normal', 'load_kg', 50, 'reps', 5, 'rpe', null))
                 from generate_series(1, p_sets) as n))))),
    '[]'::jsonb, extensions.uuid_generate_v7(), extensions.uuid_generate_v7(),
    decode(repeat(p_tag, 32), 'hex'));
  perform execution.commit_history_import(
    '019ef900-0000-7000-8000-000000000001', (staged->>'id')::uuid, 'America/Bogota', '[]'::jsonb,
    extensions.uuid_generate_v7(), extensions.uuid_generate_v7(), decode(repeat(p_tag, 32), 'hex'));
end
$fn$;

-- How often this transaction has asked the Backoffice question so far.
create function pg_temp.asked()
returns bigint
language sql
as $fn$
  select coalesce(sum(calls), 0)::bigint from pg_catalog.pg_stat_xact_user_functions
  where schemaname = 'access_control' and funcname = 'holds_backoffice_duty'
$fn$;

create temporary table asked_for (sets integer primary key, calls bigint);

do $$
declare
  before bigint;
begin
  before := pg_temp.asked();
  perform pg_temp.import_one(2, 'a1');
  insert into asked_for values (2, pg_temp.asked() - before);
  before := pg_temp.asked();
  perform pg_temp.import_one(40, 'b2');
  insert into asked_for values (40, pg_temp.asked() - before);
end
$$;

select is(
  (select count(*)::integer from execution.executed_sessions
   where person_id = '019ef900-0000-7000-8000-000000000001' and annulled_at is null),
  2,
  'both sessions were written'
);

select is(
  (select count(*)::integer from execution.strength_sets as strength_set
   join execution.executed_sessions as session on session.id = strength_set.executed_session_id
   where session.person_id = '019ef900-0000-7000-8000-000000000001'),
  42,
  'and all their sets'
);

select is(
  (select calls from asked_for where sets = 40),
  (select calls from asked_for where sets = 2),
  'forty sets ask whether the reader counts platform metrics as often as two do'
);

select * from finish();
rollback;
