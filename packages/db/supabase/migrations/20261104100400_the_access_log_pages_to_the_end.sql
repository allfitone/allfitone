-- HU-BO-030 — the access log reaches every record, a page at a time (OP-SUP-009).
--
-- `privacy.list_access_events` answers the newest fifty by default and has no way to ask
-- for the next ones. The Backoffice showed that first page as «N accesos en total», so an
-- auditor answering "who looked at this person" from it could answer wrong.
--
-- `privacy.page_access_events` reads the same log under the same guard, the same filters
-- and the same per-case disqualification, and pages it by (occurred_at, id), newest
-- first. The id is what makes the cursor exact: one read writes several records in the
-- same instant, and a cursor on time alone would skip or repeat them. It returns the
-- record's id for that reason only; the API turns it into an opaque cursor and does not
-- show it. A page is capped at 201, one more than the largest page the API serves, so the
-- API can tell whether another page exists without a second query over a moving table.
--
-- `list_access_events` is left as it is: the API deployed before this migration still
-- calls it. It can be dropped once the API that pages is the one running.

set lock_timeout = '5s';
set statement_timeout = '60s';

create function privacy.page_access_events(
  p_actor_person_id uuid,
  p_actor_session_id uuid,
  p_filter_actor_person_id uuid,
  p_filter_subject_person_id uuid,
  p_from timestamptz,
  p_to timestamptz,
  p_limit integer,
  p_before_occurred_at timestamptz,
  p_before_id uuid
)
returns table (
  access_event_id uuid,
  actor_person_id uuid,
  subject_person_id uuid,
  resource text,
  resource_id uuid,
  purpose text,
  result text,
  scope_code text,
  scope_version integer,
  access_mode privacy.access_mode,
  occurred_at timestamptz
)
language plpgsql
stable
security definer
set search_path = pg_catalog
as $function$
begin
  -- `perform`, not a cross join: the guard returns void and the planner could elide it.
  perform privacy.require_access_log_auditor(p_actor_person_id, p_actor_session_id);

  if (p_before_occurred_at is null) <> (p_before_id is null) then
    raise exception 'a page cursor names both the last instant and the last record'
      using errcode = '22023';
  end if;

  return query
  select
    event.id,
    event.actor_person_id,
    event.subject_person_id,
    event.resource,
    event.resource_id,
    event.purpose,
    event.result,
    event.scope_code,
    event.scope_version,
    event.access_mode,
    event.occurred_at
  from privacy.access_events as event
  where (p_filter_actor_person_id is null or event.actor_person_id = p_filter_actor_person_id)
    and (
      p_filter_subject_person_id is null
      or event.subject_person_id = p_filter_subject_person_id
    )
    and (p_from is null or event.occurred_at >= p_from)
    and (p_to is null or event.occurred_at < p_to)
    and (
      p_before_occurred_at is null
      or (event.occurred_at, event.id) < (p_before_occurred_at, p_before_id)
    )
    and not privacy.is_own_break_glass_case(
      event.id, event.occurred_at, p_actor_person_id
    )
  order by event.occurred_at desc, event.id desc
  limit least(greatest(coalesce(p_limit, 50), 1), 201);
end
$function$;

alter function privacy.page_access_events(
  uuid, uuid, uuid, uuid, timestamptz, timestamptz, integer, timestamptz, uuid
) owner to allfit_owner;
revoke all on function privacy.page_access_events(
  uuid, uuid, uuid, uuid, timestamptz, timestamptz, integer, timestamptz, uuid
) from public;
grant execute on function privacy.page_access_events(
  uuid, uuid, uuid, uuid, timestamptz, timestamptz, integer, timestamptz, uuid
) to allfit_api;
