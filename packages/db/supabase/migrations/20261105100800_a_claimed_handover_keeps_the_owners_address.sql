-- A claimed handover keeps the owner's address — `HU-BO-013` c5 and `HU-BO-014`.
--
-- The gym's file withholds the site address of a gym a natural person answers for, and
-- says it is withheld. The handover kept showing it after the owner claimed the gym, so
-- the address the file reserves was one link away. Before the claim the address is what
-- Allfit typed when it created the gym, and it is still shown; after it, the handover
-- withholds it like the file. A company's address is never withheld.
--
-- Restated from the definition in force (`20261105100000`) with the site block alone
-- changed, and `address_withheld` added to it.

set lock_timeout = '5s';
set statement_timeout = '60s';

CREATE OR REPLACE FUNCTION organizations.handover_projection(p_organization_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
  select jsonb_build_object(
    'organization_id', organization.id,
    'display_name', organization.display_name,
    'type_code', organization.type_code,
    'type_name', organization_type.name,
    'party_kind', organization.responsible_party->>'party_kind',
    'legal_name', organization.legal_name,
    'status', organization.status,
    'created_at', organization.created_at,
    'claimed_at', organization.claimed_at,
    'cancelled_at', organization.cancelled_at,
    'created_by', (
      select jsonb_build_object(
        'person_id', event.actor_person_id,
        'name', support.platform_staff_name(event.actor_person_id)
      )
      from organizations.organization_events as event
      where event.organization_id = organization.id
        and event.event_type = 'organization.created_unclaimed.v1'
      order by event.occurred_at, event.id
      limit 1
    ),
    'cancelled_by', (
      select jsonb_build_object(
        'person_id', event.actor_person_id,
        'name', support.platform_staff_name(event.actor_person_id)
      )
      from organizations.organization_events as event
      where event.organization_id = organization.id
        and event.event_type = 'organization.cancelled.v1'
      order by event.occurred_at desc, event.id desc
      limit 1
    ),
    'site', (
      -- Once a natural person claims the gym the address is theirs, as the file treats it.
      select jsonb_build_object(
        'site_id', site.id,
        'name', site.name,
        'address', case when withheld.applies then null else site.address end,
        'address_withheld', withheld.applies and site.address is not null
      )
      from organizations.organization_sites as site
      cross join lateral (
        select organization.responsible_party->>'party_kind' = 'natural_person'
          and organization.status not in ('unclaimed', 'cancelled') as applies
      ) as withheld
      where site.organization_id = organization.id
      order by site.created_at, site.id
      limit 1
    ),
    'invitation', (
      select jsonb_build_object(
        'invitation_id', invitation.id,
        'status', invitation.status,
        'intent_status', intent.status,
        'contact_hint',
          left(split_part(invitation.contact::text, '@', 1), 1) || '***@'
            || split_part(invitation.contact::text, '@', 2),
        'expires_at', invitation.expires_at
      )
      from identity.invitations as invitation
      join identity.invitation_intents as intent
        on intent.invitation_id = invitation.id
       and intent.kind = 'ownership'
      where invitation.organization_id = organization.id
      order by invitation.created_at desc, invitation.id desc
      limit 1
    )
  )
  from organizations.organizations as organization
  join organizations.organization_types as organization_type
    on organization_type.code = organization.type_code
  where organization.id = p_organization_id
$function$;
