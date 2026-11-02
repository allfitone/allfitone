-- OP-ORG-010 lets a non-owner leave an organization and tells its administration.
set lock_timeout = '5s';
set statement_timeout = '30s';

-- The resigned event carries the same closed membership shape as membership_terminated.
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
      'organization.membership_terminated.v1',
      'organization.membership_resigned.v1'
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
      'organization.membership_terminated.v1',
      'organization.membership_resigned.v1'
    ) and before is not null and after is not null)
  );

/*
 * The membership is resolved from the actor, never from the request, so nobody can
 * resign for somebody else. The organization row is locked first, as OP-ORG-009 does,
 * so a resignation and a termination of the same member serialize.
 *
 * The administration is told through one outbox row per current owner or
 * administrator with a contact on file, inside this transaction: a resignation that
 * cannot be announced does not commit. Recipients without a contact are skipped
 * rather than keeping a person inside an organization they asked to leave; the
 * membership event stays the durable record either way.
 */
create function organizations.resign_membership(
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
  target organizations.organization_memberships%rowtype;
  response jsonb;
  effective_at timestamptz;
  before_snapshot jsonb;
  notice record;
begin
  perform set_config('lock_timeout', '750ms', true);
  if access_control.actor_kind() is distinct from 'person'
     or access_control.person() is distinct from p_person_id or p_person_id is null then
    raise exception 'person actor mismatch' using errcode = '42501';
  end if;

  -- A former member still reaches the tenant here, so a retry after leaving replays.
  perform organization.id
  from organizations.organizations as organization
  where organization.id = p_organization_id and organization.status = 'active'
    and exists (
      select 1 from organizations.organization_memberships as membership
      where membership.organization_id = organization.id
        and membership.person_id = p_person_id
    )
  for update;
  if not found then
    raise exception 'organization not found' using errcode = 'P0002';
  end if;
  -- Relationships FORCE RLS evaluates the tenant context even for the owner.
  perform set_config('app.actor_org_id', p_organization_id::text, true);

  select * into receipt from system.begin_idempotency(
    p_person_id, 'OP-ORG-010', p_idempotency_key, p_command_id, p_request_hash
  );
  if not receipt.claimed then
    select jsonb_build_object('membership_id', membership.id, 'ended_at', membership.ended_at)
    into response
    from system.idempotency_keys as idempotency
    join organizations.organization_memberships as membership
      on membership.id = idempotency.aggregate_id
    where idempotency.id = receipt.receipt_id
      and idempotency.aggregate_type = 'organization_membership'
      and membership.organization_id = p_organization_id
      and membership.person_id = p_person_id
      and membership.status = 'terminated';
    if response is null then
      raise exception 'idempotent membership resignation not found' using errcode = '40001';
    end if;
    return query select response, true;
    return;
  end if;

  select membership.* into target from organizations.organization_memberships as membership
  where membership.organization_id = p_organization_id and membership.person_id = p_person_id
    and membership.status = 'active'
  for update;

  if not found then
    -- Converges only on a resignation; a membership an administrator ended was not one.
    select membership.* into target
    from organizations.organization_memberships as membership
    where membership.organization_id = p_organization_id
      and membership.person_id = p_person_id
      and exists (
        select 1 from organizations.membership_events as event
        where event.membership_id = membership.id
          and event.event_type = 'organization.membership_resigned.v1'
      )
    order by membership.ended_at desc
    limit 1;
    if not found then
      raise exception 'no active membership to resign' using errcode = 'P0002';
    end if;
  else
    -- Ownership leaves only through OP-ORG-011; resigning it would orphan the tenant.
    perform role.id from organizations.membership_roles as role
    where role.membership_id = target.id and role.role_code = 'owner'
      and role.valid_to is null;
    if found then
      raise exception 'owner membership cannot be resigned' using errcode = '22023';
    end if;

    effective_at := clock_timestamp();
    before_snapshot := jsonb_build_object(
      'organization_id', target.organization_id, 'person_id', target.person_id,
      'status', target.status
    );
    update organizations.membership_roles set valid_to = effective_at
    where membership_id = target.id and valid_to is null;
    perform relationships.end_assignments_for_membership(
      p_organization_id, target.id, effective_at, p_command_id
    );
    update organizations.organization_memberships
    set status = 'terminated', ended_at = effective_at
    where id = target.id;
    insert into organizations.membership_events (membership_id, event_type, "before", "after")
    values (target.id, 'organization.membership_resigned.v1', before_snapshot,
      before_snapshot || jsonb_build_object('status', 'terminated'));

    for notice in
      select distinct on (recipient.id)
             recipient.id as recipient_person_id,
             recipient.contact_email,
             organization.display_name as organization_name,
             member.display_name as member_name
      from organizations.organization_memberships as membership
      join organizations.membership_roles as role
        on role.membership_id = membership.id and role.valid_to is null
       and role.role_code in ('owner', 'admin')
      join identity.people as recipient on recipient.id = membership.person_id
      join organizations.organizations as organization on organization.id = p_organization_id
      join identity.people as member on member.id = p_person_id
      where membership.organization_id = p_organization_id and membership.status = 'active'
        and recipient.contact_email is not null
      order by recipient.id
    loop
      perform system.enqueue_outbox_event(
        'organization_membership',
        target.id,
        'organization.membership_resigned.v1',
        jsonb_build_object(
          'organization_id', p_organization_id,
          'membership_id', target.id,
          'person_id', p_person_id,
          'recipient_person_id', notice.recipient_person_id,
          'contact', notice.contact_email,
          'organization_name', notice.organization_name,
          'member_name', notice.member_name,
          'ended_at', effective_at
        )
      );
    end loop;
    target.ended_at := effective_at;
  end if;

  response := jsonb_build_object('membership_id', target.id, 'ended_at', target.ended_at);
  perform system.finish_idempotency(receipt.receipt_id, 200::smallint,
    'organization-membership-resigned', 'organization_membership', target.id);
  return query select response, false;
end
$function$;
alter function organizations.resign_membership(uuid, uuid, uuid, uuid, bytea)
  owner to allfit_owner;
revoke all on function organizations.resign_membership(uuid, uuid, uuid, uuid, bytea)
  from public;
grant execute on function organizations.resign_membership(uuid, uuid, uuid, uuid, bytea)
  to allfit_api;
