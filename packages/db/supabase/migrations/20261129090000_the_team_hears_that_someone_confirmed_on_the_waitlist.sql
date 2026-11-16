-- The team hears that someone confirmed on the waitlist (`OP-WL-002`; ADR-050).
--
-- **One event, when the address is confirmed.** Confirming is the moment a sign-up
-- becomes a real person on the list, so it is the one worth telling the team about: a
-- form filled with an address nobody opens is not news. `waitlist.confirm` now enqueues
-- `waitlist.signup_confirmed.v1` in the transaction that confirms, and the worker posts
-- a notice to the founders' private channel.
--
-- **The event names nobody; the notice does.** The owner decided in November 2026 that
-- the founders read who joined: the notice carries the person's name and address. The
-- outbox still holds neither. Its payload is one number, how many confirmed sign-ups the
-- list held with this one, and the worker asks for the rest when it writes the notice,
-- through `waitlist.prepare_team_notice`.
--
-- **Someone who left is never announced.** The function reads the sign-up as it is when
-- the notice is written. If the person left in between, it answers `skipped` and nothing
-- about them leaves the platform. What the channel already holds is outside the list's
-- deletion: the channel's own retention decides how long a notice lives there.
--
-- **Once per sign-up.** A confirmation link confirms once; used again it answers
-- `already_confirmed` and enqueues nothing.

set lock_timeout = '5s';
set statement_timeout = '60s';

create or replace function waitlist.confirm(p_token_hash bytea, p_connection_hash bytea)
returns table (outcome text)
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  target waitlist.signup_tokens%rowtype;
  confirmed_id uuid;
  observed_at timestamptz := clock_timestamp();
begin
  if octet_length(p_token_hash) is distinct from 32
     or octet_length(p_connection_hash) is distinct from 32 then
    raise exception 'invalid waitlist confirmation' using errcode = '22023';
  end if;

  if not waitlist.consume_rate_window('confirmation', p_connection_hash, interval '1 hour', 30) then
    return query select 'rate_limited'::text;
    return;
  end if;

  select token.* into target
  from waitlist.signup_tokens as token
  where token.token_hash = p_token_hash
    and token.kind = 'confirmation'
  for update;

  -- Unknown, voided and expired answer alike: the page offers a new email either way.
  if target.id is null or target.voided_at is not null then
    return query select 'invalid'::text;
    return;
  end if;
  if target.used_at is not null then
    return query select 'already_confirmed'::text;
    return;
  end if;
  if target.expires_at <= observed_at then
    return query select 'invalid'::text;
    return;
  end if;

  update waitlist.signup_tokens as token
  set used_at = observed_at
  where token.id = target.id;

  update waitlist.signups as signup
  set confirmed_at = observed_at
  where signup.id = target.signup_id
    and signup.confirmed_at is null
  returning signup.id into confirmed_id;

  -- Only the confirmation that changed the sign-up is news for the team.
  if confirmed_id is not null then
    perform system.enqueue_outbox_event(
      'waitlist_signup', confirmed_id, 'waitlist.signup_confirmed.v1',
      jsonb_build_object(
        'confirmed_total', (
          select count(*)
          from waitlist.signups as signup
          where signup.confirmed_at is not null
        )
      )
    );
  end if;

  return query select 'confirmed'::text;
end
$function$;

-- ---------------------------------------------------------------------------
-- Delivery — what the worker needs to write the team's notice
-- ---------------------------------------------------------------------------

create function waitlist.prepare_team_notice(p_event_id uuid)
returns table (
  delivery_state text,
  person_name text,
  person_email text,
  utm_source text,
  language text,
  referred boolean,
  confirmed_total integer
)
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  event system.outbox_events%rowtype;
  target waitlist.signups%rowtype;
begin
  if access_control.actor_kind() <> 'worker' then
    raise exception 'worker actor required' using errcode = '42501';
  end if;

  select outbox.* into event
  from system.outbox_events as outbox
  where outbox.id = p_event_id
    and outbox.event_type = 'waitlist.signup_confirmed.v1';

  select signup.* into target
  from waitlist.signups as signup
  where signup.id = event.aggregate_id;

  -- The person left before the team was told: nothing about them is announced.
  if target.id is null then
    return query select 'skipped'::text, null::text, null::text, null::text, null::text,
                        null::boolean, null::integer;
    return;
  end if;

  return query select
    'ready'::text,
    target.name,
    target.email::text,
    target.utm_source,
    target.language,
    target.invited_by_signup_id is not null and target.discard_reason is null,
    (event.payload ->> 'confirmed_total')::integer;
end
$function$;

alter function waitlist.prepare_team_notice(uuid) owner to allfit_owner;
revoke all on function waitlist.prepare_team_notice(uuid) from public;
grant execute on function waitlist.prepare_team_notice(uuid) to allfit_api;
