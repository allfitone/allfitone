-- A person chooses her units and language, how each kind of notice reaches her, and which
-- phones may receive push (`OP-IDN-023`, `OP-IDN-024`, `OP-IDN-070` to `OP-IDN-073`,
-- `HU-SP-078`, `HU-SP-094`, ADR-054). TECH-44.
--
-- **Units and language are hers, and null until she chooses.** `identity.person_preferences`
-- keeps `mass_unit`, `distance_unit` and `locale`; with nothing chosen the app follows the
-- phone, and the database invents no default. Choosing a unit rewrites nothing: records
-- keep their canonical and original units and are converted when shown.
--
-- **A channel per category, and a missing row reads as enabled.** Nothing that is sent
-- today stops silently because a row was never written. Security cannot be turned off,
-- and the table refuses it whoever writes. Turning a channel on needs that channel to be
-- able to deliver: email a verified contact email, push a registered phone. Turning one
-- off needs nothing, and keeping a value she already has is never "turning it on".
--
-- **A phone is the app's installation.** Its id is generated once per installation, and
-- a token reaches one person: a token another phone held moves to the one registering it
-- (the other is retired as `moved`), and an installation somebody else used becomes the
-- phone of whoever registers it now. Retiring one that is not hers answers as if it were
-- retired and touches nothing, so the answer never says whose phone it was.
--
-- **The person comes from the token, in the database.** Every function takes the token's
-- provider, issuer and subject and resolves them through `identity.require_space_person`,
-- which also names her as the transaction's actor; the API never says whose rows to touch.
-- The runtime role has no privilege on any of the three tables.
--
-- **Two transaction-local scopes** let the registering function see the two rows that are
-- not hers yet: the active row holding the same token (`push_token_move`, keyed by the
-- token's digest so the scope never carries the token) and the installation's row
-- (`push_device_takeover`). Only a closed function can open them.
--
-- No access record and no event: nothing here says anything about her health or training,
-- nobody else ever reads it, and nothing outside the database needs to hear of it.
--
-- Additive.

set lock_timeout = '5s';
set statement_timeout = '60s';

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table identity.person_preferences (
  person_id uuid not null,
  mass_unit text,
  distance_unit text,
  locale text,
  updated_at timestamp with time zone not null default clock_timestamp(),
  constraint pk_person_preferences primary key (person_id),
  constraint fk_person_preferences_person foreign key (person_id) references identity.people (id) on delete cascade,
  constraint ck_person_preferences_mass_unit check (mass_unit in ('kg', 'lb')),
  constraint ck_person_preferences_distance_unit check (distance_unit in ('km', 'mi')),
  constraint ck_person_preferences_locale check (locale in ('es', 'en'))
);

create table identity.notification_preferences (
  id uuid not null default extensions.uuid_generate_v7(),
  person_id uuid not null,
  category text not null,
  channel text not null,
  enabled boolean not null,
  updated_at timestamp with time zone not null default clock_timestamp(),
  constraint pk_notification_preferences primary key (id),
  constraint fk_notification_preferences_person foreign key (person_id) references identity.people (id) on delete cascade,
  constraint uq_notification_preferences_channel unique (person_id, category, channel),
  constraint ck_notification_preferences_category check (
    category in ('relationship', 'assignment', 'consent', 'correction', 'nutrition', 'security')),
  -- V1 sends no SMS (ADR-050).
  constraint ck_notification_preferences_channel check (channel in ('email', 'push')),
  constraint ck_notification_preferences_security check (category <> 'security' or enabled)
);

create table identity.person_push_devices (
  id uuid not null,
  person_id uuid not null,
  platform text not null,
  push_token text not null,
  registered_at timestamp with time zone not null default clock_timestamp(),
  last_seen_at timestamp with time zone not null default clock_timestamp(),
  retired_at timestamp with time zone,
  retired_reason text,
  constraint pk_person_push_devices primary key (id),
  constraint fk_person_push_devices_person foreign key (person_id) references identity.people (id) on delete cascade,
  constraint ck_person_push_devices_platform check (platform in ('ios', 'android')),
  constraint ck_person_push_devices_token check (btrim(push_token) <> '' and char_length(push_token) <= 512),
  constraint ck_person_push_devices_retirement check ((retired_at is null) = (retired_reason is null)),
  constraint ck_person_push_devices_retired_reason check (retired_reason in ('sign_out', 'unregistered', 'moved'))
);

-- One active token reaches one phone, and so one person.
create unique index uidx_person_push_devices_active_token
  on identity.person_push_devices (push_token) where retired_at is null;
create index idx_person_push_devices_person_active
  on identity.person_push_devices (person_id) where retired_at is null;

alter table identity.person_preferences owner to allfit_owner;
alter table identity.notification_preferences owner to allfit_owner;
alter table identity.person_push_devices owner to allfit_owner;

revoke all on identity.person_preferences from public, allfit_api;
revoke all on identity.notification_preferences from public, allfit_api;
revoke all on identity.person_push_devices from public, allfit_api;

alter table identity.person_preferences enable row level security;
alter table identity.person_preferences force row level security;
alter table identity.notification_preferences enable row level security;
alter table identity.notification_preferences force row level security;
alter table identity.person_push_devices enable row level security;
alter table identity.person_push_devices force row level security;

-- No delete policy anywhere: a choice is replaced and a phone is retired, never removed.
create policy person_preferences_select_self on identity.person_preferences
  for select to allfit_owner using (access_control.is_self(person_id));
create policy person_preferences_insert_self on identity.person_preferences
  for insert to allfit_owner with check (access_control.is_self(person_id));
create policy person_preferences_update_self on identity.person_preferences
  for update to allfit_owner
  using (access_control.is_self(person_id))
  with check (access_control.is_self(person_id));

create policy notification_preferences_select_self on identity.notification_preferences
  for select to allfit_owner using (access_control.is_self(person_id));
create policy notification_preferences_insert_self on identity.notification_preferences
  for insert to allfit_owner with check (access_control.is_self(person_id));
create policy notification_preferences_update_self on identity.notification_preferences
  for update to allfit_owner
  using (access_control.is_self(person_id))
  with check (access_control.is_self(person_id));

create policy person_push_devices_select_self on identity.person_push_devices
  for select to allfit_owner using (access_control.is_self(person_id));
create policy person_push_devices_insert_self on identity.person_push_devices
  for insert to allfit_owner with check (access_control.is_self(person_id));
create policy person_push_devices_update_self on identity.person_push_devices
  for update to allfit_owner
  using (access_control.is_self(person_id))
  with check (access_control.is_self(person_id));

-- The active row holding the token being registered, which may be somebody else's.
create policy person_push_devices_select_moving_token on identity.person_push_devices
  for select to allfit_owner
  using (md5(push_token)::uuid::text = (select access_control.contract_scope('push_token_move')));
create policy person_push_devices_update_moving_token on identity.person_push_devices
  for update to allfit_owner
  using (md5(push_token)::uuid::text = (select access_control.contract_scope('push_token_move')))
  with check (retired_reason = 'moved'
    and md5(push_token)::uuid::text = (select access_control.contract_scope('push_token_move')));

-- The installation being registered, which somebody else may have used; it becomes hers.
create policy person_push_devices_select_takeover on identity.person_push_devices
  for select to allfit_owner
  using (id::text = (select access_control.contract_scope('push_device_takeover')));
create policy person_push_devices_update_takeover on identity.person_push_devices
  for update to allfit_owner
  using (id::text = (select access_control.contract_scope('push_device_takeover')))
  with check (access_control.is_self(person_id)
    and id::text = (select access_control.contract_scope('push_device_takeover')));

create trigger trg_person_preferences_before_update_timestamp
before update on identity.person_preferences
for each row execute function access_control.set_updated_at();

create trigger trg_notification_preferences_before_update_timestamp
before update on identity.notification_preferences
for each row execute function access_control.set_updated_at();

-- ---------------------------------------------------------------------------
-- Units and language (OP-IDN-070, OP-IDN-071)
-- ---------------------------------------------------------------------------

create function identity.person_preferences_document(p_person_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog
as $function$
  select jsonb_build_object(
    'mass_unit', stored.mass_unit,
    'distance_unit', stored.distance_unit,
    'locale', stored.locale
  )
  from (select 1) as anchor
  left join identity.person_preferences as stored on stored.person_id = p_person_id
$function$;

create function identity.read_my_preferences(p_provider text, p_issuer text, p_subject text)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $function$
begin
  return identity.person_preferences_document(
    identity.require_space_person(p_provider, p_issuer, p_subject));
end
$function$;

create function identity.put_my_preferences(
  p_provider text,
  p_issuer text,
  p_subject text,
  p_mass_unit text,
  p_distance_unit text,
  p_locale text,
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
  person uuid;
  receipt record;
  written boolean;
begin
  person := identity.require_space_person(p_provider, p_issuer, p_subject);

  -- Null is a value here: it hands the choice back to the phone.
  if p_mass_unit is not null and p_mass_unit not in ('kg', 'lb')
     or p_distance_unit is not null and p_distance_unit not in ('km', 'mi')
     or p_locale is not null and p_locale not in ('es', 'en') then
    raise exception 'a unit or language outside its list' using errcode = '22023';
  end if;

  select * into receipt
  from system.begin_idempotency(
    person, 'space'::system.command_surface, 'space',
    'OP-IDN-071', p_idempotency_key, p_command_id, p_request_hash
  );
  if not receipt.claimed then
    return query select identity.person_preferences_document(person), true;
    return;
  end if;

  insert into identity.person_preferences as stored (person_id, mass_unit, distance_unit, locale)
  values (person, p_mass_unit, p_distance_unit, p_locale)
  on conflict on constraint pk_person_preferences do update
    set mass_unit = excluded.mass_unit,
        distance_unit = excluded.distance_unit,
        locale = excluded.locale
    where (stored.mass_unit, stored.distance_unit, stored.locale)
          is distinct from (excluded.mass_unit, excluded.distance_unit, excluded.locale);
  written := found;

  perform system.finish_idempotency(
    receipt.receipt_id, 200::smallint,
    case when written then 'person-preferences-kept' else 'person-preferences-unchanged' end,
    'person', person
  );

  return query select identity.person_preferences_document(person), false;
end
$function$;

-- ---------------------------------------------------------------------------
-- Channels per category (OP-IDN-023, OP-IDN-024)
-- ---------------------------------------------------------------------------

-- The closed catalogue, in the order the screen draws it.
create function identity.notification_categories()
returns text[]
language sql
immutable
set search_path = pg_catalog
as $function$
  select array['relationship', 'assignment', 'consent', 'correction', 'nutrition', 'security']
$function$;

create function identity.notification_channel_available(p_person_id uuid, p_channel text)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $function$
  select case p_channel
    when 'email' then exists (
      select 1 from identity.people as person
      where person.id = p_person_id
        and person.contact_email is not null
        and person.contact_email_verified_at is not null)
    when 'push' then exists (
      select 1 from identity.person_push_devices as device
      where device.person_id = p_person_id and device.retired_at is null)
    else false
  end
$function$;

create function identity.notification_preferences_document(p_person_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog
as $function$
  select jsonb_build_object('preferences', jsonb_agg(jsonb_build_object(
    'category', category.code,
    'channel', channel.code,
    -- A missing row reads as enabled, so nothing sent today stops silently.
    'enabled', coalesce(stored.enabled, true),
    'locked', category.code = 'security',
    'available', identity.notification_channel_available(p_person_id, channel.code)
  ) order by category.position, channel.position))
  from unnest(identity.notification_categories()) with ordinality as category (code, position)
  cross join unnest(array['email', 'push']) with ordinality as channel (code, position)
  left join identity.notification_preferences as stored
    on stored.person_id = p_person_id
   and stored.category = category.code
   and stored.channel = channel.code
$function$;

create function identity.read_my_notification_preferences(p_provider text, p_issuer text, p_subject text)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $function$
begin
  return identity.notification_preferences_document(
    identity.require_space_person(p_provider, p_issuer, p_subject));
end
$function$;

create function identity.put_my_notification_preferences(
  p_provider text,
  p_issuer text,
  p_subject text,
  p_preferences jsonb,
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
  person uuid;
  receipt record;
  written integer;
begin
  person := identity.require_space_person(p_provider, p_issuer, p_subject);

  -- The whole set, every pair of the catalogue exactly once and nothing else.
  if jsonb_typeof(p_preferences) is distinct from 'array'
     or jsonb_array_length(p_preferences) <> 12
     or exists (
       select 1 from jsonb_array_elements(p_preferences) as item
       where jsonb_typeof(item) <> 'object'
          or item - 'category' - 'channel' - 'enabled' <> '{}'::jsonb
          or jsonb_typeof(item -> 'enabled') is distinct from 'boolean'
          or not coalesce(item ->> 'category' = any (identity.notification_categories()), false)
          or not coalesce(item ->> 'channel' in ('email', 'push'), false))
     or (select count(distinct (item ->> 'category', item ->> 'channel'))
         from jsonb_array_elements(p_preferences) as item) <> 12 then
    raise exception 'the set names every category and channel once' using errcode = '22023';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_preferences) as item
    where item ->> 'category' = 'security' and not (item ->> 'enabled')::boolean) then
    raise exception 'security notices cannot be turned off' using errcode = '22023';
  end if;

  select * into receipt
  from system.begin_idempotency(
    person, 'space'::system.command_surface, 'space',
    'OP-IDN-024', p_idempotency_key, p_command_id, p_request_hash
  );
  if not receipt.claimed then
    return query select identity.notification_preferences_document(person), true;
    return;
  end if;

  -- Turning on is off before and on now; what she already has is never refused.
  if exists (
    select 1
    from jsonb_array_elements(p_preferences) as item
    join identity.notification_preferences as stored
      on stored.person_id = person
     and stored.category = item ->> 'category'
     and stored.channel = item ->> 'channel'
    where (item ->> 'enabled')::boolean
      and not stored.enabled
      and not identity.notification_channel_available(person, item ->> 'channel')) then
    raise exception 'a channel that cannot deliver cannot be turned on' using errcode = '22023';
  end if;

  insert into identity.notification_preferences as stored (person_id, category, channel, enabled)
  select person, item ->> 'category', item ->> 'channel', (item ->> 'enabled')::boolean
  from jsonb_array_elements(p_preferences) as item
  on conflict on constraint uq_notification_preferences_channel do update
    set enabled = excluded.enabled
    where stored.enabled is distinct from excluded.enabled;
  get diagnostics written = row_count;

  perform system.finish_idempotency(
    receipt.receipt_id, 200::smallint,
    case when written > 0 then 'notification-preferences-kept' else 'notification-preferences-unchanged' end,
    'person', person
  );

  return query select identity.notification_preferences_document(person), false;
end
$function$;

-- ---------------------------------------------------------------------------
-- Phones for push (OP-IDN-072, OP-IDN-073)
-- ---------------------------------------------------------------------------

-- Never the token: the app holds it, and nothing reads it back.
create function identity.push_device_projection(p_device_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog
as $function$
  select jsonb_build_object(
    'id', device.id,
    'platform', device.platform,
    'registered_at', device.registered_at,
    'last_seen_at', device.last_seen_at
  )
  from identity.person_push_devices as device
  where device.id = p_device_id
$function$;

create function identity.register_my_push_device(
  p_provider text,
  p_issuer text,
  p_subject text,
  p_device_id uuid,
  p_push_token text,
  p_platform text,
  p_idempotency_key uuid,
  p_command_id uuid,
  p_request_hash bytea
)
returns table (device jsonb, replayed boolean)
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  person uuid;
  receipt record;
  token text := btrim(p_push_token);
  seen_at timestamptz;
  saved_purpose text := current_setting('app.contract_scope_purpose', true);
  saved_id text := current_setting('app.contract_scope_id', true);
  saved_token text := current_setting('app.contract_scope_token', true);
  registered jsonb;
begin
  person := identity.require_space_person(p_provider, p_issuer, p_subject);

  if p_device_id is null
     or p_platform is null or p_platform not in ('ios', 'android')
     or token is null or token = '' or char_length(token) > 512 then
    raise exception 'a phone has an id, a known platform and a token' using errcode = '22023';
  end if;

  select * into receipt
  from system.begin_idempotency(
    person, 'space'::system.command_surface, 'space',
    'OP-IDN-072', p_idempotency_key, p_command_id, p_request_hash
  );
  if not receipt.claimed then
    registered := identity.push_device_projection(p_device_id);
    if registered is null then
      raise exception 'device not found' using errcode = 'P0002';
    end if;
    return query select registered, true;
    return;
  end if;

  seen_at := clock_timestamp();

  -- The token reaches one phone: wherever else it is active, it moved here.
  perform access_control.open_contract_scope('push_token_move', md5(token)::uuid);
  update identity.person_push_devices as held
  set retired_at = seen_at, retired_reason = 'moved'
  where held.push_token = token
    and held.retired_at is null
    and held.id <> p_device_id;

  -- The installation is hers from now, whoever registered it before.
  perform access_control.open_contract_scope('push_device_takeover', p_device_id);
  insert into identity.person_push_devices as stored (
    id, person_id, platform, push_token, registered_at, last_seen_at
  )
  values (p_device_id, person, p_platform, token, seen_at, seen_at)
  on conflict on constraint pk_person_push_devices do update
    set registered_at = case
          when stored.person_id = excluded.person_id and stored.retired_at is null
            then stored.registered_at
          else excluded.registered_at
        end,
        person_id = excluded.person_id,
        platform = excluded.platform,
        push_token = excluded.push_token,
        last_seen_at = excluded.last_seen_at,
        retired_at = null,
        retired_reason = null;

  perform set_config('app.contract_scope_purpose', coalesce(saved_purpose, ''), true);
  perform set_config('app.contract_scope_id', coalesce(saved_id, ''), true);
  perform set_config('app.contract_scope_token', coalesce(saved_token, ''), true);

  perform system.finish_idempotency(
    receipt.receipt_id, 200::smallint, 'push-device-registered', 'person_push_device', p_device_id
  );

  return query select identity.push_device_projection(p_device_id), false;
end
$function$;

create function identity.retire_my_push_device(
  p_provider text,
  p_issuer text,
  p_subject text,
  p_device_id uuid,
  p_idempotency_key uuid,
  p_command_id uuid,
  p_request_hash bytea
)
returns table (replayed boolean)
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  person uuid;
  receipt record;
  retired boolean;
begin
  person := identity.require_space_person(p_provider, p_issuer, p_subject);

  if p_device_id is null then
    raise exception 'a phone has an id' using errcode = '22023';
  end if;

  select * into receipt
  from system.begin_idempotency(
    person, 'space'::system.command_surface, 'space',
    'OP-IDN-073', p_idempotency_key, p_command_id, p_request_hash
  );
  if not receipt.claimed then
    return query select true;
    return;
  end if;

  -- Somebody else's phone, or one already retired, answers the same and stays as it is.
  update identity.person_push_devices as device
  set retired_at = clock_timestamp(), retired_reason = 'sign_out'
  where device.id = p_device_id
    and device.person_id = person
    and device.retired_at is null;
  retired := found;

  perform system.finish_idempotency(
    receipt.receipt_id, 204::smallint,
    case when retired then 'push-device-retired' else 'push-device-already-retired' end,
    'person_push_device', p_device_id
  );

  return query select false;
end
$function$;

-- ---------------------------------------------------------------------------
-- Ownership and privileges
-- ---------------------------------------------------------------------------

alter function identity.person_preferences_document(uuid) owner to allfit_owner;
alter function identity.read_my_preferences(text, text, text) owner to allfit_owner;
alter function identity.put_my_preferences(text, text, text, text, text, text, uuid, uuid, bytea) owner to allfit_owner;
alter function identity.notification_categories() owner to allfit_owner;
alter function identity.notification_channel_available(uuid, text) owner to allfit_owner;
alter function identity.notification_preferences_document(uuid) owner to allfit_owner;
alter function identity.read_my_notification_preferences(text, text, text) owner to allfit_owner;
alter function identity.put_my_notification_preferences(text, text, text, jsonb, uuid, uuid, bytea) owner to allfit_owner;
alter function identity.push_device_projection(uuid) owner to allfit_owner;
alter function identity.register_my_push_device(text, text, text, uuid, text, text, uuid, uuid, bytea) owner to allfit_owner;
alter function identity.retire_my_push_device(text, text, text, uuid, uuid, uuid, bytea) owner to allfit_owner;

-- The documents take a person id, so only the functions that resolve her may call them.
revoke all on function identity.person_preferences_document(uuid) from public, allfit_api;
revoke all on function identity.notification_categories() from public, allfit_api;
revoke all on function identity.notification_channel_available(uuid, text) from public, allfit_api;
revoke all on function identity.notification_preferences_document(uuid) from public, allfit_api;
revoke all on function identity.push_device_projection(uuid) from public, allfit_api;
revoke all on function identity.read_my_preferences(text, text, text) from public;
revoke all on function identity.put_my_preferences(text, text, text, text, text, text, uuid, uuid, bytea) from public;
revoke all on function identity.read_my_notification_preferences(text, text, text) from public;
revoke all on function identity.put_my_notification_preferences(text, text, text, jsonb, uuid, uuid, bytea) from public;
revoke all on function identity.register_my_push_device(text, text, text, uuid, text, text, uuid, uuid, bytea) from public;
revoke all on function identity.retire_my_push_device(text, text, text, uuid, uuid, uuid, bytea) from public;

grant execute on function identity.read_my_preferences(text, text, text) to allfit_api;
grant execute on function identity.put_my_preferences(text, text, text, text, text, text, uuid, uuid, bytea) to allfit_api;
grant execute on function identity.read_my_notification_preferences(text, text, text) to allfit_api;
grant execute on function identity.put_my_notification_preferences(text, text, text, jsonb, uuid, uuid, bytea) to allfit_api;
grant execute on function identity.register_my_push_device(text, text, text, uuid, text, text, uuid, uuid, bytea) to allfit_api;
grant execute on function identity.retire_my_push_device(text, text, text, uuid, uuid, uuid, bytea) to allfit_api;
