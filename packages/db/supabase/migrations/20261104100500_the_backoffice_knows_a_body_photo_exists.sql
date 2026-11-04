-- HU-BO-009 criterion 3 — the Backoffice knows a body photo exists, never the photo.
--
-- A break-glass read of the body said «Sin foto» for every measurement. Photos live in
-- `identity.body_photos` (20261103030400), apart from the measurements, and that table is
-- sealed on purpose: its policy lets only the person read it, even from the database's own
-- functions. The measurement's `has_media` flag predates it and is never set.
--
-- The photos table stays sealed. `identity.body_photo_days` holds only how many photos a
-- person has on each day, kept by a trigger on the photos themselves, so every way a photo
-- is recorded or deleted keeps it right. It carries no reference and no object, and only
-- the database's own functions read it; the runtime role has no privilege on it.
--
-- The break-glass read of `body_progress` now returns those days, newest first, so a
-- photo on a day with no measurement is still said to exist, and marks a measurement as
-- having a photo when its day has one. `identity.body_progress_projection` is untouched:
-- Space reads it too. The body of `support.exercise_break_glass` is `20260927120000`'s
-- with that block extended; nothing else changed.

set lock_timeout = '5s';
set statement_timeout = '60s';

create table identity.body_photo_days (
  person_id uuid not null,
  taken_on date not null,
  photos integer not null,
  constraint pk_body_photo_days primary key (person_id, taken_on),
  constraint fk_body_photo_days_person foreign key (person_id) references identity.people(id) on delete restrict,
  constraint ck_body_photo_days_photos check (photos > 0)
);

alter table identity.body_photo_days owner to allfit_owner;
alter table identity.body_photo_days enable row level security;
alter table identity.body_photo_days force row level security;

create policy body_photo_days_all_owner on identity.body_photo_days
  for all to allfit_owner using (true) with check (true);

revoke all on identity.body_photo_days from public, allfit_api;

create function identity.count_body_photo_days()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $function$
begin
  if tg_op in ('DELETE', 'UPDATE') then
    update identity.body_photo_days as day
    set photos = day.photos - 1
    where day.person_id = old.person_id and day.taken_on = old.taken_on and day.photos > 1;
    if not found then
      delete from identity.body_photo_days as day
      where day.person_id = old.person_id and day.taken_on = old.taken_on;
    end if;
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    insert into identity.body_photo_days (person_id, taken_on, photos)
    values (new.person_id, new.taken_on, 1)
    on conflict (person_id, taken_on)
    do update set photos = identity.body_photo_days.photos + 1;
  end if;
  return null;
end
$function$;

alter function identity.count_body_photo_days() owner to allfit_owner;
revoke all on function identity.count_body_photo_days() from public;

create trigger trg_body_photos_count_days
after insert or delete or update of person_id, taken_on on identity.body_photos
for each row execute function identity.count_body_photo_days();

-- The photos already recorded, counted once.
insert into identity.body_photo_days (person_id, taken_on, photos)
select photo.person_id, photo.taken_on, count(*)::integer
from identity.body_photos as photo
group by photo.person_id, photo.taken_on;

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
        )
      )
    );
  end if;

  -- Relationship training and nutrition guidance have no data in the platform yet.
  return jsonb_build_object(
    'outcome', 'content_unavailable',
    'reason_code', 'category_content_absent',
    'break_glass_event_id', event_id,
    'occurred_at', occurred,
    'category', p_category
  );
end
$function$;
