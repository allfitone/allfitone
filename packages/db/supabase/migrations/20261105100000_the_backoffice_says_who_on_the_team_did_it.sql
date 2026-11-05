-- The Backoffice says who on Allfit's team did it — `HU-BO-014` c7, `HU-BO-015` c3,
-- `HU-BO-016` c8 and `HU-BO-034` c3.
--
-- Suspending, reactivating, setting the quota, creating and cancelling a gym each store
-- the acting person and the duty they acted under. The projections returned an
-- identifier at most, and the handover not even that, so the screen said when and never
-- who: the question an audit asks months later.
--
-- **A name, and only a team member's.** `support.platform_staff_name` answers for people
-- who hold or held a platform role or duty and for nobody else, so it cannot become a way
-- to read a client's or an owner's name. It is internal: the runtime role never calls it,
-- only the projections that already decided their reader may see the record.
--
-- **The quota keeps its history.** Criterion 3 asks for who, when and the previous value
-- of every change. The events were always written; the projection now reads them all,
-- newest first, instead of only the last.
--
-- **The handover names its creator and, if it came to that, who cancelled it.** The
-- moments are already `created_at` and `cancelled_at`; the people come from the events
-- that recorded them. A gym its owner created in Studio has no creator on Allfit's team,
-- and says so with `null`.

set lock_timeout = '5s';
set statement_timeout = '60s';

-- ---------------------------------------------------------------------------
-- Allfit's team, by name
-- ---------------------------------------------------------------------------

create or replace function support.platform_staff_name(p_person_id uuid)
returns text
language sql
stable
security definer
set search_path = pg_catalog
as $function$
  select person.display_name
  from identity.people as person
  where person.id = p_person_id
    and (
      exists (
        select 1
        from support.platform_role_assignments as role_assignment
        where role_assignment.person_id = person.id
      )
      or exists (
        select 1
        from support.platform_duty_assignments as duty_assignment
        where duty_assignment.person_id = person.id
      )
    )
$function$;

alter function support.platform_staff_name(uuid) owner to allfit_owner;
revoke all on function support.platform_staff_name(uuid) from public, allfit_api;

-- ---------------------------------------------------------------------------
-- HU-BO-016 c8 — who stopped a gym, and who brought it back
-- ---------------------------------------------------------------------------

create or replace function organizations.organization_suspension_projection(
  p_organization_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog
as $function$
  select jsonb_build_object(
    'organization_id', organization.id,
    'status', organization.status,
    'suspended', organization.status = 'suspended',
    'suspended_at', organization.suspended_at,
    'current',
      case
        when open_period.id is null then null
        else jsonb_build_object(
          'suspension_id', open_period.id,
          'reason_code', open_period.reason_code,
          'started_at', open_period.started_at,
          'started_by_person_id', open_period.started_by_person_id,
          'started_by_name', support.platform_staff_name(open_period.started_by_person_id),
          -- What the decision actually cost, counted from the causes it opened rather
          -- than from the relationships it did not touch.
          'people_blocked', (
            select count(*)::integer
            from planning.service_access_blocks as block
            where block.organization_event_id = open_period.started_event_id
              and block.ended_at is null
          )
        )
      end,
    -- Criterion 8 outliving the state: a gym back on its feet still says it was stopped.
    'history', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'suspension_id', period.id,
            'reason_code', period.reason_code,
            'started_at', period.started_at,
            'started_by_person_id', period.started_by_person_id,
            'started_by_name', support.platform_staff_name(period.started_by_person_id),
            'ended_at', period.ended_at,
            'ended_by_person_id', period.ended_by_person_id,
            'ended_by_name', support.platform_staff_name(period.ended_by_person_id)
          )
          order by period.started_at desc
        )
        from organizations.organization_suspensions as period
        where period.organization_id = organization.id
      ),
      '[]'::jsonb
    )
  )
  from organizations.organizations as organization
  left join organizations.organization_suspensions as open_period
    on open_period.organization_id = organization.id and open_period.ended_at is null
  where organization.id = p_organization_id
$function$;

-- ---------------------------------------------------------------------------
-- HU-BO-034 c3 — every quota change: who, when and the value it replaced
-- ---------------------------------------------------------------------------

create or replace function organizations.guest_quota_projection(p_organization_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog
as $function$
  with changes as (
    select event.id,
           event.occurred_at,
           event.actor_person_id,
           event.actor_duty_assignment_id,
           event.before_snapshot->'guest_quota_seats' as previous_seats,
           event.after_snapshot->'guest_quota_seats' as seats
    from organizations.organization_events as event
    where event.organization_id = p_organization_id
      and event.event_type = 'organization.guest_quota_set.v1'
  )
  select jsonb_build_object(
    'organization_id', target.id,
    'seats', target.guest_quota_seats,
    'occupied', live.occupied,
    'relationships_active', live.relationships_active,
    'invitations_pending', live.invitations_pending,
    'places_left', case
      when target.guest_quota_seats is null then null
      else greatest(target.guest_quota_seats - live.occupied, 0)
    end,
    'over_quota', target.guest_quota_seats is not null
      and live.occupied > target.guest_quota_seats,
    'last_change', (
      select jsonb_build_object(
        'at', change.occurred_at,
        'by_person_id', change.actor_person_id,
        'by_name', support.platform_staff_name(change.actor_person_id),
        'by_duty_assignment_id', change.actor_duty_assignment_id,
        'previous_seats', change.previous_seats
      )
      from changes as change
      order by change.occurred_at desc, change.id desc
      limit 1
    ),
    'history', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'at', change.occurred_at,
            'by_person_id', change.actor_person_id,
            'by_name', support.platform_staff_name(change.actor_person_id),
            'seats', change.seats,
            'previous_seats', change.previous_seats
          )
          order by change.occurred_at desc, change.id desc
        )
        from changes as change
      ),
      '[]'::jsonb
    )
  )
  from organizations.organizations as target
  cross join lateral organizations.organization_guest_occupancy(target.id) as live
  where target.id = p_organization_id
$function$;

-- ---------------------------------------------------------------------------
-- HU-BO-014 c7 and HU-BO-015 c3 — who created a gym, and who cancelled it
-- ---------------------------------------------------------------------------

create or replace function organizations.handover_projection(p_organization_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog
as $function$
  select jsonb_build_object(
    'organization_id', organization.id,
    'display_name', organization.display_name,
    'type_code', organization.type_code,
    'type_name', organization_type.name,
    'party_kind', organization.responsible_party->>'party_kind',
    'legal_name', organization.legal_name,
    'status', organization.status,
    'created_at', organization.created_at,
    'claimed_at', organization.claimed_at,
    'cancelled_at', organization.cancelled_at,
    'created_by', (
      select jsonb_build_object(
        'person_id', event.actor_person_id,
        'name', support.platform_staff_name(event.actor_person_id)
      )
      from organizations.organization_events as event
      where event.organization_id = organization.id
        and event.event_type = 'organization.created_unclaimed.v1'
      order by event.occurred_at, event.id
      limit 1
    ),
    'cancelled_by', (
      select jsonb_build_object(
        'person_id', event.actor_person_id,
        'name', support.platform_staff_name(event.actor_person_id)
      )
      from organizations.organization_events as event
      where event.organization_id = organization.id
        and event.event_type = 'organization.cancelled.v1'
      order by event.occurred_at desc, event.id desc
      limit 1
    ),
    'site', (
      select jsonb_build_object('site_id', site.id, 'name', site.name, 'address', site.address)
      from organizations.organization_sites as site
      where site.organization_id = organization.id
      order by site.created_at, site.id
      limit 1
    ),
    'invitation', (
      select jsonb_build_object(
        'invitation_id', invitation.id,
        'status', invitation.status,
        'intent_status', intent.status,
        'contact_hint',
          left(split_part(invitation.contact::text, '@', 1), 1) || '***@'
            || split_part(invitation.contact::text, '@', 2),
        'expires_at', invitation.expires_at
      )
      from identity.invitations as invitation
      join identity.invitation_intents as intent
        on intent.invitation_id = invitation.id
       and intent.kind = 'ownership'
      where invitation.organization_id = organization.id
      order by invitation.created_at desc, invitation.id desc
      limit 1
    )
  )
  from organizations.organizations as organization
  join organizations.organization_types as organization_type
    on organization_type.code = organization.type_code
  where organization.id = p_organization_id
$function$;
