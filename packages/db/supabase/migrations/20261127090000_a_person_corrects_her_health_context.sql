-- A person corrects her health context in place — TECH-326, `OP-IDN-067`, ADR-052
-- (`HU-SP-022` for health context).
--
-- **Correcting changes that claim and keeps no versions.** Since `20260927070000` a
-- declared claim could not be updated at all. Health context is the most protected
-- category V1 keeps, and keeping every earlier wording of a pain would keep more health
-- data than the person meant to leave; something new is told as a new claim.
--
-- **What a correction never changes:** the claim's id, its person, its provenance and when
-- it was recorded. The guard keeps refusing any update that touches them, and any update to
-- a claim that is not `person_declared`, whoever runs it.
--
-- **A legal hold keeps what the data says**, so a live hold over `health` stops a
-- correction as it stops a deletion, and a claim whose deletion is already waiting is not
-- corrected either. Nothing about a correction leaves the database: no event is enqueued.

set lock_timeout = '5s';
set statement_timeout = '60s';

create or replace function identity.health_context_claim_guard_tg()
returns trigger
language plpgsql
set search_path = pg_catalog
as $function$
begin
  if old.provenance <> 'person_declared'
     or new.id <> old.id
     or new.person_id <> old.person_id
     or new.provenance <> old.provenance
     or new.created_at <> old.created_at then
    raise exception 'a health claim keeps its identity, owner, origin and record'
      using errcode = '55000';
  end if;
  return new;
end
$function$;

create function identity.correct_health_context(
  p_provider text,
  p_issuer text,
  p_subject text,
  p_claim_id uuid,
  p_context_type text,
  p_description text,
  p_body_area text,
  p_valid_from timestamptz,
  p_valid_to timestamptz,
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
  person uuid;
  receipt record;
  target identity.health_context_claims%rowtype;
  words text := btrim(p_description);
begin
  person := identity.require_space_person(p_provider, p_issuer, p_subject);

  if p_context_type is null or p_context_type not in ('pain', 'limitation', 'recovery') then
    raise exception 'V1 keeps pains, limitations and recoveries, nothing else' using errcode = '22023';
  end if;
  if words is null or words = '' or char_length(words) > 500 then
    raise exception 'a claim says something, briefly' using errcode = '22023';
  end if;
  if p_body_area is not null and p_body_area not in (
    'neck', 'shoulder', 'upper_back', 'lower_back', 'chest', 'abdomen', 'arm', 'elbow',
    'wrist_hand', 'hip', 'thigh', 'knee', 'lower_leg', 'ankle_foot'
  ) then
    raise exception 'that body area is not in the list' using errcode = '22023';
  end if;
  if p_valid_from is null
     or p_valid_from > clock_timestamp() + interval '1 day'
     or p_valid_from < timestamptz '1900-01-01 00:00:00+00' then
    raise exception 'a claim starts on a real day, not a future one' using errcode = '22023';
  end if;
  if p_valid_to is not null and p_valid_to <= p_valid_from then
    raise exception 'a claim ends after it starts' using errcode = '22023';
  end if;

  select * into receipt
  from system.begin_idempotency(
    person, 'space'::system.command_surface, 'space',
    'OP-IDN-067', p_idempotency_key, p_command_id, p_request_hash
  );
  if not receipt.claimed then
    return query select identity.health_context_projection(p_claim_id), true;
    return;
  end if;

  -- Someone else's claim and a claim that does not exist answer the same.
  select claim.* into target
  from identity.health_context_claims as claim
  where claim.id = p_claim_id
    and claim.person_id = person
    and claim.provenance = 'person_declared'
  for update;
  if target.id is null then
    raise exception 'claim not found' using errcode = 'P0002';
  end if;

  if privacy.live_hold_over(person, 'health') is not null or exists (
    select 1 from privacy.disposition_items as item
    where item.target_health_context_id = target.id
      and item.status in ('pending', 'suspended')
  ) then
    raise exception 'this claim is kept as it is for now' using errcode = '55000';
  end if;

  update identity.health_context_claims as claim
  set context_type = p_context_type,
      description = words,
      body_area = p_body_area,
      valid_from = p_valid_from,
      valid_to = p_valid_to
  where claim.id = target.id;

  perform system.finish_idempotency(
    receipt.receipt_id, 200::smallint, 'health-context-corrected',
    'health_context_claim', target.id
  );
  return query select identity.health_context_projection(target.id), false;
end
$function$;

alter function identity.correct_health_context(
  text, text, text, uuid, text, text, text, timestamptz, timestamptz, uuid, uuid, bytea
) owner to allfit_owner;
revoke all on function identity.correct_health_context(
  text, text, text, uuid, text, text, text, timestamptz, timestamptz, uuid, uuid, bytea
) from public;
grant execute on function identity.correct_health_context(
  text, text, text, uuid, text, text, text, timestamptz, timestamptz, uuid, uuid, bytea
) to allfit_api;
