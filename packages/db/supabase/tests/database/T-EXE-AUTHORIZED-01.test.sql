-- T-EXE-AUTHORIZED-01 — OP-EXE-017 and OP-EXE-018 (HU-STUDIO-054, HU-STUDIO-055).
--
-- The coach who attends a person reads what she trained, and only what she shared:
--
--   · A session started on a program the gym manages is produced inside that
--     relationship, and says so for good; anything else she trains is autonomous.
--   · Inside the relationship needs `relationship_training`; autonomous needs
--     `prior_training_history`, and a session she hid from that relationship does not
--     exist for it: not in the list, not in a page boundary, not by id.
--   · Only the holder or an accepted cover reads; being admin or owner is not enough.
--   · Every read is recorded, and so is a refused one: with nothing shared the list is
--     empty and the detail names the scope, and the attempt stays on her record.
--   · The detail carries training results only: no heart rate, no pain, no body weight.
begin;

select plan(63);

insert into identity.people (id, given_name, family_name, status)
values
  ('019f4700-0000-7000-8000-000000000001', 'Ana', 'Client', 'active'),
  ('019f4700-0000-7000-8000-000000000002', 'Bruno', 'Client', 'active'),
  ('019f4700-0000-7000-8000-000000000003', 'Carla', 'Former', 'active'),
  ('019f4700-0000-7000-8000-000000000011', 'Olivia', 'Owner', 'active'),
  ('019f4700-0000-7000-8000-000000000012', 'Camilo', 'Coach', 'active'),
  ('019f4700-0000-7000-8000-000000000013', 'Diana', 'Cover', 'active'),
  ('019f4700-0000-7000-8000-000000000015', 'Fabio', 'Unassigned', 'active'),
  ('019f4700-0000-7000-8000-000000000016', 'Gina', 'Admin', 'active'),
  ('019f4700-0000-7000-8000-000000000021', 'Oscar', 'Owner', 'active'),
  ('019f4700-0000-7000-8000-000000000022', 'Hugo', 'Coach', 'active');

insert into organizations.organizations (id, type_code, display_name, responsible_party)
values
  ('019f4700-0000-7000-8000-000000000101', 'gym', 'Gym A',
   '{"party_kind":"legal_entity","party_name":"Gym A SAS","purpose":"studio_operations"}'),
  ('019f4700-0000-7000-8000-000000000102', 'gym', 'Gym B',
   '{"party_kind":"legal_entity","party_name":"Gym B SAS","purpose":"studio_operations"}');

insert into organizations.organization_memberships (id, organization_id, person_id, status)
values
  ('019f4700-0000-7000-8000-000000000211', '019f4700-0000-7000-8000-000000000101', '019f4700-0000-7000-8000-000000000011', 'active'),
  ('019f4700-0000-7000-8000-000000000212', '019f4700-0000-7000-8000-000000000101', '019f4700-0000-7000-8000-000000000012', 'active'),
  ('019f4700-0000-7000-8000-000000000213', '019f4700-0000-7000-8000-000000000101', '019f4700-0000-7000-8000-000000000013', 'active'),
  ('019f4700-0000-7000-8000-000000000215', '019f4700-0000-7000-8000-000000000101', '019f4700-0000-7000-8000-000000000015', 'active'),
  ('019f4700-0000-7000-8000-000000000216', '019f4700-0000-7000-8000-000000000101', '019f4700-0000-7000-8000-000000000016', 'active'),
  ('019f4700-0000-7000-8000-000000000221', '019f4700-0000-7000-8000-000000000102', '019f4700-0000-7000-8000-000000000021', 'active'),
  ('019f4700-0000-7000-8000-000000000222', '019f4700-0000-7000-8000-000000000102', '019f4700-0000-7000-8000-000000000022', 'active');

insert into organizations.membership_roles (membership_id, role_code)
values
  ('019f4700-0000-7000-8000-000000000211', 'owner'),
  ('019f4700-0000-7000-8000-000000000212', 'coach'),
  ('019f4700-0000-7000-8000-000000000213', 'coach'),
  ('019f4700-0000-7000-8000-000000000215', 'coach'),
  ('019f4700-0000-7000-8000-000000000216', 'admin'),
  ('019f4700-0000-7000-8000-000000000221', 'owner'),
  ('019f4700-0000-7000-8000-000000000222', 'coach');

-- Ana is a client of both gyms; Bruno shares nothing; Carla left Gym A.
insert into relationships.service_relationships (id, person_id, organization_id, status, started_at, ended_at, ended_reason)
values
  ('019f4700-0000-7000-8000-000000000701', '019f4700-0000-7000-8000-000000000001', '019f4700-0000-7000-8000-000000000101', 'active', clock_timestamp() - interval '30 days', null, null),
  ('019f4700-0000-7000-8000-000000000702', '019f4700-0000-7000-8000-000000000002', '019f4700-0000-7000-8000-000000000101', 'active', clock_timestamp() - interval '30 days', null, null),
  ('019f4700-0000-7000-8000-000000000703', '019f4700-0000-7000-8000-000000000003', '019f4700-0000-7000-8000-000000000101', 'terminated', clock_timestamp() - interval '30 days', clock_timestamp() - interval '1 day', 'left'),
  ('019f4700-0000-7000-8000-000000000706', '019f4700-0000-7000-8000-000000000001', '019f4700-0000-7000-8000-000000000102', 'active', clock_timestamp() - interval '30 days', null, null);

insert into relationships.relationship_professional_assignments (
  id, relationship_id, person_id, organization_id, membership_id, covers_membership_id,
  kind, status, ends_on, accepted_by_person_at
) values
  ('019f4700-0000-7000-8000-000000000801', '019f4700-0000-7000-8000-000000000701', '019f4700-0000-7000-8000-000000000001',
   '019f4700-0000-7000-8000-000000000101', '019f4700-0000-7000-8000-000000000212', null, 'holder', 'active', null, null),
  ('019f4700-0000-7000-8000-000000000802', '019f4700-0000-7000-8000-000000000702', '019f4700-0000-7000-8000-000000000002',
   '019f4700-0000-7000-8000-000000000101', '019f4700-0000-7000-8000-000000000212', null, 'holder', 'active', null, null),
  ('019f4700-0000-7000-8000-000000000805', '019f4700-0000-7000-8000-000000000701', '019f4700-0000-7000-8000-000000000001',
   '019f4700-0000-7000-8000-000000000101', '019f4700-0000-7000-8000-000000000213', '019f4700-0000-7000-8000-000000000212',
   'substitute', 'active', (clock_timestamp() + interval '10 days')::date, clock_timestamp()),
  ('019f4700-0000-7000-8000-000000000807', '019f4700-0000-7000-8000-000000000706', '019f4700-0000-7000-8000-000000000001',
   '019f4700-0000-7000-8000-000000000102', '019f4700-0000-7000-8000-000000000222', null, 'holder', 'active', null, null);

insert into privacy.scope_definitions (id, scope_code, version_number, status, published_at)
values
  ('019f4700-0000-7000-8000-000000000301', 'relationship_training', 4, 'published', clock_timestamp()),
  ('019f4700-0000-7000-8000-000000000302', 'prior_training_history', 2, 'published', clock_timestamp());

insert into identity.invitations (
  id, organization_id, issued_by_membership_id, channel, contact,
  token_hash, token_key_version, proposal_hash, responsible_party, status, expires_at
) values (
  '019f4700-0000-7000-8000-000000000401', '019f4700-0000-7000-8000-000000000101',
  '019f4700-0000-7000-8000-000000000211', 'email', 'ana@example.test',
  extensions.digest('authorized-token', 'sha256'), 1, extensions.digest('authorized-proposal', 'sha256'),
  '{"party_kind":"legal_entity","party_name":"Gym A SAS","purpose":"studio_operations"}',
  'completed', clock_timestamp() + interval '7 days'
);
insert into identity.invitation_intents (id, invitation_id, kind, status, proposed_role_code)
values ('019f4700-0000-7000-8000-000000000501', '019f4700-0000-7000-8000-000000000401',
  'service_relationship', 'pending', null);
insert into privacy.invitation_scope_options (
  id, invitation_intent_id, scope_definition_id, scope_code,
  offered_access_level, purpose, presented_snapshot, decision, decided_at
) values
  ('019f4700-0000-7000-8000-000000000601', '019f4700-0000-7000-8000-000000000501',
   '019f4700-0000-7000-8000-000000000301', 'relationship_training', 'read',
   'Follow the training', '{"title":"Training"}'::jsonb, 'accepted', clock_timestamp()),
  ('019f4700-0000-7000-8000-000000000602', '019f4700-0000-7000-8000-000000000501',
   '019f4700-0000-7000-8000-000000000302', 'prior_training_history', 'read',
   'Know the history', '{"title":"History"}'::jsonb, 'accepted', clock_timestamp());

create function pg_temp.share(relationship uuid, grant_id uuid, scope text)
returns void language plpgsql as $$
declare
  subject record;
  option record;
begin
  select person_id, organization_id into subject
  from relationships.service_relationships where id = relationship;
  select id, scope_definition_id into option
  from privacy.invitation_scope_options where scope_code = scope;
  insert into privacy.consent_events (
    id, person_id, relationship_id, organization_id, invitation_scope_option_id,
    scope_definition_id, scope_code, decision, presented_snapshot
  ) values (
    grant_id, subject.person_id, relationship, subject.organization_id, option.id,
    option.scope_definition_id, scope, 'accepted', '{"title":"Shared"}'::jsonb
  );
  insert into privacy.data_grants (
    id, person_id, relationship_id, organization_id, scope_definition_id, scope_code,
    consent_event_id, access_level, purpose
  ) values (
    grant_id, subject.person_id, relationship, subject.organization_id,
    option.scope_definition_id, scope, grant_id, 'read', 'Follow the training'
  );
end
$$;

-- Ana shares both categories with each gym; Bruno shares nothing.
select pg_temp.share('019f4700-0000-7000-8000-000000000701', '019f4700-0000-7000-8000-000000000a01', 'relationship_training');
select pg_temp.share('019f4700-0000-7000-8000-000000000701', '019f4700-0000-7000-8000-000000000a02', 'prior_training_history');
select pg_temp.share('019f4700-0000-7000-8000-000000000706', '019f4700-0000-7000-8000-000000000a06', 'relationship_training');
select pg_temp.share('019f4700-0000-7000-8000-000000000706', '019f4700-0000-7000-8000-000000000a07', 'prior_training_history');

-- Content to start sessions from: Gym A's routine in a program it manages for Ana, her
-- own program, and one the gym stopped managing that she kept as her own.
insert into planning.session_templates (id, content_scope, owner_organization_id, owner_person_id, author_person_id, discipline_code, status)
values
  ('019f4700-0000-7000-8000-000000000311', 'organization', '019f4700-0000-7000-8000-000000000101', null, '019f4700-0000-7000-8000-000000000012', 'test_strength', 'published'),
  ('019f4700-0000-7000-8000-000000000371', 'person', null, '019f4700-0000-7000-8000-000000000001', '019f4700-0000-7000-8000-000000000001', 'test_strength', 'published');
insert into planning.programs (id, content_scope, owner_organization_id, owner_person_id, author_person_id, status)
values
  ('019f4700-0000-7000-8000-000000000331', 'organization', '019f4700-0000-7000-8000-000000000101', null, '019f4700-0000-7000-8000-000000000012', 'published'),
  ('019f4700-0000-7000-8000-000000000381', 'person', null, '019f4700-0000-7000-8000-000000000001', '019f4700-0000-7000-8000-000000000001', 'published');
select set_config('app.planning_publication', 'true', true);
insert into planning.session_template_versions (id, template_id, version_number, discipline_code, activity_type_id, title, content_hash)
values
  ('019f4700-0000-7000-8000-000000000312', '019f4700-0000-7000-8000-000000000311', 1, 'test_strength', '019c0000-0000-7000-8000-000000000011', 'Fuerza A', decode(repeat('e1', 32), 'hex')),
  ('019f4700-0000-7000-8000-000000000372', '019f4700-0000-7000-8000-000000000371', 1, 'test_strength', '019c0000-0000-7000-8000-000000000011', 'Mía', decode(repeat('e2', 32), 'hex'));
insert into planning.program_versions (id, program_id, version_number, title, content_hash, status, repeats_forever)
values
  ('019f4700-0000-7000-8000-000000000332', '019f4700-0000-7000-8000-000000000331', 1, 'Bloque A', decode(repeat('e3', 32), 'hex'), 'published', false),
  ('019f4700-0000-7000-8000-000000000382', '019f4700-0000-7000-8000-000000000381', 1, 'Lo mío', decode(repeat('e4', 32), 'hex'), 'published', false);
insert into planning.program_version_sessions (program_version_id, template_version_id, position, week, day)
values
  ('019f4700-0000-7000-8000-000000000332', '019f4700-0000-7000-8000-000000000312', 1, 1, 1),
  ('019f4700-0000-7000-8000-000000000382', '019f4700-0000-7000-8000-000000000372', 1, 1, 1);
select set_config('app.planning_publication', '', true);

select (clock_timestamp() at time zone 'America/Bogota')::date as today \gset

insert into planning.program_assignments (id, person_id, program_version_id, origin_relationship_id, lifecycle, starts_on, timezone, assigned_at, display_order)
values
  ('019f4700-0000-7000-8000-000000000901', '019f4700-0000-7000-8000-000000000001', '019f4700-0000-7000-8000-000000000382',
   null, 'personal', :'today', 'America/Bogota', clock_timestamp() - interval '3 days', 3),
  ('019f4700-0000-7000-8000-000000000911', '019f4700-0000-7000-8000-000000000001', '019f4700-0000-7000-8000-000000000332',
   '019f4700-0000-7000-8000-000000000701', 'active', :'today', 'America/Bogota', clock_timestamp() - interval '2 days', 1),
  ('019f4700-0000-7000-8000-000000000931', '019f4700-0000-7000-8000-000000000001', '019f4700-0000-7000-8000-000000000332',
   '019f4700-0000-7000-8000-000000000701', 'personal', :'today', 'America/Bogota', clock_timestamp() - interval '4 days', 2);
insert into planning.assignment_management_periods (assignment_id, person_id, relationship_id, started_at, ended_at, end_reason)
values
  ('019f4700-0000-7000-8000-000000000911', '019f4700-0000-7000-8000-000000000001', '019f4700-0000-7000-8000-000000000701',
   clock_timestamp() - interval '2 days', null, null),
  ('019f4700-0000-7000-8000-000000000931', '019f4700-0000-7000-8000-000000000001', '019f4700-0000-7000-8000-000000000701',
   clock_timestamp() - interval '4 days', clock_timestamp() - interval '3 days', 'relationship_ended');
insert into planning.planned_sessions (id, assignment_id, person_id, template_version_id, scheduled_at, timezone, week_starts_on, program_day, status)
values
  ('019f4700-0000-7000-8000-000000000903', '019f4700-0000-7000-8000-000000000901', '019f4700-0000-7000-8000-000000000001',
   '019f4700-0000-7000-8000-000000000372', (:'today'::date)::timestamp at time zone 'America/Bogota', 'America/Bogota', date_trunc('week', :'today'::date)::date, 1, 'scheduled'),
  ('019f4700-0000-7000-8000-000000000912', '019f4700-0000-7000-8000-000000000911', '019f4700-0000-7000-8000-000000000001',
   '019f4700-0000-7000-8000-000000000312', (:'today'::date)::timestamp at time zone 'America/Bogota', 'America/Bogota', date_trunc('week', :'today'::date)::date, 1, 'scheduled'),
  ('019f4700-0000-7000-8000-000000000932', '019f4700-0000-7000-8000-000000000931', '019f4700-0000-7000-8000-000000000001',
   '019f4700-0000-7000-8000-000000000312', (:'today'::date)::timestamp at time zone 'America/Bogota', 'America/Bogota', date_trunc('week', :'today'::date)::date, 1, 'scheduled');

-- What Ana already trained. S1 inside Gym A's relationship, S6 inside Gym B's; the rest
-- on her own: S2 and S3 finished, S4 still open, S5 annulled. Bruno trained once alone.
create function pg_temp.trained(id uuid, person uuid, days integer, context uuid, org uuid)
returns void language sql as $$
  insert into execution.executed_sessions (
    id, person_id, activity_type_id, result_contract_id, contract_version, is_autonomous,
    context_relationship_id, context_organization_id, started_at, ended_at, timezone,
    execution_status, validation_status, requested_level, achieved_level, capture_source
  ) values (
    id, person, '019c0000-0000-7000-8000-000000000011', '019c0000-0000-7000-8000-000000000031', 1,
    context is null, context, org,
    clock_timestamp() - make_interval(days => days), clock_timestamp() - make_interval(days => days) + interval '1 hour',
    'America/Bogota', 'completed', 'valid', 'detailed', 'detailed', 'manual'
  )
$$;
select pg_temp.trained('019f4700-0000-7000-8000-000000000e01', '019f4700-0000-7000-8000-000000000001', 3,
  '019f4700-0000-7000-8000-000000000701', '019f4700-0000-7000-8000-000000000101');
select pg_temp.trained('019f4700-0000-7000-8000-000000000e02', '019f4700-0000-7000-8000-000000000001', 5, null, null);
select pg_temp.trained('019f4700-0000-7000-8000-000000000e03', '019f4700-0000-7000-8000-000000000001', 6, null, null);
select pg_temp.trained('019f4700-0000-7000-8000-000000000e04', '019f4700-0000-7000-8000-000000000001', 1, null, null);
select pg_temp.trained('019f4700-0000-7000-8000-000000000e05', '019f4700-0000-7000-8000-000000000001', 7, null, null);
select pg_temp.trained('019f4700-0000-7000-8000-000000000e06', '019f4700-0000-7000-8000-000000000001', 2,
  '019f4700-0000-7000-8000-000000000706', '019f4700-0000-7000-8000-000000000102');
select pg_temp.trained('019f4700-0000-7000-8000-000000000e11', '019f4700-0000-7000-8000-000000000002', 1, null, null);
update execution.executed_sessions set execution_status = 'in_progress', ended_at = null
where id = '019f4700-0000-7000-8000-000000000e04';
update execution.executed_sessions
set validation_status = 'annulled', annulled_at = clock_timestamp(), annulment_reason = 'duplicate'
where id = '019f4700-0000-7000-8000-000000000e05';

insert into execution.strength_sets (executed_session_id, set_order, achieved_reps, load_value, load_unit_code, rpe)
values
  ('019f4700-0000-7000-8000-000000000e01', 1, 8, 60, 'test_kg', 8),
  ('019f4700-0000-7000-8000-000000000e02', 1, 5, 80, 'test_kg', null),
  ('019f4700-0000-7000-8000-000000000e06', 1, 10, 40, 'test_kg', null);
insert into execution.endurance_laps (executed_session_id, lap_number, distance_value, distance_unit_code, duration_seconds, avg_heart_rate_bpm)
values ('019f4700-0000-7000-8000-000000000e01', 1, 1000, 'test_m', 300, 150);

-- She hid S3 from Gym A and S2 from Gym B.
insert into privacy.session_visibility_denials (person_id, executed_session_id, relationship_id, status, denied_at)
values
  ('019f4700-0000-7000-8000-000000000001', '019f4700-0000-7000-8000-000000000e03', '019f4700-0000-7000-8000-000000000701', 'active', clock_timestamp()),
  ('019f4700-0000-7000-8000-000000000001', '019f4700-0000-7000-8000-000000000e02', '019f4700-0000-7000-8000-000000000706', 'active', clock_timestamp());

create function pg_temp.act(person uuid) returns void language plpgsql as $$
begin
  perform set_config('app.actor_kind', 'person', true);
  perform set_config('app.actor_person_id', person::text, true);
  perform set_config('app.actor_org_id', '', true);
  perform set_config('app.actor_membership_id', '', true);
  perform set_config('app.purpose', '', true);
  perform set_config('app.contract_scope_purpose', '', true);
  perform set_config('app.contract_scope_id', '', true);
  perform set_config('app.contract_scope_token', '', true);
  perform set_config('app.request_id', gen_random_uuid()::text, true);
end
$$;

create function pg_temp.member(person uuid, org uuid, membership uuid) returns void language plpgsql as $$
begin
  perform pg_temp.act(person);
  perform set_config('app.actor_org_id', org::text, true);
  perform set_config('app.actor_membership_id', membership::text, true);
end
$$;

create function pg_temp.sqlstate(statement text) returns text language plpgsql as $$
begin
  execute statement;
  return 'no error';
exception when others then
  return sqlstate;
end
$$;

create function pg_temp.violated(statement text) returns text language plpgsql as $$
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

create function pg_temp.listed(actor uuid, org uuid, subject uuid, page integer default 20,
  after_started timestamptz default null, after_id uuid default null)
returns uuid[] language sql as $$
  select coalesce(array_agg(id order by started_at desc, id desc), '{}')
  from execution.list_authorized_executions(actor, org, subject, page, after_started, after_id)
$$;

-- ---------------------------------------------------------------------------
-- Where a session was produced
-- ---------------------------------------------------------------------------
set local role allfit_api;
select pg_temp.act('019f4700-0000-7000-8000-000000000001');
select id as managed_attempt from execution.start_planned_session_attempt(
  '019f4700-0000-7000-8000-000000000001', '019f4700-0000-7000-8000-000000000912', clock_timestamp(),
  'America/Bogota', 'detailed', 'manual', '7b000000-0000-4000-8000-000000000001',
  '019f4700-0000-7000-8000-000000000f01', decode(repeat('01', 32), 'hex')) \gset
select id as personal_attempt from execution.start_planned_session_attempt(
  '019f4700-0000-7000-8000-000000000001', '019f4700-0000-7000-8000-000000000903', clock_timestamp(),
  'America/Bogota', 'detailed', 'manual', '7b000000-0000-4000-8000-000000000002',
  '019f4700-0000-7000-8000-000000000f02', decode(repeat('02', 32), 'hex')) \gset
select id as kept_attempt from execution.start_planned_session_attempt(
  '019f4700-0000-7000-8000-000000000001', '019f4700-0000-7000-8000-000000000932', clock_timestamp(),
  'America/Bogota', 'detailed', 'manual', '7b000000-0000-4000-8000-000000000003',
  '019f4700-0000-7000-8000-000000000f03', decode(repeat('03', 32), 'hex')) \gset
reset role;

select results_eq(
  format($sql$select is_autonomous, context_relationship_id, context_organization_id
              from execution.executed_sessions where id = %L$sql$, :'managed_attempt'),
  $$values (false, '019f4700-0000-7000-8000-000000000701'::uuid, '019f4700-0000-7000-8000-000000000101'::uuid)$$,
  'T-EXE-AUTHORIZED-INT-01 a session of the program the gym manages is produced inside that relationship');
select results_eq(
  format($sql$select is_autonomous, context_relationship_id from execution.executed_sessions where id = %L$sql$, :'personal_attempt'),
  $$values (true, null::uuid)$$,
  'T-EXE-AUTHORIZED-INT-02 a session of her own program is autonomous');
select results_eq(
  format($sql$select is_autonomous, context_relationship_id from execution.executed_sessions where id = %L$sql$, :'kept_attempt'),
  $$values (true, null::uuid)$$,
  'T-EXE-AUTHORIZED-INT-03 so is one of a program she kept after the gym stopped managing it');

select is(
  pg_temp.violated(format(
    $sql$update execution.executed_sessions set is_autonomous = true, context_relationship_id = null,
         context_organization_id = null where id = %L$sql$, :'managed_attempt')),
  '23514 ',
  'T-EXE-AUTHORIZED-INT-04 where a session was produced never changes afterwards');
select is(
  pg_temp.violated(format(
    $sql$update execution.executed_sessions set is_autonomous = false,
         context_relationship_id = '019f4700-0000-7000-8000-000000000701',
         context_organization_id = '019f4700-0000-7000-8000-000000000101' where id = %L$sql$, :'personal_attempt')),
  '23514 ',
  'T-EXE-AUTHORIZED-INT-05 not even to claim an autonomous one for a relationship');
select is(
  pg_temp.violated($sql$
    insert into execution.executed_sessions (id, person_id, activity_type_id, result_contract_id, contract_version,
      is_autonomous, started_at, timezone, requested_level, capture_source)
    values ('019f4700-0000-7000-8000-000000000e21', '019f4700-0000-7000-8000-000000000001',
      '019c0000-0000-7000-8000-000000000011', '019c0000-0000-7000-8000-000000000031', 1,
      false, clock_timestamp(), 'America/Bogota', 'detailed', 'manual')$sql$),
  '23514 ck_executed_sessions_autonomous',
  'T-EXE-AUTHORIZED-INT-06 a session inside a relationship names it and its gym');
select is(
  pg_temp.violated($sql$
    insert into execution.executed_sessions (id, person_id, activity_type_id, result_contract_id, contract_version,
      is_autonomous, context_relationship_id, context_organization_id, started_at, timezone, requested_level, capture_source)
    values ('019f4700-0000-7000-8000-000000000e22', '019f4700-0000-7000-8000-000000000001',
      '019c0000-0000-7000-8000-000000000011', '019c0000-0000-7000-8000-000000000031', 1,
      false, '019f4700-0000-7000-8000-000000000702', '019f4700-0000-7000-8000-000000000101',
      clock_timestamp(), 'America/Bogota', 'detailed', 'manual')$sql$),
  '23503 fk_executed_sessions_context',
  'T-EXE-AUTHORIZED-INT-07 and only one of her own relationships, with its own gym (IX-14)');

-- ---------------------------------------------------------------------------
-- Row policies
-- ---------------------------------------------------------------------------
set local role allfit_owner;
create temporary table fixture_sessions (id uuid) on commit drop;
reset role;
insert into fixture_sessions values
  ('019f4700-0000-7000-8000-000000000e01'), ('019f4700-0000-7000-8000-000000000e02'),
  ('019f4700-0000-7000-8000-000000000e03'), ('019f4700-0000-7000-8000-000000000e06'),
  ('019f4700-0000-7000-8000-000000000e11');
grant select on fixture_sessions to allfit_owner;
set local role allfit_owner;

select pg_temp.member('019f4700-0000-7000-8000-000000000012', '019f4700-0000-7000-8000-000000000101', '019f4700-0000-7000-8000-000000000212');
select is(
  (select count(*)::integer from execution.executed_sessions join fixture_sessions using (id)),
  0,
  'T-EXE-AUTHORIZED-RLS-01 executed_sessions_select_screening: outside a read that records it, the holder reads nothing of hers');

select access_control.open_contract_scope('session_screening', '019f4700-0000-7000-8000-000000000701');
select is(
  array(select session.id from execution.executed_sessions as session join fixture_sessions using (id) order by session.id),
  array['019f4700-0000-7000-8000-000000000e01'::uuid, '019f4700-0000-7000-8000-000000000e02'::uuid],
  'T-EXE-AUTHORIZED-RLS-02 screened for the relationship: what was trained inside it and what she trained alone, never what she hid from it');
select is(
  (select count(*)::integer from privacy.session_visibility_denials),
  1,
  'T-EXE-AUTHORIZED-RLS-03 session_visibility_denials_select_screening: screening reads that relationship''s denials only');
select is(
  (select count(*)::integer from execution.strength_sets
   where executed_session_id in ('019f4700-0000-7000-8000-000000000e01', '019f4700-0000-7000-8000-000000000e06')),
  1,
  'T-EXE-AUTHORIZED-RLS-04 the results follow the session: its own, not another gym''s');

select access_control.open_contract_scope('session_screening', '019f4700-0000-7000-8000-000000000702');
select is(
  array(select session.id from execution.executed_sessions as session join fixture_sessions using (id) order by session.id),
  '{}'::uuid[],
  'T-EXE-AUTHORIZED-RLS-05 screening another person''s relationship opens nothing of hers, nor of his when he shares nothing');

select pg_temp.member('019f4700-0000-7000-8000-000000000012', '019f4700-0000-7000-8000-000000000101', '019f4700-0000-7000-8000-000000000212');
select is(
  (select count(*)::integer from privacy.session_visibility_denials),
  0,
  'T-EXE-AUTHORIZED-RLS-06 without screening the gym reads none of her denials');

select pg_temp.member('019f4700-0000-7000-8000-000000000015', '019f4700-0000-7000-8000-000000000101', '019f4700-0000-7000-8000-000000000215');
select access_control.open_contract_scope('session_screening', '019f4700-0000-7000-8000-000000000701');
select is(
  (select count(*)::integer from execution.executed_sessions join fixture_sessions using (id)),
  0,
  'T-EXE-AUTHORIZED-RLS-07 a coach who does not attend her reads nothing, screened or not');

select pg_temp.member('019f4700-0000-7000-8000-000000000016', '019f4700-0000-7000-8000-000000000101', '019f4700-0000-7000-8000-000000000216');
select access_control.open_contract_scope('session_screening', '019f4700-0000-7000-8000-000000000701');
select is(
  (select count(*)::integer from execution.executed_sessions join fixture_sessions using (id)),
  0,
  'T-EXE-AUTHORIZED-RLS-08 nor does an administrator by being one');

select pg_temp.member('019f4700-0000-7000-8000-000000000022', '019f4700-0000-7000-8000-000000000102', '019f4700-0000-7000-8000-000000000222');
select access_control.open_contract_scope('session_screening', '019f4700-0000-7000-8000-000000000706');
select is(
  array(select session.id from execution.executed_sessions as session join fixture_sessions using (id) order by session.id),
  array['019f4700-0000-7000-8000-000000000e03'::uuid, '019f4700-0000-7000-8000-000000000e06'::uuid],
  'T-EXE-AUTHORIZED-RLS-09 Gym B reads its own and what she did not hide from it, never Gym A''s');
select access_control.open_contract_scope('session_screening', '019f4700-0000-7000-8000-000000000701');
select is(
  (select count(*)::integer from execution.executed_sessions join fixture_sessions using (id)),
  0,
  'T-EXE-AUTHORIZED-RLS-10 and screening Gym A''s relationship opens nothing to Gym B');

select pg_temp.act('019f4700-0000-7000-8000-000000000001');
select is(
  (select count(*)::integer from execution.executed_sessions join fixture_sessions using (id)),
  4,
  'T-EXE-AUTHORIZED-RLS-11 she reads all of hers, hidden or not');
reset role;

-- ---------------------------------------------------------------------------
-- OP-EXE-017: the list
-- ---------------------------------------------------------------------------
select date_trunc('milliseconds', started_at) as e01_ms from execution.executed_sessions
where id = '019f4700-0000-7000-8000-000000000e01' \gset
select date_trunc('milliseconds', started_at) as e02_ms from execution.executed_sessions
where id = '019f4700-0000-7000-8000-000000000e02' \gset
set local role allfit_api;
select pg_temp.act('019f4700-0000-7000-8000-000000000012');
select current_setting('app.request_id') as camilo_list \gset
select is(
  pg_temp.listed('019f4700-0000-7000-8000-000000000012', '019f4700-0000-7000-8000-000000000101', '019f4700-0000-7000-8000-000000000001'),
  array['019f4700-0000-7000-8000-000000000e01'::uuid, '019f4700-0000-7000-8000-000000000e02'::uuid],
  'T-EXE-AUTHORIZED-API-01 the holder lists, newest first, what was trained inside and what she shared from before');
reset role;
select results_eq(
  format($sql$select data_grant_id, scope_code, scope_version, relationship_id, access_mode::text, resource,
              actor_membership_id, result, purpose
              from privacy.access_events where request_id = %L order by scope_code$sql$, :'camilo_list'),
  $$values
    ('019f4700-0000-7000-8000-000000000a02'::uuid, 'prior_training_history', 2, '019f4700-0000-7000-8000-000000000701'::uuid,
     'live', 'execution.executed_sessions', '019f4700-0000-7000-8000-000000000212'::uuid, 'allowed', 'studio_training_review'),
    ('019f4700-0000-7000-8000-000000000a01'::uuid, 'relationship_training', 4, '019f4700-0000-7000-8000-000000000701'::uuid,
     'live', 'execution.executed_sessions', '019f4700-0000-7000-8000-000000000212'::uuid, 'allowed', 'studio_training_review')$$,
  'T-EXE-AUTHORIZED-API-02 the read is recorded once per category it used, with the version she shared');
set local role allfit_api;

select results_eq(
  $$select id, origin, scope_code, scope_version, planned_session_id
    from execution.list_authorized_executions('019f4700-0000-7000-8000-000000000012', '019f4700-0000-7000-8000-000000000101',
      '019f4700-0000-7000-8000-000000000001', 20, null, null) order by started_at desc$$,
  $$values
    ('019f4700-0000-7000-8000-000000000e01'::uuid, 'relationship', 'relationship_training', 4, null::uuid),
    ('019f4700-0000-7000-8000-000000000e02'::uuid, 'prior', 'prior_training_history', 2, null::uuid)$$,
  'T-EXE-AUTHORIZED-API-03 each says where it was produced and under which category it is shown');

select is(
  pg_temp.listed('019f4700-0000-7000-8000-000000000012', '019f4700-0000-7000-8000-000000000101', '019f4700-0000-7000-8000-000000000001', 1),
  array['019f4700-0000-7000-8000-000000000e01'::uuid],
  'T-EXE-AUTHORIZED-API-04 a page holds what was asked');
select is(
  pg_temp.listed('019f4700-0000-7000-8000-000000000012', '019f4700-0000-7000-8000-000000000101', '019f4700-0000-7000-8000-000000000001', 1,
    :'e01_ms'::timestamptz,
    '019f4700-0000-7000-8000-000000000e01'),
  array['019f4700-0000-7000-8000-000000000e02'::uuid],
  'T-EXE-AUTHORIZED-API-05 and the next one starts right after it');
select is(
  pg_temp.listed('019f4700-0000-7000-8000-000000000012', '019f4700-0000-7000-8000-000000000101', '019f4700-0000-7000-8000-000000000001', 1,
    :'e02_ms'::timestamptz,
    '019f4700-0000-7000-8000-000000000e02'),
  '{}'::uuid[],
  'T-EXE-AUTHORIZED-API-06 with no gap where the hidden one would be: after the last there is nothing');

select pg_temp.act('019f4700-0000-7000-8000-000000000013');
select is(
  pg_temp.listed('019f4700-0000-7000-8000-000000000013', '019f4700-0000-7000-8000-000000000101', '019f4700-0000-7000-8000-000000000001'),
  array['019f4700-0000-7000-8000-000000000e01'::uuid, '019f4700-0000-7000-8000-000000000e02'::uuid],
  'T-EXE-AUTHORIZED-API-07 an accepted cover reads the same');

select pg_temp.act('019f4700-0000-7000-8000-000000000022');
select is(
  pg_temp.listed('019f4700-0000-7000-8000-000000000022', '019f4700-0000-7000-8000-000000000102', '019f4700-0000-7000-8000-000000000001'),
  array['019f4700-0000-7000-8000-000000000e06'::uuid, '019f4700-0000-7000-8000-000000000e03'::uuid],
  'T-EXE-AUTHORIZED-API-08 Gym B lists its own and what she did not hide from it');

select pg_temp.act('019f4700-0000-7000-8000-000000000015');
select is(
  pg_temp.sqlstate($$select pg_temp.listed('019f4700-0000-7000-8000-000000000015', '019f4700-0000-7000-8000-000000000101', '019f4700-0000-7000-8000-000000000001')$$),
  'P0002', 'T-EXE-AUTHORIZED-API-09 a coach who does not attend her finds no such client');
select pg_temp.act('019f4700-0000-7000-8000-000000000016');
select is(
  pg_temp.sqlstate($$select pg_temp.listed('019f4700-0000-7000-8000-000000000016', '019f4700-0000-7000-8000-000000000101', '019f4700-0000-7000-8000-000000000001')$$),
  'P0002', 'T-EXE-AUTHORIZED-API-10 nor does an administrator');
select pg_temp.act('019f4700-0000-7000-8000-000000000011');
select is(
  pg_temp.sqlstate($$select pg_temp.listed('019f4700-0000-7000-8000-000000000011', '019f4700-0000-7000-8000-000000000101', '019f4700-0000-7000-8000-000000000001')$$),
  'P0002', 'T-EXE-AUTHORIZED-API-11 nor the owner');
select pg_temp.act('019f4700-0000-7000-8000-000000000022');
select is(
  pg_temp.sqlstate($$select pg_temp.listed('019f4700-0000-7000-8000-000000000022', '019f4700-0000-7000-8000-000000000101', '019f4700-0000-7000-8000-000000000001')$$),
  '42501', 'T-EXE-AUTHORIZED-API-12 another gym''s coach is not a member here');
select pg_temp.act('019f4700-0000-7000-8000-000000000012');
select is(
  pg_temp.sqlstate($$select pg_temp.listed('019f4700-0000-7000-8000-000000000012', '019f4700-0000-7000-8000-000000000101', '019f4700-0000-7000-8000-000000000003')$$),
  'P0002', 'T-EXE-AUTHORIZED-API-13 a client who left is no longer listed live');
select is(
  pg_temp.sqlstate($$select pg_temp.listed('019f4700-0000-7000-8000-000000000011', '019f4700-0000-7000-8000-000000000101', '019f4700-0000-7000-8000-000000000001')$$),
  '42501', 'T-EXE-AUTHORIZED-API-14 nobody lists as somebody else');
select set_config('app.request_id', '', true);
select is(
  pg_temp.sqlstate($$select pg_temp.listed('019f4700-0000-7000-8000-000000000012', '019f4700-0000-7000-8000-000000000101', '019f4700-0000-7000-8000-000000000001')$$),
  '22023', 'T-EXE-AUTHORIZED-API-15 a read with no request to record it under is refused');

select pg_temp.act('019f4700-0000-7000-8000-000000000012');
select current_setting('app.request_id') as bruno_list \gset
select is(
  pg_temp.listed('019f4700-0000-7000-8000-000000000012', '019f4700-0000-7000-8000-000000000101', '019f4700-0000-7000-8000-000000000002'),
  '{}'::uuid[],
  'T-EXE-AUTHORIZED-API-16 with nothing shared the list is empty');
reset role;
select results_eq(
  format($sql$select subject_person_id, relationship_id, data_grant_id, scope_code, result, resource
              from privacy.access_events where request_id = %L$sql$, :'bruno_list'),
  $$values ('019f4700-0000-7000-8000-000000000002'::uuid, '019f4700-0000-7000-8000-000000000702'::uuid,
            null::uuid, null::text, 'denied', 'execution.executed_sessions')$$,
  'T-EXE-AUTHORIZED-API-17 and the attempt stays on his record as refused');

set local role allfit_api;
select pg_temp.act('019f4700-0000-7000-8000-000000000012');
select cardinality(pg_temp.listed('019f4700-0000-7000-8000-000000000012', '019f4700-0000-7000-8000-000000000101',
  '019f4700-0000-7000-8000-000000000001')) as screened_count \gset
reset role;
set local role allfit_owner;
select is(
  (select count(*)::integer from execution.executed_sessions where person_id = '019f4700-0000-7000-8000-000000000001'),
  0,
  'T-EXE-AUTHORIZED-API-38 the list closes the screening it opened: right after it, nothing of hers is visible');
reset role;
set local role allfit_api;

-- ---------------------------------------------------------------------------
-- OP-EXE-018: one session
-- ---------------------------------------------------------------------------
select pg_temp.act('019f4700-0000-7000-8000-000000000012');
select current_setting('app.request_id') as camilo_detail \gset
select execution.read_authorized_execution(
  '019f4700-0000-7000-8000-000000000012', '019f4700-0000-7000-8000-000000000101',
  '019f4700-0000-7000-8000-000000000001', '019f4700-0000-7000-8000-000000000e01') as inside \gset
select is(:'inside'::jsonb->>'outcome', 'found', 'T-EXE-AUTHORIZED-API-18 the holder reads a session trained inside the relationship');
select is(
  (:'inside'::jsonb #> '{execution,strength_sets,0}') - 'movement_name' - 'segment_position' - 'movement_id',
  '{"order": 1, "achieved_reps": 8, "load": {"value": 60, "unit": "test_kg"}, "rpe": 8}'::jsonb,
  'T-EXE-AUTHORIZED-API-19 with its sets, loads, reps and effort');
select is(
  :'inside'::jsonb #> '{execution,endurance_laps,0}' ? 'avg_heart_rate_bpm',
  false,
  'T-EXE-AUTHORIZED-API-20 and no heart rate under any category');
select is(
  (select array_agg(key order by key) from jsonb_object_keys(:'inside'::jsonb->'execution') as key
   where key in ('body_weight', 'pain_reports', 'capture_source', 'capture_provenance')),
  null,
  'T-EXE-AUTHORIZED-API-21 nor pain, body weight or what device captured it');
select is(
  :'inside'::jsonb #> '{execution,applied_scope}',
  '{"code": "relationship_training", "version": 4}'::jsonb,
  'T-EXE-AUTHORIZED-API-22 it names the category and the version she shared');
reset role;
select results_eq(
  format($sql$select data_grant_id, scope_code, result from privacy.access_events where request_id = %L$sql$, :'camilo_detail'),
  $$values ('019f4700-0000-7000-8000-000000000a01'::uuid, 'relationship_training', 'allowed')$$,
  'T-EXE-AUTHORIZED-API-23 and the read is recorded under that grant');
set local role allfit_api;

select pg_temp.act('019f4700-0000-7000-8000-000000000012');
select current_setting('app.request_id') as prior_detail \gset
select is(
  execution.read_authorized_execution(
    '019f4700-0000-7000-8000-000000000012', '019f4700-0000-7000-8000-000000000101',
    '019f4700-0000-7000-8000-000000000001', '019f4700-0000-7000-8000-000000000e02') #> '{execution,applied_scope}',
  '{"code": "prior_training_history", "version": 2}'::jsonb,
  'T-EXE-AUTHORIZED-API-24 one she trained alone is shown under her history');
reset role;
select results_eq(
  format($sql$select data_grant_id, scope_code, result from privacy.access_events where request_id = %L$sql$, :'prior_detail'),
  $$values ('019f4700-0000-7000-8000-000000000a02'::uuid, 'prior_training_history', 'allowed')$$,
  'T-EXE-AUTHORIZED-API-39 and that read is recorded under her history grant');
set local role allfit_owner;
select is(
  (select count(*)::integer from execution.executed_sessions where person_id = '019f4700-0000-7000-8000-000000000001'),
  0,
  'T-EXE-AUTHORIZED-API-40 the detail closes its screening too');
reset role;
set local role allfit_api;

select pg_temp.act('019f4700-0000-7000-8000-000000000012');
select current_setting('app.request_id') as hidden_detail \gset
select is(
  (select array_agg(execution.read_authorized_execution(
     '019f4700-0000-7000-8000-000000000012', '019f4700-0000-7000-8000-000000000101',
     '019f4700-0000-7000-8000-000000000001', session_id)->>'outcome' order by session_id)
   from unnest(array['019f4700-0000-7000-8000-000000000e03', '019f4700-0000-7000-8000-000000000e04',
                     '019f4700-0000-7000-8000-000000000e05', '019f4700-0000-7000-8000-000000000e06',
                     '019f4700-0000-7000-8000-000000000e11', '019f4700-0000-7000-8000-000000000e99']::uuid[]) as session_id),
  array['not_found', 'not_found', 'not_found', 'not_found', 'not_found', 'not_found'],
  'T-EXE-AUTHORIZED-API-25 hidden, unfinished, annulled, another gym''s, another person''s and none at all read the same: not found');
reset role;
select is(
  (select count(*)::integer from privacy.access_events where request_id = :'hidden_detail' and result = 'denied'),
  6,
  'T-EXE-AUTHORIZED-API-26 each of those attempts is recorded as refused');
set local role allfit_api;

select pg_temp.act('019f4700-0000-7000-8000-000000000012');
select current_setting('app.request_id') as bruno_detail \gset
select is(
  execution.read_authorized_execution(
    '019f4700-0000-7000-8000-000000000012', '019f4700-0000-7000-8000-000000000101',
    '019f4700-0000-7000-8000-000000000002', '019f4700-0000-7000-8000-000000000e11'),
  '{"outcome": "scope_required", "required_scope": {"code": "relationship_training", "level": "read"}}'::jsonb,
  'T-EXE-AUTHORIZED-API-27 with nothing shared the detail names what is missing, whichever session was asked for');
reset role;
select is(
  (select count(*)::integer from privacy.access_events where request_id = :'bruno_detail' and result = 'denied'),
  1,
  'T-EXE-AUTHORIZED-API-28 and that refusal is recorded too');
set local role allfit_api;

select pg_temp.act('019f4700-0000-7000-8000-000000000015');
select is(
  pg_temp.sqlstate($$select execution.read_authorized_execution(
    '019f4700-0000-7000-8000-000000000015', '019f4700-0000-7000-8000-000000000101',
    '019f4700-0000-7000-8000-000000000001', '019f4700-0000-7000-8000-000000000e01')$$),
  'P0002', 'T-EXE-AUTHORIZED-API-29 a coach who does not attend her finds no such client');
select pg_temp.act('019f4700-0000-7000-8000-000000000016');
select is(
  pg_temp.sqlstate($$select execution.read_authorized_execution(
    '019f4700-0000-7000-8000-000000000016', '019f4700-0000-7000-8000-000000000101',
    '019f4700-0000-7000-8000-000000000001', '019f4700-0000-7000-8000-000000000e01')$$),
  'P0002', 'T-EXE-AUTHORIZED-API-30 nor an administrator');
select pg_temp.act('019f4700-0000-7000-8000-000000000012');
select set_config('app.request_id', '', true);
select is(
  pg_temp.sqlstate($$select execution.read_authorized_execution(
    '019f4700-0000-7000-8000-000000000012', '019f4700-0000-7000-8000-000000000101',
    '019f4700-0000-7000-8000-000000000001', '019f4700-0000-7000-8000-000000000e01')$$),
  '22023', 'T-EXE-AUTHORIZED-API-45 a detail with no request to record it under is refused');

-- ---------------------------------------------------------------------------
-- What it was planned as, and a session shared again
-- ---------------------------------------------------------------------------
reset role;
update execution.executed_sessions
set execution_status = 'completed', ended_at = started_at + interval '1 hour', achieved_level = 'detailed'
where id = :'managed_attempt';
update privacy.session_visibility_denials set status = 'reverted', restored_at = clock_timestamp()
where executed_session_id = '019f4700-0000-7000-8000-000000000e03'
  and relationship_id = '019f4700-0000-7000-8000-000000000701';
set local role allfit_api;
select pg_temp.act('019f4700-0000-7000-8000-000000000012');
select is(
  execution.read_authorized_execution(
    '019f4700-0000-7000-8000-000000000012', '019f4700-0000-7000-8000-000000000101',
    '019f4700-0000-7000-8000-000000000001', :'managed_attempt') #>> '{execution,planned_session_id}',
  '019f4700-0000-7000-8000-000000000912',
  'T-EXE-AUTHORIZED-API-41 a session of the program the gym manages names the planned session it was');
select results_eq(
  $$select id::text, planned_session_id
    from execution.list_authorized_executions('019f4700-0000-7000-8000-000000000012', '019f4700-0000-7000-8000-000000000101',
      '019f4700-0000-7000-8000-000000000001', 1, null, null)$$,
  format($sql$values (%L, '019f4700-0000-7000-8000-000000000912'::uuid)$sql$, :'managed_attempt'),
  'T-EXE-AUTHORIZED-API-42 and the list says so too');
select is(
  pg_temp.listed('019f4700-0000-7000-8000-000000000012', '019f4700-0000-7000-8000-000000000101', '019f4700-0000-7000-8000-000000000001')
    @> array['019f4700-0000-7000-8000-000000000e03'::uuid],
  true,
  'T-EXE-AUTHORIZED-API-43 a session she shares again is listed again');

-- ---------------------------------------------------------------------------
-- Taking it back
-- ---------------------------------------------------------------------------
reset role;
update privacy.data_grants set status = 'revoked', revoked_at = clock_timestamp()
where id = '019f4700-0000-7000-8000-000000000a01';
set local role allfit_api;
select pg_temp.act('019f4700-0000-7000-8000-000000000012');
select is(
  pg_temp.listed('019f4700-0000-7000-8000-000000000012', '019f4700-0000-7000-8000-000000000101', '019f4700-0000-7000-8000-000000000001'),
  array['019f4700-0000-7000-8000-000000000e02'::uuid, '019f4700-0000-7000-8000-000000000e03'::uuid],
  'T-EXE-AUTHORIZED-API-31 once she takes her training back, what was trained inside is gone at once');
select is(
  execution.read_authorized_execution(
    '019f4700-0000-7000-8000-000000000012', '019f4700-0000-7000-8000-000000000101',
    '019f4700-0000-7000-8000-000000000001', '019f4700-0000-7000-8000-000000000e01')->>'outcome',
  'not_found',
  'T-EXE-AUTHORIZED-API-32 by id too');

reset role;
update privacy.data_grants set status = 'revoked', revoked_at = clock_timestamp()
where id = '019f4700-0000-7000-8000-000000000a02';
set local role allfit_api;
select pg_temp.act('019f4700-0000-7000-8000-000000000012');
select is(
  pg_temp.listed('019f4700-0000-7000-8000-000000000012', '019f4700-0000-7000-8000-000000000101', '019f4700-0000-7000-8000-000000000001'),
  '{}'::uuid[],
  'T-EXE-AUTHORIZED-API-33 and with her history taken back too, nothing at all');
select is(
  execution.read_authorized_execution(
    '019f4700-0000-7000-8000-000000000012', '019f4700-0000-7000-8000-000000000101',
    '019f4700-0000-7000-8000-000000000001', '019f4700-0000-7000-8000-000000000e02')->>'outcome',
  'scope_required',
  'T-EXE-AUTHORIZED-API-34 and the detail names what is missing');
reset role;

-- A long history still comes a bounded page at a time.
select pg_temp.trained(format('019f4700-0000-7000-8000-%s', lpad((5000 + n)::text, 12, '0'))::uuid,
  '019f4700-0000-7000-8000-000000000001', 10 + n, null, null)
from generate_series(1, 101) as n;
set local role allfit_api;
select pg_temp.act('019f4700-0000-7000-8000-000000000022');
select is(
  cardinality(pg_temp.listed('019f4700-0000-7000-8000-000000000022', '019f4700-0000-7000-8000-000000000102',
    '019f4700-0000-7000-8000-000000000001', 500)),
  101,
  'T-EXE-AUTHORIZED-API-44 however many are asked for, a page holds at most 101');
reset role;

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------
select ok(
  has_function_privilege('allfit_api', 'execution.list_authorized_executions(uuid, uuid, uuid, integer, timestamptz, uuid)', 'execute')
  and has_function_privilege('allfit_api', 'execution.read_authorized_execution(uuid, uuid, uuid, uuid)', 'execute'),
  'T-EXE-AUTHORIZED-API-35 the API runs both reads');
select ok(
  not has_function_privilege('public', 'execution.list_authorized_executions(uuid, uuid, uuid, integer, timestamptz, uuid)', 'execute')
  and not has_function_privilege('public', 'execution.read_authorized_execution(uuid, uuid, uuid, uuid)', 'execute'),
  'T-EXE-AUTHORIZED-API-36 nobody else does');
select ok(
  not has_table_privilege('allfit_api', 'privacy.session_visibility_denials', 'select')
  and not has_table_privilege('allfit_api', 'execution.executed_sessions', 'select'),
  'T-EXE-AUTHORIZED-API-37 and nothing reads the tables directly');

select * from finish();
rollback;
