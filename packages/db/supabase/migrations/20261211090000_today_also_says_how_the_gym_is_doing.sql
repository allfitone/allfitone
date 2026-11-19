-- OP-REL-020 — the summary also says how the organization is doing (HU-STUDIO-081).
--
-- Beside the notices, which are work waiting, the read gains `indicators`, which are
-- state. Each is absent unless the member's roles open it, and none of them changes
-- `empty`:
--
--   training_adherence    observe_training      what the clients she attends had due and
--                                               logged in their last eight closed weeks
--   relationship_changes  view_directory        relationships begun and ended in each of
--                                               the last six months
--   professional_load     assign_professionals  the clients each coach holds today
--
-- Adherence is the only one that reads a client's data, and it reads nothing the notice
-- `training` did not already look at: the same clients, the same sessions, the same
-- rule for what is due and what is logged, over eight weeks instead of one. So it is
-- worked out in that look and writes no access event of its own; the one the notice
-- writes per client now stands for eight weeks. A session she hid from the relationship
-- is not logged, because the screening scope never shows it: the sum cannot tell that
-- something exists that she does not share. Only sums leave the read, never a name or a
-- figure per person.
--
-- A week closes where its program runs (ADR-032). The eight weeks end at the latest one
-- closed for every client evaluated, so each week shown is complete for all of them.
--
-- A month is a local question and an organization has no timezone, so the viewer's
-- travels in `app.viewer_timezone` and `relationship_changes` is absent without it
-- rather than answered in UTC. It is a setting, not a parameter, so that the function
-- keeps its signature and the API and the database can ship in either order.

set lock_timeout = '5s';
set statement_timeout = '60s';

/*
 * The clients the acting member attends and may read the training of, one row each,
 * with what the notice needs (her last closed week and what she finished in two days)
 * and what the sum needs: every week of hers that has closed, and the last one that has.
 * Logs one event per client. The caller sets the actor's organization, membership,
 * purpose and request; `p_now` is a parameter so a week boundary can be proven.
 */
drop function relationships.today_training(uuid, timestamptz);

create function relationships.today_training(p_organization_id uuid, p_now timestamptz)
returns table (
  person_id uuid,
  display_name text,
  relationship_id uuid,
  week_starts_on date,
  planned integer,
  not_logged integer,
  recent_count integer,
  last_ended_at timestamptz,
  closed_through date,
  weeks jsonb
)
language plpgsql
volatile
set search_path = pg_catalog
as $function$
declare
  attended record;
  previous_purpose text := current_setting('app.contract_scope_purpose', true);
  previous_id text := current_setting('app.contract_scope_id', true);
  previous_token text := current_setting('app.contract_scope_token', true);
  -- An index range only: whether a week has closed is decided per session, in its timezone.
  utc_today date := (p_now at time zone 'UTC')::date;
begin
  for attended in
    select relationship.id, relationship.person_id, person.display_name,
           shared.grant_id, definition.version_number
    from relationships.service_relationships as relationship
    join identity.people as person on person.id = relationship.person_id
    cross join lateral access_control.grant_of(relationship.id, 'relationship_training') as shared
    join privacy.scope_definitions as definition on definition.id = shared.scope_definition_id
    where relationship.organization_id = p_organization_id
      and relationship.status = 'active'
      and access_control.can_access(relationship.id, 'relationship_training', 'read')
    order by relationship.id
  loop
    perform privacy.log_access_event(
      attended.person_id, null, attended.id, attended.grant_id, null,
      'relationship_training', attended.version_number, 'live', 'relationships.studio_today', 'allowed'
    );
    perform access_control.open_contract_scope('session_screening', attended.id);

    -- Ten weeks back covers eight closed ones wherever the program runs.
    with scanned as materialized (
      select planned_session.week_starts_on as week,
             closed.week_start as closes,
             planned_session.status not in ('cancelled', 'paused')
               and planned_session.week_starts_on <= closed.week_start as due,
             exists (
               select 1
               from execution.planned_session_executions as attempt
               join execution.executed_sessions as session on session.id = attempt.executed_session_id
               where attempt.planned_session_id = planned_session.id
                 and session.execution_status = 'completed'
                 and session.validation_status <> 'annulled'
                 and session.annulled_at is null
             ) as logged
      from planning.planned_sessions as planned_session
      join planning.assignment_management_periods as period
        on period.assignment_id = planned_session.assignment_id
       and period.relationship_id = attended.id
       and period.ended_at is null
      cross join lateral (
        select (date_trunc('week', p_now at time zone planned_session.timezone))::date - 7 as week_start
      ) as closed
      where planned_session.person_id = attended.person_id
        and planned_session.week_starts_on between utc_today - 70 and utc_today
    )
    select min(scanned.closes),
           min(scanned.closes) filter (where scanned.due and scanned.week = scanned.closes),
           (count(*) filter (where scanned.due and scanned.week = scanned.closes))::integer,
           (count(*) filter (where scanned.due and scanned.week = scanned.closes and not scanned.logged))::integer,
           coalesce((
             select jsonb_agg(jsonb_build_object(
                      'week_starts_on', by_week.week, 'planned', by_week.sessions, 'logged', by_week.done))
             from (
               select session.week, count(*) as sessions, count(*) filter (where session.logged) as done
               from scanned as session
               where session.due
               group by session.week
             ) as by_week
           ), '[]'::jsonb)
      into closed_through, week_starts_on, planned, not_logged, weeks
    from scanned;

    select count(*)::integer, max(session.ended_at)
      into recent_count, last_ended_at
    from execution.executed_sessions as session
    where session.person_id = attended.person_id
      and session.context_relationship_id = attended.id
      and not session.is_autonomous
      and session.execution_status = 'completed'
      and session.validation_status <> 'annulled'
      and session.annulled_at is null
      and session.ended_at > p_now - interval '48 hours'
      and session.ended_at <= p_now;

    perform access_control.close_contract_scope();

    person_id := attended.person_id;
    display_name := attended.display_name;
    relationship_id := attended.id;
    return next;
  end loop;

  perform planning.resume_contract_scope(previous_purpose, previous_id, previous_token);
end
$function$;

alter function relationships.today_training(uuid, timestamptz) owner to allfit_owner;
revoke all on function relationships.today_training(uuid, timestamptz) from public, allfit_api;

/*
 * What the clients evaluated had due and logged, summed over eight weeks, oldest first.
 * `p_evaluated` holds `closed_through` and `weeks` of each. With nobody to say where a
 * week closes, the eight end at the last one closed in UTC. A week with nothing due says
 * 0 and 0: whether that is a gap is the reader's to draw.
 */
create function relationships.today_adherence(p_evaluated jsonb, p_now timestamptz)
returns jsonb
language sql
stable
set search_path = pg_catalog
as $function$
  with client as (
    select entry.closed_through, entry.weeks
    from jsonb_to_recordset(p_evaluated) as entry (closed_through date, weeks jsonb)
  ),
  shown as (
    select (ending.last_week - 7 * back)::date as week_starts_on
    from (
      select coalesce((select min(client.closed_through) from client),
                      (date_trunc('week', p_now at time zone 'UTC'))::date - 7) as last_week
    ) as ending
    cross join generate_series(0, 7) as back
  ),
  summed as (
    select week.week_starts_on, sum(week.planned) as planned, sum(week.logged) as logged
    from client
    cross join lateral jsonb_to_recordset(client.weeks)
      as week (week_starts_on date, planned integer, logged integer)
    group by week.week_starts_on
  )
  select jsonb_build_object(
    'clients', (select count(*) from client),
    'weeks', (
      select jsonb_agg(jsonb_build_object(
               'week_starts_on', shown.week_starts_on,
               'planned', coalesce(summed.planned, 0),
               'logged', coalesce(summed.logged, 0))
             order by shown.week_starts_on)
      from shown
      left join summed on summed.week_starts_on = shown.week_starts_on
    )
  )
$function$;

alter function relationships.today_adherence(jsonb, timestamptz) owner to allfit_owner;
revoke all on function relationships.today_adherence(jsonb, timestamptz) from public, allfit_api;

/*
 * Relationships begun and ended in each of the last six months of `p_timezone`, this
 * one last. Row policies decide which relationships the caller counts; `p_now` is a
 * parameter so a month boundary can be proven.
 */
create function relationships.today_relationship_changes(
  p_organization_id uuid,
  p_timezone text,
  p_now timestamptz
)
returns jsonb
language sql
stable
set search_path = pg_catalog
as $function$
  with shown as (
    select (date_trunc('month', p_now at time zone p_timezone) - make_interval(months => back))::date as starts_on
    from generate_series(0, 5) as back
  ),
  bounded as (
    select shown.starts_on,
           shown.starts_on::timestamp at time zone p_timezone as opens_at,
           (shown.starts_on + interval '1 month') at time zone p_timezone as closes_at
    from shown
  )
  select jsonb_build_object('months', jsonb_agg(jsonb_build_object(
           'month', to_char(bounded.starts_on, 'YYYY-MM'),
           'started', (
             select count(*)
             from relationships.service_relationships as relationship
             where relationship.organization_id = p_organization_id
               and relationship.started_at >= bounded.opens_at
               and relationship.started_at < bounded.closes_at),
           'ended', (
             select count(*)
             from relationships.service_relationships as relationship
             where relationship.organization_id = p_organization_id
               and relationship.ended_at >= bounded.opens_at
               and relationship.ended_at < bounded.closes_at))
         order by bounded.starts_on))
  from bounded
$function$;

alter function relationships.today_relationship_changes(uuid, text, timestamptz) owner to allfit_owner;
revoke all on function relationships.today_relationship_changes(uuid, text, timestamptz)
  from public, allfit_api;

create or replace function relationships.read_studio_today(p_person_id uuid, p_organization_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog
as $function$
declare
  actor_membership_id uuid;
  now_at timestamptz := clock_timestamp();
  viewer_timezone text := nullif(current_setting('app.viewer_timezone', true), '');
  notices jsonb := '{}'::jsonb;
  indicators jsonb := '{}'::jsonb;
  training_notice jsonb;
  adherence jsonb;
begin
  if access_control.actor_kind() <> 'person'
     or access_control.person() is distinct from p_person_id then
    raise exception 'person actor mismatch' using errcode = '42501';
  end if;

  if p_organization_id is null then
    raise exception 'an organization is required' using errcode = '22023';
  end if;

  select membership.id into actor_membership_id
  from organizations.organizations as organization
  join organizations.organization_memberships as membership
    on membership.organization_id = organization.id
   and membership.person_id = p_person_id
   and membership.status = 'active'
  where organization.id = p_organization_id
    and organization.status = 'active';

  if actor_membership_id is null then
    raise exception 'a live membership is required' using errcode = '42501';
  end if;

  perform set_config('app.actor_org_id', p_organization_id::text, true);
  perform set_config('app.actor_membership_id', actor_membership_id::text, true);

  if not exists (
    select 1
    from unnest(array['invite_clients', 'assign_professionals', 'terminate_relationships',
                      'invite', 'manage_memberships', 'view_directory', 'observe_training']) as code
    where access_control.has_capability(p_organization_id, code)
  ) then
    raise exception 'a studio capability is required' using errcode = '42501';
  end if;

  if viewer_timezone is not null and not exists (
    select 1 from pg_catalog.pg_timezone_names as zone where zone.name = viewer_timezone
  ) then
    raise exception 'unknown timezone' using errcode = '22023';
  end if;

  if access_control.has_capability(p_organization_id, 'invite_clients') then
    notices := notices || jsonb_build_object('client_invitations',
      relationships.today_invitations(
        p_organization_id, 'service_relationship',
        case when access_control.has_capability(p_organization_id, 'view_directory')
             then null else actor_membership_id end,
        now_at));
  end if;

  if access_control.has_capability(p_organization_id, 'assign_professionals') then
    notices := notices || jsonb_build_object('unassigned_relationships', (
      with waiting as (
        select relationship.id, relationship.person_id, person.display_name, relationship.started_at
        from relationships.service_relationships as relationship
        join identity.people as person on person.id = relationship.person_id
        where relationship.organization_id = p_organization_id
          and relationship.status = 'active'
          and not exists (
            select 1 from relationships.relationship_professional_assignments as assignment
            where assignment.relationship_id = relationship.id
              and assignment.kind = 'holder'
              and assignment.status = 'active'
              and assignment.valid_from <= now_at
              and (assignment.valid_to is null or assignment.valid_to > now_at))
      )
      select jsonb_build_object(
        'count', (select count(*) from waiting),
        'items', coalesce((
          select jsonb_agg(jsonb_build_object(
                   'relationship_id', listed.id, 'person_id', listed.person_id,
                   'display_name', listed.display_name, 'started_at', listed.started_at)
                 order by listed.started_at, listed.id)
          from (select * from waiting order by started_at, id limit 5) as listed
        ), '[]'::jsonb))
    ));

    -- Whoever holds the coach role in force may be given a client, the one with none first of all.
    indicators := indicators || jsonb_build_object('professional_load', (
      with professionals as (
        select membership.id, person.display_name, (
                 select count(*)
                 from relationships.relationship_professional_assignments as assignment
                 join relationships.service_relationships as relationship
                   on relationship.id = assignment.relationship_id
                 where assignment.membership_id = membership.id
                   and assignment.kind = 'holder'
                   and assignment.status = 'active'
                   and assignment.valid_from <= now_at
                   and (assignment.valid_to is null or assignment.valid_to > now_at)
                   and relationship.status = 'active'
               ) as clients
        from organizations.organization_memberships as membership
        join identity.people as person on person.id = membership.person_id
        where membership.organization_id = p_organization_id
          and membership.status = 'active'
          and exists (
            select 1 from organizations.membership_roles as membership_role
            where membership_role.membership_id = membership.id
              and membership_role.role_code = 'coach'
              and membership_role.valid_to is null)
      )
      select jsonb_build_object(
        'count', (select count(*) from professionals),
        'unassigned', notices->'unassigned_relationships'->'count',
        'items', coalesce((
          select jsonb_agg(jsonb_build_object(
                   'membership_id', listed.id, 'display_name', listed.display_name,
                   'clients', listed.clients)
                 order by listed.clients desc, listed.display_name, listed.id)
          from (select * from professionals order by clients desc, display_name, id limit 12) as listed
        ), '[]'::jsonb))
    ));
  end if;

  if access_control.has_capability(p_organization_id, 'terminate_relationships') then
    notices := notices || jsonb_build_object('termination_requests', (
      with waiting as (
        select request.id, request.relationship_id, relationship.person_id, person.display_name,
               request.created_at
        from relationships.relationship_termination_requests as request
        join relationships.service_relationships as relationship on relationship.id = request.relationship_id
        join identity.people as person on person.id = relationship.person_id
        where request.organization_id = p_organization_id
          and request.status = 'pending'
      )
      select jsonb_build_object(
        'count', (select count(*) from waiting),
        'items', coalesce((
          select jsonb_agg(jsonb_build_object(
                   'request_id', listed.id, 'relationship_id', listed.relationship_id,
                   'person_id', listed.person_id, 'display_name', listed.display_name,
                   'requested_at', listed.created_at)
                 order by listed.created_at, listed.id)
          from (select * from waiting order by created_at, id limit 5) as listed
        ), '[]'::jsonb))
    ));
  end if;

  if access_control.has_capability(p_organization_id, 'invite') then
    notices := notices || jsonb_build_object('team_invitations',
      relationships.today_invitations(p_organization_id, 'membership', null, now_at));
  end if;

  if access_control.has_capability(p_organization_id, 'manage_memberships') then
    notices := notices || jsonb_build_object('team', (
      with members as (
        select membership.id, membership_role.role_code
        from organizations.organization_memberships as membership
        join organizations.membership_roles as membership_role
          on membership_role.membership_id = membership.id
         and membership_role.valid_to is null
        where membership.organization_id = p_organization_id
          and membership.status = 'active'
      )
      select jsonb_build_object(
        'count', (select count(distinct id) from members),
        'by_role', coalesce((
          select jsonb_agg(jsonb_build_object('role_code', role_code, 'count', members_in_role)
                           order by role_code)
          from (select role_code, count(distinct id) as members_in_role
                from members group by role_code) as roles
        ), '[]'::jsonb))
    ));
  end if;

  if access_control.has_capability(p_organization_id, 'view_directory') then
    notices := notices || jsonb_build_object('new_relationships', (
      with recent as (
        select relationship.id, relationship.person_id, person.display_name, relationship.started_at
        from relationships.service_relationships as relationship
        join identity.people as person on person.id = relationship.person_id
        where relationship.organization_id = p_organization_id
          and relationship.status = 'active'
          and relationship.started_at > now_at - interval '7 days'
      )
      select jsonb_build_object(
        'count', (select count(*) from recent),
        'items', coalesce((
          select jsonb_agg(jsonb_build_object(
                   'relationship_id', listed.id, 'person_id', listed.person_id,
                   'display_name', listed.display_name, 'started_at', listed.started_at)
                 order by listed.started_at desc, listed.id desc)
          from (select * from recent order by started_at desc, id desc limit 5) as listed
        ), '[]'::jsonb))
    ));

    if viewer_timezone is not null then
      indicators := indicators || jsonb_build_object('relationship_changes',
        relationships.today_relationship_changes(p_organization_id, viewer_timezone, now_at));
    end if;
  end if;

  if access_control.has_capability(p_organization_id, 'observe_training') then
    if nullif(current_setting('app.request_id', true), '') is null then
      raise exception 'request id required for audited read' using errcode = '22023';
    end if;
    perform set_config('app.purpose', 'studio_attention_today', true);

    -- One look per client, materialized: the notice and the sum both come out of it.
    with evaluated as materialized (
      select * from relationships.today_training(p_organization_id, now_at)
    ),
    looked as (
      select * from evaluated where evaluated.not_logged > 0 or evaluated.recent_count > 0
    )
    select jsonb_build_object(
             'count', (select count(*) from looked),
             'items', coalesce((
               select jsonb_agg(jsonb_build_object(
                        'person_id', listed.person_id,
                        'display_name', listed.display_name,
                        'relationship_id', listed.relationship_id,
                        'closed_week', case when listed.planned > 0 then jsonb_build_object(
                          'week_starts_on', listed.week_starts_on,
                          'planned', listed.planned,
                          'not_logged', listed.not_logged) end,
                        'recent_results', jsonb_build_object(
                          'count', listed.recent_count,
                          'last_ended_at', listed.last_ended_at))
                      order by listed.not_logged desc, listed.display_name, listed.person_id)
               from (
                 select * from looked
                 order by not_logged desc, display_name, person_id
                 limit 5
               ) as listed
             ), '[]'::jsonb)),
           relationships.today_adherence(
             (select coalesce(jsonb_agg(jsonb_build_object(
                       'closed_through', evaluated.closed_through, 'weeks', evaluated.weeks)), '[]'::jsonb)
                from evaluated),
             now_at)
      into training_notice, adherence;

    notices := notices || jsonb_build_object('training', training_notice);
    indicators := indicators || jsonb_build_object('training_adherence', adherence);
  end if;

  return jsonb_build_object(
    'organization_id', p_organization_id,
    'generated_at', now_at,
    'empty', not exists (
      select 1 from jsonb_each(notices) as notice
      where notice.key <> 'team' and (notice.value->>'count')::integer > 0),
    'notices', notices,
    'indicators', indicators
  );
end
$function$;

alter function relationships.read_studio_today(uuid, uuid) owner to allfit_owner;
revoke all on function relationships.read_studio_today(uuid, uuid) from public;
grant execute on function relationships.read_studio_today(uuid, uuid) to allfit_api;
