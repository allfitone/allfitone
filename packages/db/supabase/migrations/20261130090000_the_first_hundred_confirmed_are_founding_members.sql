-- The first hundred confirmed are Founding Members (`OP-WL-002`, `OP-WL-007`; HU-SP-118;
-- ADR-050, decision 5 and invariant 5).
--
-- **A number from 1 to 100, in confirmation order.** Confirming the address is what
-- makes a Founding Member, so the number is given in the transaction that confirms.
-- One rule fills every case: a free number goes to the earliest-confirmed sign-up that
-- holds none and is not marked as fraud. While the hundred fill up, that sign-up is the
-- one confirming. Once they are held, it is whoever has waited longest.
--
-- **A number its holder gives up is not lost.** When the holder leaves the list, the
-- same rule hands the same number to the next sign-up in line, and that person is told.
--
-- **One at a time.** The numbers are filled under one advisory lock, so two
-- confirmations at the same instant cannot read the same free number. The unique index
-- is the invariant; the lock is what keeps it from ever being tested.
--
-- **The email is asked for, never written here.** Each number given enqueues
-- `waitlist.founding_number_assigned.v1`, whose payload is the number alone. The worker
-- reads who holds it when it writes «Eres Founding Member», and a sign-up that left, or
-- no longer holds that number, is skipped.
--
-- **Not here yet:** the deadline after the launch, its reminder, and copying the number
-- to the person's account. They wait for the launch date (`HU-BO-037`). Nothing marks a
-- sign-up as fraud yet either (`TECH-302`): whatever does must clear its number and fill.

set lock_timeout = '5s';
set statement_timeout = '60s';

-- ---------------------------------------------------------------------------
-- The number a sign-up holds
-- ---------------------------------------------------------------------------

alter table waitlist.signups
  add column founding_number smallint,
  add column founding_assigned_at timestamptz,
  add constraint ck_signups_founding_number check (founding_number between 1 and 100),
  add constraint ck_signups_founding_assignment check (
    (founding_number is null) = (founding_assigned_at is null)
  ),
  add constraint ck_signups_founding_confirmed check (
    founding_number is null or confirmed_at is not null
  );

create unique index uidx_signups_founding_number
  on waitlist.signups (founding_number)
  where founding_number is not null;

-- ---------------------------------------------------------------------------
-- Helper. Not granted to the runtime role.
-- ---------------------------------------------------------------------------

-- Gives every free number to the earliest-confirmed sign-up without one, and asks for
-- each one's email. Returns how many it gave; calling it again gives nothing twice.
create function waitlist.fill_founding_numbers()
returns integer
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  free_number smallint;
  next_id uuid;
  given_id uuid;
  given integer := 0;
begin
  perform pg_advisory_xact_lock(hashtextextended('waitlist.founding_numbers', 0));

  loop
    select candidate.number::smallint into free_number
    from generate_series(1, 100) as candidate(number)
    where not exists (
      select 1 from waitlist.signups as holder where holder.founding_number = candidate.number
    )
    order by candidate.number
    limit 1;
    exit when free_number is null;

    select signup.id into next_id
    from waitlist.signups as signup
    where signup.confirmed_at is not null
      and signup.founding_number is null
      and signup.discard_reason is distinct from 'fraud'
    order by signup.confirmed_at, signup.id
    limit 1;
    exit when next_id is null;

    -- The sign-up may have left while this waited for its row: then the next one is read.
    update waitlist.signups as signup
    set founding_number = free_number,
        founding_assigned_at = clock_timestamp()
    where signup.id = next_id
      and signup.founding_number is null
    returning signup.id into given_id;
    continue when given_id is null;

    perform system.enqueue_outbox_event(
      'waitlist_signup', given_id, 'waitlist.founding_number_assigned.v1',
      jsonb_build_object('founding_number', free_number)
    );
    given := given + 1;
  end loop;

  return given;
end
$function$;

-- Deletes a sign-up and keeps only that it existed: the day, the channel, the language.
-- The number it held, if any, goes to the next sign-up in line.
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

  if target.founding_number is not null then
    perform waitlist.fill_founding_numbers();
  end if;
  return true;
end
$function$;

-- ---------------------------------------------------------------------------
-- OP-WL-002 — confirm my email, and learn my number
-- ---------------------------------------------------------------------------

-- The answer gains a column, which `create or replace` cannot do.
drop function waitlist.confirm(bytea, bytea);

create function waitlist.confirm(p_token_hash bytea, p_connection_hash bytea)
returns table (outcome text, founding_number smallint)
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
    return query select 'rate_limited'::text, null::smallint;
    return;
  end if;

  select token.* into target
  from waitlist.signup_tokens as token
  where token.token_hash = p_token_hash
    and token.kind = 'confirmation'
  for update;

  -- Unknown, voided and expired answer alike: the page offers a new email either way.
  if target.id is null or target.voided_at is not null then
    return query select 'invalid'::text, null::smallint;
    return;
  end if;
  if target.used_at is not null then
    return query
      select 'already_confirmed'::text, signup.founding_number
      from waitlist.signups as signup
      where signup.id = target.signup_id;
    return;
  end if;
  if target.expires_at <= observed_at then
    return query select 'invalid'::text, null::smallint;
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
    perform waitlist.fill_founding_numbers();
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

  return query
    select 'confirmed'::text, signup.founding_number
    from waitlist.signups as signup
    where signup.id = target.signup_id;
end
$function$;

-- ---------------------------------------------------------------------------
-- OP-WL-004 — read my link, my counter and my number
-- ---------------------------------------------------------------------------

drop function waitlist.read_my_link(bytea, bytea);

create function waitlist.read_my_link(p_token_hash bytea, p_connection_hash bytea)
returns table (
  outcome text,
  referral_code text,
  referrals integer,
  language text,
  confirmed boolean,
  founding_number smallint
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
                        null::boolean, null::smallint;
    return;
  end if;

  select signup.* into target
  from waitlist.signup_tokens as token
  join waitlist.signups as signup on signup.id = token.signup_id
  where token.token_hash = p_token_hash
    and token.kind = 'private';

  if target.id is null then
    return query select 'invalid'::text, null::text, null::integer, null::text,
                        null::boolean, null::smallint;
    return;
  end if;

  return query select
    'found'::text,
    target.referral_code,
    waitlist.referral_count(target.id),
    target.language,
    target.confirmed_at is not null,
    target.founding_number;
end
$function$;

-- ---------------------------------------------------------------------------
-- Delivery — what the worker needs to write «Eres Founding Member»
-- ---------------------------------------------------------------------------

-- The email carries the newest private link the sign-up already has: each one lasts as
-- long as the sign-up does, so no new token is written for it.
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
  token_key_version smallint
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
                        null::integer, null::smallint, null::uuid, null::smallint;
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
    private_link.token_key_version;
end
$function$;

-- ---------------------------------------------------------------------------
-- Delivery — the team's notice says which number the person took
-- ---------------------------------------------------------------------------

drop function waitlist.prepare_team_notice(uuid);

create function waitlist.prepare_team_notice(p_event_id uuid)
returns table (
  delivery_state text,
  person_name text,
  person_email text,
  utm_source text,
  language text,
  referred boolean,
  confirmed_total integer,
  founding_number smallint
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
                        null::boolean, null::integer, null::smallint;
    return;
  end if;

  return query select
    'ready'::text,
    target.name,
    target.email::text,
    target.utm_source,
    target.language,
    target.invited_by_signup_id is not null and target.discard_reason is null,
    (event.payload ->> 'confirmed_total')::integer,
    target.founding_number;
end
$function$;

-- ---------------------------------------------------------------------------
-- Ownership and grants
-- ---------------------------------------------------------------------------

alter function waitlist.fill_founding_numbers() owner to allfit_owner;
alter function waitlist.forget_signup(uuid) owner to allfit_owner;
alter function waitlist.confirm(bytea, bytea) owner to allfit_owner;
alter function waitlist.read_my_link(bytea, bytea) owner to allfit_owner;
alter function waitlist.prepare_founding_email(uuid) owner to allfit_owner;
alter function waitlist.prepare_team_notice(uuid) owner to allfit_owner;

revoke all on function waitlist.fill_founding_numbers() from public;
revoke all on function waitlist.forget_signup(uuid) from public;
revoke all on function waitlist.confirm(bytea, bytea) from public;
revoke all on function waitlist.read_my_link(bytea, bytea) from public;
revoke all on function waitlist.prepare_founding_email(uuid) from public;
revoke all on function waitlist.prepare_team_notice(uuid) from public;

grant execute on function waitlist.confirm(bytea, bytea) to allfit_api;
grant execute on function waitlist.read_my_link(bytea, bytea) to allfit_api;
grant execute on function waitlist.prepare_founding_email(uuid) to allfit_api;
grant execute on function waitlist.prepare_team_notice(uuid) to allfit_api;

-- ---------------------------------------------------------------------------
-- Whoever confirmed before this migration gets their number, in the same order
-- ---------------------------------------------------------------------------

select waitlist.fill_founding_numbers();
