-- T-PLN-RELASSIGN-01 — OP-PLN-010 and OP-PLN-018 (HU-STUDIO-046, HU-STUDIO-047).
--
-- A gym gives a client a program through the relationship, and reads back only what it
-- gave. What has to hold:
--
--   · Only the coach who attends the person, holder or accepted cover, assigns or reads,
--     and only while the person shares her training (`relationship_training`). Missing
--     the permission says which one.
--   · Only a published version of the organization's own program enters, and the whole
--     calendar is planted in the person's time zone — the one her device last sent.
--   · Retrying converges; overlapping another program warns and never blocks.
--   · The gym sees the assignments its relationship originated and nothing else: not the
--     person's own programs, not another organization's. Each read leaves a trace.
--   · The person sees the gym's program in Space as hers to train, and only the version
--     she was given.
--   · Ending the relationship detaches what it managed: paused, not deleted.
begin;

select plan(65);

insert into identity.people (id, given_name, family_name, status)
values
  ('019f3900-0000-7000-8000-000000000001', 'Ana', 'Client', 'active'),
  ('019f3900-0000-7000-8000-000000000002', 'Bruno', 'Client', 'active'),
  ('019f3900-0000-7000-8000-000000000003', 'Carla', 'Client', 'active'),
  ('019f3900-0000-7000-8000-000000000004', 'Dario', 'Client', 'active'),
  ('019f3900-0000-7000-8000-000000000011', 'Olivia', 'Owner', 'active'),
  ('019f3900-0000-7000-8000-000000000012', 'Camilo', 'Coach', 'active'),
  ('019f3900-0000-7000-8000-000000000013', 'Diana', 'Cover', 'active'),
  ('019f3900-0000-7000-8000-000000000014', 'Ernesto', 'Proposed', 'active'),
  ('019f3900-0000-7000-8000-000000000015', 'Fabio', 'Unassigned', 'active'),
  ('019f3900-0000-7000-8000-000000000016', 'Gina', 'Admin', 'active'),
  ('019f3900-0000-7000-8000-000000000017', 'Sara', 'Staff', 'active'),
  ('019f3900-0000-7000-8000-000000000021', 'Oscar', 'Owner', 'active'),
  ('019f3900-0000-7000-8000-000000000022', 'Hugo', 'Coach', 'active');

insert into organizations.organizations (id, type_code, display_name, responsible_party)
values
  ('019f3900-0000-7000-8000-000000000101', 'gym', 'Gym A',
   '{"party_kind":"legal_entity","party_name":"Gym A SAS","purpose":"studio_operations"}'),
  ('019f3900-0000-7000-8000-000000000102', 'gym', 'Gym B',
   '{"party_kind":"legal_entity","party_name":"Gym B SAS","purpose":"studio_operations"}');

insert into organizations.organization_memberships (id, organization_id, person_id, status)
values
  ('019f3900-0000-7000-8000-000000000211', '019f3900-0000-7000-8000-000000000101', '019f3900-0000-7000-8000-000000000011', 'active'),
  ('019f3900-0000-7000-8000-000000000212', '019f3900-0000-7000-8000-000000000101', '019f3900-0000-7000-8000-000000000012', 'active'),
  ('019f3900-0000-7000-8000-000000000213', '019f3900-0000-7000-8000-000000000101', '019f3900-0000-7000-8000-000000000013', 'active'),
  ('019f3900-0000-7000-8000-000000000214', '019f3900-0000-7000-8000-000000000101', '019f3900-0000-7000-8000-000000000014', 'active'),
  ('019f3900-0000-7000-8000-000000000215', '019f3900-0000-7000-8000-000000000101', '019f3900-0000-7000-8000-000000000015', 'active'),
  ('019f3900-0000-7000-8000-000000000216', '019f3900-0000-7000-8000-000000000101', '019f3900-0000-7000-8000-000000000016', 'active'),
  ('019f3900-0000-7000-8000-000000000217', '019f3900-0000-7000-8000-000000000101', '019f3900-0000-7000-8000-000000000017', 'active'),
  ('019f3900-0000-7000-8000-000000000221', '019f3900-0000-7000-8000-000000000102', '019f3900-0000-7000-8000-000000000021', 'active'),
  ('019f3900-0000-7000-8000-000000000222', '019f3900-0000-7000-8000-000000000102', '019f3900-0000-7000-8000-000000000022', 'active');

insert into organizations.membership_roles (membership_id, role_code)
values
  ('019f3900-0000-7000-8000-000000000211', 'owner'),
  ('019f3900-0000-7000-8000-000000000212', 'coach'),
  ('019f3900-0000-7000-8000-000000000213', 'coach'),
  ('019f3900-0000-7000-8000-000000000214', 'coach'),
  ('019f3900-0000-7000-8000-000000000215', 'coach'),
  ('019f3900-0000-7000-8000-000000000216', 'admin'),
  ('019f3900-0000-7000-8000-000000000217', 'staff'),
  ('019f3900-0000-7000-8000-000000000221', 'owner'),
  ('019f3900-0000-7000-8000-000000000222', 'coach');

-- Ana is a client of both gyms; Bruno shares read only; Carla shares nothing; Dario never
-- opened Space, so no device ever said where he lives.
insert into relationships.service_relationships (id, person_id, organization_id, status)
values
  ('019f3900-0000-7000-8000-000000000701', '019f3900-0000-7000-8000-000000000001', '019f3900-0000-7000-8000-000000000101', 'active'),
  ('019f3900-0000-7000-8000-000000000702', '019f3900-0000-7000-8000-000000000002', '019f3900-0000-7000-8000-000000000101', 'active'),
  ('019f3900-0000-7000-8000-000000000703', '019f3900-0000-7000-8000-000000000003', '019f3900-0000-7000-8000-000000000101', 'active'),
  ('019f3900-0000-7000-8000-000000000704', '019f3900-0000-7000-8000-000000000004', '019f3900-0000-7000-8000-000000000101', 'active'),
  ('019f3900-0000-7000-8000-000000000706', '019f3900-0000-7000-8000-000000000001', '019f3900-0000-7000-8000-000000000102', 'active');

insert into relationships.relationship_professional_assignments (
  id, relationship_id, person_id, organization_id, membership_id, covers_membership_id,
  kind, status, ends_on, accepted_by_person_at
) values
  ('019f3900-0000-7000-8000-000000000801', '019f3900-0000-7000-8000-000000000701', '019f3900-0000-7000-8000-000000000001',
   '019f3900-0000-7000-8000-000000000101', '019f3900-0000-7000-8000-000000000212', null, 'holder', 'active', null, null),
  ('019f3900-0000-7000-8000-000000000802', '019f3900-0000-7000-8000-000000000702', '019f3900-0000-7000-8000-000000000002',
   '019f3900-0000-7000-8000-000000000101', '019f3900-0000-7000-8000-000000000212', null, 'holder', 'active', null, null),
  ('019f3900-0000-7000-8000-000000000803', '019f3900-0000-7000-8000-000000000703', '019f3900-0000-7000-8000-000000000003',
   '019f3900-0000-7000-8000-000000000101', '019f3900-0000-7000-8000-000000000212', null, 'holder', 'active', null, null),
  ('019f3900-0000-7000-8000-000000000804', '019f3900-0000-7000-8000-000000000704', '019f3900-0000-7000-8000-000000000004',
   '019f3900-0000-7000-8000-000000000101', '019f3900-0000-7000-8000-000000000212', null, 'holder', 'active', null, null),
  ('019f3900-0000-7000-8000-000000000805', '019f3900-0000-7000-8000-000000000701', '019f3900-0000-7000-8000-000000000001',
   '019f3900-0000-7000-8000-000000000101', '019f3900-0000-7000-8000-000000000213', '019f3900-0000-7000-8000-000000000212',
   'substitute', 'active', (clock_timestamp() + interval '10 days')::date, clock_timestamp()),
  ('019f3900-0000-7000-8000-000000000806', '019f3900-0000-7000-8000-000000000701', '019f3900-0000-7000-8000-000000000001',
   '019f3900-0000-7000-8000-000000000101', '019f3900-0000-7000-8000-000000000214', '019f3900-0000-7000-8000-000000000212',
   'substitute', 'proposed', (clock_timestamp() + interval '10 days')::date, null),
  ('019f3900-0000-7000-8000-000000000807', '019f3900-0000-7000-8000-000000000706', '019f3900-0000-7000-8000-000000000001',
   '019f3900-0000-7000-8000-000000000102', '019f3900-0000-7000-8000-000000000222', null, 'holder', 'active', null, null);

-- The chain a grant requires: scope, invitation, intent, option and decision.
insert into privacy.scope_definitions (id, scope_code, version_number, status, published_at)
values ('019f3900-0000-7000-8000-000000000301', 'relationship_training', 3, 'published', clock_timestamp());

insert into identity.invitations (
  id, organization_id, issued_by_membership_id, channel, contact,
  token_hash, token_key_version, proposal_hash, responsible_party, status, expires_at
) values (
  '019f3900-0000-7000-8000-000000000401', '019f3900-0000-7000-8000-000000000101',
  '019f3900-0000-7000-8000-000000000211', 'email', 'ana@example.test',
  extensions.digest('relassign-token', 'sha256'), 1, extensions.digest('relassign-proposal', 'sha256'),
  '{"party_kind":"legal_entity","party_name":"Gym A SAS","purpose":"studio_operations"}',
  'completed', clock_timestamp() + interval '7 days'
);
insert into identity.invitation_intents (id, invitation_id, kind, status, proposed_role_code)
values ('019f3900-0000-7000-8000-000000000501', '019f3900-0000-7000-8000-000000000401',
  'service_relationship', 'pending', null);
insert into privacy.invitation_scope_options (
  id, invitation_intent_id, scope_definition_id, scope_code,
  offered_access_level, purpose, presented_snapshot, decision, decided_at
) values (
  '019f3900-0000-7000-8000-000000000601', '019f3900-0000-7000-8000-000000000501',
  '019f3900-0000-7000-8000-000000000301', 'relationship_training', 'contribute',
  'Plan the training', '{"title":"Training"}'::jsonb, 'accepted', clock_timestamp()
);

create function pg_temp.share(relationship uuid, grant_id uuid, level privacy.access_level)
returns void language plpgsql as $$
declare
  subject record;
begin
  select person_id, organization_id into subject
  from relationships.service_relationships where id = relationship;
  insert into privacy.consent_events (
    id, person_id, relationship_id, organization_id, invitation_scope_option_id,
    scope_definition_id, scope_code, decision, presented_snapshot
  ) values (
    grant_id, subject.person_id, relationship, subject.organization_id,
    '019f3900-0000-7000-8000-000000000601', '019f3900-0000-7000-8000-000000000301',
    'relationship_training', 'accepted', '{"title":"Training"}'::jsonb
  );
  insert into privacy.data_grants (
    id, person_id, relationship_id, organization_id, scope_definition_id, scope_code,
    consent_event_id, access_level, purpose
  ) values (
    grant_id, subject.person_id, relationship, subject.organization_id,
    '019f3900-0000-7000-8000-000000000301', 'relationship_training', grant_id, level,
    'Plan the training'
  );
end
$$;

select pg_temp.share('019f3900-0000-7000-8000-000000000701', '019f3900-0000-7000-8000-000000000a01', 'contribute');
select pg_temp.share('019f3900-0000-7000-8000-000000000702', '019f3900-0000-7000-8000-000000000a02', 'read');
select pg_temp.share('019f3900-0000-7000-8000-000000000704', '019f3900-0000-7000-8000-000000000a04', 'contribute');
select pg_temp.share('019f3900-0000-7000-8000-000000000706', '019f3900-0000-7000-8000-000000000a06', 'contribute');

-- Content. Gym A: a finite program (v1 published, v2 deprecated), an open-ended one and a
-- routine nobody planned. Gym B: one program. Ana: her own program, which she follows.
insert into planning.session_templates (id, content_scope, owner_organization_id, owner_person_id, author_person_id, discipline_code, status)
values
  ('019f3900-0000-7000-8000-000000000311', 'organization', '019f3900-0000-7000-8000-000000000101', null, '019f3900-0000-7000-8000-000000000012', 'test_strength', 'published'),
  ('019f3900-0000-7000-8000-000000000321', 'organization', '019f3900-0000-7000-8000-000000000101', null, '019f3900-0000-7000-8000-000000000012', 'test_strength', 'published'),
  ('019f3900-0000-7000-8000-000000000391', 'organization', '019f3900-0000-7000-8000-000000000101', null, '019f3900-0000-7000-8000-000000000012', 'test_strength', 'published'),
  ('019f3900-0000-7000-8000-000000000361', 'organization', '019f3900-0000-7000-8000-000000000102', null, '019f3900-0000-7000-8000-000000000022', 'test_strength', 'published'),
  ('019f3900-0000-7000-8000-000000000371', 'person', null, '019f3900-0000-7000-8000-000000000001', '019f3900-0000-7000-8000-000000000001', 'test_strength', 'published');
insert into planning.programs (id, content_scope, owner_organization_id, owner_person_id, author_person_id, status)
values
  ('019f3900-0000-7000-8000-000000000331', 'organization', '019f3900-0000-7000-8000-000000000101', null, '019f3900-0000-7000-8000-000000000012', 'published'),
  ('019f3900-0000-7000-8000-000000000341', 'organization', '019f3900-0000-7000-8000-000000000101', null, '019f3900-0000-7000-8000-000000000012', 'published'),
  ('019f3900-0000-7000-8000-000000000351', 'organization', '019f3900-0000-7000-8000-000000000102', null, '019f3900-0000-7000-8000-000000000022', 'published'),
  ('019f3900-0000-7000-8000-000000000381', 'person', null, '019f3900-0000-7000-8000-000000000001', '019f3900-0000-7000-8000-000000000001', 'published');

select set_config('app.planning_publication', 'true', true);
insert into planning.session_template_versions (id, template_id, version_number, discipline_code, activity_type_id, title, content_hash)
values
  ('019f3900-0000-7000-8000-000000000312', '019f3900-0000-7000-8000-000000000311', 1, 'test_strength', '019c0000-0000-7000-8000-000000000011', 'Fuerza A', decode(repeat('e1', 32), 'hex')),
  ('019f3900-0000-7000-8000-000000000322', '019f3900-0000-7000-8000-000000000321', 1, 'test_strength', '019c0000-0000-7000-8000-000000000011', 'Movilidad A', decode(repeat('e2', 32), 'hex')),
  ('019f3900-0000-7000-8000-000000000392', '019f3900-0000-7000-8000-000000000391', 1, 'test_strength', '019c0000-0000-7000-8000-000000000011', 'Oculta A', decode(repeat('e3', 32), 'hex')),
  ('019f3900-0000-7000-8000-000000000362', '019f3900-0000-7000-8000-000000000361', 1, 'test_strength', '019c0000-0000-7000-8000-000000000011', 'Fuerza B', decode(repeat('e4', 32), 'hex')),
  ('019f3900-0000-7000-8000-000000000372', '019f3900-0000-7000-8000-000000000371', 1, 'test_strength', '019c0000-0000-7000-8000-000000000011', 'Mía', decode(repeat('e5', 32), 'hex'));
insert into planning.program_versions (id, program_id, version_number, title, content_hash, status, repeats_forever)
values
  ('019f3900-0000-7000-8000-000000000332', '019f3900-0000-7000-8000-000000000331', 1, 'Bloque A', decode(repeat('f1', 32), 'hex'), 'published', false),
  ('019f3900-0000-7000-8000-000000000333', '019f3900-0000-7000-8000-000000000331', 2, 'Bloque A v2', decode(repeat('f2', 32), 'hex'), 'deprecated', false),
  ('019f3900-0000-7000-8000-000000000342', '019f3900-0000-7000-8000-000000000341', 1, 'Abierto A', decode(repeat('f3', 32), 'hex'), 'published', true),
  ('019f3900-0000-7000-8000-000000000352', '019f3900-0000-7000-8000-000000000351', 1, 'Bloque B', decode(repeat('f4', 32), 'hex'), 'published', false),
  ('019f3900-0000-7000-8000-000000000382', '019f3900-0000-7000-8000-000000000381', 1, 'Lo mío', decode(repeat('f5', 32), 'hex'), 'published', false);
insert into planning.program_version_sessions (program_version_id, template_version_id, position, week, day)
values
  ('019f3900-0000-7000-8000-000000000332', '019f3900-0000-7000-8000-000000000312', 1, 1, 1),
  ('019f3900-0000-7000-8000-000000000332', '019f3900-0000-7000-8000-000000000322', 2, 1, 3),
  ('019f3900-0000-7000-8000-000000000332', '019f3900-0000-7000-8000-000000000312', 3, 2, 1),
  ('019f3900-0000-7000-8000-000000000332', '019f3900-0000-7000-8000-000000000322', 4, 2, 3),
  ('019f3900-0000-7000-8000-000000000333', '019f3900-0000-7000-8000-000000000312', 1, 1, 1),
  ('019f3900-0000-7000-8000-000000000342', '019f3900-0000-7000-8000-000000000312', 1, 1, 1),
  ('019f3900-0000-7000-8000-000000000342', '019f3900-0000-7000-8000-000000000322', 2, 2, 2),
  ('019f3900-0000-7000-8000-000000000352', '019f3900-0000-7000-8000-000000000362', 1, 1, 1),
  ('019f3900-0000-7000-8000-000000000382', '019f3900-0000-7000-8000-000000000372', 1, 1, 1);
select set_config('app.planning_publication', '', true);

-- Ana's own program, the one her phone set up yesterday in Bogotá, and an older one taken
-- in Madrid. The newest decides her zone.
insert into planning.program_assignments (id, person_id, program_version_id, lifecycle, starts_on, timezone, assigned_at, display_order)
values
  ('019f3900-0000-7000-8000-000000000901', '019f3900-0000-7000-8000-000000000001', '019f3900-0000-7000-8000-000000000382',
   'personal', (clock_timestamp() at time zone 'America/Bogota')::date, 'America/Bogota', clock_timestamp() - interval '1 day', 1),
  ('019f3900-0000-7000-8000-000000000902', '019f3900-0000-7000-8000-000000000001', '019f3900-0000-7000-8000-000000000382',
   'ended', (clock_timestamp() at time zone 'Europe/Madrid')::date - 30, 'Europe/Madrid', clock_timestamp() - interval '30 days', 2);
insert into planning.planned_sessions (id, assignment_id, person_id, template_version_id, scheduled_at, timezone, week_starts_on, program_day)
values (
  '019f3900-0000-7000-8000-000000000903', '019f3900-0000-7000-8000-000000000901', '019f3900-0000-7000-8000-000000000001',
  '019f3900-0000-7000-8000-000000000372',
  ((clock_timestamp() at time zone 'America/Bogota')::date)::timestamp at time zone 'America/Bogota', 'America/Bogota',
  date_trunc('week', clock_timestamp() at time zone 'America/Bogota')::date,
  extract(isodow from clock_timestamp() at time zone 'America/Bogota')::integer
);

select (clock_timestamp() at time zone 'America/Bogota')::date as today \gset

create function pg_temp.act(person uuid) returns void language plpgsql as $$
begin
  perform set_config('app.actor_kind', 'person', true);
  perform set_config('app.actor_person_id', person::text, true);
  perform set_config('app.actor_org_id', '', true);
  perform set_config('app.actor_membership_id', '', true);
  perform set_config('app.purpose', '', true);
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

create function pg_temp.assign(actor uuid, org uuid, relationship uuid, version uuid, starts date, tz text, idem uuid)
returns table (result jsonb, replayed boolean) language sql as $$
  select * from planning.assign_program_from_relationship(
    actor, org, relationship, version, starts, tz, idem, idem, extensions.digest(idem::text, 'sha256'))
$$;

create function pg_temp.try_assign(actor uuid, org uuid, relationship uuid, version uuid, starts date, tz text)
returns text language sql as $$
  select pg_temp.failure(format(
    'select * from pg_temp.assign(%L, %L, %L, %L, %L, %L, gen_random_uuid())',
    actor, org, relationship, version, starts, tz))
$$;

create function pg_temp.list(actor uuid, org uuid, relationship uuid)
returns setof jsonb language sql as $$
  select result from planning.list_relationship_assignments(actor, org, relationship, 25, null, null)
$$;

set local role allfit_api;

-- ———————————————————————————————————— Who cannot assign

select pg_temp.act('019f3900-0000-7000-8000-000000000017');
select is(pg_temp.try_assign('019f3900-0000-7000-8000-000000000017', '019f3900-0000-7000-8000-000000000101',
  '019f3900-0000-7000-8000-000000000701', '019f3900-0000-7000-8000-000000000332', :'today', 'America/Bogota'),
  '42501 ', 'T-PLN-RELASSIGN-RLS-01 staff cannot assign a program');

select pg_temp.act('019f3900-0000-7000-8000-000000000016');
select is(pg_temp.try_assign('019f3900-0000-7000-8000-000000000016', '019f3900-0000-7000-8000-000000000101',
  '019f3900-0000-7000-8000-000000000701', '019f3900-0000-7000-8000-000000000332', :'today', 'America/Bogota'),
  '42501 ', 'T-PLN-RELASSIGN-RLS-02 nor can an administrator who does not coach');

select pg_temp.act('019f3900-0000-7000-8000-000000000015');
select is(pg_temp.try_assign('019f3900-0000-7000-8000-000000000015', '019f3900-0000-7000-8000-000000000101',
  '019f3900-0000-7000-8000-000000000701', '019f3900-0000-7000-8000-000000000332', :'today', 'America/Bogota'),
  'P0002 ', 'T-PLN-RELASSIGN-RLS-03 a coach who does not attend her does not find the relationship');

select pg_temp.act('019f3900-0000-7000-8000-000000000014');
select is(pg_temp.try_assign('019f3900-0000-7000-8000-000000000014', '019f3900-0000-7000-8000-000000000101',
  '019f3900-0000-7000-8000-000000000701', '019f3900-0000-7000-8000-000000000332', :'today', 'America/Bogota'),
  'P0002 ', 'T-PLN-RELASSIGN-RLS-04 a cover the person never accepted is not one');

select pg_temp.act('019f3900-0000-7000-8000-000000000022');
select is(pg_temp.try_assign('019f3900-0000-7000-8000-000000000022', '019f3900-0000-7000-8000-000000000102',
  '019f3900-0000-7000-8000-000000000701', '019f3900-0000-7000-8000-000000000352', :'today', 'America/Bogota'),
  'P0002 ', 'T-PLN-RELASSIGN-RLS-05 another gym''s coach does not reach this relationship through her own gym');

select pg_temp.act('019f3900-0000-7000-8000-000000000021');
select is(pg_temp.try_assign('019f3900-0000-7000-8000-000000000021', '019f3900-0000-7000-8000-000000000101',
  '019f3900-0000-7000-8000-000000000701', '019f3900-0000-7000-8000-000000000332', :'today', 'America/Bogota'),
  '42501 ', 'T-PLN-RELASSIGN-RLS-06 nor through a gym she does not belong to');

-- ———————————————————————————————————— The permission, named

select pg_temp.act('019f3900-0000-7000-8000-000000000012');
select is(pg_temp.try_assign('019f3900-0000-7000-8000-000000000012', '019f3900-0000-7000-8000-000000000101',
  '019f3900-0000-7000-8000-000000000703', '019f3900-0000-7000-8000-000000000332', :'today', 'America/Bogota'),
  'AF430 relationship_training:contribute', 'T-PLN-RELASSIGN-RLS-07 without the training permission the refusal names it');
select is(pg_temp.try_assign('019f3900-0000-7000-8000-000000000012', '019f3900-0000-7000-8000-000000000101',
  '019f3900-0000-7000-8000-000000000702', '019f3900-0000-7000-8000-000000000332', :'today', 'America/Bogota'),
  'AF430 relationship_training:contribute', 'T-PLN-RELASSIGN-RLS-08 and reading is not enough to plan');

-- ———————————————————————————————————— What can be given

select is(pg_temp.try_assign('019f3900-0000-7000-8000-000000000012', '019f3900-0000-7000-8000-000000000101',
  '019f3900-0000-7000-8000-000000000701', '019f3900-0000-7000-8000-000000000333', :'today', 'America/Bogota'),
  '22023 ["program-version"]', 'T-PLN-RELASSIGN-INT-01 a retired version cannot be assigned (STUDIO-36)');
select is(pg_temp.try_assign('019f3900-0000-7000-8000-000000000012', '019f3900-0000-7000-8000-000000000101',
  '019f3900-0000-7000-8000-000000000701', '019f3900-0000-7000-8000-000000000352', :'today', 'America/Bogota'),
  '22023 ["program-version"]', 'T-PLN-RELASSIGN-INT-02 nor another gym''s program');
select is(pg_temp.try_assign('019f3900-0000-7000-8000-000000000012', '019f3900-0000-7000-8000-000000000101',
  '019f3900-0000-7000-8000-000000000701', '019f3900-0000-7000-8000-000000000382', :'today', 'America/Bogota'),
  '22023 ["program-version"]', 'T-PLN-RELASSIGN-INT-03 nor the person''s own program');
select is(pg_temp.try_assign('019f3900-0000-7000-8000-000000000012', '019f3900-0000-7000-8000-000000000101',
  '019f3900-0000-7000-8000-000000000701', '019f3900-0000-7000-8000-000000000332', (:'today'::date - 1), 'America/Bogota'),
  '22023 ["starts-on"]', 'T-PLN-RELASSIGN-INT-04 a plan cannot start in the past of the person''s own day');
select is(pg_temp.try_assign('019f3900-0000-7000-8000-000000000012', '019f3900-0000-7000-8000-000000000101',
  '019f3900-0000-7000-8000-000000000704', '019f3900-0000-7000-8000-000000000332', :'today', null),
  '22023 ["timezone"]', 'T-PLN-RELASSIGN-INT-05 with no device zone and none sent there is no calendar to plant');
select is(pg_temp.try_assign('019f3900-0000-7000-8000-000000000012', '019f3900-0000-7000-8000-000000000101',
  '019f3900-0000-7000-8000-000000000704', '019f3900-0000-7000-8000-000000000332', :'today', 'Mars/Olympus'),
  '22023 ["timezone"]', 'T-PLN-RELASSIGN-INT-06 and an invented zone is not one');

-- ———————————————————————————————————— Camilo assigns the finite program to Ana

select result as finite from pg_temp.assign(
  '019f3900-0000-7000-8000-000000000012', '019f3900-0000-7000-8000-000000000101',
  '019f3900-0000-7000-8000-000000000701', '019f3900-0000-7000-8000-000000000332',
  :'today', 'Asia/Tokyo', '019f3900-0000-4000-8000-000000000001') \gset
select (:'finite'::jsonb->>'id') as finite_id \gset

select is(:'finite'::jsonb->>'timezone', 'America/Bogota',
  'T-PLN-RELASSIGN-INT-07 the calendar uses the zone her device last sent, not the one Studio guessed');
select is((:'finite'::jsonb->>'planned_sessions_created')::integer, 4,
  'T-PLN-RELASSIGN-INT-08 a finite version is planted whole, in the same transaction');
select is((:'finite'::jsonb->>'schedule_overlaps')::boolean, true,
  'T-PLN-RELASSIGN-INT-09 overlapping the program she already follows is reported');
select is(:'finite'::jsonb->>'status', 'active', 'T-PLN-RELASSIGN-INT-10 and does not stop the assignment');
select is(:'finite'::jsonb->'management'->>'relationship_id', '019f3900-0000-7000-8000-000000000701',
  'T-PLN-RELASSIGN-INT-11 the gym manages it through this relationship');

select is(
  (select row(replayed, result->>'id', (result->>'planned_sessions_created')::integer)::text
     from pg_temp.assign('019f3900-0000-7000-8000-000000000012', '019f3900-0000-7000-8000-000000000101',
       '019f3900-0000-7000-8000-000000000701', '019f3900-0000-7000-8000-000000000332',
       :'today', 'Asia/Tokyo', '019f3900-0000-4000-8000-000000000001')),
  row(true, :'finite_id', 4)::text,
  'T-PLN-RELASSIGN-IDEM-01 retrying returns the same assignment and plants nothing twice');

-- Diana covers Camilo with Ana's acceptance; she can plan too.
select pg_temp.act('019f3900-0000-7000-8000-000000000013');
select result as open from pg_temp.assign(
  '019f3900-0000-7000-8000-000000000013', '019f3900-0000-7000-8000-000000000101',
  '019f3900-0000-7000-8000-000000000701', '019f3900-0000-7000-8000-000000000342',
  :'today', 'America/Bogota', '019f3900-0000-4000-8000-000000000002') \gset
select (:'open'::jsonb->>'id') as open_id \gset
select is((:'open'::jsonb->>'planned_sessions_created')::integer, 1,
  'T-PLN-RELASSIGN-INT-12 an accepted cover assigns, and an open-ended version plants only its first week');

select pg_temp.act('019f3900-0000-7000-8000-000000000012');
select result as dario from pg_temp.assign(
  '019f3900-0000-7000-8000-000000000012', '019f3900-0000-7000-8000-000000000101',
  '019f3900-0000-7000-8000-000000000704', '019f3900-0000-7000-8000-000000000332',
  :'today', 'America/Mexico_City', '019f3900-0000-4000-8000-000000000003') \gset
select is(:'dario'::jsonb->>'timezone', 'America/Mexico_City',
  'T-PLN-RELASSIGN-INT-13 a person no device ever placed gets the zone Studio sent');
select is((:'dario'::jsonb->>'schedule_overlaps')::boolean, false,
  'T-PLN-RELASSIGN-INT-14 and with nothing else on his calendar nothing overlaps');

select pg_temp.act('019f3900-0000-7000-8000-000000000022');
select result as gym_b from pg_temp.assign(
  '019f3900-0000-7000-8000-000000000022', '019f3900-0000-7000-8000-000000000102',
  '019f3900-0000-7000-8000-000000000706', '019f3900-0000-7000-8000-000000000352',
  :'today', 'America/Bogota', '019f3900-0000-4000-8000-000000000004') \gset

reset role;

select is(
  (select array_agg(distinct timezone) from planning.planned_sessions where assignment_id = :'finite_id'),
  array['America/Bogota'], 'T-PLN-RELASSIGN-INT-15 every planted session carries her zone');
select ok(
  (select bool_and((scheduled_at at time zone timezone)::date >= :'today'::date)
     from planning.planned_sessions where assignment_id = :'finite_id'),
  'T-PLN-RELASSIGN-INT-16 and none is planted before the day it starts');
select is(
  (select row(lifecycle::text, origin_relationship_id::text)::text
     from planning.program_assignments where id = :'finite_id'),
  row('active', '019f3900-0000-7000-8000-000000000701')::text,
  'T-PLN-RELASSIGN-INT-17 the assignment is managed and says where it came from');
select ok(
  (select display_order from planning.program_assignments where id = :'finite_id')
    < (select display_order from planning.program_assignments where id = '019f3900-0000-7000-8000-000000000901'),
  'T-PLN-RELASSIGN-INT-18 and goes in front of what she already had');
select is(
  (select count(*)::integer from planning.assignment_management_periods
    where assignment_id = :'finite_id' and relationship_id = '019f3900-0000-7000-8000-000000000701'
      and ended_at is null),
  1, 'T-PLN-RELASSIGN-INT-19 a management period opens with it');
select is(
  (select count(*)::integer from system.outbox_events
    where event_type = 'planning.assignment_created.v1' and aggregate_id = :'finite_id'),
  1, 'T-PLN-RELASSIGN-INT-20 and the event is written once, retry included');

select throws_ok(
  format($q$update planning.program_assignments set origin_relationship_id = '019f3900-0000-7000-8000-000000000704' where id = %L$q$, :'finite_id'),
  '23514', null, 'T-PLN-RELASSIGN-INT-21 the relationship it came from cannot be rewritten');
select throws_ok(
  format($q$update planning.program_assignments set origin_relationship_id = null where id = %L$q$, :'finite_id'),
  '23514', null, 'T-PLN-RELASSIGN-INT-22 nor erased');
select throws_ok(
  $q$insert into planning.program_assignments (person_id, program_version_id, lifecycle, starts_on, timezone, display_order)
     values ('019f3900-0000-7000-8000-000000000003', '019f3900-0000-7000-8000-000000000332', 'active', current_date, 'UTC', 0)$q$,
  '23514', null, 'T-PLN-RELASSIGN-INT-23 a managed assignment without a relationship cannot exist');

-- ———————————————————————————————————— What the gym reads back

set local role allfit_api;
select pg_temp.act('019f3900-0000-7000-8000-000000000012');

select is(
  (select array_agg(item->>'id' order by item->>'id') from pg_temp.list(
     '019f3900-0000-7000-8000-000000000012', '019f3900-0000-7000-8000-000000000101',
     '019f3900-0000-7000-8000-000000000701') as item),
  (select array_agg(id order by id) from unnest(array[:'finite_id', :'open_id']) as id),
  'T-PLN-RELASSIGN-RLS-09 the gym reads the assignments its relationship originated, not her own nor another gym''s');
select is(
  (select item->>'id' from pg_temp.list(
     '019f3900-0000-7000-8000-000000000012', '019f3900-0000-7000-8000-000000000101',
     '019f3900-0000-7000-8000-000000000701') as item limit 1),
  :'open_id', 'T-PLN-RELASSIGN-INT-24 newest first');
select is(
  (select jsonb_array_length(item->'sessions') from pg_temp.list(
     '019f3900-0000-7000-8000-000000000012', '019f3900-0000-7000-8000-000000000101',
     '019f3900-0000-7000-8000-000000000701') as item where item->>'id' = :'finite_id'),
  4, 'T-PLN-RELASSIGN-INT-25 with its sessions');
reset role;
select is(
  (select count(*)::integer from privacy.access_events
    where subject_person_id = '019f3900-0000-7000-8000-000000000001'
      and relationship_id = '019f3900-0000-7000-8000-000000000701'
      and data_grant_id = '019f3900-0000-7000-8000-000000000a01'
      and scope_code = 'relationship_training' and scope_version = 3
      and access_mode = 'live' and resource = 'planning.program_assignments'
      and actor_membership_id = '019f3900-0000-7000-8000-000000000212'),
  3, 'T-PLN-RELASSIGN-RLS-10 each read leaves a trace with the grant and the version it relied on');
set local role allfit_api;

select set_config('app.request_id', '', true);
select is(pg_temp.failure($q$select * from pg_temp.list('019f3900-0000-7000-8000-000000000012',
  '019f3900-0000-7000-8000-000000000101', '019f3900-0000-7000-8000-000000000701')$q$),
  '22023 ', 'T-PLN-RELASSIGN-RLS-11 a read that cannot be traced does not happen');
select pg_temp.act('019f3900-0000-7000-8000-000000000012');

select is(
  (select count(*)::integer from pg_temp.list('019f3900-0000-7000-8000-000000000012',
     '019f3900-0000-7000-8000-000000000101', '019f3900-0000-7000-8000-000000000702')),
  0, 'T-PLN-RELASSIGN-RLS-12 reading needs only read');
select is(pg_temp.failure($q$select * from pg_temp.list('019f3900-0000-7000-8000-000000000012',
  '019f3900-0000-7000-8000-000000000101', '019f3900-0000-7000-8000-000000000703')$q$),
  'AF430 relationship_training:read', 'T-PLN-RELASSIGN-RLS-13 and without it the refusal names it');

select pg_temp.act('019f3900-0000-7000-8000-000000000015');
select is(pg_temp.failure($q$select * from pg_temp.list('019f3900-0000-7000-8000-000000000015',
  '019f3900-0000-7000-8000-000000000101', '019f3900-0000-7000-8000-000000000701')$q$),
  'P0002 ', 'T-PLN-RELASSIGN-RLS-14 a coach who does not attend her reads nothing');
-- Owner and admin see the directory, so the relationship is visible to them: being
-- visible is not attending her, and her training is read only by who attends her.
select pg_temp.act('019f3900-0000-7000-8000-000000000016');
select is(pg_temp.failure($q$select * from pg_temp.list('019f3900-0000-7000-8000-000000000016',
  '019f3900-0000-7000-8000-000000000101', '019f3900-0000-7000-8000-000000000701')$q$),
  'P0002 ', 'T-PLN-RELASSIGN-RLS-26 an administrator who sees the directory does not read her training');
select pg_temp.act('019f3900-0000-7000-8000-000000000011');
select is(pg_temp.failure($q$select * from pg_temp.list('019f3900-0000-7000-8000-000000000011',
  '019f3900-0000-7000-8000-000000000101', '019f3900-0000-7000-8000-000000000701')$q$),
  'P0002 ', 'T-PLN-RELASSIGN-RLS-27 nor does the owner');

reset role;

select ok(
  has_function_privilege('allfit_api',
    'planning.assign_program_from_relationship(uuid,uuid,uuid,uuid,date,text,uuid,uuid,bytea)', 'execute')
  and has_function_privilege('allfit_api',
    'planning.list_relationship_assignments(uuid,uuid,uuid,integer,timestamp with time zone,uuid)', 'execute')
  and not exists (
    select 1 from pg_proc as fn, aclexplode(fn.proacl) as acl
    where fn.oid in ('planning.assign_program_from_relationship(uuid,uuid,uuid,uuid,date,text,uuid,uuid,bytea)'::regprocedure,
                     'planning.list_relationship_assignments(uuid,uuid,uuid,integer,timestamp with time zone,uuid)'::regprocedure)
      and acl.grantee = 0),
  'T-PLN-RELASSIGN-RLS-15 only the runtime role runs them');

-- ———————————————————————————————————— Row policies, read directly

set local role allfit_owner;

select pg_temp.act('019f3900-0000-7000-8000-000000000012');
select set_config('app.actor_org_id', '019f3900-0000-7000-8000-000000000101', true);
select is(
  (select count(*)::integer from planning.program_assignments),
  3, 'T-PLN-RELASSIGN-RLS-16 the coach''s row policy shows the managed assignments of her clients and nothing personal');
select is(
  (select count(*)::integer from planning.planned_sessions),
  9, 'T-PLN-RELASSIGN-RLS-17 and only their sessions');
select throws_ok(
  $q$insert into planning.program_assignments (person_id, program_version_id, origin_relationship_id, lifecycle, starts_on, timezone, display_order)
     values ('019f3900-0000-7000-8000-000000000003', '019f3900-0000-7000-8000-000000000332',
             '019f3900-0000-7000-8000-000000000703', 'active', current_date, 'UTC', 0)$q$,
  '42501', null, 'T-PLN-RELASSIGN-RLS-18 no row can be written for a client who does not share her training');

select pg_temp.act('019f3900-0000-7000-8000-000000000015');
select set_config('app.actor_org_id', '019f3900-0000-7000-8000-000000000101', true);
select is((select count(*)::integer from planning.program_assignments), 0,
  'T-PLN-RELASSIGN-RLS-19 a coach who attends nobody sees no assignment');

select pg_temp.act('019f3900-0000-7000-8000-000000000022');
select set_config('app.actor_org_id', '019f3900-0000-7000-8000-000000000102', true);
select is((select count(*)::integer from planning.program_assignments), 1,
  'T-PLN-RELASSIGN-RLS-20 the other gym sees only what it assigned');

-- ———————————————————————————————————— Space: hers to train

select pg_temp.act('019f3900-0000-7000-8000-000000000001');
select is(
  (select count(*)::integer from planning.program_versions
    where program_id = '019f3900-0000-7000-8000-000000000331'),
  1, 'T-PLN-RELASSIGN-RLS-21 she reads the version she was given and not its retired sibling');
select is(
  (select count(*)::integer from planning.session_template_versions
    where id in ('019f3900-0000-7000-8000-000000000312', '019f3900-0000-7000-8000-000000000392')),
  1, 'T-PLN-RELASSIGN-RLS-22 and the routines it plans, not the rest of the gym''s catalogue');

select is(
  (select row(program_title, sessions->0->>'title')::text
     from planning.read_week_plan('019f3900-0000-7000-8000-000000000001', 'America/Bogota')),
  row('Bloque B', 'Fuerza B')::text,
  'T-PLN-RELASSIGN-INT-26 her week opens on the program a gym gave her last');
select is(
  (select array_agg(coalesce(managed_by, '-') order by managed_by nulls first)
     from planning.read_my_programs('019f3900-0000-7000-8000-000000000001')),
  array['-', 'Gym A', 'Gym A', 'Gym B'],
  'T-PLN-RELASSIGN-INT-27 her programs list them and say which gym manages each');
select is(
  (select bool_or(editable) from planning.read_my_programs('019f3900-0000-7000-8000-000000000001')
    where managed_by is not null),
  false, 'T-PLN-RELASSIGN-INT-28 and a gym''s program is not hers to edit');

-- Next week: the open-ended program's calendar moves one week back, as T-PLN-OPEN-01 does.
reset role;
update planning.program_assignments set starts_on = starts_on - 7 where id = :'open_id';
update planning.planned_sessions
set week_starts_on = week_starts_on - 7, scheduled_at = scheduled_at - interval '7 days'
where assignment_id = :'open_id';
set local role allfit_owner;
select pg_temp.act('019f3900-0000-7000-8000-000000000001');
select count(*) from planning.read_week_plan('019f3900-0000-7000-8000-000000000001', 'America/Bogota');
reset role;
select is(
  (select array_agg(template_version_id::text order by week_starts_on)
     from planning.planned_sessions where assignment_id = :'open_id'),
  array['019f3900-0000-7000-8000-000000000312', '019f3900-0000-7000-8000-000000000322'],
  'T-PLN-RELASSIGN-INT-29 reading her week plants the next one of the gym''s open-ended program');

set local role allfit_api;
select pg_temp.act('019f3900-0000-7000-8000-000000000001');
select is(
  planning.reorder_my_programs('019f3900-0000-7000-8000-000000000001',
    array[:'finite_id', '019f3900-0000-7000-8000-000000000901', :'open_id', (:'gym_b'::jsonb->>'id')]::uuid[],
    '019f3900-0000-4000-8000-000000000005', '019f3900-0000-4000-8000-000000000005',
    extensions.digest('reorder', 'sha256')),
  4, 'T-PLN-RELASSIGN-INT-30 she orders the gym''s programs among her own');

-- ———————————————————————————————————— Ending the relationship detaches

reset role;
-- A session she finished stays finished.
update planning.planned_sessions set status = 'completed'
where id = (select id from planning.planned_sessions where assignment_id = :'finite_id'
            order by scheduled_at limit 1);

set local role allfit_api;
select pg_temp.act('019f3900-0000-7000-8000-000000000011');
select * from relationships.terminate_relationship(
  '019f3900-0000-7000-8000-000000000011', '019f3900-0000-7000-8000-000000000101',
  '019f3900-0000-7000-8000-000000000701', null,
  '019f3900-0000-4000-8000-000000000006', '019f3900-0000-4000-8000-000000000006',
  extensions.digest('terminate', 'sha256'));

reset role;
select is(
  (select array_agg(distinct lifecycle::text) from planning.program_assignments
    where origin_relationship_id = '019f3900-0000-7000-8000-000000000701'),
  array['detached_pending_choice'],
  'T-PLN-RELASSIGN-INT-31 terminating detaches every assignment the relationship managed');
select is(
  (select count(*)::integer from planning.assignment_management_periods as period
     join relationships.service_relationships as relationship on relationship.id = period.relationship_id
    where period.relationship_id = '019f3900-0000-7000-8000-000000000701'
      and period.end_reason = 'relationship_ended' and period.ended_at = relationship.ended_at),
  2, 'T-PLN-RELASSIGN-INT-32 closing each period at the same instant the relationship ended');
select is(
  (select count(*)::integer from planning.planned_sessions as session
     join planning.program_assignments as assignment on assignment.id = session.assignment_id
    where assignment.origin_relationship_id = '019f3900-0000-7000-8000-000000000701'
      and session.status = 'scheduled'),
  0, 'T-PLN-RELASSIGN-INT-33 no session of theirs is left waiting to be trained');
select is(
  (select count(*)::integer from planning.planned_sessions
    where assignment_id = :'finite_id' and status = 'completed'),
  1, 'T-PLN-RELASSIGN-INT-34 and what she finished is still hers, finished');
select is(
  (select count(*)::integer from system.outbox_events
    where event_type = 'planning.assignment_detached.v1'
      and aggregate_id in (:'finite_id', :'open_id')),
  2, 'T-PLN-RELASSIGN-INT-35 each detachment is announced');
select is(
  (select count(*)::integer from planning.program_assignments
    where id = '019f3900-0000-7000-8000-000000000901' and lifecycle = 'personal'),
  1, 'T-PLN-RELASSIGN-INT-36 and her own program is untouched');

set local role allfit_api;
select pg_temp.act('019f3900-0000-7000-8000-000000000012');
select is(pg_temp.failure($q$select * from pg_temp.list('019f3900-0000-7000-8000-000000000012',
  '019f3900-0000-7000-8000-000000000101', '019f3900-0000-7000-8000-000000000701')$q$),
  'P0002 ', 'T-PLN-RELASSIGN-RLS-23 after the end the gym no longer reads them');
select is(pg_temp.try_assign('019f3900-0000-7000-8000-000000000012', '019f3900-0000-7000-8000-000000000101',
  '019f3900-0000-7000-8000-000000000701', '019f3900-0000-7000-8000-000000000332', :'today', 'America/Bogota'),
  'P0002 ', 'T-PLN-RELASSIGN-RLS-24 nor assigns anything new');

reset role;
set local role allfit_owner;
select pg_temp.act('019f3900-0000-7000-8000-000000000012');
select set_config('app.actor_org_id', '019f3900-0000-7000-8000-000000000101', true);
select is(
  (select count(*)::integer from planning.program_assignments
    where origin_relationship_id = '019f3900-0000-7000-8000-000000000701'),
  0, 'T-PLN-RELASSIGN-RLS-25 not even through the row policy');

select pg_temp.act('019f3900-0000-7000-8000-000000000001');
select is(
  (select array_agg(coalesce(managed_by, '-') order by managed_by nulls first)
     from planning.read_my_programs('019f3900-0000-7000-8000-000000000001')),
  array['-', 'Gym B'],
  'T-PLN-RELASSIGN-INT-37 and Space stops offering what nobody manages any more');

select * from finish();
rollback;
