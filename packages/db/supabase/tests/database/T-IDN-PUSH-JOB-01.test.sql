-- T-IDN-PUSH-JOB-01 — the push job claims, settles and purges what the projection left
-- (ADR-054 decision 7, scenario 7; data dictionary §4.15.2 and §11.6). TECH-44.
--
-- Only the worker claims. A claimed push is leased, so a second claim does not take it
-- again: one notice reaches one phone once. A push whose phone was retired, or whose phone
-- now belongs to somebody else, is skipped and never handed out. A token Expo reports as
-- unregistered retires its phone, and only while the phone still holds that token. A push
-- that keeps failing gives up after five attempts. Ninety days after a push settled, or a
-- phone retired, the row goes.
--
-- Written before the migration and watched failing.
begin;

select plan(24);

set local session_replication_role = replica;

insert into identity.people (id, given_name, family_name, status)
values ('019f8800-0000-7000-8000-000000000001', 'Ana', 'Push', 'active'),
       ('019f8800-0000-7000-8000-000000000002', 'Bea', 'Push', 'active');

insert into organizations.organizations (id, type_code, display_name, responsible_party)
values ('019f8800-0000-7000-8000-000000000101', 'gym', 'Bodytech Chicó',
  '{"party_kind":"legal_entity","party_name":"Bodytech SAS","purpose":"studio_operations"}');

insert into identity.person_preferences (person_id, locale)
values ('019f8800-0000-7000-8000-000000000001', 'en');

insert into identity.person_push_devices (id, person_id, platform, push_token, retired_at, retired_reason)
values ('a8000000-0000-4000-8000-000000000001', '019f8800-0000-7000-8000-000000000001', 'ios', 'ExponentPushToken[ana-1]', null, null),
       ('a8000000-0000-4000-8000-000000000002', '019f8800-0000-7000-8000-000000000001', 'android', 'ExponentPushToken[ana-2]', null, null),
       ('a8000000-0000-4000-8000-000000000003', '019f8800-0000-7000-8000-000000000002', 'ios', 'ExponentPushToken[bea-3]', null, null);

insert into identity.person_notifications (id, person_id, source_event_id, kind, category, subject_type, subject_id, organization_id, occurred_at)
values ('019f8800-0000-7000-8000-000000000c01', '019f8800-0000-7000-8000-000000000001', gen_random_uuid(), 'client_invitation', 'relationship',
        'invitation', gen_random_uuid(), '019f8800-0000-7000-8000-000000000101', clock_timestamp()),
       ('019f8800-0000-7000-8000-000000000c02', '019f8800-0000-7000-8000-000000000001', gen_random_uuid(), 'password_changed', 'security',
        'password_change', gen_random_uuid(), null, clock_timestamp());

insert into system.notification_deliveries (id, notification_id, device_id)
values ('019f8800-0000-7000-8000-000000000e01', '019f8800-0000-7000-8000-000000000c01', 'a8000000-0000-4000-8000-000000000001'),
       ('019f8800-0000-7000-8000-000000000e02', '019f8800-0000-7000-8000-000000000c01', 'a8000000-0000-4000-8000-000000000002'),
       ('019f8800-0000-7000-8000-000000000e03', '019f8800-0000-7000-8000-000000000c02', 'a8000000-0000-4000-8000-000000000001'),
       -- Ana's notice, queued for a phone that Bea now holds.
       ('019f8800-0000-7000-8000-000000000e04', '019f8800-0000-7000-8000-000000000c02', 'a8000000-0000-4000-8000-000000000003');

set local session_replication_role = origin;

-- The test's own lookup, run as the test's role: the runtime role reads no delivery.
create function pg_temp.status_of(p_delivery uuid) returns text
language sql security definer as $fn$
  select status || coalesce(' ' || last_error_code, '') from system.notification_deliveries where id = p_delivery
$fn$;

-- ———————————————————————————————— only the worker

set local role allfit_api;
select set_config('app.actor_kind', 'person', true);
select throws_ok($$ select * from system.claim_push_deliveries(10) $$,
  '42501', null, 'T-IDN-RLS-46 only the worker claims pushes');
select throws_ok(
  $$ select system.settle_push_delivery('019f8800-0000-7000-8000-000000000e01', 'sent', null, null) $$,
  '42501', null, 'T-IDN-RLS-46 or settles one');
select throws_ok($$ select system.purge_notification_records(10) $$,
  '42501', null, 'T-IDN-RLS-46 or purges');

select set_config('app.actor_kind', 'worker', true);
select throws_ok($$ select * from system.claim_push_deliveries(0) $$,
  '22023', null, 'T-IDN-INT-88 a claim takes between 1 and 500');

-- ———————————————————————————————— claiming

create temporary table claimed as select * from system.claim_push_deliveries(10);

select is(
  (select array_agg(delivery_id::text order by delivery_id) from claimed),
  array['019f8800-0000-7000-8000-000000000e01', '019f8800-0000-7000-8000-000000000e02', '019f8800-0000-7000-8000-000000000e03'],
  'T-IDN-INT-88 the worker claims every push due, and none for a phone that changed hands');
select is(
  (select array[push_token, kind, organization_name, locale] from claimed
   where delivery_id = '019f8800-0000-7000-8000-000000000e01'),
  array['ExponentPushToken[ana-1]', 'client_invitation', 'Bodytech Chicó', 'en'],
  'T-IDN-INT-88 with the token, the kind, the organization''s name and her language');
select is(
  (select count(*)::integer from claimed where kind = 'password_changed' and organization_name is null),
  1, 'T-IDN-INT-88 and nothing else: no words and none of her data');
select is(pg_temp.status_of('019f8800-0000-7000-8000-000000000e04'), 'skipped not_device_owner',
  'T-IDN-INT-89 a push for a phone somebody else now holds is skipped, never handed out');

select is((select count(*)::integer from system.claim_push_deliveries(10)), 0,
  'T-IDN-INT-90 a second claim takes nothing already claimed: one push per notice and phone');

-- ———————————————————————————————— settling

select system.settle_push_delivery('019f8800-0000-7000-8000-000000000e01', 'sent', null, 'ExponentPushToken[ana-1]');
select is(pg_temp.status_of('019f8800-0000-7000-8000-000000000e01'), 'sent',
  'T-IDN-INT-91 a push Expo accepted is sent');
select system.settle_push_delivery('019f8800-0000-7000-8000-000000000e01', 'failed', 'MessageTooBig', 'ExponentPushToken[ana-1]');
select is(pg_temp.status_of('019f8800-0000-7000-8000-000000000e01'), 'sent',
  'T-IDN-INT-91 and settling it again changes nothing');

-- The phone registers a new token before Expo's answer about the old one arrives.
reset role;
update identity.person_push_devices set push_token = 'ExponentPushToken[ana-2b]'
where id = 'a8000000-0000-4000-8000-000000000002';
set local role allfit_api;
select set_config('app.actor_kind', 'worker', true);
select system.settle_push_delivery('019f8800-0000-7000-8000-000000000e02', 'unregistered', 'DeviceNotRegistered', 'ExponentPushToken[ana-2]');
reset role;
select is(
  (select retired_at from identity.person_push_devices where id = 'a8000000-0000-4000-8000-000000000002'),
  null, 'T-IDN-INT-92 an old token reported unregistered does not retire a phone that holds a new one');
select is(pg_temp.status_of('019f8800-0000-7000-8000-000000000e02'), 'failed DeviceNotRegistered',
  'T-IDN-INT-92 though that push failed');

set local role allfit_api;
select set_config('app.actor_kind', 'worker', true);
select system.settle_push_delivery('019f8800-0000-7000-8000-000000000e03', 'unregistered', 'DeviceNotRegistered', 'ExponentPushToken[ana-1]');
reset role;
select is(
  (select retired_reason from identity.person_push_devices where id = 'a8000000-0000-4000-8000-000000000001'),
  'unregistered', 'T-IDN-INT-92 a token Expo reports unregistered retires its phone');

set local role allfit_api;
select set_config('app.actor_kind', 'worker', true);
select throws_ok(
  $$ select system.settle_push_delivery('019f8800-0000-7000-8000-000000000e03', 'lost', null, null) $$,
  '22023', null, 'T-IDN-INT-93 an outcome outside the list is refused');

-- ———————————————————————————————— retrying, then giving up

reset role;
insert into system.notification_deliveries (id, notification_id, device_id)
values ('019f8800-0000-7000-8000-000000000e05', '019f8800-0000-7000-8000-000000000c02', 'a8000000-0000-4000-8000-000000000002');
set local role allfit_api;
select set_config('app.actor_kind', 'worker', true);
select is((select count(*)::integer from system.claim_push_deliveries(10)), 1, 'T-IDN-INT-94 a new push is claimed');
select system.settle_push_delivery('019f8800-0000-7000-8000-000000000e05', 'retry', 'provider_unavailable', 'ExponentPushToken[ana-2b]');
select is(pg_temp.status_of('019f8800-0000-7000-8000-000000000e05'), 'pending provider_unavailable',
  'T-IDN-INT-94 Expo down: it waits, pending');
select is((select count(*)::integer from system.claim_push_deliveries(10)), 0,
  'T-IDN-INT-94 and is not claimed again before its wait ends');

reset role;
update system.notification_deliveries set next_attempt_at = clock_timestamp() - interval '1 second', attempt_count = 5
where id = '019f8800-0000-7000-8000-000000000e05';
set local role allfit_api;
select set_config('app.actor_kind', 'worker', true);
select is((select count(*)::integer from system.claim_push_deliveries(10)), 0,
  'T-IDN-INT-94 after five attempts it is not handed out again');
select is(pg_temp.status_of('019f8800-0000-7000-8000-000000000e05'), 'failed too_many_attempts',
  'T-IDN-INT-94 it fails, saying why');

-- ———————————————————————————————— ninety days later

reset role;
set local session_replication_role = replica;
update system.notification_deliveries set created_at = clock_timestamp() - interval '91 days'
where id in ('019f8800-0000-7000-8000-000000000e01', '019f8800-0000-7000-8000-000000000e04');
insert into system.notification_deliveries (id, notification_id, device_id, created_at)
values ('019f8800-0000-7000-8000-000000000e06', '019f8800-0000-7000-8000-000000000c01', 'a8000000-0000-4000-8000-000000000003',
        clock_timestamp() - interval '91 days');
update identity.person_push_devices set retired_at = clock_timestamp() - interval '91 days', retired_reason = 'sign_out'
where id = 'a8000000-0000-4000-8000-000000000003';
set local session_replication_role = origin;

set local role allfit_api;
select set_config('app.actor_kind', 'worker', true);
select is(system.purge_notification_records(100), 3,
  'T-IDN-INT-95 settled pushes and retired phones older than ninety days go');
reset role;
select is(
  (select array_agg(id::text order by id) from system.notification_deliveries),
  array['019f8800-0000-7000-8000-000000000e02', '019f8800-0000-7000-8000-000000000e03', '019f8800-0000-7000-8000-000000000e05'],
  'T-IDN-INT-95 a recent push stays, settled or not');
select is(
  (select array_agg(id::text order by id) from identity.person_push_devices),
  array['a8000000-0000-4000-8000-000000000001', 'a8000000-0000-4000-8000-000000000002'],
  'T-IDN-INT-95 and a phone retired recently stays, with what it was sent');
select is((select count(*)::integer from identity.person_notifications), 2,
  'T-IDN-INT-95 the notices themselves are hers and stay');

select * from finish();
rollback;
