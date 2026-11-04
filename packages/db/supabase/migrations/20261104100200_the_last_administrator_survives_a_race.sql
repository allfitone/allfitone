-- HU-BO-028 — the last Allfit administrator survives two revocations at once.
--
-- `support.prevent_last_platform_administrator_revocation` refuses to revoke the last
-- active administrator by asking whether another one is still active. Each revocation
-- (`support.revoke_platform_role`, `OP-SUP-007`) locks only its own row, so when the
-- last two administrators revoke each other at the same moment, each asks while the
-- other is still active, both pass, and Backoffice is left with nobody who can grant
-- access again.
--
-- The trigger now takes one transaction-scoped advisory lock for the set of platform
-- administrators before it asks. The second revocation waits for the first to commit,
-- and its question, asked again under READ COMMITTED, sees the first one revoked and is
-- refused with the same `23514`. An advisory lock rather than row locks on the other
-- administrators: each revocation already holds its own row, so locking the rest would
-- make the two wait on each other in opposite order and deadlock.
--
-- The body is `20260812122000`'s with that lock added; nothing else changed.

set lock_timeout = '5s';
set statement_timeout = '60s';

create or replace function support.prevent_last_platform_administrator_revocation()
returns trigger
language plpgsql
set search_path = pg_catalog
as $function$
begin
  if old.status = 'active' and new.status = 'revoked' then
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended('support.platform_administrators', 0)
    );
    if not exists (
      select 1 from support.platform_role_assignments
      where platform_role = 'allfit_admin' and status = 'active' and id <> old.id
    ) then
      raise exception 'cannot revoke the last platform administrator' using errcode = '23514';
    end if;
  end if;
  return new;
end
$function$;
