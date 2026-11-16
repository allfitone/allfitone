-- An Allfit admin holds every duty for as long as they are one (ADR-046).
--
-- **Two administrators cannot run ADR-028.** Its base role granted nothing: each of the
-- thirteen duties had to be granted by the other administrator, for at most ninety days,
-- and the one that grants the rest (`manage_platform_access`) lapsed for both at once,
-- leaving only the bootstrap ceremony. ADR-046 supersedes ADR-028 items 2 and 5 for
-- administrators: `allfit_admin` brings every duty, and they last as long as the role.
--
-- **The duties stay rows.** Fifteen columns across break-glass, invitations, recovery,
-- plans and suspensions name the exact assignment a command acted under, so the role
-- writes thirteen assignments with `basis = 'admin_role'` instead of being read as a
-- wildcard. Every helper that picks the assignment (`order by valid_to desc limit 1`)
-- picks these without changing.
--
-- **What production already holds stays as it is.** The current-assignment index gains
-- `basis`, so the temporary `manage_platform_access` of each administrator lives beside
-- the one the role brings and lapses on its own date. Nothing is rewritten and nobody
-- is recorded as having revoked it.
--
-- **A duty held through the role follows the role.** It is not suspended, revoked or
-- recertified on its own; withdrawing the role still revokes all of them
-- (`support.close_revoked_platform_access`). The role is still never self-granted, and
-- a Backoffice session without it holds nothing.
--
-- **The session lasts sixty idle minutes and twelve hours**, not fifteen and eight.
-- Password and TOTP still open it. The two limits now live in one function each.

set lock_timeout = '5s';
set statement_timeout = '60s';

-- ---------------------------------------------------------------------------
-- How a duty is held
-- ---------------------------------------------------------------------------

alter table support.platform_duty_assignments
  add column basis text not null default 'granted';

alter table support.platform_duty_assignments
  add constraint ck_platform_duty_assignments_basis check (basis in ('granted', 'admin_role')),
  drop constraint ck_platform_duty_assignments_window,
  add constraint ck_platform_duty_assignments_window check (
    valid_to > valid_from
    and (
      (basis = 'granted' and valid_to <= valid_from + interval '90 days')
      or (
        basis = 'admin_role'
        and valid_to = timestamptz '9999-12-31 00:00:00+00'
        and reason_code = 'admin_role'
      )
    )
  );

comment on column support.platform_duty_assignments.basis is
  '`granted`: one duty granted by another administrator for at most ninety days. '
  '`admin_role`: brought by the allfit_admin role; ends only when the role is withdrawn.';

drop index support.uidx_platform_duty_assignments_current;
create unique index uidx_platform_duty_assignments_current
  on support.platform_duty_assignments (person_id, duty_code, basis)
  where status in ('scheduled', 'active', 'suspended');

-- The closed catalogue with its derived mode, for the role to grant. It must change with
-- `ck_platform_duty_assignments_duty` and `ck_platform_duty_assignments_actor_mode`.
create function support.standing_platform_duties()
returns table (duty_code text, actor_mode text)
language sql
immutable
set search_path = pg_catalog
as $function$
  values
    ('view_platform_metrics', 'A10'),
    ('diagnose_support_metadata', 'A10'),
    ('view_billing_metadata', 'A10'),
    ('manage_organization_lifecycle', 'A10'),
    ('request_break_glass', 'A10'),
    ('verify_professional_credentials', 'A11'),
    ('curate_global_catalog', 'A11'),
    ('manage_platform_commercial', 'A11'),
    ('manage_platform_access', 'A12'),
    ('audit_platform_access', 'A12'),
    ('approve_break_glass', 'A12'),
    ('audit_break_glass', 'A12'),
    ('manage_privacy_requests', 'A12')
$function$;

alter function support.standing_platform_duties() owner to allfit_owner;
revoke all on function support.standing_platform_duties() from public;

-- `valid_to` is a far date rather than `infinity`: the API's driver turns `infinity`
-- into an invalid date, and the contract declares a date-time.
create function support.grant_standing_platform_duties()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  granted record;
begin
  if new.status <> 'active' then
    return null;
  end if;
  for granted in
    insert into support.platform_duty_assignments (
      person_id, duty_code, actor_mode, status, valid_from, valid_to,
      granted_by_person_id, reason_code, basis
    )
    select new.person_id, duty.duty_code, duty.actor_mode, 'active', clock_timestamp(),
      timestamptz '9999-12-31 00:00:00+00', new.granted_by_person_id, 'admin_role', 'admin_role'
    from support.standing_platform_duties() as duty
    on conflict do nothing
    returning id, person_id, duty_code
  loop
    perform system.enqueue_outbox_event(
      'platform_duty_assignment', granted.id, 'support.platform_duty_granted.v1',
      jsonb_build_object(
        'assignment_id', granted.id, 'person_id', granted.person_id,
        'duty_code', granted.duty_code
      )
    );
  end loop;
  return null;
end
$function$;

alter function support.grant_standing_platform_duties() owner to allfit_owner;
revoke all on function support.grant_standing_platform_duties() from public;

create trigger trg_platform_role_assignments_insert_grant_duties
after insert on support.platform_role_assignments
for each row execute function support.grant_standing_platform_duties();

-- The administrators already in place get theirs from whoever granted their role.
insert into support.platform_duty_assignments (
  person_id, duty_code, actor_mode, status, valid_from, valid_to,
  granted_by_person_id, reason_code, basis
)
select role_assignment.person_id, duty.duty_code, duty.actor_mode, 'active', clock_timestamp(),
  timestamptz '9999-12-31 00:00:00+00', role_assignment.granted_by_person_id,
  'admin_role', 'admin_role'
from support.platform_role_assignments as role_assignment
cross join support.standing_platform_duties() as duty
where role_assignment.platform_role = 'allfit_admin'
  and role_assignment.status = 'active'
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- A duty held through the role follows the role
-- ---------------------------------------------------------------------------

-- `20260906120000`'s body, with `basis` frozen and the rule for duties the role brings.
create or replace function support.preserve_platform_duty_history()
returns trigger
language plpgsql
set search_path = pg_catalog
as $function$
begin
  if new.id <> old.id
    or new.person_id <> old.person_id
    or new.duty_code <> old.duty_code
    or new.actor_mode <> old.actor_mode
    or new.valid_from <> old.valid_from
    or new.valid_to <> old.valid_to
    or new.required_aal <> old.required_aal
    or new.granted_by_person_id <> old.granted_by_person_id
    or new.reason_code <> old.reason_code
    or new.basis <> old.basis
    or new.created_at <> old.created_at then
    raise exception 'platform duty history is append-only' using errcode = '23514';
  end if;
  -- Only withdrawing the role ends these: its trigger revokes them once the role is gone.
  if old.basis = 'admin_role' and (
    new.status not in ('active', 'revoked')
    or new.recertified_at is distinct from old.recertified_at
    or (new.status = 'revoked' and exists (
      select 1 from support.platform_role_assignments as role_assignment
      where role_assignment.person_id = old.person_id
        and role_assignment.platform_role = 'allfit_admin'
        and role_assignment.status = 'active'
    ))
  ) then
    raise exception 'a duty held through the admin role follows the role' using errcode = '23514';
  end if;
  -- Extending authority is a new assignment, never a longer old one, so the
  -- ninety-day bound cannot be widened after the fact.
  if old.status in ('expired', 'revoked') and new.status <> old.status then
    raise exception 'a terminal platform duty cannot be reopened' using errcode = '23514';
  end if;
  if old.status = 'suspended' and new.status not in ('suspended', 'expired', 'revoked') then
    raise exception 'a suspended platform duty is only expired or revoked' using errcode = '23514';
  end if;
  return new;
end
$function$;

-- `20260906120100`'s body. Granting converges on a duty the person already holds in any
-- basis, so granting an administrator what the role brings adds no second row.
create or replace function support.assign_platform_duty(
  p_actor_person_id uuid,
  p_actor_session_id uuid,
  p_person_id uuid,
  p_duty_code text,
  p_valid_from timestamptz,
  p_valid_to timestamptz,
  p_reason_code text,
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
  assignment_id uuid;
  starts_at timestamptz := coalesce(p_valid_from, clock_timestamp());
  response jsonb;
begin
  perform support.require_platform_access_manager(p_actor_person_id, p_actor_session_id);

  if p_person_id = p_actor_person_id then
    raise exception 'a platform duty is never self-assigned' using errcode = '42501';
  end if;
  if p_valid_to is null
    or p_valid_to <= starts_at
    or p_valid_to <= clock_timestamp()
    or p_valid_to > starts_at + interval '90 days'
    or btrim(coalesce(p_reason_code, '')) = '' then
    raise exception 'invalid platform duty window' using errcode = '22023';
  end if;
  if not exists (
    select 1 from support.platform_role_assignments as assignment
    where assignment.person_id = p_person_id
      and assignment.platform_role = 'allfit_admin'
      and assignment.status = 'active'
  ) then
    raise exception 'a platform duty requires an active base role' using errcode = 'P0002';
  end if;

  select * into receipt
  from system.begin_idempotency(
    p_actor_person_id, 'backoffice'::system.command_surface, 'backoffice',
    'OP-SUP-010', p_idempotency_key, p_command_id, p_request_hash
  );
  if not receipt.claimed then
    select support.platform_duty_assignment_projection(receipt.aggregate_id) into response;
    if response is null then
      raise exception 'idempotent platform duty grant not found' using errcode = '40001';
    end if;
    return query select response, true;
    return;
  end if;

  select assignment.id into assignment_id
  from support.platform_duty_assignments as assignment
  where assignment.person_id = p_person_id
    and assignment.duty_code = p_duty_code
    and assignment.status in ('scheduled', 'active')
  order by assignment.basis = 'admin_role' desc, assignment.valid_to desc
  limit 1;

  if assignment_id is null then
    -- `actor_mode` is derived from the duty code by the table's CHECK. Computing it
    -- here would create a second, drifting source for the same closed mapping.
    insert into support.platform_duty_assignments (
      person_id, duty_code, actor_mode, status, valid_from, valid_to,
      granted_by_person_id, reason_code
    )
    select
      p_person_id,
      p_duty_code,
      case
        when p_duty_code in (
          'curate_global_catalog', 'verify_professional_credentials', 'manage_platform_commercial'
        ) then 'A11'
        when p_duty_code in (
          'manage_platform_access', 'audit_platform_access', 'approve_break_glass',
          'audit_break_glass', 'manage_privacy_requests'
        ) then 'A12'
        else 'A10'
      end,
      case when starts_at > clock_timestamp() then 'scheduled' else 'active' end,
      starts_at,
      p_valid_to,
      p_actor_person_id,
      btrim(p_reason_code)
    on conflict do nothing
    returning id into assignment_id;

    if assignment_id is null then
      -- A suspended assignment still occupies the partial unique index. It is
      -- revoked and re-granted, never silently reopened.
      raise exception 'the person already holds a suspended assignment of this duty'
        using errcode = '23505';
    end if;

    perform system.enqueue_outbox_event(
      'platform_duty_assignment', assignment_id, 'support.platform_duty_granted.v1',
      jsonb_build_object(
        'assignment_id', assignment_id, 'person_id', p_person_id, 'duty_code', p_duty_code
      )
    );
  end if;

  response := support.platform_duty_assignment_projection(assignment_id);
  perform system.finish_idempotency(
    receipt.receipt_id, 201::smallint, 'platform-duty-granted',
    'platform_duty_assignment', assignment_id
  );
  return query select response, false;
end
$function$;

-- `20260906120200`'s projection, saying how the duty is held.
create or replace function support.platform_duty_assignment_projection(p_assignment_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog
as $function$
  select jsonb_build_object(
    'id', assignment.id,
    'person_id', assignment.person_id,
    'duty_code', assignment.duty_code,
    'actor_mode', assignment.actor_mode,
    'status', support.effective_platform_duty_status(assignment.status, assignment.valid_to),
    'basis', assignment.basis,
    'valid_from', assignment.valid_from,
    'valid_to', assignment.valid_to,
    'required_aal', assignment.required_aal,
    'granted_by_person_id', assignment.granted_by_person_id,
    'recertified_by_person_id', assignment.recertified_by_person_id,
    'recertified_at', assignment.recertified_at,
    'suspended_by_person_id', assignment.suspended_by_person_id,
    'suspended_at', assignment.suspended_at,
    'revoked_by_person_id', assignment.revoked_by_person_id,
    'revoked_at', assignment.revoked_at,
    'reason_code', assignment.reason_code
  )
  from support.platform_duty_assignments as assignment
  where assignment.id = p_assignment_id
$function$;

-- `20260812122000`'s ceremony. It grants the two crossed roles and the roles bring the
-- duties. `p_valid_to` no longer bounds anything; it stays so the ceremony keeps its call.
create or replace function support.bootstrap_backoffice_administrators(
  p_person_a uuid,
  p_subject_a text,
  p_person_b uuid,
  p_subject_b text,
  p_issuer text,
  p_valid_to timestamptz,
  p_ceremony_reference text
)
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  role_id uuid;
  account_a uuid;
  account_b uuid;
begin
  if p_person_a is null or p_person_b is null or p_person_a = p_person_b
    or btrim(p_subject_a) = '' or btrim(p_subject_b) = '' or p_subject_a = p_subject_b
    or btrim(p_issuer) = ''
    or btrim(p_ceremony_reference) = ''
    or not exists (
      select 1 from identity.people as person
      where person.id = p_person_a and person.status = 'active'
    )
    or not exists (
      select 1 from identity.people as person
      where person.id = p_person_b and person.status = 'active'
    ) then
    raise exception 'invalid Backoffice bootstrap ceremony' using errcode = '22023';
  end if;

  select id into account_a from identity.access_accounts
  where provider = 'workos' and issuer = p_issuer and subject = p_subject_a
    and (person_id is null or person_id = p_person_a)
  for update;
  select id into account_b from identity.access_accounts
  where provider = 'workos' and issuer = p_issuer and subject = p_subject_b
    and (person_id is null or person_id = p_person_b)
  for update;
  if account_a is null or account_b is null then
    raise exception 'Backoffice bootstrap account mismatch' using errcode = '28000';
  end if;
  update identity.access_accounts set person_id = p_person_a where id = account_a;
  update identity.access_accounts set person_id = p_person_b where id = account_b;

  insert into support.platform_role_assignments (person_id, platform_role, granted_by_person_id)
  values (p_person_a, 'allfit_admin', p_person_b)
  returning id into role_id;
  perform system.enqueue_outbox_event('platform_role_assignment', role_id,
    'support.platform_role_granted.v1', jsonb_build_object('assignment_id', role_id));

  insert into support.platform_role_assignments (person_id, platform_role, granted_by_person_id)
  values (p_person_b, 'allfit_admin', p_person_a)
  returning id into role_id;
  perform system.enqueue_outbox_event('platform_role_assignment', role_id,
    'support.platform_role_granted.v1', jsonb_build_object('assignment_id', role_id));
end
$function$;

-- ---------------------------------------------------------------------------
-- Sixty idle minutes and twelve hours
-- ---------------------------------------------------------------------------

create function access_control.backoffice_idle_limit()
returns interval
language sql
immutable
set search_path = pg_catalog
as $function$
  select interval '60 minutes'
$function$;

create function access_control.backoffice_session_lifetime()
returns interval
language sql
immutable
set search_path = pg_catalog
as $function$
  select interval '12 hours'
$function$;

alter function access_control.backoffice_idle_limit() owner to allfit_owner;
alter function access_control.backoffice_session_lifetime() owner to allfit_owner;
revoke all on function access_control.backoffice_idle_limit() from public;
revoke all on function access_control.backoffice_session_lifetime() from public;

-- Each body below is its latest definition with the literal limit replaced by the function.

-- `20260812122000`
create or replace function access_control.has_platform_duty(
  p_person_id uuid,
  p_session_id uuid,
  p_duty_code text
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $function$
  select exists (
    select 1
    from identity.access_sessions as session
    join identity.access_accounts as account
      on account.id = session.access_account_id
    join identity.people as person
      on person.id = account.person_id
    join support.platform_role_assignments as role_assignment
      on role_assignment.person_id = person.id
     and role_assignment.platform_role = 'allfit_admin'
     and role_assignment.status = 'active'
    join support.platform_duty_assignments as duty_assignment
      on duty_assignment.person_id = person.id
     and duty_assignment.duty_code = p_duty_code
     and duty_assignment.status = 'active'
     and clock_timestamp() >= duty_assignment.valid_from
     and clock_timestamp() < duty_assignment.valid_to
     and duty_assignment.required_aal <= session.assurance_level
    where person.id = p_person_id
      and person.status = 'active'
      and session.id = p_session_id
      and session.surface = 'backoffice'::identity.access_session_surface
      and session.assurance_level = 2
      and session.authentication_method = 'password_totp'
      and session.revoked_at is null
      and session.absolute_expires_at > clock_timestamp()
      and session.last_activity_at > clock_timestamp() - access_control.backoffice_idle_limit()
  )
$function$;

-- `20260906120000`
create or replace function access_control.has_platform_role(
  p_person_id uuid,
  p_session_id uuid,
  p_platform_role text
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $function$
  select exists (
    select 1
    from identity.access_sessions as session
    join identity.access_accounts as account
      on account.id = session.access_account_id
    join identity.people as person
      on person.id = account.person_id
    join support.platform_role_assignments as role_assignment
      on role_assignment.person_id = person.id
     and role_assignment.platform_role = p_platform_role
     and role_assignment.status = 'active'
    where person.id = p_person_id
      and person.status = 'active'
      and session.id = p_session_id
      and session.surface = 'backoffice'::identity.access_session_surface
      and session.assurance_level = 2
      and session.authentication_method = 'password_totp'
      and session.revoked_at is null
      and session.absolute_expires_at > clock_timestamp()
      and session.last_activity_at > clock_timestamp() - access_control.backoffice_idle_limit()
  )
$function$;

-- `20261002100000`
create or replace function access_control.holds_backoffice_duty(p_duty_code text)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $function$
  select exists (
    select 1
    from identity.people as person
    join support.platform_role_assignments as role_assignment
      on role_assignment.person_id = person.id
     and role_assignment.platform_role = 'allfit_admin'
     and role_assignment.status = 'active'
    join support.platform_duty_assignments as duty_assignment
      on duty_assignment.person_id = person.id
     and duty_assignment.duty_code = p_duty_code
     and duty_assignment.status = 'active'
     and clock_timestamp() >= duty_assignment.valid_from
     and clock_timestamp() < duty_assignment.valid_to
    join identity.access_accounts as account
      on account.person_id = person.id
    join identity.access_sessions as session
      on session.access_account_id = account.id
     and session.surface = 'backoffice'::identity.access_session_surface
     and session.assurance_level = 2
     and session.authentication_method = 'password_totp'
     and session.revoked_at is null
     and session.absolute_expires_at > clock_timestamp()
     and session.last_activity_at > clock_timestamp() - access_control.backoffice_idle_limit()
     and duty_assignment.required_aal <= session.assurance_level
    where person.id = access_control.person()
      and person.status = 'active'
  )
$function$;

-- `20261105100600`
create or replace function identity.expire_backoffice_sessions(p_limit integer)
returns integer
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  target record;
  expired_count integer := 0;
begin
  if access_control.actor_kind() is distinct from 'worker'::identity.actor_kind
     or p_limit is null or p_limit < 1 or p_limit > 500 then
    raise exception 'invalid backoffice session sweep' using errcode = '42501';
  end if;

  for target in
    select session.id
    from identity.access_sessions as session
    where session.surface = 'backoffice'
      and session.revoked_at is null
      and (
        session.absolute_expires_at <= clock_timestamp()
        or session.last_activity_at <= clock_timestamp() - access_control.backoffice_idle_limit()
      )
    order by session.last_activity_at, session.id
    limit p_limit
    for update skip locked
  loop
    update identity.access_sessions
    set revoked_at = clock_timestamp()
    where id = target.id;
    perform system.enqueue_outbox_event(
      'access_session', target.id, 'identity.backoffice_session_revocation_requested.v1',
      jsonb_build_object('session_id', target.id)
    );
    expired_count := expired_count + 1;
  end loop;
  return expired_count;
end
$function$;

-- `20260812122000`
create or replace function identity.complete_backoffice_authentication(
  p_attempt_token_hash bytea,
  p_idempotency_key uuid,
  p_command_id uuid,
  p_session_token_hash bytea,
  p_session_token_ciphertext text,
  p_access_token_expires_at timestamptz
)
returns table (session_id uuid, replayed boolean)
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  target identity.backoffice_authentication_attempts%rowtype;
  v_person_id uuid;
  v_session_id uuid;
begin
  if p_idempotency_key is null or p_command_id is null
    or octet_length(p_session_token_hash) <> 32
    or p_session_token_ciphertext not like 'v1.%'
    or p_access_token_expires_at is null then
    raise exception 'invalid verification command' using errcode = '22023';
  end if;

  select * into target
  from identity.backoffice_authentication_attempts
  where attempt_token_hash = p_attempt_token_hash
  for update;

  if target.id is null then
    raise exception 'authentication attempt not found' using errcode = '28000';
  end if;

  if target.status = 'completed' then
    if target.verification_idempotency_key <> p_idempotency_key
      or target.verification_command_id <> p_command_id then
      raise exception 'authentication attempt already completed' using errcode = '23505';
    end if;
    return query select target.completed_session_id, true;
    return;
  end if;

  if target.status not in ('pending_enrollment', 'pending_challenge')
    or target.expires_at <= clock_timestamp()
    or target.invalid_code_count >= 5 then
    raise exception 'authentication attempt not available' using errcode = '28000';
  end if;

  select person.id into v_person_id
  from identity.access_accounts as account
  join identity.people as person on person.id = account.person_id and person.status = 'active'
  join support.platform_role_assignments as role_assignment
    on role_assignment.person_id = person.id
   and role_assignment.platform_role = 'allfit_admin'
   and role_assignment.status = 'active'
  where account.id = target.access_account_id
  for update of account, person, role_assignment;

  if v_person_id is null then
    raise exception 'backoffice account is no longer eligible' using errcode = '28000';
  end if;

  update identity.access_account_mfa_factors as factor
  set status = 'active', verified_at = coalesce(factor.verified_at, clock_timestamp())
  where factor.id = target.factor_id and factor.status = 'pending';

  if not exists (
    select 1 from identity.access_account_mfa_factors as factor
    where factor.id = target.factor_id and factor.status = 'active'
  ) then
    raise exception 'authentication factor is not active' using errcode = '28000';
  end if;

  insert into identity.access_sessions (
    access_account_id,
    provider_session_id,
    surface,
    token_hash,
    token_ciphertext,
    access_token_expires_at,
    assurance_level,
    authentication_method,
    assurance_verified_at,
    last_activity_at,
    absolute_expires_at
  ) values (
    target.access_account_id,
    target.provider_session_id,
    'backoffice',
    p_session_token_hash,
    p_session_token_ciphertext,
    p_access_token_expires_at,
    2,
    'password_totp',
    clock_timestamp(),
    clock_timestamp(),
    clock_timestamp() + access_control.backoffice_session_lifetime()
  )
  on conflict (surface, provider_session_id) do update
  set token_hash = excluded.token_hash,
      token_ciphertext = excluded.token_ciphertext,
      access_token_expires_at = excluded.access_token_expires_at,
      assurance_level = 2,
      authentication_method = 'password_totp',
      assurance_verified_at = excluded.assurance_verified_at,
      last_activity_at = excluded.last_activity_at,
      absolute_expires_at = excluded.absolute_expires_at,
      token_version = identity.access_sessions.token_version + 1,
      revoked_at = null
  returning id into v_session_id;

  update identity.backoffice_authentication_attempts
  set status = 'completed',
      terminal_at = clock_timestamp(),
      secret_ciphertext = null,
      verification_idempotency_key = p_idempotency_key,
      verification_command_id = p_command_id,
      completed_session_id = v_session_id
  where id = target.id;

  perform system.enqueue_outbox_event(
    'access_session', v_session_id, 'identity.backoffice_authenticated.v1',
    jsonb_build_object('session_id', v_session_id, 'assurance_level', 2)
  );

  return query select v_session_id, false;
end
$function$;

-- `20260812122000`
create or replace function identity.load_backoffice_access_session(p_token_hash bytea)
returns table (
  session_id uuid,
  account_id uuid,
  person_id uuid,
  external_subject text,
  provider_session_id text,
  token_ciphertext text,
  access_token_expires_at timestamptz,
  token_version integer,
  given_name text,
  family_name text,
  assurance_level smallint,
  authentication_method text,
  assurance_verified_at timestamptz,
  last_activity_at timestamptz,
  absolute_expires_at timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  target identity.access_sessions%rowtype;
begin
  select * into target
  from identity.access_sessions
  where token_hash = p_token_hash
    and surface = 'backoffice'
  for update;

  if target.id is null or target.revoked_at is not null then return; end if;

  if target.assurance_level <> 2
    or target.authentication_method <> 'password_totp'
    or target.absolute_expires_at <= clock_timestamp()
    or target.last_activity_at <= clock_timestamp() - access_control.backoffice_idle_limit()
    or not exists (
      select 1
      from identity.access_accounts as account
      join identity.people as person on person.id = account.person_id and person.status = 'active'
      join support.platform_role_assignments as role_assignment
        on role_assignment.person_id = person.id
       and role_assignment.platform_role = 'allfit_admin'
       and role_assignment.status = 'active'
      where account.id = target.access_account_id
    ) then
    update identity.access_sessions set revoked_at = coalesce(revoked_at, clock_timestamp())
    where id = target.id;
    perform system.enqueue_outbox_event(
      'access_session', target.id, 'identity.backoffice_session_revocation_requested.v1',
      jsonb_build_object('session_id', target.id)
    );
    return;
  end if;

  update identity.access_sessions
  set last_activity_at = clock_timestamp()
  where id = target.id
  returning * into target;

  return query
  select
    target.id,
    target.access_account_id,
    person.id,
    account.subject,
    target.provider_session_id,
    target.token_ciphertext,
    target.access_token_expires_at,
    target.token_version,
    person.given_name,
    person.family_name,
    target.assurance_level,
    target.authentication_method,
    target.assurance_verified_at,
    target.last_activity_at,
    target.absolute_expires_at
  from identity.access_accounts as account
  join identity.people as person on person.id = account.person_id
  where account.id = target.access_account_id;
end
$function$;
