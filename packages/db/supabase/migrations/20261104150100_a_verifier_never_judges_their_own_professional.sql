-- A verifier never judges their own professional — `HU-BO-021` criterion 8, ADR-026
-- point 5.
--
-- ADR-026 forbids the holder, a member of an organization shared with the holder and
-- the holder's assigned professional, among others, from deciding on a credential.
-- `20260913120000` checked the first two and left the third "for when `relationships`
-- exists". It has existed since `20260928200000`, so a verifier whose coach is the
-- holder, or who coaches the holder, could still decide.
--
-- **Either direction.** The verifier may be the client and the holder their assigned
-- professional, or the holder the client and the verifier theirs. Neither shares a
-- membership with the other — the client is related to the organization, not a member
-- of it — which is exactly why the membership check never saw it.
--
-- **Only a live assignment on a live relationship.** A client of the same gym under
-- another coach has no relationship with the holder, and one that ended is no longer a
-- conflict.
--
-- **The check has to see what it judges.** It runs as `allfit_owner` with the verifier
-- as the actor, and `relationships` admits a support actor none of those rows. A check
-- that cannot see the relationship answers "no conflict", which is failing open. So,
-- as `organization_guest_occupancy` does for counting, the function proves it is the
-- caller with a token: an HMAC of the verifier and holder pair, the backend and the
-- transaction start, keyed by a secret the runtime role cannot read. One policy per
-- table admits the rows whose client is one of the two while the token is valid; the
-- token is set only while the function looks and cleared before it returns, and the
-- function returns a reason code, so no row leaves it. The key is its own rather than
-- the counting one, so neither use can be confused with the other.

set lock_timeout = '5s';
set statement_timeout = '60s';

-- ---------------------------------------------------------------------------
-- The conflict key
-- ---------------------------------------------------------------------------

create table relationships.credential_conflict_keys (
  id smallint not null default 1,
  secret bytea not null default extensions.gen_random_bytes(32),
  created_at timestamptz not null default clock_timestamp(),
  constraint pk_credential_conflict_keys primary key (id),
  constraint ck_credential_conflict_keys_singleton check (id = 1),
  constraint ck_credential_conflict_keys_secret check (octet_length(secret) = 32)
);
insert into relationships.credential_conflict_keys default values;

alter table relationships.credential_conflict_keys owner to allfit_owner;
alter table relationships.credential_conflict_keys enable row level security;
alter table relationships.credential_conflict_keys force row level security;
create policy credential_conflict_keys_select_owner on relationships.credential_conflict_keys
  for select to allfit_owner using (true);
revoke all on relationships.credential_conflict_keys from public, allfit_api;

-- The "verifier:holder" pair the current, valid conflict token admits, or null.
create function relationships.credential_conflict_pair()
returns text
language sql
stable
security invoker
set search_path = pg_catalog
as $function$
  select scope.pair
  from (
    select nullif(current_setting('app.credential_conflict_pair', true), '') as pair,
           nullif(current_setting('app.credential_conflict_token', true), '') as token
  ) as scope
  cross join relationships.credential_conflict_keys as conflict_key
  where scope.token = encode(
    extensions.hmac(
      convert_to(scope.pair || ':' || pg_backend_pid()::text || ':'
        || extract(epoch from now())::text, 'UTF8'),
      conflict_key.secret,
      'sha256'
    ),
    'hex'
  )
$function$;
alter function relationships.credential_conflict_pair() owner to allfit_owner;
revoke all on function relationships.credential_conflict_pair() from public, allfit_api;

-- Wrapped in a sub-select so the token is checked once per query, not once per row.
create policy service_relationships_select_credential_conflict
  on relationships.service_relationships
  for select
  to allfit_owner
  using (
    person_id::text = any (
      coalesce(string_to_array((select relationships.credential_conflict_pair()), ':'), '{}')
    )
  );

create policy relationship_professional_assignments_select_credential_conflict
  on relationships.relationship_professional_assignments
  for select
  to allfit_owner
  using (
    person_id::text = any (
      coalesce(string_to_array((select relationships.credential_conflict_pair()), ':'), '{}')
    )
  );

-- ---------------------------------------------------------------------------
-- The reason a verifier may not decide, now including the professional relationship
-- ---------------------------------------------------------------------------

create or replace function identity.credential_verification_conflict(
  p_verifier_person_id uuid,
  p_credential_id uuid
)
returns text
language plpgsql
stable
security definer
set search_path = pg_catalog
as $function$
declare
  holder_person_id uuid;
  pair text;
  related boolean;
begin
  select profile.person_id into holder_person_id
  from identity.professional_credentials as credential
  join identity.professional_profiles as profile
    on profile.id = credential.professional_profile_id
  where credential.id = p_credential_id;

  if holder_person_id is null then
    return null;
  end if;
  if holder_person_id = p_verifier_person_id then
    return 'verifier_is_holder';
  end if;
  if exists (
    select 1
    from organizations.organization_memberships as mine
    join organizations.organization_memberships as theirs
      on theirs.organization_id = mine.organization_id
    where mine.person_id = p_verifier_person_id
      and mine.status = 'active'
      and theirs.person_id = holder_person_id
      and theirs.status = 'active'
  ) then
    return 'shared_active_membership';
  end if;

  pair := p_verifier_person_id::text || ':' || holder_person_id::text;
  perform set_config('app.credential_conflict_pair', pair, true);
  perform set_config('app.credential_conflict_token', encode(
    extensions.hmac(
      convert_to(pair || ':' || pg_backend_pid()::text || ':'
        || extract(epoch from now())::text, 'UTF8'),
      (select conflict_key.secret from relationships.credential_conflict_keys as conflict_key),
      'sha256'
    ),
    'hex'
  ), true);

  -- One of the two is the client; the other holds the assigned membership.
  select exists (
    select 1
    from relationships.relationship_professional_assignments as assignment
    join relationships.service_relationships as relationship
      on relationship.id = assignment.relationship_id
    join organizations.organization_memberships as professional
      on professional.id = assignment.membership_id
    where assignment.status = 'active'
      and (assignment.valid_to is null or assignment.valid_to > clock_timestamp())
      and relationship.status = 'active'
      and (
        (assignment.person_id = p_verifier_person_id
          and professional.person_id = holder_person_id)
        or (assignment.person_id = holder_person_id
          and professional.person_id = p_verifier_person_id)
      )
  ) into related;

  perform set_config('app.credential_conflict_token', '', true);
  perform set_config('app.credential_conflict_pair', '', true);

  return case when related then 'professional_relationship' end;
end
$function$;
