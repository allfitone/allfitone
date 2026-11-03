-- Writing a session's sets asks the Backoffice question once, not twice per set
-- (T-EXE-PHY-01).
--
-- `executed_sessions_select_platform_metrics` admits a Backoffice reader holding the
-- metrics duty through a security definer lookup. Every statement that touches a set
-- checks its session through that table, and `execution.write_session_results` wrote
-- strength sets one by one: a select for the owning exercise and an insert per set,
-- each evaluating the lookup again. A 340-session import asked it ~21,000 times, about
-- 11 of the ~15 seconds its commit took. Every finished session paid the same per set.
--
-- Two changes, neither about who may read what:
--
-- - The policy calls the function as a scalar subquery, which PostgreSQL plans as an
--   InitPlan: evaluated once per statement instead of once per row. Same function,
--   same answer; T-SUP-BIZ-01 and T-SUP-RLS-01/02 keep proving the Backoffice reader.
-- - Strength sets are written in one statement. The owning exercise is resolved by the
--   same two rules, and a payload is refused with the same error the loop raised first:
--   the earliest entry that is either of an unknown family or names a missing exercise.
--   Endurance, interval and mobility results keep the loop; they are few per session.
--
-- The body is the one in force (20261003120000) with the strength branch lifted out.

set lock_timeout = '5s';
set statement_timeout = '60s';

alter policy executed_sessions_select_platform_metrics
  on execution.executed_sessions
  using ((select access_control.counts_platform_metrics()));

create or replace function execution.write_session_results(
  p_executed_session_id uuid,
  p_results jsonb,
  p_exercises jsonb
)
returns void
language plpgsql
set search_path = pg_catalog
as $function$
declare
  entry jsonb;
  first_unknown bigint;
  first_orphan bigint;
begin
  -- Replaced whole, so there is never a half-applied session.
  delete from execution.strength_sets where executed_session_id = p_executed_session_id;
  delete from execution.endurance_laps where executed_session_id = p_executed_session_id;
  delete from execution.interval_results where executed_session_id = p_executed_session_id;
  delete from execution.round_results where executed_session_id = p_executed_session_id;
  delete from execution.mobility_results where executed_session_id = p_executed_session_id;

  -- The exercise list travels with the sets and is replaced with them. Without one, an
  -- older client keeps the list the session already has.
  if p_exercises is not null then
    -- IX-50: a superset is contiguous, as it is in the plan (IX-46).
    if exists (
      select 1
      from jsonb_array_elements(p_exercises) as item
      where nullif(item->>'superset_group', '') is not null
      group by (item->>'superset_group')::smallint
      having max((item->>'position')::integer) - min((item->>'position')::integer) + 1 <> count(*)
    ) then
      raise exception 'a superset has to be contiguous' using errcode = '23514';
    end if;

    delete from execution.session_exercises where executed_session_id = p_executed_session_id;
    insert into execution.session_exercises (
      executed_session_id, position, movement_id, planned_step_id, superset_group, rest_seconds
    )
    select p_executed_session_id, (item->>'position')::integer,
           nullif(item->>'movement_id', '')::uuid, nullif(item->>'planned_step_id', '')::uuid,
           nullif(item->>'superset_group', '')::smallint,
           nullif(item->>'rest_seconds', '')::integer
    from jsonb_array_elements(p_exercises) as item;
  end if;

  -- The loop stopped at the first bad entry; the earliest of either fault wins here too.
  select min(item.ordinal) filter (
           where item.value->>'family' is null
              or item.value->>'family' not in ('strength', 'endurance', 'interval', 'mobility')),
         min(item.ordinal) filter (
           where item.value->>'family' = 'strength'
             and nullif(item.value->>'exercise_position', '') is not null
             and not exists (
               select 1
               from execution.session_exercises as exercise
               where exercise.executed_session_id = p_executed_session_id
                 and exercise.position = (item.value->>'exercise_position')::integer))
  into first_unknown, first_orphan
  from jsonb_array_elements(coalesce(p_results, '[]'::jsonb)) with ordinality as item(value, ordinal);

  if first_orphan is not null and (first_unknown is null or first_orphan < first_unknown) then
    raise exception 'set belongs to no exercise of this session' using errcode = '23514';
  end if;
  if first_unknown is not null then
    raise exception 'unknown result family' using errcode = '22023';
  end if;

  -- The set belongs to the exercise at its position; an older client that does not say
  -- lands on the first exercise of the same movement.
  insert into execution.strength_sets (
    executed_session_id, movement_id, set_order, achieved_reps,
    load_value, load_unit_code, rpe, kind, session_exercise_id
  )
  select p_executed_session_id,
         nullif(item.value->>'movement_id', '')::uuid,
         (item.value->>'set_order')::integer,
         nullif(item.value->>'achieved_reps', '')::integer,
         nullif(item.value->>'load_value', '')::numeric,
         nullif(item.value->>'load_unit_code', ''),
         nullif(item.value->>'rpe', '')::numeric,
         coalesce(nullif(item.value->>'kind', ''), 'normal')::planning.set_kind,
         owner.id
  from jsonb_array_elements(coalesce(p_results, '[]'::jsonb)) with ordinality as item(value, ordinal)
  left join lateral (
    select exercise.id
    from execution.session_exercises as exercise
    where exercise.executed_session_id = p_executed_session_id
      and case
            when nullif(item.value->>'exercise_position', '') is not null
              then exercise.position = (item.value->>'exercise_position')::integer
            else exercise.movement_id is not distinct from nullif(item.value->>'movement_id', '')::uuid
          end
    order by exercise.position
    limit 1
  ) as owner on true
  where item.value->>'family' = 'strength'
  order by item.ordinal;

  for entry in
    select value from jsonb_array_elements(coalesce(p_results, '[]'::jsonb))
    where value->>'family' <> 'strength'
  loop
    case entry->>'family'
      when 'endurance' then
        insert into execution.endurance_laps (
          executed_session_id, lap_number, distance_value, distance_unit_code, duration_seconds
        ) values (
          p_executed_session_id,
          (entry->>'lap_number')::integer,
          (entry->>'distance_value')::numeric,
          entry->>'distance_unit_code',
          (entry->>'duration_seconds')::numeric
        );
      when 'interval' then
        insert into execution.interval_results (
          executed_session_id, interval_number, work_duration_seconds,
          rest_duration_seconds, achieved_repetitions, completed
        ) values (
          p_executed_session_id,
          (entry->>'interval_number')::integer,
          (entry->>'work_duration_seconds')::numeric,
          nullif(entry->>'rest_duration_seconds', '')::numeric,
          nullif(entry->>'achieved_repetitions', '')::integer,
          coalesce((entry->>'completed')::boolean, true)
        );
      when 'mobility' then
        insert into execution.mobility_results (
          executed_session_id, sequence_position, movement_id, side,
          hold_duration_seconds, completed_repetitions
        ) values (
          p_executed_session_id,
          (entry->>'sequence_position')::integer,
          nullif(entry->>'movement_id', '')::uuid,
          coalesce(nullif(entry->>'side', ''), 'not_applicable'),
          nullif(entry->>'hold_duration_seconds', '')::numeric,
          nullif(entry->>'completed_repetitions', '')::integer
        );
    end case;
  end loop;
end
$function$;
