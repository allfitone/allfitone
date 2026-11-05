-- An idle Backoffice session is swept — `HU-BO-002` criterion 3.
--
-- A session past its fifteen idle minutes or its eight hours was revoked lazily, by the
-- next request that presented it (`20260812122000`). One nobody presented again was
-- never revoked: its provider session stayed alive, and
-- `identity.backoffice_session_revocation_requested.v1` was never queued.
--
-- The worker now sweeps them on its minute job, with the same two limits and the same
-- event the lazy path writes, so the provider side is revoked by the existing consumer.
-- `for update skip locked` lets a request that is expiring the same session lazily win
-- without either waiting on the other; whichever runs first revokes it once.

set lock_timeout = '5s';
set statement_timeout = '60s';

create or replace function identity.expire_backoffice_sessions(p_limit integer)
returns integer
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  target record;
  expired_count integer := 0;
begin
  if access_control.actor_kind() is distinct from 'worker'::identity.actor_kind
     or p_limit is null or p_limit < 1 or p_limit > 500 then
    raise exception 'invalid backoffice session sweep' using errcode = '42501';
  end if;

  for target in
    select session.id
    from identity.access_sessions as session
    where session.surface = 'backoffice'
      and session.revoked_at is null
      and (
        session.absolute_expires_at <= clock_timestamp()
        or session.last_activity_at <= clock_timestamp() - interval '15 minutes'
      )
    order by session.last_activity_at, session.id
    limit p_limit
    for update skip locked
  loop
    update identity.access_sessions
    set revoked_at = clock_timestamp()
    where id = target.id;
    perform system.enqueue_outbox_event(
      'access_session', target.id, 'identity.backoffice_session_revocation_requested.v1',
      jsonb_build_object('session_id', target.id)
    );
    expired_count := expired_count + 1;
  end loop;
  return expired_count;
end
$function$;

alter function identity.expire_backoffice_sessions(integer) owner to allfit_owner;
revoke all on function identity.expire_backoffice_sessions(integer) from public;
grant execute on function identity.expire_backoffice_sessions(integer) to allfit_api;
