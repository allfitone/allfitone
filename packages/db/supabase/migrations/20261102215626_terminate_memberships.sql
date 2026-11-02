-- OP-ORG-009 ends a membership, its roles and its professional authority atomically.
set lock_timeout = '5s';
set statement_timeout = '30s';

-- The terminated event carries the same closed membership shape as membership_created.
create or replace function organizations.validate_membership_event_snapshot(
  p_event_type text,
  p_schema_version smallint,
  p_payload jsonb
)
returns boolean
language sql
immutable
strict
security invoker
set search_path = pg_catalog
as $function$
  select system.validate_json_contract(
    'audit.membership_event_snapshot',
    p_schema_version,
    p_payload
  ) and case
    when p_event_type in (
      'organization.membership_created.v1',
      'organization.membership_terminated.v1'
    ) then
      system.jsonb_has_exact_keys(
        p_payload,
        array['organization_id', 'person_id', 'status']
      )
    when p_event_type in (
      'organization.role_assigned.v1',
      'organization.role_granted.v1',
      'organization.role_revoked.v1'
    ) then
      system.jsonb_has_exact_keys(
        p_payload,
        array[
          'organization_id', 'person_id', 'status',
          'role_code', 'valid_from', 'valid_to'
        ]
      )
    else false
  end
$function$;

alter table organizations.membership_events
  drop constraint ck_membership_events_snapshot_pair,
  add constraint ck_membership_events_snapshot_pair check (
    (event_type in (
      'organization.membership_created.v1',
      'organization.role_assigned.v1',
      'organization.role_granted.v1'
    ) and before is null and after is not null)
    or (event_type in (
      'organization.role_revoked.v1',
      'organization.membership_terminated.v1'
    ) and before is not null and after is not null)
  );

create function organizations.terminate_membership(
  p_person_id uuid, p_organization_id uuid, p_membership_id uuid,
  p_idempotency_key uuid, p_command_id uuid, p_request_hash bytea
)
returns table (result jsonb, replayed boolean)
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  receipt record;
  actor_membership_id uuid;
  target organizations.organization_memberships%rowtype;
  response jsonb;
  effective_at timestamptz;
  before_snapshot jsonb;
begin
  perform set_config('lock_timeout', '750ms', true);
  if access_control.actor_kind() is distinct from 'person'
     or access_control.person() is distinct from p_person_id or p_person_id is null then
    raise exception 'person actor mismatch' using errcode = '42501';
  end if;

  select membership.id into actor_membership_id
  from organizations.organization_memberships as membership
  join organizations.organizations as organization on organization.id = membership.organization_id
  where organization.id = p_organization_id and organization.status = 'active'
    and membership.person_id = p_person_id and membership.status = 'active'
  for update of organization;
  if actor_membership_id is null then
    raise exception 'organization not found' using errcode = 'P0002';
  end if;
  -- Relationships FORCE RLS evaluates the tenant context even for the owner.
  perform set_config('app.actor_org_id', p_organization_id::text, true);

  select * into receipt from system.begin_idempotency(
    p_person_id, 'OP-ORG-009', p_idempotency_key, p_command_id, p_request_hash
  );
  if not receipt.claimed then
    select jsonb_build_object('membership_id', membership.id, 'ended_at', membership.ended_at)
    into response
    from system.idempotency_keys as idempotency
    join organizations.organization_memberships as membership
      on membership.id = idempotency.aggregate_id
    where idempotency.id = receipt.receipt_id
      and idempotency.aggregate_type = 'organization_membership'
      and membership.organization_id = p_organization_id and membership.id = p_membership_id
      and membership.status = 'terminated';
    if response is null then
      raise exception 'idempotent membership termination not found' using errcode = '40001';
    end if;
    return query select response, true;
    return;
  end if;
  if not access_control.has_capability(p_organization_id, 'manage_memberships') then
    raise exception 'membership management capability required' using errcode = '42501';
  end if;

  select membership.* into target from organizations.organization_memberships as membership
  where membership.id = p_membership_id and membership.organization_id = p_organization_id
  for update;
  if not found then
    raise exception 'target membership not found' using errcode = 'P0002';
  end if;

  if target.status = 'active' then
    -- Leaving is OP-ORG-010, so a departure is always recorded as a resignation.
    if target.person_id = p_person_id then
      raise exception 'own membership is left by resignation' using errcode = '22023';
    end if;
    -- Ownership leaves only through OP-ORG-011; terminating it would orphan the tenant.
    perform role.id from organizations.membership_roles as role
    where role.membership_id = p_membership_id and role.role_code = 'owner'
      and role.valid_to is null;
    if found then
      raise exception 'owner membership cannot be terminated' using errcode = '22023';
    end if;

    effective_at := clock_timestamp();
    before_snapshot := jsonb_build_object(
      'organization_id', target.organization_id, 'person_id', target.person_id,
      'status', target.status
    );
    update organizations.membership_roles set valid_to = effective_at
    where membership_id = p_membership_id and valid_to is null;
    perform relationships.end_assignments_for_membership(
      p_organization_id, p_membership_id, effective_at, p_command_id
    );
    update organizations.organization_memberships
    set status = 'terminated', ended_at = effective_at
    where id = p_membership_id;
    insert into organizations.membership_events (membership_id, event_type, "before", "after")
    values (p_membership_id, 'organization.membership_terminated.v1', before_snapshot,
      before_snapshot || jsonb_build_object('status', 'terminated'));
    target.ended_at := effective_at;
  end if;

  response := jsonb_build_object('membership_id', p_membership_id, 'ended_at', target.ended_at);
  perform system.finish_idempotency(receipt.receipt_id, 200::smallint,
    'organization-membership-terminated', 'organization_membership', p_membership_id);
  return query select response, false;
end
$function$;
alter function organizations.terminate_membership(uuid, uuid, uuid, uuid, uuid, bytea)
  owner to allfit_owner;
revoke all on function organizations.terminate_membership(uuid, uuid, uuid, uuid, uuid, bytea)
  from public;
grant execute on function organizations.terminate_membership(uuid, uuid, uuid, uuid, uuid, bytea)
  to allfit_api;
