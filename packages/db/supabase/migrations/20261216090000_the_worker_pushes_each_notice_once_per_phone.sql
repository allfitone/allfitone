-- The worker pushes each notice once per phone, and lets go of what is ninety days old
-- (ADR-054 decision 7, scenario 7; data dictionary §4.15.2 and §11.6). TECH-44.
--
-- **Claiming is leasing.** `system.claim_push_deliveries` hands the worker the pending
-- pushes that are due, each with its phone's token, the notice's kind and category, the
-- organization's name and the person's language, and nothing else: no words and none of
-- her data. Claiming moves `next_attempt_at` ahead, so a second claim before the push is
-- settled does not take it again, and a worker that dies mid-send retries it later. The
-- column is added here: the dictionary's columns had no way to tell a claimed push from a
-- waiting one, and a status for it would have been a fifth state to keep in step.
--
-- **What may no longer go is skipped, never handed out.** A push for a phone that was
-- retired, or that now belongs to somebody other than the notice's person, is settled as
-- `skipped` by the claim itself. After five attempts a push fails as `too_many_attempts`.
--
-- **Settling says what Expo answered.** `sent`, `failed` with its code, `retry` (Expo or
-- the network was down: it waits for its lease to end), or `unregistered`: the push fails
-- and the phone is retired as `unregistered`, but only while it still holds the token
-- Expo refused, because a phone that registered a new token since is reachable again.
-- Settling a push that is no longer pending changes nothing.
--
-- **Ninety days.** `system.purge_notification_records` deletes settled pushes and retired
-- phones older than ninety days (a phone takes its remaining pushes with it). The notices
-- are hers and stay.
--
-- **Only the worker.** The three functions refuse any other actor, and they reach the
-- rows through the `push_delivery` scope, which only they open.
--
-- Additive.

set lock_timeout = '5s';
set statement_timeout = '60s';

alter table system.notification_deliveries
  add column next_attempt_at timestamp with time zone not null default clock_timestamp();

create index idx_notification_deliveries_due
  on system.notification_deliveries (next_attempt_at, id) where status = 'pending';
create index idx_notification_deliveries_settled
  on system.notification_deliveries (created_at) where status <> 'pending';
create index idx_person_push_devices_retired
  on identity.person_push_devices (retired_at) where retired_at is not null;

-- ---------------------------------------------------------------------------
-- What the push job may reach
-- ---------------------------------------------------------------------------

create policy notification_deliveries_select_push_job on system.notification_deliveries
  for select to allfit_owner
  using ((select access_control.contract_scope('push_delivery')) is not null);
create policy notification_deliveries_update_push_job on system.notification_deliveries
  for update to allfit_owner
  using ((select access_control.contract_scope('push_delivery')) is not null)
  with check ((select access_control.contract_scope('push_delivery')) is not null);
create policy notification_deliveries_delete_push_job on system.notification_deliveries
  for delete to allfit_owner
  using (status <> 'pending' and (select access_control.contract_scope('push_delivery')) is not null);

create policy person_notifications_select_push_job on identity.person_notifications
  for select to allfit_owner
  using ((select access_control.contract_scope('push_delivery')) is not null);

create policy person_push_devices_select_push_job on identity.person_push_devices
  for select to allfit_owner
  using ((select access_control.contract_scope('push_delivery')) is not null);
create policy person_push_devices_update_push_job on identity.person_push_devices
  for update to allfit_owner
  using (retired_at is null and (select access_control.contract_scope('push_delivery')) is not null)
  with check (retired_reason = 'unregistered' and (select access_control.contract_scope('push_delivery')) is not null);
create policy person_push_devices_delete_push_job on identity.person_push_devices
  for delete to allfit_owner
  using (retired_at is not null and (select access_control.contract_scope('push_delivery')) is not null);

create policy person_preferences_select_push_job on identity.person_preferences
  for select to allfit_owner
  using ((select access_control.contract_scope('push_delivery')) is not null);

-- ---------------------------------------------------------------------------
-- Claim
-- ---------------------------------------------------------------------------

create function system.claim_push_deliveries(p_limit integer)
returns table (
  delivery_id uuid,
  notification_id uuid,
  push_token text,
  platform text,
  kind text,
  category text,
  organization_name text,
  locale text,
  attempt integer
)
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  saved_purpose text := current_setting('app.contract_scope_purpose', true);
  saved_id text := current_setting('app.contract_scope_id', true);
  saved_token text := current_setting('app.contract_scope_token', true);
begin
  if access_control.actor_kind() is distinct from 'worker' then
    raise exception 'only the worker claims pushes' using errcode = '42501';
  end if;
  if p_limit is null or p_limit < 1 or p_limit > 500 then
    raise exception 'a claim takes between 1 and 500 pushes' using errcode = '22023';
  end if;

  perform access_control.open_contract_scope('push_delivery', '00000000-0000-0000-0000-000000000000'::uuid);

  -- A phone retired, or in somebody else's hands, gets nothing that was meant for her.
  update system.notification_deliveries as delivery
  set status = 'skipped',
      last_error_code = case when device.retired_at is not null then 'device_retired' else 'not_device_owner' end
  from identity.person_notifications as notice, identity.person_push_devices as device
  where delivery.status = 'pending'
    and notice.id = delivery.notification_id
    and device.id = delivery.device_id
    and (device.retired_at is not null or device.person_id <> notice.person_id);

  update system.notification_deliveries as delivery
  set status = 'failed', last_error_code = 'too_many_attempts'
  where delivery.status = 'pending'
    and delivery.attempt_count >= 5
    and delivery.next_attempt_at <= clock_timestamp();

  return query
  with due as (
    select candidate.id
    from system.notification_deliveries as candidate
    where candidate.status = 'pending'
      and candidate.next_attempt_at <= clock_timestamp()
    order by candidate.next_attempt_at, candidate.id
    limit p_limit
    for update skip locked
  )
  update system.notification_deliveries as delivery
  set attempt_count = delivery.attempt_count + 1,
      next_attempt_at = clock_timestamp()
        + least(interval '1 minute' * power(2, delivery.attempt_count), interval '1 hour')
  from due, identity.person_notifications as notice, identity.person_push_devices as device
  where delivery.id = due.id
    and notice.id = delivery.notification_id
    and device.id = delivery.device_id
  returning
    delivery.id,
    delivery.notification_id,
    device.push_token,
    device.platform,
    notice.kind,
    notice.category,
    (select organization.display_name from organizations.organizations as organization
     where organization.id = notice.organization_id),
    (select preference.locale from identity.person_preferences as preference
     where preference.person_id = notice.person_id),
    delivery.attempt_count;

  perform set_config('app.contract_scope_purpose', coalesce(saved_purpose, ''), true);
  perform set_config('app.contract_scope_id', coalesce(saved_id, ''), true);
  perform set_config('app.contract_scope_token', coalesce(saved_token, ''), true);
end
$function$;

-- ---------------------------------------------------------------------------
-- Settle
-- ---------------------------------------------------------------------------

create function system.settle_push_delivery(
  p_delivery_id uuid,
  p_outcome text,
  p_error_code text,
  p_push_token text
)
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  saved_purpose text := current_setting('app.contract_scope_purpose', true);
  saved_id text := current_setting('app.contract_scope_id', true);
  saved_token text := current_setting('app.contract_scope_token', true);
  code text := left(nullif(btrim(p_error_code), ''), 120);
  refused_device uuid;
begin
  if access_control.actor_kind() is distinct from 'worker' then
    raise exception 'only the worker settles pushes' using errcode = '42501';
  end if;
  if p_delivery_id is null or p_outcome is null
     or p_outcome not in ('sent', 'failed', 'retry', 'unregistered') then
    raise exception 'a push is sent, failed, retried or unregistered' using errcode = '22023';
  end if;

  perform access_control.open_contract_scope('push_delivery', '00000000-0000-0000-0000-000000000000'::uuid);

  if p_outcome = 'sent' then
    update system.notification_deliveries as delivery
    set status = 'sent', sent_at = clock_timestamp(), last_error_code = null
    where delivery.id = p_delivery_id and delivery.status = 'pending';
  elsif p_outcome = 'retry' then
    update system.notification_deliveries as delivery
    set last_error_code = coalesce(code, 'provider_unavailable')
    where delivery.id = p_delivery_id and delivery.status = 'pending';
  else
    update system.notification_deliveries as delivery
    set status = 'failed',
        last_error_code = coalesce(code, case when p_outcome = 'unregistered'
                                              then 'DeviceNotRegistered' else 'provider_rejected' end)
    where delivery.id = p_delivery_id and delivery.status = 'pending'
    returning delivery.device_id into refused_device;

    -- Only while the phone still holds the token Expo refused.
    if p_outcome = 'unregistered' and refused_device is not null then
      update identity.person_push_devices as device
      set retired_at = clock_timestamp(), retired_reason = 'unregistered'
      where device.id = refused_device
        and device.push_token = p_push_token
        and device.retired_at is null;
    end if;
  end if;

  perform set_config('app.contract_scope_purpose', coalesce(saved_purpose, ''), true);
  perform set_config('app.contract_scope_id', coalesce(saved_id, ''), true);
  perform set_config('app.contract_scope_token', coalesce(saved_token, ''), true);
end
$function$;

-- ---------------------------------------------------------------------------
-- Ninety days
-- ---------------------------------------------------------------------------

create function system.purge_notification_records(p_limit integer)
returns integer
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  saved_purpose text := current_setting('app.contract_scope_purpose', true);
  saved_id text := current_setting('app.contract_scope_id', true);
  saved_token text := current_setting('app.contract_scope_token', true);
  settled integer;
  retired integer;
begin
  if access_control.actor_kind() is distinct from 'worker' then
    raise exception 'only the worker purges pushes and phones' using errcode = '42501';
  end if;
  if p_limit is null or p_limit < 1 or p_limit > 10000 then
    raise exception 'a purge takes between 1 and 10000 rows of each kind' using errcode = '22023';
  end if;

  perform access_control.open_contract_scope('push_delivery', '00000000-0000-0000-0000-000000000000'::uuid);

  with gone as (
    delete from system.notification_deliveries as delivery
    where delivery.id in (
      select old.id from system.notification_deliveries as old
      where old.status <> 'pending' and old.created_at < clock_timestamp() - interval '90 days'
      limit p_limit)
    returning 1
  )
  select count(*)::integer into settled from gone;

  with gone as (
    delete from identity.person_push_devices as device
    where device.id in (
      select old.id from identity.person_push_devices as old
      where old.retired_at < clock_timestamp() - interval '90 days'
      limit p_limit)
    returning 1
  )
  select count(*)::integer into retired from gone;

  perform set_config('app.contract_scope_purpose', coalesce(saved_purpose, ''), true);
  perform set_config('app.contract_scope_id', coalesce(saved_id, ''), true);
  perform set_config('app.contract_scope_token', coalesce(saved_token, ''), true);
  return settled + retired;
end
$function$;

-- ---------------------------------------------------------------------------
-- Ownership and privileges
-- ---------------------------------------------------------------------------

alter function system.claim_push_deliveries(integer) owner to allfit_owner;
alter function system.settle_push_delivery(uuid, text, text, text) owner to allfit_owner;
alter function system.purge_notification_records(integer) owner to allfit_owner;

revoke all on function system.claim_push_deliveries(integer) from public;
revoke all on function system.settle_push_delivery(uuid, text, text, text) from public;
revoke all on function system.purge_notification_records(integer) from public;

grant execute on function system.claim_push_deliveries(integer) to allfit_api;
grant execute on function system.settle_push_delivery(uuid, text, text, text) to allfit_api;
grant execute on function system.purge_notification_records(integer) to allfit_api;
