-- A person keeps her theme for Studio (`OP-IDN-068`, `OP-IDN-069`).
--
-- **The choice is the person's, not the browser's.** Studio has a light and a dark theme,
-- and what she picks is kept with her account, so it follows her to another browser or
-- device.
--
-- **One row per person per product.** Choosing light in Studio must not change another
-- product that gets themes later, so the key is the person and the product, named by the
-- same list her web sessions use. Only Studio writes a row today.
--
-- **No row means she never chose.** The read answers `null` and Studio shows its own
-- default. The database invents none, so changing that default later rewrites nobody's
-- choice.
--
-- **The product is the function's, never the caller's.** Both functions are Studio's and
-- carry `studio` themselves: the route decides it, and nothing a client sends can aim
-- them at another product.
--
-- **Nothing is readable by the runtime role.** The API reaches the table only through the
-- two functions below, and they answer only to the person herself. Each checks the actor
-- null-safely first, because the gate of `OP-IDN-017` compares with `<>` and so lets a
-- transaction that names no person through; then it passes that gate, so a closed
-- account gets here what it gets there.
--
-- **No access record and no event.** A theme says nothing about her health or her
-- training and nobody but her ever reads it, so the read writes no access record; and
-- nothing outside the database needs to hear of it, so the command enqueues nothing.
--
-- Additive.

set lock_timeout = '5s';
set statement_timeout = '60s';

-- ---------------------------------------------------------------------------
-- Table
-- ---------------------------------------------------------------------------

create table identity.surface_preferences (
  person_id uuid not null,
  surface identity.access_session_surface not null,
  theme text not null,
  created_at timestamp with time zone not null default clock_timestamp(),
  updated_at timestamp with time zone not null default clock_timestamp(),
  constraint pk_surface_preferences primary key (person_id, surface),
  constraint fk_surface_preferences_person foreign key (person_id) references identity.people (id) on delete restrict,
  constraint ck_surface_preferences_theme check (theme in ('dark', 'light'))
);

alter table identity.surface_preferences owner to allfit_owner;

revoke all on identity.surface_preferences from public, allfit_api;

alter table identity.surface_preferences enable row level security;
alter table identity.surface_preferences force row level security;

-- No delete policy: a choice is replaced, and nothing here removes one.
create policy surface_preferences_select_self on identity.surface_preferences
  for select to allfit_owner using (access_control.is_self(person_id));
create policy surface_preferences_insert_self on identity.surface_preferences
  for insert to allfit_owner with check (access_control.is_self(person_id));
create policy surface_preferences_update_self on identity.surface_preferences
  for update to allfit_owner
  using (access_control.is_self(person_id))
  with check (access_control.is_self(person_id));

create trigger trg_surface_preferences_before_update_timestamp
before update on identity.surface_preferences
for each row execute function access_control.set_updated_at();

-- ---------------------------------------------------------------------------
-- Read (OP-IDN-068)
-- ---------------------------------------------------------------------------

create function identity.read_studio_preferences(p_person_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $function$
declare
  chosen_theme text;
begin
  -- Null-safe first: a transaction that names no person is nobody, not anybody.
  if access_control.actor_kind() is distinct from 'person'
     or access_control.person() is distinct from p_person_id then
    raise exception 'preferences person does not match the authenticated actor' using errcode = '42501';
  end if;
  -- Then the gate of `OP-IDN-017`, which also asks that she is active.
  perform identity.require_professional_actor(p_person_id);

  select stored.theme into chosen_theme
  from identity.surface_preferences as stored
  where stored.person_id = p_person_id
    and stored.surface = 'studio'::identity.access_session_surface;

  return jsonb_build_object('theme', chosen_theme);
end
$function$;

-- ---------------------------------------------------------------------------
-- Keep (OP-IDN-069)
-- ---------------------------------------------------------------------------

create function identity.put_studio_preferences(
  p_person_id uuid,
  p_theme text,
  p_idempotency_key uuid,
  p_command_id uuid,
  p_request_hash bytea
)
returns table (preferences jsonb, replayed boolean)
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  receipt record;
  written boolean;
begin
  if access_control.actor_kind() is distinct from 'person'
     or access_control.person() is distinct from p_person_id then
    raise exception 'preferences person does not match the authenticated actor' using errcode = '42501';
  end if;
  perform identity.require_professional_actor(p_person_id);

  if p_theme is null or p_theme not in ('dark', 'light') then
    raise exception 'unsupported theme' using errcode = '22023';
  end if;

  select * into receipt
  from system.begin_idempotency(
    p_person_id, 'OP-IDN-069', p_idempotency_key, p_command_id, p_request_hash
  );
  if not receipt.claimed then
    return query select identity.read_studio_preferences(p_person_id), true;
    return;
  end if;

  -- The primary key settles two commands arriving together; the same theme writes nothing.
  insert into identity.surface_preferences as stored (person_id, surface, theme)
  values (p_person_id, 'studio'::identity.access_session_surface, p_theme)
  on conflict on constraint pk_surface_preferences do update
    set theme = excluded.theme
    where stored.theme is distinct from excluded.theme;
  written := found;

  perform system.finish_idempotency(
    receipt.receipt_id, 200::smallint,
    case when written then 'studio-preferences-kept' else 'studio-preferences-unchanged' end,
    'person', p_person_id
  );

  return query select identity.read_studio_preferences(p_person_id), false;
end
$function$;

-- ---------------------------------------------------------------------------
-- Ownership and privileges
-- ---------------------------------------------------------------------------

alter function identity.read_studio_preferences(uuid) owner to allfit_owner;
alter function identity.put_studio_preferences(uuid, text, uuid, uuid, bytea) owner to allfit_owner;

revoke all on function identity.read_studio_preferences(uuid) from public;
revoke all on function identity.put_studio_preferences(uuid, text, uuid, uuid, bytea) from public;

grant execute on function identity.read_studio_preferences(uuid) to allfit_api;
grant execute on function identity.put_studio_preferences(uuid, text, uuid, uuid, bytea) to allfit_api;
