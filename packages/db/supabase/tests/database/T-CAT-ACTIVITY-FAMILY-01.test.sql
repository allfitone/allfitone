-- T-CAT-ACTIVITY-FAMILY-01 — OP-CAT-008 / HU-STUDIO-037 criterion 3.
--
-- A template step's target must be of the family its activity type expects, and
-- `planning.session_content_errors` decides that family from the type's effective
-- default result contract. The catalogue read now says which family that is, so an
-- editor can offer the right target instead of learning it from a refusal. When no
-- default contract is in force there is no family, and every target is refused.

begin;

select plan(3);

insert into identity.people (id, given_name, family_name, status)
values ('019ab100-0000-7000-8000-000000000001', 'Reader', 'Active', 'active');

insert into catalog.disciplines (code, name, status)
values ('test_family_running', 'Carrera', 'published');

insert into catalog.activity_types (id, discipline_code, code, name, content_scope, status)
values
  ('019ab100-0000-7000-8000-000000000201', 'test_family_running', 'test_family_with_default',
    'Con contrato por defecto', 'global', 'published'),
  ('019ab100-0000-7000-8000-000000000202', 'test_family_running', 'test_family_without_contract',
    'Sin contrato', 'global', 'published'),
  ('019ab100-0000-7000-8000-000000000203', 'test_family_running', 'test_family_default_expired',
    'Con el defecto vencido', 'global', 'published');

insert into catalog.result_contracts (
  id, contract_code, version_number, activity_family, envelope, minimums, status, published_at
) values
  ('019ab100-0000-7000-8000-000000000301', 'test.family.endurance', 1, 'endurance',
    '{"schema":1}', '{}', 'published', clock_timestamp()),
  ('019ab100-0000-7000-8000-000000000302', 'test.family.mobility', 1, 'mobility',
    '{"schema":1}', '{}', 'published', clock_timestamp());

insert into catalog.activity_type_result_contracts (
  id, activity_type_id, result_contract_id, is_default, valid_from, valid_to
) values
  ('019ab100-0000-7000-8000-000000000401', '019ab100-0000-7000-8000-000000000201',
    '019ab100-0000-7000-8000-000000000301', true, clock_timestamp() - interval '1 minute', null),
  -- The default closed a second ago and the one still open is not a default.
  ('019ab100-0000-7000-8000-000000000402', '019ab100-0000-7000-8000-000000000203',
    '019ab100-0000-7000-8000-000000000302', true,
    clock_timestamp() - interval '10 days', clock_timestamp() - interval '1 second'),
  ('019ab100-0000-7000-8000-000000000403', '019ab100-0000-7000-8000-000000000203',
    '019ab100-0000-7000-8000-000000000301', false, clock_timestamp() - interval '1 minute', null);

select set_config('app.actor_kind', 'person', true),
       set_config('app.actor_person_id', '019ab100-0000-7000-8000-000000000001', true);

select is(
  (select activity_family::text from catalog.list_activity_types()
    where code = 'test_family_with_default'),
  'endurance',
  'an activity type names the family of its effective default contract'
);

select is(
  (select activity_family::text from catalog.list_activity_types()
    where code = 'test_family_without_contract'),
  null,
  'an activity type without a contract names no family'
);

select is(
  (select activity_family::text from catalog.list_activity_types()
    where code = 'test_family_default_expired'),
  null,
  'nor does one whose default is no longer in force, as the template validator reads it'
);

select * from finish();
rollback;
