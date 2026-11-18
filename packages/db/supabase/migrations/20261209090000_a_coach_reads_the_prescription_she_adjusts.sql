-- OP-PLN-037 (HU-STUDIO-049): the coach reads what the version she assigned asks for,
-- step by step, with the id an adjustment names.
--
-- OP-PLN-013 takes a `planned_step_id` and no read of Studio gave one. A published
-- routine is read without the ids of its steps, and OP-PLN-018 names a step only once it
-- carries an adjustment, so the first adjustment had no id to send. The id was always in
-- `planning.planned_steps`; this is the read that hands it over, where the coach adjusts.
--
-- What has to hold:
--
--   · The answer is the assigned version, never the newest one: each routine the program
--     composes, once, with its steps as they were published and, on each step, the
--     adjustments in force (the latest of each kind). A step is not rewritten by what was
--     adjusted: Space trains the merged target, Studio reads both halves.
--   · Who: the coach who attends the person, holder or accepted cover (A3, A7), with her
--     training shared at `read`. They are the people and the grant of OP-PLN-018, which
--     is where the assignment id comes from. An administrator or an owner who does not
--     attend her does not find it.
--   · It is her training, so the read is logged before anything is returned, under the
--     resource OP-PLN-018 logs, and a read that cannot be traced does not happen.
--   · It follows the relationship, not the management period. A program the gym stopped
--     managing, or cancelled, is still read while the relationship lasts, and stops
--     being visible when it ends.
--
-- **Finding the assignment.** The path names the assignment, not the relationship, so the
-- read first resolves which relationship it belongs to through the
-- `assignment_administration` contract scope, as the commands do, and then applies the
-- formula of OP-PLN-018 to it. That lets a missing grant answer `scope-required` rather
-- than `not-found`. An assignment of another organization, a personal one and one the
-- caller does not attend answer as if they did not exist.
--
-- No table, policy or grant on a table changes. The functions read under the policies
-- that already show the attending coach the assignment, its adjustments and the gym's
-- own content.
set lock_timeout = '5s';
set statement_timeout = '60s';

begin;

/*
 * One routine of an assigned version: its steps as published, each with its id and the
 * adjustments in force for this assignment. `AssignmentPrescriptionRoutine` in the contract.
 */
create function planning.assigned_routine_item(p_assignment_id uuid, p_template_version_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog
as $function$
  select jsonb_build_object(
    'template_version_id', version.published->'id',
    'title', version.published->'title',
    'steps', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'planned_step_id', step.id,
          'step', content.value,
          'adjustments', coalesce((
            select jsonb_agg(planning.prescription_revision_document(latest.id)
                             order by latest.override_kind)
            from (
              select distinct on (revision.override_kind) revision.id, revision.override_kind
              from planning.prescription_revisions as revision
              where revision.assignment_id = p_assignment_id
                and revision.planned_step_id = step.id
              order by revision.override_kind, revision.created_at desc, revision.id desc
            ) as latest
          ), '[]'::jsonb)
        ) order by step.position
      )
      -- The published projection, so a step reads here exactly as its routine reads.
      from jsonb_array_elements(version.published->'steps') as content (value)
      join planning.planned_steps as step
        on step.template_version_id = p_template_version_id
       and step.position = (content.value->>'position')::integer
    ), '[]'::jsonb)
  )
  from (
    select planning.session_version_projection(p_template_version_id) as published
  ) as version
  where version.published is not null
$function$;

alter function planning.assigned_routine_item(uuid, uuid) owner to allfit_owner;
revoke all on function planning.assigned_routine_item(uuid, uuid) from public, allfit_api;

-- Logged before anything is returned; a read that cannot be traced does not happen.
create function planning.read_assignment_prescription(
  p_person_id uuid,
  p_organization_id uuid,
  p_assignment_id uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog
as $function$
declare
  previous_purpose text := current_setting('app.contract_scope_purpose', true);
  previous_id text := current_setting('app.contract_scope_id', true);
  previous_token text := current_setting('app.contract_scope_token', true);
  origin_id uuid;
  subject_id uuid;
  version_id uuid;
  shared record;
  document jsonb;
begin
  perform access_control.open_contract_scope('assignment_administration', p_assignment_id);
  select assignment.origin_relationship_id, assignment.person_id, assignment.program_version_id
    into origin_id, subject_id, version_id
  from planning.program_assignments as assignment
  where assignment.id = p_assignment_id;
  perform planning.resume_contract_scope(previous_purpose, previous_id, previous_token);

  -- The lookup answers nothing by itself: the guard refuses an outsider whatever the id,
  -- and no relationship (a personal or unknown assignment) is one nobody attends.
  perform planning.require_effective_coach(p_person_id, p_organization_id, origin_id, null);
  select * into shared from planning.require_training_grant(origin_id, 'read');

  -- The trace refuses a request without an id (`22023`), so nothing is built unlogged.
  perform set_config('app.purpose', 'studio_relationship_training', true);
  perform privacy.log_access_event(
    subject_id, null, origin_id, shared.grant_id, null,
    'relationship_training', shared.scope_version, 'live', 'planning.program_assignments', 'allowed'
  );

  select jsonb_build_object(
    'assignment_id', p_assignment_id,
    'program_version_id', version_id,
    'routines', coalesce(
      jsonb_agg(planning.assigned_routine_item(p_assignment_id, routine.template_version_id)
                order by routine.first_position),
      '[]'::jsonb
    )
  )
  into document
  from (
    select composed.template_version_id, min(composed.position) as first_position
    from planning.program_version_sessions as composed
    where composed.program_version_id = version_id
    group by composed.template_version_id
  ) as routine;

  return document;
end
$function$;

alter function planning.read_assignment_prescription(uuid, uuid, uuid) owner to allfit_owner;
revoke all on function planning.read_assignment_prescription(uuid, uuid, uuid) from public;
grant execute on function planning.read_assignment_prescription(uuid, uuid, uuid) to allfit_api;

commit;
