-- Security notices reach her even when she acted, and a subject that awaits her decision
-- keeps one notice (ADR-054 decisions 4 and 5, as amended on 25 November 2026). TECH-44.
--
-- **Two security rows join the map.** `identity.password_changed.v1` is `password_changed`
-- and `identity.contact_verified.v1`, the email change she confirmed (not the one she
-- asked for), is `email_changed`. Both are category `security`, and the actor rule never
-- skips them: whoever changed her password or email may not have been her, and that is the
-- reason to tell her. The recipient is the person of the password change or of the email
-- change request the event names. A confirmed change that WorkOS then refuses is still
-- told: the code was entered, and that is what she has to know about.
--
-- **One subject that awaits a decision, one notice.** An invitation sent again emits
-- `relationship.client_invited.v1` once more for the same invitation. Instead of a second
-- notice, the one she has is refreshed: it points at the newer event, moves to its
-- instant and is unread again. A partial unique index holds the rule for the four kinds
-- that await, whoever writes. A phone that already had its push keeps it: the refreshed
-- notice is not pushed twice to the same phone.
--
-- **The map is one function.** `identity.resolve_notice_target` turns an event into kind,
-- category, subject, recipient and organization; the projection trigger and the email gate
-- both read it, so the inbox and the mailbox can never disagree about whose an event is.
--
-- **The email gate.** `identity.email_allowed_for_event` answers the worker whether the
-- email of an event may go: always for security, and for any other category while her
-- preference for email is on, a missing row reading as on. An event with no person behind
-- it, such as an invitation to an address nobody holds yet, goes as it always did, and so
-- does an event outside the map. Only the worker asks.
--
-- Forward-only over `20261214090000`, which is applied.

set lock_timeout = '5s';
set statement_timeout = '60s';

-- ---------------------------------------------------------------------------
-- One notice per subject that awaits a decision
-- ---------------------------------------------------------------------------

create unique index uidx_person_notifications_awaiting_subject
  on identity.person_notifications (person_id, kind, subject_id)
  where kind in ('client_invitation', 'cover_proposed', 'correction_proposed', 'goal_proposed');

-- The projection refreshes a notice of the recipient it is writing for.
create policy person_notifications_update_projection on identity.person_notifications
  for update to allfit_owner
  using (person_id::text = (select access_control.contract_scope('notice_recipient')))
  with check (person_id::text = (select access_control.contract_scope('notice_recipient')));

create or replace function identity.keep_person_notification()
returns trigger
language plpgsql
set search_path = pg_catalog
as $function$
declare
  refreshed boolean;
begin
  -- A refresh: same subject, a newer event, unread again, and only while writing for her.
  refreshed := (new.id, new.person_id, new.kind, new.category, new.subject_type, new.subject_id,
                new.organization_id)
               is not distinct from
               (old.id, old.person_id, old.kind, old.category, old.subject_type, old.subject_id,
                old.organization_id)
    and new.source_event_id is distinct from old.source_event_id
    and new.occurred_at >= old.occurred_at
    and new.read_at is null
    and new.person_id::text = access_control.contract_scope('notice_recipient');
  if refreshed then
    return new;
  end if;

  -- Otherwise only `read_at`, and only the first time.
  if (new.id, new.person_id, new.source_event_id, new.kind, new.category, new.subject_type,
      new.subject_id, new.organization_id, new.occurred_at)
     is distinct from
     (old.id, old.person_id, old.source_event_id, old.kind, old.category, old.subject_type,
      old.subject_id, old.organization_id, old.occurred_at)
     or (old.read_at is not null and new.read_at is distinct from old.read_at) then
    raise exception 'a notice is kept as it was written; only reading it is recorded' using errcode = '55000';
  end if;
  return new;
end
$function$;

-- ---------------------------------------------------------------------------
-- The map, in one place
-- ---------------------------------------------------------------------------

-- The caller saves and restores the contract scope: this opens `notice_subject` when needed.
create function identity.resolve_notice_target(p_event_type text, p_payload jsonb)
returns table (
  kind text,
  category text,
  subject_type text,
  subject_id uuid,
  recipient uuid,
  organization_id uuid
)
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  notice_kind text;
  notice_category text;
  notice_subject_type text;
  notice_subject uuid;
  person uuid;
  organization uuid;
begin
  case p_event_type
    when 'relationship.client_invited.v1' then
      notice_kind := 'client_invitation';
      notice_category := 'relationship';
      notice_subject_type := 'invitation';
      notice_subject := (p_payload ->> 'invitation_id')::uuid;
      -- Only an address a person has verified as hers. The citext operator is named:
      -- under this search path `=` would compare case-sensitively.
      select candidate.id, invitation.organization_id into person, organization
      from identity.invitations as invitation
      join identity.people as candidate
        on candidate.contact_email operator(extensions.=) invitation.contact
       and candidate.contact_email_verified_at is not null
      where invitation.id = notice_subject
        and exists (
          select 1 from identity.invitation_intents as intent
          where intent.invitation_id = invitation.id and intent.kind = 'service_relationship');
    when 'relationship.substitution_proposed.v1', 'relationship.professional_reassigned.v1' then
      notice_kind := case p_event_type
        when 'relationship.substitution_proposed.v1' then 'cover_proposed' else 'professional_changed' end;
      notice_category := 'relationship';
      notice_subject_type := 'relationship_professional_assignment';
      notice_subject := (p_payload ->> 'assignment_id')::uuid;
      person := (p_payload ->> 'person_id')::uuid;
      organization := (p_payload ->> 'organization_id')::uuid;
    when 'relationship.terminated.v1' then
      notice_kind := 'relationship_ended';
      notice_category := 'relationship';
      notice_subject_type := 'service_relationship';
      notice_subject := (p_payload ->> 'relationship_id')::uuid;
      perform access_control.open_contract_scope('notice_subject', notice_subject);
      select relationship.person_id, relationship.organization_id into person, organization
      from relationships.service_relationships as relationship
      where relationship.id = notice_subject;
    when 'payments.subscription_suspended.v1', 'payments.subscription_reactivated.v1',
         'payments.subscription_ended.v1' then
      notice_kind := case p_event_type
        when 'payments.subscription_suspended.v1' then 'plan_paused'
        when 'payments.subscription_reactivated.v1' then 'plan_resumed'
        else 'plan_ended' end;
      notice_category := 'relationship';
      notice_subject_type := 'plan_subscription';
      notice_subject := (p_payload ->> 'subscription_id')::uuid;
      person := (p_payload ->> 'person_id')::uuid;
      organization := (p_payload ->> 'organization_id')::uuid;
    when 'planning.assignment_created.v1' then
      notice_kind := 'program_assigned';
      notice_category := 'assignment';
      notice_subject_type := 'program_assignment';
      notice_subject := (p_payload ->> 'assignment_id')::uuid;
      person := (p_payload ->> 'person_id')::uuid;
      if p_payload ->> 'relationship_id' is not null then
        perform access_control.open_contract_scope('notice_subject', (p_payload ->> 'relationship_id')::uuid);
        select relationship.organization_id into organization
        from relationships.service_relationships as relationship
        where relationship.id = (p_payload ->> 'relationship_id')::uuid;
      end if;
    when 'execution.correction_proposed.v1' then
      notice_kind := 'correction_proposed';
      notice_category := 'correction';
      notice_subject_type := 'correction_proposal';
      notice_subject := (p_payload ->> 'proposal_id')::uuid;
      perform access_control.open_contract_scope('notice_subject', notice_subject);
      select proposal.person_id, proposal.organization_id into person, organization
      from execution.correction_proposals as proposal
      where proposal.id = notice_subject;
    when 'nutrition.goal_version_proposed.v1' then
      notice_kind := 'goal_proposed';
      notice_category := 'nutrition';
      notice_subject_type := 'nutrition_goal_version';
      notice_subject := (p_payload ->> 'goal_version_id')::uuid;
      person := (p_payload ->> 'person_id')::uuid;
      organization := (p_payload ->> 'organization_id')::uuid;
    when 'identity.password_changed.v1' then
      notice_kind := 'password_changed';
      notice_category := 'security';
      notice_subject_type := 'password_change';
      notice_subject := (p_payload ->> 'change_id')::uuid;
      select change.person_id into person
      from identity.password_changes as change
      where change.id = notice_subject;
    when 'identity.contact_verified.v1' then
      notice_kind := 'email_changed';
      notice_category := 'security';
      notice_subject_type := 'identity_action_request';
      notice_subject := (p_payload ->> 'request_id')::uuid;
      select request.person_id into person
      from identity.identity_action_requests as request
      where request.id = notice_subject and request.action_kind = 'email_change';
    else
      return;
  end case;

  return query select notice_kind, notice_category, notice_subject_type, notice_subject,
                      person, organization;
end
$function$;

-- ---------------------------------------------------------------------------
-- The projection, now with security and refreshes
-- ---------------------------------------------------------------------------

create or replace function identity.project_notice_from_event()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  saved_purpose text := current_setting('app.contract_scope_purpose', true);
  saved_id text := current_setting('app.contract_scope_id', true);
  saved_token text := current_setting('app.contract_scope_token', true);
  target record;
  created uuid;
begin
  select * into target from identity.resolve_notice_target(new.event_type, new.payload);

  -- Nobody is told what she did herself, except about her security; nobody who does not
  -- exist is told anything.
  if target.recipient is not null
     and (target.category = 'security' or target.recipient is distinct from access_control.person())
     and exists (select 1 from identity.people as person where person.id = target.recipient) then
    perform access_control.open_contract_scope('notice_recipient', target.recipient);

    if target.kind in ('client_invitation', 'cover_proposed', 'correction_proposed', 'goal_proposed') then
      update identity.person_notifications as notice
      set source_event_id = new.id,
          occurred_at = greatest(new.occurred_at, notice.occurred_at),
          read_at = null
      where notice.person_id = target.recipient
        and notice.kind = target.kind
        and notice.subject_id = target.subject_id
      returning notice.id into created;
    end if;

    if created is null then
      insert into identity.person_notifications (
        person_id, source_event_id, kind, category, subject_type, subject_id, organization_id, occurred_at
      )
      values (
        target.recipient, new.id, target.kind, target.category, target.subject_type,
        target.subject_id, target.organization_id, new.occurred_at
      )
      returning id into created;
    end if;

    -- Security always goes; the rest follows her push preference, a missing row reading as on.
    if target.category = 'security' or coalesce((
      select preference.enabled from identity.notification_preferences as preference
      where preference.person_id = target.recipient
        and preference.category = target.category
        and preference.channel = 'push'), true) then
      insert into system.notification_deliveries (notification_id, device_id)
      select created, device.id
      from identity.person_push_devices as device
      where device.person_id = target.recipient
        and device.retired_at is null
        and not exists (
          select 1 from system.notification_deliveries as delivered
          where delivered.notification_id = created and delivered.device_id = device.id);
    end if;
  end if;

  perform set_config('app.contract_scope_purpose', coalesce(saved_purpose, ''), true);
  perform set_config('app.contract_scope_id', coalesce(saved_id, ''), true);
  perform set_config('app.contract_scope_token', coalesce(saved_token, ''), true);
  return null;
end
$function$;

-- The deliveries the refresh checks for are the recipient's, read while writing for her.
create policy notification_deliveries_select_projection on system.notification_deliveries
  for select to allfit_owner
  using (exists (
    select 1 from identity.person_notifications as notice
    where notice.id = notification_id
      and notice.person_id::text = (select access_control.contract_scope('notice_recipient'))));

drop trigger trg_outbox_events_after_insert_project_notice on system.outbox_events;

create trigger trg_outbox_events_after_insert_project_notice
after insert on system.outbox_events
for each row
when (new.event_type in (
  'relationship.client_invited.v1',
  'relationship.substitution_proposed.v1',
  'relationship.professional_reassigned.v1',
  'relationship.terminated.v1',
  'payments.subscription_suspended.v1',
  'payments.subscription_reactivated.v1',
  'payments.subscription_ended.v1',
  'planning.assignment_created.v1',
  'execution.correction_proposed.v1',
  'nutrition.goal_version_proposed.v1',
  'identity.password_changed.v1',
  'identity.contact_verified.v1'))
execute function identity.project_notice_from_event();

-- ---------------------------------------------------------------------------
-- The email gate, for the worker's consumers
-- ---------------------------------------------------------------------------

create function identity.email_allowed_for_event(p_event_id uuid)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  saved_purpose text := current_setting('app.contract_scope_purpose', true);
  saved_id text := current_setting('app.contract_scope_id', true);
  saved_token text := current_setting('app.contract_scope_token', true);
  event record;
  target record;
  allowed boolean := true;
begin
  if access_control.actor_kind() is distinct from 'worker' then
    raise exception 'only the worker asks whether an email may go' using errcode = '42501';
  end if;

  select outbox.event_type, outbox.payload into event
  from system.outbox_events as outbox
  where outbox.id = p_event_id;
  if event.event_type is null then
    return true;
  end if;

  select * into target from identity.resolve_notice_target(event.event_type, event.payload);
  if target.recipient is not null and target.category is distinct from 'security' then
    perform access_control.open_contract_scope('notice_recipient', target.recipient);
    allowed := coalesce((
      select preference.enabled from identity.notification_preferences as preference
      where preference.person_id = target.recipient
        and preference.category = target.category
        and preference.channel = 'email'), true);
  end if;

  perform set_config('app.contract_scope_purpose', coalesce(saved_purpose, ''), true);
  perform set_config('app.contract_scope_id', coalesce(saved_id, ''), true);
  perform set_config('app.contract_scope_token', coalesce(saved_token, ''), true);
  return allowed;
end
$function$;

-- ---------------------------------------------------------------------------
-- Ownership and privileges
-- ---------------------------------------------------------------------------

alter function identity.resolve_notice_target(text, jsonb) owner to allfit_owner;
alter function identity.email_allowed_for_event(uuid) owner to allfit_owner;

revoke all on function identity.resolve_notice_target(text, jsonb) from public, allfit_api;
revoke all on function identity.email_allowed_for_event(uuid) from public;

grant execute on function identity.email_allowed_for_event(uuid) to allfit_api;
