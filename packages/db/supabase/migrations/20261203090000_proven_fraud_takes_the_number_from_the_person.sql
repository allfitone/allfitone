-- Proven fraud takes the Founding Member number from the person, and nobody inherits it
-- (`OP-WL-012`, `OP-WL-016`; HU-SP-118, criterion 6; ADR-050, decisions 5 and 11).
--
-- **What changes.** `20261202090000` left the number with the person when her sign-up
-- was marked after her account existed. The owner chose on 15 November 2026 that she
-- loses it, as the story says: a proven fraud keeps neither the badge nor what hangs
-- on the number.
--
-- **Withheld, not released.** The number leaves the sign-up and the person, and stays in
-- `waitlist.settled_founding_numbers`, so the fill passes over it and nobody inherits it.
-- A number given up before the account existed still goes to the next in line.
--
-- **A mark can be a mistake.** The record of the mark keeps the number it withheld.
-- Taking the mark back returns that same number to the sign-up and to the person, and
-- no email announces it: she already had it.
--
-- **What the Backoffice reads.** The mark that stands carries the number it withheld,
-- so the screen can say what taking it back returns.

set lock_timeout = '5s';
set statement_timeout = '60s';

-- ---------------------------------------------------------------------------
-- identity — the number can be taken from the person
-- ---------------------------------------------------------------------------

-- Takes the number from the person who holds it. Only the waitlist's fraud mark calls it.
create function identity.withdraw_founding_number(p_person_id uuid, p_number smallint)
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $function$
begin
  update identity.people as owner
  set founding_member_number = null
  where owner.id = p_person_id
    and owner.founding_member_number = p_number;

  if not found then
    raise exception 'the person does not hold this Founding Member number' using errcode = '23514';
  end if;
end
$function$;

-- ---------------------------------------------------------------------------
-- waitlist — the record of a mark keeps the number it withheld
-- ---------------------------------------------------------------------------

alter table waitlist.signup_events
  add column withheld_founding_number smallint,
  add constraint ck_signup_events_withheld_number check (withheld_founding_number between 1 and 100),
  add constraint ck_signup_events_one_number check (
    released_founding_number is null or withheld_founding_number is null
  ),
  add constraint ck_signup_events_withdrawal_withholds_nothing check (
    event_type <> 'waitlist.signup_fraud_mark_withdrawn.v1' or withheld_founding_number is null
  );

comment on column waitlist.signup_events.withheld_founding_number is
  'The number a mark took from a person. Nobody inherits it; a withdrawal returns it.';

-- The mark that stands says which number it withheld.
create or replace function waitlist.backoffice_signup_projection(p_signup_id uuid)
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
        'previous_discard_reason', event.previous_discard_reason,
        'withheld_founding_number', event.withheld_founding_number
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
    'has_space_account', signup.person_id is not null,
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

-- ---------------------------------------------------------------------------
-- OP-WL-012 — mark a sign-up as fraud
-- ---------------------------------------------------------------------------

create or replace function waitlist.mark_signup_as_fraud(
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
  released smallint;
  withheld smallint;
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

  -- Without an account the number goes to the next in line. With one it is withheld.
  if target.person_id is null then
    released := target.founding_number;
  else
    withheld := target.founding_number;
  end if;

  update waitlist.signups
  set discard_reason = 'fraud',
      founding_number = null,
      founding_assigned_at = null
  where id = p_signup_id;

  -- It stays settled, so the person loses it and nobody inherits it.
  if withheld is not null then
    perform identity.withdraw_founding_number(target.person_id, withheld);
  end if;

  insert into waitlist.signup_events (
    signup_id, event_type, reason, previous_discard_reason, released_founding_number,
    withheld_founding_number, actor_person_id, actor_duty_assignment_id
  ) values (
    p_signup_id, 'waitlist.signup_marked_as_fraud.v1', reason, target.discard_reason,
    released, withheld, p_actor_person_id, duty_id
  );

  -- Only a released number is free. A sign-up without one is never waited on by the fill.
  if released is not null then
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

create or replace function waitlist.withdraw_fraud_mark(
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
  withheld smallint;
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

  select event.previous_discard_reason, event.withheld_founding_number
  into restored, withheld
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

  -- A withheld number went to nobody, so it comes back. No event: no email announces it.
  update waitlist.signups
  set discard_reason = restored,
      founding_number = withheld,
      founding_assigned_at = case when withheld is not null then clock_timestamp() end
  where id = p_signup_id;

  if withheld is not null then
    perform identity.record_founding_number(target.person_id, withheld);
  end if;

  insert into waitlist.signup_events (
    signup_id, event_type, reason, previous_discard_reason, actor_person_id,
    actor_duty_assignment_id
  ) values (
    p_signup_id, 'waitlist.signup_fraud_mark_withdrawn.v1', reason, restored,
    p_actor_person_id, duty_id
  );

  -- Without one to return it is back in line, where its confirmation puts it.
  if withheld is null and target.confirmed_at is not null then
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
-- Ownership and grants
-- ---------------------------------------------------------------------------

alter function identity.withdraw_founding_number(uuid, smallint) owner to allfit_owner;

revoke all on function identity.withdraw_founding_number(uuid, smallint) from public, allfit_api;
