-- HU-BO-027 c2 and c5 — the quota names the agreement that sold it (OP-ORG-023).
--
-- **Why on the quota.** By `ADR-043` there is nothing to switch on gym by gym: every
-- active gym gives Pro, resolved when it is read. What remains of `HU-BO-027` is that the
-- founder writes down the commercial agreement, and the commercial act Allfit performs on
-- a gym is setting its quota (`HU-BO-034`), under the duty, AAL2 and audit the story asks
-- for. So the reference travels with that command rather than with a second one.
--
-- **Required.** What Allfit charges a gym is billed outside the platform, so the
-- reference is the only thread from a number on screen back to the deal behind it. It is
-- one line of at most 120 characters: a contract number, not a note.
--
-- **The agreement is part of what was sold.** It is kept on the gym beside the number, so
-- a renewal that keeps the number under a new agreement is a change with its record, and
-- the same pair sent again is no change at all.
--
-- **The history already written stays valid.** A quota change recorded before this has no
-- reference. Its snapshot shape is still accepted, so a restore re-checks it cleanly, and
-- it reads back as `null` rather than as an invented reference.
--
-- **The old signature is dropped, not kept beside the new one.** A command that could
-- still be called without a reference would make the requirement optional.

set lock_timeout = '5s';
set statement_timeout = '60s';

-- ---------------------------------------------------------------------------
-- The agreement, beside the number
-- ---------------------------------------------------------------------------

alter table organizations.organizations
  add column guest_quota_agreement_reference text,
  add constraint ck_organizations_guest_quota_agreement_reference check (
    guest_quota_agreement_reference is null
    or (
      guest_quota_agreement_reference = btrim(guest_quota_agreement_reference)
      and char_length(guest_quota_agreement_reference) between 1 and 120
      and guest_quota_agreement_reference !~ '[[:cntrl:]]'
    )
  );

-- ---------------------------------------------------------------------------
-- The shape of the record
-- ---------------------------------------------------------------------------

-- The quota snapshot gains the agreement as a second accepted shape. Everything else is
-- unchanged.
create or replace function system.validate_json_contract(
  p_contract_code text,
  p_schema_version smallint,
  p_payload jsonb
)
returns boolean
language plpgsql
immutable
strict
security invoker
set search_path = pg_catalog
as $function$
declare
  uuid_pattern constant text := '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$';
  timestamp_pattern constant text := '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]+)?(Z|[+-][0-9]{2}:[0-9]{2})$';
begin
  if p_schema_version <> 1 or jsonb_typeof(p_payload) <> 'object' then
    return false;
  end if;

  if p_contract_code = 'audit.organization_event_snapshot' then
    if system.jsonb_has_exact_keys(
      p_payload,
      array['type_code', 'legal_name', 'display_name', 'status', 'revision_number']
    ) then
      return jsonb_typeof(p_payload->'type_code') = 'string'
        and p_payload->>'type_code' in ('professional_practice', 'gym', 'studio')
        and jsonb_typeof(p_payload->'legal_name') in ('string', 'null')
        and (jsonb_typeof(p_payload->'legal_name') = 'null'
          or btrim(p_payload->>'legal_name') <> '')
        and jsonb_typeof(p_payload->'display_name') = 'string'
        and char_length(btrim(p_payload->>'display_name')) between 1 and 120
        and jsonb_typeof(p_payload->'status') = 'string'
        and p_payload->>'status' in (
          'unclaimed', 'active', 'suspended', 'closed', 'cancelled'
        )
        and jsonb_typeof(p_payload->'revision_number') = 'number'
        and p_payload->>'revision_number' ~ '^(0|[1-9][0-9]*)$';
    end if;

    if system.jsonb_has_exact_keys(
      p_payload,
      array['site_id', 'name', 'address', 'status', 'revision_number']
    ) then
      return jsonb_typeof(p_payload->'site_id') = 'string'
        and p_payload->>'site_id' ~ uuid_pattern
        and jsonb_typeof(p_payload->'name') = 'string'
        and btrim(p_payload->>'name') <> ''
        and jsonb_typeof(p_payload->'address') in ('string', 'null')
        and (jsonb_typeof(p_payload->'address') = 'null'
          or btrim(p_payload->>'address') <> '')
        and jsonb_typeof(p_payload->'status') = 'string'
        and p_payload->>'status' in ('active', 'inactive')
        and jsonb_typeof(p_payload->'revision_number') = 'number'
        and p_payload->>'revision_number' ~ '^(0|[1-9][0-9]*)$';
    end if;

    if system.jsonb_has_exact_keys(
      p_payload,
      array['previous_owner_membership_id', 'owner_membership_id']
    ) then
      return jsonb_typeof(p_payload->'previous_owner_membership_id') = 'string'
        and p_payload->>'previous_owner_membership_id' ~ uuid_pattern
        and jsonb_typeof(p_payload->'owner_membership_id') = 'string'
        and p_payload->>'owner_membership_id' ~ uuid_pattern;
    end if;

    if system.jsonb_has_exact_keys(p_payload, array['owner_membership_id']) then
      return jsonb_typeof(p_payload->'owner_membership_id') = 'string'
        and p_payload->>'owner_membership_id' ~ uuid_pattern;
    end if;

    -- No limit is `null`, and it is the only shape that is not a number. A quota of
    -- zero would be a gym that may invite nobody, which is not something Allfit sells.
    if system.jsonb_has_exact_keys(
      p_payload,
      array['guest_quota_seats', 'revision_number']
    ) then
      return jsonb_typeof(p_payload->'guest_quota_seats') in ('number', 'null')
        and (
          jsonb_typeof(p_payload->'guest_quota_seats') = 'null'
          or (p_payload->>'guest_quota_seats' ~ '^[1-9][0-9]*$'
            and (p_payload->>'guest_quota_seats')::bigint <= 1000000)
        )
        and jsonb_typeof(p_payload->'revision_number') = 'number'
        and p_payload->>'revision_number' ~ '^(0|[1-9][0-9]*)$';
    end if;

    -- The same number with the agreement it was sold under. `null` is a gym that had no
    -- agreement yet, which only a snapshot of the state before can say.
    if system.jsonb_has_exact_keys(
      p_payload,
      array['guest_quota_seats', 'agreement_reference', 'revision_number']
    ) then
      return jsonb_typeof(p_payload->'guest_quota_seats') in ('number', 'null')
        and (
          jsonb_typeof(p_payload->'guest_quota_seats') = 'null'
          or (p_payload->>'guest_quota_seats' ~ '^[1-9][0-9]*$'
            and (p_payload->>'guest_quota_seats')::bigint <= 1000000)
        )
        and jsonb_typeof(p_payload->'agreement_reference') in ('string', 'null')
        and (
          jsonb_typeof(p_payload->'agreement_reference') = 'null'
          or (p_payload->>'agreement_reference' = btrim(p_payload->>'agreement_reference')
            and char_length(p_payload->>'agreement_reference') between 1 and 120
            and p_payload->>'agreement_reference' !~ '[[:cntrl:]]')
        )
        and jsonb_typeof(p_payload->'revision_number') = 'number'
        and p_payload->>'revision_number' ~ '^(0|[1-9][0-9]*)$';
    end if;

    return false;
  end if;

  if p_contract_code = 'audit.membership_event_snapshot' then
    if system.jsonb_has_exact_keys(
      p_payload,
      array['organization_id', 'person_id', 'status']
    ) then
      return jsonb_typeof(p_payload->'organization_id') = 'string'
        and p_payload->>'organization_id' ~ uuid_pattern
        and jsonb_typeof(p_payload->'person_id') = 'string'
        and p_payload->>'person_id' ~ uuid_pattern
        and jsonb_typeof(p_payload->'status') = 'string'
        and p_payload->>'status' in ('active', 'terminated');
    end if;

    if system.jsonb_has_exact_keys(
      p_payload,
      array[
        'organization_id', 'person_id', 'status',
        'role_code', 'valid_from', 'valid_to'
      ]
    ) then
      return jsonb_typeof(p_payload->'organization_id') = 'string'
        and p_payload->>'organization_id' ~ uuid_pattern
        and jsonb_typeof(p_payload->'person_id') = 'string'
        and p_payload->>'person_id' ~ uuid_pattern
        and jsonb_typeof(p_payload->'status') = 'string'
        and p_payload->>'status' in ('active', 'terminated')
        and jsonb_typeof(p_payload->'role_code') = 'string'
        and p_payload->>'role_code' in ('owner', 'admin', 'coach', 'staff')
        and jsonb_typeof(p_payload->'valid_from') = 'string'
        and p_payload->>'valid_from' ~ timestamp_pattern
        and jsonb_typeof(p_payload->'valid_to') in ('string', 'null')
        and (jsonb_typeof(p_payload->'valid_to') = 'null'
          or p_payload->>'valid_to' ~ timestamp_pattern);
    end if;

    return false;
  end if;

  return false;
end
$function$;

-- Both quota shapes for the quota event: the one recorded before the agreement existed,
-- and the one that names it. Everything else is unchanged.
create or replace function organizations.validate_organization_event_snapshot(
  p_event_type text,
  p_schema_version smallint,
  p_payload jsonb
)
returns boolean
language sql
immutable
strict
security invoker
set search_path = pg_catalog
as $function$
  select system.validate_json_contract(
    'audit.organization_event_snapshot',
    p_schema_version,
    p_payload
  ) and case
    when p_event_type in (
      'organization.created.v1', 'organization.updated.v1',
      'organization.created_unclaimed.v1', 'organization.cancelled.v1',
      'organization.suspended.v1', 'organization.reactivated.v1',
      'organization.closed.v1'
    ) then
      system.jsonb_has_exact_keys(
        p_payload,
        array['type_code', 'legal_name', 'display_name', 'status', 'revision_number']
      )
    when p_event_type in ('organization.site_created.v1', 'organization.site_updated.v1') then
      system.jsonb_has_exact_keys(
        p_payload,
        array['site_id', 'name', 'address', 'status', 'revision_number']
      )
    when p_event_type = 'organization.ownership_transferred.v1' then
      system.jsonb_has_exact_keys(
        p_payload,
        array['previous_owner_membership_id', 'owner_membership_id']
      )
    when p_event_type = 'organization.claimed.v1' then
      system.jsonb_has_exact_keys(p_payload, array['owner_membership_id'])
    when p_event_type = 'organization.guest_quota_set.v1' then
      system.jsonb_has_exact_keys(p_payload, array['guest_quota_seats', 'revision_number'])
      or system.jsonb_has_exact_keys(
        p_payload,
        array['guest_quota_seats', 'agreement_reference', 'revision_number']
      )
    else false
  end
$function$;

-- A quota recorded with an agreement names one after the change. Only the state before
-- may have none: the gym's first agreement replaces nothing.
alter table organizations.organization_events
  add constraint ck_organization_events_quota_agreement check (
    event_type <> 'organization.guest_quota_set.v1'
    or not (after_snapshot ? 'agreement_reference')
    or jsonb_typeof(after_snapshot->'agreement_reference') = 'string'
  );

-- ---------------------------------------------------------------------------
-- How it is reported
-- ---------------------------------------------------------------------------

-- The agreement in force, and the one each change was made under. A change recorded
-- before the reference existed has no key, which reads as `null`.
create or replace function organizations.guest_quota_projection(p_organization_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog
as $function$
  with changes as (
    select event.id,
           event.occurred_at,
           event.actor_person_id,
           event.actor_duty_assignment_id,
           event.before_snapshot->'guest_quota_seats' as previous_seats,
           event.after_snapshot->'guest_quota_seats' as seats,
           event.after_snapshot->'agreement_reference' as agreement_reference
    from organizations.organization_events as event
    where event.organization_id = p_organization_id
      and event.event_type = 'organization.guest_quota_set.v1'
  )
  select jsonb_build_object(
    'organization_id', target.id,
    'seats', target.guest_quota_seats,
    'agreement_reference', target.guest_quota_agreement_reference,
    'occupied', live.occupied,
    'relationships_active', live.relationships_active,
    'invitations_pending', live.invitations_pending,
    'places_left', case
      when target.guest_quota_seats is null then null
      else greatest(target.guest_quota_seats - live.occupied, 0)
    end,
    'over_quota', target.guest_quota_seats is not null
      and live.occupied > target.guest_quota_seats,
    'last_change', (
      select jsonb_build_object(
        'at', change.occurred_at,
        'by_person_id', change.actor_person_id,
        'by_name', support.platform_staff_name(change.actor_person_id),
        'by_duty_assignment_id', change.actor_duty_assignment_id,
        'previous_seats', change.previous_seats,
        'agreement_reference', change.agreement_reference
      )
      from changes as change
      order by change.occurred_at desc, change.id desc
      limit 1
    ),
    'history', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'at', change.occurred_at,
            'by_person_id', change.actor_person_id,
            'by_name', support.platform_staff_name(change.actor_person_id),
            'seats', change.seats,
            'previous_seats', change.previous_seats,
            'agreement_reference', change.agreement_reference
          )
          order by change.occurred_at desc, change.id desc
        )
        from changes as change
      ),
      '[]'::jsonb
    )
  )
  from organizations.organizations as target
  cross join lateral organizations.organization_guest_occupancy(target.id) as live
  where target.id = p_organization_id
$function$;

-- ---------------------------------------------------------------------------
-- OP-ORG-023 — set what a gym may fill, under a named agreement
-- ---------------------------------------------------------------------------

drop function organizations.set_organization_guest_quota(
  uuid, uuid, uuid, integer, uuid, uuid, bytea
);

create function organizations.set_organization_guest_quota(
  p_actor_person_id uuid,
  p_actor_session_id uuid,
  p_organization_id uuid,
  p_seats integer,
  p_agreement_reference text,
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
  duty_id uuid;
  receipt record;
  target organizations.organizations%rowtype;
  agreement text := btrim(p_agreement_reference);
begin
  duty_id := organizations.require_platform_commercial_duty(
    p_actor_person_id, p_actor_session_id
  );

  if p_seats is not null and (p_seats <= 0 or p_seats > 1000000) then
    raise exception 'a quota is a number of people, or none at all' using errcode = '22023';
  end if;
  if agreement is null or agreement = '' or char_length(agreement) > 120
     or agreement ~ '[[:cntrl:]]' then
    raise exception 'a quota is set under a named agreement' using errcode = '22023';
  end if;

  -- Locked before the state is read, so two operators deciding at once leave the
  -- second one's event with the first one's value as its previous.
  select organization.* into target
  from organizations.organizations as organization
  where organization.id = p_organization_id
  for update;
  if target.id is null then
    raise exception 'organization not found' using errcode = 'P0002';
  end if;
  if target.status in ('closed', 'cancelled') then
    raise exception 'a gym that no longer operates is not sold a quota' using errcode = '55000';
  end if;

  select * into receipt
  from system.begin_idempotency(
    p_actor_person_id, 'backoffice'::system.command_surface, 'backoffice',
    'OP-ORG-023', p_idempotency_key, p_command_id, p_request_hash
  );
  if not receipt.claimed then
    if receipt.aggregate_id is null then
      raise exception 'idempotent quota decision not found' using errcode = '40001';
    end if;
    return query select organizations.guest_quota_projection(receipt.aggregate_id), true;
    return;
  end if;

  -- The same number under the same agreement is not a change; a new agreement for the
  -- same number is a renewal, and it is recorded.
  if target.guest_quota_seats is distinct from p_seats
     or target.guest_quota_agreement_reference is distinct from agreement then
    update organizations.organizations
    set guest_quota_seats = p_seats,
        guest_quota_agreement_reference = agreement,
        revision_number = revision_number + 1
    where id = p_organization_id;

    insert into organizations.organization_events (
      organization_id, event_type, before_snapshot, after_snapshot,
      actor_person_id, actor_duty_assignment_id
    ) values (
      p_organization_id,
      'organization.guest_quota_set.v1',
      jsonb_build_object(
        'guest_quota_seats', target.guest_quota_seats,
        'agreement_reference', target.guest_quota_agreement_reference,
        'revision_number', target.revision_number
      ),
      jsonb_build_object(
        'guest_quota_seats', p_seats,
        'agreement_reference', agreement,
        'revision_number', target.revision_number + 1
      ),
      p_actor_person_id,
      duty_id
    );
  end if;

  perform system.finish_idempotency(
    receipt.receipt_id, 200::smallint, 'organization-guest-quota-set',
    'organization', p_organization_id
  );
  return query select organizations.guest_quota_projection(p_organization_id), false;
end
$function$;

alter function organizations.set_organization_guest_quota(
  uuid, uuid, uuid, integer, text, uuid, uuid, bytea
) owner to allfit_owner;
revoke all on function organizations.set_organization_guest_quota(
  uuid, uuid, uuid, integer, text, uuid, uuid, bytea
) from public;
grant execute on function organizations.set_organization_guest_quota(
  uuid, uuid, uuid, integer, text, uuid, uuid, bytea
) to allfit_api;
