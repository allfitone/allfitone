-- OP-PLN-010 and OP-PLN-018 (HU-STUDIO-046, HU-STUDIO-047): a gym gives a client a
-- program through the relationship, and reads back only what it gave.
--
-- Until now `ck_program_assignments_no_origin` kept every assignment personal, and
-- T-REL-TERMINATE-01 and T-ORG-CLOSURE-01 watched it so that the day it was lifted,
-- ending a relationship would have to grow with it. This migration lifts it and grows
-- the ending in the same transaction:
--
--   · An assignment may now carry the relationship it came from. A managed one
--     (`active`, `detached_pending_choice`) must; the origin never changes afterwards,
--     so a later relationship cannot inherit what an earlier one managed (T-ASG-6).
--   · `assignment_management_periods` records while the gym manages it (DD §9.14).
--   · `relationships.close_relationship` detaches at the same instant `T` it freezes
--     grants: the period closes, the assignment waits for the person's choice and every
--     session not yet started pauses. Nothing is deleted (ADR-019). Every way a
--     relationship ends — the gym, the person, the organization closing — goes through
--     it, so none of them has to remember.
--
-- **Row policies follow the RLS matrix (PR-17, T-VER-4).** The coach reads and writes
-- through the origin relationship only, and only with the live formula: relationship
-- active in the actor's organization, effective professional assignment (holder or
-- accepted cover) and an active `relationship_training` grant at the level the action
-- needs. `access_control.can_access` implements it keyed by relationship rather than by
-- person, because an assignment names the relationship it came from and a person can
-- be a client of several organizations. Children inherit from a visible assignment.
-- The person reads the version she was given and the routines it planned for her, and
-- nothing else of the organization's catalogue.
--
-- **Two narrow reads go through contract scopes**, as organization closure does:
--
--   · `relationship_assignment` (keyed by person) lets the assigning command see the
--     person's other assignments for three facts: where her device last placed her,
--     where the new program goes in her order, and whether it overlaps something she
--     already follows. The overlap is returned as a bare boolean — the gym learns that
--     her calendar is busy, never with what.
--   · `relationship_detachment` (keyed by relationship) lets the detachment reach rows
--     that whoever ended the relationship — an owner, the person, a closing
--     organization — would not otherwise see.
--
-- A missing grant raises `AF430` with the scope and level as detail; the API answers
-- 403 `scope-required` naming it (HU-STUDIO-046 criterion 1). Each read of OP-PLN-018
-- writes an access event with the grant and scope version it relied on before
-- returning anything.
set lock_timeout = '5s';
set statement_timeout = '60s';

begin;

-- ---------------------------------------------------------------------------
-- The live formula
-- ---------------------------------------------------------------------------

-- V1_RLS_MATRIX §5.4: the active grant of a relationship for a scope, or nothing.
create function access_control.grant_of(p_relationship_id uuid, p_scope_code text)
returns table (
  grant_id uuid,
  person_id uuid,
  organization_id uuid,
  scope_definition_id uuid,
  access_level privacy.access_level,
  purpose text
)
language sql
stable
security definer
set search_path = pg_catalog
as $function$
  select shared.id, shared.person_id, shared.organization_id, shared.scope_definition_id,
         shared.access_level, shared.purpose
  from privacy.data_grants as shared
  where shared.relationship_id = p_relationship_id
    and shared.scope_code = p_scope_code
    and shared.status = 'active'
$function$;

alter function access_control.grant_of(uuid, text) owner to allfit_owner;
revoke all on function access_control.grant_of(uuid, text) from public, allfit_api;

/*
 * V1_RLS_MATRIX §5.1, keyed by relationship. A frozen or revoked grant never
 * satisfies it, and `contribute` covers `read`. The actor and organization come from
 * the transaction context, never from an argument.
 */
create function access_control.can_access(
  p_relationship_id uuid,
  p_scope_code text,
  p_level privacy.access_level
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $function$
  select coalesce(
    access_control.actor_kind() = 'person'
    and exists (
      select 1
      from relationships.service_relationships as relationship
      join organizations.organizations as organization
        on organization.id = relationship.organization_id
      where relationship.id = p_relationship_id
        and relationship.organization_id = access_control.org()
        and relationship.status = 'active'
        and organization.status = 'active'
    )
    and relationships.actor_is_assigned(p_relationship_id)
    and exists (
      select 1
      from access_control.grant_of(p_relationship_id, p_scope_code) as shared
      where p_level = 'read' or shared.access_level = 'contribute'
    ),
    false
  )
$function$;

alter function access_control.can_access(uuid, text, privacy.access_level) owner to allfit_owner;
revoke all on function access_control.can_access(uuid, text, privacy.access_level)
  from public, allfit_api;

-- ---------------------------------------------------------------------------
-- An assignment may come from a relationship
-- ---------------------------------------------------------------------------

alter table planning.program_assignments
  drop constraint ck_program_assignments_no_origin,
  drop constraint ck_program_assignments_lifecycle,
  -- `personal` may carry an origin later: continuing a detached assignment keeps it.
  add constraint ck_program_assignments_managed_origin check (
    lifecycle not in ('active', 'detached_pending_choice') or origin_relationship_id is not null
  ),
  add constraint fk_program_assignments_origin foreign key (origin_relationship_id, person_id) references relationships.service_relationships (id, person_id) on delete restrict;

create index idx_program_assignments_origin_lifecycle
  on planning.program_assignments (origin_relationship_id, lifecycle)
  where origin_relationship_id is not null;

create function planning.keep_assignment_origin_tg()
returns trigger
language plpgsql
set search_path = pg_catalog
as $function$
begin
  if new.origin_relationship_id is distinct from old.origin_relationship_id
     or new.person_id is distinct from old.person_id then
    raise exception 'an assignment keeps the person and the relationship it came from'
      using errcode = '23514';
  end if;
  return new;
end
$function$;

alter function planning.keep_assignment_origin_tg() owner to allfit_owner;
revoke all on function planning.keep_assignment_origin_tg() from public, allfit_api;

create trigger trg_program_assignments_before_update_origin
before update on planning.program_assignments
for each row execute function planning.keep_assignment_origin_tg();

-- ---------------------------------------------------------------------------
-- While the gym manages it
-- ---------------------------------------------------------------------------

create table planning.assignment_management_periods (
  id uuid not null default extensions.uuid_generate_v7(),
  assignment_id uuid not null,
  person_id uuid not null,
  relationship_id uuid not null,
  started_at timestamptz not null default clock_timestamp(),
  ended_at timestamptz,
  end_reason text,
  constraint pk_assignment_management_periods primary key (id),
  constraint fk_assignment_management_periods_assignment foreign key (assignment_id, person_id) references planning.program_assignments (id, person_id) on delete restrict,
  constraint fk_assignment_management_periods_relationship foreign key (relationship_id, person_id) references relationships.service_relationships (id, person_id) on delete restrict,
  constraint ck_assignment_management_periods_end check (
    (ended_at is null) = (end_reason is null) and (ended_at is null or ended_at >= started_at)
  ),
  constraint ck_assignment_management_periods_end_reason check (
    end_reason in ('cancelled', 'relationship_ended')
  )
);

create unique index uidx_assignment_management_periods_open
  on planning.assignment_management_periods (assignment_id)
  where ended_at is null;
create index idx_assignment_management_periods_relationship_open
  on planning.assignment_management_periods (relationship_id)
  where ended_at is null;

create function planning.close_only_management_period_tg()
returns trigger
language plpgsql
set search_path = pg_catalog
as $function$
begin
  if tg_op = 'DELETE'
     or old.ended_at is not null
     or (new.id, new.assignment_id, new.person_id, new.relationship_id, new.started_at)
        is distinct from (old.id, old.assignment_id, old.person_id, old.relationship_id, old.started_at)
  then
    raise exception 'a management period only ever closes' using errcode = '23514';
  end if;
  return new;
end
$function$;

alter function planning.close_only_management_period_tg() owner to allfit_owner;
revoke all on function planning.close_only_management_period_tg() from public, allfit_api;

create trigger trg_assignment_management_periods_before_change_close_only
before update or delete on planning.assignment_management_periods
for each row execute function planning.close_only_management_period_tg();

alter table planning.assignment_management_periods enable row level security;
alter table planning.assignment_management_periods force row level security;
alter table planning.assignment_management_periods owner to allfit_owner;
revoke all on planning.assignment_management_periods from public;

create policy assignment_management_periods_select_self on planning.assignment_management_periods
  for select to allfit_owner
  using (person_id = access_control.person());
create policy assignment_management_periods_select_managing on planning.assignment_management_periods
  for select to allfit_owner
  using (access_control.can_access(relationship_id, 'relationship_training', 'read'));
create policy assignment_management_periods_insert_managing on planning.assignment_management_periods
  for insert to allfit_owner
  with check (
    ended_at is null
    and access_control.can_access(relationship_id, 'relationship_training', 'contribute')
  );
create policy assignment_management_periods_select_detachment on planning.assignment_management_periods
  for select to allfit_owner
  using (relationship_id::text = (select access_control.contract_scope('relationship_detachment')));
create policy assignment_management_periods_update_detachment on planning.assignment_management_periods
  for update to allfit_owner
  using (relationship_id::text = (select access_control.contract_scope('relationship_detachment')))
  with check (relationship_id::text = (select access_control.contract_scope('relationship_detachment')));

-- ---------------------------------------------------------------------------
-- Row policies: the coach, the person, and the two contract scopes
-- ---------------------------------------------------------------------------

create policy program_assignments_select_managing on planning.program_assignments
  for select to allfit_owner
  using (
    origin_relationship_id is not null
    and access_control.can_access(origin_relationship_id, 'relationship_training', 'read')
  );
create policy program_assignments_insert_managing on planning.program_assignments
  for insert to allfit_owner
  with check (
    lifecycle = 'active'
    and origin_relationship_id is not null
    and access_control.can_access(origin_relationship_id, 'relationship_training', 'contribute')
  );
create policy program_assignments_select_assigning on planning.program_assignments
  for select to allfit_owner
  using (person_id::text = (select access_control.contract_scope('relationship_assignment')));
create policy program_assignments_select_detachment on planning.program_assignments
  for select to allfit_owner
  using (origin_relationship_id::text = (select access_control.contract_scope('relationship_detachment')));
create policy program_assignments_update_detachment on planning.program_assignments
  for update to allfit_owner
  using (origin_relationship_id::text = (select access_control.contract_scope('relationship_detachment')))
  with check (origin_relationship_id::text = (select access_control.contract_scope('relationship_detachment')));

-- Managed sessions inherit from the assignment: whoever sees it sees them.
create policy planned_sessions_select_managed on planning.planned_sessions
  for select to allfit_owner
  using (exists (
    select 1 from planning.program_assignments as assignment
    where assignment.id = planned_sessions.assignment_id
      and assignment.origin_relationship_id is not null
  ));
create policy planned_sessions_insert_managing on planning.planned_sessions
  for insert to allfit_owner
  with check (exists (
    select 1 from planning.program_assignments as assignment
    where assignment.id = planned_sessions.assignment_id
      and assignment.person_id = planned_sessions.person_id
      and assignment.lifecycle = 'active'
      and access_control.can_access(assignment.origin_relationship_id, 'relationship_training', 'contribute')
  ));
create policy planned_sessions_select_assigning on planning.planned_sessions
  for select to allfit_owner
  using (person_id::text = (select access_control.contract_scope('relationship_assignment')));
create policy planned_sessions_update_detachment on planning.planned_sessions
  for update to allfit_owner
  using (exists (
    select 1 from planning.program_assignments as assignment
    where assignment.id = planned_sessions.assignment_id
      and assignment.origin_relationship_id::text
          = (select access_control.contract_scope('relationship_detachment'))
  ))
  with check (exists (
    select 1 from planning.program_assignments as assignment
    where assignment.id = planned_sessions.assignment_id
      and assignment.origin_relationship_id::text
          = (select access_control.contract_scope('relationship_detachment'))
  ));

-- A started session must not pause, so the detachment has to see that it started.
create policy planned_session_executions_select_detachment on execution.planned_session_executions
  for select to allfit_owner
  using (exists (
    select 1
    from planning.planned_sessions as session
    join planning.program_assignments as assignment on assignment.id = session.assignment_id
    where session.id = planned_session_executions.planned_session_id
      and assignment.origin_relationship_id::text
          = (select access_control.contract_scope('relationship_detachment'))
  ));

-- T-VER-4: the person reads the version she was given, and only that one.
create policy program_versions_select_assigned on planning.program_versions
  for select to allfit_owner
  using (exists (
    select 1 from planning.program_assignments as assignment
    where assignment.program_version_id = program_versions.id
      and assignment.person_id = access_control.person()
  ));
create policy session_template_versions_select_planned on planning.session_template_versions
  for select to allfit_owner
  using (exists (
    select 1 from planning.planned_sessions as session
    where session.template_version_id = session_template_versions.id
      and session.person_id = access_control.person()
  ));

-- ---------------------------------------------------------------------------
-- Shared checks
-- ---------------------------------------------------------------------------

/*
 * A3 or A7: a live member of the organization, holding the capability when one is
 * named, who is the holder or an accepted cover of this relationship. A relationship
 * that is absent and one that is not hers answer the same.
 */
create function planning.require_effective_coach(
  p_person_id uuid,
  p_organization_id uuid,
  p_relationship_id uuid,
  p_capability text
)
returns uuid
language plpgsql
volatile
security definer
set search_path = pg_catalog
as $function$
declare
  actor_membership_id uuid;
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

  if p_capability is not null
     and not access_control.has_capability(p_organization_id, p_capability) then
    raise exception 'this action requires %', p_capability using errcode = '42501';
  end if;

  if not exists (
       select 1 from relationships.service_relationships as relationship
       where relationship.id = p_relationship_id
         and relationship.organization_id = p_organization_id
     )
     or not relationships.actor_is_assigned(p_relationship_id) then
    raise exception 'relationship not found' using errcode = 'P0002';
  end if;

  return actor_membership_id;
end
$function$;

alter function planning.require_effective_coach(uuid, uuid, uuid, text) owner to allfit_owner;
revoke all on function planning.require_effective_coach(uuid, uuid, uuid, text) from public, allfit_api;

-- The grant the action relies on, or `AF430` naming the scope and level it lacks.
create function planning.require_training_grant(
  p_relationship_id uuid,
  p_level privacy.access_level
)
returns table (grant_id uuid, scope_version integer)
language plpgsql
stable
security definer
set search_path = pg_catalog
as $function$
begin
  return query
  select shared.grant_id, definition.version_number
  from access_control.grant_of(p_relationship_id, 'relationship_training') as shared
  left join privacy.scope_definitions as definition on definition.id = shared.scope_definition_id
  where p_level = 'read' or shared.access_level = 'contribute';

  if not found then
    raise exception 'the person does not share her training at this level'
      using errcode = 'AF430', detail = 'relationship_training:' || p_level::text;
  end if;
end
$function$;

alter function planning.require_training_grant(uuid, privacy.access_level) owner to allfit_owner;
revoke all on function planning.require_training_grant(uuid, privacy.access_level)
  from public, allfit_api;

/*
 * Whether the assignment shares days with another live program of the person: a
 * session still waiting on a date inside its span. Only meaningful inside the
 * `relationship_assignment` scope, and only ever answered as a boolean.
 */
create function planning.assignment_overlaps(p_assignment_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $function$
  with span as (
    select assignment.person_id,
           min((session.scheduled_at at time zone session.timezone)::date) as first_day,
           case when bool_or(version.repeats_forever) then null
                else max((session.scheduled_at at time zone session.timezone)::date) end as last_day
    from planning.program_assignments as assignment
    join planning.program_versions as version on version.id = assignment.program_version_id
    join planning.planned_sessions as session on session.assignment_id = assignment.id
    where assignment.id = p_assignment_id
    group by assignment.person_id
  )
  select exists (
    select 1
    from span
    join planning.planned_sessions as other on other.person_id = span.person_id
    join planning.program_assignments as other_assignment on other_assignment.id = other.assignment_id
    where other.assignment_id <> p_assignment_id
      and other.status = 'scheduled'
      and other_assignment.lifecycle in ('personal', 'active')
      and (other.scheduled_at at time zone other.timezone)::date >= span.first_day
      and (span.last_day is null
           or (other.scheduled_at at time zone other.timezone)::date <= span.last_day)
  )
$function$;

alter function planning.assignment_overlaps(uuid) owner to allfit_owner;
revoke all on function planning.assignment_overlaps(uuid) from public, allfit_api;

-- The command's answer, `ProgramAssignment` in the contract.
create function planning.relationship_assignment_projection(p_assignment_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog
as $function$
  select jsonb_build_object(
    'id', assignment.id,
    'status', assignment.lifecycle::text,
    'origin_relationship_id', assignment.origin_relationship_id,
    'program_version_id', assignment.program_version_id,
    'starts_on', assignment.starts_on,
    'timezone', assignment.timezone,
    'management', (
      select jsonb_build_object('relationship_id', period.relationship_id, 'since', period.started_at)
      from planning.assignment_management_periods as period
      where period.assignment_id = assignment.id and period.ended_at is null
    ),
    'planned_sessions_created', (
      select count(*)::integer from planning.planned_sessions as session
      where session.assignment_id = assignment.id
    ),
    'schedule_overlaps', planning.assignment_overlaps(assignment.id)
  )
  from planning.program_assignments as assignment
  where assignment.id = p_assignment_id
$function$;

alter function planning.relationship_assignment_projection(uuid) owner to allfit_owner;
revoke all on function planning.relationship_assignment_projection(uuid) from public, allfit_api;

-- One item of OP-PLN-018: the assignment, its version and its calendar.
create function planning.relationship_assignment_item(p_assignment_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog
as $function$
  select jsonb_build_object(
    'id', assignment.id,
    'status', assignment.lifecycle::text,
    'program_version', jsonb_build_object(
      'id', version.id,
      'program_id', version.program_id,
      'version_number', version.version_number,
      'title', version.title,
      'repeats_forever', version.repeats_forever
    ),
    'starts_on', assignment.starts_on,
    'timezone', assignment.timezone,
    'assigned_at', assignment.assigned_at,
    'management', (
      select jsonb_build_object('relationship_id', period.relationship_id, 'since', period.started_at)
      from planning.assignment_management_periods as period
      where period.assignment_id = assignment.id and period.ended_at is null
    ),
    'sessions', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', session.id,
               'template_version_id', session.template_version_id,
               'title', template_version.title,
               'week_starts_on', session.week_starts_on,
               'program_day', session.program_day,
               'scheduled_on', (session.scheduled_at at time zone session.timezone)::date,
               'status', session.status
             ) order by session.scheduled_at, session.id)
      from planning.planned_sessions as session
      join planning.session_template_versions as template_version
        on template_version.id = session.template_version_id
      where session.assignment_id = assignment.id
    ), '[]'::jsonb)
  )
  from planning.program_assignments as assignment
  join planning.program_versions as version on version.id = assignment.program_version_id
  where assignment.id = p_assignment_id
$function$;

alter function planning.relationship_assignment_item(uuid) owner to allfit_owner;
revoke all on function planning.relationship_assignment_item(uuid) from public, allfit_api;

-- ---------------------------------------------------------------------------
-- OP-PLN-010
-- ---------------------------------------------------------------------------

create function planning.assign_program_from_relationship(
  p_person_id uuid,
  p_organization_id uuid,
  p_relationship_id uuid,
  p_program_version_id uuid,
  p_starts_on date,
  p_timezone text,
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
  receipt record;
  subject record;
  open_ended boolean;
  zone text;
  today date;
  front integer;
  new_assignment_id uuid;
  document jsonb;
begin
  perform planning.require_effective_coach(
    p_person_id, p_organization_id, p_relationship_id, 'assign_programs'
  );
  perform planning.require_training_grant(p_relationship_id, 'contribute');

  select * into receipt from system.begin_idempotency(
    p_person_id, 'OP-PLN-010', p_idempotency_key, p_command_id, p_request_hash
  );

  -- Shared, so a termination waits for this to commit and detaches it, or this waits
  -- for the termination and finds the relationship over.
  select relationship.status, relationship.person_id into subject
  from relationships.service_relationships as relationship
  where relationship.id = p_relationship_id
  for share;

  if not receipt.claimed then
    perform access_control.open_contract_scope('relationship_assignment', subject.person_id);
    document := planning.relationship_assignment_projection(receipt.aggregate_id);
    perform set_config('app.contract_scope_purpose', coalesce(previous_purpose, ''), true);
    perform set_config('app.contract_scope_id', coalesce(previous_id, ''), true);
    perform set_config('app.contract_scope_token', coalesce(previous_token, ''), true);
    return query select document, true;
    return;
  end if;

  if subject.status is distinct from 'active' then
    raise exception 'only a live relationship receives a program' using errcode = '55000';
  end if;

  -- Published and not retired (HU-STUDIO-043 criterion 1), and this organization's own.
  -- Shared, so a concurrent retirement cannot slip in between the check and the insert.
  select version.repeats_forever into open_ended
  from planning.program_versions as version
  join planning.programs as program on program.id = version.program_id
  where version.id = p_program_version_id
    and version.status = 'published'
    and program.owner_organization_id = p_organization_id
    and program.status <> 'archived'
  for share of version;
  if not found then
    raise exception 'this program version cannot be assigned'
      using errcode = '22023', detail = '["program-version"]';
  end if;

  perform access_control.open_contract_scope('relationship_assignment', subject.person_id);

  -- Where her device last placed her; Studio's zone only when no device ever did.
  select assignment.timezone into zone
  from planning.program_assignments as assignment
  where assignment.person_id = subject.person_id
    and assignment.origin_relationship_id is null
  order by assignment.assigned_at desc, assignment.id desc
  limit 1;
  zone := coalesce(zone, nullif(btrim(p_timezone), ''));
  if zone is null then
    raise exception 'no time zone is known for this person'
      using errcode = '22023', detail = '["timezone"]';
  end if;
  begin
    today := (clock_timestamp() at time zone zone)::date;
  exception when others then
    raise exception 'invalid time zone' using errcode = '22023', detail = '["timezone"]';
  end;

  if p_starts_on is null or p_starts_on < today then
    raise exception 'a program starts today or later in the person''s own day'
      using errcode = '22023', detail = '["starts-on"]';
  end if;

  -- In front of everything, as taking a program in Space does.
  select coalesce(min(assignment.display_order), 1) - 1 into front
  from planning.program_assignments as assignment
  where assignment.person_id = subject.person_id;

  insert into planning.program_assignments (
    person_id, program_version_id, origin_relationship_id, lifecycle, starts_on, timezone,
    display_order
  ) values (
    subject.person_id, p_program_version_id, p_relationship_id, 'active', p_starts_on, zone, front
  )
  returning id into new_assignment_id;

  insert into planning.assignment_management_periods (assignment_id, person_id, relationship_id)
  values (new_assignment_id, subject.person_id, p_relationship_id);

  -- ADR-032: a finite version is planted whole; an open-ended one, only its first week.
  -- Week N is calendar week N from the one holding the start; earlier days of that week
  -- move to the start, never before it.
  insert into planning.planned_sessions (
    assignment_id, person_id, template_version_id, program_day, week_starts_on,
    scheduled_at, timezone
  )
  select new_assignment_id, subject.person_id, composition.template_version_id, composition.day,
         calendar.first_week + ((composition.week - 1) * 7),
         greatest(
           (calendar.first_week + ((composition.week - 1) * 7) + composition.day - 1)::timestamp,
           p_starts_on::timestamp
         ) at time zone zone,
         zone
  from planning.program_version_sessions as composition
  cross join (select date_trunc('week', p_starts_on::timestamp)::date as first_week) as calendar
  where composition.program_version_id = p_program_version_id
    and (not open_ended or composition.week = 1);

  perform system.enqueue_outbox_event(
    'program_assignment', new_assignment_id, 'planning.assignment_created.v1',
    jsonb_build_object(
      'assignment_id', new_assignment_id,
      'person_id', subject.person_id,
      'relationship_id', p_relationship_id,
      'program_version_id', p_program_version_id,
      'starts_on', p_starts_on
    )
  );

  document := planning.relationship_assignment_projection(new_assignment_id);
  perform set_config('app.contract_scope_purpose', coalesce(previous_purpose, ''), true);
  perform set_config('app.contract_scope_id', coalesce(previous_id, ''), true);
  perform set_config('app.contract_scope_token', coalesce(previous_token, ''), true);

  perform system.finish_idempotency(
    receipt.receipt_id, 201::smallint, 'program-assignment-created',
    'program_assignment', new_assignment_id
  );
  return query select document, false;
end
$function$;

alter function planning.assign_program_from_relationship(uuid, uuid, uuid, uuid, date, text, uuid, uuid, bytea)
  owner to allfit_owner;
revoke all on function planning.assign_program_from_relationship(uuid, uuid, uuid, uuid, date, text, uuid, uuid, bytea)
  from public;
grant execute on function planning.assign_program_from_relationship(uuid, uuid, uuid, uuid, date, text, uuid, uuid, bytea)
  to allfit_api;

-- ---------------------------------------------------------------------------
-- OP-PLN-018
-- ---------------------------------------------------------------------------

-- Logged before anything is returned; a read that cannot be traced does not happen.
create function planning.list_relationship_assignments(
  p_person_id uuid,
  p_organization_id uuid,
  p_relationship_id uuid,
  p_limit integer,
  p_cursor_updated_at timestamptz,
  p_cursor_id uuid
)
returns table (result jsonb, updated_at timestamptz, resource_id uuid)
language plpgsql
volatile
security definer
set search_path = pg_catalog
as $function$
declare
  shared record;
  subject_person_id uuid;
begin
  perform planning.require_effective_coach(p_person_id, p_organization_id, p_relationship_id, null);
  select * into shared from planning.require_training_grant(p_relationship_id, 'read');
  if nullif(current_setting('app.request_id', true), '') is null then
    raise exception 'request id required for audited read' using errcode = '22023';
  end if;

  select relationship.person_id into subject_person_id
  from relationships.service_relationships as relationship
  where relationship.id = p_relationship_id;

  perform set_config('app.purpose', 'studio_relationship_training', true);
  perform privacy.log_access_event(
    subject_person_id, null, p_relationship_id, shared.grant_id, null,
    'relationship_training', shared.scope_version, 'live', 'planning.program_assignments', 'allowed'
  );

  -- Milliseconds, as the cursor travels: a finer key would skip rows between pages.
  return query
  select planning.relationship_assignment_item(assignment.id), keyed.assigned_ms, assignment.id
  from planning.program_assignments as assignment
  cross join lateral (select date_trunc('milliseconds', assignment.assigned_at) as assigned_ms) as keyed
  where assignment.origin_relationship_id = p_relationship_id
    and (p_cursor_updated_at is null
         or (keyed.assigned_ms, assignment.id) < (p_cursor_updated_at, p_cursor_id))
  order by keyed.assigned_ms desc, assignment.id desc
  limit least(greatest(coalesce(p_limit, 26), 1), 101);
end
$function$;

alter function planning.list_relationship_assignments(uuid, uuid, uuid, integer, timestamptz, uuid)
  owner to allfit_owner;
revoke all on function planning.list_relationship_assignments(uuid, uuid, uuid, integer, timestamptz, uuid)
  from public;
grant execute on function planning.list_relationship_assignments(uuid, uuid, uuid, integer, timestamptz, uuid)
  to allfit_api;

-- ---------------------------------------------------------------------------
-- Ending the relationship detaches what it managed
-- ---------------------------------------------------------------------------

/*
 * ADR-019. The assignment waits for the person's choice, its period closes at `T`
 * and every session nobody started pauses — past ones included, so nothing is left
 * waiting on a program without a manager. Started and finished sessions, and the
 * assignment itself, stay. Restores whatever contract scope its caller held.
 */
create function planning.detach_relationship_assignments(
  p_relationship_id uuid,
  p_effective_at timestamptz
)
returns integer
language plpgsql
volatile
security definer
set search_path = pg_catalog
as $function$
declare
  previous_purpose text := current_setting('app.contract_scope_purpose', true);
  previous_id text := current_setting('app.contract_scope_id', true);
  previous_token text := current_setting('app.contract_scope_token', true);
  detached record;
  total integer := 0;
begin
  perform access_control.open_contract_scope('relationship_detachment', p_relationship_id);

  for detached in
    update planning.program_assignments as assignment
    set lifecycle = 'detached_pending_choice'
    where assignment.origin_relationship_id = p_relationship_id
      and assignment.lifecycle = 'active'
    returning assignment.id, assignment.person_id
  loop
    -- A period that began after `T` was read still closes no earlier than it began.
    update planning.assignment_management_periods as period
    set ended_at = greatest(p_effective_at, period.started_at),
        end_reason = 'relationship_ended'
    where period.assignment_id = detached.id
      and period.ended_at is null;

    update planning.planned_sessions as waiting
    set status = 'paused'
    where waiting.assignment_id = detached.id
      and waiting.status = 'scheduled'
      and not exists (
        select 1 from execution.planned_session_executions as attempt
        where attempt.planned_session_id = waiting.id
      );

    perform system.enqueue_outbox_event(
      'program_assignment', detached.id, 'planning.assignment_detached.v1',
      jsonb_build_object(
        'assignment_id', detached.id,
        'person_id', detached.person_id,
        'relationship_id', p_relationship_id,
        'detached_at', p_effective_at
      )
    );
    total := total + 1;
  end loop;

  perform set_config('app.contract_scope_purpose', coalesce(previous_purpose, ''), true);
  perform set_config('app.contract_scope_id', coalesce(previous_id, ''), true);
  perform set_config('app.contract_scope_token', coalesce(previous_token, ''), true);
  return total;
end
$function$;

alter function planning.detach_relationship_assignments(uuid, timestamptz) owner to allfit_owner;
revoke all on function planning.detach_relationship_assignments(uuid, timestamptz)
  from public, allfit_api;

/*
 * Unchanged except for the last step: the detachment, with the same instant the
 * relationship, its grants and its professional assignments end at.
 */
create or replace function relationships.close_relationship(
  p_relationship_id uuid,
  p_effective_at timestamptz,
  p_ended_by_kind identity.actor_kind,
  p_reason text
)
returns table (frozen_grants integer, closed_assignments integer)
language plpgsql
set search_path = pg_catalog
as $function$
declare
  frozen integer;
  closed integer;
  closing_organization_id uuid;
  resolver_membership_id uuid;
begin
  update relationships.service_relationships as relationship
  set status = 'terminated',
      ended_at = p_effective_at,
      ended_reason = p_reason,
      ended_by_kind = p_ended_by_kind,
      updated_at = p_effective_at
  where relationship.id = p_relationship_id
    and relationship.status = 'active'
  returning relationship.organization_id into closing_organization_id;

  if not found then
    raise exception 'the relationship could not be closed' using errcode = 'P0004';
  end if;

  if p_ended_by_kind = 'professional' then
    select membership.id into resolver_membership_id
    from organizations.organization_memberships as membership
    where membership.organization_id = closing_organization_id
      and membership.person_id = access_control.person()
      and membership.status = 'active';
  end if;

  perform relationships.settle_termination_requests(
    p_relationship_id,
    case when resolver_membership_id is null then 'superseded' else 'resolved' end
      ::relationships.termination_request_status,
    resolver_membership_id,
    p_effective_at,
    null
  );

  -- Only what is still active: a grant the person revoked stays revoked.
  update privacy.data_grants as shared
  set status = 'frozen',
      frozen_at = p_effective_at,
      updated_at = p_effective_at
  where shared.relationship_id = p_relationship_id
    and shared.status = 'active';
  get diagnostics frozen = row_count;

  -- The holder and every cover she accepted; an unanswered proposal grants nothing.
  update relationships.relationship_professional_assignments as assignment
  set status = 'ended',
      valid_to = p_effective_at,
      updated_at = p_effective_at
  where assignment.relationship_id = p_relationship_id
    and assignment.status = 'active'
    and (assignment.kind = 'holder' or assignment.accepted_by_person_at is not null);
  get diagnostics closed = row_count;

  perform planning.detach_relationship_assignments(p_relationship_id, p_effective_at);

  return query select frozen, closed;
end
$function$;

-- ---------------------------------------------------------------------------
-- Space shows the gym's program as hers to train
-- ---------------------------------------------------------------------------

create or replace function planning.read_current_assignment(p_person_id uuid)
returns table (
  assignment_id uuid, program_version_id uuid, title text, starts_on date, timezone text,
  sessions_planned integer
)
language sql
security definer
set search_path = pg_catalog
as $function$
  select assignment.id,
         assignment.program_version_id,
         version.title,
         assignment.starts_on,
         assignment.timezone,
         (select count(*)::integer
            from planning.planned_sessions as session
           where session.assignment_id = assignment.id)
  from planning.program_assignments as assignment
  join planning.program_versions as version on version.id = assignment.program_version_id
  where assignment.person_id = p_person_id
    and assignment.lifecycle in ('personal', 'active')
    and access_control.actor_kind() = 'person'
    and access_control.person() = p_person_id
  order by assignment.display_order, assignment.assigned_at desc, assignment.id desc
  limit 1
$function$;

create or replace function planning.read_today_session(p_person_id uuid, p_timezone text)
returns table (
  planned_session_id uuid, assignment_id uuid, program_title text, session_title text,
  discipline_code text, scheduled_on date, status text, exercise_count integer,
  executed_session_id uuid, execution_status text
)
language plpgsql
security definer
set search_path = pg_catalog
as $function$
begin
  perform planning.plant_my_open_week(p_person_id, p_timezone);
  return query
  select session.id,
         session.assignment_id,
         version.title,
         template_version.title,
         template_version.discipline_code,
         (session.scheduled_at at time zone session.timezone)::date,
         session.status,
         (select count(*)::integer from planning.planned_steps as step
           where step.template_version_id = session.template_version_id),
         open_attempt.executed_session_id,
         open_attempt.execution_status::text
  from planning.planned_sessions as session
  join planning.program_assignments as assignment on assignment.id = session.assignment_id
  join planning.program_versions as version on version.id = assignment.program_version_id
  join planning.session_template_versions as template_version
    on template_version.id = session.template_version_id
  left join lateral (
    select attempt.executed_session_id, executed.execution_status
    from execution.planned_session_executions as attempt
    join execution.executed_sessions as executed on executed.id = attempt.executed_session_id
    where attempt.planned_session_id = session.id
      and executed.execution_status = 'in_progress'
    order by attempt.attempt_number desc
    limit 1
  ) as open_attempt on true
  where session.person_id = p_person_id
    -- A detached or ended program offers nothing to train.
    and assignment.lifecycle in ('personal', 'active')
    and session.week_starts_on
        = date_trunc('week', (clock_timestamp() at time zone p_timezone))::date
    -- Pending, or already open: an attempt in progress is what somebody comes back
    -- to, and offering the next one instead would strand it.
    and (session.status = 'scheduled' or open_attempt.executed_session_id is not null)
    and access_control.actor_kind() = 'person'
    and access_control.person() = p_person_id
  order by open_attempt.executed_session_id nulls last, session.scheduled_at
  limit 1;
end
$function$;

create or replace function planning.plant_my_open_week(p_person_id uuid, p_timezone text)
returns void
language plpgsql
volatile
security definer
set search_path = pg_catalog
as $function$
declare
  this_week date;
  assignment record;
  program_week integer;
  cycle integer;
  composition_week integer;
begin
  this_week := date_trunc('week', (clock_timestamp() at time zone p_timezone))::date;

  for assignment in
    select taken.id, taken.program_version_id, taken.starts_on, taken.timezone
    from planning.program_assignments as taken
    join planning.program_versions as version on version.id = taken.program_version_id
    where taken.person_id = p_person_id
      and taken.lifecycle in ('personal', 'active')
      and version.repeats_forever
    order by taken.id
  loop
    program_week := (this_week - date_trunc('week', assignment.starts_on::timestamp)::date) / 7 + 1;
    if program_week < 1 then
      continue;
    end if;

    perform pg_advisory_xact_lock(hashtextextended(assignment.id::text, 0::bigint));

    if exists (
      select 1 from planning.planned_sessions as planted
      where planted.assignment_id = assignment.id
        and planted.week_starts_on = this_week
    ) then
      continue;
    end if;

    select max(composed.week) into cycle
    from planning.program_version_sessions as composed
    where composed.program_version_id = assignment.program_version_id;
    if cycle is null or cycle < 1 then
      continue;
    end if;
    composition_week := ((program_week - 1) % cycle) + 1;

    insert into planning.planned_sessions (
      assignment_id, person_id, template_version_id, program_day,
      week_starts_on, scheduled_at, timezone
    )
    select assignment.id, p_person_id, composed.template_version_id,
           composed.day,
           this_week,
           (this_week + composed.day - 1)::timestamp at time zone assignment.timezone,
           assignment.timezone
    from planning.program_version_sessions as composed
    where composed.program_version_id = assignment.program_version_id
      and composed.week = composition_week;
  end loop;
end
$function$;

create or replace function planning.reorder_my_programs(p_person_id uuid, p_assignment_ids uuid[], p_idempotency_key uuid, p_command_id uuid, p_request_hash bytea)
returns integer
language plpgsql
security definer
set search_path = pg_catalog
AS $function$
declare
  receipt record;
  owned integer;
begin
  if access_control.actor_kind() <> 'person' or access_control.person() <> p_person_id then
    raise exception 'assignment person does not match the authenticated actor' using errcode = '42501';
  end if;

  select * into receipt from system.begin_idempotency(
    p_person_id, 'OP-PLN-024', p_idempotency_key, p_command_id, p_request_hash
  );
  if not receipt.claimed then
    return cardinality(p_assignment_ids);
  end if;

  if p_assignment_ids is null or cardinality(p_assignment_ids) = 0 then
    raise exception 'an order with nothing in it is not an order' using errcode = '22023';
  end if;
  if cardinality(p_assignment_ids) <> cardinality(array(select distinct unnest(p_assignment_ids))) then
    raise exception 'the order repeats an assignment' using errcode = '22023';
  end if;

  -- Every id has to be one of theirs, and all of them have to be there. A partial
  -- order would silently leave whatever was omitted wherever it happened to be.
  select count(*)::integer into owned
  from planning.program_assignments as assignment
  where assignment.person_id = p_person_id
    and assignment.lifecycle in ('personal', 'active');
  if owned <> cardinality(p_assignment_ids) then
    raise exception 'the order does not cover every programme' using errcode = '22023';
  end if;

  update planning.program_assignments as assignment
  set display_order = position.ordinality
  from unnest(p_assignment_ids) with ordinality as position(id, ordinality)
  where assignment.id = position.id
    and assignment.person_id = p_person_id
    and assignment.lifecycle in ('personal', 'active');

  if not found then
    raise exception 'the order names no assignment of this person''s' using errcode = '42501';
  end if;

  perform system.finish_idempotency(
    receipt.receipt_id, 200::smallint, 'programs-reordered', 'person', p_person_id
  );
  return cardinality(p_assignment_ids);
end
$function$;

create or replace function planning.read_week_plan(p_person_id uuid, p_timezone text)
returns TABLE(assignment_id uuid, program_version_id uuid, program_title text, program_week integer, week_starts_on date, sessions jsonb)
language plpgsql
security definer
set search_path = pg_catalog
AS $function$
begin
  perform planning.plant_my_open_week(p_person_id, p_timezone);
  return query
  select assignment.id,
         version.id,
         version.title,
         (((clock_timestamp() at time zone p_timezone)::date
           - date_trunc('week', assignment.starts_on::timestamp)::date) / 7 + 1)::integer,
         date_trunc('week', (clock_timestamp() at time zone p_timezone))::date,
         coalesce(week.entries, '[]'::jsonb)
  from planning.program_assignments as assignment
  join planning.program_versions as version on version.id = assignment.program_version_id
  left join lateral (
    select jsonb_agg(to_jsonb(entry) order by entry.scheduled_at) as entries
    from (
      select session.id as planned_session_id,
             -- Lo que la sesión apunta, no lo que el lateral unió: son la misma fila.
             session.template_version_id,
             template_version.title as title,
             template_version.discipline_code,
             session.status,
             session.program_day,
             session.scheduled_at,
             (select count(*)::integer from planning.planned_steps as step
               where step.template_version_id = session.template_version_id) as exercise_count,
             (select coalesce(sum(target.target_sets), 0)::integer
               from planning.planned_steps as step
               join planning.strength_targets as target on target.planned_step_id = step.id
               where step.template_version_id = session.template_version_id) as set_count,
             exists (
               select 1 from execution.planned_session_executions as attempt
               join execution.executed_sessions as executed on executed.id = attempt.executed_session_id
               where attempt.planned_session_id = session.id
                 and executed.execution_status = 'completed'
             ) as done,
             (
               select attempt.executed_session_id
               from execution.planned_session_executions as attempt
               join execution.executed_sessions as executed on executed.id = attempt.executed_session_id
               where attempt.planned_session_id = session.id
                 and executed.execution_status = 'in_progress'
               order by attempt.attempt_number desc
               limit 1
             ) as open_execution_id,
             -- Por plantilla y no por sesión planificada: la última vez que se hizo
             -- **esta rutina**, la haya pedido el programa el día que la haya pedido.
             (
               select jsonb_build_object(
                        'trained_on',
                        (executed.started_at at time zone trained.timezone)::date,
                        'seconds',
                        case
                          when executed.ended_at is null then null
                          else extract(epoch from executed.ended_at - executed.started_at)::integer
                        end,
                        'sets',
                        (select count(*)::integer
                           from execution.strength_sets as recorded
                          where recorded.executed_session_id = executed.id
                            and recorded.kind <> 'warmup'),
                        'tonnage_kg',
                        (
                          select case
                            -- Nada con carga: no es que pesara cero, es que no se pesa.
                            when count(*) filter (
                              where recorded.load_value is not null
                                and recorded.achieved_reps is not null) = 0 then null
                            -- Una unidad que no resuelve como masa anula el total: sumar
                            -- lo que sí resuelve daría un número más bajo que el real.
                            when count(*) filter (
                              where recorded.load_value is not null
                                and unit.to_canonical_factor is null) > 0 then null
                            else sum(recorded.achieved_reps * recorded.load_value
                                     * unit.to_canonical_factor)
                                 filter (where recorded.load_value is not null
                                           and recorded.achieved_reps is not null)
                          end
                          from execution.strength_sets as recorded
                          left join catalog.units as unit
                            on unit.code = recorded.load_unit_code
                           and unit.dimension = 'mass'
                          where recorded.executed_session_id = executed.id
                            and recorded.kind <> 'warmup'
                        )
                      )
               from execution.planned_session_executions as attempt
               join execution.executed_sessions as executed
                 on executed.id = attempt.executed_session_id
               join planning.planned_sessions as trained
                 on trained.id = attempt.planned_session_id
               join planning.session_template_versions as trained_version
                 on trained_version.id = trained.template_version_id
               where trained_version.template_id = template_version.template_id
                 and trained.person_id = p_person_id
                 and executed.execution_status = 'completed'
                 and executed.annulled_at is null
               order by executed.started_at desc
               limit 1
             ) as last_time
      from planning.planned_sessions as session
      join planning.session_template_versions as template_version
        on template_version.id = session.template_version_id
      where session.assignment_id = assignment.id
        and session.week_starts_on
            = date_trunc('week', (clock_timestamp() at time zone p_timezone))::date
    ) as entry
  ) as week on true
  where assignment.person_id = p_person_id
    and assignment.lifecycle in ('personal', 'active')
    and access_control.actor_kind() = 'person'
    and access_control.person() = p_person_id
  order by assignment.display_order, assignment.assigned_at desc
  limit 1;
end
$function$;

-- `managed_by` is new in the result, so the function is replaced rather than redefined.
drop function planning.read_my_programs(uuid);

create function planning.read_my_programs(p_person_id uuid)
returns TABLE(assignment_id uuid, program_version_id uuid, program_id uuid, title text, weeks integer, days_per_week integer, starts_on date, sessions_done integer, sessions_planned integer, editable boolean, cover_object_key text, routine_cover jsonb, managed_by text)
language sql
security definer
set search_path = pg_catalog
AS $function$
  select assignment.id,
         version.id,
         version.program_id,
         version.title,
         case when version.repeats_forever then null else composition.cycle end,
         composition.days_per_week,
         assignment.starts_on,
         counted.done,
         counted.planned,
         -- A draft exists only for a programme somebody wrote here. A fork has none,
         -- and a programme whose weeks differ cannot be said as one repeated week.
         assignment.origin_relationship_id is null
           and draft.id is not null
           and composition.cycle * composition.days_per_week = composition.sessions,
         -- La misma respuesta de siempre —una dirección por programa, con el nombre
         -- de la columna intacto— sólo que del juego de quien pregunta.
         planning.cover_for(program.id, p_person_id),
         -- El estilo que llevan sus rutinas, que es una decisión del programa y no de
         -- cada una: seis tarjetas con seis lenguajes distintos en el mismo carrusel.
         case when program.routine_cover_kind is null then null else jsonb_strip_nulls(
           jsonb_build_object('kind', program.routine_cover_kind, 'icon', program.routine_cover_icon)
         ) end,
         -- The gym that manages it; a gym's program shows no editor and no personal cover.
         (select organization.display_name
            from relationships.service_relationships as relationship
            join organizations.organizations as organization
              on organization.id = relationship.organization_id
           where relationship.id = assignment.origin_relationship_id
             and assignment.lifecycle = 'active')
  from planning.program_assignments as assignment
  join planning.program_versions as version on version.id = assignment.program_version_id
  left join planning.programs as program on program.id = version.program_id
  left join planning.program_drafts as draft on draft.program_id = version.program_id
  join lateral (
    select max(session.week) as cycle,
           count(distinct session.day) filter (where session.week = 1)::integer as days_per_week,
           count(*)::integer as sessions
    from planning.program_version_sessions as session
    where session.program_version_id = version.id
  ) as composition on true
  join lateral (
    select count(*) filter (where session.status = 'completed')::integer as done,
           count(*)::integer as planned
    from planning.planned_sessions as session
    where session.assignment_id = assignment.id
  ) as counted on true
  where assignment.person_id = p_person_id
    and assignment.lifecycle in ('personal', 'active')
    and access_control.actor_kind() = 'person'
    and access_control.person() = p_person_id
  order by assignment.display_order, assignment.assigned_at desc
$function$;

alter function planning.read_my_programs(uuid) owner to allfit_owner;
revoke all on function planning.read_my_programs(uuid) from public;
grant execute on function planning.read_my_programs(uuid) to allfit_api;

commit;
