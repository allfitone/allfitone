-- The team reviews the Allfit Space waitlist in the Backoffice, marks a sign-up as fraud
-- and takes that mark back (`OP-WL-011`, `OP-WL-012`, `OP-WL-016`; HU-BO-035; ADR-050,
-- decisions 3 and 5).
--
-- **Who.** A person of the team with the `manage_platform_commercial` duty, in a
-- Backoffice session at AAL2. The duty is checked here, in every function, and the
-- assignment acted under is what the record names.
--
-- **What they read.** Each sign-up with its name, its email, its code, its channel, when
-- it joined and confirmed, its Founding Member number, who invited it, how many of its
-- referrals count, and why it does not count when it was discarded. The keyed hashes of
-- the connection and the device never leave the database: the answer says only how many
-- of a sign-up's referrals share a connection, which is the signal ADR-050 asks for.
--
-- **Marking fraud is recorded.** The sign-up stops counting for whoever invited it, and
-- it gives up its Founding Member number, which goes to the next sign-up in line with its
-- email. The record keeps the reason, the number released and the duty assignment, and it
-- names the sign-up by its identifier alone, so it holds no personal data once the
-- sign-up is deleted.
--
-- **So is taking the mark back.** A mark can be a mistake, so the team withdraws it with
-- a reason. The sign-up returns to what it was before the mark, with two limits: the
-- number it gave up is somebody else's by then, so it waits in line for the next one
-- free; and if its device came to count for the same inviter in the meantime, it returns
-- as a repeated device rather than counting twice.
--
-- **Not here:** whether a sign-up already has an Allfit Space account. Linking is
-- `OP-WL-006` (`TECH-299`), and nothing links yet.

set lock_timeout = '5s';
set statement_timeout = '60s';

-- ---------------------------------------------------------------------------
-- The record of what the team did to a sign-up
-- ---------------------------------------------------------------------------

-- `signup_id` is not a foreign key: a sign-up leaves or is swept, and the record stays.
create table waitlist.signup_events (
  id uuid not null default extensions.uuid_generate_v7(),
  signup_id uuid not null,
  event_type text not null,
  reason text not null,
  previous_discard_reason text,
  released_founding_number smallint,
  actor_person_id uuid not null,
  actor_duty_assignment_id uuid not null,
  occurred_at timestamptz not null default clock_timestamp(),
  constraint pk_signup_events primary key (id),
  constraint fk_signup_events_actor foreign key (actor_person_id) references identity.people (id) on delete restrict,
  constraint fk_signup_events_duty foreign key (actor_duty_assignment_id) references support.platform_duty_assignments (id) on delete restrict,
  constraint ck_signup_events_event_type check (
    event_type in (
      'waitlist.signup_marked_as_fraud.v1', 'waitlist.signup_fraud_mark_withdrawn.v1'
    )
  ),
  constraint ck_signup_events_reason check (
    reason = btrim(reason) and char_length(reason) between 4 and 200 and reason !~ '[[:cntrl:]]'
  ),
  constraint ck_signup_events_previous_discard check (
    previous_discard_reason is null
    or previous_discard_reason in ('self_referral', 'same_device')
  ),
  constraint ck_signup_events_released_number check (released_founding_number between 1 and 100),
  constraint ck_signup_events_withdrawal_releases_nothing check (
    event_type <> 'waitlist.signup_fraud_mark_withdrawn.v1' or released_founding_number is null
  )
);

-- A sign-up is marked, unmarked and marked again: its latest event says where it stands.
create index idx_signup_events_signup
  on waitlist.signup_events (signup_id, occurred_at);

comment on column waitlist.signup_events.previous_discard_reason is
  'Why the sign-up did not count before a mark; what it returns to when the mark is withdrawn.';

alter table waitlist.signup_events owner to allfit_owner;
alter table waitlist.signup_events enable row level security;
alter table waitlist.signup_events force row level security;

create policy signup_events_all_owner on waitlist.signup_events
  for all to allfit_owner using (true) with check (true);

revoke all on waitlist.signup_events from public, allfit_api;

comment on table waitlist.signup_events is
  'Append-only record of what the team did to a waitlist sign-up. Names the sign-up by id only.';

create function waitlist.reject_signup_event_rewrite()
returns trigger
language plpgsql
set search_path = pg_catalog
as $function$
begin
  raise exception 'the record of a waitlist review is append-only' using errcode = '55000';
end
$function$;

create trigger trg_signup_events_append_only
before update or delete on waitlist.signup_events
for each row execute function waitlist.reject_signup_event_rewrite();

-- ---------------------------------------------------------------------------
-- Helpers. None of them is granted to the runtime role.
-- ---------------------------------------------------------------------------

-- Returns the assignment acted under, so the record names it and not a duty that may
-- have lapsed since.
create function waitlist.require_waitlist_reviewer(
  p_actor_person_id uuid,
  p_actor_session_id uuid
)
returns uuid
language plpgsql
stable
security definer
set search_path = pg_catalog
as $function$
declare
  assignment_id uuid;
begin
  if access_control.has_platform_role(p_actor_person_id, p_actor_session_id, 'allfit_admin')
     and access_control.has_platform_duty(
       p_actor_person_id, p_actor_session_id, 'manage_platform_commercial'
     ) then
    select assignment.id into assignment_id
    from support.platform_duty_assignments as assignment
    where assignment.person_id = p_actor_person_id
      and assignment.duty_code = 'manage_platform_commercial'
      and assignment.status = 'active'
      and clock_timestamp() >= assignment.valid_from
      and clock_timestamp() < assignment.valid_to
    order by assignment.valid_to desc
    limit 1;
  end if;

  if assignment_id is null then
    raise exception 'reviewing the waitlist requires an effective commercial duty'
      using errcode = '42501';
  end if;
  if not access_control.acting_person_is(p_actor_person_id) then
    raise exception 'the waitlist is reviewed by the actor of this transaction, not for them'
      using errcode = '42501';
  end if;
  return assignment_id;
end
$function$;

-- Where a sign-up came from: the source its link named, or a referral, or neither.
create function waitlist.signup_channel(p_utm_source text, p_invited boolean)
returns jsonb
language sql
immutable
set search_path = pg_catalog
as $function$
  select case
    when nullif(btrim(p_utm_source), '') is not null
      then jsonb_build_object('kind', 'source', 'source', lower(btrim(p_utm_source)))
    when p_invited then jsonb_build_object('kind', 'referral', 'source', null)
    else jsonb_build_object('kind', 'direct', 'source', null)
  end
$function$;

-- One sign-up as the Backoffice reads it. No hash is part of it.
create function waitlist.backoffice_signup_projection(p_signup_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog
as $function$
  select jsonb_build_object(
    'id', signup.id,
    'name', signup.name,
    'email', signup.email::text,
    'language', signup.language,
    'referral_code', signup.referral_code,
    'joined_at', signup.created_at,
    'confirmed_at', signup.confirmed_at,
    'founding_number', signup.founding_number,
    'channel', waitlist.signup_channel(signup.utm_source, signup.invited_by_signup_id is not null),
    'invited_by', (
      select jsonb_build_object('name', inviter.name, 'referral_code', inviter.referral_code)
      from waitlist.signups as inviter
      where inviter.id = signup.invited_by_signup_id
    ),
    'discard_reason', signup.discard_reason,
    -- The mark that stands, or the withdrawal of the last one: never both.
    'fraud', (
      select jsonb_build_object(
        'reason', event.reason, 'marked_at', event.occurred_at,
        'previous_discard_reason', event.previous_discard_reason
      )
      from waitlist.signup_events as event
      where event.signup_id = signup.id
        and event.event_type = 'waitlist.signup_marked_as_fraud.v1'
        and signup.discard_reason = 'fraud'
      order by event.occurred_at desc, event.id desc
      limit 1
    ),
    'fraud_withdrawal', (
      select jsonb_build_object('reason', event.reason, 'withdrawn_at', event.occurred_at)
      from waitlist.signup_events as event
      where event.signup_id = signup.id
        and event.event_type = 'waitlist.signup_fraud_mark_withdrawn.v1'
        and signup.discard_reason is distinct from 'fraud'
      order by event.occurred_at desc, event.id desc
      limit 1
    ),
    'referrals', waitlist.referral_count(signup.id),
    -- Referrals whose connection is this sign-up's own, or another referral's.
    'referrals_sharing_connection', (
      select count(*)::integer
      from waitlist.signups as invited
      where invited.invited_by_signup_id = signup.id
        and (
          invited.connection_hash = signup.connection_hash
          or exists (
            select 1
            from waitlist.signups as other
            where other.invited_by_signup_id = signup.id
              and other.id <> invited.id
              and other.connection_hash = invited.connection_hash
          )
        )
    )
  )
  from waitlist.signups as signup
  where signup.id = p_signup_id
$function$;

-- The update now reads the sign-up again before it gives the number: a sign-up marked as
-- fraud while this waited for its row is passed over, like one that left.
create or replace function waitlist.fill_founding_numbers()
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

    update waitlist.signups as signup
    set founding_number = free_number,
        founding_assigned_at = clock_timestamp()
    where signup.id = next_id
      and signup.founding_number is null
      and signup.confirmed_at is not null
      and signup.discard_reason is distinct from 'fraud'
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

-- ---------------------------------------------------------------------------
-- OP-WL-011 — list and search the waitlist
-- ---------------------------------------------------------------------------

-- Newest first. A sign-up's identifier is a UUIDv7, so it orders by arrival and is the
-- whole cursor.
create function waitlist.list_backoffice_signups(
  p_actor_person_id uuid,
  p_actor_session_id uuid,
  p_query text,
  p_filter text,
  p_limit integer,
  p_before_id uuid
)
returns table (id uuid, signup jsonb)
language plpgsql
stable
security definer
set search_path = pg_catalog
as $function$
declare
  needle text;
begin
  perform waitlist.require_waitlist_reviewer(p_actor_person_id, p_actor_session_id);

  if p_query is not null then
    needle := lower(btrim(p_query));
    if char_length(needle) < 2 or char_length(needle) > 254 then
      raise exception 'a waitlist search needs at least two characters' using errcode = '22023';
    end if;
    needle := replace(replace(replace(needle, '\', '\\'), '%', '\%'), '_', '\_');
  end if;
  if p_filter is not null
     and p_filter not in ('confirmed', 'unconfirmed', 'founding_members', 'discarded') then
    raise exception 'unknown waitlist filter' using errcode = '22023';
  end if;

  return query
  select signup.id, waitlist.backoffice_signup_projection(signup.id)
  from waitlist.signups as signup
  where (
      needle is null
      or lower(signup.name) like '%' || needle || '%' escape '\'
      or lower(signup.email::text) like '%' || needle || '%' escape '\'
      or lower(signup.referral_code) like '%' || needle || '%' escape '\'
    )
    and (
      p_filter is null
      or (p_filter = 'confirmed' and signup.confirmed_at is not null)
      or (p_filter = 'unconfirmed' and signup.confirmed_at is null)
      or (p_filter = 'founding_members' and signup.founding_number is not null)
      or (p_filter = 'discarded' and signup.discard_reason is not null)
    )
    and (p_before_id is null or signup.id < p_before_id)
  order by signup.id desc
  limit least(greatest(coalesce(p_limit, 25), 1), 101);
end
$function$;

-- The totals of the whole list. Past the twenty largest channels the rest are one row,
-- because a source is whatever a link says.
create function waitlist.read_backoffice_totals(
  p_actor_person_id uuid,
  p_actor_session_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $function$
begin
  perform waitlist.require_waitlist_reviewer(p_actor_person_id, p_actor_session_id);

  return (
    with by_channel as (
      select waitlist.signup_channel(signup.utm_source, signup.invited_by_signup_id is not null)
               as channel,
             count(*)::integer as signups,
             count(signup.confirmed_at)::integer as confirmed
      from waitlist.signups as signup
      group by 1
    ),
    ranked as (
      select by_channel.*,
             row_number() over (
               order by by_channel.signups desc, by_channel.channel ->> 'kind',
                        by_channel.channel ->> 'source'
             ) as position
      from by_channel
    ),
    folded as (
      select case
               when ranked.position <= 20 then ranked.channel
               else jsonb_build_object('kind', 'other', 'source', null)
             end as channel,
             sum(ranked.signups)::integer as signups,
             sum(ranked.confirmed)::integer as confirmed,
             min(ranked.position) as position
      from ranked
      group by 1
    )
    select jsonb_build_object(
      'signups', (select count(*)::integer from waitlist.signups),
      'confirmed', (
        select count(*)::integer from waitlist.signups as signup
        where signup.confirmed_at is not null
      ),
      'founding_members', (
        select count(*)::integer from waitlist.signups as signup
        where signup.founding_number is not null
      ),
      'marked_as_fraud', (
        select count(*)::integer from waitlist.signups as signup
        where signup.discard_reason = 'fraud'
      ),
      'channels', coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'channel', folded.channel, 'signups', folded.signups, 'confirmed', folded.confirmed
          )
          order by folded.position
        )
        from folded
      ), '[]'::jsonb)
    )
  );
end
$function$;

-- ---------------------------------------------------------------------------
-- OP-WL-012 — mark a sign-up as fraud
-- ---------------------------------------------------------------------------

create function waitlist.mark_signup_as_fraud(
  p_actor_person_id uuid,
  p_actor_session_id uuid,
  p_signup_id uuid,
  p_reason text,
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
  duty_id uuid;
  receipt record;
  target waitlist.signups%rowtype;
  reason text := btrim(p_reason);
begin
  duty_id := waitlist.require_waitlist_reviewer(p_actor_person_id, p_actor_session_id);

  if reason is null or char_length(reason) < 4 or char_length(reason) > 200
     or reason ~ '[[:cntrl:]]' then
    raise exception 'a sign-up is marked as fraud with a reason' using errcode = '22023';
  end if;

  -- Locked before its state is read, so two people marking at once leave one record.
  select signup.* into target
  from waitlist.signups as signup
  where signup.id = p_signup_id
  for update;
  if target.id is null then
    raise exception 'waitlist sign-up not found' using errcode = 'P0002';
  end if;

  select * into receipt
  from system.begin_idempotency(
    p_actor_person_id, 'backoffice'::system.command_surface, 'backoffice',
    'OP-WL-012', p_idempotency_key, p_command_id, p_request_hash
  );
  if not receipt.claimed then
    if receipt.aggregate_id is null then
      raise exception 'idempotent fraud mark not found' using errcode = '40001';
    end if;
    return query select waitlist.backoffice_signup_projection(receipt.aggregate_id), true;
    return;
  end if;

  if target.discard_reason = 'fraud' then
    raise exception 'the sign-up is already marked as fraud' using errcode = '55000';
  end if;

  update waitlist.signups
  set discard_reason = 'fraud',
      founding_number = null,
      founding_assigned_at = null
  where id = p_signup_id;

  insert into waitlist.signup_events (
    signup_id, event_type, reason, previous_discard_reason, released_founding_number,
    actor_person_id, actor_duty_assignment_id
  ) values (
    p_signup_id, 'waitlist.signup_marked_as_fraud.v1', reason, target.discard_reason,
    target.founding_number, p_actor_person_id, duty_id
  );

  -- Only a holder frees a number. A sign-up without one is never waited on by the fill.
  if target.founding_number is not null then
    perform waitlist.fill_founding_numbers();
  end if;

  perform system.finish_idempotency(
    receipt.receipt_id, 200::smallint, 'waitlist-signup-marked-as-fraud',
    'waitlist_signup', p_signup_id
  );
  return query select waitlist.backoffice_signup_projection(p_signup_id), false;
end
$function$;

-- ---------------------------------------------------------------------------
-- OP-WL-016 — take a fraud mark back
-- ---------------------------------------------------------------------------

create function waitlist.withdraw_fraud_mark(
  p_actor_person_id uuid,
  p_actor_session_id uuid,
  p_signup_id uuid,
  p_reason text,
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
  duty_id uuid;
  receipt record;
  target waitlist.signups%rowtype;
  restored text;
  reason text := btrim(p_reason);
begin
  duty_id := waitlist.require_waitlist_reviewer(p_actor_person_id, p_actor_session_id);

  if reason is null or char_length(reason) < 4 or char_length(reason) > 200
     or reason ~ '[[:cntrl:]]' then
    raise exception 'a fraud mark is taken back with a reason' using errcode = '22023';
  end if;

  -- Locked before its state is read, so two people acting at once leave one record.
  select signup.* into target
  from waitlist.signups as signup
  where signup.id = p_signup_id
  for update;
  if target.id is null then
    raise exception 'waitlist sign-up not found' using errcode = 'P0002';
  end if;

  select * into receipt
  from system.begin_idempotency(
    p_actor_person_id, 'backoffice'::system.command_surface, 'backoffice',
    'OP-WL-016', p_idempotency_key, p_command_id, p_request_hash
  );
  if not receipt.claimed then
    if receipt.aggregate_id is null then
      raise exception 'idempotent fraud mark withdrawal not found' using errcode = '40001';
    end if;
    return query select waitlist.backoffice_signup_projection(receipt.aggregate_id), true;
    return;
  end if;

  if target.discard_reason is distinct from 'fraud' then
    raise exception 'the sign-up is not marked as fraud' using errcode = '55000';
  end if;

  select event.previous_discard_reason into restored
  from waitlist.signup_events as event
  where event.signup_id = p_signup_id
    and event.event_type = 'waitlist.signup_marked_as_fraud.v1'
  order by event.occurred_at desc, event.id desc
  limit 1;

  -- A device counts once for an inviter: another sign-up may have taken its place since.
  if restored is null and target.invited_by_signup_id is not null
     and target.device_hash is not null and exists (
       select 1
       from waitlist.signups as counted
       where counted.invited_by_signup_id = target.invited_by_signup_id
         and counted.id <> target.id
         and counted.discard_reason is null
         and counted.device_hash = target.device_hash
     ) then
    restored := 'same_device';
  end if;

  update waitlist.signups
  set discard_reason = restored
  where id = p_signup_id;

  insert into waitlist.signup_events (
    signup_id, event_type, reason, previous_discard_reason, actor_person_id,
    actor_duty_assignment_id
  ) values (
    p_signup_id, 'waitlist.signup_fraud_mark_withdrawn.v1', reason, restored,
    p_actor_person_id, duty_id
  );

  -- Back in line for a number, where its confirmation puts it. Its old one is not kept.
  if target.confirmed_at is not null then
    perform waitlist.fill_founding_numbers();
  end if;

  perform system.finish_idempotency(
    receipt.receipt_id, 200::smallint, 'waitlist-signup-fraud-mark-withdrawn',
    'waitlist_signup', p_signup_id
  );
  return query select waitlist.backoffice_signup_projection(p_signup_id), false;
end
$function$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

alter function waitlist.reject_signup_event_rewrite() owner to allfit_owner;
alter function waitlist.require_waitlist_reviewer(uuid, uuid) owner to allfit_owner;
alter function waitlist.signup_channel(text, boolean) owner to allfit_owner;
alter function waitlist.backoffice_signup_projection(uuid) owner to allfit_owner;
alter function waitlist.list_backoffice_signups(uuid, uuid, text, text, integer, uuid)
  owner to allfit_owner;
alter function waitlist.read_backoffice_totals(uuid, uuid) owner to allfit_owner;
alter function waitlist.mark_signup_as_fraud(uuid, uuid, uuid, text, uuid, uuid, bytea)
  owner to allfit_owner;
alter function waitlist.withdraw_fraud_mark(uuid, uuid, uuid, text, uuid, uuid, bytea)
  owner to allfit_owner;

revoke all on function waitlist.reject_signup_event_rewrite() from public, allfit_api;
revoke all on function waitlist.require_waitlist_reviewer(uuid, uuid) from public, allfit_api;
revoke all on function waitlist.signup_channel(text, boolean) from public, allfit_api;
revoke all on function waitlist.backoffice_signup_projection(uuid) from public, allfit_api;
revoke all on function waitlist.list_backoffice_signups(uuid, uuid, text, text, integer, uuid)
  from public;
revoke all on function waitlist.read_backoffice_totals(uuid, uuid) from public;
revoke all on function waitlist.mark_signup_as_fraud(uuid, uuid, uuid, text, uuid, uuid, bytea)
  from public;
revoke all on function waitlist.withdraw_fraud_mark(uuid, uuid, uuid, text, uuid, uuid, bytea)
  from public;

grant execute on function waitlist.list_backoffice_signups(uuid, uuid, text, text, integer, uuid)
  to allfit_api;
grant execute on function waitlist.read_backoffice_totals(uuid, uuid) to allfit_api;
grant execute on function waitlist.mark_signup_as_fraud(uuid, uuid, uuid, text, uuid, uuid, bytea)
  to allfit_api;
grant execute on function waitlist.withdraw_fraud_mark(uuid, uuid, uuid, text, uuid, uuid, bytea)
  to allfit_api;
