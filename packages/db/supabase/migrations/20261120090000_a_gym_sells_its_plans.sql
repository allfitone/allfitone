-- A gym sells its plans — `OP-PAY-002..006`, `HU-STUDIO-074..077`, `ADR-048`.
--
-- The tables have existed since `20261012130000`; until now nothing could write them but a
-- test. Four commands and one read give the owner and the admin a way to name a plan,
-- price it, change the price and take it off sale, and the whole team a way to read it.
--
-- **One price on sale per plan.** That was the owner's decision on 9 November 2026: a
-- client of the gym chooses between plans, never between two prices of the same plan.
-- Publishing therefore retires the version on sale in the same transaction, and a partial
-- unique index makes a second live version impossible to write by any path. Whoever pays
-- the old price keeps it — a version never moves, and `plan_subscriptions` already refuses
-- to walk a subscription onto another one.
--
-- **How a plan is delivered is part of its price.** `delivery_mode` says whether the plan
-- is followed in person or at a distance, and it is frozen with the rest of the version:
-- the App Store rule that decides where it may be paid (`ADR-048`, Apple 3.1.3) cannot
-- change under somebody who already paid it. A remote plan is paid through the link the
-- gym sends; Space neither lists it nor subscribes to it (next migration).
--
-- **Pesos, whole.** Mercado Pago Colombia charges in COP, so the commands accept nothing
-- else, and an amount with centavos is refused. The table keeps its ISO check: the rule is
-- about what can be charged today, not about what a price is.
--
-- **A name is the gym's to change.** A published plan can be renamed, and its subscribers
-- read the new name — the owner's decision, against the recommendation to freeze it.
--
-- **Retiring names a version.** If somebody published a new price a moment earlier,
-- retiring the old one converges and leaves the new one on sale, instead of silently
-- taking the plan off sale.
--
-- **The race with a subscription.** Retiring takes an exclusive advisory lock on the
-- version, and subscribing takes a shared one before it reads the offer. A price whose
-- retirement committed first is not sold; one being sold when the retirement arrives is
-- sold, and then retired. A row lock cannot do this: `for share` needs the update policy,
-- which a client does not pass, so every subscription would read nothing.

set lock_timeout = '5s';
set statement_timeout = '60s';

-- ---------------------------------------------------------------------------
-- How a version is delivered, and one on sale per plan
-- ---------------------------------------------------------------------------

-- The default only fills the rows written before this column existed. The command passes
-- the mode explicitly, every time.
alter table payments.plan_versions
  add column delivery_mode text not null default 'in_person',
  add constraint ck_plan_versions_delivery_mode check (delivery_mode in ('in_person', 'remote'));

create unique index uidx_plan_versions_live
  on payments.plan_versions (plan_id)
  where status = 'published';

create or replace function payments.plan_version_guard_tg()
returns trigger
language plpgsql
set search_path = pg_catalog
as $function$
begin
  if tg_op = 'DELETE' then
    raise exception 'a published plan version is never deleted' using errcode = '55000';
  end if;
  if new.id is distinct from old.id
     or new.plan_id is distinct from old.plan_id
     or new.organization_id is distinct from old.organization_id
     or new.version_number is distinct from old.version_number
     or new.amount_minor is distinct from old.amount_minor
     or new.currency_code is distinct from old.currency_code
     or new.billing_period is distinct from old.billing_period
     or new.delivery_mode is distinct from old.delivery_mode
     or new.published_at is distinct from old.published_at then
    raise exception 'a published plan version is never edited; publish another one'
      using errcode = '55000';
  end if;
  -- Retiring is the one change allowed, and only once and only forwards. A version that
  -- came back would change what a live subscription is pointing at.
  if old.deprecated_at is not null and new.deprecated_at is distinct from old.deprecated_at then
    raise exception 'a retired plan version does not come back' using errcode = '55000';
  end if;
  if old.status = 'deprecated' and new.status is distinct from old.status then
    raise exception 'a retired plan version stays retired' using errcode = '55000';
  end if;
  return new;
end
$function$;

-- ---------------------------------------------------------------------------
-- What every command answers
-- ---------------------------------------------------------------------------

/*
 * The plan as the team sees it: its name, whether it is on sale, the price on sale and
 * every price it ever had. Invoker rights on purpose — it runs inside the closed functions
 * as `allfit_owner`, so the row policies still decide what is visible.
 */
create or replace function payments.organization_plan_projection(p_plan_id uuid)
returns jsonb
language sql
stable
set search_path = pg_catalog
as $function$
  with versions as (
    select version.version_number,
           version.status,
           jsonb_build_object(
             'plan_version_id', version.id,
             'version_number', version.version_number,
             'amount_minor', version.amount_minor,
             'currency_code', version.currency_code,
             'billing_period', version.billing_period,
             'delivery_mode', version.delivery_mode,
             'status', version.status::text,
             'published_at', version.published_at,
             'deprecated_at', version.deprecated_at
           ) as document
    from payments.plan_versions as version
    where version.plan_id = p_plan_id
  )
  select jsonb_build_object(
    'plan_id', organization_plan.id,
    'name', organization_plan.name,
    'status', organization_plan.status::text,
    'on_sale', exists (select 1 from versions where versions.status = 'published'),
    'created_at', organization_plan.created_at,
    'current_version', coalesce(
      (select versions.document from versions where versions.status = 'published'),
      'null'::jsonb
    ),
    'versions', coalesce(
      (select jsonb_agg(versions.document order by versions.version_number desc)
       from versions),
      '[]'::jsonb
    )
  )
  from payments.organization_plans as organization_plan
  where organization_plan.id = p_plan_id
$function$;

/*
 * The acting person, in this organization, with `manage_billing`. Forbidden rather than
 * not found: the whole team reads the plans, so refusing a coach reveals nothing.
 */
create or replace function payments.require_plan_manager(
  p_actor_person_id uuid,
  p_organization_id uuid
)
returns void
language plpgsql
set search_path = pg_catalog
as $function$
begin
  if access_control.actor_kind() <> 'person'
     or access_control.person() is distinct from p_actor_person_id then
    raise exception 'person actor mismatch' using errcode = '42501';
  end if;

  perform set_config('app.actor_org_id', p_organization_id::text, true);

  if not access_control.has_capability(p_organization_id, 'manage_billing') then
    raise exception 'managing plans needs manage_billing' using errcode = '42501';
  end if;
end
$function$;

-- ---------------------------------------------------------------------------
-- Creating and renaming — `OP-PAY-002`, `OP-PAY-003`
-- ---------------------------------------------------------------------------

/*
 * A draft with a name and no price. A taken name — compared without case — is the unique
 * index's answer, which the API reports as a conflict.
 */
create or replace function payments.create_organization_plan(
  p_actor_person_id uuid,
  p_organization_id uuid,
  p_name text,
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
  clean_name text := btrim(p_name);
  new_plan_id uuid;
begin
  perform payments.require_plan_manager(p_actor_person_id, p_organization_id);

  if coalesce(clean_name, '') = '' or char_length(clean_name) > 80 then
    raise exception 'a plan needs a name of one to eighty characters' using errcode = '22023';
  end if;

  select * into receipt
  from system.begin_idempotency(
    p_actor_person_id, 'OP-PAY-002', p_idempotency_key, p_command_id, p_request_hash
  );
  if not receipt.claimed then
    if receipt.aggregate_id is null then
      raise exception 'idempotent plan creation not found' using errcode = '40001';
    end if;
    return query select payments.organization_plan_projection(receipt.aggregate_id), true;
    return;
  end if;

  insert into payments.organization_plans (organization_id, name)
  values (p_organization_id, clean_name)
  returning id into new_plan_id;

  perform system.finish_idempotency(
    receipt.receipt_id, 201::smallint, 'organization-plan-created',
    'organization_plan', new_plan_id
  );
  return query select payments.organization_plan_projection(new_plan_id), false;
end
$function$;

-- A draft or a plan on sale alike. The same name converges, so a retry is never a conflict.
create or replace function payments.rename_organization_plan(
  p_actor_person_id uuid,
  p_organization_id uuid,
  p_plan_id uuid,
  p_name text,
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
  clean_name text := btrim(p_name);
  current_name text;
begin
  perform payments.require_plan_manager(p_actor_person_id, p_organization_id);

  if coalesce(clean_name, '') = '' or char_length(clean_name) > 80 then
    raise exception 'a plan needs a name of one to eighty characters' using errcode = '22023';
  end if;

  select organization_plan.name into current_name
  from payments.organization_plans as organization_plan
  where organization_plan.id = p_plan_id
    and organization_plan.organization_id = p_organization_id
  for update;

  if current_name is null then
    raise exception 'plan not found' using errcode = 'P0002';
  end if;

  select * into receipt
  from system.begin_idempotency(
    p_actor_person_id, 'OP-PAY-003', p_idempotency_key, p_command_id, p_request_hash
  );
  if not receipt.claimed then
    return query select payments.organization_plan_projection(p_plan_id), true;
    return;
  end if;

  if current_name is distinct from clean_name then
    update payments.organization_plans
    set name = clean_name
    where id = p_plan_id;
  end if;

  perform system.finish_idempotency(
    receipt.receipt_id, 200::smallint,
    case when current_name is distinct from clean_name
      then 'organization-plan-renamed' else 'organization-plan-name-unchanged' end,
    'organization_plan', p_plan_id
  );
  return query select payments.organization_plan_projection(p_plan_id), false;
end
$function$;

-- ---------------------------------------------------------------------------
-- Pricing and taking off sale — `OP-PAY-004`, `OP-PAY-005`
-- ---------------------------------------------------------------------------

/*
 * The new price replaces the one on sale. The plan row is locked first, which serialises
 * the numbering and the replacement against another publication or a retirement.
 *
 * `created` is false when the price on sale already says exactly this: publishing it again
 * under a new key changes nothing rather than burning a version number.
 */
create or replace function payments.publish_plan_version(
  p_actor_person_id uuid,
  p_organization_id uuid,
  p_plan_id uuid,
  p_amount_minor bigint,
  p_currency_code text,
  p_billing_period text,
  p_delivery_mode text,
  p_idempotency_key uuid,
  p_command_id uuid,
  p_request_hash bytea
)
returns table (result jsonb, created boolean, replayed boolean)
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  receipt record;
  locked_plan_id uuid;
  live record;
  next_number integer;
begin
  perform payments.require_plan_manager(p_actor_person_id, p_organization_id);

  if p_amount_minor is null
     or p_amount_minor <= 0
     or p_amount_minor > 100000000000
     or p_amount_minor % 100 <> 0
     or p_currency_code is distinct from 'COP'
     or coalesce(p_billing_period, '') not in ('month', 'year')
     or coalesce(p_delivery_mode, '') not in ('in_person', 'remote') then
    raise exception 'a price is whole pesos, monthly or yearly, in person or remote'
      using errcode = '22023';
  end if;

  select organization_plan.id into locked_plan_id
  from payments.organization_plans as organization_plan
  where organization_plan.id = p_plan_id
    and organization_plan.organization_id = p_organization_id
  for update;

  if locked_plan_id is null then
    raise exception 'plan not found' using errcode = 'P0002';
  end if;

  select * into receipt
  from system.begin_idempotency(
    p_actor_person_id, 'OP-PAY-004', p_idempotency_key, p_command_id, p_request_hash
  );
  -- A replay answers as the first call did: 201 if it published, 200 if it converged.
  if not receipt.claimed then
    return query
    select payments.organization_plan_projection(p_plan_id),
           stored.outcome_code = 'plan-version-published',
           true
    from system.idempotency_keys as stored
    where stored.id = receipt.receipt_id;
    return;
  end if;

  select version.id, version.amount_minor, version.currency_code, version.billing_period,
         version.delivery_mode
    into live
  from payments.plan_versions as version
  where version.plan_id = p_plan_id
    and version.status = 'published';

  if live.id is not null
     and live.amount_minor = p_amount_minor
     and live.currency_code = p_currency_code
     and live.billing_period = p_billing_period
     and live.delivery_mode = p_delivery_mode then
    perform system.finish_idempotency(
      receipt.receipt_id, 200::smallint, 'plan-version-unchanged',
      'organization_plan', p_plan_id
    );
    return query select payments.organization_plan_projection(p_plan_id), false, false;
    return;
  end if;

  if live.id is not null then
    perform pg_advisory_xact_lock(
      hashtextextended('payments.plan_version:' || live.id::text, 0)
    );
    update payments.plan_versions
    set status = 'deprecated',
        deprecated_at = clock_timestamp()
    where id = live.id;
  end if;

  select coalesce(max(version.version_number), 0) + 1 into next_number
  from payments.plan_versions as version
  where version.plan_id = p_plan_id;

  insert into payments.plan_versions (
    plan_id, organization_id, version_number, amount_minor, currency_code,
    billing_period, delivery_mode
  )
  values (
    p_plan_id, p_organization_id, next_number, p_amount_minor, p_currency_code,
    p_billing_period, p_delivery_mode
  );

  update payments.organization_plans
  set status = 'published'
  where id = p_plan_id
    and status = 'draft';

  perform system.finish_idempotency(
    receipt.receipt_id, 201::smallint, 'plan-version-published',
    'organization_plan', p_plan_id
  );
  return query select payments.organization_plan_projection(p_plan_id), true, false;
end
$function$;

/*
 * Stops new subscriptions to one version and touches nothing else: no subscription is
 * cancelled, suspended or moved. Retiring a version already retired converges.
 */
create or replace function payments.deprecate_plan_version(
  p_actor_person_id uuid,
  p_organization_id uuid,
  p_plan_id uuid,
  p_plan_version_id uuid,
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
  target record;
begin
  perform payments.require_plan_manager(p_actor_person_id, p_organization_id);

  perform 1
  from payments.organization_plans as organization_plan
  where organization_plan.id = p_plan_id
    and organization_plan.organization_id = p_organization_id
  for update;

  select version.id, version.status into target
  from payments.plan_versions as version
  where version.id = p_plan_version_id
    and version.plan_id = p_plan_id
    and version.organization_id = p_organization_id;

  if target.id is null then
    raise exception 'plan version not found' using errcode = 'P0002';
  end if;

  select * into receipt
  from system.begin_idempotency(
    p_actor_person_id, 'OP-PAY-005', p_idempotency_key, p_command_id, p_request_hash
  );
  if not receipt.claimed then
    return query select payments.organization_plan_projection(p_plan_id), true;
    return;
  end if;

  if target.status = 'published' then
    perform pg_advisory_xact_lock(
      hashtextextended('payments.plan_version:' || target.id::text, 0)
    );
    update payments.plan_versions
    set status = 'deprecated',
        deprecated_at = clock_timestamp()
    where id = target.id;
  end if;

  perform system.finish_idempotency(
    receipt.receipt_id, 200::smallint,
    case when target.status = 'published'
      then 'plan-version-retired' else 'plan-version-already-retired' end,
    'organization_plan', p_plan_id
  );
  return query select payments.organization_plan_projection(p_plan_id), false;
end
$function$;

-- ---------------------------------------------------------------------------
-- The team reads the plans — `OP-PAY-006`
-- ---------------------------------------------------------------------------

/*
 * Every member reads every plan of the gym, drafts included: a price is nobody's personal
 * data. What is on sale comes first, then by name; the cursor is that triple.
 */
create or replace function payments.list_organization_plans_for_team(
  p_actor_person_id uuid,
  p_organization_id uuid,
  p_limit integer,
  p_cursor_status text,
  p_cursor_name text,
  p_cursor_plan_id uuid
)
returns table (plan_id uuid, status text, name text, plan jsonb)
language plpgsql
security definer
set search_path = pg_catalog
as $function$
begin
  if access_control.actor_kind() <> 'person'
     or access_control.person() is distinct from p_actor_person_id then
    raise exception 'person actor mismatch' using errcode = '42501';
  end if;

  perform set_config('app.actor_org_id', p_organization_id::text, true);

  if not access_control.has_membership(p_organization_id) then
    raise exception 'reading plans needs a membership' using errcode = '42501';
  end if;

  if p_limit is null or p_limit not between 1 and 101 then
    raise exception 'invalid page limit' using errcode = '22023';
  end if;

  if num_nulls(p_cursor_status, p_cursor_name, p_cursor_plan_id) not in (0, 3)
     or coalesce(p_cursor_status, 'draft') not in ('draft', 'published') then
    raise exception 'invalid plan cursor' using errcode = '22023';
  end if;

  return query
  select listed.id,
         listed.status::text,
         listed.name,
         payments.organization_plan_projection(listed.id)
  from payments.organization_plans as listed
  where listed.organization_id = p_organization_id
    and (
      p_cursor_status is null
      or (case when listed.status = 'published' then 0 else 1 end, lower(listed.name), listed.id)
         > (case when p_cursor_status = 'published' then 0 else 1 end,
            lower(p_cursor_name), p_cursor_plan_id)
    )
  order by case when listed.status = 'published' then 0 else 1 end,
           lower(listed.name),
           listed.id
  limit p_limit;
end
$function$;

-- ---------------------------------------------------------------------------
-- Ownership and grants
-- ---------------------------------------------------------------------------

alter function payments.organization_plan_projection(uuid) owner to allfit_owner;
alter function payments.require_plan_manager(uuid, uuid) owner to allfit_owner;
alter function payments.create_organization_plan(uuid, uuid, text, uuid, uuid, bytea)
  owner to allfit_owner;
alter function payments.rename_organization_plan(uuid, uuid, uuid, text, uuid, uuid, bytea)
  owner to allfit_owner;
alter function payments.publish_plan_version(
  uuid, uuid, uuid, bigint, text, text, text, uuid, uuid, bytea
) owner to allfit_owner;
alter function payments.deprecate_plan_version(uuid, uuid, uuid, uuid, uuid, uuid, bytea)
  owner to allfit_owner;
alter function payments.list_organization_plans_for_team(
  uuid, uuid, integer, text, text, uuid
) owner to allfit_owner;

revoke all on function payments.organization_plan_projection(uuid) from public, allfit_api;
revoke all on function payments.require_plan_manager(uuid, uuid) from public, allfit_api;
revoke all on function payments.create_organization_plan(uuid, uuid, text, uuid, uuid, bytea)
  from public;
revoke all on function payments.rename_organization_plan(uuid, uuid, uuid, text, uuid, uuid, bytea)
  from public;
revoke all on function payments.publish_plan_version(
  uuid, uuid, uuid, bigint, text, text, text, uuid, uuid, bytea
) from public;
revoke all on function payments.deprecate_plan_version(uuid, uuid, uuid, uuid, uuid, uuid, bytea)
  from public;
revoke all on function payments.list_organization_plans_for_team(
  uuid, uuid, integer, text, text, uuid
) from public;

-- The five operations and nothing else: the projection and the capability check are
-- only ever reached through them.
grant execute on function payments.create_organization_plan(uuid, uuid, text, uuid, uuid, bytea)
  to allfit_api;
grant execute on function payments.rename_organization_plan(
  uuid, uuid, uuid, text, uuid, uuid, bytea
) to allfit_api;
grant execute on function payments.publish_plan_version(
  uuid, uuid, uuid, bigint, text, text, text, uuid, uuid, bytea
) to allfit_api;
grant execute on function payments.deprecate_plan_version(
  uuid, uuid, uuid, uuid, uuid, uuid, bytea
) to allfit_api;
grant execute on function payments.list_organization_plans_for_team(
  uuid, uuid, integer, text, text, uuid
) to allfit_api;
