-- NEW-SUP-BILLING-FOLLOW-UP — the charges to follow up (`HU-BO-005` c1 and c5,
-- `HU-BO-020` c3 and c4).
--
-- The attention panel counts failed charges and suspended subscriptions, and the count
-- led nowhere: a person's payments (`20261014120000`) opened only for somebody whose
-- identifier was already known. This is the list the count stands for.
--
-- **It names payers, so it is a billing read.** `view_billing_metadata` and a traceable
-- case reference, as for one person's payments (`HU-BO-020` c4), and one
-- `privacy.access_events` row per person listed, written before the list travels. If
-- the record fails, the read fails.
--
-- **Only what needs following up.** A person whose latest store subscription is
-- suspended or in its grace period, or who had a charge fail in the last thirty days.
-- Suspended first, then in grace, then the failures, the most recent first within each.
--
-- **Nothing a store could be asked with.** No subscription reference and no transaction
-- id travel: the row says who, the state, since when and why the last charge failed.
-- Each row leads to the person's payments under the same case, where the rest is.

set lock_timeout = '5s';
set statement_timeout = '60s';

create or replace function support.billing_follow_up(
  p_actor_person_id uuid,
  p_actor_session_id uuid,
  p_case_reference text,
  p_limit integer
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  page jsonb;
  listed uuid[];
  more boolean;
begin
  perform support.require_billing_reader(p_actor_person_id, p_actor_session_id);

  if btrim(coalesce(p_case_reference, '')) !~ '^[A-Z][A-Z0-9_-]{2,63}$' then
    raise exception 'a billing read needs a traceable case reference' using errcode = '22023';
  end if;
  if p_limit is null or p_limit not between 1 and 200 then
    raise exception 'a page holds between 1 and 200 rows' using errcode = '22023';
  end if;

  with latest as (
    select distinct on (subscription.person_id) subscription.*
    from payments.platform_subscriptions as subscription
    order by subscription.person_id, subscription.started_at desc, subscription.id desc
  ),
  failures as (
    select record.person_id,
           count(*)::integer as failed_charges,
           max(record.occurred_at) as last_failed_at,
           (array_agg(
              jsonb_build_object(
                'occurred_at', record.occurred_at,
                'failure_code', record.failure_code,
                'amount_minor', record.amount_minor,
                'currency_code', record.currency_code
              )
              order by record.occurred_at desc, record.id desc
            ))[1] as last_failed_charge
    from payments.platform_payment_records as record
    where record.result = 'failed'
      and record.occurred_at >= clock_timestamp() - interval '30 days'
    group by record.person_id
  ),
  candidates as (
    select coalesce(subscription.person_id, failure.person_id) as person_id,
           subscription.status::text as subscription_status,
           subscription.store as store,
           subscription.grace_until,
           subscription.suspended_at,
           plan.name as plan_name,
           coalesce(failure.failed_charges, 0) as failed_charges,
           failure.last_failed_charge,
           case subscription.status::text
             when 'suspended' then 0
             when 'grace' then 1
             else 2
           end as urgency,
           greatest(subscription.suspended_at, failure.last_failed_at) as latest_event_at
    from latest as subscription
    full join failures as failure on failure.person_id = subscription.person_id
    left join payments.platform_plan_versions as version
      on version.id = subscription.platform_plan_version_id
    left join payments.platform_plans as plan on plan.id = version.platform_plan_id
    where subscription.status::text in ('suspended', 'grace')
       or failure.person_id is not null
  ),
  ranked as (
    select candidates.*,
           row_number() over (
             order by urgency, latest_event_at desc nulls last, person_id
           ) as position
    from candidates
  )
  select
    jsonb_agg(
      jsonb_build_object(
        'person_id', ranked.person_id,
        'subscription_status', ranked.subscription_status,
        'plan_name', ranked.plan_name,
        'store', ranked.store,
        'grace_until', ranked.grace_until,
        'suspended_at', ranked.suspended_at,
        'failed_charges', ranked.failed_charges,
        'last_failed_charge', ranked.last_failed_charge
      )
      order by ranked.position
    ) filter (where ranked.position <= p_limit),
    array_agg(ranked.person_id order by ranked.position) filter (where ranked.position <= p_limit),
    count(*) > p_limit
  into page, listed, more
  from ranked;

  -- Recorded before the content travels, against each person it names.
  insert into privacy.access_events (
    actor_person_id, subject_person_id, resource, resource_id, purpose, result,
    request_id, access_mode
  )
  select
    p_actor_person_id,
    listed_person,
    'payments.billing_follow_up',
    listed_person,
    'billing_support',
    'allowed',
    coalesce(
      nullif(current_setting('app.request_id', true), '')::uuid,
      extensions.uuid_generate_v7()
    ),
    'support_metadata'::privacy.access_mode
  from unnest(coalesce(listed, array[]::uuid[])) as listed_person;

  return jsonb_build_object(
    'generated_at', clock_timestamp(),
    'window_days', 30,
    'items', coalesce(page, '[]'::jsonb),
    'has_more', coalesce(more, false)
  );
end
$function$;

alter function support.billing_follow_up(uuid, uuid, text, integer) owner to allfit_owner;
revoke all on function support.billing_follow_up(uuid, uuid, text, integer) from public;
grant execute on function support.billing_follow_up(uuid, uuid, text, integer) to allfit_api;
