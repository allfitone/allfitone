-- The team hears that someone confirmed on the waitlist (`OP-WL-002`; ADR-050).
--
-- **One event, when the address is confirmed.** Confirming is the moment a sign-up
-- becomes a real person on the list, so it is the one worth telling the team about: a
-- form filled with an address nobody opens is not news. `waitlist.confirm` now enqueues
-- `waitlist.signup_confirmed.v1` in the transaction that confirms, and the worker posts
-- it to the team's channel.
--
-- **The event names nobody.** Its payload carries the channel the person arrived through
-- (`utm_source`), the language, whether the sign-up counts for somebody who invited it,
-- and how many confirmed sign-ups the list holds with this one. No name and no address:
-- the channel belongs to a third party, and it learns nothing about the person.
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
  confirmed waitlist.signups%rowtype;
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
  returning signup.* into confirmed;

  -- Only the confirmation that changed the sign-up is news for the team.
  if confirmed.id is not null then
    perform system.enqueue_outbox_event(
      'waitlist_signup', confirmed.id, 'waitlist.signup_confirmed.v1',
      jsonb_build_object(
        'utm_source', confirmed.utm_source,
        'language', confirmed.language,
        'referred', confirmed.invited_by_signup_id is not null
          and confirmed.discard_reason is null,
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
