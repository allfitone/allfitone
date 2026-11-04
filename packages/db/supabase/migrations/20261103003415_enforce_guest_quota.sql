-- HU-STUDIO-087 — a gym cannot fill more places than Allfit sold it.
--
-- `20261015120000_what_a_gym_may_fill.sql` stored the quota and counted what
-- occupies it. This enforces it, in the transaction that issues an invitation and
-- in the one that accepts it, under a lock on the organization row so two
-- invitations racing for the last place serialize.
--
-- **The count must not depend on who asks.** `service_relationships` forces
-- row-level security even for its owner, so the count used to answer what the
-- actor could see: a coach without `view_directory` saw only the clients assigned
-- to them, and the person accepting saw only her own relationship. Either would
-- have let a gym past its quota.
--
-- `organizations.organization_guest_occupancy` now proves it is the caller with a
-- counting token: an HMAC of the organization, the backend and the transaction
-- start, keyed by a secret the runtime role cannot read. The token is set only
-- while the function counts and cleared before it returns, and one policy admits
-- the rows of that organization while it is valid. A forged token, or the right
-- one in another transaction, matches nothing. The function returns counts only,
-- so no row ever leaves it.
--
-- **No quota means no limit, not zero**, and lowering a quota still ends nothing:
-- it only refuses new invitations, and acceptances that would add to a gym that
-- is already over.
set lock_timeout = '5s';
set statement_timeout = '60s';

-- ---------------------------------------------------------------------------
-- The counting key
-- ---------------------------------------------------------------------------

create table relationships.occupancy_count_keys (
  id smallint not null default 1,
  secret bytea not null default extensions.gen_random_bytes(32),
  created_at timestamptz not null default clock_timestamp(),
  constraint pk_occupancy_count_keys primary key (id),
  constraint ck_occupancy_count_keys_singleton check (id = 1),
  constraint ck_occupancy_count_keys_secret check (octet_length(secret) = 32)
);
insert into relationships.occupancy_count_keys default values;

alter table relationships.occupancy_count_keys owner to allfit_owner;
alter table relationships.occupancy_count_keys enable row level security;
alter table relationships.occupancy_count_keys force row level security;
create policy occupancy_count_keys_select_owner on relationships.occupancy_count_keys
  for select to allfit_owner using (true);
revoke all on relationships.occupancy_count_keys from public, allfit_api;

-- The organization whose rows the current, valid counting token admits, or null.
create function relationships.occupancy_count_scope()
returns text
language sql
stable
security invoker
set search_path = pg_catalog
as $function$
  select scope.organization_id
  from (
    select nullif(current_setting('app.occupancy_count_org', true), '') as organization_id,
           nullif(current_setting('app.occupancy_count_token', true), '') as token
  ) as scope
  cross join relationships.occupancy_count_keys as count_key
  where scope.token = encode(
    extensions.hmac(
      convert_to(scope.organization_id || ':' || pg_backend_pid()::text || ':'
        || extract(epoch from now())::text, 'UTF8'),
      count_key.secret,
      'sha256'
    ),
    'hex'
  )
$function$;
alter function relationships.occupancy_count_scope() owner to allfit_owner;
revoke all on function relationships.occupancy_count_scope() from public, allfit_api;

-- Wrapped in a sub-select so the token is checked once per query, not once per row.
create policy service_relationships_select_occupancy_count
  on relationships.service_relationships
  for select
  to allfit_owner
  using (organization_id::text = (select relationships.occupancy_count_scope()));

-- ---------------------------------------------------------------------------
-- What occupies a place — same definition, now counted for whoever asks
-- ---------------------------------------------------------------------------

create or replace function organizations.organization_guest_occupancy(p_organization_id uuid)
returns table (relationships_active integer, invitations_pending integer, occupied integer)
language plpgsql
stable
security definer
set search_path = pg_catalog
as $function$
declare
  active_count integer;
  pending_count integer;
begin
  perform set_config('app.occupancy_count_org', p_organization_id::text, true);
  perform set_config('app.occupancy_count_token', encode(
    extensions.hmac(
      convert_to(p_organization_id::text || ':' || pg_backend_pid()::text || ':'
        || extract(epoch from now())::text, 'UTF8'),
      (select count_key.secret from relationships.occupancy_count_keys as count_key),
      'sha256'
    ),
    'hex'
  ), true);

  select count(*)::integer into active_count
  from relationships.service_relationships as relationship
  where relationship.organization_id = p_organization_id
    and relationship.status = 'active';

  perform set_config('app.occupancy_count_token', '', true);
  perform set_config('app.occupancy_count_org', '', true);

  -- Still awaiting an answer: pending, and with time left. A row that has run out
  -- of time frees its place whether or not a sweep has relabelled it yet.
  select count(*)::integer into pending_count
  from identity.invitations as invitation
  join identity.invitation_intents as intent
    on intent.invitation_id = invitation.id
   and intent.kind = 'service_relationship'
   and intent.status = 'pending'
  where invitation.organization_id = p_organization_id
    and invitation.status = 'pending'
    and invitation.expires_at > clock_timestamp();

  return query select active_count, pending_count, active_count + pending_count;
end
$function$;
alter function organizations.organization_guest_occupancy(uuid) owner to allfit_owner;
revoke all on function organizations.organization_guest_occupancy(uuid) from public, allfit_api;

-- True when adding one guest would exceed the quota. `p_already_held` is the place
-- the caller's own invitation occupies, which an acceptance converts.
create function organizations.guest_places_exhausted(
  p_organization_id uuid, p_already_held integer
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $function$
  select coalesce(
    (
      select live.occupied - p_already_held + 1 > organization.guest_quota_seats
      from organizations.organizations as organization
      cross join lateral organizations.organization_guest_occupancy(organization.id) as live
      where organization.id = p_organization_id
        and organization.guest_quota_seats is not null
    ),
    false
  )
$function$;
alter function organizations.guest_places_exhausted(uuid, integer) owner to allfit_owner;
revoke all on function organizations.guest_places_exhausted(uuid, integer)
  from public, allfit_api;

-- ---------------------------------------------------------------------------
-- OP-REL-001 — issuing refuses the invitation that would exceed the quota
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION identity.issue_client_invitation(p_person_id uuid, p_organization_id uuid, p_channel text, p_contact text, p_scope_options jsonb, p_token_hash bytea, p_token_key_version smallint, p_idempotency_key uuid, p_command_id uuid, p_request_hash bytea)
 RETURNS TABLE(invitation_id uuid, invitation_intent_id uuid, status text, channel text, contact_hint text, expires_at timestamp with time zone, scope_codes text[], reused boolean, replayed boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  receipt record;
  actor_membership_id uuid;
  organization_snapshot jsonb;
  normalized_contact text;
  computed_proposal_hash bytea;
  offered_codes text[];
  domain_reused boolean := false;
  replay_reused boolean := false;
  existing_invitation_id uuid;
  target_invitation_id uuid;
  target_intent_id uuid;
  option jsonb;
begin
  if access_control.actor_kind() <> 'person'
     or access_control.person() is distinct from p_person_id then
    raise exception 'person actor mismatch' using errcode = '42501';
  end if;

  normalized_contact := lower(btrim(p_contact));
  if p_channel <> 'email'
     or length(normalized_contact) not between 3 and 254
     or normalized_contact !~ '^[^[:space:]@]+@[^[:space:]@]+$'
     or octet_length(p_token_hash) <> 32
     or p_token_key_version <= 0
     or jsonb_typeof(p_scope_options) <> 'array'
     or jsonb_array_length(p_scope_options) = 0 then
    raise exception 'invalid client invitation' using errcode = '22023';
  end if;

  -- Every option names a published scope, a level and a purpose. Validating
  -- here rather than leaning on the insert keeps a half-written invitation
  -- from ever existing.
  for option in select value from jsonb_array_elements(p_scope_options) loop
    if jsonb_typeof(option) <> 'object'
       or coalesce(option->>'scope_code', '') = ''
       or coalesce(option->>'access_level', '') not in ('read', 'contribute')
       or btrim(coalesce(option->>'purpose', '')) = ''
       or jsonb_typeof(option->'presented_snapshot') <> 'object' then
      raise exception 'invalid client invitation scope option' using errcode = '22023';
    end if;
  end loop;

  select array_agg(value->>'scope_code' order by value->>'scope_code')
  into offered_codes
  from jsonb_array_elements(p_scope_options);

  if array_length(offered_codes, 1) <> (
    select count(distinct code) from unnest(offered_codes) as code
  ) then
    raise exception 'a scope may only be offered once' using errcode = '22023';
  end if;

  select membership.id, organization.responsible_party
  into actor_membership_id, organization_snapshot
  from organizations.organizations as organization
  join organizations.organization_memberships as membership
    on membership.organization_id = organization.id
   and membership.person_id = p_person_id
   and membership.status = 'active'
  where organization.id = p_organization_id
    and organization.status = 'active';

  if actor_membership_id is null then
    raise exception 'organization membership not found' using errcode = 'P0002';
  end if;
  if not access_control.has_capability(p_organization_id, 'invite_clients') then
    raise exception 'invite_clients capability required' using errcode = '42501';
  end if;

  select * into receipt
  from system.begin_idempotency(
    p_person_id, 'OP-REL-001', p_idempotency_key, p_command_id, p_request_hash
  );

  if not receipt.claimed then
    select outcome_code = 'client-invitation-reused' into replay_reused
    from system.idempotency_keys
    where id = receipt.receipt_id;

    if receipt.aggregate_id is null then
      raise exception 'idempotent client invitation not found' using errcode = '40001';
    end if;
    return query
    select projection.*, coalesce(replay_reused, false), true
    from identity.client_invitation_projection(receipt.aggregate_id) as projection;
    return;
  end if;

  -- The offer is part of the proposal: asking for different scopes is a
  -- different question, so it must not reuse the invitation that asked the
  -- previous one.
  computed_proposal_hash := extensions.digest(
    convert_to(
      p_organization_id::text || chr(31) || p_channel || chr(31) || normalized_contact
        || chr(31) || 'service_relationship' || chr(31) || array_to_string(offered_codes, ','),
      'UTF8'
    ),
    'sha256'
  );
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(encode(computed_proposal_hash, 'hex'), 0)
  );

  update identity.invitations as invitation
  set status = 'expired'
  where invitation.organization_id = p_organization_id
    and invitation.status = 'pending'
    and invitation.expires_at <= clock_timestamp();
  update identity.invitation_intents as intent
  set status = 'expired', decided_at = clock_timestamp()
  from identity.invitations as invitation
  where intent.invitation_id = invitation.id
    and invitation.organization_id = p_organization_id
    and invitation.status = 'expired'
    and intent.status = 'pending';

  select invitation.id into existing_invitation_id
  from identity.invitations as invitation
  where invitation.organization_id = p_organization_id
    and invitation.proposal_hash = computed_proposal_hash
    and invitation.status = 'pending'
    and invitation.expires_at > clock_timestamp()
  for update;

  if existing_invitation_id is not null then
    domain_reused := true;
    target_invitation_id := existing_invitation_id;
    update identity.invitations as invitation
    set expires_at = clock_timestamp() + interval '7 days'
    where invitation.id = target_invitation_id;
    select intent.id into target_intent_id
    from identity.invitation_intents as intent
    where intent.invitation_id = target_invitation_id
      and intent.kind = 'service_relationship';
  else
    -- HU-STUDIO-087. A new invitation takes a place; reusing a pending one does not.
    perform pg_catalog.set_config('lock_timeout', '750ms', true);
    perform organization.id
    from organizations.organizations as organization
    where organization.id = p_organization_id
    for no key update;
    if organizations.guest_places_exhausted(p_organization_id, 0) then
      raise exception 'the organization has no guest places left' using errcode = 'AF409';
    end if;
    target_invitation_id := p_command_id;
    insert into identity.invitations (
      id, organization_id, issued_by_membership_id, channel, contact,
      token_hash, token_key_version, proposal_hash, responsible_party, expires_at
    ) values (
      target_invitation_id, p_organization_id, actor_membership_id, p_channel,
      normalized_contact, p_token_hash, p_token_key_version, computed_proposal_hash,
      organization_snapshot, clock_timestamp() + interval '7 days'
    );
    insert into identity.invitation_intents (invitation_id, kind)
    values (target_invitation_id, 'service_relationship')
    returning id into target_intent_id;

    insert into privacy.invitation_scope_options (
      invitation_intent_id, scope_definition_id, scope_code,
      offered_access_level, purpose, presented_snapshot
    )
    select
      target_intent_id,
      definition.id,
      offer->>'scope_code',
      (offer->>'access_level')::privacy.access_level,
      btrim(offer->>'purpose'),
      offer->'presented_snapshot'
    -- `offer`, not `option`: the loop above declares a variable of that name
    -- and PostgreSQL cannot tell which one a bare reference means.
    from jsonb_array_elements(p_scope_options) as offer
    join lateral (
      -- The newest published version of that scope, frozen onto the option so
      -- a later publication cannot change what was asked for.
      select scope.id
      from privacy.scope_definitions as scope
      where scope.scope_code = offer->>'scope_code'
        and scope.status = 'published'
      order by scope.version_number desc
      limit 1
    ) as definition on true;

    if not found then
      raise exception 'no published scope definition for the offer' using errcode = '22023';
    end if;
  end if;

  perform system.enqueue_outbox_event(
    'invitation',
    target_invitation_id,
    'relationship.client_invited.v1',
    jsonb_build_object('invitation_id', target_invitation_id)
  );
  perform system.finish_idempotency(
    receipt.receipt_id,
    case when domain_reused then 200 else 201 end::smallint,
    case when domain_reused then 'client-invitation-reused' else 'client-invitation-created' end,
    'invitation',
    target_invitation_id
  );

  return query
  select projection.*, domain_reused, false
  from identity.client_invitation_projection(target_invitation_id) as projection;
end
$function$;


-- ---------------------------------------------------------------------------
-- OP-IDN-009 — accepting refuses to add to a gym already over its quota
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION identity.decide_client_invitation(p_person_id uuid, p_token_hash bytea, p_intent_id uuid, p_relationship_decision text, p_scope_decisions jsonb, p_idempotency_key uuid, p_command_id uuid, p_request_hash bytea)
 RETURNS TABLE(invitation_id uuid, invitation_status text, organization_id uuid, invitation_intent_id uuid, intent_status text, relationship_id uuid, granted_scope_codes text[], replayed boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  target record;
  receipt record;
  decision_time timestamptz := clock_timestamp();
  resolved_relationship_id uuid;
  option record;
  option_decision privacy.consent_decision;
  consent_id uuid;
  granted text[] := array[]::text[];
  replay record;
begin
  if access_control.actor_kind() <> 'person'
     or access_control.person() is distinct from p_person_id then
    raise exception 'person actor mismatch' using errcode = '42501';
  end if;
  if p_relationship_decision not in ('accepted', 'rejected')
     or octet_length(p_token_hash) <> 32
     or jsonb_typeof(p_scope_decisions) <> 'object' then
    raise exception 'invalid invitation decision' using errcode = '22023';
  end if;

  select invitation.id,
         invitation.status,
         invitation.organization_id,
         invitation.contact::text as contact,
         invitation.expires_at,
         intent.id as intent_id,
         intent.status as intent_status
  into target
  from identity.invitations as invitation
  join identity.invitation_intents as intent
    on intent.invitation_id = invitation.id
   and intent.id = p_intent_id
   and intent.kind = 'service_relationship'
  where invitation.token_hash = p_token_hash
  for update of invitation, intent;

  if target.id is null then
    raise exception 'invitation not found' using errcode = 'P0002';
  end if;
  -- The invitation is addressed to a contact, and only the person who proved
  -- that contact is theirs may answer it.
  if lower(target.contact) is distinct from
     lower(nullif(current_setting('app.actor_verified_email', true), '')) then
    raise exception 'verified email mismatch' using errcode = '42501';
  end if;
  select * into receipt
  from system.begin_idempotency(
    p_person_id, 'OP-IDN-009', p_idempotency_key, p_command_id, p_request_hash
  );

  if not receipt.claimed then
    select invitation.id,
           invitation.status::text as invitation_status,
           invitation.organization_id,
           intent.id as intent_id,
           intent.status::text as intent_status
    into replay
    from identity.invitations as invitation
    join identity.invitation_intents as intent on intent.invitation_id = invitation.id
    where invitation.id = receipt.aggregate_id
      and intent.id = p_intent_id;
    if replay.id is null or replay.intent_status not in ('accepted', 'rejected') then
      raise exception 'idempotent decision not found' using errcode = '40001';
    end if;
    select relationship.id into resolved_relationship_id
    from relationships.service_relationships as relationship
    where relationship.person_id = p_person_id
      and relationship.organization_id = replay.organization_id
      and relationship.status = 'active';
    select coalesce(array_agg(grant_row.scope_code order by grant_row.scope_code), array[]::text[])
    into granted
    from privacy.data_grants as grant_row
    where grant_row.relationship_id = resolved_relationship_id
      and grant_row.status = 'active';
    return query select replay.id, replay.invitation_status, replay.organization_id,
      replay.intent_id, replay.intent_status, resolved_relationship_id, granted, true;
    return;
  end if;

  -- Checked after the replay branch, not before it. A retry of a decision
  -- that already went through arrives at a closed invitation by definition,
  -- and refusing it there would turn every repeated request into an error
  -- instead of the answer it already earned.
  if target.status <> 'pending' or target.expires_at <= decision_time then
    raise exception 'invitation is no longer open' using errcode = '23514';
  end if;

  if p_relationship_decision = 'rejected' then
    update identity.invitation_intents
    set status = 'rejected', decided_at = decision_time
    where id = p_intent_id;
    -- Every option is answered too: declining the relationship declines what
    -- it was asking for, and the record says so rather than leaving them open.
    --
    -- Aliased because `invitation_intent_id` is also an output column of this
    -- function, and a bare reference is ambiguous. The linter caught it; the
    -- tests did not, because none of them declined a relationship.
    update privacy.invitation_scope_options as scope_option
    set decision = 'rejected', decided_at = decision_time
    where scope_option.invitation_intent_id = p_intent_id
      and scope_option.decision is null;
  else
    -- HU-STUDIO-087. This invitation already holds its place, so accepting converts it;
    -- it is refused only when the gym is over its quota by some other way.
    perform pg_catalog.set_config('lock_timeout', '750ms', true);
    perform organization.id
    from organizations.organizations as organization
    where organization.id = target.organization_id
    for no key update;
    if organizations.guest_places_exhausted(target.organization_id, 1) then
      raise exception 'the organization has no guest places left' using errcode = 'AF409';
    end if;
    -- A person returning to the same organization gets a new relationship
    -- pointing at the one before it, never a revived row.
    insert into relationships.service_relationships (
      person_id, organization_id, status, previous_relationship_id
    )
    select
      p_person_id,
      target.organization_id,
      'active',
      (
        select previous.id
        from relationships.service_relationships as previous
        where previous.person_id = p_person_id
          and previous.organization_id = target.organization_id
          and previous.status = 'terminated'
        order by previous.ended_at desc nulls last
        limit 1
      )
    returning id into resolved_relationship_id;

    -- The intent records what it created, which is what makes the acceptance
    -- traceable back from the relationship.
    update identity.invitation_intents
    set status = 'accepted',
        decided_at = decision_time,
        materialized_relationship_id = resolved_relationship_id
    where id = p_intent_id;

    -- Every option presented gets an answer, and an option the caller did not
    -- mention counts as declined: silence is not consent.
    for option in
      select scope_option.id, scope_option.scope_definition_id, scope_option.scope_code,
             scope_option.offered_access_level, scope_option.purpose,
             scope_option.presented_snapshot
      from privacy.invitation_scope_options as scope_option
      where scope_option.invitation_intent_id = p_intent_id
        and scope_option.decision is null
      order by scope_option.scope_code
    loop
      option_decision := case
        when coalesce(p_scope_decisions->>option.scope_code, 'rejected') = 'accepted'
          then 'accepted'::privacy.consent_decision
        else 'rejected'::privacy.consent_decision
      end;

      update privacy.invitation_scope_options
      set decision = option_decision, decided_at = decision_time
      where id = option.id;

      insert into privacy.consent_events (
        person_id, relationship_id, organization_id, invitation_scope_option_id,
        scope_definition_id, scope_code, decision, presented_snapshot, decided_at
      ) values (
        p_person_id, resolved_relationship_id, target.organization_id, option.id,
        option.scope_definition_id, option.scope_code, option_decision,
        option.presented_snapshot, decision_time
      )
      returning id into consent_id;

      -- Only an acceptance becomes a grant. A rejection is recorded as
      -- evidence and grants nothing.
      if option_decision = 'accepted' then
        insert into privacy.data_grants (
          person_id, relationship_id, organization_id, scope_definition_id, scope_code,
          consent_event_id, access_level, purpose, status, granted_at
        ) values (
          p_person_id, resolved_relationship_id, target.organization_id,
          option.scope_definition_id, option.scope_code, consent_id,
          option.offered_access_level, option.purpose, 'active', decision_time
        );
        granted := granted || option.scope_code;
      end if;
    end loop;
  end if;

  -- The invitation closes once no intent is still waiting on an answer.
  update identity.invitations
  set status = 'completed'
  where id = target.id
    and not exists (
      select 1 from identity.invitation_intents as pending
      where pending.invitation_id = target.id and pending.status = 'pending'
    );

  perform system.enqueue_outbox_event(
    'invitation',
    target.id,
    'identity.invitation_intent_decided.v1',
    jsonb_build_object('invitation_id', target.id, 'invitation_intent_id', p_intent_id)
  );
  perform system.finish_idempotency(
    receipt.receipt_id,
    200::smallint,
    'client-invitation-decided',
    'invitation',
    target.id
  );

  return query
  select invitation.id,
         invitation.status::text,
         invitation.organization_id,
         intent.id,
         intent.status::text,
         resolved_relationship_id,
         granted,
         false
  from identity.invitations as invitation
  join identity.invitation_intents as intent on intent.invitation_id = invitation.id
  where invitation.id = target.id and intent.id = p_intent_id;
end
$function$;
