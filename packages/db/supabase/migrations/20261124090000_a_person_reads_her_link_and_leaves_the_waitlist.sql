-- «Mi link» and leaving the Allfit Space waitlist (`OP-WL-004`, `OP-WL-005`; HU-SP-117
-- and HU-SP-123; ADR-050, decisions 4 and 8).
--
-- **The private link is the only credential a sign-up has.** Every waitlist email carries
-- one, and each lasts as long as the sign-up does. Holding one reads the person's own
-- code and counter, and lets them leave. It reads nothing about the people they invited:
-- the counter is a number, never names or addresses.
--
-- **Leaving deletes the sign-up at once** (Law 1581: whoever authorizes may revoke). The
-- row goes with its tokens, so every link the person ever received stops working, and
-- the people they invited keep their own sign-ups and stop counting for anyone. An email
-- still waiting in the outbox finds no sign-up and is skipped.
--
-- **What survives is a count.** Before a sign-up is deleted it is added to a table of
-- daily totals by channel and language, with no personal data. The strategy measures
-- demand by channel, and a person leaving must not erase that they once came. The
-- 90-day sweep will delete through the same function.

set lock_timeout = '5s';
set statement_timeout = '60s';

-- ---------------------------------------------------------------------------
-- Daily totals of sign-ups that are no longer here
-- ---------------------------------------------------------------------------

create table waitlist.departed_daily_totals (
  joined_on date not null,
  utm_source text not null,
  language text not null,
  signups integer not null,
  confirmed integer not null,
  constraint pk_departed_daily_totals primary key (joined_on, utm_source, language),
  constraint ck_departed_daily_totals_source check (char_length(utm_source) <= 64),
  constraint ck_departed_daily_totals_language check (language in ('es', 'en')),
  constraint ck_departed_daily_totals_counts check (signups > 0 and confirmed between 0 and signups)
);

alter table waitlist.departed_daily_totals owner to allfit_owner;
alter table waitlist.departed_daily_totals enable row level security;
alter table waitlist.departed_daily_totals force row level security;

create policy departed_daily_totals_all_owner on waitlist.departed_daily_totals
  for all to allfit_owner using (true) with check (true);

revoke all on waitlist.departed_daily_totals from public, allfit_api;

-- Reading «mi link» and leaving share one limit per connection.
alter table waitlist.rate_windows drop constraint ck_rate_windows_scope;
alter table waitlist.rate_windows add constraint ck_rate_windows_scope check (scope in ('join', 'email_request', 'confirmation', 'private_link'));

-- ---------------------------------------------------------------------------
-- Helpers. Not granted to the runtime role.
-- ---------------------------------------------------------------------------

-- Deletes a sign-up and keeps only that it existed: the day, the channel, the language.
create or replace function waitlist.forget_signup(p_signup_id uuid)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  target waitlist.signups%rowtype;
begin
  delete from waitlist.signups as signup
  where signup.id = p_signup_id
  returning signup.* into target;
  if target.id is null then
    return false;
  end if;

  insert into waitlist.departed_daily_totals (joined_on, utm_source, language, signups, confirmed)
  values (
    (target.created_at at time zone 'America/Bogota')::date,
    coalesce(target.utm_source, ''),
    target.language,
    1,
    case when target.confirmed_at is null then 0 else 1 end
  )
  on conflict (joined_on, utm_source, language) do update
  set signups = waitlist.departed_daily_totals.signups + 1,
      confirmed = waitlist.departed_daily_totals.confirmed + excluded.confirmed;
  return true;
end
$function$;

-- ---------------------------------------------------------------------------
-- OP-WL-004 — read my link and my counter
-- ---------------------------------------------------------------------------

create or replace function waitlist.read_my_link(p_token_hash bytea, p_connection_hash bytea)
returns table (
  outcome text,
  referral_code text,
  referrals integer,
  language text,
  confirmed boolean
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
    return query select 'rate_limited'::text, null::text, null::integer, null::text, null::boolean;
    return;
  end if;

  select signup.* into target
  from waitlist.signup_tokens as token
  join waitlist.signups as signup on signup.id = token.signup_id
  where token.token_hash = p_token_hash
    and token.kind = 'private';

  if target.id is null then
    return query select 'invalid'::text, null::text, null::integer, null::text, null::boolean;
    return;
  end if;

  return query select
    'found'::text,
    target.referral_code,
    waitlist.referral_count(target.id),
    target.language,
    target.confirmed_at is not null;
end
$function$;

-- ---------------------------------------------------------------------------
-- OP-WL-005 — leave the waitlist
-- ---------------------------------------------------------------------------

create or replace function waitlist.leave(p_token_hash bytea, p_connection_hash bytea)
returns table (outcome text)
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  target_id uuid;
begin
  if octet_length(p_token_hash) is distinct from 32
     or octet_length(p_connection_hash) is distinct from 32 then
    raise exception 'invalid waitlist link' using errcode = '22023';
  end if;

  if not waitlist.consume_rate_window('private_link', p_connection_hash, interval '1 hour', 60) then
    return query select 'rate_limited'::text;
    return;
  end if;

  select token.signup_id into target_id
  from waitlist.signup_tokens as token
  where token.token_hash = p_token_hash
    and token.kind = 'private';

  -- A link whose sign-up already left answers like one that never existed.
  if target_id is null or not waitlist.forget_signup(target_id) then
    return query select 'invalid'::text;
    return;
  end if;

  return query select 'left'::text;
end
$function$;

-- ---------------------------------------------------------------------------
-- Ownership and grants
-- ---------------------------------------------------------------------------

alter function waitlist.forget_signup(uuid) owner to allfit_owner;
alter function waitlist.read_my_link(bytea, bytea) owner to allfit_owner;
alter function waitlist.leave(bytea, bytea) owner to allfit_owner;

revoke all on function waitlist.forget_signup(uuid) from public;
revoke all on function waitlist.read_my_link(bytea, bytea) from public;
revoke all on function waitlist.leave(bytea, bytea) from public;

grant execute on function waitlist.read_my_link(bytea, bytea) to allfit_api;
grant execute on function waitlist.leave(bytea, bytea) to allfit_api;
