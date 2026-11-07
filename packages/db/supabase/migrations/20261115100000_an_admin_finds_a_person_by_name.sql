-- An administrator finds a person by name, and a support read needs no case (ADR-046
-- decisions 4 and 5).
--
-- **The search matched only an exact email, phone or identifier**, always under a case, and
-- answered a masked contact with no name. `support.search_people` now takes part of a name,
-- an email or a phone, or the identifier, and answers up to 25 people in name order with
-- their name and full contact, plus whether there are more. The person file names her and
-- shows her contact too; its masked fields stay for the screens that still read them.
--
-- **Every search is still evidence before content.** One `support.metadata_queries` row
-- per search, with `lookup_kind = 'text'`, a hash of the term and how many people it
-- answered; and one access event per person returned, so each sees it in her own history.
-- Without a trigram index the match scans `identity.people`, which is fine at this size.
--
-- **The case reference is optional** for the support reads: the search, the person file,
-- what a person pays, the charges to follow up and reading a recovery. When given it is
-- still a traceable code. The recovery commands still require one, because each opens a
-- case of its own.

set lock_timeout = '5s';
set statement_timeout = '60s';

alter table support.metadata_queries
  alter column case_reference drop not null,
  drop constraint ck_metadata_queries_case_reference,
  add constraint ck_metadata_queries_case_reference check (
    case_reference is null or case_reference ~ '^[A-Z][A-Z0-9_-]{2,63}$'
  ),
  drop constraint ck_metadata_queries_lookup_kind,
  add constraint ck_metadata_queries_lookup_kind check (
    lookup_kind in ('identifier', 'email', 'phone', 'text')
  );

-- Its old signature took a lookup kind; the API calls only the new one.
drop function support.search_people(uuid, uuid, text, text, text);

-- OP-SUP-005. Part of a name, an email or a phone, or the identifier. The term is matched
-- as text: `%`, `_` and `\` are escaped, so a pattern never lists everybody.
create function support.search_people(
  p_actor_person_id uuid,
  p_actor_session_id uuid,
  p_case_reference text,
  p_query text,
  p_limit integer
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  term text := lower(btrim(coalesce(p_query, '')));
  pattern text;
  found jsonb;
  more boolean;
  answered integer;
begin
  perform support.require_support_diagnostician(p_actor_person_id, p_actor_session_id);

  if char_length(term) < 2 then
    raise exception 'a support search needs at least two characters' using errcode = '22023';
  end if;
  if p_limit is null or p_limit < 1 or p_limit > 25 then
    raise exception 'a support search answers between 1 and 25 people' using errcode = '22023';
  end if;
  if nullif(btrim(p_case_reference), '') !~ '^[A-Z][A-Z0-9_-]{2,63}$' then
    raise exception 'a case reference is a traceable code, never free text' using errcode = '22023';
  end if;

  pattern := '%' || replace(replace(replace(term, '\', '\\'), '%', '\%'), '_', '\_') || '%';

  with matched as (
    select person.id, person.display_name, person.contact_email::text as contact_email,
      person.contact_phone, person.status::text as account_status
    from identity.people as person
    where person.id::text = term
      or lower(person.display_name) like pattern escape '\'
      or lower(person.contact_email::text) like pattern escape '\'
      or person.contact_phone like pattern escape '\'
    order by lower(person.display_name), person.id
    limit p_limit + 1
  ), numbered as (
    select matched.*, row_number() over (order by lower(matched.display_name), matched.id) as position
    from matched
  )
  select
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'person_id', numbered.id,
          'display_name', numbered.display_name,
          'contact_email', numbered.contact_email,
          'contact_phone', numbered.contact_phone,
          'account_status', numbered.account_status
        )
        order by numbered.position
      ) filter (where numbered.position <= p_limit),
      '[]'::jsonb
    ),
    count(*) > p_limit
  into found, more
  from numbered;

  answered := jsonb_array_length(found);

  -- Recorded before the answer travels, and recorded whether or not it matched:
  -- a fruitless search is exactly the one worth being able to review later.
  insert into support.metadata_queries (
    actor_person_id, actor_session_id, case_reference, lookup_kind, lookup_hash, result_count
  ) values (
    p_actor_person_id,
    p_actor_session_id,
    nullif(btrim(p_case_reference), ''),
    'text',
    extensions.digest(term, 'sha256'),
    answered
  );

  -- Every person the answer names was read, so each sees it in her own log first.
  insert into privacy.access_events (
    actor_person_id, subject_person_id, resource, resource_id, purpose, result,
    request_id, access_mode
  )
  select
    p_actor_person_id,
    (match ->> 'person_id')::uuid,
    'support.person_search',
    (match ->> 'person_id')::uuid,
    'support_diagnosis',
    'allowed',
    coalesce(
      nullif(current_setting('app.request_id', true), '')::uuid,
      extensions.uuid_generate_v7()
    ),
    'support_metadata'::privacy.access_mode
  from jsonb_array_elements(found) as match;

  return jsonb_build_object('matches', found, 'has_more', more);
end
$function$;

alter function support.search_people(uuid, uuid, text, text, integer) owner to allfit_owner;
revoke all on function support.search_people(uuid, uuid, text, text, integer) from public;
grant execute on function support.search_people(uuid, uuid, text, text, integer) to allfit_api;

-- `20261104110000`'s view with the name and full contact appended.
create or replace view support.v_support_metadata as
select
  person.id as person_id,
  person.status::text as account_status,
  person.created_at,
  person.activated_at,
  support.mask_email(person.contact_email::text) as contact_email_masked,
  support.mask_phone(person.contact_phone) as contact_phone_masked,
  person.contact_email_verified_at as email_verified_at,
  person.contact_phone_verified_at as phone_verified_at,
  exists (
    select 1 from identity.access_accounts as account where account.person_id = person.id
  ) as has_access_account,
  (
    select min(account.linked_at)
    from identity.access_accounts as account
    where account.person_id = person.id
  ) as access_account_linked_at,
  (
    select count(*)
    from identity.access_sessions as session
    join identity.access_accounts as account on account.id = session.access_account_id
    where account.person_id = person.id
      and session.revoked_at is null
      and session.absolute_expires_at > clock_timestamp()
  ) as active_session_count,
  (
    select max(session.last_activity_at)
    from identity.access_sessions as session
    join identity.access_accounts as account on account.id = session.access_account_id
    where account.person_id = person.id
  ) as last_seen_at,
  (
    select jsonb_build_object('exists', count(*) > 0, 'created_at', min(profile.created_at))
    from identity.professional_profiles as profile
    where profile.person_id = person.id
  ) as professional_profile,
  (
    select count(*)
    from organizations.organization_memberships as membership
    where membership.person_id = person.id
  ) as membership_count,
  (
    select count(*)
    from organizations.organization_memberships as membership
    where membership.person_id = person.id and membership.status = 'active'
  ) as active_membership_count,
  -- The gyms she trains at and has left, never which.
  (
    select jsonb_build_object(
      'active', count(*) filter (where relationship.status = 'active'),
      'ended', count(*) filter (where relationship.status = 'terminated'),
      'last_started_at', max(relationship.started_at),
      'last_ended_at', max(relationship.ended_at)
    )
    from relationships.service_relationships as relationship
    where relationship.person_id = person.id
  ) as relationships,
  -- The permissions she granted by state, never what or to whom.
  (
    select jsonb_build_object(
      'active', count(*) filter (where grant_row.status = 'active'),
      'frozen', count(*) filter (where grant_row.status = 'frozen'),
      'revoked', count(*) filter (where grant_row.status = 'revoked'),
      'last_granted_at', max(grant_row.granted_at),
      'last_revoked_at', max(grant_row.revoked_at)
    )
    from privacy.data_grants as grant_row
    where grant_row.person_id = person.id
  ) as permissions,
  -- Her latest platform subscription; a null status is the free plan, never subscribed.
  (
    select jsonb_build_object(
      'status', latest.status,
      'started_at', latest.started_at,
      'current_period_end', latest.current_period_end
    )
    from (select 1) as anchor
    left join lateral (
      select subscription.status::text as status, subscription.started_at,
             subscription.current_period_end
      from payments.platform_subscriptions as subscription
      where subscription.person_id = person.id
      order by subscription.started_at desc, subscription.id desc
      limit 1
    ) as latest on true
  ) as plan,
  -- Pro as `payments.resolve_pro` decides it, without the gyms that give it.
  (
    select jsonb_build_object(
      'source', case resolved.decision->>'effective_source'
        when 'subscription' then 'subscription'
        when 'organization' then 'organization'
        else 'none'
      end,
      'until', case when resolved.decision->>'effective_source' = 'subscription' then (
        select case when live.status = 'grace' then live.grace_until
                    else live.current_period_end end
        from payments.platform_subscriptions as live
        where live.person_id = person.id
          and (
            (live.status = 'active' and live.current_period_end > clock_timestamp())
            or (live.status = 'grace' and live.grace_until > clock_timestamp())
          )
        limit 1
      ) end
    )
    from (select payments.resolve_pro(person.id) as decision) as resolved
  ) as pro,
  person.display_name,
  person.contact_email::text as contact_email,
  person.contact_phone
from identity.people as person;

-- Each body below is its latest definition with the case reference made optional.

-- `20261104110000`
create or replace function support.person_metadata(
  p_actor_person_id uuid,
  p_actor_session_id uuid,
  p_case_reference text,
  p_person_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  found jsonb;
begin
  perform support.require_support_diagnostician(p_actor_person_id, p_actor_session_id);

  -- Row security counts the blocks as this actor; any other actor would read zeros.
  if access_control.actor_kind() <> 'support'
     or access_control.person() is distinct from p_actor_person_id then
    raise exception 'a person file opens only as the operator asking for it'
      using errcode = '42501';
  end if;

  if nullif(btrim(p_case_reference), '') !~ '^[A-Z][A-Z0-9_-]{2,63}$' then
    raise exception 'a case reference is a traceable code, never free text' using errcode = '22023';
  end if;

  select to_jsonb(metadata) into found
  from support.v_support_metadata as metadata
  where metadata.person_id = p_person_id;

  if found is null then
    raise exception 'person not found in the support projection' using errcode = 'P0002';
  end if;

  -- The read is recorded against the person before the content is returned. The
  -- ritual is the same as everywhere else: if the record fails, the read fails.
  insert into privacy.access_events (
    actor_person_id, subject_person_id, resource, resource_id, purpose, result,
    request_id, access_mode
  ) values (
    p_actor_person_id,
    p_person_id,
    'support.v_support_metadata',
    p_person_id,
    'support_diagnosis',
    'allowed',
    coalesce(
      nullif(current_setting('app.request_id', true), '')::uuid,
      extensions.uuid_generate_v7()
    ),
    'support_metadata'::privacy.access_mode
  );

  return found;
end
$function$;

-- `20261014120000`
create or replace function support.person_payments(
  p_actor_person_id uuid,
  p_actor_session_id uuid,
  p_case_reference text,
  p_person_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  subject identity.people%rowtype;
  pro jsonb;
  subscription payments.platform_subscriptions%rowtype;
  version payments.platform_plan_versions%rowtype;
  plan_name text;
  charges jsonb;
  charge_count integer;
  bonds jsonb;
  subscription_entry jsonb;
begin
  perform support.require_billing_reader(p_actor_person_id, p_actor_session_id);

  -- The same shape the support card asks for, because it is the same obligation: a
  -- read of somebody's data is traceable to the case that justified it.
  if nullif(btrim(p_case_reference), '') !~ '^[A-Z][A-Z0-9_-]{2,63}$' then
    raise exception 'a case reference is a traceable code, never free text' using errcode = '22023';
  end if;

  select * into subject from identity.people as person where person.id = p_person_id;
  if subject.id is null then
    raise exception 'person not found' using errcode = 'P0002';
  end if;

  -- The authority on where Pro comes from, asked about one person. Restating its rule
  -- here would be a second source of truth for the same question.
  pro := payments.resolve_pro(p_person_id);

  /*
   * Her store subscription whatever its state, newest first. `resolve_pro` only looks
   * at the live one, and a complaint is usually about one that is not: criterion 3
   * asks for the suspension and the day it started.
   */
  select * into subscription
  from payments.platform_subscriptions as live
  where live.person_id = p_person_id
  order by live.started_at desc, live.id desc
  limit 1;

  if subscription.id is not null then
    select * into version
    from payments.platform_plan_versions as published
    where published.id = subscription.platform_plan_version_id;

    select plan.name into plan_name
    from payments.platform_plans as plan
    where plan.id = version.platform_plan_id;

    subscription_entry := jsonb_build_object(
      'plan_name', plan_name,
      'version_number', version.version_number,
      'amount_minor', version.amount_minor,
      'currency_code', version.currency_code,
      'billing_period', version.billing_period,
      'store', subscription.store,
      'status', subscription.status,
      'auto_renews', subscription.auto_renews,
      'started_at', subscription.started_at,
      'current_period_end', subscription.current_period_end,
      'grace_until', subscription.grace_until,
      'suspended_at', subscription.suspended_at,
      'ended_at', subscription.ended_at,
      'ended_reason', subscription.ended_reason
    );
  end if;

  -- Every charge, the ones that failed included: criterion 2 is about the failures.
  -- Capped like the team list of a gym's file, and the cap is stated rather than
  -- silently applied.
  select
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'occurred_at', recent.occurred_at,
          'store', recent.store,
          'result', recent.result,
          'failure_code', recent.failure_code,
          'amount_minor', recent.amount_minor,
          'currency_code', recent.currency_code
        )
        order by recent.occurred_at desc, recent.id desc
      ),
      '[]'::jsonb
    )
  into charges
  from (
    select record.*
    from payments.platform_payment_records as record
    where record.person_id = p_person_id
    order by record.occurred_at desc, record.id desc
    limit 100
  ) as recent;

  select count(*)::integer into charge_count
  from payments.platform_payment_records as record
  where record.person_id = p_person_id;

  -- What she pays her gyms. States and dates only: the amount is the gym's price and
  -- the money never passes through here.
  select coalesce(
           jsonb_agg(
             jsonb_build_object(
               'subscription_id', bond.id,
               'organization_id', bond.organization_id,
               'organization_name', organization.display_name,
               'status', bond.status,
               'started_at', bond.started_at,
               'suspended_at', bond.suspended_at,
               'ended_at', bond.ended_at
             )
             order by bond.started_at desc, bond.id desc
           ),
           '[]'::jsonb
         )
  into bonds
  from payments.plan_subscriptions as bond
  join organizations.organizations as organization on organization.id = bond.organization_id
  where bond.person_id = p_person_id;

  -- Recorded before the content travels, against the person it is about.
  insert into privacy.access_events (
    actor_person_id, subject_person_id, resource, resource_id, purpose, result,
    request_id, access_mode
  ) values (
    p_actor_person_id,
    p_person_id,
    'payments.person_payments',
    p_person_id,
    'billing_support',
    'allowed',
    coalesce(
      nullif(current_setting('app.request_id', true), '')::uuid,
      extensions.uuid_generate_v7()
    ),
    'support_metadata'::privacy.access_mode
  );

  return jsonb_build_object(
    'person_id', p_person_id,
    'generated_at', clock_timestamp(),
    'pro', jsonb_build_object(
      'source', pro->>'effective_source',
      'subscription', subscription_entry,
      'organizations', pro->'organizations'
    ),
    'payments', charges,
    'payments_truncated', charge_count > 100,
    'organization_subscriptions', bonds,
    'organization_charges_availability', 'not_modelled'
  );
end
$function$;

-- `20261105100300`
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

  if nullif(btrim(p_case_reference), '') !~ '^[A-Z][A-Z0-9_-]{2,63}$' then
    raise exception 'a case reference is a traceable code, never free text' using errcode = '22023';
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

-- `20260927020000`
create or replace function identity.read_account_recovery(
  p_actor_person_id uuid,
  p_actor_session_id uuid,
  p_case_reference text,
  p_person_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  subject identity.people%rowtype;
  reason text;
begin
  perform identity.require_account_recovery_assistant(p_actor_person_id, p_actor_session_id);
  if nullif(btrim(p_case_reference), '') !~ '^[A-Z][A-Z0-9_-]{2,63}$' then
    raise exception 'a case reference is a traceable code, never free text' using errcode = '22023';
  end if;

  select person.* into subject from identity.people as person where person.id = p_person_id;
  if subject.id is null then
    raise exception 'person not found' using errcode = 'P0002';
  end if;

  reason := identity.account_recovery_unavailable_reason(p_person_id);
  perform identity.record_account_recovery_access(p_actor_person_id, p_person_id);

  return jsonb_build_object(
    'person_id', p_person_id,
    'availability', case when reason is null then 'available' else 'unavailable' end,
    'unavailable_reason', reason,
    'contact_hint', case
      when reason is null then support.mask_email(subject.contact_email::text)
    end,
    'can_start', reason is null
      and p_actor_person_id <> p_person_id
      and not exists (
        select 1 from identity.identity_action_requests as request
        where request.person_id = p_person_id
          and request.status in ('initiated', 'awaiting_verification')
          and request.expires_at > clock_timestamp()
      ),
    'requests', coalesce((
      select jsonb_agg(
        identity.account_recovery_projection(newest.id)
        order by newest.created_at desc, newest.id desc
      )
      from (
        select request.id, request.created_at
        from identity.identity_action_requests as request
        where request.person_id = p_person_id
        order by request.created_at desc, request.id desc
        limit 10
      ) as newest
    ), '[]'::jsonb)
  );
end
$function$;
