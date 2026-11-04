-- OP-PLN-012, OP-PLN-013 and OP-PLN-014 (HU-STUDIO-048, HU-STUDIO-049, HU-STUDIO-050):
-- while the gym manages a program it gave, the coach moves a session, adjusts the
-- prescription for this one person, and the gym can stop the program.
--
-- What has to hold:
--
--   · Only while the gym manages it: assignment `active` with an open management
--     period, relationship active, and an active `relationship_training` grant at
--     `contribute`. A personal or detached assignment has no manager and refuses all
--     three (`55000`).
--   · Moving a session changes its day, never its content, and only inside the
--     calendar week it belongs to: a week is what Space offers (ADR-032), so moving it
--     out would empty one week and crowd another. A started session does not move. The
--     coach names the revision she read (`expected_revision`); a stale one is refused
--     with the current state, and every move is kept with its author.
--   · An adjustment lives on the assignment, never on the published template or program
--     (T-ASG-7). Revisions are typed (DD §9.15) and append-only; the latest of each kind
--     is in force. Space reads the adjusted target wherever it read the program's: the
--     session being trained and the week. Adjustments outlive the management period, so
--     a detached program keeps them.
--   · Cancelling ends the assignment and cancels only the sessions from today on that
--     nobody started. Past sessions, what was trained and the row itself stay (T-ASG-5).
--     Cancelling twice converges.
--
-- **Who.** The coach who attends the person, holder or accepted cover (A3, A7), for all
-- three; the admin and the owner (A4, A5) may also cancel through
-- `manage_relationships`, without attending her. Everyone needs the grant: a missing
-- one raises `AF430` naming it, as OP-PLN-010 does.
--
-- **Finding the assignment.** The path names a session or an assignment, not the
-- relationship, so the commands first resolve which relationship it belongs to through
-- a contract scope keyed by that id, and only then apply the live formula. That lets a
-- missing grant answer `scope-required` rather than `not-found`, and lets an admin
-- reach an assignment the formula would hide from her. An id of another organization
-- answers as if it did not exist.
--
-- **Concurrency.** Each command holds the relationship `for share` — a termination waits
-- for it or it finds the relationship over — and the assignment's advisory lock, which
-- Space also takes to plant an open-ended week. Rows a started session could race are
-- locked in a statement of their own before the one that decides, so the decision sees
-- an attempt that committed while it waited.
set lock_timeout = '5s';
set statement_timeout = '60s';

begin;

-- ---------------------------------------------------------------------------
-- A session carries a revision, and its moves are kept
-- ---------------------------------------------------------------------------

alter table planning.planned_sessions
  add column revision_number bigint not null default 0,
  add constraint ck_planned_sessions_revision check (revision_number >= 0);

create table planning.planned_session_reschedules (
  id uuid not null default extensions.uuid_generate_v7(),
  planned_session_id uuid not null,
  person_id uuid not null,
  assignment_id uuid not null,
  relationship_id uuid not null,
  moved_from date not null,
  moved_to date not null,
  rescheduled_by_membership_id uuid not null,
  created_at timestamptz not null default clock_timestamp(),
  constraint pk_planned_session_reschedules primary key (id),
  -- Cascades with the session: removing an untrained session (OP-PLN-034) takes its moves.
  constraint fk_planned_session_reschedules_session foreign key (planned_session_id, person_id) references planning.planned_sessions (id, person_id) on delete cascade,
  constraint fk_planned_session_reschedules_assignment foreign key (assignment_id, person_id) references planning.program_assignments (id, person_id) on delete restrict,
  constraint fk_planned_session_reschedules_relationship foreign key (relationship_id, person_id) references relationships.service_relationships (id, person_id) on delete restrict,
  constraint fk_planned_session_reschedules_membership foreign key (rescheduled_by_membership_id) references organizations.organization_memberships (id) on delete restrict,
  constraint ck_planned_session_reschedules_moved check (moved_from <> moved_to)
);

create index idx_planned_session_reschedules_session
  on planning.planned_session_reschedules (planned_session_id, created_at);

create function planning.keep_reschedule_tg()
returns trigger
language plpgsql
set search_path = pg_catalog
as $function$
begin
  raise exception 'a reschedule is history and is never rewritten' using errcode = '23514';
end
$function$;

alter function planning.keep_reschedule_tg() owner to allfit_owner;
revoke all on function planning.keep_reschedule_tg() from public, allfit_api;

create trigger trg_planned_session_reschedules_before_update_keep
before update on planning.planned_session_reschedules
for each row execute function planning.keep_reschedule_tg();

alter table planning.planned_session_reschedules enable row level security;
alter table planning.planned_session_reschedules force row level security;
alter table planning.planned_session_reschedules owner to allfit_owner;
revoke all on planning.planned_session_reschedules from public;

-- ---------------------------------------------------------------------------
-- Prescription revisions (DD §9.15)
-- ---------------------------------------------------------------------------

-- The target families each kind of adjustment applies to; null for an unknown kind.
create function planning.prescription_kind_families(p_kind text)
returns text[]
language sql
immutable
set search_path = pg_catalog
as $function$
  select case
    when p_kind in ('target_sets', 'target_reps', 'target_load') then array['strength']
    when p_kind = 'target_rpe' then array['strength', 'interval']
    when p_kind in ('target_distance', 'target_duration', 'target_pace') then array['endurance']
    when p_kind in ('rounds', 'work_duration', 'rest_duration') then array['interval']
    when p_kind in ('hold_duration', 'target_repetitions', 'side') then array['mobility']
    when p_kind = 'notes' then array['strength', 'endurance', 'interval', 'mobility']
  end
$function$;

alter function planning.prescription_kind_families(text) owner to allfit_owner;
revoke all on function planning.prescription_kind_families(text) from public, allfit_api;

/*
 * Exactly one value, in the column its kind takes, within the range the target table
 * itself accepts. Durations are seconds and carry no unit; load, distance and pace do.
 * Shared by the check constraint and the command, so both refuse the same values.
 */
create function planning.prescription_value_fits(
  p_kind text,
  p_numeric numeric,
  p_integer integer,
  p_text text,
  p_unit_code text
)
returns boolean
language sql
immutable
set search_path = pg_catalog
as $function$
  select num_nonnulls(p_numeric, p_integer, p_text) = 1
    and (p_unit_code is null or p_numeric is not null)
    and coalesce(
      case
        when p_kind in ('target_sets', 'target_reps', 'rounds', 'target_repetitions')
          then p_integer > 0
        when p_kind = 'target_load' then p_numeric >= 0 and p_unit_code is not null
        when p_kind = 'target_rpe' then p_numeric between 0 and 10 and p_unit_code is null
        when p_kind in ('target_distance', 'target_pace')
          then p_numeric > 0 and p_unit_code is not null
        when p_kind in ('target_duration', 'work_duration', 'hold_duration')
          then p_numeric > 0 and p_unit_code is null
        when p_kind = 'rest_duration' then p_numeric >= 0 and p_unit_code is null
        when p_kind = 'side' then p_text in ('left', 'right', 'bilateral', 'not_applicable')
        when p_kind = 'notes' then btrim(p_text) <> '' and char_length(p_text) <= 2000
      end,
      false
    )
$function$;

alter function planning.prescription_value_fits(text, numeric, integer, text, text) owner to allfit_owner;
revoke all on function planning.prescription_value_fits(text, numeric, integer, text, text)
  from public, allfit_api;

create table planning.prescription_revisions (
  id uuid not null default extensions.uuid_generate_v7(),
  assignment_id uuid not null,
  person_id uuid not null,
  planned_step_id uuid not null,
  override_kind text not null,
  value_numeric numeric,
  value_integer integer,
  value_text text,
  unit_code text,
  created_by_assignment_id uuid not null,
  created_at timestamptz not null default clock_timestamp(),
  constraint pk_prescription_revisions primary key (id),
  constraint fk_prescription_revisions_assignment foreign key (assignment_id, person_id) references planning.program_assignments (id, person_id) on delete restrict,
  constraint fk_prescription_revisions_author foreign key (created_by_assignment_id, person_id) references relationships.relationship_professional_assignments (id, person_id) on delete restrict,
  constraint fk_prescription_revisions_step foreign key (planned_step_id) references planning.planned_steps (id) on delete restrict,
  constraint fk_prescription_revisions_unit foreign key (unit_code) references catalog.units (code) on delete restrict,
  constraint ck_prescription_revisions_kind check (
    override_kind in (
      'target_sets', 'target_reps', 'target_load', 'target_rpe', 'target_distance',
      'target_duration', 'target_pace', 'rounds', 'work_duration', 'rest_duration',
      'hold_duration', 'target_repetitions', 'side', 'notes'
    )
  ),
  constraint ck_prescription_revisions_value check (
    planning.prescription_value_fits(override_kind, value_numeric, value_integer, value_text, unit_code)
  )
);

create index idx_prescription_revisions_assignment_step
  on planning.prescription_revisions (assignment_id, planned_step_id, override_kind, created_at desc);

/*
 * The target family of a step of the version the assignment points at, or null when
 * the step is not part of it. A family the catalogue no longer resolves is `unknown`:
 * only a note fits it.
 */
create function planning.assigned_step_family(p_assignment_id uuid, p_step_id uuid)
returns text
language sql
stable
security definer
set search_path = pg_catalog
as $function$
  select coalesce(
    catalog.activity_type_target_family(coalesce(step.activity_type_id, version.activity_type_id))::text,
    'unknown'
  )
  from planning.program_assignments as assignment
  join planning.program_version_sessions as composed
    on composed.program_version_id = assignment.program_version_id
  join planning.session_template_versions as version on version.id = composed.template_version_id
  join planning.planned_steps as step on step.template_version_id = version.id
  where assignment.id = p_assignment_id
    and step.id = p_step_id
  limit 1
$function$;

alter function planning.assigned_step_family(uuid, uuid) owner to allfit_owner;
revoke all on function planning.assigned_step_family(uuid, uuid) from public, allfit_api;

-- IX-13: the step belongs to the assigned snapshot and the kind fits its family.
create function planning.enforce_prescription_override_ct()
returns trigger
language plpgsql
set search_path = pg_catalog
as $function$
declare
  step_family text;
begin
  step_family := planning.assigned_step_family(new.assignment_id, new.planned_step_id);
  if step_family is null then
    raise exception 'IX-13 the step is not part of the assigned version' using errcode = '23514';
  end if;
  if not step_family = any (planning.prescription_kind_families(new.override_kind))
     and new.override_kind <> 'notes' then
    raise exception 'IX-13 the adjustment does not fit the step''s target family'
      using errcode = '23514';
  end if;
  return null;
end
$function$;

alter function planning.enforce_prescription_override_ct() owner to allfit_owner;
revoke all on function planning.enforce_prescription_override_ct() from public, allfit_api;

create constraint trigger trg_prescription_revisions_after_insert_override
after insert on planning.prescription_revisions
for each row execute function planning.enforce_prescription_override_ct();

create function planning.keep_prescription_revision_tg()
returns trigger
language plpgsql
set search_path = pg_catalog
as $function$
begin
  raise exception 'a prescription revision is history and is never rewritten'
    using errcode = '23514';
end
$function$;

alter function planning.keep_prescription_revision_tg() owner to allfit_owner;
revoke all on function planning.keep_prescription_revision_tg() from public, allfit_api;

create trigger trg_prescription_revisions_before_change_keep
before update or delete on planning.prescription_revisions
for each row execute function planning.keep_prescription_revision_tg();

alter table planning.prescription_revisions enable row level security;
alter table planning.prescription_revisions force row level security;
alter table planning.prescription_revisions owner to allfit_owner;
revoke all on planning.prescription_revisions from public;

-- ---------------------------------------------------------------------------
-- Row policies
-- ---------------------------------------------------------------------------

-- The coach, through the live formula, while the gym manages the assignment.
create policy planned_sessions_update_managing on planning.planned_sessions
  for update to allfit_owner
  using (exists (
    select 1
    from planning.program_assignments as assignment
    join planning.assignment_management_periods as period
      on period.assignment_id = assignment.id and period.ended_at is null
    where assignment.id = planned_sessions.assignment_id
      and assignment.lifecycle = 'active'
      and access_control.can_access(assignment.origin_relationship_id, 'relationship_training', 'contribute')
  ))
  with check (exists (
    select 1
    from planning.program_assignments as assignment
    join planning.assignment_management_periods as period
      on period.assignment_id = assignment.id and period.ended_at is null
    where assignment.id = planned_sessions.assignment_id
      and assignment.lifecycle = 'active'
      and access_control.can_access(assignment.origin_relationship_id, 'relationship_training', 'contribute')
  ));

-- Whether a managed session started: the attempt, never its results.
create policy planned_session_executions_select_managing on execution.planned_session_executions
  for select to allfit_owner
  using (exists (
    select 1
    from planning.planned_sessions as session
    join planning.program_assignments as assignment on assignment.id = session.assignment_id
    where session.id = planned_session_executions.planned_session_id
      and assignment.origin_relationship_id is not null
      and access_control.can_access(assignment.origin_relationship_id, 'relationship_training', 'read')
  ));

create policy planned_session_reschedules_insert_managing on planning.planned_session_reschedules
  for insert to allfit_owner
  with check (
    rescheduled_by_membership_id::text = current_setting('app.actor_membership_id', true)
    and exists (
      select 1
      from planning.program_assignments as assignment
      join planning.assignment_management_periods as period
        on period.assignment_id = assignment.id and period.ended_at is null
      where assignment.id = planned_session_reschedules.assignment_id
        and assignment.origin_relationship_id = planned_session_reschedules.relationship_id
        and assignment.lifecycle = 'active'
        and access_control.can_access(assignment.origin_relationship_id, 'relationship_training', 'contribute')
    )
  );

create policy prescription_revisions_select_self on planning.prescription_revisions
  for select to allfit_owner
  using (person_id = access_control.person());
create policy prescription_revisions_select_managing on planning.prescription_revisions
  for select to allfit_owner
  using (exists (
    select 1 from planning.program_assignments as assignment
    where assignment.id = prescription_revisions.assignment_id
      and assignment.origin_relationship_id is not null
      and access_control.can_access(assignment.origin_relationship_id, 'relationship_training', 'read')
  ));
-- Authored by the actor's own professional assignment on the relationship that manages it.
create policy prescription_revisions_insert_managing on planning.prescription_revisions
  for insert to allfit_owner
  with check (exists (
    select 1
    from planning.program_assignments as assignment
    join planning.assignment_management_periods as period
      on period.assignment_id = assignment.id and period.ended_at is null
    join relationships.relationship_professional_assignments as author
      on author.id = prescription_revisions.created_by_assignment_id
     and author.relationship_id = assignment.origin_relationship_id
    where assignment.id = prescription_revisions.assignment_id
      and assignment.lifecycle = 'active'
      and author.membership_id::text = current_setting('app.actor_membership_id', true)
      and access_control.can_access(assignment.origin_relationship_id, 'relationship_training', 'contribute')
  ));

-- The two contract scopes: resolving which relationship an id belongs to, and
-- cancelling once the command has decided the actor may.
create policy planned_sessions_select_lookup on planning.planned_sessions
  for select to allfit_owner
  using (id::text = (select access_control.contract_scope('planned_session_lookup')));
create policy program_assignments_select_administration on planning.program_assignments
  for select to allfit_owner
  using (id::text = (select access_control.contract_scope('assignment_administration')));
create policy program_assignments_update_administration on planning.program_assignments
  for update to allfit_owner
  using (id::text = (select access_control.contract_scope('assignment_administration')))
  with check (id::text = (select access_control.contract_scope('assignment_administration')));
create policy assignment_management_periods_select_administration on planning.assignment_management_periods
  for select to allfit_owner
  using (assignment_id::text = (select access_control.contract_scope('assignment_administration')));
create policy assignment_management_periods_update_administration on planning.assignment_management_periods
  for update to allfit_owner
  using (assignment_id::text = (select access_control.contract_scope('assignment_administration')))
  with check (assignment_id::text = (select access_control.contract_scope('assignment_administration')));
-- Reading the sessions needs no policy of its own: `_select_managed` follows the assignment.
create policy planned_sessions_update_administration on planning.planned_sessions
  for update to allfit_owner
  using (assignment_id::text = (select access_control.contract_scope('assignment_administration')))
  with check (assignment_id::text = (select access_control.contract_scope('assignment_administration')));
create policy planned_session_executions_select_administration on execution.planned_session_executions
  for select to allfit_owner
  using (exists (
    select 1 from planning.planned_sessions as session
    where session.id = planned_session_executions.planned_session_id
      and session.assignment_id::text
          = (select access_control.contract_scope('assignment_administration'))
  ));

-- ---------------------------------------------------------------------------
-- Shared pieces
-- ---------------------------------------------------------------------------

-- Puts back the contract scope a caller held before a command opened its own.
create function planning.resume_contract_scope(p_purpose text, p_id text, p_token text)
returns void
language sql
volatile
set search_path = pg_catalog
as $function$
  select set_config('app.contract_scope_purpose', coalesce(p_purpose, ''), true),
         set_config('app.contract_scope_id', coalesce(p_id, ''), true),
         set_config('app.contract_scope_token', coalesce(p_token, ''), true);
$function$;

alter function planning.resume_contract_scope(text, text, text) owner to allfit_owner;
revoke all on function planning.resume_contract_scope(text, text, text) from public, allfit_api;

/*
 * Who may act on a managed assignment, named by its id or by one of its sessions.
 * Membership and capability come first, so an outsider learns nothing about which ids
 * exist; an assignment of another organization, a personal one and one the coach does
 * not attend all answer `P0002`. With `p_administrators`, `manage_relationships`
 * stands in for attending her (A4, A5). Then the grant at `contribute`, or `AF430`.
 */
create function planning.authorize_managed_assignment(
  p_person_id uuid,
  p_organization_id uuid,
  p_assignment_id uuid,
  p_planned_session_id uuid,
  p_administrators boolean
)
returns table (
  assignment_id uuid,
  relationship_id uuid,
  subject_person_id uuid,
  membership_id uuid,
  professional_assignment_id uuid
)
language plpgsql
volatile
security definer
set search_path = pg_catalog
as $function$
declare
  previous_purpose text := current_setting('app.contract_scope_purpose', true);
  previous_id text := current_setting('app.contract_scope_id', true);
  previous_token text := current_setting('app.contract_scope_token', true);
  actor_membership_id uuid;
  administrator boolean;
  resolved_assignment_id uuid := p_assignment_id;
  origin_id uuid;
  subject_id uuid;
  author_id uuid;
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

  administrator := p_administrators
    and access_control.has_capability(p_organization_id, 'manage_relationships');
  if not administrator and not access_control.has_capability(p_organization_id, 'assign_programs') then
    raise exception 'this action requires assign_programs' using errcode = '42501';
  end if;

  if p_planned_session_id is not null then
    perform access_control.open_contract_scope('planned_session_lookup', p_planned_session_id);
    select session.assignment_id into resolved_assignment_id
    from planning.planned_sessions as session
    where session.id = p_planned_session_id;
  end if;

  if resolved_assignment_id is not null then
    perform access_control.open_contract_scope('assignment_administration', resolved_assignment_id);
    select assignment.origin_relationship_id, assignment.person_id into origin_id, subject_id
    from planning.program_assignments as assignment
    where assignment.id = resolved_assignment_id;
  end if;
  perform planning.resume_contract_scope(previous_purpose, previous_id, previous_token);

  if origin_id is null
     or not exists (
       select 1 from relationships.service_relationships as relationship
       where relationship.id = origin_id
         and relationship.organization_id = p_organization_id
     ) then
    raise exception 'assignment not found' using errcode = 'P0002';
  end if;

  if relationships.actor_is_assigned(origin_id) then
    -- The same predicate as `actor_is_assigned`, for the row that answers it.
    select professional.id into author_id
    from relationships.relationship_professional_assignments as professional
    where professional.relationship_id = origin_id
      and professional.membership_id = actor_membership_id
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
    limit 1;
  end if;
  if author_id is null and not administrator then
    raise exception 'assignment not found' using errcode = 'P0002';
  end if;

  perform planning.require_training_grant(origin_id, 'contribute');

  return query select resolved_assignment_id, origin_id, subject_id, actor_membership_id, author_id;
end
$function$;

alter function planning.authorize_managed_assignment(uuid, uuid, uuid, uuid, boolean) owner to allfit_owner;
revoke all on function planning.authorize_managed_assignment(uuid, uuid, uuid, uuid, boolean)
  from public, allfit_api;

-- Managed: the assignment is `active` and its management period is open.
create function planning.is_managed(p_assignment_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $function$
  select exists (
    select 1
    from planning.program_assignments as assignment
    join planning.assignment_management_periods as period
      on period.assignment_id = assignment.id and period.ended_at is null
    where assignment.id = p_assignment_id
      and assignment.lifecycle = 'active'
  )
$function$;

alter function planning.is_managed(uuid) owner to allfit_owner;
revoke all on function planning.is_managed(uuid) from public, allfit_api;

-- One session as Studio reads it: `RelationshipAssignmentSession` in the contract.
create function planning.managed_session_item(p_planned_session_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog
as $function$
  select jsonb_build_object(
    'id', session.id,
    'template_version_id', session.template_version_id,
    'title', template_version.title,
    'week_starts_on', session.week_starts_on,
    'program_day', session.program_day,
    'scheduled_on', (session.scheduled_at at time zone session.timezone)::date,
    'status', session.status,
    'started', exists (
      select 1 from execution.planned_session_executions as attempt
      where attempt.planned_session_id = session.id
    ),
    'revision_number', session.revision_number
  )
  from planning.planned_sessions as session
  join planning.session_template_versions as template_version
    on template_version.id = session.template_version_id
  where session.id = p_planned_session_id
$function$;

alter function planning.managed_session_item(uuid) owner to allfit_owner;
revoke all on function planning.managed_session_item(uuid) from public, allfit_api;

-- One revision as Studio reads it: `PrescriptionRevision` in the contract.
create function planning.prescription_revision_document(p_revision_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog
as $function$
  select jsonb_build_object(
    'id', revision.id,
    'assignment_id', revision.assignment_id,
    'planned_step_id', revision.planned_step_id,
    'kind', revision.override_kind,
    'value', coalesce(to_jsonb(revision.value_integer), to_jsonb(revision.value_numeric),
                      to_jsonb(revision.value_text)),
    'unit_code', revision.unit_code,
    'revised_at', revision.created_at
  )
  from planning.prescription_revisions as revision
  where revision.id = p_revision_id
$function$;

alter function planning.prescription_revision_document(uuid) owner to allfit_owner;
revoke all on function planning.prescription_revision_document(uuid) from public, allfit_api;

-- ---------------------------------------------------------------------------
-- What Space trains: the program's target with the person's adjustments on top
-- ---------------------------------------------------------------------------

-- The target keys each kind writes, as the target projections name them.
create function planning.prescription_target_keys(p_kind text)
returns table (value_key text, unit_key text)
language sql
immutable
set search_path = pg_catalog
as $function$
  select fields.value_key, fields.unit_key
  from (values
    ('target_sets', 'target_sets', null),
    ('target_reps', 'target_reps', null),
    ('target_load', 'target_load_value', 'target_load_unit_code'),
    ('target_rpe', 'target_rpe', null),
    ('target_distance', 'target_distance_value', 'target_distance_unit_code'),
    ('target_duration', 'target_duration_seconds', null),
    ('target_pace', 'target_pace_seconds_per_unit', 'target_pace_unit_code'),
    ('rounds', 'rounds', null),
    ('work_duration', 'work_duration_seconds', null),
    ('rest_duration', 'rest_duration_seconds', null),
    ('hold_duration', 'hold_duration_seconds', null),
    ('target_repetitions', 'target_repetitions', null),
    ('side', 'side', null),
    ('notes', 'notes', null)
  ) as fields (kind, value_key, unit_key)
  where fields.kind = p_kind
$function$;

alter function planning.prescription_target_keys(text) owner to allfit_owner;
revoke all on function planning.prescription_target_keys(text) from public, allfit_api;

-- The adjustment in force for each kind on one step: `{kind: {value, unit}}`.
create function planning.step_adjustments(p_assignment_id uuid, p_step_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog
as $function$
  select coalesce(jsonb_object_agg(latest.override_kind, jsonb_build_object(
           'value', coalesce(to_jsonb(latest.value_integer), to_jsonb(latest.value_numeric),
                             to_jsonb(latest.value_text)),
           'unit', latest.unit_code
         )), '{}'::jsonb)
  from (
    select distinct on (revision.override_kind) revision.override_kind, revision.value_integer,
           revision.value_numeric, revision.value_text, revision.unit_code
    from planning.prescription_revisions as revision
    where revision.assignment_id = p_assignment_id
      and revision.planned_step_id = p_step_id
    order by revision.override_kind, revision.created_at desc, revision.id desc
  ) as latest
$function$;

alter function planning.step_adjustments(uuid, uuid) owner to allfit_owner;
revoke all on function planning.step_adjustments(uuid, uuid) from public, allfit_api;

-- The step's target as this assignment prescribes it. Without an assignment, as published.
create function planning.effective_target(p_assignment_id uuid, p_step_id uuid, p_target jsonb)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog
as $function$
  select case
    when p_assignment_id is null or p_step_id is null or p_target is null then p_target
    else p_target || coalesce((
      select jsonb_object_agg(pair.key, pair.value)
      from jsonb_each(planning.step_adjustments(p_assignment_id, p_step_id)) as adjustment
      cross join lateral planning.prescription_target_keys(adjustment.key) as field
      cross join lateral (values
        (field.value_key, adjustment.value -> 'value'),
        (field.unit_key, adjustment.value -> 'unit')
      ) as pair (key, value)
      where pair.key is not null
    ), '{}'::jsonb)
  end
$function$;

alter function planning.effective_target(uuid, uuid, jsonb) owner to allfit_owner;
revoke all on function planning.effective_target(uuid, uuid, jsonb) from public, allfit_api;

/*
 * The step's sets as this assignment prescribes them. A set count keeps the first sets
 * and repeats the last one to grow; reps and load apply to working (`normal`) sets, so
 * a warm-up stays light and a set to failure keeps asking for failure. A step without
 * sets is left to the target, as Space already reads it.
 */
create function planning.effective_sets(p_assignment_id uuid, p_step_id uuid, p_sets jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $function$
declare
  adjustments jsonb;
  published integer;
  total integer;
  adjusted jsonb := '[]'::jsonb;
  one jsonb;
begin
  if p_assignment_id is null or p_step_id is null or p_sets is null
     or jsonb_array_length(p_sets) = 0 then
    return p_sets;
  end if;
  adjustments := planning.step_adjustments(p_assignment_id, p_step_id);
  if adjustments = '{}'::jsonb then
    return p_sets;
  end if;

  published := jsonb_array_length(p_sets);
  total := coalesce((adjustments -> 'target_sets' ->> 'value')::integer, published);
  for ordinal in 1..total loop
    one := (p_sets -> (least(ordinal, published) - 1)) || jsonb_build_object('set_order', ordinal);
    if one ->> 'kind' = 'normal' then
      if adjustments ? 'target_reps' then
        one := one || jsonb_build_object('target_reps', adjustments -> 'target_reps' -> 'value');
      end if;
      if adjustments ? 'target_load' then
        one := one || jsonb_build_object(
          'target_load_value', adjustments -> 'target_load' -> 'value',
          'target_load_unit_code', adjustments -> 'target_load' -> 'unit'
        );
      end if;
    end if;
    adjusted := adjusted || jsonb_build_array(one);
  end loop;
  return adjusted;
end
$function$;

alter function planning.effective_sets(uuid, uuid, jsonb) owner to allfit_owner;
revoke all on function planning.effective_sets(uuid, uuid, jsonb) from public, allfit_api;

-- ---------------------------------------------------------------------------
-- OP-PLN-012
-- ---------------------------------------------------------------------------

create function planning.reschedule_planned_session(
  p_person_id uuid,
  p_organization_id uuid,
  p_planned_session_id uuid,
  p_scheduled_on date,
  p_expected_revision bigint,
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
  actor record;
  receipt record;
  relationship_status text;
  session record;
  today date;
  moved_from date;
begin
  select * into actor from planning.authorize_managed_assignment(
    p_person_id, p_organization_id, null, p_planned_session_id, false
  );

  select * into receipt from system.begin_idempotency(
    p_person_id, 'OP-PLN-012', p_idempotency_key, p_command_id, p_request_hash
  );

  select relationship.status into relationship_status
  from relationships.service_relationships as relationship
  where relationship.id = actor.relationship_id
  for share;
  perform pg_advisory_xact_lock(hashtextextended(actor.assignment_id::text, 0::bigint));

  if not receipt.claimed then
    return query select planning.managed_session_item(p_planned_session_id), true;
    return;
  end if;

  if relationship_status is distinct from 'active' or not planning.is_managed(actor.assignment_id) then
    raise exception 'the organization no longer manages this program' using errcode = '55000';
  end if;

  -- Locked on its own, so the check below sees an attempt that committed meanwhile.
  select planned.id, planned.status, planned.scheduled_at, planned.timezone,
         planned.week_starts_on, planned.revision_number, assignment.starts_on
    into session
  from planning.planned_sessions as planned
  join planning.program_assignments as assignment on assignment.id = planned.assignment_id
  where planned.id = p_planned_session_id
  for update of planned;
  if not found then
    raise exception 'planned session not found' using errcode = 'P0002';
  end if;

  if session.status <> 'scheduled' or exists (
       select 1 from execution.planned_session_executions as attempt
       where attempt.planned_session_id = session.id
     ) then
    raise exception 'a session that started or ended stays where it was' using errcode = '55000';
  end if;

  if session.revision_number <> p_expected_revision then
    raise exception 'stale-draft' using errcode = '40001',
      detail = planning.managed_session_item(session.id)::text;
  end if;

  today := (clock_timestamp() at time zone session.timezone)::date;
  if p_scheduled_on is null or p_scheduled_on < greatest(today, session.starts_on) then
    raise exception 'a session moves to today or later, and not before its program starts'
      using errcode = '22023', detail = '["scheduled-on"]';
  end if;
  if p_scheduled_on not between session.week_starts_on and session.week_starts_on + 6 then
    raise exception 'a session moves inside its own week' using errcode = '22023',
      detail = '["scheduled-on-week"]';
  end if;

  moved_from := (session.scheduled_at at time zone session.timezone)::date;
  if p_scheduled_on <> moved_from then
    update planning.planned_sessions as planned
    set scheduled_at = p_scheduled_on::timestamp at time zone session.timezone,
        revision_number = planned.revision_number + 1
    where planned.id = session.id;

    insert into planning.planned_session_reschedules (
      planned_session_id, person_id, assignment_id, relationship_id, moved_from, moved_to,
      rescheduled_by_membership_id
    ) values (
      session.id, actor.subject_person_id, actor.assignment_id, actor.relationship_id,
      moved_from, p_scheduled_on, actor.membership_id
    );

    perform system.enqueue_outbox_event(
      'planned_session', session.id, 'planning.session_rescheduled.v1',
      jsonb_build_object(
        'planned_session_id', session.id,
        'assignment_id', actor.assignment_id,
        'person_id', actor.subject_person_id,
        'relationship_id', actor.relationship_id,
        'moved_from', moved_from,
        'moved_to', p_scheduled_on
      )
    );
  end if;

  perform system.finish_idempotency(
    receipt.receipt_id, 200::smallint, 'planned-session-rescheduled', 'planned_session', session.id
  );
  return query select planning.managed_session_item(session.id), false;
end
$function$;

alter function planning.reschedule_planned_session(uuid, uuid, uuid, date, bigint, uuid, uuid, bytea)
  owner to allfit_owner;
revoke all on function planning.reschedule_planned_session(uuid, uuid, uuid, date, bigint, uuid, uuid, bytea)
  from public;
grant execute on function planning.reschedule_planned_session(uuid, uuid, uuid, date, bigint, uuid, uuid, bytea)
  to allfit_api;

-- ---------------------------------------------------------------------------
-- OP-PLN-013
-- ---------------------------------------------------------------------------

create function planning.revise_prescription(
  p_person_id uuid,
  p_organization_id uuid,
  p_assignment_id uuid,
  p_planned_step_id uuid,
  p_kind text,
  p_value jsonb,
  p_unit_code text,
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
  actor record;
  receipt record;
  relationship_status text;
  step_family text;
  families text[];
  value_numeric numeric;
  value_integer integer;
  value_text text;
  unit_required boolean;
  problems text[] := array[]::text[];
  new_revision_id uuid;
begin
  select * into actor from planning.authorize_managed_assignment(
    p_person_id, p_organization_id, p_assignment_id, null, false
  );

  select * into receipt from system.begin_idempotency(
    p_person_id, 'OP-PLN-013', p_idempotency_key, p_command_id, p_request_hash
  );

  select relationship.status into relationship_status
  from relationships.service_relationships as relationship
  where relationship.id = actor.relationship_id
  for share;
  perform pg_advisory_xact_lock(hashtextextended(actor.assignment_id::text, 0::bigint));

  if not receipt.claimed then
    return query select planning.prescription_revision_document(receipt.aggregate_id), true;
    return;
  end if;

  if relationship_status is distinct from 'active' or not planning.is_managed(actor.assignment_id) then
    raise exception 'the organization no longer manages this program' using errcode = '55000';
  end if;

  step_family := planning.assigned_step_family(p_assignment_id, p_planned_step_id);
  families := planning.prescription_kind_families(p_kind);
  if step_family is null then
    problems := array_append(problems, 'planned-step');
  end if;
  if families is null or (step_family is not null and p_kind <> 'notes'
                          and not step_family = any (families)) then
    problems := array_append(problems, 'kind');
  end if;

  -- The value travels as JSON; its kind decides the column and the type it must have.
  if p_kind in ('target_sets', 'target_reps', 'rounds', 'target_repetitions') then
    if jsonb_typeof(p_value) = 'number' and p_value::text ~ '^[0-9]{1,9}$' then
      value_integer := p_value::text::integer;
    end if;
  elsif p_kind in ('side', 'notes') then
    if jsonb_typeof(p_value) = 'string' then
      value_text := p_value #>> '{}';
    end if;
  elsif families is not null and jsonb_typeof(p_value) = 'number' then
    value_numeric := p_value::text::numeric;
  end if;
  -- The value and the unit are judged apart, so each problem names its own field.
  unit_required := p_kind in ('target_load', 'target_distance', 'target_pace');
  if families is not null
     and not planning.prescription_value_fits(
       p_kind, value_numeric, value_integer, value_text,
       case when unit_required and value_numeric is not null then coalesce(p_unit_code, '-') end
     ) then
    problems := array_append(problems, 'value');
  end if;
  if families is not null
     and ((unit_required and not exists (
             select 1 from catalog.units as unit where unit.code = p_unit_code
           ))
          or (not unit_required and p_unit_code is not null)) then
    problems := array_append(problems, 'unit-code');
  end if;

  if cardinality(problems) > 0 then
    raise exception 'the adjustment does not fit the step' using errcode = '22023',
      detail = to_jsonb(problems)::text;
  end if;

  insert into planning.prescription_revisions (
    assignment_id, person_id, planned_step_id, override_kind, value_numeric, value_integer,
    value_text, unit_code, created_by_assignment_id
  ) values (
    p_assignment_id, actor.subject_person_id, p_planned_step_id, p_kind, value_numeric,
    value_integer, value_text, p_unit_code, actor.professional_assignment_id
  )
  returning id into new_revision_id;

  perform system.enqueue_outbox_event(
    'program_assignment', p_assignment_id, 'planning.prescription_revised.v1',
    jsonb_build_object(
      'revision_id', new_revision_id,
      'assignment_id', p_assignment_id,
      'person_id', actor.subject_person_id,
      'relationship_id', actor.relationship_id,
      'planned_step_id', p_planned_step_id,
      'kind', p_kind
    )
  );

  perform system.finish_idempotency(
    receipt.receipt_id, 201::smallint, 'prescription-revised', 'prescription_revision',
    new_revision_id
  );
  return query select planning.prescription_revision_document(new_revision_id), false;
end
$function$;

alter function planning.revise_prescription(uuid, uuid, uuid, uuid, text, jsonb, text, uuid, uuid, bytea)
  owner to allfit_owner;
revoke all on function planning.revise_prescription(uuid, uuid, uuid, uuid, text, jsonb, text, uuid, uuid, bytea)
  from public;
grant execute on function planning.revise_prescription(uuid, uuid, uuid, uuid, text, jsonb, text, uuid, uuid, bytea)
  to allfit_api;

-- ---------------------------------------------------------------------------
-- OP-PLN-014
-- ---------------------------------------------------------------------------

-- The cancellation, read inside the administration scope: no content, only what stopped.
create function planning.cancellation_document(p_assignment_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog
as $function$
  select jsonb_build_object(
    'id', assignment.id,
    'status', 'cancelled',
    'cancelled_at', period.ended_at,
    'sessions_cancelled', (
      select count(*)::integer from planning.planned_sessions as session
      where session.assignment_id = assignment.id and session.status = 'cancelled'
    )
  )
  from planning.program_assignments as assignment
  join planning.assignment_management_periods as period
    on period.assignment_id = assignment.id and period.end_reason = 'cancelled'
  where assignment.id = p_assignment_id
$function$;

alter function planning.cancellation_document(uuid) owner to allfit_owner;
revoke all on function planning.cancellation_document(uuid) from public, allfit_api;

create function planning.cancel_managed_assignment(
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
    p_person_id, p_organization_id, p_assignment_id, null, true
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

alter function planning.cancel_managed_assignment(uuid, uuid, uuid, uuid, uuid, bytea)
  owner to allfit_owner;
revoke all on function planning.cancel_managed_assignment(uuid, uuid, uuid, uuid, uuid, bytea)
  from public;
grant execute on function planning.cancel_managed_assignment(uuid, uuid, uuid, uuid, uuid, bytea)
  to allfit_api;

-- ---------------------------------------------------------------------------
-- OP-PLN-018 shows the adjustments, whether each session can still move, and a
-- cancellation as one
-- ---------------------------------------------------------------------------

create or replace function planning.relationship_assignment_item(p_assignment_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog
as $function$
  select jsonb_build_object(
    'id', assignment.id,
    'status', case
      when assignment.lifecycle = 'ended' and exists (
        select 1 from planning.assignment_management_periods as period
        where period.assignment_id = assignment.id and period.end_reason = 'cancelled'
      ) then 'cancelled'
      else assignment.lifecycle::text
    end,
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
      select jsonb_agg(planning.managed_session_item(session.id)
                       order by session.scheduled_at, session.id)
      from planning.planned_sessions as session
      where session.assignment_id = assignment.id
    ), '[]'::jsonb),
    'adjustments', coalesce((
      select jsonb_agg(planning.prescription_revision_document(latest.id)
                       order by latest.planned_step_id, latest.override_kind)
      from (
        select distinct on (revision.planned_step_id, revision.override_kind)
               revision.id, revision.planned_step_id, revision.override_kind
        from planning.prescription_revisions as revision
        where revision.assignment_id = assignment.id
        order by revision.planned_step_id, revision.override_kind,
                 revision.created_at desc, revision.id desc
      ) as latest
    ), '[]'::jsonb)
  )
  from planning.program_assignments as assignment
  join planning.program_versions as version on version.id = assignment.program_version_id
  where assignment.id = p_assignment_id
$function$;

-- ---------------------------------------------------------------------------
-- A started session never pauses: the detachment locks before it decides
-- ---------------------------------------------------------------------------

create or replace function planning.detach_relationship_assignments(
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

    -- Locked on their own, so the pause below sees a session that just started.
    perform 1
    from planning.planned_sessions as waiting
    where waiting.assignment_id = detached.id
      and waiting.status = 'scheduled'
    for update;

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

  perform planning.resume_contract_scope(previous_purpose, previous_id, previous_token);
  return total;
end
$function$;

-- ---------------------------------------------------------------------------
-- Space: the week is planted only for a program still followed, and counts the
-- adjusted sets
-- ---------------------------------------------------------------------------

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

    -- Read again under the lock: a cancellation that committed while this waited wins.
    if not exists (
      select 1 from planning.program_assignments as current_state
      where current_state.id = assignment.id
        and current_state.lifecycle in ('personal', 'active')
    ) then
      continue;
    end if;

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
             -- The sets she will be asked for: the program's, with her coach's adjustments.
             (select coalesce(sum((planning.effective_target(
                        session.assignment_id, step.id,
                        jsonb_build_object('target_sets', target.target_sets)
                      ) ->> 'target_sets')::integer), 0)::integer
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

/*
 * Unchanged except that the target and the sets of each step are the ones this
 * assignment prescribes: the program's, with the coach's adjustments on top.
 */
CREATE OR REPLACE FUNCTION execution.read_execution(p_person_id uuid, p_executed_session_id uuid)
 RETURNS TABLE(executed_session_id uuid, execution_status text, started_at timestamp with time zone, revision_number bigint, title text, discipline_code text, program_title text, week integer, planned jsonb, results jsonb, exercises jsonb)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
  select executed.id,
         executed.execution_status::text,
         executed.started_at,
         executed.revision_number,
         template_version.title,
         template_version.discipline_code,
         version.title,
         -- Derived, not stored: the same number in two places is one of them wrong.
         case when assignment.id is null then null
              else ((session.scheduled_at at time zone session.timezone)::date
                    - assignment.starts_on) / 7 + 1 end,
         coalesce(planned.steps, '[]'::jsonb),
         coalesce(recorded.sets, '[]'::jsonb),
         coalesce(listed.items, '[]'::jsonb)
  from execution.executed_sessions as executed
  left join execution.planned_session_executions as attempt
    on attempt.executed_session_id = executed.id
  left join planning.planned_sessions as session on session.id = attempt.planned_session_id
  left join planning.program_assignments as assignment on assignment.id = session.assignment_id
  left join planning.program_versions as version on version.id = assignment.program_version_id
  left join planning.session_template_versions as template_version
    on template_version.id = session.template_version_id
  left join lateral (
    select jsonb_agg(to_jsonb(entry) order by entry.position) as steps
    from (
      select step.position as position,
             movement.id as movement_id,
             movement.name as movement,
             planning.effective_target(assignment.id, step.id,
               coalesce(strength.target, endurance.target, interval_step.target, mobility.target)
             ) as target,
             coalesce(last_time.sets, '[]'::jsonb) as previous,
             coalesce(planning.effective_sets(assignment.id, step.id, prescribed.sets), '[]'::jsonb) as sets
      from planning.planned_steps as step
      left join catalog.movements as movement on movement.id = step.movement_id
      left join lateral (
        select jsonb_build_object('family', 'strength', 'target_sets', target.target_sets,
          'target_reps', target.target_reps, 'target_rpe', target.target_rpe) as target
        from planning.strength_targets as target where target.planned_step_id = step.id
      ) as strength on true
      left join lateral (
        select jsonb_build_object('family', 'endurance',
          'target_distance_value', target.target_distance_value,
          'target_distance_unit_code', target.target_distance_unit_code,
          'target_duration_seconds', target.target_duration_seconds) as target
        from planning.endurance_targets as target where target.planned_step_id = step.id
      ) as endurance on true
      left join lateral (
        select jsonb_build_object('family', 'interval', 'rounds', target.rounds,
          'work_duration_seconds', target.work_duration_seconds,
          'rest_duration_seconds', target.rest_duration_seconds) as target
        from planning.interval_targets as target where target.planned_step_id = step.id
      ) as interval_step on true
      left join lateral (
        select jsonb_build_object('family', 'mobility',
          'hold_duration_seconds', target.hold_duration_seconds,
          'target_repetitions', target.target_repetitions) as target
        from planning.mobility_targets as target where target.planned_step_id = step.id
      ) as mobility on true
      -- What this movement weighed last time. The column exists so nobody has to
      -- remember the number they hit a week ago, which is the whole point of a log.
      left join lateral (
        select jsonb_agg(jsonb_build_object(
                 'load_value', done.load_value,
                 'achieved_reps', done.achieved_reps) order by done.set_order) as sets
        from execution.strength_sets as done
        where done.movement_id = movement.id
          and done.executed_session_id = (
            select earlier.id
            from execution.executed_sessions as earlier
            join execution.strength_sets as earlier_set
              on earlier_set.executed_session_id = earlier.id
             and earlier_set.movement_id = movement.id
            where earlier.person_id = executed.person_id
              and earlier.id <> executed.id
              and earlier.execution_status = 'completed'
              and earlier.annulled_at is null
            order by earlier.started_at desc
            limit 1
          )
      ) as last_time on true
      -- The sets the routine asked for, so the session opens each row with its kind.
      -- Empty for a step published before sets existed; the client falls back then.
      left join lateral (
        select jsonb_agg(jsonb_build_object(
                 'set_order', prescribed_set.set_order,
                 'kind', prescribed_set.kind,
                 'target_reps', prescribed_set.target_reps,
                 'target_load_value', prescribed_set.target_load_value,
                 'target_load_unit_code', prescribed_set.target_load_unit_code)
               order by prescribed_set.set_order) as sets
        from planning.planned_sets as prescribed_set
        where prescribed_set.planned_step_id = step.id
      ) as prescribed on true
      where step.template_version_id = template_version.id
    ) as entry
  ) as planned on true
  -- The session's own list, in its order: what was trained, not what was planned.
  left join lateral (
    select jsonb_agg(to_jsonb(entry) order by entry.position) as items
    from (
      select item.position as position,
             movement.id as movement_id,
             movement.name as movement,
             item.planned_step_id as planned_step_id,
             item.superset_group as superset_group,
             item.rest_seconds as rest_seconds,
             planning.effective_target(assignment.id, step.id,
               coalesce(strength.target, endurance.target, interval_step.target, mobility.target)
             ) as target,
             coalesce(last_time.sets, '[]'::jsonb) as previous,
             coalesce(planning.effective_sets(assignment.id, step.id, prescribed.sets), '[]'::jsonb) as sets
      from execution.session_exercises as item
      left join planning.planned_steps as step on step.id = item.planned_step_id
      left join catalog.movements as movement on movement.id = item.movement_id
      left join lateral (
        select jsonb_build_object('family', 'strength', 'target_sets', target.target_sets,
          'target_reps', target.target_reps, 'target_rpe', target.target_rpe) as target
        from planning.strength_targets as target where target.planned_step_id = step.id
      ) as strength on true
      left join lateral (
        select jsonb_build_object('family', 'endurance',
          'target_distance_value', target.target_distance_value,
          'target_distance_unit_code', target.target_distance_unit_code,
          'target_duration_seconds', target.target_duration_seconds) as target
        from planning.endurance_targets as target where target.planned_step_id = step.id
      ) as endurance on true
      left join lateral (
        select jsonb_build_object('family', 'interval', 'rounds', target.rounds,
          'work_duration_seconds', target.work_duration_seconds,
          'rest_duration_seconds', target.rest_duration_seconds) as target
        from planning.interval_targets as target where target.planned_step_id = step.id
      ) as interval_step on true
      left join lateral (
        select jsonb_build_object('family', 'mobility',
          'hold_duration_seconds', target.hold_duration_seconds,
          'target_repetitions', target.target_repetitions) as target
        from planning.mobility_targets as target where target.planned_step_id = step.id
      ) as mobility on true
      left join lateral (
        select jsonb_agg(jsonb_build_object(
                 'load_value', done.load_value,
                 'achieved_reps', done.achieved_reps) order by done.set_order) as sets
        from execution.strength_sets as done
        where done.movement_id = movement.id
          and done.executed_session_id = (
            select earlier.id
            from execution.executed_sessions as earlier
            join execution.strength_sets as earlier_set
              on earlier_set.executed_session_id = earlier.id
             and earlier_set.movement_id = movement.id
            where earlier.person_id = executed.person_id
              and earlier.id <> executed.id
              and earlier.execution_status = 'completed'
              and earlier.annulled_at is null
            order by earlier.started_at desc
            limit 1
          )
      ) as last_time on true
      left join lateral (
        select jsonb_agg(jsonb_build_object(
                 'set_order', prescribed_set.set_order,
                 'kind', prescribed_set.kind,
                 'target_reps', prescribed_set.target_reps,
                 'target_load_value', prescribed_set.target_load_value,
                 'target_load_unit_code', prescribed_set.target_load_unit_code)
               order by prescribed_set.set_order) as sets
        from planning.planned_sets as prescribed_set
        where prescribed_set.planned_step_id = step.id
      ) as prescribed on true
      where item.executed_session_id = executed.id
    ) as entry
  ) as listed on true
  left join lateral (
    select jsonb_agg(to_jsonb(entry) order by entry.set_order) as sets
    from (
      select 'strength' as family,
             sets.set_order as set_order,
             sets.movement_id as movement_id,
             sets.achieved_reps as achieved_reps,
             sets.load_value as load_value,
             sets.load_unit_code as load_unit_code,
             sets.rpe as rpe,
             sets.kind as kind,
             owner.position as exercise_position
      from execution.strength_sets as sets
      left join execution.session_exercises as owner on owner.id = sets.session_exercise_id
      where sets.executed_session_id = executed.id
    ) as entry
  ) as recorded on true
  where executed.id = p_executed_session_id
    and executed.person_id = p_person_id
    and access_control.actor_kind() = 'person'
    and access_control.person() = p_person_id
$function$;

commit;
