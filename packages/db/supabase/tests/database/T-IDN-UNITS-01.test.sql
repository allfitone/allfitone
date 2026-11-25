-- T-IDN-UNITS-01 — a person chooses her units and language (`OP-IDN-070`, `OP-IDN-071`,
-- `HU-SP-094`, ADR-054). TECH-44.
--
-- Nothing is chosen until she chooses, and the database invents no default: the app then
-- follows the phone. A value outside its list is refused, a retry is answered once, and
-- choosing a unit rewrites none of her records (ADR-054 scenario 8). Only she reads or
-- writes the row; her neighbour, a closed account and the runtime role reach nothing
-- (scenario 9).
--
-- Written before the migration and watched failing; the neighbour's denials were watched
-- succeeding with the policies replaced by `true`.
begin;

select plan(26);

select has_table('identity', 'person_preferences', 'T-IDN-PHY-28 units and language have their own table');
select col_is_pk('identity', 'person_preferences', 'person_id', 'T-IDN-PHY-28 with one row per person');
select ok(
  (select relrowsecurity and relforcerowsecurity from pg_catalog.pg_class
   where oid = 'identity.person_preferences'::regclass),
  'T-IDN-PHY-28 row security is on and forced, so it binds the owner too');

insert into identity.people (id, given_name, family_name, contact_email, contact_email_verified_at, status)
values ('019f8200-0000-7000-8000-000000000001', 'Quien', 'Elige', 'elige@example.test', clock_timestamp(), 'active'),
       ('019f8200-0000-7000-8000-000000000002', 'La', 'Vecina', 'vecina@example.test', clock_timestamp(), 'active'),
       ('019f8200-0000-7000-8000-000000000003', 'Cuenta', 'Cerrada', null, null, 'closed');

insert into identity.access_accounts (id, provider, issuer, subject, person_id, linked_at)
values ('019f8200-0000-7000-8000-000000000101', 'workos', 'https://issuer.test', 'user_elige',
        '019f8200-0000-7000-8000-000000000001', clock_timestamp()),
       ('019f8200-0000-7000-8000-000000000102', 'workos', 'https://issuer.test', 'user_vecina',
        '019f8200-0000-7000-8000-000000000002', clock_timestamp()),
       ('019f8200-0000-7000-8000-000000000103', 'workos', 'https://issuer.test', 'user_cerrada',
        '019f8200-0000-7000-8000-000000000003', clock_timestamp());

insert into identity.body_progress_records (id, person_id, metric_code, value_numeric, unit_code, original_value, original_unit_code, measured_on)
values ('019f8200-0000-7000-8000-000000000b01', '019f8200-0000-7000-8000-000000000001', 'body_weight', 70, 'kg', 154.32, 'lb', current_date - 1);

create function pg_temp.put(
  p_subject text, p_mass text, p_distance text, p_locale text,
  p_key uuid default gen_random_uuid(), p_hash bytea default extensions.gen_random_bytes(32)
) returns table (preferences jsonb, replayed boolean)
language sql as $fn$
  select * from identity.put_my_preferences(
    'workos', 'https://issuer.test', p_subject, p_mass, p_distance, p_locale,
    p_key, extensions.uuid_generate_v7(), p_hash)
$fn$;

set local role allfit_api;

-- ———————————————————————————————— read (OP-IDN-070) and choose (OP-IDN-071)

select is(
  identity.read_my_preferences('workos', 'https://issuer.test', 'user_elige'),
  '{"mass_unit": null, "distance_unit": null, "locale": null}'::jsonb,
  'T-IDN-INT-47 until she chooses nothing is chosen, and the database invents no default');

select throws_ok($$ select * from pg_temp.put('user_elige', 'stone', null, null) $$,
  '22023', null, 'T-IDN-INT-48 a mass unit outside kg and lb is refused');
select throws_ok($$ select * from pg_temp.put('user_elige', null, 'league', null) $$,
  '22023', null, 'T-IDN-INT-48 so is a distance unit outside km and mi');
select throws_ok($$ select * from pg_temp.put('user_elige', null, null, 'fr') $$,
  '22023', null, 'T-IDN-INT-48 and a language outside es and en');

create temporary table first_choice as
select * from pg_temp.put('user_elige', 'lb', 'mi', 'en',
  'a8222222-2222-4222-8222-222222222201', decode(repeat('b1', 32), 'hex'));

select is((select preferences from first_choice),
  '{"mass_unit": "lb", "distance_unit": "mi", "locale": "en"}'::jsonb,
  'T-IDN-INT-49 she chooses, and the answer carries what she chose');
select is((select replayed from first_choice), false, 'T-IDN-INT-49 as a command that ran');
select is(identity.read_my_preferences('workos', 'https://issuer.test', 'user_elige'),
  '{"mass_unit": "lb", "distance_unit": "mi", "locale": "en"}'::jsonb,
  'T-IDN-INT-49 and reads it back');

-- ———————————————————————————————— the same command again

create temporary table retried as
select * from pg_temp.put('user_elige', 'lb', 'mi', 'en',
  'a8222222-2222-4222-8222-222222222201', decode(repeat('b1', 32), 'hex'));

select is((select replayed from retried), true, 'T-IDN-IDEM-21 the same key and request answer as a replay');
select is((select preferences from retried),
  '{"mass_unit": "lb", "distance_unit": "mi", "locale": "en"}'::jsonb,
  'T-IDN-IDEM-21 with the same document');
select throws_ok(
  $$ select * from pg_temp.put('user_elige', 'kg', 'km', 'es',
       'a8222222-2222-4222-8222-222222222201', decode(repeat('b2', 32), 'hex')) $$,
  '23505', null, 'T-IDN-IDEM-22 the same key for another request is refused');
select is(identity.read_my_preferences('workos', 'https://issuer.test', 'user_elige') ->> 'mass_unit',
  'lb', 'T-IDN-IDEM-22 and changes nothing');

-- ———————————————————————————————— a unit rewrites nothing (scenario 8)

reset role;
select is(
  (select array[value_numeric::text, unit_code, original_value::text, original_unit_code]
   from identity.body_progress_records where id = '019f8200-0000-7000-8000-000000000b01'),
  array['70', 'kg', '154.32', 'lb'],
  'T-IDN-INT-50 choosing pounds left her weight in its canonical and original units');

set local role allfit_api;
select is(
  (select preferences from pg_temp.put('user_elige', null, 'km', null)),
  '{"mass_unit": null, "distance_unit": "km", "locale": null}'::jsonb,
  'T-IDN-INT-51 a null hands the choice back to the phone');

-- ———————————————————————————————— not her, and not a person

select is(identity.read_my_preferences('workos', 'https://issuer.test', 'user_vecina'),
  '{"mass_unit": null, "distance_unit": null, "locale": null}'::jsonb,
  'T-IDN-RLS-34 her neighbour reads only her own, which is unchosen');
select throws_ok(
  $$ select identity.read_my_preferences('workos', 'https://issuer.test', 'user_cerrada') $$,
  '42501', null, 'T-IDN-RLS-34 a closed account reads no preference');
select throws_ok($$ select * from pg_temp.put('user_cerrada', 'kg', null, null) $$,
  '42501', null, 'T-IDN-RLS-34 and keeps none');
select throws_ok(
  $$ select identity.read_my_preferences('workos', 'https://issuer.test', 'user_nobody') $$,
  '42501', null, 'T-IDN-RLS-34 a token behind no person reads nothing');

-- ———————————————————————————————— straight at the table

select throws_ok($$ select count(*) from identity.person_preferences $$,
  '42501', null, 'T-IDN-RLS-36 the runtime role cannot read the table');
select throws_ok(
  $$ insert into identity.person_preferences (person_id, locale) values ('019f8200-0000-7000-8000-000000000002', 'es') $$,
  '42501', null, 'T-IDN-RLS-36 nor write it');

set local role allfit_owner;
select set_config('app.actor_kind', 'person', true);
select set_config('app.actor_person_id', '019f8200-0000-7000-8000-000000000002', true);

select is((select count(*)::integer from identity.person_preferences), 0,
  'T-IDN-RLS-35 straight at the table, the neighbour sees no row of hers');
select throws_ok(
  $$ insert into identity.person_preferences (person_id, locale) values ('019f8200-0000-7000-8000-000000000001', 'es') $$,
  '42501', null, 'T-IDN-RLS-35 nor writes one in her name');
update identity.person_preferences set distance_unit = 'mi' where person_id = '019f8200-0000-7000-8000-000000000001';

select set_config('app.actor_person_id', '019f8200-0000-7000-8000-000000000001', true);
select is((select distance_unit from identity.person_preferences), 'km',
  'T-IDN-RLS-35 she sees her own, unmoved: the neighbour''s update reached nothing');

reset role;
select throws_ok(
  $$ insert into identity.person_preferences (person_id, mass_unit) values ('019f8200-0000-7000-8000-000000000002', 'stone') $$,
  '23514', null, 'T-IDN-PHY-29 the table refuses a unit outside its list, whoever writes');

select * from finish();
rollback;
