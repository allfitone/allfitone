-- OP-ORG-012 (HU-STUDIO-013) — an owner closes the organization.
--
-- One transaction coordinates narrow contracts, each owned by its domain and called in a
-- stable order with one effective instant. If any of them fails, nothing closes:
--
--   · `payments.check_organization_closure` refuses while a client subscription is live.
--     No contract ends an external charge, and a client billed by a closed gym is worse
--     than a closure that has to wait.
--   · `relationships.terminate_for_organization` ends every live relationship through
--     `close_relationship`, so the freezing rule stays in one place, and tells each
--     client with an address, as OP-REL-008 does. A cover nobody answered stays as it
--     was: `decide_substitution` requires a live relationship, so it can never run.
--   · `identity.revoke_invitations_for_organization_closure`: an invitation from a closed
--     organization can no longer be accepted.
--   · `privacy.apply_organization_closure` proves no grant of this organization is still
--     active. Disposition of the evidence the organization keeps needs a retention policy
--     with a period, which is a legal decision not yet taken.
--   · `nutrition.cancel_proposals_for_organization_closure` cancels pending professional
--     proposals; activated or rejected goals are the person's decisions and stay.
--
-- Planning has nothing to detach yet: a program assignment cannot originate from an
-- organization until HU-STUDIO-046 lifts `ck_program_assignments_no_origin`. Execution has
-- no correction proposals until HU-STUDIO-059. Both are pinned by T-ORG-CLOSURE-01, which
-- fails the day either becomes possible, so the contract is added with it.
--
-- **Nutrition writes rows another person owns**, and `goal_versions` forces row-level
-- security even for its owner. A capability policy would widen every function that reads
-- goal versions as the owner, so the closure proves itself with a contract scope instead:
-- an HMAC of purpose, organization, backend and transaction start, keyed by a secret the
-- runtime cannot read, set only while the contract runs. It generalizes the occupancy
-- counting token of HU-STUDIO-087.
set lock_timeout = '5s';
set statement_timeout = '60s';

-- ---------------------------------------------------------------------------
-- Contract scopes
-- ---------------------------------------------------------------------------

create table access_control.contract_scope_keys (
  id smallint not null default 1,
  secret bytea not null default extensions.gen_random_bytes(32),
  created_at timestamptz not null default clock_timestamp(),
  constraint pk_contract_scope_keys primary key (id),
  constraint ck_contract_scope_keys_singleton check (id = 1),
  constraint ck_contract_scope_keys_secret check (octet_length(secret) = 32)
);
insert into access_control.contract_scope_keys default values;

alter table access_control.contract_scope_keys owner to allfit_owner;
alter table access_control.contract_scope_keys enable row level security;
alter table access_control.contract_scope_keys force row level security;
create policy contract_scope_keys_select_owner on access_control.contract_scope_keys
  for select to allfit_owner using (true);
revoke all on access_control.contract_scope_keys from public, allfit_api;

create function access_control.contract_scope_token(p_purpose text, p_scope_id text)
returns text
language sql
stable
security invoker
set search_path = pg_catalog
as $function$
  select encode(
    extensions.hmac(
      convert_to(p_purpose || ':' || p_scope_id || ':' || pg_backend_pid()::text || ':'
        || extract(epoch from now())::text, 'UTF8'),
      scope_key.secret,
      'sha256'
    ),
    'hex'
  )
  from access_control.contract_scope_keys as scope_key
$function$;

-- The scope a valid token opens for this purpose, or null.
create function access_control.contract_scope(p_purpose text)
returns text
language sql
stable
security invoker
set search_path = pg_catalog
as $function$
  select scope.scope_id
  from (
    select nullif(current_setting('app.contract_scope_purpose', true), '') as purpose,
           nullif(current_setting('app.contract_scope_id', true), '') as scope_id,
           nullif(current_setting('app.contract_scope_token', true), '') as token
  ) as scope
  where scope.purpose = p_purpose
    and scope.token = access_control.contract_scope_token(scope.purpose, scope.scope_id)
$function$;

create function access_control.open_contract_scope(p_purpose text, p_scope_id uuid)
returns void
language plpgsql
security invoker
set search_path = pg_catalog
as $function$
begin
  perform set_config('app.contract_scope_purpose', p_purpose, true);
  perform set_config('app.contract_scope_id', p_scope_id::text, true);
  perform set_config('app.contract_scope_token',
    access_control.contract_scope_token(p_purpose, p_scope_id::text), true);
end
$function$;

create function access_control.close_contract_scope()
returns void
language plpgsql
security invoker
set search_path = pg_catalog
as $function$
begin
  perform set_config('app.contract_scope_token', '', true);
  perform set_config('app.contract_scope_id', '', true);
  perform set_config('app.contract_scope_purpose', '', true);
end
$function$;

alter function access_control.contract_scope_token(text, text) owner to allfit_owner;
alter function access_control.contract_scope(text) owner to allfit_owner;
alter function access_control.open_contract_scope(text, uuid) owner to allfit_owner;
alter function access_control.close_contract_scope() owner to allfit_owner;
revoke all on function access_control.contract_scope_token(text, text) from public, allfit_api;
revoke all on function access_control.contract_scope(text) from public, allfit_api;
revoke all on function access_control.open_contract_scope(text, uuid) from public, allfit_api;
revoke all on function access_control.close_contract_scope() from public, allfit_api;

-- ---------------------------------------------------------------------------
-- The closure event
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION organizations.validate_organization_event_snapshot(p_event_type text, p_schema_version smallint, p_payload jsonb)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE STRICT
 SET search_path TO 'pg_catalog'
AS $function$
  select system.validate_json_contract(
    'audit.organization_event_snapshot',
    p_schema_version,
    p_payload
  ) and case
    when p_event_type in (
      'organization.created.v1', 'organization.updated.v1',
      'organization.created_unclaimed.v1', 'organization.cancelled.v1',
      'organization.suspended.v1', 'organization.reactivated.v1',
      'organization.closed.v1'
    ) then
      system.jsonb_has_exact_keys(
        p_payload,
        array['type_code', 'legal_name', 'display_name', 'status', 'revision_number']
      )
    when p_event_type in ('organization.site_created.v1', 'organization.site_updated.v1') then
      system.jsonb_has_exact_keys(
        p_payload,
        array['site_id', 'name', 'address', 'status', 'revision_number']
      )
    when p_event_type = 'organization.ownership_transferred.v1' then
      system.jsonb_has_exact_keys(
        p_payload,
        array['previous_owner_membership_id', 'owner_membership_id']
      )
    when p_event_type = 'organization.claimed.v1' then
      system.jsonb_has_exact_keys(p_payload, array['owner_membership_id'])
    when p_event_type = 'organization.guest_quota_set.v1' then
      system.jsonb_has_exact_keys(p_payload, array['guest_quota_seats', 'revision_number'])
    else false
  end
$function$;

alter table organizations.organization_events
  drop constraint ck_organization_events_snapshot_pair,
  add constraint ck_organization_events_snapshot_pair check (
    (event_type in (
      'organization.created.v1', 'organization.created_unclaimed.v1',
      'organization.site_created.v1', 'organization.ownership_transferred.v1',
      'organization.claimed.v1'
    ) and before_snapshot is null and after_snapshot is not null)
    or (event_type in (
      'organization.updated.v1', 'organization.site_updated.v1', 'organization.cancelled.v1',
      'organization.guest_quota_set.v1', 'organization.suspended.v1',
      'organization.reactivated.v1', 'organization.closed.v1'
    ) and before_snapshot is not null and after_snapshot is not null)
  );

-- ---------------------------------------------------------------------------
-- Payments — a live charge blocks the closure
-- ---------------------------------------------------------------------------

create function payments.check_organization_closure(p_organization_id uuid)
returns void
language plpgsql
stable
security definer
set search_path = pg_catalog
as $function$
begin
  perform subscription.id
  from payments.plan_subscriptions as subscription
  where subscription.organization_id = p_organization_id
    and subscription.status <> 'ended'
  limit 1;
  if found then
    raise exception 'the organization still has live subscriptions' using errcode = '22023';
  end if;
end
$function$;
alter function payments.check_organization_closure(uuid) owner to allfit_owner;
revoke all on function payments.check_organization_closure(uuid) from public, allfit_api;

-- ---------------------------------------------------------------------------
-- Relationships — every live relationship ends at the closing instant
-- ---------------------------------------------------------------------------

create function relationships.terminate_for_organization(
  p_organization_id uuid, p_effective_at timestamptz, p_command_id uuid
)
returns integer
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  subject record;
  terminated integer := 0;
begin
  if p_organization_id is null or p_effective_at is null or p_command_id is null then
    raise exception 'organization, effective instant and command required' using errcode = '22023';
  end if;

  for subject in
    select relationship.id,
           person.display_name,
           person.contact_email,
           organization.display_name as organization_name
    from relationships.service_relationships as relationship
    join identity.people as person on person.id = relationship.person_id
    join organizations.organizations as organization on organization.id = relationship.organization_id
    where relationship.organization_id = p_organization_id
      and relationship.status = 'active'
    order by relationship.id
    for update of relationship
  loop
    perform relationships.close_relationship(subject.id, p_effective_at, 'professional', null);
    terminated := terminated + 1;

    if subject.contact_email is not null then
      perform system.enqueue_outbox_event(
        'service_relationship',
        subject.id,
        'relationship.terminated.v1',
        jsonb_build_object(
          'relationship_id', subject.id,
          'contact_email', subject.contact_email,
          'person_name', subject.display_name,
          'organization_name', subject.organization_name,
          'ended_at', p_effective_at,
          'reason', null
        )
      );
    end if;
  end loop;

  return terminated;
end
$function$;
alter function relationships.terminate_for_organization(uuid, timestamptz, uuid)
  owner to allfit_owner;
revoke all on function relationships.terminate_for_organization(uuid, timestamptz, uuid)
  from public, allfit_api;

-- ---------------------------------------------------------------------------
-- Identity — no invitation from a closed organization can be accepted
-- ---------------------------------------------------------------------------

create function identity.revoke_invitations_for_organization_closure(
  p_organization_id uuid, p_effective_at timestamptz, p_command_id uuid
)
returns integer
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  revoked integer;
begin
  if p_organization_id is null or p_effective_at is null or p_command_id is null then
    raise exception 'organization, effective instant and command required' using errcode = '22023';
  end if;

  update identity.invitation_intents as intent
  set status = 'revoked', decided_at = p_effective_at
  from identity.invitations as invitation
  where invitation.id = intent.invitation_id
    and invitation.organization_id = p_organization_id
    and invitation.status = 'pending'
    and intent.status = 'pending';

  update identity.invitations
  set status = 'revoked'
  where organization_id = p_organization_id and status = 'pending';
  get diagnostics revoked = row_count;
  return revoked;
end
$function$;
alter function identity.revoke_invitations_for_organization_closure(uuid, timestamptz, uuid)
  owner to allfit_owner;
revoke all on function identity.revoke_invitations_for_organization_closure(uuid, timestamptz, uuid)
  from public, allfit_api;

-- ---------------------------------------------------------------------------
-- Privacy — nothing this organization was granted is still live
-- ---------------------------------------------------------------------------

create function privacy.apply_organization_closure(
  p_organization_id uuid, p_effective_at timestamptz, p_command_id uuid
)
returns void
language plpgsql
stable
security definer
set search_path = pg_catalog
as $function$
begin
  if p_organization_id is null or p_effective_at is null or p_command_id is null then
    raise exception 'organization, effective instant and command required' using errcode = '22023';
  end if;
  perform grant_row.id
  from privacy.data_grants as grant_row
  where grant_row.organization_id = p_organization_id
    and grant_row.status = 'active'
  limit 1;
  if found then
    raise exception 'a grant of the closing organization is still active' using errcode = '55000';
  end if;
end
$function$;
alter function privacy.apply_organization_closure(uuid, timestamptz, uuid) owner to allfit_owner;
revoke all on function privacy.apply_organization_closure(uuid, timestamptz, uuid)
  from public, allfit_api;

-- ---------------------------------------------------------------------------
-- Nutrition — pending professional proposals are cancelled
-- ---------------------------------------------------------------------------

-- Wrapped in a sub-select so the scope is checked once per query, not once per row.
create policy goal_versions_select_organization_closure on nutrition.goal_versions
  for select to allfit_owner
  using (origin_organization_id::text = (select access_control.contract_scope('organization_closure')));
create policy goal_versions_update_organization_closure on nutrition.goal_versions
  for update to allfit_owner
  using (origin_organization_id::text = (select access_control.contract_scope('organization_closure')))
  with check (origin_organization_id::text = (select access_control.contract_scope('organization_closure')));

create function nutrition.cancel_proposals_for_organization_closure(
  p_organization_id uuid, p_effective_at timestamptz, p_command_id uuid
)
returns integer
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  cancelled integer;
begin
  if p_organization_id is null or p_effective_at is null or p_command_id is null then
    raise exception 'organization, effective instant and command required' using errcode = '22023';
  end if;

  perform access_control.open_contract_scope('organization_closure', p_organization_id);
  update nutrition.goal_versions
  set status = 'cancelled', cancelled_at = p_effective_at
  where origin = 'professional'
    and origin_organization_id = p_organization_id
    and status = 'proposed';
  get diagnostics cancelled = row_count;
  perform access_control.close_contract_scope();
  return cancelled;
end
$function$;
alter function nutrition.cancel_proposals_for_organization_closure(uuid, timestamptz, uuid)
  owner to allfit_owner;
revoke all on function nutrition.cancel_proposals_for_organization_closure(uuid, timestamptz, uuid)
  from public, allfit_api;

-- ---------------------------------------------------------------------------
-- OP-ORG-012 — the coordinator
-- ---------------------------------------------------------------------------

create function organizations.closure_receipt(p_organization_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog
as $function$
  select jsonb_build_object(
    'organization_id', event.organization_id,
    'closed_at', event.occurred_at,
    'relationships_terminated', (
      select count(*)::integer
      from relationships.service_relationships as relationship
      where relationship.organization_id = event.organization_id
        and relationship.ended_at = event.occurred_at
    )
  )
  from organizations.organization_events as event
  where event.organization_id = p_organization_id
    and event.event_type = 'organization.closed.v1'
$function$;
alter function organizations.closure_receipt(uuid) owner to allfit_owner;
revoke all on function organizations.closure_receipt(uuid) from public, allfit_api;

create function organizations.close_organization(
  p_person_id uuid, p_organization_id uuid,
  p_idempotency_key uuid, p_command_id uuid, p_request_hash bytea
)
returns table (result jsonb, replayed boolean)
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  receipt record;
  target organizations.organizations%rowtype;
  closed organizations.organizations%rowtype;
  actor_membership_id uuid;
  member record;
  effective_at timestamptz;
  terminated integer;
  response jsonb;
  member_snapshot jsonb;
begin
  -- Above the 750 ms an invitation waits for this row, so a racing acceptance gives way.
  perform set_config('lock_timeout', '3s', true);
  if access_control.actor_kind() is distinct from 'person'
     or access_control.person() is distinct from p_person_id or p_person_id is null then
    raise exception 'person actor mismatch' using errcode = '42501';
  end if;

  -- A former member still finds the organization once it is closed, so retries replay.
  select organization.* into target
  from organizations.organizations as organization
  where organization.id = p_organization_id
    and exists (
      select 1 from organizations.organization_memberships as membership
      where membership.organization_id = organization.id
        and membership.person_id = p_person_id
        and (membership.status = 'active' or organization.status = 'closed')
    )
  for update;
  if not found then
    raise exception 'organization not found' using errcode = 'P0002';
  end if;
  perform set_config('app.actor_org_id', p_organization_id::text, true);

  select * into receipt from system.begin_idempotency(
    p_person_id, 'OP-ORG-012', p_idempotency_key, p_command_id, p_request_hash
  );
  if not receipt.claimed then
    response := organizations.closure_receipt(p_organization_id);
    if response is null then
      raise exception 'idempotent organization closure not found' using errcode = '40001';
    end if;
    return query select response, true;
    return;
  end if;

  if target.status = 'closed' then
    response := organizations.closure_receipt(p_organization_id);
  else
    if not access_control.has_capability(p_organization_id, 'close_organization') then
      raise exception 'closing the organization requires close_organization' using errcode = '42501';
    end if;
    if target.status <> 'active' then
      raise exception 'only an active organization can be closed' using errcode = '22023';
    end if;

    select membership.id into actor_membership_id
    from organizations.organization_memberships as membership
    where membership.organization_id = p_organization_id
      and membership.person_id = p_person_id and membership.status = 'active';

    -- Read once: every row this closure touches carries the same instant.
    effective_at := clock_timestamp();

    perform payments.check_organization_closure(p_organization_id);
    terminated := relationships.terminate_for_organization(p_organization_id, effective_at, p_command_id);
    perform identity.revoke_invitations_for_organization_closure(
      p_organization_id, effective_at, p_command_id
    );
    perform privacy.apply_organization_closure(p_organization_id, effective_at, p_command_id);
    perform nutrition.cancel_proposals_for_organization_closure(
      p_organization_id, effective_at, p_command_id
    );

    for member in
      select membership.id, membership.person_id
      from organizations.organization_memberships as membership
      where membership.organization_id = p_organization_id and membership.status = 'active'
      order by membership.id
      for update
    loop
      member_snapshot := jsonb_build_object(
        'organization_id', p_organization_id, 'person_id', member.person_id, 'status', 'active'
      );
      update organizations.membership_roles set valid_to = effective_at
      where membership_id = member.id and valid_to is null;
      update organizations.organization_memberships
      set status = 'terminated', ended_at = effective_at
      where id = member.id;
      insert into organizations.membership_events (membership_id, event_type, "before", "after")
      values (member.id, 'organization.membership_terminated.v1', member_snapshot,
        member_snapshot || jsonb_build_object('status', 'terminated'));
    end loop;

    update organizations.organizations
    set status = 'closed', revision_number = revision_number + 1
    where id = p_organization_id
    returning * into closed;

    insert into organizations.organization_events (
      organization_id, event_type, before_snapshot, after_snapshot, actor_membership_id,
      occurred_at
    ) values (
      p_organization_id,
      'organization.closed.v1',
      jsonb_build_object(
        'type_code', target.type_code, 'legal_name', target.legal_name,
        'display_name', target.display_name, 'status', target.status,
        'revision_number', target.revision_number
      ),
      jsonb_build_object(
        'type_code', closed.type_code, 'legal_name', closed.legal_name,
        'display_name', closed.display_name, 'status', closed.status,
        'revision_number', closed.revision_number
      ),
      actor_membership_id,
      effective_at
    );

    response := jsonb_build_object(
      'organization_id', p_organization_id,
      'closed_at', effective_at,
      'relationships_terminated', terminated
    );
  end if;

  perform system.finish_idempotency(receipt.receipt_id, 200::smallint,
    'organization-closed', 'organization', p_organization_id);
  return query select response, false;
end
$function$;
alter function organizations.close_organization(uuid, uuid, uuid, uuid, bytea)
  owner to allfit_owner;
revoke all on function organizations.close_organization(uuid, uuid, uuid, uuid, bytea)
  from public;
grant execute on function organizations.close_organization(uuid, uuid, uuid, uuid, bytea)
  to allfit_api;
