-- HU-BO-012, HU-BO-016 — the directory finds a suspended gym by its state.
--
-- `20261018130000_suspending_a_gym_without_destroying_it.sql` added `suspended` to the
-- organization lifecycle, and the Backoffice directory offers «Suspendido» as a filter.
-- The directory never learned the state: `list_backoffice_organizations` still checked
-- the filter against the four states it was written with and refused `suspended` as
-- unknown (`22023`). Every stopped gym was missing from the one list meant to find it,
-- and the screen read the refusal as a failed search.
--
-- The body is `20261002100000`'s with `suspended` in that list; nothing else changed.

set lock_timeout = '5s';
set statement_timeout = '60s';

CREATE OR REPLACE FUNCTION organizations.list_backoffice_organizations(p_actor_person_id uuid, p_actor_session_id uuid, p_query text, p_status text, p_limit integer, p_after_name text, p_after_id uuid)
 RETURNS TABLE(organization_id uuid, display_name text, type_code text, type_name text, status text, created_at timestamp with time zone, claimed_at timestamp with time zone, cancelled_at timestamp with time zone, active_member_count integer, site_count integer, people_served integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
#variable_conflict use_column
declare
  needle text;
begin
  perform organizations.require_organization_directory_reader(p_actor_person_id, p_actor_session_id);

  if p_query is not null then
    needle := lower(btrim(p_query));
    -- Two characters at least, so a search is a question rather than a way to page
    -- through everything under another name.
    if char_length(needle) < 2 then
      raise exception 'an organization search needs at least two characters' using errcode = '22023';
    end if;
    -- `%` and `_` in a name are characters to find, not a pattern to expand.
    needle := replace(replace(replace(needle, '\', '\\'), '%', '\%'), '_', '\_');
  end if;

  if p_status is not null
    and p_status not in ('unclaimed', 'active', 'suspended', 'closed', 'cancelled') then
    raise exception 'unknown organization lifecycle state' using errcode = '22023';
  end if;

  if (p_after_name is null) <> (p_after_id is null) then
    raise exception 'a page cursor names both the last name and the last identifier'
      using errcode = '22023';
  end if;

  return query
  select
    organization.id,
    organization.display_name,
    organization.type_code,
    organization_type.name,
    organization.status::text,
    organization.created_at,
    organization.claimed_at,
    organization.cancelled_at,
    (
      select count(*)::integer
      from organizations.organization_memberships as membership
      where membership.organization_id = organization.id
        and membership.status = 'active'
    ),
    (
      select count(*)::integer
      from organizations.organization_sites as site
      where site.organization_id = organization.id
        and site.status = 'active'
    ),
    (
      select count(*)::integer
      from relationships.service_relationships as relationship
      where relationship.organization_id = organization.id
        and relationship.status = 'active'
    )
  from organizations.organizations as organization
  join organizations.organization_types as organization_type
    on organization_type.code = organization.type_code
  where (needle is null or lower(organization.display_name) like '%' || needle || '%' escape '\')
    and (p_status is null or organization.status::text = p_status)
    and (
      p_after_name is null
      or (lower(organization.display_name), organization.id) > (lower(p_after_name), p_after_id)
    )
  order by lower(organization.display_name), organization.id
  -- One more than the largest page the API serves, so it can tell whether another
  -- page exists without a second query.
  limit least(greatest(coalesce(p_limit, 50), 1), 101);
end
$function$;

alter function organizations.list_backoffice_organizations(uuid, uuid, text, text, integer, text, uuid)
  owner to allfit_owner;
revoke all on function organizations.list_backoffice_organizations(uuid, uuid, text, text, integer, text, uuid)
  from public;
grant execute on function organizations.list_backoffice_organizations(uuid, uuid, text, text, integer, text, uuid)
  to allfit_api;
