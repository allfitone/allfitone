-- A person brings their training history from another app (ADR-044, OP-EXE-027..030).
--
-- The API reads the exported file, keeps nothing of it, and hands over what it read as
-- `imported_history.v1`. From there, three steps:
--
-- - **staged** (OP-EXE-027): the sessions wait in the person's staging area, the history
--   untouched. The answer is a preview: how much, between which dates, what is already
--   here and how each exercise name meets the catalogue. The same file again answers the
--   same import. An import not committed within seven days expires.
-- - **committed** (OP-EXE-028): every new session enters the history at once, finished,
--   with its source, or none does.
-- - **undone** (OP-EXE-029): the sessions of that import are annulled, as ADR-038 annuls,
--   and their fingerprints are free to be imported again.
--
-- An imported session is the person's own finished training: `completed` and `valid`,
-- autonomous, `capture_source = 'import'`, `person_declared` (ADR-018). It counts for
-- records, streak and number like any other, so no reader filters it (ADR-044 §6).
--
-- An exercise name meets the catalogue in layers: what the person chose before, then
-- the curated `catalog.external_movement_names`, then a suggestion the person confirms,
-- then nothing. A session is recognised by its fingerprint (source, local start, title):
-- while an imported session with it is live, the same session does not enter twice.

set lock_timeout = '5s';
set statement_timeout = '120s';

begin;

alter table execution.executed_sessions
  drop constraint ck_executed_sessions_capture_source;
alter table execution.executed_sessions
  add constraint ck_executed_sessions_capture_source check (capture_source in ('manual', 'device', 'import'));

-- ———————————————————————————————————————— names

-- How an outside name is compared: case, hyphens and spacing never make two names differ.
create function execution.external_name_key(p_name text)
returns text
language sql
immutable
parallel safe
set search_path = pg_catalog
as $function$
  select btrim(regexp_replace(lower(translate(coalesce(p_name, ''), '-_', '  ')), '\s+', ' ', 'g'))
$function$;

alter function execution.external_name_key(text) owner to allfit_owner;
revoke all on function execution.external_name_key(text) from public;

-- ———————————————————————————————————————— tables

create table execution.history_imports (
  id uuid not null,
  person_id uuid not null,
  source text not null,
  model_version integer not null,
  discipline_code text not null,
  timezone text not null,
  content_sha256 bytea not null,
  status text not null default 'staged',
  session_count integer not null,
  set_count integer not null,
  issues jsonb not null default '[]'::jsonb,
  imported_count integer,
  created_at timestamptz not null default clock_timestamp(),
  committed_at timestamptz,
  undone_at timestamptz,
  constraint pk_history_imports primary key (id),
  constraint uq_history_imports_owner unique (id, person_id),
  constraint fk_history_imports_person foreign key (person_id) references identity.people(id) on delete restrict,
  constraint ck_history_imports_source check (source in ('hevy_csv')),
  constraint ck_history_imports_model_version check (model_version = 1),
  constraint ck_history_imports_timezone check (btrim(timezone) <> ''),
  constraint ck_history_imports_sha check (octet_length(content_sha256) = 32),
  constraint ck_history_imports_status check (status in ('staged', 'committed', 'undone', 'expired')),
  constraint ck_history_imports_counts check (session_count >= 0 and set_count >= 0),
  constraint ck_history_imports_issues check (jsonb_typeof(issues) = 'array'),
  constraint ck_history_imports_committed check (status <> 'committed' or (committed_at is not null and imported_count is not null)),
  constraint ck_history_imports_undone check ((status = 'undone') = (undone_at is not null))
);

-- The same file again lands on the import that is already alive.
create unique index uidx_history_imports_content
  on execution.history_imports (person_id, content_sha256)
  where status in ('staged', 'committed');
create index idx_history_imports_person_created
  on execution.history_imports (person_id, created_at desc);

-- The staging area: one session of the model per row, until commit, undo or expiry.
create table execution.history_import_sessions (
  import_id uuid not null,
  person_id uuid not null,
  position integer not null,
  fingerprint text not null,
  started_local timestamp not null,
  payload jsonb not null,
  constraint pk_history_import_sessions primary key (import_id, position),
  constraint fk_history_import_sessions_import foreign key (import_id, person_id) references execution.history_imports(id, person_id) on delete cascade,
  constraint ck_history_import_sessions_position check (position > 0),
  constraint ck_history_import_sessions_fingerprint check (fingerprint ~ '^[0-9a-f]{64}$'),
  constraint ck_history_import_sessions_payload check (jsonb_typeof(payload) = 'object')
);

create table execution.imported_sessions (
  executed_session_id uuid not null,
  person_id uuid not null,
  import_id uuid not null,
  source text not null,
  fingerprint text not null,
  source_title text not null,
  source_description text,
  is_live boolean not null default true,
  constraint pk_imported_sessions primary key (executed_session_id),
  constraint fk_imported_sessions_session foreign key (executed_session_id, person_id) references execution.executed_sessions(id, person_id) on delete cascade,
  constraint fk_imported_sessions_import foreign key (import_id, person_id) references execution.history_imports(id, person_id) on delete restrict,
  constraint ck_imported_sessions_source check (source in ('hevy_csv')),
  constraint ck_imported_sessions_fingerprint check (fingerprint ~ '^[0-9a-f]{64}$')
);

-- A session annulled on its own stays recognised, so a later file does not bring it back;
-- only undoing its import lets it in again.
create unique index uidx_imported_sessions_fingerprint
  on execution.imported_sessions (person_id, fingerprint)
  where is_live;
create index idx_imported_sessions_import on execution.imported_sessions (import_id);

-- The name and note the source gave an exercise. A correction that rebuilds the list
-- drops them with the old rows, and the exercise then speaks only through its movement.
create table execution.imported_exercises (
  session_exercise_id uuid not null,
  executed_session_id uuid not null,
  source_name text not null,
  source_note text,
  constraint pk_imported_exercises primary key (session_exercise_id),
  constraint fk_imported_exercises_exercise foreign key (session_exercise_id) references execution.session_exercises(id) on delete cascade,
  constraint fk_imported_exercises_session foreign key (executed_session_id) references execution.executed_sessions(id) on delete cascade,
  constraint ck_imported_exercises_name check (btrim(source_name) <> '')
);

create index idx_imported_exercises_session on execution.imported_exercises (executed_session_id);

-- Curated: how a source names a movement of the catalogue. Loaded by curation, read by all.
create table catalog.external_movement_names (
  source text not null,
  external_name text not null,
  movement_id uuid not null,
  constraint pk_external_movement_names primary key (source, external_name),
  constraint fk_external_movement_names_movement foreign key (movement_id) references catalog.movements(id) on delete cascade,
  constraint ck_external_movement_names_source check (source in ('hevy_csv')),
  constraint ck_external_movement_names_name check (external_name = execution.external_name_key(external_name) and external_name <> '')
);

create index idx_external_movement_names_movement on catalog.external_movement_names (movement_id);

-- What the person chose for a name, remembered for their next import. Null is a choice:
-- "this one has no movement".
create table execution.person_movement_choices (
  person_id uuid not null,
  source text not null,
  external_name text not null,
  movement_id uuid,
  chosen_at timestamptz not null default clock_timestamp(),
  constraint pk_person_movement_choices primary key (person_id, source, external_name),
  constraint fk_person_movement_choices_person foreign key (person_id) references identity.people(id) on delete cascade,
  constraint fk_person_movement_choices_movement foreign key (movement_id) references catalog.movements(id) on delete cascade,
  constraint ck_person_movement_choices_source check (source in ('hevy_csv')),
  constraint ck_person_movement_choices_name check (btrim(external_name) <> '')
);

alter table execution.history_imports owner to allfit_owner;
alter table execution.history_import_sessions owner to allfit_owner;
alter table execution.imported_sessions owner to allfit_owner;
alter table execution.imported_exercises owner to allfit_owner;
alter table catalog.external_movement_names owner to allfit_owner;
alter table execution.person_movement_choices owner to allfit_owner;
revoke all on execution.history_imports from public;
revoke all on execution.history_import_sessions from public;
revoke all on execution.imported_sessions from public;
revoke all on execution.imported_exercises from public;
revoke all on catalog.external_movement_names from public;
revoke all on execution.person_movement_choices from public;

alter table execution.history_imports enable row level security;
alter table execution.history_imports force row level security;
alter table execution.history_import_sessions enable row level security;
alter table execution.history_import_sessions force row level security;
alter table execution.imported_sessions enable row level security;
alter table execution.imported_sessions force row level security;
alter table execution.imported_exercises enable row level security;
alter table execution.imported_exercises force row level security;
alter table catalog.external_movement_names enable row level security;
alter table catalog.external_movement_names force row level security;
alter table execution.person_movement_choices enable row level security;
alter table execution.person_movement_choices force row level security;

create policy history_imports_all_self on execution.history_imports
  for all to allfit_owner
  using (person_id = access_control.person())
  with check (person_id = access_control.person());

create policy history_import_sessions_all_self on execution.history_import_sessions
  for all to allfit_owner
  using (person_id = access_control.person())
  with check (person_id = access_control.person());

create policy imported_sessions_all_self on execution.imported_sessions
  for all to allfit_owner
  using (person_id = access_control.person())
  with check (person_id = access_control.person());

-- Inherits from the session, as every child of an execution does.
create policy imported_exercises_all_self on execution.imported_exercises
  for all to allfit_owner
  using (exists (
    select 1 from execution.executed_sessions as session
    where session.id = imported_exercises.executed_session_id))
  with check (exists (
    select 1 from execution.executed_sessions as session
    where session.id = imported_exercises.executed_session_id));

create policy external_movement_names_select_actor on catalog.external_movement_names
  for select
  using (exists (select 1 from catalog.movements as movement where movement.id = movement_id));

create policy person_movement_choices_all_self on execution.person_movement_choices
  for all to allfit_owner
  using (person_id = access_control.person())
  with check (person_id = access_control.person());

-- ———————————————————————————————————————— meeting the catalogue

-- A suggestion, never an answer: the person confirms it. Hevy writes the equipment in
-- parentheses, the catalogue's English aliases put it first («barbell bench press»), and
-- a machine there is a lever. Conservative on purpose: an exact name or nothing, and a
-- name that states its equipment never falls back to one that does not.
create function catalog.suggest_movement(p_name text)
returns uuid
language sql
stable
set search_path = pg_catalog
as $function$
  with key as (
    select execution.external_name_key(p_name) as full_name
  ),
  parts as (
    select full_name,
           btrim(regexp_replace(full_name, '\s*\([^)]*\)\s*$', '')) as base,
           nullif(btrim(substring(full_name from '\(([^)]*)\)\s*$')), '') as equipment
    from key
  ),
  candidates as (
    select candidate.name, candidate.rank
    from parts
    cross join lateral (values
      (parts.full_name, 1),
      (case parts.equipment
         when 'machine' then 'lever ' || parts.base
         when 'smith machine' then 'smith ' || parts.base
         else parts.equipment || ' ' || parts.base
       end, 2),
      (case when parts.equipment is null then parts.base end, 3)
    ) as candidate(name, rank)
    where candidate.name is not null and candidate.name <> ''
  ),
  names as (
    select movement.id, execution.external_name_key(movement.name) as name
    from catalog.movements as movement
    where movement.content_scope = 'global' and movement.status = 'published'
    union all
    select movement.id, execution.external_name_key(alias.name)
    from catalog.movement_aliases as alias
    join catalog.movements as movement on movement.id = alias.movement_id
    where movement.content_scope = 'global' and movement.status = 'published'
  )
  select names.id
  from candidates
  join names on names.name = candidates.name
  order by candidates.rank, names.id
  limit 1
$function$;

alter function catalog.suggest_movement(text) owner to allfit_owner;
revoke all on function catalog.suggest_movement(text) from public;

-- Every distinct name of a staged import, with how it meets the catalogue today.
create function execution.history_import_names(p_person_id uuid, p_import_id uuid, p_suggest boolean)
returns table (
  external_name text,
  source_name text,
  session_count integer,
  set_count integer,
  resolution text,
  movement_id uuid
)
language sql
stable
set search_path = pg_catalog
as $function$
  with staged as (
    select execution.external_name_key(exercise->>'source_name') as external_name,
           exercise->>'source_name' as source_name,
           session.position,
           jsonb_array_length(exercise->'sets') as sets
    from execution.history_import_sessions as session
    cross join lateral jsonb_array_elements(session.payload->'exercises') as exercise
    where session.import_id = p_import_id and session.person_id = p_person_id
  ),
  grouped as (
    select staged.external_name, min(staged.source_name) as source_name,
           count(distinct staged.position)::integer as session_count,
           sum(staged.sets)::integer as set_count
    from staged
    group by staged.external_name
  )
  select grouped.external_name, grouped.source_name, grouped.session_count, grouped.set_count,
         case
           when choice.person_id is not null then 'chosen'
           when curated.movement_id is not null then 'catalogue'
           when suggested.id is not null then 'suggested'
           else 'unmatched'
         end,
         case
           when choice.person_id is not null then choice.movement_id
           else coalesce(curated.movement_id, suggested.id)
         end
  from grouped
  join execution.history_imports as import on import.id = p_import_id
  left join execution.person_movement_choices as choice
    on choice.person_id = p_person_id and choice.source = import.source
   and choice.external_name = grouped.external_name
  left join catalog.external_movement_names as curated
    on curated.source = import.source and curated.external_name = grouped.external_name
  -- Inside the lateral, so a name already answered never pays for a suggestion.
  left join lateral (
    select catalog.suggest_movement(grouped.source_name) as id
    where p_suggest and choice.person_id is null and curated.movement_id is null
  ) as suggested on true
  order by grouped.set_count desc, grouped.external_name
$function$;

alter function execution.history_import_names(uuid, uuid, boolean) owner to allfit_owner;
revoke all on function execution.history_import_names(uuid, uuid, boolean) from public;

-- ———————————————————————————————————————— what an import says about itself

create function execution.history_import_document(p_person_id uuid, p_import_id uuid)
returns jsonb
language plpgsql
stable
set search_path = pg_catalog
as $function$
declare
  import record;
  staged jsonb;
begin
  select * into import
  from execution.history_imports as candidate
  where candidate.id = p_import_id and candidate.person_id = p_person_id;
  if import.id is null then
    return null;
  end if;

  if import.status = 'staged' then
    select jsonb_build_object(
      'new_sessions', count(*) filter (where live.executed_session_id is null),
      'duplicate_sessions', count(*) filter (where live.executed_session_id is not null),
      'first_started_local', to_char(min(session.started_local), 'YYYY-MM-DD"T"HH24:MI'),
      'last_started_local', to_char(max(session.started_local), 'YYYY-MM-DD"T"HH24:MI'),
      'exercises', coalesce((
        select jsonb_agg(jsonb_build_object(
          'external_name', name.external_name,
          'source_name', name.source_name,
          'session_count', name.session_count,
          'set_count', name.set_count,
          'resolution', name.resolution,
          'movement', case when movement.id is null then null
                           else jsonb_build_object('id', movement.id, 'name', movement.name) end))
        from execution.history_import_names(p_person_id, p_import_id, true) as name
        left join catalog.movements as movement on movement.id = name.movement_id), '[]'::jsonb))
    into staged
    from execution.history_import_sessions as session
    left join execution.imported_sessions as live
      on live.person_id = p_person_id and live.fingerprint = session.fingerprint and live.is_live
    where session.import_id = p_import_id and session.person_id = p_person_id;
  end if;

  return jsonb_build_object(
    'id', import.id,
    'source', import.source,
    'status', case
      when import.status = 'staged' and import.created_at < clock_timestamp() - interval '7 days' then 'expired'
      else import.status end,
    'timezone', import.timezone,
    'session_count', import.session_count,
    'set_count', import.set_count,
    'imported_count', import.imported_count,
    'issues', import.issues,
    'created_at', import.created_at,
    'committed_at', import.committed_at,
    'undone_at', import.undone_at,
    'expires_at', case when import.status = 'staged' then import.created_at + interval '7 days' end,
    'preview', staged);
end
$function$;

alter function execution.history_import_document(uuid, uuid) owner to allfit_owner;
revoke all on function execution.history_import_document(uuid, uuid) from public;

-- ———————————————————————————————————————— OP-EXE-027 · stage

create function execution.stage_history_import(
  p_person_id uuid,
  p_source text,
  p_model_version integer,
  p_discipline_code text,
  p_timezone text,
  p_content_sha256 bytea,
  p_sessions jsonb,
  p_issues jsonb,
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
  receipt record;
  existing uuid;
begin
  if access_control.actor_kind() <> 'person' or access_control.person() <> p_person_id then
    raise exception 'history import person does not match the authenticated actor' using errcode = '42501';
  end if;

  select * into receipt from system.begin_idempotency(
    p_person_id, 'OP-EXE-027', p_idempotency_key, p_command_id, p_request_hash
  );
  if not receipt.claimed then
    return execution.history_import_document(p_person_id, receipt.aggregate_id);
  end if;

  if jsonb_typeof(p_sessions) <> 'array' or jsonb_typeof(coalesce(p_issues, '[]'::jsonb)) <> 'array' then
    raise exception 'sessions and issues are lists' using errcode = '22023';
  end if;
  if not exists (select 1 from pg_catalog.pg_timezone_names where name = p_timezone) then
    raise exception 'unknown timezone' using errcode = '22023';
  end if;

  -- Serialises this person's imports, so the same file twice at once is one import.
  perform 1 from identity.people as person where person.id = p_person_id for update;

  update execution.history_imports as import
  set status = 'expired'
  where import.person_id = p_person_id and import.status = 'staged'
    and import.created_at < clock_timestamp() - interval '7 days';
  delete from execution.history_import_sessions as session
  using execution.history_imports as import
  where import.id = session.import_id and import.person_id = p_person_id and import.status = 'expired';

  select import.id into existing
  from execution.history_imports as import
  where import.person_id = p_person_id and import.content_sha256 = p_content_sha256
    and import.status in ('staged', 'committed');
  if existing is not null then
    perform system.finish_idempotency(
      receipt.receipt_id, 200::smallint, 'history-import-found', 'history_import', existing
    );
    return execution.history_import_document(p_person_id, existing);
  end if;

  insert into execution.history_imports (
    id, person_id, source, model_version, discipline_code, timezone, content_sha256,
    session_count, set_count, issues
  ) values (
    p_command_id, p_person_id, p_source, p_model_version, p_discipline_code, p_timezone,
    p_content_sha256,
    jsonb_array_length(p_sessions),
    coalesce((
      select sum(jsonb_array_length(exercise->'sets'))::integer
      from jsonb_array_elements(p_sessions) as session
      cross join lateral jsonb_array_elements(session->'exercises') as exercise), 0),
    coalesce(p_issues, '[]'::jsonb)
  );

  insert into execution.history_import_sessions (
    import_id, person_id, position, fingerprint, started_local, payload
  )
  select p_command_id, p_person_id, item.position::integer, item.session->>'fingerprint',
         (item.session->>'started_local')::timestamp, item.session
  from jsonb_array_elements(p_sessions) with ordinality as item(session, position);

  perform system.finish_idempotency(
    receipt.receipt_id, 201::smallint, 'history-import-staged', 'history_import', p_command_id
  );
  return execution.history_import_document(p_person_id, p_command_id);
end
$function$;

alter function execution.stage_history_import(uuid, text, integer, text, text, bytea, jsonb, jsonb, uuid, uuid, bytea) owner to allfit_owner;
revoke all on function execution.stage_history_import(uuid, text, integer, text, text, bytea, jsonb, jsonb, uuid, uuid, bytea) from public;
grant execute on function execution.stage_history_import(uuid, text, integer, text, text, bytea, jsonb, jsonb, uuid, uuid, bytea) to allfit_api;

-- ———————————————————————————————————————— OP-EXE-028 · commit

create function execution.commit_history_import(
  p_person_id uuid,
  p_import_id uuid,
  p_timezone text,
  p_choices jsonb,
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
  receipt record;
  import record;
  contract record;
  staged record;
  resolved jsonb;
  new_id uuid;
  exercises jsonb;
  results jsonb;
  created integer := 0;
begin
  if access_control.actor_kind() <> 'person' or access_control.person() <> p_person_id then
    raise exception 'history import person does not match the authenticated actor' using errcode = '42501';
  end if;

  select * into receipt from system.begin_idempotency(
    p_person_id, 'OP-EXE-028', p_idempotency_key, p_command_id, p_request_hash
  );

  select * into import
  from execution.history_imports as candidate
  where candidate.id = p_import_id and candidate.person_id = p_person_id
  for update;
  if import.id is null then
    raise exception 'history import is not this person''s' using errcode = '42501';
  end if;

  if not receipt.claimed then
    return execution.history_import_document(p_person_id, p_import_id);
  end if;

  if import.status <> 'staged' or import.created_at < clock_timestamp() - interval '7 days' then
    raise exception 'history import is not waiting to be committed' using errcode = '55000';
  end if;
  if not exists (select 1 from pg_catalog.pg_timezone_names where name = p_timezone) then
    raise exception 'unknown timezone' using errcode = '22023';
  end if;
  if jsonb_typeof(coalesce(p_choices, '[]'::jsonb)) <> 'array' then
    raise exception 'choices are a list' using errcode = '22023';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(coalesce(p_choices, '[]'::jsonb)) as choice
    where nullif(choice->>'movement_id', '') is not null
      and not exists (
        select 1 from catalog.movements as movement
        where movement.id = (choice->>'movement_id')::uuid
          and movement.content_scope = 'global' and movement.status = 'published')
  ) then
    raise exception 'a chosen movement is not in the catalogue' using errcode = '23514';
  end if;

  -- The person's word is remembered first, so the resolution below reads it back.
  insert into execution.person_movement_choices (person_id, source, external_name, movement_id)
  select distinct on (execution.external_name_key(choice->>'external_name'))
         p_person_id, import.source, execution.external_name_key(choice->>'external_name'),
         nullif(choice->>'movement_id', '')::uuid
  from jsonb_array_elements(coalesce(p_choices, '[]'::jsonb)) as choice
  where execution.external_name_key(choice->>'external_name') <> ''
  on conflict (person_id, source, external_name)
  do update set movement_id = excluded.movement_id, chosen_at = clock_timestamp();

  -- A suggestion the person did not confirm is not used: only choices and curation count.
  select coalesce(jsonb_object_agg(name.external_name, name.movement_id), '{}'::jsonb)
  into resolved
  from execution.history_import_names(p_person_id, p_import_id, false) as name
  where name.resolution in ('chosen', 'catalogue');

  select activity.id as activity_type_id, association.result_contract_id, published.version_number
  into contract
  from catalog.activity_types as activity
  join catalog.activity_type_result_contracts as association
    on association.activity_type_id = activity.id
   and association.is_default
   and association.valid_from <= clock_timestamp()
   and (association.valid_to is null or association.valid_to > clock_timestamp())
  join catalog.result_contracts as published on published.id = association.result_contract_id
  where activity.discipline_code = import.discipline_code
    and activity.content_scope = 'global'
    and activity.status = 'published';
  if contract.result_contract_id is null then
    raise exception 'discipline has no single published activity type' using errcode = '23514';
  end if;

  for staged in
    select session.payload, session.fingerprint
    from execution.history_import_sessions as session
    where session.import_id = p_import_id
      and not exists (
        select 1 from execution.imported_sessions as live
        where live.person_id = p_person_id and live.fingerprint = session.fingerprint and live.is_live)
    order by session.started_local, session.position
  loop
    new_id := extensions.uuid_generate_v7();

    insert into execution.executed_sessions (
      id, person_id, activity_type_id, result_contract_id, contract_version,
      started_at, ended_at, timezone, execution_status, validation_status,
      requested_level, achieved_level, capture_source, capture_provenance
    ) values (
      new_id, p_person_id, contract.activity_type_id, contract.result_contract_id,
      contract.version_number,
      (staged.payload->>'started_local')::timestamp at time zone p_timezone,
      (staged.payload->>'ended_local')::timestamp at time zone p_timezone,
      p_timezone, 'completed', 'valid', 'detailed', 'detailed', 'import', 'person_declared'
    );

    select jsonb_agg(jsonb_build_object(
             'position', (exercise->>'position')::integer,
             'movement_id', resolved->>execution.external_name_key(exercise->>'source_name'),
             'superset_group', exercise->'superset_group')
           order by (exercise->>'position')::integer)
    into exercises
    from jsonb_array_elements(staged.payload->'exercises') as exercise;

    select jsonb_agg(jsonb_build_object(
             'family', 'strength',
             'set_order', row_number,
             'exercise_position', exercise_position,
             'movement_id', movement_id,
             'achieved_reps', reps,
             'load_value', load_kg,
             'load_unit_code', case when load_kg is not null then 'kg' end,
             'rpe', rpe,
             'kind', kind)
           order by row_number)
    into results
    from (
      select row_number() over (order by (exercise->>'position')::integer, (item->>'order')::integer) as row_number,
             (exercise->>'position')::integer as exercise_position,
             resolved->>execution.external_name_key(exercise->>'source_name') as movement_id,
             item->>'reps' as reps, item->>'load_kg' as load_kg, item->>'rpe' as rpe, item->>'kind' as kind
      from jsonb_array_elements(staged.payload->'exercises') as exercise
      cross join lateral jsonb_array_elements(exercise->'sets') as item
    ) as flat;

    perform execution.write_session_results(new_id, results, exercises);

    insert into execution.imported_sessions (
      executed_session_id, person_id, import_id, source, fingerprint, source_title, source_description
    ) values (
      new_id, p_person_id, p_import_id, import.source, staged.fingerprint,
      staged.payload->>'title', nullif(staged.payload->>'description', '')
    );

    insert into execution.imported_exercises (session_exercise_id, executed_session_id, source_name, source_note)
    select item.id, new_id, exercise->>'source_name', nullif(exercise->>'note', '')
    from execution.session_exercises as item
    join jsonb_array_elements(staged.payload->'exercises') as exercise
      on (exercise->>'position')::integer = item.position
    where item.executed_session_id = new_id;

    created := created + 1;
  end loop;

  update execution.history_imports as candidate
  set status = 'committed', committed_at = clock_timestamp(), imported_count = created,
      timezone = p_timezone
  where candidate.id = p_import_id;
  delete from execution.history_import_sessions as session where session.import_id = p_import_id;

  perform system.finish_idempotency(
    receipt.receipt_id, 200::smallint, 'history-import-committed', 'history_import', p_import_id
  );
  return execution.history_import_document(p_person_id, p_import_id);
end
$function$;

alter function execution.commit_history_import(uuid, uuid, text, jsonb, uuid, uuid, bytea) owner to allfit_owner;
revoke all on function execution.commit_history_import(uuid, uuid, text, jsonb, uuid, uuid, bytea) from public;
grant execute on function execution.commit_history_import(uuid, uuid, text, jsonb, uuid, uuid, bytea) to allfit_api;

-- ———————————————————————————————————————— OP-EXE-029 · undo

create function execution.undo_history_import(
  p_person_id uuid,
  p_import_id uuid,
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
  receipt record;
  import record;
  stamped timestamptz := clock_timestamp();
begin
  if access_control.actor_kind() <> 'person' or access_control.person() <> p_person_id then
    raise exception 'history import person does not match the authenticated actor' using errcode = '42501';
  end if;

  select * into receipt from system.begin_idempotency(
    p_person_id, 'OP-EXE-029', p_idempotency_key, p_command_id, p_request_hash
  );

  select * into import
  from execution.history_imports as candidate
  where candidate.id = p_import_id and candidate.person_id = p_person_id
  for update;
  if import.id is null then
    raise exception 'history import is not this person''s' using errcode = '42501';
  end if;

  if not receipt.claimed or import.status in ('undone', 'expired') then
    if receipt.claimed then
      perform system.finish_idempotency(
        receipt.receipt_id, 200::smallint, 'history-import-undone', 'history_import', p_import_id
      );
    end if;
    return execution.history_import_document(p_person_id, p_import_id);
  end if;

  -- Annulled as ADR-038 annuls: marked, never deleted. What was already annulled stays so.
  update execution.executed_sessions as executed
  set validation_status = 'annulled', annulled_at = stamped, annulment_reason = 'import_undone'
  from execution.imported_sessions as imported
  where imported.import_id = p_import_id
    and imported.executed_session_id = executed.id
    and executed.annulled_at is null;

  update execution.imported_sessions as imported
  set is_live = false
  where imported.import_id = p_import_id;

  delete from execution.history_import_sessions as session where session.import_id = p_import_id;

  update execution.history_imports as candidate
  set status = 'undone', undone_at = stamped
  where candidate.id = p_import_id;

  perform system.finish_idempotency(
    receipt.receipt_id, 200::smallint, 'history-import-undone', 'history_import', p_import_id
  );
  return execution.history_import_document(p_person_id, p_import_id);
end
$function$;

alter function execution.undo_history_import(uuid, uuid, uuid, uuid, bytea) owner to allfit_owner;
revoke all on function execution.undo_history_import(uuid, uuid, uuid, uuid, bytea) from public;
grant execute on function execution.undo_history_import(uuid, uuid, uuid, uuid, bytea) to allfit_api;

-- ———————————————————————————————————————— OP-EXE-030 · read

create function execution.list_history_imports(p_person_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $function$
begin
  if access_control.actor_kind() <> 'person' or access_control.person() <> p_person_id then
    raise exception 'history import person does not match the authenticated actor' using errcode = '42501';
  end if;

  return coalesce((
    select jsonb_agg(execution.history_import_document(p_person_id, import.id) - 'preview'
                     order by import.created_at desc, import.id desc)
    from execution.history_imports as import
    where import.person_id = p_person_id), '[]'::jsonb);
end
$function$;

alter function execution.list_history_imports(uuid) owner to allfit_owner;
revoke all on function execution.list_history_imports(uuid) from public;
grant execute on function execution.list_history_imports(uuid) to allfit_api;

create function execution.read_history_import(p_person_id uuid, p_import_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $function$
declare
  document jsonb;
begin
  if access_control.actor_kind() <> 'person' or access_control.person() <> p_person_id then
    raise exception 'history import person does not match the authenticated actor' using errcode = '42501';
  end if;

  document := execution.history_import_document(p_person_id, p_import_id);
  if document is null then
    raise exception 'history import not found' using errcode = 'P0002';
  end if;
  return document;
end
$function$;

alter function execution.read_history_import(uuid, uuid) owner to allfit_owner;
revoke all on function execution.read_history_import(uuid, uuid) from public;
grant execute on function execution.read_history_import(uuid, uuid) to allfit_api;

commit;
