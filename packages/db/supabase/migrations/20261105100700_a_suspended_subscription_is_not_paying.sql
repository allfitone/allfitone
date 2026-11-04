-- A suspended subscription is not somebody paying — `HU-BO-013` c4 and `HU-BO-004` c3.
--
-- A gym's file said «N personas lo pagan» and the business panel counted «planes de
-- gimnasio activos» with `status <> 'ended'`, so a suspended subscription — a client
-- whose payment failed, or whose gym is suspended — was counted as paying. Both now
-- count `active` only. Nothing else in either function changes: each is restated from
-- the definition in force, with that one condition, as `20261018130000` did.

set lock_timeout = '5s';
set statement_timeout = '60s';

CREATE OR REPLACE FUNCTION organizations.read_backoffice_organization(p_actor_person_id uuid, p_actor_session_id uuid, p_organization_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  target organizations.organizations%rowtype;
  type_label text;
  natural_person boolean;
  owner_entry jsonb;
  team_entries jsonb := '[]'::jsonb;
  site_entries jsonb;
  active_count integer;
  served_active integer;
  plan_entries jsonb;
  payment_method jsonb;
  connection payments.gateway_connections%rowtype;
  pro_published boolean;
  served_terminated integer;
  terminated_count integer;
  member record;
  trace uuid := coalesce(
    nullif(current_setting('app.request_id', true), '')::uuid,
    extensions.uuid_generate_v7()
  );
begin
  perform organizations.require_organization_directory_reader(p_actor_person_id, p_actor_session_id);

  select organization.* into target
  from organizations.organizations as organization
  where organization.id = p_organization_id;
  if target.id is null then
    raise exception 'organization not found' using errcode = 'P0002';
  end if;

  select organization_type.name into type_label
  from organizations.organization_types as organization_type
  where organization_type.code = target.type_code;
  natural_person := target.responsible_party->>'party_kind' = 'natural_person';

  select count(*) filter (where membership.status = 'active'),
         count(*) filter (where membership.status = 'terminated')
  into active_count, terminated_count
  from organizations.organization_memberships as membership
  where membership.organization_id = p_organization_id;

  -- The people it serves, counted the way the team is. A relationship that ended is
  -- kept apart rather than dropped: criterion 3 asks for the state as well.
  select count(*) filter (where relationship.status = 'active'),
         count(*) filter (where relationship.status = 'terminated')
  into served_active, served_terminated
  from relationships.service_relationships as relationship
  where relationship.organization_id = p_organization_id;

  select jsonb_build_object(
           'person_id', membership.person_id,
           'membership_id', membership.id,
           'since', membership_role.valid_from
         )
  into owner_entry
  from organizations.organization_memberships as membership
  join organizations.membership_roles as membership_role
    on membership_role.membership_id = membership.id
   and membership_role.role_code = 'owner'
   and membership_role.valid_to is null
  where membership.organization_id = p_organization_id
    and membership.status = 'active'
  order by membership_role.valid_from desc
  limit 1;

  -- The owner is listed first, so a truncated team never leaves out the one member
  -- the file already named.
  for member in
    select listed.*
    from (
      select membership.id as membership_id,
             membership.person_id,
             membership.joined_at,
             coalesce((
               select array_agg(
                 membership_role.role_code
                 order by case membership_role.role_code
                   when 'owner' then 1
                   when 'admin' then 2
                   when 'coach' then 3
                   else 4
                 end
               )
               from organizations.membership_roles as membership_role
               where membership_role.membership_id = membership.id
                 and membership_role.valid_from <= statement_timestamp()
                 and membership_role.valid_to is null
             ), array[]::text[]) as roles
      from organizations.organization_memberships as membership
      where membership.organization_id = p_organization_id
        and membership.status = 'active'
    ) as listed
    order by ('owner' = any(listed.roles)) desc, listed.joined_at, listed.membership_id
    limit 200
  loop
    insert into privacy.access_events (
      actor_person_id, subject_person_id, resource, resource_id, purpose, result,
      request_id, access_mode
    ) values (
      p_actor_person_id, member.person_id, 'organizations.organization_memberships',
      member.membership_id, 'support_diagnosis', 'allowed', trace,
      'support_metadata'::privacy.access_mode
    );
    team_entries := team_entries || jsonb_build_array(jsonb_build_object(
      'membership_id', member.membership_id,
      'person_id', member.person_id,
      'roles', to_jsonb(member.roles),
      'joined_at', member.joined_at
    ));
  end loop;

  select coalesce(
           jsonb_agg(
             jsonb_build_object(
               'site_id', site.id,
               'name', site.name,
               'address', case when natural_person then null else site.address end,
               'address_withheld', natural_person and site.address is not null,
               'status', site.status
             )
             order by site.created_at, site.id
           ),
           '[]'::jsonb
         )
  into site_entries
  from organizations.organization_sites as site
  where site.organization_id = p_organization_id;

  /*
   * Criterion 4: the published plans and their subscribers. A draft is not an offer
   * and does not appear; the price shown is the live version, which is the one a new
   * subscriber would agree to, and a plan whose version was deprecated keeps the
   * subscribers it already has.
   */
  select coalesce(
           jsonb_agg(
             jsonb_build_object(
               'plan_id', offer.plan_id,
               'name', offer.name,
               'version_id', offer.version_id,
               'version_number', offer.version_number,
               'amount_minor', offer.amount_minor,
               'currency_code', offer.currency_code,
               'billing_period', offer.billing_period,
               'subscribers', offer.subscribers
             )
             order by offer.name, offer.plan_id
           ),
           '[]'::jsonb
         )
  into plan_entries
  from (
    select plan.id as plan_id,
           plan.name,
           version.id as version_id,
           version.version_number,
           version.amount_minor,
           version.currency_code,
           version.billing_period,
           (
             select count(*)::integer
             from payments.plan_subscriptions as subscription
             where subscription.plan_version_id = version.id
               and subscription.status = 'active'
           ) as subscribers
    from payments.organization_plans as plan
    join payments.plan_versions as version
      on version.plan_id = plan.id
     and version.organization_id = plan.organization_id
    where plan.organization_id = p_organization_id
      and plan.status = 'published'
      and version.status = 'published'
      and version.deprecated_at is null
  ) as offer;

  /*
   * Criterion 5: whether it can be paid, and nothing else. The account reference and
   * the vault key are in `payments.gateway_credentials`, which has no policy for this
   * reader at all — the criterion is «sin ver ninguna credencial», and the way to
   * honour it is to be unable to read them rather than to remember not to select them.
   */
  -- No row leaves every field null, which is the whole answer: not connected.
  select * into connection
  from payments.gateway_connections as live
  where live.organization_id = p_organization_id
    and live.status = 'active';

  payment_method := jsonb_build_object(
    'connected', connection.id is not null,
    'provider', connection.provider,
    'connected_at', connection.connected_at
  );

  -- Criterion 6. By `ADR-043` there is no per-gym switch: every active gym gives Pro
  -- to the people it serves, as long as a paid Pro version is published at all. So the
  -- honest answer is derived, not stored, and it is the same condition
  -- `payments.resolve_pro` resolves by.
  select exists (
    select 1
    from payments.platform_plan_versions as version
    join payments.platform_plans as plan on plan.id = version.platform_plan_id
    where plan.code = 'pro'
      and plan.plan_kind = 'paid'
      and version.status = 'published'
  )
  into pro_published;

  return jsonb_build_object(
    'organization', jsonb_build_object(
      'organization_id', target.id,
      'display_name', target.display_name,
      'type_code', target.type_code,
      'type_name', type_label,
      'status', target.status,
      'party_kind', target.responsible_party->>'party_kind',
      'legal_name', case when natural_person then null else target.legal_name end,
      'created_at', target.created_at,
      'claimed_at', target.claimed_at,
      'cancelled_at', target.cancelled_at
    ),
    'owner', owner_entry,
    'team', team_entries,
    'team_counts', jsonb_build_object('active', active_count, 'terminated', terminated_count),
    'team_truncated', active_count > 200,
    'sites', site_entries,
    'people_served', served_active,
    'relationship_counts',
      jsonb_build_object('active', served_active, 'terminated', served_terminated),
    'plans', plan_entries,
    'payment_method', payment_method,
    'guest_quota', organizations.guest_quota_projection(p_organization_id),
    'suspension', organizations.organization_suspension_projection(p_organization_id),
    'premium', jsonb_build_object(
      'gives_pro', target.status = 'active' and pro_published,
      'reason', case
        when not pro_published then 'no_published_pro_version'
        when target.status <> 'active' then 'organization_not_active'
        else null
      end
    )
  );
end
$function$;

CREATE OR REPLACE FUNCTION support.read_business_panel(p_actor_person_id uuid, p_actor_session_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  minimum constant integer := 5;
  now_at timestamptz := clock_timestamp();
  week_from timestamptz;
  month_from timestamptz;
  registered integer;
  arrived integer;
  active integer;
  studio_active integer;
  gyms integer;
  operating integer;
  unclaimed integer;
  pro_published boolean;
  pro_paid integer;
  pro_suspended integer;
  pro_lapsed integer;
  pro_open integer;
  pro_by_gym integer;
  gym_subscriptions integer;
  billed jsonb;
  payers integer;
begin
  perform support.require_platform_metrics_reader(p_actor_person_id, p_actor_session_id);

  week_from := now_at - interval '7 days';
  month_from := date_trunc('month', now_at);

  -- Somebody who closed their account is not a registered person any more, in this
  -- count or in the arrivals one.
  select
    count(*) filter (where person.status <> 'closed'),
    count(*) filter (where person.status <> 'closed' and person.created_at >= week_from)
  into registered, arrived
  from identity.people as person;

  -- Training is what being active means for a person. The app being open is not.
  select count(distinct session.person_id)
  into active
  from execution.executed_sessions as session
  join identity.people as person on person.id = session.person_id
  where session.started_at >= week_from
    and person.status <> 'closed';

  -- Professionals working in Studio, which is a different question from people
  -- training and stays its own figure.
  select count(distinct account.person_id)
  into studio_active
  from identity.access_sessions as session
  join identity.access_accounts as account on account.id = session.access_account_id
  where session.surface = 'studio'
    and account.person_id is not null
    and session.last_activity_at >= week_from;

  -- Operating means somebody is actually running it: claimed, not closed, and with a
  -- live membership. An unclaimed gym exists on paper and is counted apart.
  select
    count(*),
    count(*) filter (
      where organization.status = 'active'
        and exists (
          select 1
          from organizations.organization_memberships as membership
          where membership.organization_id = organization.id
            and membership.status = 'active'
        )
    ),
    count(*) filter (where organization.status = 'unclaimed')
  into gyms, operating, unclaimed
  from organizations.organizations as organization;

  /*
   * Pro, by the route the person has it. The two conditions and their precedence come
   * from `payments.resolve_pro`, restated in set form because resolving per person
   * would mean one function call per row of the platform. `T-SUP-BIZ-01` pins the two
   * against each other, so the restatement cannot drift away from the authority.
   */
  select exists (
    select 1
    from payments.platform_plan_versions as version
    join payments.platform_plans as plan on plan.id = version.platform_plan_id
    where plan.code = 'pro'
      and plan.plan_kind = 'paid'
      and version.status = 'published'
  )
  into pro_published;

  /*
   * Criterion 1 of `HU-BO-020`: what Allfit still has open, by whether it is still
   * collecting on it. `uidx_platform_subscriptions_live` allows one subscription per
   * person that is not `ended`, so these are counts of people as much as of rows, and
   * the three states add up to the total exactly.
   *
   * `suspended` is the store's own word and means here what it means in the billing
   * notice of `HU-BO-005`. The third bucket is the one nobody had named: a
   * subscription whose period or grace ran out while the store has not yet said
   * whether it renewed or stopped. Only the store moves that status, so this is a
   * standing state and not a race. Folding it into `suspended` would claim the store
   * reported something it never did; leaving it out made the total disagree with its
   * own parts, which is how it went unnoticed.
   */
  with open_subscription as (
    select
      subscription.status,
      (subscription.status = 'active' and subscription.current_period_end > now_at)
        or (subscription.status = 'grace' and subscription.grace_until > now_at)
        as collecting
    from payments.platform_subscriptions as subscription
    where subscription.status <> 'ended'
  )
  select
    count(*) filter (where collecting)::integer,
    count(*) filter (where not collecting and status = 'suspended')::integer,
    count(*) filter (where not collecting and status <> 'suspended')::integer,
    count(*)::integer
  into pro_paid, pro_suspended, pro_lapsed, pro_open
  from open_subscription;

  -- The store subscription wins, so somebody who pays Allfit is never counted here
  -- as well: a person is on one route, not two.
  if pro_published then
    select count(distinct relationship.person_id)
    into pro_by_gym
    from relationships.service_relationships as relationship
    join organizations.organizations as organization
      on organization.id = relationship.organization_id
    join identity.people as person on person.id = relationship.person_id
    where relationship.status = 'active'
      and organization.status = 'active'
      and person.status <> 'closed'
      and not exists (
        select 1
        from payments.platform_subscriptions as live
        where live.person_id = relationship.person_id
          and (
            (live.status = 'active' and live.current_period_end > now_at)
            or (live.status = 'grace' and live.grace_until > now_at)
          )
      );
  else
    -- Nothing published means nobody has Pro that way. It is a figure and not a gap:
    -- the condition is known, and it is false.
    pro_by_gym := 0;
  end if;

  -- What people pay their gyms. Allfit does not bill it and never sees the money, so
  -- it is a count of bonds with no amount beside it on this panel.
  select count(*)
  into gym_subscriptions
  from payments.plan_subscriptions as subscription
  where subscription.status = 'active';

  -- Allfit's own billing: what the stores reported as collected this month, per
  -- currency, because each store charges each person in theirs.
  select
    coalesce(
      jsonb_agg(
        jsonb_build_object('currency_code', billed_row.currency_code,
                           'amount_minor', billed_row.amount_minor)
        order by billed_row.currency_code
      ),
      '[]'::jsonb
    ),
    coalesce(sum(billed_row.payers), 0)::integer
  into billed, payers
  from (
    select record.currency_code,
           sum(record.amount_minor)::bigint as amount_minor,
           count(distinct record.person_id)::integer as payers
    from payments.platform_payment_records as record
    where record.result = 'succeeded'
      and record.occurred_at >= month_from
      and record.amount_minor is not null
      and record.currency_code is not null
    group by record.currency_code
  ) as billed_row;

  return jsonb_build_object(
    'generated_at', now_at,
    'minimum_aggregate', minimum,
    'metrics', jsonb_build_array(
      support.business_metric('registered_people', registered, 'total', null, now_at, minimum),
      support.business_metric('new_people_this_week', arrived, 'week', week_from, now_at, minimum),
      support.business_metric(
        'active_people_this_week', active, 'week', week_from, now_at, minimum
      ),
      support.business_metric(
        'studio_active_professionals_this_week', studio_active, 'week', week_from, now_at, minimum
      ),
      support.business_metric('organizations', gyms, 'total', null, now_at),
      support.business_metric('operating_organizations', operating, 'total', null, now_at),
      support.business_metric('unclaimed_organizations', unclaimed, 'total', null, now_at),
      -- A subscription belongs to exactly one person, so these are counts of people and
      -- the minimum applies. The placeholders passed zero because a figure that does
      -- not exist has nothing to withhold.
      support.business_metric('active_subscriptions', pro_paid, 'total', null, now_at, minimum),
      support.business_metric(
        'suspended_subscriptions', pro_suspended, 'total', null, now_at, minimum
      ),
      support.business_metric(
        'lapsed_subscriptions', pro_lapsed, 'total', null, now_at, minimum
      ),
      support.business_metric('open_subscriptions', pro_open, 'total', null, now_at, minimum),
      support.business_metric(
        'active_organization_subscriptions', gym_subscriptions, 'total', null, now_at, minimum
      ),
      support.business_metric(
        'pro_people_paying_allfit', pro_paid, 'total', null, now_at, minimum
      ),
      support.business_metric(
        'pro_people_through_organization', pro_by_gym, 'total', null, now_at, minimum
      ),
      support.business_metric(
        'premium_people', pro_paid + pro_by_gym, 'total', null, now_at, minimum
      )
    ),
    'money', jsonb_build_array(
      support.business_money_metric(
        'billed_this_month', billed, payers, 'month', month_from, now_at, minimum
      )
    )
  );
end
$function$;
