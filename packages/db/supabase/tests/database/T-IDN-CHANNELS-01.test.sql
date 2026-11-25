-- T-IDN-CHANNELS-01 — a person chooses how each kind of notice reaches her (`OP-IDN-023`,
-- `OP-IDN-024`, `HU-SP-078`, ADR-054). TECH-44.
--
-- Six categories by two channels, email and push. A missing row reads as enabled, so
-- nothing sent today stops silently. Security is locked on. Email is available only with a
-- verified email and push only with a registered phone, and turning on an unavailable
-- channel is refused (scenario 6), as is turning security off (scenario 5). The set is
-- replaced whole, a retry is answered once, and only she reaches her rows (scenario 9).
--
-- Written before the migration and watched failing; the neighbour's denials were watched
-- succeeding with the policies replaced by `true`.
begin;

select plan(30);

select has_table('identity', 'notification_preferences', 'T-IDN-PHY-30 channels per category have their own table');
select ok(
  (select relrowsecurity and relforcerowsecurity from pg_catalog.pg_class
   where oid = 'identity.notification_preferences'::regclass),
  'T-IDN-PHY-30 row security is on and forced');

insert into identity.people (id, given_name, family_name, contact_email, contact_email_verified_at, status)
values ('019f8300-0000-7000-8000-000000000001', 'Con', 'Correo', 'correo@example.test', clock_timestamp(), 'active'),
       ('019f8300-0000-7000-8000-000000000002', 'Sin', 'Verificar', 'sinverificar@example.test', null, 'active');

insert into identity.access_accounts (id, provider, issuer, subject, person_id, linked_at)
values ('019f8300-0000-7000-8000-000000000101', 'workos', 'https://issuer.test', 'user_correo',
        '019f8300-0000-7000-8000-000000000001', clock_timestamp()),
       ('019f8300-0000-7000-8000-000000000102', 'workos', 'https://issuer.test', 'user_sinverificar',
        '019f8300-0000-7000-8000-000000000002', clock_timestamp());

-- The whole set, every pair enabled except those named `category:channel`.
create function pg_temp.set_with_off(variadic p_off text[] default array[]::text[]) returns jsonb
language sql as $fn$
  select jsonb_agg(jsonb_build_object(
           'category', category, 'channel', channel,
           'enabled', not (category || ':' || channel = any (p_off))) order by c.ord, h.ord)
  from unnest(array['relationship', 'assignment', 'consent', 'correction', 'nutrition', 'security'])
         with ordinality as c (category, ord)
  cross join unnest(array['email', 'push']) with ordinality as h (channel, ord)
$fn$;

create function pg_temp.put(
  p_subject text, p_set jsonb,
  p_key uuid default gen_random_uuid(), p_hash bytea default extensions.gen_random_bytes(32)
) returns table (preferences jsonb, replayed boolean)
language sql as $fn$
  select * from identity.put_my_notification_preferences(
    'workos', 'https://issuer.test', p_subject, p_set, p_key, extensions.uuid_generate_v7(), p_hash)
$fn$;

create function pg_temp.entry(p_document jsonb, p_category text, p_channel text) returns jsonb
language sql as $fn$
  select item from jsonb_array_elements(p_document -> 'preferences') as item
  where item ->> 'category' = p_category and item ->> 'channel' = p_channel
$fn$;

set local role allfit_api;

-- ———————————————————————————————— the default reading (OP-IDN-023)

create temporary table fresh as
select identity.read_my_notification_preferences('workos', 'https://issuer.test', 'user_correo') as document;

select is(jsonb_array_length((select document -> 'preferences' from fresh)), 12,
  'T-IDN-INT-52 six categories by two channels, and nothing else');
select is(
  (select count(*)::integer from jsonb_array_elements((select document -> 'preferences' from fresh)) as item
   where (item ->> 'enabled')::boolean),
  12, 'T-IDN-INT-52 a missing row reads as enabled, so nothing sent today stops silently');
select is(pg_temp.entry((select document from fresh), 'security', 'email'),
  '{"category": "security", "channel": "email", "enabled": true, "locked": true, "available": true}'::jsonb,
  'T-IDN-INT-52 security is locked on');
select is(pg_temp.entry((select document from fresh), 'relationship', 'push') ->> 'available', 'false',
  'T-IDN-INT-52 push is unavailable without a registered phone');
select is(pg_temp.entry((select document from fresh), 'relationship', 'email') ->> 'locked', 'false',
  'T-IDN-INT-52 and any other category is hers to turn off');
select is(
  pg_temp.entry(identity.read_my_notification_preferences('workos', 'https://issuer.test', 'user_sinverificar'),
    'relationship', 'email') ->> 'available',
  'false', 'T-IDN-INT-52 email is unavailable without a verified email');

-- ———————————————————————————————— replacing the set (OP-IDN-024)

create temporary table first_put as
select * from pg_temp.put('user_correo', pg_temp.set_with_off('nutrition:email', 'assignment:push'),
  'a8333333-3333-4333-8333-333333333301', decode(repeat('c1', 32), 'hex'));

select is(pg_temp.entry((select preferences from first_put), 'nutrition', 'email') ->> 'enabled', 'false',
  'T-IDN-INT-53 she turns a channel off for a category');
select is(pg_temp.entry((select preferences from first_put), 'assignment', 'push') ->> 'enabled', 'false',
  'T-IDN-INT-53 push too, while it is unavailable: turning off needs nothing');
select is((select replayed from first_put), false, 'T-IDN-INT-53 as a command that ran');

create temporary table again as
select * from pg_temp.put('user_correo', pg_temp.set_with_off('nutrition:email', 'assignment:push'),
  'a8333333-3333-4333-8333-333333333301', decode(repeat('c1', 32), 'hex'));
select is((select replayed from again), true, 'T-IDN-IDEM-23 the same key and request answer as a replay');
select is((select preferences from again), (select preferences from first_put),
  'T-IDN-IDEM-23 with the same document');
select throws_ok(
  $$ select * from pg_temp.put('user_correo', pg_temp.set_with_off(),
       'a8333333-3333-4333-8333-333333333301', decode(repeat('c2', 32), 'hex')) $$,
  '23505', null, 'T-IDN-IDEM-24 the same key for another request is refused');

select throws_ok(
  $$ select * from pg_temp.put('user_correo',
       pg_temp.set_with_off('nutrition:email', 'assignment:push', 'security:email')) $$,
  '22023', null, 'T-IDN-INT-54 security cannot be turned off');
select is(pg_temp.entry(identity.read_my_notification_preferences('workos', 'https://issuer.test', 'user_correo'),
    'nutrition', 'email') ->> 'enabled', 'false',
  'T-IDN-INT-54 and the refused set changed nothing');

select throws_ok(
  $$ select * from pg_temp.put('user_correo', pg_temp.set_with_off('nutrition:email')) $$,
  '22023', null, 'T-IDN-INT-55 push cannot be turned on without a registered phone');

reset role;
-- She had turned email off while it was verified; the address is now unverified.
insert into identity.notification_preferences (person_id, category, channel, enabled)
values ('019f8300-0000-7000-8000-000000000002', 'consent', 'email', false);
set local role allfit_api;

select throws_ok(
  $$ select * from pg_temp.put('user_sinverificar', pg_temp.set_with_off()) $$,
  '22023', null, 'T-IDN-INT-55 email cannot be turned on without a verified email');
select is(
  (select preferences from pg_temp.put('user_sinverificar', pg_temp.set_with_off('consent:email'))) is not null,
  true, 'T-IDN-INT-55 keeping it off, and every other default, is accepted');

select throws_ok(
  $$ select * from pg_temp.put('user_correo', pg_temp.set_with_off('nutrition:email', 'assignment:push') - 0) $$,
  '22023', null, 'T-IDN-INT-56 a set missing a pair is refused');
select throws_ok(
  $$ select * from pg_temp.put('user_correo', (pg_temp.set_with_off('nutrition:email', 'assignment:push')
       || '[{"category": "billing", "channel": "email", "enabled": true}]'::jsonb) - 0) $$,
  '22023', null, 'T-IDN-INT-56 so is a category outside the catalogue');
select throws_ok(
  $$ select * from pg_temp.put('user_correo', jsonb_set(pg_temp.set_with_off('nutrition:email', 'assignment:push'),
       '{0,channel}', '"sms"')) $$,
  '22023', null, 'T-IDN-INT-56 and a channel V1 does not send');
select throws_ok(
  $$ select * from pg_temp.put('user_correo', jsonb_set(pg_temp.set_with_off('nutrition:email', 'assignment:push'),
       '{0,enabled}', '"yes"')) $$,
  '22023', null, 'T-IDN-INT-56 and anything but a boolean');

-- ———————————————————————————————— straight at the table

select throws_ok($$ select count(*) from identity.notification_preferences $$,
  '42501', null, 'T-IDN-RLS-38 the runtime role cannot read the table');
select throws_ok(
  $$ update identity.notification_preferences set enabled = true $$,
  '42501', null, 'T-IDN-RLS-38 nor change it');

set local role allfit_owner;
select set_config('app.actor_kind', 'person', true);
select set_config('app.actor_person_id', '019f8300-0000-7000-8000-000000000002', true);

select is(
  (select count(*)::integer from identity.notification_preferences
   where person_id = '019f8300-0000-7000-8000-000000000001'),
  0, 'T-IDN-RLS-37 the neighbour sees none of her rows');
select throws_ok(
  $$ insert into identity.notification_preferences (person_id, category, channel, enabled)
     values ('019f8300-0000-7000-8000-000000000001', 'relationship', 'email', false) $$,
  '42501', null, 'T-IDN-RLS-37 nor writes one in her name');
update identity.notification_preferences set enabled = true
where person_id = '019f8300-0000-7000-8000-000000000001';

select set_config('app.actor_person_id', '019f8300-0000-7000-8000-000000000001', true);
select is(
  (select count(*)::integer from identity.notification_preferences where not enabled),
  2, 'T-IDN-RLS-37 she sees her own, unmoved by the neighbour''s update');

reset role;
select throws_ok(
  $$ insert into identity.notification_preferences (person_id, category, channel, enabled)
     values ('019f8300-0000-7000-8000-000000000002', 'security', 'push', false) $$,
  '23514', null, 'T-IDN-PHY-31 the table refuses security turned off, whoever writes');
select throws_ok(
  $$ insert into identity.notification_preferences (person_id, category, channel, enabled)
     values ('019f8300-0000-7000-8000-000000000002', 'relationship', 'sms', true) $$,
  '23514', null, 'T-IDN-PHY-31 and a channel V1 does not send');

select * from finish();
rollback;
