-- A person changes her email — TECH-44, `OP-IDN-021` and `OP-IDN-022` (email half),
-- `HU-SP-076`, `HU-SP-077`, DT-016.
--
-- **The address she signs in with moves only after the new one is proven and WorkOS took
-- it.** The contact email and the sign-in email are one datum, and PostgreSQL and WorkOS
-- share no transaction. So the change walks through `identity.identity_action_requests`:
--
-- 1. `request_email_change` opens an `email_change` request with the proposed address and
--    enqueues `identity.contact_changed.v1`. Nothing in `identity.people` moves.
-- 2. The worker generates a six-digit code, records only its hash and emails it to the new
--    address. A retry records another code; only the last one is valid.
-- 3. `verify_email_change` compares the code. A wrong one is counted and answered, never
--    raised, so the count survives; the fifth fails the request. The right one moves it to
--    `applying`, keeps the confirming session and enqueues `identity.contact_verified.v1`.
-- 4. The worker updates WorkOS, warns the previous address, then `complete_email_change`
--    promotes the new one, verified. If WorkOS refuses, `fail_email_change_apply` closes the
--    request and the previous address stays on both sides.
--
-- **Nothing says who else has an account.** A malformed address, her own and one somebody
-- else holds are refused with the same words.
--
-- **The table was support's, and support's reads now look at recoveries only.** An email
-- change would otherwise show in Backoffice as a recovery, block starting one and spend the
-- person's three recovery emails a day.

set lock_timeout = '5s';
set statement_timeout = '60s';

-- ---------------------------------------------------------------- requests

alter table identity.identity_action_requests
  add column proposed_email extensions.citext,
  add column code_hash bytea,
  add column code_attempts smallint not null default 0,
  add column confirming_session_id text;

alter table identity.identity_action_requests
  drop constraint ck_identity_action_requests_initiator,
  drop constraint ck_identity_action_requests_failure_code,
  drop constraint ck_identity_action_requests_lifecycle;

alter table identity.identity_action_requests
  add constraint ck_identity_action_requests_initiator check (
    (action_kind = 'account_recovery'
      and initiated_by_kind = 'support'
      and initiated_by_duty_assignment_id is not null
      and initiated_by_person_id <> person_id
      and case_reference ~ '^[A-Z][A-Z0-9_-]{2,63}$')
    or (action_kind = 'email_change'
      and initiated_by_kind = 'person'
      and initiated_by_person_id = person_id
      and initiated_by_duty_assignment_id is null
      and case_reference is null)
  ),
  add constraint ck_identity_action_requests_failure_code check (
    failure_code in ('contact_changed', 'delivery_failed', 'too_many_attempts', 'provider_rejected')
  ),
  add constraint ck_identity_action_requests_lifecycle check (
    (status not in ('awaiting_verification', 'applying', 'confirmed') or delivered_at is not null)
    and (confirmed_at is not null) = (status = 'confirmed')
    and (cancelled_at is not null) = (status = 'cancelled')
    and (failed_at is not null) = (status = 'failed')
    and (failure_code is not null) = (status = 'failed')
  ),
  add constraint ck_identity_action_requests_proposal check (
    (action_kind = 'email_change') = (proposed_email is not null)
    and (code_hash is null or (action_kind = 'email_change' and octet_length(code_hash) = 32))
    and code_attempts between 0 and 5
    and (confirming_session_id is null
      or (action_kind = 'email_change' and char_length(confirming_session_id) between 1 and 200))
    and (status <> 'applying' or confirming_session_id is not null)
  );

-- One request under way per person and kind, an applying change included.
drop index identity.uidx_identity_action_requests_open;
create unique index uidx_identity_action_requests_open
  on identity.identity_action_requests (person_id, action_kind)
  where status in ('initiated', 'awaiting_verification', 'applying');

create or replace function identity.identity_action_request_transition_tg()
returns trigger
language plpgsql
set search_path = pg_catalog
as $function$
begin
  if tg_op = 'DELETE' then
    raise exception 'an identity action request is never deleted' using errcode = '55000';
  end if;

  if new.id is distinct from old.id
     or new.person_id is distinct from old.person_id
     or new.access_account_id is distinct from old.access_account_id
     or new.action_kind is distinct from old.action_kind
     or new.initiated_by_kind is distinct from old.initiated_by_kind
     or new.initiated_by_person_id is distinct from old.initiated_by_person_id
     or new.initiated_by_duty_assignment_id is distinct from old.initiated_by_duty_assignment_id
     or new.case_reference is distinct from old.case_reference
     or new.delivery_channel is distinct from old.delivery_channel
     or new.contact_fingerprint is distinct from old.contact_fingerprint
     or new.contact_hint is distinct from old.contact_hint
     or new.proposed_email is distinct from old.proposed_email
     or new.created_at is distinct from old.created_at then
    raise exception 'an identity action request keeps its subject, destination and author'
      using errcode = '55000';
  end if;

  if old.status not in ('initiated', 'awaiting_verification', 'applying') then
    raise exception 'a finished identity action request never changes' using errcode = '55000';
  end if;
  if old.status = 'awaiting_verification' and new.status = 'initiated' then
    raise exception 'a delivered request does not return to initiated' using errcode = '55000';
  end if;
  if old.status = 'applying' and new.status not in ('applying', 'confirmed', 'failed') then
    raise exception 'an applying request only finishes' using errcode = '55000';
  end if;

  new.updated_at := clock_timestamp();
  return new;
end
$function$;

-- ---------------------------------------------------------------- history

alter table identity.identity_action_events
  drop constraint ck_identity_action_events_type,
  drop constraint ck_identity_action_events_actor,
  drop constraint ck_identity_action_events_result;

alter table identity.identity_action_events
  add constraint ck_identity_action_events_type check (
    event_type in (
      'initiated', 'delivery_requested', 'delivered', 'confirmed', 'expired', 'cancelled',
      'failed', 'code_rejected', 'applied'
    )
  ),
  -- Each transition has exactly one kind of author, and only support's carry a case.
  add constraint ck_identity_action_events_actor check (
    (actor_kind = 'support' and event_type in ('initiated', 'delivery_requested', 'cancelled')
      and actor_person_id is not null and actor_duty_assignment_id is not null
      and case_reference ~ '^[A-Z][A-Z0-9_-]{2,63}$')
    or (actor_kind = 'worker' and event_type in ('delivered', 'failed', 'applied')
      and actor_person_id is null and actor_duty_assignment_id is null and case_reference is null)
    or (actor_kind = 'person'
      and event_type in ('initiated', 'cancelled', 'confirmed', 'code_rejected', 'failed')
      and actor_person_id is not null and actor_duty_assignment_id is null
      and case_reference is null)
    or (actor_kind = 'system' and event_type = 'expired'
      and actor_person_id is null and actor_duty_assignment_id is null and case_reference is null)
  ),
  add constraint ck_identity_action_events_result check (
    (result_code is not null) = (event_type = 'failed')
    and (result_code is null or result_code in (
      'contact_changed', 'delivery_failed', 'too_many_attempts', 'provider_rejected'
    ))
  );

-- ---------------------------------------------------------------- support reads recoveries only

create or replace function identity.consume_account_recovery_send(p_person_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $function$
begin
  if (
    select count(*)
    from identity.identity_action_events as event
    join identity.identity_action_requests as request on request.id = event.request_id
    where request.person_id = p_person_id
      and request.action_kind = 'account_recovery'
      and event.event_type in ('initiated', 'delivery_requested')
      and event.occurred_at > clock_timestamp() - interval '24 hours'
  ) >= 3 then
    raise exception 'no more recovery emails reach this person today' using errcode = 'P0001';
  end if;
end
$function$;

create or replace function identity.read_account_recovery(
  p_actor_person_id uuid,
  p_actor_session_id uuid,
  p_case_reference text,
  p_person_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  subject identity.people%rowtype;
  reason text;
begin
  perform identity.require_account_recovery_assistant(p_actor_person_id, p_actor_session_id);
  if nullif(btrim(p_case_reference), '') !~ '^[A-Z][A-Z0-9_-]{2,63}$' then
    raise exception 'a case reference is a traceable code, never free text' using errcode = '22023';
  end if;

  select person.* into subject from identity.people as person where person.id = p_person_id;
  if subject.id is null then
    raise exception 'person not found' using errcode = 'P0002';
  end if;

  reason := identity.account_recovery_unavailable_reason(p_person_id);
  perform identity.record_account_recovery_access(p_actor_person_id, p_person_id);

  return jsonb_build_object(
    'person_id', p_person_id,
    'availability', case when reason is null then 'available' else 'unavailable' end,
    'unavailable_reason', reason,
    'contact_hint', case
      when reason is null then support.mask_email(subject.contact_email::text)
    end,
    'can_start', reason is null
      and p_actor_person_id <> p_person_id
      and not exists (
        select 1 from identity.identity_action_requests as request
        where request.person_id = p_person_id
          and request.action_kind = 'account_recovery'
          and request.status in ('initiated', 'awaiting_verification')
          and request.expires_at > clock_timestamp()
      ),
    'requests', coalesce((
      select jsonb_agg(
        identity.account_recovery_projection(newest.id)
        order by newest.created_at desc, newest.id desc
      )
      from (
        select request.id, request.created_at
        from identity.identity_action_requests as request
        where request.person_id = p_person_id
          and request.action_kind = 'account_recovery'
        order by request.created_at desc, request.id desc
        limit 10
      ) as newest
    ), '[]'::jsonb)
  );
end
$function$;

-- ---------------------------------------------------------------- helpers

-- The code never sits in a column: only this, salted with the request it belongs to.
create function identity.email_change_code_hash(p_request_id uuid, p_code text)
returns bytea
language sql
immutable
set search_path = pg_catalog
as $function$
  select extensions.digest(convert_to(p_request_id::text || ':' || p_code, 'UTF8'), 'sha256')
$function$;

-- The change she has under way, as she reads it; null when there is none.
create function identity.own_email_change_document(p_person_id uuid)
returns jsonb
language sql
security definer
set search_path = pg_catalog
as $function$
  select jsonb_build_object(
    'address', request.proposed_email::text,
    'status', case when request.status = 'applying' then 'applying' else 'awaiting_code' end,
    'expires_at', request.expires_at
  )
  from identity.identity_action_requests as request
  where request.person_id = p_person_id
    and request.action_kind = 'email_change'
    and (request.status = 'applying'
      or (request.status in ('initiated', 'awaiting_verification')
        and request.expires_at > clock_timestamp()))
  order by request.created_at desc
  limit 1
$function$;

-- ---------------------------------------------------------------- my identity (OP-IDN-012)

create or replace function identity.read_own_identity(p_provider text, p_issuer text, p_subject text)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  person uuid;
begin
  person := identity.require_space_person(p_provider, p_issuer, p_subject);

  return (
    select jsonb_build_object(
      'given_name', owner.given_name,
      'family_name', owner.family_name,
      'username', owner.username::text,
      'active_since', owner.activated_at,
      'email', jsonb_build_object(
        'address', owner.contact_email::text,
        'verified', owner.contact_email_verified_at is not null,
        'pending', coalesce(identity.own_email_change_document(owner.id), 'null'::jsonb)
      ),
      'phone', jsonb_build_object(
        'number', owner.contact_phone,
        'verified', owner.contact_phone_verified_at is not null
      ),
      'accounts', coalesce((
        select jsonb_agg(
                 jsonb_build_object('provider', account.provider, 'linked_at', account.linked_at)
                 order by account.linked_at, account.id
               )
        from identity.access_accounts as account
        where account.person_id = owner.id
      ), '[]'::jsonb)
    )
    from identity.people as owner
    where owner.id = person
  );
end
$function$;

-- ---------------------------------------------------------------- she asks (OP-IDN-021)

create function identity.request_email_change(
  p_provider text,
  p_issuer text,
  p_subject text,
  p_email text,
  p_idempotency_key uuid,
  p_command_id uuid,
  p_request_hash bytea
)
returns table (result jsonb, replayed boolean)
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  person uuid;
  owner identity.people%rowtype;
  receipt record;
  account uuid;
  address text := lower(btrim(p_email));
  replaced record;
begin
  person := identity.require_space_person(p_provider, p_issuer, p_subject);
  select * into owner from identity.people where id = person for update;

  -- One message for every refusal: telling them apart would say who has an account.
  if address is null
     or char_length(address) > 254
     or address !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
     or address = lower(owner.contact_email::text)
     or exists (
       select 1 from identity.people as other
       where other.contact_email = address::extensions.citext and other.id <> person
     ) then
    raise exception 'that email cannot be used' using errcode = '22023';
  end if;

  select * into receipt
  from system.begin_idempotency(
    person, 'space'::system.command_surface, 'space',
    'OP-IDN-021', p_idempotency_key, p_command_id, p_request_hash
  );
  if not receipt.claimed then
    return query select identity.own_email_change_document(person), true;
    return;
  end if;

  if exists (
    select 1 from identity.identity_action_requests as request
    where request.person_id = person
      and request.action_kind = 'email_change'
      and request.status = 'applying'
  ) then
    raise exception 'an email change is being applied' using errcode = '55000';
  end if;
  if (
    select count(*) from identity.identity_action_requests as request
    where request.person_id = person
      and request.action_kind = 'email_change'
      and request.created_at > clock_timestamp() - interval '1 hour'
  ) >= 5 then
    raise exception 'too many email changes in an hour' using errcode = '55000';
  end if;

  -- Asking again is the way to a new code: the open request gives way to this one.
  for replaced in
    update identity.identity_action_requests as request
    set status = 'cancelled', cancelled_at = clock_timestamp()
    where request.person_id = person
      and request.action_kind = 'email_change'
      and request.status in ('initiated', 'awaiting_verification')
    returning request.id
  loop
    insert into identity.identity_action_events (request_id, event_type, actor_kind, actor_person_id)
    values (replaced.id, 'cancelled', 'person', person);
  end loop;

  select own_account.id into account
  from identity.access_accounts as own_account
  where own_account.provider = p_provider
    and own_account.issuer = p_issuer
    and own_account.subject = p_subject;

  insert into identity.identity_action_requests (
    id, person_id, access_account_id, action_kind, initiated_by_kind, initiated_by_person_id,
    delivery_channel, contact_fingerprint, contact_hint, expires_at, proposed_email
  ) values (
    p_command_id, person, account, 'email_change', 'person', person,
    'email', identity.account_recovery_contact_fingerprint(address), support.mask_email(address),
    clock_timestamp() + interval '30 minutes', address::extensions.citext
  );
  insert into identity.identity_action_events (
    request_id, event_type, actor_kind, actor_person_id, delivery_channel
  ) values (p_command_id, 'initiated', 'person', person, 'email');

  perform system.enqueue_outbox_event(
    'identity_action_request', p_command_id, 'identity.contact_changed.v1',
    jsonb_build_object('request_id', p_command_id)
  );
  perform system.finish_idempotency(
    receipt.receipt_id, 202::smallint, 'email-change-requested',
    'identity_action_request', p_command_id
  );
  return query select identity.own_email_change_document(person), false;
end
$function$;

-- ---------------------------------------------------------------- she answers (OP-IDN-022)

create function identity.verify_email_change(
  p_provider text,
  p_issuer text,
  p_subject text,
  p_session_id text,
  p_code text,
  p_idempotency_key uuid,
  p_command_id uuid,
  p_request_hash bytea
)
returns table (result jsonb, replayed boolean)
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  person uuid;
  receipt record;
  target identity.identity_action_requests%rowtype;
  outcome text;
  attempts smallint;
begin
  person := identity.require_space_person(p_provider, p_issuer, p_subject);
  if p_session_id is null or char_length(btrim(p_session_id)) not between 1 and 200 then
    raise exception 'a confirmation names the session it comes from' using errcode = '22023';
  end if;

  select * into receipt
  from system.begin_idempotency(
    person, 'space'::system.command_surface, 'space',
    'OP-IDN-022', p_idempotency_key, p_command_id, p_request_hash
  );
  if not receipt.claimed then
    return query select jsonb_build_object('outcome', case
      when exists (
        select 1 from identity.identity_action_requests as request
        where request.id = receipt.aggregate_id and request.status in ('applying', 'confirmed')
      ) then 'applying' else 'wrong_code' end), true;
    return;
  end if;

  select request.* into target
  from identity.identity_action_requests as request
  where request.person_id = person
    and request.action_kind = 'email_change'
    and request.status = 'awaiting_verification'
  order by request.created_at desc
  limit 1
  for update;

  if target.id is null then
    outcome := 'expired';
  elsif target.expires_at <= clock_timestamp() then
    update identity.identity_action_requests as request
    set status = 'expired'
    where request.id = target.id;
    insert into identity.identity_action_events (request_id, event_type, actor_kind)
    values (target.id, 'expired', 'system');
    outcome := 'expired';
  elsif coalesce(p_code, '') !~ '^[0-9]{6}$'
     or identity.email_change_code_hash(target.id, p_code) is distinct from target.code_hash then
    attempts := target.code_attempts + 1;
    if attempts >= 5 then
      update identity.identity_action_requests as request
      set code_attempts = attempts, status = 'failed', failed_at = clock_timestamp(),
          failure_code = 'too_many_attempts'
      where request.id = target.id;
      insert into identity.identity_action_events (
        request_id, event_type, actor_kind, actor_person_id, result_code
      ) values (target.id, 'failed', 'person', person, 'too_many_attempts');
      outcome := 'too_many_attempts';
    else
      update identity.identity_action_requests as request
      set code_attempts = attempts
      where request.id = target.id;
      insert into identity.identity_action_events (request_id, event_type, actor_kind, actor_person_id)
      values (target.id, 'code_rejected', 'person', person);
      outcome := 'wrong_code';
    end if;
  else
    update identity.identity_action_requests as request
    set status = 'applying', confirming_session_id = btrim(p_session_id)
    where request.id = target.id;
    insert into identity.identity_action_events (request_id, event_type, actor_kind, actor_person_id)
    values (target.id, 'confirmed', 'person', person);
    perform system.enqueue_outbox_event(
      'identity_action_request', target.id, 'identity.contact_verified.v1',
      jsonb_build_object('request_id', target.id)
    );
    outcome := 'applying';
  end if;

  perform system.finish_idempotency(
    receipt.receipt_id, case when outcome = 'applying' then 200 else 422 end::smallint,
    'email-change-' || replace(outcome, '_', '-'),
    case when target.id is null then 'person' else 'identity_action_request' end,
    coalesce(target.id, person)
  );
  return query select jsonb_build_object('outcome', outcome), false;
end
$function$;

-- ---------------------------------------------------------------- the worker sends the code

create function identity.prepare_email_change_delivery(p_event_id uuid)
returns table (delivery_state text, request_id uuid, contact text, expires_at timestamptz)
language plpgsql
security definer
set search_path = pg_catalog
as $function$
#variable_conflict use_column
declare
  target identity.identity_action_requests%rowtype;
begin
  if access_control.actor_kind() <> 'worker' then
    raise exception 'worker actor required' using errcode = '42501';
  end if;

  select request.* into target
  from system.outbox_events as event
  join identity.identity_action_requests as request on request.id = event.aggregate_id
  where event.id = p_event_id
    and event.event_type = 'identity.contact_changed.v1'
  for update of request;

  if target.id is null or target.status not in ('initiated', 'awaiting_verification') then
    return query select 'skipped'::text, target.id, null::text, null::timestamptz;
    return;
  end if;
  if target.expires_at <= clock_timestamp() then
    update identity.identity_action_requests as request
    set status = 'expired'
    where request.id = target.id;
    insert into identity.identity_action_events (request_id, event_type, actor_kind)
    values (target.id, 'expired', 'system');
    return query select 'skipped'::text, target.id, null::text, null::timestamptz;
    return;
  end if;

  return query select 'ready'::text, target.id, target.proposed_email::text, target.expires_at;
end
$function$;

-- Recorded before the email leaves: a retry writes a new code, and only the last is valid.
create function identity.record_email_change_code(p_event_id uuid, p_code text)
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  target identity.identity_action_requests%rowtype;
begin
  if access_control.actor_kind() <> 'worker' then
    raise exception 'worker actor required' using errcode = '42501';
  end if;
  if coalesce(p_code, '') !~ '^[0-9]{6}$' then
    raise exception 'a code is six digits' using errcode = '22023';
  end if;

  select request.* into target
  from system.outbox_events as event
  join identity.identity_action_requests as request on request.id = event.aggregate_id
  where event.id = p_event_id
    and event.event_type = 'identity.contact_changed.v1'
  for update of request;
  if target.id is null then
    raise exception 'email change delivery not found' using errcode = 'P0002';
  end if;
  if target.status not in ('initiated', 'awaiting_verification')
     or target.expires_at <= clock_timestamp() then
    return;
  end if;

  update identity.identity_action_requests as request
  set status = 'awaiting_verification',
      delivered_at = clock_timestamp(),
      code_hash = identity.email_change_code_hash(target.id, p_code),
      code_attempts = 0
  where request.id = target.id;
  insert into identity.identity_action_events (request_id, event_type, actor_kind, delivery_channel)
  values (target.id, 'delivered', 'worker', 'email');
end
$function$;

create function identity.fail_email_change_delivery(p_event_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  target identity.identity_action_requests%rowtype;
begin
  if access_control.actor_kind() <> 'worker' then
    raise exception 'worker actor required' using errcode = '42501';
  end if;

  select request.* into target
  from system.outbox_events as event
  join identity.identity_action_requests as request on request.id = event.aggregate_id
  where event.id = p_event_id
    and event.event_type = 'identity.contact_changed.v1'
  for update of request;
  if target.id is null then
    raise exception 'email change delivery not found' using errcode = 'P0002';
  end if;

  if target.status in ('initiated', 'awaiting_verification') then
    update identity.identity_action_requests as request
    set status = 'failed', failed_at = clock_timestamp(), failure_code = 'delivery_failed'
    where request.id = target.id;
    insert into identity.identity_action_events (request_id, event_type, actor_kind, result_code)
    values (target.id, 'failed', 'worker', 'delivery_failed');
  end if;
end
$function$;

-- ---------------------------------------------------------------- the worker applies it

create function identity.prepare_email_change_apply(p_event_id uuid)
returns table (
  apply_state text,
  request_id uuid,
  subject text,
  new_email text,
  previous_email text,
  keep_session text
)
language plpgsql
security definer
set search_path = pg_catalog
as $function$
#variable_conflict use_column
declare
  target identity.identity_action_requests%rowtype;
begin
  if access_control.actor_kind() <> 'worker' then
    raise exception 'worker actor required' using errcode = '42501';
  end if;

  select request.* into target
  from system.outbox_events as event
  join identity.identity_action_requests as request on request.id = event.aggregate_id
  where event.id = p_event_id
    and event.event_type = 'identity.contact_verified.v1'
  for update of request;

  if target.id is null or target.status <> 'applying' then
    return query select 'skipped'::text, target.id, null::text, null::text, null::text, null::text;
    return;
  end if;

  -- Somebody took the address while she was typing the code: nothing is applied.
  if exists (
    select 1 from identity.people as other
    where other.contact_email = target.proposed_email and other.id <> target.person_id
  ) then
    update identity.identity_action_requests as request
    set status = 'failed', failed_at = clock_timestamp(), failure_code = 'contact_changed'
    where request.id = target.id;
    insert into identity.identity_action_events (request_id, event_type, actor_kind, result_code)
    values (target.id, 'failed', 'worker', 'contact_changed');
    return query select 'skipped'::text, target.id, null::text, null::text, null::text, null::text;
    return;
  end if;

  return query
  select 'ready'::text, target.id, account.subject, target.proposed_email::text,
         owner.contact_email::text, target.confirming_session_id
  from identity.access_accounts as account
  join identity.people as owner on owner.id = target.person_id
  where account.id = target.access_account_id;
end
$function$;

-- WorkOS took the address: promote it. Completing twice changes nothing.
create function identity.complete_email_change(p_event_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  target identity.identity_action_requests%rowtype;
begin
  if access_control.actor_kind() <> 'worker' then
    raise exception 'worker actor required' using errcode = '42501';
  end if;

  select request.* into target
  from system.outbox_events as event
  join identity.identity_action_requests as request on request.id = event.aggregate_id
  where event.id = p_event_id
    and event.event_type = 'identity.contact_verified.v1'
  for update of request;
  if target.id is null then
    raise exception 'email change not found' using errcode = 'P0002';
  end if;
  if target.status <> 'applying' then
    return;
  end if;

  update identity.people as owner
  set contact_email = target.proposed_email,
      contact_email_verified_at = clock_timestamp()
  where owner.id = target.person_id;

  update identity.identity_action_requests as request
  set status = 'confirmed', confirmed_at = clock_timestamp()
  where request.id = target.id;
  insert into identity.identity_action_events (request_id, event_type, actor_kind)
  values (target.id, 'applied', 'worker');
end
$function$;

create function identity.fail_email_change_apply(p_event_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  target identity.identity_action_requests%rowtype;
begin
  if access_control.actor_kind() <> 'worker' then
    raise exception 'worker actor required' using errcode = '42501';
  end if;

  select request.* into target
  from system.outbox_events as event
  join identity.identity_action_requests as request on request.id = event.aggregate_id
  where event.id = p_event_id
    and event.event_type = 'identity.contact_verified.v1'
  for update of request;
  if target.id is null then
    raise exception 'email change not found' using errcode = 'P0002';
  end if;

  if target.status = 'applying' then
    update identity.identity_action_requests as request
    set status = 'failed', failed_at = clock_timestamp(), failure_code = 'provider_rejected'
    where request.id = target.id;
    insert into identity.identity_action_events (request_id, event_type, actor_kind, result_code)
    values (target.id, 'failed', 'worker', 'provider_rejected');
  end if;
end
$function$;

-- ---------------------------------------------------------------- ownership and grants

alter function identity.email_change_code_hash(uuid, text) owner to allfit_owner;
alter function identity.own_email_change_document(uuid) owner to allfit_owner;
alter function identity.request_email_change(text, text, text, text, uuid, uuid, bytea)
  owner to allfit_owner;
alter function identity.verify_email_change(text, text, text, text, text, uuid, uuid, bytea)
  owner to allfit_owner;
alter function identity.prepare_email_change_delivery(uuid) owner to allfit_owner;
alter function identity.record_email_change_code(uuid, text) owner to allfit_owner;
alter function identity.fail_email_change_delivery(uuid) owner to allfit_owner;
alter function identity.prepare_email_change_apply(uuid) owner to allfit_owner;
alter function identity.complete_email_change(uuid) owner to allfit_owner;
alter function identity.fail_email_change_apply(uuid) owner to allfit_owner;

revoke all on function identity.email_change_code_hash(uuid, text) from public, allfit_api;
revoke all on function identity.own_email_change_document(uuid) from public, allfit_api;
revoke all on function identity.request_email_change(text, text, text, text, uuid, uuid, bytea)
  from public;
revoke all on function identity.verify_email_change(text, text, text, text, text, uuid, uuid, bytea)
  from public;
revoke all on function identity.prepare_email_change_delivery(uuid) from public;
revoke all on function identity.record_email_change_code(uuid, text) from public;
revoke all on function identity.fail_email_change_delivery(uuid) from public;
revoke all on function identity.prepare_email_change_apply(uuid) from public;
revoke all on function identity.complete_email_change(uuid) from public;
revoke all on function identity.fail_email_change_apply(uuid) from public;

grant execute on function identity.request_email_change(text, text, text, text, uuid, uuid, bytea)
  to allfit_api;
grant execute on function identity.verify_email_change(text, text, text, text, text, uuid, uuid, bytea)
  to allfit_api;
grant execute on function identity.prepare_email_change_delivery(uuid) to allfit_api;
grant execute on function identity.record_email_change_code(uuid, text) to allfit_api;
grant execute on function identity.fail_email_change_delivery(uuid) to allfit_api;
grant execute on function identity.prepare_email_change_apply(uuid) to allfit_api;
grant execute on function identity.complete_email_change(uuid) to allfit_api;
grant execute on function identity.fail_email_change_apply(uuid) to allfit_api;
