-- HU-STUDIO-051..053 (OP-IDN-018..020) and HU-SP-025 criterion 4 — the coach who attends a
-- person reads her training profile, her body progress and her health context, and only the
-- photos she chose to show that gym.
--
-- **Each read answers to one category and to the version she accepted.** The coach must
-- attend her (the holder or an accepted cover: `execution.require_attending_coach`), the
-- category must be shared with that relationship (`access_control.grant_of`), and the fields
-- served are the ones the grant's own scope version names in `privacy.scope_resource_rules`,
-- not the latest published one (ADR-016). A field the version leaves out comes back null,
-- exactly like one never captured; a row is listed only when the field that names it is
-- shared. `privacy.scope_allows` is that check, and these are its first readers.
--
-- Nothing shared answers `scope_required` naming the category, and the attempt stays on her
-- record like every read: an access event is written before any data, and a refused one too.
--
-- **A body photo stays hers unless she shows it to one gym.** `identity.body_photo_shares`
-- holds that choice per photo and per relationship; deleting the photo takes its shares
-- with it. `identity.body_photos` keeps its policy that only she reads it, and gains one
-- exception: inside the contract scope `body_photo_review`, opened only by the two reads
-- below for one relationship, a photo shared with that relationship under a live
-- `body_progress` grant is visible. The shares table opens the same way, so the photo policy
-- can see them under FORCE ROW LEVEL SECURITY; no read returns a share to a gym. The object
-- key never leaves the API: it streams the bytes to Studio after this database said yes.
--
-- The training profile is the person's training attributes, claim by claim with the origin
-- of each (`provenance`), and her biological sex, classified `training`. Nothing classified
-- body or health is in it.

set lock_timeout = '5s';
set statement_timeout = '60s';

-- ---------------------------------------------------------------------------
-- What a version shares, field by field
-- ---------------------------------------------------------------------------

-- A rule for the field, or for the whole resource, shares it; an exclusion of either wins.
create function privacy.scope_allows(p_scope_definition_id uuid, p_resource text, p_field text)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $function$
  select exists (
           select 1 from privacy.scope_resource_rules as rule
           where rule.scope_definition_id = p_scope_definition_id
             and rule.resource = p_resource
             and rule.field in (p_field, '*')
             and not rule.is_excluded
         )
     and not exists (
           select 1 from privacy.scope_resource_rules as rule
           where rule.scope_definition_id = p_scope_definition_id
             and rule.resource = p_resource
             and rule.field in (p_field, '*')
             and rule.is_excluded
         )
$function$;

alter function privacy.scope_allows(uuid, text, text) owner to allfit_owner;
revoke all on function privacy.scope_allows(uuid, text, text) from public, allfit_api;

-- The grant behind one category, the version it points at and that version's number.
create function identity.shared_scope(p_relationship_id uuid, p_scope_code text)
returns table (grant_id uuid, scope_definition_id uuid, scope_version integer)
language sql
stable
security definer
set search_path = pg_catalog
as $function$
  select shared.grant_id, shared.scope_definition_id, definition.version_number
  from access_control.grant_of(p_relationship_id, p_scope_code) as shared
  left join privacy.scope_definitions as definition on definition.id = shared.scope_definition_id
  limit 1
$function$;

alter function identity.shared_scope(uuid, text) owner to allfit_owner;
revoke all on function identity.shared_scope(uuid, text) from public, allfit_api;

-- The training category now carries her profile, so whoever is asked to accept it reads so.
update privacy.scope_presentations
set description = 'Tu perfil de entrenamiento (objetivo, experiencia, disciplina, zonas de énfasis y sexo biológico) y las sesiones que te asignemos con sus resultados, solo las que ocurran dentro de esta relación. No incluye lo que entrenes por tu cuenta, ni tu cuerpo, ni tu salud.',
    summary = 'Su perfil de entrenamiento y las sesiones que le asignes, nada de lo que entrene por su cuenta.',
    updated_at = clock_timestamp()
where scope_code = 'relationship_training';

-- She can now choose which photos a gym sees (20261109090000 waited for this), so the
-- body category says so again, and still that the rest of her gallery stays hers.
update privacy.scope_presentations
set description = 'Medidas, composición corporal, tendencias y solo las fotos que tú elijas mostrarnos. No incluye el resto de tu galería, ni datos de salud.',
    summary = 'Medidas y solo las fotos que elija mostrarte, sin datos de salud.',
    updated_at = clock_timestamp()
where scope_code = 'body_progress';

-- ---------------------------------------------------------------------------
-- Which photo she shows to which gym
-- ---------------------------------------------------------------------------

alter table identity.body_photos
  add constraint uq_body_photos_person unique (id, person_id);

create table identity.body_photo_shares (
  id uuid not null default extensions.uuid_generate_v7(),
  person_id uuid not null,
  body_photo_id uuid not null,
  relationship_id uuid not null,
  status text not null default 'shared',
  shared_at timestamptz not null default clock_timestamp(),
  withdrawn_at timestamptz,
  constraint pk_body_photo_shares primary key (id),
  constraint uq_body_photo_shares_pair unique (body_photo_id, relationship_id),
  -- The photo and the relationship belong to whoever shows it; the photo takes its shares.
  constraint fk_body_photo_shares_photo foreign key (body_photo_id, person_id) references identity.body_photos (id, person_id) on delete cascade,
  constraint fk_body_photo_shares_relationship foreign key (relationship_id, person_id) references relationships.service_relationships (id, person_id) on delete restrict,
  constraint ck_body_photo_shares_status check (status in ('shared', 'withdrawn')),
  constraint ck_body_photo_shares_withdrawn check ((status = 'withdrawn') = (withdrawn_at is not null))
);

create index idx_body_photo_shares_relationship on identity.body_photo_shares (relationship_id, status);
create index idx_body_photo_shares_person on identity.body_photo_shares (person_id);

alter table identity.body_photo_shares owner to allfit_owner;
alter table identity.body_photo_shares enable row level security;
alter table identity.body_photo_shares force row level security;

create policy body_photo_shares_all_self on identity.body_photo_shares
  for all to allfit_owner
  using (access_control.is_self(person_id))
  with check (access_control.is_self(person_id));
-- Only so the photo policy can see what she shows this relationship; no read returns one.
create policy body_photo_shares_select_review on identity.body_photo_shares
  for select to allfit_owner
  using (relationship_id::text = (select access_control.contract_scope('body_photo_review')));

revoke all on identity.body_photo_shares from public, allfit_api;

-- Inside a review only, and only what she shows that relationship while it shares her body.
create policy body_photos_select_review on identity.body_photos
  for select to allfit_owner
  using (
    exists (
      select 1
      from identity.body_photo_shares as share
      where share.body_photo_id = body_photos.id
        and share.status = 'shared'
        and share.relationship_id = (select access_control.contract_scope('body_photo_review'))::uuid
        and access_control.can_access(share.relationship_id, 'body_progress', 'read')
    )
  );

create function identity.body_photo_share_document(p_body_photo_id uuid, p_relationship_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog
as $function$
  select jsonb_build_object(
    'body_photo_id', share.body_photo_id,
    'relationship_id', share.relationship_id,
    'organization', jsonb_build_object('id', organization.id, 'display_name', organization.display_name),
    'status', share.status,
    'shared_at', share.shared_at,
    'withdrawn_at', share.withdrawn_at
  )
  from identity.body_photo_shares as share
  join relationships.service_relationships as relationship on relationship.id = share.relationship_id
  join organizations.organizations as organization on organization.id = relationship.organization_id
  where share.body_photo_id = p_body_photo_id
    and share.relationship_id = p_relationship_id
$function$;

alter function identity.body_photo_share_document(uuid, uuid) owner to allfit_owner;
revoke all on function identity.body_photo_share_document(uuid, uuid) from public, allfit_api;

-- OP-IDN-061. Her photo, to one of her live relationships, held so a termination waits or is
-- seen; showing what is shown converges. Not Pro: she decides about a photo she already has.
create function identity.share_body_photo(
  p_person_id uuid,
  p_body_photo_id uuid,
  p_relationship_id uuid,
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
  subject record;
  share_id uuid;
  previous_status text;
begin
  if access_control.actor_kind() is distinct from 'person'
     or access_control.person() is distinct from p_person_id then
    raise exception 'person actor mismatch' using errcode = '42501';
  end if;

  select relationship.id, relationship.status into subject
  from relationships.service_relationships as relationship
  where relationship.id = p_relationship_id and relationship.person_id = p_person_id
  for share;
  if subject.id is null then
    raise exception 'relationship not found' using errcode = 'P0002';
  end if;
  -- Held too, so a deletion in flight is waited for and then reads as no photo.
  perform 1 from identity.body_photos as photo
  where photo.id = p_body_photo_id and photo.person_id = p_person_id
  for key share;
  if not found then
    raise exception 'body photo not found' using errcode = 'P0002';
  end if;

  select * into receipt from system.begin_idempotency(
    p_person_id, 'OP-IDN-061', p_idempotency_key, p_command_id, p_request_hash
  );
  if not receipt.claimed then
    return query select identity.body_photo_share_document(p_body_photo_id, p_relationship_id), true;
    return;
  end if;

  if subject.status <> 'active' then
    raise exception 'a photo is shown only to a live relationship' using errcode = '55000';
  end if;

  insert into identity.body_photo_shares (person_id, body_photo_id, relationship_id)
  values (p_person_id, p_body_photo_id, p_relationship_id)
  on conflict (body_photo_id, relationship_id) do nothing
  returning id into share_id;

  if share_id is null then
    select share.id, share.status into share_id, previous_status
    from identity.body_photo_shares as share
    where share.body_photo_id = p_body_photo_id and share.relationship_id = p_relationship_id
    for update;
    if previous_status = 'withdrawn' then
      update identity.body_photo_shares as share
      set status = 'shared', shared_at = clock_timestamp(), withdrawn_at = null
      where share.id = share_id;
    end if;
  end if;

  if previous_status is distinct from 'shared' then
    perform system.enqueue_outbox_event(
      'body_photo_share', share_id, 'identity.body_photo_shared.v1',
      jsonb_build_object('body_photo_id', p_body_photo_id, 'relationship_id', p_relationship_id)
    );
  end if;

  perform system.finish_idempotency(
    receipt.receipt_id, 200::smallint, 'body-photo-shared', 'body_photo_share', share_id
  );
  return query select identity.body_photo_share_document(p_body_photo_id, p_relationship_id), false;
end
$function$;

alter function identity.share_body_photo(uuid, uuid, uuid, uuid, uuid, bytea) owner to allfit_owner;
revoke all on function identity.share_body_photo(uuid, uuid, uuid, uuid, uuid, bytea) from public;
grant execute on function identity.share_body_photo(uuid, uuid, uuid, uuid, uuid, bytea) to allfit_api;

-- OP-IDN-062. Stops showing it from now on, even to a relationship that already ended. A
-- coach who saw it keeps the record that he did, never the photo.
create function identity.withdraw_body_photo_share(
  p_person_id uuid,
  p_body_photo_id uuid,
  p_relationship_id uuid,
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
  existing record;
begin
  if access_control.actor_kind() is distinct from 'person'
     or access_control.person() is distinct from p_person_id then
    raise exception 'person actor mismatch' using errcode = '42501';
  end if;

  select share.id, share.status into existing
  from identity.body_photo_shares as share
  where share.body_photo_id = p_body_photo_id
    and share.relationship_id = p_relationship_id
    and share.person_id = p_person_id
  for update;
  if existing.id is null then
    raise exception 'body photo share not found' using errcode = 'P0002';
  end if;

  select * into receipt from system.begin_idempotency(
    p_person_id, 'OP-IDN-062', p_idempotency_key, p_command_id, p_request_hash
  );
  if not receipt.claimed then
    return query select identity.body_photo_share_document(p_body_photo_id, p_relationship_id), true;
    return;
  end if;

  if existing.status = 'shared' then
    update identity.body_photo_shares as share
    set status = 'withdrawn', withdrawn_at = clock_timestamp()
    where share.id = existing.id;

    perform system.enqueue_outbox_event(
      'body_photo_share', existing.id, 'identity.body_photo_share_withdrawn.v1',
      jsonb_build_object('body_photo_id', p_body_photo_id, 'relationship_id', p_relationship_id)
    );
  end if;

  perform system.finish_idempotency(
    receipt.receipt_id, 200::smallint, 'body-photo-share-withdrawn', 'body_photo_share', existing.id
  );
  return query select identity.body_photo_share_document(p_body_photo_id, p_relationship_id), false;
end
$function$;

alter function identity.withdraw_body_photo_share(uuid, uuid, uuid, uuid, uuid, bytea) owner to allfit_owner;
revoke all on function identity.withdraw_body_photo_share(uuid, uuid, uuid, uuid, uuid, bytea) from public;
grant execute on function identity.withdraw_body_photo_share(uuid, uuid, uuid, uuid, uuid, bytea) to allfit_api;

-- OP-IDN-058, the body of 20261103030400 plus whom she shows each photo to.
create or replace function identity.list_my_body_photos(p_person_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $function$
begin
  if access_control.actor_kind() <> 'person' or access_control.person() <> p_person_id then
    raise exception 'body photos are read only by their own person' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', photo.id, 'taken_on', photo.taken_on, 'media_ref', photo.media_ref,
      'created_at', photo.created_at,
      'shared_with', coalesce((
        select jsonb_agg(jsonb_build_object(
          'relationship_id', share.relationship_id,
          'organization_name', organization.display_name,
          'shared_at', share.shared_at) order by share.shared_at, share.id)
        from identity.body_photo_shares as share
        join relationships.service_relationships as relationship on relationship.id = share.relationship_id
        join organizations.organizations as organization on organization.id = relationship.organization_id
        where share.body_photo_id = photo.id and share.status = 'shared'), '[]'::jsonb)
      ) order by photo.taken_on desc, photo.created_at desc)
    from identity.body_photos as photo
    where photo.person_id = p_person_id), '[]'::jsonb);
end
$function$;

-- ---------------------------------------------------------------------------
-- What the attending coach reads
-- ---------------------------------------------------------------------------

-- The opening every read shares: an audited request, the coach who attends her and the
-- category behind the read. Nothing shared is recorded as refused and answers no grant.
create function identity.open_client_category(
  p_person_id uuid,
  p_organization_id uuid,
  p_subject_person_id uuid,
  p_scope_code text,
  p_resource text,
  p_purpose text
)
returns table (relationship_id uuid, grant_id uuid, scope_definition_id uuid, scope_version integer)
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  attending record;
  shared record;
begin
  select * into attending
  from execution.require_attending_coach(p_person_id, p_organization_id, p_subject_person_id);
  if nullif(current_setting('app.request_id', true), '') is null then
    raise exception 'request id required for audited read' using errcode = '22023';
  end if;
  perform set_config('app.purpose', p_purpose, true);

  select * into shared from identity.shared_scope(attending.relationship_id, p_scope_code);
  if shared.grant_id is null then
    perform privacy.log_access_event(
      p_subject_person_id, null, attending.relationship_id, null, null, p_scope_code, null,
      'live', p_resource, 'denied'
    );
  else
    perform privacy.log_access_event(
      p_subject_person_id, null, attending.relationship_id, shared.grant_id, null,
      p_scope_code, shared.scope_version, 'live', p_resource, 'allowed'
    );
  end if;

  return query select attending.relationship_id, shared.grant_id, shared.scope_definition_id,
                      shared.scope_version;
end
$function$;

alter function identity.open_client_category(uuid, uuid, uuid, text, text, text) owner to allfit_owner;
revoke all on function identity.open_client_category(uuid, uuid, uuid, text, text, text) from public, allfit_api;

-- OP-IDN-018. Her training attributes claim by claim, each with its origin, and her sex.
create function identity.read_client_training_profile(
  p_person_id uuid,
  p_organization_id uuid,
  p_subject_person_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  opened record;
  definition uuid;
begin
  select * into opened from identity.open_client_category(
    p_person_id, p_organization_id, p_subject_person_id,
    'relationship_training', 'identity.fitness_profile_claims', 'studio_profile_review'
  );
  if opened.grant_id is null then
    return jsonb_build_object('outcome', 'scope_required', 'scope', 'relationship_training');
  end if;
  definition := opened.scope_definition_id;

  return jsonb_build_object(
    'outcome', 'found',
    'scope_version', opened.scope_version,
    'biological_sex', (
      select case when person.biological_sex is not null
                   and privacy.scope_allows(definition, 'identity.people', 'biological_sex')
                  then jsonb_build_object('value', person.biological_sex, 'provenance', 'person_declared')
             end
      from identity.people as person
      where person.id = p_subject_person_id
    ),
    'attributes', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', claim.id,
        'attribute_code', claim.attribute_code,
        'value_text', case when privacy.scope_allows(definition, 'identity.fitness_profile_claims', 'value_text')
                           then claim.value_text end,
        'value_numeric', case when privacy.scope_allows(definition, 'identity.fitness_profile_claims', 'value_numeric')
                              then claim.value_numeric end,
        'unit_code', case when privacy.scope_allows(definition, 'identity.fitness_profile_claims', 'unit_code')
                          then claim.unit_code end,
        'provenance', case when privacy.scope_allows(definition, 'identity.fitness_profile_claims', 'provenance')
                           then claim.provenance end,
        'valid_from', case when privacy.scope_allows(definition, 'identity.fitness_profile_claims', 'valid_from')
                           then claim.valid_from end
      ) order by claim.attribute_code, claim.valid_from desc, claim.id desc)
      from identity.fitness_profile_claims as claim
      join identity.profile_attributes as attribute on attribute.code = claim.attribute_code
      where claim.person_id = p_subject_person_id
        and claim.valid_to is null
        and attribute.data_classification_code = 'training'
        and privacy.scope_allows(definition, 'identity.fitness_profile_claims', 'attribute_code')
    ), '[]'::jsonb)
  );
end
$function$;

alter function identity.read_client_training_profile(uuid, uuid, uuid) owner to allfit_owner;
revoke all on function identity.read_client_training_profile(uuid, uuid, uuid) from public;
grant execute on function identity.read_client_training_profile(uuid, uuid, uuid) to allfit_api;

-- OP-IDN-019. Her measurements, newest first, a page at a time on (day, id). A version that
-- hides the day shares no measurement: the page boundary would give it away.
create function identity.list_client_body_progress(
  p_person_id uuid,
  p_organization_id uuid,
  p_subject_person_id uuid,
  p_limit integer,
  p_cursor_measured_on date,
  p_cursor_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  opened record;
  definition uuid;
begin
  select * into opened from identity.open_client_category(
    p_person_id, p_organization_id, p_subject_person_id,
    'body_progress', 'identity.body_progress_records', 'studio_body_review'
  );
  if opened.grant_id is null then
    return jsonb_build_object('outcome', 'scope_required', 'scope', 'body_progress');
  end if;
  definition := opened.scope_definition_id;

  return jsonb_build_object(
    'outcome', 'found',
    'scope_version', opened.scope_version,
    'items', coalesce((
      select jsonb_agg(page.item order by page.measured_on desc, page.id desc)
      from (
        select record.id, record.measured_on, jsonb_build_object(
          'id', record.id,
          'metric_code', record.metric_code,
          'value', case when privacy.scope_allows(definition, 'identity.body_progress_records', 'value_numeric')
                        then record.value_numeric end,
          'unit_code', case when privacy.scope_allows(definition, 'identity.body_progress_records', 'unit_code')
                            then record.unit_code end,
          'original_value', case when privacy.scope_allows(definition, 'identity.body_progress_records', 'original_value')
                                 then record.original_value end,
          'original_unit_code', case when privacy.scope_allows(definition, 'identity.body_progress_records', 'original_unit_code')
                                     then record.original_unit_code end,
          'measured_on', record.measured_on
        ) as item
        from identity.body_progress_records as record
        where record.person_id = p_subject_person_id
          and privacy.scope_allows(definition, 'identity.body_progress_records', 'metric_code')
          and privacy.scope_allows(definition, 'identity.body_progress_records', 'measured_on')
          and (p_cursor_measured_on is null
               or (record.measured_on, record.id) < (p_cursor_measured_on, p_cursor_id))
        order by record.measured_on desc, record.id desc
        limit least(greatest(coalesce(p_limit, 26), 1), 101)
      ) as page
    ), '[]'::jsonb)
  );
end
$function$;

alter function identity.list_client_body_progress(uuid, uuid, uuid, integer, date, uuid) owner to allfit_owner;
revoke all on function identity.list_client_body_progress(uuid, uuid, uuid, integer, date, uuid) from public;
grant execute on function identity.list_client_body_progress(uuid, uuid, uuid, integer, date, uuid) to allfit_api;

-- OP-IDN-020. What she declared, newest first, a page at a time on (millisecond, id); like
-- the measurements, nothing is shared by a version that hides since when.
create function identity.list_client_health_context(
  p_person_id uuid,
  p_organization_id uuid,
  p_subject_person_id uuid,
  p_limit integer,
  p_cursor_valid_from timestamptz,
  p_cursor_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  opened record;
  definition uuid;
begin
  select * into opened from identity.open_client_category(
    p_person_id, p_organization_id, p_subject_person_id,
    'health_context', 'identity.health_context_claims', 'studio_health_review'
  );
  if opened.grant_id is null then
    return jsonb_build_object('outcome', 'scope_required', 'scope', 'health_context');
  end if;
  definition := opened.scope_definition_id;

  return jsonb_build_object(
    'outcome', 'found',
    'scope_version', opened.scope_version,
    'items', coalesce((
      select jsonb_agg(page.item order by page.valid_ms desc, page.id desc)
      from (
        select claim.id, keyed.valid_ms, jsonb_build_object(
          'id', claim.id,
          'context_type', claim.context_type,
          'description', case when privacy.scope_allows(definition, 'identity.health_context_claims', 'description')
                              then claim.description end,
          'body_area', case when privacy.scope_allows(definition, 'identity.health_context_claims', 'body_area')
                            then claim.body_area end,
          'provenance', case when privacy.scope_allows(definition, 'identity.health_context_claims', 'provenance')
                             then claim.provenance end,
          'valid_from', keyed.valid_ms,
          'valid_to', case when privacy.scope_allows(definition, 'identity.health_context_claims', 'valid_to')
                           then claim.valid_to end
        ) as item
        from identity.health_context_claims as claim
        cross join lateral (select date_trunc('milliseconds', claim.valid_from) as valid_ms) as keyed
        where claim.person_id = p_subject_person_id
          and privacy.scope_allows(definition, 'identity.health_context_claims', 'context_type')
          and privacy.scope_allows(definition, 'identity.health_context_claims', 'valid_from')
          and (p_cursor_valid_from is null
               or (keyed.valid_ms, claim.id) < (p_cursor_valid_from, p_cursor_id))
        order by keyed.valid_ms desc, claim.id desc
        limit least(greatest(coalesce(p_limit, 26), 1), 101)
      ) as page
    ), '[]'::jsonb)
  );
end
$function$;

alter function identity.list_client_health_context(uuid, uuid, uuid, integer, timestamptz, uuid) owner to allfit_owner;
revoke all on function identity.list_client_health_context(uuid, uuid, uuid, integer, timestamptz, uuid) from public;
grant execute on function identity.list_client_health_context(uuid, uuid, uuid, integer, timestamptz, uuid) to allfit_api;

-- OP-IDN-059. The photos she shows this gym, newest first, a page at a time on (day, id).
create function identity.list_client_shared_body_photos(
  p_person_id uuid,
  p_organization_id uuid,
  p_subject_person_id uuid,
  p_limit integer,
  p_cursor_taken_on date,
  p_cursor_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  opened record;
  definition uuid;
  items jsonb;
  previous_purpose text := current_setting('app.contract_scope_purpose', true);
  previous_id text := current_setting('app.contract_scope_id', true);
  previous_token text := current_setting('app.contract_scope_token', true);
begin
  select * into opened from identity.open_client_category(
    p_person_id, p_organization_id, p_subject_person_id,
    'body_progress', 'identity.body_photos', 'studio_body_review'
  );
  if opened.grant_id is null then
    return jsonb_build_object('outcome', 'scope_required', 'scope', 'body_progress');
  end if;
  definition := opened.scope_definition_id;

  perform access_control.open_contract_scope('body_photo_review', opened.relationship_id);
  select coalesce(jsonb_agg(page.item order by page.taken_on desc, page.id desc), '[]'::jsonb)
  into items
  from (
    select photo.id, photo.taken_on, jsonb_build_object(
      'id', photo.id,
      'taken_on', photo.taken_on,
      'shared_at', share.shared_at
    ) as item
    from identity.body_photos as photo
    join identity.body_photo_shares as share
      on share.body_photo_id = photo.id
     and share.relationship_id = opened.relationship_id
     and share.status = 'shared'
    where photo.person_id = p_subject_person_id
      and privacy.scope_allows(definition, 'identity.body_photos', 'media_ref')
      and privacy.scope_allows(definition, 'identity.body_photos', 'taken_on')
      and (p_cursor_taken_on is null or (photo.taken_on, photo.id) < (p_cursor_taken_on, p_cursor_id))
    order by photo.taken_on desc, photo.id desc
    limit least(greatest(coalesce(p_limit, 26), 1), 101)
  ) as page;
  perform planning.resume_contract_scope(previous_purpose, previous_id, previous_token);

  return jsonb_build_object('outcome', 'found', 'scope_version', opened.scope_version, 'items', items);
end
$function$;

alter function identity.list_client_shared_body_photos(uuid, uuid, uuid, integer, date, uuid) owner to allfit_owner;
revoke all on function identity.list_client_shared_body_photos(uuid, uuid, uuid, integer, date, uuid) from public;
grant execute on function identity.list_client_shared_body_photos(uuid, uuid, uuid, integer, date, uuid) to allfit_api;

-- OP-IDN-060. One shown photo, rechecked on every request and recorded every time. Only the
-- API learns where it is kept; anything short of a shown photo is not found.
create function identity.open_client_shared_body_photo(
  p_person_id uuid,
  p_organization_id uuid,
  p_subject_person_id uuid,
  p_body_photo_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  attending record;
  shared record;
  kept text;
  previous_purpose text := current_setting('app.contract_scope_purpose', true);
  previous_id text := current_setting('app.contract_scope_id', true);
  previous_token text := current_setting('app.contract_scope_token', true);
begin
  select * into attending
  from execution.require_attending_coach(p_person_id, p_organization_id, p_subject_person_id);
  if nullif(current_setting('app.request_id', true), '') is null then
    raise exception 'request id required for audited read' using errcode = '22023';
  end if;
  perform set_config('app.purpose', 'studio_body_review', true);

  select * into shared from identity.shared_scope(attending.relationship_id, 'body_progress');
  if shared.grant_id is not null
     and privacy.scope_allows(shared.scope_definition_id, 'identity.body_photos', 'media_ref')
     and privacy.scope_allows(shared.scope_definition_id, 'identity.body_photos', 'taken_on') then
    perform access_control.open_contract_scope('body_photo_review', attending.relationship_id);
    select photo.media_ref into kept
    from identity.body_photos as photo
    join identity.body_photo_shares as share
      on share.body_photo_id = photo.id
     and share.relationship_id = attending.relationship_id
     and share.status = 'shared'
    where photo.id = p_body_photo_id
      and photo.person_id = p_subject_person_id;
    perform planning.resume_contract_scope(previous_purpose, previous_id, previous_token);
  end if;

  perform privacy.log_access_event(
    p_subject_person_id, null, attending.relationship_id, shared.grant_id, null,
    'body_progress', shared.scope_version, 'live', 'identity.body_photos',
    case when kept is null then 'denied' else 'allowed' end
  );
  if kept is null then
    return jsonb_build_object('outcome', 'not_found');
  end if;
  return jsonb_build_object('outcome', 'found', 'media_ref', kept);
end
$function$;

alter function identity.open_client_shared_body_photo(uuid, uuid, uuid, uuid) owner to allfit_owner;
revoke all on function identity.open_client_shared_body_photo(uuid, uuid, uuid, uuid) from public;
grant execute on function identity.open_client_shared_body_photo(uuid, uuid, uuid, uuid) to allfit_api;
