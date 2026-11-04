-- HU-BO-008 criteria 2 and 3 — a standard window reads every recorded modality, and the
-- agenda with each programme by its name.
--
-- **Criterion 2.** `execution.session_projection` carried strength sets and endurance
-- laps. Intervals, rounds and mobility were recorded and never shown, so a session of
-- those modalities opened empty. They are added as they were recorded.
--
-- **Criterion 3, as decided.** The agenda says what is planned and from which programme,
-- by the programme's name and nothing of its content: no session titles, no exercises,
-- no gym. `20260927120000` left programme context out of support reads on purpose; the
-- name is the part the criterion needs and the least a support case can work with.
-- From two weeks back onwards, so a missed session is still visible.
--
-- Her own programmes are hers: they belong to `prior_training_history`. A gym's belong
-- to `relationship_training`, which answered that the platform held no data although
-- gyms assign programmes. It now returns the gym's agenda and the sessions trained under
-- a gym, of which none can exist yet (`ck_executed_sessions_autonomous`); its policy is
-- in place for when they do.
--
-- **Policies.** Planned sessions, assignments and programme versions force row security
-- and answered only their person or their gym. A select policy on each lets the reader
-- of a live, approved window over this person see them, the same floor
-- `executed_sessions_select_break_glass` set in `20260927140000`. The command remains the
-- gate: duty, AAL2, quorum, category and expiry, and the access record first.
--
-- The bodies of `session_projection` and `exercise_break_glass` are `20260927120000`'s
-- and `20261104100500`'s with these additions; nothing else changed.

set lock_timeout = '5s';
set statement_timeout = '60s';

-- ---------------------------------------------------------------------------
-- What a window over training may see
-- ---------------------------------------------------------------------------

create policy executed_sessions_select_break_glass_relationship
  on execution.executed_sessions
  for select
  to allfit_owner
  using (access_control.reads_under_break_glass(person_id, 'relationship_training'));

create policy planned_sessions_select_break_glass
  on planning.planned_sessions
  for select
  to allfit_owner
  using (
    access_control.reads_under_break_glass(person_id, 'relationship_training')
    or access_control.reads_under_break_glass(person_id, 'prior_training_history')
  );

create policy program_assignments_select_break_glass
  on planning.program_assignments
  for select
  to allfit_owner
  using (
    access_control.reads_under_break_glass(person_id, 'relationship_training')
    or access_control.reads_under_break_glass(person_id, 'prior_training_history')
  );

-- A version has no person; it is readable through an assignment the window can read.
create policy program_versions_select_break_glass
  on planning.program_versions
  for select
  to allfit_owner
  using (
    exists (
      select 1 from planning.program_assignments as assignment
      where assignment.program_version_id = program_versions.id
        and (
          access_control.reads_under_break_glass(assignment.person_id, 'relationship_training')
          or access_control.reads_under_break_glass(assignment.person_id, 'prior_training_history')
        )
    )
  );

-- ---------------------------------------------------------------------------
-- The agenda, by programme name
-- ---------------------------------------------------------------------------

create function support.break_glass_agenda(p_subject_person_id uuid, p_from_gym boolean)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog
as $function$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'scheduled_at', upcoming.scheduled_at,
        'timezone', upcoming.timezone,
        'status', upcoming.status,
        'program_day', upcoming.program_day,
        'program_title', upcoming.program_title,
        'from_gym', p_from_gym
      )
      order by upcoming.scheduled_at, upcoming.id
    ),
    '[]'::jsonb
  )
  from (
    select planned.id, planned.scheduled_at, planned.timezone, planned.status,
           planned.program_day, version.title as program_title
    from planning.planned_sessions as planned
    join planning.program_assignments as assignment on assignment.id = planned.assignment_id
    join planning.program_versions as version on version.id = assignment.program_version_id
    where planned.person_id = p_subject_person_id
      and (assignment.origin_relationship_id is not null) = p_from_gym
      and planned.scheduled_at >= clock_timestamp() - interval '14 days'
    order by planned.scheduled_at, planned.id
    limit 100
  ) as upcoming
$function$;

alter function support.break_glass_agenda(uuid, boolean) owner to allfit_owner;
revoke all on function support.break_glass_agenda(uuid, boolean) from public;

-- ---------------------------------------------------------------------------
-- One session, every modality it recorded
-- ---------------------------------------------------------------------------

create or replace function execution.session_projection(p_session_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog
as $function$
  select jsonb_build_object(
    'id', session.id,
    'activity_type_code', activity.code,
    'activity_type_name', activity.name,
    'discipline_code', activity.discipline_code,
    'started_at', session.started_at,
    'ended_at', session.ended_at,
    'timezone', session.timezone,
    'status', session.execution_status,
    'validation_status', session.validation_status,
    'requested_level', session.requested_level,
    'achieved_level', session.achieved_level,
    'revision_number', session.revision_number,
    'capture_source', session.capture_source,
    'contract', jsonb_build_object(
      'id', session.result_contract_id, 'version', session.contract_version
    ),
    'segments', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object('position', segment.position, 'activity_type_code', kind.code)
          order by segment.position
        )
        from execution.session_segments as segment
        left join catalog.activity_types as kind on kind.id = segment.activity_type_id
        where segment.executed_session_id = session.id
      ),
      '[]'::jsonb
    ),
    'strength_sets', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'segment_position', segment.position,
            'order', result.set_order,
            'movement_id', result.movement_id,
            'movement_name', movement.name,
            'achieved_reps', result.achieved_reps,
            'load', case
              when result.original_load_value is not null then jsonb_build_object(
                'value', result.original_load_value, 'unit', result.original_load_unit_code
              )
              when result.load_value is not null then jsonb_build_object(
                'value', result.load_value, 'unit', result.load_unit_code
              )
            end,
            'rpe', result.rpe
          )
          order by result.set_order
        )
        from execution.strength_sets as result
        left join execution.session_segments as segment on segment.id = result.session_segment_id
        left join catalog.movements as movement on movement.id = result.movement_id
        where result.executed_session_id = session.id
      ),
      '[]'::jsonb
    ),
    'endurance_laps', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'segment_position', segment.position,
            'lap_number', lap.lap_number,
            'distance', jsonb_build_object(
              -- A lap keeps no original pair the way a set does, so what was stored
              -- is what the person entered.
              'value', lap.distance_value,
              'unit', lap.distance_unit_code
            ),
            'duration_seconds', lap.duration_seconds
          )
          order by lap.lap_number
        )
        from execution.endurance_laps as lap
        left join execution.session_segments as segment on segment.id = lap.session_segment_id
        where lap.executed_session_id = session.id
      ),
      '[]'::jsonb
    ),
    'interval_results', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'segment_position', segment.position,
            'interval_number', result.interval_number,
            'work_duration_seconds', result.work_duration_seconds,
            'rest_duration_seconds', result.rest_duration_seconds,
            'achieved_repetitions', result.achieved_repetitions,
            'distance', case when result.distance_value is not null then jsonb_build_object(
              'value', result.distance_value, 'unit', result.distance_unit_code
            ) end,
            'completed', result.completed
          )
          order by result.interval_number
        )
        from execution.interval_results as result
        left join execution.session_segments as segment on segment.id = result.session_segment_id
        where result.executed_session_id = session.id
      ),
      '[]'::jsonb
    ),
    'round_results', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'segment_position', segment.position,
            'round_number', result.round_number,
            'activity_family', result.activity_family,
            'completed_repetitions', result.completed_repetitions,
            'duration_seconds', result.duration_seconds,
            'distance', case when result.distance_value is not null then jsonb_build_object(
              'value', result.distance_value, 'unit', result.distance_unit_code
            ) end,
            'load', case when result.load_value is not null then jsonb_build_object(
              'value', result.load_value, 'unit', result.load_unit_code
            ) end
          )
          order by result.round_number
        )
        from execution.round_results as result
        left join execution.session_segments as segment on segment.id = result.session_segment_id
        where result.executed_session_id = session.id
      ),
      '[]'::jsonb
    ),
    'mobility_results', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'segment_position', segment.position,
            'sequence_position', result.sequence_position,
            'movement_id', result.movement_id,
            'movement_name', movement.name,
            'side', result.side,
            'hold_duration_seconds', result.hold_duration_seconds,
            'completed_repetitions', result.completed_repetitions
          )
          order by result.sequence_position
        )
        from execution.mobility_results as result
        left join execution.session_segments as segment on segment.id = result.session_segment_id
        left join catalog.movements as movement on movement.id = result.movement_id
        where result.executed_session_id = session.id
      ),
      '[]'::jsonb
    )
  )
  from execution.executed_sessions as session
  join catalog.activity_types as activity on activity.id = session.activity_type_id
  where session.id = p_session_id
$function$;

-- ---------------------------------------------------------------------------
-- OP-SUP-003 — the training categories
-- ---------------------------------------------------------------------------

create or replace function support.exercise_break_glass(
  p_actor_person_id uuid,
  p_actor_session_id uuid,
  p_request_id uuid,
  p_category text,
  p_resource_type text,
  p_resource_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  duty_id uuid;
  file support.break_glass_requests%rowtype;
  approvals integer;
  denial text;
  event_id uuid;
  occurred timestamptz := clock_timestamp();
  readable_resource text := case p_category
    when 'body_progress' then 'identity.body_progress_records'
    when 'health_context' then 'identity.health_context_claims'
    when 'nutrition_intake' then 'nutrition.meals'
    when 'prior_training_history' then 'execution.executed_sessions'
    when 'relationship_training' then 'execution.executed_sessions'
  end;
begin
  -- The only raise before the evidence is written: without a file there is
  -- nothing to attach an event to, so there is no evidence to lose.
  select * into file from support.break_glass_requests where id = p_request_id;
  if file.id is null then
    raise exception 'break-glass request not found' using errcode = 'P0002';
  end if;

  duty_id := file.requester_duty_assignment_id;

  select count(*) into approvals
  from support.break_glass_approvals as approval
  where approval.request_id = p_request_id and approval.decision = 'approved';

  -- Each refusal carries its own reason. A category that returns content reads only its
  -- own kind of data, so a training window cannot be pointed at meals.
  denial := case
    when file.requester_person_id <> p_actor_person_id then 'not_the_requester'
    when not access_control.has_platform_role(
      p_actor_person_id, p_actor_session_id, 'allfit_admin'
    ) or not access_control.has_platform_duty(
      p_actor_person_id, p_actor_session_id, 'request_break_glass'
    ) then 'duty_not_effective'
    when support.effective_break_glass_status(
      file.status, file.request_expires_at, file.window_ends_at
    ) <> 'approved' then 'window_not_open'
    when approvals < file.required_approvals then 'quorum_incomplete'
    when not (p_category = any (file.categories)) then 'category_out_of_scope'
    when readable_resource is not null
      and p_resource_type is distinct from readable_resource then 'resource_out_of_scope'
    else null
  end;

  insert into privacy.access_events (
    actor_person_id, subject_person_id, resource, resource_id, purpose, result,
    request_id, access_mode, occurred_at
  ) values (
    p_actor_person_id, file.subject_person_id, p_resource_type, p_resource_id,
    file.purpose::text, case when denial is null then 'allowed' else 'denied' end,
    coalesce(
      nullif(current_setting('app.request_id', true), '')::uuid,
      extensions.uuid_generate_v7()
    ),
    'break_glass'::privacy.access_mode, occurred
  )
  returning id into event_id;

  insert into support.break_glass_events (
    request_id, requester_person_id, requester_duty_assignment_id, subject_person_id,
    category, result, resource_type, resource_id, operation_code, reason_code,
    occurred_at, access_event_id, access_event_occurred_at
  ) values (
    p_request_id, file.requester_person_id, file.requester_duty_assignment_id,
    file.subject_person_id, p_category,
    case when denial is null then 'allowed' else 'denied' end,
    p_resource_type, p_resource_id, 'OP-SUP-003',
    coalesce(denial, 'authorized_exercise'), occurred, event_id, occurred
  );

  -- Returned, never raised: the evidence above has to survive the refusal.
  if denial is not null then
    return jsonb_build_object(
      'outcome', 'denied',
      'reason_code', denial,
      'break_glass_event_id', event_id,
      'occurred_at', occurred
    );
  end if;

  if p_category = 'body_progress' then
    return jsonb_build_object(
      'outcome', 'allowed',
      'reason_code', 'authorized_exercise',
      'break_glass_event_id', event_id,
      'occurred_at', occurred,
      'category', p_category,
      'content', jsonb_build_object(
        'body_progress', coalesce(
          (
            -- A measurement has a photo when its day has one: the flag, never the photo.
            select jsonb_agg(
              identity.body_progress_projection(latest.id)
                || jsonb_build_object('has_media', latest.has_media or exists (
                  select 1 from identity.body_photo_days as photo_day
                  where photo_day.person_id = file.subject_person_id
                    and photo_day.taken_on = latest.measured_on
                ))
              order by latest.measured_on desc, latest.id desc
            )
            from (
              select record.id, record.measured_on, record.has_media
              from identity.body_progress_records as record
              where record.person_id = file.subject_person_id
              order by record.measured_on desc, record.id desc
              limit 500
            ) as latest
          ),
          '[]'::jsonb
        ),
        -- Every day with photos, a day with no measurement included.
        'body_photo_days', coalesce(
          (
            select jsonb_agg(
              jsonb_build_object('taken_on', recent.taken_on, 'photos', recent.photos)
              order by recent.taken_on desc
            )
            from (
              select photo_day.taken_on, photo_day.photos
              from identity.body_photo_days as photo_day
              where photo_day.person_id = file.subject_person_id
              order by photo_day.taken_on desc
              limit 500
            ) as recent
          ),
          '[]'::jsonb
        )
      )
    );
  end if;

  if p_category = 'health_context' then
    return jsonb_build_object(
      'outcome', 'allowed',
      'reason_code', 'authorized_exercise',
      'break_glass_event_id', event_id,
      'occurred_at', occurred,
      'category', p_category,
      'content', jsonb_build_object(
        'health_context', coalesce(
          (
            select jsonb_agg(
              identity.health_context_projection(latest.id)
              order by latest.valid_from desc, latest.id desc
            )
            from (
              select claim.id, claim.valid_from
              from identity.health_context_claims as claim
              where claim.person_id = file.subject_person_id
              order by claim.valid_from desc, claim.id desc
              limit 500
            ) as latest
          ),
          '[]'::jsonb
        )
      )
    );
  end if;

  if p_category = 'nutrition_intake' then
    return jsonb_build_object(
      'outcome', 'allowed',
      'reason_code', 'authorized_exercise',
      'break_glass_event_id', event_id,
      'occurred_at', occurred,
      'category', p_category,
      'content', jsonb_build_object(
        'nutrition_intake', coalesce(
          (
            select jsonb_agg(
              nutrition.meal_projection(latest.id)
              order by latest.occurred_at desc, latest.id desc
            )
            from (
              select meal.id, meal.occurred_at
              from nutrition.meals as meal
              where meal.person_id = file.subject_person_id
              order by meal.occurred_at desc, meal.id desc
              limit 500
            ) as latest
          ),
          '[]'::jsonb
        )
      )
    );
  end if;

  -- Autonomous sessions are the person's prior training history.
  if p_category = 'prior_training_history' then
    return jsonb_build_object(
      'outcome', 'allowed',
      'reason_code', 'authorized_exercise',
      'break_glass_event_id', event_id,
      'occurred_at', occurred,
      'category', p_category,
      'content', jsonb_build_object(
        'prior_training_history', coalesce(
          (
            select jsonb_agg(
              execution.session_projection(latest.id)
              order by latest.started_at desc, latest.id desc
            )
            from (
              select session.id, session.started_at
              from execution.executed_sessions as session
              where session.person_id = file.subject_person_id and session.is_autonomous
              order by session.started_at desc, session.id desc
              limit 100
            ) as latest
          ),
          '[]'::jsonb
        ),
        -- What her own programmes plan, each by its name only.
        'agenda', support.break_glass_agenda(file.subject_person_id, false)
      )
    );
  end if;

  -- Training under a gym: its sessions, and what its programmes plan.
  if p_category = 'relationship_training' then
    return jsonb_build_object(
      'outcome', 'allowed',
      'reason_code', 'authorized_exercise',
      'break_glass_event_id', event_id,
      'occurred_at', occurred,
      'category', p_category,
      'content', jsonb_build_object(
        'relationship_training', coalesce(
          (
            select jsonb_agg(
              execution.session_projection(latest.id)
              order by latest.started_at desc, latest.id desc
            )
            from (
              select session.id, session.started_at
              from execution.executed_sessions as session
              where session.person_id = file.subject_person_id and not session.is_autonomous
              order by session.started_at desc, session.id desc
              limit 100
            ) as latest
          ),
          '[]'::jsonb
        ),
        'agenda', support.break_glass_agenda(file.subject_person_id, true)
      )
    );
  end if;

  -- Nutrition guidance has no data in the platform yet.
  return jsonb_build_object(
    'outcome', 'content_unavailable',
    'reason_code', 'category_content_absent',
    'break_glass_event_id', event_id,
    'occurred_at', occurred,
    'category', p_category
  );
end
$function$;
