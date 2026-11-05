-- A suspended gym pauses the program it assigned — `HU-BO-016` c3.
--
-- Suspending a gym opens one `planning.service_access_blocks` row per client, with
-- `blocks_future_sessions`, and nothing read it: the programs the gym had already
-- assigned went on as if nothing had happened. As decided:
--
-- * **While the gym is suspended**, every session of a program it assigned is shown
--   paused and does not start, repeats included. Her own programs are untouched.
-- * **Once it is lifted**, the program resumes on its own dates. The days that passed
--   while it lasted stay missed — «el gimnasio estaba suspendido» — and do not start
--   later. What she had already trained on those days stays trained.
--
-- **Nothing is written to a session.** `20261018130000` settled that a block is a cause
-- and every projection derives from the open causes; pausing by rewriting `status`
-- would need a snapshot to undo, and a session cancelled meanwhile would come back.
-- `planning.organization_suspension_of` derives the pause from the blocks at read time,
-- and closing a block leaves only the period it covered. Days are counted in the
-- session's own zone: the day it was suspended is missed whole, the day it was lifted is
-- available whole.
--
-- **Only a gym's suspension.** A subscription suspended for non-payment also carries
-- `blocks_future_sessions`, but what Space says about it was not decided, so it is left
-- out on purpose rather than shown with a message about a suspended gym.
--
-- Restated from the definitions in force with those lines alone: `read_week_plan` says it
-- per session, `read_today_session` says it and stops offering a missed day, and
-- `start_planned_session_attempt` refuses both. `read_today_session` gains a column, so
-- it is dropped and created again with its grant.

set lock_timeout = '5s';
set statement_timeout = '60s';

-- Read through the session's owner: every caller is a definer function acting for her,
-- and the blocks, the session and the assignment are all visible to her.
create function planning.organization_suspension_of(p_planned_session_id uuid)
returns text
language sql
stable
set search_path = pg_catalog
as $function$
  select case
           when bool_or(block.ended_at is null) then 'paused'
           when count(*) > 0 then 'missed'
         end
  from planning.planned_sessions as session
  join planning.program_assignments as assignment
    on assignment.id = session.assignment_id
  join planning.service_access_blocks as block
    on block.relationship_id = assignment.origin_relationship_id
   and block.person_id = session.person_id
   and block.source_kind = 'organization_suspension'
   and block.blocks_future_sessions
  where session.id = p_planned_session_id
    -- Once the program is hers, the gym's state no longer reaches it.
    and assignment.lifecycle = 'active'
    and (
      block.ended_at is null
      or (
        session.status = 'scheduled'
        and (session.scheduled_at at time zone session.timezone)::date
            >= (block.started_at at time zone session.timezone)::date
        and (session.scheduled_at at time zone session.timezone)::date
            < (block.ended_at at time zone session.timezone)::date
      )
    )
$function$;

alter function planning.organization_suspension_of(uuid) owner to allfit_owner;
revoke all on function planning.organization_suspension_of(uuid) from public;

CREATE OR REPLACE FUNCTION planning.read_week_plan(p_person_id uuid, p_timezone text)
 RETURNS TABLE(assignment_id uuid, program_version_id uuid, program_title text, program_week integer, week_starts_on date, sessions jsonb)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
begin
  perform planning.plant_my_open_week(p_person_id, p_timezone);
  return query
  select assignment.id,
         version.id,
         version.title,
         (((clock_timestamp() at time zone p_timezone)::date
           - date_trunc('week', assignment.starts_on::timestamp)::date) / 7 + 1)::integer,
         date_trunc('week', (clock_timestamp() at time zone p_timezone))::date,
         coalesce(week.entries, '[]'::jsonb)
  from planning.program_assignments as assignment
  join planning.program_versions as version on version.id = assignment.program_version_id
  left join lateral (
    select jsonb_agg(to_jsonb(entry) order by entry.scheduled_at) as entries
    from (
      select session.id as planned_session_id,
             -- Lo que la sesión apunta, no lo que el lateral unió: son la misma fila.
             session.template_version_id,
             template_version.title as title,
             template_version.discipline_code,
             session.status,
             -- Paused while the gym that assigned it is suspended, missed for a day that
             -- passed while it was; null otherwise.
             planning.organization_suspension_of(session.id) as organization_suspension,
             session.program_day,
             session.scheduled_at,
             (select count(*)::integer from planning.planned_steps as step
               where step.template_version_id = session.template_version_id) as exercise_count,
             -- The sets she will be asked for: the program's, with her coach's adjustments.
             (select coalesce(sum((planning.effective_target(
                        session.assignment_id, step.id,
                        jsonb_build_object('target_sets', target.target_sets)
                      ) ->> 'target_sets')::integer), 0)::integer
               from planning.planned_steps as step
               join planning.strength_targets as target on target.planned_step_id = step.id
               where step.template_version_id = session.template_version_id) as set_count,
             exists (
               select 1 from execution.planned_session_executions as attempt
               join execution.executed_sessions as executed on executed.id = attempt.executed_session_id
               where attempt.planned_session_id = session.id
                 and executed.execution_status = 'completed'
             ) as done,
             (
               select attempt.executed_session_id
               from execution.planned_session_executions as attempt
               join execution.executed_sessions as executed on executed.id = attempt.executed_session_id
               where attempt.planned_session_id = session.id
                 and executed.execution_status = 'in_progress'
               order by attempt.attempt_number desc
               limit 1
             ) as open_execution_id,
             -- Por plantilla y no por sesión planificada: la última vez que se hizo
             -- **esta rutina**, la haya pedido el programa el día que la haya pedido.
             (
               select jsonb_build_object(
                        'trained_on',
                        (executed.started_at at time zone trained.timezone)::date,
                        'seconds',
                        case
                          when executed.ended_at is null then null
                          else extract(epoch from executed.ended_at - executed.started_at)::integer
                        end,
                        'sets',
                        (select count(*)::integer
                           from execution.strength_sets as recorded
                          where recorded.executed_session_id = executed.id
                            and recorded.kind <> 'warmup'),
                        'tonnage_kg',
                        (
                          select case
                            -- Nada con carga: no es que pesara cero, es que no se pesa.
                            when count(*) filter (
                              where recorded.load_value is not null
                                and recorded.achieved_reps is not null) = 0 then null
                            -- Una unidad que no resuelve como masa anula el total: sumar
                            -- lo que sí resuelve daría un número más bajo que el real.
                            when count(*) filter (
                              where recorded.load_value is not null
                                and unit.to_canonical_factor is null) > 0 then null
                            else sum(recorded.achieved_reps * recorded.load_value
                                     * unit.to_canonical_factor)
                                 filter (where recorded.load_value is not null
                                           and recorded.achieved_reps is not null)
                          end
                          from execution.strength_sets as recorded
                          left join catalog.units as unit
                            on unit.code = recorded.load_unit_code
                           and unit.dimension = 'mass'
                          where recorded.executed_session_id = executed.id
                            and recorded.kind <> 'warmup'
                        )
                      )
               from execution.planned_session_executions as attempt
               join execution.executed_sessions as executed
                 on executed.id = attempt.executed_session_id
               join planning.planned_sessions as trained
                 on trained.id = attempt.planned_session_id
               join planning.session_template_versions as trained_version
                 on trained_version.id = trained.template_version_id
               where trained_version.template_id = template_version.template_id
                 and trained.person_id = p_person_id
                 and executed.execution_status = 'completed'
                 and executed.annulled_at is null
               order by executed.started_at desc
               limit 1
             ) as last_time
      from planning.planned_sessions as session
      join planning.session_template_versions as template_version
        on template_version.id = session.template_version_id
      where session.assignment_id = assignment.id
        and session.week_starts_on
            = date_trunc('week', (clock_timestamp() at time zone p_timezone))::date
    ) as entry
  ) as week on true
  where assignment.person_id = p_person_id
    and assignment.lifecycle in ('personal', 'active')
    and access_control.actor_kind() = 'person'
    and access_control.person() = p_person_id
  order by assignment.display_order, assignment.assigned_at desc
  limit 1;
end
$function$;

drop function planning.read_today_session(uuid, text);

CREATE FUNCTION planning.read_today_session(p_person_id uuid, p_timezone text)
 RETURNS TABLE(planned_session_id uuid, assignment_id uuid, program_title text, session_title text, discipline_code text, scheduled_on date, status text, exercise_count integer, executed_session_id uuid, execution_status text, organization_suspension text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
begin
  perform planning.plant_my_open_week(p_person_id, p_timezone);
  return query
  select session.id,
         session.assignment_id,
         version.title,
         template_version.title,
         template_version.discipline_code,
         (session.scheduled_at at time zone session.timezone)::date,
         session.status,
         (select count(*)::integer from planning.planned_steps as step
           where step.template_version_id = session.template_version_id),
         open_attempt.executed_session_id,
         open_attempt.execution_status::text,
         planning.organization_suspension_of(session.id)
  from planning.planned_sessions as session
  join planning.program_assignments as assignment on assignment.id = session.assignment_id
  join planning.program_versions as version on version.id = assignment.program_version_id
  join planning.session_template_versions as template_version
    on template_version.id = session.template_version_id
  left join lateral (
    select attempt.executed_session_id, executed.execution_status
    from execution.planned_session_executions as attempt
    join execution.executed_sessions as executed on executed.id = attempt.executed_session_id
    where attempt.planned_session_id = session.id
      and executed.execution_status = 'in_progress'
    order by attempt.attempt_number desc
    limit 1
  ) as open_attempt on true
  where session.person_id = p_person_id
    -- A detached or ended program offers nothing to train.
    and assignment.lifecycle in ('personal', 'active')
    and session.week_starts_on
        = date_trunc('week', (clock_timestamp() at time zone p_timezone))::date
    -- Pending, or already open: an attempt in progress is what somebody comes back
    -- to, and offering the next one instead would strand it.
    and (session.status = 'scheduled' or open_attempt.executed_session_id is not null)
    -- A day missed while the gym was suspended does not start, so it is not offered.
    and planning.organization_suspension_of(session.id) is distinct from 'missed'
    and access_control.actor_kind() = 'person'
    and access_control.person() = p_person_id
  order by open_attempt.executed_session_id nulls last, session.scheduled_at
  limit 1;
end
$function$;

alter function planning.read_today_session(uuid, text) owner to allfit_owner;
revoke all on function planning.read_today_session(uuid, text) from public;
grant execute on function planning.read_today_session(uuid, text) to allfit_api;

CREATE OR REPLACE FUNCTION execution.start_planned_session_attempt(p_person_id uuid, p_planned_session_id uuid, p_started_at timestamp with time zone, p_timezone text, p_requested_level catalog.completeness_level, p_capture_source text, p_idempotency_key uuid, p_command_id uuid, p_request_hash bytea)
 RETURNS TABLE(id uuid, attempt_number integer, revision_number bigint, result_contract_id uuid, contract_version integer, requested_level text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  receipt record;
  planned record;
  contract record;
  next_attempt integer;
begin
  if access_control.actor_kind() <> 'person' or access_control.person() <> p_person_id then
    raise exception 'execution person does not match the authenticated actor' using errcode = '42501';
  end if;

  select * into receipt from system.begin_idempotency(
    p_person_id, 'OP-EXE-001', p_idempotency_key, p_command_id, p_request_hash
  );
  -- A replay answers the attempt that was already started, whole: the caller cannot
  -- tell a retry from the first call, which is the point of the receipt.
  if not receipt.claimed then
    return query
      select executed.id, attempt.attempt_number, executed.revision_number,
             executed.result_contract_id, executed.contract_version,
             executed.requested_level::text
      from execution.executed_sessions as executed
      join execution.planned_session_executions as attempt
        on attempt.executed_session_id = executed.id
      where executed.id = receipt.aggregate_id;
    return;
  end if;

  select session.id, session.template_version_id, session.status
  into planned
  from planning.planned_sessions as session
  where session.id = p_planned_session_id and session.person_id = p_person_id
  for update;
  if planned.id is null then
    raise exception 'planned session is not this person''s' using errcode = '42501';
  end if;
  -- Cancelled and paused are refusals; completed is not. Somebody who wants to do
  -- their push day twice has done it twice, and the history should say so.
  if planned.status in ('cancelled', 'paused') then
    raise exception 'planned session is not open' using errcode = '23514';
  end if;
  -- Nothing of a suspended gym's program starts, repeats included, and a day that
  -- passed while it was suspended does not start later.
  if planning.organization_suspension_of(p_planned_session_id) is not null then
    raise exception 'planned session is paused by its gym''s suspension' using errcode = '23514';
  end if;

  -- The contract is frozen onto the execution: what a result means must not change
  -- underneath a session somebody already recorded.
  select version.activity_type_id,
         association.result_contract_id,
         published.version_number
  into contract
  from planning.session_template_versions as version
  join catalog.activity_type_result_contracts as association
    on association.activity_type_id = version.activity_type_id
   and association.is_default
   and association.valid_from <= clock_timestamp()
   and (association.valid_to is null or association.valid_to > clock_timestamp())
  join catalog.result_contracts as published on published.id = association.result_contract_id
  where version.id = planned.template_version_id;
  if contract.result_contract_id is null then
    raise exception 'session template has no result contract' using errcode = '23514';
  end if;

  insert into execution.executed_sessions (
    id, person_id, activity_type_id, result_contract_id, contract_version,
    started_at, timezone, requested_level, capture_source
  ) values (
    p_command_id, p_person_id, contract.activity_type_id, contract.result_contract_id,
    contract.version_number, p_started_at, p_timezone, p_requested_level, p_capture_source
  );

  select coalesce(max(attempt.attempt_number), 0) + 1 into next_attempt
  from execution.planned_session_executions as attempt
  where attempt.planned_session_id = p_planned_session_id;

  insert into execution.planned_session_executions (
    planned_session_id, executed_session_id, person_id, attempt_number
  ) values (p_planned_session_id, p_command_id, p_person_id, next_attempt);

  -- The session starts as a copy of its routine, supersets and rest included; from here
  -- on it is the session's own list, and the plan does not decide it again (ADR-034/035).
  insert into execution.session_exercises (
    executed_session_id, position, movement_id, planned_step_id, superset_group, rest_seconds
  )
  select p_command_id, row_number() over (order by step.position), step.movement_id,
         step.id, step.superset_group, target.target_rest_seconds
  from planning.planned_steps as step
  left join planning.strength_targets as target on target.planned_step_id = step.id
  where step.template_version_id = planned.template_version_id;

  perform system.finish_idempotency(
    receipt.receipt_id, 201::smallint, 'attempt-started', 'executed_session', p_command_id
  );

  return query
    select p_command_id, next_attempt, 0::bigint, contract.result_contract_id,
           contract.version_number, p_requested_level::text;
end
$function$;
