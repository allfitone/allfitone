-- HU-STUDIO-059, HU-STUDIO-060, HU-SP-062 and HU-SP-063 — the coach who attends a person
-- proposes a correction to a strength set she declared, and she decides.
--
-- OP-EXE-012 proposes. It needs her training shared at `contribute` and lands only on a
-- set she declared (never what a device captured or anybody observed) and shows him
-- through the screening of `20261107090000`: inside the relationship, or on her own under
-- `prior_training_history` (ADR-016 admits `propose_correction` there). Proposing changes
-- nothing (T-PROP-1). One field of one set waits on her for one proposal at a time, for
-- thirty days, and she is told by email; a proposal she cannot be told about is not made.
--
-- OP-EXE-013 is hers. Accepting writes the proposed value into the same set and moves the
-- session to its next revision, as her own correction does: `execution_revisions` keeps
-- the original, the change, the reason and the proposal, with her as who made it and the
-- value still declared by her (T-PROP-2). A decided, cancelled or expired proposal is not
-- accepted (T-PROP-3), and expiry is read from the clock, not from the sweep.
--
-- OP-SYS-004 expires what is due in batches and applies nothing. OP-EXE-020 lists each
-- side's own: Studio never shows her value, and shows where it pointed only while the
-- proposer still attends her and may read it; Space shows her everything.
--
-- A proposal names one set as it was, so whatever makes that untrue cancels it, with why:
--
--   · `target_changed`: her own correction writes the session's sets anew, ids included.
--   · `session_annulled` and `session_hidden`: she annuls the session or hides it.
--   · `relationship_terminated`: `close_relationship` ends it, by any of its three paths,
--     OP-ORG-012 included — the contract T-ORG-CLOSURE-INT-20 asked for lives there.
--
-- Each cancels inside its own contract scope, and every path that can change a set takes
-- the same advisory lock per session first, so a proposal and a rewrite never cross.
--
-- `execution.revision_events` was never built (`20261111090000`); an accepted proposal
-- is an `execution_revisions` row that names it.

set lock_timeout = '5s';
set statement_timeout = '60s';

-- ---------------------------------------------------------------------------
-- The proposal
-- ---------------------------------------------------------------------------

create type execution.correction_status as enum ('pending', 'accepted', 'rejected', 'expired', 'cancelled');
alter type execution.correction_status owner to allfit_owner;

create table execution.correction_proposals (
  id uuid not null,
  person_id uuid not null,
  relationship_id uuid not null,
  organization_id uuid not null,
  proposer_assignment_id uuid not null,
  proposer_membership_id uuid not null,
  executed_session_id uuid not null,
  -- No foreign key: her own correction writes the sets anew, and that cancels the proposal.
  target_strength_set_id uuid not null,
  set_order integer not null,
  movement_id uuid,
  target_field text not null,
  current_value numeric not null,
  current_unit_code text,
  proposed_value numeric not null,
  proposed_unit_code text,
  reason text not null,
  status execution.correction_status not null default 'pending',
  cancel_reason text,
  created_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz not null,
  settled_at timestamptz,
  constraint pk_correction_proposals primary key (id),
  constraint fk_correction_proposals_session foreign key (executed_session_id, person_id) references execution.executed_sessions (id, person_id) on delete restrict,
  constraint fk_correction_proposals_relationship foreign key (relationship_id, person_id, organization_id) references relationships.service_relationships (id, person_id, organization_id) on delete restrict,
  constraint fk_correction_proposals_proposer foreign key (proposer_assignment_id, relationship_id, person_id, organization_id, proposer_membership_id) references relationships.relationship_professional_assignments (id, relationship_id, person_id, organization_id, membership_id) on delete restrict,
  constraint fk_correction_proposals_movement foreign key (movement_id) references catalog.movements (id) on delete restrict,
  constraint fk_correction_proposals_current_unit foreign key (current_unit_code) references catalog.units (code) on delete restrict,
  constraint fk_correction_proposals_proposed_unit foreign key (proposed_unit_code) references catalog.units (code) on delete restrict,
  constraint ck_correction_proposals_field check (target_field in ('achieved_reps', 'load', 'rpe')),
  constraint ck_correction_proposals_values check (
    case target_field
      when 'achieved_reps' then
        current_value = trunc(current_value) and current_value >= 1
        and proposed_value = trunc(proposed_value) and proposed_value between 1 and 1000
        and current_unit_code is null and proposed_unit_code is null
      when 'rpe' then
        current_value between 0 and 10 and proposed_value between 0 and 10
        and current_unit_code is null and proposed_unit_code is null
      else
        current_value >= 0 and proposed_value >= 0 and proposed_value < 10000
        and current_unit_code is not null and proposed_unit_code is not null
    end
  ),
  constraint ck_correction_proposals_change check (
    (proposed_value, proposed_unit_code) is distinct from (current_value, current_unit_code)
  ),
  constraint ck_correction_proposals_reason check (btrim(reason) = reason and reason <> '' and char_length(reason) <= 500),
  constraint ck_correction_proposals_set_order check (set_order > 0),
  constraint ck_correction_proposals_expiry check (expires_at = created_at + interval '30 days'),
  constraint ck_correction_proposals_settled check (
    (status = 'pending') = (settled_at is null) and (settled_at is null or settled_at >= created_at)
  ),
  constraint ck_correction_proposals_cancel_reason check (
    (status = 'cancelled') = (cancel_reason is not null)
    and (cancel_reason is null
         or cancel_reason in ('target_changed', 'session_annulled', 'session_hidden', 'relationship_terminated'))
  )
);

-- One field of one set waits on her for one proposal at a time.
create unique index uidx_correction_proposals_pending_target
  on execution.correction_proposals (target_strength_set_id, target_field) where status = 'pending';
create index idx_correction_proposals_person
  on execution.correction_proposals (person_id, expires_at, id);
create index idx_correction_proposals_proposer
  on execution.correction_proposals (proposer_membership_id, expires_at, id);
create index idx_correction_proposals_session
  on execution.correction_proposals (executed_session_id, person_id);
create index idx_correction_proposals_relationship
  on execution.correction_proposals (relationship_id, person_id, organization_id);
create index idx_correction_proposals_proposer_assignment
  on execution.correction_proposals (proposer_assignment_id, relationship_id, person_id, organization_id, proposer_membership_id);
create index idx_correction_proposals_movement
  on execution.correction_proposals (movement_id);
create index idx_correction_proposals_current_unit
  on execution.correction_proposals (current_unit_code);
create index idx_correction_proposals_proposed_unit
  on execution.correction_proposals (proposed_unit_code);
create index idx_correction_proposals_due
  on execution.correction_proposals (expires_at, id) where status = 'pending';

alter table execution.correction_proposals owner to allfit_owner;
alter table execution.correction_proposals enable row level security;
alter table execution.correction_proposals force row level security;
revoke all on execution.correction_proposals from public, allfit_api;

create function execution.keep_correction_proposal_tg()
returns trigger
language plpgsql
set search_path = pg_catalog
as $function$
begin
  if (new.id, new.person_id, new.relationship_id, new.organization_id, new.proposer_assignment_id,
      new.proposer_membership_id, new.executed_session_id, new.target_strength_set_id, new.set_order,
      new.movement_id, new.target_field, new.current_value, new.current_unit_code, new.proposed_value,
      new.proposed_unit_code, new.reason, new.created_at, new.expires_at)
     is distinct from
     (old.id, old.person_id, old.relationship_id, old.organization_id, old.proposer_assignment_id,
      old.proposer_membership_id, old.executed_session_id, old.target_strength_set_id, old.set_order,
      old.movement_id, old.target_field, old.current_value, old.current_unit_code, old.proposed_value,
      old.proposed_unit_code, old.reason, old.created_at, old.expires_at) then
    raise exception 'a proposal keeps what it proposed, on what and by whom' using errcode = '23514';
  end if;
  if old.status <> 'pending' then
    raise exception 'a settled proposal stays as it was settled' using errcode = '23514';
  end if;
  return new;
end
$function$;

alter function execution.keep_correction_proposal_tg() owner to allfit_owner;
revoke all on function execution.keep_correction_proposal_tg() from public, allfit_api;

create trigger trg_correction_proposals_before_update_keep
before update on execution.correction_proposals
for each row execute function execution.keep_correction_proposal_tg();

-- IX-20: the target is a set of that session of hers, as she declared it, and a load is a mass.
create function execution.enforce_correction_subject_ct()
returns trigger
language plpgsql
set search_path = pg_catalog
as $function$
declare
  target record;
  moved boolean;
begin
  select sets.set_order, sets.movement_id, sets.achieved_reps, sets.rpe,
         coalesce(sets.original_load_value, sets.load_value) as load_value,
         coalesce(sets.original_load_unit_code, sets.load_unit_code) as load_unit_code
    into target
  from execution.strength_sets as sets
  where sets.id = new.target_strength_set_id
    and sets.executed_session_id = new.executed_session_id;
  if not found or target.set_order <> new.set_order or target.movement_id is distinct from new.movement_id then
    raise exception 'IX-20 a proposal names a set of that session of hers'
      using errcode = '23514', constraint = 'trg_correction_proposals_after_insert_subject';
  end if;
  moved := case new.target_field
    when 'achieved_reps' then target.achieved_reps is distinct from new.current_value
    when 'rpe' then target.rpe is distinct from new.current_value
    else (target.load_value, target.load_unit_code) is distinct from (new.current_value, new.current_unit_code)
  end;
  if moved then
    raise exception 'IX-20 what she had is what she declared'
      using errcode = '23514', constraint = 'trg_correction_proposals_after_insert_subject';
  end if;
  if new.target_field = 'load' and not exists (
    select 1 from catalog.units as unit where unit.code = new.proposed_unit_code and unit.dimension = 'mass'
  ) then
    raise exception 'IX-20 a load is a mass'
      using errcode = '23514', constraint = 'trg_correction_proposals_after_insert_subject';
  end if;
  return null;
end
$function$;

alter function execution.enforce_correction_subject_ct() owner to allfit_owner;
revoke all on function execution.enforce_correction_subject_ct() from public, allfit_api;

create constraint trigger trg_correction_proposals_after_insert_subject
after insert on execution.correction_proposals
deferrable initially immediate
for each row execute function execution.enforce_correction_subject_ct();

-- An accepted proposal is the revision it produced.
alter table execution.execution_revisions
  add column correction_proposal_id uuid,
  add constraint uq_execution_revisions_correction_proposal unique (correction_proposal_id),
  add constraint fk_execution_revisions_correction_proposal foreign key (correction_proposal_id) references execution.correction_proposals (id) on delete restrict;

-- ---------------------------------------------------------------------------
-- Row policies
-- ---------------------------------------------------------------------------

create policy correction_proposals_select_self on execution.correction_proposals
  for select to allfit_owner
  using (person_id = access_control.person());

-- She decides one made to her while it waits; a cancellation is never hers to write.
create policy correction_proposals_update_self on execution.correction_proposals
  for update to allfit_owner
  using (person_id = access_control.person() and status = 'pending')
  with check (person_id = access_control.person() and status in ('accepted', 'rejected'));

create policy correction_proposals_select_proposer on execution.correction_proposals
  for select to allfit_owner
  using (
    proposer_membership_id::text = current_setting('app.actor_membership_id', true)
    and access_control.owns_membership(proposer_membership_id)
  );

create policy correction_proposals_insert_contribute on execution.correction_proposals
  for insert to allfit_owner
  with check (
    proposer_membership_id::text = current_setting('app.actor_membership_id', true)
    and access_control.owns_membership(proposer_membership_id)
    and access_control.can_access(relationship_id, 'relationship_training', 'contribute')
  );

-- What she does to a session of hers cancels what waits on it, inside that session's scope.
create policy correction_proposals_select_cancellation on execution.correction_proposals
  for select to allfit_owner
  using (executed_session_id::text = (select access_control.contract_scope('correction_cancellation')));

create policy correction_proposals_update_cancellation on execution.correction_proposals
  for update to allfit_owner
  using (
    status = 'pending'
    and executed_session_id::text = (select access_control.contract_scope('correction_cancellation'))
  )
  with check (
    status = 'cancelled'
    and executed_session_id::text = (select access_control.contract_scope('correction_cancellation'))
  );

-- Closing a relationship cancels what still waits on it, as it detaches its programmes.
create policy correction_proposals_select_detachment on execution.correction_proposals
  for select to allfit_owner
  using (relationship_id::text = (select access_control.contract_scope('relationship_detachment')));

create policy correction_proposals_update_detachment on execution.correction_proposals
  for update to allfit_owner
  using (
    status = 'pending'
    and relationship_id::text = (select access_control.contract_scope('relationship_detachment'))
  )
  with check (
    status = 'cancelled'
    and relationship_id::text = (select access_control.contract_scope('relationship_detachment'))
  );

-- What is due, and what it has just expired: an update must still see the row it wrote.
create policy correction_proposals_select_worker on execution.correction_proposals
  for select to allfit_owner
  using (
    access_control.actor_kind() = 'worker'
    and status in ('pending', 'expired')
    and expires_at <= clock_timestamp()
  );

create policy correction_proposals_update_worker on execution.correction_proposals
  for update to allfit_owner
  using (
    access_control.actor_kind() = 'worker'
    and status = 'pending'
    and expires_at <= clock_timestamp()
  )
  with check (access_control.actor_kind() = 'worker' and status = 'expired');

-- ---------------------------------------------------------------------------
-- Shared pieces
-- ---------------------------------------------------------------------------

-- Every path that changes a set, or proposes on one, takes this lock for its session first.
create function execution.lock_correction_targets(p_executed_session_id uuid)
returns void
language sql
volatile
set search_path = pg_catalog
as $function$
  select pg_advisory_xact_lock(
    hashtextextended('execution.correction_targets:' || p_executed_session_id::text, 0)
  )
$function$;

alter function execution.lock_correction_targets(uuid) owner to allfit_owner;
revoke all on function execution.lock_correction_targets(uuid) from public, allfit_api;

-- What is waiting on a session stops waiting, with why: on one relationship's or on some sets.
create function execution.cancel_session_corrections(
  p_executed_session_id uuid,
  p_relationship_id uuid,
  p_set_ids uuid[],
  p_reason text
)
returns integer
language plpgsql
volatile
security definer
set search_path = pg_catalog
as $function$
declare
  cancelled integer;
  previous_purpose text := current_setting('app.contract_scope_purpose', true);
  previous_id text := current_setting('app.contract_scope_id', true);
  previous_token text := current_setting('app.contract_scope_token', true);
begin
  perform execution.lock_correction_targets(p_executed_session_id);
  perform access_control.open_contract_scope('correction_cancellation', p_executed_session_id);
  update execution.correction_proposals as proposal
  set status = 'cancelled',
      cancel_reason = p_reason,
      settled_at = greatest(clock_timestamp(), proposal.created_at)
  where proposal.executed_session_id = p_executed_session_id
    and proposal.status = 'pending'
    and (p_relationship_id is null or proposal.relationship_id = p_relationship_id)
    and (p_set_ids is null or proposal.target_strength_set_id = any (p_set_ids));
  get diagnostics cancelled = row_count;
  perform planning.resume_contract_scope(previous_purpose, previous_id, previous_token);
  return cancelled;
end
$function$;

alter function execution.cancel_session_corrections(uuid, uuid, uuid[], text) owner to allfit_owner;
revoke all on function execution.cancel_session_corrections(uuid, uuid, uuid[], text) from public, allfit_api;

create function execution.cancel_corrections_on_rewrite_tg()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  rewritten record;
begin
  for rewritten in
    select gone.executed_session_id, array_agg(gone.id) as set_ids
    from gone
    group by gone.executed_session_id
  loop
    perform execution.cancel_session_corrections(
      rewritten.executed_session_id, null, rewritten.set_ids, 'target_changed'
    );
  end loop;
  return null;
end
$function$;

alter function execution.cancel_corrections_on_rewrite_tg() owner to allfit_owner;
revoke all on function execution.cancel_corrections_on_rewrite_tg() from public, allfit_api;

create trigger trg_strength_sets_after_delete_cancel_corrections
after delete on execution.strength_sets
referencing old table as gone
for each statement execute function execution.cancel_corrections_on_rewrite_tg();

create function execution.cancel_corrections_on_annulment_tg()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $function$
begin
  perform execution.cancel_session_corrections(new.id, null, null, 'session_annulled');
  return null;
end
$function$;

alter function execution.cancel_corrections_on_annulment_tg() owner to allfit_owner;
revoke all on function execution.cancel_corrections_on_annulment_tg() from public, allfit_api;

create trigger trg_executed_sessions_after_annulment_cancel_corrections
after update of annulled_at on execution.executed_sessions
for each row when (old.annulled_at is null and new.annulled_at is not null)
execute function execution.cancel_corrections_on_annulment_tg();

create function execution.cancel_corrections_on_hiding_tg()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $function$
begin
  perform execution.cancel_session_corrections(
    new.executed_session_id, new.relationship_id, null, 'session_hidden'
  );
  return null;
end
$function$;

alter function execution.cancel_corrections_on_hiding_tg() owner to allfit_owner;
revoke all on function execution.cancel_corrections_on_hiding_tg() from public, allfit_api;

create trigger trg_session_visibility_denials_after_hiding_cancel_corrections
after insert or update of status on privacy.session_visibility_denials
for each row when (new.status = 'active')
execute function execution.cancel_corrections_on_hiding_tg();

-- `close_relationship` runs this for each of its three paths, at the instant it ends.
create function execution.cancel_relationship_correction_proposals(
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
  cancelled integer;
  previous_purpose text := current_setting('app.contract_scope_purpose', true);
  previous_id text := current_setting('app.contract_scope_id', true);
  previous_token text := current_setting('app.contract_scope_token', true);
begin
  perform access_control.open_contract_scope('relationship_detachment', p_relationship_id);
  update execution.correction_proposals as proposal
  set status = 'cancelled',
      cancel_reason = 'relationship_terminated',
      settled_at = greatest(p_effective_at, proposal.created_at)
  where proposal.relationship_id = p_relationship_id
    and proposal.status = 'pending';
  get diagnostics cancelled = row_count;
  perform planning.resume_contract_scope(previous_purpose, previous_id, previous_token);
  return cancelled;
end
$function$;

alter function execution.cancel_relationship_correction_proposals(uuid, timestamptz) owner to allfit_owner;
revoke all on function execution.cancel_relationship_correction_proposals(uuid, timestamptz)
  from public, allfit_api;

-- A proposal as its proposer sees it: never her value, and where it pointed only while he
-- still attends her and may read it.
create function execution.proposal_for_proposer(p_proposal_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog
as $function$
  select jsonb_build_object(
    'id', proposal.id,
    'client', jsonb_build_object('person_id', proposal.person_id, 'name', client.display_name),
    'target', case
      when execution.attending_assignment(proposal.relationship_id, proposal.proposer_membership_id) is not null
       and (access_control.can_access(proposal.relationship_id, 'relationship_training', 'read')
            or access_control.can_access(proposal.relationship_id, 'prior_training_history', 'read'))
      then jsonb_build_object('execution_id', proposal.executed_session_id, 'set_order', proposal.set_order)
    end,
    'field', proposal.target_field,
    'proposed', jsonb_build_object('value', proposal.proposed_value, 'unit', proposal.proposed_unit_code),
    'reason', proposal.reason,
    'status', case when proposal.status = 'pending' and proposal.expires_at <= clock_timestamp()
                   then 'expired' else proposal.status::text end,
    'cancel_reason', proposal.cancel_reason,
    'created_at', proposal.created_at,
    'expires_at', proposal.expires_at,
    'settled_at', proposal.settled_at
  )
  from execution.correction_proposals as proposal
  join identity.people as client on client.id = proposal.person_id
  where proposal.id = p_proposal_id
$function$;

alter function execution.proposal_for_proposer(uuid) owner to allfit_owner;
revoke all on function execution.proposal_for_proposer(uuid) from public, allfit_api;

-- A proposal as she sees it: what she had, what he proposes, why, who and from where.
create function execution.proposal_for_person(p_proposal_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog
as $function$
  select jsonb_build_object(
    'id', proposal.id,
    'execution_id', proposal.executed_session_id,
    'set_order', proposal.set_order,
    'movement_id', proposal.movement_id,
    'movement_name', movement.name,
    'field', proposal.target_field,
    'current', jsonb_build_object('value', proposal.current_value, 'unit', proposal.current_unit_code),
    'proposed', jsonb_build_object('value', proposal.proposed_value, 'unit', proposal.proposed_unit_code),
    'reason', proposal.reason,
    'status', case when proposal.status = 'pending' and proposal.expires_at <= clock_timestamp()
                   then 'expired' else proposal.status::text end,
    'cancel_reason', proposal.cancel_reason,
    'created_at', proposal.created_at,
    'expires_at', proposal.expires_at,
    'settled_at', proposal.settled_at,
    'proposer_name', proposer.display_name,
    'organization_name', organization.display_name
  )
  from execution.correction_proposals as proposal
  join organizations.organization_memberships as membership on membership.id = proposal.proposer_membership_id
  join identity.people as proposer on proposer.id = membership.person_id
  join organizations.organizations as organization on organization.id = proposal.organization_id
  left join catalog.movements as movement on movement.id = proposal.movement_id
  where proposal.id = p_proposal_id
$function$;

alter function execution.proposal_for_person(uuid) owner to allfit_owner;
revoke all on function execution.proposal_for_person(uuid) from public, allfit_api;

-- ---------------------------------------------------------------------------
-- OP-EXE-012
-- ---------------------------------------------------------------------------

/*
 * The attending coach proposes a new value for one field of one set she declared and
 * shows him. Nothing she declared changes; she is told, and has thirty days. The
 * Command-Id is the proposal's id.
 */
create function execution.propose_correction(
  p_person_id uuid,
  p_organization_id uuid,
  p_subject_person_id uuid,
  p_execution_id uuid,
  p_set_order integer,
  p_field text,
  p_value numeric,
  p_unit_code text,
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
  attending record;
  receipt record;
  proposer_id uuid;
  problems text[] := array[]::text[];
  target record;
  declared_value numeric;
  declared_unit text;
  subject record;
  proposed_at timestamptz;
  document jsonb;
  previous_purpose text := current_setting('app.contract_scope_purpose', true);
  previous_id text := current_setting('app.contract_scope_id', true);
  previous_token text := current_setting('app.contract_scope_token', true);
begin
  select * into attending
  from execution.require_attending_coach(p_person_id, p_organization_id, p_subject_person_id);
  if not access_control.has_capability(p_organization_id, 'propose_corrections') then
    raise exception 'this action requires propose_corrections' using errcode = '42501';
  end if;
  perform execution.require_category_grant(attending.relationship_id, 'relationship_training', 'contribute');

  if p_set_order is null or p_set_order < 1 then
    problems := array_append(problems, 'set_order');
  end if;
  if p_field is null or p_field not in ('achieved_reps', 'load', 'rpe') then
    problems := array_append(problems, 'field');
  elsif p_field = 'load' then
    if p_value is null or p_value < 0 or p_value >= 10000 then
      problems := array_append(problems, 'value');
    end if;
    if p_unit_code is null or not exists (
      select 1 from catalog.units as unit where unit.code = p_unit_code and unit.dimension = 'mass'
    ) then
      problems := array_append(problems, 'unit');
    end if;
  else
    if p_value is null
       or (p_field = 'achieved_reps' and (p_value <> trunc(p_value) or p_value not between 1 and 1000))
       or (p_field = 'rpe' and p_value not between 0 and 10) then
      problems := array_append(problems, 'value');
    end if;
    if p_unit_code is not null then
      problems := array_append(problems, 'unit');
    end if;
  end if;
  if p_reason is null or btrim(p_reason) = '' or char_length(btrim(p_reason)) > 500 then
    problems := array_append(problems, 'reason');
  end if;
  if cardinality(problems) > 0 then
    raise exception 'the proposal is not valid' using errcode = '22023', detail = to_jsonb(problems)::text;
  end if;

  select * into receipt from system.begin_idempotency(
    p_person_id, 'OP-EXE-012', p_idempotency_key, p_command_id, p_request_hash
  );
  perform 1
  from relationships.service_relationships as relationship
  where relationship.id = attending.relationship_id
  for share;

  if not receipt.claimed then
    document := execution.proposal_for_proposer(receipt.aggregate_id);
    return query select document, true;
    return;
  end if;

  -- Read under the lock: an end committed meanwhile ended this assignment, as after it.
  proposer_id := execution.attending_assignment(attending.relationship_id, attending.membership_id);
  if proposer_id is null then
    raise exception 'client not found' using errcode = 'P0002';
  end if;

  -- Her own correction, an annulment or a hiding of this session either went first or waits.
  perform execution.lock_correction_targets(p_execution_id);
  perform access_control.open_contract_scope('session_screening', attending.relationship_id);
  select session.capture_source, session.capture_provenance, sets.id as set_id, sets.movement_id,
         sets.achieved_reps, sets.rpe,
         coalesce(sets.original_load_value, sets.load_value) as load_value,
         coalesce(sets.original_load_unit_code, sets.load_unit_code) as load_unit_code
    into target
  from execution.executed_sessions as session
  left join execution.strength_sets as sets
    on sets.executed_session_id = session.id and sets.set_order = p_set_order
  where session.id = p_execution_id
    and session.person_id = p_subject_person_id
    and session.execution_status = 'completed'
    and session.validation_status <> 'annulled'
    and session.annulled_at is null
    and session.ended_at is not null;
  if not found then
    raise exception 'execution not found' using errcode = 'P0002';
  end if;
  -- Only what she declared: what a device captured or anybody observed is not hers to change.
  if target.capture_source = 'device' or target.capture_provenance <> 'person_declared' then
    raise exception 'only what she declared takes a proposal' using errcode = '22023',
      detail = '["execution"]';
  end if;
  if target.set_id is null then
    raise exception 'the session has no such set' using errcode = '22023', detail = '["set_order"]';
  end if;

  declared_value := case p_field
    when 'achieved_reps' then target.achieved_reps
    when 'rpe' then target.rpe
    else target.load_value
  end;
  declared_unit := case when p_field = 'load' then target.load_unit_code end;
  if declared_value is null then
    raise exception 'she declared nothing in that field' using errcode = '22023', detail = '["field"]';
  end if;
  if (p_value, p_unit_code) is not distinct from (declared_value, declared_unit) then
    raise exception 'that is already what she declared' using errcode = '22023', detail = '["value"]';
  end if;

  select person.display_name, person.contact_email into subject
  from identity.people as person
  where person.id = p_subject_person_id;
  if subject.contact_email is null then
    raise exception 'the person has no contact to be told about a proposal' using errcode = 'P0004';
  end if;

  proposed_at := clock_timestamp();
  insert into execution.correction_proposals (
    id, person_id, relationship_id, organization_id, proposer_assignment_id, proposer_membership_id,
    executed_session_id, target_strength_set_id, set_order, movement_id, target_field,
    current_value, current_unit_code, proposed_value, proposed_unit_code, reason, created_at, expires_at
  ) values (
    p_command_id, p_subject_person_id, attending.relationship_id, p_organization_id, proposer_id,
    attending.membership_id, p_execution_id, target.set_id, p_set_order, target.movement_id, p_field,
    declared_value, declared_unit, p_value, p_unit_code, btrim(p_reason), proposed_at,
    proposed_at + interval '30 days'
  );

  -- Who and until when, never the values: those stay in the app, where she is herself.
  perform system.enqueue_outbox_event(
    'correction_proposal', p_command_id, 'execution.correction_proposed.v1',
    jsonb_build_object(
      'proposal_id', p_command_id,
      'contact', subject.contact_email,
      'person_name', subject.display_name,
      'proposer_name', (select person.display_name from identity.people as person where person.id = p_person_id),
      'organization_name', (select organization.display_name from organizations.organizations as organization
                            where organization.id = p_organization_id),
      'expires_at', proposed_at + interval '30 days'
    )
  );
  perform system.finish_idempotency(
    receipt.receipt_id, 201::smallint, 'correction-proposed', 'correction_proposal', p_command_id
  );

  document := execution.proposal_for_proposer(p_command_id);
  perform planning.resume_contract_scope(previous_purpose, previous_id, previous_token);
  return query select document, false;
end
$function$;

alter function execution.propose_correction(uuid, uuid, uuid, uuid, integer, text, numeric, text, text, uuid, uuid, bytea)
  owner to allfit_owner;
revoke all on function execution.propose_correction(uuid, uuid, uuid, uuid, integer, text, numeric, text, text, uuid, uuid, bytea)
  from public;
grant execute on function execution.propose_correction(uuid, uuid, uuid, uuid, integer, text, numeric, text, text, uuid, uuid, bytea)
  to allfit_api;

-- ---------------------------------------------------------------------------
-- OP-EXE-020
-- ---------------------------------------------------------------------------

/*
 * Studio: what this professional proposed in this organization, soonest to expire first,
 * cancelled ones included. The API asks for one more than it shows to know there is more.
 */
create function execution.list_proposed_corrections(
  p_person_id uuid,
  p_organization_id uuid,
  p_status text,
  p_limit integer,
  p_cursor_expires_at timestamptz,
  p_cursor_id uuid
)
returns table (proposal jsonb)
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
  if p_status is not null and p_status not in ('pending', 'accepted', 'rejected', 'expired', 'cancelled') then
    raise exception 'unknown status' using errcode = '22023', detail = '["status"]';
  end if;

  return query
  select execution.proposal_for_proposer(found.id)
  from execution.correction_proposals as found
  where found.proposer_membership_id = actor_membership_id
    and (p_cursor_expires_at is null or (found.expires_at, found.id) > (p_cursor_expires_at, p_cursor_id))
    and (p_status is null
         or p_status = case when found.status = 'pending' and found.expires_at <= clock_timestamp()
                            then 'expired' else found.status::text end)
  order by found.expires_at, found.id
  limit least(greatest(coalesce(p_limit, 21), 1), 101);
end
$function$;

alter function execution.list_proposed_corrections(uuid, uuid, text, integer, timestamptz, uuid) owner to allfit_owner;
revoke all on function execution.list_proposed_corrections(uuid, uuid, text, integer, timestamptz, uuid) from public;
grant execute on function execution.list_proposed_corrections(uuid, uuid, text, integer, timestamptz, uuid) to allfit_api;

-- Space: what was proposed to her, soonest to expire first, cancelled ones included.
create function execution.list_my_correction_proposals(
  p_person_id uuid,
  p_status text,
  p_limit integer,
  p_cursor_expires_at timestamptz,
  p_cursor_id uuid
)
returns table (proposal jsonb)
language plpgsql
volatile
security definer
set search_path = pg_catalog
as $function$
begin
  if access_control.actor_kind() is distinct from 'person'
     or access_control.person() is distinct from p_person_id then
    raise exception 'person actor mismatch' using errcode = '42501';
  end if;
  if p_status is not null and p_status not in ('pending', 'accepted', 'rejected', 'expired', 'cancelled') then
    raise exception 'unknown status' using errcode = '22023', detail = '["status"]';
  end if;

  return query
  select execution.proposal_for_person(found.id)
  from execution.correction_proposals as found
  where found.person_id = p_person_id
    and (p_cursor_expires_at is null or (found.expires_at, found.id) > (p_cursor_expires_at, p_cursor_id))
    and (p_status is null
         or p_status = case when found.status = 'pending' and found.expires_at <= clock_timestamp()
                            then 'expired' else found.status::text end)
  order by found.expires_at, found.id
  limit least(greatest(coalesce(p_limit, 21), 1), 101);
end
$function$;

alter function execution.list_my_correction_proposals(uuid, text, integer, timestamptz, uuid) owner to allfit_owner;
revoke all on function execution.list_my_correction_proposals(uuid, text, integer, timestamptz, uuid) from public;
grant execute on function execution.list_my_correction_proposals(uuid, text, integer, timestamptz, uuid) to allfit_api;

-- ---------------------------------------------------------------------------
-- OP-EXE-013
-- ---------------------------------------------------------------------------

/*
 * She accepts or rejects one proposal made to her. Accepting writes the value into the
 * same set and records the revision as her own correction does, naming the proposal.
 * A proposal that is no longer open is `55000`, whatever the sweep has done so far.
 */
create function execution.decide_correction_proposal(
  p_person_id uuid,
  p_proposal_id uuid,
  p_decision text,
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
  receipt record;
  aimed record;
  session record;
  proposal record;
  settled record;
  target record;
  moved boolean;
  kept jsonb;
  decided_at timestamptz;
begin
  if access_control.actor_kind() is distinct from 'person'
     or access_control.person() is distinct from p_person_id then
    raise exception 'person actor mismatch' using errcode = '42501';
  end if;
  if p_decision is null or p_decision not in ('accept', 'reject') then
    raise exception 'a decision accepts or rejects' using errcode = '22023', detail = '["decision"]';
  end if;

  select * into receipt from system.begin_idempotency(
    p_person_id, 'OP-EXE-013', p_idempotency_key, p_command_id, p_request_hash
  );
  if not receipt.claimed then
    return query select execution.proposal_for_person(receipt.aggregate_id), true;
    return;
  end if;

  select found.executed_session_id into aimed
  from execution.correction_proposals as found
  where found.id = p_proposal_id and found.person_id = p_person_id;
  if not found then
    raise exception 'proposal not found' using errcode = 'P0002';
  end if;

  -- The order her own correction takes: the session, then what waits on it.
  select executed.id, executed.execution_status, executed.annulled_at, executed.revision_number
    into session
  from execution.executed_sessions as executed
  where executed.id = aimed.executed_session_id
  for update;
  perform execution.lock_correction_targets(aimed.executed_session_id);
  -- Locking goes through her update policy, which only admits one still waiting.
  select * into proposal
  from execution.correction_proposals as found
  where found.id = p_proposal_id
  for update;
  if not found then
    select found.status into settled
    from execution.correction_proposals as found
    where found.id = p_proposal_id;
    raise exception 'the proposal is no longer open' using errcode = '55000', detail = settled.status::text;
  end if;

  decided_at := clock_timestamp();
  if proposal.expires_at <= decided_at then
    raise exception 'the proposal is no longer open' using errcode = '55000', detail = 'expired';
  end if;

  if p_decision = 'accept' then
    if session.execution_status <> 'completed' or session.annulled_at is not null then
      raise exception 'the session is no longer there to correct' using errcode = '55000';
    end if;
    select sets.achieved_reps, sets.rpe,
           coalesce(sets.original_load_value, sets.load_value) as load_value,
           coalesce(sets.original_load_unit_code, sets.load_unit_code) as load_unit_code
      into target
    from execution.strength_sets as sets
    where sets.id = proposal.target_strength_set_id
      and sets.executed_session_id = proposal.executed_session_id;
    moved := not found or case proposal.target_field
      when 'achieved_reps' then target.achieved_reps is distinct from proposal.current_value
      when 'rpe' then target.rpe is distinct from proposal.current_value
      else (target.load_value, target.load_unit_code)
           is distinct from (proposal.current_value, proposal.current_unit_code)
    end;
    if moved then
      raise exception 'the set no longer holds what was proposed against' using errcode = '55000';
    end if;

    kept := execution.session_snapshot(session.id);
    update execution.strength_sets as sets
    set achieved_reps = case when proposal.target_field = 'achieved_reps'
                             then proposal.proposed_value::integer else sets.achieved_reps end,
        rpe = case when proposal.target_field = 'rpe' then proposal.proposed_value else sets.rpe end,
        load_value = case when proposal.target_field = 'load'
                          then proposal.proposed_value else sets.load_value end,
        load_unit_code = case when proposal.target_field = 'load'
                              then proposal.proposed_unit_code else sets.load_unit_code end,
        original_load_value = case when proposal.target_field = 'load'
                                   then null else sets.original_load_value end,
        original_load_unit_code = case when proposal.target_field = 'load'
                                       then null else sets.original_load_unit_code end
    where sets.id = proposal.target_strength_set_id;
    update execution.executed_sessions as executed
    set revision_number = executed.revision_number + 1
    where executed.id = session.id;
    -- Hers: she made the change and it stays declared by her; he is named only as proposer.
    insert into execution.execution_revisions (
      executed_session_id, person_id, revision_from, revision_to, actor_person_id, reason,
      before, after, correction_proposal_id
    ) values (
      session.id, p_person_id, session.revision_number, session.revision_number + 1, p_person_id,
      proposal.reason, kept, execution.session_snapshot(session.id), proposal.id
    );
  end if;

  update execution.correction_proposals as found
  set status = case when p_decision = 'accept' then 'accepted' else 'rejected' end::execution.correction_status,
      settled_at = decided_at
  where found.id = p_proposal_id;

  perform system.enqueue_outbox_event(
    'correction_proposal', p_proposal_id, 'execution.correction_decided.v1',
    jsonb_build_object(
      'proposal_id', p_proposal_id,
      'person_id', p_person_id,
      'relationship_id', proposal.relationship_id,
      'decision', case when p_decision = 'accept' then 'accepted' else 'rejected' end
    )
  );
  perform system.finish_idempotency(
    receipt.receipt_id, 200::smallint, 'correction-decided', 'correction_proposal', p_proposal_id
  );

  return query select execution.proposal_for_person(p_proposal_id), false;
end
$function$;

alter function execution.decide_correction_proposal(uuid, uuid, text, uuid, uuid, bytea) owner to allfit_owner;
revoke all on function execution.decide_correction_proposal(uuid, uuid, text, uuid, uuid, bytea) from public;
grant execute on function execution.decide_correction_proposal(uuid, uuid, text, uuid, uuid, bytea) to allfit_api;

-- ---------------------------------------------------------------------------
-- OP-SYS-004
-- ---------------------------------------------------------------------------

-- What has waited thirty days expires, unapplied. A decision she is making is skipped and wins.
create function execution.expire_correction_proposals(p_limit integer default 100)
returns integer
language plpgsql
volatile
security definer
set search_path = pg_catalog
as $function$
declare
  due record;
  expired_count integer := 0;
begin
  if access_control.actor_kind() is distinct from 'worker' then
    raise exception 'worker actor required' using errcode = '42501';
  end if;
  if p_limit is null or p_limit not between 1 and 1000 then
    raise exception 'invalid expiration batch size' using errcode = '22023';
  end if;

  for due in
    select proposal.id, proposal.person_id, proposal.relationship_id
    from execution.correction_proposals as proposal
    where proposal.status = 'pending'
      and proposal.expires_at <= clock_timestamp()
    order by proposal.expires_at, proposal.id
    for update skip locked
    limit p_limit
  loop
    update execution.correction_proposals as proposal
    set status = 'expired', settled_at = clock_timestamp()
    where proposal.id = due.id;
    perform system.enqueue_outbox_event(
      'correction_proposal', due.id, 'execution.correction_expired.v1',
      jsonb_build_object(
        'proposal_id', due.id,
        'person_id', due.person_id,
        'relationship_id', due.relationship_id
      )
    );
    expired_count := expired_count + 1;
  end loop;
  return expired_count;
end
$function$;

alter function execution.expire_correction_proposals(integer) owner to allfit_owner;
revoke all on function execution.expire_correction_proposals(integer) from public;
grant execute on function execution.expire_correction_proposals(integer) to allfit_api;

-- ---------------------------------------------------------------------------
-- Closing a relationship cancels what waits on it
-- ---------------------------------------------------------------------------

/*
 * `20261104090000`'s body, with the proposals still waiting cancelled at the same instant.
 * Her ending it, the gym ending it and the organization closing all come through here.
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
  perform execution.cancel_relationship_correction_proposals(p_relationship_id, p_effective_at);

  return query select frozen, closed;
end
$function$;
