-- A person asks for the summary of her week (`OP-ITL-004`, `OP-ITL-005`, `OP-ITL-006`;
-- HU-SP-126 and HU-SP-127; ADR-053, decisions 6 to 8, 10 and 13).
--
-- The first capability of the assistant that asks a model, and so the first runs, the
-- first ceiling and the first thing a capability keeps.
--
-- **A run is recorded; what it sent is not.** `intelligence.runs` keeps who asked, about
-- whom, which capability, under which context contract, the exact model, the tokens and
-- how it ended. It has no column for a context, a prompt or an answer, so none can be
-- kept (ADR-012). A run only ends, once: the table refuses anything else.
--
-- **Asking is two transactions with the model between them.** The first decides and
-- reads: the person's own lock, her plan, her consent in force, her ceiling, and then the
-- two weeks, read through `execution` and `nutrition` as herself. It leaves the run open
-- and answers what it read. The API asks the model with no transaction open, and the
-- second transaction closes the run and, if it was answered, keeps the summary.
-- Nothing is read before every refusal has been ruled out (decision 10).
--
-- **The run is the command.** Its id is the `Command-Id`, so a replayed request finds its
-- run and answers what that run became, without asking a model twice.
--
-- **Pro, and nothing else, opens it** (decision 10). It is asked of `payments.resolve_pro`
-- and not of the plan catalogue: there, a function no version declares limits nothing
-- (DT-018), which protects what people already had. This is new and costs money each
-- time, so nobody has it by a plan's silence.
--
-- **The ceiling is provisional.** One summary a week and three more tries, set by the
-- owner on 16 November 2026 until pricing gives each plan its number (ADR-053, open
-- question 1). It is a constant here and no row of the catalogue: a catalogue row would
-- have to be declared by every plan version from now on, for a number nobody has decided.
--
-- **The ceiling counts what was asked and stands.** A run still open and a run answered
-- take a place; one the model failed does not, so an outage costs her nothing. The week
-- of the ceiling is her own calendar week, Monday to Sunday in the zone her device sent.
-- Known limit: that zone is the device's word, so changing it near midnight on a Sunday
-- can move a request into the next week. It moves hours, never the number of places.
--
-- **A run nobody closed is closed by her next request.** If the process dies between the
-- two transactions the run stays open, holding a place and answering «still in progress»
-- to its own replay. Past five minutes it ends as `unavailable`: the API gives a model
-- twenty-five seconds, so nobody is waiting for it any more.
--
-- **The weekly summary is the person's** (decision 8). One is kept for each week, with
-- the exact model that wrote it and which of her data it was written from. Asking again
-- replaces it; she deletes it when she wants; nobody else reads it. Withdrawing the
-- consent or leaving Pro stops new runs and removes nothing.
--
-- **`execution` gains the reader the summary needs**, with the rules its own readers
-- already follow: finished and standing sessions, the day in her zone, work sets without
-- warm-ups, kilograms through the unit catalogue, nothing weighed as unknown. The
-- assistant reads no table of another domain (decision 3).
--
-- Additive.

set lock_timeout = '5s';
set statement_timeout = '60s';

-- ---------------------------------------------------------------------------
-- execution: a person's sessions between two days
-- ---------------------------------------------------------------------------

create function execution.read_my_sessions_between(
  p_person_id uuid,
  p_timezone text,
  p_from date,
  p_to date
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $function$
declare
  cutoff timestamp with time zone;
begin
  if access_control.actor_kind() is distinct from 'person'
     or access_control.person() is distinct from p_person_id then
    raise exception 'sessions are read only by their own person' using errcode = '42501';
  end if;
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 30 then
    raise exception 'a window covers between one and thirty-one days' using errcode = '22023';
  end if;
  -- What the plan hides from her history is hidden here too.
  cutoff := payments.history_cutoff(p_person_id, 'training_history_months', p_timezone);

  return (
    with
    finished as (
      select executed.id, executed.started_at, executed.ended_at,
             (executed.started_at at time zone p_timezone)::date as trained_on
      from execution.executed_sessions as executed
      where executed.person_id = p_person_id
        and executed.execution_status = 'completed'
        and executed.annulled_at is null
        and executed.ended_at is not null
        and (cutoff is null or executed.started_at >= cutoff)
        and (executed.started_at at time zone p_timezone)::date between p_from and p_to
    ),
    -- Work sets in kilograms. A unit that is not a mass leaves the load unknown, not wrong.
    work as (
      select sets.session_exercise_id, sets.set_order, sets.achieved_reps,
             sets.load_value * unit.to_canonical_factor as load_kg
      from execution.strength_sets as sets
      join finished on finished.id = sets.executed_session_id
      left join catalog.units as unit on unit.code = sets.load_unit_code and unit.dimension = 'mass'
      where sets.kind <> 'warmup'
    ),
    -- The best set of an exercise is its highest estimated maximum, the first of equals.
    best as (
      select distinct on (work.session_exercise_id)
             work.session_exercise_id, work.load_kg, work.achieved_reps
      from work
      where work.load_kg is not null and work.achieved_reps is not null
      order by work.session_exercise_id, work.load_kg * (1 + work.achieved_reps / 30.0) desc, work.set_order
    ),
    records as (
      select distinct finished.id as executed_session_id, record.movement_id
      from finished
      cross join lateral execution.session_records(p_person_id, finished.id) as record
    )
    select coalesce(jsonb_agg(jsonb_build_object(
      'trained_on', finished.trained_on,
      'duration_seconds', extract(epoch from (finished.ended_at - finished.started_at))::integer,
      'exercises', coalesce((
        select jsonb_agg(jsonb_build_object(
          'movement_id', item.movement_id,
          'name', movement.name,
          'work_sets', (select count(*)::integer from work where work.session_exercise_id = item.id),
          'best_set', (select jsonb_build_object('load_kg', round(best.load_kg, 2), 'reps', best.achieved_reps)
                       from best where best.session_exercise_id = item.id),
          -- Nothing weighed is not zero lifted.
          'volume_kg', (select round(sum(work.load_kg * work.achieved_reps), 2)
                        from work where work.session_exercise_id = item.id),
          'record', exists (select 1 from records
                            where records.executed_session_id = finished.id
                              and records.movement_id = item.movement_id)
        ) order by item.position)
        from execution.session_exercises as item
        join catalog.movements as movement on movement.id = item.movement_id
        where item.executed_session_id = finished.id
          and exists (select 1 from work where work.session_exercise_id = item.id)
      ), '[]'::jsonb)
    ) order by finished.started_at, finished.id), '[]'::jsonb)
    from finished
  );
end
$function$;

alter function execution.read_my_sessions_between(uuid, text, date, date) owner to allfit_owner;
-- Another domain's function calls it; the runtime role has no route that does.
revoke all on function execution.read_my_sessions_between(uuid, text, date, date) from public, allfit_api;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table intelligence.runs (
  -- The Command-Id of the request that asked.
  id uuid not null,
  capability text not null,
  actor_person_id uuid not null,
  subject_person_id uuid not null,
  contract text not null,
  -- The week a weekly summary is about; no other capability has one.
  week_starts_on date,
  started_at timestamp with time zone not null default clock_timestamp(),
  finished_at timestamp with time zone,
  -- Null while the model is being asked.
  outcome text,
  model text,
  input_tokens integer,
  output_tokens integer,
  constraint pk_runs primary key (id),
  constraint fk_runs_actor foreign key (actor_person_id) references identity.people (id) on delete restrict,
  constraint fk_runs_subject foreign key (subject_person_id) references identity.people (id) on delete restrict,
  constraint ck_runs_capability check (capability in ('weekly-summary')),
  constraint ck_runs_contract check (contract ~ '^[a-z][a-z-]*/[1-9][0-9]*$'),
  constraint ck_runs_week check (
    (capability = 'weekly-summary') = (week_starts_on is not null)
    and (week_starts_on is null or extract(isodow from week_starts_on) = 1)
  ),
  constraint ck_runs_outcome check (
    outcome in ('answered', 'unavailable', 'refused', 'over-ceiling', 'nothing-logged')
  ),
  constraint ck_runs_end_pair check ((outcome is null) = (finished_at is null)),
  constraint ck_runs_end_order check (finished_at is null or finished_at >= started_at),
  constraint ck_runs_model check (model is null or model ~ '^[a-z0-9-]+/[a-z0-9.-]+$'),
  constraint ck_runs_answered_by check (outcome is distinct from 'answered' or model is not null),
  constraint ck_runs_tokens check (
    (input_tokens is null or input_tokens >= 0) and (output_tokens is null or output_tokens >= 0)
  )
);

create index idx_runs_actor_capability on intelligence.runs (actor_person_id, capability, started_at desc);
create index idx_runs_subject on intelligence.runs (subject_person_id, started_at desc);

create table intelligence.weekly_summaries (
  id uuid not null default extensions.uuid_generate_v7(),
  person_id uuid not null,
  week_starts_on date not null,
  -- The run that wrote it.
  run_id uuid not null,
  overview text not null,
  training text,
  nutrition text,
  changes text,
  -- Which of her data it was written from: what the app says under it.
  sources text[] not null,
  model text not null,
  generated_at timestamp with time zone not null default clock_timestamp(),
  constraint pk_weekly_summaries primary key (id),
  constraint uq_weekly_summaries_week unique (person_id, week_starts_on),
  constraint fk_weekly_summaries_person foreign key (person_id) references identity.people (id) on delete restrict,
  constraint fk_weekly_summaries_run foreign key (run_id) references intelligence.runs (id) on delete restrict,
  constraint ck_weekly_summaries_week check (extract(isodow from week_starts_on) = 1),
  constraint ck_weekly_summaries_overview check (char_length(btrim(overview)) between 1 and 400),
  constraint ck_weekly_summaries_parts check (
    (training is null or char_length(btrim(training)) between 1 and 900)
    and (nutrition is null or char_length(btrim(nutrition)) between 1 and 900)
    and (changes is null or char_length(btrim(changes)) between 1 and 900)
  ),
  constraint ck_weekly_summaries_sources check (
    cardinality(sources) between 1 and 3
    and sources <@ array['training', 'nutrition', 'nutrition_goal']
  ),
  -- A part is written exactly when its data was read.
  constraint ck_weekly_summaries_parts_from_sources check (
    (training is not null) = ('training' = any (sources))
    and (nutrition is not null) = ('nutrition' = any (sources))
  ),
  constraint ck_weekly_summaries_model check (model ~ '^[a-z0-9-]+/[a-z0-9.-]+$')
);

create index idx_weekly_summaries_run on intelligence.weekly_summaries (run_id);

alter table intelligence.runs owner to allfit_owner;
alter table intelligence.weekly_summaries owner to allfit_owner;

revoke all on intelligence.runs from public, allfit_api;
revoke all on intelligence.weekly_summaries from public, allfit_api;

alter table intelligence.runs enable row level security;
alter table intelligence.runs force row level security;
alter table intelligence.weekly_summaries enable row level security;
alter table intelligence.weekly_summaries force row level security;

create policy runs_select_party on intelligence.runs
  for select to allfit_owner
  using (access_control.is_self(actor_person_id) or access_control.is_self(subject_person_id));
create policy runs_insert_actor on intelligence.runs
  for insert to allfit_owner with check (access_control.is_self(actor_person_id));
create policy runs_update_actor on intelligence.runs
  for update to allfit_owner
  using (access_control.is_self(actor_person_id))
  with check (access_control.is_self(actor_person_id));

create policy weekly_summaries_select_self on intelligence.weekly_summaries
  for select to allfit_owner using (access_control.is_self(person_id));
create policy weekly_summaries_insert_self on intelligence.weekly_summaries
  for insert to allfit_owner with check (access_control.is_self(person_id));
create policy weekly_summaries_update_self on intelligence.weekly_summaries
  for update to allfit_owner
  using (access_control.is_self(person_id))
  with check (access_control.is_self(person_id));
create policy weekly_summaries_delete_self on intelligence.weekly_summaries
  for delete to allfit_owner using (access_control.is_self(person_id));

-- ---------------------------------------------------------------------------
-- A run only ends, once
-- ---------------------------------------------------------------------------

create function intelligence.reject_run_rewrite()
returns trigger
language plpgsql
set search_path = pg_catalog
as $function$
begin
  if tg_op = 'UPDATE'
     and old.outcome is null and new.outcome is not null
     and new.id = old.id and new.capability = old.capability
     and new.actor_person_id = old.actor_person_id
     and new.subject_person_id = old.subject_person_id
     and new.contract = old.contract
     and new.week_starts_on is not distinct from old.week_starts_on
     and new.started_at = old.started_at then
    return new;
  end if;
  raise exception 'intelligence.runs keeps what happened: a run only ends, once'
    using errcode = '42501';
end
$function$;

create trigger trg_runs_reject_rewrite
before update or delete on intelligence.runs
for each row execute function intelligence.reject_run_rewrite();

-- ---------------------------------------------------------------------------
-- A summary as the person reads it
-- ---------------------------------------------------------------------------

create function intelligence.weekly_summary_json(p_summary intelligence.weekly_summaries)
returns jsonb
language sql
immutable
set search_path = pg_catalog
as $function$
  select jsonb_build_object(
    'week_starts_on', p_summary.week_starts_on,
    'overview', p_summary.overview,
    'training', p_summary.training,
    'nutrition', p_summary.nutrition,
    'changes', p_summary.changes,
    'sources', to_jsonb(p_summary.sources),
    'model', p_summary.model,
    'generated_at', p_summary.generated_at)
$function$;

-- ---------------------------------------------------------------------------
-- Ask (OP-ITL-004), first half: decide, read, and open the run
-- ---------------------------------------------------------------------------

create function intelligence.begin_weekly_summary(
  p_person_id uuid,
  p_week_starts_on date,
  p_timezone text,
  p_consent_version text,
  p_contract text,
  p_idempotency_key uuid,
  p_command_id uuid,
  p_request_hash bytea
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  -- One summary a week and three more tries: provisional, until pricing sets it.
  ceiling constant integer := 4;
  -- The API gives a model twenty-five seconds; past this, nobody is waiting for it.
  abandoned_after constant interval := interval '5 minutes';
  receipt record;
  earlier intelligence.runs%rowtype;
  this_week timestamp without time zone;
  renews_at timestamp with time zone;
  used integer;
  sessions jsonb;
  nutrition_days jsonb;
  goal jsonb;
begin
  if access_control.actor_kind() is distinct from 'person'
     or access_control.person() is distinct from p_person_id then
    raise exception 'a weekly summary is asked only by its own person' using errcode = '42501';
  end if;

  -- An unknown zone is refused here, by the cast itself.
  this_week := date_trunc('week', clock_timestamp() at time zone p_timezone);
  renews_at := (this_week + interval '7 days') at time zone p_timezone;

  -- Two requests at once must not both find a free place under the ceiling.
  perform pg_advisory_xact_lock(hashtextextended('intelligence.runs:' || p_person_id::text, 0));

  -- A run nobody closed was abandoned by a process that died: it ends as a failure, so it
  -- neither holds a place under the ceiling nor keeps its request waiting for ever.
  update intelligence.runs
  set outcome = 'unavailable', finished_at = clock_timestamp()
  where actor_person_id = p_person_id and capability = 'weekly-summary'
    and outcome is null and started_at < clock_timestamp() - abandoned_after;

  select * into receipt from system.begin_idempotency(
    p_person_id, 'OP-ITL-004', p_idempotency_key, p_command_id, p_request_hash);
  if not receipt.claimed then
    select * into earlier from intelligence.runs
    where id = receipt.aggregate_id and actor_person_id = p_person_id;
    if earlier.outcome is null then
      raise exception 'the model is still being asked' using errcode = '40001';
    end if;
    return jsonb_build_object(
      'state', 'replayed', 'outcome', earlier.outcome,
      'week_starts_on', earlier.week_starts_on, 'renews_at', renews_at);
  end if;

  if p_week_starts_on is null
     or p_week_starts_on not in (this_week::date, this_week::date - 7) then
    raise exception 'a summary is of the current week or of the one before' using errcode = '22023';
  end if;

  if payments.resolve_pro(p_person_id)->>'effective_source' = 'free' then
    raise exception 'the weekly summary comes with Pro' using errcode = 'AF402', detail = 'weekly_summary';
  end if;

  if not exists (
    select 1 from intelligence.consents
    where person_id = p_person_id and ended_at is null and text_version = p_consent_version
  ) then
    raise exception 'the person has not given the AI consent in force' using errcode = 'AF432';
  end if;

  select count(*)::integer into used
  from intelligence.runs
  where actor_person_id = p_person_id
    and capability = 'weekly-summary'
    and started_at >= this_week at time zone p_timezone
    and (outcome is null or outcome = 'answered');

  if used >= ceiling then
    insert into intelligence.runs (
      id, capability, actor_person_id, subject_person_id, contract, week_starts_on,
      finished_at, outcome
    ) values (
      p_command_id, 'weekly-summary', p_person_id, p_person_id, p_contract, p_week_starts_on,
      clock_timestamp(), 'over-ceiling'
    );
    perform system.finish_idempotency(
      receipt.receipt_id, 200::smallint, 'weekly-summary-over-ceiling', 'intelligence_run', p_command_id);
    return jsonb_build_object('state', 'over-ceiling', 'renews_at', renews_at);
  end if;

  -- Everything that could refuse has been ruled out: now, and only now, her weeks are read.
  sessions := execution.read_my_sessions_between(
    p_person_id, p_timezone, p_week_starts_on - 7, p_week_starts_on + 6);

  select coalesce(jsonb_agg(jsonb_build_object(
    'date', day->>'local_date',
    'meals', (day->>'meal_count')::integer,
    'energy_kcal', amount.energy,
    'protein_g', amount.protein,
    'carbohydrates_g', amount.carbohydrates,
    'fat_g', amount.fat
  ) order by day->>'local_date'), '[]'::jsonb)
  into nutrition_days
  from jsonb_array_elements(nutrition.read_daily_summaries(
    p_person_id, p_week_starts_on - 7, p_week_starts_on + 6, p_timezone)->'data') as day
  left join lateral (
    select max((total->>'value')::numeric) filter (where total->>'nutrient_code' = 'energy') as energy,
           max((total->>'value')::numeric) filter (where total->>'nutrient_code' = 'protein') as protein,
           max((total->>'value')::numeric) filter (where total->>'nutrient_code' = 'carbohydrates') as carbohydrates,
           max((total->>'value')::numeric) filter (where total->>'nutrient_code' = 'fat') as fat
    from jsonb_array_elements(day->'nutrient_totals') as total
  ) as amount on true
  where not (day->>'hidden')::boolean and (day->>'meal_count')::integer > 0;

  -- Only the four the summary speaks of, and only in the unit it speaks them in.
  select coalesce(jsonb_agg(jsonb_build_object(
    'nutrient', target->>'nutrient_code',
    'minimum', (target->>'minimum')::numeric,
    'maximum', (target->>'maximum')::numeric,
    'exact', (target->>'exact')::numeric
  ) order by target->>'nutrient_code'), '[]'::jsonb)
  into goal
  from jsonb_array_elements(
    coalesce(nutrition.read_my_goals(p_person_id)->'active'->'targets', '[]'::jsonb)) as target
  where (target->>'nutrient_code' = 'energy' and target->>'unit' = 'kcal')
     or (target->>'nutrient_code' in ('protein', 'carbohydrates', 'fat') and target->>'unit' = 'g');

  insert into intelligence.runs (
    id, capability, actor_person_id, subject_person_id, contract, week_starts_on
  ) values (
    p_command_id, 'weekly-summary', p_person_id, p_person_id, p_contract, p_week_starts_on
  );
  perform system.finish_idempotency(
    receipt.receipt_id, 200::smallint, 'weekly-summary-run-opened', 'intelligence_run', p_command_id);

  return jsonb_build_object(
    'state', 'opened',
    'run_id', p_command_id,
    'logged', jsonb_build_object(
      'week_starts_on', p_week_starts_on,
      'in_progress', p_week_starts_on = this_week::date,
      'sessions', sessions,
      'nutrition_days', nutrition_days,
      'goal', goal));
end
$function$;

-- ---------------------------------------------------------------------------
-- Ask (OP-ITL-004), second half: close the run and keep what it wrote
-- ---------------------------------------------------------------------------

create function intelligence.finish_weekly_summary(
  p_person_id uuid,
  p_run_id uuid,
  p_outcome text,
  p_model text,
  p_input_tokens integer,
  p_output_tokens integer,
  p_summary jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  run intelligence.runs%rowtype;
  kept intelligence.weekly_summaries%rowtype;
begin
  if access_control.actor_kind() is distinct from 'person'
     or access_control.person() is distinct from p_person_id then
    raise exception 'a weekly summary is closed only by its own person' using errcode = '42501';
  end if;
  if p_outcome is null
     or p_outcome not in ('answered', 'unavailable', 'refused', 'nothing-logged')
     or (p_outcome = 'answered') <> (p_summary is not null) then
    raise exception 'a run ends answered with its summary, or without one' using errcode = '22023';
  end if;

  select * into run from intelligence.runs
  where id = p_run_id and actor_person_id = p_person_id and capability = 'weekly-summary'
  for update;
  if not found then
    raise exception 'run not found' using errcode = 'P0002';
  end if;

  -- Closing twice changes nothing: the run says what it became the first time.
  if run.outcome is null then
    update intelligence.runs
    set outcome = p_outcome, finished_at = clock_timestamp(), model = p_model,
        input_tokens = p_input_tokens, output_tokens = p_output_tokens
    where id = p_run_id;

    if p_outcome = 'answered' then
      insert into intelligence.weekly_summaries (
        person_id, week_starts_on, run_id, overview, training, nutrition, changes, sources, model
      ) values (
        p_person_id, run.week_starts_on, p_run_id,
        p_summary->>'overview', p_summary->>'training', p_summary->>'nutrition', p_summary->>'changes',
        array(select jsonb_array_elements_text(p_summary->'sources')), p_model
      )
      -- Asking again replaces it: the week keeps one summary.
      on conflict (person_id, week_starts_on) do update
      set run_id = excluded.run_id, overview = excluded.overview, training = excluded.training,
          nutrition = excluded.nutrition, changes = excluded.changes, sources = excluded.sources,
          model = excluded.model, generated_at = clock_timestamp();
    end if;
  end if;

  select * into kept from intelligence.weekly_summaries
  where person_id = p_person_id and run_id = p_run_id;
  return case when found then intelligence.weekly_summary_json(kept) end;
end
$function$;

-- ---------------------------------------------------------------------------
-- Read one of my summaries: what a replayed request answers
-- ---------------------------------------------------------------------------

create function intelligence.read_weekly_summary(p_person_id uuid, p_week_starts_on date)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $function$
declare
  kept intelligence.weekly_summaries%rowtype;
begin
  if access_control.actor_kind() is distinct from 'person'
     or access_control.person() is distinct from p_person_id then
    return null;
  end if;
  select * into kept from intelligence.weekly_summaries
  where person_id = p_person_id and week_starts_on = p_week_starts_on;
  return case when found then intelligence.weekly_summary_json(kept) end;
end
$function$;

-- ---------------------------------------------------------------------------
-- List my summaries (OP-ITL-005)
-- ---------------------------------------------------------------------------

create function intelligence.list_weekly_summaries(p_person_id uuid, p_before date, p_limit integer)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $function$
declare
  size integer := least(greatest(coalesce(p_limit, 20), 1), 50);
  page jsonb;
  more boolean;
begin
  if access_control.actor_kind() is distinct from 'person'
     or access_control.person() is distinct from p_person_id then
    return jsonb_build_object('data', '[]'::jsonb,
      'page', jsonb_build_object('next_cursor', null, 'has_more', false));
  end if;

  select coalesce(jsonb_agg(intelligence.weekly_summary_json(chosen.kept) order by chosen.week desc)
                    filter (where chosen.position <= size), '[]'::jsonb),
         count(*) > size
  into page, more
  from (
    select kept, kept.week_starts_on as week,
           row_number() over (order by kept.week_starts_on desc) as position
    from intelligence.weekly_summaries as kept
    where kept.person_id = p_person_id
      and (p_before is null or kept.week_starts_on < p_before)
    order by kept.week_starts_on desc
    limit size + 1
  ) as chosen;

  return jsonb_build_object(
    'data', page,
    'page', jsonb_build_object(
      'next_cursor', case when more then page->(jsonb_array_length(page) - 1)->>'week_starts_on' end,
      'has_more', more));
end
$function$;

-- ---------------------------------------------------------------------------
-- Delete one of my summaries (OP-ITL-006)
-- ---------------------------------------------------------------------------

create function intelligence.delete_weekly_summary(
  p_person_id uuid,
  p_week_starts_on date,
  p_idempotency_key uuid,
  p_command_id uuid,
  p_request_hash bytea
)
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  receipt record;
  removed uuid;
begin
  if access_control.actor_kind() is distinct from 'person'
     or access_control.person() is distinct from p_person_id then
    raise exception 'a weekly summary is deleted only by its own person' using errcode = '42501';
  end if;

  select * into receipt from system.begin_idempotency(
    p_person_id, 'OP-ITL-006', p_idempotency_key, p_command_id, p_request_hash);
  if not receipt.claimed then
    return;
  end if;

  delete from intelligence.weekly_summaries
  where person_id = p_person_id and week_starts_on = p_week_starts_on
  returning id into removed;
  if removed is null then
    raise exception 'weekly summary not found' using errcode = 'P0002';
  end if;

  perform system.finish_idempotency(
    receipt.receipt_id, 200::smallint, 'weekly-summary-deleted', 'intelligence_weekly_summary', removed);
end
$function$;

alter function intelligence.reject_run_rewrite() owner to allfit_owner;
alter function intelligence.weekly_summary_json(intelligence.weekly_summaries) owner to allfit_owner;
alter function intelligence.begin_weekly_summary(uuid, date, text, text, text, uuid, uuid, bytea) owner to allfit_owner;
alter function intelligence.finish_weekly_summary(uuid, uuid, text, text, integer, integer, jsonb) owner to allfit_owner;
alter function intelligence.read_weekly_summary(uuid, date) owner to allfit_owner;
alter function intelligence.list_weekly_summaries(uuid, date, integer) owner to allfit_owner;
alter function intelligence.delete_weekly_summary(uuid, date, uuid, uuid, bytea) owner to allfit_owner;

revoke all on function intelligence.reject_run_rewrite() from public;
revoke all on function intelligence.weekly_summary_json(intelligence.weekly_summaries) from public;
revoke all on function intelligence.begin_weekly_summary(uuid, date, text, text, text, uuid, uuid, bytea) from public;
revoke all on function intelligence.finish_weekly_summary(uuid, uuid, text, text, integer, integer, jsonb) from public;
revoke all on function intelligence.read_weekly_summary(uuid, date) from public;
revoke all on function intelligence.list_weekly_summaries(uuid, date, integer) from public;
revoke all on function intelligence.delete_weekly_summary(uuid, date, uuid, uuid, bytea) from public;

grant execute on function intelligence.begin_weekly_summary(uuid, date, text, text, text, uuid, uuid, bytea) to allfit_api;
grant execute on function intelligence.finish_weekly_summary(uuid, uuid, text, text, integer, integer, jsonb) to allfit_api;
grant execute on function intelligence.read_weekly_summary(uuid, date) to allfit_api;
grant execute on function intelligence.list_weekly_summaries(uuid, date, integer) to allfit_api;
grant execute on function intelligence.delete_weekly_summary(uuid, date, uuid, uuid, bytea) to allfit_api;
