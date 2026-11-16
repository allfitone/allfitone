-- The Allfit Space waitlist: joining, confirming the email, and asking for the email
-- again (`OP-WL-001`, `OP-WL-002`, `OP-WL-003`; HU-SP-115 and HU-SP-116; ADR-050).
--
-- **A sign-up is not a person.** It has no account and no `identity.people` row, and it
-- arrives as an anonymous actor through routes only space-web may call. So it lives in a
-- schema of its own, which the retention rule of ADR-050 can sweep without touching a
-- person's data. Founding Member numbers, the link to a Space account and the rewards
-- arrive with the migrations that build them.
--
-- **Nothing here is readable by the runtime role.** Every table is owner-only, and the API
-- and the worker reach them through the functions below. A sign-up holds a name and an
-- email of somebody who has no account to sign in with, so there is no actor a row policy
-- could admit: the functions are the whole surface.
--
-- **The connection and the device are kept as keyed hashes.** The API computes them with
-- a key that is not in the database, so a copy of these tables cannot be turned back
-- into an address. They exist to discard repeated sign-ups, and for nothing else.
--
-- **Tokens are stored as hashes, and derived from their row.** The API derives a token
-- from the row's identifier with a versioned key and sends only its hash; the worker
-- derives it again when it writes the email. The token itself is never stored, here or in
-- the outbox, exactly as invitations already work.
--
-- **A repeated address gets no answer on the page.** `join` answers `already_listed` and
-- returns neither code nor counter: what the person needs goes to their inbox. An address
-- that never confirmed gets the confirmation email again, with a new token that voids the
-- previous one.
--
-- **What does not count** is decided when the sign-up is written, with the inviter's row
-- locked so two sign-ups at the same instant cannot both slip under the ceiling:
-- the inviter's own device, a device that already counts for that inviter, or a fourth
-- counting sign-up for that inviter from one connection within 24 hours. A discarded
-- sign-up is still a sign-up; it only stops counting for whoever invited it.

set lock_timeout = '5s';
set statement_timeout = '60s';

create schema if not exists waitlist authorization allfit_owner;

revoke all on schema waitlist from public;
grant usage on schema waitlist to allfit_api;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table waitlist.signups (
  id uuid not null default extensions.uuid_generate_v7(),
  name text not null,
  email extensions.citext not null,
  canonical_email text not null,
  language text not null,
  consent_accepted_at timestamptz not null,
  consent_policy_version text not null,
  referral_code text not null,
  invited_by_signup_id uuid,
  discard_reason text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  connection_hash bytea not null,
  device_hash bytea,
  created_at timestamptz not null default clock_timestamp(),
  confirmed_at timestamptz,
  constraint pk_signups primary key (id),
  constraint fk_signups_invited_by foreign key (invited_by_signup_id) references waitlist.signups(id) on delete set null,
  constraint uq_signups_canonical_email unique (canonical_email),
  constraint uq_signups_referral_code unique (referral_code),
  constraint ck_signups_name check (
    name = btrim(name) and char_length(name) between 1 and 80 and name !~ '[[:cntrl:]]'
  ),
  constraint ck_signups_email check (char_length(email::text) between 3 and 254),
  constraint ck_signups_canonical_email check (
    canonical_email = lower(canonical_email) and canonical_email ~ '^[^@[:space:]]+@[^@[:space:]]+$'
  ),
  constraint ck_signups_language check (language in ('es', 'en')),
  constraint ck_signups_policy_version check (consent_policy_version ~ '^[A-Za-z0-9._-]{1,32}$'),
  constraint ck_signups_referral_code check (referral_code ~ '^[A-HJKMNP-Z2-9]{4,16}$'),
  constraint ck_signups_not_self_invited check (invited_by_signup_id is distinct from id),
  constraint ck_signups_discard_reason check (
    discard_reason is null
    or discard_reason in ('self_referral', 'same_device', 'connection_cap', 'fraud')
  ),
  constraint ck_signups_utm check (
    (utm_source is null or char_length(utm_source) between 1 and 64)
    and (utm_medium is null or char_length(utm_medium) between 1 and 64)
    and (utm_campaign is null or char_length(utm_campaign) between 1 and 64)
  ),
  constraint ck_signups_connection_hash check (octet_length(connection_hash) = 32),
  constraint ck_signups_device_hash check (device_hash is null or octet_length(device_hash) = 32),
  constraint ck_signups_confirmation check (confirmed_at is null or confirmed_at >= created_at)
);

create index idx_signups_invited_by
  on waitlist.signups (invited_by_signup_id, created_at)
  where invited_by_signup_id is not null and discard_reason is null;

create table waitlist.signup_tokens (
  id uuid not null,
  signup_id uuid not null,
  kind text not null,
  token_hash bytea not null,
  token_key_version smallint not null,
  created_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz,
  used_at timestamptz,
  voided_at timestamptz,
  constraint pk_signup_tokens primary key (id),
  constraint fk_signup_tokens_signup foreign key (signup_id) references waitlist.signups(id) on delete cascade,
  constraint uq_signup_tokens_token_hash unique (token_hash),
  constraint ck_signup_tokens_kind check (kind in ('confirmation', 'private')),
  constraint ck_signup_tokens_token_hash check (octet_length(token_hash) = 32),
  constraint ck_signup_tokens_key_version check (token_key_version > 0),
  -- A confirmation link ends on a clock; a private link ends with its sign-up (ADR-050).
  constraint ck_signup_tokens_expiry check (
    (kind = 'confirmation' and expires_at is not null and expires_at > created_at)
    or (kind = 'private' and expires_at is null and used_at is null)
  )
);

create index idx_signup_tokens_signup
  on waitlist.signup_tokens (signup_id, kind, created_at);

create table waitlist.rate_windows (
  scope text not null,
  scope_hash bytea not null,
  window_started_at timestamptz not null,
  attempt_count integer not null,
  expires_at timestamptz not null,
  constraint pk_rate_windows primary key (scope, scope_hash),
  constraint ck_rate_windows_scope check (scope in ('join', 'email_request', 'confirmation')),
  constraint ck_rate_windows_hash check (octet_length(scope_hash) = 32),
  constraint ck_rate_windows_count check (attempt_count > 0),
  constraint ck_rate_windows_expiry check (expires_at > window_started_at)
);

create index idx_rate_windows_expiry
  on waitlist.rate_windows (expires_at);

alter table waitlist.signups owner to allfit_owner;
alter table waitlist.signup_tokens owner to allfit_owner;
alter table waitlist.rate_windows owner to allfit_owner;

alter table waitlist.signups enable row level security;
alter table waitlist.signups force row level security;
alter table waitlist.signup_tokens enable row level security;
alter table waitlist.signup_tokens force row level security;
alter table waitlist.rate_windows enable row level security;
alter table waitlist.rate_windows force row level security;

create policy signups_all_owner on waitlist.signups
  for all to allfit_owner using (true) with check (true);
create policy signup_tokens_all_owner on waitlist.signup_tokens
  for all to allfit_owner using (true) with check (true);
create policy rate_windows_all_owner on waitlist.rate_windows
  for all to allfit_owner using (true) with check (true);

revoke all on waitlist.signups from public, allfit_api;
revoke all on waitlist.signup_tokens from public, allfit_api;
revoke all on waitlist.rate_windows from public, allfit_api;

-- ---------------------------------------------------------------------------
-- Helpers. None of them is granted to the runtime role.
-- ---------------------------------------------------------------------------

-- One sign-up per mailbox: lower case, without a `+tag`, and without dots for Gmail,
-- which delivers `ana.ruiz` and `anaruiz` to the same inbox. Null when it is not an
-- address at all.
create or replace function waitlist.canonical_email(p_email text)
returns text
language plpgsql
immutable
set search_path = pg_catalog
as $function$
declare
  address text := lower(btrim(p_email));
  local_part text;
  domain_part text;
begin
  if address is null
     or char_length(address) > 254
     or address !~ '^[^@[:space:]]+@[a-z0-9]([a-z0-9.-]*[a-z0-9])?\.[a-z]{2,}$' then
    return null;
  end if;

  local_part := split_part(split_part(address, '@', 1), '+', 1);
  domain_part := split_part(address, '@', 2);
  if domain_part in ('gmail.com', 'googlemail.com') then
    local_part := replace(local_part, '.', '');
    domain_part := 'gmail.com';
  end if;
  if local_part = '' then
    return null;
  end if;

  return local_part || '@' || domain_part;
end
$function$;

-- True while the caller is under the limit, and counts the attempt. It answers instead
-- of raising so the attempt stays counted when the command stops there.
create or replace function waitlist.consume_rate_window(
  p_scope text,
  p_scope_hash bytea,
  p_window interval,
  p_limit integer
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  target waitlist.rate_windows%rowtype;
  observed_at timestamptz := clock_timestamp();
begin
  if octet_length(p_scope_hash) is distinct from 32
     or p_window <= interval '0 seconds'
     or p_limit <= 0 then
    raise exception 'invalid waitlist rate window' using errcode = '22023';
  end if;

  delete from waitlist.rate_windows as stale
  where stale.expires_at <= observed_at;

  insert into waitlist.rate_windows (scope, scope_hash, window_started_at, attempt_count, expires_at)
  values (p_scope, p_scope_hash, observed_at, 1, observed_at + p_window)
  on conflict (scope, scope_hash) do nothing;
  if found then
    return true;
  end if;

  select rate_window.* into target
  from waitlist.rate_windows as rate_window
  where rate_window.scope = p_scope
    and rate_window.scope_hash = p_scope_hash
  for update;

  if target.attempt_count >= p_limit then
    return false;
  end if;

  update waitlist.rate_windows as rate_window
  set attempt_count = rate_window.attempt_count + 1
  where rate_window.scope = p_scope
    and rate_window.scope_hash = p_scope_hash;
  return true;
end
$function$;

-- The counter: sign-ups that joined through this one, confirmed, and count. Computed
-- when read, so a discard lowers it at once.
create or replace function waitlist.referral_count(p_signup_id uuid)
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
$function$;

-- Eight characters from an alphabet without 0, O, 1, I or L: it is read aloud and typed.
create or replace function waitlist.new_referral_code()
returns text
language plpgsql
volatile
security definer
set search_path = pg_catalog
as $function$
declare
  alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  noise bytea;
  candidate text;
begin
  loop
    noise := extensions.gen_random_bytes(8);
    candidate := '';
    for position in 0..7 loop
      candidate := candidate
        || substr(alphabet, 1 + get_byte(noise, position) % char_length(alphabet), 1);
    end loop;
    exit when not exists (
      select 1 from waitlist.signups as taken where taken.referral_code = candidate
    );
  end loop;
  return candidate;
end
$function$;

-- Writes the tokens of the next email to a sign-up and enqueues it: the confirmation
-- while the address is unconfirmed, the link once it is. False when the sign-up already
-- got five emails in a day, so nobody can fill a stranger's inbox by typing their address.
create or replace function waitlist.issue_signup_email(
  p_signup_id uuid,
  p_confirmation_token_id uuid,
  p_confirmation_token_hash bytea,
  p_private_token_id uuid,
  p_private_token_hash bytea,
  p_token_key_version smallint
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  target waitlist.signups%rowtype;
  observed_at timestamptz := clock_timestamp();
begin
  select signup.* into target
  from waitlist.signups as signup
  where signup.id = p_signup_id
  for update;
  if target.id is null then
    return false;
  end if;

  if (
    select count(*)
    from waitlist.signup_tokens as token
    where token.signup_id = target.id
      and token.kind = 'private'
      and token.created_at > observed_at - interval '24 hours'
  ) >= 5 then
    return false;
  end if;

  insert into waitlist.signup_tokens (id, signup_id, kind, token_hash, token_key_version, created_at)
  values (p_private_token_id, target.id, 'private', p_private_token_hash, p_token_key_version, observed_at);

  if target.confirmed_at is not null then
    perform system.enqueue_outbox_event(
      'waitlist_signup', target.id, 'waitlist.email_requested.v1',
      jsonb_build_object('kind', 'link', 'private_token_id', p_private_token_id)
    );
    return true;
  end if;

  -- A new confirmation link voids the one before it (HU-SP-116, criterion 6).
  update waitlist.signup_tokens as token
  set voided_at = observed_at
  where token.signup_id = target.id
    and token.kind = 'confirmation'
    and token.used_at is null
    and token.voided_at is null;

  insert into waitlist.signup_tokens (
    id, signup_id, kind, token_hash, token_key_version, created_at, expires_at
  ) values (
    p_confirmation_token_id, target.id, 'confirmation', p_confirmation_token_hash,
    p_token_key_version, observed_at, observed_at + interval '7 days'
  );

  perform system.enqueue_outbox_event(
    'waitlist_signup', target.id, 'waitlist.email_requested.v1',
    jsonb_build_object(
      'kind', 'confirmation',
      'confirmation_token_id', p_confirmation_token_id,
      'private_token_id', p_private_token_id
    )
  );
  return true;
end
$function$;

-- ---------------------------------------------------------------------------
-- OP-WL-001 — join the waitlist
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
      elsif (
        select count(*)
        from waitlist.signups as counted
        where counted.invited_by_signup_id = inviter.id
          and counted.discard_reason is null
          and counted.connection_hash = p_connection_hash
          and counted.created_at > clock_timestamp() - interval '24 hours'
      ) >= 3 then
        discard := 'connection_cap';
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

-- ---------------------------------------------------------------------------
-- OP-WL-002 — confirm the email
-- ---------------------------------------------------------------------------

create or replace function waitlist.confirm(p_token_hash bytea, p_connection_hash bytea)
returns table (outcome text)
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  target waitlist.signup_tokens%rowtype;
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
    and signup.confirmed_at is null;

  return query select 'confirmed'::text;
end
$function$;

-- ---------------------------------------------------------------------------
-- OP-WL-003 — ask for the waitlist email again
-- ---------------------------------------------------------------------------

-- The answer never says whether the address is on the list: `accepted` either way.
create or replace function waitlist.request_email(
  p_email text,
  p_connection_hash bytea,
  p_confirmation_token_id uuid,
  p_confirmation_token_hash bytea,
  p_private_token_id uuid,
  p_private_token_hash bytea,
  p_token_key_version smallint
)
returns table (outcome text)
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  canonical text := waitlist.canonical_email(p_email);
  existing_id uuid;
begin
  if canonical is null
     or octet_length(p_connection_hash) is distinct from 32
     or p_confirmation_token_id is null
     or p_private_token_id is null
     or p_confirmation_token_id = p_private_token_id then
    raise exception 'invalid waitlist email request' using errcode = '22023';
  end if;

  if not waitlist.consume_rate_window('email_request', p_connection_hash, interval '1 hour', 5) then
    return query select 'rate_limited'::text;
    return;
  end if;

  select signup.id into existing_id
  from waitlist.signups as signup
  where signup.canonical_email = canonical;

  if existing_id is not null then
    perform waitlist.issue_signup_email(
      existing_id, p_confirmation_token_id, p_confirmation_token_hash,
      p_private_token_id, p_private_token_hash, p_token_key_version
    );
  end if;

  return query select 'accepted'::text;
end
$function$;

-- ---------------------------------------------------------------------------
-- Delivery — what the worker needs to write a waitlist email
-- ---------------------------------------------------------------------------

create or replace function waitlist.prepare_email_delivery(p_event_id uuid)
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
  confirmation_expires_at timestamptz
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
                        null::timestamptz;
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
    confirmation.expires_at;
end
$function$;

-- ---------------------------------------------------------------------------
-- Ownership and grants
-- ---------------------------------------------------------------------------

alter function waitlist.canonical_email(text) owner to allfit_owner;
alter function waitlist.consume_rate_window(text, bytea, interval, integer) owner to allfit_owner;
alter function waitlist.referral_count(uuid) owner to allfit_owner;
alter function waitlist.new_referral_code() owner to allfit_owner;
alter function waitlist.issue_signup_email(uuid, uuid, bytea, uuid, bytea, smallint) owner to allfit_owner;
alter function waitlist.join(
  text, text, text, boolean, text, text, text, text, text, bytea, bytea, uuid, bytea, uuid, bytea, smallint
) owner to allfit_owner;
alter function waitlist.confirm(bytea, bytea) owner to allfit_owner;
alter function waitlist.request_email(text, bytea, uuid, bytea, uuid, bytea, smallint) owner to allfit_owner;
alter function waitlist.prepare_email_delivery(uuid) owner to allfit_owner;

revoke all on function waitlist.canonical_email(text) from public;
revoke all on function waitlist.consume_rate_window(text, bytea, interval, integer) from public;
revoke all on function waitlist.referral_count(uuid) from public;
revoke all on function waitlist.new_referral_code() from public;
revoke all on function waitlist.issue_signup_email(uuid, uuid, bytea, uuid, bytea, smallint) from public;
revoke all on function waitlist.join(
  text, text, text, boolean, text, text, text, text, text, bytea, bytea, uuid, bytea, uuid, bytea, smallint
) from public;
revoke all on function waitlist.confirm(bytea, bytea) from public;
revoke all on function waitlist.request_email(text, bytea, uuid, bytea, uuid, bytea, smallint) from public;
revoke all on function waitlist.prepare_email_delivery(uuid) from public;

grant execute on function waitlist.join(
  text, text, text, boolean, text, text, text, text, text, bytea, bytea, uuid, bytea, uuid, bytea, smallint
) to allfit_api;
grant execute on function waitlist.confirm(bytea, bytea) to allfit_api;
grant execute on function waitlist.request_email(text, bytea, uuid, bytea, uuid, bytea, smallint) to allfit_api;
grant execute on function waitlist.prepare_email_delivery(uuid) to allfit_api;
