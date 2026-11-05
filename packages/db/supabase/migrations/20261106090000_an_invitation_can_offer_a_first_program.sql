-- HU-STUDIO-023 criteria 2, 6 and 7 — a client invitation can offer a first program.
--
-- The invitation already carried one proposal, the relationship, and asked for each scope
-- on its own. The ADR on invitation intents always allowed a second, `program_assignment`,
-- that the person answers separately. It could not be built while an organization had no
-- programs to give; since OP-PLN-010 it has, so the proposal is built here.
--
-- What it is:
--
--   · A typed row in `identity.invitation_intents`: the exact version, a tentative start
--     and Studio's time zone as the last resort. Only a coach (`assign_programs`) proposes,
--     only a published version of the organization's own program, and only beside a request
--     for `relationship_training` at `contribute`, without which it could never be created.
--     Anything else refuses the whole invitation.
--   · The proposal is part of what makes two invitations equal: the hash gains a segment
--     when there is a program, and is unchanged when there is none, so every pending
--     invitation keeps matching itself.
--   · She reads it beside the relationship and answers it on its own. Silence is a no, and
--     declining the relationship declines it. Accepting it creates the gym's managed program
--     (`lifecycle = 'active'`) only when she also accepted the relationship and granted
--     `relationship_training` at `contribute`; otherwise the proposal is accepted with the
--     reason it was not created, and nothing is ever substituted for it.
--   · Created, it starts on the proposed day or the day she accepts, whichever is later,
--     in the zone her phone sent with the answer, else the one it last sent, else Studio's.
--   · A reissue offers the same program, and the offer check refuses one that does not.
--
-- She is not a member of the gym, so she reads its program only through a contract scope
-- keyed by the proposal, opened by the two functions that need it. The functions keep
-- their names; the old argument lists answer the same through new trailing defaults.

set lock_timeout = '5s';
set statement_timeout = '60s';

-- ---------------------------------------------------------------------------
-- The proposal
-- ---------------------------------------------------------------------------

alter table identity.invitation_intents
  add column proposed_program_version_id uuid,
  add column proposed_starts_on date,
  add column proposed_timezone text,
  add column materialized_assignment_id uuid,
  add column unmaterialized_reason text,
  add constraint fk_invitation_intents_program_version foreign key (proposed_program_version_id) references planning.program_versions (id) on delete restrict,
  add constraint fk_invitation_intents_assignment foreign key (materialized_assignment_id) references planning.program_assignments (id) on delete restrict,
  add constraint ck_invitation_intents_program_proposal check (
    case when kind = 'program_assignment'
      then proposed_program_version_id is not null
        and proposed_starts_on is not null
        and proposed_timezone is not null
      else proposed_program_version_id is null
        and proposed_starts_on is null
        and proposed_timezone is null
    end
  ),
  add constraint ck_invitation_intents_unmaterialized_reason check (
    unmaterialized_reason is null
    or unmaterialized_reason in ('training_not_granted', 'program_unavailable')
  );

/*
 * One destination per kind, and nothing pointing anywhere before a decision. An accepted
 * program either exists or says why it does not, never both and never neither.
 */
alter table identity.invitation_intents
  drop constraint ck_invitation_intents_decision,
  add constraint ck_invitation_intents_decision check (
    (
      status = 'pending'
      and decided_at is null
      and materialized_membership_id is null
      and materialized_relationship_id is null
      and materialized_assignment_id is null
      and unmaterialized_reason is null
    )
    or (
      status in ('rejected', 'revoked', 'expired')
      and decided_at is not null
      and materialized_membership_id is null
      and materialized_relationship_id is null
      and materialized_assignment_id is null
      and unmaterialized_reason is null
    )
    or (
      status = 'accepted'
      and decided_at is not null
      and kind in ('membership', 'ownership')
      and materialized_membership_id is not null
      and materialized_relationship_id is null
      and materialized_assignment_id is null
      and unmaterialized_reason is null
    )
    or (
      status = 'accepted'
      and decided_at is not null
      and kind = 'service_relationship'
      and materialized_relationship_id is not null
      and materialized_membership_id is null
      and materialized_assignment_id is null
      and unmaterialized_reason is null
    )
    or (
      status = 'accepted'
      and decided_at is not null
      and kind = 'program_assignment'
      and materialized_membership_id is null
      and materialized_relationship_id is null
      and (materialized_assignment_id is null) <> (unmaterialized_reason is null)
    )
  );

create index idx_invitation_intents_program_version
  on identity.invitation_intents (proposed_program_version_id)
  where proposed_program_version_id is not null;
create index idx_invitation_intents_assignment
  on identity.invitation_intents (materialized_assignment_id)
  where materialized_assignment_id is not null;

/*
 * What makes two client invitations the same question. Without a program the text is the
 * one every pending invitation was hashed with, so none of them changes identity. Dates
 * are formatted explicitly: a cast would follow the session's DateStyle.
 */
create function identity.client_proposal_hash(
  p_organization_id uuid,
  p_channel text,
  p_contact text,
  p_scope_codes text[],
  p_program_version_id uuid,
  p_program_starts_on date
)
returns bytea
language sql
stable
set search_path = pg_catalog
as $function$
  select extensions.digest(
    convert_to(
      p_organization_id::text || chr(31) || p_channel || chr(31) || lower(p_contact)
        || chr(31) || 'service_relationship' || chr(31) || array_to_string(p_scope_codes, ',')
        || case
             when p_program_version_id is null then ''
             else chr(31) || 'program_assignment' || chr(31) || p_program_version_id::text
               || chr(31) || to_char(p_program_starts_on, 'YYYY-MM-DD')
           end,
      'UTF8'
    ),
    'sha256'
  )
$function$;
alter function identity.client_proposal_hash(uuid, text, text, text[], uuid, date) owner to allfit_owner;
revoke all on function identity.client_proposal_hash(uuid, text, text, text[], uuid, date) from public, allfit_api;

-- ---------------------------------------------------------------------------
-- What she may read and write while answering, and nothing else
-- ---------------------------------------------------------------------------

create policy program_versions_select_invitation on planning.program_versions
  for select to allfit_owner
  using (exists (
    select 1 from identity.invitation_intents as intent
    where intent.id::text = (select access_control.contract_scope('invitation_program'))
      and intent.proposed_program_version_id = program_versions.id
  ));
-- Lets the acceptance hold the version against a retirement; it never lets anyone write it.
create policy program_versions_update_invitation_lock on planning.program_versions
  for update to allfit_owner
  using (exists (
    select 1 from identity.invitation_intents as intent
    where intent.id::text = (select access_control.contract_scope('invitation_program'))
      and intent.proposed_program_version_id = program_versions.id
  ))
  with check (false);
-- Its sessions follow the version (`program_version_sessions_all_actor_access`). The
-- assignment and its sessions are hers (`_all_self`); the gym's management is not.
create policy assignment_management_periods_insert_invitation on planning.assignment_management_periods
  for insert to allfit_owner
  with check (
    ended_at is null
    and person_id = access_control.person()
    and exists (
      select 1
      from identity.invitation_intents as program_intent
      join identity.invitation_intents as relationship_intent
        on relationship_intent.invitation_id = program_intent.invitation_id
       and relationship_intent.kind = 'service_relationship'
      where program_intent.id::text = (select access_control.contract_scope('invitation_program'))
        and program_intent.kind = 'program_assignment'
        and program_intent.status = 'pending'
        and relationship_intent.materialized_relationship_id = assignment_management_periods.relationship_id
    )
  );

-- ---------------------------------------------------------------------------
-- Creating the accepted program
-- ---------------------------------------------------------------------------

/*
 * Runs inside her decision, as her, once the relationship exists and the grant is known.
 * Returns the new assignment, or null when the version is no longer published: the ADR
 * forbids substituting another, so the caller records the proposal as not created.
 */
create function planning.plant_invited_program(
  p_intent_id uuid,
  p_relationship_id uuid,
  p_device_timezone text
)
returns uuid
language plpgsql
volatile
security definer
set search_path = pg_catalog
as $function$
declare
  previous_purpose text := current_setting('app.contract_scope_purpose', true);
  previous_id text := current_setting('app.contract_scope_id', true);
  previous_token text := current_setting('app.contract_scope_token', true);
  subject uuid := access_control.person();
  proposal record;
  open_ended boolean;
  zone text;
  today date;
  starts date;
  front integer;
  new_assignment_id uuid;
begin
  select intent.proposed_program_version_id as version_id,
         intent.proposed_starts_on as starts_on,
         intent.proposed_timezone as timezone
  into proposal
  from identity.invitation_intents as intent
  where intent.id = p_intent_id
    and intent.kind = 'program_assignment'
    and intent.status = 'pending';
  if not found or subject is null then
    raise exception 'program proposal not found' using errcode = 'P0002';
  end if;

  perform access_control.open_contract_scope('invitation_program', p_intent_id);

  -- Shared, so a retirement either waits for this to commit or is seen here.
  select version.repeats_forever into open_ended
  from planning.program_versions as version
  where version.id = proposal.version_id
    and version.status = 'published'
  for share;
  if not found then
    perform set_config('app.contract_scope_purpose', coalesce(previous_purpose, ''), true);
    perform set_config('app.contract_scope_id', coalesce(previous_id, ''), true);
    perform set_config('app.contract_scope_token', coalesce(previous_token, ''), true);
    return null;
  end if;

  -- The zone her phone sent with the answer, else the one it last set up, else Studio's.
  zone := nullif(btrim(p_device_timezone), '');
  if zone is null then
    select assignment.timezone into zone
    from planning.program_assignments as assignment
    where assignment.person_id = subject
      and assignment.origin_relationship_id is null
    order by assignment.assigned_at desc, assignment.id desc
    limit 1;
  end if;
  zone := coalesce(zone, proposal.timezone);
  begin
    today := (clock_timestamp() at time zone zone)::date;
  exception when others then
    raise exception 'invalid time zone' using errcode = '22023', detail = '["timezone"]';
  end;
  starts := greatest(proposal.starts_on, today);

  select coalesce(min(assignment.display_order), 1) - 1 into front
  from planning.program_assignments as assignment
  where assignment.person_id = subject;

  insert into planning.program_assignments (
    person_id, program_version_id, origin_relationship_id, lifecycle, starts_on, timezone,
    display_order
  ) values (
    subject, proposal.version_id, p_relationship_id, 'active', starts, zone, front
  )
  returning id into new_assignment_id;

  insert into planning.assignment_management_periods (assignment_id, person_id, relationship_id)
  values (new_assignment_id, subject, p_relationship_id);

  -- ADR-032, as OP-PLN-010 plants it: a finite version whole, an open-ended one its first week.
  insert into planning.planned_sessions (
    assignment_id, person_id, template_version_id, program_day, week_starts_on,
    scheduled_at, timezone
  )
  select new_assignment_id, subject, composition.template_version_id, composition.day,
         calendar.first_week + ((composition.week - 1) * 7),
         greatest(
           (calendar.first_week + ((composition.week - 1) * 7) + composition.day - 1)::timestamp,
           starts::timestamp
         ) at time zone zone,
         zone
  from planning.program_version_sessions as composition
  cross join (select date_trunc('week', starts::timestamp)::date as first_week) as calendar
  where composition.program_version_id = proposal.version_id
    and (not open_ended or composition.week = 1);

  perform system.enqueue_outbox_event(
    'program_assignment', new_assignment_id, 'planning.assignment_created.v1',
    jsonb_build_object(
      'assignment_id', new_assignment_id,
      'person_id', subject,
      'relationship_id', p_relationship_id,
      'program_version_id', proposal.version_id,
      'starts_on', starts
    )
  );

  perform set_config('app.contract_scope_purpose', coalesce(previous_purpose, ''), true);
  perform set_config('app.contract_scope_id', coalesce(previous_id, ''), true);
  perform set_config('app.contract_scope_token', coalesce(previous_token, ''), true);
  return new_assignment_id;
end
$function$;
alter function planning.plant_invited_program(uuid, uuid, text) owner to allfit_owner;
revoke all on function planning.plant_invited_program(uuid, uuid, text) from public, allfit_api;

-- ---------------------------------------------------------------------------
-- OP-REL-001 — issuing
-- ---------------------------------------------------------------------------

drop function identity.issue_client_invitation(uuid, uuid, text, text, jsonb, bytea, smallint, uuid, uuid, bytea);
drop function identity.client_invitation_projection(uuid);

create function identity.client_invitation_projection(p_invitation_id uuid)
returns table (
  invitation_id uuid,
  invitation_intent_id uuid,
  status text,
  channel text,
  contact_hint text,
  expires_at timestamptz,
  scope_codes text[],
  program_proposal jsonb
)
language sql
stable
security definer
set search_path = pg_catalog
as $function$
  select
    invitation.id,
    intent.id,
    invitation.status::text,
    invitation.channel,
    left(invitation.contact::text, 1) || '***'
      || substring(invitation.contact::text from position('@' in invitation.contact::text)),
    invitation.expires_at,
    coalesce(
      (
        select array_agg(option.scope_code order by option.scope_code)
        from privacy.invitation_scope_options as option
        where option.invitation_intent_id = intent.id
      ),
      array[]::text[]
    ),
    (
      select jsonb_build_object(
        'invitation_intent_id', program.id,
        'program_version_id', program.proposed_program_version_id,
        'starts_on', program.proposed_starts_on,
        'timezone', program.proposed_timezone
      )
      from identity.invitation_intents as program
      where program.invitation_id = invitation.id
        and program.kind = 'program_assignment'
    )
  from identity.invitations as invitation
  join identity.invitation_intents as intent
    on intent.invitation_id = invitation.id
   and intent.kind = 'service_relationship'
  where invitation.id = p_invitation_id;
$function$;
alter function identity.client_invitation_projection(uuid) owner to allfit_owner;
revoke all on function identity.client_invitation_projection(uuid) from public, allfit_api;

create function identity.issue_client_invitation(
  p_person_id uuid,
  p_organization_id uuid,
  p_channel text,
  p_contact text,
  p_scope_options jsonb,
  p_token_hash bytea,
  p_token_key_version smallint,
  p_idempotency_key uuid,
  p_command_id uuid,
  p_request_hash bytea,
  p_program_version_id uuid default null,
  p_program_starts_on date default null,
  p_program_timezone text default null
)
returns table (
  invitation_id uuid,
  invitation_intent_id uuid,
  status text,
  channel text,
  contact_hint text,
  expires_at timestamptz,
  scope_codes text[],
  program_proposal jsonb,
  reused boolean,
  replayed boolean
)
language plpgsql
security definer
set search_path = pg_catalog
as $function$
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
  proposing boolean := p_program_version_id is not null;
  proposal_zone text := nullif(btrim(p_program_timezone), '');
  zone_today date;
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

  -- A program is all three of version, start and zone, or it is not proposed.
  if proposing <> (p_program_starts_on is not null)
     or proposing <> (proposal_zone is not null) then
    raise exception 'a program proposal names a version, a start and a time zone'
      using errcode = '22023', detail = '["program"]';
  end if;
  if proposing then
    -- Without her training at contribute the program could never be created (criterion 7).
    if not exists (
      select 1 from jsonb_array_elements(p_scope_options) as offer
      where offer->>'scope_code' = 'relationship_training'
        and offer->>'access_level' = 'contribute'
    ) then
      raise exception 'a program needs relationship_training at contribute'
        using errcode = '22023', detail = '["scopes"]';
    end if;
    begin
      zone_today := (clock_timestamp() at time zone proposal_zone)::date;
    exception when others then
      raise exception 'invalid time zone' using errcode = '22023', detail = '["program-timezone"]';
    end;
    if p_program_starts_on < zone_today then
      raise exception 'a program starts today or later'
        using errcode = '22023', detail = '["program-starts-on"]';
    end if;
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
  -- Proposing a program is assigning one, and takes the same capability as OP-PLN-010.
  if proposing and not access_control.has_capability(p_organization_id, 'assign_programs') then
    raise exception 'assign_programs capability required' using errcode = '42501';
  end if;
  perform set_config('app.actor_org_id', p_organization_id::text, true);
  perform set_config('app.actor_membership_id', actor_membership_id::text, true);

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

  -- Published and not retired, and this organization's own (criterion 6). Shared, so a
  -- retirement cannot slip in between this check and the proposal.
  if proposing then
    perform version.id
    from planning.program_versions as version
    join planning.programs as program on program.id = version.program_id
    where version.id = p_program_version_id
      and version.status = 'published'
      and program.owner_organization_id = p_organization_id
      and program.status <> 'archived'
    for share of version;
    if not found then
      raise exception 'this program version cannot be proposed'
        using errcode = '22023', detail = '["program-version"]';
    end if;
  end if;

  computed_proposal_hash := identity.client_proposal_hash(
    p_organization_id, p_channel, normalized_contact, offered_codes,
    p_program_version_id, p_program_starts_on
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
    -- `offer`, not `option`: the loop above declares a variable of that name.
    from jsonb_array_elements(p_scope_options) as offer
    join lateral (
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

    if proposing then
      insert into identity.invitation_intents (
        invitation_id, kind, proposed_program_version_id, proposed_starts_on, proposed_timezone
      ) values (
        target_invitation_id, 'program_assignment', p_program_version_id, p_program_starts_on,
        proposal_zone
      );
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
alter function identity.issue_client_invitation(uuid, uuid, text, text, jsonb, bytea, smallint, uuid, uuid, bytea, uuid, date, text)
  owner to allfit_owner;
revoke all on function identity.issue_client_invitation(uuid, uuid, text, text, jsonb, bytea, smallint, uuid, uuid, bytea, uuid, date, text)
  from public;
grant execute on function identity.issue_client_invitation(uuid, uuid, text, text, jsonb, bytea, smallint, uuid, uuid, bytea, uuid, date, text)
  to allfit_api;

-- ---------------------------------------------------------------------------
-- OP-REL-015 / OP-IDN-056 — what she reads
-- ---------------------------------------------------------------------------

drop function identity.read_my_client_invitation(uuid);
drop function identity.resolve_client_invitation(bytea);

create function identity.resolve_client_invitation(p_token_hash bytea)
returns table (
  invitation_id uuid,
  status text,
  organization_id uuid,
  organization_display_name text,
  responsible_party jsonb,
  expires_at timestamptz,
  invitation_intent_id uuid,
  scope_options jsonb,
  invited_by text,
  program_proposal jsonb
)
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  target record;
  program_intent_id uuid;
  previous_purpose text := current_setting('app.contract_scope_purpose', true);
  previous_id text := current_setting('app.contract_scope_id', true);
  previous_token text := current_setting('app.contract_scope_token', true);
begin
  if access_control.actor_kind() <> 'person' then
    raise exception 'person actor required' using errcode = '42501';
  end if;
  if octet_length(p_token_hash) <> 32 then
    raise exception 'invalid invitation token' using errcode = '22023';
  end if;

  select invitation.id,
         invitation.status::text as invitation_status,
         invitation.organization_id,
         invitation.contact::text as contact,
         invitation.expires_at,
         intent.id as intent_id
    into target
  from identity.invitations as invitation
  join identity.invitation_intents as intent
    on intent.invitation_id = invitation.id
   and intent.kind = 'service_relationship'
  where invitation.token_hash = p_token_hash;

  if not found then
    return;
  end if;

  -- Only the person who proved the invited contact is theirs may read it.
  if lower(target.contact) is distinct from
     lower(nullif(current_setting('app.actor_verified_email', true), '')) then
    raise exception 'verified email mismatch' using errcode = '42501';
  end if;

  -- Expiry is settled on read: one that reads as pending after it expired would be answered.
  if target.invitation_status = 'pending' and target.expires_at <= clock_timestamp() then
    update identity.invitations as invitation
    set status = 'expired'
    where invitation.id = target.id;

    update identity.invitation_intents as intent
    set status = 'expired', decided_at = clock_timestamp()
    where intent.invitation_id = target.id
      and intent.status = 'pending';

    perform system.enqueue_outbox_event(
      'invitation',
      target.id,
      'identity.invitation_expired.v1',
      jsonb_build_object('invitation_id', target.id)
    );
    return;
  end if;

  -- She is not the gym's: she reads its program only as the proposal addressed to her.
  select intent.id into program_intent_id
  from identity.invitation_intents as intent
  where intent.invitation_id = target.id
    and intent.kind = 'program_assignment';
  if program_intent_id is not null then
    perform access_control.open_contract_scope('invitation_program', program_intent_id);
  end if;

  return query
  select target.id,
         target.invitation_status,
         target.organization_id,
         organization.display_name,
         invitation.responsible_party,
         target.expires_at,
         target.intent_id,
         coalesce(
           (
             select jsonb_agg(
                      jsonb_build_object(
                        'scope_code', option.scope_code,
                        'offered_access_level', option.offered_access_level,
                        'purpose', option.purpose,
                        'presented_snapshot_schema_version', option.presented_snapshot_schema_version,
                        'presented_snapshot', option.presented_snapshot,
                        'decision', option.decision
                      )
                      order by option.scope_code
                    )
             from privacy.invitation_scope_options as option
             where option.invitation_intent_id = target.intent_id
           ),
           '[]'::jsonb
         ),
         inviter.display_name,
         (
           select jsonb_build_object(
             'invitation_intent_id', program.id,
             'program_version_id', version.id,
             'title', version.title,
             'version_number', version.version_number,
             'repeats_forever', version.repeats_forever,
             'weeks', case when version.repeats_forever then null else (
               select max(composition.week) from planning.program_version_sessions as composition
               where composition.program_version_id = version.id
             ) end,
             'starts_on', program.proposed_starts_on,
             'required_scope', jsonb_build_object(
               'scope_code', 'relationship_training', 'access_level', 'contribute'
             ),
             'decision', case program.status::text
               when 'accepted' then 'accepted'
               when 'rejected' then 'rejected'
             end
           )
           from identity.invitation_intents as program
           join planning.program_versions as version on version.id = program.proposed_program_version_id
           where program.id = program_intent_id
         )
  from identity.invitations as invitation
  join organizations.organizations as organization
    on organization.id = invitation.organization_id
  left join organizations.organization_memberships as membership
    on membership.id = invitation.issued_by_membership_id
  left join identity.people as inviter on inviter.id = membership.person_id
  where invitation.id = target.id;

  perform set_config('app.contract_scope_purpose', coalesce(previous_purpose, ''), true);
  perform set_config('app.contract_scope_id', coalesce(previous_id, ''), true);
  perform set_config('app.contract_scope_token', coalesce(previous_token, ''), true);
end;
$function$;
alter function identity.resolve_client_invitation(bytea) owner to allfit_owner;
revoke all on function identity.resolve_client_invitation(bytea) from public;
grant execute on function identity.resolve_client_invitation(bytea) to allfit_api;

create function identity.read_my_client_invitation(p_invitation_id uuid)
returns table (
  invitation_id uuid,
  status text,
  organization_id uuid,
  organization_display_name text,
  responsible_party jsonb,
  expires_at timestamptz,
  invitation_intent_id uuid,
  scope_options jsonb,
  invited_by text,
  program_proposal jsonb
)
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  hash bytea;
begin
  select invitation.token_hash into hash
  from identity.invitations as invitation
  where invitation.id = p_invitation_id;
  if hash is null then
    return;
  end if;
  return query select * from identity.resolve_client_invitation(hash);
end
$function$;
alter function identity.read_my_client_invitation(uuid) owner to allfit_owner;
revoke all on function identity.read_my_client_invitation(uuid) from public;
grant execute on function identity.read_my_client_invitation(uuid) to allfit_api;

-- ---------------------------------------------------------------------------
-- OP-IDN-009 — her answer
-- ---------------------------------------------------------------------------

-- What became of the program she was offered, or null when none was.
create function identity.client_program_outcome(p_invitation_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog
as $function$
  select jsonb_build_object(
    'invitation_intent_id', program.id,
    'intent_status', program.status::text,
    'assignment_id', program.materialized_assignment_id,
    'unmaterialized_reason', program.unmaterialized_reason
  )
  from identity.invitation_intents as program
  where program.invitation_id = p_invitation_id
    and program.kind = 'program_assignment'
$function$;
alter function identity.client_program_outcome(uuid) owner to allfit_owner;
revoke all on function identity.client_program_outcome(uuid) from public, allfit_api;

drop function identity.decide_my_client_invitation(uuid, uuid, uuid, text, jsonb, uuid, uuid, bytea);
drop function identity.decide_client_invitation(uuid, bytea, uuid, text, jsonb, uuid, uuid, bytea);

create function identity.decide_client_invitation(
  p_person_id uuid,
  p_token_hash bytea,
  p_intent_id uuid,
  p_relationship_decision text,
  p_scope_decisions jsonb,
  p_idempotency_key uuid,
  p_command_id uuid,
  p_request_hash bytea,
  p_program_decision text default null,
  p_timezone text default null
)
returns table (
  invitation_id uuid,
  invitation_status text,
  organization_id uuid,
  invitation_intent_id uuid,
  intent_status text,
  relationship_id uuid,
  granted_scope_codes text[],
  program_proposal jsonb,
  replayed boolean
)
language plpgsql
security definer
set search_path = pg_catalog
as $function$
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
  organization_status text;
  program_intent_id uuid;
  program_assignment_id uuid;
  program_reason text;
  device_zone text := nullif(btrim(p_timezone), '');
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
  if p_program_decision is not null and p_program_decision not in ('accepted', 'rejected') then
    raise exception 'invalid program decision' using errcode = '22023', detail = '["program-decision"]';
  end if;
  if device_zone is not null then
    begin
      perform clock_timestamp() at time zone device_zone;
    exception when others then
      raise exception 'invalid time zone' using errcode = '22023', detail = '["timezone"]';
    end;
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
  -- Only the person who proved the invited contact is theirs may answer it.
  if lower(target.contact) is distinct from
     lower(nullif(current_setting('app.actor_verified_email', true), '')) then
    raise exception 'verified email mismatch' using errcode = '42501';
  end if;

  select intent.id into program_intent_id
  from identity.invitation_intents as intent
  where intent.invitation_id = target.id
    and intent.kind = 'program_assignment'
  for update;
  if p_program_decision is not null and program_intent_id is null then
    raise exception 'this invitation offers no program'
      using errcode = '22023', detail = '["program-decision"]';
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
      replay.intent_id, replay.intent_status, resolved_relationship_id, granted,
      identity.client_program_outcome(replay.id), true;
    return;
  end if;

  -- After the replay branch: a retry arrives at a closed invitation by definition.
  if target.status <> 'pending' or target.expires_at <= decision_time then
    raise exception 'invitation is no longer open' using errcode = '23514';
  end if;

  if p_relationship_decision = 'rejected' then
    update identity.invitation_intents
    set status = 'rejected', decided_at = decision_time
    where id = p_intent_id;
    -- Declining the relationship declines what it was asking for, options and program alike.
    update privacy.invitation_scope_options as scope_option
    set decision = 'rejected', decided_at = decision_time
    where scope_option.invitation_intent_id = p_intent_id
      and scope_option.decision is null;
    update identity.invitation_intents as program
    set status = 'rejected', decided_at = decision_time
    where program.id = program_intent_id
      and program.status = 'pending';
  else
    -- HU-STUDIO-087. This invitation already holds its place, so accepting converts it.
    perform pg_catalog.set_config('lock_timeout', '750ms', true);
    select organization.status::text into organization_status
    from organizations.organizations as organization
    where organization.id = target.organization_id
    for no key update;
    -- HU-BO-016. A gym that is not operating gains no client; the invitation stays open.
    if organization_status is distinct from 'active' then
      raise exception 'the organization is not operating' using errcode = 'AF423';
    end if;
    if organizations.guest_places_exhausted(target.organization_id, 1) then
      raise exception 'the organization has no guest places left' using errcode = 'AF409';
    end if;
    -- A person returning to the same organization gets a new relationship, never a revived row.
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

    update identity.invitation_intents
    set status = 'accepted',
        decided_at = decision_time,
        materialized_relationship_id = resolved_relationship_id
    where id = p_intent_id;

    -- Every option presented gets an answer; one not mentioned is declined.
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

    -- The program is answered on its own, and silence is a no (HU-SP-017 criteria 1 and 9).
    if program_intent_id is not null then
      if coalesce(p_program_decision, 'rejected') = 'rejected' then
        update identity.invitation_intents
        set status = 'rejected', decided_at = decision_time
        where id = program_intent_id;
      else
        if exists (
          select 1 from privacy.data_grants as grant_row
          where grant_row.relationship_id = resolved_relationship_id
            and grant_row.scope_code = 'relationship_training'
            and grant_row.access_level = 'contribute'
            and grant_row.status = 'active'
        ) then
          program_assignment_id := planning.plant_invited_program(
            program_intent_id, resolved_relationship_id, device_zone
          );
          if program_assignment_id is null then
            program_reason := 'program_unavailable';
          end if;
        else
          program_reason := 'training_not_granted';
        end if;
        update identity.invitation_intents
        set status = 'accepted',
            decided_at = decision_time,
            materialized_assignment_id = program_assignment_id,
            unmaterialized_reason = program_reason
        where id = program_intent_id;
      end if;
    end if;
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
  if program_intent_id is not null then
    perform system.enqueue_outbox_event(
      'invitation',
      target.id,
      'identity.invitation_intent_decided.v1',
      jsonb_build_object('invitation_id', target.id, 'invitation_intent_id', program_intent_id)
    );
  end if;
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
         identity.client_program_outcome(invitation.id),
         false
  from identity.invitations as invitation
  join identity.invitation_intents as intent on intent.invitation_id = invitation.id
  where invitation.id = target.id and intent.id = p_intent_id;
end
$function$;
alter function identity.decide_client_invitation(uuid, bytea, uuid, text, jsonb, uuid, uuid, bytea, text, text)
  owner to allfit_owner;
revoke all on function identity.decide_client_invitation(uuid, bytea, uuid, text, jsonb, uuid, uuid, bytea, text, text)
  from public;
grant execute on function identity.decide_client_invitation(uuid, bytea, uuid, text, jsonb, uuid, uuid, bytea, text, text)
  to allfit_api;

create function identity.decide_my_client_invitation(
  p_person_id uuid,
  p_invitation_id uuid,
  p_intent_id uuid,
  p_relationship_decision text,
  p_scope_decisions jsonb,
  p_idempotency_key uuid,
  p_command_id uuid,
  p_request_hash bytea,
  p_program_decision text default null,
  p_timezone text default null
)
returns table (
  invitation_id uuid,
  invitation_status text,
  organization_id uuid,
  invitation_intent_id uuid,
  intent_status text,
  relationship_id uuid,
  granted_scope_codes text[],
  program_proposal jsonb,
  replayed boolean
)
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  hash bytea;
begin
  select invitation.token_hash into hash
  from identity.invitations as invitation
  where invitation.id = p_invitation_id;
  if hash is null then
    raise exception 'invitation not found' using errcode = 'P0002';
  end if;
  return query select * from identity.decide_client_invitation(
    p_person_id, hash, p_intent_id, p_relationship_decision, p_scope_decisions,
    p_idempotency_key, p_command_id, p_request_hash, p_program_decision, p_timezone);
end
$function$;
alter function identity.decide_my_client_invitation(uuid, uuid, uuid, text, jsonb, uuid, uuid, bytea, text, text)
  owner to allfit_owner;
revoke all on function identity.decide_my_client_invitation(uuid, uuid, uuid, text, jsonb, uuid, uuid, bytea, text, text)
  from public;
grant execute on function identity.decide_my_client_invitation(uuid, uuid, uuid, text, jsonb, uuid, uuid, bytea, text, text)
  to allfit_api;

-- ---------------------------------------------------------------------------
-- OP-IDN-051 — a reissue offers the same program
-- ---------------------------------------------------------------------------

-- The body is `20261104100300`'s; the reissue now also copies the program proposal.
create or replace function identity.resend_client_invitation(
  p_actor_person_id uuid,
  p_actor_session_id uuid,
  p_organization_id uuid,
  p_invitation_id uuid,
  p_token_hash bytea,
  p_token_key_version smallint,
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
  duty_id uuid;
  receipt record;
  response jsonb;
  organization_state organizations.organization_status;
  target identity.invitations%rowtype;
  target_intent identity.invitation_intents%rowtype;
  reissued_intent_id uuid;
  lapsed boolean;
  delivered uuid;
  resend_outcome text;
begin
  duty_id := identity.require_invitation_resender(p_actor_person_id, p_actor_session_id);
  if p_token_hash is null
     or octet_length(p_token_hash) <> 32
     or p_token_key_version is null
     or p_token_key_version <= 0 then
    raise exception 'invalid client invitation resend' using errcode = '22023';
  end if;

  -- Invitation, then organization: the order accepting and issuing take them in.
  select invitation.* into target
  from identity.invitations as invitation
  where invitation.id = p_invitation_id
    and invitation.organization_id = p_organization_id
  for update;
  select organization.status into organization_state
  from organizations.organizations as organization
  where organization.id = p_organization_id
  for update;
  if organization_state is null then
    raise exception 'organization not found' using errcode = 'P0002';
  end if;

  select intent.* into target_intent
  from identity.invitation_intents as intent
  where intent.invitation_id = p_invitation_id
    and intent.kind = 'service_relationship';
  if target.id is null or target_intent.id is null then
    raise exception 'client invitation not found' using errcode = 'P0002';
  end if;

  select * into receipt
  from system.begin_idempotency(
    p_actor_person_id, 'backoffice'::system.command_surface, 'backoffice',
    'OP-IDN-051', p_idempotency_key, p_command_id, p_request_hash
  );
  if not receipt.claimed then
    response := identity.backoffice_client_invitation_projection(receipt.aggregate_id);
    if response is null then
      raise exception 'idempotent client invitation resend not found' using errcode = '40001';
    end if;
    return query select
      response || jsonb_build_object(
        'outcome',
        case when receipt.aggregate_id = p_invitation_id then 'redelivered' else 'reissued' end
      ),
      true;
    return;
  end if;

  if organization_state <> 'active' then
    raise exception 'only an operating organization has client invitations to resend'
      using errcode = '55000';
  end if;

  lapsed := target.status::text = 'expired'
    or (target.status::text = 'pending' and target.expires_at <= clock_timestamp());

  if target.status::text = 'pending' and not lapsed then
    resend_outcome := 'redelivered';
    delivered := target.id;
  elsif lapsed and target_intent.status::text in ('pending', 'expired') then
    if exists (
      select 1 from identity.invitations as reissue
      where reissue.reissues_invitation_id = target.id
    ) then
      raise exception 'this invitation was already reissued; resend the new one'
        using errcode = '55000';
    end if;
    if exists (
      select 1 from identity.invitations as equal
      where equal.organization_id = target.organization_id
        and equal.proposal_hash = target.proposal_hash
        and equal.id <> target.id
        and equal.status::text = 'pending'
        and equal.expires_at > clock_timestamp()
    ) then
      raise exception 'an equal invitation is already pending' using errcode = '55000';
    end if;
    -- A reissue is a new invitation and takes a place; the organization row is locked above.
    if organizations.guest_places_exhausted(target.organization_id, 0) then
      raise exception 'the organization has no guest places left' using errcode = 'AF409';
    end if;
    resend_outcome := 'reissued';
    delivered := p_command_id;
  else
    raise exception 'only a pending or expired invitation is resent' using errcode = '55000';
  end if;

  -- The windows Studio consumes, so support's mail counts against the same limits.
  perform system.consume_invitation_rate_window(
    'actor_hour',
    extensions.digest(convert_to(p_actor_person_id::text, 'UTF8'), 'sha256'),
    interval '1 hour',
    20
  );
  perform system.consume_invitation_rate_window(
    'destination_day',
    extensions.digest(
      convert_to(target.organization_id::text || chr(31) || lower(target.contact::text), 'UTF8'),
      'sha256'
    ),
    interval '24 hours',
    3
  );

  if resend_outcome = 'redelivered' then
    update identity.invitations as invitation
    set expires_at = clock_timestamp() + interval '7 days'
    where invitation.id = target.id;

    perform system.enqueue_outbox_event(
      'invitation', target.id, 'relationship.client_invited.v1',
      jsonb_build_object('invitation_id', target.id)
    );
  else
    if target.status::text = 'pending' then
      update identity.invitations as invitation
      set status = 'expired'
      where invitation.id = target.id;
      perform system.enqueue_outbox_event(
        'invitation', target.id, 'identity.invitation_expired.v1',
        jsonb_build_object('invitation_id', target.id)
      );
    end if;
    update identity.invitation_intents as intent
    set status = 'expired', decided_at = clock_timestamp()
    where intent.invitation_id = target.id
      and intent.status = 'pending';

    insert into identity.invitations (
      id, organization_id, issued_by_person_id, issued_by_duty_assignment_id,
      reissues_invitation_id, channel, contact, token_hash, token_key_version, proposal_hash,
      responsible_party, expires_at
    )
    select p_command_id, organization.id, p_actor_person_id, duty_id,
           target.id, target.channel, target.contact, p_token_hash, p_token_key_version,
           target.proposal_hash, organization.responsible_party,
           clock_timestamp() + interval '7 days'
    from organizations.organizations as organization
    where organization.id = target.organization_id;
    insert into identity.invitation_intents (invitation_id, kind)
    values (p_command_id, 'service_relationship')
    returning id into reissued_intent_id;

    -- The offer, exactly as it was asked. The constraint trigger rejects anything else.
    insert into privacy.invitation_scope_options (
      invitation_intent_id, scope_definition_id, scope_code,
      offered_access_level, purpose, presented_snapshot_schema_version, presented_snapshot
    )
    select reissued_intent_id, option.scope_definition_id, option.scope_code,
           option.offered_access_level, option.purpose,
           option.presented_snapshot_schema_version, option.presented_snapshot
    from privacy.invitation_scope_options as option
    where option.invitation_intent_id = target_intent.id;

    -- And the program, when there was one, on the same version, start and zone.
    insert into identity.invitation_intents (
      invitation_id, kind, proposed_program_version_id, proposed_starts_on, proposed_timezone
    )
    select p_command_id, 'program_assignment', program.proposed_program_version_id,
           program.proposed_starts_on, program.proposed_timezone
    from identity.invitation_intents as program
    where program.invitation_id = target.id
      and program.kind = 'program_assignment';

    perform system.enqueue_outbox_event(
      'invitation', p_command_id, 'relationship.client_invited.v1',
      jsonb_build_object('invitation_id', p_command_id)
    );
  end if;

  insert into identity.invitation_resends (
    invitation_id, delivered_invitation_id, kind, outcome, actor_person_id,
    actor_duty_assignment_id
  ) values (
    target.id, delivered, 'service_relationship', resend_outcome, p_actor_person_id, duty_id
  );

  perform system.finish_idempotency(
    receipt.receipt_id, 200::smallint, 'client-invitation-resent', 'invitation', delivered
  );
  return query select
    identity.backoffice_client_invitation_projection(delivered)
      || jsonb_build_object('outcome', resend_outcome),
    false;
end
$function$;

/*
 * A reissued intent matches the original's intent of its own kind. This compared against
 * the original's first intent, which held while every invitation had one; a client
 * invitation with a program has two. The body is `20260927010000`'s with that lookup.
 */
create or replace function identity.invitation_intent_issuer_tg()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  platform_issued boolean;
  organization_state organizations.organization_status;
  reissued_from uuid;
  original_kind identity.invitation_intent_kind;
  original_role text;
begin
  select invitation.issued_by_person_id is not null, organization.status,
         invitation.reissues_invitation_id
  into platform_issued, organization_state, reissued_from
  from identity.invitations as invitation
  join organizations.organizations as organization on organization.id = invitation.organization_id
  where invitation.id = new.invitation_id;

  if new.kind = 'ownership'
     and not (coalesce(platform_issued, false) and organization_state = 'unclaimed') then
    raise exception 'an ownership intent belongs to an invitation Allfit issued for an unclaimed organization'
      using errcode = '23514';
  end if;
  if new.kind <> 'ownership' and coalesce(platform_issued, false) and reissued_from is null then
    raise exception 'only a member issues a team or client intent; Allfit only reissues one'
      using errcode = '23514';
  end if;

  if reissued_from is not null then
    select intent.kind, intent.proposed_role_code into original_kind, original_role
    from identity.invitation_intents as intent
    where intent.invitation_id = reissued_from
      and intent.kind = new.kind
    order by intent.created_at, intent.id
    limit 1;

    if original_kind is distinct from new.kind
       or original_role is distinct from new.proposed_role_code then
      raise exception 'a reissued invitation proposes exactly what the original did'
        using errcode = '23514';
    end if;
  end if;
  return new;
end
$function$;

/*
 * A reissue offers exactly what the original offered: the same scopes under the same
 * versions, levels and purposes, and the same program. The program enters the hash the
 * reissue inherited and is compared column by column, so swapping it cannot match.
 */
create or replace function privacy.enforce_reissued_offer_matches()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  written_intent_id uuid;
  intent_id uuid;
  invitation_id uuid;
  original_intent_id uuid;
  invitation identity.invitations%rowtype;
  written_codes text[];
  written_program record;
  rebuilt_hash bytea;
begin
  -- Branching, not a `case`: neither table has the other's column.
  if tg_table_name = 'invitation_intents' then
    written_intent_id := new.id;
  else
    written_intent_id := new.invitation_intent_id;
  end if;

  -- Only a client intent has an offer to match; a program row checks its relationship's.
  select intent.invitation_id into invitation_id
  from identity.invitation_intents as intent
  where intent.id = written_intent_id
    and intent.kind in ('service_relationship', 'program_assignment');
  if invitation_id is null then
    return null;
  end if;

  select * into invitation
  from identity.invitations as candidate
  where candidate.id = invitation_id;
  if invitation.reissues_invitation_id is null then
    return null;
  end if;

  select intent.id into intent_id
  from identity.invitation_intents as intent
  where intent.invitation_id = invitation.id
    and intent.kind = 'service_relationship';
  select intent.id into original_intent_id
  from identity.invitation_intents as intent
  where intent.invitation_id = invitation.reissues_invitation_id
    and intent.kind = 'service_relationship';

  select coalesce(array_agg(option.scope_code order by option.scope_code), array[]::text[])
  into written_codes
  from privacy.invitation_scope_options as option
  where option.invitation_intent_id = intent_id;

  select intent.proposed_program_version_id as version_id, intent.proposed_starts_on as starts_on
  into written_program
  from identity.invitation_intents as intent
  where intent.invitation_id = invitation.id
    and intent.kind = 'program_assignment';

  -- The inherited hash is the checksum of the original offer, so a changed one cannot match.
  rebuilt_hash := identity.client_proposal_hash(
    invitation.organization_id, invitation.channel, invitation.contact::text, written_codes,
    written_program.version_id, written_program.starts_on
  );
  if rebuilt_hash is distinct from invitation.proposal_hash then
    raise exception 'a reissued client invitation offers exactly what the original offered'
      using errcode = '23514';
  end if;

  -- The codes are right; the level, purpose and version each was asked under must be too.
  if exists (
    select scope_code, scope_definition_id, offered_access_level, purpose
    from privacy.invitation_scope_options
    where invitation_intent_id = intent_id
    except
    select scope_code, scope_definition_id, offered_access_level, purpose
    from privacy.invitation_scope_options
    where invitation_intent_id = original_intent_id
  ) or exists (
    select scope_code, scope_definition_id, offered_access_level, purpose
    from privacy.invitation_scope_options
    where invitation_intent_id = original_intent_id
    except
    select scope_code, scope_definition_id, offered_access_level, purpose
    from privacy.invitation_scope_options
    where invitation_intent_id = intent_id
  ) or exists (
    select program.proposed_program_version_id, program.proposed_starts_on, program.proposed_timezone
    from identity.invitation_intents as program
    where program.invitation_id = invitation.id and program.kind = 'program_assignment'
    except
    select program.proposed_program_version_id, program.proposed_starts_on, program.proposed_timezone
    from identity.invitation_intents as program
    where program.invitation_id = invitation.reissues_invitation_id and program.kind = 'program_assignment'
  ) or exists (
    select program.proposed_program_version_id, program.proposed_starts_on, program.proposed_timezone
    from identity.invitation_intents as program
    where program.invitation_id = invitation.reissues_invitation_id and program.kind = 'program_assignment'
    except
    select program.proposed_program_version_id, program.proposed_starts_on, program.proposed_timezone
    from identity.invitation_intents as program
    where program.invitation_id = invitation.id and program.kind = 'program_assignment'
  ) then
    raise exception 'a reissued client invitation offers exactly what the original offered'
      using errcode = '23514';
  end if;
  return null;
end
$function$;
