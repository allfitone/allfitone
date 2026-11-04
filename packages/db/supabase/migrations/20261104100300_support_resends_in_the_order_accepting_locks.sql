-- OP-IDN-051 — support resends a client invitation in the order accepting locks.
--
-- Accepting (`identity.decide_client_invitation`) locks the invitation and then the
-- organization, and so does issuing one (`identity.issue_client_invitation`); the guest
-- quota documentation fixes that order. The Backoffice resend locked the organization
-- first and then the invitation. When support resent an invitation in the same instant
-- the person accepted it, each held what the other waited for, and PostgreSQL aborted
-- one of them as a deadlock (`40P01`).
--
-- The resend now locks the invitation first and the organization second. The two
-- lookups only change places; what is checked, refused and written is unchanged, and a
-- missing organization is still refused before a missing invitation.
--
-- The body is `20261103170000`'s with those two lookups reordered; nothing else changed.

set lock_timeout = '5s';
set statement_timeout = '60s';

create or replace function identity.resend_client_invitation(
  p_actor_person_id uuid,
  p_actor_session_id uuid,
  p_organization_id uuid,
  p_invitation_id uuid,
  p_token_hash bytea,
  p_token_key_version smallint,
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
  response jsonb;
  organization_state organizations.organization_status;
  target identity.invitations%rowtype;
  target_intent identity.invitation_intents%rowtype;
  reissued_intent_id uuid;
  lapsed boolean;
  delivered uuid;
  resend_outcome text;
begin
  duty_id := identity.require_invitation_resender(p_actor_person_id, p_actor_session_id);
  if p_token_hash is null
     or octet_length(p_token_hash) <> 32
     or p_token_key_version is null
     or p_token_key_version <= 0 then
    raise exception 'invalid client invitation resend' using errcode = '22023';
  end if;

  -- Invitation, then organization: the order accepting and issuing take them in.
  select invitation.* into target
  from identity.invitations as invitation
  where invitation.id = p_invitation_id
    and invitation.organization_id = p_organization_id
  for update;
  select organization.status into organization_state
  from organizations.organizations as organization
  where organization.id = p_organization_id
  for update;
  if organization_state is null then
    raise exception 'organization not found' using errcode = 'P0002';
  end if;

  select intent.* into target_intent
  from identity.invitation_intents as intent
  where intent.invitation_id = p_invitation_id
    and intent.kind = 'service_relationship';
  if target.id is null or target_intent.id is null then
    raise exception 'client invitation not found' using errcode = 'P0002';
  end if;

  select * into receipt
  from system.begin_idempotency(
    p_actor_person_id, 'backoffice'::system.command_surface, 'backoffice',
    'OP-IDN-051', p_idempotency_key, p_command_id, p_request_hash
  );
  if not receipt.claimed then
    response := identity.backoffice_client_invitation_projection(receipt.aggregate_id);
    if response is null then
      raise exception 'idempotent client invitation resend not found' using errcode = '40001';
    end if;
    return query select
      response || jsonb_build_object(
        'outcome',
        case when receipt.aggregate_id = p_invitation_id then 'redelivered' else 'reissued' end
      ),
      true;
    return;
  end if;

  if organization_state <> 'active' then
    raise exception 'only an operating organization has client invitations to resend'
      using errcode = '55000';
  end if;

  lapsed := target.status::text = 'expired'
    or (target.status::text = 'pending' and target.expires_at <= clock_timestamp());

  if target.status::text = 'pending' and not lapsed then
    resend_outcome := 'redelivered';
    delivered := target.id;
  elsif lapsed and target_intent.status::text in ('pending', 'expired') then
    if exists (
      select 1 from identity.invitations as reissue
      where reissue.reissues_invitation_id = target.id
    ) then
      raise exception 'this invitation was already reissued; resend the new one'
        using errcode = '55000';
    end if;
    if exists (
      select 1 from identity.invitations as equal
      where equal.organization_id = target.organization_id
        and equal.proposal_hash = target.proposal_hash
        and equal.id <> target.id
        and equal.status::text = 'pending'
        and equal.expires_at > clock_timestamp()
    ) then
      raise exception 'an equal invitation is already pending' using errcode = '55000';
    end if;
    -- A reissue is a new invitation and takes a place. The organization row is locked
    -- above, so issuing and accepting wait on it here.
    if organizations.guest_places_exhausted(target.organization_id, 0) then
      raise exception 'the organization has no guest places left' using errcode = 'AF409';
    end if;
    resend_outcome := 'reissued';
    delivered := p_command_id;
  else
    raise exception 'only a pending or expired invitation is resent' using errcode = '55000';
  end if;

  -- The windows Studio consumes, so support's mail counts against the same limits.
  perform system.consume_invitation_rate_window(
    'actor_hour',
    extensions.digest(convert_to(p_actor_person_id::text, 'UTF8'), 'sha256'),
    interval '1 hour',
    20
  );
  perform system.consume_invitation_rate_window(
    'destination_day',
    extensions.digest(
      convert_to(target.organization_id::text || chr(31) || lower(target.contact::text), 'UTF8'),
      'sha256'
    ),
    interval '24 hours',
    3
  );

  if resend_outcome = 'redelivered' then
    update identity.invitations as invitation
    set expires_at = clock_timestamp() + interval '7 days'
    where invitation.id = target.id;

    perform system.enqueue_outbox_event(
      'invitation', target.id, 'relationship.client_invited.v1',
      jsonb_build_object('invitation_id', target.id)
    );
  else
    if target.status::text = 'pending' then
      update identity.invitations as invitation
      set status = 'expired'
      where invitation.id = target.id;
      perform system.enqueue_outbox_event(
        'invitation', target.id, 'identity.invitation_expired.v1',
        jsonb_build_object('invitation_id', target.id)
      );
    end if;
    update identity.invitation_intents as intent
    set status = 'expired', decided_at = clock_timestamp()
    where intent.invitation_id = target.id
      and intent.status = 'pending';

    insert into identity.invitations (
      id, organization_id, issued_by_person_id, issued_by_duty_assignment_id,
      reissues_invitation_id, channel, contact, token_hash, token_key_version, proposal_hash,
      responsible_party, expires_at
    )
    select p_command_id, organization.id, p_actor_person_id, duty_id,
           target.id, target.channel, target.contact, p_token_hash, p_token_key_version,
           target.proposal_hash, organization.responsible_party,
           clock_timestamp() + interval '7 days'
    from organizations.organizations as organization
    where organization.id = target.organization_id;
    insert into identity.invitation_intents (invitation_id, kind)
    values (p_command_id, 'service_relationship')
    returning id into reissued_intent_id;

    -- The offer, exactly as it was asked, under the version it was asked under. The
    -- constraint trigger rejects the transaction if this copied anything else.
    insert into privacy.invitation_scope_options (
      invitation_intent_id, scope_definition_id, scope_code,
      offered_access_level, purpose, presented_snapshot_schema_version, presented_snapshot
    )
    select reissued_intent_id, option.scope_definition_id, option.scope_code,
           option.offered_access_level, option.purpose,
           option.presented_snapshot_schema_version, option.presented_snapshot
    from privacy.invitation_scope_options as option
    where option.invitation_intent_id = target_intent.id;

    perform system.enqueue_outbox_event(
      'invitation', p_command_id, 'relationship.client_invited.v1',
      jsonb_build_object('invitation_id', p_command_id)
    );
  end if;

  insert into identity.invitation_resends (
    invitation_id, delivered_invitation_id, kind, outcome, actor_person_id,
    actor_duty_assignment_id
  ) values (
    target.id, delivered, 'service_relationship', resend_outcome, p_actor_person_id, duty_id
  );

  perform system.finish_idempotency(
    receipt.receipt_id, 200::smallint, 'client-invitation-resent', 'invitation', delivered
  );
  return query select
    identity.backoffice_client_invitation_projection(delivered)
      || jsonb_build_object('outcome', resend_outcome),
    false;
end
$function$;
alter function identity.resend_client_invitation(
  uuid, uuid, uuid, uuid, bytea, smallint, uuid, uuid, bytea
) owner to allfit_owner;
revoke all on function identity.resend_client_invitation(
  uuid, uuid, uuid, uuid, bytea, smallint, uuid, uuid, bytea
) from public;
grant execute on function identity.resend_client_invitation(
  uuid, uuid, uuid, uuid, bytea, smallint, uuid, uuid, bytea
) to allfit_api;
