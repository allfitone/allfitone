-- OP-PRV-015 — a person reads who read her data (HU-STUDIO-083 c3, STUDIO-76).
--
-- Every authorized read writes an access event before it answers. Until now only the
-- Backoffice auditors could read them; this is the person's own view of hers.
--
-- It names the real person who read, not only the organization, as the operations
-- matrix asks, and says whether a coach read her as holder or as cover. The Allfit One
-- team's break-glass and support accesses are listed too, by name. Refused attempts
-- are listed as refused. Twenty-four months, newest first, ties broken by id. Her own
-- reads are not listed: she knows she read her data.
--
-- The organization comes from the reader's membership, or else from the relationship:
-- `subject_organization_id` is always null when the subject is a person.
--
-- A closed definer function rather than the view and self policy the data dictionary
-- names: the base table stays unreadable by the API role, as every other projection.
-- It reuses `idx_access_events_target_occurred` (subject, occurred_at desc, id); an
-- index built now on the partitioned table would block the audit writes that reads need.

set lock_timeout = '5s';
set statement_timeout = '60s';

create function privacy.list_my_access_events(
  p_person_id uuid,
  p_scope_code text,
  p_limit integer,
  p_before_occurred_at timestamptz,
  p_before_id uuid
)
returns table (
  id uuid,
  occurred_at timestamptz,
  actor_kind text,
  actor_display_name text,
  organization_id uuid,
  organization_display_name text,
  attendance text,
  access_mode text,
  scope_code text,
  scope_version integer,
  resource text,
  result text
)
language plpgsql
stable
security definer
set search_path = pg_catalog
as $function$
declare
  -- A constant for the statement, so partitions older than the horizon are pruned.
  horizon timestamptz := now() - interval '24 months';
begin
  if access_control.actor_kind() <> 'person'
     or access_control.person() is distinct from p_person_id then
    raise exception 'person actor mismatch' using errcode = '42501';
  end if;

  if p_limit is null or p_limit not between 1 and 101 then
    raise exception 'invalid page limit' using errcode = '22023';
  end if;

  if (p_before_occurred_at is null) <> (p_before_id is null) then
    raise exception 'invalid access log cursor' using errcode = '22023';
  end if;

  if p_scope_code is not null and p_scope_code <> all (array[
       'relationship_training', 'prior_training_history', 'body_progress', 'health_context',
       'nutrition_intake', 'nutrition_guidance', 'nutrition_media']) then
    raise exception 'unknown scope' using errcode = '22023';
  end if;

  return query
  select
    event.id,
    event.occurred_at,
    case when event.access_mode in ('break_glass', 'support_metadata')
         then 'allfit_team' else 'professional' end,
    reader.display_name,
    organization.id,
    organization.display_name,
    (
      select case assignment.kind when 'holder' then 'holder' else 'substitute' end
      from relationships.relationship_professional_assignments as assignment
      where assignment.relationship_id = event.relationship_id
        and assignment.membership_id = event.actor_membership_id
        and assignment.status in ('active', 'ended')
        and (assignment.kind = 'holder' or assignment.accepted_by_person_at is not null)
        and assignment.valid_from <= event.occurred_at
        and (assignment.valid_to is null or assignment.valid_to > event.occurred_at)
      order by (assignment.kind = 'holder') desc
      limit 1
    ),
    event.access_mode::text,
    event.scope_code,
    event.scope_version,
    event.resource,
    event.result
  from privacy.access_events as event
  join identity.people as reader on reader.id = event.actor_person_id
  left join organizations.organization_memberships as membership
    on membership.id = event.actor_membership_id
  left join relationships.service_relationships as link
    on link.id = event.relationship_id
  left join organizations.organizations as organization
    on organization.id = coalesce(membership.organization_id, link.organization_id)
  where event.subject_person_id = p_person_id
    and event.actor_person_id <> p_person_id
    and event.occurred_at >= horizon
    and (p_scope_code is null or event.scope_code = p_scope_code)
    and (p_before_occurred_at is null
         or (event.occurred_at, event.id) < (p_before_occurred_at, p_before_id))
  order by event.occurred_at desc, event.id desc
  limit p_limit;
end
$function$;

alter function privacy.list_my_access_events(uuid, text, integer, timestamptz, uuid)
  owner to allfit_owner;
revoke all on function privacy.list_my_access_events(uuid, text, integer, timestamptz, uuid)
  from public;
grant execute on function privacy.list_my_access_events(uuid, text, integer, timestamptz, uuid)
  to allfit_api;
