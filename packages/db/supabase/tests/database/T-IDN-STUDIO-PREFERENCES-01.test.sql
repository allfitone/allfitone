-- T-IDN-STUDIO-PREFERENCES-01 — a person keeps her theme for Studio
-- (`OP-IDN-068`, `OP-IDN-069`).
--
-- One person has chosen nothing, chooses, is answered the same on a retry and chooses
-- again; what she keeps for another product stays that product's. Her neighbour neither
-- reads it nor chooses for her, an account that is not a person yet and a closed one get
-- what `OP-IDN-017` gives them, and the runtime role never touches the table.
--
-- Written before the policies, the actor check and the revoke existed, and seen to fail:
-- the neighbour read her theme and changed it, the runtime role read the table, and a
-- transaction that named nobody was answered instead of refused.
begin;

select plan(39);

select has_table(
  'identity', 'surface_preferences',
  'T-IDN-PHY-24 what a person chose for a product has its own table');
select col_is_pk(
  'identity', 'surface_preferences', array['person_id', 'surface'],
  'T-IDN-PHY-24 with one row per person per product');
select ok(
  (select relrowsecurity and relforcerowsecurity from pg_catalog.pg_class
   where oid = 'identity.surface_preferences'::regclass),
  'T-IDN-PHY-25 row security is on and forced, so it binds the owner too');
select ok(
  not has_function_privilege('public', 'identity.read_studio_preferences(uuid)', 'execute')
  and not has_function_privilege(
    'public', 'identity.put_studio_preferences(uuid, text, uuid, uuid, bytea)', 'execute'),
  'T-IDN-PHY-26 nobody calls the two functions by default');

insert into identity.people (id, given_name, family_name, status)
values ('019f8100-0000-7000-8000-000000000001', 'Quien', 'Elige', 'active'),
       ('019f8100-0000-7000-8000-000000000002', 'La', 'Vecina', 'active'),
       ('019f8100-0000-7000-8000-000000000003', 'Cuenta', 'Cerrada', 'closed');

set local role allfit_api;
select set_config('app.actor_kind', 'person', true);
select set_config('app.actor_person_id', '019f8100-0000-7000-8000-000000000001', true);

-- ———————————————————————————————— read (OP-IDN-068) and keep (OP-IDN-069)

select is(
  identity.read_studio_preferences('019f8100-0000-7000-8000-000000000001'),
  '{"theme": null}'::jsonb,
  'T-IDN-INT-41 until she chooses there is no theme, and the database invents none');

select throws_ok(
  $$ select * from identity.put_studio_preferences('019f8100-0000-7000-8000-000000000001', 'sepia',
       'a8111111-1111-4111-8111-111111111101', '019f8100-0000-7000-8000-000000000101', decode(repeat('a1', 32), 'hex')) $$,
  '22023', null, 'T-IDN-INT-42 a theme outside the list is refused');

select throws_ok(
  $$ select * from identity.put_studio_preferences('019f8100-0000-7000-8000-000000000001', null,
       'a8111111-1111-4111-8111-111111111102', '019f8100-0000-7000-8000-000000000102', decode(repeat('a2', 32), 'hex')) $$,
  '22023', null, 'T-IDN-INT-42 and so is no theme at all');

create temporary table first_choice as
select * from identity.put_studio_preferences('019f8100-0000-7000-8000-000000000001', 'light',
  'a8111111-1111-4111-8111-111111111103', '019f8100-0000-7000-8000-000000000103', decode(repeat('a3', 32), 'hex'));

select is(
  (select preferences from first_choice), '{"theme": "light"}'::jsonb,
  'T-IDN-INT-43 she chooses, and the answer carries what she chose');
select is(
  (select replayed from first_choice), false, 'T-IDN-INT-43 as a command that ran');
select is(
  identity.read_studio_preferences('019f8100-0000-7000-8000-000000000001'),
  '{"theme": "light"}'::jsonb, 'T-IDN-RLS-25 she reads what she chose');

-- ———————————————————————————————— the same command again

create temporary table retried as
select * from identity.put_studio_preferences('019f8100-0000-7000-8000-000000000001', 'light',
  'a8111111-1111-4111-8111-111111111103', '019f8100-0000-7000-8000-000000000103', decode(repeat('a3', 32), 'hex'));

select is(
  (select preferences from retried), '{"theme": "light"}'::jsonb,
  'T-IDN-IDEM-19 the same key with the same request answers the same');
select is(
  (select replayed from retried), true, 'T-IDN-IDEM-19 and says it is a replay');

select throws_ok(
  $$ select * from identity.put_studio_preferences('019f8100-0000-7000-8000-000000000001', 'dark',
       'a8111111-1111-4111-8111-111111111103', '019f8100-0000-7000-8000-000000000103', decode(repeat('a4', 32), 'hex')) $$,
  '23505', null, 'T-IDN-IDEM-20 the same key for another request is refused');
select is(
  identity.read_studio_preferences('019f8100-0000-7000-8000-000000000001'),
  '{"theme": "light"}'::jsonb, 'T-IDN-IDEM-20 and changes nothing');

reset role;
select is(
  (select count(*)::integer from system.idempotency_keys
   where operation_code = 'OP-IDN-069' and surface = 'studio'
     and key = 'a8111111-1111-4111-8111-111111111103'
     and outcome_code = 'studio-preferences-kept'
     and aggregate_type = 'person'
     and aggregate_id = '019f8100-0000-7000-8000-000000000001'),
  1, 'T-IDN-IDEM-19 one receipt stands for the command and its retries');

-- ———————————————————————————————— another product, and choosing again

-- Only Studio has a theme today; this row stands for a product that gets one later.
insert into identity.surface_preferences (person_id, surface, theme)
values ('019f8100-0000-7000-8000-000000000001', 'backoffice', 'light');

set local role allfit_api;
select is(
  (select preferences from identity.put_studio_preferences('019f8100-0000-7000-8000-000000000001', 'dark',
     'a8111111-1111-4111-8111-111111111105', '019f8100-0000-7000-8000-000000000105', decode(repeat('a5', 32), 'hex'))),
  '{"theme": "dark"}'::jsonb, 'T-IDN-INT-44 choosing again replaces the choice');

reset role;
select is(
  (select count(*)::integer from identity.surface_preferences
   where person_id = '019f8100-0000-7000-8000-000000000001' and surface = 'studio'),
  1, 'T-IDN-INT-44 in the one row she has for Studio');
select is(
  (select theme from identity.surface_preferences
   where person_id = '019f8100-0000-7000-8000-000000000001' and surface = 'backoffice'),
  'light', 'T-IDN-INT-45 what she keeps for another product did not move with Studio''s');

create temporary table before_the_same as
select updated_at from identity.surface_preferences
where person_id = '019f8100-0000-7000-8000-000000000001' and surface = 'studio';

set local role allfit_api;
select is(
  (select preferences from identity.put_studio_preferences('019f8100-0000-7000-8000-000000000001', 'dark',
     'a8111111-1111-4111-8111-111111111106', '019f8100-0000-7000-8000-000000000106', decode(repeat('a6', 32), 'hex'))),
  '{"theme": "dark"}'::jsonb, 'T-IDN-INT-46 choosing what she already has answers it');

reset role;
select is(
  (select updated_at from identity.surface_preferences
   where person_id = '019f8100-0000-7000-8000-000000000001' and surface = 'studio'),
  (select updated_at from before_the_same), 'T-IDN-INT-46 and writes nothing');
select is(
  (select outcome_code from system.idempotency_keys
   where operation_code = 'OP-IDN-069' and key = 'a8111111-1111-4111-8111-111111111106'),
  'studio-preferences-unchanged', 'T-IDN-INT-46 which is what its receipt says');

-- ———————————————————————————————— the neighbour

set local role allfit_api;
select set_config('app.actor_person_id', '019f8100-0000-7000-8000-000000000002', true);

select throws_ok(
  $$ select identity.read_studio_preferences('019f8100-0000-7000-8000-000000000001') $$,
  '42501', null, 'T-IDN-RLS-26 the neighbour does not read her theme');

select throws_ok(
  $$ select * from identity.put_studio_preferences('019f8100-0000-7000-8000-000000000001', 'light',
       'a8111111-1111-4111-8111-111111111107', '019f8100-0000-7000-8000-000000000107', decode(repeat('a7', 32), 'hex')) $$,
  '42501', null, 'T-IDN-RLS-27 nor chooses it for her');

select is(
  identity.read_studio_preferences('019f8100-0000-7000-8000-000000000002'),
  '{"theme": null}'::jsonb,
  'T-IDN-RLS-27 and her own is still unchosen: nothing of one person reaches another');

-- ———————————————————————————————— not a person yet, and closed

select set_config('app.actor_kind', 'account', true);
select set_config('app.actor_person_id', '019f8100-0000-7000-8000-000000000001', true);

select throws_ok(
  $$ select identity.read_studio_preferences('019f8100-0000-7000-8000-000000000001') $$,
  '42501', null, 'T-IDN-RLS-28 an account that is not a person yet reads no preference');
select throws_ok(
  $$ select * from identity.put_studio_preferences('019f8100-0000-7000-8000-000000000001', 'light',
       'a8111111-1111-4111-8111-111111111108', '019f8100-0000-7000-8000-000000000108', decode(repeat('a8', 32), 'hex')) $$,
  '42501', null, 'T-IDN-RLS-28 and keeps none');

select set_config('app.actor_kind', 'person', true);
select set_config('app.actor_person_id', '019f8100-0000-7000-8000-000000000003', true);

select throws_ok(
  $$ select identity.read_studio_preferences('019f8100-0000-7000-8000-000000000003') $$,
  '42501', null, 'T-IDN-RLS-29 a closed account reads no preference');
select throws_ok(
  $$ select * from identity.put_studio_preferences('019f8100-0000-7000-8000-000000000003', 'light',
       'a8111111-1111-4111-8111-111111111109', '019f8100-0000-7000-8000-000000000109', decode(repeat('a9', 32), 'hex')) $$,
  '42501', null, 'T-IDN-RLS-29 and keeps none');
select throws_ok(
  $$ select identity.get_my_professional_context('019f8100-0000-7000-8000-000000000003',
       '019f8100-0000-7000-8000-000000000201') $$,
  '42501', null, 'T-IDN-RLS-29 which is the answer OP-IDN-017 gives her');

-- ———————————————————————————————— nobody acting

-- A person actor with no person named: absence of proof, which must be a refusal.
select set_config('app.actor_person_id', '', true);

select throws_ok(
  $$ select identity.read_studio_preferences('019f8100-0000-7000-8000-000000000001') $$,
  '42501', null, 'T-IDN-RLS-30 a transaction that names no acting person reads no preference');
select throws_ok(
  $$ select * from identity.put_studio_preferences('019f8100-0000-7000-8000-000000000001', 'light',
       'a8111111-1111-4111-8111-111111111110', '019f8100-0000-7000-8000-000000000110', decode(repeat('aa', 32), 'hex')) $$,
  '42501', null, 'T-IDN-RLS-30 and keeps none');

-- ———————————————————————————————— straight at the table

set local role allfit_owner;
select set_config('app.actor_person_id', '019f8100-0000-7000-8000-000000000002', true);

select is(
  (select count(*)::integer from identity.surface_preferences), 0,
  'T-IDN-RLS-31 straight at the table, the neighbour sees no row of hers');

select throws_ok(
  $$ insert into identity.surface_preferences (person_id, surface, theme)
     values ('019f8100-0000-7000-8000-000000000001', 'studio', 'light') $$,
  '42501', null, 'T-IDN-RLS-32 the neighbour cannot write a row in her name');

update identity.surface_preferences set theme = 'light'
where person_id = '019f8100-0000-7000-8000-000000000001';

select set_config('app.actor_person_id', '019f8100-0000-7000-8000-000000000001', true);
select is(
  (select array_agg(surface::text || ':' || theme order by surface::text)
   from identity.surface_preferences),
  array['backoffice:light', 'studio:dark'],
  'T-IDN-RLS-31 and she sees her own, unmoved: the neighbour''s zero is the policy');

set local role allfit_api;
select throws_ok(
  $$ select count(*) from identity.surface_preferences $$,
  '42501', null, 'T-IDN-RLS-33 the runtime role cannot read the table');
select throws_ok(
  $$ insert into identity.surface_preferences (person_id, surface, theme)
     values ('019f8100-0000-7000-8000-000000000002', 'studio', 'light') $$,
  '42501', null, 'T-IDN-RLS-33 nor write a row');
select throws_ok(
  $$ update identity.surface_preferences set theme = 'light' $$,
  '42501', null, 'T-IDN-RLS-33 nor change one');
select throws_ok(
  $$ delete from identity.surface_preferences $$,
  '42501', null, 'T-IDN-RLS-33 nor remove one');

-- ———————————————————————————————— the list, with every policy out of the way

reset role;

select throws_ok(
  $$ insert into identity.surface_preferences (person_id, surface, theme)
     values ('019f8100-0000-7000-8000-000000000002', 'studio', 'sepia') $$,
  '23514', null, 'T-IDN-PHY-27 the table refuses a theme outside the list, whoever writes');

select * from finish();
rollback;
