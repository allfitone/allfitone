-- HU-BO-008: a window over her training reaches every session, not only the newest
-- hundred.
--
-- A training read answered the newest hundred sessions and said nothing of the rest, so a
-- case about something older had no way to reach it. A read now takes the last session it
-- already showed, as `(started_at, id)`, and answers the next hundred older than it, with
-- `has_older_sessions` saying whether more remain. Without a cursor it answers the newest,
-- as before, so a caller that sends none is unchanged.
--
-- **Every page is a read of its own.** It passes the same gate and leaves its own access
-- event and break-glass event before it answers; paging never reads without a trace.
--
-- **The page is chosen once.** Its sessions and what she hid from a gym among them come
-- from the same list of identifiers, so a hidden session travels with the page it is on.
-- `break_glass_hidden_sessions` now takes that list instead of choosing its own hundred.
--
-- **A cursor is a session.** Both halves or neither, and only for a training category;
-- anything else is refused as a malformed request before the file is read.
--
-- The body is `20261122100000`'s, with the two training reads folded into one that pages;
-- nothing else changed.

set lock_timeout = '5s';
set statement_timeout = '60s';

drop function support.exercise_break_glass(uuid, uuid, uuid, text, text, uuid);
drop function support.break_glass_hidden_sessions(uuid, boolean);

-- Of the given sessions, every gym each is hidden from, in the order they were given.
create function support.break_glass_hidden_sessions(p_session_ids uuid[])
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog
as $function$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'executed_session_id', denial.executed_session_id,
        'relationship_id', denial.relationship_id,
        'organization_id', gym.id,
        'organization_name', gym.display_name,
        'hidden_at', denial.denied_at
      )
      order by page.position, denial.denied_at desc, denial.id desc
    ),
    '[]'::jsonb
  )
  from unnest(p_session_ids) with ordinality as page(session_id, position)
  join privacy.session_visibility_denials as denial
    on denial.executed_session_id = page.session_id and denial.status = 'active'
  join relationships.service_relationships as relationship
    on relationship.id = denial.relationship_id
  join organizations.organizations as gym on gym.id = relationship.organization_id
$function$;

alter function support.break_glass_hidden_sessions(uuid[]) owner to allfit_owner;
revoke all on function support.break_glass_hidden_sessions(uuid[]) from public;

create or replace function support.exercise_break_glass(
  p_actor_person_id uuid,
  p_actor_session_id uuid,
  p_request_id uuid,
  p_category text,
  p_resource_type text,
  p_resource_id uuid,
  p_before_started_at timestamptz default null,
  p_before_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  page_ids uuid[];
  older boolean;
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
  -- A malformed cursor is a malformed request, refused before the file is read.
  if (p_before_started_at is null) <> (p_before_id is null) then
    raise exception 'a cursor is a session: its started_at and its id, or neither'
      using errcode = '22023';
  end if;
  if p_before_started_at is not null
     and p_category not in ('prior_training_history', 'relationship_training') then
    raise exception 'only a training read pages' using errcode = '22023';
  end if;

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

  -- Training: her own sessions with `prior_training_history`, those under a gym with
  -- `relationship_training`; a hundred at a time, older than the cursor when one is given.
  if p_category in ('prior_training_history', 'relationship_training') then
    select coalesce(array_agg(page.id order by page.started_at desc, page.id desc), '{}')
    into page_ids
    from (
      select session.id, session.started_at
      from execution.executed_sessions as session
      where session.person_id = file.subject_person_id
        and session.is_autonomous = (p_category = 'prior_training_history')
        and (
          p_before_started_at is null
          or (session.started_at, session.id) < (p_before_started_at, p_before_id)
        )
      order by session.started_at desc, session.id desc
      limit 101
    ) as page;

    -- One more than a page was asked for only to know whether older ones remain.
    older := cardinality(page_ids) > 100;
    page_ids := page_ids[1:100];

    return jsonb_build_object(
      'outcome', 'allowed',
      'reason_code', 'authorized_exercise',
      'break_glass_event_id', event_id,
      'occurred_at', occurred,
      'category', p_category,
      'content', jsonb_build_object(
        p_category, coalesce(
          (
            select jsonb_agg(execution.session_projection(page.session_id) order by page.position)
            from unnest(page_ids) with ordinality as page(session_id, position)
          ),
          '[]'::jsonb
        ),
        'has_older_sessions', older,
        -- What her own programmes plan, or a gym's, each by its name only.
        'agenda', support.break_glass_agenda(
          file.subject_person_id, p_category = 'relationship_training'
        ),
        -- HU-BO-008 c4: which of these sessions she hid, and from which gym.
        'hidden_sessions', support.break_glass_hidden_sessions(page_ids)
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

alter function support.exercise_break_glass(uuid, uuid, uuid, text, text, uuid, timestamptz, uuid)
  owner to allfit_owner;
revoke all on function support.exercise_break_glass(
  uuid, uuid, uuid, text, text, uuid, timestamptz, uuid
) from public;
grant execute on function support.exercise_break_glass(
  uuid, uuid, uuid, text, text, uuid, timestamptz, uuid
) to allfit_api;
