-- An administrator opens their own break-glass window (ADR-046 decision 2).
--
-- **Two administrators could not open one.** A restricted window (body, health, nutrition
-- intake) needed two approvers besides the requester, which two administrators never are,
-- and a standard one waited on the other administrator. Windows lasted 15 or 30 minutes.
--
-- **Asking now opens it**, for sixty minutes whatever the tier. What protected the person
-- stays: a closed purpose and a traceable case, never over your own data, forbidden
-- categories never open, every read is evidence before content and is visible to her,
-- and somebody other than the requester and the subject reviews the window afterwards.
--
-- **The approval step is gone.** `support.decide_break_glass` (OP-SUP-002) is dropped; the
-- approvals already recorded stay, because `support.break_glass_approvals` is append-only.
-- Requests asked for before keep the quorum and length they were asked with, so the
-- derived check accepts those two shapes too; one still pending simply expires. The tray
-- stops offering `viewer_can_decide`.

set lock_timeout = '5s';
set statement_timeout = '60s';

create or replace function support.break_glass_required_approvals(p_tier support.break_glass_tier)
returns smallint
language sql
immutable
set search_path = pg_catalog
as $function$
  select 0::smallint
$function$;

create or replace function support.break_glass_duration_minutes(p_tier support.break_glass_tier)
returns smallint
language sql
immutable
set search_path = pg_catalog
as $function$
  select 60::smallint
$function$;

alter table support.break_glass_requests
  drop constraint ck_break_glass_requests_derived,
  add constraint ck_break_glass_requests_derived check (
    (
      required_approvals = support.break_glass_required_approvals(sensitivity_tier)
      and requested_duration_minutes = support.break_glass_duration_minutes(sensitivity_tier)
    )
    -- The two shapes asked for before ADR-046, which those rows keep for ever.
    or (sensitivity_tier = 'standard' and required_approvals = 1 and requested_duration_minutes = 30)
    or (sensitivity_tier = 'restricted' and required_approvals = 2 and requested_duration_minutes = 15)
  );

drop function support.decide_break_glass(uuid, uuid, uuid, text, text, uuid, uuid, bytea);

-- `20260910160200`'s projection without `viewer_can_decide`: nobody decides any more.
create or replace function support.break_glass_viewer_projection(
  p_request_id uuid,
  p_viewer_person_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog
as $function$
  select support.break_glass_request_projection(file.id) || jsonb_build_object(
    'viewer_is_requester', file.requester_person_id = p_viewer_person_id,
    'viewer_can_exercise',
      support.effective_break_glass_status(
        file.status, file.request_expires_at, file.window_ends_at
      ) = 'approved'
      and file.requester_person_id = p_viewer_person_id
  )
  from support.break_glass_requests as file
  where file.id = p_request_id
$function$;

-- `20260910160000`'s body; the request is inserted open.
create or replace function support.request_break_glass(
  p_actor_person_id uuid,
  p_actor_session_id uuid,
  p_subject_person_id uuid,
  p_categories text[],
  p_purpose text,
  p_case_reference text,
  p_idempotency_key uuid,
  p_command_id uuid,
  p_request_hash bytea
)
returns table (result jsonb, replayed boolean)
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  receipt record;
  duty_id uuid;
  tier support.break_glass_tier;
  request_id uuid;
  requested timestamptz := clock_timestamp();
  closes timestamptz;
  response jsonb;
begin
  duty_id := support.require_break_glass_duty(
    p_actor_person_id, p_actor_session_id, 'request_break_glass'
  );

  if p_actor_person_id = p_subject_person_id then
    raise exception 'a break-glass window is never opened over your own data'
      using errcode = '42501';
  end if;
  if not exists (
    select 1 from identity.people as person where person.id = p_subject_person_id
  ) then
    raise exception 'subject not found' using errcode = 'P0002';
  end if;

  -- Raises for a forbidden category before anything is written, so the tier is
  -- computed and the refusal happens in the same step.
  tier := support.break_glass_scope_tier(p_categories);

  select * into receipt
  from system.begin_idempotency(
    p_actor_person_id, 'backoffice'::system.command_surface, 'backoffice',
    'OP-SUP-001', p_idempotency_key, p_command_id, p_request_hash
  );
  if not receipt.claimed then
    select support.break_glass_request_projection(receipt.aggregate_id) into response;
    if response is null then
      raise exception 'idempotent break-glass request not found' using errcode = '40001';
    end if;
    return query select response, true;
    return;
  end if;

  -- Asking is opening: there is nobody else to wait for (ADR-046 decision 2).
  closes := requested + make_interval(mins => support.break_glass_duration_minutes(tier));
  insert into support.break_glass_requests (
    requester_person_id, requester_duty_assignment_id, subject_person_id,
    categories, purpose, case_reference, sensitivity_tier, required_approvals,
    requested_duration_minutes, requested_at, request_expires_at, status,
    window_starts_at, window_ends_at
  ) values (
    p_actor_person_id, duty_id, p_subject_person_id,
    p_categories, p_purpose::support.break_glass_purpose, btrim(p_case_reference), tier,
    support.break_glass_required_approvals(tier),
    support.break_glass_duration_minutes(tier),
    requested, requested + interval '30 minutes', 'approved', requested, closes
  )
  returning id into request_id;

  perform system.enqueue_outbox_event(
    'break_glass_request', request_id, 'support.break_glass_requested.v1',
    jsonb_build_object(
      'request_id', request_id,
      'subject_person_id', p_subject_person_id,
      'sensitivity_tier', tier,
      'required_approvals', support.break_glass_required_approvals(tier)
    )
  );
  perform system.enqueue_outbox_event(
    'break_glass_request', request_id, 'support.break_glass_window_opened.v1',
    jsonb_build_object(
      'request_id', request_id, 'window_starts_at', requested, 'window_ends_at', closes
    )
  );

  response := support.break_glass_request_projection(request_id);
  perform system.finish_idempotency(
    receipt.receipt_id, 201::smallint, 'break-glass-requested',
    'break_glass_request', request_id
  );
  return query select response, false;
end
$function$;
