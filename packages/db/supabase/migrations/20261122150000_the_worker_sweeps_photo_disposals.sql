-- HU-BO-033 — a photo that is no longer used leaves the store even when nobody was there
-- to remove it.
--
-- The API removes a meal or body photo right after the commit that disposes of it, and
-- seals the disposal (ADR-039). Two paths never reached that step. A meal the worker
-- deletes when a legal hold ends (20261104140000) queues its photo with no API request
-- around it, and a removal the store refused left the row pending with nothing to retry
-- it. In both cases the photo stayed in the store for good.
--
-- The worker now sweeps both queues. It claims only what has waited five minutes, so it
-- does not race the API's own removal; removing twice is harmless anyway, because the
-- store answers a missing key as removed. Each claim counts an attempt and pushes the
-- next one further away, doubling up to a day, so a photo the store keeps refusing
-- neither costs a call every minute nor holds the queue in front of newer ones.
--
-- The claim hands over the object key and nothing else: the worker never learns whose
-- photo it removes. It changes pending rows only; a sealed one stays as it was.

set lock_timeout = '5s';
set statement_timeout = '60s';

alter table nutrition.media_disposals
  add column purge_attempts integer not null default 0,
  add column next_attempt_at timestamptz,
  add constraint ck_media_disposals_purge_attempts check (purge_attempts >= 0);

alter table identity.body_photo_disposals
  add column purge_attempts integer not null default 0,
  add column next_attempt_at timestamptz,
  add constraint ck_body_photo_disposals_purge_attempts check (purge_attempts >= 0);

create policy media_disposals_select_worker_sweep on nutrition.media_disposals
  for select to allfit_owner
  using (access_control.actor_kind() = 'worker');

create policy media_disposals_update_worker_sweep on nutrition.media_disposals
  for update to allfit_owner
  using (access_control.actor_kind() = 'worker' and sealed_at is null)
  with check (access_control.actor_kind() = 'worker');

create policy body_photo_disposals_select_worker_sweep on identity.body_photo_disposals
  for select to allfit_owner
  using (access_control.actor_kind() = 'worker');

create policy body_photo_disposals_update_worker_sweep on identity.body_photo_disposals
  for update to allfit_owner
  using (access_control.actor_kind() = 'worker' and sealed_at is null)
  with check (access_control.actor_kind() = 'worker');

-- ———————————————————————————————————————— meal photos

create function nutrition.claim_media_disposals(p_limit integer)
returns table (id uuid, media_ref text, purge_attempts integer)
language plpgsql
security definer
set search_path = pg_catalog
as $function$
begin
  if access_control.actor_kind() is distinct from 'worker' then
    raise exception 'only the worker sweeps the photo queue' using errcode = '42501';
  end if;
  if p_limit is null or p_limit < 1 or p_limit > 500 then
    raise exception 'a sweep claims between 1 and 500 photos' using errcode = '22023';
  end if;

  return query
  with due as (
    select disposal.id
    from nutrition.media_disposals as disposal
    where disposal.sealed_at is null
      and coalesce(disposal.next_attempt_at, disposal.requested_at + interval '5 minutes')
        <= clock_timestamp()
    order by coalesce(disposal.next_attempt_at, disposal.requested_at + interval '5 minutes'),
      disposal.id
    limit p_limit
    for update skip locked
  )
  update nutrition.media_disposals as disposal
  set purge_attempts = disposal.purge_attempts + 1,
      next_attempt_at = clock_timestamp() + least(
        interval '1 minute' * power(2, least(disposal.purge_attempts, 11)),
        interval '1 day'
      )
  from due
  where disposal.id = due.id
  returning disposal.id, disposal.media_ref, disposal.purge_attempts;
end
$function$;

create function nutrition.seal_swept_media_disposal(p_disposal_id uuid)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog
as $function$
begin
  if access_control.actor_kind() is distinct from 'worker' then
    raise exception 'only the worker seals a swept photo' using errcode = '42501';
  end if;
  update nutrition.media_disposals as disposal
  set sealed_at = clock_timestamp()
  where disposal.id = p_disposal_id and disposal.sealed_at is null;
  return found;
end
$function$;

-- ———————————————————————————————————————— body photos

create function identity.claim_body_photo_disposals(p_limit integer)
returns table (id uuid, media_ref text, purge_attempts integer)
language plpgsql
security definer
set search_path = pg_catalog
as $function$
begin
  if access_control.actor_kind() is distinct from 'worker' then
    raise exception 'only the worker sweeps the photo queue' using errcode = '42501';
  end if;
  if p_limit is null or p_limit < 1 or p_limit > 500 then
    raise exception 'a sweep claims between 1 and 500 photos' using errcode = '22023';
  end if;

  return query
  with due as (
    select disposal.id
    from identity.body_photo_disposals as disposal
    where disposal.sealed_at is null
      and coalesce(disposal.next_attempt_at, disposal.requested_at + interval '5 minutes')
        <= clock_timestamp()
    order by coalesce(disposal.next_attempt_at, disposal.requested_at + interval '5 minutes'),
      disposal.id
    limit p_limit
    for update skip locked
  )
  update identity.body_photo_disposals as disposal
  set purge_attempts = disposal.purge_attempts + 1,
      next_attempt_at = clock_timestamp() + least(
        interval '1 minute' * power(2, least(disposal.purge_attempts, 11)),
        interval '1 day'
      )
  from due
  where disposal.id = due.id
  returning disposal.id, disposal.media_ref, disposal.purge_attempts;
end
$function$;

create function identity.seal_swept_body_photo_disposal(p_disposal_id uuid)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog
as $function$
begin
  if access_control.actor_kind() is distinct from 'worker' then
    raise exception 'only the worker seals a swept photo' using errcode = '42501';
  end if;
  update identity.body_photo_disposals as disposal
  set sealed_at = clock_timestamp()
  where disposal.id = p_disposal_id and disposal.sealed_at is null;
  return found;
end
$function$;

alter function nutrition.claim_media_disposals(integer) owner to allfit_owner;
alter function nutrition.seal_swept_media_disposal(uuid) owner to allfit_owner;
alter function identity.claim_body_photo_disposals(integer) owner to allfit_owner;
alter function identity.seal_swept_body_photo_disposal(uuid) owner to allfit_owner;

revoke all on function nutrition.claim_media_disposals(integer) from public;
revoke all on function nutrition.seal_swept_media_disposal(uuid) from public;
revoke all on function identity.claim_body_photo_disposals(integer) from public;
revoke all on function identity.seal_swept_body_photo_disposal(uuid) from public;

grant execute on function nutrition.claim_media_disposals(integer) to allfit_api;
grant execute on function nutrition.seal_swept_media_disposal(uuid) to allfit_api;
grant execute on function identity.claim_body_photo_disposals(integer) to allfit_api;
grant execute on function identity.seal_swept_body_photo_disposal(uuid) to allfit_api;
