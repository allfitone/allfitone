-- The diagnosis sees what failed silently — `HU-BO-031` criterion 2, over `OP-SUP-005`.
--
-- Three failures left nothing the Backoffice could read.
--
-- **A delivery nobody picked up.** `support.outbox_event_state` called anything unsent
-- with no attempt `pending`, however old. A notification a worker consumes that sat
-- there for a quarter of an hour is not on its way: the worker stopped, or its circuit
-- is open. The kinds a worker consumes are the ones it opened a delivery circuit for
-- (`system.outbox_delivery_circuits`, written on its first claim), so only those turn
-- `stalled`. Every other `pending` row is a domain record nobody waits on — about
-- seventy kinds of them — and stays `pending`, or the feed would be nothing but them.
--
-- **A scheduled job that failed.** The worker reported its jobs to telemetry only.
-- `system.job_runs` keeps a row per run, written by the worker through
-- `system.record_job_run`; successful runs older than two days and failures older than
-- thirty are pruned as the job runs again, so the table stays small without a sweep of
-- its own. The feed shows the failed runs, and `support.list_job_health` says when each
-- job last ran — the only way to notice a worker that stopped running at all.
--
-- **A store notice that was refused.** The webhook answered 400 or 503 and kept
-- nothing, so "a charge never arrived" had no trace. Refusals are counted per store,
-- reason and hour: bounded, because the webhook is unauthenticated and anybody can post
-- to it, and with nothing from the notice — no payload, no transaction, no person.

set lock_timeout = '5s';
set statement_timeout = '60s';

-- ---------------------------------------------------------------------------
-- Scheduled job runs
-- ---------------------------------------------------------------------------

create table system.job_runs (
  id uuid not null default extensions.uuid_generate_v7(),
  job_name text not null,
  started_at timestamptz not null,
  finished_at timestamptz not null default clock_timestamp(),
  outcome text not null,
  error_code text,
  constraint pk_job_runs primary key (id),
  constraint ck_job_runs_job_name check (job_name ~ '^[a-z][a-z0-9_]{2,63}$'),
  constraint ck_job_runs_outcome check (outcome in ('succeeded', 'failed')),
  constraint ck_job_runs_error_code check (
    error_code is null or char_length(error_code) between 1 and 120
  ),
  constraint ck_job_runs_failure_named check ((outcome = 'failed') = (error_code is not null)),
  constraint ck_job_runs_finished check (finished_at >= started_at)
);

create index idx_job_runs_job_started on system.job_runs (job_name, started_at desc);
create index idx_job_runs_failed on system.job_runs (started_at desc) where outcome = 'failed';

alter table system.job_runs owner to allfit_owner;
alter table system.job_runs enable row level security;
alter table system.job_runs force row level security;
create policy job_runs_all_owner on system.job_runs
  for all to allfit_owner using (true) with check (true);
revoke all on system.job_runs from public, allfit_api;

create or replace function system.record_job_run(
  p_job_name text,
  p_started_at timestamptz,
  p_outcome text,
  p_error_code text
)
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $function$
begin
  if access_control.actor_kind() is distinct from 'worker'::identity.actor_kind then
    raise exception 'only the worker records a run of its jobs' using errcode = '42501';
  end if;
  if coalesce(p_job_name, '') !~ '^[a-z][a-z0-9_]{2,63}$'
     or p_started_at is null
     or coalesce(p_outcome, '') not in ('succeeded', 'failed')
     or (p_outcome = 'failed') is distinct from (p_error_code is not null)
     or char_length(coalesce(p_error_code, 'x')) not between 1 and 120 then
    raise exception 'a run names its job, its start and whether it failed' using errcode = '22023';
  end if;

  insert into system.job_runs (job_name, started_at, finished_at, outcome, error_code)
  values (p_job_name, p_started_at, greatest(clock_timestamp(), p_started_at), p_outcome, p_error_code);

  delete from system.job_runs as run
  where run.job_name = p_job_name
    and (
      (run.outcome = 'succeeded' and run.started_at < clock_timestamp() - interval '2 days')
      or (run.outcome = 'failed' and run.started_at < clock_timestamp() - interval '30 days')
    );
end
$function$;

alter function system.record_job_run(text, timestamptz, text, text) owner to allfit_owner;
revoke all on function system.record_job_run(text, timestamptz, text, text) from public;
grant execute on function system.record_job_run(text, timestamptz, text, text) to allfit_api;

-- ---------------------------------------------------------------------------
-- Refused store notices
-- ---------------------------------------------------------------------------

create table payments.store_notification_rejections (
  id uuid not null default extensions.uuid_generate_v7(),
  store payments.platform_store not null,
  reason text not null,
  window_started_at timestamptz not null,
  rejection_count integer not null default 1,
  last_rejected_at timestamptz not null default clock_timestamp(),
  constraint pk_store_notification_rejections primary key (id),
  constraint uq_store_notification_rejections_window unique (store, reason, window_started_at),
  constraint ck_store_notification_rejections_reason check (
    reason in ('malformed', 'unverified', 'not_applied')
  ),
  constraint ck_store_notification_rejections_count check (rejection_count >= 1)
);

alter table payments.store_notification_rejections owner to allfit_owner;
alter table payments.store_notification_rejections enable row level security;
alter table payments.store_notification_rejections force row level security;
create policy store_notification_rejections_all_owner on payments.store_notification_rejections
  for all to allfit_owner using (true) with check (true);
revoke all on payments.store_notification_rejections from public, allfit_api;

create or replace function payments.record_store_notification_rejection(
  p_store text,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $function$
begin
  if coalesce(p_store, '') not in ('app_store', 'google_play')
     or coalesce(p_reason, '') not in ('malformed', 'unverified', 'not_applied') then
    raise exception 'a refusal names its store and one of its closed reasons'
      using errcode = '22023';
  end if;

  insert into payments.store_notification_rejections (store, reason, window_started_at)
  values (p_store::payments.platform_store, p_reason, date_trunc('hour', clock_timestamp()))
  on conflict (store, reason, window_started_at) do update
  set rejection_count = payments.store_notification_rejections.rejection_count + 1,
      last_rejected_at = clock_timestamp();

  delete from payments.store_notification_rejections as window_row
  where window_row.window_started_at < clock_timestamp() - interval '30 days';
end
$function$;

alter function payments.record_store_notification_rejection(text, text) owner to allfit_owner;
revoke all on function payments.record_store_notification_rejection(text, text) from public;
grant execute on function payments.record_store_notification_rejection(text, text) to allfit_api;

-- ---------------------------------------------------------------------------
-- OP-SUP-005 — the feed, with the three new answers
-- ---------------------------------------------------------------------------

create or replace function support.notification_state(
  p_published_at timestamptz,
  p_dead_lettered_at timestamptz,
  p_attempt_count integer,
  p_available_at timestamptz,
  p_consumed boolean
)
returns text
language sql
stable
set search_path = pg_catalog
as $function$
  select case
    when p_published_at is null
      and p_dead_lettered_at is null
      and p_attempt_count = 0
      and p_consumed
      and p_available_at < clock_timestamp() - interval '15 minutes' then 'stalled'
    else support.outbox_event_state(p_published_at, p_dead_lettered_at, p_attempt_count)
  end
$function$;

alter function support.notification_state(timestamptz, timestamptz, integer, timestamptz, boolean)
  owner to allfit_owner;
revoke all on function support.notification_state(
  timestamptz, timestamptz, integer, timestamptz, boolean
) from public, allfit_api;

create or replace function support.list_operational_events(
  p_actor_person_id uuid,
  p_actor_session_id uuid,
  p_source text,
  p_state text,
  p_aggregate_id uuid,
  p_limit integer,
  p_cursor_occurred_at timestamptz,
  p_cursor_id uuid
)
returns table (
  source text,
  reference_id uuid,
  subject_kind text,
  subject_id uuid,
  label text,
  state text,
  occurred_at timestamptz,
  attempt_count integer,
  last_error_code text,
  resolved_at timestamptz
)
language plpgsql
stable
security definer
set search_path = pg_catalog
as $function$
begin
  perform support.require_support_diagnostician(p_actor_person_id, p_actor_session_id);

  if p_source is not null
     and p_source not in ('notification', 'command', 'job', 'store_notification') then
    raise exception 'an operational event is a notification, a command, a job or a store notice'
      using errcode = '22023';
  end if;

  return query
  with feed as (
    select
      'notification'::text as source,
      event.id as reference_id,
      event.aggregate_type as subject_kind,
      event.aggregate_id as subject_id,
      event.event_type as label,
      support.notification_state(
        event.published_at, event.dead_lettered_at, event.attempt_count, event.available_at,
        exists (
          select 1 from system.outbox_delivery_circuits as circuit
          where circuit.event_type = event.event_type
        )
      ) as state,
      event.occurred_at,
      event.attempt_count,
      event.last_error_code,
      event.published_at as resolved_at
    from system.outbox_events as event
    where p_source is null or p_source = 'notification'

    union all

    select
      'command'::text,
      receipt.id,
      receipt.aggregate_type,
      receipt.aggregate_id,
      receipt.operation_code,
      support.command_state(receipt.status, receipt.created_at),
      receipt.created_at,
      0,
      receipt.outcome_code,
      receipt.completed_at
    from system.idempotency_keys as receipt
    where p_source is null or p_source = 'command'

    union all

    -- Failed runs only: a job runs every minute, and its successes would bury the rest.
    select
      'job'::text,
      run.id,
      'job'::text,
      null::uuid,
      run.job_name,
      'failed'::text,
      run.started_at,
      0,
      run.error_code,
      null::timestamptz
    from system.job_runs as run
    where run.outcome = 'failed'
      and (p_source is null or p_source = 'job')

    union all

    select
      'store_notification'::text,
      refusal.id,
      null::text,
      null::uuid,
      refusal.store::text,
      'failed'::text,
      refusal.last_rejected_at,
      refusal.rejection_count,
      refusal.reason,
      null::timestamptz
    from payments.store_notification_rejections as refusal
    where p_source is null or p_source = 'store_notification'
  )
  select
    feed.source, feed.reference_id, feed.subject_kind, feed.subject_id, feed.label,
    feed.state, feed.occurred_at, feed.attempt_count, feed.last_error_code, feed.resolved_at
  from feed
  where (p_state is null or feed.state = p_state)
    and (p_aggregate_id is null or feed.subject_id = p_aggregate_id)
    and (
      p_cursor_occurred_at is null
      or (feed.occurred_at, feed.reference_id) < (p_cursor_occurred_at, p_cursor_id)
    )
  order by feed.occurred_at desc, feed.reference_id desc
  limit greatest(p_limit, 1);
end
$function$;

-- ---------------------------------------------------------------------------
-- NEW-SUP-JOB-HEALTH — when each scheduled job last ran
-- ---------------------------------------------------------------------------

create or replace function support.list_job_health(
  p_actor_person_id uuid,
  p_actor_session_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $function$
begin
  perform support.require_support_diagnostician(p_actor_person_id, p_actor_session_id);

  return jsonb_build_object(
    'generated_at', clock_timestamp(),
    'items', coalesce(
      (
        select jsonb_agg(health order by health->>'job_name')
        from (
          select jsonb_build_object(
            'job_name', job.job_name,
            'last_run_at', last_run.started_at,
            'last_outcome', last_run.outcome,
            'last_failure_at', last_failure.started_at,
            'last_error_code', last_failure.error_code,
            'failures_24h', (
              select count(*)::integer
              from system.job_runs as failed
              where failed.job_name = job.job_name
                and failed.outcome = 'failed'
                and failed.started_at >= clock_timestamp() - interval '24 hours'
            )
          ) as health
          from (select distinct run.job_name from system.job_runs as run) as job
          cross join lateral (
            select run.started_at, run.outcome
            from system.job_runs as run
            where run.job_name = job.job_name
            order by run.started_at desc, run.id desc
            limit 1
          ) as last_run
          left join lateral (
            select run.started_at, run.error_code
            from system.job_runs as run
            where run.job_name = job.job_name and run.outcome = 'failed'
            order by run.started_at desc, run.id desc
            limit 1
          ) as last_failure on true
        ) as rows
      ),
      '[]'::jsonb
    )
  );
end
$function$;

alter function support.list_job_health(uuid, uuid) owner to allfit_owner;
revoke all on function support.list_job_health(uuid, uuid) from public;
grant execute on function support.list_job_health(uuid, uuid) to allfit_api;
