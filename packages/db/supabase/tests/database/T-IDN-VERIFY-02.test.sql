-- T-IDN-VERIFY-02 — the professional relationship as a verification conflict
-- (`HU-BO-021` c8, ADR-026 point 5).
--
-- ADR-026 lists who may not verify a credential: its holder, a member of an
-- organization they share, and their assigned professional among others. The first two
-- were checked from the start; the third waited for `relationships`, which has existed
-- since `20260928200000`. Until now a verifier whose own coach is the holder, or who
-- coaches the holder, could decide on that credential.
--
-- **Either direction is the conflict.** The verifier may be the client and the holder
-- their professional, or the other way round. Neither shares a membership with the
-- other, which is why the existing check never saw it.
--
-- **Only a live assignment.** Being a client of the same gym under another coach is not
-- a relationship with the holder, and a relationship that ended is no longer one.
--
-- **Checked as the verifier, the way it runs.** The check runs as `allfit_owner` with the
-- verifier as the actor, and `relationships` shows a support actor none of those rows. A
-- check that cannot see the relationship answers "no conflict", which is failing open, so
-- every assertion runs with the verifier as the actor. The rows are admitted only while
-- the check runs, with a token the runtime role cannot forge.

begin;

select plan(9);

insert into identity.people (id, given_name, family_name, status)
values
  ('019b2000-0000-7000-8000-000000000001', 'Holder', 'Pro', 'active'),
  ('019b2000-0000-7000-8000-000000000002', 'Client', 'Verifier', 'active'),
  ('019b2000-0000-7000-8000-000000000003', 'Coach', 'Verifier', 'active'),
  ('019b2000-0000-7000-8000-000000000004', 'Former', 'Client', 'active'),
  ('019b2000-0000-7000-8000-000000000005', 'Other', 'Client', 'active'),
  ('019b2000-0000-7000-8000-000000000006', 'Colleague', 'Coach', 'active');

insert into organizations.organizations (id, type_code, display_name, responsible_party)
values
  ('019b2000-0000-7000-8000-000000000101', 'gym', 'Gimnasio del Titular',
    '{"party_kind":"legal_entity","party_name":"Titular SAS","purpose":"studio_operations"}'),
  ('019b2000-0000-7000-8000-000000000102', 'gym', 'Gimnasio del Verificador',
    '{"party_kind":"legal_entity","party_name":"Verificador SAS","purpose":"studio_operations"}');

-- The holder and a colleague coach at the first gym; the coach verifier at the second.
insert into organizations.organization_memberships (id, organization_id, person_id, status)
values
  ('019b2000-0000-7000-8000-000000000201', '019b2000-0000-7000-8000-000000000101',
    '019b2000-0000-7000-8000-000000000001', 'active'),
  ('019b2000-0000-7000-8000-000000000206', '019b2000-0000-7000-8000-000000000101',
    '019b2000-0000-7000-8000-000000000006', 'active'),
  ('019b2000-0000-7000-8000-000000000203', '019b2000-0000-7000-8000-000000000102',
    '019b2000-0000-7000-8000-000000000003', 'active');
insert into organizations.membership_roles (membership_id, role_code)
values
  ('019b2000-0000-7000-8000-000000000201', 'coach'),
  ('019b2000-0000-7000-8000-000000000206', 'coach'),
  ('019b2000-0000-7000-8000-000000000203', 'coach');

insert into relationships.service_relationships (
  id, person_id, organization_id, status, ended_at, ended_reason, ended_by_kind
) values
  -- The client verifier trains with the holder.
  ('019b2000-0000-7000-8000-000000000302', '019b2000-0000-7000-8000-000000000002',
    '019b2000-0000-7000-8000-000000000101', 'active', null, null, null),
  -- The holder trains with the coach verifier.
  ('019b2000-0000-7000-8000-000000000301', '019b2000-0000-7000-8000-000000000001',
    '019b2000-0000-7000-8000-000000000102', 'active', null, null, null),
  -- A former client of the holder.
  ('019b2000-0000-7000-8000-000000000304', '019b2000-0000-7000-8000-000000000004',
    '019b2000-0000-7000-8000-000000000101', 'terminated', clock_timestamp(), 'moved away', 'person'),
  -- A client of the same gym, under the colleague.
  ('019b2000-0000-7000-8000-000000000305', '019b2000-0000-7000-8000-000000000005',
    '019b2000-0000-7000-8000-000000000101', 'active', null, null, null);

insert into relationships.relationship_professional_assignments (
  id, relationship_id, person_id, organization_id, membership_id, kind, status, valid_from, valid_to
) values
  ('019b2000-0000-7000-8000-000000000402', '019b2000-0000-7000-8000-000000000302',
    '019b2000-0000-7000-8000-000000000002', '019b2000-0000-7000-8000-000000000101',
    '019b2000-0000-7000-8000-000000000201', 'holder', 'active', now() - interval '1 day', null),
  ('019b2000-0000-7000-8000-000000000401', '019b2000-0000-7000-8000-000000000301',
    '019b2000-0000-7000-8000-000000000001', '019b2000-0000-7000-8000-000000000102',
    '019b2000-0000-7000-8000-000000000203', 'holder', 'active', now() - interval '1 day', null),
  ('019b2000-0000-7000-8000-000000000404', '019b2000-0000-7000-8000-000000000304',
    '019b2000-0000-7000-8000-000000000004', '019b2000-0000-7000-8000-000000000101',
    '019b2000-0000-7000-8000-000000000201', 'holder', 'ended', now() - interval '1 day', now()),
  ('019b2000-0000-7000-8000-000000000405', '019b2000-0000-7000-8000-000000000305',
    '019b2000-0000-7000-8000-000000000005', '019b2000-0000-7000-8000-000000000101',
    '019b2000-0000-7000-8000-000000000206', 'holder', 'active', now() - interval '1 day', null);

-- The holder declares a credential, the way Studio does.
set local role allfit_api;
select set_config('app.actor_kind', 'person', true),
       set_config('app.actor_person_id', '019b2000-0000-7000-8000-000000000001', true);

select * from identity.put_professional_profile(
  '019b2000-0000-7000-8000-000000000001', 'Entrenadora de fuerza',
  'Fuerza y acondicionamiento.', 2018, array['personal_training'],
  '11111111-1111-4111-8111-111111112001', '019b2000-0000-7000-8000-000000000501',
  decode(repeat('a1', 32), 'hex')
);

create temporary table license on commit drop as
select (credential->>'id')::uuid as id
from identity.declare_professional_credential(
  '019b2000-0000-7000-8000-000000000001', 'professional_license',
  'Colegio Colombiano de Fisioterapeutas', 'Tarjeta profesional', 'TP-20001',
  '2018-06-01', null, 'https://example.test/registry/TP-20001',
  '11111111-1111-4111-8111-111111112002', '019b2000-0000-7000-8000-000000000502',
  decode(repeat('a2', 32), 'hex')
);

reset role;

select set_config('app.actor_kind', 'support', true),
       set_config('app.actor_person_id', '019b2000-0000-7000-8000-000000000002', true);

select is(
  identity.credential_verification_conflict(
    '019b2000-0000-7000-8000-000000000002', (select id from license)
  ),
  'professional_relationship',
  'a verifier whose own professional is the holder may not decide'
);

select set_config('app.actor_kind', 'support', true),
       set_config('app.actor_person_id', '019b2000-0000-7000-8000-000000000003', true);

select is(
  identity.credential_verification_conflict(
    '019b2000-0000-7000-8000-000000000003', (select id from license)
  ),
  'professional_relationship',
  'nor may the professional assigned to the holder'
);

select set_config('app.actor_kind', 'support', true),
       set_config('app.actor_person_id', '019b2000-0000-7000-8000-000000000005', true);

select is(
  identity.credential_verification_conflict(
    '019b2000-0000-7000-8000-000000000005', (select id from license)
  ),
  null,
  'a client of the same gym under another coach has no relationship with the holder'
);

select set_config('app.actor_kind', 'support', true),
       set_config('app.actor_person_id', '019b2000-0000-7000-8000-000000000004', true);

select is(
  identity.credential_verification_conflict(
    '019b2000-0000-7000-8000-000000000004', (select id from license)
  ),
  null,
  'a relationship that ended is no longer a conflict'
);

select set_config('app.actor_kind', 'support', true),
       set_config('app.actor_person_id', '019b2000-0000-7000-8000-000000000006', true);

select is(
  identity.credential_verification_conflict(
    '019b2000-0000-7000-8000-000000000006', (select id from license)
  ),
  'shared_active_membership',
  'a colleague at the same gym is still the shared-membership conflict'
);

select set_config('app.actor_kind', 'support', true),
       set_config('app.actor_person_id', '019b2000-0000-7000-8000-000000000001', true);

select is(
  identity.credential_verification_conflict(
    '019b2000-0000-7000-8000-000000000001', (select id from license)
  ),
  'verifier_is_holder',
  'and the holder is still the first conflict'
);

-- The policy admits the rows only while the check runs: outside it, the verifier who
-- coaches the holder sees none of the holder's relationship.
select set_config('app.actor_kind', 'support', true),
       set_config('app.actor_person_id', '019b2000-0000-7000-8000-000000000003', true);
set local role allfit_owner;

select is(
  (select count(*)::integer from relationships.relationship_professional_assignments
    where person_id = '019b2000-0000-7000-8000-000000000001'),
  0,
  'outside the check the holder''s assignment stays hidden from the verifier'
);

select set_config('app.credential_conflict_pair',
  '019b2000-0000-7000-8000-000000000003:019b2000-0000-7000-8000-000000000001', true),
       set_config('app.credential_conflict_token', repeat('ab', 32), true);

select is(
  (select count(*)::integer from relationships.relationship_professional_assignments
    where person_id = '019b2000-0000-7000-8000-000000000001'),
  0,
  'a pair named without the right token admits nothing'
);

select is(
  (select count(*)::integer from relationships.service_relationships
    where person_id = '019b2000-0000-7000-8000-000000000001'),
  0,
  'nor the relationship itself'
);

reset role;

select * from finish();

rollback;
