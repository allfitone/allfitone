-- Every notice is kept for the person, and each channel only carries it (ADR-054,
-- `OP-IDN-074`, `OP-IDN-075`, `HU-SP-091`). TECH-44.
--
-- **A notice is born from the event, in its transaction.** An `AFTER INSERT` trigger on
-- `system.outbox_events` runs a closed map from event type to kind, category and
-- recipient, and writes one row in `identity.person_notifications`. If the event commits
-- the notice exists; if it rolls back, neither does. The map is ADR-054's table:
--
--   relationship.client_invited.v1           client_invitation     relationship
--   relationship.substitution_proposed.v1    cover_proposed        relationship
--   relationship.professional_reassigned.v1  professional_changed  relationship
--   relationship.terminated.v1               relationship_ended    relationship
--   payments.subscription_suspended.v1       plan_paused           relationship
--   payments.subscription_reactivated.v1     plan_resumed          relationship
--   payments.subscription_ended.v1           plan_ended            relationship
--   planning.assignment_created.v1           program_assigned      assignment
--   execution.correction_proposed.v1         correction_proposed   correction
--   nutrition.goal_version_proposed.v1       goal_proposed         nutrition
--
-- **The recipient is resolved from what the event carries.** Payload `person_id` where it
-- has one. A client invitation reaches the person whose verified contact email is the
-- invitation's contact, the same match `identity.list_my_client_invitations` makes; any
-- other invitation stays an email. A terminated relationship and a proposed correction
-- carry only their subject, so the trigger reads the relationship or the proposal through
-- the `notice_subject` scope, which shows that one row and nothing else.
--
-- **Nobody is told what she did herself.** When the transaction's acting person is the
-- recipient there is no notice: the plan she cancelled, the program planted when she
-- accepted an invitation. That is also why ADR-054's two security rows are not mapped
-- here: in V1 the person is always the actor of her password and email changes, so rule 4
-- would leave them empty. ADR-054 has to settle which rule yields before they are added.
--
-- **A notice holds no words.** Kind, category, subject, organization and instants. The
-- names the sentence needs are read at list time, and «awaits your decision» is read
-- from the subject too: a pending, unexpired invitation, cover, correction or goal
-- awaits; decided anywhere, it stops without a second write.
--
-- **Push is a pending delivery per active phone**, created with the notice when push is
-- on for its category; a missing preference reads as on. Turning a channel off never
-- removes a notice. A phone that is retired or changes hands skips what still waited
-- for it, so nobody's push reaches a phone she no longer holds. The job that sends them
-- is the worker's and is not part of this migration.
--
-- **Only the person reads and marks her notices.** The runtime role has no privilege on
-- either table; nobody, her included, reads the deliveries. The writer is the trigger,
-- through the `notice_recipient` scope, which a closed function alone can open. Every
-- scope a trigger opens is restored, because the command that raised the event may still
-- be relying on its own.
--
-- Additive.

set lock_timeout = '5s';
set statement_timeout = '60s';

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table identity.person_notifications (
  id uuid not null default extensions.uuid_generate_v7(),
  person_id uuid not null,
  -- Not a foreign key: published events are pruned and the notice outlives them.
  source_event_id uuid not null,
  kind text not null,
  category text not null,
  subject_type text not null,
  subject_id uuid not null,
  organization_id uuid,
  occurred_at timestamp with time zone not null,
  read_at timestamp with time zone,
  constraint pk_person_notifications primary key (id),
  constraint fk_person_notifications_person foreign key (person_id) references identity.people (id) on delete cascade,
  constraint uq_person_notifications_event unique (person_id, source_event_id),
  constraint ck_person_notifications_kind check ((kind, category) in (
    ('client_invitation', 'relationship'),
    ('cover_proposed', 'relationship'),
    ('professional_changed', 'relationship'),
    ('relationship_ended', 'relationship'),
    ('plan_paused', 'relationship'),
    ('plan_resumed', 'relationship'),
    ('plan_ended', 'relationship'),
    ('program_assigned', 'assignment'),
    ('correction_proposed', 'correction'),
    ('goal_proposed', 'nutrition'),
    ('password_changed', 'security'),
    ('email_changed', 'security'))),
  constraint ck_person_notifications_subject_type check (subject_type in (
    'invitation', 'relationship_professional_assignment', 'service_relationship',
    'plan_subscription', 'program_assignment', 'correction_proposal', 'nutrition_goal_version',
    'password_change', 'identity_action_request'))
);

create index idx_person_notifications_inbox
  on identity.person_notifications (person_id, occurred_at desc, id desc);

create table system.notification_deliveries (
  id uuid not null default extensions.uuid_generate_v7(),
  notification_id uuid not null,
  device_id uuid not null,
  status text not null default 'pending',
  attempt_count integer not null default 0,
  last_error_code text,
  created_at timestamp with time zone not null default clock_timestamp(),
  sent_at timestamp with time zone,
  constraint pk_notification_deliveries primary key (id),
  constraint fk_notification_deliveries_notification foreign key (notification_id) references identity.person_notifications (id) on delete cascade,
  constraint fk_notification_deliveries_device foreign key (device_id) references identity.person_push_devices (id) on delete cascade,
  -- A retry never pushes one notice to one phone twice.
  constraint uq_notification_deliveries_device unique (notification_id, device_id),
  constraint ck_notification_deliveries_status check (status in ('pending', 'sent', 'failed', 'skipped')),
  constraint ck_notification_deliveries_attempts check (attempt_count >= 0),
  constraint ck_notification_deliveries_sent check ((status = 'sent') = (sent_at is not null))
);

create index idx_notification_deliveries_pending
  on system.notification_deliveries (created_at, id) where status = 'pending';
create index idx_notification_deliveries_device
  on system.notification_deliveries (device_id) where status = 'pending';

alter table identity.person_notifications owner to allfit_owner;
alter table system.notification_deliveries owner to allfit_owner;

revoke all on identity.person_notifications from public, allfit_api;
revoke all on system.notification_deliveries from public, allfit_api;

alter table identity.person_notifications enable row level security;
alter table identity.person_notifications force row level security;
alter table system.notification_deliveries enable row level security;
alter table system.notification_deliveries force row level security;

-- ---------------------------------------------------------------------------
-- Row policies
-- ---------------------------------------------------------------------------

-- She reads hers and marks them read; only the event writes one.
create policy person_notifications_select_self on identity.person_notifications
  for select to allfit_owner using (access_control.is_self(person_id));
create policy person_notifications_update_self on identity.person_notifications
  for update to allfit_owner
  using (access_control.is_self(person_id))
  with check (access_control.is_self(person_id));
create policy person_notifications_select_projection on identity.person_notifications
  for select to allfit_owner
  using (person_id::text = (select access_control.contract_scope('notice_recipient')));
create policy person_notifications_insert_projection on identity.person_notifications
  for insert to allfit_owner
  with check (person_id::text = (select access_control.contract_scope('notice_recipient')));

-- No person reads a delivery. The trigger writes them, and a phone leaving skips them.
create policy notification_deliveries_insert_projection on system.notification_deliveries
  for insert to allfit_owner
  with check (status = 'pending' and exists (
    select 1
    from identity.person_notifications as notice
    join identity.person_push_devices as device on device.person_id = notice.person_id
    where notice.id = notification_id
      and device.id = device_id
      and device.retired_at is null
      and notice.person_id::text = (select access_control.contract_scope('notice_recipient'))));
create policy notification_deliveries_select_retired_device on system.notification_deliveries
  for select to allfit_owner
  using (device_id::text = (select access_control.contract_scope('push_device_retirement')));
create policy notification_deliveries_update_retired_device on system.notification_deliveries
  for update to allfit_owner
  using (status = 'pending' and device_id::text = (select access_control.contract_scope('push_device_retirement')))
  with check (status = 'skipped' and device_id::text = (select access_control.contract_scope('push_device_retirement')));

-- The recipient's channels and phones, while her notice is being written.
create policy notification_preferences_select_projection on identity.notification_preferences
  for select to allfit_owner
  using (person_id::text = (select access_control.contract_scope('notice_recipient')));
create policy person_push_devices_select_projection on identity.person_push_devices
  for select to allfit_owner
  using (person_id::text = (select access_control.contract_scope('notice_recipient')));

-- The one subject an event names, when it carries nothing else to find its person by.
create policy service_relationships_select_notice_subject on relationships.service_relationships
  for select to allfit_owner
  using (id::text = (select access_control.contract_scope('notice_subject')));
create policy correction_proposals_select_notice_subject on execution.correction_proposals
  for select to allfit_owner
  using (id::text = (select access_control.contract_scope('notice_subject')));

-- ---------------------------------------------------------------------------
-- A notice is never rewritten; a retired phone skips what waited for it
-- ---------------------------------------------------------------------------

create function identity.keep_person_notification()
returns trigger
language plpgsql
set search_path = pg_catalog
as $function$
begin
  -- Only `read_at`, and only the first time: reading again changes nothing.
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

create trigger trg_person_notifications_before_update_keep
before update on identity.person_notifications
for each row execute function identity.keep_person_notification();

create function identity.skip_pushes_of_a_departed_phone()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  saved_purpose text := current_setting('app.contract_scope_purpose', true);
  saved_id text := current_setting('app.contract_scope_id', true);
  saved_token text := current_setting('app.contract_scope_token', true);
begin
  if (new.retired_at is not null and old.retired_at is null) or new.person_id <> old.person_id then
    perform access_control.open_contract_scope('push_device_retirement', new.id);
    update system.notification_deliveries as delivery
    set status = 'skipped'
    where delivery.device_id = new.id and delivery.status = 'pending';

    perform set_config('app.contract_scope_purpose', coalesce(saved_purpose, ''), true);
    perform set_config('app.contract_scope_id', coalesce(saved_id, ''), true);
    perform set_config('app.contract_scope_token', coalesce(saved_token, ''), true);
  end if;
  return null;
end
$function$;

create trigger trg_person_push_devices_after_update_skip_pending
after update of retired_at, person_id on identity.person_push_devices
for each row execute function identity.skip_pushes_of_a_departed_phone();

-- ---------------------------------------------------------------------------
-- The projection: one event, at most one notice
-- ---------------------------------------------------------------------------

create function identity.project_notice_from_event()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  saved_purpose text := current_setting('app.contract_scope_purpose', true);
  saved_id text := current_setting('app.contract_scope_id', true);
  saved_token text := current_setting('app.contract_scope_token', true);
  notice_kind text;
  notice_category text;
  notice_subject_type text;
  notice_subject uuid;
  recipient uuid;
  organization uuid;
  created uuid;
begin
  case new.event_type
    when 'relationship.client_invited.v1' then
      notice_kind := 'client_invitation';
      notice_category := 'relationship';
      notice_subject_type := 'invitation';
      notice_subject := (new.payload ->> 'invitation_id')::uuid;
      -- Only an address a person has verified as hers; any other stays an email. The
      -- citext operator is named: under this search path `=` would compare case-sensitively.
      select person.id, invitation.organization_id into recipient, organization
      from identity.invitations as invitation
      join identity.people as person
        on person.contact_email operator(extensions.=) invitation.contact
       and person.contact_email_verified_at is not null
      where invitation.id = notice_subject
        and exists (
          select 1 from identity.invitation_intents as intent
          where intent.invitation_id = invitation.id and intent.kind = 'service_relationship');
    when 'relationship.substitution_proposed.v1', 'relationship.professional_reassigned.v1' then
      notice_kind := case new.event_type
        when 'relationship.substitution_proposed.v1' then 'cover_proposed' else 'professional_changed' end;
      notice_category := 'relationship';
      notice_subject_type := 'relationship_professional_assignment';
      notice_subject := (new.payload ->> 'assignment_id')::uuid;
      recipient := (new.payload ->> 'person_id')::uuid;
      organization := (new.payload ->> 'organization_id')::uuid;
    when 'relationship.terminated.v1' then
      notice_kind := 'relationship_ended';
      notice_category := 'relationship';
      notice_subject_type := 'service_relationship';
      notice_subject := (new.payload ->> 'relationship_id')::uuid;
      perform access_control.open_contract_scope('notice_subject', notice_subject);
      select relationship.person_id, relationship.organization_id into recipient, organization
      from relationships.service_relationships as relationship
      where relationship.id = notice_subject;
    when 'payments.subscription_suspended.v1', 'payments.subscription_reactivated.v1',
         'payments.subscription_ended.v1' then
      notice_kind := case new.event_type
        when 'payments.subscription_suspended.v1' then 'plan_paused'
        when 'payments.subscription_reactivated.v1' then 'plan_resumed'
        else 'plan_ended' end;
      notice_category := 'relationship';
      notice_subject_type := 'plan_subscription';
      notice_subject := (new.payload ->> 'subscription_id')::uuid;
      recipient := (new.payload ->> 'person_id')::uuid;
      organization := (new.payload ->> 'organization_id')::uuid;
    when 'planning.assignment_created.v1' then
      notice_kind := 'program_assigned';
      notice_category := 'assignment';
      notice_subject_type := 'program_assignment';
      notice_subject := (new.payload ->> 'assignment_id')::uuid;
      recipient := (new.payload ->> 'person_id')::uuid;
      if new.payload ->> 'relationship_id' is not null then
        perform access_control.open_contract_scope('notice_subject', (new.payload ->> 'relationship_id')::uuid);
        select relationship.organization_id into organization
        from relationships.service_relationships as relationship
        where relationship.id = (new.payload ->> 'relationship_id')::uuid;
      end if;
    when 'execution.correction_proposed.v1' then
      notice_kind := 'correction_proposed';
      notice_category := 'correction';
      notice_subject_type := 'correction_proposal';
      notice_subject := (new.payload ->> 'proposal_id')::uuid;
      perform access_control.open_contract_scope('notice_subject', notice_subject);
      select proposal.person_id, proposal.organization_id into recipient, organization
      from execution.correction_proposals as proposal
      where proposal.id = notice_subject;
    when 'nutrition.goal_version_proposed.v1' then
      notice_kind := 'goal_proposed';
      notice_category := 'nutrition';
      notice_subject_type := 'nutrition_goal_version';
      notice_subject := (new.payload ->> 'goal_version_id')::uuid;
      recipient := (new.payload ->> 'person_id')::uuid;
      organization := (new.payload ->> 'organization_id')::uuid;
    else
      return null;
  end case;

  -- Nobody is told what she did herself, and nobody who does not exist is told anything.
  if recipient is not null
     and recipient is distinct from access_control.person()
     and exists (select 1 from identity.people as person where person.id = recipient) then
    perform access_control.open_contract_scope('notice_recipient', recipient);

    insert into identity.person_notifications (
      person_id, source_event_id, kind, category, subject_type, subject_id, organization_id, occurred_at
    )
    values (
      recipient, new.id, notice_kind, notice_category, notice_subject_type, notice_subject,
      organization, new.occurred_at
    )
    returning id into created;

    -- A missing preference reads as on; a channel off keeps the notice all the same.
    if coalesce((
      select preference.enabled from identity.notification_preferences as preference
      where preference.person_id = recipient
        and preference.category = notice_category
        and preference.channel = 'push'), true) then
      insert into system.notification_deliveries (notification_id, device_id)
      select created, device.id
      from identity.person_push_devices as device
      where device.person_id = recipient and device.retired_at is null;
    end if;
  end if;

  perform set_config('app.contract_scope_purpose', coalesce(saved_purpose, ''), true);
  perform set_config('app.contract_scope_id', coalesce(saved_id, ''), true);
  perform set_config('app.contract_scope_token', coalesce(saved_token, ''), true);
  return null;
end
$function$;

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
  'nutrition.goal_version_proposed.v1'))
execute function identity.project_notice_from_event();

-- ---------------------------------------------------------------------------
-- Reading a notice: whether it awaits her, and the names its sentence needs
-- ---------------------------------------------------------------------------

-- Read from the subject, never stored: decided anywhere, it stops awaiting.
create function identity.notice_decision(p_kind text, p_subject_id uuid)
returns table (awaiting boolean, expires_at timestamptz)
language sql
stable
security definer
set search_path = pg_catalog
as $function$
  select count(*) > 0, max(pending.expiry)
  from (
    select invitation.expires_at as expiry
    from identity.invitations as invitation
    where p_kind = 'client_invitation'
      and invitation.id = p_subject_id
      and invitation.status = 'pending'
      and invitation.expires_at > clock_timestamp()
      and exists (
        select 1 from identity.invitation_intents as intent
        where intent.invitation_id = invitation.id
          and intent.kind = 'service_relationship'
          and intent.status = 'pending')
    union all
    -- Decidable through its last day, as `relationships.decide_substitution` judges it.
    select (cover.ends_on + 1)::timestamptz
    from relationships.relationship_professional_assignments as cover
    join relationships.service_relationships as relationship on relationship.id = cover.relationship_id
    where p_kind = 'cover_proposed'
      and cover.id = p_subject_id
      and cover.kind = 'substitute'
      and cover.status = 'proposed'
      and cover.ends_on >= current_date
      and relationship.status = 'active'
    union all
    select proposal.expires_at
    from execution.correction_proposals as proposal
    where p_kind = 'correction_proposed'
      and proposal.id = p_subject_id
      and proposal.status = 'pending'
      and proposal.expires_at > clock_timestamp()
    union all
    -- A proposed goal has no expiry of its own.
    select null::timestamptz
    from nutrition.goal_versions as goal
    where p_kind = 'goal_proposed'
      and goal.id = p_subject_id
      and goal.status = 'proposed'
  ) as pending
$function$;

-- The organization's, the professional's and the program's names; never anything of hers.
create function identity.notice_names(p_kind text, p_subject_id uuid, p_organization_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog
as $function$
  select jsonb_build_object(
    'organization', (
      select organization.display_name from organizations.organizations as organization
      where organization.id = p_organization_id),
    'professional', case
      when p_kind = 'client_invitation' then (
        select professional.display_name
        from identity.invitations as invitation
        join organizations.organization_memberships as membership on membership.id = invitation.issued_by_membership_id
        join identity.people as professional on professional.id = membership.person_id
        where invitation.id = p_subject_id)
      when p_kind in ('cover_proposed', 'professional_changed') then (
        select professional.display_name
        from relationships.relationship_professional_assignments as assignment
        join organizations.organization_memberships as membership on membership.id = assignment.membership_id
        join identity.people as professional on professional.id = membership.person_id
        where assignment.id = p_subject_id)
      when p_kind = 'correction_proposed' then (
        select professional.display_name
        from execution.correction_proposals as proposal
        join organizations.organization_memberships as membership on membership.id = proposal.proposer_membership_id
        join identity.people as professional on professional.id = membership.person_id
        where proposal.id = p_subject_id)
      when p_kind = 'goal_proposed' then (
        select professional.display_name
        from nutrition.goal_versions as goal
        join identity.people as professional on professional.id = goal.author_person_id
        where goal.id = p_subject_id)
    end,
    'program', case
      when p_kind = 'program_assigned' then (
        select version.title
        from planning.program_assignments as assignment
        join planning.program_versions as version on version.id = assignment.program_version_id
        where assignment.id = p_subject_id)
    end
  )
$function$;

create function identity.notice_document(p_notice_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog
as $function$
  select jsonb_build_object(
    'id', notice.id,
    'kind', notice.kind,
    'category', notice.category,
    'subject', jsonb_build_object('type', notice.subject_type, 'id', notice.subject_id),
    'organization_id', notice.organization_id,
    'occurred_at', notice.occurred_at,
    'read_at', notice.read_at,
    'awaiting', decision.awaiting,
    'expires_at', case when decision.awaiting then decision.expires_at end,
    'names', identity.notice_names(notice.kind, notice.subject_id, notice.organization_id)
  )
  from identity.person_notifications as notice
  cross join lateral identity.notice_decision(notice.kind, notice.subject_id) as decision
  where notice.id = p_notice_id
$function$;

-- ---------------------------------------------------------------------------
-- List my notices (OP-IDN-074)
-- ---------------------------------------------------------------------------

create function identity.list_my_notices(
  p_provider text,
  p_issuer text,
  p_subject text,
  p_filter text,
  p_limit integer,
  p_before_occurred_at timestamptz,
  p_before_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  person uuid;
  page jsonb;
begin
  person := identity.require_space_person(p_provider, p_issuer, p_subject);

  if p_filter is null or p_filter not in ('all', 'awaiting')
     or p_limit is null or p_limit < 1 or p_limit > 100
     or (p_before_occurred_at is null) <> (p_before_id is null) then
    raise exception 'unknown filter or page' using errcode = '22023';
  end if;

  with mine as (
    select notice.id, notice.occurred_at, notice.read_at, decision.awaiting
    from identity.person_notifications as notice
    cross join lateral identity.notice_decision(notice.kind, notice.subject_id) as decision
    where notice.person_id = person
  ),
  chosen as (
    select mine.id, mine.occurred_at
    from mine
    where (p_filter = 'all' or mine.awaiting)
      and (p_before_occurred_at is null
           or (mine.occurred_at, mine.id) < (p_before_occurred_at, p_before_id))
    order by mine.occurred_at desc, mine.id desc
    limit p_limit + 1
  ),
  numbered as (
    select chosen.id, chosen.occurred_at,
           row_number() over (order by chosen.occurred_at desc, chosen.id desc) as position
    from chosen
  )
  select jsonb_build_object(
    'items', coalesce((
      select jsonb_agg(identity.notice_document(numbered.id) order by numbered.position)
      from numbered where numbered.position <= p_limit), '[]'::jsonb),
    'has_more', (select count(*) > p_limit from numbered),
    'awaiting_count', (select count(*) from mine where mine.awaiting),
    'unread_count', (select count(*) from mine where mine.read_at is null)
  ) into page;

  return page;
end
$function$;

-- ---------------------------------------------------------------------------
-- Mark a notice as read (OP-IDN-075)
-- ---------------------------------------------------------------------------

create function identity.mark_my_notice_read(
  p_provider text,
  p_issuer text,
  p_subject text,
  p_notice_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  person uuid;
  document jsonb;
begin
  person := identity.require_space_person(p_provider, p_issuer, p_subject);

  -- The first reading is recorded; any later one changes nothing and answers the same.
  update identity.person_notifications as notice
  set read_at = clock_timestamp()
  where notice.id = p_notice_id
    and notice.person_id = person
    and notice.read_at is null;

  if not exists (
    select 1 from identity.person_notifications as notice
    where notice.id = p_notice_id and notice.person_id = person) then
    raise exception 'notice not found' using errcode = 'P0002';
  end if;

  document := identity.notice_document(p_notice_id);
  return document;
end
$function$;

-- ---------------------------------------------------------------------------
-- Ownership and privileges
-- ---------------------------------------------------------------------------

alter function identity.keep_person_notification() owner to allfit_owner;
alter function identity.skip_pushes_of_a_departed_phone() owner to allfit_owner;
alter function identity.project_notice_from_event() owner to allfit_owner;
alter function identity.notice_decision(text, uuid) owner to allfit_owner;
alter function identity.notice_names(text, uuid, uuid) owner to allfit_owner;
alter function identity.notice_document(uuid) owner to allfit_owner;
alter function identity.list_my_notices(text, text, text, text, integer, timestamptz, uuid) owner to allfit_owner;
alter function identity.mark_my_notice_read(text, text, text, uuid) owner to allfit_owner;

revoke all on function identity.keep_person_notification() from public, allfit_api;
revoke all on function identity.skip_pushes_of_a_departed_phone() from public, allfit_api;
revoke all on function identity.project_notice_from_event() from public, allfit_api;
revoke all on function identity.notice_decision(text, uuid) from public, allfit_api;
revoke all on function identity.notice_names(text, uuid, uuid) from public, allfit_api;
revoke all on function identity.notice_document(uuid) from public, allfit_api;
revoke all on function identity.list_my_notices(text, text, text, text, integer, timestamptz, uuid) from public;
revoke all on function identity.mark_my_notice_read(text, text, text, uuid) from public;

grant execute on function identity.list_my_notices(text, text, text, text, integer, timestamptz, uuid) to allfit_api;
grant execute on function identity.mark_my_notice_read(text, text, text, uuid) to allfit_api;
