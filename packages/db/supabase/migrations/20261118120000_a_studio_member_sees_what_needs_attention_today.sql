-- OP-REL-020 — a Studio member sees what needs attention today (HU-STUDIO-081, STUDIO-74).
--
-- One read, built from what the member's roles let her resolve. A notice she cannot act
-- on is absent, not empty; each counts everything it covers and lists at most five:
--
--   client_invitations        invite_clients           unanswered, or lapsed this week; only
--                                                      her own without view_directory
--   unassigned_relationships  assign_professionals     live, with no holder in effect
--   termination_requests      terminate_relationships  pending
--   team_invitations          invite                   unanswered, or lapsed this week
--   team                      manage_memberships       members with a role in force
--   new_relationships         view_directory           live, begun in the last seven days
--   training                  observe_training         see below
--
-- `empty` says that nothing waits: every notice but `team`, which is a state, counts 0.
-- Failed charges join when E-STUDIO-13 exists. Row policies still apply underneath, so a
-- count never exceeds what the member could list elsewhere.
--
-- Training is the only part that reads a client's data. For each client the member
-- attends who shares `relationship_training` with this relationship, it looks at her
-- last closed week (ADR-032: Monday to Sunday in her program's timezone) and at what she
-- finished inside the relationship in the last forty-eight hours. Cancelled and paused
-- sessions were never due; an annulled session is not logged. Each client evaluated
-- leaves one access event, whether she is shown or not, because not being shown says
-- something too. A client who withdrew her training is neither evaluated nor logged, so
-- a refused or revoked category never surfaces here (c7).

set lock_timeout = '5s';
set statement_timeout = '60s';

-- Invitations of one kind still waiting, or lapsed in the last seven days, newest first.
create function relationships.today_invitations(
  p_organization_id uuid,
  p_kind identity.invitation_intent_kind,
  p_issued_by_membership_id uuid,
  p_now timestamptz
)
returns jsonb
language sql
stable
set search_path = pg_catalog
as $function$
  with open_invitations as (
    select invitation.id, invitation.contact::text as contact, invitation.created_at,
           invitation.expires_at,
           case when invitation.status = 'pending' and invitation.expires_at > p_now
                then 'awaiting' else 'lapsed' end as state,
           (select intent.proposed_role_code
              from identity.invitation_intents as intent
             where intent.invitation_id = invitation.id and intent.kind = p_kind
             order by intent.created_at, intent.id
             limit 1) as proposed_role_code
    from identity.invitations as invitation
    where invitation.organization_id = p_organization_id
      and (p_issued_by_membership_id is null
           or invitation.issued_by_membership_id = p_issued_by_membership_id)
      and exists (
        select 1 from identity.invitation_intents as intent
        where intent.invitation_id = invitation.id
          and intent.kind = p_kind
          and intent.status in ('pending', 'expired'))
      and (
        (invitation.status = 'pending' and invitation.expires_at > p_now)
        or (invitation.status in ('pending', 'expired')
            and invitation.expires_at <= p_now
            and invitation.expires_at > p_now - interval '7 days')
      )
  )
  select jsonb_build_object(
    'count', (select count(*) from open_invitations),
    'awaiting', (select count(*) from open_invitations where state = 'awaiting'),
    'lapsed', (select count(*) from open_invitations where state = 'lapsed'),
    'items', coalesce((
      select jsonb_agg(item.document order by item.created_at desc, item.id desc)
      from (
        select listed.id, listed.created_at,
               jsonb_build_object(
                 'invitation_id', listed.id,
                 'contact', left(listed.contact, 1) || '***'
                   || substring(listed.contact from position('@' in listed.contact)),
                 'state', listed.state,
                 'created_at', listed.created_at,
                 'expires_at', listed.expires_at)
               || case when p_kind = 'membership'
                       then jsonb_build_object('proposed_role_code', listed.proposed_role_code)
                       else '{}'::jsonb end as document
        from open_invitations as listed
        order by listed.created_at desc, listed.id desc
        limit 5
      ) as item
    ), '[]'::jsonb)
  )
$function$;

alter function relationships.today_invitations(uuid, identity.invitation_intent_kind, uuid, timestamptz)
  owner to allfit_owner;
revoke all on function relationships.today_invitations(uuid, identity.invitation_intent_kind, uuid, timestamptz)
  from public, allfit_api;

/*
 * The clients the acting member attends and may read the training of, with what needs a
 * look: her last closed week and what she finished in the last two days. Logs one event
 * per client evaluated. The caller sets the actor's organization, membership, purpose and
 * request; `p_now` is a parameter so the week boundary can be proven in any timezone.
 */
create function relationships.today_training(p_organization_id uuid, p_now timestamptz)
returns table (
  person_id uuid,
  display_name text,
  relationship_id uuid,
  week_starts_on date,
  planned integer,
  not_logged integer,
  recent_count integer,
  last_ended_at timestamptz
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
  -- An index range only: the closed week is decided per session, in its own timezone.
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

    select min(due.closed_week), count(*)::integer, count(*) filter (where not due.logged)::integer
      into week_starts_on, planned, not_logged
    from (
      select closed.week_start as closed_week,
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
        and planned_session.week_starts_on between utc_today - 15 and utc_today
        and planned_session.week_starts_on = closed.week_start
        and planned_session.status not in ('cancelled', 'paused')
    ) as due;

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

    if not_logged > 0 or recent_count > 0 then
      person_id := attended.person_id;
      display_name := attended.display_name;
      relationship_id := attended.id;
      return next;
    end if;
  end loop;

  perform planning.resume_contract_scope(previous_purpose, previous_id, previous_token);
end
$function$;

alter function relationships.today_training(uuid, timestamptz) owner to allfit_owner;
revoke all on function relationships.today_training(uuid, timestamptz) from public, allfit_api;

create function relationships.read_studio_today(p_person_id uuid, p_organization_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog
as $function$
declare
  actor_membership_id uuid;
  now_at timestamptz := clock_timestamp();
  notices jsonb := '{}'::jsonb;
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
  end if;

  if access_control.has_capability(p_organization_id, 'observe_training') then
    if nullif(current_setting('app.request_id', true), '') is null then
      raise exception 'request id required for audited read' using errcode = '22023';
    end if;
    perform set_config('app.purpose', 'studio_attention_today', true);

    notices := notices || jsonb_build_object('training', (
      with looked as (
        select * from relationships.today_training(p_organization_id, now_at)
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
        ), '[]'::jsonb))
    ));
  end if;

  return jsonb_build_object(
    'organization_id', p_organization_id,
    'generated_at', now_at,
    'empty', not exists (
      select 1 from jsonb_each(notices) as notice
      where notice.key <> 'team' and (notice.value->>'count')::integer > 0),
    'notices', notices
  );
end
$function$;

alter function relationships.read_studio_today(uuid, uuid) owner to allfit_owner;
revoke all on function relationships.read_studio_today(uuid, uuid) from public;
grant execute on function relationships.read_studio_today(uuid, uuid) to allfit_api;
