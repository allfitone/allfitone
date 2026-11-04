-- HU-STUDIO-087 — Studio reads how full the gym is before anyone invites.
--
-- `20261103003415_enforce_guest_quota.sql` refuses the invitation that would take a
-- place the gym does not have. That refusal is the last line, not the interface: a
-- coach who learns the gym is full only after typing a contact and pressing send has
-- been told too late. The client directory (`OP-REL-010`) answers the figure in the
-- same transaction as the page, so the screen can say how many places are left and
-- disable the invitation form with the reason before anybody tries.
--
-- **The figure is the one the refusal uses.** It comes from
-- `organizations.organization_guest_occupancy`, whose counting token already makes the
-- count independent of who asks. A coach lists only the clients assigned to them and
-- is still held to the whole gym's quota, so the coach is shown the whole gym's
-- figure, never the length of the list they can read.
--
-- **`last_change` is left out on purpose.** The Backoffice projection carries which
-- Allfit staff member set the quota, and a gym must not learn that person's name.
-- This read has no such column at all.

set lock_timeout = '5s';
set statement_timeout = '60s';

-- Anybody who may invite or look at the directory may see how full the gym is: a coach
-- is refused at a full gym and has to be able to be told why before trying.
create function organizations.studio_guest_quota(p_organization_id uuid)
returns table (seats integer, occupied integer, places_left integer, over_quota boolean)
language plpgsql
stable
security definer
set search_path = pg_catalog
as $function$
begin
  if access_control.actor_kind() is distinct from 'person'
     or access_control.person() is null then
    raise exception 'a person actor is required' using errcode = '42501';
  end if;

  if not (
    access_control.has_capability(p_organization_id, 'view_directory')
    or access_control.has_capability(p_organization_id, 'view_assigned_directory')
    or access_control.has_capability(p_organization_id, 'invite_clients')
  ) then
    raise exception 'guest quota requires a directory or invitation capability'
      using errcode = '42501';
  end if;

  return query
  select
    organization.guest_quota_seats,
    live.occupied,
    case
      when organization.guest_quota_seats is null then null
      else greatest(organization.guest_quota_seats - live.occupied, 0)
    end,
    organization.guest_quota_seats is not null
      and live.occupied > organization.guest_quota_seats
  from organizations.organizations as organization
  cross join lateral organizations.organization_guest_occupancy(organization.id) as live
  where organization.id = p_organization_id;

  if not found then
    raise exception 'organization not found' using errcode = 'P0002';
  end if;
end
$function$;

alter function organizations.studio_guest_quota(uuid) owner to allfit_owner;
revoke all on function organizations.studio_guest_quota(uuid) from public;
grant execute on function organizations.studio_guest_quota(uuid) to allfit_api;
