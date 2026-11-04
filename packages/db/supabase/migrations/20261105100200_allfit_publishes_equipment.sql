-- Allfit publishes equipment and says which a movement uses — `HU-BO-022`, over
-- `OP-CAT-004`, `OP-CAT-005` and the new `OP-CAT-016`.
--
-- `catalog.equipment` and `catalog.movement_equipment` exist (`20260913182700`) and
-- `/catalog/v1/equipment` serves them, but nothing could put a row in them. The list a
-- person filters movements by stayed empty, and `20260927030000` declared equipment
-- "not modelled" because, when it was written, it was not.
--
-- **The same rules as the rest of the catalogue.** Only `curate_global_catalog` with
-- AAL2 publishes, a published code is stable, an archived code returns only under the
-- name it had, and a global row is archived, never deleted.
--
-- **A movement names only published equipment, as a whole list.** `OP-CAT-016` replaces
-- the global movement's list in one command, so what the curator sees is exactly what is
-- stored. A code nobody published, or one archived, is refused rather than linked to
-- nothing. Archiving equipment keeps the links that already used it: the product reads
-- answer only what is published, so it leaves search at once and comes back with them.
--
-- **The policies are the platform's alone.** A support actor writes global equipment and
-- the links of global movements; a person acting for a gym writes neither, and no row of
-- a gym is reachable through them. The commands check the curator duty on top.
--
-- No access record is written: the catalogue is not anyone's data.

set lock_timeout = '5s';
set statement_timeout = '60s';

-- ---------------------------------------------------------------------------
-- Invariants and policies
-- ---------------------------------------------------------------------------

create trigger trg_equipment_before_delete_global
before delete on catalog.equipment
for each row execute function catalog.reject_global_catalog_deletion();

create policy equipment_all_platform
  on catalog.equipment
  for all to allfit_owner
  using (
    content_scope = 'global'::catalog.content_scope
    and access_control.actor_kind() = 'support'::identity.actor_kind
  )
  with check (
    content_scope = 'global'::catalog.content_scope
    and owner_organization_id is null
    and access_control.actor_kind() = 'support'::identity.actor_kind
  );

create policy movement_equipment_all_platform
  on catalog.movement_equipment
  for all to allfit_owner
  using (
    access_control.actor_kind() = 'support'::identity.actor_kind
    and exists (
      select 1 from catalog.movements as movement
      where movement.id = movement_id and movement.content_scope = 'global'
    )
  )
  with check (
    access_control.actor_kind() = 'support'::identity.actor_kind
    and exists (
      select 1 from catalog.movements as movement
      where movement.id = movement_id and movement.content_scope = 'global'
    )
    and exists (
      select 1 from catalog.equipment as item
      where item.id = equipment_id and item.content_scope = 'global'
    )
  );

-- ---------------------------------------------------------------------------
-- Projections
-- ---------------------------------------------------------------------------

create or replace function catalog.global_catalog_equipment_projection(p_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog
as $function$
  select jsonb_build_object(
    'id', item.id,
    'code', item.code,
    'name', item.name,
    'status', item.status::text,
    'created_at', item.created_at,
    'in_use_count', (
      select count(*) from catalog.movement_equipment as link where link.equipment_id = item.id
    )::integer
  )
  from catalog.equipment as item
  where item.id = p_id and item.content_scope = 'global'
$function$;

-- The movement branch now says what it uses; the rest is as `20260927030000` left it.
create or replace function catalog.global_catalog_entry_projection(p_kind text, p_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog
as $function$
  select case p_kind
    when 'discipline' then (
      select jsonb_build_object(
        'kind', 'discipline',
        'id', discipline.id,
        'code', discipline.code,
        'discipline_code', discipline.code,
        'name', discipline.name,
        'status', discipline.status::text,
        'created_at', discipline.created_at,
        'in_use_count', (
          (select count(*) from catalog.activity_types as activity
            where activity.discipline_code = discipline.code)
          + (select count(*) from catalog.movements as movement
              where movement.discipline_code = discipline.code)
          + (select count(*) from planning.session_templates as template
              where template.discipline_code = discipline.code)
        )::integer
      )
      from catalog.disciplines as discipline
      where discipline.id = p_id
    )
    when 'activity_type' then (
      select jsonb_build_object(
        'kind', 'activity_type',
        'id', activity.id,
        'code', activity.code,
        'discipline_code', activity.discipline_code,
        'name', activity.name,
        'status', activity.status::text,
        'created_at', activity.created_at,
        'in_use_count', (
          (select count(*) from planning.planned_steps as step
            where step.activity_type_id = activity.id)
          + (select count(*) from planning.session_template_versions as version
              where version.activity_type_id = activity.id)
          + (select count(*) from catalog.activity_type_result_contracts as contract
              where contract.activity_type_id = activity.id)
        )::integer
      )
      from catalog.activity_types as activity
      where activity.id = p_id and activity.content_scope = 'global'
    )
    when 'movement' then (
      select jsonb_build_object(
        'kind', 'movement',
        'id', movement.id,
        'code', null::text,
        'discipline_code', movement.discipline_code,
        'name', movement.name,
        'status', movement.status::text,
        'created_at', movement.created_at,
        'in_use_count', (
          select count(*) from planning.planned_steps as step where step.movement_id = movement.id
        )::integer,
        'equipment', coalesce((
          select jsonb_agg(
            jsonb_build_object(
              'code', item.code, 'name', item.name, 'requirement', link.requirement
            )
            order by link.requirement desc, item.name, item.code
          )
          from catalog.movement_equipment as link
          join catalog.equipment as item on item.id = link.equipment_id
          where link.movement_id = movement.id
        ), '[]'::jsonb)
      )
      from catalog.movements as movement
      where movement.id = p_id and movement.content_scope = 'global'
    )
  end
$function$;

create or replace function catalog.list_global_catalog(
  p_actor_person_id uuid,
  p_actor_session_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $function$
begin
  perform catalog.require_global_catalog_curator(p_actor_person_id, p_actor_session_id);

  return jsonb_build_object(
    'disciplines', coalesce((
      select jsonb_agg(catalog.global_catalog_entry_projection('discipline', discipline.id)
        order by discipline.code)
      from catalog.disciplines as discipline
    ), '[]'::jsonb),
    'activity_types', coalesce((
      select jsonb_agg(catalog.global_catalog_entry_projection('activity_type', activity.id)
        order by activity.discipline_code, activity.code)
      from catalog.activity_types as activity
      where activity.content_scope = 'global'
    ), '[]'::jsonb),
    'movements', coalesce((
      select jsonb_agg(catalog.global_catalog_entry_projection('movement', movement.id)
        order by movement.discipline_code, movement.normalized_name)
      from catalog.movements as movement
      where movement.content_scope = 'global'
    ), '[]'::jsonb),
    'equipment', coalesce((
      select jsonb_agg(catalog.global_catalog_equipment_projection(item.id)
        order by item.display_order, item.code)
      from catalog.equipment as item
      where item.content_scope = 'global'
    ), '[]'::jsonb),
    -- Kept for the screens already deployed, which read it; it is no longer absent.
    'equipment_availability', 'available'
  );
end
$function$;

-- ---------------------------------------------------------------------------
-- OP-CAT-004 — publish equipment
-- ---------------------------------------------------------------------------

create or replace function catalog.publish_global_equipment(
  p_actor_person_id uuid,
  p_actor_session_id uuid,
  p_code text,
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
  response jsonb;
  target catalog.equipment%rowtype;
  clean_name text := btrim(coalesce(p_name, ''));
  entry_id uuid;
begin
  perform catalog.require_global_catalog_curator(p_actor_person_id, p_actor_session_id);
  if coalesce(p_code, '') !~ '^[a-z][a-z0-9_]{1,63}$'
     or clean_name = ''
     or char_length(clean_name) > 120 then
    raise exception 'a catalogue entry needs a stable code and a name' using errcode = '22023';
  end if;

  select * into receipt
  from system.begin_idempotency(
    p_actor_person_id, 'backoffice'::system.command_surface, 'backoffice',
    'OP-CAT-004', p_idempotency_key, p_command_id, p_request_hash
  );
  if not receipt.claimed then
    response := catalog.global_catalog_equipment_projection(receipt.aggregate_id);
    if response is null then
      raise exception 'idempotent equipment publication not found' using errcode = '40001';
    end if;
    return query select response, true;
    return;
  end if;

  select * into target
  from catalog.equipment as item
  where item.code = p_code and item.content_scope = 'global'
  for update;

  if target.id is null then
    insert into catalog.equipment (code, name, content_scope, status)
    values (p_code, clean_name, 'global', 'published')
    returning id into entry_id;
  elsif target.status = 'published' then
    raise exception 'that equipment is already published' using errcode = '55000';
  elsif target.name is distinct from clean_name then
    -- A code is stable and never becomes another thing.
    raise exception 'that code already names something else' using errcode = '55000';
  else
    update catalog.equipment as item
    set status = 'published'
    where item.id = target.id;
    entry_id := target.id;
  end if;

  perform system.finish_idempotency(
    receipt.receipt_id, 200::smallint, 'equipment-published', 'catalog_equipment', entry_id
  );
  return query select catalog.global_catalog_equipment_projection(entry_id), false;
end
$function$;

-- ---------------------------------------------------------------------------
-- OP-CAT-005 — archive equipment
-- ---------------------------------------------------------------------------

create or replace function catalog.archive_global_equipment(
  p_actor_person_id uuid,
  p_actor_session_id uuid,
  p_code text,
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
  target catalog.equipment%rowtype;
begin
  perform catalog.require_global_catalog_curator(p_actor_person_id, p_actor_session_id);

  select * into receipt
  from system.begin_idempotency(
    p_actor_person_id, 'backoffice'::system.command_surface, 'backoffice',
    'OP-CAT-005', p_idempotency_key, p_command_id, p_request_hash
  );
  if not receipt.claimed then
    response := catalog.global_catalog_equipment_projection(receipt.aggregate_id);
    if response is null then
      raise exception 'idempotent equipment archival not found' using errcode = '40001';
    end if;
    return query select response, true;
    return;
  end if;

  select * into target
  from catalog.equipment as item
  where item.code = p_code and item.content_scope = 'global'
  for update;
  if target.id is null then
    raise exception 'global equipment not found' using errcode = 'P0002';
  end if;
  if target.status <> 'published' then
    raise exception 'only published equipment is archived' using errcode = '55000';
  end if;

  update catalog.equipment as item
  set status = 'archived'
  where item.id = target.id;

  perform system.finish_idempotency(
    receipt.receipt_id, 200::smallint, 'equipment-archived', 'catalog_equipment', target.id
  );
  return query select catalog.global_catalog_equipment_projection(target.id), false;
end
$function$;

-- ---------------------------------------------------------------------------
-- OP-CAT-016 — what a global movement uses
-- ---------------------------------------------------------------------------

create or replace function catalog.set_global_movement_equipment(
  p_actor_person_id uuid,
  p_actor_session_id uuid,
  p_movement_id uuid,
  p_items jsonb,
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
  target catalog.movements%rowtype;
  wanted integer;
  found integer;
begin
  perform catalog.require_global_catalog_curator(p_actor_person_id, p_actor_session_id);
  if p_items is null
     or jsonb_typeof(p_items) <> 'array'
     or jsonb_array_length(p_items) > 30
     or exists (
       select 1
       from jsonb_array_elements(p_items) as item
       where jsonb_typeof(item) <> 'object'
          or coalesce(item->>'code', '') !~ '^[a-z][a-z0-9_]{1,63}$'
          or coalesce(item->>'requirement', '') not in ('required', 'optional')
     )
     or (select count(distinct item->>'code') from jsonb_array_elements(p_items) as item)
        <> jsonb_array_length(p_items) then
    raise exception 'a movement names each equipment once, required or optional'
      using errcode = '22023';
  end if;

  select * into receipt
  from system.begin_idempotency(
    p_actor_person_id, 'backoffice'::system.command_surface, 'backoffice',
    'OP-CAT-016', p_idempotency_key, p_command_id, p_request_hash
  );
  if not receipt.claimed then
    response := catalog.global_catalog_entry_projection('movement', receipt.aggregate_id);
    if response is null then
      raise exception 'idempotent movement equipment not found' using errcode = '40001';
    end if;
    return query select response, true;
    return;
  end if;

  select * into target
  from catalog.movements as movement
  where movement.id = p_movement_id and movement.content_scope = 'global'
  for update;
  if target.id is null then
    raise exception 'global movement not found' using errcode = 'P0002';
  end if;
  if target.status <> 'published' then
    raise exception 'only a published movement says what it uses' using errcode = '55000';
  end if;

  wanted := jsonb_array_length(p_items);
  select count(*)::integer into found
  from jsonb_array_elements(p_items) as item
  join catalog.equipment as equipment
    on equipment.code = item->>'code'
   and equipment.content_scope = 'global'
   and equipment.status = 'published';
  if found <> wanted then
    raise exception 'a movement names only published equipment' using errcode = '22023';
  end if;

  delete from catalog.movement_equipment as link where link.movement_id = target.id;
  insert into catalog.movement_equipment (movement_id, equipment_id, requirement)
  select target.id, equipment.id, item->>'requirement'
  from jsonb_array_elements(p_items) as item
  join catalog.equipment as equipment
    on equipment.code = item->>'code'
   and equipment.content_scope = 'global';

  perform system.finish_idempotency(
    receipt.receipt_id, 200::smallint, 'movement-equipment-set', 'catalog_movement', target.id
  );
  return query select catalog.global_catalog_entry_projection('movement', target.id), false;
end
$function$;

-- ---------------------------------------------------------------------------
-- Ownership and grants
-- ---------------------------------------------------------------------------

alter function catalog.global_catalog_equipment_projection(uuid) owner to allfit_owner;
alter function catalog.publish_global_equipment(uuid, uuid, text, text, uuid, uuid, bytea)
  owner to allfit_owner;
alter function catalog.archive_global_equipment(uuid, uuid, text, uuid, uuid, bytea)
  owner to allfit_owner;
alter function catalog.set_global_movement_equipment(uuid, uuid, uuid, jsonb, uuid, uuid, bytea)
  owner to allfit_owner;

revoke all on function catalog.global_catalog_equipment_projection(uuid) from public, allfit_api;
revoke all on function catalog.publish_global_equipment(uuid, uuid, text, text, uuid, uuid, bytea)
  from public;
revoke all on function catalog.archive_global_equipment(uuid, uuid, text, uuid, uuid, bytea)
  from public;
revoke all on function catalog.set_global_movement_equipment(
  uuid, uuid, uuid, jsonb, uuid, uuid, bytea
) from public;

grant execute on function catalog.publish_global_equipment(
  uuid, uuid, text, text, uuid, uuid, bytea
) to allfit_api;
grant execute on function catalog.archive_global_equipment(uuid, uuid, text, uuid, uuid, bytea)
  to allfit_api;
grant execute on function catalog.set_global_movement_equipment(
  uuid, uuid, uuid, jsonb, uuid, uuid, bytea
) to allfit_api;
