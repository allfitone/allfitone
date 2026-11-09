-- T-REL-CARD-01 — OP-REL-019, the card of a client the coach attends (HU-STUDIO-083).
--
-- The card is an index: who she is, the link, how he attends her, and the categories
-- she shares, each of which is then read through its own audited operation.
--
--   · Only the holder or an accepted cover in force opens it; being owner, admin, staff
--     or another coach is the same "not found" as a person who does not exist.
--   · What she never shared appears nowhere, not as empty and not as locked.
--   · What she withdrew is said, with when, so he knows why it stopped (HU-STUDIO-084).
--   · Opening it reads no fitness data, so it writes no access event.
begin;

select plan(19);

insert into identity.people (id, given_name, family_name, status)
values
  ('019ae200-0000-7000-8000-000000000001', 'Ana', 'Client', 'active'),
  ('019ae200-0000-7000-8000-000000000002', 'Bea', 'Client', 'active'),
  ('019ae200-0000-7000-8000-000000000003', 'Ciro', 'Client', 'active'),
  ('019ae200-0000-7000-8000-000000000011', 'Olivia', 'Owner', 'active'),
  ('019ae200-0000-7000-8000-000000000012', 'Camilo', 'Coach', 'active'),
  ('019ae200-0000-7000-8000-000000000013', 'Diana', 'Coach', 'active'),
  ('019ae200-0000-7000-8000-000000000014', 'Sara', 'Staff', 'active'),
  ('019ae200-0000-7000-8000-000000000015', 'Nora', 'Nobody', 'active'),
  ('019ae200-0000-7000-8000-000000000016', 'Gina', 'Admin', 'active');

insert into organizations.organizations (id, type_code, display_name, responsible_party)
values ('019ae200-0000-7000-8000-000000000101', 'gym', 'Card Gym',
  '{"party_kind":"legal_entity","party_name":"Card SAS","purpose":"studio_operations"}');

insert into organizations.organization_memberships (id, organization_id, person_id, status)
values
  ('019ae200-0000-7000-8000-000000000211', '019ae200-0000-7000-8000-000000000101', '019ae200-0000-7000-8000-000000000011', 'active'),
  ('019ae200-0000-7000-8000-000000000212', '019ae200-0000-7000-8000-000000000101', '019ae200-0000-7000-8000-000000000012', 'active'),
  ('019ae200-0000-7000-8000-000000000213', '019ae200-0000-7000-8000-000000000101', '019ae200-0000-7000-8000-000000000013', 'active'),
  ('019ae200-0000-7000-8000-000000000214', '019ae200-0000-7000-8000-000000000101', '019ae200-0000-7000-8000-000000000014', 'active'),
  ('019ae200-0000-7000-8000-000000000216', '019ae200-0000-7000-8000-000000000101', '019ae200-0000-7000-8000-000000000016', 'active');

insert into organizations.membership_roles (membership_id, role_code)
values
  ('019ae200-0000-7000-8000-000000000211', 'owner'),
  ('019ae200-0000-7000-8000-000000000212', 'coach'),
  ('019ae200-0000-7000-8000-000000000213', 'coach'),
  ('019ae200-0000-7000-8000-000000000214', 'staff'),
  ('019ae200-0000-7000-8000-000000000216', 'admin');

insert into relationships.service_relationships (id, person_id, organization_id, status, started_at)
values
  ('019ae200-0000-7000-8000-000000000701', '019ae200-0000-7000-8000-000000000001', '019ae200-0000-7000-8000-000000000101', 'active', '2026-09-01T10:00:00Z'),
  ('019ae200-0000-7000-8000-000000000702', '019ae200-0000-7000-8000-000000000002', '019ae200-0000-7000-8000-000000000101', 'active', '2026-09-02T10:00:00Z'),
  ('019ae200-0000-7000-8000-000000000703', '019ae200-0000-7000-8000-000000000003', '019ae200-0000-7000-8000-000000000101', 'active', '2026-09-03T10:00:00Z');

-- Camilo holds Ana and covers Bea for Diana; Diana holds Bea and Ciro.
insert into relationships.relationship_professional_assignments (
  id, relationship_id, person_id, organization_id, membership_id, covers_membership_id,
  kind, status, valid_from, ends_on, accepted_by_person_at
) values
  ('019ae200-0000-7000-8000-000000000801', '019ae200-0000-7000-8000-000000000701', '019ae200-0000-7000-8000-000000000001',
   '019ae200-0000-7000-8000-000000000101', '019ae200-0000-7000-8000-000000000212', null, 'holder', 'active',
   clock_timestamp() - interval '60 days', null, null),
  ('019ae200-0000-7000-8000-000000000802', '019ae200-0000-7000-8000-000000000702', '019ae200-0000-7000-8000-000000000002',
   '019ae200-0000-7000-8000-000000000101', '019ae200-0000-7000-8000-000000000213', null, 'holder', 'active',
   clock_timestamp() - interval '60 days', null, null),
  ('019ae200-0000-7000-8000-000000000803', '019ae200-0000-7000-8000-000000000702', '019ae200-0000-7000-8000-000000000002',
   '019ae200-0000-7000-8000-000000000101', '019ae200-0000-7000-8000-000000000212', '019ae200-0000-7000-8000-000000000213',
   'substitute', 'active', clock_timestamp() - interval '2 days', '2099-01-31', clock_timestamp() - interval '2 days'),
  ('019ae200-0000-7000-8000-000000000804', '019ae200-0000-7000-8000-000000000703', '019ae200-0000-7000-8000-000000000003',
   '019ae200-0000-7000-8000-000000000101', '019ae200-0000-7000-8000-000000000213', null, 'holder', 'active',
   clock_timestamp() - interval '60 days', null, null);

insert into privacy.scope_definitions (id, scope_code, version_number, status)
values
  ('019ae200-0000-7000-8000-000000000301', 'relationship_training', 61, 'draft'),
  ('019ae200-0000-7000-8000-000000000302', 'body_progress', 62, 'draft'),
  ('019ae200-0000-7000-8000-000000000303', 'health_context', 63, 'draft'),
  ('019ae200-0000-7000-8000-000000000304', 'nutrition_media', 64, 'draft'),
  ('019ae200-0000-7000-8000-000000000305', 'nutrition_intake', 65, 'draft'),
  ('019ae200-0000-7000-8000-000000000306', 'prior_training_history', 66, 'draft');
update privacy.scope_definitions set status = 'published', published_at = clock_timestamp()
where id::text like '019ae200-0000-7000-8000-0000000003%';

insert into identity.invitations (
  id, organization_id, issued_by_membership_id, channel, contact,
  token_hash, token_key_version, proposal_hash, responsible_party, status, expires_at
) values
  ('019ae200-0000-7000-8000-000000000401', '019ae200-0000-7000-8000-000000000101',
   '019ae200-0000-7000-8000-000000000211', 'email', 'ana@example.test',
   extensions.digest('card-token-a', 'sha256'), 1, extensions.digest('card-proposal-a', 'sha256'),
   '{"party_kind":"legal_entity","party_name":"Card SAS","purpose":"studio_operations"}',
   'completed', clock_timestamp() + interval '7 days'),
  ('019ae200-0000-7000-8000-000000000402', '019ae200-0000-7000-8000-000000000101',
   '019ae200-0000-7000-8000-000000000211', 'email', 'bea@example.test',
   extensions.digest('card-token-b', 'sha256'), 1, extensions.digest('card-proposal-b', 'sha256'),
   '{"party_kind":"legal_entity","party_name":"Card SAS","purpose":"studio_operations"}',
   'completed', clock_timestamp() + interval '7 days'),
  ('019ae200-0000-7000-8000-000000000403', '019ae200-0000-7000-8000-000000000101',
   '019ae200-0000-7000-8000-000000000211', 'email', 'ana-again@example.test',
   extensions.digest('card-token-c', 'sha256'), 1, extensions.digest('card-proposal-c', 'sha256'),
   '{"party_kind":"legal_entity","party_name":"Card SAS","purpose":"studio_operations"}',
   'completed', clock_timestamp() + interval '7 days');
insert into identity.invitation_intents (id, invitation_id, kind, status)
values
  ('019ae200-0000-7000-8000-000000000501', '019ae200-0000-7000-8000-000000000401', 'service_relationship', 'pending'),
  ('019ae200-0000-7000-8000-000000000502', '019ae200-0000-7000-8000-000000000402', 'service_relationship', 'pending'),
  ('019ae200-0000-7000-8000-000000000503', '019ae200-0000-7000-8000-000000000403', 'service_relationship', 'pending');
insert into privacy.invitation_scope_options (
  id, invitation_intent_id, scope_definition_id, scope_code,
  offered_access_level, purpose, presented_snapshot, decision, decided_at
)
select option, intent, definition, scope, 'read', 'Plan the training', '{"title":"Shared"}'::jsonb,
       decision::privacy.consent_decision, clock_timestamp()
from (values
  ('019ae200-0000-7000-8000-000000000601'::uuid, '019ae200-0000-7000-8000-000000000501'::uuid, '019ae200-0000-7000-8000-000000000301'::uuid, 'relationship_training', 'accepted'),
  ('019ae200-0000-7000-8000-000000000602', '019ae200-0000-7000-8000-000000000501', '019ae200-0000-7000-8000-000000000302', 'body_progress', 'accepted'),
  ('019ae200-0000-7000-8000-000000000603', '019ae200-0000-7000-8000-000000000501', '019ae200-0000-7000-8000-000000000303', 'health_context', 'accepted'),
  ('019ae200-0000-7000-8000-000000000604', '019ae200-0000-7000-8000-000000000501', '019ae200-0000-7000-8000-000000000304', 'nutrition_media', 'accepted'),
  ('019ae200-0000-7000-8000-000000000605', '019ae200-0000-7000-8000-000000000501', '019ae200-0000-7000-8000-000000000305', 'nutrition_intake', 'rejected'),
  ('019ae200-0000-7000-8000-000000000606', '019ae200-0000-7000-8000-000000000501', '019ae200-0000-7000-8000-000000000306', 'prior_training_history', 'accepted'),
  ('019ae200-0000-7000-8000-000000000607', '019ae200-0000-7000-8000-000000000503', '019ae200-0000-7000-8000-000000000306', 'prior_training_history', 'accepted'),
  ('019ae200-0000-7000-8000-000000000611', '019ae200-0000-7000-8000-000000000502', '019ae200-0000-7000-8000-000000000301', 'relationship_training', 'accepted')
) as offered (option, intent, definition, scope, decision);

create function pg_temp.consent(relationship uuid, consent_id uuid, chosen uuid, decision text)
returns void language plpgsql as $$
declare
  subject record;
  offered record;
begin
  select person_id, organization_id into subject
  from relationships.service_relationships where id = relationship;
  select id, scope_definition_id, scope_code into offered
  from privacy.invitation_scope_options where id = chosen;
  insert into privacy.consent_events (
    id, person_id, relationship_id, organization_id, invitation_scope_option_id,
    scope_definition_id, scope_code, decision, presented_snapshot
  ) values (
    consent_id, subject.person_id, relationship, subject.organization_id, offered.id,
    offered.scope_definition_id, offered.scope_code, decision::privacy.consent_decision, '{"title":"Shared"}'::jsonb
  );
  if decision = 'accepted' then
    insert into privacy.data_grants (
      id, person_id, relationship_id, organization_id, scope_definition_id, scope_code,
      consent_event_id, access_level, purpose
    ) values (
      consent_id, subject.person_id, relationship, subject.organization_id,
      offered.scope_definition_id, offered.scope_code, consent_id, 'read', 'Plan the training'
    );
  end if;
end
$$;

-- Ana: training and body shared; health shared and then withdrawn; meal photos shared
-- without the meals themselves; meals refused; her past training withdrawn, then shared again.
select pg_temp.consent('019ae200-0000-7000-8000-000000000701', '019ae200-0000-7000-8000-000000000a01', '019ae200-0000-7000-8000-000000000601', 'accepted');
select pg_temp.consent('019ae200-0000-7000-8000-000000000701', '019ae200-0000-7000-8000-000000000a02', '019ae200-0000-7000-8000-000000000602', 'accepted');
select pg_temp.consent('019ae200-0000-7000-8000-000000000701', '019ae200-0000-7000-8000-000000000a03', '019ae200-0000-7000-8000-000000000603', 'accepted');
select pg_temp.consent('019ae200-0000-7000-8000-000000000701', '019ae200-0000-7000-8000-000000000a04', '019ae200-0000-7000-8000-000000000604', 'accepted');
select pg_temp.consent('019ae200-0000-7000-8000-000000000701', '019ae200-0000-7000-8000-000000000a05', '019ae200-0000-7000-8000-000000000605', 'rejected');
select pg_temp.consent('019ae200-0000-7000-8000-000000000701', '019ae200-0000-7000-8000-000000000a06', '019ae200-0000-7000-8000-000000000606', 'accepted');
update privacy.data_grants set status = 'revoked', revoked_at = '2026-11-03T15:00:00Z'
where id in ('019ae200-0000-7000-8000-000000000a03', '019ae200-0000-7000-8000-000000000a06');
select pg_temp.consent('019ae200-0000-7000-8000-000000000701', '019ae200-0000-7000-8000-000000000a07', '019ae200-0000-7000-8000-000000000607', 'accepted');
select pg_temp.consent('019ae200-0000-7000-8000-000000000702', '019ae200-0000-7000-8000-000000000a11', '019ae200-0000-7000-8000-000000000611', 'accepted');

create function pg_temp.act(person uuid) returns void language plpgsql as $$
begin
  perform set_config('app.actor_kind', 'person', true);
  perform set_config('app.actor_person_id', person::text, true);
  perform set_config('app.actor_org_id', '', true);
  perform set_config('app.actor_membership_id', '', true);
  perform set_config('app.contract_scope_purpose', '', true);
  perform set_config('app.contract_scope_id', '', true);
  perform set_config('app.contract_scope_token', '', true);
end
$$;

set local role allfit_api;

-- Camilo opens Ana's card: he holds her.
select pg_temp.act('019ae200-0000-7000-8000-000000000012');
select relationships.read_client_card(
  '019ae200-0000-7000-8000-000000000012', '019ae200-0000-7000-8000-000000000101',
  '019ae200-0000-7000-8000-000000000001') as ana \gset

select is((:'ana'::jsonb)->>'kind', 'attending', 'the coach who holds her opens her card');

select is(
  (:'ana'::jsonb) - 'sections' - 'withdrawn',
  jsonb_build_object(
    'kind', 'attending',
    'person_id', '019ae200-0000-7000-8000-000000000001',
    'display_name', 'Ana Client',
    'relationship', jsonb_build_object(
      'id', '019ae200-0000-7000-8000-000000000701',
      'started_at', '2026-09-01T10:00:00+00:00'),
    'attendance', jsonb_build_object('role', 'holder', 'ends_on', null)
  ),
  'it says who she is, the link and how he attends her, and nothing about her data'
);

select is(
  (select jsonb_agg(section->>'scope_code') from jsonb_array_elements((:'ana'::jsonb)->'sections') as section),
  '["relationship_training", "prior_training_history", "body_progress"]'::jsonb,
  'the sections are what she shares, in the canonical order'
);

select is(
  ((:'ana'::jsonb)->'sections'->0) - 'granted_at',
  '{"scope_code": "relationship_training", "scope_version": 61, "access_level": "read"}'::jsonb,
  'each section says the version she accepted and at what level'
);

select ok(
  not ((:'ana'::jsonb)->'sections' @> '[{"scope_code": "nutrition_media"}]'),
  'meal photos without the meals appear nowhere: a photo shows nothing on its own'
);

select is(
  (:'ana'::jsonb)->'withdrawn',
  '[{"scope_code": "health_context", "withdrawn_at": "2026-11-03T15:00:00+00:00"}]'::jsonb,
  'what she withdrew is said, with when'
);

select ok(
  not ((:'ana'::jsonb)->'withdrawn' @> '[{"scope_code": "prior_training_history"}]'),
  'a category withdrawn and then shared again is a section, not a withdrawal'
);

select ok(
  not ((:'ana'::jsonb)::text like '%nutrition_intake%'),
  'what she refused appears nowhere, not as withdrawn and not as missing'
);

-- Camilo opens Bea's card: he covers her for Diana.
select is(
  relationships.read_client_card(
    '019ae200-0000-7000-8000-000000000012', '019ae200-0000-7000-8000-000000000101',
    '019ae200-0000-7000-8000-000000000002')->'attendance',
  '{"role": "substitute", "ends_on": "2099-01-31"}'::jsonb,
  'an accepted cover opens the card, and it says until when'
);

select throws_ok(
  $$select relationships.read_client_card(
    '019ae200-0000-7000-8000-000000000012', '019ae200-0000-7000-8000-000000000101',
    '019ae200-0000-7000-8000-000000000003')$$,
  'P0002', 'client not found',
  'a colleague''s client is not found'
);

select throws_ok(
  $$select relationships.read_client_card(
    '019ae200-0000-7000-8000-000000000012', '019ae200-0000-7000-8000-000000000101',
    '019ae200-0000-7000-8000-000000000015')$$,
  'P0002', 'client not found',
  'and neither is somebody who is nobody''s client, with the very same answer'
);

select pg_temp.act('019ae200-0000-7000-8000-000000000011');
select throws_ok(
  $$select relationships.read_client_card(
    '019ae200-0000-7000-8000-000000000011', '019ae200-0000-7000-8000-000000000101',
    '019ae200-0000-7000-8000-000000000001')$$,
  'P0002', 'client not found',
  'the owner does not open a card by being the owner'
);

select pg_temp.act('019ae200-0000-7000-8000-000000000016');
select throws_ok(
  $$select relationships.read_client_card(
    '019ae200-0000-7000-8000-000000000016', '019ae200-0000-7000-8000-000000000101',
    '019ae200-0000-7000-8000-000000000001')$$,
  'P0002', 'client not found',
  'nor the admin'
);

select pg_temp.act('019ae200-0000-7000-8000-000000000014');
select throws_ok(
  $$select relationships.read_client_card(
    '019ae200-0000-7000-8000-000000000014', '019ae200-0000-7000-8000-000000000101',
    '019ae200-0000-7000-8000-000000000001')$$,
  'P0002', 'client not found',
  'nor staff'
);

select pg_temp.act('019ae200-0000-7000-8000-000000000015');
select throws_ok(
  $$select relationships.read_client_card(
    '019ae200-0000-7000-8000-000000000015', '019ae200-0000-7000-8000-000000000101',
    '019ae200-0000-7000-8000-000000000001')$$,
  '42501', 'a live membership is required',
  'somebody outside the organization is refused before anything is looked up'
);

select pg_temp.act('019ae200-0000-7000-8000-000000000012');
select throws_ok(
  $$select relationships.read_client_card(
    '019ae200-0000-7000-8000-000000000013', '019ae200-0000-7000-8000-000000000101',
    '019ae200-0000-7000-8000-000000000003')$$,
  '42501', 'person actor mismatch',
  'nobody opens a card in somebody else''s name'
);

reset role;

select is(
  (select count(*) from privacy.access_events
    where subject_person_id in ('019ae200-0000-7000-8000-000000000001',
                                '019ae200-0000-7000-8000-000000000002')),
  0::bigint,
  'opening a card writes no access event: it reads categories, never data'
);

select ok(
  has_function_privilege('allfit_api',
    'relationships.read_client_card(uuid, uuid, uuid)', 'execute'),
  'the card is an entry point'
);

select ok(
  not has_function_privilege('allfit_api', 'relationships.client_card_grants(uuid)', 'execute')
  and not has_function_privilege('allfit_api',
    'relationships.former_attendance(uuid, uuid, uuid)', 'execute'),
  'its helpers are not'
);

select * from finish();

rollback;
