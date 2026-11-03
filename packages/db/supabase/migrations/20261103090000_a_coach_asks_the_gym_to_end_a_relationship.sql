-- A coach asks the gym to end a relationship (HU-STUDIO-033).
--
-- `OP-REL-009`: the holder of a relationship who has no power to end it asks the
-- administration to. `OP-REL-017`: she withdraws her request. `OP-REL-018`: the
-- administration refuses it in writing. Ending the relationship stays where it
-- was — `OP-REL-008` for the organization, `OP-REL-007` for the person — and
-- settles whatever request was pending, so the request never becomes a second way
-- to end anything.
--
-- What a request is not:
--
--   · It changes nothing about the relationship: no status, no grant, no
--     assignment. Asking is not ending (criterion 1).
--   · It is not for anyone who could end the relationship herself. The power to
--     end is whatever `terminate_relationship` checks, `assign_professionals`, and
--     the same capability refuses the request; checking a different one would let
--     the two drift until somebody could both ask and act (criterion 3).
--   · It is never visible to the person attended. No policy names her: it is the
--     organization deliberating (criterion 5).
--
-- **Two pending requests on one relationship are impossible**, not discouraged: a
-- partial unique index refuses the second (criterion 4).
--
-- **Every request ends settled, with who and when** (criterion 7):
--
--   · `resolved` when the organization ends the relationship, by whichever
--     administrator or owner did it — including an organization closing.
--   · `rejected` when the administration refuses it, with the words it gave.
--   · `withdrawn` when the coach takes it back; she is who settled it.
--   · `superseded` when it stops making sense without anybody deciding it: the
--     person ended the relationship herself, or the coach is no longer its holder
--     (reassigned, resigned, removed or stripped of the coach role).
--
-- Settling happens in two places, both inside the transaction that made the
-- change. `close_relationship` settles before it ends any assignment, and a
-- trigger on assignments settles a holder's request the moment her assignment
-- stops being active. The trigger is what makes «no longer the holder» one rule
-- rather than one line in each of the four commands that can end an assignment.
--
-- **Settling writes rows the actor may not see.** A person ending her own
-- relationship sees no request, and a coach who resigns stops seeing her own the
-- moment her membership ends, so settling as the actor would silently update
-- nothing and leave a request pending on a relationship that is over. Settling
-- proves itself with a contract scope instead, as the organization closure does
-- for nutrition: a token bound to purpose, relationship, backend and transaction,
-- set only while the settlement runs.
set lock_timeout = '5s';
set statement_timeout = '60s';

-- ---------------------------------------------------------------------------
-- The request
-- ---------------------------------------------------------------------------

create type relationships.termination_request_status as enum (
  'pending',
  'withdrawn',
  'rejected',
  'resolved',
  'superseded'
);
alter type relationships.termination_request_status owner to allfit_owner;

create table relationships.relationship_termination_requests (
  id uuid not null default extensions.uuid_generate_v7(),
  relationship_id uuid not null,
  organization_id uuid not null,
  requested_by_membership_id uuid not null,
  status relationships.termination_request_status not null default 'pending',
  reason text,
  resolution text,
  resolved_by_membership_id uuid,
  created_at timestamptz not null default clock_timestamp(),
  resolved_at timestamptz,
  constraint pk_relationship_termination_requests primary key (id),
  constraint fk_relationship_termination_requests_relationship foreign key (relationship_id, organization_id) references relationships.service_relationships(id, organization_id) on delete cascade,
  constraint fk_relationship_termination_requests_requested_by foreign key (requested_by_membership_id, organization_id) references organizations.organization_memberships(id, organization_id) on delete restrict,
  constraint fk_relationship_termination_requests_resolved_by foreign key (resolved_by_membership_id, organization_id) references organizations.organization_memberships(id, organization_id) on delete restrict,
  constraint ck_relationship_termination_requests_settled_at check ((status = 'pending') = (resolved_at is null)),
  constraint ck_relationship_termination_requests_settled_after check (resolved_at is null or resolved_at >= created_at),
  -- Somebody decided every outcome but one: a superseded request was overtaken.
  constraint ck_relationship_termination_requests_settled_by check ((resolved_by_membership_id is not null) = (status in ('withdrawn', 'rejected', 'resolved'))),
  constraint ck_relationship_termination_requests_withdrawn_by_requester check (status <> 'withdrawn' or resolved_by_membership_id = requested_by_membership_id),
  -- Only a refusal carries words back, and it always does.
  constraint ck_relationship_termination_requests_resolution check ((status = 'rejected') = (resolution is not null)),
  constraint ck_relationship_termination_requests_resolution_text check (resolution is null or (btrim(resolution) <> '' and char_length(resolution) <= 2000)),
  constraint ck_relationship_termination_requests_reason check (reason is null or (btrim(reason) <> '' and char_length(reason) <= 2000))
);

-- Criterion 4, in the database rather than in the command.
create unique index uidx_relationship_termination_requests_pending
  on relationships.relationship_termination_requests (relationship_id)
  where status = 'pending';

create index idx_relationship_termination_requests_organization
  on relationships.relationship_termination_requests (organization_id, status, created_at desc);
create index idx_relationship_termination_requests_relationship
  on relationships.relationship_termination_requests (relationship_id, created_at desc, id desc);
create index idx_relationship_termination_requests_requested_by
  on relationships.relationship_termination_requests (requested_by_membership_id);
create index idx_relationship_termination_requests_resolved_by
  on relationships.relationship_termination_requests (resolved_by_membership_id)
  where resolved_by_membership_id is not null;

alter table relationships.relationship_termination_requests owner to allfit_owner;
alter table relationships.relationship_termination_requests enable row level security;
alter table relationships.relationship_termination_requests force row level security;

/*
 * Who reads a request: the coach who made it, and whoever could end the
 * relationship. Not the person — no clause names her — and not staff, who read
 * the directory but decide nothing about it. The settlement clause is the
 * contract scope above; it opens one relationship, for one transaction.
 */
create policy relationship_termination_requests_select_actor
  on relationships.relationship_termination_requests
  for select to allfit_owner
  using (
    (
      organization_id = access_control.org()
      and (
        access_control.owns_membership(requested_by_membership_id)
        or access_control.has_capability(organization_id, 'assign_professionals')
      )
    )
    or relationship_id::text = (select access_control.contract_scope('termination_request_settlement'))
  );

create policy relationship_termination_requests_insert_requester
  on relationships.relationship_termination_requests
  for insert to allfit_owner
  with check (
    organization_id = access_control.org()
    and access_control.owns_membership(requested_by_membership_id)
  );

create policy relationship_termination_requests_update_actor
  on relationships.relationship_termination_requests
  for update to allfit_owner
  using (
    (
      organization_id = access_control.org()
      and (
        access_control.owns_membership(requested_by_membership_id)
        or access_control.has_capability(organization_id, 'assign_professionals')
      )
    )
    or relationship_id::text = (select access_control.contract_scope('termination_request_settlement'))
  )
  with check (
    (
      organization_id = access_control.org()
      and (
        access_control.owns_membership(requested_by_membership_id)
        or access_control.has_capability(organization_id, 'assign_professionals')
      )
    )
    or relationship_id::text = (select access_control.contract_scope('termination_request_settlement'))
  );

revoke all on relationships.relationship_termination_requests from public, allfit_api;

-- ---------------------------------------------------------------------------
-- Settling, whoever is acting
-- ---------------------------------------------------------------------------

/*
 * Settles the pending request of one relationship, optionally only the one a
 * given membership made. The caller's own contract scope, if any, is put back
 * afterwards: scopes are a single slot, and this runs inside commands — the
 * organization closure among them — that may hold one of their own.
 */
create function relationships.settle_termination_requests(
  p_relationship_id uuid,
  p_status relationships.termination_request_status,
  p_settled_by_membership_id uuid,
  p_settled_at timestamptz,
  p_requested_by_membership_id uuid
)
returns integer
language plpgsql
security invoker
set search_path = pg_catalog
as $function$
declare
  previous_purpose text := current_setting('app.contract_scope_purpose', true);
  previous_id text := current_setting('app.contract_scope_id', true);
  previous_token text := current_setting('app.contract_scope_token', true);
  settled integer;
begin
  if p_status = 'pending' then
    raise exception 'settling cannot leave a request pending' using errcode = '22023';
  end if;

  perform access_control.open_contract_scope('termination_request_settlement', p_relationship_id);

  update relationships.relationship_termination_requests as request
  set status = p_status,
      resolved_by_membership_id = p_settled_by_membership_id,
      resolved_at = greatest(p_settled_at, request.created_at)
  where request.relationship_id = p_relationship_id
    and request.status = 'pending'
    and (p_requested_by_membership_id is null
         or request.requested_by_membership_id = p_requested_by_membership_id);
  get diagnostics settled = row_count;

  perform set_config('app.contract_scope_purpose', coalesce(previous_purpose, ''), true);
  perform set_config('app.contract_scope_id', coalesce(previous_id, ''), true);
  perform set_config('app.contract_scope_token', coalesce(previous_token, ''), true);

  return settled;
end
$function$;

alter function relationships.settle_termination_requests(
  uuid, relationships.termination_request_status, uuid, timestamptz, uuid
) owner to allfit_owner;
revoke all on function relationships.settle_termination_requests(
  uuid, relationships.termination_request_status, uuid, timestamptz, uuid
) from public, allfit_api;

/*
 * A holder who stops being the holder no longer has anything to ask. Fires for
 * every way that happens — a reassignment, a resignation, a removal from the
 * team, losing the coach role — because each of them ends the assignment row and
 * none of them has to remember this. A relationship that is closing already
 * settled its request before its assignments ended, so this finds nothing then.
 */
create function relationships.supersede_termination_requests_tg()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog
as $function$
begin
  perform relationships.settle_termination_requests(
    new.relationship_id,
    'superseded',
    null,
    coalesce(new.valid_to, clock_timestamp()),
    new.membership_id
  );
  return null;
end
$function$;

alter function relationships.supersede_termination_requests_tg() owner to allfit_owner;
revoke all on function relationships.supersede_termination_requests_tg() from public, allfit_api;

create trigger trg_professional_assignments_after_update_supersede_requests
after update of status on relationships.relationship_professional_assignments
for each row
when (old.status = 'active' and new.status <> 'active' and new.kind = 'holder')
execute function relationships.supersede_termination_requests_tg();

/*
 * Unchanged except for the settlement, which comes first: before the holder's
 * assignment ends, so the trigger above finds nothing left to supersede and the
 * request records the organization's decision rather than the side effect.
 *
 * Who resolved it is the actor's own membership in the organization. Ended by
 * the person — or by a professional with no live membership, which no command
 * allows today — nobody in the organization decided anything, and the request
 * was overtaken.
 */
create or replace function relationships.close_relationship(
  p_relationship_id uuid,
  p_effective_at timestamptz,
  p_ended_by_kind identity.actor_kind,
  p_reason text
)
returns table (frozen_grants integer, closed_assignments integer)
language plpgsql
set search_path = pg_catalog
as $function$
declare
  frozen integer;
  closed integer;
  closing_organization_id uuid;
  resolver_membership_id uuid;
begin
  update relationships.service_relationships as relationship
  set status = 'terminated',
      ended_at = p_effective_at,
      ended_reason = p_reason,
      ended_by_kind = p_ended_by_kind,
      updated_at = p_effective_at
  where relationship.id = p_relationship_id
    and relationship.status = 'active'
  returning relationship.organization_id into closing_organization_id;

  if not found then
    raise exception 'the relationship could not be closed' using errcode = 'P0004';
  end if;

  if p_ended_by_kind = 'professional' then
    select membership.id into resolver_membership_id
    from organizations.organization_memberships as membership
    where membership.organization_id = closing_organization_id
      and membership.person_id = access_control.person()
      and membership.status = 'active';
  end if;

  perform relationships.settle_termination_requests(
    p_relationship_id,
    case when resolver_membership_id is null then 'superseded' else 'resolved' end
      ::relationships.termination_request_status,
    resolver_membership_id,
    p_effective_at,
    null
  );

  -- Only what is still active: a grant the person revoked stays revoked.
  update privacy.data_grants as shared
  set status = 'frozen',
      frozen_at = p_effective_at,
      updated_at = p_effective_at
  where shared.relationship_id = p_relationship_id
    and shared.status = 'active';
  get diagnostics frozen = row_count;

  -- The holder and every cover she accepted; an unanswered proposal grants nothing.
  update relationships.relationship_professional_assignments as assignment
  set status = 'ended',
      valid_to = p_effective_at,
      updated_at = p_effective_at
  where assignment.relationship_id = p_relationship_id
    and assignment.status = 'active'
    and (assignment.kind = 'holder' or assignment.accepted_by_person_at is not null);
  get diagnostics closed = row_count;

  return query select frozen, closed;
end
$function$;

-- ---------------------------------------------------------------------------
-- One shape for a request, wherever it is read
-- ---------------------------------------------------------------------------

/*
 * Security invoker: it reads as whoever calls it, so the row policy decides
 * whether there is anything to describe, and a request the actor may not see
 * comes back null rather than described.
 */
create function relationships.termination_request_document(p_request_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = pg_catalog
as $function$
  select jsonb_build_object(
    'request_id', request.id,
    'relationship_id', request.relationship_id,
    'status', request.status,
    'reason', request.reason,
    'resolution', request.resolution,
    'requested_by', jsonb_build_object(
      'membership_id', request.requested_by_membership_id,
      'display_name', requester.display_name
    ),
    'resolved_by', case
      when request.resolved_by_membership_id is null then null
      else jsonb_build_object(
        'membership_id', request.resolved_by_membership_id,
        'display_name', resolver.display_name
      )
    end,
    'created_at', request.created_at,
    'resolved_at', request.resolved_at
  )
  from relationships.relationship_termination_requests as request
  join organizations.organization_memberships as requester_membership
    on requester_membership.id = request.requested_by_membership_id
  join identity.people as requester on requester.id = requester_membership.person_id
  left join organizations.organization_memberships as resolver_membership
    on resolver_membership.id = request.resolved_by_membership_id
  left join identity.people as resolver on resolver.id = resolver_membership.person_id
  where request.id = p_request_id
$function$;

alter function relationships.termination_request_document(uuid) owner to allfit_owner;
revoke all on function relationships.termination_request_document(uuid) from public, allfit_api;

-- ---------------------------------------------------------------------------
-- OP-REL-009 — the holder asks
-- ---------------------------------------------------------------------------

create function relationships.request_relationship_termination(
  p_actor_person_id uuid,
  p_organization_id uuid,
  p_relationship_id uuid,
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
  actor_membership_id uuid;
  receipt record;
  subject record;
  holder_assignment_id uuid;
  request_id uuid;
  reason text;
  notice record;
begin
  if access_control.actor_kind() <> 'person'
     or access_control.person() is distinct from p_actor_person_id then
    raise exception 'person actor mismatch' using errcode = '42501';
  end if;

  reason := nullif(btrim(coalesce(p_reason, '')), '');
  if char_length(reason) > 2000 then
    raise exception 'a reason is at most 2000 characters' using errcode = '22023';
  end if;

  select membership.id into actor_membership_id
  from organizations.organizations as organization
  join organizations.organization_memberships as membership
    on membership.organization_id = organization.id
   and membership.person_id = p_actor_person_id
   and membership.status = 'active'
  where organization.id = p_organization_id
    and organization.status = 'active';

  if actor_membership_id is null then
    raise exception 'asking requires a live membership' using errcode = '42501';
  end if;

  /*
   * Criterion 3. Whoever `OP-REL-008` lets through does not ask: she ends it.
   * Refused before the relationship is even looked at, so an administrator is
   * told the same thing about every relationship, hers or not.
   */
  if access_control.has_capability(p_organization_id, 'assign_professionals') then
    raise exception 'whoever can end a relationship ends it rather than asking'
      using errcode = '42501';
  end if;

  perform set_config('app.actor_org_id', p_organization_id::text, true);

  -- The row policy shows a coach only what she is assigned to: not found and not
  -- hers are the same answer, as everywhere else in this domain.
  select relationship.id into subject
  from relationships.service_relationships as relationship
  where relationship.id = p_relationship_id
    and relationship.organization_id = p_organization_id;

  if not found then
    raise exception 'relationship not found' using errcode = 'P0002';
  end if;

  select * into receipt
  from system.begin_idempotency(
    p_actor_person_id, 'OP-REL-009', p_idempotency_key, p_command_id, p_request_hash
  );

  if not receipt.claimed then
    return query select relationships.termination_request_document(receipt.aggregate_id), true;
    return;
  end if;

  /*
   * Shared locks on the relationship and on her holder assignment. Ending the
   * relationship and ending the assignment both update one of these rows, so
   * either they wait for this request to commit and then settle it, or this
   * waits for them and finds the relationship over or the assignment gone. A
   * request can never be left pending behind a change that should have settled
   * it.
   */
  select relationship.status into subject
  from relationships.service_relationships as relationship
  where relationship.id = p_relationship_id
  for share;

  if subject.status <> 'active' then
    raise exception 'only a live relationship can be asked to end' using errcode = 'P0004';
  end if;

  select assignment.id into holder_assignment_id
  from relationships.relationship_professional_assignments as assignment
  where assignment.relationship_id = p_relationship_id
    and assignment.membership_id = actor_membership_id
    and assignment.kind = 'holder'
    and assignment.status = 'active'
  for share;

  if holder_assignment_id is null then
    raise exception 'only the holder of a relationship asks for it to end'
      using errcode = '42501';
  end if;

  -- A second pending request fails here, on the partial unique index: 23505.
  insert into relationships.relationship_termination_requests (
    relationship_id, organization_id, requested_by_membership_id, reason
  ) values (
    p_relationship_id, p_organization_id, actor_membership_id, reason
  )
  returning id into request_id;

  /*
   * The notice carries its own words and its own recipients, as the other
   * notices of this domain do: reading memberships and people at delivery time
   * would widen policies written to keep the worker out of them. Recipients are
   * whoever could act on it right now.
   */
  select organization.display_name as organization_name,
         person.display_name as person_name,
         requester.display_name as requester_name,
         (
           select coalesce(jsonb_agg(distinct recipient.contact_email), '[]'::jsonb)
           from organizations.organization_memberships as member
           join organizations.membership_roles as member_role
             on member_role.membership_id = member.id
            and member_role.valid_to is null
           join organizations.role_capabilities as capability
             on capability.role_code = member_role.role_code
            and capability.capability_code = 'assign_professionals'
           join identity.people as recipient on recipient.id = member.person_id
           where member.organization_id = p_organization_id
             and member.status = 'active'
             and recipient.contact_email is not null
         ) as recipients
    into notice
  from relationships.service_relationships as relationship
  join organizations.organizations as organization
    on organization.id = relationship.organization_id
  join identity.people as person on person.id = relationship.person_id
  join organizations.organization_memberships as requester_membership
    on requester_membership.id = actor_membership_id
  join identity.people as requester on requester.id = requester_membership.person_id
  where relationship.id = p_relationship_id;

  perform system.enqueue_outbox_event(
    'relationship_termination_request',
    request_id,
    'relationship.termination_requested.v1',
    jsonb_build_object(
      'request_id', request_id,
      'relationship_id', p_relationship_id,
      'organization_id', p_organization_id,
      'recipients', notice.recipients,
      'organization_name', notice.organization_name,
      'person_name', notice.person_name,
      'requester_name', notice.requester_name,
      'reason', reason
    )
  );

  perform system.finish_idempotency(
    receipt.receipt_id, 201::smallint, 'termination-requested',
    'relationship_termination_request', request_id
  );

  return query select relationships.termination_request_document(request_id), false;
end
$function$;

alter function relationships.request_relationship_termination(
  uuid, uuid, uuid, text, uuid, uuid, bytea
) owner to allfit_owner;
revoke all on function relationships.request_relationship_termination(
  uuid, uuid, uuid, text, uuid, uuid, bytea
) from public;
grant execute on function relationships.request_relationship_termination(
  uuid, uuid, uuid, text, uuid, uuid, bytea
) to allfit_api;

-- ---------------------------------------------------------------------------
-- OP-REL-017 — the coach takes it back
-- ---------------------------------------------------------------------------

create function relationships.withdraw_termination_request(
  p_actor_person_id uuid,
  p_organization_id uuid,
  p_relationship_id uuid,
  p_request_id uuid,
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
  receipt record;
  subject record;
begin
  if access_control.actor_kind() <> 'person'
     or access_control.person() is distinct from p_actor_person_id then
    raise exception 'person actor mismatch' using errcode = '42501';
  end if;

  if not access_control.has_membership(p_organization_id) then
    raise exception 'withdrawing requires a live membership' using errcode = '42501';
  end if;

  perform set_config('app.actor_org_id', p_organization_id::text, true);

  select request.id,
         request.status,
         request.requested_by_membership_id
    into subject
  from relationships.relationship_termination_requests as request
  where request.id = p_request_id
    and request.relationship_id = p_relationship_id
    and request.organization_id = p_organization_id
  for update;

  if not found then
    raise exception 'termination request not found' using errcode = 'P0002';
  end if;

  -- An administrator reads the request and refuses it; only its author takes it back.
  if not access_control.owns_membership(subject.requested_by_membership_id) then
    raise exception 'only the coach who asked can withdraw the request' using errcode = '42501';
  end if;

  select * into receipt
  from system.begin_idempotency(
    p_actor_person_id, 'OP-REL-017', p_idempotency_key, p_command_id, p_request_hash
  );

  if not receipt.claimed then
    return query select relationships.termination_request_document(receipt.aggregate_id), true;
    return;
  end if;

  -- Withdrawing what is already withdrawn asks for a state that holds.
  if subject.status = 'withdrawn' then
    perform system.finish_idempotency(
      receipt.receipt_id, 200::smallint, 'termination-request-withdrawn',
      'relationship_termination_request', p_request_id
    );
    return query select relationships.termination_request_document(p_request_id), true;
    return;
  end if;

  if subject.status <> 'pending' then
    raise exception 'the request was already settled' using errcode = 'P0004';
  end if;

  update relationships.relationship_termination_requests as request
  set status = 'withdrawn',
      resolved_by_membership_id = request.requested_by_membership_id,
      resolved_at = clock_timestamp()
  where request.id = p_request_id;

  perform system.finish_idempotency(
    receipt.receipt_id, 200::smallint, 'termination-request-withdrawn',
    'relationship_termination_request', p_request_id
  );

  return query select relationships.termination_request_document(p_request_id), false;
end
$function$;

alter function relationships.withdraw_termination_request(
  uuid, uuid, uuid, uuid, uuid, uuid, bytea
) owner to allfit_owner;
revoke all on function relationships.withdraw_termination_request(
  uuid, uuid, uuid, uuid, uuid, uuid, bytea
) from public;
grant execute on function relationships.withdraw_termination_request(
  uuid, uuid, uuid, uuid, uuid, uuid, bytea
) to allfit_api;

-- ---------------------------------------------------------------------------
-- OP-REL-018 — the administration refuses it
-- ---------------------------------------------------------------------------

create function relationships.reject_termination_request(
  p_actor_person_id uuid,
  p_organization_id uuid,
  p_relationship_id uuid,
  p_request_id uuid,
  p_resolution text,
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
  actor_membership_id uuid;
  receipt record;
  subject record;
  refusal text;
  settled_at timestamptz;
  notice record;
begin
  if access_control.actor_kind() <> 'person'
     or access_control.person() is distinct from p_actor_person_id then
    raise exception 'person actor mismatch' using errcode = '42501';
  end if;

  -- A refusal says why. The coach asked in words and is answered in words.
  refusal := nullif(btrim(coalesce(p_resolution, '')), '');
  if refusal is null or char_length(refusal) > 2000 then
    raise exception 'a refusal carries a resolution of 1 to 2000 characters'
      using errcode = '22023';
  end if;

  select membership.id into actor_membership_id
  from organizations.organizations as organization
  join organizations.organization_memberships as membership
    on membership.organization_id = organization.id
   and membership.person_id = p_actor_person_id
   and membership.status = 'active'
  where organization.id = p_organization_id
    and organization.status = 'active';

  -- Refusing is deciding about the relationship, so it takes the power to end it.
  if actor_membership_id is null
     or not access_control.has_capability(p_organization_id, 'assign_professionals') then
    raise exception 'refusing a request requires assign_professionals' using errcode = '42501';
  end if;

  perform set_config('app.actor_org_id', p_organization_id::text, true);

  select request.id,
         request.status,
         request.requested_by_membership_id
    into subject
  from relationships.relationship_termination_requests as request
  where request.id = p_request_id
    and request.relationship_id = p_relationship_id
    and request.organization_id = p_organization_id
  for update;

  if not found then
    raise exception 'termination request not found' using errcode = 'P0002';
  end if;

  select * into receipt
  from system.begin_idempotency(
    p_actor_person_id, 'OP-REL-018', p_idempotency_key, p_command_id, p_request_hash
  );

  if not receipt.claimed then
    return query select relationships.termination_request_document(receipt.aggregate_id), true;
    return;
  end if;

  if subject.status <> 'pending' then
    raise exception 'the request was already settled' using errcode = 'P0004';
  end if;

  settled_at := clock_timestamp();

  update relationships.relationship_termination_requests as request
  set status = 'rejected',
      resolution = refusal,
      resolved_by_membership_id = actor_membership_id,
      resolved_at = settled_at
  where request.id = p_request_id;

  select requester.contact_email,
         requester.display_name as requester_name,
         person.display_name as person_name,
         organization.display_name as organization_name
    into notice
  from organizations.organization_memberships as requester_membership
  join identity.people as requester on requester.id = requester_membership.person_id
  join relationships.service_relationships as relationship on relationship.id = p_relationship_id
  join identity.people as person on person.id = relationship.person_id
  join organizations.organizations as organization on organization.id = p_organization_id
  where requester_membership.id = subject.requested_by_membership_id;

  if notice.contact_email is not null then
    perform system.enqueue_outbox_event(
      'relationship_termination_request',
      p_request_id,
      'relationship.termination_request_rejected.v1',
      jsonb_build_object(
        'request_id', p_request_id,
        'relationship_id', p_relationship_id,
        'contact_email', notice.contact_email,
        'requester_name', notice.requester_name,
        'person_name', notice.person_name,
        'organization_name', notice.organization_name,
        'resolution', refusal,
        'rejected_at', settled_at
      )
    );
  end if;

  perform system.finish_idempotency(
    receipt.receipt_id, 200::smallint, 'termination-request-rejected',
    'relationship_termination_request', p_request_id
  );

  return query select relationships.termination_request_document(p_request_id), false;
end
$function$;

alter function relationships.reject_termination_request(
  uuid, uuid, uuid, uuid, text, uuid, uuid, bytea
) owner to allfit_owner;
revoke all on function relationships.reject_termination_request(
  uuid, uuid, uuid, uuid, text, uuid, uuid, bytea
) from public;
grant execute on function relationships.reject_termination_request(
  uuid, uuid, uuid, uuid, text, uuid, uuid, bytea
) to allfit_api;

-- ---------------------------------------------------------------------------
-- OP-REL-011 — the relationship says whether somebody asked to end it
-- ---------------------------------------------------------------------------

/*
 * The latest request, whatever became of it, so a refusal and its words reach
 * the coach who asked. The row policy narrows it: the coach sees her own, the
 * administration sees any, and staff, who read the directory, see none.
 */
create or replace function relationships.read_relationship_state(
  p_person_id uuid,
  p_organization_id uuid,
  p_relationship_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  actor_membership_id uuid;
  -- Neither `relationship` nor `found`: the first is the table alias below, and
  -- PL/pgSQL would resolve `relationship.id` in the select list to this variable
  -- instead of the column; the second is its own `FOUND` flag, which the
  -- not-found check below depends on.
  subject record;
begin
  if access_control.actor_kind() <> 'person'
     or access_control.person() is distinct from p_person_id then
    raise exception 'person actor mismatch' using errcode = '42501';
  end if;

  select membership.id into actor_membership_id
  from organizations.organizations as organization
  join organizations.organization_memberships as membership
    on membership.organization_id = organization.id
   and membership.person_id = p_person_id
   and membership.status = 'active'
  where organization.id = p_organization_id
    and organization.status = 'active';

  if actor_membership_id is null
     or not (
       access_control.has_capability(p_organization_id, 'view_directory')
       or access_control.has_capability(p_organization_id, 'view_assigned_directory')
     ) then
    raise exception 'reading a relationship requires a directory capability'
      using errcode = '42501';
  end if;

  /*
   * The row policy resolves the organization through `access_control.org()`,
   * which reads this setting and then checks the actor really holds a live
   * membership in it. Declaring it here grants nothing the check above would
   * not already allow; omitting it leaves the policy blind to the organization,
   * and a coach would silently read nothing.
   */
  perform set_config('app.actor_org_id', p_organization_id::text, true);

  select relationship.id,
         relationship.person_id,
         person.display_name,
         relationship.status,
         relationship.started_at,
         relationship.ended_at
    into subject
  from relationships.service_relationships as relationship
  join identity.people as person on person.id = relationship.person_id
  where relationship.id = p_relationship_id
    and relationship.organization_id = p_organization_id;

  -- Not found and not permitted are the same answer on purpose. Telling a coach
  -- that a relationship exists but is not theirs leaks that the gym has that
  -- client, which is the directory's narrowing undone by an error message.
  if not found then
    raise exception 'relationship not found' using errcode = 'P0002';
  end if;

  return jsonb_build_object(
    'relationship_id', subject.id,
    'person_id', subject.person_id,
    'display_name', subject.display_name,
    'status', subject.status,
    'started_at', subject.started_at,
    'ended_at', subject.ended_at,
    /*
     * `professional_person_id`, not `person_id`. On the assignment row,
     * `person_id` is the client being attended — it carries into the composite
     * key to the relationship — so reading it here as "who attends" returns the
     * client under the professional's name. It did, until a smoke read showed
     * the two ids were the same person.
     */
    'holder', (
      select jsonb_build_object(
               'assignment_id', assignment.id,
               'membership_id', assignment.membership_id,
               'professional_person_id', membership.person_id,
               'display_name', professional.display_name,
               'valid_from', assignment.valid_from
             )
      from relationships.relationship_professional_assignments as assignment
      join organizations.organization_memberships as membership
        on membership.id = assignment.membership_id
      join identity.people as professional on professional.id = membership.person_id
      where assignment.relationship_id = p_relationship_id
        and assignment.kind = 'holder'
        and assignment.status = 'active'
    ),
    'substitutions', (
      select coalesce(jsonb_agg(entry order by entry ->> 'valid_from'), '[]'::jsonb)
      from (
        select jsonb_build_object(
                 'assignment_id', assignment.id,
                 'membership_id', assignment.membership_id,
                 'professional_person_id', membership.person_id,
                 'display_name', professional.display_name,
                 'status', assignment.status,
                 'valid_from', assignment.valid_from,
                 'ends_on', assignment.ends_on,
                 'accepted_by_person_at', assignment.accepted_by_person_at
               ) as entry
        from relationships.relationship_professional_assignments as assignment
        join organizations.organization_memberships as membership
          on membership.id = assignment.membership_id
        join identity.people as professional on professional.id = membership.person_id
        where assignment.relationship_id = p_relationship_id
          and assignment.kind = 'substitute'
      ) as substitutions
    ),
    /*
     * Criteria 2 and 3. Every field here is about the permission, and none is
     * from the data it covers: the scope it names, the version that was agreed,
     * whether it still stands, and the words the person was shown. A reader
     * learns that measurements were shared without learning a single
     * measurement.
     */
    'grants', (
      select coalesce(jsonb_agg(entry order by entry ->> 'scope_code'), '[]'::jsonb)
      from (
        select jsonb_build_object(
                 'grant_id', grant_row.id,
                 'scope_code', grant_row.scope_code,
                 'display_name', presentation.display_name,
                 'version_number', definition.version_number,
                 'access_level', grant_row.access_level,
                 'status', grant_row.status,
                 'purpose', grant_row.purpose,
                 'granted_at', grant_row.granted_at,
                 'revoked_at', grant_row.revoked_at
               ) as entry
        from privacy.data_grants as grant_row
        join privacy.scope_definitions as definition
          on definition.id = grant_row.scope_definition_id
         and definition.scope_code = grant_row.scope_code
        left join privacy.scope_presentations as presentation
          on presentation.scope_code = grant_row.scope_code
        where grant_row.relationship_id = p_relationship_id
      ) as grants
    ),
    'termination_request', (
      select relationships.termination_request_document(request.id)
      from relationships.relationship_termination_requests as request
      where request.relationship_id = p_relationship_id
      order by request.created_at desc, request.id desc
      limit 1
    )
  );
end
$function$;

alter function relationships.read_relationship_state(uuid, uuid, uuid) owner to allfit_owner;
revoke all on function relationships.read_relationship_state(uuid, uuid, uuid) from public;
grant execute on function relationships.read_relationship_state(uuid, uuid, uuid) to allfit_api;
