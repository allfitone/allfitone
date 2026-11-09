-- Space offers only what is paid in person — `OP-PAY-011`, `OP-PAY-012`, `ADR-048`.
--
-- A plan followed at a distance is a digital service in Apple's eyes (3.1.3), so the app
-- may not sell it. The gym sends a link instead (`HU-STUDIO-088`). Both functions are
-- copied exactly from `20261012140000_a_subscription_has_a_life.sql`, with two changes:
--
-- * the offer is filtered to `delivery_mode = 'in_person'`, in the list and in the
--   subscription, so a remote version answers the same "not found" as one not on offer;
-- * subscribing takes a shared advisory lock on the version before reading it, the other
--   half of the exclusive lock a retirement takes (`20261120090000`). A row lock cannot do
--   this here: `for share` also applies the update policy, which a client never passes.
--
-- Signatures and answers are unchanged, so the API deployed before this migration keeps
-- working against it, and it against the API.

set lock_timeout = '5s';
set statement_timeout = '60s';

/*
 * The published versions of a gym's plans, cheapest first.
 *
 * Which plans are visible is the row policy's decision and not this function's: a client
 * sees published plans, the team sees drafts too. What this adds is the version filter,
 * because a retired version is still readable — somebody is paying it — and must not be
 * offered to somebody who is not.
 */
create or replace function payments.list_organization_plans(
  p_actor_person_id uuid,
  p_organization_id uuid,
  p_limit integer,
  p_cursor_amount_minor bigint,
  p_cursor_version_id uuid
)
returns table (
  plan_id uuid,
  plan_version_id uuid,
  plan_name text,
  version_number integer,
  amount_minor bigint,
  currency_code text,
  billing_period text,
  published_at timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog
as $function$
begin
  if access_control.actor_kind() <> 'person'
     or access_control.person() is distinct from p_actor_person_id then
    raise exception 'person actor mismatch' using errcode = '42501';
  end if;

  if p_limit not between 1 and 101 then
    raise exception 'invalid page limit' using errcode = '22023';
  end if;

  if (p_cursor_amount_minor is null) <> (p_cursor_version_id is null) then
    raise exception 'invalid plan cursor' using errcode = '22023';
  end if;

  perform set_config('app.actor_org_id', p_organization_id::text, true);

  return query
  select plan.id,
         version.id,
         plan.name,
         version.version_number,
         version.amount_minor,
         version.currency_code,
         version.billing_period,
         version.published_at
  from payments.plan_versions as version
  join payments.organization_plans as plan
    on plan.id = version.plan_id
   and plan.organization_id = version.organization_id
  where version.organization_id = p_organization_id
    and version.status = 'published'
    and version.deprecated_at is null
    -- A remote plan is paid through the gym's link, never in the app (ADR-048).
    and version.delivery_mode = 'in_person'
    and (
      p_cursor_amount_minor is null
      or (version.amount_minor, version.id) > (p_cursor_amount_minor, p_cursor_version_id)
    )
  order by version.amount_minor, version.id
  limit p_limit;
end
$function$;

/*
 * Four preconditions, and each one is a different refusal the person can act on:
 * the version must be on offer, she must be a client of that gym, the gym must have
 * somewhere to be paid, and she must not already owe it.
 *
 * It returns what the price is, not where to pay it. The checkout is created server-side
 * with the gym's credential, which this function cannot read and does not need to: a card
 * number never touches Allfit, and neither does the account it goes to.
 */
create or replace function payments.subscribe_to_plan(
  p_actor_person_id uuid,
  p_plan_version_id uuid,
  p_idempotency_key uuid,
  p_command_id uuid,
  p_request_hash bytea
)
returns table (
  subscription_id uuid,
  organization_id uuid,
  plan_version_id uuid,
  plan_name text,
  amount_minor bigint,
  currency_code text,
  billing_period text,
  provider text,
  started boolean,
  replayed boolean
)
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  receipt record;
  offer record;
  notice record;
  new_subscription_id uuid;
begin
  if access_control.actor_kind() <> 'person'
     or access_control.person() is distinct from p_actor_person_id then
    raise exception 'person actor mismatch' using errcode = '42501';
  end if;

  -- Shared with the exclusive lock a retirement takes, and taken before the offer is read:
  -- a price whose retirement committed first is not sold.
  perform pg_advisory_xact_lock_shared(
    hashtextextended('payments.plan_version:' || p_plan_version_id::text, 0)
  );

  select version.id,
         version.organization_id,
         version.amount_minor,
         version.currency_code,
         version.billing_period,
         plan.name as plan_name
    into offer
  from payments.plan_versions as version
  join payments.organization_plans as plan
    on plan.id = version.plan_id
   and plan.organization_id = version.organization_id
  where version.id = p_plan_version_id
    and version.status = 'published'
    and version.deprecated_at is null
    and version.delivery_mode = 'in_person';

  -- A version she cannot see and a version that is not on offer answer the same way. She
  -- is not entitled to learn which of the two it was.
  if offer.id is null then
    raise exception 'plan version not found' using errcode = 'P0002';
  end if;

  if not access_control.has_active_relationship(offer.organization_id) then
    raise exception 'plan version not found' using errcode = 'P0002';
  end if;

  /*
   * Fails closed, and loudly. Without a gateway there is nowhere for the money to go, so
   * a subscription created here would be a row saying somebody owes what cannot be
   * collected — and the gym, not the person, is the one who has to fix it.
   */
  if not exists (
    select 1
    from payments.gateway_connections as connection
    where connection.organization_id = offer.organization_id
      and connection.status = 'active'
  ) then
    raise exception 'this organization cannot take a payment yet' using errcode = 'P0004';
  end if;

  select * into receipt
  from system.begin_idempotency(
    p_actor_person_id, 'OP-PAY-012', p_idempotency_key, p_command_id, p_request_hash
  );

  select connection.provider into notice
  from payments.gateway_connections as connection
  where connection.organization_id = offer.organization_id
    and connection.status = 'active';

  /*
   * The same command arriving twice. Everything in the answer is in the receipt or in the
   * offer, so the row is not read back: that would answer what the subscription looks like
   * *now*, which may already be suspended, instead of what this command did.
   */
  if not receipt.claimed then
    return query
    select receipt.aggregate_id, offer.organization_id, offer.id, offer.plan_name,
           offer.amount_minor, offer.currency_code, offer.billing_period,
           notice.provider, false, true;
    return;
  end if;

  /*
   * After the receipt, deliberately. Checked before it, this conflict answers a retry of
   * the command that created the subscription with "you already have one" — which is
   * exactly the case idempotency exists to handle, and the caller who never saw the first
   * answer has no way to tell that from a real conflict. The test caught this.
   *
   * The partial unique index on a live pair is the real guarantee; this check is only here
   * to name the conflict instead of leaking a constraint violation.
   */
  if exists (
    select 1
    from payments.plan_subscriptions as live
    where live.person_id = p_actor_person_id
      and live.organization_id = offer.organization_id
      and live.status <> 'ended'
  ) then
    raise exception 'this person already has a live subscription with this organization'
      using errcode = 'P0004';
  end if;

  new_subscription_id := extensions.uuid_generate_v7();

  -- `current_period_end` stays null until the provider reports a charge. Allfit does not
  -- decide when a period ends; it records what it is told.
  insert into payments.plan_subscriptions (
    id, person_id, organization_id, plan_version_id, status
  )
  values (
    new_subscription_id, p_actor_person_id, offer.organization_id, offer.id, 'active'
  );

  insert into payments.subscription_events (
    subscription_id, event_type, actor_kind, actor_person_id
  )
  values (new_subscription_id, 'started', 'person', p_actor_person_id);

  perform payments.enqueue_subscription_notice(
    new_subscription_id, 'payments.subscription_started.v1'
  );

  perform system.finish_idempotency(
    receipt.receipt_id, 201::smallint, 'subscription-started',
    'plan_subscription', new_subscription_id
  );

  return query
  select new_subscription_id, offer.organization_id, offer.id, offer.plan_name,
         offer.amount_minor, offer.currency_code, offer.billing_period,
         notice.provider, true, false;
end
$function$;
