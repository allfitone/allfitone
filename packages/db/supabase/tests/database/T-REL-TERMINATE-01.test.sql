-- T-REL-TERMINATE-01 — OP-REL-008.
--
-- Terminar una relación desde la organización.
--
-- La aserción que pesa es la del congelado. Terminar no borra lo que el
-- gimnasio vio: cada permiso pasa a `frozen` con el mismo instante `T`, de modo
-- que conserva el histórico hasta ahí y no recibe nada posterior. Y congelar no
-- es revocar — un permiso que la persona ya había revocado sigue revocado,
-- porque revocar es lo más fuerte de los dos y esto no puede ablandarlo.
--
-- La segunda es que `T` es uno solo. `clock_timestamp()` se mueve dentro de una
-- transacción, así que leerlo por sentencia cerraría la relación en un instante,
-- los permisos en otro y las asignaciones en un tercero: tres respuestas a
-- «cuándo paró esto», y la que importa es contra la que se mide un caso de
-- acceso histórico.
--
-- La tercera es quién: el catálogo dice que un coach **no** puede ejecutarla.
--
-- The last three look at what the relationship managed: the program the gym
-- gave the person is detached at the same `T` — its management period closes,
-- what she trained stays trained and what was ahead pauses (ADR-019).

begin;

select plan(21);

insert into identity.people (id, given_name, family_name, status, contact_email)
values
  ('019c9300-0000-7000-8000-000000000001', 'Ana', 'Cliente', 'active', 'ana@example.test'),
  ('019c9300-0000-7000-8000-000000000002', 'Bruno', 'Cliente', 'active', null),
  ('019c9300-0000-7000-8000-000000000011', 'Olivia', 'Owner', 'active', null),
  ('019c9300-0000-7000-8000-000000000012', 'Camilo', 'Coach', 'active', null),
  ('019c9300-0000-7000-8000-000000000013', 'Diana', 'Coach', 'active', null),
  ('019c9300-0000-7000-8000-000000000014', 'Sara', 'Staff', 'active', null),
  ('019c9300-0000-7000-8000-000000000015', 'Elena', 'Ajena', 'active', null);

insert into organizations.organizations (id, type_code, display_name, responsible_party)
values
  ('019c9300-0000-7000-8000-000000000101', 'gym', 'State Gym',
    '{"party_kind":"legal_entity","party_name":"State SAS","purpose":"studio_operations"}'),
  ('019c9300-0000-7000-8000-000000000102', 'gym', 'Otro Gym',
    '{"party_kind":"legal_entity","party_name":"Otro SAS","purpose":"studio_operations"}');

insert into organizations.organization_memberships (id, organization_id, person_id, status)
values
  ('019c9300-0000-7000-8000-000000000201', '019c9300-0000-7000-8000-000000000101',
    '019c9300-0000-7000-8000-000000000011', 'active'),
  ('019c9300-0000-7000-8000-000000000202', '019c9300-0000-7000-8000-000000000101',
    '019c9300-0000-7000-8000-000000000012', 'active'),
  ('019c9300-0000-7000-8000-000000000203', '019c9300-0000-7000-8000-000000000101',
    '019c9300-0000-7000-8000-000000000013', 'active'),
  ('019c9300-0000-7000-8000-000000000204', '019c9300-0000-7000-8000-000000000101',
    '019c9300-0000-7000-8000-000000000014', 'active'),
  ('019c9300-0000-7000-8000-000000000205', '019c9300-0000-7000-8000-000000000102',
    '019c9300-0000-7000-8000-000000000015', 'active');

insert into organizations.membership_roles (membership_id, role_code)
values
  ('019c9300-0000-7000-8000-000000000201', 'owner'),
  ('019c9300-0000-7000-8000-000000000202', 'coach'),
  ('019c9300-0000-7000-8000-000000000203', 'coach'),
  ('019c9300-0000-7000-8000-000000000204', 'staff'),
  ('019c9300-0000-7000-8000-000000000205', 'owner');

-- Versión 2 a propósito: el criterio 2 pide la versión en que se concedió, y
-- una versión 1 pasaría igual si la función devolviera un literal.
insert into privacy.scope_definitions (id, scope_code, version_number, status, published_at)
values ('019c9300-0000-7000-8000-000000000301', 'health_context', 2, 'published', clock_timestamp());

insert into relationships.service_relationships (id, person_id, organization_id, status)
values
  ('019c9300-0000-7000-8000-000000000701', '019c9300-0000-7000-8000-000000000001',
    '019c9300-0000-7000-8000-000000000101', 'active'),
  -- Bruno no tiene responsable: el caso que la pantalla de AFO-128 necesita
  -- distinguir antes de asignar.
  ('019c9300-0000-7000-8000-000000000702', '019c9300-0000-7000-8000-000000000002',
    '019c9300-0000-7000-8000-000000000101', 'active');

insert into relationships.relationship_professional_assignments (
  id, relationship_id, person_id, organization_id, membership_id, kind, status
) values (
  '019c9300-0000-7000-8000-000000000801', '019c9300-0000-7000-8000-000000000701',
  '019c9300-0000-7000-8000-000000000001', '019c9300-0000-7000-8000-000000000101',
  '019c9300-0000-7000-8000-000000000202', 'holder', 'active'
);

insert into relationships.relationship_professional_assignments (
  id, relationship_id, person_id, organization_id, membership_id,
  covers_membership_id, kind, status, ends_on
) values (
  '019c9300-0000-7000-8000-000000000802', '019c9300-0000-7000-8000-000000000701',
  '019c9300-0000-7000-8000-000000000001', '019c9300-0000-7000-8000-000000000101',
  '019c9300-0000-7000-8000-000000000203',
  -- A cover stands in for a particular holder, and says which.
  '019c9300-0000-7000-8000-000000000202', 'substitute', 'proposed',
  (clock_timestamp() + interval '10 days')::date
);

-- La cadena que un grant exige: invitación, intención, opción y decisión.
insert into identity.invitations (
  id, organization_id, issued_by_membership_id, channel, contact,
  token_hash, token_key_version, proposal_hash, responsible_party, status, expires_at
) values (
  '019c9300-0000-7000-8000-000000000401', '019c9300-0000-7000-8000-000000000101',
  '019c9300-0000-7000-8000-000000000201', 'email', 'ana@example.test',
  extensions.digest('state-token', 'sha256'), 1,
  extensions.digest('state-proposal', 'sha256'),
  '{"party_kind":"legal_entity","party_name":"State SAS","purpose":"studio_operations"}',
  'completed', clock_timestamp() + interval '7 days'
);

insert into identity.invitation_intents (id, invitation_id, kind, status, proposed_role_code)
values ('019c9300-0000-7000-8000-000000000501', '019c9300-0000-7000-8000-000000000401',
  'service_relationship', 'pending', null);

insert into privacy.invitation_scope_options (
  id, invitation_intent_id, scope_definition_id, scope_code,
  offered_access_level, purpose, presented_snapshot, decision, decided_at
) values (
  '019c9300-0000-7000-8000-000000000601', '019c9300-0000-7000-8000-000000000501',
  '019c9300-0000-7000-8000-000000000301', 'health_context', 'read',
  'Adaptar el entrenamiento', '{"title":"Contexto de salud"}'::jsonb,
  'accepted', clock_timestamp()
);

insert into privacy.consent_events (
  id, person_id, relationship_id, organization_id, invitation_scope_option_id,
  scope_definition_id, scope_code, decision, presented_snapshot
) values (
  '019c9300-0000-7000-8000-000000000901', '019c9300-0000-7000-8000-000000000001',
  '019c9300-0000-7000-8000-000000000701', '019c9300-0000-7000-8000-000000000101',
  '019c9300-0000-7000-8000-000000000601', '019c9300-0000-7000-8000-000000000301',
  'health_context', 'accepted', '{"title":"Contexto de salud"}'::jsonb
);

insert into privacy.data_grants (
  id, person_id, relationship_id, organization_id, scope_definition_id, scope_code,
  consent_event_id, access_level, purpose
) values (
  '019c9300-0000-7000-8000-000000000a01', '019c9300-0000-7000-8000-000000000001',
  '019c9300-0000-7000-8000-000000000701', '019c9300-0000-7000-8000-000000000101',
  '019c9300-0000-7000-8000-000000000301', 'health_context',
  '019c9300-0000-7000-8000-000000000901', 'read', 'Adaptar el entrenamiento'
);

-- Un segundo permiso que la persona ya había revocado. Revocar es más fuerte
-- que congelar, y terminar la relación no puede ablandarlo.
insert into privacy.scope_definitions (id, scope_code, version_number, status, published_at)
values ('019c9300-0000-7000-8000-000000000302', 'body_progress', 1, 'published', clock_timestamp());

insert into privacy.invitation_scope_options (
  id, invitation_intent_id, scope_definition_id, scope_code,
  offered_access_level, purpose, presented_snapshot, decision, decided_at
) values (
  '019c9300-0000-7000-8000-000000000602', '019c9300-0000-7000-8000-000000000501',
  '019c9300-0000-7000-8000-000000000302', 'body_progress', 'read',
  'Seguir el progreso', '{"title":"Progreso corporal"}'::jsonb,
  'accepted', clock_timestamp()
);

insert into privacy.consent_events (
  id, person_id, relationship_id, organization_id, invitation_scope_option_id,
  scope_definition_id, scope_code, decision, presented_snapshot
) values (
  '019c9300-0000-7000-8000-000000000902', '019c9300-0000-7000-8000-000000000001',
  '019c9300-0000-7000-8000-000000000701', '019c9300-0000-7000-8000-000000000101',
  '019c9300-0000-7000-8000-000000000602', '019c9300-0000-7000-8000-000000000302',
  'body_progress', 'accepted', '{"title":"Progreso corporal"}'::jsonb
);

insert into privacy.data_grants (
  id, person_id, relationship_id, organization_id, scope_definition_id, scope_code,
  consent_event_id, access_level, purpose, status, revoked_at
) values (
  '019c9300-0000-7000-8000-000000000a02', '019c9300-0000-7000-8000-000000000001',
  '019c9300-0000-7000-8000-000000000701', '019c9300-0000-7000-8000-000000000101',
  '019c9300-0000-7000-8000-000000000302', 'body_progress',
  '019c9300-0000-7000-8000-000000000902', 'read', 'Seguir el progreso',
  'revoked', clock_timestamp() - interval '1 day'
);

-- A program the gym gave Ana through this relationship: one session done, one ahead.
insert into planning.session_templates (id, content_scope, owner_organization_id, author_person_id, discipline_code, status)
values ('019c9300-0000-7000-8000-000000000b01', 'organization', '019c9300-0000-7000-8000-000000000101', '019c9300-0000-7000-8000-000000000012', 'test_strength', 'published');
insert into planning.programs (id, content_scope, owner_organization_id, author_person_id, status)
values ('019c9300-0000-7000-8000-000000000b02', 'organization', '019c9300-0000-7000-8000-000000000101', '019c9300-0000-7000-8000-000000000012', 'published');
select set_config('app.planning_publication', 'true', true);
insert into planning.session_template_versions (id, template_id, version_number, discipline_code, activity_type_id, title, content_hash)
values ('019c9300-0000-7000-8000-000000000b03', '019c9300-0000-7000-8000-000000000b01', 1, 'test_strength', '019c0000-0000-7000-8000-000000000011', 'Fuerza', decode(repeat('c1', 32), 'hex'));
insert into planning.program_versions (id, program_id, version_number, title, content_hash)
values ('019c9300-0000-7000-8000-000000000b04', '019c9300-0000-7000-8000-000000000b02', 1, 'Bloque', decode(repeat('c2', 32), 'hex'));
select set_config('app.planning_publication', '', true);
insert into planning.program_assignments (id, person_id, program_version_id, origin_relationship_id, lifecycle, starts_on, timezone, display_order)
values ('019c9300-0000-7000-8000-000000000b05', '019c9300-0000-7000-8000-000000000001', '019c9300-0000-7000-8000-000000000b04', '019c9300-0000-7000-8000-000000000701', 'active', current_date - 7, 'UTC', 0);
insert into planning.assignment_management_periods (assignment_id, person_id, relationship_id, started_at)
values ('019c9300-0000-7000-8000-000000000b05', '019c9300-0000-7000-8000-000000000001', '019c9300-0000-7000-8000-000000000701', clock_timestamp() - interval '7 days');
insert into planning.planned_sessions (id, assignment_id, person_id, template_version_id, scheduled_at, timezone, status, week_starts_on, program_day)
values
  ('019c9300-0000-7000-8000-000000000b06', '019c9300-0000-7000-8000-000000000b05', '019c9300-0000-7000-8000-000000000001', '019c9300-0000-7000-8000-000000000b03', clock_timestamp() - interval '3 days', 'UTC', 'completed',
   date_trunc('week', clock_timestamp() - interval '3 days')::date, 1),
  ('019c9300-0000-7000-8000-000000000b07', '019c9300-0000-7000-8000-000000000b05', '019c9300-0000-7000-8000-000000000001', '019c9300-0000-7000-8000-000000000b03', clock_timestamp() + interval '3 days', 'UTC', 'scheduled',
   date_trunc('week', clock_timestamp() + interval '3 days')::date, 1);

set local role allfit_owner;

select set_config('app.actor_kind', 'person', true),
       set_config('app.actor_person_id', '019c9300-0000-7000-8000-000000000012', true),
       set_config('app.actor_org_id', '019c9300-0000-7000-8000-000000000101', true),
       set_config('app.request_id', gen_random_uuid()::text, true);

-- ———————————————————————————————————— Quién no puede

-- El catálogo: «un coach no puede ejecutar esta operación».
select throws_ok(
  $q$select * from relationships.terminate_relationship(
    '019c9300-0000-7000-8000-000000000012', '019c9300-0000-7000-8000-000000000101',
    '019c9300-0000-7000-8000-000000000701', null,
    '019c9300-0000-7000-8000-000000000f01', '019c9300-0000-7000-8000-000000000f01',
    extensions.digest('end-coach', 'sha256'))$q$,
  '42501', null,
  'el coach responsable no puede terminar la relación'
);

select set_config('app.actor_person_id', '019c9300-0000-7000-8000-000000000014', true);

select throws_ok(
  $q$select * from relationships.terminate_relationship(
    '019c9300-0000-7000-8000-000000000014', '019c9300-0000-7000-8000-000000000101',
    '019c9300-0000-7000-8000-000000000701', null,
    '019c9300-0000-7000-8000-000000000f02', '019c9300-0000-7000-8000-000000000f02',
    extensions.digest('end-staff', 'sha256'))$q$,
  '42501', null,
  'el staff tampoco'
);

select set_config('app.actor_person_id', '019c9300-0000-7000-8000-000000000015', true),
       set_config('app.actor_org_id', '019c9300-0000-7000-8000-000000000102', true);

select throws_ok(
  $q$select * from relationships.terminate_relationship(
    '019c9300-0000-7000-8000-000000000015', '019c9300-0000-7000-8000-000000000102',
    '019c9300-0000-7000-8000-000000000701', null,
    '019c9300-0000-7000-8000-000000000f03', '019c9300-0000-7000-8000-000000000f03',
    extensions.digest('end-tenant', 'sha256'))$q$,
  'P0002', null,
  'el owner de otra organización no encuentra la relación'
);

-- ———————————————————————————————————— El owner la termina

select set_config('app.actor_person_id', '019c9300-0000-7000-8000-000000000011', true),
       set_config('app.actor_org_id', '019c9300-0000-7000-8000-000000000101', true);

select is(
  (select frozen_grants from relationships.terminate_relationship(
    '019c9300-0000-7000-8000-000000000011', '019c9300-0000-7000-8000-000000000101',
    '019c9300-0000-7000-8000-000000000701', '  Se mudó de ciudad  ',
    '019c9300-0000-7000-8000-000000000f04', '019c9300-0000-7000-8000-000000000f04',
    extensions.digest('end-ok', 'sha256'))),
  1,
  'congela el permiso que seguía activo, y solo ese'
);

select is(
  (select status::text from relationships.service_relationships
   where id = '019c9300-0000-7000-8000-000000000701'),
  'terminated',
  'la relación queda terminada'
);

-- El motivo llega con espacios de sobra y la columna no admite uno en blanco.
select is(
  (select ended_reason from relationships.service_relationships
   where id = '019c9300-0000-7000-8000-000000000701'),
  'Se mudó de ciudad',
  'el motivo se guarda recortado'
);

/*
 * `professional`, no `person`. La pantalla de historia decide con esta columna
 * de quién fue la decisión, así que escribir `person` haría que el historial de
 * la clienta dijera que ella terminó lo que terminó el gimnasio.
 */
select is(
  (select ended_by_kind::text from relationships.service_relationships
   where id = '019c9300-0000-7000-8000-000000000701'),
  'professional',
  'y queda registrado que lo terminó la organización, no la persona'
);

-- ———————————————————————————————————— Un solo instante

/*
 * `clock_timestamp()` se mueve dentro de una transacción. Si se leyera por
 * sentencia, la relación, el permiso y las asignaciones pararían en tres
 * momentos distintos — y el que importa es contra el que se mide un caso de
 * acceso histórico.
 */
select is(
  (select count(distinct moment)::int from (
     select ended_at as moment from relationships.service_relationships
      where id = '019c9300-0000-7000-8000-000000000701'
     union
     select frozen_at from privacy.data_grants
      where id = '019c9300-0000-7000-8000-000000000a01'
     union
     select valid_to from relationships.relationship_professional_assignments
      where id = '019c9300-0000-7000-8000-000000000801'
   ) as instants),
  1,
  'la relación, el permiso y la asignación paran en el mismo instante'
);

-- ———————————————————————————————————— Congelar no es revocar

select is(
  (select status::text from privacy.data_grants
   where id = '019c9300-0000-7000-8000-000000000a01'),
  'frozen',
  'el permiso activo queda congelado, no revocado'
);

select is(
  (select status::text from privacy.data_grants
   where id = '019c9300-0000-7000-8000-000000000a02'),
  'revoked',
  'y el que la persona había revocado sigue revocado: congelar no lo ablanda'
);

select ok(
  (select revoked_at from privacy.data_grants
   where id = '019c9300-0000-7000-8000-000000000a02')
    < (select ended_at from relationships.service_relationships
       where id = '019c9300-0000-7000-8000-000000000701'),
  'con su propia fecha de revocación intacta'
);

-- ———————————————————————————————————— Las asignaciones

select is(
  (select count(*)::int from relationships.relationship_professional_assignments
   where relationship_id = '019c9300-0000-7000-8000-000000000701'
     and status = 'ended'),
  1,
  'el titular queda cerrado'
);

/*
 * La suplencia que nadie respondió se queda como está, y no es un descuido:
 * `ck_relationship_professional_assignments_accepted` solo deja salir de
 * `proposed` a una suplencia con aceptación, así que no tiene otro estado al
 * que ir. Y no concede nada — la aserción siguiente lo demuestra — así que la
 * fila es desprolija, no peligrosa.
 */
select is(
  (select status::text from relationships.relationship_professional_assignments
   where id = '019c9300-0000-7000-8000-000000000802'),
  'proposed',
  'la suplencia que nadie respondió se queda como está'
);

select set_config('app.actor_person_id', '019c9300-0000-7000-8000-000000000013', true);

select ok(
  not relationships.actor_is_assigned('019c9300-0000-7000-8000-000000000701'),
  'y sigue sin conceder nada a quien iba a cubrir'
);

select set_config('app.actor_person_id', '019c9300-0000-7000-8000-000000000012', true);

select ok(
  not relationships.actor_is_assigned('019c9300-0000-7000-8000-000000000701'),
  'y el que era titular deja de leer la relación'
);

-- ———————————————————————————————————— El aviso

/*
 * Escrito dentro de la misma transacción, así que no hay camino donde la
 * relación termine y a la persona no se le diga. Lleva las palabras y no los
 * ids, porque leerlos al entregar exigiría ampliar las políticas que mantienen
 * al worker fuera de personas y relaciones.
 */
select set_config('app.actor_person_id', '019c9300-0000-7000-8000-000000000011', true);

select is(
  (select count(*)::int from system.outbox_events
   where event_type = 'relationship.terminated.v1'
     and aggregate_id = '019c9300-0000-7000-8000-000000000701'),
  1,
  'a la persona se le avisa dentro de la misma transacción'
);

select is(
  (select payload ->> 'organization_name' from system.outbox_events
   where event_type = 'relationship.terminated.v1'
     and aggregate_id = '019c9300-0000-7000-8000-000000000701'),
  'State Gym',
  'y el aviso lleva las palabras, no ids que el worker no podría leer'
);

-- ———————————————————————————————————— Converge

select is(
  (select replayed from relationships.terminate_relationship(
    '019c9300-0000-7000-8000-000000000011', '019c9300-0000-7000-8000-000000000101',
    '019c9300-0000-7000-8000-000000000701', null,
    '019c9300-0000-7000-8000-000000000f05', '019c9300-0000-7000-8000-000000000f05',
    extensions.digest('end-again', 'sha256'))),
  true,
  'terminar lo ya terminado converge en vez de fallar'
);

-- ———————————————————————————————————— What the gym managed is detached

reset role;

select is(
  (select lifecycle::text from planning.program_assignments where id = '019c9300-0000-7000-8000-000000000b05'),
  'detached_pending_choice',
  'the program the gym managed waits for the person to choose, and is not deleted'
);

select is(
  (select row(period.end_reason, period.ended_at = relationship.ended_at)::text
     from planning.assignment_management_periods as period
     join relationships.service_relationships as relationship on relationship.id = period.relationship_id
    where period.assignment_id = '019c9300-0000-7000-8000-000000000b05'),
  row('relationship_ended', true)::text,
  'its management period closes at the same instant T'
);

select is(
  (select array_agg(status order by scheduled_at) from planning.planned_sessions
    where assignment_id = '019c9300-0000-7000-8000-000000000b05'),
  array['completed', 'paused'],
  'what she trained stays trained and what was ahead pauses'
);

select * from finish();
rollback;
