-- A gym names its own movements (HU-STUDIO-064..067, OP-CAT-001/002/003/009/010,
-- STUDIO-57..60).
--
-- **The table was ready; nothing could write it.** `catalog.movements` has carried an
-- `organization` scope and a per-organization unique name since the content slice, and
-- planning already accepts an organization's published movements in its templates. What
-- was missing is the five commands, and three rules the docs state without a model.
--
-- **"Updating it does not reinterpret history" is a freeze.** Published versions and
-- executed sessions keep only `movement_id`, so renaming a movement would rename the
-- past. The product decision (2026-11-06) is to freeze what has been used: once a
-- published version holds it, the discipline is fixed and the name may change only in
-- case and spacing — anything that keeps `normalized_name`. A trigger enforces it, so it
-- holds whoever writes the row. Other names, the variant and the equipment stay editable:
-- they say how to find it, not what was done.
--
-- **"Used" means "in a published version".** An organization movement reaches a session
-- only from a version of that organization: Space routines and the global catalogue never
-- accept one, and the person sees one only inside what she was planned. The steps of
-- that organization's versions are visible to whoever holds `manage_content` there, which
-- every command here requires, so the check never depends on reading anybody's training.
--
-- **Archiving is the owner's and the admin's.** Coaches compose content but do not retire
-- it, and they hold `manage_content` too, so archiving needs its own capability.
--
-- **The person sees the name of what she trains.** A gym's movement was readable only
-- inside the gym, so in Space a step of the gym's programme would have shown no name.
-- Two select policies open exactly what she was planned and what she trained, and nothing
-- else of the gym's library (OP-PLN-021). The Space search and detail stay global.
--
-- **Nothing here is personal data.** The catalogue is nobody's, so no access event is
-- written (OPS:2509), and the events carry identifiers only.

set lock_timeout = '5s';
set statement_timeout = '60s';

begin;

-- ---------------------------------------------------------------------------
-- Who may archive
-- ---------------------------------------------------------------------------

insert into organizations.organization_capabilities (code, name)
values ('archive_movements', 'Archivar movimientos propios')
on conflict (code) do update set name = excluded.name;

insert into organizations.role_capabilities (role_code, capability_code)
values ('owner', 'archive_movements'), ('admin', 'archive_movements')
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- The movement remembers its revision and its author
-- ---------------------------------------------------------------------------

alter table catalog.movements
  add column revision_number integer not null default 1,
  add column created_by_membership_id uuid;

alter table catalog.movements
  add constraint ck_movements_revision check (revision_number > 0),
  add constraint fk_movements_created_by_membership foreign key (created_by_membership_id) references organizations.organization_memberships (id) on delete restrict,
  add constraint ck_movements_organization_author check (
    content_scope <> 'organization' or created_by_membership_id is not null
  );

create index idx_movements_created_by_membership
  on catalog.movements (created_by_membership_id) where created_by_membership_id is not null;

-- What the freeze and the person's policies look up by movement.
create index idx_planned_steps_movement
  on planning.planned_steps (movement_id) where movement_id is not null;
create index idx_session_exercises_movement
  on execution.session_exercises (movement_id) where movement_id is not null;
create index idx_strength_sets_movement
  on execution.strength_sets (movement_id) where movement_id is not null;
create index idx_mobility_results_movement
  on execution.mobility_results (movement_id) where movement_id is not null;

-- ---------------------------------------------------------------------------
-- Revisions
-- ---------------------------------------------------------------------------

create table catalog.movement_revisions (
  id uuid not null,
  movement_id uuid not null,
  organization_id uuid not null,
  revision_from integer not null,
  revision_to integer not null,
  actor_membership_id uuid not null,
  before jsonb not null,
  after jsonb not null,
  created_at timestamptz not null default clock_timestamp(),
  constraint pk_movement_revisions primary key (id),
  constraint fk_movement_revisions_movement foreign key (movement_id) references catalog.movements (id) on delete restrict,
  constraint fk_movement_revisions_organization foreign key (organization_id) references organizations.organizations (id) on delete restrict,
  constraint fk_movement_revisions_actor foreign key (actor_membership_id) references organizations.organization_memberships (id) on delete restrict,
  constraint uq_movement_revisions_step unique (movement_id, revision_to),
  constraint ck_movement_revisions_step check (revision_from > 0 and revision_to = revision_from + 1),
  constraint ck_movement_revisions_documents check (
    jsonb_typeof(before) = 'object' and jsonb_typeof(after) = 'object'
  )
);

create index idx_movement_revisions_organization
  on catalog.movement_revisions (organization_id, movement_id);
create index idx_movement_revisions_actor on catalog.movement_revisions (actor_membership_id);

alter table catalog.movement_revisions enable row level security;
alter table catalog.movement_revisions force row level security;

create policy movement_revisions_select_member on catalog.movement_revisions
  for select to allfit_owner
  using (organization_id = access_control.org());

create policy movement_revisions_insert_author on catalog.movement_revisions
  for insert to allfit_owner
  with check (
    organization_id = access_control.org()
    and actor_membership_id::text = current_setting('app.actor_membership_id', true)
    and access_control.owns_membership(actor_membership_id)
    and (access_control.has_capability(organization_id, 'manage_content')
      or access_control.has_capability(organization_id, 'archive_movements'))
  );

create function catalog.refuse_movement_revision_change()
returns trigger
language plpgsql
set search_path = pg_catalog
as $function$
begin
  raise exception 'a movement revision is never rewritten' using errcode = '42501';
end
$function$;

create trigger trg_movement_revisions_before_change
before update or delete on catalog.movement_revisions
for each row execute function catalog.refuse_movement_revision_change();

alter table catalog.movement_revisions owner to allfit_owner;
revoke all on catalog.movement_revisions from public;

-- ---------------------------------------------------------------------------
-- The freeze
-- ---------------------------------------------------------------------------

-- In a published version of its organization. See the header for why that is all of it.
create function catalog.movement_in_use(p_movement_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $function$
  select exists (
    select 1 from planning.planned_steps as step where step.movement_id = p_movement_id
  )
$function$;

create function catalog.keep_organization_movement_meaning()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $function$
begin
  if new.content_scope is distinct from old.content_scope
     or new.owner_organization_id is distinct from old.owner_organization_id
     or new.owner_person_id is distinct from old.owner_person_id
     or new.created_by_membership_id is distinct from old.created_by_membership_id then
    raise exception 'an organization movement keeps its owner and its author' using errcode = '23514';
  end if;
  if old.status = 'archived' and new.status <> 'archived' then
    raise exception 'movement-archived' using errcode = '55000';
  end if;
  new.normalized_name := catalog.normalize_movement_name(new.name);
  if (new.discipline_code is distinct from old.discipline_code
      or new.normalized_name is distinct from old.normalized_name)
     and catalog.movement_in_use(old.id) then
    raise exception 'movement-in-use' using errcode = '55000';
  end if;
  return new;
end
$function$;

create trigger trg_movements_before_update_meaning
before update on catalog.movements
for each row when (old.content_scope = 'organization')
execute function catalog.keep_organization_movement_meaning();

-- ---------------------------------------------------------------------------
-- Who sees what
-- ---------------------------------------------------------------------------

-- She sees a gym's movement in a step of a version planned for her.
create policy movements_select_planned on catalog.movements
  for select to allfit_owner
  using (
    content_scope = 'organization'
    and exists (
      select 1
      from planning.planned_steps as step
      join planning.planned_sessions as session on session.template_version_id = step.template_version_id
      where step.movement_id = movements.id and session.person_id = access_control.person()
    )
  );

-- And in what she trained, after the plan that brought it is gone.
create policy movements_select_executed on catalog.movements
  for select to allfit_owner
  using (
    content_scope = 'organization'
    and (
      exists (
        select 1
        from execution.session_exercises as exercise
        join execution.executed_sessions as session on session.id = exercise.executed_session_id
        where exercise.movement_id = movements.id and session.person_id = access_control.person()
      )
      or exists (
        select 1
        from execution.strength_sets as recorded
        join execution.executed_sessions as session on session.id = recorded.executed_session_id
        where recorded.movement_id = movements.id and session.person_id = access_control.person()
      )
      or exists (
        select 1
        from execution.mobility_results as recorded
        join execution.executed_sessions as session on session.id = recorded.executed_session_id
        where recorded.movement_id = movements.id and session.person_id = access_control.person()
      )
    )
  );

-- The commands write a movement's children; the read policies already exist.
create policy movement_aliases_all_organization on catalog.movement_aliases
  for all to allfit_owner
  using (exists (
    select 1 from catalog.movements as movement
    where movement.id = movement_id and movement.content_scope = 'organization'
      and movement.owner_organization_id = access_control.org()
      and access_control.has_capability(movement.owner_organization_id, 'manage_content')
  ))
  with check (exists (
    select 1 from catalog.movements as movement
    where movement.id = movement_id and movement.content_scope = 'organization'
      and movement.owner_organization_id = access_control.org()
      and access_control.has_capability(movement.owner_organization_id, 'manage_content')
  ));

create policy movement_equipment_all_organization on catalog.movement_equipment
  for all to allfit_owner
  using (exists (
    select 1 from catalog.movements as movement
    where movement.id = movement_id and movement.content_scope = 'organization'
      and movement.owner_organization_id = access_control.org()
      and access_control.has_capability(movement.owner_organization_id, 'manage_content')
  ))
  with check (
    exists (
      select 1 from catalog.movements as movement
      where movement.id = movement_id and movement.content_scope = 'organization'
        and movement.owner_organization_id = access_control.org()
        and access_control.has_capability(movement.owner_organization_id, 'manage_content')
    )
    and exists (
      select 1 from catalog.equipment as item
      where item.id = equipment_id and item.content_scope = 'global' and item.status = 'published'
    )
  );

-- A gym's movement is a variant of a published global one, never of another of its own.
create policy movement_variants_all_organization on catalog.movement_variants
  for all to allfit_owner
  using (exists (
    select 1 from catalog.movements as movement
    where movement.id = variant_movement_id and movement.content_scope = 'organization'
      and movement.owner_organization_id = access_control.org()
      and access_control.has_capability(movement.owner_organization_id, 'manage_content')
  ))
  with check (
    exists (
      select 1 from catalog.movements as movement
      where movement.id = variant_movement_id and movement.content_scope = 'organization'
        and movement.owner_organization_id = access_control.org()
        and access_control.has_capability(movement.owner_organization_id, 'manage_content')
    )
    and exists (
      select 1 from catalog.movements as base
      where base.id = base_movement_id and base.content_scope = 'global' and base.status = 'published'
    )
  );

-- ---------------------------------------------------------------------------
-- Shared pieces
-- ---------------------------------------------------------------------------

-- A live member of a live organization, holding the capability when one is named.
create function catalog.require_movement_member(
  p_person_id uuid,
  p_organization_id uuid,
  p_capability text
)
returns uuid
language plpgsql
volatile
security definer
set search_path = pg_catalog
as $function$
declare
  membership_id uuid;
begin
  if access_control.actor_kind() <> 'person'
     or access_control.person() is distinct from p_person_id then
    raise exception 'person actor mismatch' using errcode = '42501';
  end if;

  select membership.id into membership_id
  from organizations.organization_memberships as membership
  join organizations.organizations as organization on organization.id = membership.organization_id
  where membership.organization_id = p_organization_id
    and membership.person_id = p_person_id
    and membership.status = 'active'
    and organization.status = 'active';
  if membership_id is null then
    raise exception 'organization not found' using errcode = 'P0002';
  end if;

  perform set_config('app.actor_org_id', p_organization_id::text, true);
  perform set_config('app.actor_membership_id', membership_id::text, true);
  if p_capability is not null and not access_control.has_capability(p_organization_id, p_capability) then
    raise exception 'this action requires %', p_capability using errcode = '42501';
  end if;
  return membership_id;
end
$function$;

-- Other names, trimmed, or null when they are not valid: at most ten, none blank or
-- longer than a name, none repeated and none the movement's own name.
create function catalog.clean_movement_aliases(p_aliases text[], p_normalized_name text)
returns text[]
language sql
immutable
set search_path = pg_catalog
as $function$
  select case
    when p_aliases is null or cardinality(p_aliases) = 0 then array[]::text[]
    when cardinality(p_aliases) > 10 then null
    when exists (
      select 1 from unnest(p_aliases) as alias
      where alias is null
         or catalog.normalize_movement_name(alias) = ''
         or char_length(catalog.normalize_movement_name(alias)) > 120
         or catalog.normalize_movement_name(alias) = p_normalized_name
    ) then null
    when (select count(distinct catalog.normalize_movement_name(alias)) from unnest(p_aliases) as alias)
         <> cardinality(p_aliases) then null
    else (
      select array_agg(regexp_replace(btrim(alias), '\s+', ' ', 'g') order by position)
      from unnest(p_aliases) with ordinality as listed(alias, position)
    )
  end
$function$;

-- The published global equipment the codes name, or null when any does not.
create function catalog.movement_equipment_ids(p_codes text[])
returns uuid[]
language sql
stable
set search_path = pg_catalog
as $function$
  select case
    when p_codes is null or cardinality(p_codes) = 0 then array[]::uuid[]
    when cardinality(p_codes) > 16
      or (select count(distinct code) from unnest(p_codes) as code) <> cardinality(p_codes)
      or exists (select 1 from unnest(p_codes) as code where code is null) then null
    else (
      select case when count(*) = cardinality(p_codes) then array_agg(item.id) end
      from catalog.equipment as item
      where item.code = any (p_codes) and item.content_scope = 'global' and item.status = 'published'
    )
  end
$function$;

-- Null or `{movement_id, relation, note?}` naming a published global movement.
create function catalog.valid_movement_variant(p_variant jsonb)
returns boolean
language sql
stable
set search_path = pg_catalog
as $function$
  select p_variant is null or jsonb_typeof(p_variant) = 'null' or (
    jsonb_typeof(p_variant) = 'object'
    and not exists (
      select 1 from jsonb_object_keys(p_variant) as key
      where key not in ('movement_id', 'relation', 'note')
    )
    and jsonb_typeof(p_variant->'movement_id') = 'string'
    and coalesce(p_variant->>'movement_id', '')
        ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    and coalesce(p_variant->>'relation', '') in ('variant', 'regression', 'progression')
    and (
      p_variant->'note' is null or jsonb_typeof(p_variant->'note') = 'null'
      or (jsonb_typeof(p_variant->'note') = 'string'
          and btrim(p_variant->>'note') <> '' and char_length(btrim(p_variant->>'note')) <= 200)
    )
    and exists (
      select 1 from catalog.movements as base
      where base.id = (p_variant->>'movement_id')::uuid
        and base.content_scope = 'global' and base.status = 'published'
    )
  )
$function$;

create function catalog.replace_movement_details(
  p_movement_id uuid,
  p_aliases text[],
  p_equipment_ids uuid[],
  p_replace_variant boolean,
  p_variant jsonb
)
returns void
language plpgsql
volatile
security definer
set search_path = pg_catalog
as $function$
begin
  if p_aliases is not null then
    delete from catalog.movement_aliases as alias
    where alias.movement_id = p_movement_id and alias.locale = 'es';
    insert into catalog.movement_aliases (movement_id, locale, name)
    select p_movement_id, 'es', alias from unnest(p_aliases) as alias;
  end if;
  if p_equipment_ids is not null then
    delete from catalog.movement_equipment as link where link.movement_id = p_movement_id;
    insert into catalog.movement_equipment (movement_id, equipment_id)
    select p_movement_id, item from unnest(p_equipment_ids) as item;
  end if;
  if p_replace_variant then
    delete from catalog.movement_variants as link where link.variant_movement_id = p_movement_id;
    if p_variant is not null and jsonb_typeof(p_variant) = 'object' then
      insert into catalog.movement_variants (base_movement_id, variant_movement_id, relation, note)
      values ((p_variant->>'movement_id')::uuid, p_movement_id, p_variant->>'relation',
              nullif(btrim(coalesce(p_variant->>'note', '')), ''));
    end if;
  end if;
end
$function$;

-- What a revision keeps of the movement, before and after.
create function catalog.movement_revision_document(p_movement_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog
as $function$
  select jsonb_build_object(
    'name', movement.name,
    'discipline_code', movement.discipline_code,
    'status', movement.status,
    'aliases', coalesce((
      select jsonb_agg(alias.name order by alias.name)
      from catalog.movement_aliases as alias
      where alias.movement_id = movement.id and alias.locale = 'es'), '[]'::jsonb),
    'equipment', coalesce((
      select jsonb_agg(item.code order by item.display_order, item.code)
      from catalog.movement_equipment as link
      join catalog.equipment as item on item.id = link.equipment_id
      where link.movement_id = movement.id), '[]'::jsonb),
    'variant', (
      select jsonb_build_object('movement_id', link.base_movement_id, 'relation', link.relation,
                                'note', link.note)
      from catalog.movement_variants as link
      where link.variant_movement_id = movement.id)
  )
  from catalog.movements as movement
  where movement.id = p_movement_id
$function$;

-- The movement as Studio reads it.
create function catalog.organization_movement_document(p_movement_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog
as $function$
  select jsonb_build_object(
    'id', movement.id,
    'name', movement.name,
    'discipline_code', movement.discipline_code,
    'scope', movement.content_scope,
    'archived', movement.status = 'archived',
    'revision', movement.revision_number,
    'aliases', coalesce((
      select jsonb_agg(alias.name order by alias.name)
      from catalog.movement_aliases as alias
      where alias.movement_id = movement.id and alias.locale = 'es'), '[]'::jsonb),
    'equipment', coalesce((
      select jsonb_agg(item.code order by item.display_order, item.code)
      from catalog.movement_equipment as link
      join catalog.equipment as item on item.id = link.equipment_id
      where link.movement_id = movement.id
        and item.content_scope = 'global' and item.status = 'published'), '[]'::jsonb),
    'muscles', coalesce((
      select jsonb_agg(muscle.code order by link.is_primary desc, muscle.display_order)
      from catalog.movement_muscles as link
      join catalog.muscles as muscle on muscle.id = link.muscle_id
      where link.movement_id = movement.id and muscle.status = 'published'), '[]'::jsonb),
    'variant_of', (
      select jsonb_build_object('id', base.id, 'name', base.name, 'relation', link.relation,
                                'note', link.note)
      from catalog.movement_variants as link
      join catalog.movements as base on base.id = link.base_movement_id
      where link.variant_movement_id = movement.id and base.content_scope = 'global'
      order by base.name
      limit 1),
    'name_locked', movement.content_scope <> 'organization' or catalog.movement_in_use(movement.id),
    'demo_object_key', (
      select media.object_key from catalog.movement_media as media
      where media.movement_id = movement.id and media.kind = 'demo')
  )
  from catalog.movements as movement
  where movement.id = p_movement_id
$function$;

-- ---------------------------------------------------------------------------
-- OP-CAT-001 — create
-- ---------------------------------------------------------------------------

create function catalog.create_organization_movement(
  p_person_id uuid,
  p_organization_id uuid,
  p_discipline_code text,
  p_name text,
  p_aliases text[],
  p_equipment text[],
  p_variant jsonb,
  p_idempotency_key uuid,
  p_command_id uuid,
  p_request_hash bytea
)
returns table (result jsonb, replayed boolean)
language plpgsql
volatile
security definer
set search_path = pg_catalog
as $function$
declare
  membership_id uuid;
  receipt record;
  problems text[] := array[]::text[];
  normalized text := catalog.normalize_movement_name(p_name);
  aliases text[];
  equipment_ids uuid[];
begin
  membership_id := catalog.require_movement_member(p_person_id, p_organization_id, 'manage_content');

  if not exists (
    select 1 from catalog.disciplines as discipline
    where discipline.code = p_discipline_code and discipline.status = 'published'
  ) then
    problems := array_append(problems, 'discipline_code');
  end if;
  if normalized = '' or char_length(normalized) > 120 then
    problems := array_append(problems, 'name');
  end if;
  aliases := catalog.clean_movement_aliases(p_aliases, normalized);
  if aliases is null then
    problems := array_append(problems, 'aliases');
  end if;
  equipment_ids := catalog.movement_equipment_ids(p_equipment);
  if equipment_ids is null then
    problems := array_append(problems, 'equipment');
  end if;
  if not catalog.valid_movement_variant(p_variant) then
    problems := array_append(problems, 'variant');
  end if;
  if cardinality(problems) > 0 then
    raise exception 'the movement is not valid' using errcode = '22023', detail = to_jsonb(problems)::text;
  end if;

  select * into receipt from system.begin_idempotency(
    p_person_id, 'OP-CAT-001', p_idempotency_key, p_command_id, p_request_hash
  );
  if not receipt.claimed then
    return query select catalog.organization_movement_document(receipt.aggregate_id), true;
    return;
  end if;

  insert into catalog.movements (
    id, discipline_code, name, normalized_name, content_scope, owner_organization_id,
    created_by_membership_id, status
  ) values (
    p_command_id, p_discipline_code, regexp_replace(btrim(p_name), '\s+', ' ', 'g'), normalized,
    'organization', p_organization_id, membership_id, 'published'
  );
  perform catalog.replace_movement_details(p_command_id, aliases, equipment_ids, true, p_variant);

  perform system.enqueue_outbox_event(
    'catalog_movement', p_command_id, 'catalog.private_movement_created.v1',
    jsonb_build_object('movement_id', p_command_id, 'organization_id', p_organization_id)
  );
  perform system.finish_idempotency(
    receipt.receipt_id, 201::smallint, 'movement-created', 'catalog_movement', p_command_id
  );
  return query select catalog.organization_movement_document(p_command_id), false;
end
$function$;

-- ---------------------------------------------------------------------------
-- OP-CAT-002 — update
-- ---------------------------------------------------------------------------

create function catalog.update_organization_movement(
  p_person_id uuid,
  p_organization_id uuid,
  p_movement_id uuid,
  p_expected_revision integer,
  p_changes jsonb,
  p_idempotency_key uuid,
  p_command_id uuid,
  p_request_hash bytea
)
returns table (result jsonb, replayed boolean)
language plpgsql
volatile
security definer
set search_path = pg_catalog
as $function$
declare
  membership_id uuid;
  receipt record;
  problems text[] := array[]::text[];
  target catalog.movements%rowtype;
  before_document jsonb;
  normalized text;
  aliases text[];
  equipment_ids uuid[];
begin
  membership_id := catalog.require_movement_member(p_person_id, p_organization_id, 'manage_content');

  if p_changes is null or jsonb_typeof(p_changes) <> 'object' or p_changes = '{}'::jsonb
     or exists (
       select 1 from jsonb_object_keys(p_changes) as key
       where key not in ('name', 'discipline_code', 'aliases', 'equipment', 'variant')
     ) then
    raise exception 'the edit is not valid' using errcode = '22023', detail = '["changes"]';
  end if;
  if p_expected_revision is null or p_expected_revision < 1 then
    problems := array_append(problems, 'expected_revision');
  end if;
  if p_changes ? 'name' and (
       jsonb_typeof(p_changes->'name') <> 'string'
       or catalog.normalize_movement_name(p_changes->>'name') = ''
       or char_length(catalog.normalize_movement_name(p_changes->>'name')) > 120) then
    problems := array_append(problems, 'name');
  end if;
  if p_changes ? 'discipline_code' and not exists (
       select 1 from catalog.disciplines as discipline
       where jsonb_typeof(p_changes->'discipline_code') = 'string'
         and discipline.code = p_changes->>'discipline_code' and discipline.status = 'published') then
    problems := array_append(problems, 'discipline_code');
  end if;
  if p_changes ? 'aliases' and (
       jsonb_typeof(p_changes->'aliases') <> 'array'
       or exists (select 1 from jsonb_array_elements(p_changes->'aliases') as item
                  where jsonb_typeof(item) <> 'string')) then
    problems := array_append(problems, 'aliases');
  end if;
  if p_changes ? 'equipment' then
    if jsonb_typeof(p_changes->'equipment') <> 'array'
       or exists (select 1 from jsonb_array_elements(p_changes->'equipment') as item
                  where jsonb_typeof(item) <> 'string') then
      problems := array_append(problems, 'equipment');
    else
      equipment_ids := catalog.movement_equipment_ids(
        array(select jsonb_array_elements_text(p_changes->'equipment')));
      if equipment_ids is null then
        problems := array_append(problems, 'equipment');
      end if;
    end if;
  end if;
  if p_changes ? 'variant' and not catalog.valid_movement_variant(p_changes->'variant') then
    problems := array_append(problems, 'variant');
  end if;
  if cardinality(problems) > 0 then
    raise exception 'the edit is not valid' using errcode = '22023', detail = to_jsonb(problems)::text;
  end if;

  select * into receipt from system.begin_idempotency(
    p_person_id, 'OP-CAT-002', p_idempotency_key, p_command_id, p_request_hash
  );
  if not receipt.claimed then
    return query select catalog.organization_movement_document(receipt.aggregate_id), true;
    return;
  end if;

  -- FOR UPDATE, not the update's own lock: it waits for any version being published with it.
  select * into target
  from catalog.movements as movement
  where movement.id = p_movement_id
    and movement.content_scope = 'organization'
    and movement.owner_organization_id = p_organization_id
  for update;
  if not found then
    raise exception 'movement not found' using errcode = 'P0002';
  end if;
  if target.status = 'archived' then
    raise exception 'movement-archived' using errcode = '55000';
  end if;
  if target.revision_number <> p_expected_revision then
    raise exception 'stale-movement' using errcode = '40001';
  end if;

  normalized := case when p_changes ? 'name'
    then catalog.normalize_movement_name(p_changes->>'name') else target.normalized_name end;
  if p_changes ? 'aliases' then
    aliases := catalog.clean_movement_aliases(
      array(select jsonb_array_elements_text(p_changes->'aliases')), normalized);
  else
    aliases := catalog.clean_movement_aliases(array(
      select alias.name from catalog.movement_aliases as alias
      where alias.movement_id = p_movement_id and alias.locale = 'es'), normalized);
  end if;
  if aliases is null then
    raise exception 'the edit is not valid' using errcode = '22023', detail = '["aliases"]';
  end if;

  before_document := catalog.movement_revision_document(p_movement_id);
  update catalog.movements as movement
  set name = case when p_changes ? 'name'
               then regexp_replace(btrim(p_changes->>'name'), '\s+', ' ', 'g') else movement.name end,
      normalized_name = normalized,
      discipline_code = coalesce(p_changes->>'discipline_code', movement.discipline_code),
      revision_number = movement.revision_number + 1
  where movement.id = p_movement_id;
  perform catalog.replace_movement_details(
    p_movement_id,
    case when p_changes ? 'aliases' then aliases end,
    equipment_ids,
    p_changes ? 'variant',
    p_changes->'variant'
  );

  insert into catalog.movement_revisions (
    id, movement_id, organization_id, revision_from, revision_to, actor_membership_id, before, after
  ) values (
    p_command_id, p_movement_id, p_organization_id, target.revision_number,
    target.revision_number + 1, membership_id, before_document,
    catalog.movement_revision_document(p_movement_id)
  );
  perform system.enqueue_outbox_event(
    'catalog_movement', p_movement_id, 'catalog.private_movement_updated.v1',
    jsonb_build_object('movement_id', p_movement_id, 'organization_id', p_organization_id,
                       'revision', target.revision_number + 1)
  );
  perform system.finish_idempotency(
    receipt.receipt_id, 200::smallint, 'movement-updated', 'catalog_movement', p_movement_id
  );
  return query select catalog.organization_movement_document(p_movement_id), false;
end
$function$;

-- ---------------------------------------------------------------------------
-- OP-CAT-003 — archive
-- ---------------------------------------------------------------------------

create function catalog.archive_organization_movement(
  p_person_id uuid,
  p_organization_id uuid,
  p_movement_id uuid,
  p_idempotency_key uuid,
  p_command_id uuid,
  p_request_hash bytea
)
returns table (result jsonb, replayed boolean)
language plpgsql
volatile
security definer
set search_path = pg_catalog
as $function$
declare
  membership_id uuid;
  receipt record;
  target catalog.movements%rowtype;
  before_document jsonb;
begin
  membership_id := catalog.require_movement_member(p_person_id, p_organization_id, 'archive_movements');

  select * into receipt from system.begin_idempotency(
    p_person_id, 'OP-CAT-003', p_idempotency_key, p_command_id, p_request_hash
  );
  if not receipt.claimed then
    return query select catalog.organization_movement_document(receipt.aggregate_id), true;
    return;
  end if;

  select * into target
  from catalog.movements as movement
  where movement.id = p_movement_id
    and movement.content_scope = 'organization'
    and movement.owner_organization_id = p_organization_id
  for update;
  if not found then
    raise exception 'movement not found' using errcode = 'P0002';
  end if;

  -- Archiving converges: a second request answers the archived movement and changes nothing.
  if target.status <> 'archived' then
    before_document := catalog.movement_revision_document(p_movement_id);
    update catalog.movements as movement
    set status = 'archived', revision_number = movement.revision_number + 1
    where movement.id = p_movement_id;
    insert into catalog.movement_revisions (
      id, movement_id, organization_id, revision_from, revision_to, actor_membership_id, before, after
    ) values (
      p_command_id, p_movement_id, p_organization_id, target.revision_number,
      target.revision_number + 1, membership_id, before_document,
      catalog.movement_revision_document(p_movement_id)
    );
    perform system.enqueue_outbox_event(
      'catalog_movement', p_movement_id, 'catalog.private_movement_archived.v1',
      jsonb_build_object('movement_id', p_movement_id, 'organization_id', p_organization_id,
                         'revision', target.revision_number + 1)
    );
  end if;
  perform system.finish_idempotency(
    receipt.receipt_id, 200::smallint, 'movement-archived', 'catalog_movement', p_movement_id
  );
  return query select catalog.organization_movement_document(p_movement_id), false;
end
$function$;

-- ---------------------------------------------------------------------------
-- OP-CAT-009 and OP-CAT-010 in Studio — search and read
-- ---------------------------------------------------------------------------

create function catalog.search_organization_movements(
  p_person_id uuid,
  p_organization_id uuid,
  p_query text,
  p_discipline_code text,
  p_include_archived boolean,
  p_limit integer,
  p_cursor text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog
as $function$
declare
  size integer := least(greatest(coalesce(p_limit, 25), 1), 100);
  pattern text := '%' || replace(replace(replace(
    catalog.normalize_movement_name(p_query), '\', '\\'), '%', '\%'), '_', '\_') || '%';
  page jsonb;
begin
  perform catalog.require_movement_member(p_person_id, p_organization_id, 'manage_content');

  with start as (
    select sort_name, sort_id from catalog.movement_cursor_parts(p_cursor)
  ),
  matched as (
    select
      catalog.normalize_movement_name(movement.name) as sort_name,
      movement.id as sort_id,
      jsonb_build_object(
        'id', movement.id,
        'name', movement.name,
        'discipline_code', movement.discipline_code,
        'scope', movement.content_scope,
        'archived', movement.status = 'archived',
        'muscles', coalesce((
          select jsonb_agg(muscle.code order by link.is_primary desc, muscle.display_order)
          from catalog.movement_muscles as link
          join catalog.muscles as muscle on muscle.id = link.muscle_id
          where link.movement_id = movement.id and muscle.status = 'published'), '[]'::jsonb),
        'equipment', coalesce((
          select jsonb_agg(item.code order by item.display_order, item.code)
          from catalog.movement_equipment as link
          join catalog.equipment as item on item.id = link.equipment_id
          where link.movement_id = movement.id
            and item.content_scope = 'global' and item.status = 'published'), '[]'::jsonb),
        'demo_object_key', (
          select media.object_key from catalog.movement_media as media
          where media.movement_id = movement.id and media.kind = 'demo')
      ) as item
    from catalog.movements as movement
    where (
        (movement.content_scope = 'global' and movement.status = 'published')
        or (movement.content_scope = 'organization'
            and movement.owner_organization_id = p_organization_id
            and (movement.status = 'published'
                 or (coalesce(p_include_archived, false) and movement.status = 'archived')))
      )
      and (p_discipline_code is null or movement.discipline_code = p_discipline_code)
      and (
        btrim(coalesce(p_query, '')) = ''
        or catalog.normalize_movement_name(movement.name) like pattern
        or exists (
          select 1 from catalog.movement_aliases as alias
          where alias.movement_id = movement.id
            and catalog.normalize_movement_name(alias.name) like pattern
        )
      )
      and (
        not exists (select 1 from start)
        or (catalog.normalize_movement_name(movement.name), movement.id)
             > (select sort_name, sort_id from start)
      )
    order by sort_name, sort_id
    limit size + 1
  ),
  shown as (
    select * from matched order by sort_name, sort_id limit size
  )
  select jsonb_build_object(
    'data', coalesce((select jsonb_agg(item order by sort_name, sort_id) from shown), '[]'::jsonb),
    'page', jsonb_build_object(
      'next_cursor', (
        select catalog.movement_cursor(last.item->>'name', last.sort_id)
        from (select item, sort_id from shown order by sort_name desc, sort_id desc limit 1) as last
        where (select count(*) from matched) > size
      ),
      'has_more', (select count(*) from matched) > size
    )
  ) into page;
  return page;
end
$function$;

create function catalog.read_organization_movement(
  p_person_id uuid,
  p_organization_id uuid,
  p_movement_id uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog
as $function$
begin
  perform catalog.require_movement_member(p_person_id, p_organization_id, 'manage_content');
  -- Null for another organization's, the same answer as one that does not exist.
  if exists (
    select 1 from catalog.movements as movement
    where movement.id = p_movement_id
      and ((movement.content_scope = 'global' and movement.status = 'published')
           or (movement.content_scope = 'organization'
               and movement.owner_organization_id = p_organization_id))
  ) then
    return catalog.organization_movement_document(p_movement_id);
  end if;
  return null;
end
$function$;

-- ---------------------------------------------------------------------------
-- Owners and grants
-- ---------------------------------------------------------------------------

alter function catalog.refuse_movement_revision_change() owner to allfit_owner;
alter function catalog.movement_in_use(uuid) owner to allfit_owner;
alter function catalog.keep_organization_movement_meaning() owner to allfit_owner;
alter function catalog.require_movement_member(uuid, uuid, text) owner to allfit_owner;
alter function catalog.clean_movement_aliases(text[], text) owner to allfit_owner;
alter function catalog.movement_equipment_ids(text[]) owner to allfit_owner;
alter function catalog.valid_movement_variant(jsonb) owner to allfit_owner;
alter function catalog.replace_movement_details(uuid, text[], uuid[], boolean, jsonb) owner to allfit_owner;
alter function catalog.movement_revision_document(uuid) owner to allfit_owner;
alter function catalog.organization_movement_document(uuid) owner to allfit_owner;
alter function catalog.create_organization_movement(uuid, uuid, text, text, text[], text[], jsonb, uuid, uuid, bytea)
  owner to allfit_owner;
alter function catalog.update_organization_movement(uuid, uuid, uuid, integer, jsonb, uuid, uuid, bytea)
  owner to allfit_owner;
alter function catalog.archive_organization_movement(uuid, uuid, uuid, uuid, uuid, bytea)
  owner to allfit_owner;
alter function catalog.search_organization_movements(uuid, uuid, text, text, boolean, integer, text)
  owner to allfit_owner;
alter function catalog.read_organization_movement(uuid, uuid, uuid) owner to allfit_owner;

revoke all on function catalog.refuse_movement_revision_change() from public, allfit_api;
revoke all on function catalog.movement_in_use(uuid) from public, allfit_api;
revoke all on function catalog.keep_organization_movement_meaning() from public, allfit_api;
revoke all on function catalog.require_movement_member(uuid, uuid, text) from public, allfit_api;
revoke all on function catalog.clean_movement_aliases(text[], text) from public, allfit_api;
revoke all on function catalog.movement_equipment_ids(text[]) from public, allfit_api;
revoke all on function catalog.valid_movement_variant(jsonb) from public, allfit_api;
revoke all on function catalog.replace_movement_details(uuid, text[], uuid[], boolean, jsonb) from public, allfit_api;
revoke all on function catalog.movement_revision_document(uuid) from public, allfit_api;
revoke all on function catalog.organization_movement_document(uuid) from public, allfit_api;
revoke all on function catalog.create_organization_movement(uuid, uuid, text, text, text[], text[], jsonb, uuid, uuid, bytea)
  from public;
revoke all on function catalog.update_organization_movement(uuid, uuid, uuid, integer, jsonb, uuid, uuid, bytea)
  from public;
revoke all on function catalog.archive_organization_movement(uuid, uuid, uuid, uuid, uuid, bytea) from public;
revoke all on function catalog.search_organization_movements(uuid, uuid, text, text, boolean, integer, text)
  from public;
revoke all on function catalog.read_organization_movement(uuid, uuid, uuid) from public;

grant execute on function catalog.create_organization_movement(uuid, uuid, text, text, text[], text[], jsonb, uuid, uuid, bytea)
  to allfit_api;
grant execute on function catalog.update_organization_movement(uuid, uuid, uuid, integer, jsonb, uuid, uuid, bytea)
  to allfit_api;
grant execute on function catalog.archive_organization_movement(uuid, uuid, uuid, uuid, uuid, bytea) to allfit_api;
grant execute on function catalog.search_organization_movements(uuid, uuid, text, text, boolean, integer, text)
  to allfit_api;
grant execute on function catalog.read_organization_movement(uuid, uuid, uuid) to allfit_api;

commit;
