-- T-REL-INVITE-PROGRAM-01 — a client invitation that carries a first program.
-- HU-STUDIO-023 criteria 2, 6, 7 and 8; HU-SP-016 criterion 1; HU-SP-017 criteria 1, 8, 9, 11.
--
-- What has to hold:
--
--   · Only a coach (`assign_programs`) proposes, only a published version of the gym's own
--     program, and only alongside a request for `relationship_training` at `contribute`.
--     Anything else refuses the whole invitation.
--   · Until she answers, nothing exists: no relationship, grant or assignment.
--   · She sees the program as a proposal of its own and answers it on its own. Silence
--     is a no, and declining the relationship declines the program.
--   · The program becomes hers only when she accepts the relationship, accepts the program
--     and grants `relationship_training` at `contribute`. An accepted program that cannot
--     be created says why; it is never swapped for something else.
--   · Created, it is the gym's managed program in her own time zone, and retrying creates
--     it once. A reissued invitation offers the same program.
begin;

select plan(69);

insert into identity.people (id, given_name, family_name, status)
values
  ('019f1600-0000-7000-8000-000000000001', 'Ana', 'Invited', 'active'),
  ('019f1600-0000-7000-8000-000000000002', 'Bea', 'Invited', 'active'),
  ('019f1600-0000-7000-8000-000000000003', 'Ciro', 'Invited', 'active'),
  ('019f1600-0000-7000-8000-000000000004', 'Dora', 'Invited', 'active'),
  ('019f1600-0000-7000-8000-000000000005', 'Eva', 'Invited', 'active'),
  ('019f1600-0000-7000-8000-000000000006', 'Fede', 'Invited', 'active'),
  ('019f1600-0000-7000-8000-000000000007', 'Gabo', 'Invited', 'active'),
  ('019f1600-0000-7000-8000-000000000008', 'Hana', 'Invited', 'active'),
  ('019f1600-0000-7000-8000-000000000009', 'Iris', 'Invited', 'active'),
  ('019f1600-0000-7000-8000-000000000010', 'Juan', 'Invited', 'active'),
  ('019f1600-0000-7000-8000-000000000011', 'Olivia', 'Owner', 'active'),
  ('019f1600-0000-7000-8000-000000000012', 'Camilo', 'Coach', 'active'),
  ('019f1600-0000-7000-8000-000000000016', 'Gina', 'Admin', 'active'),
  ('019f1600-0000-7000-8000-000000000017', 'Sara', 'Staff', 'active'),
  ('019f1600-0000-7000-8000-000000000021', 'Oscar', 'Owner', 'active'),
  ('019f1600-0000-7000-8000-000000000041', 'Admin', 'Cuatro', 'active'),
  ('019f1600-0000-7000-8000-000000000042', 'Support', 'Dos', 'active'),
  ('019f1600-0000-7000-8000-000000000043', 'Admin', 'Cinco', 'active');

insert into organizations.organizations (id, type_code, display_name, responsible_party)
values
  ('019f1600-0000-7000-8000-000000000101', 'gym', 'Gym A',
   '{"party_kind":"legal_entity","party_name":"Gym A SAS","purpose":"studio_operations"}'),
  ('019f1600-0000-7000-8000-000000000102', 'gym', 'Gym B',
   '{"party_kind":"legal_entity","party_name":"Gym B SAS","purpose":"studio_operations"}');

insert into organizations.organization_memberships (id, organization_id, person_id, status)
values
  ('019f1600-0000-7000-8000-000000000211', '019f1600-0000-7000-8000-000000000101', '019f1600-0000-7000-8000-000000000011', 'active'),
  ('019f1600-0000-7000-8000-000000000212', '019f1600-0000-7000-8000-000000000101', '019f1600-0000-7000-8000-000000000012', 'active'),
  ('019f1600-0000-7000-8000-000000000216', '019f1600-0000-7000-8000-000000000101', '019f1600-0000-7000-8000-000000000016', 'active'),
  ('019f1600-0000-7000-8000-000000000217', '019f1600-0000-7000-8000-000000000101', '019f1600-0000-7000-8000-000000000017', 'active'),
  ('019f1600-0000-7000-8000-000000000221', '019f1600-0000-7000-8000-000000000102', '019f1600-0000-7000-8000-000000000021', 'active');

insert into organizations.membership_roles (membership_id, role_code)
values
  ('019f1600-0000-7000-8000-000000000211', 'owner'),
  ('019f1600-0000-7000-8000-000000000212', 'coach'),
  ('019f1600-0000-7000-8000-000000000216', 'admin'),
  ('019f1600-0000-7000-8000-000000000217', 'staff'),
  ('019f1600-0000-7000-8000-000000000221', 'owner');

insert into privacy.scope_definitions (id, scope_code, version_number, status, published_at)
values
  ('019f1600-0000-7000-8000-000000000301', 'relationship_training', 1, 'published', clock_timestamp()),
  ('019f1600-0000-7000-8000-000000000302', 'body_progress', 1, 'published', clock_timestamp());

-- Support, for the reissue: two administrators, and one support person on duty.
insert into identity.access_accounts (id, provider, issuer, subject, person_id)
values
  ('019f1600-0000-7000-8000-000000000051', 'workos', 'https://issuer.test', 'program_cuatro', null),
  ('019f1600-0000-7000-8000-000000000053', 'workos', 'https://issuer.test', 'program_cinco', null),
  ('019f1600-0000-7000-8000-000000000052', 'workos', 'https://issuer.test', 'program_dos',
    '019f1600-0000-7000-8000-000000000042');

select support.bootstrap_backoffice_administrators(
  '019f1600-0000-7000-8000-000000000041', 'program_cuatro',
  '019f1600-0000-7000-8000-000000000043', 'program_cinco',
  'https://issuer.test', clock_timestamp() + interval '30 days', 'CEREMONY-REL-INVITE-PROGRAM-01'
);

insert into identity.access_sessions (
  id, access_account_id, provider_session_id, surface, token_hash, token_ciphertext,
  access_token_expires_at, assurance_level, authentication_method,
  assurance_verified_at, last_activity_at, absolute_expires_at
)
select
  session_id, account_id, 'sid_' || suffix, 'backoffice', decode(repeat(hash_byte, 32), 'hex'),
  'v1.' || suffix, clock_timestamp() + interval '5 minutes', 2, 'password_totp',
  clock_timestamp(), clock_timestamp(), clock_timestamp() + interval '8 hours'
from (values
  ('019f1600-0000-7000-8000-000000000061'::uuid, '019f1600-0000-7000-8000-000000000051'::uuid,
    'program_cuatro', 'd4'),
  ('019f1600-0000-7000-8000-000000000062'::uuid, '019f1600-0000-7000-8000-000000000052'::uuid,
    'program_dos', 'd2')
) as session_row(session_id, account_id, suffix, hash_byte);

select support.assign_platform_role(
  '019f1600-0000-7000-8000-000000000041', '019f1600-0000-7000-8000-000000000061',
  '019f1600-0000-7000-8000-000000000042', 'allfit_admin',
  '019f1600-0000-7000-8000-000000000071', '019f1600-0000-7000-8000-000000000072',
  decode(repeat('d7', 32), 'hex')
);
select support.assign_platform_duty(
  '019f1600-0000-7000-8000-000000000041', '019f1600-0000-7000-8000-000000000061',
  '019f1600-0000-7000-8000-000000000042', 'diagnose_support_metadata',
  clock_timestamp(), clock_timestamp() + interval '30 days', 'CASE-2026-016',
  '019f1600-0000-7000-8000-000000000073', '019f1600-0000-7000-8000-000000000074',
  decode(repeat('d8', 32), 'hex')
);

-- Content. Gym A: a finite program (v1 published, v2 retired) and an open-ended one.
-- Gym B: one program. Bea: her own program, which her phone set up in Bogotá.
insert into planning.session_templates (id, content_scope, owner_organization_id, owner_person_id, author_person_id, discipline_code, status)
values
  ('019f1600-0000-7000-8000-000000000311', 'organization', '019f1600-0000-7000-8000-000000000101', null, '019f1600-0000-7000-8000-000000000012', 'test_strength', 'published'),
  ('019f1600-0000-7000-8000-000000000321', 'organization', '019f1600-0000-7000-8000-000000000101', null, '019f1600-0000-7000-8000-000000000012', 'test_strength', 'published'),
  ('019f1600-0000-7000-8000-000000000361', 'organization', '019f1600-0000-7000-8000-000000000102', null, '019f1600-0000-7000-8000-000000000021', 'test_strength', 'published'),
  ('019f1600-0000-7000-8000-000000000371', 'person', null, '019f1600-0000-7000-8000-000000000002', '019f1600-0000-7000-8000-000000000002', 'test_strength', 'published');
insert into planning.programs (id, content_scope, owner_organization_id, owner_person_id, author_person_id, status)
values
  ('019f1600-0000-7000-8000-000000000331', 'organization', '019f1600-0000-7000-8000-000000000101', null, '019f1600-0000-7000-8000-000000000012', 'published'),
  ('019f1600-0000-7000-8000-000000000341', 'organization', '019f1600-0000-7000-8000-000000000101', null, '019f1600-0000-7000-8000-000000000012', 'published'),
  ('019f1600-0000-7000-8000-000000000391', 'organization', '019f1600-0000-7000-8000-000000000101', null, '019f1600-0000-7000-8000-000000000012', 'published'),
  ('019f1600-0000-7000-8000-000000000351', 'organization', '019f1600-0000-7000-8000-000000000102', null, '019f1600-0000-7000-8000-000000000021', 'published'),
  ('019f1600-0000-7000-8000-000000000381', 'person', null, '019f1600-0000-7000-8000-000000000002', '019f1600-0000-7000-8000-000000000002', 'published');

select set_config('app.planning_publication', 'true', true);
insert into planning.session_template_versions (id, template_id, version_number, discipline_code, activity_type_id, title, content_hash)
values
  ('019f1600-0000-7000-8000-000000000312', '019f1600-0000-7000-8000-000000000311', 1, 'test_strength', '019c0000-0000-7000-8000-000000000011', 'Fuerza A', decode(repeat('c1', 32), 'hex')),
  ('019f1600-0000-7000-8000-000000000322', '019f1600-0000-7000-8000-000000000321', 1, 'test_strength', '019c0000-0000-7000-8000-000000000011', 'Movilidad A', decode(repeat('c2', 32), 'hex')),
  ('019f1600-0000-7000-8000-000000000362', '019f1600-0000-7000-8000-000000000361', 1, 'test_strength', '019c0000-0000-7000-8000-000000000011', 'Fuerza B', decode(repeat('c4', 32), 'hex')),
  ('019f1600-0000-7000-8000-000000000372', '019f1600-0000-7000-8000-000000000371', 1, 'test_strength', '019c0000-0000-7000-8000-000000000011', 'Mía', decode(repeat('c5', 32), 'hex'));
insert into planning.program_versions (id, program_id, version_number, title, content_hash, status, repeats_forever)
values
  ('019f1600-0000-7000-8000-000000000332', '019f1600-0000-7000-8000-000000000331', 1, 'Bloque A', decode(repeat('b1', 32), 'hex'), 'published', false),
  ('019f1600-0000-7000-8000-000000000333', '019f1600-0000-7000-8000-000000000331', 2, 'Bloque A v2', decode(repeat('b2', 32), 'hex'), 'deprecated', false),
  ('019f1600-0000-7000-8000-000000000342', '019f1600-0000-7000-8000-000000000341', 1, 'Abierto A', decode(repeat('b3', 32), 'hex'), 'published', true),
  ('019f1600-0000-7000-8000-000000000392', '019f1600-0000-7000-8000-000000000391', 1, 'Temporal A', decode(repeat('b6', 32), 'hex'), 'published', false),
  ('019f1600-0000-7000-8000-000000000352', '019f1600-0000-7000-8000-000000000351', 1, 'Bloque B', decode(repeat('b4', 32), 'hex'), 'published', false),
  ('019f1600-0000-7000-8000-000000000382', '019f1600-0000-7000-8000-000000000381', 1, 'Lo mío', decode(repeat('b5', 32), 'hex'), 'published', false);
insert into planning.program_version_sessions (program_version_id, template_version_id, position, week, day)
values
  ('019f1600-0000-7000-8000-000000000332', '019f1600-0000-7000-8000-000000000312', 1, 1, 1),
  ('019f1600-0000-7000-8000-000000000332', '019f1600-0000-7000-8000-000000000322', 2, 1, 3),
  ('019f1600-0000-7000-8000-000000000332', '019f1600-0000-7000-8000-000000000312', 3, 2, 1),
  ('019f1600-0000-7000-8000-000000000332', '019f1600-0000-7000-8000-000000000322', 4, 2, 3),
  ('019f1600-0000-7000-8000-000000000333', '019f1600-0000-7000-8000-000000000312', 1, 1, 1),
  ('019f1600-0000-7000-8000-000000000342', '019f1600-0000-7000-8000-000000000312', 1, 1, 1),
  ('019f1600-0000-7000-8000-000000000342', '019f1600-0000-7000-8000-000000000322', 2, 2, 2),
  ('019f1600-0000-7000-8000-000000000392', '019f1600-0000-7000-8000-000000000312', 1, 1, 1),
  ('019f1600-0000-7000-8000-000000000352', '019f1600-0000-7000-8000-000000000362', 1, 1, 1),
  ('019f1600-0000-7000-8000-000000000382', '019f1600-0000-7000-8000-000000000372', 1, 1, 1);
select set_config('app.planning_publication', '', true);

insert into planning.program_assignments (id, person_id, program_version_id, lifecycle, starts_on, timezone, assigned_at, display_order)
values ('019f1600-0000-7000-8000-000000000901', '019f1600-0000-7000-8000-000000000002', '019f1600-0000-7000-8000-000000000382',
  'personal', (clock_timestamp() at time zone 'America/Bogota')::date, 'America/Bogota', clock_timestamp() - interval '1 day', 1);
-- And a program from a gym she has left, set up later in Studio's zone, not by her phone.
insert into relationships.service_relationships (id, person_id, organization_id, status, started_at, ended_at, ended_reason)
values ('019f1600-0000-7000-8000-000000000702', '019f1600-0000-7000-8000-000000000002', '019f1600-0000-7000-8000-000000000102', 'terminated',
  clock_timestamp() - interval '60 days', clock_timestamp() - interval '30 days', 'left');
insert into planning.program_assignments (id, person_id, program_version_id, origin_relationship_id, lifecycle, starts_on, timezone, assigned_at, display_order)
values ('019f1600-0000-7000-8000-000000000902', '019f1600-0000-7000-8000-000000000002', '019f1600-0000-7000-8000-000000000352', '019f1600-0000-7000-8000-000000000702',
  'ended', (clock_timestamp() at time zone 'Asia/Tokyo')::date, 'Asia/Tokyo', clock_timestamp(), 2);

select (clock_timestamp() at time zone 'America/Bogota')::date as today,
       (clock_timestamp() at time zone 'America/Bogota')::date + 3 as start3,
       (clock_timestamp() at time zone 'America/Bogota')::date - 1 as yesterday \gset

create function pg_temp.act(person uuid) returns void language plpgsql as $$
begin
  perform set_config('app.actor_kind', 'person', true);
  perform set_config('app.actor_person_id', person::text, true);
  perform set_config('app.actor_org_id', '', true);
  perform set_config('app.actor_membership_id', '', true);
  perform set_config('app.actor_verified_email', '', true);
  perform set_config('app.contract_scope_purpose', '', true);
  perform set_config('app.contract_scope_id', '', true);
  perform set_config('app.contract_scope_token', '', true);
  perform set_config('app.request_id', gen_random_uuid()::text, true);
end
$$;

-- The SQLSTATE and detail a statement fails with, so a refusal is asserted by its reason.
create function pg_temp.failure(statement text) returns text
language plpgsql as $$
declare
  state text;
  detail text;
begin
  execute statement;
  return 'no error';
exception when others then
  get stacked diagnostics state = returned_sqlstate, detail = pg_exception_detail;
  return state || ' ' || coalesce(detail, '');
end
$$;

-- A check names the constraint it broke, so the assertion can name it too.
create function pg_temp.violated(statement text) returns text
language plpgsql as $$
declare
  state text;
  name text;
begin
  execute statement;
  return 'no error';
exception when others then
  get stacked diagnostics state = returned_sqlstate, name = constraint_name;
  return state || ' ' || coalesce(name, '');
end
$$;

create function pg_temp.offer(training text) returns jsonb language sql as $$
  select case training
    when 'contribute' then
      '[{"scope_code":"relationship_training","access_level":"contribute","purpose":"Entrenar","presented_snapshot":{"title":"Entrenamiento"}},
        {"scope_code":"body_progress","access_level":"read","purpose":"Seguimiento","presented_snapshot":{"title":"Progreso"}}]'::jsonb
    when 'read' then
      '[{"scope_code":"relationship_training","access_level":"read","purpose":"Ver","presented_snapshot":{"title":"Entrenamiento"}}]'::jsonb
    else
      '[{"scope_code":"body_progress","access_level":"read","purpose":"Seguimiento","presented_snapshot":{"title":"Progreso"}}]'::jsonb
  end
$$;

-- Issued by `actor` for Gym A. The key is the command, and so the new invitation's id.
create function pg_temp.invite(actor uuid, contact text, training text, version uuid, starts date, zone text, key uuid)
returns jsonb language plpgsql as $$
declare
  document jsonb;
begin
  perform pg_temp.act(actor);
  select to_jsonb(issued) into document
  from identity.issue_client_invitation(
    actor, '019f1600-0000-7000-8000-000000000101', 'email', contact, pg_temp.offer(training),
    extensions.digest(key::text, 'sha256'), 1::smallint, key, key,
    extensions.digest(concat_ws('|', key, contact, training, version, starts, zone), 'sha256'),
    version, starts, zone
  ) as issued;
  return document;
end
$$;

create function pg_temp.decide(person uuid, contact text, invitation uuid, relationship text, scopes jsonb, program text, zone text, key uuid)
returns jsonb language plpgsql as $$
declare
  document jsonb;
begin
  perform pg_temp.act(person);
  perform set_config('app.actor_verified_email', contact, true);
  select to_jsonb(decided) into document
  from identity.decide_client_invitation(
    person,
    (select token_hash from identity.invitations where id = invitation),
    (select id from identity.invitation_intents where invitation_id = invitation and kind = 'service_relationship'),
    relationship, scopes, key, key, extensions.digest(key::text, 'sha256'), program, zone
  ) as decided;
  return document;
end
$$;

-- The same answer through the Space route that names the invitation instead of the token.
create function pg_temp.decide_my(person uuid, contact text, invitation uuid, relationship text, scopes jsonb, program text, zone text, key uuid)
returns jsonb language plpgsql as $$
declare
  document jsonb;
begin
  perform pg_temp.act(person);
  perform set_config('app.actor_verified_email', contact, true);
  select to_jsonb(decided) into document
  from identity.decide_my_client_invitation(
    person, invitation,
    (select id from identity.invitation_intents where invitation_id = invitation and kind = 'service_relationship'),
    relationship, scopes, key, key, extensions.digest(key::text, 'sha256'), program, zone
  ) as decided;
  return document;
end
$$;

create function pg_temp.present(person uuid, contact text, invitation uuid)
returns jsonb language plpgsql as $$
declare
  document jsonb;
begin
  perform pg_temp.act(person);
  perform set_config('app.actor_verified_email', contact, true);
  select to_jsonb(presented) into document
  from identity.resolve_client_invitation((select token_hash from identity.invitations where id = invitation)) as presented;
  return document;
end
$$;

create function pg_temp.program_intent(invitation uuid) returns uuid language sql as $$
  select id from identity.invitation_intents where invitation_id = invitation and kind = 'program_assignment'
$$;

-- ———————————————————————————————————— Proposing (OP-REL-001)

select pg_temp.invite('019f1600-0000-7000-8000-000000000012', 'ana@example.test', 'contribute',
  '019f1600-0000-7000-8000-000000000332', :'start3', 'America/Bogota',
  '019f1600-0000-7000-8000-000000000f01') as ana_invite \gset

select is(
  row(:'ana_invite'::jsonb->>'invitation_id', :'ana_invite'::jsonb->>'reused',
      :'ana_invite'::jsonb->'program_proposal'->>'program_version_id',
      :'ana_invite'::jsonb->'program_proposal'->>'starts_on')::text,
  row('019f1600-0000-7000-8000-000000000f01', 'false', '019f1600-0000-7000-8000-000000000332', :'start3')::text,
  'T-REL-INVITE-PROGRAM-ISS-01 a coach invites with a first program, and the answer names it');
select is(
  (select row(kind, status, proposed_program_version_id, proposed_starts_on, proposed_timezone)::text
     from identity.invitation_intents where invitation_id = '019f1600-0000-7000-8000-000000000f01' and kind = 'program_assignment'),
  row('program_assignment', 'pending', '019f1600-0000-7000-8000-000000000332', :'start3', 'America/Bogota')::text,
  'T-REL-INVITE-PROGRAM-ISS-02 the program is a proposal of its own, beside the relationship');
select is(
  (select count(*)::integer from planning.program_assignments where program_version_id = '019f1600-0000-7000-8000-000000000332')
    + (select count(*)::integer from relationships.service_relationships where person_id = '019f1600-0000-7000-8000-000000000001')
    + (select count(*)::integer from privacy.data_grants where person_id = '019f1600-0000-7000-8000-000000000001'),
  0, 'T-REL-INVITE-PROGRAM-ISS-03 and until she answers there is no assignment, relationship or grant');

select is(
  (pg_temp.invite('019f1600-0000-7000-8000-000000000012', 'ana@example.test', 'contribute',
     '019f1600-0000-7000-8000-000000000332', :'start3', 'America/Bogota',
     '019f1600-0000-7000-8000-000000000f02'))->>'invitation_id',
  '019f1600-0000-7000-8000-000000000f01',
  'T-REL-INVITE-PROGRAM-ISS-04 proposing the same again reuses the pending invitation');
select is(
  (pg_temp.invite('019f1600-0000-7000-8000-000000000012', 'ana@example.test', 'contribute',
     '019f1600-0000-7000-8000-000000000332', :'start3', 'America/Bogota',
     '019f1600-0000-7000-8000-000000000f01'))->>'replayed',
  'true', 'T-REL-INVITE-PROGRAM-ISS-05 and a retry is answered from its receipt');
select is(
  (pg_temp.invite('019f1600-0000-7000-8000-000000000012', 'ana@example.test', 'contribute',
     null, null, null, '019f1600-0000-7000-8000-000000000f03'))->>'invitation_id',
  '019f1600-0000-7000-8000-000000000f03',
  'T-REL-INVITE-PROGRAM-ISS-06 the same scopes without the program are a different proposal');
select is(
  (pg_temp.invite('019f1600-0000-7000-8000-000000000012', 'ana@example.test', 'contribute',
     '019f1600-0000-7000-8000-000000000342', :'start3', 'America/Bogota',
     '019f1600-0000-7000-8000-000000000f04'))->>'invitation_id',
  '019f1600-0000-7000-8000-000000000f04',
  'T-REL-INVITE-PROGRAM-ISS-07 and so is another program');
select is(
  (pg_temp.invite('019f1600-0000-7000-8000-000000000012', 'ana@example.test', 'contribute',
     '019f1600-0000-7000-8000-000000000332', :'start3'::date + 1, 'America/Bogota',
     '019f1600-0000-7000-8000-000000000f10'))->>'invitation_id',
  '019f1600-0000-7000-8000-000000000f10',
  'T-REL-INVITE-PROGRAM-ISS-20 and so is the same program on another day');
select is(
  (select program_proposal from identity.client_invitation_projection('019f1600-0000-7000-8000-000000000f03')),
  null, 'T-REL-INVITE-PROGRAM-ISS-08 an invitation without a program says so');

select is(
  pg_temp.failure($$select pg_temp.invite('019f1600-0000-7000-8000-000000000017', 'refused@example.test', 'contribute',
    '019f1600-0000-7000-8000-000000000332', current_date + 3, 'America/Bogota', '019f1600-0000-7000-8000-000000000f05')$$),
  '42501 ', 'T-REL-INVITE-PROGRAM-ISS-09 staff may invite, but may not propose a program');
select is(
  pg_temp.failure($$select pg_temp.invite('019f1600-0000-7000-8000-000000000016', 'refused@example.test', 'contribute',
    '019f1600-0000-7000-8000-000000000332', current_date + 3, 'America/Bogota', '019f1600-0000-7000-8000-000000000f06')$$),
  '42501 ', 'T-REL-INVITE-PROGRAM-ISS-10 nor may an admin who does not coach');
select is(
  (pg_temp.invite('019f1600-0000-7000-8000-000000000017', 'sara.client@example.test', 'none',
     null, null, null, '019f1600-0000-7000-8000-000000000f07'))->>'invitation_id',
  '019f1600-0000-7000-8000-000000000f07',
  'T-REL-INVITE-PROGRAM-ISS-11 staff still invites without one');
select is(
  pg_temp.failure($$select pg_temp.invite('019f1600-0000-7000-8000-000000000012', 'refused@example.test', 'contribute',
    '019f1600-0000-7000-8000-000000000352', current_date + 3, 'America/Bogota', '019f1600-0000-7000-8000-000000000f08')$$),
  '22023 ["program-version"]', 'T-REL-INVITE-PROGRAM-ISS-12 another gym''s program refuses the whole invitation');
select is(
  pg_temp.failure($$select pg_temp.invite('019f1600-0000-7000-8000-000000000012', 'refused@example.test', 'contribute',
    '019f1600-0000-7000-8000-000000000333', current_date + 3, 'America/Bogota', '019f1600-0000-7000-8000-000000000f09')$$),
  '22023 ["program-version"]', 'T-REL-INVITE-PROGRAM-ISS-13 so does a retired version');
select is(
  pg_temp.failure($$select pg_temp.invite('019f1600-0000-7000-8000-000000000012', 'refused@example.test', 'none',
    '019f1600-0000-7000-8000-000000000332', current_date + 3, 'America/Bogota', '019f1600-0000-7000-8000-000000000f0a')$$),
  '22023 ["scopes"]', 'T-REL-INVITE-PROGRAM-ISS-14 a program without asking for her training could never be created');
select is(
  pg_temp.failure($$select pg_temp.invite('019f1600-0000-7000-8000-000000000012', 'refused@example.test', 'read',
    '019f1600-0000-7000-8000-000000000332', current_date + 3, 'America/Bogota', '019f1600-0000-7000-8000-000000000f0b')$$),
  '22023 ["scopes"]', 'T-REL-INVITE-PROGRAM-ISS-15 nor asking to read it only');
select is(
  pg_temp.failure(format($$select pg_temp.invite('019f1600-0000-7000-8000-000000000012', 'refused@example.test', 'contribute',
    '019f1600-0000-7000-8000-000000000332', %L, 'America/Bogota', '019f1600-0000-7000-8000-000000000f0c')$$, :'yesterday')),
  '22023 ["program-starts-on"]', 'T-REL-INVITE-PROGRAM-ISS-16 a program does not start in the past');
select is(
  pg_temp.failure($$select pg_temp.invite('019f1600-0000-7000-8000-000000000012', 'refused@example.test', 'contribute',
    '019f1600-0000-7000-8000-000000000332', current_date + 3, 'Mars/Olympus', '019f1600-0000-7000-8000-000000000f0d')$$),
  '22023 ["program-timezone"]', 'T-REL-INVITE-PROGRAM-ISS-17 nor in a zone that does not exist');
select is(
  pg_temp.failure($$select pg_temp.invite('019f1600-0000-7000-8000-000000000012', 'refused@example.test', 'contribute',
    '019f1600-0000-7000-8000-000000000332', null, 'America/Bogota', '019f1600-0000-7000-8000-000000000f0e')$$),
  '22023 ["program"]', 'T-REL-INVITE-PROGRAM-ISS-18 and half a proposal is no proposal');
select is(
  (select count(*)::integer from identity.invitations where contact::text = 'refused@example.test'),
  0, 'T-REL-INVITE-PROGRAM-ISS-19 a refused proposal leaves no invitation behind');

-- ———————————————————————————————————— What she sees (OP-REL-015)

select is(
  (select row(proposal->>'invitation_intent_id', proposal->>'title', proposal->>'version_number',
              proposal->>'weeks', proposal->>'repeats_forever', proposal->>'starts_on',
              proposal->'required_scope'->>'scope_code', proposal->'required_scope'->>'access_level',
              coalesce(proposal->>'decision', '-'))::text
     from (select pg_temp.present('019f1600-0000-7000-8000-000000000001', 'ana@example.test',
             '019f1600-0000-7000-8000-000000000f01')->'program_proposal' as proposal) as presented),
  row(pg_temp.program_intent('019f1600-0000-7000-8000-000000000f01'), 'Bloque A', '1', '2', 'false', :'start3',
      'relationship_training', 'contribute', '-')::text,
  'T-REL-INVITE-PROGRAM-RES-01 she sees the program, its length, its start and what it needs, still unanswered');
select is(
  pg_temp.present('019f1600-0000-7000-8000-000000000001', 'ana@example.test', '019f1600-0000-7000-8000-000000000f03')->'program_proposal',
  'null'::jsonb, 'T-REL-INVITE-PROGRAM-RES-02 an invitation without one shows none');
select is(
  (select row(proposal->>'weeks', proposal->>'repeats_forever')::text
     from (select pg_temp.present('019f1600-0000-7000-8000-000000000001', 'ana@example.test',
             '019f1600-0000-7000-8000-000000000f04')->'program_proposal' as proposal) as presented),
  row(null, 'true')::text, 'T-REL-INVITE-PROGRAM-RES-03 an open-ended program has no length');

-- ———————————————————————————————————— Deciding (OP-IDN-009)

select is(
  pg_temp.failure($$select pg_temp.decide('019f1600-0000-7000-8000-000000000001', 'ana@example.test',
    '019f1600-0000-7000-8000-000000000f03', 'accepted', '{"relationship_training":"accepted"}', 'accepted', null,
    '019f1600-0000-7000-8000-000000000e00')$$),
  '22023 ["program-decision"]', 'T-REL-INVITE-PROGRAM-DEC-01 there is no program to answer on an invitation that offers none');

select pg_temp.decide('019f1600-0000-7000-8000-000000000001', 'ana@example.test',
  '019f1600-0000-7000-8000-000000000f01', 'accepted', '{"relationship_training":"accepted"}', 'accepted',
  'Europe/Madrid', '019f1600-0000-7000-8000-000000000e01') as ana_decided \gset
select (:'ana_decided'::jsonb->'program_proposal'->>'assignment_id') as ana_assignment,
       (:'ana_decided'::jsonb->>'relationship_id') as ana_relationship \gset

select is(
  row(:'ana_decided'::jsonb->'program_proposal'->>'invitation_intent_id',
      :'ana_decided'::jsonb->'program_proposal'->>'intent_status',
      :'ana_assignment' is not null,
      coalesce(:'ana_decided'::jsonb->'program_proposal'->>'unmaterialized_reason', '-'))::text,
  row(pg_temp.program_intent('019f1600-0000-7000-8000-000000000f01'), 'accepted', true, '-')::text,
  'T-REL-INVITE-PROGRAM-DEC-02 accepting the relationship, the program and her training creates it');
select is(
  (select row(person_id, program_version_id, origin_relationship_id, lifecycle, starts_on, timezone)::text
     from planning.program_assignments where id = :'ana_assignment'),
  row('019f1600-0000-7000-8000-000000000001', '019f1600-0000-7000-8000-000000000332', :'ana_relationship',
      'active', :'start3', 'Europe/Madrid')::text,
  'T-REL-INVITE-PROGRAM-DEC-03 the gym''s program on the version she was shown, in the zone her phone sent');
select is(
  (select count(*)::integer from planning.assignment_management_periods
     where assignment_id = :'ana_assignment' and relationship_id = :'ana_relationship' and ended_at is null),
  1, 'T-REL-INVITE-PROGRAM-DEC-04 managed through the relationship she just accepted');
select is(
  (select count(*)::integer from planning.planned_sessions where assignment_id = :'ana_assignment' and status = 'scheduled'),
  4, 'T-REL-INVITE-PROGRAM-DEC-05 with its whole calendar planted');
select is(
  (select row(status, materialized_assignment_id)::text from identity.invitation_intents
     where id = pg_temp.program_intent('019f1600-0000-7000-8000-000000000f01')),
  row('accepted', :'ana_assignment')::text,
  'T-REL-INVITE-PROGRAM-DEC-06 the proposal records what it created');
select is(
  (select status::text from identity.invitations where id = '019f1600-0000-7000-8000-000000000f01'),
  'completed', 'T-REL-INVITE-PROGRAM-DEC-07 and the invitation closes once both are answered');
select is(
  (select count(*)::integer from system.outbox_events
    where event_type = 'planning.assignment_created.v1' and aggregate_id = :'ana_assignment'),
  1, 'T-REL-INVITE-PROGRAM-DEC-08 the assignment is announced once');
select is(
  (select count(*)::integer from system.outbox_events
    where event_type = 'identity.invitation_intent_decided.v1'
      and payload->>'invitation_intent_id' = pg_temp.program_intent('019f1600-0000-7000-8000-000000000f01')::text),
  1, 'T-REL-INVITE-PROGRAM-DEC-25 and so is her answer to the program, apart from the relationship');
select is(
  (pg_temp.decide('019f1600-0000-7000-8000-000000000001', 'ana@example.test',
     '019f1600-0000-7000-8000-000000000f01', 'accepted', '{"relationship_training":"accepted"}', 'accepted',
     'Europe/Madrid', '019f1600-0000-7000-8000-000000000e01'))->'program_proposal',
  :'ana_decided'::jsonb->'program_proposal',
  'T-REL-INVITE-PROGRAM-DEC-09 a retry answers the same');
select is(
  (select count(*)::integer from planning.program_assignments where person_id = '019f1600-0000-7000-8000-000000000001'),
  1, 'T-REL-INVITE-PROGRAM-DEC-10 and creates nothing twice');
select pg_temp.act('019f1600-0000-7000-8000-000000000001');
select is(
  (select managed_by from planning.read_my_programs('019f1600-0000-7000-8000-000000000001')),
  'Gym A', 'T-REL-INVITE-PROGRAM-DEC-11 in Space it is hers to train, managed by the gym');

-- Bea: no zone sent, so the one her phone last set wins over Studio's.
select pg_temp.invite('019f1600-0000-7000-8000-000000000012', 'bea@example.test', 'contribute',
  '019f1600-0000-7000-8000-000000000332', :'today', 'America/Lima', '019f1600-0000-7000-8000-000000000f21') as ignored \gset
select pg_temp.decide('019f1600-0000-7000-8000-000000000002', 'bea@example.test', '019f1600-0000-7000-8000-000000000f21',
  'accepted', '{"relationship_training":"accepted"}', 'accepted', null,
  '019f1600-0000-7000-8000-000000000e21')->'program_proposal'->>'assignment_id' as bea_assignment \gset
select is(
  (select timezone from planning.program_assignments where id = :'bea_assignment'),
  'America/Bogota', 'T-REL-INVITE-PROGRAM-DEC-12 without a zone from her phone, the one it last sent');
select ok(
  (select display_order from planning.program_assignments where id = :'bea_assignment')
    < (select display_order from planning.program_assignments where id = '019f1600-0000-7000-8000-000000000901'),
  'T-REL-INVITE-PROGRAM-DEC-26 and the gym''s program goes first among hers, as one she took herself would');

-- Ciro never used Space: Studio's zone is all there is.
select pg_temp.invite('019f1600-0000-7000-8000-000000000012', 'ciro@example.test', 'contribute',
  '019f1600-0000-7000-8000-000000000332', :'start3', 'America/Mexico_City', '019f1600-0000-7000-8000-000000000f22') as ignored \gset
select pg_temp.decide('019f1600-0000-7000-8000-000000000003', 'ciro@example.test', '019f1600-0000-7000-8000-000000000f22',
  'accepted', '{"relationship_training":"accepted"}', 'accepted', null,
  '019f1600-0000-7000-8000-000000000e22')->'program_proposal'->>'assignment_id' as ciro_assignment \gset
select is(
  (select timezone from planning.program_assignments where id = :'ciro_assignment'),
  'America/Mexico_City', 'T-REL-INVITE-PROGRAM-DEC-13 and with no phone at all, Studio''s');

-- Dora takes the gym and declines the program.
select pg_temp.invite('019f1600-0000-7000-8000-000000000012', 'dora@example.test', 'contribute',
  '019f1600-0000-7000-8000-000000000332', :'start3', 'America/Bogota', '019f1600-0000-7000-8000-000000000f23') as ignored \gset
select is(
  pg_temp.failure($$select pg_temp.decide('019f1600-0000-7000-8000-000000000004', 'dora@example.test',
    '019f1600-0000-7000-8000-000000000f23', 'accepted', '{"relationship_training":"accepted"}', 'maybe', null,
    '019f1600-0000-7000-8000-000000000e30')$$),
  '22023 ["program-decision"]', 'T-REL-INVITE-PROGRAM-DEC-27 a program is accepted or declined, nothing else');
select is(
  pg_temp.failure($$select pg_temp.decide('019f1600-0000-7000-8000-000000000004', 'dora@example.test',
    '019f1600-0000-7000-8000-000000000f23', 'accepted', '{"relationship_training":"accepted"}', 'rejected',
    'Mars/Olympus', '019f1600-0000-7000-8000-000000000e31')$$),
  '22023 ["timezone"]', 'T-REL-INVITE-PROGRAM-DEC-28 a zone that does not exist is refused even when nothing would use it');
select pg_temp.decide('019f1600-0000-7000-8000-000000000004', 'dora@example.test', '019f1600-0000-7000-8000-000000000f23',
  'accepted', '{"relationship_training":"accepted"}', 'rejected', null, '019f1600-0000-7000-8000-000000000e23') as dora_decided \gset
select is(
  row(:'dora_decided'::jsonb->>'relationship_id' is not null,
      :'dora_decided'::jsonb->'program_proposal'->>'intent_status',
      coalesce(:'dora_decided'::jsonb->'program_proposal'->>'assignment_id', '-'))::text,
  row(true, 'rejected', '-')::text,
  'T-REL-INVITE-PROGRAM-DEC-14 accepting the relationship and declining the program creates only the relationship');
select is(
  (select count(*)::integer from planning.program_assignments where person_id = '019f1600-0000-7000-8000-000000000004'),
  0, 'T-REL-INVITE-PROGRAM-DEC-15 and no program, calendar or session');
select is(
  row(pg_temp.present('019f1600-0000-7000-8000-000000000001', 'ana@example.test', '019f1600-0000-7000-8000-000000000f01')->'program_proposal'->>'decision',
      pg_temp.present('019f1600-0000-7000-8000-000000000004', 'dora@example.test', '019f1600-0000-7000-8000-000000000f23')->'program_proposal'->>'decision')::text,
  row('accepted', 'rejected')::text,
  'T-REL-INVITE-PROGRAM-RES-04 once answered, she reads back what she answered');

-- Eva accepts the program but keeps her training to herself.
select pg_temp.invite('019f1600-0000-7000-8000-000000000012', 'eva@example.test', 'contribute',
  '019f1600-0000-7000-8000-000000000332', :'start3', 'America/Bogota', '019f1600-0000-7000-8000-000000000f24') as ignored \gset
select pg_temp.decide('019f1600-0000-7000-8000-000000000005', 'eva@example.test', '019f1600-0000-7000-8000-000000000f24',
  'accepted', '{"body_progress":"accepted"}', 'accepted', null, '019f1600-0000-7000-8000-000000000e24') as eva_decided \gset
select is(
  row(:'eva_decided'::jsonb->'program_proposal'->>'intent_status',
      :'eva_decided'::jsonb->'program_proposal'->>'unmaterialized_reason',
      coalesce(:'eva_decided'::jsonb->'program_proposal'->>'assignment_id', '-'))::text,
  row('accepted', 'training_not_granted', '-')::text,
  'T-REL-INVITE-PROGRAM-DEC-16 an accepted program without her training is not created, and says why');
select is(
  (select count(*)::integer from planning.program_assignments where person_id = '019f1600-0000-7000-8000-000000000005'),
  0, 'T-REL-INVITE-PROGRAM-DEC-17 so nothing exists');

-- Fede declines the gym: the program depended on it.
select pg_temp.invite('019f1600-0000-7000-8000-000000000012', 'fede@example.test', 'contribute',
  '019f1600-0000-7000-8000-000000000332', :'start3', 'America/Bogota', '019f1600-0000-7000-8000-000000000f25') as ignored \gset
select is(
  (pg_temp.decide('019f1600-0000-7000-8000-000000000006', 'fede@example.test', '019f1600-0000-7000-8000-000000000f25',
     'rejected', '{"relationship_training":"accepted"}', 'accepted', null,
     '019f1600-0000-7000-8000-000000000e25'))->'program_proposal'->>'intent_status',
  'rejected', 'T-REL-INVITE-PROGRAM-DEC-18 declining the relationship declines the program that depended on it');
select is(
  (select count(*)::integer from planning.program_assignments where person_id = '019f1600-0000-7000-8000-000000000006'),
  0, 'T-REL-INVITE-PROGRAM-DEC-19 and creates nothing');

-- Gabo says nothing about the program: silence is not consent.
select pg_temp.invite('019f1600-0000-7000-8000-000000000012', 'gabo@example.test', 'contribute',
  '019f1600-0000-7000-8000-000000000332', :'start3', 'America/Bogota', '019f1600-0000-7000-8000-000000000f26') as ignored \gset
select is(
  (pg_temp.decide('019f1600-0000-7000-8000-000000000007', 'gabo@example.test', '019f1600-0000-7000-8000-000000000f26',
     'accepted', '{"relationship_training":"accepted"}', null, null,
     '019f1600-0000-7000-8000-000000000e26'))->'program_proposal'->>'intent_status',
  'rejected', 'T-REL-INVITE-PROGRAM-DEC-20 a program left unanswered counts as declined');

-- Hana: the version was retired after the invitation left.
select pg_temp.invite('019f1600-0000-7000-8000-000000000012', 'hana@example.test', 'contribute',
  '019f1600-0000-7000-8000-000000000392', :'start3', 'America/Bogota', '019f1600-0000-7000-8000-000000000f27') as ignored \gset
update planning.program_versions set status = 'deprecated' where id = '019f1600-0000-7000-8000-000000000392';
select pg_temp.decide('019f1600-0000-7000-8000-000000000008', 'hana@example.test', '019f1600-0000-7000-8000-000000000f27',
  'accepted', '{"relationship_training":"accepted"}', 'accepted', null, '019f1600-0000-7000-8000-000000000e27') as hana_decided \gset
select is(
  row(:'hana_decided'::jsonb->'program_proposal'->>'intent_status',
      :'hana_decided'::jsonb->'program_proposal'->>'unmaterialized_reason',
      (select count(*) from planning.program_assignments where person_id = '019f1600-0000-7000-8000-000000000008'))::text,
  row('accepted', 'program_unavailable', 0)::text,
  'T-REL-INVITE-PROGRAM-DEC-21 a version retired meanwhile is not created, nor replaced by another');

-- Iris answers after the proposed start: the program starts the day she accepts.
select pg_temp.invite('019f1600-0000-7000-8000-000000000012', 'iris@example.test', 'contribute',
  '019f1600-0000-7000-8000-000000000332', :'today', 'America/Bogota', '019f1600-0000-7000-8000-000000000f28') as ignored \gset
update identity.invitation_intents set proposed_starts_on = proposed_starts_on - 10
where id = pg_temp.program_intent('019f1600-0000-7000-8000-000000000f28');
select pg_temp.decide_my('019f1600-0000-7000-8000-000000000009', 'iris@example.test', '019f1600-0000-7000-8000-000000000f28',
  'accepted', '{"relationship_training":"accepted"}', 'accepted', null,
  '019f1600-0000-7000-8000-000000000e28')->'program_proposal'->>'assignment_id' as iris_assignment \gset
select is(
  (select starts_on from planning.program_assignments where id = :'iris_assignment'),
  :'today'::date, 'T-REL-INVITE-PROGRAM-DEC-22 a start that passed while she decided moves to the day she accepts');

-- Juan: an open-ended program, and a phone that sent nonsense first.
select pg_temp.invite('019f1600-0000-7000-8000-000000000012', 'juan@example.test', 'contribute',
  '019f1600-0000-7000-8000-000000000342', :'start3', 'America/Bogota', '019f1600-0000-7000-8000-000000000f29') as ignored \gset
select is(
  pg_temp.failure($$select pg_temp.decide('019f1600-0000-7000-8000-000000000010', 'juan@example.test',
    '019f1600-0000-7000-8000-000000000f29', 'accepted', '{"relationship_training":"accepted"}', 'accepted',
    'Mars/Olympus', '019f1600-0000-7000-8000-000000000e29')$$),
  '22023 ["timezone"]', 'T-REL-INVITE-PROGRAM-DEC-23 a zone that does not exist refuses the decision');
select pg_temp.decide('019f1600-0000-7000-8000-000000000010', 'juan@example.test', '019f1600-0000-7000-8000-000000000f29',
  'accepted', '{"relationship_training":"accepted"}', 'accepted', 'America/Bogota',
  '019f1600-0000-7000-8000-000000000e2a')->'program_proposal'->>'assignment_id' as juan_assignment \gset
select is(
  (select count(*)::integer from planning.planned_sessions where assignment_id = :'juan_assignment'),
  1, 'T-REL-INVITE-PROGRAM-DEC-24 an open-ended program plants its first week only (ADR-032)');

-- ———————————————————————————————————— Row policies, directly

set local role allfit_owner;

select pg_temp.act('019f1600-0000-7000-8000-000000000001');
select is(
  pg_temp.violated(format($sql$
    insert into planning.assignment_management_periods (assignment_id, person_id, relationship_id)
    values (%L, '019f1600-0000-7000-8000-000000000001', %L)$sql$,
    :'ana_assignment', :'ana_relationship')),
  '42501 ', 'T-REL-INVITE-PROGRAM-RLS-01 she cannot open a gym''s management of a program herself');
select is(
  (select count(*)::integer from planning.program_versions where id = '019f1600-0000-7000-8000-000000000342'),
  0, 'T-REL-INVITE-PROGRAM-RLS-02 outside the invitation she does not read a version she was only offered');

select access_control.open_contract_scope('invitation_program', pg_temp.program_intent('019f1600-0000-7000-8000-000000000f04'));
select is(
  (select count(*)::integer from planning.program_versions where id = '019f1600-0000-7000-8000-000000000342'),
  1, 'T-REL-INVITE-PROGRAM-RLS-03 program_versions_select_invitation: inside it, the version proposed');
select is(
  (select count(*)::integer from planning.program_version_sessions where program_version_id = '019f1600-0000-7000-8000-000000000342'),
  2, 'T-REL-INVITE-PROGRAM-RLS-04 and through it, its sessions');
-- Retiring is the one write a published version takes; the policy refuses even that.
select is(
  pg_temp.violated($sql$update planning.program_versions set status = 'deprecated' where id = '019f1600-0000-7000-8000-000000000342'$sql$),
  '42501 ', 'T-REL-INVITE-PROGRAM-RLS-05 program_versions_update_invitation_lock holds the version and writes nothing');

select access_control.open_contract_scope('invitation_program', pg_temp.program_intent('019f1600-0000-7000-8000-000000000f01'));
select is(
  pg_temp.violated(format($sql$
    insert into planning.assignment_management_periods (assignment_id, person_id, relationship_id)
    values (%L, '019f1600-0000-7000-8000-000000000001', %L)$sql$,
    :'ana_assignment', :'ana_relationship')),
  '42501 ', 'T-REL-INVITE-PROGRAM-RLS-06 assignment_management_periods_insert_invitation: an answered proposal opens nothing more');

reset role;

-- ———————————————————————————————————— What the table allows

select is(
  pg_temp.violated($sql$
    insert into identity.invitation_intents (invitation_id, kind, proposed_role_code, proposed_program_version_id, proposed_starts_on, proposed_timezone)
    values ('019f1600-0000-7000-8000-000000000f07', 'membership', 'coach', '019f1600-0000-7000-8000-000000000332', current_date, 'America/Bogota')$sql$),
  '23514 ck_invitation_intents_program_proposal', 'T-REL-INVITE-PROGRAM-INT-01 only a program proposal names a program');
select is(
  pg_temp.violated($sql$
    insert into identity.invitation_intents (invitation_id, kind, proposed_starts_on, proposed_timezone)
    values ('019f1600-0000-7000-8000-000000000f07', 'program_assignment', current_date, 'America/Bogota')$sql$),
  '23514 ck_invitation_intents_program_proposal', 'T-REL-INVITE-PROGRAM-INT-02 and a program proposal always does');
select is(
  pg_temp.violated(format($sql$update identity.invitation_intents set unmaterialized_reason = null where id = %L$sql$,
    pg_temp.program_intent('019f1600-0000-7000-8000-000000000f27'))),
  '23514 ck_invitation_intents_decision', 'T-REL-INVITE-PROGRAM-INT-03 an accepted program either exists or says why not');
select is(
  pg_temp.violated(format($sql$update identity.invitation_intents set unmaterialized_reason = 'program_unavailable' where id = %L$sql$,
    pg_temp.program_intent('019f1600-0000-7000-8000-000000000f01'))),
  '23514 ck_invitation_intents_decision', 'T-REL-INVITE-PROGRAM-INT-04 never both');
select is(
  pg_temp.violated(format($sql$update identity.invitation_intents set unmaterialized_reason = 'whatever' where id = %L$sql$,
    pg_temp.program_intent('019f1600-0000-7000-8000-000000000f27'))),
  '23514 ck_invitation_intents_unmaterialized_reason', 'T-REL-INVITE-PROGRAM-INT-05 and only for a reason it knows');

-- ———————————————————————————————————— Reissued by support (OP-IDN-051)

select pg_temp.invite('019f1600-0000-7000-8000-000000000012', 'lapsed@example.test', 'contribute',
  '019f1600-0000-7000-8000-000000000332', :'start3', 'America/Bogota', '019f1600-0000-7000-8000-000000000f31') as ignored \gset
update identity.invitations
set created_at = clock_timestamp() - interval '8 days', expires_at = clock_timestamp() - interval '1 day'
where id = '019f1600-0000-7000-8000-000000000f31';

select set_config('app.actor_kind', 'support', true),
       set_config('app.actor_person_id', '019f1600-0000-7000-8000-000000000042', true);
select (result->>'invitation_id') as reissued from identity.resend_client_invitation(
  '019f1600-0000-7000-8000-000000000042', '019f1600-0000-7000-8000-000000000062',
  '019f1600-0000-7000-8000-000000000101', '019f1600-0000-7000-8000-000000000f31',
  extensions.digest('T-REL-INVITE-PROGRAM-01 reissue', 'sha256'), 1::smallint,
  'a0000000-0000-4000-8000-000000001601', '019f1600-0000-7000-8000-000000000f32',
  decode(repeat('a6', 32), 'hex')
) \gset

select is(
  (select status::text from identity.invitation_intents where id = pg_temp.program_intent('019f1600-0000-7000-8000-000000000f31')),
  'expired', 'T-REL-INVITE-PROGRAM-RSD-01 the lapsed program proposal expired with its invitation');
select is(
  (select row(status, proposed_program_version_id, proposed_starts_on, proposed_timezone)::text
     from identity.invitation_intents where id = pg_temp.program_intent(:'reissued')),
  row('pending', '019f1600-0000-7000-8000-000000000332', :'start3', 'America/Bogota')::text,
  'T-REL-INVITE-PROGRAM-RSD-02 the reissue offers the same program again');

create function pg_temp.forge_reissue(version uuid, starts date, zone text) returns void language plpgsql as $$
declare
  forged uuid := '019f1600-0000-7000-8000-000000000f33';
  original record;
begin
  -- RSD-03 left constraints immediate; the offer is checked once it is whole, as a reissue writes it.
  set constraints all deferred;
  update identity.invitations set status = 'expired' where id = '019f1600-0000-7000-8000-000000000f32';
  select * into original from identity.invitations where id = '019f1600-0000-7000-8000-000000000f31';
  insert into identity.invitations (
    id, organization_id, issued_by_person_id, issued_by_duty_assignment_id, reissues_invitation_id, channel,
    contact, token_hash, token_key_version, proposal_hash, responsible_party, expires_at
  )
  select forged, reissue.organization_id, reissue.issued_by_person_id, reissue.issued_by_duty_assignment_id,
         original.id, reissue.channel, reissue.contact, extensions.digest('forged', 'sha256'), 1,
         original.proposal_hash, reissue.responsible_party, clock_timestamp() + interval '7 days'
  from identity.invitations as reissue where reissue.id = '019f1600-0000-7000-8000-000000000f32';
  insert into identity.invitation_intents (id, invitation_id, kind)
  values ('019f1600-0000-7000-8000-000000000f34', forged, 'service_relationship');
  insert into privacy.invitation_scope_options (
    invitation_intent_id, scope_definition_id, scope_code, offered_access_level, purpose, presented_snapshot
  )
  select '019f1600-0000-7000-8000-000000000f34', option.scope_definition_id, option.scope_code,
         option.offered_access_level, option.purpose, option.presented_snapshot
  from privacy.invitation_scope_options as option
  join identity.invitation_intents as intent on intent.id = option.invitation_intent_id
  where intent.invitation_id = original.id;
  insert into identity.invitation_intents (invitation_id, kind, proposed_program_version_id, proposed_starts_on, proposed_timezone)
  values (forged, 'program_assignment', version, starts, zone);
  set constraints all immediate;
end
$$;

select is(
  pg_temp.violated('set constraints all immediate'),
  'no error', 'T-REL-INVITE-PROGRAM-RSD-03 the honest reissue passes the offer check');
select is(
  pg_temp.failure(format('select pg_temp.forge_reissue(%L, %L, %L)', '019f1600-0000-7000-8000-000000000342', :'start3', 'America/Bogota')),
  '23514 ', 'T-REL-INVITE-PROGRAM-RSD-04 and a reissue that swaps the program is refused');
select is(
  pg_temp.failure(format('select pg_temp.forge_reissue(%L, %L, %L)', '019f1600-0000-7000-8000-000000000332', :'start3', 'America/Lima')),
  '23514 ', 'T-REL-INVITE-PROGRAM-RSD-05 as is one that only moves it to another zone');
select is(
  pg_temp.failure(format('select pg_temp.forge_reissue(%L, %L, %L)', '019f1600-0000-7000-8000-000000000332', :'start3', 'America/Bogota')),
  'no error', 'T-REL-INVITE-PROGRAM-RSD-06 the same forgery with the program unchanged passes, so the swap is what is refused');

select * from finish();
rollback;
