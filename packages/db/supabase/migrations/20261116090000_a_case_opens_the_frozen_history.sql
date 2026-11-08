-- A case opens the frozen history (HU-STUDIO-061, HU-STUDIO-062, HU-STUDIO-063).
--
-- When a relationship ends, what the person shared is frozen at the cut
-- (`relationships.close_relationship`) and no live read reaches it again. This migration
-- opens it exceptionally, read only, audited and for a few hours:
--
--   · `OP-PRV-018` an owner or admin opens a case: purpose from a closed list, a
--     reference, a written justification, at most 24 hours, one authorized membership.
--   · `OP-PRV-020` the authorized member reads what existed at the cut.
--   · `OP-PRV-019` an owner or admin closes it; `OP-PRV-025` lists cases.
--
-- Decisions taken for V1, recorded in the ADR as implemented:
--
--   · "Stronger authentication" is a recent sign-in: the Studio session that opens a case
--     or reads through it authenticated less than ten minutes ago. The instant is the
--     provider's `auth_time` from the verified token, stored with every login, which a
--     refresh never advances; Studio forces a fresh login with `max_age=0` to renew it.
--   · The case names the opener herself or the professional who held the relationship at
--     the cut, while their membership qualifies. Never staff, never a third admin.
--   · What is readable afterwards is what the frozen scope version marks
--     `historical_readable` and does not exclude: executed sessions and structured body
--     measurements in V1. Health, photos, notes, programs and profile never are.
--   · The cut is strict: a session that ended after it, or was corrected after it, does
--     not exist for the case; neither does a measurement recorded after it, nor a session
--     she hid from that relationship, then or since.
--   · Expiry is derived: an open case past `expires_at` reads as `expired` and opens
--     nothing. Revoking a frozen permission, or the authorized membership ceasing to
--     qualify, closes the case at once.
--
-- The case stores the person and the cut it was opened against, checked against the
-- relationship when it opens, so no read through it ever needs the ended relationship.
set lock_timeout = '5s';
set statement_timeout = '60s';

begin;

-- ---------------------------------------------------------------------------
-- A recent sign-in on a Studio session
-- ---------------------------------------------------------------------------

alter table identity.access_sessions
  add column authenticated_at timestamptz,
  add constraint ck_access_sessions_authenticated check (
    authenticated_at is null or surface = 'studio'::identity.access_session_surface
  );

-- How long a sign-in counts as recent. The only place the window is written.
create function identity.recent_authentication_window()
returns interval
language sql
immutable
set search_path = pg_catalog
as $function$
  select interval '10 minutes'
$function$;

alter function identity.recent_authentication_window() owner to allfit_owner;
revoke all on function identity.recent_authentication_window() from public, allfit_api;

-- Now carries when the person last authenticated, as the provider's verified token says.
-- A caller with six arguments (the API before this release) signs in with no instant.
drop function identity.create_access_session(
  uuid, text, identity.access_session_surface, bytea, text, timestamptz
);

create function identity.create_access_session(
  p_access_account_id uuid,
  p_provider_session_id text,
  p_surface identity.access_session_surface,
  p_token_hash bytea,
  p_token_ciphertext text,
  p_access_token_expires_at timestamptz,
  p_authenticated_at timestamptz default null
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  result_id uuid;
begin
  if p_authenticated_at > clock_timestamp() + interval '1 minute' then
    raise exception 'an authentication cannot happen in the future' using errcode = '22023';
  end if;

  insert into identity.access_sessions (
    access_account_id,
    provider_session_id,
    surface,
    token_hash,
    token_ciphertext,
    access_token_expires_at,
    authenticated_at
  ) values (
    p_access_account_id,
    p_provider_session_id,
    p_surface,
    p_token_hash,
    p_token_ciphertext,
    p_access_token_expires_at,
    p_authenticated_at
  )
  on conflict (surface, provider_session_id) do update
  set access_account_id = excluded.access_account_id,
      token_hash = excluded.token_hash,
      token_ciphertext = excluded.token_ciphertext,
      access_token_expires_at = excluded.access_token_expires_at,
      authenticated_at = excluded.authenticated_at,
      token_version = identity.access_sessions.token_version + 1,
      revoked_at = null
  returning id into result_id;

  return result_id;
end
$function$;

alter function identity.create_access_session(
  uuid, text, identity.access_session_surface, bytea, text, timestamptz, timestamptz
) owner to allfit_owner;
revoke all on function identity.create_access_session(
  uuid, text, identity.access_session_surface, bytea, text, timestamptz, timestamptz
) from public;
grant execute on function identity.create_access_session(
  uuid, text, identity.access_session_surface, bytea, text, timestamptz, timestamptz
) to allfit_api;

drop function identity.load_access_session(bytea, identity.access_session_surface);

create function identity.load_access_session(
  p_token_hash bytea,
  p_surface identity.access_session_surface
)
returns table (
  session_id uuid,
  account_id uuid,
  person_id uuid,
  external_subject text,
  provider_session_id text,
  token_ciphertext text,
  access_token_expires_at timestamptz,
  token_version integer,
  person_status text,
  recent_authentication_expires_at timestamptz
)
language sql
stable
security definer
set search_path = pg_catalog
as $function$
  select
    session.id,
    session.access_account_id,
    account.person_id,
    account.subject,
    session.provider_session_id,
    session.token_ciphertext,
    session.access_token_expires_at,
    session.token_version,
    person.status::text,
    session.authenticated_at + identity.recent_authentication_window()
  from identity.access_sessions as session
  join identity.access_accounts as account on account.id = session.access_account_id
  left join identity.people as person on person.id = account.person_id
  where session.token_hash = p_token_hash
    and session.surface = p_surface
    and session.revoked_at is null
$function$;

alter function identity.load_access_session(bytea, identity.access_session_surface) owner to allfit_owner;
revoke all on function identity.load_access_session(bytea, identity.access_session_surface) from public;
grant execute on function identity.load_access_session(bytea, identity.access_session_surface) to allfit_api;

-- `AF401` unless this person's live Studio session authenticated within the window.
create function identity.require_recent_studio_authentication(p_session_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $function$
begin
  if not exists (
    select 1
    from identity.access_sessions as session
    join identity.access_accounts as account on account.id = session.access_account_id
    where session.id = p_session_id
      and session.surface = 'studio'
      and session.revoked_at is null
      and account.person_id = access_control.person()
      and session.authenticated_at + identity.recent_authentication_window() > clock_timestamp()
  ) then
    raise exception 'a recent sign-in is required' using errcode = 'AF401';
  end if;
end
$function$;

alter function identity.require_recent_studio_authentication(uuid) owner to allfit_owner;
revoke all on function identity.require_recent_studio_authentication(uuid) from public, allfit_api;

-- ---------------------------------------------------------------------------
-- The case
-- ---------------------------------------------------------------------------

create type privacy.historical_access_purpose as enum (
  'service_dispute',
  'legal_or_regulatory_obligation',
  'customer_support_request',
  'security_investigation',
  'authorized_quality_review'
);
alter type privacy.historical_access_purpose owner to allfit_owner;

create type privacy.historical_case_status as enum ('open', 'closed');
alter type privacy.historical_case_status owner to allfit_owner;

create table privacy.historical_access_cases (
  id uuid not null default extensions.uuid_generate_v7(),
  organization_id uuid not null,
  relationship_id uuid not null,
  person_id uuid not null,
  cut_at timestamptz not null,
  authorized_membership_id uuid not null,
  opened_by_membership_id uuid not null,
  purpose privacy.historical_access_purpose not null,
  case_reference text not null,
  justification text not null,
  status privacy.historical_case_status not null default 'open',
  opened_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz not null,
  closed_at timestamptz,
  closed_reason text,
  closed_by_membership_id uuid,
  constraint pk_historical_access_cases primary key (id),
  -- IX-09: the relationship, its person and every membership belong to one organization.
  constraint fk_historical_access_cases_relationship foreign key (relationship_id, person_id, organization_id) references
    relationships.service_relationships (id, person_id, organization_id) on delete restrict,
  constraint fk_historical_access_cases_authorized foreign key (authorized_membership_id, organization_id) references
    organizations.organization_memberships (id, organization_id) on delete restrict,
  constraint fk_historical_access_cases_opened_by foreign key (opened_by_membership_id, organization_id) references
    organizations.organization_memberships (id, organization_id) on delete restrict,
  constraint fk_historical_access_cases_closed_by foreign key (closed_by_membership_id, organization_id) references
    organizations.organization_memberships (id, organization_id) on delete restrict,
  constraint ck_historical_access_cases_window check (
    expires_at > opened_at and expires_at <= opened_at + interval '24 hours'
  ),
  constraint ck_historical_access_cases_cut check (cut_at <= opened_at),
  constraint ck_historical_access_cases_reference check (
    case_reference = btrim(case_reference) and char_length(case_reference) between 1 and 120
  ),
  constraint ck_historical_access_cases_justification check (
    justification = btrim(justification) and char_length(justification) between 1 and 2000
  ),
  constraint ck_historical_access_cases_closed check (
    (status = 'closed') = (closed_at is not null) and (closed_at is null) = (closed_reason is null)
  ),
  constraint ck_historical_access_cases_closed_reason check (
    closed_reason is null
    or closed_reason in ('closed_by_manager', 'expired', 'grant_revoked', 'membership_ineligible')
  ),
  constraint ck_historical_access_cases_closed_by check (
    coalesce(closed_reason = 'closed_by_manager', false) = (closed_by_membership_id is not null)
  ),
  constraint ck_historical_access_cases_closed_after check (closed_at is null or closed_at >= opened_at)
);

-- One open case per relationship, membership and purpose. A closed one never blocks.
create unique index uidx_historical_access_cases_open
  on privacy.historical_access_cases (relationship_id, authorized_membership_id, purpose)
  where status = 'open';
create index idx_historical_access_cases_organization_opened
  on privacy.historical_access_cases (organization_id, opened_at desc, id desc);
create index idx_historical_access_cases_relationship
  on privacy.historical_access_cases (relationship_id, person_id, organization_id);
create index idx_historical_access_cases_authorized
  on privacy.historical_access_cases (authorized_membership_id, organization_id);
create index idx_historical_access_cases_opened_by
  on privacy.historical_access_cases (opened_by_membership_id, organization_id);
create index idx_historical_access_cases_closed_by
  on privacy.historical_access_cases (closed_by_membership_id, organization_id)
  where closed_by_membership_id is not null;

alter table privacy.historical_access_cases owner to allfit_owner;
alter table privacy.historical_access_cases enable row level security;
alter table privacy.historical_access_cases force row level security;
revoke all on privacy.historical_access_cases from public, allfit_api;

/*
 * Whether a membership may still exercise a case: active, in an active organization, with
 * a current role that fits. The opener named herself as owner or admin; a former holder
 * keeps his case as owner, admin or coach. It reads memberships only, never the
 * relationship, so it holds for whoever runs it.
 */
create function privacy.historical_case_member_qualifies(p_membership_id uuid, p_self boolean)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $function$
  select exists (
    select 1
    from organizations.organization_memberships as membership
    join organizations.organizations as organization on organization.id = membership.organization_id
    join organizations.membership_roles as membership_role
      on membership_role.membership_id = membership.id
     and membership_role.valid_to is null
    where membership.id = p_membership_id
      and membership.status = 'active'
      and organization.status = 'active'
      and membership_role.role_code = any (
        case when p_self then array['owner', 'admin'] else array['owner', 'admin', 'coach'] end
      )
  )
$function$;

alter function privacy.historical_case_member_qualifies(uuid, boolean) owner to allfit_owner;
revoke all on function privacy.historical_case_member_qualifies(uuid, boolean) from public, allfit_api;

/*
 * IX-10 at the instant a case opens: the relationship ended at the cut the case states,
 * the opener is an owner or admin, and the authorized membership is hers or the holder's
 * at the cut. Runs as the opener, who sees the gym's directory.
 */
create function privacy.enforce_historical_case_eligibility_ct()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $function$
begin
  if not exists (
       select 1
       from relationships.service_relationships as relationship
       where relationship.id = new.relationship_id
         and relationship.status = 'terminated'
         and relationship.ended_at = new.cut_at
     )
     or not privacy.historical_case_member_qualifies(new.opened_by_membership_id, true)
     or not privacy.historical_case_member_qualifies(
       new.authorized_membership_id, new.authorized_membership_id = new.opened_by_membership_id
     )
     or (
       new.authorized_membership_id <> new.opened_by_membership_id
       and not exists (
         select 1
         from relationships.relationship_professional_assignments as assignment
         where assignment.relationship_id = new.relationship_id
           and assignment.membership_id = new.authorized_membership_id
           and assignment.kind = 'holder'
           and assignment.valid_to = new.cut_at
       )
     ) then
    raise exception 'IX-10 the authorized membership cannot hold this case' using errcode = '23514';
  end if;

  return null;
end
$function$;

alter function privacy.enforce_historical_case_eligibility_ct() owner to allfit_owner;
revoke all on function privacy.enforce_historical_case_eligibility_ct() from public, allfit_api;

create constraint trigger trg_historical_access_cases_after_insert_eligible
after insert on privacy.historical_access_cases
for each row execute function privacy.enforce_historical_case_eligibility_ct();

-- A case only ever closes, once. What it said, and that it existed, stay.
create function privacy.keep_historical_access_case_tg()
returns trigger
language plpgsql
set search_path = pg_catalog
as $function$
begin
  if tg_op in ('DELETE', 'TRUNCATE') then
    raise exception 'a historical access case is never deleted' using errcode = '23514';
  end if;

  if old.status <> 'open'
     or new.status <> 'closed'
     or (new.id, new.organization_id, new.relationship_id, new.person_id, new.cut_at,
         new.authorized_membership_id, new.opened_by_membership_id, new.purpose,
         new.case_reference, new.justification, new.opened_at, new.expires_at)
        is distinct from
        (old.id, old.organization_id, old.relationship_id, old.person_id, old.cut_at,
         old.authorized_membership_id, old.opened_by_membership_id, old.purpose,
         old.case_reference, old.justification, old.opened_at, old.expires_at) then
    raise exception 'a historical access case only closes, once' using errcode = '23514';
  end if;

  return new;
end
$function$;

alter function privacy.keep_historical_access_case_tg() owner to allfit_owner;
revoke all on function privacy.keep_historical_access_case_tg() from public, allfit_api;

create trigger trg_historical_access_cases_before_update_keep
before update or delete on privacy.historical_access_cases
for each row execute function privacy.keep_historical_access_case_tg();
create trigger trg_historical_access_cases_before_truncate_keep
before truncate on privacy.historical_access_cases
for each statement execute function privacy.keep_historical_access_case_tg();

-- Whoever manages cases sees the gym's; the authorized member sees his own.
create policy historical_access_cases_select_manager on privacy.historical_access_cases
  for select to allfit_owner
  using (
    organization_id = access_control.org()
    and access_control.has_capability(organization_id, 'manage_historical_access')
  );
create policy historical_access_cases_select_authorized on privacy.historical_access_cases
  for select to allfit_owner
  using (access_control.owns_membership(authorized_membership_id));
-- Closing on her revocation or on a membership change, by whoever caused it.
create policy historical_access_cases_select_settlement on privacy.historical_access_cases
  for select to allfit_owner
  using (
    relationship_id::text = (select access_control.contract_scope('historical_case_settlement'))
    or authorized_membership_id::text = (select access_control.contract_scope('historical_case_membership'))
  );
create policy historical_access_cases_insert_manager on privacy.historical_access_cases
  for insert to allfit_owner
  with check (
    organization_id = access_control.org()
    and access_control.has_capability(organization_id, 'manage_historical_access')
    and access_control.owns_membership(opened_by_membership_id)
  );
create policy historical_access_cases_update_manager on privacy.historical_access_cases
  for update to allfit_owner
  using (
    organization_id = access_control.org()
    and access_control.has_capability(organization_id, 'manage_historical_access')
  )
  with check (
    organization_id = access_control.org()
    and access_control.has_capability(organization_id, 'manage_historical_access')
  );
create policy historical_access_cases_update_settlement on privacy.historical_access_cases
  for update to allfit_owner
  using (
    relationship_id::text = (select access_control.contract_scope('historical_case_settlement'))
    or authorized_membership_id::text = (select access_control.contract_scope('historical_case_membership'))
  )
  with check (
    relationship_id::text = (select access_control.contract_scope('historical_case_settlement'))
    or authorized_membership_id::text = (select access_control.contract_scope('historical_case_membership'))
  );

-- The case as Studio shows it. `expired` is derived: an open case past its hours.
create function privacy.historical_case_document(p_case_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog
as $function$
  select jsonb_build_object(
    'id', hcase.id,
    'organization_id', hcase.organization_id,
    'relationship_id', hcase.relationship_id,
    'person', jsonb_build_object(
      'id', person.id, 'given_name', person.given_name, 'family_name', person.family_name
    ),
    'cut_at', hcase.cut_at,
    'authorized', jsonb_build_object(
      'membership_id', hcase.authorized_membership_id,
      'given_name', authorized.given_name,
      'family_name', authorized.family_name
    ),
    'opened_by', jsonb_build_object(
      'membership_id', hcase.opened_by_membership_id,
      'given_name', opener.given_name,
      'family_name', opener.family_name
    ),
    'purpose', hcase.purpose,
    'case_reference', hcase.case_reference,
    'justification', hcase.justification,
    'status', case
      when hcase.status = 'open' and hcase.expires_at <= clock_timestamp() then 'expired'
      else hcase.status::text
    end,
    'opened_at', hcase.opened_at,
    'expires_at', hcase.expires_at,
    'closed_at', hcase.closed_at,
    'closed_reason', hcase.closed_reason,
    'closed_by', case when hcase.closed_by_membership_id is not null then jsonb_build_object(
      'membership_id', hcase.closed_by_membership_id,
      'given_name', closer.given_name,
      'family_name', closer.family_name
    ) end
  )
  from privacy.historical_access_cases as hcase
  join identity.people as person on person.id = hcase.person_id
  join organizations.organization_memberships as authorized_membership
    on authorized_membership.id = hcase.authorized_membership_id
  join identity.people as authorized on authorized.id = authorized_membership.person_id
  join organizations.organization_memberships as opener_membership
    on opener_membership.id = hcase.opened_by_membership_id
  join identity.people as opener on opener.id = opener_membership.person_id
  left join organizations.organization_memberships as closer_membership
    on closer_membership.id = hcase.closed_by_membership_id
  left join identity.people as closer on closer.id = closer_membership.person_id
  where hcase.id = p_case_id
$function$;

alter function privacy.historical_case_document(uuid) owner to allfit_owner;
revoke all on function privacy.historical_case_document(uuid) from public, allfit_api;

-- What closing announces: who, which relationship and why. Never the justification.
create function privacy.announce_historical_case_closed(p_case_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  closed record;
begin
  select hcase.organization_id, hcase.relationship_id, hcase.authorized_membership_id,
         hcase.purpose, hcase.closed_reason, hcase.closed_at
    into closed
  from privacy.historical_access_cases as hcase
  where hcase.id = p_case_id;

  perform system.enqueue_outbox_event(
    'historical_access_case',
    p_case_id,
    'privacy.historical_access_case_closed.v1',
    jsonb_build_object(
      'case_id', p_case_id,
      'organization_id', closed.organization_id,
      'relationship_id', closed.relationship_id,
      'authorized_membership_id', closed.authorized_membership_id,
      'purpose', closed.purpose,
      'closed_reason', closed.closed_reason,
      'closed_at', closed.closed_at
    )
  );
end
$function$;

alter function privacy.announce_historical_case_closed(uuid) owner to allfit_owner;
revoke all on function privacy.announce_historical_case_closed(uuid) from public, allfit_api;

-- A live membership of the actor in an active organization, set as the request's context.
create function privacy.enter_historical_case_organization(p_person_id uuid, p_organization_id uuid)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  actor_membership_id uuid;
begin
  if access_control.actor_kind() is distinct from 'person'
     or access_control.person() is distinct from p_person_id then
    raise exception 'person actor mismatch' using errcode = '42501';
  end if;

  select membership.id into actor_membership_id
  from organizations.organization_memberships as membership
  join organizations.organizations as organization on organization.id = membership.organization_id
  where membership.organization_id = p_organization_id
    and membership.person_id = p_person_id
    and membership.status = 'active'
    and organization.status = 'active';
  if actor_membership_id is null then
    raise exception 'a live membership is required' using errcode = '42501';
  end if;

  perform set_config('app.actor_org_id', p_organization_id::text, true);
  perform set_config('app.actor_membership_id', actor_membership_id::text, true);
  return actor_membership_id;
end
$function$;

alter function privacy.enter_historical_case_organization(uuid, uuid) owner to allfit_owner;
revoke all on function privacy.enter_historical_case_organization(uuid, uuid) from public, allfit_api;

-- ---------------------------------------------------------------------------
-- OP-PRV-018 — opening a case
-- ---------------------------------------------------------------------------

/*
 * The sign-in, the membership and the capability come first, so an outsider learns
 * nothing about which relationships exist. Frozen grants are locked for share: a
 * revocation either waits and then closes this case, or wins and leaves nothing frozen
 * to open (`P0004`). An equivalent case that ran out closes as `expired` first, so it
 * stops blocking; one still running refuses the new one on the index (`23505`).
 */
create function privacy.open_historical_access_case(
  p_person_id uuid,
  p_session_id uuid,
  p_organization_id uuid,
  p_relationship_id uuid,
  p_authorized_membership_id uuid,
  p_purpose text,
  p_case_reference text,
  p_justification text,
  p_duration_hours integer,
  p_idempotency_key uuid,
  p_command_id uuid,
  p_request_hash bytea
)
returns table (document jsonb, replayed boolean)
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  actor_membership_id uuid;
  receipt record;
  subject record;
  expired record;
  opened_case_id uuid;
  instant timestamptz;
begin
  if access_control.actor_kind() is distinct from 'person'
     or access_control.person() is distinct from p_person_id then
    raise exception 'person actor mismatch' using errcode = '42501';
  end if;
  perform identity.require_recent_studio_authentication(p_session_id);
  actor_membership_id := privacy.enter_historical_case_organization(p_person_id, p_organization_id);
  if not access_control.has_capability(p_organization_id, 'manage_historical_access') then
    raise exception 'manage_historical_access is required' using errcode = '42501';
  end if;

  select * into receipt
  from system.begin_idempotency(
    p_person_id, 'OP-PRV-018', p_idempotency_key, p_command_id, p_request_hash
  );
  if not receipt.claimed then
    return query select privacy.historical_case_document(receipt.aggregate_id), true;
    return;
  end if;

  if p_purpose is null
     or not (p_purpose = any (enum_range(null::privacy.historical_access_purpose)::text[])) then
    raise exception 'unknown purpose' using errcode = '22023';
  end if;
  if p_duration_hours is null or p_duration_hours not between 1 and 24 then
    raise exception 'a case lasts between 1 and 24 hours' using errcode = '22023';
  end if;
  if p_authorized_membership_id is null
     or char_length(btrim(coalesce(p_case_reference, ''))) not between 1 and 120
     or char_length(btrim(coalesce(p_justification, ''))) not between 1 and 2000 then
    raise exception 'a case names a membership, a reference and a justification' using errcode = '22023';
  end if;

  select relationship.person_id, relationship.ended_at into subject
  from relationships.service_relationships as relationship
  where relationship.id = p_relationship_id
    and relationship.organization_id = p_organization_id
    and relationship.status = 'terminated'
  for share;
  if not found then
    raise exception 'ended relationship not found' using errcode = 'P0002';
  end if;

  perform 1
  from privacy.data_grants as shared
  where shared.relationship_id = p_relationship_id
    and shared.status = 'frozen'
  for share;
  if not found then
    raise exception 'nothing of this relationship is still frozen' using errcode = 'P0004';
  end if;

  instant := clock_timestamp();
  for expired in
    update privacy.historical_access_cases as hcase
    set status = 'closed', closed_at = hcase.expires_at, closed_reason = 'expired'
    where hcase.relationship_id = p_relationship_id
      and hcase.authorized_membership_id = p_authorized_membership_id
      and hcase.purpose = p_purpose::privacy.historical_access_purpose
      and hcase.status = 'open'
      and hcase.expires_at <= instant
    returning hcase.id
  loop
    perform privacy.announce_historical_case_closed(expired.id);
  end loop;

  insert into privacy.historical_access_cases (
    organization_id, relationship_id, person_id, cut_at, authorized_membership_id,
    opened_by_membership_id, purpose, case_reference, justification, opened_at, expires_at
  ) values (
    p_organization_id, p_relationship_id, subject.person_id, subject.ended_at,
    p_authorized_membership_id, actor_membership_id, p_purpose::privacy.historical_access_purpose,
    btrim(p_case_reference), btrim(p_justification), instant,
    instant + make_interval(hours => p_duration_hours)
  )
  returning id into opened_case_id;

  -- Who may read, which relationship and until when. Never the justification or reference.
  perform system.enqueue_outbox_event(
    'historical_access_case',
    opened_case_id,
    'privacy.historical_access_case_opened.v1',
    jsonb_build_object(
      'case_id', opened_case_id,
      'organization_id', p_organization_id,
      'relationship_id', p_relationship_id,
      'authorized_membership_id', p_authorized_membership_id,
      'opened_by_membership_id', actor_membership_id,
      'purpose', p_purpose,
      'opened_at', instant,
      'expires_at', instant + make_interval(hours => p_duration_hours)
    )
  );

  perform system.finish_idempotency(
    receipt.receipt_id, 201::smallint, 'historical-access-case-opened',
    'historical_access_case', opened_case_id
  );

  return query select privacy.historical_case_document(opened_case_id), false;
end
$function$;

alter function privacy.open_historical_access_case(
  uuid, uuid, uuid, uuid, uuid, text, text, text, integer, uuid, uuid, bytea
) owner to allfit_owner;
revoke all on function privacy.open_historical_access_case(
  uuid, uuid, uuid, uuid, uuid, text, text, text, integer, uuid, uuid, bytea
) from public;
grant execute on function privacy.open_historical_access_case(
  uuid, uuid, uuid, uuid, uuid, text, text, text, integer, uuid, uuid, bytea
) to allfit_api;

-- ---------------------------------------------------------------------------
-- OP-PRV-019 — closing it
-- ---------------------------------------------------------------------------

-- Closing converges: a closed case answers as it was closed. One past its hours closes as
-- `expired` at the instant it ran out, whoever asks.
create function privacy.close_historical_access_case(
  p_person_id uuid,
  p_organization_id uuid,
  p_case_id uuid,
  p_idempotency_key uuid,
  p_command_id uuid,
  p_request_hash bytea
)
returns table (document jsonb, replayed boolean)
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  actor_membership_id uuid;
  receipt record;
  target record;
  instant timestamptz;
begin
  actor_membership_id := privacy.enter_historical_case_organization(p_person_id, p_organization_id);
  if not access_control.has_capability(p_organization_id, 'manage_historical_access') then
    raise exception 'manage_historical_access is required' using errcode = '42501';
  end if;

  select * into receipt
  from system.begin_idempotency(
    p_person_id, 'OP-PRV-019', p_idempotency_key, p_command_id, p_request_hash
  );
  if not receipt.claimed then
    return query select privacy.historical_case_document(receipt.aggregate_id), true;
    return;
  end if;

  select hcase.status, hcase.expires_at into target
  from privacy.historical_access_cases as hcase
  where hcase.id = p_case_id
    and hcase.organization_id = p_organization_id
  for update;
  if not found then
    raise exception 'case not found' using errcode = 'P0002';
  end if;

  if target.status = 'open' then
    instant := clock_timestamp();
    update privacy.historical_access_cases as hcase
    set status = 'closed',
        closed_at = least(instant, hcase.expires_at),
        closed_reason = case when hcase.expires_at <= instant then 'expired' else 'closed_by_manager' end,
        closed_by_membership_id = case when hcase.expires_at <= instant then null else actor_membership_id end
    where hcase.id = p_case_id;
    perform privacy.announce_historical_case_closed(p_case_id);
  end if;

  perform system.finish_idempotency(
    receipt.receipt_id, 200::smallint, 'historical-access-case-closed',
    'historical_access_case', p_case_id
  );

  return query select privacy.historical_case_document(p_case_id), false;
end
$function$;

alter function privacy.close_historical_access_case(uuid, uuid, uuid, uuid, uuid, bytea) owner to allfit_owner;
revoke all on function privacy.close_historical_access_case(uuid, uuid, uuid, uuid, uuid, bytea) from public;
grant execute on function privacy.close_historical_access_case(uuid, uuid, uuid, uuid, uuid, bytea) to allfit_api;

-- ---------------------------------------------------------------------------
-- OP-PRV-025 — listing cases
-- ---------------------------------------------------------------------------

-- Newest first, a page at a time on (millisecond, id). The policies decide which: all of
-- the gym's for whoever manages cases, his own for the authorized member, none otherwise.
create function privacy.list_historical_access_cases(
  p_person_id uuid,
  p_organization_id uuid,
  p_relationship_id uuid,
  p_limit integer,
  p_cursor_opened_at timestamptz,
  p_cursor_id uuid
)
returns table (id uuid, opened_at timestamptz, document jsonb)
language plpgsql
security definer
set search_path = pg_catalog
as $function$
begin
  perform privacy.enter_historical_case_organization(p_person_id, p_organization_id);

  return query
  select hcase.id, keyed.opened_ms, privacy.historical_case_document(hcase.id)
  from privacy.historical_access_cases as hcase
  cross join lateral (select date_trunc('milliseconds', hcase.opened_at) as opened_ms) as keyed
  where hcase.organization_id = p_organization_id
    and (p_relationship_id is null or hcase.relationship_id = p_relationship_id)
    and (p_cursor_opened_at is null or (keyed.opened_ms, hcase.id) < (p_cursor_opened_at, p_cursor_id))
  order by keyed.opened_ms desc, hcase.id desc
  limit least(greatest(coalesce(p_limit, 26), 1), 101);
end
$function$;

alter function privacy.list_historical_access_cases(uuid, uuid, uuid, integer, timestamptz, uuid)
  owner to allfit_owner;
revoke all on function privacy.list_historical_access_cases(uuid, uuid, uuid, integer, timestamptz, uuid)
  from public;
grant execute on function privacy.list_historical_access_cases(uuid, uuid, uuid, integer, timestamptz, uuid)
  to allfit_api;

-- ---------------------------------------------------------------------------
-- Closing on its own
-- ---------------------------------------------------------------------------

-- She revoked a frozen permission: every open case of that relationship closes.
create function privacy.close_cases_of_revoked_grant_tg()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  closed record;
  instant timestamptz := clock_timestamp();
  previous_purpose text := current_setting('app.contract_scope_purpose', true);
  previous_id text := current_setting('app.contract_scope_id', true);
  previous_token text := current_setting('app.contract_scope_token', true);
begin
  perform access_control.open_contract_scope('historical_case_settlement', new.relationship_id);
  for closed in
    update privacy.historical_access_cases as hcase
    set status = 'closed',
        closed_at = least(instant, hcase.expires_at),
        closed_reason = case when hcase.expires_at <= instant then 'expired' else 'grant_revoked' end
    where hcase.relationship_id = new.relationship_id
      and hcase.status = 'open'
    returning hcase.id
  loop
    perform privacy.announce_historical_case_closed(closed.id);
  end loop;
  perform planning.resume_contract_scope(previous_purpose, previous_id, previous_token);
  return null;
end
$function$;

alter function privacy.close_cases_of_revoked_grant_tg() owner to allfit_owner;
revoke all on function privacy.close_cases_of_revoked_grant_tg() from public, allfit_api;

create trigger trg_data_grants_after_update_historical_cases
after update of status on privacy.data_grants
for each row
when (old.status = 'frozen' and new.status = 'revoked')
execute function privacy.close_cases_of_revoked_grant_tg();

-- The authorized membership stopped qualifying: its open cases close.
create function privacy.close_ineligible_historical_cases(p_membership_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  closed record;
  instant timestamptz := clock_timestamp();
  previous_purpose text := current_setting('app.contract_scope_purpose', true);
  previous_id text := current_setting('app.contract_scope_id', true);
  previous_token text := current_setting('app.contract_scope_token', true);
begin
  perform access_control.open_contract_scope('historical_case_membership', p_membership_id);
  for closed in
    update privacy.historical_access_cases as hcase
    set status = 'closed',
        closed_at = least(instant, hcase.expires_at),
        closed_reason = case when hcase.expires_at <= instant then 'expired' else 'membership_ineligible' end
    where hcase.authorized_membership_id = p_membership_id
      and hcase.status = 'open'
      and not privacy.historical_case_member_qualifies(
        p_membership_id, hcase.authorized_membership_id = hcase.opened_by_membership_id
      )
    returning hcase.id
  loop
    perform privacy.announce_historical_case_closed(closed.id);
  end loop;
  perform planning.resume_contract_scope(previous_purpose, previous_id, previous_token);
end
$function$;

alter function privacy.close_ineligible_historical_cases(uuid) owner to allfit_owner;
revoke all on function privacy.close_ineligible_historical_cases(uuid) from public, allfit_api;

create function privacy.close_cases_of_departed_membership_tg()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $function$
begin
  perform privacy.close_ineligible_historical_cases(new.id);
  return null;
end
$function$;

alter function privacy.close_cases_of_departed_membership_tg() owner to allfit_owner;
revoke all on function privacy.close_cases_of_departed_membership_tg() from public, allfit_api;

create trigger trg_organization_memberships_after_update_historical_cases
after update of status on organizations.organization_memberships
for each row
when (old.status is distinct from new.status and new.status <> 'active')
execute function privacy.close_cases_of_departed_membership_tg();

create function privacy.close_cases_of_ended_role_tg()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $function$
begin
  perform privacy.close_ineligible_historical_cases(new.membership_id);
  return null;
end
$function$;

alter function privacy.close_cases_of_ended_role_tg() owner to allfit_owner;
revoke all on function privacy.close_cases_of_ended_role_tg() from public, allfit_api;

create trigger trg_membership_roles_after_update_historical_cases
after update of valid_to on organizations.membership_roles
for each row
when (old.valid_to is null and new.valid_to is not null)
execute function privacy.close_cases_of_ended_role_tg();

-- ---------------------------------------------------------------------------
-- OP-PRV-020 — what the case may read
-- ---------------------------------------------------------------------------

/*
 * The actor may exercise this case now: it names the membership the request acts as, in
 * the organization the request acts in; it is open and inside its hours; the membership
 * still qualifies and she has not closed her account.
 */
create function access_control.historical_case_exercisable(p_case_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $function$
  select coalesce(
    access_control.actor_kind() = 'person'
    and exists (
      select 1
      from privacy.historical_access_cases as hcase
      join identity.people as person on person.id = hcase.person_id
      where hcase.id = p_case_id
        and hcase.organization_id = access_control.org()
        and hcase.authorized_membership_id::text = current_setting('app.actor_membership_id', true)
        and access_control.owns_membership(hcase.authorized_membership_id)
        and hcase.status = 'open'
        and hcase.expires_at > clock_timestamp()
        and person.status <> 'closed'
        and privacy.historical_case_member_qualifies(
          hcase.authorized_membership_id, hcase.authorized_membership_id = hcase.opened_by_membership_id
        )
    ),
    false
  )
$function$;

alter function access_control.historical_case_exercisable(uuid) owner to allfit_owner;
revoke all on function access_control.historical_case_exercisable(uuid) from public, allfit_api;

-- The frozen grant of the case's relationship for a scope, when its version keeps the
-- resource readable afterwards: a historical rule for it and no exclusion of all of it.
create function privacy.frozen_category(p_case_id uuid, p_scope_code text, p_resource text)
returns table (grant_id uuid, scope_definition_id uuid, scope_version integer)
language sql
stable
security definer
set search_path = pg_catalog
as $function$
  select shared.id, shared.scope_definition_id, definition.version_number
  from privacy.historical_access_cases as hcase
  join privacy.data_grants as shared
    on shared.relationship_id = hcase.relationship_id
   and shared.scope_code = p_scope_code
   and shared.status = 'frozen'
  join privacy.scope_definitions as definition on definition.id = shared.scope_definition_id
  where hcase.id = p_case_id
    and exists (
      select 1 from privacy.scope_resource_rules as rule
      where rule.scope_definition_id = shared.scope_definition_id
        and rule.resource = p_resource
        and rule.historical_readable
        and not rule.is_excluded
    )
    and not exists (
      select 1 from privacy.scope_resource_rules as rule
      where rule.scope_definition_id = shared.scope_definition_id
        and rule.resource = p_resource
        and rule.field = '*'
        and rule.is_excluded
    )
  limit 1
$function$;

alter function privacy.frozen_category(uuid, text, text) owner to allfit_owner;
revoke all on function privacy.frozen_category(uuid, text, text) from public, allfit_api;

create function access_control.can_read_frozen(p_case_id uuid, p_scope_code text, p_resource text)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $function$
  select access_control.historical_case_exercisable(p_case_id)
     and exists (select 1 from privacy.frozen_category(p_case_id, p_scope_code, p_resource))
$function$;

alter function access_control.can_read_frozen(uuid, text, text) owner to allfit_owner;
revoke all on function access_control.can_read_frozen(uuid, text, text) from public, allfit_api;

-- A field is readable through a case when the version shares it and keeps it afterwards.
create function privacy.scope_reads_frozen(p_scope_definition_id uuid, p_resource text, p_field text)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $function$
  select privacy.scope_allows(p_scope_definition_id, p_resource, p_field)
     and exists (
       select 1 from privacy.scope_resource_rules as rule
       where rule.scope_definition_id = p_scope_definition_id
         and rule.resource = p_resource
         and rule.field in (p_field, '*')
         and rule.historical_readable
         and not rule.is_excluded
     )
$function$;

alter function privacy.scope_reads_frozen(uuid, text, text) owner to allfit_owner;
revoke all on function privacy.scope_reads_frozen(uuid, text, text) from public, allfit_api;

-- What existed at the cut, under the case the frozen-history scope names: ended by then,
-- never corrected since, and never hidden from that relationship, then or since.
create policy executed_sessions_select_frozen on execution.executed_sessions
  for select to allfit_owner
  using (
    exists (
      select 1
      from privacy.historical_access_cases as hcase
      where hcase.id = (select access_control.contract_scope('frozen_history'))::uuid
        and hcase.person_id = executed_sessions.person_id
        and executed_sessions.ended_at <= hcase.cut_at
        and not exists (
          select 1
          from execution.execution_revisions as revision
          where revision.executed_session_id = executed_sessions.id
            and revision.created_at > hcase.cut_at
        )
        and (
          (executed_sessions.context_relationship_id = hcase.relationship_id
           and access_control.can_read_frozen(hcase.id, 'relationship_training', 'execution.executed_sessions'))
          or (
            executed_sessions.is_autonomous
            and access_control.can_read_frozen(hcase.id, 'prior_training_history', 'execution.executed_sessions')
            and not exists (
              select 1
              from privacy.session_visibility_denials as denial
              where denial.executed_session_id = executed_sessions.id
                and denial.relationship_id = hcase.relationship_id
                and (denial.status = 'active' or denial.frozen_denied_at is not null)
            )
          )
        )
    )
  );

-- Only so the session policy can exclude and cut; no read returns either.
create policy session_visibility_denials_select_frozen on privacy.session_visibility_denials
  for select to allfit_owner
  using (
    exists (
      select 1
      from privacy.historical_access_cases as hcase
      where hcase.id = (select access_control.contract_scope('frozen_history'))::uuid
        and hcase.relationship_id = session_visibility_denials.relationship_id
        and access_control.historical_case_exercisable(hcase.id)
    )
  );
create policy execution_revisions_select_frozen on execution.execution_revisions
  for select to allfit_owner
  using (
    exists (
      select 1
      from privacy.historical_access_cases as hcase
      where hcase.id = (select access_control.contract_scope('frozen_history'))::uuid
        and hcase.person_id = execution_revisions.person_id
        and access_control.historical_case_exercisable(hcase.id)
    )
  );

/*
 * The opening every frozen read shares: a fresh sign-in first, then an audited request
 * in a live membership. A case this member cannot exercise answers no row, and the
 * refusal stays on her record whenever the actor can see whose history it was.
 */
create function privacy.open_frozen_read(
  p_person_id uuid,
  p_session_id uuid,
  p_organization_id uuid,
  p_relationship_id uuid,
  p_case_id uuid,
  p_resource text
)
returns table (case_id uuid, relationship_id uuid, subject_person_id uuid, cut_at timestamptz)
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  exercised record;
  refused record;
begin
  if access_control.actor_kind() is distinct from 'person'
     or access_control.person() is distinct from p_person_id then
    raise exception 'person actor mismatch' using errcode = '42501';
  end if;
  perform identity.require_recent_studio_authentication(p_session_id);
  if nullif(current_setting('app.request_id', true), '') is null then
    raise exception 'request id required for audited read' using errcode = '22023';
  end if;
  perform privacy.enter_historical_case_organization(p_person_id, p_organization_id);
  perform set_config('app.purpose', 'frozen_history_review', true);

  select hcase.id, hcase.relationship_id, hcase.person_id, hcase.cut_at into exercised
  from privacy.historical_access_cases as hcase
  where hcase.id = p_case_id
    and hcase.organization_id = p_organization_id
    and hcase.relationship_id = p_relationship_id
    and access_control.historical_case_exercisable(hcase.id);

  if exercised.id is null then
    select hcase.id, hcase.relationship_id, hcase.person_id into refused
    from privacy.historical_access_cases as hcase
    where hcase.id = p_case_id
      and hcase.organization_id = p_organization_id;
    if refused.id is null then
      select null::uuid as id, relationship.id as relationship_id, relationship.person_id into refused
      from relationships.service_relationships as relationship
      where relationship.id = p_relationship_id
        and relationship.organization_id = p_organization_id;
    end if;
    if refused.person_id is not null then
      perform privacy.log_access_event(
        refused.person_id, null, refused.relationship_id, null, refused.id, null, null,
        'frozen', p_resource, 'denied'
      );
    end if;
    return;
  end if;

  perform access_control.open_contract_scope('frozen_history', exercised.id);
  return query select exercised.id, exercised.relationship_id, exercised.person_id, exercised.cut_at;
end
$function$;

alter function privacy.open_frozen_read(uuid, uuid, uuid, uuid, uuid, text) owner to allfit_owner;
revoke all on function privacy.open_frozen_read(uuid, uuid, uuid, uuid, uuid, text) from public, allfit_api;

-- The relationship as the case froze it: whose, when it was cut, the case, and the frozen
-- categories that stayed readable afterwards.
create function privacy.read_historical_relationship(
  p_person_id uuid,
  p_session_id uuid,
  p_organization_id uuid,
  p_relationship_id uuid,
  p_case_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  opened record;
  result jsonb;
  previous_purpose text := current_setting('app.contract_scope_purpose', true);
  previous_id text := current_setting('app.contract_scope_id', true);
  previous_token text := current_setting('app.contract_scope_token', true);
begin
  select * into opened from privacy.open_frozen_read(
    p_person_id, p_session_id, p_organization_id, p_relationship_id, p_case_id,
    'relationships.service_relationships'
  );
  if opened.case_id is null then
    return jsonb_build_object('outcome', 'not_found');
  end if;

  perform privacy.log_access_event(
    opened.subject_person_id, null, opened.relationship_id, null, opened.case_id, null, null,
    'frozen', 'relationships.service_relationships', 'allowed'
  );

  select jsonb_build_object(
    'outcome', 'found',
    'relationship', jsonb_build_object(
      'id', opened.relationship_id,
      'person', jsonb_build_object(
        'id', person.id, 'given_name', person.given_name, 'family_name', person.family_name
      ),
      'ended_at', opened.cut_at
    ),
    'case', privacy.historical_case_document(opened.case_id),
    'scopes', coalesce((
      select jsonb_agg(jsonb_build_object(
               'code', shared.scope_code,
               'version', definition.version_number,
               'frozen_at', shared.frozen_at
             ) order by shared.scope_code)
      from privacy.data_grants as shared
      join privacy.scope_definitions as definition on definition.id = shared.scope_definition_id
      where shared.relationship_id = opened.relationship_id
        and shared.status = 'frozen'
        and exists (
          select 1 from privacy.scope_resource_rules as rule
          where rule.scope_definition_id = shared.scope_definition_id
            and rule.historical_readable
            and not rule.is_excluded
        )
    ), '[]'::jsonb)
  )
    into result
  from identity.people as person
  where person.id = opened.subject_person_id;

  perform planning.resume_contract_scope(previous_purpose, previous_id, previous_token);
  return result;
end
$function$;

alter function privacy.read_historical_relationship(uuid, uuid, uuid, uuid, uuid) owner to allfit_owner;
revoke all on function privacy.read_historical_relationship(uuid, uuid, uuid, uuid, uuid) from public;
grant execute on function privacy.read_historical_relationship(uuid, uuid, uuid, uuid, uuid) to allfit_api;

/*
 * Her completed, valid sessions the case may read, newest first, a page at a time on
 * (millisecond start, id). The policy decides which; this records the read under every
 * frozen category it used, or the refusal when none stayed readable.
 */
create function execution.list_frozen_executions(
  p_person_id uuid,
  p_session_id uuid,
  p_organization_id uuid,
  p_relationship_id uuid,
  p_case_id uuid,
  p_limit integer,
  p_cursor_started_at timestamptz,
  p_cursor_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  opened record;
  inside record;
  prior record;
  items jsonb;
  previous_purpose text := current_setting('app.contract_scope_purpose', true);
  previous_id text := current_setting('app.contract_scope_id', true);
  previous_token text := current_setting('app.contract_scope_token', true);
begin
  select * into opened from privacy.open_frozen_read(
    p_person_id, p_session_id, p_organization_id, p_relationship_id, p_case_id,
    'execution.executed_sessions'
  );
  if opened.case_id is null then
    return jsonb_build_object('outcome', 'not_found');
  end if;

  select * into inside
  from privacy.frozen_category(opened.case_id, 'relationship_training', 'execution.executed_sessions');
  select * into prior
  from privacy.frozen_category(opened.case_id, 'prior_training_history', 'execution.executed_sessions');

  if inside.grant_id is null and prior.grant_id is null then
    perform privacy.log_access_event(
      opened.subject_person_id, null, opened.relationship_id, null, opened.case_id, null, null,
      'frozen', 'execution.executed_sessions', 'denied'
    );
    perform planning.resume_contract_scope(previous_purpose, previous_id, previous_token);
    return jsonb_build_object('outcome', 'found', 'items', '[]'::jsonb);
  end if;
  if inside.grant_id is not null then
    perform privacy.log_access_event(
      opened.subject_person_id, null, opened.relationship_id, inside.grant_id, opened.case_id,
      'relationship_training', inside.scope_version, 'frozen', 'execution.executed_sessions', 'allowed'
    );
  end if;
  if prior.grant_id is not null then
    perform privacy.log_access_event(
      opened.subject_person_id, null, opened.relationship_id, prior.grant_id, opened.case_id,
      'prior_training_history', prior.scope_version, 'frozen', 'execution.executed_sessions', 'allowed'
    );
  end if;

  select coalesce(jsonb_agg(page.item order by page.started_ms desc, page.id desc), '[]'::jsonb)
    into items
  from (
    select session.id, keyed.started_ms, jsonb_build_object(
      'id', session.id,
      'started_at', session.started_at,
      'ended_at', session.ended_at,
      'timezone', session.timezone,
      'activity_type_code', activity.code,
      'activity_type_name', activity.name,
      'discipline_code', activity.discipline_code,
      'achieved_level', session.achieved_level,
      'origin', case when session.is_autonomous then 'prior' else 'relationship' end,
      'scope_code', case when session.is_autonomous then 'prior_training_history' else 'relationship_training' end,
      'scope_version', case when session.is_autonomous then prior.scope_version else inside.scope_version end
    ) as item
    from execution.executed_sessions as session
    cross join lateral (select date_trunc('milliseconds', session.started_at) as started_ms) as keyed
    join catalog.activity_types as activity on activity.id = session.activity_type_id
    where session.person_id = opened.subject_person_id
      and session.execution_status = 'completed'
      and session.validation_status <> 'annulled'
      and (p_cursor_started_at is null
           or (keyed.started_ms, session.id) < (p_cursor_started_at, p_cursor_id))
    order by keyed.started_ms desc, session.id desc
    limit least(greatest(coalesce(p_limit, 26), 1), 101)
  ) as page;

  perform planning.resume_contract_scope(previous_purpose, previous_id, previous_token);
  return jsonb_build_object('outcome', 'found', 'items', items);
end
$function$;

alter function execution.list_frozen_executions(uuid, uuid, uuid, uuid, uuid, integer, timestamptz, uuid)
  owner to allfit_owner;
revoke all on function execution.list_frozen_executions(uuid, uuid, uuid, uuid, uuid, integer, timestamptz, uuid)
  from public;
grant execute on function execution.list_frozen_executions(uuid, uuid, uuid, uuid, uuid, integer, timestamptz, uuid)
  to allfit_api;

-- One session as the live detail shows it, without the coach's notes or the plan: neither
-- stayed readable. `scope_required` only when no training category did.
create function execution.read_frozen_execution(
  p_person_id uuid,
  p_session_id uuid,
  p_organization_id uuid,
  p_relationship_id uuid,
  p_case_id uuid,
  p_execution_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  opened record;
  inside record;
  prior record;
  seen record;
  document jsonb;
  previous_purpose text := current_setting('app.contract_scope_purpose', true);
  previous_id text := current_setting('app.contract_scope_id', true);
  previous_token text := current_setting('app.contract_scope_token', true);
begin
  select * into opened from privacy.open_frozen_read(
    p_person_id, p_session_id, p_organization_id, p_relationship_id, p_case_id,
    'execution.executed_sessions'
  );
  if opened.case_id is null then
    return jsonb_build_object('outcome', 'not_found');
  end if;

  select * into inside
  from privacy.frozen_category(opened.case_id, 'relationship_training', 'execution.executed_sessions');
  select * into prior
  from privacy.frozen_category(opened.case_id, 'prior_training_history', 'execution.executed_sessions');

  if inside.grant_id is null and prior.grant_id is null then
    perform privacy.log_access_event(
      opened.subject_person_id, null, opened.relationship_id, null, opened.case_id, null, null,
      'frozen', 'execution.executed_sessions', 'denied'
    );
    perform planning.resume_contract_scope(previous_purpose, previous_id, previous_token);
    return jsonb_build_object(
      'outcome', 'scope_required',
      'required_scope', jsonb_build_object('code', 'relationship_training', 'level', 'read')
    );
  end if;

  select session.id, session.is_autonomous into seen
  from execution.executed_sessions as session
  where session.id = p_execution_id
    and session.person_id = opened.subject_person_id
    and session.execution_status = 'completed'
    and session.validation_status <> 'annulled';

  if seen.id is null then
    perform planning.resume_contract_scope(previous_purpose, previous_id, previous_token);
    perform privacy.log_access_event(
      opened.subject_person_id, null, opened.relationship_id, null, opened.case_id, null, null,
      'frozen', 'execution.executed_sessions', 'denied'
    );
    return jsonb_build_object('outcome', 'not_found');
  end if;

  if seen.is_autonomous then
    perform privacy.log_access_event(
      opened.subject_person_id, null, opened.relationship_id, prior.grant_id, opened.case_id,
      'prior_training_history', prior.scope_version, 'frozen', 'execution.executed_sessions', 'allowed'
    );
  else
    perform privacy.log_access_event(
      opened.subject_person_id, null, opened.relationship_id, inside.grant_id, opened.case_id,
      'relationship_training', inside.scope_version, 'frozen', 'execution.executed_sessions', 'allowed'
    );
  end if;

  document := execution.session_projection(p_execution_id)
    - 'status' - 'validation_status' - 'requested_level' - 'revision_number'
    - 'capture_source' - 'contract'
    || jsonb_build_object(
      'origin', case when seen.is_autonomous then 'prior' else 'relationship' end,
      'applied_scope', case when seen.is_autonomous
        then jsonb_build_object('code', 'prior_training_history', 'version', prior.scope_version)
        else jsonb_build_object('code', 'relationship_training', 'version', inside.scope_version)
      end
    );

  perform planning.resume_contract_scope(previous_purpose, previous_id, previous_token);
  return jsonb_build_object('outcome', 'found', 'execution', document);
end
$function$;

alter function execution.read_frozen_execution(uuid, uuid, uuid, uuid, uuid, uuid) owner to allfit_owner;
revoke all on function execution.read_frozen_execution(uuid, uuid, uuid, uuid, uuid, uuid) from public;
grant execute on function execution.read_frozen_execution(uuid, uuid, uuid, uuid, uuid, uuid) to allfit_api;

-- Her measurements recorded by the cut, newest first, a page at a time on (day, id), with
-- the fields the frozen version keeps readable. A later record never shows, whatever day
-- it claims.
create function identity.list_frozen_body_progress(
  p_person_id uuid,
  p_session_id uuid,
  p_organization_id uuid,
  p_relationship_id uuid,
  p_case_id uuid,
  p_limit integer,
  p_cursor_measured_on date,
  p_cursor_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  opened record;
  body record;
  definition uuid;
  result jsonb;
  previous_purpose text := current_setting('app.contract_scope_purpose', true);
  previous_id text := current_setting('app.contract_scope_id', true);
  previous_token text := current_setting('app.contract_scope_token', true);
begin
  select * into opened from privacy.open_frozen_read(
    p_person_id, p_session_id, p_organization_id, p_relationship_id, p_case_id,
    'identity.body_progress_records'
  );
  if opened.case_id is null then
    return jsonb_build_object('outcome', 'not_found');
  end if;

  select * into body
  from privacy.frozen_category(opened.case_id, 'body_progress', 'identity.body_progress_records');
  if body.grant_id is null then
    perform privacy.log_access_event(
      opened.subject_person_id, null, opened.relationship_id, null, opened.case_id,
      'body_progress', null, 'frozen', 'identity.body_progress_records', 'denied'
    );
    perform planning.resume_contract_scope(previous_purpose, previous_id, previous_token);
    return jsonb_build_object(
      'outcome', 'scope_required',
      'required_scope', jsonb_build_object('code', 'body_progress', 'level', 'read')
    );
  end if;
  perform privacy.log_access_event(
    opened.subject_person_id, null, opened.relationship_id, body.grant_id, opened.case_id,
    'body_progress', body.scope_version, 'frozen', 'identity.body_progress_records', 'allowed'
  );
  definition := body.scope_definition_id;

  result := jsonb_build_object(
    'outcome', 'found',
    'scope_version', body.scope_version,
    'items', coalesce((
      select jsonb_agg(page.item order by page.measured_on desc, page.id desc)
      from (
        select record.id, record.measured_on, jsonb_build_object(
          'id', record.id,
          'metric_code', record.metric_code,
          'value', case when privacy.scope_reads_frozen(definition, 'identity.body_progress_records', 'value_numeric')
                        then record.value_numeric end,
          'unit_code', case when privacy.scope_reads_frozen(definition, 'identity.body_progress_records', 'unit_code')
                            then record.unit_code end,
          'original_value', case when privacy.scope_reads_frozen(definition, 'identity.body_progress_records', 'original_value')
                                 then record.original_value end,
          'original_unit_code', case when privacy.scope_reads_frozen(definition, 'identity.body_progress_records', 'original_unit_code')
                                     then record.original_unit_code end,
          'measured_on', record.measured_on
        ) as item
        from identity.body_progress_records as record
        where record.person_id = opened.subject_person_id
          and record.created_at <= opened.cut_at
          and privacy.scope_reads_frozen(definition, 'identity.body_progress_records', 'metric_code')
          and privacy.scope_reads_frozen(definition, 'identity.body_progress_records', 'measured_on')
          and (p_cursor_measured_on is null
               or (record.measured_on, record.id) < (p_cursor_measured_on, p_cursor_id))
        order by record.measured_on desc, record.id desc
        limit least(greatest(coalesce(p_limit, 26), 1), 101)
      ) as page
    ), '[]'::jsonb)
  );

  perform planning.resume_contract_scope(previous_purpose, previous_id, previous_token);
  return result;
end
$function$;

alter function identity.list_frozen_body_progress(uuid, uuid, uuid, uuid, uuid, integer, date, uuid)
  owner to allfit_owner;
revoke all on function identity.list_frozen_body_progress(uuid, uuid, uuid, uuid, uuid, integer, date, uuid)
  from public;
grant execute on function identity.list_frozen_body_progress(uuid, uuid, uuid, uuid, uuid, integer, date, uuid)
  to allfit_api;

commit;
