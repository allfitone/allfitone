-- Organization content stays inside the organization (HU-STUDIO-036..045, STUDIO-29..36).
--
-- An audit of the Studio content stories found four defects, fixed here.
--
-- 1. The two guards every program composition goes through, `program_content_errors`
--    and `lock_program_template_versions`, accept any routine the actor owns. That is
--    right for a person's own program (called with no organization), but the Studio
--    commands call them with an organization too, so a coach could put her private
--    Space routine into her gym's program. V1 shares no content between owners, and
--    once a gym can assign programs that routine would reach its clients. The actor's
--    own routines now count only when there is no organization.
-- 2. Editing a derived draft cleared `derived_from_version_id`, so a variant almost
--    never recorded where it came from (ADR-009: an adaptation keeps its source). The
--    draft now keeps it through edits; publishing a new version hands it to that
--    version and the draft goes on from there, as an ordinary draft does.
-- 3. A published program version stored `repeats_forever` and no projection returned
--    it. It is part of the version, so `program_version_projection` carries it.
-- 4. Publishing a program pointed `Location` at a version nobody could read.
--    `read_organization_program_version` is that read (OP-PLN-021): audited,
--    organization only, and absent and forbidden answer alike. Space already owns
--    `read_program_version`, a different read with another shape.
--
-- Also: `planning.planned_sets` had a direct grant to `allfit_api` that no policy
-- for that role backs. Runtime reaches it through closed functions only.
--
-- Data written before this migration is not rewritten. Published versions are
-- immutable, and a draft holding a personal routine fails validation on its next
-- edit or publication until the routine is taken out. The block at the end counts
-- what exists so the deployment log says whether anybody is affected.

set lock_timeout = '5s';
set statement_timeout = '60s';

CREATE OR REPLACE FUNCTION planning.program_content_errors(p_content jsonb, p_organization_id uuid, p_require_publishable boolean)
 RETURNS text[]
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  errors text[] := array[]::text[];
  session jsonb;
  template_status catalog.publication_status;
begin
  if jsonb_typeof(p_content) <> 'object'
     or not p_content ?& array['title', 'sessions']
     or p_content - array['title', 'notes', 'sessions', 'repeats_forever'] <> '{}'::jsonb
     or jsonb_typeof(p_content->'title') <> 'string'
     or btrim(p_content->>'title') = ''
     or char_length(p_content->>'title') > 160
     or jsonb_typeof(p_content->'sessions') <> 'array' then
    return array['invalid-content-shape'];
  end if;
  if p_content ? 'notes'
     and jsonb_typeof(p_content->'notes') not in ('string', 'null') then
    errors := array_append(errors, 'notes');
  elsif jsonb_typeof(p_content->'notes') = 'string'
        and char_length(p_content->>'notes') > 2000 then
    errors := array_append(errors, 'notes');
  end if;
  -- Absent means `false`; present means a boolean and nothing else.
  if p_content ? 'repeats_forever'
     and jsonb_typeof(p_content->'repeats_forever') <> 'boolean' then
    errors := array_append(errors, 'repeats_forever');
  end if;
  if jsonb_array_length(p_content->'sessions') > 730 then
    return array_append(errors, 'sessions');
  end if;
  if p_require_publishable and jsonb_array_length(p_content->'sessions') = 0 then
    errors := array_append(errors, 'sessions');
  end if;
  for session in select value from jsonb_array_elements(p_content->'sessions') loop
    if jsonb_typeof(session) <> 'object'
       or not session ?& array['position', 'week', 'day', 'template_version_id']
       or session - array['position', 'week', 'day', 'template_version_id'] <> '{}'::jsonb
       or jsonb_typeof(session->'position') <> 'number'
       or jsonb_typeof(session->'week') <> 'number'
       or jsonb_typeof(session->'day') <> 'number'
       or jsonb_typeof(session->'template_version_id') <> 'string'
       or session->>'position' !~ '^[1-9][0-9]*$'
       or (session->>'position')::numeric > 730
       or session->>'week' !~ '^[1-9][0-9]*$'
       or (session->>'week')::numeric > 104
       or session->>'day' !~ '^[1-7]$'
       or session->>'template_version_id' !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
      errors := array_append(errors, 'session-shape');
      continue;
    end if;
    select version.status into template_status
    from planning.session_template_versions as version
    join planning.session_templates as template on template.id = version.template_id
    where version.id = (session->>'template_version_id')::uuid
      and (template.content_scope = 'global'
        or template.owner_organization_id = p_organization_id
        -- The actor's own routines belong in her own program, never in an organization's.
        or (p_organization_id is null and template.owner_person_id = access_control.person()));
    if template_status is null then
      errors := array_append(errors, 'template-version');
    end if;
  end loop;
  if exists (
    select item.value->>'position'
    from jsonb_array_elements(p_content->'sessions') as item(value)
    group by item.value->>'position'
    having count(*) > 1
  ) then
    errors := array_append(errors, 'duplicate-session-position');
  end if;
  return errors;
exception when others then
  return array_append(errors, 'invalid-content-value');
end
$function$;

create or replace function planning.lock_program_template_versions(p_content jsonb, p_organization_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
begin
  if jsonb_typeof(p_content) <> 'object'
     or jsonb_typeof(p_content->'sessions') <> 'array' then
    return;
  end if;

  -- Locks exactly the versions `program_content_errors` is about to accept.
  perform 1
  from planning.session_template_versions as version
  join planning.session_templates as template on template.id = version.template_id
  where (template.content_scope = 'global'
      or template.owner_organization_id = p_organization_id
      or (p_organization_id is null and template.owner_person_id = access_control.person()))
    and version.id in (
      select distinct (session.value->>'template_version_id')::uuid
      from jsonb_array_elements(p_content->'sessions') as session(value)
      where jsonb_typeof(session.value) = 'object'
        and jsonb_typeof(session.value->'template_version_id') = 'string'
        and session.value->>'template_version_id'
          ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    )
  order by version.id
  for no key update of version;
end
$function$;

create or replace function planning.replace_session_template_draft(
  p_person_id uuid,
  p_organization_id uuid,
  p_template_id uuid,
  p_expected_etag text,
  p_content jsonb,
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
  draft planning.session_template_drafts%rowtype;
  discipline_code text;
  errors text[];
begin
  perform planning.assert_manage_content(p_person_id, p_organization_id);
  select * into receipt from system.begin_idempotency(
    p_person_id, 'OP-PLN-002', p_idempotency_key, p_command_id, p_request_hash
  );
  if not receipt.claimed then
    return query select planning.session_draft_projection(receipt.aggregate_id), true;
    return;
  end if;
  select existing_draft.*
  into draft
  from planning.session_template_drafts as existing_draft
  join planning.session_templates as template on template.id = existing_draft.template_id
  where template.id = p_template_id
    and template.owner_organization_id = p_organization_id
  for update of existing_draft;
  if draft.id is null then raise exception 'template not found' using errcode = 'P0002'; end if;
  select template.discipline_code into discipline_code
  from planning.session_templates as template where template.id = p_template_id;

  if planning.content_etag(draft.content) <> p_expected_etag then
    raise exception 'stale-draft' using errcode = '40001', detail = planning.session_draft_projection(draft.id)::text;
  end if;
  errors := planning.session_content_errors(p_content, p_organization_id, discipline_code, false);
  if cardinality(errors) > 0 then
    raise exception 'invalid session template draft' using errcode = '22023', detail = to_json(errors)::text;
  end if;

  -- An edit is how a variant gets made, so it keeps the version the draft came from.
  if draft.content is distinct from p_content then
    update planning.session_template_drafts
    set content = p_content, updated_at = clock_timestamp()
    where id = draft.id;
    update planning.session_templates set updated_at = clock_timestamp() where id = p_template_id;
    perform system.enqueue_outbox_event(
      'session_template', p_template_id, 'planning.session_template_draft_updated.v1',
      jsonb_build_object('template_id', p_template_id, 'draft_id', draft.id)
    );
  end if;
  perform system.finish_idempotency(receipt.receipt_id, 200::smallint, 'session-template-draft-updated', 'session_template_draft', draft.id);
  return query select planning.session_draft_projection(draft.id), false;
end
$function$;

CREATE OR REPLACE FUNCTION planning.publish_session_template_version(p_person_id uuid, p_organization_id uuid, p_template_id uuid, p_expected_etag text, p_idempotency_key uuid, p_command_id uuid, p_request_hash bytea)
 RETURNS TABLE(result jsonb, replayed boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  receipt record;
  draft planning.session_template_drafts%rowtype;
  template planning.session_templates%rowtype;
  errors text[];
  canonical_content jsonb;
  version_content_hash bytea;
  version_id uuid;
  next_version integer;
  step jsonb;
  step_id uuid;
begin
  perform planning.assert_manage_content(p_person_id, p_organization_id);
  select * into receipt from system.begin_idempotency(
    p_person_id, 'OP-PLN-003', p_idempotency_key, p_command_id, p_request_hash
  );
  if not receipt.claimed then
    return query select planning.session_version_projection(receipt.aggregate_id), true;
    return;
  end if;
  select parent.* into template
  from planning.session_templates as parent
  where parent.id = p_template_id and parent.owner_organization_id = p_organization_id
  for update of parent;
  select current_draft.* into draft
  from planning.session_template_drafts as current_draft
  where current_draft.template_id = p_template_id
  for update of current_draft;
  if template.id is null then raise exception 'template not found' using errcode = 'P0002'; end if;

  if planning.content_etag(draft.content) <> p_expected_etag then
    raise exception 'stale-draft' using errcode = '40001', detail = planning.session_draft_projection(draft.id)::text;
  end if;
  errors := planning.session_content_errors(draft.content, p_organization_id, template.discipline_code, true);
  if cardinality(errors) > 0 then
    raise exception 'incomplete session template draft' using errcode = '22023', detail = to_json(errors)::text;
  end if;

  canonical_content := planning.canonical_session_content(draft.content);
  version_content_hash := extensions.digest(convert_to(canonical_content::text, 'UTF8'), 'sha256');
  -- Only the latest version converges: undoing a change moves history forward, and an
  -- older identifier would leave program weeks pointing at a version no library names.
  select latest.id into version_id
  from (
    select version.id, version.content_hash, version.status
    from planning.session_template_versions as version
    where version.template_id = p_template_id
    order by version.version_number desc
    limit 1
  ) as latest
  where latest.content_hash = version_content_hash and latest.status = 'published';
  if version_id is null then
    select coalesce(max(version.version_number), 0) + 1 into next_version
    from planning.session_template_versions as version where version.template_id = p_template_id;
    insert into planning.session_template_versions (
      template_id, version_number, discipline_code, activity_type_id,
      derived_from_version_id, title, content_hash
    ) values (
      p_template_id, next_version, template.discipline_code,
      (canonical_content->>'activity_type_id')::uuid, draft.derived_from_version_id,
      canonical_content->>'title',
      version_content_hash
    ) returning id into version_id;
    -- The new version now carries the source; the draft goes on from this version.
    update planning.session_template_drafts set derived_from_version_id = null where id = draft.id;

    perform set_config('app.planning_publication', 'true', true);
    for step in select value from jsonb_array_elements(canonical_content->'steps') order by (value->>'position')::integer loop
      insert into planning.planned_steps (
        template_version_id, position, movement_id, activity_type_id, notes, superset_group
      ) values (
        version_id, (step->>'position')::integer,
        nullif(step->>'movement_id', '')::uuid,
        nullif(step->>'activity_type_id', '')::uuid,
        nullif(step->>'notes', ''),
        nullif(step->>'superset_group', '')::smallint
      ) returning id into step_id;
      perform planning.materialize_target(step_id, step->'target');
    end loop;
    update planning.session_templates set status = 'published', updated_at = clock_timestamp() where id = p_template_id;
    perform system.enqueue_outbox_event(
      'session_template_version', version_id, 'planning.session_template_version_published.v1',
      jsonb_build_object('template_id', p_template_id, 'version_id', version_id, 'version_number', next_version)
    );
  end if;
  perform system.finish_idempotency(receipt.receipt_id, 201::smallint, 'session-template-version-published', 'session_template_version', version_id);
  return query select planning.session_version_projection(version_id), false;
end
$function$;

create or replace function planning.program_version_projection(p_version_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog
as $function$
  select jsonb_build_object(
    'id', version.id,
    'program_id', version.program_id,
    'version_number', version.version_number,
    'status', version.status,
    'title', version.title,
    'notes', version.notes,
    'repeats_forever', version.repeats_forever,
    'published_at', version.published_at,
    'session_count', count(session.id),
    'deprecated_template_version_ids', coalesce(jsonb_agg(distinct session.template_version_id order by session.template_version_id)
      filter (where template_version.status = 'deprecated'), '[]'::jsonb),
    'sessions', coalesce(jsonb_agg(jsonb_build_object(
      'position', session.position,
      'week', session.week,
      'day', session.day,
      'template_version_id', session.template_version_id
    ) order by session.position) filter (where session.id is not null), '[]'::jsonb)
  )
  from planning.program_versions as version
  left join planning.program_version_sessions as session on session.program_version_id = version.id
  left join planning.session_template_versions as template_version on template_version.id = session.template_version_id
  where version.id = p_version_id
  group by version.id
$function$;

-- `OP-PLN-021` in Studio for a program: the read `Location` names after publishing.
create function planning.read_organization_program_version(
  p_person_id uuid,
  p_organization_id uuid,
  p_program_id uuid,
  p_version_number integer
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog
as $function$
declare
  version_id uuid;
begin
  perform planning.audit_organization_read(p_person_id, p_organization_id);
  select version.id into version_id
  from planning.program_versions as version
  join planning.programs as program on program.id = version.program_id
  where program.id = p_program_id
    and program.owner_organization_id = p_organization_id
    and version.version_number = p_version_number;
  if version_id is null then raise exception 'program version not found' using errcode = 'P0002'; end if;
  return planning.program_version_projection(version_id);
end
$function$;

alter function planning.read_organization_program_version(uuid, uuid, uuid, integer) owner to allfit_owner;
revoke all on function planning.read_organization_program_version(uuid, uuid, uuid, integer) from public;
grant execute on function planning.read_organization_program_version(uuid, uuid, uuid, integer) to allfit_api;

revoke select, insert on planning.planned_sets from allfit_api;

-- Counts only; see the header. OPERATIONS.md says what to do when either is not zero.
do $$
declare
  affected_drafts integer;
  affected_versions integer;
begin
  select count(*) into affected_drafts
  from planning.program_drafts as draft
  join planning.programs as program on program.id = draft.program_id
  where program.owner_organization_id is not null
    and exists (
      select 1
      from jsonb_array_elements(case when jsonb_typeof(draft.content->'sessions') = 'array'
                                     then draft.content->'sessions' else '[]'::jsonb end) as session
      join planning.session_template_versions as version
        on version.id::text = session->>'template_version_id'
      join planning.session_templates as template on template.id = version.template_id
      where template.owner_person_id is not null
    );
  select count(distinct version.id) into affected_versions
  from planning.program_versions as version
  join planning.programs as program on program.id = version.program_id
  join planning.program_version_sessions as session on session.program_version_id = version.id
  join planning.session_template_versions as template_version on template_version.id = session.template_version_id
  join planning.session_templates as template on template.id = template_version.template_id
  where program.owner_organization_id is not null
    and template.owner_person_id is not null;
  if affected_drafts > 0 or affected_versions > 0 then
    raise warning 'organization programs holding personal routines: % drafts, % published versions',
      affected_drafts, affected_versions;
  end if;
end
$$;
