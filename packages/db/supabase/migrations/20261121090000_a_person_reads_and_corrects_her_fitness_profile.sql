-- TECH-43 — a person reads her fitness profile and her identity, and corrects what she
-- declared. `HU-SP-009`, `HU-SP-012` criterion 3, `HU-SP-013`, `HU-SP-023`, `HU-SP-096`
-- criterion 4 and `HU-SP-098` criterion 6; `OP-IDN-012`, `OP-IDN-013`, `OP-IDN-063` to
-- `OP-IDN-065`.
--
-- **Four new attributes, and they are data.** Days a week, time per session, where she
-- trains and the equipment she has join the catalogue with an insert, as every member
-- before them. The days are an enum of `1` to `7` rather than a number: a numeric
-- attribute has no range here, so nine days would pass, while an enum is refused in the
-- same transaction. The equipment uses the codes of `catalog.equipment` so exercises can
-- later be filtered by what she has, but its list lives here: that catalogue is empty in
-- production until Backoffice publishes it, and the question cannot wait for it.
--
-- **The catalogue learns which attributes are sets.** `focus_areas` was the only one and
-- the commands knew it by name. The profile read has to group a set's rows into one
-- version and keep a single-valued attribute's rows apart — two coaches observing two
-- places are two versions — so the shape becomes a column instead of a third list of names.
--
-- **The profile shows one version per attribute and says why.** Selection rule v1: the
-- most recent version she declared wins; without one, the most recent of any provenance.
-- Every other live version travels as an alternative with its provenance and date, so
-- nothing is hidden and nothing is deleted (`HU-SP-023` criteria 3 and 4). Sealed claims
-- are history, which is `OP-IDN-014`, not an alternative.
--
-- **Correcting after activation is its own command.** `declare_fitness_id` and
-- `declare_biological_sex` belong to an open attempt and refuse an activated one. These
-- resolve the active person behind the token, like every other Space read and command
-- since `require_space_person`, and never touch the contact email: changing it is
-- `OP-IDN-021`, with its own verification.
--
-- **The phone is a contact value (ADR-050).** V1 sends no SMS, so nothing can verify a
-- number: she writes it and it is in force at once, unverified. A unique index over every
-- number would then let anybody write somebody else's and lock its owner out of it, so
-- only a verified number stays unique.
--
-- **What a gym sees grows with the attributes, and the scope says so.** The training
-- category serves the live claims of every attribute classified `training`, so the three
-- answers and the equipment reach a coach she already shares her training profile with,
-- exactly as the goal, the experience and the zones did. Its presentation names them now.

set lock_timeout = '5s';
set statement_timeout = '60s';

-- ---------------------------------------------------------------- catalogue

alter table identity.profile_attributes
  add column multivalued boolean not null default false;

update identity.profile_attributes set multivalued = true where code = 'focus_areas';

insert into identity.profile_attributes (
  code, name, data_classification_code, value_kind, allowed_values, multivalued
)
values
  ('training_days_per_week', 'Días de entrenamiento por semana', 'training', 'enum',
    array['1', '2', '3', '4', '5', '6', '7'], false),
  ('session_duration', 'Tiempo por sesión', 'training', 'enum',
    array['up_to_30_min', '30_to_45_min', '45_to_60_min', 'over_60_min'], false),
  ('training_place', 'Dónde entrena', 'training', 'enum',
    array['gym', 'home', 'outdoors', 'multiple'], false),
  ('available_equipment', 'Equipo con el que cuenta', 'training', 'enum',
    array['bodyweight', 'dumbbell', 'kettlebell', 'barbell', 'bench', 'pull_up_bar', 'cable',
          'machine', 'cardio_machine'], true);

-- The row is the member of the set, so the same piece live twice is corrupt.
create unique index uidx_fitness_profile_claims_live_equipment
  on identity.fitness_profile_claims (person_id, value_text)
  where attribute_code = 'available_equipment'
    and valid_to is null
    and provenance = 'person_declared';

update privacy.scope_presentations
set description = 'Tu perfil de entrenamiento (objetivo, experiencia, disciplina, zonas de énfasis, días y tiempo que tienes para entrenar, dónde entrenas, el equipo con el que cuentas y tu sexo biológico) y las sesiones que te asignemos con sus resultados, solo las que ocurran dentro de esta relación. No incluye lo que entrenes por tu cuenta, ni tu cuerpo, ni tu salud.',
    updated_at = clock_timestamp()
where scope_code = 'relationship_training';

-- ---------------------------------------------------------------- my profile (OP-IDN-013)

create function identity.read_own_profile(p_provider text, p_issuer text, p_subject text)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  person uuid;
  entries jsonb;
begin
  person := identity.require_space_person(p_provider, p_issuer, p_subject);

  with live as (
    select claim.id, claim.attribute_code, claim.provenance, claim.valid_from,
           coalesce(claim.value_text, claim.value_numeric::text) as value,
           attribute.multivalued
    from identity.fitness_profile_claims as claim
    join identity.profile_attributes as attribute on attribute.code = claim.attribute_code
    where claim.person_id = person
      and claim.valid_to is null
  ),
  -- A single-valued claim is a version; a set is one version per provenance.
  versions as (
    select live.attribute_code, live.provenance, live.valid_from,
           jsonb_build_array(live.value) as vals, live.id::text as tiebreak
    from live
    where not live.multivalued
    union all
    select live.attribute_code, live.provenance, max(live.valid_from),
           jsonb_agg(live.value order by live.value), live.provenance::text
    from live
    where live.multivalued
    group by live.attribute_code, live.provenance
  ),
  ranked as (
    select versions.*,
           row_number() over (
             partition by versions.attribute_code
             order by (versions.provenance = 'person_declared') desc,
                      versions.valid_from desc, versions.tiebreak desc
           ) as position
    from versions
  )
  select jsonb_agg(
           jsonb_build_object(
             'attribute_code', chosen.attribute_code,
             'values', chosen.vals,
             'provenance', chosen.provenance,
             'selected_because', case when chosen.provenance = 'person_declared'
                                      then 'declared_by_you' else 'most_recent' end,
             'valid_from', chosen.valid_from,
             'alternatives', coalesce((
               select jsonb_agg(
                        jsonb_build_object(
                          'values', other.vals,
                          'provenance', other.provenance,
                          'valid_from', other.valid_from
                        )
                        order by other.valid_from desc, other.tiebreak desc
                      )
               from ranked as other
               where other.attribute_code = chosen.attribute_code
                 and other.position > 1
             ), '[]'::jsonb)
           )
           order by chosen.attribute_code
         )
  into entries
  from ranked as chosen
  where chosen.position = 1;

  return jsonb_build_object(
    'biological_sex', (select owner.biological_sex from identity.people as owner where owner.id = person),
    'attributes', coalesce(entries, '[]'::jsonb)
  );
end
$function$;

alter function identity.read_own_profile(text, text, text) owner to allfit_owner;
revoke all on function identity.read_own_profile(text, text, text) from public;
grant execute on function identity.read_own_profile(text, text, text) to allfit_api;

-- ---------------------------------------------------------------- my identity (OP-IDN-012)

-- The subject and the issuer stay here: how she signs in is the provider and the date.
create function identity.read_own_identity(p_provider text, p_issuer text, p_subject text)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  person uuid;
begin
  person := identity.require_space_person(p_provider, p_issuer, p_subject);

  return (
    select jsonb_build_object(
      'given_name', owner.given_name,
      'family_name', owner.family_name,
      'username', owner.username::text,
      'active_since', owner.activated_at,
      'email', jsonb_build_object(
        'address', owner.contact_email::text,
        'verified', owner.contact_email_verified_at is not null
      ),
      'phone', jsonb_build_object(
        'number', owner.contact_phone,
        'verified', owner.contact_phone_verified_at is not null
      ),
      'accounts', coalesce((
        select jsonb_agg(
                 jsonb_build_object('provider', account.provider, 'linked_at', account.linked_at)
                 order by account.linked_at, account.id
               )
        from identity.access_accounts as account
        where account.person_id = owner.id
      ), '[]'::jsonb)
    )
    from identity.people as owner
    where owner.id = person
  );
end
$function$;

alter function identity.read_own_identity(text, text, text) owner to allfit_owner;
revoke all on function identity.read_own_identity(text, text, text) from public;
grant execute on function identity.read_own_identity(text, text, text) to allfit_api;

-- ---------------------------------------------------------------- my name (OP-IDN-063)

create function identity.own_name_document(p_person_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog
as $function$
  select jsonb_build_object(
    'given_name', owner.given_name,
    'family_name', owner.family_name,
    'username', owner.username::text
  )
  from identity.people as owner
  where owner.id = p_person_id
$function$;

alter function identity.own_name_document(uuid) owner to allfit_owner;
revoke all on function identity.own_name_document(uuid) from public, allfit_api;

create function identity.correct_own_name(
  p_provider text,
  p_issuer text,
  p_subject text,
  p_given_name text,
  p_family_name text,
  p_username text,
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
  given text := btrim(p_given_name);
  family text := btrim(p_family_name);
  handle text := lower(btrim(p_username));
begin
  person := identity.require_space_person(p_provider, p_issuer, p_subject);

  if given is null or given = '' or char_length(given) > 80
     or family is null or family = '' or char_length(family) > 80 then
    raise exception 'a name and a family name, briefly' using errcode = '22023';
  end if;
  if handle is null or handle !~ '^[a-z][a-z0-9_]{2,29}$' then
    raise exception 'a username is 3 to 30 letters, digits or underscores' using errcode = '22023';
  end if;

  select * into receipt
  from system.begin_idempotency(
    person, 'space'::system.command_surface, 'space',
    'OP-IDN-063', p_idempotency_key, p_command_id, p_request_hash
  );
  if not receipt.claimed then
    return query select identity.own_name_document(person), true;
    return;
  end if;

  -- A handle somebody else holds is 23505 from `uidx_people_username`, saying nobody's name.
  update identity.people as owner
  set given_name = given,
      family_name = family,
      username = handle::extensions.citext
  where owner.id = person;

  perform system.finish_idempotency(
    receipt.receipt_id, 200::smallint, 'own-name-corrected', 'person', person
  );
  return query select identity.own_name_document(person), false;
end
$function$;

alter function identity.correct_own_name(text, text, text, text, text, text, uuid, uuid, bytea)
  owner to allfit_owner;
revoke all on function identity.correct_own_name(text, text, text, text, text, text, uuid, uuid, bytea)
  from public;
grant execute on function identity.correct_own_name(text, text, text, text, text, text, uuid, uuid, bytea)
  to allfit_api;

-- ---------------------------------------------------------------- my sex (OP-IDN-064)

create function identity.correct_own_biological_sex(
  p_provider text,
  p_issuer text,
  p_subject text,
  p_value text,
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
begin
  person := identity.require_space_person(p_provider, p_issuer, p_subject);

  -- Null is declining, and it is valid. Anything else outside the type is not.
  if p_value is not null and not (p_value = any (enum_range(null::identity.biological_sex)::text[])) then
    raise exception 'biological sex is not a member of the enum' using errcode = '22023';
  end if;

  select * into receipt
  from system.begin_idempotency(
    person, 'space'::system.command_surface, 'space',
    'OP-IDN-064', p_idempotency_key, p_command_id, p_request_hash
  );
  if not receipt.claimed then
    return query
      select jsonb_build_object('biological_sex', owner.biological_sex), true
      from identity.people as owner
      where owner.id = person;
    return;
  end if;

  -- Nothing recorded was computed from it and stored, so nothing else is rewritten.
  update identity.people as owner
  set biological_sex = p_value::identity.biological_sex
  where owner.id = person;

  perform system.finish_idempotency(
    receipt.receipt_id, 200::smallint, 'own-biological-sex-corrected', 'person', person
  );
  return query select jsonb_build_object('biological_sex', p_value), false;
end
$function$;

alter function identity.correct_own_biological_sex(text, text, text, text, uuid, uuid, bytea)
  owner to allfit_owner;
revoke all on function identity.correct_own_biological_sex(text, text, text, text, uuid, uuid, bytea)
  from public;
grant execute on function identity.correct_own_biological_sex(text, text, text, text, uuid, uuid, bytea)
  to allfit_api;

-- ---------------------------------------------------------------- my equipment (OP-IDN-065)

create function identity.current_available_equipment(p_person_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog
as $function$
  select jsonb_build_object(
    'equipment',
    coalesce(jsonb_agg(claim.value_text order by claim.value_text), '[]'::jsonb)
  )
  from identity.fitness_profile_claims as claim
  where claim.person_id = p_person_id
    and claim.attribute_code = 'available_equipment'
    and claim.valid_to is null
    and claim.provenance = 'person_declared'
$function$;

alter function identity.current_available_equipment(uuid) owner to allfit_owner;
revoke all on function identity.current_available_equipment(uuid) from public, allfit_api;

-- The shape of `declare_focus_areas`: the whole set, sealing what left and keeping what stayed.
create function identity.declare_available_equipment(
  p_provider text,
  p_issuer text,
  p_subject text,
  p_equipment text[],
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
  allowed text[];
  requested text[];
  repeated boolean;
begin
  person := identity.require_space_person(p_provider, p_issuer, p_subject);

  -- Validated before the key, so an invalid set cannot burn it.
  if coalesce(cardinality(p_equipment), 0) = 0 or array_position(p_equipment, null) is not null then
    raise exception 'the equipment needs at least one piece' using errcode = '22023';
  end if;

  select array_agg(piece order by piece), count(*) <> count(distinct piece)
  into requested, repeated
  from unnest(p_equipment) as incoming(piece);

  select attribute.allowed_values into allowed
  from identity.profile_attributes as attribute
  where attribute.code = 'available_equipment';

  if repeated or not (requested operator(pg_catalog.<@) allowed) then
    raise exception 'every piece once, and from the list' using errcode = '22023';
  end if;

  select * into receipt
  from system.begin_idempotency(
    person, 'space'::system.command_surface, 'space',
    'OP-IDN-065', p_idempotency_key, p_command_id, p_request_hash
  );
  if not receipt.claimed then
    return query select identity.current_available_equipment(person), true;
    return;
  end if;

  -- Two different sets for the same person do not interleave; the last one wins.
  perform 1 from identity.people as owner where owner.id = person for no key update;

  -- Nothing replaced a piece she no longer has, so it is sealed without a successor.
  update identity.fitness_profile_claims as claim
  set valid_to = clock_timestamp()
  where claim.person_id = person
    and claim.attribute_code = 'available_equipment'
    and claim.provenance = 'person_declared'
    and claim.valid_to is null
    and not (claim.value_text operator(pg_catalog.=) any (requested));

  insert into identity.fitness_profile_claims (
    id, person_id, attribute_code, value_text, provenance, captured_by_kind
  )
  select extensions.uuid_generate_v7(), person, 'available_equipment', incoming.piece,
         'person_declared', 'person'
  from unnest(requested) as incoming(piece)
  where not exists (
    select 1
    from identity.fitness_profile_claims as live
    where live.person_id = person
      and live.attribute_code = 'available_equipment'
      and live.provenance = 'person_declared'
      and live.valid_to is null
      and live.value_text = incoming.piece
  );

  perform system.finish_idempotency(
    receipt.receipt_id, 200::smallint, 'available-equipment-declared', 'person', person
  );
  return query select identity.current_available_equipment(person), false;
end
$function$;

alter function identity.declare_available_equipment(text, text, text, text[], uuid, uuid, bytea)
  owner to allfit_owner;
revoke all on function identity.declare_available_equipment(text, text, text, text[], uuid, uuid, bytea)
  from public;
grant execute on function identity.declare_available_equipment(text, text, text, text[], uuid, uuid, bytea)
  to allfit_api;

-- ---------------------------------------------------------------- my phone (OP-IDN-021, ADR-050)

drop index identity.uidx_people_contact_phone;
create unique index uidx_people_contact_phone
  on identity.people (contact_phone)
  where contact_phone_verified_at is not null;

create function identity.correct_own_phone(
  p_provider text,
  p_issuer text,
  p_subject text,
  p_phone text,
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
  number text := nullif(regexp_replace(coalesce(p_phone, ''), '[[:space:]().-]', '', 'g'), '');
begin
  person := identity.require_space_person(p_provider, p_issuer, p_subject);

  if number is not null and number !~ '^\+[1-9][0-9]{7,14}$' then
    raise exception 'a phone is E.164: a plus, the country code and the number' using errcode = '22023';
  end if;

  select * into receipt
  from system.begin_idempotency(
    person, 'space'::system.command_surface, 'space',
    'OP-IDN-021', p_idempotency_key, p_command_id, p_request_hash
  );

  if receipt.claimed then
    -- A new number keeps no verification of the old one.
    update identity.people as owner
    set contact_phone = number,
        contact_phone_verified_at = case when owner.contact_phone is not distinct from number
                                         then owner.contact_phone_verified_at end
    where owner.id = person;

    perform system.finish_idempotency(
      receipt.receipt_id, 200::smallint, 'own-phone-corrected', 'person', person
    );
  end if;

  return query
  select jsonb_build_object(
           'number', owner.contact_phone,
           'verified', owner.contact_phone_verified_at is not null
         ),
         not receipt.claimed
  from identity.people as owner
  where owner.id = person;
end
$function$;

alter function identity.correct_own_phone(text, text, text, text, uuid, uuid, bytea)
  owner to allfit_owner;
revoke all on function identity.correct_own_phone(text, text, text, text, uuid, uuid, bytea)
  from public;
grant execute on function identity.correct_own_phone(text, text, text, text, uuid, uuid, bytea)
  to allfit_api;
