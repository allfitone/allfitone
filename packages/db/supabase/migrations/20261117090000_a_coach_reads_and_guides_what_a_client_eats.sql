-- STUDIO-61..65 (HU-STUDIO-068..072, OP-NUT-009..013): the coach who attends a person
-- reads what she shares about what she eats, and proposes nutrition goals she decides.
--
-- What she eats stays hers, and forced row-level security still says so: every row a
-- coach reads passes a policy, never a definer that skips one.
--
--   · Reads need the coach's live assignment and her grant: `nutrition_intake` for meals
--     and daily totals, `nutrition_media` as well for a photo, `nutrition_guidance` for
--     goals. No credential: reading is following her, as with training and her body.
--     Each read opens the contract scope `nutrition_review` on the relationship, so the
--     review policies admit rows only inside these functions, and records itself first.
--   · A meal as Studio sees it never carries its storage key; the API serves the photo,
--     rechecked and recorded on every view (`open_client_meal_photo`).
--   · Proposing (OP-NUT-012) needs all three at once: `guide_nutrition`, a verified
--     `nutrition_professional` credential in force, and `nutrition_guidance` shared at
--     `contribute`. The base checks the credential again on the row itself (IX-31), so
--     no path writes a proposal without one. It never touches her active goal.
--   · IX-33: a relationship has one proposal waiting at most. A new one supersedes the
--     one waiting; ending the relationship cancels it, at the instant it ends.
--   · Her active goal shows to the coach with its targets only; who set it, why and
--     which number it is stay hers unless this relationship proposed it.
--   · Through a historical access case, what this relationship proposed by the cut and
--     what she had decided by then, in the fields the frozen version keeps readable.
--
-- Locks, in order: the relationship for share, the grant for share, then her goal set
-- for update. Deciding locks the goal set first and the version after; closing a
-- relationship takes the relationship first; revoking takes only the grant. No cycle.
set lock_timeout = '5s';
set statement_timeout = '60s';

begin;

-- ---------------------------------------------------------------------------
-- The nutrition credential
-- ---------------------------------------------------------------------------

insert into catalog.professional_credential_types (code, name, description, status, display_order)
values ('nutrition_professional', 'Profesional en nutrición',
        'Título o tarjeta profesional en nutrición y dietética, verificada por Allfit One.',
        'published', 40);

-- The verification that makes a person's credential of a type count now: the credential
-- is active and unexpired, and its latest decision is a verification inside its window.
create function identity.effective_credential_verification(p_person_id uuid, p_type text)
returns uuid
language sql
stable
security definer
set search_path = pg_catalog
as $function$
  select latest.id
  from identity.professional_profiles as profile
  join identity.professional_credentials as credential
    on credential.professional_profile_id = profile.id
   and credential.credential_type_code = p_type
   and credential.status = 'active'
   and (credential.expires_on is null or credential.expires_on >= current_date)
  cross join lateral (
    select verification.id, verification.result, verification.valid_from, verification.valid_to
    from identity.professional_credential_verifications as verification
    where verification.professional_credential_id = credential.id
    order by verification.decided_at desc, verification.id desc
    limit 1
  ) as latest
  where profile.person_id = p_person_id
    and latest.result = 'verified'
    and latest.valid_from <= clock_timestamp()
    and clock_timestamp() < latest.valid_to
  order by latest.valid_to desc, latest.id
  limit 1
$function$;

alter function identity.effective_credential_verification(uuid, text) owner to allfit_owner;
revoke all on function identity.effective_credential_verification(uuid, text) from public, allfit_api;

-- That one verification counts now for this person and type, so a row cannot cite a
-- credential that is somebody else's, of another kind, superseded or out of its window.
create function identity.credential_verification_is_effective(
  p_verification_id uuid,
  p_person_id uuid,
  p_type text
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $function$
  select exists (
    select 1
    from identity.professional_credential_verifications as verification
    join identity.professional_credentials as credential
      on credential.id = verification.professional_credential_id
    join identity.professional_profiles as profile on profile.id = credential.professional_profile_id
    where verification.id = p_verification_id
      and profile.person_id = p_person_id
      and credential.credential_type_code = p_type
      and credential.status = 'active'
      and (credential.expires_on is null or credential.expires_on >= current_date)
      and verification.result = 'verified'
      and verification.valid_from <= clock_timestamp()
      and clock_timestamp() < verification.valid_to
      and not exists (
        select 1
        from identity.professional_credential_verifications as later
        where later.professional_credential_id = credential.id
          and (later.decided_at, later.id) > (verification.decided_at, verification.id)
      )
  )
$function$;

alter function identity.credential_verification_is_effective(uuid, uuid, text) owner to allfit_owner;
revoke all on function identity.credential_verification_is_effective(uuid, uuid, text)
  from public, allfit_api;

-- ---------------------------------------------------------------------------
-- Scope helpers
-- ---------------------------------------------------------------------------

-- Functions with `set`, never inlined: each policy asks once per query, as an InitPlan.
create function nutrition.scoped_relationship(p_purpose text)
returns uuid
language sql
stable
set search_path = pg_catalog
as $function$
  select access_control.contract_scope(p_purpose)::uuid
$function$;

create function nutrition.scoped_subject(p_purpose text)
returns uuid
language sql
stable
set search_path = pg_catalog
as $function$
  select relationship.person_id
  from relationships.service_relationships as relationship
  where relationship.id = access_control.contract_scope(p_purpose)::uuid
$function$;

-- Whether the caller may see this version, by whichever policy admits it.
create function nutrition.goal_version_visible(p_goal_version_id uuid)
returns boolean
language sql
stable
set search_path = pg_catalog
as $function$
  select exists (select 1 from nutrition.goal_versions as version where version.id = p_goal_version_id)
$function$;

create function nutrition.goal_version_from(p_goal_version_id uuid, p_relationship_id uuid)
returns boolean
language sql
stable
set search_path = pg_catalog
as $function$
  select exists (
    select 1 from nutrition.goal_versions as version
    where version.id = p_goal_version_id and version.origin_relationship_id = p_relationship_id
  )
$function$;

-- The relationship of a proposal the actor is writing, still waiting; null otherwise.
create function nutrition.proposal_in_progress(p_goal_version_id uuid)
returns uuid
language sql
stable
set search_path = pg_catalog
as $function$
  select version.origin_relationship_id
  from nutrition.goal_versions as version
  where version.id = p_goal_version_id
    and version.origin = 'professional'
    and version.status = 'proposed'
    and version.author_person_id = access_control.person()
    and version.author_membership_id::text = current_setting('app.actor_membership_id', true)
$function$;

alter function nutrition.scoped_relationship(text) owner to allfit_owner;
alter function nutrition.scoped_subject(text) owner to allfit_owner;
alter function nutrition.goal_version_visible(uuid) owner to allfit_owner;
alter function nutrition.goal_version_from(uuid, uuid) owner to allfit_owner;
alter function nutrition.proposal_in_progress(uuid) owner to allfit_owner;
revoke all on function nutrition.scoped_relationship(text) from public, allfit_api;
revoke all on function nutrition.scoped_subject(text) from public, allfit_api;
revoke all on function nutrition.goal_version_visible(uuid) from public, allfit_api;
revoke all on function nutrition.goal_version_from(uuid, uuid) from public, allfit_api;
revoke all on function nutrition.proposal_in_progress(uuid) from public, allfit_api;

-- ---------------------------------------------------------------------------
-- Live review: rows a read inside `nutrition_review` may see
-- ---------------------------------------------------------------------------

create policy meals_select_review on nutrition.meals
  for select to allfit_owner
  using (
    person_id = (select nutrition.scoped_subject('nutrition_review'))
    and (select access_control.can_access(nutrition.scoped_relationship('nutrition_review'), 'nutrition_intake', 'read'))
  );
create policy meal_items_select_review on nutrition.meal_items
  for select to allfit_owner
  using (
    person_id = (select nutrition.scoped_subject('nutrition_review'))
    and (select access_control.can_access(nutrition.scoped_relationship('nutrition_review'), 'nutrition_intake', 'read'))
  );
create policy meal_nutrient_values_select_review on nutrition.meal_nutrient_values
  for select to allfit_owner
  using (
    person_id = (select nutrition.scoped_subject('nutrition_review'))
    and (select access_control.can_access(nutrition.scoped_relationship('nutrition_review'), 'nutrition_intake', 'read'))
  );

-- What this relationship proposed, and her active goal whoever set it.
create policy goal_versions_select_review on nutrition.goal_versions
  for select to allfit_owner
  using (
    person_id = (select nutrition.scoped_subject('nutrition_review'))
    and (origin_relationship_id = (select nutrition.scoped_relationship('nutrition_review')) or status = 'active')
    and (select access_control.can_access(nutrition.scoped_relationship('nutrition_review'), 'nutrition_guidance', 'read'))
  );
create policy goal_targets_select_review on nutrition.goal_targets
  for select to allfit_owner
  using (
    (select nutrition.scoped_relationship('nutrition_review')) is not null
    and nutrition.goal_version_visible(goal_version_id)
  );
-- Only on this relationship's proposals: a decision on her active goal would say it came
-- from a professional.
create policy goal_decisions_select_review on nutrition.goal_decisions
  for select to allfit_owner
  using (
    person_id = (select nutrition.scoped_subject('nutrition_review'))
    and (select access_control.can_access(nutrition.scoped_relationship('nutrition_review'), 'nutrition_guidance', 'read'))
    and nutrition.goal_version_from(goal_version_id, (select nutrition.scoped_relationship('nutrition_review')))
  );

-- ---------------------------------------------------------------------------
-- Proposing: rows `propose_goal_version` touches inside `nutrition_goal_proposal`
-- ---------------------------------------------------------------------------

create policy goal_sets_select_proposal on nutrition.goal_sets
  for select to allfit_owner
  using (
    person_id = (select nutrition.scoped_subject('nutrition_goal_proposal'))
    and (select access_control.can_access(nutrition.scoped_relationship('nutrition_goal_proposal'), 'nutrition_guidance', 'contribute'))
  );
create policy goal_sets_insert_proposal on nutrition.goal_sets
  for insert to allfit_owner
  with check (
    person_id = (select nutrition.scoped_subject('nutrition_goal_proposal'))
    and (select access_control.can_access(nutrition.scoped_relationship('nutrition_goal_proposal'), 'nutrition_guidance', 'contribute'))
  );
-- Locked for update and touched, so two proposals at once take turns.
create policy goal_sets_update_proposal on nutrition.goal_sets
  for update to allfit_owner
  using (
    person_id = (select nutrition.scoped_subject('nutrition_goal_proposal'))
    and (select access_control.can_access(nutrition.scoped_relationship('nutrition_goal_proposal'), 'nutrition_guidance', 'contribute'))
  )
  with check (
    person_id = (select nutrition.scoped_subject('nutrition_goal_proposal'))
    and (select access_control.can_access(nutrition.scoped_relationship('nutrition_goal_proposal'), 'nutrition_guidance', 'contribute'))
  );

-- Every version of hers, only to number the new one; the command returns none of them.
create policy goal_versions_select_proposal on nutrition.goal_versions
  for select to allfit_owner
  using (
    person_id = (select nutrition.scoped_subject('nutrition_goal_proposal'))
    and (select access_control.can_access(nutrition.scoped_relationship('nutrition_goal_proposal'), 'nutrition_guidance', 'contribute'))
  );
-- IX-33: the one this relationship has waiting gives way to the new one, and only that.
create policy goal_versions_update_proposal on nutrition.goal_versions
  for update to allfit_owner
  using (
    status = 'proposed'
    and origin_relationship_id = (select nutrition.scoped_relationship('nutrition_goal_proposal'))
    and (select access_control.can_access(nutrition.scoped_relationship('nutrition_goal_proposal'), 'nutrition_guidance', 'contribute'))
  )
  with check (
    status = 'superseded'
    and origin_relationship_id = (select nutrition.scoped_relationship('nutrition_goal_proposal'))
  );
-- IX-31: a proposal is written by the attending professional, as himself, with his own
-- nutrition credential in force, on a relationship whose guidance she shares to contribute.
create policy goal_versions_insert_proposal on nutrition.goal_versions
  for insert to allfit_owner
  with check (
    origin = 'professional'
    and status = 'proposed'
    and author_person_id = access_control.person()
    and author_membership_id::text = current_setting('app.actor_membership_id', true)
    and access_control.owns_membership(author_membership_id)
    and access_control.can_access(origin_relationship_id, 'nutrition_guidance', 'contribute')
    and identity.credential_verification_is_effective(
      credential_verification_id, author_person_id, 'nutrition_professional'
    )
  );

create policy goal_targets_select_proposal on nutrition.goal_targets
  for select to allfit_owner
  using (
    (select nutrition.scoped_relationship('nutrition_goal_proposal')) is not null
    and nutrition.goal_version_visible(goal_version_id)
  );
create policy goal_targets_insert_proposal on nutrition.goal_targets
  for insert to allfit_owner
  with check (
    nutrition.proposal_in_progress(goal_version_id) is not null
    and access_control.can_access(nutrition.proposal_in_progress(goal_version_id), 'nutrition_guidance', 'contribute')
  );

-- ---------------------------------------------------------------------------
-- IX-33 at the end: closing a relationship cancels what it has waiting
-- ---------------------------------------------------------------------------

create policy goal_versions_select_detachment on nutrition.goal_versions
  for select to allfit_owner
  using (origin_relationship_id::text = (select access_control.contract_scope('relationship_detachment')));
create policy goal_versions_update_detachment on nutrition.goal_versions
  for update to allfit_owner
  using (
    status = 'proposed'
    and origin_relationship_id::text = (select access_control.contract_scope('relationship_detachment'))
  )
  with check (
    status = 'cancelled'
    and origin_relationship_id::text = (select access_control.contract_scope('relationship_detachment'))
  );

create function nutrition.cancel_relationship_goal_proposals(
  p_relationship_id uuid,
  p_effective_at timestamptz
)
returns integer
language plpgsql
volatile
security definer
set search_path = pg_catalog
as $function$
declare
  cancelled integer;
  previous_purpose text := current_setting('app.contract_scope_purpose', true);
  previous_id text := current_setting('app.contract_scope_id', true);
  previous_token text := current_setting('app.contract_scope_token', true);
begin
  perform access_control.open_contract_scope('relationship_detachment', p_relationship_id);
  update nutrition.goal_versions as version
  set status = 'cancelled',
      cancelled_at = greatest(p_effective_at, version.created_at)
  where version.origin_relationship_id = p_relationship_id
    and version.status = 'proposed';
  get diagnostics cancelled = row_count;
  perform planning.resume_contract_scope(previous_purpose, previous_id, previous_token);
  return cancelled;
end
$function$;

alter function nutrition.cancel_relationship_goal_proposals(uuid, timestamptz) owner to allfit_owner;
revoke all on function nutrition.cancel_relationship_goal_proposals(uuid, timestamptz)
  from public, allfit_api;

/*
 * `20261112090000`'s body, with the goals this relationship proposed and she has not
 * decided cancelled at the same instant. Her ending it, the gym ending it and the
 * organization closing all come through here.
 */
create or replace function relationships.close_relationship(
  p_relationship_id uuid,
  p_effective_at timestamptz,
  p_ended_by_kind identity.actor_kind,
  p_reason text
)
returns table (frozen_grants integer, closed_assignments integer)
language plpgsql
set search_path = pg_catalog
as $function$
declare
  frozen integer;
  closed integer;
  closing_organization_id uuid;
  resolver_membership_id uuid;
begin
  update relationships.service_relationships as relationship
  set status = 'terminated',
      ended_at = p_effective_at,
      ended_reason = p_reason,
      ended_by_kind = p_ended_by_kind,
      updated_at = p_effective_at
  where relationship.id = p_relationship_id
    and relationship.status = 'active'
  returning relationship.organization_id into closing_organization_id;

  if not found then
    raise exception 'the relationship could not be closed' using errcode = 'P0004';
  end if;

  if p_ended_by_kind = 'professional' then
    select membership.id into resolver_membership_id
    from organizations.organization_memberships as membership
    where membership.organization_id = closing_organization_id
      and membership.person_id = access_control.person()
      and membership.status = 'active';
  end if;

  perform relationships.settle_termination_requests(
    p_relationship_id,
    case when resolver_membership_id is null then 'superseded' else 'resolved' end
      ::relationships.termination_request_status,
    resolver_membership_id,
    p_effective_at,
    null
  );

  -- Only what is still active: a grant the person revoked stays revoked.
  update privacy.data_grants as shared
  set status = 'frozen',
      frozen_at = p_effective_at,
      updated_at = p_effective_at
  where shared.relationship_id = p_relationship_id
    and shared.status = 'active';
  get diagnostics frozen = row_count;

  -- The holder and every cover she accepted; an unanswered proposal grants nothing.
  update relationships.relationship_professional_assignments as assignment
  set status = 'ended',
      valid_to = p_effective_at,
      updated_at = p_effective_at
  where assignment.relationship_id = p_relationship_id
    and assignment.status = 'active'
    and (assignment.kind = 'holder' or assignment.accepted_by_person_at is not null);
  get diagnostics closed = row_count;

  perform planning.detach_relationship_assignments(p_relationship_id, p_effective_at);
  perform execution.cancel_relationship_correction_proposals(p_relationship_id, p_effective_at);
  perform nutrition.cancel_relationship_goal_proposals(p_relationship_id, p_effective_at);

  return query select frozen, closed;
end
$function$;

-- ---------------------------------------------------------------------------
-- Frozen: rows a historical access case may see
-- ---------------------------------------------------------------------------

-- What this relationship proposed by the cut, under the case the scope names.
create function nutrition.reads_frozen_goal_version(p_relationship_id uuid, p_created_at timestamptz)
returns boolean
language sql
stable
set search_path = pg_catalog
as $function$
  select exists (
    select 1
    from privacy.historical_access_cases as hcase
    where hcase.id = access_control.contract_scope('frozen_history')::uuid
      and hcase.relationship_id = p_relationship_id
      and p_created_at <= hcase.cut_at
      and access_control.can_read_frozen(hcase.id, 'nutrition_guidance', 'nutrition.goal_versions')
  )
$function$;

-- What she had decided by the cut, on a version the case may see.
create function nutrition.reads_frozen_goal_decision(p_goal_version_id uuid, p_decided_at timestamptz)
returns boolean
language sql
stable
set search_path = pg_catalog
as $function$
  select exists (
    select 1
    from privacy.historical_access_cases as hcase
    where hcase.id = access_control.contract_scope('frozen_history')::uuid
      and p_decided_at <= hcase.cut_at
      and access_control.can_read_frozen(hcase.id, 'nutrition_guidance', 'nutrition.goal_decisions')
  )
  and nutrition.goal_version_visible(p_goal_version_id)
$function$;

alter function nutrition.reads_frozen_goal_version(uuid, timestamptz) owner to allfit_owner;
alter function nutrition.reads_frozen_goal_decision(uuid, timestamptz) owner to allfit_owner;
revoke all on function nutrition.reads_frozen_goal_version(uuid, timestamptz) from public, allfit_api;
revoke all on function nutrition.reads_frozen_goal_decision(uuid, timestamptz) from public, allfit_api;

-- With no frozen-history scope open, which is nearly always, no row reaches a function.
create policy goal_versions_select_frozen on nutrition.goal_versions
  for select to allfit_owner
  using (
    (select access_control.contract_scope('frozen_history')) is not null
    and nutrition.reads_frozen_goal_version(origin_relationship_id, created_at)
  );
create policy goal_targets_select_frozen on nutrition.goal_targets
  for select to allfit_owner
  using (
    (select access_control.contract_scope('frozen_history')) is not null
    and nutrition.goal_version_visible(goal_version_id)
  );
create policy goal_decisions_select_frozen on nutrition.goal_decisions
  for select to allfit_owner
  using (
    (select access_control.contract_scope('frozen_history')) is not null
    and nutrition.reads_frozen_goal_decision(goal_version_id, decided_at)
  );

-- ---------------------------------------------------------------------------
-- Projections
-- ---------------------------------------------------------------------------

-- A field the version shares now, or keeps readable afterwards for a frozen read.
create function nutrition.field_shared(p_scope_definition_id uuid, p_resource text, p_field text, p_frozen boolean)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $function$
  select case when p_frozen
              then privacy.scope_reads_frozen(p_scope_definition_id, p_resource, p_field)
              else privacy.scope_allows(p_scope_definition_id, p_resource, p_field) end
$function$;

alter function nutrition.field_shared(uuid, text, text, boolean) owner to allfit_owner;
revoke all on function nutrition.field_shared(uuid, text, text, boolean) from public, allfit_api;

/*
 * A meal as Studio sees it: the fields her version shares, whether it has a photo only
 * when her photos are shared too, and never where the photo is kept nor its revision.
 */
create function nutrition.client_meal_json(p_meal_id uuid, p_intake_definition_id uuid, p_photos_shared boolean)
returns jsonb
language sql
stable
set search_path = pg_catalog
as $function$
  select jsonb_build_object(
    'id', meal.id,
    'occurred_at', meal.occurred_at,
    'local_date', meal.local_date,
    'timezone', case when nutrition.field_shared(p_intake_definition_id, 'nutrition.meals', 'timezone', false)
                     then meal.timezone end,
    'meal_type', case when nutrition.field_shared(p_intake_definition_id, 'nutrition.meals', 'meal_type', false)
                      then meal.meal_type end,
    'note', case when nutrition.field_shared(p_intake_definition_id, 'nutrition.meals', 'note', false)
                 then meal.note end,
    'has_photo', case when p_photos_shared then meal.has_media end,
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'position', item.position,
        'name', case when nutrition.field_shared(p_intake_definition_id, 'nutrition.meal_items', 'name', false)
                     then item.name end,
        'quantity', case when nutrition.field_shared(p_intake_definition_id, 'nutrition.meal_items', 'quantity_numeric', false)
                         then item.quantity_numeric end,
        'quantity_unit', case when nutrition.field_shared(p_intake_definition_id, 'nutrition.meal_items', 'quantity_unit_code', false)
                              then item.quantity_unit_code end,
        'serving', case when nutrition.field_shared(p_intake_definition_id, 'nutrition.meal_items', 'serving', false)
                        then item.serving end,
        'origin', case when nutrition.field_shared(p_intake_definition_id, 'nutrition.meal_items', 'origin', false)
                       then item.origin end,
        'nutrients', case when nutrition.field_shared(p_intake_definition_id, 'nutrition.meal_nutrient_values', 'value_numeric', false)
          then coalesce((
            select jsonb_agg(jsonb_build_object(
              'nutrient_code', definition.code, 'value', value.value_numeric, 'unit', value.unit_code)
              order by definition.code)
            from nutrition.meal_nutrient_values as value
            join nutrition.nutrient_definitions as definition on definition.id = value.nutrient_definition_id
            where value.meal_item_id = item.id), '[]'::jsonb) end)
        order by item.position)
      from nutrition.meal_items as item
      where item.meal_id = meal.id
        and nutrition.field_shared(p_intake_definition_id, 'nutrition.meal_items', 'position', false)), '[]'::jsonb))
  from nutrition.meals as meal
  where meal.id = p_meal_id
$function$;

alter function nutrition.client_meal_json(uuid, uuid, boolean) owner to allfit_owner;
revoke all on function nutrition.client_meal_json(uuid, uuid, boolean) from public, allfit_api;

create function nutrition.client_targets_json(p_goal_version_id uuid, p_scope_definition_id uuid, p_frozen boolean)
returns jsonb
language sql
stable
set search_path = pg_catalog
as $function$
  select coalesce(jsonb_agg(jsonb_build_object(
    'nutrient_code', case when nutrition.field_shared(p_scope_definition_id, 'nutrition.goal_targets', 'nutrient_definition_id', p_frozen)
                          then definition.code end,
    'mode', case when nutrition.field_shared(p_scope_definition_id, 'nutrition.goal_targets', 'mode', p_frozen)
                 then target.mode end,
    'minimum', case when nutrition.field_shared(p_scope_definition_id, 'nutrition.goal_targets', 'minimum_value', p_frozen)
                    then target.minimum_value end,
    'maximum', case when nutrition.field_shared(p_scope_definition_id, 'nutrition.goal_targets', 'maximum_value', p_frozen)
                    then target.maximum_value end,
    'exact', case when nutrition.field_shared(p_scope_definition_id, 'nutrition.goal_targets', 'exact_value', p_frozen)
                  then target.exact_value end,
    'unit', case when nutrition.field_shared(p_scope_definition_id, 'nutrition.goal_targets', 'unit_code', p_frozen)
                 then target.unit_code end)
    order by definition.code), '[]'::jsonb)
  from nutrition.goal_targets as target
  join nutrition.nutrient_definitions as definition on definition.id = target.nutrient_definition_id
  where target.goal_version_id = p_goal_version_id
$function$;

alter function nutrition.client_targets_json(uuid, uuid, boolean) owner to allfit_owner;
revoke all on function nutrition.client_targets_json(uuid, uuid, boolean) from public, allfit_api;

-- A proposal as Studio sees it: the author by id only, and her decision when the caller
-- may see it. Never the version number, which would count her own goals.
create function nutrition.client_goal_version_json(p_goal_version_id uuid, p_scope_definition_id uuid)
returns jsonb
language sql
stable
set search_path = pg_catalog
as $function$
  select jsonb_build_object(
    'id', version.id,
    'status', version.status,
    'rationale', case when nutrition.field_shared(p_scope_definition_id, 'nutrition.goal_versions', 'rationale', false)
                      then version.rationale end,
    'author', jsonb_build_object('kind', version.origin, 'person_id', version.author_person_id),
    'targets', nutrition.client_targets_json(version.id, p_scope_definition_id, false),
    'created_at', version.created_at,
    'activated_at', version.activated_at,
    'cancelled_at', version.cancelled_at,
    'decision', (
      select jsonb_build_object('decision', decision.decision, 'decided_at', decision.decided_at)
      from nutrition.goal_decisions as decision
      where decision.goal_version_id = version.id))
  from nutrition.goal_versions as version
  where version.id = p_goal_version_id
$function$;

alter function nutrition.client_goal_version_json(uuid, uuid) owner to allfit_owner;
revoke all on function nutrition.client_goal_version_json(uuid, uuid) from public, allfit_api;

-- ---------------------------------------------------------------------------
-- OP-NUT-009 — her meals
-- ---------------------------------------------------------------------------

/*
 * Newest first, a page at a time on (instant, id), over at most thirty-one of her local
 * days. Her Space plan's window is hers, not a privacy limit, so it does not apply here.
 * The API asks for one more than it shows to know there is more.
 */
create function nutrition.list_client_meals(
  p_person_id uuid,
  p_organization_id uuid,
  p_subject_person_id uuid,
  p_from date,
  p_to date,
  p_limit integer,
  p_cursor_occurred_at timestamptz,
  p_cursor_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  opened record;
  photos record;
  photos_shared boolean := false;
  result jsonb;
  previous_purpose text := current_setting('app.contract_scope_purpose', true);
  previous_id text := current_setting('app.contract_scope_id', true);
  previous_token text := current_setting('app.contract_scope_token', true);
begin
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 30 then
    raise exception 'a page covers from one to thirty-one days' using errcode = '22023';
  end if;
  select * into opened from identity.open_client_category(
    p_person_id, p_organization_id, p_subject_person_id,
    'nutrition_intake', 'nutrition.meals', 'studio_nutrition_review'
  );
  if opened.grant_id is null then
    return jsonb_build_object('outcome', 'scope_required', 'scope', 'nutrition_intake');
  end if;

  -- Whether a meal has a photo is a fact of her photos: said only when they are shared.
  select * into photos from identity.shared_scope(opened.relationship_id, 'nutrition_media');
  if photos.grant_id is not null
     and privacy.scope_allows(photos.scope_definition_id, 'nutrition.meals', 'media_ref') then
    photos_shared := true;
    perform privacy.log_access_event(
      p_subject_person_id, null, opened.relationship_id, photos.grant_id, null,
      'nutrition_media', photos.scope_version, 'live', 'nutrition.meals', 'allowed'
    );
  end if;

  perform access_control.open_contract_scope('nutrition_review', opened.relationship_id);
  result := jsonb_build_object(
    'outcome', 'found',
    'scope_version', opened.scope_version,
    'photo_scope_version', case when photos_shared then photos.scope_version end,
    'items', coalesce((
      select jsonb_agg(nutrition.client_meal_json(page.id, opened.scope_definition_id, photos_shared)
                       order by page.occurred_at desc, page.id desc)
      from (
        select meal.id, meal.occurred_at
        from nutrition.meals as meal
        where meal.person_id = p_subject_person_id
          and meal.local_date between p_from and p_to
          and privacy.scope_allows(opened.scope_definition_id, 'nutrition.meals', 'occurred_at')
          and privacy.scope_allows(opened.scope_definition_id, 'nutrition.meals', 'local_date')
          and (p_cursor_id is null or (meal.occurred_at, meal.id) < (p_cursor_occurred_at, p_cursor_id))
        order by meal.occurred_at desc, meal.id desc
        limit least(greatest(coalesce(p_limit, 21), 1), 101)
      ) as page
    ), '[]'::jsonb)
  );
  perform planning.resume_contract_scope(previous_purpose, previous_id, previous_token);
  return result;
end
$function$;

alter function nutrition.list_client_meals(uuid, uuid, uuid, date, date, integer, timestamptz, uuid)
  owner to allfit_owner;
revoke all on function nutrition.list_client_meals(uuid, uuid, uuid, date, date, integer, timestamptz, uuid)
  from public;
grant execute on function nutrition.list_client_meals(uuid, uuid, uuid, date, date, integer, timestamptz, uuid)
  to allfit_api;

-- ---------------------------------------------------------------------------
-- OP-NUT-010 — her days
-- ---------------------------------------------------------------------------

/*
 * Every day of the range with what she recorded and he may see. A day with nothing has
 * no totals, not zeros; a version that shares no nutrients adds up none, so a total
 * never reveals what it hides. No streak and no hidden days: those are Space's.
 */
create function nutrition.read_client_daily_summaries(
  p_person_id uuid,
  p_organization_id uuid,
  p_subject_person_id uuid,
  p_from date,
  p_to date
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  opened record;
  counted boolean;
  totalled boolean;
  result jsonb;
  previous_purpose text := current_setting('app.contract_scope_purpose', true);
  previous_id text := current_setting('app.contract_scope_id', true);
  previous_token text := current_setting('app.contract_scope_token', true);
begin
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 30 then
    raise exception 'a summary covers from one to thirty-one days' using errcode = '22023';
  end if;
  select * into opened from identity.open_client_category(
    p_person_id, p_organization_id, p_subject_person_id,
    'nutrition_intake', 'nutrition.meals', 'studio_nutrition_review'
  );
  if opened.grant_id is null then
    return jsonb_build_object('outcome', 'scope_required', 'scope', 'nutrition_intake');
  end if;
  counted := privacy.scope_allows(opened.scope_definition_id, 'nutrition.meals', 'local_date');
  totalled := counted
    and privacy.scope_allows(opened.scope_definition_id, 'nutrition.meal_nutrient_values', 'value_numeric');

  perform access_control.open_contract_scope('nutrition_review', opened.relationship_id);
  result := jsonb_build_object(
    'outcome', 'found',
    'scope_version', opened.scope_version,
    'days', (
      select jsonb_agg(jsonb_build_object(
        'local_date', day.date,
        'meal_count', case when counted then (
          select count(*)::integer from nutrition.meals as meal
          where meal.person_id = p_subject_person_id and meal.local_date = day.date) end,
        'nutrient_totals', case when totalled then coalesce((
          select jsonb_agg(jsonb_build_object('nutrient_code', total.code, 'value', total.value, 'unit', total.unit)
                           order by total.code)
          from (
            select definition.code, definition.canonical_unit_code as unit, sum(value.value_numeric) as value
            from nutrition.meal_nutrient_values as value
            join nutrition.meals as meal on meal.id = value.meal_id
            join nutrition.nutrient_definitions as definition on definition.id = value.nutrient_definition_id
            where meal.person_id = p_subject_person_id and meal.local_date = day.date
            group by definition.code, definition.canonical_unit_code
          ) as total), '[]'::jsonb) end)
        order by day.date)
      -- A series of dates is a series of timestamps; the day is the date.
      from (select moment::date as date from generate_series(p_from, p_to, interval '1 day') as moment) as day
    )
  );
  perform planning.resume_contract_scope(previous_purpose, previous_id, previous_token);
  return result;
end
$function$;

alter function nutrition.read_client_daily_summaries(uuid, uuid, uuid, date, date) owner to allfit_owner;
revoke all on function nutrition.read_client_daily_summaries(uuid, uuid, uuid, date, date) from public;
grant execute on function nutrition.read_client_daily_summaries(uuid, uuid, uuid, date, date) to allfit_api;

-- ---------------------------------------------------------------------------
-- OP-NUT-013 — a photo
-- ---------------------------------------------------------------------------

/*
 * Where a meal's photo is kept, for the API to serve it, with her log and her photos both
 * shared. Every call records itself, a miss included, and every miss reads the same.
 */
create function nutrition.open_client_meal_photo(
  p_person_id uuid,
  p_organization_id uuid,
  p_subject_person_id uuid,
  p_meal_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  attending record;
  intake record;
  photos record;
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
  perform set_config('app.purpose', 'studio_nutrition_review', true);

  select * into intake from identity.shared_scope(attending.relationship_id, 'nutrition_intake');
  select * into photos from identity.shared_scope(attending.relationship_id, 'nutrition_media');
  if intake.grant_id is not null
     and photos.grant_id is not null
     and privacy.scope_allows(photos.scope_definition_id, 'nutrition.meals', 'media_ref') then
    perform access_control.open_contract_scope('nutrition_review', attending.relationship_id);
    select meal.media_ref into kept
    from nutrition.meals as meal
    where meal.id = p_meal_id
      and meal.person_id = p_subject_person_id
      and meal.media_ref is not null;
    perform planning.resume_contract_scope(previous_purpose, previous_id, previous_token);
  end if;

  perform privacy.log_access_event(
    p_subject_person_id, null, attending.relationship_id, photos.grant_id, null,
    'nutrition_media', photos.scope_version, 'live', 'nutrition.meals',
    case when kept is null then 'denied' else 'allowed' end
  );
  if kept is null then
    return jsonb_build_object('outcome', 'not_found');
  end if;
  return jsonb_build_object('outcome', 'found', 'media_ref', kept);
end
$function$;

alter function nutrition.open_client_meal_photo(uuid, uuid, uuid, uuid) owner to allfit_owner;
revoke all on function nutrition.open_client_meal_photo(uuid, uuid, uuid, uuid) from public;
grant execute on function nutrition.open_client_meal_photo(uuid, uuid, uuid, uuid) to allfit_api;

-- ---------------------------------------------------------------------------
-- OP-NUT-011 live — her goals
-- ---------------------------------------------------------------------------

/*
 * What this relationship proposed, newest first, with what she decided; and her active
 * goal, which names its version and says it is this relationship's only when it is.
 */
create function nutrition.list_client_goal_versions(
  p_person_id uuid,
  p_organization_id uuid,
  p_subject_person_id uuid,
  p_limit integer,
  p_cursor_created_at timestamptz,
  p_cursor_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  opened record;
  result jsonb;
  previous_purpose text := current_setting('app.contract_scope_purpose', true);
  previous_id text := current_setting('app.contract_scope_id', true);
  previous_token text := current_setting('app.contract_scope_token', true);
begin
  select * into opened from identity.open_client_category(
    p_person_id, p_organization_id, p_subject_person_id,
    'nutrition_guidance', 'nutrition.goal_versions', 'studio_nutrition_review'
  );
  if opened.grant_id is null then
    return jsonb_build_object('outcome', 'scope_required', 'scope', 'nutrition_guidance');
  end if;

  perform access_control.open_contract_scope('nutrition_review', opened.relationship_id);
  result := jsonb_build_object(
    'outcome', 'found',
    'scope_version', opened.scope_version,
    'items', coalesce((
      select jsonb_agg(nutrition.client_goal_version_json(page.id, opened.scope_definition_id)
                       order by page.created_at desc, page.id desc)
      from (
        select version.id, version.created_at
        from nutrition.goal_versions as version
        where version.person_id = p_subject_person_id
          and version.origin_relationship_id = opened.relationship_id
          and (p_cursor_id is null or (version.created_at, version.id) < (p_cursor_created_at, p_cursor_id))
        order by version.created_at desc, version.id desc
        limit least(greatest(coalesce(p_limit, 21), 1), 101)
      ) as page
    ), '[]'::jsonb),
    'active', (
      select jsonb_build_object(
        'goal_version_id', case when version.origin_relationship_id = opened.relationship_id then version.id end,
        'from_this_relationship', coalesce(version.origin_relationship_id = opened.relationship_id, false),
        'activated_at', version.activated_at,
        'targets', nutrition.client_targets_json(version.id, opened.scope_definition_id, false))
      from nutrition.goal_versions as version
      where version.person_id = p_subject_person_id
        and version.status = 'active'
    )
  );
  perform planning.resume_contract_scope(previous_purpose, previous_id, previous_token);
  return result;
end
$function$;

alter function nutrition.list_client_goal_versions(uuid, uuid, uuid, integer, timestamptz, uuid)
  owner to allfit_owner;
revoke all on function nutrition.list_client_goal_versions(uuid, uuid, uuid, integer, timestamptz, uuid)
  from public;
grant execute on function nutrition.list_client_goal_versions(uuid, uuid, uuid, integer, timestamptz, uuid)
  to allfit_api;

-- ---------------------------------------------------------------------------
-- OP-NUT-012 — proposing
-- ---------------------------------------------------------------------------

/*
 * A version of her goals for her to decide. Who he is, his credential and what she
 * shares are checked before anything is claimed; after the claim, under the locks, the
 * assignment and the grant are read again, so a revocation or an end committed meanwhile
 * wins. The event says something was proposed, never what or why.
 */
create function nutrition.propose_goal_version(
  p_person_id uuid,
  p_organization_id uuid,
  p_subject_person_id uuid,
  p_rationale text,
  p_targets jsonb,
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
  attending record;
  receipt record;
  shared record;
  assignment_id uuid;
  verification_id uuid;
  target_set_id uuid;
  next_number integer;
  problems text[] := array[]::text[];
  document jsonb;
  previous_purpose text := current_setting('app.contract_scope_purpose', true);
  previous_id text := current_setting('app.contract_scope_id', true);
  previous_token text := current_setting('app.contract_scope_token', true);
begin
  select * into attending
  from execution.require_attending_coach(p_person_id, p_organization_id, p_subject_person_id);
  if not access_control.has_capability(p_organization_id, 'guide_nutrition') then
    raise exception 'this action requires guide_nutrition' using errcode = '42501';
  end if;
  if identity.effective_credential_verification(p_person_id, 'nutrition_professional') is null then
    raise exception 'a verified nutrition credential in force is required' using errcode = 'AF431';
  end if;
  perform execution.require_category_grant(attending.relationship_id, 'nutrition_guidance', 'contribute');

  if p_rationale is null or btrim(p_rationale) = '' or char_length(btrim(p_rationale)) > 2000 then
    problems := array_append(problems, 'rationale');
  end if;
  if jsonb_typeof(p_targets) is distinct from 'array' then
    problems := array_append(problems, 'targets');
  elsif jsonb_array_length(p_targets) not between 1 and 6 then
    problems := array_append(problems, 'targets');
  end if;
  if cardinality(problems) > 0 then
    raise exception 'the proposal is not valid' using errcode = '22023', detail = to_jsonb(problems)::text;
  end if;

  select * into receipt from system.begin_idempotency(
    p_person_id, 'OP-NUT-012', p_idempotency_key, p_command_id, p_request_hash
  );
  perform 1
  from relationships.service_relationships as relationship
  where relationship.id = attending.relationship_id
  for share;

  select * into shared from identity.shared_scope(attending.relationship_id, 'nutrition_guidance');
  perform access_control.open_contract_scope('nutrition_goal_proposal', attending.relationship_id);
  if not receipt.claimed then
    document := nutrition.client_goal_version_json(receipt.aggregate_id, shared.scope_definition_id);
    perform planning.resume_contract_scope(previous_purpose, previous_id, previous_token);
    return query select document, true;
    return;
  end if;

  -- Read under the locks: an end or a revocation committed meanwhile is seen, as after it.
  assignment_id := execution.attending_assignment(attending.relationship_id, attending.membership_id);
  if assignment_id is null then
    raise exception 'client not found' using errcode = 'P0002';
  end if;
  perform 1
  from privacy.data_grants as grant_row
  where grant_row.id = shared.grant_id
    and grant_row.status = 'active'
    and grant_row.access_level = 'contribute'
  for share;
  if not found then
    raise exception 'the person does not share this category at this level'
      using errcode = 'AF430', detail = 'nutrition_guidance:contribute';
  end if;

  insert into nutrition.goal_sets (person_id) values (p_subject_person_id) on conflict (person_id) do nothing;
  -- Locked, as deciding locks it: a decision and a proposal take turns.
  select goal_set.id into target_set_id
  from nutrition.goal_sets as goal_set
  where goal_set.person_id = p_subject_person_id
  for update;

  select coalesce(max(version.version_number), 0) + 1 into next_number
  from nutrition.goal_versions as version
  where version.goal_set_id = target_set_id;

  update nutrition.goal_versions as version
  set status = 'superseded'
  where version.goal_set_id = target_set_id
    and version.origin_relationship_id = attending.relationship_id
    and version.status = 'proposed';

  verification_id := identity.effective_credential_verification(p_person_id, 'nutrition_professional');
  insert into nutrition.goal_versions (
    id, goal_set_id, person_id, version_number, origin, status, rationale, author_person_id,
    author_membership_id, author_assignment_id, origin_relationship_id, origin_organization_id,
    credential_verification_id
  ) values (
    p_command_id, target_set_id, p_subject_person_id, next_number, 'professional', 'proposed',
    btrim(p_rationale), p_person_id, attending.membership_id, assignment_id,
    attending.relationship_id, p_organization_id, verification_id
  );
  perform nutrition.write_targets(p_command_id, p_targets);
  update nutrition.goal_sets as goal_set set updated_at = clock_timestamp() where goal_set.id = target_set_id;

  perform system.enqueue_outbox_event(
    'nutrition_goal_version', p_command_id, 'nutrition.goal_version_proposed.v1',
    jsonb_build_object(
      'goal_version_id', p_command_id,
      'person_id', p_subject_person_id,
      'relationship_id', attending.relationship_id,
      'organization_id', p_organization_id
    )
  );
  perform system.finish_idempotency(
    receipt.receipt_id, 201::smallint, 'goal-proposed', 'nutrition_goal_version', p_command_id
  );

  document := nutrition.client_goal_version_json(p_command_id, shared.scope_definition_id);
  perform planning.resume_contract_scope(previous_purpose, previous_id, previous_token);
  return query select document, false;
end
$function$;

alter function nutrition.propose_goal_version(uuid, uuid, uuid, text, jsonb, uuid, uuid, bytea)
  owner to allfit_owner;
revoke all on function nutrition.propose_goal_version(uuid, uuid, uuid, text, jsonb, uuid, uuid, bytea)
  from public;
grant execute on function nutrition.propose_goal_version(uuid, uuid, uuid, text, jsonb, uuid, uuid, bytea)
  to allfit_api;

-- ---------------------------------------------------------------------------
-- OP-NUT-011 frozen — the goals an ended relationship proposed
-- ---------------------------------------------------------------------------

/*
 * Through a case: what this relationship proposed by the cut, newest first, and how each
 * stood at the cut. Only the fields the frozen version keeps readable afterwards; a
 * decision she took after the cut does not exist for the case.
 */
create function nutrition.list_frozen_goal_versions(
  p_person_id uuid,
  p_session_id uuid,
  p_organization_id uuid,
  p_relationship_id uuid,
  p_case_id uuid,
  p_limit integer,
  p_cursor_created_at timestamptz,
  p_cursor_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  opened record;
  guidance record;
  definition uuid;
  decisions_kept boolean;
  status_kept boolean;
  result jsonb;
  previous_purpose text := current_setting('app.contract_scope_purpose', true);
  previous_id text := current_setting('app.contract_scope_id', true);
  previous_token text := current_setting('app.contract_scope_token', true);
begin
  select * into opened from privacy.open_frozen_read(
    p_person_id, p_session_id, p_organization_id, p_relationship_id, p_case_id,
    'nutrition.goal_versions'
  );
  if opened.case_id is null then
    return jsonb_build_object('outcome', 'not_found');
  end if;

  select * into guidance
  from privacy.frozen_category(opened.case_id, 'nutrition_guidance', 'nutrition.goal_versions');
  if guidance.grant_id is null then
    perform privacy.log_access_event(
      opened.subject_person_id, null, opened.relationship_id, null, opened.case_id,
      'nutrition_guidance', null, 'frozen', 'nutrition.goal_versions', 'denied'
    );
    perform planning.resume_contract_scope(previous_purpose, previous_id, previous_token);
    return jsonb_build_object(
      'outcome', 'scope_required',
      'required_scope', jsonb_build_object('code', 'nutrition_guidance', 'level', 'read')
    );
  end if;
  perform privacy.log_access_event(
    opened.subject_person_id, null, opened.relationship_id, guidance.grant_id, opened.case_id,
    'nutrition_guidance', guidance.scope_version, 'frozen', 'nutrition.goal_versions', 'allowed'
  );
  definition := guidance.scope_definition_id;
  decisions_kept := exists (
    select 1 from privacy.frozen_category(opened.case_id, 'nutrition_guidance', 'nutrition.goal_decisions')
  );
  -- How a proposal stood depends on her decision: without it, the status is not told.
  status_kept := decisions_kept
    and privacy.scope_reads_frozen(definition, 'nutrition.goal_versions', 'status');

  result := jsonb_build_object(
    'outcome', 'found',
    'scope_version', guidance.scope_version,
    'items', coalesce((
      select jsonb_agg(page.item order by page.created_at desc, page.id desc)
      from (
        select version.id, version.created_at, jsonb_build_object(
          'id', version.id,
          'status_at_cut', case when status_kept then (
            case
              when decision.decision is not null then decision.decision::text
              when version.cancelled_at <= opened.cut_at then 'cancelled'
              when exists (
                select 1 from nutrition.goal_versions as newer
                where newer.goal_set_id = version.goal_set_id
                  and newer.origin_relationship_id = version.origin_relationship_id
                  and newer.version_number > version.version_number
              ) then 'superseded'
              else 'proposed'
            end) end,
          'rationale', case when privacy.scope_reads_frozen(definition, 'nutrition.goal_versions', 'rationale')
                            then version.rationale end,
          'author', jsonb_build_object(
            'kind', 'professional',
            'person_id', case when privacy.scope_reads_frozen(definition, 'nutrition.goal_versions', 'author_person_id')
                              then version.author_person_id end),
          'targets', nutrition.client_targets_json(version.id, definition, true),
          'created_at', version.created_at,
          'activated_at', case when privacy.scope_reads_frozen(definition, 'nutrition.goal_versions', 'activated_at')
                                and version.activated_at <= opened.cut_at
                               then version.activated_at end,
          'decision', case when decision.decision is not null
                           then jsonb_build_object('decision', decision.decision, 'decided_at', decision.decided_at) end
        ) as item
        from nutrition.goal_versions as version
        left join nutrition.goal_decisions as decision on decision.goal_version_id = version.id
        where version.person_id = opened.subject_person_id
          and version.origin_relationship_id = opened.relationship_id
          and version.created_at <= opened.cut_at
          and privacy.scope_reads_frozen(definition, 'nutrition.goal_versions', 'created_at')
          and (p_cursor_id is null or (version.created_at, version.id) < (p_cursor_created_at, p_cursor_id))
        order by version.created_at desc, version.id desc
        limit least(greatest(coalesce(p_limit, 21), 1), 101)
      ) as page
    ), '[]'::jsonb)
  );

  perform planning.resume_contract_scope(previous_purpose, previous_id, previous_token);
  return result;
end
$function$;

alter function nutrition.list_frozen_goal_versions(uuid, uuid, uuid, uuid, uuid, integer, timestamptz, uuid)
  owner to allfit_owner;
revoke all on function nutrition.list_frozen_goal_versions(uuid, uuid, uuid, uuid, uuid, integer, timestamptz, uuid)
  from public;
grant execute on function nutrition.list_frozen_goal_versions(uuid, uuid, uuid, uuid, uuid, integer, timestamptz, uuid)
  to allfit_api;

commit;
