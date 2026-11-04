-- T-CAT-EQUIP-01 — OP-CAT-004, OP-CAT-005 and OP-CAT-016: Allfit publishes equipment
-- and says which a movement uses (`HU-BO-022`).
--
-- `catalog.equipment` and `catalog.movement_equipment` exist and `/catalog/v1/equipment`
-- serves them, but nothing could put a row in them: the list a person filters movements
-- by was always empty, and the curator's screen said equipment "has no table".
--
-- **The same rules as the rest of the catalogue.** Only the curator duty publishes, a
-- published code is stable, an archived one returns only under the name it had, and a
-- global entry is archived, never deleted.
--
-- **A movement names only published equipment.** Its list is replaced as a whole, so
-- what the curator sees is exactly what is stored, and a code nobody published, or one
-- archived, is refused rather than linked to nothing.
--
-- **The policies are the platform's alone.** A support actor writes global rows; a
-- person acting for a gym writes none, and nobody writes a gym's row through these.

begin;

select plan(29);

insert into identity.people (id, given_name, family_name)
values
  ('019b3000-0000-7000-8000-000000000001', 'Manager', 'Alpha'),
  ('019b3000-0000-7000-8000-000000000002', 'Manager', 'Beta'),
  ('019b3000-0000-7000-8000-000000000003', 'Curator', 'Gamma'),
  ('019b3000-0000-7000-8000-000000000004', 'Owner', 'Delta');

insert into identity.access_accounts (id, provider, issuer, subject, person_id)
values
  ('019b3000-0000-7000-8000-000000000011', 'workos', 'https://issuer.test', 'alpha_eq', null),
  ('019b3000-0000-7000-8000-000000000012', 'workos', 'https://issuer.test', 'beta_eq', null),
  ('019b3000-0000-7000-8000-000000000013', 'workos', 'https://issuer.test', 'gamma_eq',
    '019b3000-0000-7000-8000-000000000003');

select support.bootstrap_backoffice_administrators(
  '019b3000-0000-7000-8000-000000000001', 'alpha_eq',
  '019b3000-0000-7000-8000-000000000002', 'beta_eq',
  'https://issuer.test', clock_timestamp() + interval '30 days', 'CEREMONY-CAT-EQUIP-01'
);

insert into identity.access_sessions (
  id, access_account_id, provider_session_id, surface, token_hash, token_ciphertext,
  access_token_expires_at, assurance_level, authentication_method,
  assurance_verified_at, last_activity_at, absolute_expires_at
) values
  ('019b3000-0000-7000-8000-000000000021', '019b3000-0000-7000-8000-000000000011',
    'sid_alpha_eq', 'backoffice', decode(repeat('e1', 32), 'hex'), 'v1.alpha',
    clock_timestamp() + interval '5 minutes', 2, 'password_totp',
    clock_timestamp(), clock_timestamp(), clock_timestamp() + interval '8 hours'),
  ('019b3000-0000-7000-8000-000000000023', '019b3000-0000-7000-8000-000000000013',
    'sid_gamma_eq', 'backoffice', decode(repeat('e3', 32), 'hex'), 'v1.gamma',
    clock_timestamp() + interval '5 minutes', 2, 'password_totp',
    clock_timestamp(), clock_timestamp(), clock_timestamp() + interval '8 hours');

select support.assign_platform_role(
  '019b3000-0000-7000-8000-000000000001', '019b3000-0000-7000-8000-000000000021',
  '019b3000-0000-7000-8000-000000000003', 'allfit_admin',
  '019b3000-0000-7000-8000-000000000101', '019b3000-0000-7000-8000-000000000201',
  decode(repeat('41', 32), 'hex')
);

select set_config('app.actor_kind', 'support', true),
       set_config('app.actor_person_id', '019b3000-0000-7000-8000-000000000003', true);

select throws_ok(
  $$ select * from catalog.publish_global_equipment(
    '019b3000-0000-7000-8000-000000000003', '019b3000-0000-7000-8000-000000000023',
    'test_barbell', 'Barra olímpica',
    'e0000000-0000-4000-8000-000000000001', '019b3000-0000-7000-8000-000000000601',
    decode(repeat('51', 32), 'hex')
  ) $$,
  '42501', null,
  'the base role does not publish equipment'
);

select support.assign_platform_duty(
  '019b3000-0000-7000-8000-000000000001', '019b3000-0000-7000-8000-000000000021',
  '019b3000-0000-7000-8000-000000000003', 'curate_global_catalog',
  null, clock_timestamp() + interval '30 days', 'CASE-CURATE-EQ',
  '019b3000-0000-7000-8000-000000000103', '019b3000-0000-7000-8000-000000000203',
  decode(repeat('43', 32), 'hex')
);

-- ---------------------------------------------------------------------------
-- Publishing equipment
-- ---------------------------------------------------------------------------

select throws_ok(
  $$ select * from catalog.publish_global_equipment(
    '019b3000-0000-7000-8000-000000000003', '019b3000-0000-7000-8000-000000000023',
    'Barra Olímpica', 'Barra olímpica',
    'e0000000-0000-4000-8000-000000000002', '019b3000-0000-7000-8000-000000000602',
    decode(repeat('52', 32), 'hex')
  ) $$,
  '22023', null,
  'a code that is not a stable identifier is refused'
);

select throws_ok(
  $$ select * from catalog.publish_global_equipment(
    '019b3000-0000-7000-8000-000000000003', '019b3000-0000-7000-8000-000000000023',
    'test_barbell', '   ',
    'e0000000-0000-4000-8000-000000000003', '019b3000-0000-7000-8000-000000000603',
    decode(repeat('53', 32), 'hex')
  ) $$,
  '22023', null,
  'equipment without a name is refused'
);

create temporary table barbell on commit drop as
select * from catalog.publish_global_equipment(
  '019b3000-0000-7000-8000-000000000003', '019b3000-0000-7000-8000-000000000023',
  'test_barbell', 'Barra olímpica',
  'e0000000-0000-4000-8000-000000000004', '019b3000-0000-7000-8000-000000000604',
  decode(repeat('54', 32), 'hex')
);

select is(
  (select result - 'id' - 'created_at' from barbell),
  '{"code": "test_barbell", "name": "Barra olímpica", "status": "published",
    "in_use_count": 0}'::jsonb,
  'published: a code, a name, and nothing uses it yet'
);

select is(
  (select replayed from catalog.publish_global_equipment(
    '019b3000-0000-7000-8000-000000000003', '019b3000-0000-7000-8000-000000000023',
    'test_barbell', 'Barra olímpica',
    'e0000000-0000-4000-8000-000000000004', '019b3000-0000-7000-8000-000000000604',
    decode(repeat('54', 32), 'hex')
  )),
  true,
  'the same command replays instead of publishing twice'
);

select throws_ok(
  $$ select * from catalog.publish_global_equipment(
    '019b3000-0000-7000-8000-000000000003', '019b3000-0000-7000-8000-000000000023',
    'test_barbell', 'Otra barra',
    'e0000000-0000-4000-8000-000000000005', '019b3000-0000-7000-8000-000000000605',
    decode(repeat('55', 32), 'hex')
  ) $$,
  '55000', null,
  'a published code is not published again'
);

select catalog.publish_global_equipment(
  '019b3000-0000-7000-8000-000000000003', '019b3000-0000-7000-8000-000000000023',
  'test_bench', 'Banco plano',
  'e0000000-0000-4000-8000-000000000006', '019b3000-0000-7000-8000-000000000606',
  decode(repeat('56', 32), 'hex')
);

-- A published movement to say what it uses.
select catalog.publish_discipline(
  '019b3000-0000-7000-8000-000000000003', '019b3000-0000-7000-8000-000000000023',
  'test_eq_strength', 'Fuerza',
  'e0000000-0000-4000-8000-000000000007', '019b3000-0000-7000-8000-000000000607',
  decode(repeat('57', 32), 'hex')
);

create temporary table press on commit drop as
select (result->>'id')::uuid as id
from catalog.publish_global_movement(
  '019b3000-0000-7000-8000-000000000003', '019b3000-0000-7000-8000-000000000023',
  'test_eq_strength', 'Press de banca con barra test',
  'e0000000-0000-4000-8000-000000000008', '019b3000-0000-7000-8000-000000000608',
  decode(repeat('58', 32), 'hex')
);

-- Read under allfit_owner below, where a temporary table of postgres is not visible.
grant select on press to allfit_owner;

-- ---------------------------------------------------------------------------
-- What a movement uses (OP-CAT-016)
-- ---------------------------------------------------------------------------

create temporary table linked on commit drop as
select * from catalog.set_global_movement_equipment(
  '019b3000-0000-7000-8000-000000000003', '019b3000-0000-7000-8000-000000000023',
  (select id from press),
  '[{"code": "test_barbell", "requirement": "required"},
    {"code": "test_bench", "requirement": "optional"}]'::jsonb,
  'e0000000-0000-4000-8000-000000000009', '019b3000-0000-7000-8000-000000000609',
  decode(repeat('59', 32), 'hex')
);

select is(
  (select result->'equipment' from linked),
  '[{"code": "test_barbell", "name": "Barra olímpica", "requirement": "required"},
    {"code": "test_bench", "name": "Banco plano", "requirement": "optional"}]'::jsonb,
  'the movement says what it uses, required first'
);

select is(
  (select (entry->>'in_use_count')::integer
   from jsonb_array_elements(
     catalog.list_global_catalog(
       '019b3000-0000-7000-8000-000000000003', '019b3000-0000-7000-8000-000000000023'
     )->'equipment'
   ) as entry
   where entry->>'code' = 'test_barbell'),
  1,
  'and the equipment counts the movement that uses it'
);

select throws_ok(
  format($$ select * from catalog.set_global_movement_equipment(
    '019b3000-0000-7000-8000-000000000003', '019b3000-0000-7000-8000-000000000023',
    %L, '[{"code": "test_nobody_published", "requirement": "required"}]'::jsonb,
    'e0000000-0000-4000-8000-000000000010', '019b3000-0000-7000-8000-000000000610',
    decode(repeat('5a', 32), 'hex')
  ) $$, (select id from press)),
  '22023', null,
  'a code nobody published is refused, not linked to nothing'
);

select throws_ok(
  format($$ select * from catalog.set_global_movement_equipment(
    '019b3000-0000-7000-8000-000000000003', '019b3000-0000-7000-8000-000000000023',
    %L, '[{"code": "test_bench", "requirement": "required"},
          {"code": "test_bench", "requirement": "optional"}]'::jsonb,
    'e0000000-0000-4000-8000-000000000011', '019b3000-0000-7000-8000-000000000611',
    decode(repeat('5b', 32), 'hex')
  ) $$, (select id from press)),
  '22023', null,
  'the same equipment twice is refused'
);

select throws_ok(
  $$ select * from catalog.set_global_movement_equipment(
    '019b3000-0000-7000-8000-000000000003', '019b3000-0000-7000-8000-000000000023',
    '019b3000-0000-7000-8000-000000000999',
    '[{"code": "test_bench", "requirement": "required"}]'::jsonb,
    'e0000000-0000-4000-8000-000000000012', '019b3000-0000-7000-8000-000000000612',
    decode(repeat('5c', 32), 'hex')
  ) $$,
  'P0002', null,
  'a movement that is not in the global catalogue is not found'
);

select is(
  (select result->'equipment' from catalog.set_global_movement_equipment(
    '019b3000-0000-7000-8000-000000000003', '019b3000-0000-7000-8000-000000000023',
    (select id from press),
    '[{"code": "test_bench", "requirement": "required"}]'::jsonb,
    'e0000000-0000-4000-8000-000000000013', '019b3000-0000-7000-8000-000000000613',
    decode(repeat('5d', 32), 'hex')
  )),
  '[{"code": "test_bench", "name": "Banco plano", "requirement": "required"}]'::jsonb,
  'the list is replaced as a whole'
);

select is(
  (select count(*)::integer from catalog.movement_equipment
    where movement_id = (select id from press)),
  1,
  'and what is stored is exactly what was sent'
);

-- ---------------------------------------------------------------------------
-- Archiving withdraws, it does not delete (OP-CAT-005)
-- ---------------------------------------------------------------------------

select is(
  (select result->>'status' from catalog.archive_global_equipment(
    '019b3000-0000-7000-8000-000000000003', '019b3000-0000-7000-8000-000000000023',
    'test_bench',
    'e0000000-0000-4000-8000-000000000014', '019b3000-0000-7000-8000-000000000614',
    decode(repeat('5e', 32), 'hex')
  )),
  'archived',
  'archiving withdraws the equipment'
);

select is(
  (select count(*)::integer from catalog.movement_equipment
    where movement_id = (select id from press)),
  1,
  'and keeps the link that already used it'
);

select throws_ok(
  $$ select * from catalog.archive_global_equipment(
    '019b3000-0000-7000-8000-000000000003', '019b3000-0000-7000-8000-000000000023',
    'test_bench',
    'e0000000-0000-4000-8000-000000000015', '019b3000-0000-7000-8000-000000000615',
    decode(repeat('5f', 32), 'hex')
  ) $$,
  '55000', null,
  'only published equipment is archived'
);

select throws_ok(
  format($$ select * from catalog.set_global_movement_equipment(
    '019b3000-0000-7000-8000-000000000003', '019b3000-0000-7000-8000-000000000023',
    %L, '[{"code": "test_bench", "requirement": "required"}]'::jsonb,
    'e0000000-0000-4000-8000-000000000016', '019b3000-0000-7000-8000-000000000616',
    decode(repeat('60', 32), 'hex')
  ) $$, (select id from press)),
  '22023', null,
  'archived equipment is not linked again'
);

select throws_ok(
  $$ select * from catalog.publish_global_equipment(
    '019b3000-0000-7000-8000-000000000003', '019b3000-0000-7000-8000-000000000023',
    'test_bench', 'Banco inclinado',
    'e0000000-0000-4000-8000-000000000017', '019b3000-0000-7000-8000-000000000617',
    decode(repeat('61', 32), 'hex')
  ) $$,
  '55000', null,
  'an archived code returns only under the name it had'
);

select is(
  (select result->>'status' from catalog.publish_global_equipment(
    '019b3000-0000-7000-8000-000000000003', '019b3000-0000-7000-8000-000000000023',
    'test_bench', 'Banco plano',
    'e0000000-0000-4000-8000-000000000018', '019b3000-0000-7000-8000-000000000618',
    decode(repeat('62', 32), 'hex')
  )),
  'published',
  'and under that name it is published again'
);

select throws_ok(
  $$ delete from catalog.equipment where code = 'test_barbell' $$,
  '55000', null,
  'a global equipment row is never deleted'
);

-- ---------------------------------------------------------------------------
-- The curator's read
-- ---------------------------------------------------------------------------

select is(
  catalog.list_global_catalog(
    '019b3000-0000-7000-8000-000000000003', '019b3000-0000-7000-8000-000000000023'
  )->>'equipment_availability',
  'available',
  'equipment is no longer declared absent'
);

select ok(
  (select count(*) >= 2
   from jsonb_array_elements(
     catalog.list_global_catalog(
       '019b3000-0000-7000-8000-000000000003', '019b3000-0000-7000-8000-000000000023'
     )->'equipment'
   ) as entry
   where entry->>'code' in ('test_barbell', 'test_bench')),
  'the curator reads the equipment it published'
);

-- ---------------------------------------------------------------------------
-- The policies: the platform writes global rows, nobody else
-- ---------------------------------------------------------------------------

select catalog.archive_global_equipment(
  '019b3000-0000-7000-8000-000000000003', '019b3000-0000-7000-8000-000000000023',
  'test_bench',
  'e0000000-0000-4000-8000-000000000019', '019b3000-0000-7000-8000-000000000619',
  decode(repeat('63', 32), 'hex')
);

set local role allfit_owner;

select is(
  (select count(*)::integer from catalog.equipment where code = 'test_bench'),
  1,
  'a support actor reads archived global equipment'
);

select lives_ok(
  $$ insert into catalog.equipment (code, name, content_scope, status)
     values ('test_platform_row', 'Fila de plataforma', 'global', 'draft') $$,
  'and writes a global row'
);

select throws_ok(
  $$ insert into catalog.equipment (code, name, content_scope, owner_organization_id, status)
     values (null, 'Fila de un gimnasio', 'organization',
       '019b3000-0000-7000-8000-000000000301', 'published') $$,
  '42501', null,
  'but never a gym''s row'
);

select set_config('app.actor_kind', 'person', true),
       set_config('app.actor_person_id', '019b3000-0000-7000-8000-000000000004', true);

select is(
  (select count(*)::integer from catalog.equipment where code = 'test_bench'),
  0,
  'a person reads only published equipment'
);

select throws_ok(
  $$ insert into catalog.equipment (code, name, content_scope, status)
     values ('test_rogue', 'Intrusa', 'global', 'published') $$,
  '42501', null,
  'and a person writes no global equipment'
);

select throws_ok(
  format($$ insert into catalog.movement_equipment (movement_id, equipment_id, requirement)
     select %L, id, 'optional' from catalog.equipment where code = 'test_barbell' $$,
    (select id from press)),
  '42501', null,
  'nor links equipment to a global movement'
);

reset role;

select ok(
  has_function_privilege(
    'allfit_api', 'catalog.set_global_movement_equipment(uuid, uuid, uuid, jsonb, uuid, uuid, bytea)',
    'execute'
  ) and not has_function_privilege(
    'allfit_api', 'catalog.global_catalog_equipment_projection(uuid)', 'execute'
  ),
  'the runtime role calls the commands, never the projection'
);

select * from finish();

rollback;
