-- A legal hold keeps what it names — `HU-BO-033` criteria 1, 3 and 4, over `OP-PRV-009`,
-- `OP-PRV-010` and the person's own deletions `OP-IDN-007`, `OP-IDN-050` and `OP-NUT-004`.
--
-- `20260927110000` built the hold over dispositions that were already waiting. None ever
-- waited: a person's own deletion opened its disposition and executed it in the same
-- transaction, so a hold had nothing to stop and the person could delete exactly what it
-- existed to keep. Releasing put an item back to `pending` and nothing ran it afterwards,
-- and an expired hold kept suspending until somebody remembered it.
--
-- **A hold names a person and kinds of their data.** It is applied when the order
-- arrives, before anyone asks to delete, and covers what of that already waits and what
-- the person asks to delete while it is in force. Only kinds a published policy disposes
-- of can be held: a hold over anything else would promise what no deletion reaches. The
-- separation of duties is checked per person, as before.
--
-- **The person's deletion asks first.** Under a live hold the record stays, its
-- disposition waits suspended in an open case, and the answer says so, on what ground
-- and until when (criterion 3) — never the case reference, the scope or who applied it.
-- Asking again answers the same case.
--
-- **No indefinite holds.** A hold is live while `valid_to` is ahead: an expired one
-- suspends nothing new before any sweep runs, and reads as lapsed. The privacy worker
-- then lapses it. `20260927110000` refused that on purpose, because "the calendar
-- decided" answers to nobody; but the date is the one the officer declared, and the
-- alternative is the indefinite hold criterion 1 rules out. What a hold stops holding
-- passes to another live hold over the same data, so a renewed order leaves no gap, or
-- goes back to pending.
--
-- **Then the deletion follows its course** (criterion 4). The worker executes what is
-- pending and due, as the person's own deletion would have and attributed to
-- `privacy_worker`: the row goes, a meal's photo is queued and its deletion announced,
-- and the case closes. Releasing still executes nothing by itself.
--
-- Two mechanics the worker needs. A disposition's hold on its target becomes a key
-- checked at commit (deferrable `no action`) instead of `restrict`: the worker deletes
-- the row while its disposition still names it, which is what its policy on meals asks,
-- and releases it after; at commit no live disposition may name a deleted row, as
-- before. And the two hold tables move to `allfit_owner`, which owns the deletions that
-- now read them; they were left with the role that ran their migration.

set lock_timeout = '5s';
set statement_timeout = '60s';

-- ---------------------------------------------------------------------------
-- What a hold covers
-- ---------------------------------------------------------------------------

alter table privacy.legal_holds owner to allfit_owner;
alter table privacy.hold_applications owner to allfit_owner;

-- Nullable for the holds filed before this, which name dispositions and not a person.
alter table privacy.legal_holds add column subject_person_id uuid;
alter table privacy.legal_holds add column lapsed_at timestamptz;

alter table privacy.legal_holds
  add constraint fk_legal_holds_subject foreign key (subject_person_id) references identity.people(id) on delete restrict;

-- Released by somebody, or lapsed by its own date; never both.
alter table privacy.legal_holds drop constraint ck_legal_holds_status;
alter table privacy.legal_holds
  add constraint ck_legal_holds_status check (status in ('active', 'released', 'lapsed'));
alter table privacy.legal_holds
  add constraint ck_legal_holds_lapsed check ((status = 'lapsed') = (lapsed_at is not null));

create index idx_legal_holds_subject
  on privacy.legal_holds (subject_person_id, status, valid_to);

create table privacy.legal_hold_categories (
  legal_hold_id uuid not null,
  data_classification_code text not null,
  constraint pk_legal_hold_categories primary key (legal_hold_id, data_classification_code),
  constraint fk_legal_hold_categories_hold foreign key (legal_hold_id) references privacy.legal_holds(id) on delete restrict,
  constraint fk_legal_hold_categories_classification foreign key (data_classification_code) references privacy.data_classifications(code) on delete restrict
);

create index idx_legal_hold_categories_classification
  on privacy.legal_hold_categories (data_classification_code);

alter table privacy.legal_hold_categories owner to allfit_owner;
alter table privacy.legal_hold_categories enable row level security;
alter table privacy.legal_hold_categories force row level security;

create policy legal_hold_categories_all_owner on privacy.legal_hold_categories
  for all to allfit_owner using (true) with check (true);

create or replace function privacy.reject_hold_category_rewrite_tg()
returns trigger
language plpgsql
set search_path = pg_catalog
as $function$
begin
  raise exception 'what a hold covers is fixed when it is applied' using errcode = '55000';
end
$function$;

alter function privacy.reject_hold_category_rewrite_tg() owner to allfit_owner;

create trigger trg_legal_hold_categories_immutable
before update or delete on privacy.legal_hold_categories
for each row execute function privacy.reject_hold_category_rewrite_tg();

-- ---------------------------------------------------------------------------
-- A disposition's hold on its target, checked at commit
-- ---------------------------------------------------------------------------

alter table privacy.disposition_items
  drop constraint fk_disposition_items_body_progress,
  add constraint fk_disposition_items_body_progress foreign key (target_body_progress_id) references identity.body_progress_records(id) deferrable initially immediate,
  drop constraint fk_disposition_items_health_context,
  add constraint fk_disposition_items_health_context foreign key (target_health_context_id) references identity.health_context_claims(id) deferrable initially immediate,
  drop constraint fk_disposition_items_nutrition_meal,
  add constraint fk_disposition_items_nutrition_meal foreign key (target_nutrition_meal_id) references nutrition.meals(id) deferrable initially immediate;

-- ---------------------------------------------------------------------------
-- Which hold is live, and what happens when one stops
-- ---------------------------------------------------------------------------

-- The live hold over this person's data of this kind: the one that ends last, so what
-- it takes changes hands as seldom as possible. Volatile: it reads the clock.
create or replace function privacy.live_hold_over(
  p_subject_person_id uuid,
  p_classification text
)
returns uuid
language sql
security definer
set search_path = pg_catalog
as $function$
  select hold.id
  from privacy.legal_holds as hold
  join privacy.legal_hold_categories as category on category.legal_hold_id = hold.id
  where hold.subject_person_id = p_subject_person_id
    and category.data_classification_code = p_classification
    and hold.status = 'active'
    and hold.valid_to > clock_timestamp()
  order by hold.valid_to desc, hold.id
  limit 1
$function$;

-- What a hold that stopped holding leaves behind: each suspended disposition passes to
-- another live hold over the same data or goes back to waiting its turn. Nothing here
-- executes. The caller marks the hold released or lapsed first.
create or replace function privacy.settle_hold(p_hold_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  held record;
  successor uuid;
begin
  for held in
    update privacy.hold_applications as application
    set status = 'released', released_at = clock_timestamp()
    from privacy.disposition_items as item
    where application.legal_hold_id = p_hold_id
      and application.status = 'active'
      and item.id = application.disposition_item_id
    returning item.id, item.subject_person_id, item.data_classification_code, item.status
  loop
    if held.status <> 'suspended' then
      continue;
    end if;

    successor := privacy.live_hold_over(held.subject_person_id, held.data_classification_code);
    if successor is not null and successor <> p_hold_id then
      insert into privacy.hold_applications (legal_hold_id, disposition_item_id)
      values (successor, held.id);
    else
      update privacy.disposition_items as item set status = 'pending' where item.id = held.id;
    end if;
  end loop;
end
$function$;

-- What the person is told about a deletion they asked for: done, waiting, or held — and
-- of a hold, the ground and the end, nothing else (criterion 3).
create or replace function privacy.owner_disposition_state(p_case_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog
as $function$
  select jsonb_build_object(
    'disposition_case_id', dcase.id,
    'status', case
      when bool_or(item.status = 'suspended') then 'suspended'
      when bool_or(item.status = 'pending') then 'pending'
      else 'deleted'
    end,
    'hold', (
      select jsonb_build_object('reason_code', hold.reason_code, 'valid_to', hold.valid_to)
      from privacy.hold_applications as application
      join privacy.disposition_items as held on held.id = application.disposition_item_id
      join privacy.legal_holds as hold on hold.id = application.legal_hold_id
      where held.disposition_case_id = dcase.id and application.status = 'active'
      order by hold.valid_to desc
      limit 1
    )
  )
  from privacy.disposition_cases as dcase
  join privacy.disposition_items as item on item.disposition_case_id = dcase.id
  where dcase.id = p_case_id
  group by dcase.id
$function$;

-- ---------------------------------------------------------------------------
-- The person's own deletion asks first
-- ---------------------------------------------------------------------------

-- It returned the case it closed; it now returns what became of the request, because
-- under a hold nothing closes.
drop function privacy.dispose_on_owner_request(uuid, text, text, uuid);

create function privacy.dispose_on_owner_request(
  p_subject_person_id uuid,
  p_classification text,
  p_target_kind text,
  p_target_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  policy_id uuid;
  case_id uuid;
  item_id uuid;
  hold_id uuid;
begin
  -- Asked again while the first request waits: the same case answers.
  select item.disposition_case_id into case_id
  from privacy.disposition_items as item
  where item.subject_person_id = p_subject_person_id
    and item.status <> 'executed'
    and case p_target_kind
      when 'body_progress' then item.target_body_progress_id = p_target_id
      when 'health_context' then item.target_health_context_id = p_target_id
      when 'nutrition_meal' then item.target_nutrition_meal_id = p_target_id
      else false
    end
  limit 1;
  if case_id is not null then
    return privacy.owner_disposition_state(case_id);
  end if;

  select policy.id into policy_id
  from privacy.retention_policies as policy
  where policy.data_classification_code = p_classification
    and policy.jurisdiction = 'CO'
    and policy.trigger = 'owner_request'
    and policy.default_action = 'delete'
  order by policy.version_number desc
  limit 1;
  if policy_id is null then
    raise exception 'no published policy deletes this data on request' using errcode = '55000';
  end if;

  insert into privacy.disposition_cases (subject_person_id, origin, requested_by_person_id)
  values (p_subject_person_id, 'request', p_subject_person_id)
  returning id into case_id;

  insert into privacy.disposition_items (
    disposition_case_id, subject_person_id, data_classification_code, retention_policy_id,
    action, target_kind, target_body_progress_id, target_health_context_id,
    target_nutrition_meal_id
  ) values (
    case_id, p_subject_person_id, p_classification, policy_id, 'delete', p_target_kind,
    case when p_target_kind = 'body_progress' then p_target_id end,
    case when p_target_kind = 'health_context' then p_target_id end,
    case when p_target_kind = 'nutrition_meal' then p_target_id end
  )
  returning id into item_id;

  perform system.enqueue_outbox_event(
    'disposition_case', case_id, 'privacy.disposition_case_opened.v1',
    jsonb_build_object('disposition_case_id', case_id, 'origin', 'request')
  );

  hold_id := privacy.live_hold_over(p_subject_person_id, p_classification);
  if hold_id is not null then
    update privacy.disposition_items as item set status = 'suspended' where item.id = item_id;
    insert into privacy.hold_applications (legal_hold_id, disposition_item_id)
    values (hold_id, item_id);
    return privacy.owner_disposition_state(case_id);
  end if;

  perform privacy.log_disposition_event(item_id, 'delete', 'deleted', 'owner_request');

  update privacy.disposition_items as item
  set status = 'executed',
      executed_at = clock_timestamp(),
      target_body_progress_id = null,
      target_health_context_id = null,
      target_nutrition_meal_id = null
  where item.id = item_id;

  update privacy.disposition_cases as dcase
  set status = 'closed', closed_at = clock_timestamp()
  where dcase.id = case_id;

  return privacy.owner_disposition_state(case_id);
end
$function$;

-- OP-IDN-007. The body is `20260927070000`'s, deleting only when nothing holds the data.
create or replace function identity.delete_body_progress(
  p_provider text,
  p_issuer text,
  p_subject text,
  p_record_id uuid,
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
  target_id uuid;
  outcome jsonb;
begin
  person := identity.require_space_person(p_provider, p_issuer, p_subject);

  select * into receipt
  from system.begin_idempotency(
    person, 'space'::system.command_surface, 'space',
    'OP-IDN-007', p_idempotency_key, p_command_id, p_request_hash
  );
  if not receipt.claimed then
    if receipt.aggregate_id is null then
      raise exception 'idempotent deletion not found' using errcode = '40001';
    end if;
    -- A retry answers what is true now: deleted, or still held.
    outcome := coalesce(
      privacy.owner_disposition_state(receipt.aggregate_id),
      jsonb_build_object(
        'disposition_case_id', receipt.aggregate_id, 'status', 'deleted', 'hold', null
      )
    );
    return query select jsonb_build_object('body_progress_record_id', p_record_id) || outcome, true;
    return;
  end if;

  -- Someone else's record and a record that does not exist answer the same.
  select record.id into target_id
  from identity.body_progress_records as record
  where record.id = p_record_id and record.person_id = person
  for update;
  if target_id is null then
    raise exception 'measurement not found' using errcode = 'P0002';
  end if;

  outcome := privacy.dispose_on_owner_request(person, 'body', 'body_progress', target_id);
  if outcome->>'status' = 'deleted' then
    delete from identity.body_progress_records as record where record.id = target_id;
  end if;

  perform system.finish_idempotency(
    receipt.receipt_id,
    case when outcome->>'status' = 'deleted' then 200 else 202 end::smallint,
    case when outcome->>'status' = 'deleted'
      then 'body-progress-deleted' else 'body-progress-deletion-held' end,
    'disposition_case', (outcome->>'disposition_case_id')::uuid
  );
  return query select jsonb_build_object('body_progress_record_id', p_record_id) || outcome, false;
end
$function$;

-- OP-IDN-050. The body is `20260927070000`'s, deleting only when nothing holds the data.
create or replace function identity.delete_health_context(
  p_provider text,
  p_issuer text,
  p_subject text,
  p_claim_id uuid,
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
  target_id uuid;
  outcome jsonb;
begin
  person := identity.require_space_person(p_provider, p_issuer, p_subject);

  select * into receipt
  from system.begin_idempotency(
    person, 'space'::system.command_surface, 'space',
    'OP-IDN-050', p_idempotency_key, p_command_id, p_request_hash
  );
  if not receipt.claimed then
    if receipt.aggregate_id is null then
      raise exception 'idempotent deletion not found' using errcode = '40001';
    end if;
    outcome := coalesce(
      privacy.owner_disposition_state(receipt.aggregate_id),
      jsonb_build_object(
        'disposition_case_id', receipt.aggregate_id, 'status', 'deleted', 'hold', null
      )
    );
    return query select jsonb_build_object('health_context_claim_id', p_claim_id) || outcome, true;
    return;
  end if;

  -- Someone else's claim and a claim that does not exist answer the same.
  select claim.id into target_id
  from identity.health_context_claims as claim
  where claim.id = p_claim_id and claim.person_id = person
  for update;
  if target_id is null then
    raise exception 'claim not found' using errcode = 'P0002';
  end if;

  outcome := privacy.dispose_on_owner_request(person, 'health', 'health_context', target_id);
  if outcome->>'status' = 'deleted' then
    delete from identity.health_context_claims as claim where claim.id = target_id;
  end if;

  perform system.finish_idempotency(
    receipt.receipt_id,
    case when outcome->>'status' = 'deleted' then 200 else 202 end::smallint,
    case when outcome->>'status' = 'deleted'
      then 'health-context-deleted' else 'health-context-deletion-held' end,
    'disposition_case', (outcome->>'disposition_case_id')::uuid
  );
  return query select jsonb_build_object('health_context_claim_id', p_claim_id) || outcome, false;
end
$function$;

-- OP-NUT-004. The body is `20261007100000`'s, deleting only when nothing holds the meal.
-- Its receipt now names the case, which says what is true on a retry; older receipts
-- name the meal, and a retry of one still answers that it was deleted.
create or replace function nutrition.delete_meal(
  p_person_id uuid,
  p_meal_id uuid,
  p_idempotency_key uuid,
  p_command_id uuid,
  p_request_hash bytea
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  receipt record;
  meal record;
  outcome jsonb;
begin
  if access_control.actor_kind() <> 'person' or access_control.person() <> p_person_id then
    raise exception 'nutrition person does not match the authenticated actor' using errcode = '42501';
  end if;

  select * into receipt from system.begin_idempotency(
    p_person_id, 'OP-NUT-004', p_idempotency_key, p_command_id, p_request_hash
  );
  if not receipt.claimed then
    outcome := privacy.owner_disposition_state(receipt.aggregate_id);
    return jsonb_build_object(
      'deleted', coalesce(outcome->>'status', 'deleted') = 'deleted',
      'disposed_media_ref', null,
      'hold', coalesce(outcome->'hold', 'null'::jsonb)
    );
  end if;

  select * into meal from nutrition.meals where id = p_meal_id and person_id = p_person_id for update;
  if meal.id is null then
    raise exception 'meal is not this person''s' using errcode = '42501';
  end if;

  outcome := privacy.dispose_on_owner_request(p_person_id, 'nutrition', 'nutrition_meal', meal.id);

  -- Under a legal hold the meal and its photo stay, and nobody is told it was deleted.
  if outcome->>'status' <> 'deleted' then
    perform system.finish_idempotency(
      receipt.receipt_id, 202::smallint, 'meal-deletion-held', 'disposition_case',
      (outcome->>'disposition_case_id')::uuid
    );
    return jsonb_build_object('deleted', false, 'disposed_media_ref', null, 'hold', outcome->'hold');
  end if;

  perform system.enqueue_outbox_event(
    'meal', meal.id, 'nutrition.meal_deleted.v1', jsonb_build_object('meal_id', meal.id)
  );
  if meal.media_ref is not null then
    insert into nutrition.media_disposals (person_id, media_ref) values (p_person_id, meal.media_ref);
  end if;
  -- Items and nutrients go with it: the cascade is the disposition of everything inside.
  delete from nutrition.meals where id = meal.id;

  perform system.finish_idempotency(
    receipt.receipt_id, 200::smallint, 'meal-deleted', 'disposition_case',
    (outcome->>'disposition_case_id')::uuid
  );

  return jsonb_build_object('deleted', true, 'disposed_media_ref', meal.media_ref, 'hold', null);
end
$function$;

-- ---------------------------------------------------------------------------
-- OP-PRV-009 — apply a hold over a person's data
-- ---------------------------------------------------------------------------

create or replace function privacy.legal_hold_projection(p_hold_id uuid)
returns jsonb
language sql
security definer
set search_path = pg_catalog
as $function$
  select jsonb_build_object(
    'id', hold.id,
    'subject_person_id', hold.subject_person_id,
    'data_classification_codes', coalesce(
      (
        select jsonb_agg(category.data_classification_code order by category.data_classification_code)
        from privacy.legal_hold_categories as category
        where category.legal_hold_id = hold.id
      ),
      '[]'::jsonb
    ),
    'scope_description', hold.scope_description,
    'reason_code', hold.reason_code,
    'case_reference', hold.case_reference,
    'valid_from', hold.valid_from,
    'valid_to', hold.valid_to,
    -- An expired hold already holds nothing new, so it reads as lapsed before the sweep.
    'status', case
      when hold.status = 'active' and hold.valid_to <= clock_timestamp() then 'lapsed'
      else hold.status
    end,
    'applied_by_person_id', hold.applied_by_person_id,
    'released_at', hold.released_at,
    'released_by_person_id', hold.released_by_person_id,
    'lapsed_at', hold.lapsed_at,
    'suspended_items', (
      select count(*)::int from privacy.hold_applications as application
      where application.legal_hold_id = hold.id and application.status = 'active'
    ),
    'items', (
      select count(*)::int from privacy.hold_applications as application
      where application.legal_hold_id = hold.id
    )
  )
  from privacy.legal_holds as hold
  where hold.id = p_hold_id
$function$;

drop function privacy.apply_legal_hold(
  uuid, uuid, text, text, text, timestamptz, uuid[], uuid, uuid, bytea
);

create function privacy.apply_legal_hold(
  p_actor_person_id uuid,
  p_actor_session_id uuid,
  p_scope_description text,
  p_reason_code text,
  p_case_reference text,
  p_valid_to timestamptz,
  p_subject_person_id uuid,
  p_data_classification_codes text[],
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
  response jsonb;
  hold_id uuid;
  codes text[];
begin
  perform privacy.require_privacy_request_manager(p_actor_person_id, p_actor_session_id);

  select coalesce(array_agg(distinct code order by code), array[]::text[]) into codes
  from unnest(p_data_classification_codes) as code;
  if cardinality(codes) = 0 then
    raise exception 'a legal hold names the kinds of data it keeps' using errcode = '22023';
  end if;
  if exists (
    select 1 from unnest(codes) as code
    where not exists (
      select 1 from privacy.retention_policies as policy
      where policy.data_classification_code = code
    )
  ) then
    raise exception 'nothing here disposes of that kind of data' using errcode = '22023';
  end if;

  if p_subject_person_id is null or not exists (
    select 1 from identity.people as person where person.id = p_subject_person_id
  ) then
    raise exception 'nobody has that identifier' using errcode = 'P0002';
  end if;

  -- Before the hold exists, so a refusal leaves nothing behind.
  if privacy.asked_to_read_this_person(p_actor_person_id, p_subject_person_id) then
    raise exception 'whoever requested an exceptional read of this person cannot hold their data'
      using errcode = 'AF403';
  end if;

  select * into receipt
  from system.begin_idempotency(
    p_actor_person_id, 'backoffice'::system.command_surface, 'backoffice',
    'OP-PRV-009', p_idempotency_key, p_command_id, p_request_hash
  );
  if not receipt.claimed then
    select privacy.legal_hold_projection(receipt.aggregate_id) into response;
    if response is null then
      raise exception 'idempotent legal hold not found' using errcode = '40001';
    end if;
    return query select response, true;
    return;
  end if;

  insert into privacy.legal_holds (
    scope_description, reason_code, case_reference, valid_to, applied_by_person_id,
    subject_person_id
  ) values (
    p_scope_description, p_reason_code, p_case_reference, p_valid_to, p_actor_person_id,
    p_subject_person_id
  )
  returning id into hold_id;

  insert into privacy.legal_hold_categories (legal_hold_id, data_classification_code)
  select hold_id, code from unnest(codes) as code;

  -- What of it already waits stops now. What another order holds stays with that order.
  with stopped as (
    update privacy.disposition_items as item
    set status = 'suspended'
    where item.subject_person_id = p_subject_person_id
      and item.data_classification_code = any(codes)
      and item.status = 'pending'
    returning item.id
  )
  insert into privacy.hold_applications (legal_hold_id, disposition_item_id)
  select hold_id, stopped.id from stopped;

  -- Identifiers of the hold, never of whose data it protects.
  perform system.enqueue_outbox_event(
    'legal_hold', hold_id, 'privacy.legal_hold_applied.v1',
    jsonb_build_object('legal_hold_id', hold_id, 'reason_code', p_reason_code)
  );

  select privacy.legal_hold_projection(hold_id) into response;

  perform system.finish_idempotency(
    receipt.receipt_id, 201::smallint, 'legal-hold-applied', 'legal_hold', hold_id
  );

  return query select response, false;
end
$function$;

-- ---------------------------------------------------------------------------
-- OP-PRV-010 — release
-- ---------------------------------------------------------------------------

-- `20260927110000`'s, with two changes: the separation check also covers the person a
-- hold names before anything of theirs waits, and what it held may pass to another live
-- hold instead of going back to pending.
create or replace function privacy.release_legal_hold(
  p_actor_person_id uuid,
  p_actor_session_id uuid,
  p_hold_id uuid,
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
  response jsonb;
  hold record;
  subject uuid;
begin
  perform privacy.require_privacy_request_manager(p_actor_person_id, p_actor_session_id);

  select * into hold from privacy.legal_holds as candidate where candidate.id = p_hold_id;
  if hold.id is null then
    raise exception 'legal hold not found' using errcode = 'P0002';
  end if;

  for subject in
    select hold.subject_person_id where hold.subject_person_id is not null
    union
    select item.subject_person_id
    from privacy.hold_applications as application
    join privacy.disposition_items as item on item.id = application.disposition_item_id
    where application.legal_hold_id = p_hold_id
  loop
    if privacy.asked_to_read_this_person(p_actor_person_id, subject) then
      raise exception 'whoever requested an exceptional read of this person cannot release their hold'
        using errcode = 'AF403';
    end if;
  end loop;

  select * into receipt
  from system.begin_idempotency(
    p_actor_person_id, 'backoffice'::system.command_surface, 'backoffice',
    'OP-PRV-010', p_idempotency_key, p_command_id, p_request_hash
  );
  if not receipt.claimed then
    select privacy.legal_hold_projection(receipt.aggregate_id) into response;
    if response is null then
      raise exception 'idempotent legal hold release not found' using errcode = '40001';
    end if;
    return query select response, true;
    return;
  end if;

  if hold.status <> 'active' then
    raise exception 'this hold was already released or lapsed' using errcode = '55000';
  end if;

  update privacy.legal_holds as candidate
  set status = 'released',
      released_at = clock_timestamp(),
      released_by_person_id = p_actor_person_id
  where candidate.id = p_hold_id;

  -- Back to waiting their turn, or held by another order; never executed here.
  perform privacy.settle_hold(p_hold_id);

  perform system.enqueue_outbox_event(
    'legal_hold', p_hold_id, 'privacy.legal_hold_released.v1',
    jsonb_build_object('legal_hold_id', p_hold_id)
  );

  select privacy.legal_hold_projection(p_hold_id) into response;

  perform system.finish_idempotency(
    receipt.receipt_id, 200::smallint, 'legal-hold-released', 'legal_hold', p_hold_id
  );

  return query select response, false;
end
$function$;

-- ---------------------------------------------------------------------------
-- The holds an officer answers for
-- ---------------------------------------------------------------------------

create function privacy.list_legal_holds(
  p_actor_person_id uuid,
  p_actor_session_id uuid,
  p_status text,
  p_limit integer
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  page uuid[];
  more boolean;
begin
  perform privacy.require_privacy_request_manager(p_actor_person_id, p_actor_session_id);

  if p_status is null or p_status not in ('active', 'ended') then
    raise exception 'a hold is either in force or ended' using errcode = '22023';
  end if;
  if p_limit is null or p_limit < 1 or p_limit > 200 then
    raise exception 'a page holds between 1 and 200 holds' using errcode = '22023';
  end if;

  -- In force, the one ending soonest first: it is the one to act on. Ended, the latest
  -- first. An expired hold the sweep has not reached is already ended.
  if p_status = 'active' then
    select coalesce(array_agg(selected.id order by selected.valid_to, selected.id), '{}')
    into page
    from (
      select hold.id, hold.valid_to
      from privacy.legal_holds as hold
      where hold.status = 'active' and hold.valid_to > clock_timestamp()
      order by hold.valid_to, hold.id
      limit p_limit + 1
    ) as selected;
  else
    select coalesce(array_agg(selected.id order by selected.ended_at desc, selected.id desc), '{}')
    into page
    from (
      select hold.id, coalesce(hold.released_at, hold.lapsed_at, hold.valid_to) as ended_at
      from privacy.legal_holds as hold
      where hold.status <> 'active' or hold.valid_to <= clock_timestamp()
      order by coalesce(hold.released_at, hold.lapsed_at, hold.valid_to) desc, hold.id desc
      limit p_limit + 1
    ) as selected;
  end if;

  more := cardinality(page) > p_limit;
  if more then
    page := page[1:p_limit];
  end if;

  -- The read ritual: one record per person a hold names, before anything is returned.
  insert into privacy.access_events (
    actor_person_id, subject_person_id, resource, purpose, result, request_id, access_mode
  )
  select
    p_actor_person_id,
    revealed.subject_person_id,
    'privacy.legal_holds',
    'privacy_request_tracking',
    'allowed',
    coalesce(
      nullif(current_setting('app.request_id', true), '')::uuid,
      extensions.uuid_generate_v7()
    ),
    'support_metadata'
  from (
    select distinct hold.subject_person_id
    from privacy.legal_holds as hold
    where hold.id = any(page) and hold.subject_person_id is not null
  ) as revealed;

  return jsonb_build_object(
    'items', coalesce(
      (
        select jsonb_agg(privacy.legal_hold_projection(held.id) order by held.position)
        from unnest(page) with ordinality as held(id, position)
      ),
      '[]'::jsonb
    ),
    'has_more', more
  );
end
$function$;

-- ---------------------------------------------------------------------------
-- The privacy worker: holds lapse, and what is due is executed
-- ---------------------------------------------------------------------------

create or replace function privacy.lapse_legal_holds()
returns integer
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  ended uuid;
  lapsed integer := 0;
begin
  if access_control.actor_kind() is distinct from 'worker' then
    raise exception 'only the privacy worker lapses holds' using errcode = '42501';
  end if;

  for ended in
    update privacy.legal_holds as hold
    set status = 'lapsed', lapsed_at = clock_timestamp()
    where hold.status = 'active' and hold.valid_to <= clock_timestamp()
    returning hold.id
  loop
    perform privacy.settle_hold(ended);
    perform system.enqueue_outbox_event(
      'legal_hold', ended, 'privacy.legal_hold_lapsed.v1',
      jsonb_build_object('legal_hold_id', ended)
    );
    lapsed := lapsed + 1;
  end loop;

  return lapsed;
end
$function$;

-- True while a pending, due deletion names this meal: the only time the worker reaches it.
create or replace function privacy.meal_disposal_is_due(p_meal_id uuid)
returns boolean
language sql
security definer
set search_path = pg_catalog
as $function$
  select exists (
    select 1
    from privacy.disposition_items as item
    where item.target_nutrition_meal_id = p_meal_id
      and item.status = 'pending'
      and item.action = 'delete'
      and item.due_at <= clock_timestamp()
  )
$function$;

create policy meals_select_worker_disposal on nutrition.meals
  for select to allfit_owner
  using (access_control.actor_kind() = 'worker' and privacy.meal_disposal_is_due(id));

create policy meals_delete_worker_disposal on nutrition.meals
  for delete to allfit_owner
  using (access_control.actor_kind() = 'worker' and privacy.meal_disposal_is_due(id));

-- The photo of exactly that meal, queued as the person's own deletion queues it.
create policy media_disposals_insert_worker_disposal on nutrition.media_disposals
  for insert to allfit_owner
  with check (
    access_control.actor_kind() = 'worker'
    and exists (
      select 1 from nutrition.meals as meal
      where meal.person_id = media_disposals.person_id
        and meal.media_ref = media_disposals.media_ref
        and privacy.meal_disposal_is_due(meal.id)
    )
  );

create or replace function privacy.execute_due_dispositions(p_limit integer)
returns integer
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  due record;
  photo text;
  removed integer;
  executed integer := 0;
begin
  if access_control.actor_kind() is distinct from 'worker' then
    raise exception 'only the privacy worker executes dispositions' using errcode = '42501';
  end if;
  if p_limit is null or p_limit < 1 or p_limit > 500 then
    raise exception 'a sweep executes between 1 and 500 dispositions' using errcode = '22023';
  end if;

  -- Each target goes while its disposition still names it, and is released after.
  set constraints privacy.fk_disposition_items_body_progress,
    privacy.fk_disposition_items_health_context,
    privacy.fk_disposition_items_nutrition_meal deferred;

  for due in
    select item.*
    from privacy.disposition_items as item
    where item.status = 'pending'
      and item.action = 'delete'
      and item.due_at <= clock_timestamp()
    order by item.due_at, item.id
    limit p_limit
    for update skip locked
  loop
    if due.target_kind = 'body_progress' then
      delete from identity.body_progress_records as record
      where record.id = due.target_body_progress_id;
    elsif due.target_kind = 'health_context' then
      delete from identity.health_context_claims as claim
      where claim.id = due.target_health_context_id;
    elsif due.target_kind = 'nutrition_meal' then
      select meal.media_ref into photo
      from nutrition.meals as meal
      where meal.id = due.target_nutrition_meal_id;
      if photo is not null then
        insert into nutrition.media_disposals (person_id, media_ref)
        values (due.subject_person_id, photo);
      end if;
      perform system.enqueue_outbox_event(
        'meal', due.target_nutrition_meal_id, 'nutrition.meal_deleted.v1',
        jsonb_build_object('meal_id', due.target_nutrition_meal_id)
      );
      delete from nutrition.meals as meal where meal.id = due.target_nutrition_meal_id;
    else
      raise exception 'no execution is defined for %', due.target_kind using errcode = '55000';
    end if;

    -- A row the worker could not reach is a failure, never a deletion to record.
    get diagnostics removed = row_count;
    if removed <> 1 then
      raise exception 'disposition % did not reach its target', due.id using errcode = '55000';
    end if;

    perform privacy.log_disposition_event(due.id, due.action, 'deleted', 'privacy_worker');

    update privacy.disposition_items as item
    set status = 'executed',
        executed_at = clock_timestamp(),
        target_body_progress_id = null,
        target_health_context_id = null,
        target_nutrition_meal_id = null
    where item.id = due.id;

    update privacy.disposition_cases as dcase
    set status = 'closed', closed_at = clock_timestamp()
    where dcase.id = due.disposition_case_id
      and dcase.status = 'open'
      and not exists (
        select 1 from privacy.disposition_items as other
        where other.disposition_case_id = dcase.id and other.status <> 'executed'
      );

    executed := executed + 1;
  end loop;

  -- Checked here rather than at commit, so a broken key fails inside the sweep.
  set constraints privacy.fk_disposition_items_body_progress,
    privacy.fk_disposition_items_health_context,
    privacy.fk_disposition_items_nutrition_meal immediate;

  return executed;
end
$function$;

-- ---------------------------------------------------------------------------
-- Ownership and privileges
-- ---------------------------------------------------------------------------

alter function privacy.live_hold_over(uuid, text) owner to allfit_owner;
alter function privacy.settle_hold(uuid) owner to allfit_owner;
alter function privacy.owner_disposition_state(uuid) owner to allfit_owner;
alter function privacy.dispose_on_owner_request(uuid, text, text, uuid) owner to allfit_owner;
alter function privacy.lapse_legal_holds() owner to allfit_owner;
alter function privacy.meal_disposal_is_due(uuid) owner to allfit_owner;
alter function privacy.execute_due_dispositions(integer) owner to allfit_owner;

revoke all on function privacy.live_hold_over(uuid, text) from public;
revoke all on function privacy.settle_hold(uuid) from public;
revoke all on function privacy.owner_disposition_state(uuid) from public;
revoke all on function privacy.dispose_on_owner_request(uuid, text, text, uuid) from public;
revoke all on function privacy.lapse_legal_holds() from public;
revoke all on function privacy.meal_disposal_is_due(uuid) from public;
revoke all on function privacy.execute_due_dispositions(integer) from public;
revoke all on function privacy.apply_legal_hold(
  uuid, uuid, text, text, text, timestamptz, uuid, text[], uuid, uuid, bytea
) from public;
revoke all on function privacy.list_legal_holds(uuid, uuid, text, integer) from public;

-- The runtime runs the commands, the read and the two sweeps; never what is behind them.
grant execute on function privacy.apply_legal_hold(
  uuid, uuid, text, text, text, timestamptz, uuid, text[], uuid, uuid, bytea
) to allfit_api;
grant execute on function privacy.list_legal_holds(uuid, uuid, text, integer) to allfit_api;
grant execute on function privacy.lapse_legal_holds() to allfit_api;
grant execute on function privacy.execute_due_dispositions(integer) to allfit_api;
