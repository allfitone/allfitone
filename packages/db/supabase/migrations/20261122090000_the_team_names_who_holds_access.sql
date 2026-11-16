-- HU-BO-029 criterion 1: the team inventory says who holds access, and who granted it.
--
-- `OP-SUP-008` and `OP-SUP-011` answered only identifiers, so the Team screen showed a
-- UUID where the founder needs a person. Both projections now carry `person_name` and
-- `granted_by_name`, the `display_name` of `identity.people`; null only when a person
-- has no name on file. The commands that return a projection answer them too, so the
-- contract keeps one shape for an assignment.
--
-- **Naming a person is reading her.** ADR-046 let administrators see names, and the
-- person search pays for it with one access event per person it answers. The inventory
-- does the same: every distinct person a page names, as holder or grantor, gets an
-- event before the page travels. The commands do not: each one is itself a row that
-- records who acted on whom.
--
-- The listing bodies are `20260906120200`'s, unchanged but for that event.

set lock_timeout = '5s';
set statement_timeout = '60s';

create or replace function support.platform_role_assignment_projection(p_assignment_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog
as $function$
  select jsonb_build_object(
    'id', assignment.id,
    'person_id', assignment.person_id,
    'person_name', holder.display_name,
    'platform_role', assignment.platform_role,
    'status', assignment.status,
    'granted_by_person_id', assignment.granted_by_person_id,
    'granted_by_name', grantor.display_name,
    'granted_at', assignment.granted_at,
    'revoked_by_person_id', assignment.revoked_by_person_id,
    'revoked_at', assignment.revoked_at
  )
  from support.platform_role_assignments as assignment
  left join identity.people as holder on holder.id = assignment.person_id
  left join identity.people as grantor on grantor.id = assignment.granted_by_person_id
  where assignment.id = p_assignment_id
$function$;

create or replace function support.platform_duty_assignment_projection(p_assignment_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog
as $function$
  select jsonb_build_object(
    'id', assignment.id,
    'person_id', assignment.person_id,
    'person_name', holder.display_name,
    'duty_code', assignment.duty_code,
    'actor_mode', assignment.actor_mode,
    'status', support.effective_platform_duty_status(assignment.status, assignment.valid_to),
    'basis', assignment.basis,
    'valid_from', assignment.valid_from,
    'valid_to', assignment.valid_to,
    'required_aal', assignment.required_aal,
    'granted_by_person_id', assignment.granted_by_person_id,
    'granted_by_name', grantor.display_name,
    'recertified_by_person_id', assignment.recertified_by_person_id,
    'recertified_at', assignment.recertified_at,
    'suspended_by_person_id', assignment.suspended_by_person_id,
    'suspended_at', assignment.suspended_at,
    'revoked_by_person_id', assignment.revoked_by_person_id,
    'revoked_at', assignment.revoked_at,
    'reason_code', assignment.reason_code
  )
  from support.platform_duty_assignments as assignment
  left join identity.people as holder on holder.id = assignment.person_id
  left join identity.people as grantor on grantor.id = assignment.granted_by_person_id
  where assignment.id = p_assignment_id
$function$;

-- One event per distinct person a page names. Kept beside the listings that call it.
create function support.record_platform_access_read(
  p_actor_person_id uuid,
  p_named_person_ids uuid[]
)
returns void
language sql
volatile
security definer
set search_path = pg_catalog
as $function$
  insert into privacy.access_events (
    actor_person_id, subject_person_id, resource, resource_id, purpose, result,
    request_id, access_mode
  )
  select
    p_actor_person_id,
    named.person_id,
    'support.platform_access',
    named.person_id,
    'platform_access_review',
    'allowed',
    coalesce(
      nullif(current_setting('app.request_id', true), '')::uuid,
      extensions.uuid_generate_v7()
    ),
    'support_metadata'::privacy.access_mode
  from (
    select distinct unnest(p_named_person_ids) as person_id
  ) as named
  where named.person_id is not null
$function$;

create or replace function support.list_platform_role_assignments(
  p_actor_person_id uuid,
  p_actor_session_id uuid,
  p_limit integer,
  p_cursor_rank integer,
  p_cursor_granted_at timestamptz,
  p_cursor_id uuid
)
returns table (
  result jsonb,
  cursor_rank integer,
  cursor_granted_at timestamptz,
  cursor_id uuid
)
language plpgsql
volatile
security definer
set search_path = pg_catalog
as $function$
declare
  page_ids uuid[];
  named uuid[];
begin
  if p_limit not between 1 and 101 then
    raise exception 'invalid limit' using errcode = '22023';
  end if;
  perform support.require_platform_access_reader(p_actor_person_id, p_actor_session_id);

  select
    coalesce(array_agg(page.id), '{}'),
    coalesce(array_agg(page.person_id) || array_agg(page.granted_by_person_id), '{}')
  into page_ids, named
  from (
    select assignment.id, assignment.person_id, assignment.granted_by_person_id
    from support.platform_role_assignments as assignment
    where p_cursor_rank is null
      or support.platform_role_status_rank(assignment.status) > p_cursor_rank
      or (
        support.platform_role_status_rank(assignment.status) = p_cursor_rank
        and (assignment.granted_at, assignment.id) < (p_cursor_granted_at, p_cursor_id)
      )
    order by
      support.platform_role_status_rank(assignment.status) asc,
      assignment.granted_at desc,
      assignment.id desc
    limit p_limit
  ) as page;

  perform support.record_platform_access_read(p_actor_person_id, named);

  return query
  select
    support.platform_role_assignment_projection(assignment.id),
    support.platform_role_status_rank(assignment.status),
    assignment.granted_at,
    assignment.id
  from support.platform_role_assignments as assignment
  where assignment.id = any (page_ids)
  order by
    support.platform_role_status_rank(assignment.status) asc,
    assignment.granted_at desc,
    assignment.id desc;
end
$function$;

create or replace function support.list_platform_duty_assignments(
  p_actor_person_id uuid,
  p_actor_session_id uuid,
  p_person_id uuid,
  p_duty_code text,
  p_status text,
  p_limit integer,
  p_cursor_rank integer,
  p_cursor_valid_to timestamptz,
  p_cursor_created_at timestamptz,
  p_cursor_id uuid
)
returns table (
  result jsonb,
  cursor_rank integer,
  cursor_valid_to timestamptz,
  cursor_created_at timestamptz,
  cursor_id uuid
)
language plpgsql
volatile
security definer
set search_path = pg_catalog
as $function$
declare
  page_ids uuid[];
  named uuid[];
begin
  if p_limit not between 1 and 101 then
    raise exception 'invalid limit' using errcode = '22023';
  end if;
  perform support.require_platform_access_reader(p_actor_person_id, p_actor_session_id);

  select
    coalesce(array_agg(page.id), '{}'),
    coalesce(array_agg(page.person_id) || array_agg(page.granted_by_person_id), '{}')
  into page_ids, named
  from (
    select assignment.id, assignment.person_id, assignment.granted_by_person_id
    from support.platform_duty_assignments as assignment
    where (p_person_id is null or assignment.person_id = p_person_id)
      and (p_duty_code is null or assignment.duty_code = p_duty_code)
      and (
        p_status is null
        or support.effective_platform_duty_status(assignment.status, assignment.valid_to) = p_status
      )
      and (
        p_cursor_rank is null
        or support.platform_duty_status_rank(
          support.effective_platform_duty_status(assignment.status, assignment.valid_to)
        ) > p_cursor_rank
        or (
          support.platform_duty_status_rank(
            support.effective_platform_duty_status(assignment.status, assignment.valid_to)
          ) = p_cursor_rank
          and (assignment.valid_to, assignment.created_at, assignment.id)
              < (p_cursor_valid_to, p_cursor_created_at, p_cursor_id)
        )
      )
    order by
      support.platform_duty_status_rank(
        support.effective_platform_duty_status(assignment.status, assignment.valid_to)
      ) asc,
      assignment.valid_to desc,
      assignment.created_at desc,
      assignment.id desc
    limit p_limit
  ) as page;

  perform support.record_platform_access_read(p_actor_person_id, named);

  return query
  select
    support.platform_duty_assignment_projection(assignment.id),
    support.platform_duty_status_rank(
      support.effective_platform_duty_status(assignment.status, assignment.valid_to)
    ),
    assignment.valid_to,
    assignment.created_at,
    assignment.id
  from support.platform_duty_assignments as assignment
  where assignment.id = any (page_ids)
  order by
    support.platform_duty_status_rank(
      support.effective_platform_duty_status(assignment.status, assignment.valid_to)
    ) asc,
    assignment.valid_to desc,
    assignment.created_at desc,
    assignment.id desc;
end
$function$;

alter function support.record_platform_access_read(uuid, uuid[]) owner to allfit_owner;
revoke all on function support.record_platform_access_read(uuid, uuid[]) from public;
