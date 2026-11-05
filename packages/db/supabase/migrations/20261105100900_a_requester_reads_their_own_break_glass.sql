-- A requester reads their own break-glass requests — the break-glass tray of `HU-BO-008`
-- and `HU-BO-009`.
--
-- `support.list_break_glass_requests` answered every request to anybody holding
-- `request_break_glass`, so a requester read the subject and the case reference of a
-- colleague's request: who was being looked at and why, with no duty that needed it.
--
-- Approving and auditing do need the whole tray — an approver decides on requests that
-- are not theirs, and an auditor reviews them all — so `approve_break_glass` and
-- `audit_break_glass` keep it. Holding only `request_break_glass` now reads one's own
-- requests, whatever `p_mine` asks for. Restated from `20260910160200` with the filter
-- alone changed.

set lock_timeout = '5s';
set statement_timeout = '60s';

create or replace function support.list_break_glass_requests(
  p_actor_person_id uuid,
  p_actor_session_id uuid,
  p_mine boolean,
  p_status text,
  p_limit integer
)
returns table (result jsonb)
language plpgsql
stable
security definer
set search_path = pg_catalog
as $function$
declare
  reads_whole_tray boolean;
begin
  if not access_control.has_platform_role(p_actor_person_id, p_actor_session_id, 'allfit_admin')
    or not (
      access_control.has_platform_duty(p_actor_person_id, p_actor_session_id, 'request_break_glass')
      or access_control.has_platform_duty(p_actor_person_id, p_actor_session_id, 'approve_break_glass')
      or access_control.has_platform_duty(p_actor_person_id, p_actor_session_id, 'audit_break_glass')
    ) then
    raise exception 'reading the break-glass tray requires an effective duty'
      using errcode = '42501';
  end if;

  reads_whole_tray :=
    access_control.has_platform_duty(p_actor_person_id, p_actor_session_id, 'approve_break_glass')
    or access_control.has_platform_duty(p_actor_person_id, p_actor_session_id, 'audit_break_glass');

  return query
  select support.break_glass_viewer_projection(file.id, p_actor_person_id)
  from support.break_glass_requests as file
  where (
      file.requester_person_id = p_actor_person_id
      or (not p_mine and reads_whole_tray)
    )
    and (
      p_status is null
      or support.effective_break_glass_status(
        file.status, file.request_expires_at, file.window_ends_at
      ) = p_status
    )
  order by file.requested_at desc
  limit greatest(p_limit, 1);
end
$function$;
