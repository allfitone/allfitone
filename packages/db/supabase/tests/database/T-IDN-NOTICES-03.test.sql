-- T-IDN-NOTICES-03 — security notices reach her even when she acted, and a resent
-- invitation keeps one notice (ADR-054 decisions 4 and 5, scenario 2). TECH-44.
--
-- A password changed and an email change confirmed are security notices: whoever changed
-- them may not have been her, so the actor rule never skips them, and push carries them
-- whatever else she chose. Requesting an email change is not yet a change and tells her
-- nothing. One subject that awaits a decision has one notice: an invitation sent again
-- refreshes it (newer, unread again) instead of adding a second, while a reissued
-- invitation is another subject with its own.
--
-- Written before the migration and watched failing.
begin;

select plan(22);

set local session_replication_role = replica;

insert into identity.people (id, given_name, family_name, contact_email, contact_email_verified_at, status)
values ('019f8700-0000-7000-8000-000000000001', 'Ana', 'Segura', 'ana.segura@example.test', clock_timestamp(), 'active'),
       ('019f8700-0000-7000-8000-000000000003', 'Camilo', 'Coach', null, null, 'active');
insert into identity.access_accounts (id, provider, issuer, subject, person_id, linked_at)
values ('019f8700-0000-7000-8000-000000000301', 'workos', 'https://issuer.test', 'user_ana_segura',
        '019f8700-0000-7000-8000-000000000001', clock_timestamp());

insert into organizations.organizations (id, type_code, display_name, responsible_party)
values ('019f8700-0000-7000-8000-000000000101', 'gym', 'Gym Seguro',
  '{"party_kind":"legal_entity","party_name":"Gym Seguro SAS","purpose":"studio_operations"}');
insert into organizations.organization_memberships (id, organization_id, person_id, status)
values ('019f8700-0000-7000-8000-000000000203', '019f8700-0000-7000-8000-000000000101', '019f8700-0000-7000-8000-000000000003', 'active');

insert into identity.password_changes (id, person_id, access_account_id, outcome, keep_session_id)
values ('019f8700-0000-7000-8000-000000000d01', '019f8700-0000-7000-8000-000000000001',
        '019f8700-0000-7000-8000-000000000301', 'changed', 'session_kept');

insert into identity.identity_action_requests (
  id, person_id, access_account_id, action_kind, initiated_by_kind, initiated_by_person_id,
  delivery_channel, contact_fingerprint, contact_hint, expires_at, proposed_email
) values ('019f8700-0000-7000-8000-000000000e01', '019f8700-0000-7000-8000-000000000001',
  '019f8700-0000-7000-8000-000000000301', 'email_change', 'person', '019f8700-0000-7000-8000-000000000001',
  'email', extensions.digest('nueva@example.test', 'sha256'), 'n***@example.test',
  clock_timestamp() + interval '1 hour', 'nueva@example.test');

insert into identity.invitations (
  id, organization_id, issued_by_membership_id, channel, contact,
  token_hash, token_key_version, proposal_hash, responsible_party, status, expires_at
) values
  ('019f8700-0000-7000-8000-000000000401', '019f8700-0000-7000-8000-000000000101',
   '019f8700-0000-7000-8000-000000000203', 'email', 'ana.segura@example.test',
   extensions.digest('s-token-1', 'sha256'), 1, extensions.digest('s-proposal-1', 'sha256'),
   '{"party_kind":"legal_entity","party_name":"Gym Seguro SAS","purpose":"studio_operations"}',
   'pending', clock_timestamp() + interval '7 days'),
  ('019f8700-0000-7000-8000-000000000402', '019f8700-0000-7000-8000-000000000101',
   '019f8700-0000-7000-8000-000000000203', 'email', 'ana.segura@example.test',
   extensions.digest('s-token-2', 'sha256'), 1, extensions.digest('s-proposal-2', 'sha256'),
   '{"party_kind":"legal_entity","party_name":"Gym Seguro SAS","purpose":"studio_operations"}',
   'pending', clock_timestamp() + interval '7 days'),
  ('019f8700-0000-7000-8000-000000000403', '019f8700-0000-7000-8000-000000000101',
   '019f8700-0000-7000-8000-000000000203', 'email', 'nadie.todavia@example.test',
   extensions.digest('s-token-3', 'sha256'), 1, extensions.digest('s-proposal-3', 'sha256'),
   '{"party_kind":"legal_entity","party_name":"Gym Seguro SAS","purpose":"studio_operations"}',
   'pending', clock_timestamp() + interval '7 days');
insert into identity.invitation_intents (id, invitation_id, kind, status, proposed_role_code)
values ('019f8700-0000-7000-8000-000000000501', '019f8700-0000-7000-8000-000000000401', 'service_relationship', 'pending', null),
       ('019f8700-0000-7000-8000-000000000502', '019f8700-0000-7000-8000-000000000402', 'service_relationship', 'pending', null),
       ('019f8700-0000-7000-8000-000000000503', '019f8700-0000-7000-8000-000000000403', 'service_relationship', 'pending', null);

-- Push is off for her relationship notices, and she has one phone.
insert into identity.notification_preferences (person_id, category, channel, enabled)
values ('019f8700-0000-7000-8000-000000000001', 'relationship', 'push', false);
insert into identity.person_push_devices (id, person_id, platform, push_token)
values ('a7000000-0000-4000-8000-000000000001', '019f8700-0000-7000-8000-000000000001', 'ios', 'ExponentPushToken[segura]');

set local session_replication_role = origin;

create function pg_temp.raise(p_type text, p_aggregate uuid, p_payload jsonb) returns uuid
language sql as $fn$
  select system.enqueue_outbox_event(split_part(p_type, '.', 1), p_aggregate, p_type, p_payload)
$fn$;

create temporary table raised (label text primary key, event_id uuid);

-- ———————————————————————————————— security, when she was the one acting

select set_config('app.actor_kind', 'person', true);
select set_config('app.actor_person_id', '019f8700-0000-7000-8000-000000000001', true);

insert into raised values
  ('password', pg_temp.raise('identity.password_changed.v1', '019f8700-0000-7000-8000-000000000d01',
     '{"change_id": "019f8700-0000-7000-8000-000000000d01"}')),
  ('requested', pg_temp.raise('identity.contact_changed.v1', '019f8700-0000-7000-8000-000000000e01',
     '{"request_id": "019f8700-0000-7000-8000-000000000e01"}')),
  ('confirmed', pg_temp.raise('identity.contact_verified.v1', '019f8700-0000-7000-8000-000000000e01',
     '{"request_id": "019f8700-0000-7000-8000-000000000e01"}'));

create function pg_temp.of(p_label text) returns text[]
language sql as $fn$
  select coalesce(array_agg(notice.person_id::text || ' ' || notice.kind || ' ' || notice.category || ' '
           || notice.subject_type || ' ' || notice.subject_id::text || ' ' || coalesce(notice.organization_id::text, '-')),
         '{}')
  from identity.person_notifications as notice
  where notice.source_event_id = (select event_id from raised where label = p_label)
$fn$;

select is(pg_temp.of('password'),
  array['019f8700-0000-7000-8000-000000000001 password_changed security password_change 019f8700-0000-7000-8000-000000000d01 -'],
  'T-IDN-INT-83 the password she changed herself is a security notice for her');
select is(pg_temp.of('confirmed'),
  array['019f8700-0000-7000-8000-000000000001 email_changed security identity_action_request 019f8700-0000-7000-8000-000000000e01 -'],
  'T-IDN-INT-83 so is the email change she confirmed');
select is(pg_temp.of('requested'), '{}'::text[],
  'T-IDN-INT-83 asking for an email change is not a change yet, and tells her nothing');
select is(
  (select count(*)::integer from system.notification_deliveries as delivery
   join identity.person_notifications as notice on notice.id = delivery.notification_id
   where notice.category = 'security' and delivery.device_id = 'a7000000-0000-4000-8000-000000000001'),
  2, 'T-IDN-INT-84 push carries both to her phone');

-- An account still in onboarding names no person: a change is still hers.
select set_config('app.actor_kind', 'account', true);
select set_config('app.actor_person_id', '', true);
insert into raised values ('unknown-change', pg_temp.raise('identity.password_changed.v1', '019f8700-0000-7000-8000-000000000d09',
  '{"change_id": "019f8700-0000-7000-8000-000000000d09"}'));
select is(pg_temp.of('unknown-change'), '{}'::text[],
  'T-IDN-INT-84 a change that names no person''s record is nobody''s notice');

-- ———————————————————————————————— an invitation sent again

select set_config('app.actor_kind', 'person', true);
select set_config('app.actor_person_id', '019f8700-0000-7000-8000-000000000003', true);

insert into raised values ('invited', pg_temp.raise('relationship.client_invited.v1', '019f8700-0000-7000-8000-000000000401',
  '{"invitation_id": "019f8700-0000-7000-8000-000000000401"}'));

create temporary table first_notice as
select id, occurred_at from identity.person_notifications
where subject_id = '019f8700-0000-7000-8000-000000000401';

update identity.person_notifications set read_at = clock_timestamp()
where subject_id = '019f8700-0000-7000-8000-000000000401';

insert into raised values ('resent', pg_temp.raise('relationship.client_invited.v1', '019f8700-0000-7000-8000-000000000401',
  '{"invitation_id": "019f8700-0000-7000-8000-000000000401"}'));

select is(
  (select count(*)::integer from identity.person_notifications
   where subject_id = '019f8700-0000-7000-8000-000000000401'),
  1, 'T-IDN-INT-85 the invitation sent again is still one notice');
select is(
  (select id from identity.person_notifications where subject_id = '019f8700-0000-7000-8000-000000000401'),
  (select id from first_notice), 'T-IDN-INT-85 the same notice');
select is(
  (select source_event_id from identity.person_notifications where subject_id = '019f8700-0000-7000-8000-000000000401'),
  (select event_id from raised where label = 'resent'), 'T-IDN-INT-85 now born of the event that sent it again');
select ok(
  (select occurred_at > (select occurred_at from first_notice) from identity.person_notifications
   where subject_id = '019f8700-0000-7000-8000-000000000401'),
  'T-IDN-INT-85 newer, so it rises to the top of her inbox');
select is(
  (select read_at from identity.person_notifications where subject_id = '019f8700-0000-7000-8000-000000000401'),
  null, 'T-IDN-INT-85 and unread again');

insert into raised values ('reissued', pg_temp.raise('relationship.client_invited.v1', '019f8700-0000-7000-8000-000000000402',
  '{"invitation_id": "019f8700-0000-7000-8000-000000000402"}'));
select is(
  (select count(*)::integer from identity.person_notifications where kind = 'client_invitation'),
  2, 'T-IDN-INT-86 a reissued invitation is another subject, with its own notice');
select is(
  (select count(*)::integer from system.notification_deliveries as delivery
   join identity.person_notifications as notice on notice.id = delivery.notification_id
   where notice.kind = 'client_invitation'),
  0, 'T-IDN-INT-86 and push off for her relationship notices sent neither to her phone');

-- ———————————————————————————————— nobody else rewrites a notice

set local role allfit_owner;
select set_config('app.actor_person_id', '019f8700-0000-7000-8000-000000000001', true);
select throws_ok(
  $$ update identity.person_notifications set occurred_at = clock_timestamp(), read_at = null
     where subject_id = '019f8700-0000-7000-8000-000000000401' $$,
  '55000', null, 'T-IDN-PHY-39 she cannot refresh her own notice: only an event does');
select throws_ok(
  $$ update identity.person_notifications set source_event_id = gen_random_uuid()
     where kind = 'password_changed' $$,
  '55000', null, 'T-IDN-PHY-39 nor point it at another event');
reset role;

select throws_ok(
  $$ insert into identity.person_notifications (person_id, source_event_id, kind, category, subject_type, subject_id, occurred_at)
     values ('019f8700-0000-7000-8000-000000000001', gen_random_uuid(), 'client_invitation', 'relationship',
             'invitation', '019f8700-0000-7000-8000-000000000401', clock_timestamp()) $$,
  '23505', null, 'T-IDN-PHY-40 one subject that awaits her decision has one notice, whoever writes');
select lives_ok(
  $$ insert into identity.person_notifications (person_id, source_event_id, kind, category, subject_type, subject_id, occurred_at)
     values ('019f8700-0000-7000-8000-000000000001', gen_random_uuid(), 'plan_paused', 'relationship',
             'plan_subscription', '019f8700-0000-7000-8000-000000000a01', clock_timestamp()),
            ('019f8700-0000-7000-8000-000000000001', gen_random_uuid(), 'plan_paused', 'relationship',
             'plan_subscription', '019f8700-0000-7000-8000-000000000a01', clock_timestamp()) $$,
  'T-IDN-PHY-40 while a subject that awaits nothing may be told twice');

-- ———————————————————————————————— and the email gate agrees

select set_config('app.actor_kind', 'worker', true);
select set_config('app.actor_person_id', '', true);
select is(identity.email_allowed_for_event((select event_id from raised where label = 'password')), true,
  'T-IDN-INT-87 the email of a security notice always goes');
select is(identity.email_allowed_for_event((select event_id from raised where label = 'resent')), true,
  'T-IDN-INT-87 an invitation by email goes while email is on for her relationship notices');
insert into raised values ('stranger', pg_temp.raise('relationship.client_invited.v1', '019f8700-0000-7000-8000-000000000403',
  '{"invitation_id": "019f8700-0000-7000-8000-000000000403"}'));
select is(identity.email_allowed_for_event((select event_id from raised where label = 'stranger')), true,
  'T-IDN-INT-87 an invitation to an address no person holds yet goes as it always did');
insert into identity.notification_preferences (person_id, category, channel, enabled)
values ('019f8700-0000-7000-8000-000000000001', 'relationship', 'email', false);
select is(identity.email_allowed_for_event((select event_id from raised where label = 'resent')), false,
  'T-IDN-INT-87 and stays in her inbox, not her mail, once she turns email off for them');
select is(identity.email_allowed_for_event(gen_random_uuid()), true,
  'T-IDN-INT-87 an event outside the map is not this gate''s to stop');

select set_config('app.actor_kind', 'person', true);
select throws_ok(
  format($$ select identity.email_allowed_for_event(%L) $$, (select event_id from raised where label = 'password')),
  '42501', null, 'T-IDN-RLS-45 only the worker asks whether an email may go');

select * from finish();
rollback;
