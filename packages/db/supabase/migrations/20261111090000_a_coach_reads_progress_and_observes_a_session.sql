-- HU-STUDIO-056, HU-STUDIO-057 and HU-STUDIO-058 — the coach who attends a person reads
-- how her training is going, and leaves his reading of a session beside what she declared.
--
-- OP-EXE-019 computes her progress when it is read (ADR-036), from the sessions the
-- screening of `20261107090000` admits and nothing else: inside the relationship under
-- `relationship_training`, on her own under `prior_training_history`, never one she hid.
-- Hiding a session therefore withdraws it from every total and every best by
-- construction, and taking the hiding back returns it; nothing is stored that could
-- outlive what she shares. It is `compare_my_periods` again, deliberately duplicated:
-- no adherence, no programme, no body weight and no Pro, and a movement only she can
-- name is counted without its name. The estimated one-repetition maximum is Epley's,
-- named in the document with its version.
--
-- OP-EXE-010 and OP-EXE-011 let the coach write an observation and correct it:
--
--   · ADR-016 strictly. A training observation needs `relationship_training` at
--     `contribute` and lands only on a session that relationship produced: what she
--     trained on her own is read, never written on, and the foreign key says so. Pain or
--     a limitation is health context and needs `health_context` at `contribute`; it is
--     read only while that category is shared, and its read is recorded under it.
--   · It never replaces what she declared. `person_declared` marks a transcription of
--     what she said: hers, with the coach recorded only as who captured it.
--   · Only its author corrects it, while he still attends her and she still shares the
--     category at `contribute`. Each correction keeps the text it replaced, the new one
--     and the reason, append-only. The observation keeps who wrote it, where and as what.
--   · An author finds his observation only inside a correction of his own
--     (`observation_revision`); everywhere else his reach is the screening's, so a
--     category she takes back hides his notes from him too.
--
-- Writes are not access events; the reads that return an observation record it.

set lock_timeout = '5s';
set statement_timeout = '60s';

-- ---------------------------------------------------------------------------
-- The observation, and how it changed
-- ---------------------------------------------------------------------------

-- A session as the relationship that produced it: what an observation must point at.
alter table execution.executed_sessions
  add constraint uq_executed_sessions_context unique (id, context_relationship_id);

create table execution.professional_observations (
  id uuid not null,
  person_id uuid not null,
  executed_session_id uuid not null,
  relationship_id uuid not null,
  organization_id uuid not null,
  author_assignment_id uuid not null,
  author_membership_id uuid not null,
  data_classification_code text not null,
  provenance identity.provenance not null,
  content text not null,
  revision_number integer not null default 1,
  created_at timestamptz not null default clock_timestamp(),
  revised_at timestamptz,
  constraint pk_professional_observations primary key (id),
  constraint uq_professional_observations_person unique (id, person_id),
  constraint fk_professional_observations_session foreign key (executed_session_id, person_id) references execution.executed_sessions (id, person_id) on delete restrict,
  -- Only a session this relationship produced: never one she trained on her own.
  constraint fk_professional_observations_session_context foreign key (executed_session_id, relationship_id) references execution.executed_sessions (id, context_relationship_id) on delete restrict,
  constraint fk_professional_observations_relationship foreign key (relationship_id, person_id, organization_id) references relationships.service_relationships (id, person_id, organization_id) on delete restrict,
  constraint fk_professional_observations_author foreign key (author_assignment_id, relationship_id, person_id, organization_id, author_membership_id) references relationships.relationship_professional_assignments (id, relationship_id, person_id, organization_id, membership_id) on delete restrict,
  constraint fk_professional_observations_classification foreign key (data_classification_code) references privacy.data_classifications (code) on delete restrict,
  constraint ck_professional_observations_classification check (data_classification_code in ('training', 'health')),
  constraint ck_professional_observations_provenance check (provenance in ('professional_observation', 'person_declared')),
  constraint ck_professional_observations_content check (btrim(content) <> '' and char_length(content) <= 2000),
  constraint ck_professional_observations_revision check (
    revision_number >= 1 and (revision_number = 1) = (revised_at is null)
  )
);

create index idx_professional_observations_session
  on execution.professional_observations (executed_session_id, relationship_id, created_at);
create index idx_professional_observations_person
  on execution.professional_observations (person_id, created_at);
create index idx_professional_observations_author
  on execution.professional_observations (author_assignment_id);

alter table execution.professional_observations owner to allfit_owner;
alter table execution.professional_observations enable row level security;
alter table execution.professional_observations force row level security;
revoke all on execution.professional_observations from public, allfit_api;

create function execution.keep_professional_observation_tg()
returns trigger
language plpgsql
set search_path = pg_catalog
as $function$
begin
  if (new.id, new.person_id, new.executed_session_id, new.relationship_id, new.organization_id,
      new.author_assignment_id, new.author_membership_id, new.data_classification_code,
      new.provenance, new.created_at)
     is distinct from
     (old.id, old.person_id, old.executed_session_id, old.relationship_id, old.organization_id,
      old.author_assignment_id, old.author_membership_id, old.data_classification_code,
      old.provenance, old.created_at) then
    raise exception 'an observation keeps who wrote it, where and as what' using errcode = '23514';
  end if;
  if new.revision_number <> old.revision_number + 1 or new.revised_at is null then
    raise exception 'an observation changes only as its next revision' using errcode = '23514';
  end if;
  return new;
end
$function$;

alter function execution.keep_professional_observation_tg() owner to allfit_owner;
revoke all on function execution.keep_professional_observation_tg() from public, allfit_api;

create trigger trg_professional_observations_before_update_keep
before update on execution.professional_observations
for each row execute function execution.keep_professional_observation_tg();

create table execution.observation_revisions (
  id uuid not null,
  observation_id uuid not null,
  person_id uuid not null,
  revision_from integer not null,
  revision_to integer not null,
  actor_assignment_id uuid not null,
  actor_membership_id uuid not null,
  reason text not null,
  before_content text not null,
  after_content text not null,
  created_at timestamptz not null default clock_timestamp(),
  constraint pk_observation_revisions primary key (id),
  constraint fk_observation_revisions_observation foreign key (observation_id, person_id) references execution.professional_observations (id, person_id) on delete restrict,
  constraint fk_observation_revisions_actor foreign key (actor_assignment_id) references relationships.relationship_professional_assignments (id) on delete restrict,
  constraint uq_observation_revisions_step unique (observation_id, revision_to),
  constraint ck_observation_revisions_step check (revision_from >= 1 and revision_to = revision_from + 1),
  constraint ck_observation_revisions_reason check (btrim(reason) <> '' and char_length(reason) <= 500),
  constraint ck_observation_revisions_content check (before_content <> after_content)
);

create index idx_observation_revisions_person
  on execution.observation_revisions (person_id, created_at);
create index idx_observation_revisions_actor
  on execution.observation_revisions (actor_assignment_id);

alter table execution.observation_revisions owner to allfit_owner;
alter table execution.observation_revisions enable row level security;
alter table execution.observation_revisions force row level security;
revoke all on execution.observation_revisions from public, allfit_api;

create trigger trg_observation_revisions_append_only
  before update or delete or truncate on execution.observation_revisions
  for each statement execute function execution.refuse_revision_change();

-- ---------------------------------------------------------------------------
-- Row policies
-- ---------------------------------------------------------------------------

create policy professional_observations_select_self on execution.professional_observations
  for select to allfit_owner
  using (person_id = access_control.person());

-- Inside a screening of their relationship, on a session it shows, under each one's category.
create policy professional_observations_select_screening on execution.professional_observations
  for select to allfit_owner
  using (
    relationship_id::text = (select access_control.contract_scope('session_screening'))
    and exists (
      select 1 from execution.executed_sessions as session
      where session.id = professional_observations.executed_session_id
    )
    and (
      (data_classification_code = 'training'
       and access_control.can_access(relationship_id, 'relationship_training', 'read'))
      or (data_classification_code = 'health'
          and access_control.can_access(relationship_id, 'health_context', 'read'))
    )
  );

-- The one observation a correction names, to its own author.
create policy professional_observations_select_revision on execution.professional_observations
  for select to allfit_owner
  using (
    id::text = (select access_control.contract_scope('observation_revision'))
    and author_membership_id::text = current_setting('app.actor_membership_id', true)
    and access_control.owns_membership(author_membership_id)
  );

create policy professional_observations_insert_contribute on execution.professional_observations
  for insert to allfit_owner
  with check (
    author_membership_id::text = current_setting('app.actor_membership_id', true)
    and access_control.owns_membership(author_membership_id)
    and (
      (data_classification_code = 'training'
       and access_control.can_access(relationship_id, 'relationship_training', 'contribute'))
      or (data_classification_code = 'health'
          and access_control.can_access(relationship_id, 'health_context', 'contribute'))
    )
  );

create policy professional_observations_update_author on execution.professional_observations
  for update to allfit_owner
  using (
    author_membership_id::text = current_setting('app.actor_membership_id', true)
    and access_control.owns_membership(author_membership_id)
  )
  with check (
    author_membership_id::text = current_setting('app.actor_membership_id', true)
    and access_control.owns_membership(author_membership_id)
    and (
      (data_classification_code = 'training'
       and access_control.can_access(relationship_id, 'relationship_training', 'contribute'))
      or (data_classification_code = 'health'
          and access_control.can_access(relationship_id, 'health_context', 'contribute'))
    )
  );

create policy observation_revisions_select_self on execution.observation_revisions
  for select to allfit_owner
  using (person_id = access_control.person());

-- Recorded by the observation's own author, whom only a correction of his lets find it.
create policy observation_revisions_insert_author on execution.observation_revisions
  for insert to allfit_owner
  with check (
    actor_membership_id::text = current_setting('app.actor_membership_id', true)
    and access_control.owns_membership(actor_membership_id)
    and exists (
      select 1 from execution.professional_observations as observation
      where observation.id = observation_revisions.observation_id
        and observation.author_membership_id = observation_revisions.actor_membership_id
    )
  );

-- ---------------------------------------------------------------------------
-- Shared pieces
-- ---------------------------------------------------------------------------

-- `planning.require_training_grant` for any category: AF430 names what is missing.
create function execution.require_category_grant(
  p_relationship_id uuid,
  p_scope_code text,
  p_level privacy.access_level
)
returns table (grant_id uuid, scope_version integer)
language plpgsql
volatile
security definer
set search_path = pg_catalog
as $function$
begin
  return query
  select shared.grant_id, definition.version_number
  from access_control.grant_of(p_relationship_id, p_scope_code) as shared
  left join privacy.scope_definitions as definition on definition.id = shared.scope_definition_id
  where p_level = 'read' or shared.access_level = 'contribute';

  if not found then
    raise exception 'the person does not share this category at this level'
      using errcode = 'AF430', detail = p_scope_code || ':' || p_level::text;
  end if;

  -- What she shares still stands; the gym may not use it while her service is paused.
  if p_level = 'contribute' and access_control.has_service_block(p_relationship_id) then
    raise exception 'the person''s service with this organization is paused'
      using errcode = 'AF424';
  end if;
end
$function$;

alter function execution.require_category_grant(uuid, text, privacy.access_level) owner to allfit_owner;
revoke all on function execution.require_category_grant(uuid, text, privacy.access_level)
  from public, allfit_api;

-- The actor's own live assignment on a relationship: the predicate `actor_is_assigned` asks.
create function execution.attending_assignment(p_relationship_id uuid, p_membership_id uuid)
returns uuid
language sql
stable
security definer
set search_path = pg_catalog
as $function$
  select professional.id
  from relationships.relationship_professional_assignments as professional
  where professional.relationship_id = p_relationship_id
    and professional.membership_id = p_membership_id
    and professional.status = 'active'
    and professional.valid_from <= clock_timestamp()
    and (professional.valid_to is null or professional.valid_to > clock_timestamp())
    and (
      professional.kind = 'holder'
      or (
        professional.accepted_by_person_at is not null
        and professional.ends_on is not null
        and professional.ends_on >= current_date
      )
    )
  order by (professional.kind = 'holder') desc, professional.id
  limit 1
$function$;

alter function execution.attending_assignment(uuid, uuid) owner to allfit_owner;
revoke all on function execution.attending_assignment(uuid, uuid) from public, allfit_api;

-- An observation as Studio shows it; only while a scope lets the caller see it.
create function execution.observation_document(p_observation_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog
as $function$
  select jsonb_build_object(
    'id', observation.id,
    'execution_id', observation.executed_session_id,
    'category', observation.data_classification_code,
    'provenance', observation.provenance,
    'content', observation.content,
    'revision_number', observation.revision_number,
    'created_at', observation.created_at,
    'revised_at', observation.revised_at,
    'author_name', author.display_name,
    'authored_by_me',
      observation.author_membership_id::text = current_setting('app.actor_membership_id', true)
  )
  from execution.professional_observations as observation
  join organizations.organization_memberships as membership
    on membership.id = observation.author_membership_id
  join identity.people as author on author.id = membership.person_id
  where observation.id = p_observation_id
$function$;

alter function execution.observation_document(uuid) owner to allfit_owner;
revoke all on function execution.observation_document(uuid) from public, allfit_api;

-- ---------------------------------------------------------------------------
-- OP-EXE-019
-- ---------------------------------------------------------------------------

/*
 * Her training week by week or month by month, from what this coach may see of it: each
 * period's sessions, time, work sets, volume and muscles, and each movement's best load
 * in its latest period against the last period before it, with the best estimate of the
 * window. `scope_required` only when she shares neither training category.
 */
create function execution.read_client_progress(
  p_person_id uuid,
  p_organization_id uuid,
  p_subject_person_id uuid,
  p_timezone text,
  p_period text,
  p_count integer
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  attending record;
  inside record;
  prior record;
  problems text[] := array[]::text[];
  step interval;
  current_start date;
  first_start date;
  document jsonb;
  previous_purpose text := current_setting('app.contract_scope_purpose', true);
  previous_id text := current_setting('app.contract_scope_id', true);
  previous_token text := current_setting('app.contract_scope_token', true);
begin
  select * into attending
  from execution.require_attending_coach(p_person_id, p_organization_id, p_subject_person_id);
  if nullif(current_setting('app.request_id', true), '') is null then
    raise exception 'request id required for audited read' using errcode = '22023';
  end if;
  if p_period is null or p_period not in ('week', 'month') then
    problems := array_append(problems, 'period');
  end if;
  if p_count is null or p_count not between 1 and 12 then
    problems := array_append(problems, 'count');
  end if;
  if p_timezone is null
     or not exists (select 1 from pg_catalog.pg_timezone_names as zone where zone.name = p_timezone) then
    problems := array_append(problems, 'timezone');
  end if;
  if cardinality(problems) > 0 then
    raise exception 'progress is 1 to 12 weeks or months in a known zone' using errcode = '22023',
      detail = to_jsonb(problems)::text;
  end if;
  perform set_config('app.purpose', 'studio_training_review', true);

  select * into inside from execution.shared_category(attending.relationship_id, 'relationship_training');
  select * into prior from execution.shared_category(attending.relationship_id, 'prior_training_history');

  if inside.grant_id is null and prior.grant_id is null then
    perform privacy.log_access_event(
      p_subject_person_id, null, attending.relationship_id, null, null, null, null,
      'live', 'execution.executed_sessions', 'denied'
    );
    return jsonb_build_object(
      'outcome', 'scope_required',
      'required_scope', jsonb_build_object('code', 'relationship_training', 'level', 'read')
    );
  end if;
  if inside.grant_id is not null then
    perform privacy.log_access_event(
      p_subject_person_id, null, attending.relationship_id, inside.grant_id, null,
      'relationship_training', inside.scope_version, 'live', 'execution.executed_sessions', 'allowed'
    );
  end if;
  if prior.grant_id is not null then
    perform privacy.log_access_event(
      p_subject_person_id, null, attending.relationship_id, prior.grant_id, null,
      'prior_training_history', prior.scope_version, 'live', 'execution.executed_sessions', 'allowed'
    );
  end if;

  perform access_control.open_contract_scope('session_screening', attending.relationship_id);

  step := case p_period when 'week' then interval '1 week' else interval '1 month' end;
  current_start := date_trunc(p_period, clock_timestamp() at time zone p_timezone)::date;
  first_start := (current_start - step * (p_count - 1))::date;

  with
  bounded as (
    select series.index,
           (current_start - step * (p_count - 1 - series.index))::date as starts_on,
           (current_start - step * (p_count - 2 - series.index))::date as ends_before
    from generate_series(0, p_count - 1) as series(index)
  ),
  -- The screening decides which sessions; this only keeps the finished, valid ones.
  finished as (
    select session.id, session.started_at, session.ended_at,
           (session.started_at at time zone p_timezone)::date as trained_on
    from execution.executed_sessions as session
    where session.person_id = p_subject_person_id
      and session.execution_status = 'completed'
      and session.validation_status <> 'annulled'
      and session.annulled_at is null
      and session.ended_at is not null
      and (session.started_at at time zone p_timezone)::date >= first_start
  ),
  work as (
    select finished.trained_on, sets.movement_id,
           sets.load_value * unit.to_canonical_factor as load_kg, sets.achieved_reps
    from finished
    join execution.strength_sets as sets on sets.executed_session_id = finished.id
    left join catalog.units as unit on unit.code = sets.load_unit_code and unit.dimension = 'mass'
    where sets.kind <> 'warmup'
  ),
  loading as (
    select distinct on (link.movement_id) link.movement_id, muscle.code, muscle.name
    from catalog.movement_muscles as link
    join catalog.muscles as muscle on muscle.id = link.muscle_id
    where muscle.status = 'published'
      and link.movement_id in (select work.movement_id from work)
    order by link.movement_id, link.is_primary desc, muscle.display_order
  ),
  muscles as (
    select bounded.index, loading.code, loading.name, count(*)::integer as sets
    from work
    join bounded on work.trained_on >= bounded.starts_on and work.trained_on < bounded.ends_before
    join loading on loading.movement_id = work.movement_id
    group by bounded.index, loading.code, loading.name
  ),
  per_period as (
    select bounded.index, bounded.starts_on, bounded.ends_before,
           (select count(*)::integer from finished
            where finished.trained_on >= bounded.starts_on and finished.trained_on < bounded.ends_before) as sessions,
           coalesce((select sum(extract(epoch from (finished.ended_at - finished.started_at)))::integer from finished
                     where finished.trained_on >= bounded.starts_on and finished.trained_on < bounded.ends_before), 0)
             as trained_seconds,
           (select count(*)::integer from work
            where work.trained_on >= bounded.starts_on and work.trained_on < bounded.ends_before) as work_sets,
           (select round(sum(work.load_kg * work.achieved_reps), 2) from work
            where work.trained_on >= bounded.starts_on and work.trained_on < bounded.ends_before) as volume_kg
    from bounded
  ),
  best as (
    select work.movement_id, bounded.index, max(work.load_kg) as best_kg
    from work
    join bounded on work.trained_on >= bounded.starts_on and work.trained_on < bounded.ends_before
    where work.movement_id is not null and work.load_kg is not null and work.achieved_reps > 0
    group by work.movement_id, bounded.index
  ),
  compared as (
    select latest.movement_id, latest.best_kg,
           (select earlier.best_kg from best as earlier
            where earlier.movement_id = latest.movement_id and earlier.index < latest.index
            order by earlier.index desc limit 1) as previous_best_kg
    from best as latest
    where latest.index = (select max(other.index) from best as other where other.movement_id = latest.movement_id)
  ),
  -- Epley, where it is meant to hold: one to twelve repetitions.
  estimated as (
    select work.movement_id, max(work.load_kg * (1 + work.achieved_reps / 30.0)) as best_e1rm_kg
    from work
    where work.movement_id is not null and work.load_kg is not null and work.achieved_reps between 1 and 12
    group by work.movement_id
  ),
  ranked as (
    select compared.movement_id, compared.best_kg, compared.previous_best_kg,
           estimated.best_e1rm_kg, movement.name
    from compared
    left join estimated on estimated.movement_id = compared.movement_id
    -- Her own movements are counted, never named: their names are hers.
    left join catalog.movements as movement
      on movement.id = compared.movement_id
     and (movement.content_scope = 'global' or movement.owner_organization_id = p_organization_id)
    order by compared.best_kg desc, movement.name nulls last, compared.movement_id
    limit 50
  )
  select jsonb_build_object(
    'outcome', 'found',
    'period', p_period,
    'sources', (
      select jsonb_agg(jsonb_build_object('code', source.code, 'version', source.version) order by source.position)
      from (values (1, 'relationship_training', inside.grant_id, inside.scope_version),
                   (2, 'prior_training_history', prior.grant_id, prior.scope_version))
        as source(position, code, grant_id, version)
      where source.grant_id is not null
    ),
    'algorithm', jsonb_build_object('e1rm', 'epley', 'version', 1),
    'periods', (select jsonb_agg(jsonb_build_object(
        'starts_on', per_period.starts_on,
        'ends_before', per_period.ends_before,
        'sessions', per_period.sessions,
        'trained_seconds', per_period.trained_seconds,
        'work_sets', per_period.work_sets,
        'volume_kg', per_period.volume_kg,
        'muscles', coalesce((select jsonb_agg(jsonb_build_object(
            'code', muscles.code, 'name', muscles.name, 'sets', muscles.sets)
            order by muscles.sets desc, muscles.name)
          from muscles where muscles.index = per_period.index), '[]'::jsonb))
        order by per_period.index) from per_period),
    'movements', coalesce((select jsonb_agg(jsonb_build_object(
        'movement_id', ranked.movement_id,
        'name', ranked.name,
        'best_kg', round(ranked.best_kg, 2),
        'previous_best_kg', round(ranked.previous_best_kg, 2),
        'change_kg', round(ranked.best_kg - ranked.previous_best_kg, 2),
        'best_e1rm_kg', round(ranked.best_e1rm_kg, 2),
        'bests', (select jsonb_agg(round(each_best.best_kg, 2) order by bounded.index)
          from bounded
          left join best as each_best
            on each_best.movement_id = ranked.movement_id and each_best.index = bounded.index))
        order by ranked.best_kg desc, ranked.name nulls last, ranked.movement_id)
      from ranked), '[]'::jsonb)
  )
  into document;

  perform planning.resume_contract_scope(previous_purpose, previous_id, previous_token);
  return document;
end
$function$;

alter function execution.read_client_progress(uuid, uuid, uuid, text, text, integer) owner to allfit_owner;
revoke all on function execution.read_client_progress(uuid, uuid, uuid, text, text, integer) from public;
grant execute on function execution.read_client_progress(uuid, uuid, uuid, text, text, integer) to allfit_api;

-- ---------------------------------------------------------------------------
-- OP-EXE-010
-- ---------------------------------------------------------------------------

/*
 * The attending coach's reading of one finished, valid session this relationship
 * produced. The category decides the permission it needs at `contribute`; the
 * Command-Id is the observation's id.
 */
create function execution.record_observation(
  p_person_id uuid,
  p_organization_id uuid,
  p_subject_person_id uuid,
  p_execution_id uuid,
  p_category text,
  p_provenance text,
  p_content text,
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
  attending record;
  receipt record;
  scope_code text;
  author_id uuid;
  problems text[] := array[]::text[];
  seen record;
  document jsonb;
  previous_purpose text := current_setting('app.contract_scope_purpose', true);
  previous_id text := current_setting('app.contract_scope_id', true);
  previous_token text := current_setting('app.contract_scope_token', true);
begin
  select * into attending
  from execution.require_attending_coach(p_person_id, p_organization_id, p_subject_person_id);
  if not access_control.has_capability(p_organization_id, 'observe_training') then
    raise exception 'this action requires observe_training' using errcode = '42501';
  end if;

  scope_code := case p_category
    when 'training' then 'relationship_training'
    when 'health' then 'health_context'
  end;
  if scope_code is null then
    raise exception 'an observation is training or health context' using errcode = '22023',
      detail = '["category"]';
  end if;
  perform execution.require_category_grant(attending.relationship_id, scope_code, 'contribute');

  if p_provenance is null or p_provenance not in ('professional_observation', 'person_declared') then
    problems := array_append(problems, 'provenance');
  end if;
  if p_content is null or btrim(p_content) = '' or char_length(btrim(p_content)) > 2000 then
    problems := array_append(problems, 'content');
  end if;
  if cardinality(problems) > 0 then
    raise exception 'the observation is not valid' using errcode = '22023',
      detail = to_jsonb(problems)::text;
  end if;

  select * into receipt from system.begin_idempotency(
    p_person_id, 'OP-EXE-010', p_idempotency_key, p_command_id, p_request_hash
  );
  perform 1
  from relationships.service_relationships as relationship
  where relationship.id = attending.relationship_id
  for share;

  perform access_control.open_contract_scope('session_screening', attending.relationship_id);
  if not receipt.claimed then
    document := execution.observation_document(receipt.aggregate_id);
    perform planning.resume_contract_scope(previous_purpose, previous_id, previous_token);
    return query select document, true;
    return;
  end if;

  -- Read under the lock: an end committed meanwhile ended this assignment, as after it.
  author_id := execution.attending_assignment(attending.relationship_id, attending.membership_id);
  if author_id is null then
    raise exception 'client not found' using errcode = 'P0002';
  end if;

  select session.id, session.context_relationship_id into seen
  from execution.executed_sessions as session
  where session.id = p_execution_id
    and session.person_id = p_subject_person_id
    and session.execution_status = 'completed'
    and session.validation_status <> 'annulled'
    and session.annulled_at is null
    and session.ended_at is not null;
  if seen.id is null then
    raise exception 'execution not found' using errcode = 'P0002';
  end if;
  -- Seen, but trained on her own: read under `prior_training_history`, never written on.
  if seen.context_relationship_id is distinct from attending.relationship_id then
    raise exception 'only a session this relationship produced takes an observation'
      using errcode = '22023', detail = '["execution"]';
  end if;

  insert into execution.professional_observations (
    id, person_id, executed_session_id, relationship_id, organization_id,
    author_assignment_id, author_membership_id, data_classification_code, provenance, content
  ) values (
    p_command_id, p_subject_person_id, p_execution_id, attending.relationship_id, p_organization_id,
    author_id, attending.membership_id, p_category, p_provenance::identity.provenance, btrim(p_content)
  );

  perform system.enqueue_outbox_event(
    'professional_observation', p_command_id, 'execution.observation_created.v1',
    jsonb_build_object(
      'observation_id', p_command_id,
      'execution_id', p_execution_id,
      'person_id', p_subject_person_id,
      'relationship_id', attending.relationship_id,
      'category', p_category
    )
  );
  perform system.finish_idempotency(
    receipt.receipt_id, 201::smallint, 'observation-recorded', 'professional_observation', p_command_id
  );

  document := execution.observation_document(p_command_id);
  perform planning.resume_contract_scope(previous_purpose, previous_id, previous_token);
  return query select document, false;
end
$function$;

alter function execution.record_observation(uuid, uuid, uuid, uuid, text, text, text, uuid, uuid, bytea)
  owner to allfit_owner;
revoke all on function execution.record_observation(uuid, uuid, uuid, uuid, text, text, text, uuid, uuid, bytea)
  from public;
grant execute on function execution.record_observation(uuid, uuid, uuid, uuid, text, text, text, uuid, uuid, bytea)
  to allfit_api;

-- ---------------------------------------------------------------------------
-- OP-EXE-011
-- ---------------------------------------------------------------------------

/*
 * Its author corrects an observation, over the revision he last saw, with a reason. The
 * same conditions as writing it hold now: he attends her and she shares its category at
 * `contribute`. Anyone else's observation, or one he cannot reach, is `P0002`.
 */
create function execution.revise_observation(
  p_person_id uuid,
  p_organization_id uuid,
  p_observation_id uuid,
  p_expected_revision integer,
  p_content text,
  p_reason text,
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
  actor_membership_id uuid;
  observation record;
  attending record;
  author_id uuid;
  problems text[] := array[]::text[];
  receipt record;
  current record;
  document jsonb;
  previous_purpose text := current_setting('app.contract_scope_purpose', true);
  previous_id text := current_setting('app.contract_scope_id', true);
  previous_token text := current_setting('app.contract_scope_token', true);
begin
  if access_control.actor_kind() is distinct from 'person'
     or access_control.person() is distinct from p_person_id then
    raise exception 'person actor mismatch' using errcode = '42501';
  end if;
  select membership.id into actor_membership_id
  from organizations.organization_memberships as membership
  join organizations.organizations as organization on organization.id = membership.organization_id
  where membership.organization_id = p_organization_id
    and membership.person_id = p_person_id
    and membership.status = 'active'
    and organization.status = 'active';
  if actor_membership_id is null then
    raise exception 'a live membership is required' using errcode = '42501';
  end if;
  perform set_config('app.actor_org_id', p_organization_id::text, true);
  perform set_config('app.actor_membership_id', actor_membership_id::text, true);
  if not access_control.has_capability(p_organization_id, 'observe_training') then
    raise exception 'this action requires observe_training' using errcode = '42501';
  end if;

  perform access_control.open_contract_scope('observation_revision', p_observation_id);
  select found_observation.person_id, found_observation.relationship_id,
         found_observation.data_classification_code
    into observation
  from execution.professional_observations as found_observation
  where found_observation.id = p_observation_id;
  perform planning.resume_contract_scope(previous_purpose, previous_id, previous_token);
  if observation.person_id is null then
    raise exception 'observation not found' using errcode = 'P0002';
  end if;

  select * into attending
  from execution.require_attending_coach(p_person_id, p_organization_id, observation.person_id);
  if attending.relationship_id is distinct from observation.relationship_id then
    raise exception 'observation not found' using errcode = 'P0002';
  end if;
  perform execution.require_category_grant(
    observation.relationship_id,
    case observation.data_classification_code when 'health' then 'health_context' else 'relationship_training' end,
    'contribute'
  );
  if p_expected_revision is null or p_expected_revision < 1 then
    problems := array_append(problems, 'expected_revision');
  end if;
  if p_content is null or btrim(p_content) = '' or char_length(btrim(p_content)) > 2000 then
    problems := array_append(problems, 'content');
  end if;
  if p_reason is null or btrim(p_reason) = '' or char_length(btrim(p_reason)) > 500 then
    problems := array_append(problems, 'reason');
  end if;
  if cardinality(problems) > 0 then
    raise exception 'the correction is not valid' using errcode = '22023',
      detail = to_jsonb(problems)::text;
  end if;

  select * into receipt from system.begin_idempotency(
    p_person_id, 'OP-EXE-011', p_idempotency_key, p_command_id, p_request_hash
  );
  perform 1
  from relationships.service_relationships as relationship
  where relationship.id = observation.relationship_id
  for share;

  perform access_control.open_contract_scope('observation_revision', p_observation_id);
  select locked.content, locked.revision_number, locked.executed_session_id into current
  from execution.professional_observations as locked
  where locked.id = p_observation_id
  for update;

  if not receipt.claimed then
    document := execution.observation_document(receipt.aggregate_id);
    perform planning.resume_contract_scope(previous_purpose, previous_id, previous_token);
    return query select document, true;
    return;
  end if;

  -- Read under the lock: an end committed meanwhile ended this assignment, as after it.
  author_id := execution.attending_assignment(observation.relationship_id, actor_membership_id);
  if author_id is null then
    raise exception 'client not found' using errcode = 'P0002';
  end if;

  if current.revision_number <> p_expected_revision then
    raise exception 'stale-draft' using errcode = '40001',
      detail = execution.observation_document(p_observation_id)::text;
  end if;
  if btrim(p_content) = current.content then
    raise exception 'the correction changes nothing' using errcode = '22023', detail = '["content"]';
  end if;

  insert into execution.observation_revisions (
    id, observation_id, person_id, revision_from, revision_to, actor_assignment_id,
    actor_membership_id, reason, before_content, after_content
  ) values (
    p_command_id, p_observation_id, observation.person_id, current.revision_number,
    current.revision_number + 1, author_id, actor_membership_id, btrim(p_reason),
    current.content, btrim(p_content)
  );
  update execution.professional_observations
  set content = btrim(p_content),
      revision_number = current.revision_number + 1,
      revised_at = clock_timestamp()
  where id = p_observation_id;

  perform system.enqueue_outbox_event(
    'professional_observation', p_observation_id, 'execution.observation_revised.v1',
    jsonb_build_object(
      'observation_id', p_observation_id,
      'revision_id', p_command_id,
      'execution_id', current.executed_session_id,
      'person_id', observation.person_id,
      'relationship_id', observation.relationship_id,
      'revision_number', current.revision_number + 1
    )
  );
  perform system.finish_idempotency(
    receipt.receipt_id, 201::smallint, 'observation-revised', 'professional_observation', p_observation_id
  );

  document := execution.observation_document(p_observation_id);
  perform planning.resume_contract_scope(previous_purpose, previous_id, previous_token);
  return query select document, false;
end
$function$;

alter function execution.revise_observation(uuid, uuid, uuid, integer, text, text, uuid, uuid, bytea)
  owner to allfit_owner;
revoke all on function execution.revise_observation(uuid, uuid, uuid, integer, text, text, uuid, uuid, bytea)
  from public;
grant execute on function execution.revise_observation(uuid, uuid, uuid, integer, text, text, uuid, uuid, bytea)
  to allfit_api;

-- ---------------------------------------------------------------------------
-- OP-EXE-018 carries the observations
-- ---------------------------------------------------------------------------

/*
 * `20261107090000`'s body, with the observations this relationship left on the session.
 * The policy shows each under its own category; when one of health context is shown,
 * the read is recorded under `health_context` before it returns.
 */
create or replace function execution.read_authorized_execution(
  p_person_id uuid,
  p_organization_id uuid,
  p_subject_person_id uuid,
  p_execution_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  attending record;
  inside record;
  prior record;
  health record;
  seen record;
  document jsonb;
  notes jsonb;
  notes_health boolean;
  previous_purpose text := current_setting('app.contract_scope_purpose', true);
  previous_id text := current_setting('app.contract_scope_id', true);
  previous_token text := current_setting('app.contract_scope_token', true);
begin
  select * into attending
  from execution.require_attending_coach(p_person_id, p_organization_id, p_subject_person_id);
  if nullif(current_setting('app.request_id', true), '') is null then
    raise exception 'request id required for audited read' using errcode = '22023';
  end if;
  perform set_config('app.purpose', 'studio_training_review', true);

  select * into inside from execution.shared_category(attending.relationship_id, 'relationship_training');
  select * into prior from execution.shared_category(attending.relationship_id, 'prior_training_history');

  if inside.grant_id is null and prior.grant_id is null then
    perform privacy.log_access_event(
      p_subject_person_id, null, attending.relationship_id, null, null, null, null,
      'live', 'execution.executed_sessions', 'denied'
    );
    return jsonb_build_object(
      'outcome', 'scope_required',
      'required_scope', jsonb_build_object('code', 'relationship_training', 'level', 'read')
    );
  end if;

  perform access_control.open_contract_scope('session_screening', attending.relationship_id);

  select session.id, session.is_autonomous into seen
  from execution.executed_sessions as session
  where session.id = p_execution_id
    and session.person_id = p_subject_person_id
    and session.execution_status = 'completed'
    and session.validation_status <> 'annulled';

  if seen.id is null then
    perform planning.resume_contract_scope(previous_purpose, previous_id, previous_token);
    perform privacy.log_access_event(
      p_subject_person_id, null, attending.relationship_id, null, null, null, null,
      'live', 'execution.executed_sessions', 'denied'
    );
    return jsonb_build_object('outcome', 'not_found');
  end if;

  if seen.is_autonomous then
    perform privacy.log_access_event(
      p_subject_person_id, null, attending.relationship_id, prior.grant_id, null,
      'prior_training_history', prior.scope_version, 'live', 'execution.executed_sessions', 'allowed'
    );
  else
    perform privacy.log_access_event(
      p_subject_person_id, null, attending.relationship_id, inside.grant_id, null,
      'relationship_training', inside.scope_version, 'live', 'execution.executed_sessions', 'allowed'
    );
  end if;

  select coalesce(jsonb_agg(execution.observation_document(observation.id)
                            order by observation.created_at, observation.id), '[]'::jsonb),
         coalesce(bool_or(observation.data_classification_code = 'health'), false)
    into notes, notes_health
  from execution.professional_observations as observation
  where observation.executed_session_id = p_execution_id
    and observation.relationship_id = attending.relationship_id;
  if notes_health then
    select * into health from execution.shared_category(attending.relationship_id, 'health_context');
    perform privacy.log_access_event(
      p_subject_person_id, null, attending.relationship_id, health.grant_id, null,
      'health_context', health.scope_version, 'live', 'execution.professional_observations', 'allowed'
    );
  end if;

  document := execution.session_projection(p_execution_id)
    - 'status' - 'validation_status' - 'requested_level' - 'revision_number'
    - 'capture_source' - 'contract'
    || jsonb_build_object(
      'origin', case when seen.is_autonomous then 'prior' else 'relationship' end,
      'planned_session_id', case when not seen.is_autonomous then (
        select attempt.planned_session_id
        from execution.planned_session_executions as attempt
        where attempt.executed_session_id = p_execution_id
      ) end,
      'applied_scope', case when seen.is_autonomous
        then jsonb_build_object('code', 'prior_training_history', 'version', prior.scope_version)
        else jsonb_build_object('code', 'relationship_training', 'version', inside.scope_version)
      end,
      'observations', notes
    );

  perform planning.resume_contract_scope(previous_purpose, previous_id, previous_token);
  return jsonb_build_object('outcome', 'found', 'execution', document);
end
$function$;
