-- T-IDN-PUSH-DEVICES-01 — a person registers and retires the phones that may receive her
-- push (`OP-IDN-072`, `OP-IDN-073`, ADR-054). TECH-44.
--
-- The device id is the app's installation id. Registering refreshes the token and when it
-- was last seen; a token held by another device moves to this one, and an installation
-- that another person used becomes hers, so one token reaches one person. Retiring marks
-- the phone retired, and retiring one that is not hers answers the same and changes
-- nothing. A retry is answered once, and only she reaches her rows (scenario 9).
--
-- Written before the migration and watched failing; the neighbour's denials were watched
-- succeeding with the policies replaced by `true`.
begin;

select plan(32);

select has_table('identity', 'person_push_devices', 'T-IDN-PHY-32 phones for push have their own table');
select ok(
  (select relrowsecurity and relforcerowsecurity from pg_catalog.pg_class
   where oid = 'identity.person_push_devices'::regclass),
  'T-IDN-PHY-32 row security is on and forced');

insert into identity.people (id, given_name, family_name, contact_email, contact_email_verified_at, status)
values ('019f8400-0000-7000-8000-000000000001', 'Ana', 'Telefono', 'ana.tel@example.test', clock_timestamp(), 'active'),
       ('019f8400-0000-7000-8000-000000000002', 'Bea', 'Telefono', 'bea.tel@example.test', clock_timestamp(), 'active');

insert into identity.access_accounts (id, provider, issuer, subject, person_id, linked_at)
values ('019f8400-0000-7000-8000-000000000101', 'workos', 'https://issuer.test', 'user_ana_tel',
        '019f8400-0000-7000-8000-000000000001', clock_timestamp()),
       ('019f8400-0000-7000-8000-000000000102', 'workos', 'https://issuer.test', 'user_bea_tel',
        '019f8400-0000-7000-8000-000000000002', clock_timestamp());

create function pg_temp.register(
  p_subject text, p_device uuid, p_token text, p_platform text,
  p_key uuid default gen_random_uuid(), p_hash bytea default extensions.gen_random_bytes(32)
) returns table (device jsonb, replayed boolean)
language sql as $fn$
  select * from identity.register_my_push_device(
    'workos', 'https://issuer.test', p_subject, p_device, p_token, p_platform,
    p_key, extensions.uuid_generate_v7(), p_hash)
$fn$;

create function pg_temp.retire(
  p_subject text, p_device uuid,
  p_key uuid default gen_random_uuid(), p_hash bytea default extensions.gen_random_bytes(32)
) returns boolean
language sql as $fn$
  select replayed from identity.retire_my_push_device(
    'workos', 'https://issuer.test', p_subject, p_device, p_key, extensions.uuid_generate_v7(), p_hash)
$fn$;

create function pg_temp.row_of(p_device uuid) returns text
language sql as $fn$
  select person_id::text || ' ' || push_token || ' ' || coalesce(retired_reason, 'active')
  from identity.person_push_devices where id = p_device
$fn$;

set local role allfit_api;

-- ———————————————————————————————— registering (OP-IDN-072)

create temporary table registered as
select * from pg_temp.register('user_ana_tel', 'a4000000-0000-4000-8000-000000000001',
  'ExponentPushToken[ana-1]', 'ios',
  'a8444444-4444-4444-8444-444444444401', decode(repeat('d1', 32), 'hex'));

select is((select device - 'registered_at' - 'last_seen_at' from registered),
  '{"id": "a4000000-0000-4000-8000-000000000001", "platform": "ios"}'::jsonb,
  'T-IDN-INT-57 her phone is registered, and the answer never echoes the token');
select is((select replayed from registered), false, 'T-IDN-INT-57 as a command that ran');
select is(
  identity.read_my_notification_preferences('workos', 'https://issuer.test', 'user_ana_tel')
    -> 'preferences' -> 1 ->> 'available',
  'true', 'T-IDN-INT-57 and push becomes available to her');

select throws_ok($$ select * from pg_temp.register('user_ana_tel', gen_random_uuid(), 'ExponentPushToken[x]', 'windows') $$,
  '22023', null, 'T-IDN-INT-58 an unknown platform is refused');
select throws_ok($$ select * from pg_temp.register('user_ana_tel', gen_random_uuid(), '   ', 'android') $$,
  '22023', null, 'T-IDN-INT-58 so is an empty token');
select throws_ok($$ select * from pg_temp.register('user_ana_tel', gen_random_uuid(), null, 'android') $$,
  '22023', null, 'T-IDN-INT-58 and no token at all');
select throws_ok($$ select * from pg_temp.register('user_ana_tel', null, 'ExponentPushToken[x]', 'android') $$,
  '22023', null, 'T-IDN-INT-58 and no device');

create temporary table retried as
select * from pg_temp.register('user_ana_tel', 'a4000000-0000-4000-8000-000000000001',
  'ExponentPushToken[ana-1]', 'ios',
  'a8444444-4444-4444-8444-444444444401', decode(repeat('d1', 32), 'hex'));
select is((select replayed from retried), true, 'T-IDN-IDEM-25 the same key and request answer as a replay');
select is((select device from retried), (select device from registered), 'T-IDN-IDEM-25 with the same device');
select throws_ok(
  $$ select * from pg_temp.register('user_ana_tel', 'a4000000-0000-4000-8000-000000000001',
       'ExponentPushToken[ana-9]', 'ios',
       'a8444444-4444-4444-8444-444444444401', decode(repeat('d2', 32), 'hex')) $$,
  '23505', null, 'T-IDN-IDEM-25 the same key for another request is refused');

select pg_temp.register('user_ana_tel', 'a4000000-0000-4000-8000-000000000001', 'ExponentPushToken[ana-2]', 'ios');

reset role;
select is(pg_temp.row_of('a4000000-0000-4000-8000-000000000001'),
  '019f8400-0000-7000-8000-000000000001 ExponentPushToken[ana-2] active',
  'T-IDN-INT-59 registering again refreshes the token of the same phone');
select is((select count(*)::integer from identity.person_push_devices), 1,
  'T-IDN-INT-59 in the one row the installation has');

-- ———————————————————————————————— a token and an installation move

set local role allfit_api;
select pg_temp.register('user_bea_tel', 'a4000000-0000-4000-8000-000000000002', 'ExponentPushToken[ana-2]', 'android');

reset role;
select is(pg_temp.row_of('a4000000-0000-4000-8000-000000000001'),
  '019f8400-0000-7000-8000-000000000001 ExponentPushToken[ana-2] moved',
  'T-IDN-INT-60 a token another phone held is retired there as moved');
select is(pg_temp.row_of('a4000000-0000-4000-8000-000000000002'),
  '019f8400-0000-7000-8000-000000000002 ExponentPushToken[ana-2] active',
  'T-IDN-INT-60 and reaches only the phone that registered it last');

set local role allfit_api;
select pg_temp.register('user_bea_tel', 'a4000000-0000-4000-8000-000000000001', 'ExponentPushToken[bea-3]', 'ios');

reset role;
select is(pg_temp.row_of('a4000000-0000-4000-8000-000000000001'),
  '019f8400-0000-7000-8000-000000000002 ExponentPushToken[bea-3] active',
  'T-IDN-INT-61 an installation somebody else used becomes the phone of who registers it now');

-- ———————————————————————————————— retiring (OP-IDN-073)

set local role allfit_api;
select is(pg_temp.retire('user_ana_tel', 'a4000000-0000-4000-8000-000000000001'), false,
  'T-IDN-INT-62 retiring a phone that is no longer hers answers as if it were retired');
reset role;
select is(pg_temp.row_of('a4000000-0000-4000-8000-000000000001'),
  '019f8400-0000-7000-8000-000000000002 ExponentPushToken[bea-3] active',
  'T-IDN-INT-62 and leaves the other person''s phone as it was');

set local role allfit_api;
select is(pg_temp.retire('user_bea_tel', 'a4000000-0000-4000-8000-000000000001',
  'a8444444-4444-4444-8444-444444444402', decode(repeat('d3', 32), 'hex')), false,
  'T-IDN-INT-62 she retires her phone on sign-out');
reset role;
select is(pg_temp.row_of('a4000000-0000-4000-8000-000000000001'),
  '019f8400-0000-7000-8000-000000000002 ExponentPushToken[bea-3] sign_out',
  'T-IDN-INT-62 and it is kept retired, with why');
create temporary table first_retirement as
select retired_at from identity.person_push_devices where id = 'a4000000-0000-4000-8000-000000000001';

set local role allfit_api;
select is(pg_temp.retire('user_bea_tel', 'a4000000-0000-4000-8000-000000000001',
  'a8444444-4444-4444-8444-444444444402', decode(repeat('d3', 32), 'hex')), true,
  'T-IDN-IDEM-26 the same retirement again is a replay');
select is(pg_temp.retire('user_bea_tel', 'a4000000-0000-4000-8000-000000000001'), false,
  'T-IDN-IDEM-26 and retiring twice under a new key answers the same');
reset role;
select is((select retired_at from identity.person_push_devices where id = 'a4000000-0000-4000-8000-000000000001'),
  (select retired_at from first_retirement), 'T-IDN-IDEM-26 without moving when it was retired');

-- ———————————————————————————————— straight at the table

set local role allfit_api;
select throws_ok($$ select count(*) from identity.person_push_devices $$,
  '42501', null, 'T-IDN-RLS-39 the runtime role cannot read the table');
select throws_ok($$ delete from identity.person_push_devices $$,
  '42501', null, 'T-IDN-RLS-39 nor remove a row');

set local role allfit_owner;
select set_config('app.actor_kind', 'person', true);
select set_config('app.actor_person_id', '019f8400-0000-7000-8000-000000000001', true);

select is((select count(*)::integer from identity.person_push_devices), 0,
  'T-IDN-RLS-40 Ana sees none of Bea''s phones');
select throws_ok(
  $$ insert into identity.person_push_devices (id, person_id, platform, push_token)
     values (gen_random_uuid(), '019f8400-0000-7000-8000-000000000002', 'ios', 'ExponentPushToken[forged]') $$,
  '42501', null, 'T-IDN-RLS-40 nor registers one in Bea''s name');
update identity.person_push_devices set retired_at = null, retired_reason = null;

select set_config('app.actor_person_id', '019f8400-0000-7000-8000-000000000002', true);
select is((select count(*)::integer from identity.person_push_devices where retired_at is not null), 1,
  'T-IDN-RLS-40 Bea sees her own, and Ana''s update reached none of them');

reset role;
select throws_ok(
  $$ insert into identity.person_push_devices (id, person_id, platform, push_token)
     values (gen_random_uuid(), '019f8400-0000-7000-8000-000000000001', 'ios', 'ExponentPushToken[ana-2]') $$,
  '23505', null, 'T-IDN-PHY-33 one active token reaches one phone, whoever writes');
select throws_ok(
  $$ insert into identity.person_push_devices (id, person_id, platform, push_token, retired_at)
     values (gen_random_uuid(), '019f8400-0000-7000-8000-000000000001', 'ios', 'ExponentPushToken[z]', clock_timestamp()) $$,
  '23514', null, 'T-IDN-PHY-33 a phone is retired with why, or not at all');
select throws_ok(
  $$ insert into identity.person_push_devices (id, person_id, platform, push_token)
     values (gen_random_uuid(), '019f8400-0000-7000-8000-000000000001', 'web', 'ExponentPushToken[z]') $$,
  '23514', null, 'T-IDN-PHY-33 and is an iOS or Android phone');

select * from finish();
rollback;
