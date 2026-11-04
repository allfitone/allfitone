-- HU-BO-006 criterion 2 and HU-BO-007 criterion 2 — the support search answers only what
-- it needs, and the person file says what exists around the person.
--
-- `20260910120000` wrote `not_modelled` for relationships, plan, Pro and permissions
-- because none of those schemas existed. All four do now, and the file still told the
-- operator that Allfit did not keep them while the payments panel of the same person
-- showed her Pro. Each block now says that it exists, its state and its dates, and
-- nothing that was shared, paid or who receives it: no gym, no scope, no amount.
--
-- **Permissions need a read the operator did not have.** `privacy.data_grants` shows a
-- row only to its person or its organization. `data_grants_select_support_metadata`
-- lets a support request by an operator holding `diagnose_support_metadata` see the
-- rows, the same shape as the relationships policy the gym directory already uses, plus
-- the actor kind: without it a staff member holding the duty would see everybody's
-- grants while using Space as a person. The file only ever counts them.
--
-- **The file opens only as the operator asking.** Its counts come through row security,
-- so a file opened under any other actor would read zero and present it as a fact.
-- `person_metadata` refuses that instead (criterion 5: unknown is never zero).
--
-- **The search answers four fields.** HU-BO-006 criterion 2 lists the identifier, the
-- masked contact and the operational state. The search returned the whole file, and a
-- match was not recorded where the person can see it: only `support.metadata_queries`,
-- which she never reads, held it. A match is now an access event on her too. A search
-- that finds nobody still has no subject, so it stays in `metadata_queries` alone.

set lock_timeout = '5s';
set statement_timeout = '60s';

create policy data_grants_select_support_metadata on privacy.data_grants
  for select to allfit_owner
  using (
    access_control.actor_kind() = 'support'
    and access_control.holds_backoffice_duty('diagnose_support_metadata')
  );

-- ---------------------------------------------------------------------------
-- The projection, with the four blocks
-- ---------------------------------------------------------------------------

-- Its columns change shape, so it is recreated rather than replaced; the functions that
-- read it are plpgsql and resolve it when they run.
drop view support.v_support_metadata;

create view support.v_support_metadata as
select
  person.id as person_id,
  person.status::text as account_status,
  person.created_at,
  person.activated_at,
  support.mask_email(person.contact_email::text) as contact_email_masked,
  support.mask_phone(person.contact_phone) as contact_phone_masked,
  person.contact_email_verified_at as email_verified_at,
  person.contact_phone_verified_at as phone_verified_at,
  exists (
    select 1 from identity.access_accounts as account where account.person_id = person.id
  ) as has_access_account,
  (
    select min(account.linked_at)
    from identity.access_accounts as account
    where account.person_id = person.id
  ) as access_account_linked_at,
  (
    select count(*)
    from identity.access_sessions as session
    join identity.access_accounts as account on account.id = session.access_account_id
    where account.person_id = person.id
      and session.revoked_at is null
      and session.absolute_expires_at > clock_timestamp()
  ) as active_session_count,
  (
    select max(session.last_activity_at)
    from identity.access_sessions as session
    join identity.access_accounts as account on account.id = session.access_account_id
    where account.person_id = person.id
  ) as last_seen_at,
  (
    select jsonb_build_object('exists', count(*) > 0, 'created_at', min(profile.created_at))
    from identity.professional_profiles as profile
    where profile.person_id = person.id
  ) as professional_profile,
  (
    select count(*)
    from organizations.organization_memberships as membership
    where membership.person_id = person.id
  ) as membership_count,
  (
    select count(*)
    from organizations.organization_memberships as membership
    where membership.person_id = person.id and membership.status = 'active'
  ) as active_membership_count,
  -- The gyms she trains at and has left, never which.
  (
    select jsonb_build_object(
      'active', count(*) filter (where relationship.status = 'active'),
      'ended', count(*) filter (where relationship.status = 'terminated'),
      'last_started_at', max(relationship.started_at),
      'last_ended_at', max(relationship.ended_at)
    )
    from relationships.service_relationships as relationship
    where relationship.person_id = person.id
  ) as relationships,
  -- The permissions she granted by state, never what or to whom.
  (
    select jsonb_build_object(
      'active', count(*) filter (where grant_row.status = 'active'),
      'frozen', count(*) filter (where grant_row.status = 'frozen'),
      'revoked', count(*) filter (where grant_row.status = 'revoked'),
      'last_granted_at', max(grant_row.granted_at),
      'last_revoked_at', max(grant_row.revoked_at)
    )
    from privacy.data_grants as grant_row
    where grant_row.person_id = person.id
  ) as permissions,
  -- Her latest platform subscription; a null status is the free plan, never subscribed.
  (
    select jsonb_build_object(
      'status', latest.status,
      'started_at', latest.started_at,
      'current_period_end', latest.current_period_end
    )
    from (select 1) as anchor
    left join lateral (
      select subscription.status::text as status, subscription.started_at,
             subscription.current_period_end
      from payments.platform_subscriptions as subscription
      where subscription.person_id = person.id
      order by subscription.started_at desc, subscription.id desc
      limit 1
    ) as latest on true
  ) as plan,
  -- Pro as `payments.resolve_pro` decides it, without the gyms that give it.
  (
    select jsonb_build_object(
      'source', case resolved.decision->>'effective_source'
        when 'subscription' then 'subscription'
        when 'organization' then 'organization'
        else 'none'
      end,
      'until', case when resolved.decision->>'effective_source' = 'subscription' then (
        select case when live.status = 'grace' then live.grace_until
                    else live.current_period_end end
        from payments.platform_subscriptions as live
        where live.person_id = person.id
          and (
            (live.status = 'active' and live.current_period_end > clock_timestamp())
            or (live.status = 'grace' and live.grace_until > clock_timestamp())
          )
        limit 1
      ) end
    )
    from (select payments.resolve_pro(person.id) as decision) as resolved
  ) as pro
from identity.people as person;

comment on view support.v_support_metadata is
  'OP-SUP-005 minimised projection. Never names, full contacts, provider subjects, or who receives what.';

alter view support.v_support_metadata owner to allfit_owner;
revoke all on table support.v_support_metadata from public;

-- ---------------------------------------------------------------------------
-- OP-SUP-005 — find a person
-- ---------------------------------------------------------------------------

create or replace function support.search_people(
  p_actor_person_id uuid,
  p_actor_session_id uuid,
  p_case_reference text,
  p_lookup_kind text,
  p_lookup_value text
)
returns table (result jsonb)
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  matched uuid;
  found jsonb;
begin
  perform support.require_support_diagnostician(p_actor_person_id, p_actor_session_id);

  if p_lookup_kind not in ('identifier', 'email', 'phone') then
    raise exception 'a support search is by identifier, email or phone' using errcode = '22023';
  end if;
  if p_lookup_value is null or btrim(p_lookup_value) = '' then
    raise exception 'a support search needs a value to match exactly' using errcode = '22023';
  end if;

  select person.id into matched
  from identity.people as person
  where case p_lookup_kind
    when 'identifier' then person.id::text = btrim(p_lookup_value)
    when 'email' then lower(person.contact_email::text) = lower(btrim(p_lookup_value))
    else person.contact_phone = btrim(p_lookup_value)
  end;

  -- Recorded before the answer travels, and recorded whether or not it matched:
  -- a fruitless search is exactly the one worth being able to review later.
  insert into support.metadata_queries (
    actor_person_id, actor_session_id, case_reference, lookup_kind, lookup_hash, result_count
  ) values (
    p_actor_person_id,
    p_actor_session_id,
    btrim(p_case_reference),
    p_lookup_kind,
    extensions.digest(lower(btrim(p_lookup_value)), 'sha256'),
    case when matched is null then 0 else 1 end
  );

  if matched is null then
    return;
  end if;

  -- A match reached her, so it is in her own log too, before the answer travels.
  insert into privacy.access_events (
    actor_person_id, subject_person_id, resource, resource_id, purpose, result,
    request_id, access_mode
  ) values (
    p_actor_person_id,
    matched,
    'support.person_search',
    matched,
    'support_diagnosis',
    'allowed',
    coalesce(
      nullif(current_setting('app.request_id', true), '')::uuid,
      extensions.uuid_generate_v7()
    ),
    'support_metadata'::privacy.access_mode
  );

  select jsonb_build_object(
    'person_id', person.id,
    'account_status', person.status::text,
    'contact_email_masked', support.mask_email(person.contact_email::text),
    'contact_phone_masked', support.mask_phone(person.contact_phone)
  ) into found
  from identity.people as person
  where person.id = matched;

  return query select found;
end
$function$;

-- ---------------------------------------------------------------------------
-- OP-SUP-005 — open the operational state
-- ---------------------------------------------------------------------------

create or replace function support.person_metadata(
  p_actor_person_id uuid,
  p_actor_session_id uuid,
  p_case_reference text,
  p_person_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  found jsonb;
begin
  perform support.require_support_diagnostician(p_actor_person_id, p_actor_session_id);

  -- Row security counts the blocks as this actor; any other actor would read zeros.
  if access_control.actor_kind() <> 'support'
     or access_control.person() is distinct from p_actor_person_id then
    raise exception 'a person file opens only as the operator asking for it'
      using errcode = '42501';
  end if;

  if btrim(coalesce(p_case_reference, '')) !~ '^[A-Z][A-Z0-9_-]{2,63}$' then
    raise exception 'a support read needs a traceable case reference' using errcode = '22023';
  end if;

  select to_jsonb(metadata) into found
  from support.v_support_metadata as metadata
  where metadata.person_id = p_person_id;

  if found is null then
    raise exception 'person not found in the support projection' using errcode = 'P0002';
  end if;

  -- The read is recorded against the person before the content is returned. The
  -- ritual is the same as everywhere else: if the record fails, the read fails.
  insert into privacy.access_events (
    actor_person_id, subject_person_id, resource, resource_id, purpose, result,
    request_id, access_mode
  ) values (
    p_actor_person_id,
    p_person_id,
    'support.v_support_metadata',
    p_person_id,
    'support_diagnosis',
    'allowed',
    coalesce(
      nullif(current_setting('app.request_id', true), '')::uuid,
      extensions.uuid_generate_v7()
    ),
    'support_metadata'::privacy.access_mode
  );

  return found;
end
$function$;
