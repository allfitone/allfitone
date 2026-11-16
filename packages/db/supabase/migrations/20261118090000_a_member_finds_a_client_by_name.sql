-- OP-REL-010 — a member finds a client by name (HU-STUDIO-082, STUDIO-75).
--
-- The directory gains an optional name search. It narrows the directory the
-- member already reads and never widens it: who comes back is still the row
-- policy's decision, so a coach finds only the people assigned to them.
--
-- What it matches:
--   · names only. An unanswered invitation has no name, just a masked contact,
--     so a search never returns one, and asking for `invited` with a search is
--     refused rather than answered with an empty page that would mislead;
--   · without accents or case. `unaccent` is not installed, so folding is an
--     explicit `translate`, as `execution.fold_text` already does;
--   · `%` and `_` as characters, escaped as `support.search_people` does.
--
-- It writes no access event: a match carries identity and the state of the
-- link, never fitness data.
--
-- The seven-argument signature stays, as a wrapper, because the API ships
-- before this migration is applied and must keep listing the directory.

set lock_timeout = '5s';
set statement_timeout = '60s';

-- Folds a name for matching: spaces collapsed, Latin accents removed, lower case.
create function relationships.fold_name(p_text text)
returns text
language sql
immutable
parallel safe
set search_path = pg_catalog
as $function$
  select lower(translate(
    regexp_replace(btrim(coalesce(p_text, '')), '\s+', ' ', 'g'),
    'ÁÀÂÄÃÉÈÊËÍÌÎÏÓÒÔÖÕÚÙÛÜÑÇáàâäãéèêëíìîïóòôöõúùûüñç',
    'AAAAAEEEEIIIIOOOOOUUUUNCaaaaaeeeeiiiiooooouuuunc'
  ))
$function$;

alter function relationships.fold_name(text) owner to allfit_owner;
revoke all on function relationships.fold_name(text) from public, allfit_api;

create function relationships.list_organization_clients(
  p_person_id uuid,
  p_organization_id uuid,
  p_status text,
  p_limit integer,
  p_cursor_group text,
  p_cursor_name text,
  p_cursor_id uuid,
  p_query text
)
returns table (
  entry_kind text,
  relationship_id uuid,
  invitation_id uuid,
  person_id uuid,
  display_name text,
  contact_hint text,
  relationship_status text,
  invitation_status text,
  started_at timestamptz,
  ended_at timestamptz,
  sort_group text,
  sort_name text,
  sort_id uuid
)
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  sees_every_client boolean;
  actor_membership_id uuid;
  search text := nullif(btrim(regexp_replace(p_query, '\s+', ' ', 'g')), '');
  pattern text;
begin
  if access_control.actor_kind() <> 'person'
     or access_control.person() is distinct from p_person_id then
    raise exception 'person actor mismatch' using errcode = '42501';
  end if;

  if p_status is not null and p_status not in ('active', 'terminated', 'invited') then
    raise exception 'invalid directory status' using errcode = '22023';
  end if;

  if p_query is not null and (search is null or char_length(search) not between 2 and 80) then
    raise exception 'invalid directory search' using errcode = '22023';
  end if;

  if search is not null and p_status = 'invited' then
    raise exception 'a name search does not match invitations' using errcode = '22023';
  end if;

  if p_limit not between 1 and 101 then
    raise exception 'invalid page limit' using errcode = '22023';
  end if;

  if (p_cursor_group is null) <> (p_cursor_name is null)
     or (p_cursor_group is null) <> (p_cursor_id is null)
     or (p_cursor_group is not null
         and p_cursor_group not in ('active', 'invited', 'terminated')) then
    raise exception 'invalid directory cursor' using errcode = '22023';
  end if;

  if search is not null then
    pattern := '%' || replace(replace(replace(
      relationships.fold_name(search), '\', '\\'), '%', '\%'), '_', '\_') || '%';
  end if;

  select membership.id into actor_membership_id
  from organizations.organizations as organization
  join organizations.organization_memberships as membership
    on membership.organization_id = organization.id
   and membership.person_id = p_person_id
   and membership.status = 'active'
  where organization.id = p_organization_id
    and organization.status = 'active';

  if actor_membership_id is null
     or not (
       access_control.has_capability(p_organization_id, 'view_directory')
       or access_control.has_capability(p_organization_id, 'view_assigned_directory')
     ) then
    raise exception 'client directory requires a directory capability'
      using errcode = '42501';
  end if;

  sees_every_client := access_control.has_capability(p_organization_id, 'view_directory');

  -- The row policy resolves the organization through `access_control.org()`;
  -- without this setting a coach would silently see an empty directory.
  perform set_config('app.actor_org_id', p_organization_id::text, true);

  return query
  with entries as (
    select
      'relationship'::text as entry_kind,
      relationship.id as relationship_id,
      null::uuid as invitation_id,
      relationship.person_id,
      person.display_name,
      null::text as contact_hint,
      relationship.status::text as relationship_status,
      'accepted'::text as invitation_status,
      relationship.started_at,
      relationship.ended_at,
      relationship.status::text as sort_group,
      lower(person.display_name) collate "C" as sort_name,
      relationship.id as sort_id
    from relationships.service_relationships as relationship
    join identity.people as person on person.id = relationship.person_id
    where relationship.organization_id = p_organization_id
      and (pattern is null or relationships.fold_name(person.display_name) like pattern escape '\')

    union all

    -- An unanswered invitation has no name, so a search never returns one.
    select
      'invitation'::text,
      null::uuid,
      invitation.id,
      null::uuid,
      null::text,
      left(invitation.contact::text, 1) || '***'
        || substring(invitation.contact::text from position('@' in invitation.contact::text)),
      null::text,
      intent.status::text,
      invitation.created_at,
      null::timestamptz,
      'invited'::text,
      lower(invitation.contact::text) collate "C",
      invitation.id
    from identity.invitations as invitation
    join identity.invitation_intents as intent
      on intent.invitation_id = invitation.id
     and intent.kind = 'service_relationship'
     and intent.status = 'pending'
    where invitation.organization_id = p_organization_id
      and invitation.status = 'pending'
      and pattern is null
      and (sees_every_client or invitation.issued_by_membership_id = actor_membership_id)
  )
  select
    entries.entry_kind,
    entries.relationship_id,
    entries.invitation_id,
    entries.person_id,
    entries.display_name,
    entries.contact_hint,
    entries.relationship_status,
    entries.invitation_status,
    entries.started_at,
    entries.ended_at,
    entries.sort_group,
    entries.sort_name,
    entries.sort_id
  from entries
  where (p_status is null or entries.sort_group = p_status)
    and (
      p_cursor_group is null
      or (entries.sort_group, entries.sort_name, entries.sort_id)
         > (p_cursor_group, lower(p_cursor_name) collate "C", p_cursor_id)
    )
  order by entries.sort_group, entries.sort_name, entries.sort_id
  limit p_limit;
end
$function$;

alter function relationships.list_organization_clients(
  uuid, uuid, text, integer, text, text, uuid, text
) owner to allfit_owner;
revoke all on function relationships.list_organization_clients(
  uuid, uuid, text, integer, text, text, uuid, text
) from public;
grant execute on function relationships.list_organization_clients(
  uuid, uuid, text, integer, text, text, uuid, text
) to allfit_api;

-- The previous signature, kept for the API that is live while this applies.
create or replace function relationships.list_organization_clients(
  p_person_id uuid,
  p_organization_id uuid,
  p_status text,
  p_limit integer,
  p_cursor_group text,
  p_cursor_name text,
  p_cursor_id uuid
)
returns table (
  entry_kind text,
  relationship_id uuid,
  invitation_id uuid,
  person_id uuid,
  display_name text,
  contact_hint text,
  relationship_status text,
  invitation_status text,
  started_at timestamptz,
  ended_at timestamptz,
  sort_group text,
  sort_name text,
  sort_id uuid
)
language sql
volatile
security invoker
set search_path = pg_catalog
as $function$
  select * from relationships.list_organization_clients(
    p_person_id, p_organization_id, p_status, p_limit,
    p_cursor_group, p_cursor_name, p_cursor_id, null::text
  )
$function$;

alter function relationships.list_organization_clients(
  uuid, uuid, text, integer, text, text, uuid
) owner to allfit_owner;
revoke all on function relationships.list_organization_clients(
  uuid, uuid, text, integer, text, text, uuid
) from public;
grant execute on function relationships.list_organization_clients(
  uuid, uuid, text, integer, text, text, uuid
) to allfit_api;
