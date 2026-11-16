-- T-CAT-GLOBAL-ARCHIVE-01 — HU-BO-022 criterion 3: archiving a movement of the global
-- catalogue retires it from search and breaks nothing that already used it.
--
-- `T-CAT-GLOBAL-01` proves an archived entry is kept and cannot be deleted. This proves
-- the other half the criterion promises: what was built with it still reads it by name.
-- A session she trained with it shows the movement, and a gym's published template still
-- resolves its step, while a search for new content no longer offers it.

begin;

select plan(7);

insert into identity.people (id, given_name, family_name, status)
values
  ('019cb000-0000-7000-8000-000000000001', 'Curadora', 'Uno', 'active'),
  ('019cb000-0000-7000-8000-000000000002', 'Curador', 'Dos', 'active'),
  ('019cb000-0000-7000-8000-000000000006', 'Atleta', 'Seis', 'active'),
  ('019cb000-0000-7000-8000-000000000008', 'Owner', 'Ocho', 'active');

insert into identity.access_accounts (id, provider, issuer, subject, person_id)
values
  ('019cb000-0000-7000-8000-000000000011', 'workos', 'https://issuer.test', 'archive-uno', null),
  ('019cb000-0000-7000-8000-000000000012', 'workos', 'https://issuer.test', 'archive-dos', null);

select support.bootstrap_backoffice_administrators(
  '019cb000-0000-7000-8000-000000000001', 'archive-uno',
  '019cb000-0000-7000-8000-000000000002', 'archive-dos',
  'https://issuer.test', clock_timestamp() + interval '30 days', 'CEREMONY-CAT-ARCHIVE-01'
);

insert into identity.access_sessions (
  id, access_account_id, provider_session_id, surface, token_hash, token_ciphertext,
  access_token_expires_at, assurance_level, authentication_method,
  assurance_verified_at, last_activity_at, absolute_expires_at
) values (
  '019cb000-0000-7000-8000-000000000021', '019cb000-0000-7000-8000-000000000011',
  'sid_archive_uno', 'backoffice', decode(repeat('cb', 32), 'hex'), 'v1.archive-uno',
  clock_timestamp() + interval '5 minutes', 2, 'password_totp',
  clock_timestamp(), clock_timestamp(), clock_timestamp() + interval '8 hours'
);

-- A movement of the global catalogue, published.
insert into catalog.movements (id, discipline_code, name, normalized_name, content_scope, status)
values
  ('019cb000-0000-7000-8000-0000000000f1', 'test_strength', 'Press militar global',
    'press militar global', 'global', 'published'),
  ('019cb000-0000-7000-8000-0000000000f2', 'test_strength', 'Borrador global',
    'borrador global', 'global', 'draft');

-- She trained with it.
insert into execution.executed_sessions (
  id, person_id, activity_type_id, result_contract_id, contract_version,
  started_at, ended_at, timezone, requested_level, capture_source
) values (
  '019cb000-0000-7000-8000-000000000901', '019cb000-0000-7000-8000-000000000006',
  '019c0000-0000-7000-8000-000000000011', '019c0000-0000-7000-8000-000000000031', 1,
  clock_timestamp() - interval '1 day', clock_timestamp() - interval '1 day' + interval '1 hour',
  'America/Bogota', 'summary', 'manual'
);
insert into execution.strength_sets (executed_session_id, movement_id, set_order, achieved_reps)
values ('019cb000-0000-7000-8000-000000000901', '019cb000-0000-7000-8000-0000000000f1', 1, 8);

-- A gym published a template with it.
insert into organizations.organizations (id, type_code, display_name, responsible_party)
values ('019cb000-0000-7000-8000-000000000101', 'gym', 'Gimnasio Catalogo',
  '{"party_kind":"legal_entity","party_name":"Gimnasio Catalogo","purpose":"studio_operations"}');
insert into planning.session_templates (
  id, content_scope, owner_organization_id, owner_person_id, author_person_id, discipline_code, status
) values (
  '019cb000-0000-7000-8000-000000000801', 'organization', '019cb000-0000-7000-8000-000000000101',
  null, '019cb000-0000-7000-8000-000000000008', 'test_strength', 'published'
);
select set_config('app.planning_publication', 'true', true);
insert into planning.session_template_versions (
  id, template_id, version_number, discipline_code, activity_type_id, title, content_hash
) values (
  '019cb000-0000-7000-8000-000000000805', '019cb000-0000-7000-8000-000000000801', 1,
  'test_strength', '019c0000-0000-7000-8000-000000000011', 'Hombro',
  decode(repeat('cb', 32), 'hex')
);
insert into planning.planned_steps (template_version_id, position, movement_id)
values ('019cb000-0000-7000-8000-000000000805', 1, '019cb000-0000-7000-8000-0000000000f1');
select set_config('app.planning_publication', '', true);

-- The curator archives it, as the Backoffice actor the API names.
select set_config('app.actor_kind', 'support', true),
       set_config('app.actor_person_id', '019cb000-0000-7000-8000-000000000001', true);

select is(
  (select result->>'status' from catalog.archive_global_movement(
    '019cb000-0000-7000-8000-000000000001', '019cb000-0000-7000-8000-000000000021',
    '019cb000-0000-7000-8000-0000000000f1',
    'cb000000-0000-4000-8000-000000000001', '019cb000-0000-7000-8000-000000000601',
    decode(repeat('cb', 32), 'hex')
  )),
  'archived',
  'the curator archives the movement'
);

set local role allfit_owner;
select set_config('app.actor_kind', 'person', true);
select set_config('app.actor_person_id', '019cb000-0000-7000-8000-000000000006', true);

select is(
  (select count(*)::integer
   from jsonb_array_elements(catalog.read_movements(
     '019cb000-0000-7000-8000-000000000006', 'test_strength', 'press militar global', 200
   )->'data') as found
   where found->>'id' = '019cb000-0000-7000-8000-0000000000f1'),
  0,
  'a search for new content no longer offers it'
);

select is(
  (select execution.session_projection('019cb000-0000-7000-8000-000000000901')
     -> 'strength_sets' -> 0 ->> 'movement_name'),
  'Press militar global',
  'the session she trained with it still names it'
);

-- A draft of the global catalogue was never offered, and stays out of reach.
select is(
  (select count(*)::integer from catalog.movements
   where id = '019cb000-0000-7000-8000-0000000000f2'),
  0,
  'a global draft stays hidden from a person'
);

-- The gym that published a template with it still reads it by name.
select set_config('app.actor_kind', 'professional', true),
       set_config('app.actor_person_id', '019cb000-0000-7000-8000-000000000008', true),
       set_config('app.actor_org_id', '019cb000-0000-7000-8000-000000000101', true);

select is(
  (select movement.name from catalog.movements as movement
   where movement.id = '019cb000-0000-7000-8000-0000000000f1'),
  'Press militar global',
  'the gym whose template uses it still reads its name'
);

reset role;

select is(
  (select status from catalog.movements where id = '019cb000-0000-7000-8000-0000000000f1'),
  'archived',
  'the row is kept, archived'
);

select throws_ok(
  $$ delete from catalog.movements where id = '019cb000-0000-7000-8000-0000000000f1' $$,
  null,
  'and it is never deleted while anything uses it'
);

select * from finish();

rollback;
