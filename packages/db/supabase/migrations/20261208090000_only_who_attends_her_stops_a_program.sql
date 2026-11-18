-- OP-PLN-014 (HU-STUDIO-050): only who attends the person stops her program.
--
-- The command let an administrator or an owner cancel a program without attending the
-- person: `manage_relationships` stood in for attending her. No read of Studio ever gave
-- them the assignment to name. OP-PLN-018 answers only who holds or covers the
-- relationship, and no other read returns an assignment id, so the permission could not
-- be exercised from any screen. Giving it a screen meant showing her training to somebody
-- who does not attend her. It was decided the other way on 2026-11-17 (TECH-330): stopping
-- a program is training, and training is for who attends her.
--
-- What has to hold:
--
--   · The coach who attends her, holder or accepted cover (A3, A7), cancels, with her
--     training shared at `contribute`. Everything else the command does is unchanged.
--   · An administrator or an owner who does not coach is refused (`42501`), as moving a
--     session and adjusting a prescription already refuse them. One who coaches, but not
--     her, does not find the assignment (`P0002`).
--   · A gym whose coach left reassigns the relationship (OP-REL-003) and the new holder
--     decides. Ending the relationship still detaches every program it gave.
--
-- `planning.authorize_managed_assignment` keeps its `p_administrators` argument: dropping
-- it would mean recreating the three commands that call it, and no command passes `true`
-- any more. The body below is the one of 20261105090000 with that one argument changed.
set lock_timeout = '5s';
set statement_timeout = '60s';

begin;

create or replace function planning.cancel_managed_assignment(
  p_person_id uuid,
  p_organization_id uuid,
  p_assignment_id uuid,
  p_idempotency_key uuid,
  p_command_id uuid,
  p_request_hash bytea
)
returns table (result jsonb, replayed boolean)
language plpgsql
volatile
security definer
set search_path = pg_catalog
as $function$
declare
  previous_purpose text := current_setting('app.contract_scope_purpose', true);
  previous_id text := current_setting('app.contract_scope_id', true);
  previous_token text := current_setting('app.contract_scope_token', true);
  actor record;
  receipt record;
  relationship_status text;
  current_lifecycle planning.assignment_lifecycle;
  cancelled_at timestamptz;
  cancelled integer;
  document jsonb;
begin
  select * into actor from planning.authorize_managed_assignment(
    p_person_id, p_organization_id, p_assignment_id, null, false
  );

  select * into receipt from system.begin_idempotency(
    p_person_id, 'OP-PLN-014', p_idempotency_key, p_command_id, p_request_hash
  );

  select relationship.status into relationship_status
  from relationships.service_relationships as relationship
  where relationship.id = actor.relationship_id
  for share;
  perform pg_advisory_xact_lock(hashtextextended(actor.assignment_id::text, 0::bigint));

  perform access_control.open_contract_scope('assignment_administration', p_assignment_id);

  if not receipt.claimed then
    document := planning.cancellation_document(p_assignment_id);
    perform planning.resume_contract_scope(previous_purpose, previous_id, previous_token);
    return query select document, true;
    return;
  end if;

  select assignment.lifecycle into current_lifecycle
  from planning.program_assignments as assignment
  where assignment.id = p_assignment_id;

  -- Already cancelled: the same answer again, nothing written twice.
  document := planning.cancellation_document(p_assignment_id);
  if current_lifecycle = 'ended' and document is not null then
    perform planning.resume_contract_scope(previous_purpose, previous_id, previous_token);
    perform system.finish_idempotency(
      receipt.receipt_id, 200::smallint, 'program-assignment-cancelled', 'program_assignment',
      p_assignment_id
    );
    return query select document, false;
    return;
  end if;

  if relationship_status is distinct from 'active' or not planning.is_managed(p_assignment_id) then
    perform planning.resume_contract_scope(previous_purpose, previous_id, previous_token);
    raise exception 'the organization no longer manages this program' using errcode = '55000';
  end if;

  cancelled_at := clock_timestamp();

  update planning.assignment_management_periods as period
  set ended_at = greatest(cancelled_at, period.started_at),
      end_reason = 'cancelled'
  where period.assignment_id = p_assignment_id
    and period.ended_at is null;

  update planning.program_assignments as assignment
  set lifecycle = 'ended'
  where assignment.id = p_assignment_id;

  -- Locked on their own, so the cancellation below sees a session that just started.
  perform 1
  from planning.planned_sessions as waiting
  where waiting.assignment_id = p_assignment_id
    and waiting.status in ('scheduled', 'paused')
  for update;

  update planning.planned_sessions as waiting
  set status = 'cancelled'
  where waiting.assignment_id = p_assignment_id
    and waiting.status in ('scheduled', 'paused')
    and (waiting.scheduled_at at time zone waiting.timezone)::date
        >= (cancelled_at at time zone waiting.timezone)::date
    and not exists (
      select 1 from execution.planned_session_executions as attempt
      where attempt.planned_session_id = waiting.id
    );
  get diagnostics cancelled = row_count;

  perform system.enqueue_outbox_event(
    'program_assignment', p_assignment_id, 'planning.assignment_cancelled.v1',
    jsonb_build_object(
      'assignment_id', p_assignment_id,
      'person_id', actor.subject_person_id,
      'relationship_id', actor.relationship_id,
      'cancelled_at', cancelled_at,
      'sessions_cancelled', cancelled
    )
  );

  document := planning.cancellation_document(p_assignment_id);
  perform planning.resume_contract_scope(previous_purpose, previous_id, previous_token);

  perform system.finish_idempotency(
    receipt.receipt_id, 200::smallint, 'program-assignment-cancelled', 'program_assignment',
    p_assignment_id
  );
  return query select document, false;
end
$function$;

commit;
