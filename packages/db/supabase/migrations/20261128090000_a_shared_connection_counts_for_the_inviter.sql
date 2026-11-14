-- A shared connection counts for the inviter (`OP-WL-001`; HU-SP-115; ADR-050 invariant
-- 6, as the Allfit Space launch strategy v1.2 of 2026-11-13 changes it).
--
-- **Many real people share one address.** A gym's wifi, an office or a mobile carrier
-- puts them all behind the same public address, so the ceiling of three counting sign-ups
-- per connection in 24 hours discarded friends who joined together from the same place.
-- Rewards now go only to referrals who become active after launch: they create an account
-- and log three workouts or meals in their first 14 days (TECH-301). An address typed by
-- somebody else never gets there, so the ceiling cost real referrals and protected
-- nothing.
--
-- **The connection stays, as a signal.** Every sign-up keeps its keyed connection hash,
-- so the Backoffice can show an inviter whose sign-ups share one, and the team can review
-- them (TECH-302). The inviter's own device and a device that already counts for the
-- inviter are still discarded when the sign-up is written, with the inviter's row locked.
--
-- **Sign-ups the ceiling discarded count again.** They are taken in the order they
-- joined, and one is kept out only when an earlier sign-up from the same device already
-- counts for the same inviter: the rule `join` would have applied without the ceiling.

set lock_timeout = '5s';
set statement_timeout = '60s';

do $migration$
declare
  held record;
begin
  for held in
    select signup.id, signup.invited_by_signup_id, signup.device_hash
    from waitlist.signups as signup
    where signup.discard_reason = 'connection_cap'
    order by signup.created_at, signup.id
  loop
    update waitlist.signups as signup
    set discard_reason = case
      when held.device_hash is not null and exists (
        select 1
        from waitlist.signups as counted
        where counted.invited_by_signup_id = held.invited_by_signup_id
          and counted.discard_reason is null
          and counted.device_hash = held.device_hash
      ) then 'same_device'
    end
    where signup.id = held.id;
  end loop;
end
$migration$;

alter table waitlist.signups drop constraint ck_signups_discard_reason;
alter table waitlist.signups add constraint ck_signups_discard_reason check (
  discard_reason is null
  or discard_reason in ('self_referral', 'same_device', 'fraud')
);

-- ---------------------------------------------------------------------------
-- OP-WL-001 — join the waitlist, without the ceiling per connection
-- ---------------------------------------------------------------------------

create or replace function waitlist.join(
  p_name text,
  p_email text,
  p_language text,
  p_consent boolean,
  p_consent_policy_version text,
  p_inviter_code text,
  p_utm_source text,
  p_utm_medium text,
  p_utm_campaign text,
  p_connection_hash bytea,
  p_device_hash bytea,
  p_confirmation_token_id uuid,
  p_confirmation_token_hash bytea,
  p_private_token_id uuid,
  p_private_token_hash bytea,
  p_token_key_version smallint
)
returns table (outcome text, referral_code text, referrals integer)
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  canonical text := waitlist.canonical_email(p_email);
  inviter waitlist.signups%rowtype;
  discard text;
  created_id uuid;
  created_code text;
  existing_id uuid;
begin
  -- No authorization, no data (Law 1581): this is checked before anything is written.
  if p_consent is not true then
    raise exception 'the waitlist needs the data authorization' using errcode = '22023';
  end if;
  if canonical is null
     or p_name is null
     or p_language is null
     or p_consent_policy_version is null
     or octet_length(p_connection_hash) is distinct from 32
     or (p_device_hash is not null and octet_length(p_device_hash) <> 32)
     or p_confirmation_token_id is null
     or p_private_token_id is null
     or p_confirmation_token_id = p_private_token_id then
    raise exception 'invalid waitlist sign-up' using errcode = '22023';
  end if;

  if not waitlist.consume_rate_window('join', p_connection_hash, interval '1 hour', 10) then
    return query select 'rate_limited'::text, null::text, null::integer;
    return;
  end if;

  select signup.id into existing_id
  from waitlist.signups as signup
  where signup.canonical_email = canonical;

  if existing_id is null then
    -- Locked, so two sign-ups from one device at the same instant cannot both count.
    select signup.* into inviter
    from waitlist.signups as signup
    where signup.referral_code = upper(btrim(p_inviter_code))
    for update;

    if inviter.id is not null then
      if p_device_hash is not null and p_device_hash = inviter.device_hash then
        discard := 'self_referral';
      elsif p_device_hash is not null and exists (
        select 1
        from waitlist.signups as counted
        where counted.invited_by_signup_id = inviter.id
          and counted.discard_reason is null
          and counted.device_hash = p_device_hash
      ) then
        discard := 'same_device';
      end if;
    end if;

    created_code := waitlist.new_referral_code();
    insert into waitlist.signups (
      name, email, canonical_email, language, consent_accepted_at, consent_policy_version,
      referral_code, invited_by_signup_id, discard_reason,
      utm_source, utm_medium, utm_campaign, connection_hash, device_hash
    ) values (
      btrim(p_name), btrim(p_email), canonical, p_language, clock_timestamp(),
      p_consent_policy_version, created_code, inviter.id, discard,
      nullif(btrim(p_utm_source), ''), nullif(btrim(p_utm_medium), ''),
      nullif(btrim(p_utm_campaign), ''), p_connection_hash, p_device_hash
    )
    on conflict (canonical_email) do nothing
    returning id into created_id;
  end if;

  if created_id is null then
    -- The address was already here, or arrived first in a concurrent request.
    select signup.id into existing_id
    from waitlist.signups as signup
    where signup.canonical_email = canonical;
    perform waitlist.issue_signup_email(
      existing_id, p_confirmation_token_id, p_confirmation_token_hash,
      p_private_token_id, p_private_token_hash, p_token_key_version
    );
    return query select 'already_listed'::text, null::text, null::integer;
    return;
  end if;

  perform waitlist.issue_signup_email(
    created_id, p_confirmation_token_id, p_confirmation_token_hash,
    p_private_token_id, p_private_token_hash, p_token_key_version
  );
  return query select 'joined'::text, created_code, 0;
end
$function$;
