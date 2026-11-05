-- HU-STUDIO-054 and HU-STUDIO-055 — the coach who attends a person reads what she trained;
-- HU-SP-032, HU-SP-033 and HU-SP-034 — she hides one session from one gym.
--
-- What she trained was recorded as autonomous, all of it, because nothing could be
-- produced inside a relationship (`ck_executed_sessions_autonomous`). Since OP-PLN-010 a
-- gym manages programs, so a session started on one is produced inside that
-- relationship, and says so for good:
--
--   · `start_planned_session_attempt` stores the relationship and its gym when the
--     planned session belongs to a program the gym manages now: `lifecycle = 'active'`,
--     an open management period, a live relationship. Anything else stays autonomous.
--     Sessions already recorded on a managed program are backfilled by the same rule.
--   · Where a session was produced never changes afterwards.
--
-- A gym reads a session only through the two reads here, inside the contract scope
-- `session_screening` keyed by the relationship, and only what she shared (ADR-016):
-- what was produced inside the relationship needs `relationship_training`, what she
-- trained alone needs `prior_training_history`. A session produced inside another
-- relationship is shown to nobody else. Every read is recorded before it answers; with
-- nothing shared, the list is empty and the detail names the scope, and the refused
-- attempt is recorded too, so the read returns instead of raising.
--
-- A denial hides one session she trained alone from one relationship. It applies
-- inside the policy, before anything is projected, counted or paged, so a hidden
-- session leaves no gap. The gym never reads a denial: the screening scope lets the
-- policy consult that relationship's denials and no row of them leaves the function.
-- Once the relationship ends, a denial in force fixes `frozen_denied_at`, which a
-- restoration never clears: hidden at the end, hidden from the frozen history for good.

set lock_timeout = '5s';
set statement_timeout = '60s';

-- ---------------------------------------------------------------------------
-- Where a session was produced
-- ---------------------------------------------------------------------------

alter table execution.executed_sessions
  drop constraint ck_executed_sessions_autonomous;

-- The rule a start applies from now on, for the sessions started before it existed.
update execution.executed_sessions as session
set is_autonomous = false,
    context_relationship_id = period.relationship_id,
    context_organization_id = relationship.organization_id
from execution.planned_session_executions as attempt
join planning.planned_sessions as planned on planned.id = attempt.planned_session_id
join planning.assignment_management_periods as period on period.assignment_id = planned.assignment_id
join relationships.service_relationships as relationship on relationship.id = period.relationship_id
where attempt.executed_session_id = session.id
  and session.started_at >= period.started_at
  and (period.ended_at is null or session.started_at < period.ended_at);

alter table execution.executed_sessions
  add constraint ck_executed_sessions_autonomous check (
    (is_autonomous and context_relationship_id is null and context_organization_id is null)
    or (not is_autonomous and context_relationship_id is not null and context_organization_id is not null)
  ),
  -- IX-14: one of her own relationships, with its own gym.
  add constraint fk_executed_sessions_context foreign key (context_relationship_id, person_id, context_organization_id) references relationships.service_relationships (id, person_id, organization_id) on delete restrict;

create index idx_executed_sessions_context_started
  on execution.executed_sessions (context_relationship_id, started_at desc, id desc)
  where context_relationship_id is not null;

create function execution.keep_session_context_tg()
returns trigger
language plpgsql
set search_path = pg_catalog
as $function$
begin
  if new.is_autonomous is distinct from old.is_autonomous
     or new.context_relationship_id is distinct from old.context_relationship_id
     or new.context_organization_id is distinct from old.context_organization_id then
    raise exception 'where a session was produced never changes' using errcode = '23514';
  end if;
  return new;
end
$function$;

alter function execution.keep_session_context_tg() owner to allfit_owner;
revoke all on function execution.keep_session_context_tg() from public, allfit_api;

create trigger trg_executed_sessions_before_update_context
before update of is_autonomous, context_relationship_id, context_organization_id
on execution.executed_sessions
for each row execute function execution.keep_session_context_tg();

-- `20261105101100`'s body; the relationship is locked before the session, in the order a
-- termination takes them, and the context is decided once both are held.
create or replace function execution.start_planned_session_attempt(
  p_person_id uuid,
  p_planned_session_id uuid,
  p_started_at timestamptz,
  p_timezone text,
  p_requested_level catalog.completeness_level,
  p_capture_source text,
  p_idempotency_key uuid,
  p_command_id uuid,
  p_request_hash bytea
)
returns table (
  id uuid,
  attempt_number integer,
  revision_number bigint,
  result_contract_id uuid,
  contract_version integer,
  requested_level text
)
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  receipt record;
  planned record;
  contract record;
  managing_relationship_id uuid;
  context record;
  next_attempt integer;
begin
  if access_control.actor_kind() <> 'person' or access_control.person() <> p_person_id then
    raise exception 'execution person does not match the authenticated actor' using errcode = '42501';
  end if;

  select * into receipt from system.begin_idempotency(
    p_person_id, 'OP-EXE-001', p_idempotency_key, p_command_id, p_request_hash
  );
  -- A replay answers the attempt that was already started, whole: the caller cannot
  -- tell a retry from the first call, which is the point of the receipt.
  if not receipt.claimed then
    return query
      select executed.id, attempt.attempt_number, executed.revision_number,
             executed.result_contract_id, executed.contract_version,
             executed.requested_level::text
      from execution.executed_sessions as executed
      join execution.planned_session_executions as attempt
        on attempt.executed_session_id = executed.id
      where executed.id = receipt.aggregate_id;
    return;
  end if;

  select assignment.origin_relationship_id into managing_relationship_id
  from planning.planned_sessions as session
  join planning.program_assignments as assignment on assignment.id = session.assignment_id
  where session.id = p_planned_session_id
    and session.person_id = p_person_id
    and assignment.lifecycle = 'active';
  if managing_relationship_id is not null then
    perform 1
    from relationships.service_relationships as relationship
    where relationship.id = managing_relationship_id
    for share;
  end if;

  select session.id, session.assignment_id, session.template_version_id, session.status
  into planned
  from planning.planned_sessions as session
  where session.id = p_planned_session_id and session.person_id = p_person_id
  for update;
  if planned.id is null then
    raise exception 'planned session is not this person''s' using errcode = '42501';
  end if;
  -- Cancelled and paused are refusals; completed is not. Somebody who wants to do
  -- their push day twice has done it twice, and the history should say so.
  if planned.status in ('cancelled', 'paused') then
    raise exception 'planned session is not open' using errcode = '23514';
  end if;
  -- Nothing of a held program starts, repeats included, and a day that passed while
  -- it was held does not start later.
  if planning.session_hold_of(p_planned_session_id) is not null then
    raise exception 'planned session is held by a suspension' using errcode = '23514';
  end if;

  -- Inside the relationship only while its gym manages the program: live, managed,
  -- with the period open. A program she kept, or a gym that let go, is hers alone.
  select relationship.id, relationship.organization_id into context
  from planning.program_assignments as assignment
  join planning.assignment_management_periods as period
    on period.assignment_id = assignment.id
   and period.relationship_id = assignment.origin_relationship_id
   and period.ended_at is null
  join relationships.service_relationships as relationship
    on relationship.id = period.relationship_id
  where assignment.id = planned.assignment_id
    and assignment.lifecycle = 'active'
    and relationship.status = 'active';

  -- The contract is frozen onto the execution: what a result means must not change
  -- underneath a session somebody already recorded.
  select version.activity_type_id,
         association.result_contract_id,
         published.version_number
  into contract
  from planning.session_template_versions as version
  join catalog.activity_type_result_contracts as association
    on association.activity_type_id = version.activity_type_id
   and association.is_default
   and association.valid_from <= clock_timestamp()
   and (association.valid_to is null or association.valid_to > clock_timestamp())
  join catalog.result_contracts as published on published.id = association.result_contract_id
  where version.id = planned.template_version_id;
  if contract.result_contract_id is null then
    raise exception 'session template has no result contract' using errcode = '23514';
  end if;

  insert into execution.executed_sessions (
    id, person_id, activity_type_id, result_contract_id, contract_version,
    is_autonomous, context_relationship_id, context_organization_id,
    started_at, timezone, requested_level, capture_source
  ) values (
    p_command_id, p_person_id, contract.activity_type_id, contract.result_contract_id,
    contract.version_number, context.id is null, context.id, context.organization_id,
    p_started_at, p_timezone, p_requested_level, p_capture_source
  );

  select coalesce(max(attempt.attempt_number), 0) + 1 into next_attempt
  from execution.planned_session_executions as attempt
  where attempt.planned_session_id = p_planned_session_id;

  insert into execution.planned_session_executions (
    planned_session_id, executed_session_id, person_id, attempt_number
  ) values (p_planned_session_id, p_command_id, p_person_id, next_attempt);

  -- The session starts as a copy of its routine, supersets and rest included; from here
  -- on it is the session's own list, and the plan does not decide it again (ADR-034/035).
  insert into execution.session_exercises (
    executed_session_id, position, movement_id, planned_step_id, superset_group, rest_seconds
  )
  select p_command_id, row_number() over (order by step.position), step.movement_id,
         step.id, step.superset_group, target.target_rest_seconds
  from planning.planned_steps as step
  left join planning.strength_targets as target on target.planned_step_id = step.id
  where step.template_version_id = planned.template_version_id;

  perform system.finish_idempotency(
    receipt.receipt_id, 201::smallint, 'attempt-started', 'executed_session', p_command_id
  );

  return query
    select p_command_id, next_attempt, 0::bigint, contract.result_contract_id,
           contract.version_number, p_requested_level::text;
end
$function$;

-- ---------------------------------------------------------------------------
-- A session hidden from one relationship
-- ---------------------------------------------------------------------------

create table privacy.session_visibility_denials (
  id uuid not null default extensions.uuid_generate_v7(),
  person_id uuid not null,
  executed_session_id uuid not null,
  relationship_id uuid not null,
  status text not null default 'active',
  denied_at timestamptz not null default clock_timestamp(),
  restored_at timestamptz,
  frozen_denied_at timestamptz,
  constraint pk_session_visibility_denials primary key (id),
  constraint uq_session_visibility_denials_pair unique (executed_session_id, relationship_id),
  -- IX-08: the session and the relationship belong to whoever decides.
  constraint fk_session_visibility_denials_session foreign key (executed_session_id, person_id) references execution.executed_sessions (id, person_id) on delete restrict,
  constraint fk_session_visibility_denials_relationship foreign key (relationship_id, person_id) references relationships.service_relationships (id, person_id) on delete restrict,
  constraint ck_session_visibility_denials_status check (status in ('active', 'reverted')),
  constraint ck_session_visibility_denials_restored check ((status = 'reverted') = (restored_at is not null))
);

create index idx_session_visibility_denials_relationship_status
  on privacy.session_visibility_denials (relationship_id, status);
create index idx_session_visibility_denials_person_denied
  on privacy.session_visibility_denials (person_id, denied_at desc, id desc)
  where status = 'active';

alter table privacy.session_visibility_denials owner to allfit_owner;
alter table privacy.session_visibility_denials enable row level security;
alter table privacy.session_visibility_denials force row level security;
revoke all on privacy.session_visibility_denials from public, allfit_api;

create function privacy.keep_session_visibility_denial_tg()
returns trigger
language plpgsql
set search_path = pg_catalog
as $function$
begin
  if new.person_id <> old.person_id
     or new.executed_session_id <> old.executed_session_id
     or new.relationship_id <> old.relationship_id then
    raise exception 'a denial stays on its session and relationship' using errcode = '23514';
  end if;
  if old.frozen_denied_at is not null
     and new.frozen_denied_at is distinct from old.frozen_denied_at then
    raise exception 'a frozen window is never reopened' using errcode = '23514';
  end if;
  return new;
end
$function$;

alter function privacy.keep_session_visibility_denial_tg() owner to allfit_owner;
revoke all on function privacy.keep_session_visibility_denial_tg() from public, allfit_api;

create trigger trg_session_visibility_denials_before_update_keep
before update on privacy.session_visibility_denials
for each row execute function privacy.keep_session_visibility_denial_tg();

-- IX-36. A session it cannot see is refused too: the rule fails closed.
create function privacy.enforce_denial_not_own_relationship_ct()
returns trigger
language plpgsql
set search_path = pg_catalog
as $function$
declare
  produced_in uuid;
  seen boolean;
begin
  select session.context_relationship_id, true into produced_in, seen
  from execution.executed_sessions as session
  where session.id = new.executed_session_id;
  if seen is null or produced_in is not distinct from new.relationship_id then
    raise exception 'IX-36 a session produced inside a relationship is not hidden from it'
      using errcode = '23514',
            constraint = 'trg_session_visibility_denials_after_insert_own_relationship';
  end if;
  return null;
end
$function$;

alter function privacy.enforce_denial_not_own_relationship_ct() owner to allfit_owner;
revoke all on function privacy.enforce_denial_not_own_relationship_ct() from public, allfit_api;

create constraint trigger trg_session_visibility_denials_after_insert_own_relationship
after insert on privacy.session_visibility_denials
deferrable initially immediate
for each row execute function privacy.enforce_denial_not_own_relationship_ct();

create policy session_visibility_denials_all_self on privacy.session_visibility_denials
  for all to allfit_owner
  using (person_id = access_control.person())
  with check (person_id = access_control.person());
-- Only so the session policy can exclude what she hid; no read returns a denial.
create policy session_visibility_denials_select_screening on privacy.session_visibility_denials
  for select to allfit_owner
  using (relationship_id::text = (select access_control.contract_scope('session_screening')));

-- ---------------------------------------------------------------------------
-- What a gym may see of her sessions
-- ---------------------------------------------------------------------------

-- Inside a screening only: no other read of a gym's sees a session at all.
create policy executed_sessions_select_screening on execution.executed_sessions
  for select to allfit_owner
  using (
    exists (
      select 1
      from relationships.service_relationships as relationship
      where relationship.id = (select access_control.contract_scope('session_screening'))::uuid
        and relationship.person_id = executed_sessions.person_id
        and (
          (executed_sessions.context_relationship_id = relationship.id
           and access_control.can_access(relationship.id, 'relationship_training', 'read'))
          or (
            executed_sessions.is_autonomous
            and access_control.can_access(relationship.id, 'prior_training_history', 'read')
            and not exists (
              select 1
              from privacy.session_visibility_denials as denial
              where denial.executed_session_id = executed_sessions.id
                and denial.relationship_id = relationship.id
                and denial.status = 'active'
            )
          )
        )
    )
  );

/*
 * The coach who attends this client now: a live membership, the client's live
 * relationship with this organization, and the holder or an accepted cover of it.
 * Being admin or owner is not attending; missing and forbidden read the same.
 */
create function execution.require_attending_coach(
  p_person_id uuid,
  p_organization_id uuid,
  p_subject_person_id uuid
)
returns table (relationship_id uuid, membership_id uuid)
language plpgsql
volatile
security definer
set search_path = pg_catalog
as $function$
declare
  actor_membership_id uuid;
  subject_relationship_id uuid;
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

  select relationship.id into subject_relationship_id
  from relationships.service_relationships as relationship
  where relationship.person_id = p_subject_person_id
    and relationship.organization_id = p_organization_id
    and relationship.status = 'active';
  if subject_relationship_id is null
     or not relationships.actor_is_assigned(subject_relationship_id) then
    raise exception 'client not found' using errcode = 'P0002';
  end if;

  return query select subject_relationship_id, actor_membership_id;
end
$function$;

alter function execution.require_attending_coach(uuid, uuid, uuid) owner to allfit_owner;
revoke all on function execution.require_attending_coach(uuid, uuid, uuid) from public, allfit_api;

-- The grant behind one category for this relationship, with the version she accepted.
create function execution.shared_category(p_relationship_id uuid, p_scope_code text)
returns table (grant_id uuid, scope_version integer)
language sql
stable
security definer
set search_path = pg_catalog
as $function$
  select shared.grant_id, definition.version_number
  from access_control.grant_of(p_relationship_id, p_scope_code) as shared
  left join privacy.scope_definitions as definition on definition.id = shared.scope_definition_id
  limit 1
$function$;

alter function execution.shared_category(uuid, text) owner to allfit_owner;
revoke all on function execution.shared_category(uuid, text) from public, allfit_api;

/*
 * OP-EXE-017. Her completed, valid sessions this coach may see, newest first, a page at
 * a time on (millisecond start, id). The policy decides which; this function records
 * the read under every category it used, or the refusal when she shared none.
 */
create function execution.list_authorized_executions(
  p_person_id uuid,
  p_organization_id uuid,
  p_subject_person_id uuid,
  p_limit integer,
  p_cursor_started_at timestamptz,
  p_cursor_id uuid
)
returns table (
  id uuid,
  started_at timestamptz,
  ended_at timestamptz,
  timezone text,
  activity_type_code text,
  activity_type_name text,
  discipline_code text,
  achieved_level text,
  origin text,
  planned_session_id uuid,
  scope_code text,
  scope_version integer
)
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  attending record;
  inside record;
  prior record;
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

  -- Nothing shared answers empty, and the attempt stays on her record.
  if inside.grant_id is null and prior.grant_id is null then
    perform privacy.log_access_event(
      p_subject_person_id, null, attending.relationship_id, null, null, null, null,
      'live', 'execution.executed_sessions', 'denied'
    );
    return;
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

  return query
  select session.id, session.started_at, session.ended_at, session.timezone,
         activity.code::text, activity.name::text, activity.discipline_code::text,
         session.achieved_level::text,
         case when session.is_autonomous then 'prior' else 'relationship' end,
         attempt.planned_session_id,
         case when session.is_autonomous then 'prior_training_history' else 'relationship_training' end,
         case when session.is_autonomous then prior.scope_version else inside.scope_version end
  from execution.executed_sessions as session
  cross join lateral (select date_trunc('milliseconds', session.started_at) as started_ms) as keyed
  join catalog.activity_types as activity on activity.id = session.activity_type_id
  left join execution.planned_session_executions as attempt
    on attempt.executed_session_id = session.id and not session.is_autonomous
  where session.person_id = p_subject_person_id
    and session.execution_status = 'completed'
    and session.validation_status <> 'annulled'
    and (p_cursor_started_at is null
         or (keyed.started_ms, session.id) < (p_cursor_started_at, p_cursor_id))
  order by keyed.started_ms desc, session.id desc
  limit least(greatest(coalesce(p_limit, 26), 1), 101);

  perform planning.resume_contract_scope(previous_purpose, previous_id, previous_token);
end
$function$;

alter function execution.list_authorized_executions(uuid, uuid, uuid, integer, timestamptz, uuid)
  owner to allfit_owner;
revoke all on function execution.list_authorized_executions(uuid, uuid, uuid, integer, timestamptz, uuid)
  from public;
grant execute on function execution.list_authorized_executions(uuid, uuid, uuid, integer, timestamptz, uuid)
  to allfit_api;

/*
 * OP-EXE-018. One session, as the list would show it, with what was recorded: sets,
 * laps, intervals, rounds and holds. Never heart rate, pain, body weight or the device.
 * `scope_required` only when she shares nothing; a session this coach may not see,
 * whatever the reason, is `not_found`. Both are recorded as refused.
 */
create function execution.read_authorized_execution(
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
  seen record;
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
      end
    );

  perform planning.resume_contract_scope(previous_purpose, previous_id, previous_token);
  return jsonb_build_object('outcome', 'found', 'execution', document);
end
$function$;

alter function execution.read_authorized_execution(uuid, uuid, uuid, uuid) owner to allfit_owner;
revoke all on function execution.read_authorized_execution(uuid, uuid, uuid, uuid) from public;
grant execute on function execution.read_authorized_execution(uuid, uuid, uuid, uuid) to allfit_api;

-- ---------------------------------------------------------------------------
-- Space: hiding, taking it back, and what she hid
-- ---------------------------------------------------------------------------

create function privacy.session_visibility_document(p_executed_session_id uuid, p_relationship_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog
as $function$
  select jsonb_build_object(
    'executed_session_id', denial.executed_session_id,
    'relationship_id', denial.relationship_id,
    'organization', jsonb_build_object('id', organization.id, 'display_name', organization.display_name),
    'status', denial.status,
    'denied_at', denial.denied_at,
    'restored_at', denial.restored_at,
    'session', jsonb_build_object('started_at', session.started_at, 'activity_type_name', activity.name)
  )
  from privacy.session_visibility_denials as denial
  join relationships.service_relationships as relationship on relationship.id = denial.relationship_id
  join organizations.organizations as organization on organization.id = relationship.organization_id
  join execution.executed_sessions as session on session.id = denial.executed_session_id
  join catalog.activity_types as activity on activity.id = session.activity_type_id
  where denial.executed_session_id = p_executed_session_id
    and denial.relationship_id = p_relationship_id
$function$;

alter function privacy.session_visibility_document(uuid, uuid) owner to allfit_owner;
revoke all on function privacy.session_visibility_document(uuid, uuid) from public, allfit_api;

/*
 * OP-PRV-006. Her session, from one of her relationships that is live or ended with a
 * frozen grant still to see; never from the relationship it was produced in. Hiding
 * what is already hidden converges, and only a change is announced.
 */
create function privacy.hide_session(
  p_person_id uuid,
  p_executed_session_id uuid,
  p_relationship_id uuid,
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
  session record;
  subject record;
  previous_status text;
  denial_id uuid;
  instant timestamptz := clock_timestamp();
begin
  if access_control.actor_kind() is distinct from 'person'
     or access_control.person() is distinct from p_person_id then
    raise exception 'person actor mismatch' using errcode = '42501';
  end if;

  select executed.id, executed.context_relationship_id into session
  from execution.executed_sessions as executed
  where executed.id = p_executed_session_id and executed.person_id = p_person_id;
  if session.id is null then
    raise exception 'execution not found' using errcode = 'P0002';
  end if;

  select relationship.id, relationship.status into subject
  from relationships.service_relationships as relationship
  where relationship.id = p_relationship_id and relationship.person_id = p_person_id;
  if subject.id is null then
    raise exception 'relationship not found' using errcode = 'P0002';
  end if;

  select * into receipt from system.begin_idempotency(
    p_person_id, 'OP-PRV-006', p_idempotency_key, p_command_id, p_request_hash
  );
  if not receipt.claimed then
    return query select privacy.session_visibility_document(p_executed_session_id, p_relationship_id), true;
    return;
  end if;

  if session.context_relationship_id is not distinct from p_relationship_id then
    raise exception 'a session produced inside a relationship is not hidden from it'
      using errcode = '22023';
  end if;
  if subject.status = 'terminated' and not exists (
       select 1 from privacy.data_grants as shared
       where shared.relationship_id = p_relationship_id and shared.status = 'frozen'
     ) then
    raise exception 'the relationship holds nothing to hide from' using errcode = 'P0004';
  end if;

  insert into privacy.session_visibility_denials (
    person_id, executed_session_id, relationship_id, status, denied_at, frozen_denied_at
  ) values (
    p_person_id, p_executed_session_id, p_relationship_id, 'active', instant,
    case when subject.status = 'terminated' then instant end
  )
  on conflict (executed_session_id, relationship_id) do nothing
  returning id into denial_id;

  if denial_id is null then
    select denial.id, denial.status into denial_id, previous_status
    from privacy.session_visibility_denials as denial
    where denial.executed_session_id = p_executed_session_id
      and denial.relationship_id = p_relationship_id
    for update;
    if previous_status = 'reverted' then
      update privacy.session_visibility_denials as denial
      set status = 'active',
          denied_at = instant,
          restored_at = null,
          frozen_denied_at = coalesce(
            denial.frozen_denied_at, case when subject.status = 'terminated' then instant end
          )
      where denial.id = denial_id;
    end if;
  end if;

  if previous_status is distinct from 'active' then
    perform system.enqueue_outbox_event(
      'session_visibility_denial', denial_id, 'privacy.session_visibility_denied.v1',
      jsonb_build_object('executed_session_id', p_executed_session_id, 'relationship_id', p_relationship_id)
    );
  end if;

  perform system.finish_idempotency(
    receipt.receipt_id, 200::smallint, 'session-hidden', 'session_visibility_denial', denial_id
  );
  return query select privacy.session_visibility_document(p_executed_session_id, p_relationship_id), false;
end
$function$;

alter function privacy.hide_session(uuid, uuid, uuid, uuid, uuid, bytea) owner to allfit_owner;
revoke all on function privacy.hide_session(uuid, uuid, uuid, uuid, uuid, bytea) from public;
grant execute on function privacy.hide_session(uuid, uuid, uuid, uuid, uuid, bytea) to allfit_api;

/*
 * OP-PRV-007. Shares it again from now on. An ended relationship keeps it out of the
 * frozen history: a denial in force at the end takes that instant, and none is cleared.
 */
create function privacy.restore_session(
  p_person_id uuid,
  p_executed_session_id uuid,
  p_relationship_id uuid,
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
  existing record;
  subject record;
begin
  if access_control.actor_kind() is distinct from 'person'
     or access_control.person() is distinct from p_person_id then
    raise exception 'person actor mismatch' using errcode = '42501';
  end if;

  select denial.id, denial.status into existing
  from privacy.session_visibility_denials as denial
  where denial.executed_session_id = p_executed_session_id
    and denial.relationship_id = p_relationship_id
    and denial.person_id = p_person_id
  for update;
  if existing.id is null then
    raise exception 'denial not found' using errcode = 'P0002';
  end if;

  select * into receipt from system.begin_idempotency(
    p_person_id, 'OP-PRV-007', p_idempotency_key, p_command_id, p_request_hash
  );
  if not receipt.claimed then
    return query select privacy.session_visibility_document(p_executed_session_id, p_relationship_id), true;
    return;
  end if;

  if existing.status = 'active' then
    select relationship.status, relationship.ended_at into subject
    from relationships.service_relationships as relationship
    where relationship.id = p_relationship_id;

    update privacy.session_visibility_denials as denial
    set status = 'reverted',
        restored_at = clock_timestamp(),
        frozen_denied_at = coalesce(
          denial.frozen_denied_at, case when subject.status = 'terminated' then subject.ended_at end
        )
    where denial.id = existing.id;

    perform system.enqueue_outbox_event(
      'session_visibility_denial', existing.id, 'privacy.session_visibility_restored.v1',
      jsonb_build_object('executed_session_id', p_executed_session_id, 'relationship_id', p_relationship_id)
    );
  end if;

  perform system.finish_idempotency(
    receipt.receipt_id, 200::smallint, 'session-restored', 'session_visibility_denial', existing.id
  );
  return query select privacy.session_visibility_document(p_executed_session_id, p_relationship_id), false;
end
$function$;

alter function privacy.restore_session(uuid, uuid, uuid, uuid, uuid, bytea) owner to allfit_owner;
revoke all on function privacy.restore_session(uuid, uuid, uuid, uuid, uuid, bytea) from public;
grant execute on function privacy.restore_session(uuid, uuid, uuid, uuid, uuid, bytea) to allfit_api;

-- OP-PRV-017. What she still hides, newest first, a page at a time on (millisecond, id).
create function privacy.list_my_session_denials(
  p_person_id uuid,
  p_limit integer,
  p_cursor_denied_at timestamptz,
  p_cursor_id uuid
)
returns table (
  id uuid,
  executed_session_id uuid,
  relationship_id uuid,
  organization_id uuid,
  organization_name text,
  denied_at timestamptz,
  session_started_at timestamptz,
  activity_type_name text
)
language plpgsql
stable
security definer
set search_path = pg_catalog
as $function$
begin
  if access_control.actor_kind() is distinct from 'person'
     or access_control.person() is distinct from p_person_id then
    raise exception 'person actor mismatch' using errcode = '42501';
  end if;

  return query
  select denial.id, denial.executed_session_id, denial.relationship_id, organization.id,
         organization.display_name::text, denial.denied_at, session.started_at, activity.name::text
  from privacy.session_visibility_denials as denial
  cross join lateral (select date_trunc('milliseconds', denial.denied_at) as denied_ms) as keyed
  join relationships.service_relationships as relationship on relationship.id = denial.relationship_id
  join organizations.organizations as organization on organization.id = relationship.organization_id
  join execution.executed_sessions as session on session.id = denial.executed_session_id
  join catalog.activity_types as activity on activity.id = session.activity_type_id
  where denial.person_id = p_person_id
    and denial.status = 'active'
    and (p_cursor_denied_at is null
         or (keyed.denied_ms, denial.id) < (p_cursor_denied_at, p_cursor_id))
  order by keyed.denied_ms desc, denial.id desc
  limit least(greatest(coalesce(p_limit, 26), 1), 101);
end
$function$;

alter function privacy.list_my_session_denials(uuid, integer, timestamptz, uuid) owner to allfit_owner;
revoke all on function privacy.list_my_session_denials(uuid, integer, timestamptz, uuid) from public;
grant execute on function privacy.list_my_session_denials(uuid, integer, timestamptz, uuid) to allfit_api;
