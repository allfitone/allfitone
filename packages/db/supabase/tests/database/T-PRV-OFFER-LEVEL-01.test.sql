-- T-PRV-OFFER-LEVEL-01 — IX-06: lo que se ofrece cabe en lo publicado (HU-BO-024, propuesta C).
--
-- Una invitación podía pedir «aportar» en cualquier permiso, incluso en uno cuyas reglas
-- publicadas son todas de lectura. No daba acceso extra, porque ninguna política lo usa,
-- pero la persona aceptaba algo que decía más de lo que era, y quedaba guardado así.
--
-- Lo publicado solo puede restringir lo que se ofrece, nunca abrirlo: pedir lectura sigue
-- siendo posible en cualquier versión publicada, con o sin reglas.
--
-- Una oferta ya enviada antes de esta regla se sigue pudiendo responder. La regla mira
-- lo que se ofrece al crearla o cambiarla, no la respuesta de la persona.

begin;

select plan(9);

insert into identity.people (id, given_name, family_name, status)
values ('019b2900-0000-7000-8000-000000000001', 'Olivia', 'Owner', 'active');

insert into organizations.organizations (id, type_code, display_name, responsible_party)
values (
  '019b2900-0000-7000-8000-000000000101', 'gym', 'Nivel Gym',
  '{"party_kind":"legal_entity","party_name":"Nivel SAS","purpose":"studio_operations"}'
);

insert into organizations.organization_memberships (id, organization_id, person_id, status)
values ('019b2900-0000-7000-8000-000000000201', '019b2900-0000-7000-8000-000000000101',
  '019b2900-0000-7000-8000-000000000001', 'active');

insert into organizations.membership_roles (membership_id, role_code)
values ('019b2900-0000-7000-8000-000000000201', 'owner');

-- Rules can only be written while a version is a draft, so each one is drafted,
-- given its rules, and then published, which is the order curation follows.
insert into privacy.scope_definitions (id, scope_code, version_number, status)
values
  ('019b2900-0000-7000-8000-000000000301', 'relationship_training', 1, 'draft'),
  ('019b2900-0000-7000-8000-000000000302', 'nutrition_intake', 1, 'draft'),
  ('019b2900-0000-7000-8000-000000000303', 'health_context', 1, 'draft'),
  ('019b2900-0000-7000-8000-000000000304', 'body_progress', 1, 'draft');

insert into privacy.scope_resource_rules (
  scope_definition_id, resource, field, data_classification_code, max_action, is_excluded
) values
  ('019b2900-0000-7000-8000-000000000301', 'planning.program_assignments', '*', 'training', 'contribute', false),
  ('019b2900-0000-7000-8000-000000000301', 'execution.executed_sessions', '*', 'training', 'read', false),
  ('019b2900-0000-7000-8000-000000000302', 'nutrition.meal_logs', '*', 'nutrition', 'read', false),
  -- An excluded rule names what the scope does not reach; its level grants nothing.
  ('019b2900-0000-7000-8000-000000000303', 'health.health_declarations', '*', 'health', 'read', false),
  ('019b2900-0000-7000-8000-000000000303', 'health.recovery_notes', '*', 'health', 'contribute', true);

update privacy.scope_definitions
   set status = 'published', published_at = clock_timestamp()
 where id in (
   '019b2900-0000-7000-8000-000000000301', '019b2900-0000-7000-8000-000000000302',
   '019b2900-0000-7000-8000-000000000303', '019b2900-0000-7000-8000-000000000304'
 );

insert into identity.invitations (
  id, organization_id, issued_by_membership_id, channel, contact,
  token_hash, token_key_version, proposal_hash, responsible_party,
  status, expires_at
) values (
  '019b2900-0000-7000-8000-000000000401', '019b2900-0000-7000-8000-000000000101',
  '019b2900-0000-7000-8000-000000000201', 'email', 'nivel@example.test',
  extensions.digest('token', 'sha256'), 1, extensions.digest('proposal', 'sha256'),
  '{"party_kind":"legal_entity","party_name":"Nivel SAS","purpose":"studio_operations"}',
  'pending', clock_timestamp() + interval '7 days'
);

insert into identity.invitation_intents (id, invitation_id, kind, status)
values ('019b2900-0000-7000-8000-000000000501', '019b2900-0000-7000-8000-000000000401',
  'service_relationship', 'pending');

-- The training scope publishes a contribute rule, so asking to contribute is honest.
select lives_ok(
  $$insert into privacy.invitation_scope_options (
      invitation_intent_id, scope_definition_id, scope_code,
      offered_access_level, purpose, presented_snapshot
    ) values (
      '019b2900-0000-7000-8000-000000000501', '019b2900-0000-7000-8000-000000000301',
      'relationship_training', 'contribute', 'Prescribir tu entrenamiento', '{}'::jsonb
    )$$,
  'aportar se ofrece donde la versión publicada tiene una regla de aportar'
);

-- What the person's meals say is hers alone: every published rule is read.
select throws_ok(
  $$insert into privacy.invitation_scope_options (
      invitation_intent_id, scope_definition_id, scope_code,
      offered_access_level, purpose, presented_snapshot
    ) values (
      '019b2900-0000-7000-8000-000000000501', '019b2900-0000-7000-8000-000000000302',
      'nutrition_intake', 'contribute', 'Entender tu alimentación', '{}'::jsonb
    )$$,
  '23514',
  'IX-06 the published scope version admits no contribute',
  'aportar no se ofrece donde todas las reglas publicadas son de lectura'
);

select lives_ok(
  $$insert into privacy.invitation_scope_options (
      id, invitation_intent_id, scope_definition_id, scope_code,
      offered_access_level, purpose, presented_snapshot
    ) values (
      '019b2900-0000-7000-8000-000000000602',
      '019b2900-0000-7000-8000-000000000501', '019b2900-0000-7000-8000-000000000302',
      'nutrition_intake', 'read', 'Entender tu alimentación', '{}'::jsonb
    )$$,
  'y leer sí, en el mismo permiso'
);

-- Raising an offer after it was written is the same offer made again.
select throws_ok(
  $$update privacy.invitation_scope_options
       set offered_access_level = 'contribute'
     where id = '019b2900-0000-7000-8000-000000000602'$$,
  '23514',
  'IX-06 the published scope version admits no contribute',
  'subir una oferta de lectura a aportar se rechaza igual'
);

select throws_ok(
  $$insert into privacy.invitation_scope_options (
      invitation_intent_id, scope_definition_id, scope_code,
      offered_access_level, purpose, presented_snapshot
    ) values (
      '019b2900-0000-7000-8000-000000000501', '019b2900-0000-7000-8000-000000000303',
      'health_context', 'contribute', 'Adaptar los ejercicios', '{}'::jsonb
    )$$,
  '23514',
  'IX-06 the published scope version admits no contribute',
  'una regla excluida no cuenta como regla de aportar'
);

select throws_ok(
  $$insert into privacy.invitation_scope_options (
      invitation_intent_id, scope_definition_id, scope_code,
      offered_access_level, purpose, presented_snapshot
    ) values (
      '019b2900-0000-7000-8000-000000000501', '019b2900-0000-7000-8000-000000000304',
      'body_progress', 'contribute', 'Seguir tu progreso', '{}'::jsonb
    )$$,
  '23514',
  'IX-06 the published scope version admits no contribute',
  'una versión sin reglas no admite aportar'
);

-- Restricting never opens: a version with no rules still takes a read offer, as before.
select lives_ok(
  $$insert into privacy.invitation_scope_options (
      invitation_intent_id, scope_definition_id, scope_code,
      offered_access_level, purpose, presented_snapshot
    ) values (
      '019b2900-0000-7000-8000-000000000501', '019b2900-0000-7000-8000-000000000304',
      'body_progress', 'read', 'Seguir tu progreso', '{}'::jsonb
    )$$,
  'leer se sigue ofreciendo en una versión sin reglas'
);

-- An offer written before this rule existed. Replica mode skips the triggers, which is
-- the only way to put back a row the rule now refuses.
set local session_replication_role = replica;
insert into privacy.invitation_scope_options (
  id, invitation_intent_id, scope_definition_id, scope_code,
  offered_access_level, purpose, presented_snapshot
) values (
  '019b2900-0000-7000-8000-000000000603',
  '019b2900-0000-7000-8000-000000000501', '019b2900-0000-7000-8000-000000000303',
  'health_context', 'contribute', 'Adaptar los ejercicios', '{}'::jsonb
);
set local session_replication_role = origin;

select lives_ok(
  $$update privacy.invitation_scope_options
       set decision = 'accepted', decided_at = clock_timestamp()
     where id = '019b2900-0000-7000-8000-000000000603'$$,
  'una oferta enviada antes de la regla se sigue pudiendo responder'
);

select is(
  (select count(*)::int from privacy.invitation_scope_options
   where invitation_intent_id = '019b2900-0000-7000-8000-000000000501'),
  4,
  'solo quedaron las ofertas que caben en lo publicado, y la anterior a la regla'
);

select * from finish();
rollback;
