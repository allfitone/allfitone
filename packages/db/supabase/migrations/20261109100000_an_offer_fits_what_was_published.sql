-- IX-06: an invitation offers no more than the published scope version admits
-- (HU-BO-024, proposal C).
--
-- An option could ask for `contribute` on any scope, including the ones whose
-- published rules are all `read`: `prior_training_history`, `nutrition_intake`,
-- `body_progress`. It granted nothing extra, because no policy reads the level
-- for those scopes, but the person accepted a sentence that said more than was
-- true, and the grant recorded it that way.
--
-- This is the only place where the published rules govern something, and they
-- can only restrict: `read` stays offerable on every published version, with
-- or without rules, exactly as before.
--
-- The check runs where an offer is written or changed, not where it is
-- answered. An offer sent before this migration can still be decided; refusing
-- her answer to an invitation she already holds would be the worse failure.
--
-- The rules are read as the caller. Published rules are visible to any signed
-- in person and to support, which covers issuing and reissuing; any other actor
-- sees none and is refused, which fails closed.

set lock_timeout = '5s';
set statement_timeout = '60s';

create or replace function privacy.enforce_invitation_scope_option()
returns trigger
language plpgsql
set search_path = pg_catalog
as $function$
declare
  intent_kind identity.invitation_intent_kind;
  scope_status catalog.publication_status;
begin
  select kind into intent_kind
  from identity.invitation_intents
  where id = new.invitation_intent_id;

  if intent_kind is distinct from 'service_relationship' then
    raise exception 'IX-06 scope options belong to a service relationship intent'
      using errcode = '23514';
  end if;

  select status into scope_status
  from privacy.scope_definitions
  where id = new.scope_definition_id;

  if scope_status is distinct from 'published' then
    raise exception 'IX-06 scope definition is not published' using errcode = '23514';
  end if;

  if new.offered_access_level = 'contribute'
     and (tg_op = 'INSERT'
          or new.offered_access_level is distinct from old.offered_access_level
          or new.scope_definition_id is distinct from old.scope_definition_id)
     and not exists (
       select 1
       from privacy.scope_resource_rules as rule
       where rule.scope_definition_id = new.scope_definition_id
         and rule.max_action = 'contribute'
         and not rule.is_excluded
     ) then
    raise exception 'IX-06 the published scope version admits no contribute'
      using errcode = '23514', detail = '["scopes"]';
  end if;

  if tg_op = 'UPDATE' and old.decision is not null then
    if new.scope_code is distinct from old.scope_code
       or new.scope_definition_id is distinct from old.scope_definition_id
       or new.offered_access_level is distinct from old.offered_access_level
       or new.purpose is distinct from old.purpose
       or new.presented_snapshot is distinct from old.presented_snapshot
       or new.decision is distinct from old.decision
       or new.decided_at is distinct from old.decided_at then
      raise exception 'IX-06 a decided scope option cannot change' using errcode = '23514';
    end if;
  end if;

  return new;
end
$function$;
