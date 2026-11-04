-- HU-BO-028 criteria 4 and 5, HU-BO-029 criterion 2 — recertifying a duty, and the
-- windows that close when a requester loses it.
--
-- **Recertification.** ADR-028 asks every duty for an independent, quarterly
-- recertification by security and privacy. `recertified_by_person_id` and
-- `recertified_at` existed and nothing wrote them, so «última recertificación» was always
-- empty. `support.recertify_platform_duty` (`OP-SUP-010`) records who attests that a duty
-- in force is still needed, and when: `manage_platform_access`, AAL2, and never the
-- duty's own holder. It does not extend the window; longer authority is a new assignment.
--
-- **Windows.** Criterion 5 closes a requester's break-glass windows when the duty is
-- suspended, revoked or runs out, and when the base role is withdrawn. Only the duty
-- commands did. Withdrawing the role revoked the duties directly and left the windows
-- `approved`; a duty past `valid_to` stayed `active` and nothing noticed. Exercising
-- rechecks the duty, so neither window could be used, but the inbox said it was open.
--
-- `support.close_revoked_platform_access` now closes them with the role.
-- `support.lapse_platform_duties` moves every duty past its window to `expired` and closes
-- the windows of a requester left without `request_break_glass`. The worker runs it on
-- its minute job, as `worker`: closing a window is a fact of the clock, not an act of
-- support, so it is not attributed to anyone. Two policies let the worker see the open
-- requests and only close them.

set lock_timeout = '5s';
set statement_timeout = '60s';

-- ---------------------------------------------------------------------------
-- OP-SUP-010 — recertify a duty
-- ---------------------------------------------------------------------------

create function support.recertify_platform_duty(
  p_actor_person_id uuid,
  p_actor_session_id uuid,
  p_assignment_id uuid,
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
  target support.platform_duty_assignments%rowtype;
  response jsonb;
begin
  perform support.require_platform_access_manager(p_actor_person_id, p_actor_session_id);

  select assignment.* into target
  from support.platform_duty_assignments as assignment
  where assignment.id = p_assignment_id
  for update;

  if target.id is null then
    raise exception 'platform duty assignment not found' using errcode = 'P0002';
  end if;
  if target.person_id = p_actor_person_id then
    raise exception 'a platform duty is never self-recertified' using errcode = '42501';
  end if;

  select * into receipt
  from system.begin_idempotency(
    p_actor_person_id, 'backoffice'::system.command_surface, 'backoffice',
    'OP-SUP-010', p_idempotency_key, p_command_id, p_request_hash
  );
  if not receipt.claimed then
    select support.platform_duty_assignment_projection(receipt.aggregate_id) into response;
    if response is null then
      raise exception 'idempotent platform duty recertification not found' using errcode = '40001';
    end if;
    return query select response, true;
    return;
  end if;

  -- Checked after the replay branch: a retry of a recertification that went through
  -- answers from its receipt even if the duty has run out since.
  if target.status <> 'active'
     or clock_timestamp() < target.valid_from
     or clock_timestamp() >= target.valid_to then
    raise exception 'only a duty in force is recertified' using errcode = '23514';
  end if;

  update support.platform_duty_assignments
  set recertified_by_person_id = p_actor_person_id,
      recertified_at = clock_timestamp()
  where id = target.id;

  perform system.enqueue_outbox_event(
    'platform_duty_assignment',
    target.id,
    'support.platform_duty_recertified.v1',
    jsonb_build_object(
      'assignment_id', target.id, 'person_id', target.person_id, 'duty_code', target.duty_code
    )
  );

  response := support.platform_duty_assignment_projection(target.id);
  perform system.finish_idempotency(
    receipt.receipt_id, 200::smallint, 'platform-duty-recertified',
    'platform_duty_assignment', target.id
  );
  return query select response, false;
end
$function$;

alter function support.recertify_platform_duty(uuid, uuid, uuid, uuid, uuid, bytea)
  owner to allfit_owner;
revoke all on function support.recertify_platform_duty(uuid, uuid, uuid, uuid, uuid, bytea)
  from public;
grant execute on function support.recertify_platform_duty(uuid, uuid, uuid, uuid, uuid, bytea)
  to allfit_api;

-- ---------------------------------------------------------------------------
-- A duty that runs out lapses, and its windows close
-- ---------------------------------------------------------------------------

-- Reading is not narrowed by state: an update must still see the row it closed. What the
-- worker may change is narrowed by the update policy below.
create policy break_glass_requests_select_worker on support.break_glass_requests
  for select to allfit_owner
  using (access_control.actor_kind() = 'worker');

create policy break_glass_requests_update_worker on support.break_glass_requests
  for update to allfit_owner
  using (access_control.actor_kind() = 'worker' and status in ('requested', 'approved'))
  with check (access_control.actor_kind() = 'worker' and status in ('closed', 'expired'));

create function support.lapse_platform_duties()
returns integer
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  lapsed integer;
  requesters uuid[];
  requester uuid;
begin
  with expired as (
    update support.platform_duty_assignments as assignment
    set status = 'expired'
    where assignment.status in ('active', 'suspended')
      and assignment.valid_to <= clock_timestamp()
    returning assignment.person_id, assignment.duty_code
  )
  select count(*)::integer,
         coalesce(
           array_agg(distinct expired.person_id)
             filter (where expired.duty_code = 'request_break_glass'),
           array[]::uuid[]
         )
  into lapsed, requesters
  from expired;

  foreach requester in array requesters loop
    -- A second assignment of the same duty still in force keeps the windows open.
    if not exists (
      select 1 from support.platform_duty_assignments as other
      where other.person_id = requester
        and other.duty_code = 'request_break_glass'
        and other.status = 'active'
        and clock_timestamp() >= other.valid_from
        and clock_timestamp() < other.valid_to
    ) then
      perform support.close_break_glass_for_withdrawn_duty(requester);
    end if;
  end loop;

  return lapsed;
end
$function$;

alter function support.lapse_platform_duties() owner to allfit_owner;
revoke all on function support.lapse_platform_duties() from public;
grant execute on function support.lapse_platform_duties() to allfit_api;

-- ---------------------------------------------------------------------------
-- Withdrawing the base role closes the requester's windows
-- ---------------------------------------------------------------------------

-- The body is `20260812122000`'s with the windows closed after the duties; nothing else
-- changed.
create or replace function support.close_revoked_platform_access()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  target record;
begin
  if old.status = 'active' and new.status = 'revoked' then
    update support.platform_duty_assignments
    set status = 'revoked', revoked_by_person_id = new.revoked_by_person_id,
        revoked_at = new.revoked_at
    where person_id = new.person_id and status in ('scheduled', 'active', 'suspended');

    -- The duties above include `request_break_glass`; its windows close with them.
    perform support.close_break_glass_for_withdrawn_duty(new.person_id);

    for target in
      update identity.access_sessions as session
      set revoked_at = clock_timestamp()
      from identity.access_accounts as account
      where account.person_id = new.person_id
        and session.access_account_id = account.id
        and session.surface = 'backoffice'
        and session.revoked_at is null
      returning session.id
    loop
      perform system.enqueue_outbox_event(
        'access_session', target.id, 'identity.backoffice_session_revocation_requested.v1',
        jsonb_build_object('session_id', target.id)
      );
    end loop;

    for target in
      update identity.backoffice_authentication_attempts as attempt
      set status = 'failed', terminal_at = clock_timestamp(), secret_ciphertext = null
      from identity.access_accounts as account
      where account.person_id = new.person_id
        and attempt.access_account_id = account.id
        and attempt.status in ('pending_enrollment', 'pending_challenge')
      returning attempt.id, attempt.factor_id
    loop
      update identity.access_account_mfa_factors as factor
      set status = 'superseded', superseded_at = clock_timestamp()
      where factor.id = target.factor_id and factor.status = 'pending';
      perform system.enqueue_outbox_event(
        'backoffice_auth_attempt', target.id, 'identity.backoffice_auth_cleanup_requested.v1',
        jsonb_build_object('attempt_id', target.id)
      );
    end loop;
  end if;
  return new;
end
$function$;
