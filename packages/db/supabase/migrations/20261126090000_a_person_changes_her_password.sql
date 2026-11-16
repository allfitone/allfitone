-- A person changes her password — TECH-325, `OP-IDN-066`, `HU-SP-005`, ADR-051.
--
-- **WorkOS holds the password; this records what happened.** ADR-051 makes the one exception
-- to the outbox rule: the API checks the current password and sets the new one in WorkOS
-- inside the request, because sending the change through the outbox would mean writing the
-- password here first. So the order is:
--
-- 1. `prepare_password_change` says who she signs in as, and whether she may try: a key that
--    already changed it replays without asking WorkOS again, and five wrong current
--    passwords in an hour stop the next attempt.
-- 2. The API asks WorkOS. A wrong current password is counted by `reject_password_change`.
-- 3. Once WorkOS took the new one, `record_password_change` stores the change, closes the
--    receipt and enqueues `identity.password_changed.v1`. The worker revokes every other
--    session, keeping the one the change came from, and emails a notice.
--
-- **Nothing derived from a password is stored.** The table has no column for one, the event
-- carries only the change id, and the API hashes the method and path for the receipt, never
-- the body.
--
-- **A refusal gets its own id.** The command id comes from the client; keying refusals by it
-- would let somebody retry one id forever and be counted once.

set lock_timeout = '5s';
set statement_timeout = '60s';

-- ---------------------------------------------------------------- the record

create table identity.password_changes (
  id uuid not null,
  person_id uuid not null,
  access_account_id uuid not null,
  outcome text not null,
  keep_session_id text,
  created_at timestamptz not null default clock_timestamp(),
  constraint pk_password_changes primary key (id),
  constraint fk_password_changes_person foreign key (person_id) references identity.people(id) on delete restrict,
  constraint fk_password_changes_account foreign key (access_account_id) references identity.access_accounts(id) on delete restrict,
  constraint ck_password_changes_outcome check (outcome in ('rejected', 'changed')),
  constraint ck_password_changes_session check (
    (keep_session_id is not null) = (outcome = 'changed')
    and (keep_session_id is null or char_length(keep_session_id) between 1 and 200)
  )
);

create index idx_password_changes_person_created
  on identity.password_changes (person_id, created_at desc);

create function identity.reject_password_change_rewrite()
returns trigger
language plpgsql
set search_path = pg_catalog
as $function$
begin
  raise exception 'the password change record is append-only' using errcode = '55000';
end
$function$;

create trigger trg_password_changes_append_only
before update or delete on identity.password_changes
for each row execute function identity.reject_password_change_rewrite();

alter table identity.password_changes enable row level security;
alter table identity.password_changes force row level security;

create policy password_changes_all_owner
  on identity.password_changes
  for all to allfit_owner using (true) with check (true);

-- ---------------------------------------------------------------- before WorkOS

create function identity.prepare_password_change(
  p_provider text,
  p_issuer text,
  p_subject text,
  p_idempotency_key uuid
)
returns table (password_state text, sign_in_email text)
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  person uuid;
begin
  person := identity.require_space_person(p_provider, p_issuer, p_subject);

  -- After a change the old password is no longer the current one: a retry must not ask.
  if exists (
    select 1 from system.idempotency_keys as receipt
    where receipt.principal_fingerprint
        = extensions.digest(convert_to(person::text, 'UTF8'), 'sha256')
      and receipt.surface = 'space'
      and receipt.client_id = 'space'
      and receipt.operation_code = 'OP-IDN-066'
      and receipt.key = p_idempotency_key
      and receipt.status = 'succeeded'
  ) then
    return query select 'replayed'::text, null::text;
    return;
  end if;

  if (
    select count(*) from identity.password_changes as change
    where change.person_id = person
      and change.outcome = 'rejected'
      and change.created_at > clock_timestamp() - interval '1 hour'
  ) >= 5 then
    return query select 'too_many_attempts'::text, null::text;
    return;
  end if;

  return query
  select 'ready'::text, owner.contact_email::text
  from identity.people as owner
  where owner.id = person;
end
$function$;

create function identity.reject_password_change(
  p_provider text,
  p_issuer text,
  p_subject text
)
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  person uuid;
begin
  person := identity.require_space_person(p_provider, p_issuer, p_subject);

  insert into identity.password_changes (id, person_id, access_account_id, outcome)
  select extensions.uuid_generate_v7(), person, account.id, 'rejected'
  from identity.access_accounts as account
  where account.provider = p_provider
    and account.issuer = p_issuer
    and account.subject = p_subject;
end
$function$;

-- ---------------------------------------------------------------- after WorkOS

create function identity.record_password_change(
  p_provider text,
  p_issuer text,
  p_subject text,
  p_keep_session_id text,
  p_idempotency_key uuid,
  p_command_id uuid,
  p_request_hash bytea
)
returns table (replayed boolean)
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  person uuid;
  receipt record;
begin
  person := identity.require_space_person(p_provider, p_issuer, p_subject);

  select * into receipt
  from system.begin_idempotency(
    person, 'space'::system.command_surface, 'space',
    'OP-IDN-066', p_idempotency_key, p_command_id, p_request_hash
  );
  if not receipt.claimed then
    return query select true;
    return;
  end if;

  insert into identity.password_changes (
    id, person_id, access_account_id, outcome, keep_session_id
  )
  select p_command_id, person, account.id, 'changed', p_keep_session_id
  from identity.access_accounts as account
  where account.provider = p_provider
    and account.issuer = p_issuer
    and account.subject = p_subject;

  perform system.enqueue_outbox_event(
    'password_change', p_command_id, 'identity.password_changed.v1',
    jsonb_build_object('change_id', p_command_id)
  );
  perform system.finish_idempotency(
    receipt.receipt_id, 204::smallint, 'password-changed', 'password_change', p_command_id
  );
  return query select false;
end
$function$;

-- ---------------------------------------------------------------- the worker

create function identity.prepare_password_change_notice(p_event_id uuid)
returns table (
  notice_state text,
  change_id uuid,
  subject text,
  sign_in_email text,
  keep_session text
)
language plpgsql
security definer
set search_path = pg_catalog
as $function$
#variable_conflict use_column
begin
  if access_control.actor_kind() <> 'worker' then
    raise exception 'worker actor required' using errcode = '42501';
  end if;

  return query
  select 'ready'::text, change.id, account.subject, owner.contact_email::text,
         change.keep_session_id
  from system.outbox_events as event
  join identity.password_changes as change on change.id = event.aggregate_id
  join identity.access_accounts as account on account.id = change.access_account_id
  join identity.people as owner on owner.id = change.person_id
  where event.id = p_event_id
    and event.event_type = 'identity.password_changed.v1'
    and change.outcome = 'changed';

  if not found then
    return query select 'skipped'::text, null::uuid, null::text, null::text, null::text;
  end if;
end
$function$;

-- ---------------------------------------------------------------- ownership and grants

alter table identity.password_changes owner to allfit_owner;
alter function identity.reject_password_change_rewrite() owner to allfit_owner;
alter function identity.prepare_password_change(text, text, text, uuid) owner to allfit_owner;
alter function identity.reject_password_change(text, text, text) owner to allfit_owner;
alter function identity.record_password_change(text, text, text, text, uuid, uuid, bytea)
  owner to allfit_owner;
alter function identity.prepare_password_change_notice(uuid) owner to allfit_owner;

revoke all on identity.password_changes from public, allfit_api;
revoke all on function identity.reject_password_change_rewrite() from public, allfit_api;
revoke all on function identity.prepare_password_change(text, text, text, uuid) from public;
revoke all on function identity.reject_password_change(text, text, text) from public;
revoke all on function identity.record_password_change(text, text, text, text, uuid, uuid, bytea)
  from public;
revoke all on function identity.prepare_password_change_notice(uuid) from public;

grant execute on function identity.prepare_password_change(text, text, text, uuid) to allfit_api;
grant execute on function identity.reject_password_change(text, text, text) to allfit_api;
grant execute on function identity.record_password_change(text, text, text, text, uuid, uuid, bytea)
  to allfit_api;
grant execute on function identity.prepare_password_change_notice(uuid) to allfit_api;
