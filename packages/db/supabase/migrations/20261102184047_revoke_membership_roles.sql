-- OP-ORG-008 closes one role period and its professional authority atomically.
set lock_timeout = '5s';
set statement_timeout = '30s';

create function relationships.require_assignment_coach_tg()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $function$
begin
  if new.status not in ('active', 'proposed') then
    return new;
  end if;

  -- Serialize new authority with the coordinator before reading the role.
  perform membership.id
  from organizations.organization_memberships as membership
  where membership.id = new.membership_id
    and membership.organization_id = new.organization_id
    and membership.status = 'active'
  for share nowait;
  if not found then
    raise exception 'assignment requires an active membership' using errcode = '42501';
  end if;
  perform role.id
  from organizations.membership_roles as role
  where role.membership_id = new.membership_id
    and role.role_code = 'coach'
    and role.valid_from <= clock_timestamp()
    and role.valid_to is null
  for share nowait;
  if not found then
    raise exception 'assignment requires a current coach role' using errcode = '42501';
  end if;
  return new;
end
$function$;
alter function relationships.require_assignment_coach_tg() owner to allfit_owner;
revoke all on function relationships.require_assignment_coach_tg() from public, allfit_api;
create trigger trg_relationship_professional_assignments_before_write_require_coach
before insert or update of status, membership_id, organization_id
on relationships.relationship_professional_assignments
for each row execute function relationships.require_assignment_coach_tg();

create function relationships.end_assignments_for_membership(
  p_organization_id uuid, p_membership_id uuid, p_effective_at timestamptz, p_command_id uuid
)
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $function$
begin
  if p_effective_at is null or p_command_id is null then
    raise exception 'effective instant and command required' using errcode = '22023';
  end if;
  perform membership.id
  from organizations.organization_memberships as membership
  where membership.id = p_membership_id and membership.organization_id = p_organization_id
  for update;
  if not found then
    raise exception 'target membership not found' using errcode = 'P0002';
  end if;
  update relationships.relationship_professional_assignments
  set status = 'ended', valid_to = greatest(p_effective_at, valid_from)
  where organization_id = p_organization_id and membership_id = p_membership_id
    and status = 'active';
end
$function$;
alter function relationships.end_assignments_for_membership(uuid, uuid, timestamptz, uuid)
  owner to allfit_owner;
revoke all on function relationships.end_assignments_for_membership(uuid, uuid, timestamptz, uuid)
  from public, allfit_api;

create function organizations.revoke_membership_role(
  p_person_id uuid, p_organization_id uuid, p_membership_id uuid, p_role_code text,
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
  target_role organizations.membership_roles%rowtype;
  response jsonb;
  effective_at timestamptz;
  before_snapshot jsonb;
begin
  perform set_config('lock_timeout', '750ms', true);
  if access_control.actor_kind() is distinct from 'person'
     or access_control.person() is distinct from p_person_id or p_person_id is null then
    raise exception 'person actor mismatch' using errcode = '42501';
  end if;
  if p_role_code is null or p_role_code not in ('admin', 'coach', 'staff') then
    raise exception 'role is not revocable' using errcode = '22023';
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
    p_person_id, 'OP-ORG-008', p_idempotency_key, p_command_id, p_request_hash
  );
  if not receipt.claimed then
    select jsonb_build_object('membership_id', membership.id,
      'role_code', role.role_code, 'valid_to', role.valid_to)
    into response
    from system.idempotency_keys as idempotency
    join organizations.membership_roles as role on role.id = idempotency.aggregate_id
    join organizations.organization_memberships as membership on membership.id = role.membership_id
    where idempotency.id = receipt.receipt_id and idempotency.aggregate_type = 'membership_role'
      and membership.organization_id = p_organization_id and membership.id = p_membership_id
      and role.role_code = p_role_code and role.valid_to is not null;
    if response is null then
      raise exception 'idempotent role revocation not found' using errcode = '40001';
    end if;
    return query select response, true;
    return;
  end if;
  if not access_control.has_capability(p_organization_id, 'manage_roles') then
    raise exception 'role management capability required' using errcode = '42501';
  end if;

  select membership.* into target from organizations.organization_memberships as membership
  where membership.id = p_membership_id and membership.organization_id = p_organization_id
  for update;
  if not found then
    raise exception 'target membership not found' using errcode = 'P0002';
  end if;
  if target.status <> 'active' then
    raise exception 'target membership is inactive' using errcode = '22023';
  end if;
  select role.* into target_role from organizations.membership_roles as role
  where role.membership_id = p_membership_id and role.role_code = p_role_code
  order by (role.valid_to is null) desc, role.valid_from desc, role.id desc
  limit 1 for update;
  if not found then
    raise exception 'membership role not found' using errcode = 'P0002';
  end if;

  if target_role.valid_to is null then
    effective_at := clock_timestamp();
    before_snapshot := jsonb_build_object(
      'organization_id', target.organization_id, 'person_id', target.person_id,
      'status', target.status, 'role_code', p_role_code,
      'valid_from', target_role.valid_from, 'valid_to', null
    );
    update organizations.membership_roles set valid_to = effective_at where id = target_role.id;
    if p_role_code = 'coach' then
      perform relationships.end_assignments_for_membership(
        p_organization_id, p_membership_id, effective_at, p_command_id
      );
    end if;
    insert into organizations.membership_events (membership_id, event_type, "before", "after")
    values (p_membership_id, 'organization.role_revoked.v1', before_snapshot,
      before_snapshot || jsonb_build_object('valid_to', effective_at));
    target_role.valid_to := effective_at;
  end if;
  response := jsonb_build_object('membership_id', p_membership_id,
    'role_code', p_role_code, 'valid_to', target_role.valid_to);
  perform system.finish_idempotency(receipt.receipt_id, 200::smallint,
    'organization-role-revoked', 'membership_role', target_role.id);
  return query select response, false;
end
$function$;
alter function organizations.revoke_membership_role(uuid, uuid, uuid, text, uuid, uuid, bytea)
  owner to allfit_owner;
revoke all on function organizations.revoke_membership_role(uuid, uuid, uuid, text, uuid, uuid, bytea)
  from public;
grant execute on function organizations.revoke_membership_role(uuid, uuid, uuid, text, uuid, uuid, bytea)
  to allfit_api;
