-- OP-REL-019 — a coach opens the card of a client (HU-STUDIO-083, -084; STUDIO-76, -77).
--
-- The card is an index, not a copy of her data. It says who she is, the link, how the
-- coach attends her, the categories she shares (each read afterwards through its own
-- audited operation) and the ones she withdrew. A category she never shared appears
-- nowhere. Opening it reads no fitness data, so it writes no access event, like the
-- relationship state (OP-REL-011) and the authorized scopes (OP-PRV-023).
--
-- A coach who opens the card of somebody he no longer attends is told why, for thirty
-- days and only if he attended her through his current membership: she left the gym,
-- his attendance ended while the link went on, or his cover ran out. Everybody else
-- gets the same "not found" as for somebody who does not exist. The answer depends only
-- on facts up to the moment he lost her, so her coming back later changes nothing.
-- Reading how the link ended needs one row he no longer sees, opened through the
-- contract scope `former_attendance`, which only these definers can open.
--
-- It also stops a hidden session from leaving a trace in Studio (HU-STUDIO-084 c4): his
-- correction proposals said `session_hidden`. They now say `session_unavailable` for a
-- hidden and for an annulled session alike; what is stored, and what she sees, is kept.

set lock_timeout = '5s';
set statement_timeout = '60s';

create policy service_relationships_select_former_attendance
  on relationships.service_relationships
  for select to allfit_owner
  using (id::text = (select access_control.contract_scope('former_attendance')));

-- What the card says about the categories of one live relationship: those in force, and
-- those withdrawn and not shared again. Meal photos say nothing without the meals.
create function relationships.client_card_grants(p_relationship_id uuid)
returns jsonb
language sql
stable
set search_path = pg_catalog
as $function$
  with codes (code) as (
    select array['relationship_training', 'prior_training_history', 'body_progress',
                 'health_context', 'nutrition_intake', 'nutrition_guidance', 'nutrition_media']
  )
  select jsonb_build_object(
    'sections', coalesce((
      select jsonb_agg(jsonb_build_object(
               'scope_code', shared.scope_code,
               'scope_version', definition.version_number,
               'access_level', shared.access_level,
               'granted_at', shared.granted_at)
             order by array_position(codes.code, shared.scope_code))
      from privacy.data_grants as shared
      join privacy.scope_definitions as definition on definition.id = shared.scope_definition_id
      cross join codes
      where shared.relationship_id = p_relationship_id
        and shared.status = 'active'
        and (shared.scope_code <> 'nutrition_media'
             or exists (
               select 1 from privacy.data_grants as intake
               where intake.relationship_id = p_relationship_id
                 and intake.scope_code = 'nutrition_intake'
                 and intake.status = 'active'))
    ), '[]'::jsonb),
    'withdrawn', coalesce((
      select jsonb_agg(jsonb_build_object(
               'scope_code', withdrawn.scope_code,
               'withdrawn_at', withdrawn.revoked_at)
             order by array_position(codes.code, withdrawn.scope_code))
      from (
        select revoked.scope_code, max(revoked.revoked_at) as revoked_at
        from privacy.data_grants as revoked
        where revoked.relationship_id = p_relationship_id
          and revoked.status = 'revoked'
          and not exists (
            select 1 from privacy.data_grants as again
            where again.relationship_id = p_relationship_id
              and again.scope_code = revoked.scope_code
              and again.status = 'active')
        group by revoked.scope_code
      ) as withdrawn
      cross join codes
    ), '[]'::jsonb)
  )
$function$;

alter function relationships.client_card_grants(uuid) owner to allfit_owner;
revoke all on function relationships.client_card_grants(uuid) from public, allfit_api;

/*
 * Why this membership stopped attending this person, if it did within thirty days.
 * The last attendance that took effect decides; a cover counts only once she accepted
 * it, and ends at its last day even when nothing was written.
 */
create function relationships.former_attendance(
  p_membership_id uuid,
  p_organization_id uuid,
  p_subject_person_id uuid
)
returns table (reason text, lost_at timestamptz)
language plpgsql
volatile
set search_path = pg_catalog
as $function$
declare
  now_at timestamptz := clock_timestamp();
  last_attendance record;
  link record;
begin
  select attendance.relationship_id, attendance.kind, attendance.effective_to
    into last_attendance
  from (
    select assignment.relationship_id,
           assignment.kind,
           greatest(assignment.valid_from,
                    coalesce(assignment.accepted_by_person_at, assignment.valid_from)) as effective_from,
           case assignment.kind
             when 'holder' then assignment.valid_to
             else least(coalesce(assignment.valid_to, 'infinity'::timestamptz),
                        (assignment.ends_on + 1)::timestamptz)
           end as effective_to
    from relationships.relationship_professional_assignments as assignment
    where assignment.organization_id = p_organization_id
      and assignment.person_id = p_subject_person_id
      and assignment.membership_id = p_membership_id
      and assignment.status in ('active', 'ended')
      and (assignment.kind = 'holder' or assignment.accepted_by_person_at is not null)
  ) as attendance
  where attendance.effective_from < attendance.effective_to
    and attendance.effective_to <= now_at
  order by attendance.effective_to desc, (attendance.kind = 'holder') desc
  limit 1;

  if not found then
    return;
  end if;

  perform access_control.open_contract_scope('former_attendance', last_attendance.relationship_id);
  select relationship.status, relationship.ended_at into link
  from relationships.service_relationships as relationship
  where relationship.id = last_attendance.relationship_id;
  perform access_control.close_contract_scope();

  if link.status = 'terminated' and last_attendance.effective_to >= link.ended_at then
    reason := 'relationship_ended';
    lost_at := link.ended_at;
  elsif last_attendance.kind = 'holder' then
    reason := 'assignment_ended';
    lost_at := last_attendance.effective_to;
  else
    reason := 'substitution_ended';
    lost_at := last_attendance.effective_to;
  end if;

  if lost_at > now_at - interval '30 days' then
    return next;
  end if;
end
$function$;

alter function relationships.former_attendance(uuid, uuid, uuid) owner to allfit_owner;
revoke all on function relationships.former_attendance(uuid, uuid, uuid) from public, allfit_api;

create function relationships.read_client_card(
  p_person_id uuid,
  p_organization_id uuid,
  p_subject_person_id uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog
as $function$
declare
  actor_membership_id uuid;
  attended record;
  former record;
  grants jsonb;
begin
  if access_control.actor_kind() <> 'person'
     or access_control.person() is distinct from p_person_id then
    raise exception 'person actor mismatch' using errcode = '42501';
  end if;

  if p_organization_id is null or p_subject_person_id is null then
    raise exception 'an organization and a client are required' using errcode = '22023';
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

  -- The predicate of `relationships.actor_is_assigned`, for this membership.
  select relationship.id, relationship.started_at, assignment.kind, assignment.ends_on,
         person.display_name
    into attended
  from relationships.service_relationships as relationship
  join relationships.relationship_professional_assignments as assignment
    on assignment.relationship_id = relationship.id
  join identity.people as person on person.id = relationship.person_id
  where relationship.organization_id = p_organization_id
    and relationship.person_id = p_subject_person_id
    and relationship.status = 'active'
    and assignment.membership_id = actor_membership_id
    and assignment.status = 'active'
    and assignment.valid_from <= clock_timestamp()
    and (assignment.valid_to is null or assignment.valid_to > clock_timestamp())
    and (
      assignment.kind = 'holder'
      or (assignment.accepted_by_person_at is not null
          and assignment.ends_on is not null
          and assignment.ends_on >= current_date)
    )
  order by (assignment.kind = 'holder') desc
  limit 1;

  if attended.id is not null then
    grants := relationships.client_card_grants(attended.id);
    return jsonb_build_object(
      'kind', 'attending',
      'person_id', p_subject_person_id,
      'display_name', attended.display_name,
      'relationship', jsonb_build_object('id', attended.id, 'started_at', attended.started_at),
      'attendance', jsonb_build_object(
        'role', case attended.kind when 'holder' then 'holder' else 'substitute' end,
        'ends_on', case attended.kind when 'holder' then null else attended.ends_on end),
      'sections', grants->'sections',
      'withdrawn', grants->'withdrawn'
    );
  end if;

  select * into former
  from relationships.former_attendance(actor_membership_id, p_organization_id, p_subject_person_id);

  if former.reason is not null then
    return jsonb_build_object(
      'kind', 'former',
      'person_id', p_subject_person_id,
      'reason', former.reason,
      'lost_at', former.lost_at
    );
  end if;

  raise exception 'client not found' using errcode = 'P0002';
end
$function$;

alter function relationships.read_client_card(uuid, uuid, uuid) owner to allfit_owner;
revoke all on function relationships.read_client_card(uuid, uuid, uuid) from public;
grant execute on function relationships.read_client_card(uuid, uuid, uuid) to allfit_api;

-- A proposal as its proposer sees it. Unchanged from 20261112090000 but for one field:
-- a hidden session reads as unavailable, exactly like an annulled one.
create or replace function execution.proposal_for_proposer(p_proposal_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog
as $function$
  select jsonb_build_object(
    'id', proposal.id,
    'client', jsonb_build_object('person_id', proposal.person_id, 'name', client.display_name),
    'target', case
      when execution.attending_assignment(proposal.relationship_id, proposal.proposer_membership_id) is not null
       and (access_control.can_access(proposal.relationship_id, 'relationship_training', 'read')
            or access_control.can_access(proposal.relationship_id, 'prior_training_history', 'read'))
      then jsonb_build_object('execution_id', proposal.executed_session_id, 'set_order', proposal.set_order)
    end,
    'field', proposal.target_field,
    'proposed', jsonb_build_object('value', proposal.proposed_value, 'unit', proposal.proposed_unit_code),
    'reason', proposal.reason,
    'status', case when proposal.status = 'pending' and proposal.expires_at <= clock_timestamp()
                   then 'expired' else proposal.status::text end,
    'cancel_reason', case when proposal.cancel_reason in ('session_hidden', 'session_annulled')
                          then 'session_unavailable' else proposal.cancel_reason end,
    'created_at', proposal.created_at,
    'expires_at', proposal.expires_at,
    'settled_at', proposal.settled_at
  )
  from execution.correction_proposals as proposal
  join identity.people as client on client.id = proposal.person_id
  where proposal.id = p_proposal_id
$function$;

alter function execution.proposal_for_proposer(uuid) owner to allfit_owner;
revoke all on function execution.proposal_for_proposer(uuid) from public, allfit_api;
