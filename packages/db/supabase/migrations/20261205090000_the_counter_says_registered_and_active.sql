-- The referral counter says two figures, registered and active (`OP-WL-001`, `OP-WL-004`;
-- HU-SP-117; ADR-050, decision 6; TECH-334).
--
-- **Why two.** Rewards count active referrals: an account created after the launch and
-- three workouts or meals in its first 14 days (launch strategy v1.2). The page and the
-- emails showed one figure, the confirmed sign-ups, beside the reward levels, which read
-- as progress toward a reward. Registered says who joined; active says who the rewards
-- count.
--
-- **Active is a fact, written once.** `waitlist.signups.active_at` is when a referral
-- became active. It counts once and stays, even if the person stops using the app. Only
-- a sign-up with an account can carry it. Nothing writes it here: the rule that decides
-- it belongs to the rewards (`OP-WL-008`, TECH-301), and before the launch nobody is
-- active.
--
-- **Where it travels.** Joining, «mi link» and the two emails answer `active_referrals`
-- as their last column. Their results change shape, so the four functions are dropped
-- and created again with the same bodies and the same grants.

set lock_timeout = '5s';
set statement_timeout = '60s';

-- ---------------------------------------------------------------------------
-- The fact and its count
-- ---------------------------------------------------------------------------

alter table waitlist.signups
  add column active_at timestamptz,
  add constraint ck_signups_active_linked check (active_at is null or person_id is not null);

comment on column waitlist.signups.active_at is
  'When this referral became active for the rewards. Written once; set by the rewards job.';

-- The referrals of a sign-up that count and are active. Discarded ones are active for nobody.
create function waitlist.active_referral_count(p_signup_id uuid)
returns integer
language sql
stable
security definer
set search_path = pg_catalog
as $function$
  select count(*)::integer
  from waitlist.signups as invited
  where invited.invited_by_signup_id = p_signup_id
    and invited.confirmed_at is not null
    and invited.discard_reason is null
    and invited.active_at is not null
$function$;

-- ---------------------------------------------------------------------------
-- OP-WL-001 — join: a new sign-up has nobody registered and nobody active
-- ---------------------------------------------------------------------------

drop function waitlist.join(
  text, text, text, boolean, text, text, text, text, text, bytea, bytea, uuid, bytea, uuid,
  bytea, smallint
);

create function waitlist.join(
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
returns table (outcome text, referral_code text, referrals integer, active_referrals integer)
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
    return query select 'rate_limited'::text, null::text, null::integer, null::integer;
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
    return query select 'already_listed'::text, null::text, null::integer, null::integer;
    return;
  end if;

  perform waitlist.issue_signup_email(
    created_id, p_confirmation_token_id, p_confirmation_token_hash,
    p_private_token_id, p_private_token_hash, p_token_key_version
  );
  return query select 'joined'::text, created_code, 0, 0;
end
$function$;

-- ---------------------------------------------------------------------------
-- OP-WL-004 — «mi link»
-- ---------------------------------------------------------------------------

drop function waitlist.read_my_link(bytea, bytea);

create function waitlist.read_my_link(p_token_hash bytea, p_connection_hash bytea)
returns table (
  outcome text,
  referral_code text,
  referrals integer,
  language text,
  confirmed boolean,
  founding_number smallint,
  active_referrals integer
)
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  target waitlist.signups%rowtype;
begin
  if octet_length(p_token_hash) is distinct from 32
     or octet_length(p_connection_hash) is distinct from 32 then
    raise exception 'invalid waitlist link' using errcode = '22023';
  end if;

  if not waitlist.consume_rate_window('private_link', p_connection_hash, interval '1 hour', 60) then
    return query select 'rate_limited'::text, null::text, null::integer, null::text,
                        null::boolean, null::smallint, null::integer;
    return;
  end if;

  select signup.* into target
  from waitlist.signup_tokens as token
  join waitlist.signups as signup on signup.id = token.signup_id
  where token.token_hash = p_token_hash
    and token.kind = 'private';

  if target.id is null then
    return query select 'invalid'::text, null::text, null::integer, null::text,
                        null::boolean, null::smallint, null::integer;
    return;
  end if;

  return query select
    'found'::text,
    target.referral_code,
    waitlist.referral_count(target.id),
    target.language,
    target.confirmed_at is not null,
    target.founding_number,
    waitlist.active_referral_count(target.id);
end
$function$;

-- ---------------------------------------------------------------------------
-- Delivery — the two emails that show the counter
-- ---------------------------------------------------------------------------

drop function waitlist.prepare_email_delivery(uuid);

create function waitlist.prepare_email_delivery(p_event_id uuid)
returns table (
  delivery_state text,
  email_kind text,
  recipient_name text,
  recipient_email text,
  language text,
  referral_code text,
  referrals integer,
  confirmation_token_id uuid,
  private_token_id uuid,
  token_key_version smallint,
  confirmation_expires_at timestamptz,
  active_referrals integer
)
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  event system.outbox_events%rowtype;
  target waitlist.signups%rowtype;
  confirmation waitlist.signup_tokens%rowtype;
  private_link waitlist.signup_tokens%rowtype;
  requested_kind text;
begin
  if access_control.actor_kind() <> 'worker' then
    raise exception 'worker actor required' using errcode = '42501';
  end if;

  select outbox.* into event
  from system.outbox_events as outbox
  where outbox.id = p_event_id
    and outbox.event_type = 'waitlist.email_requested.v1';
  requested_kind := event.payload ->> 'kind';

  select signup.* into target
  from waitlist.signups as signup
  where signup.id = event.aggregate_id;

  select token.* into private_link
  from waitlist.signup_tokens as token
  where token.id = (event.payload ->> 'private_token_id')::uuid
    and token.signup_id = target.id
    and token.kind = 'private';

  if requested_kind = 'confirmation' then
    select token.* into confirmation
    from waitlist.signup_tokens as token
    where token.id = (event.payload ->> 'confirmation_token_id')::uuid
      and token.signup_id = target.id
      and token.kind = 'confirmation';
  end if;

  -- The person left, confirmed meanwhile, or a newer email replaced this one.
  if target.id is null
     or private_link.id is null
     or requested_kind not in ('confirmation', 'link')
     or (requested_kind = 'confirmation' and (
       target.confirmed_at is not null
       or confirmation.id is null
       or confirmation.voided_at is not null
       or confirmation.used_at is not null
       or confirmation.expires_at <= clock_timestamp()
     )) then
    return query select 'skipped'::text, null::text, null::text, null::text, null::text,
                        null::text, null::integer, null::uuid, null::uuid, null::smallint,
                        null::timestamptz, null::integer;
    return;
  end if;

  return query select
    'ready'::text,
    requested_kind,
    target.name,
    target.email::text,
    target.language,
    target.referral_code,
    waitlist.referral_count(target.id),
    confirmation.id,
    private_link.id,
    private_link.token_key_version,
    confirmation.expires_at,
    waitlist.active_referral_count(target.id);
end
$function$;

drop function waitlist.prepare_founding_email(uuid);

create function waitlist.prepare_founding_email(p_event_id uuid)
returns table (
  delivery_state text,
  recipient_name text,
  recipient_email text,
  language text,
  referral_code text,
  referrals integer,
  founding_number smallint,
  private_token_id uuid,
  token_key_version smallint,
  active_referrals integer
)
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  event system.outbox_events%rowtype;
  target waitlist.signups%rowtype;
  private_link waitlist.signup_tokens%rowtype;
begin
  if access_control.actor_kind() <> 'worker' then
    raise exception 'worker actor required' using errcode = '42501';
  end if;

  select outbox.* into event
  from system.outbox_events as outbox
  where outbox.id = p_event_id
    and outbox.event_type = 'waitlist.founding_number_assigned.v1';

  select signup.* into target
  from waitlist.signups as signup
  where signup.id = event.aggregate_id;

  select token.* into private_link
  from waitlist.signup_tokens as token
  where token.signup_id = target.id
    and token.kind = 'private'
  order by token.created_at desc, token.id desc
  limit 1;

  -- The person left, or the number is no longer theirs: the email would say what is not true.
  if target.id is null
     or private_link.id is null
     or target.founding_number is distinct from (event.payload ->> 'founding_number')::smallint then
    return query select 'skipped'::text, null::text, null::text, null::text, null::text,
                        null::integer, null::smallint, null::uuid, null::smallint, null::integer;
    return;
  end if;

  return query select
    'ready'::text,
    target.name,
    target.email::text,
    target.language,
    target.referral_code,
    waitlist.referral_count(target.id),
    target.founding_number,
    private_link.id,
    private_link.token_key_version,
    waitlist.active_referral_count(target.id);
end
$function$;

-- ---------------------------------------------------------------------------
-- Ownership and grants
-- ---------------------------------------------------------------------------

alter function waitlist.active_referral_count(uuid) owner to allfit_owner;
alter function waitlist.join(
  text, text, text, boolean, text, text, text, text, text, bytea, bytea, uuid, bytea, uuid,
  bytea, smallint
) owner to allfit_owner;
alter function waitlist.read_my_link(bytea, bytea) owner to allfit_owner;
alter function waitlist.prepare_email_delivery(uuid) owner to allfit_owner;
alter function waitlist.prepare_founding_email(uuid) owner to allfit_owner;

revoke all on function waitlist.active_referral_count(uuid) from public, allfit_api;
revoke all on function waitlist.join(
  text, text, text, boolean, text, text, text, text, text, bytea, bytea, uuid, bytea, uuid,
  bytea, smallint
) from public;
revoke all on function waitlist.read_my_link(bytea, bytea) from public;
revoke all on function waitlist.prepare_email_delivery(uuid) from public;
revoke all on function waitlist.prepare_founding_email(uuid) from public;

grant execute on function waitlist.join(
  text, text, text, boolean, text, text, text, text, text, bytea, bytea, uuid, bytea, uuid,
  bytea, smallint
) to allfit_api;
grant execute on function waitlist.read_my_link(bytea, bytea) to allfit_api;
grant execute on function waitlist.prepare_email_delivery(uuid) to allfit_api;
grant execute on function waitlist.prepare_founding_email(uuid) to allfit_api;
