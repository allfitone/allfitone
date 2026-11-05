-- T-PLN-MANAGE-01 — OP-PLN-012, OP-PLN-013 and OP-PLN-014 (HU-STUDIO-048, 049, 050).
--
-- While the gym manages a program it gave, the coach moves a session and adjusts the
-- prescription for this one person, and the gym can stop the program. What has to hold:
--
--   · Only while the gym manages it, and only the coach who attends the person (holder or
--     accepted cover) with the person's training shared at `contribute`; the admin and
--     the owner may also cancel. Missing the permission says which one.
--   · A session moves inside its week, never into the past, never once started, and the
--     revision the coach read must still be current. Its content never changes.
--   · An adjustment lives on the assignment, typed and authored; the published routine
--     stays as it was. Space trains the adjusted target, and the adjustment survives the
--     relationship ending.
--   · Cancelling stops only what was still to come: the past, what was trained and the
--     assignment itself stay. Cancelling again converges.
begin;

select plan(102);

insert into identity.people (id, given_name, family_name, status)
values
  ('019f4100-0000-7000-8000-000000000001', 'Ana', 'Client', 'active'),
  ('019f4100-0000-7000-8000-000000000002', 'Bruno', 'Client', 'active'),
  ('019f4100-0000-7000-8000-000000000011', 'Olivia', 'Owner', 'active'),
  ('019f4100-0000-7000-8000-000000000012', 'Camilo', 'Coach', 'active'),
  ('019f4100-0000-7000-8000-000000000013', 'Diana', 'Cover', 'active'),
  ('019f4100-0000-7000-8000-000000000015', 'Fabio', 'Unassigned', 'active'),
  ('019f4100-0000-7000-8000-000000000016', 'Gina', 'Admin', 'active'),
  ('019f4100-0000-7000-8000-000000000017', 'Sara', 'Staff', 'active'),
  ('019f4100-0000-7000-8000-000000000018', 'Irene', 'AdminCoach', 'active'),
  ('019f4100-0000-7000-8000-000000000021', 'Oscar', 'Owner', 'active'),
  ('019f4100-0000-7000-8000-000000000022', 'Hugo', 'Coach', 'active');

insert into organizations.organizations (id, type_code, display_name, responsible_party)
values
  ('019f4100-0000-7000-8000-000000000101', 'gym', 'Gym A',
   '{"party_kind":"legal_entity","party_name":"Gym A SAS","purpose":"studio_operations"}'),
  ('019f4100-0000-7000-8000-000000000102', 'gym', 'Gym B',
   '{"party_kind":"legal_entity","party_name":"Gym B SAS","purpose":"studio_operations"}');

insert into organizations.organization_memberships (id, organization_id, person_id, status)
values
  ('019f4100-0000-7000-8000-000000000211', '019f4100-0000-7000-8000-000000000101', '019f4100-0000-7000-8000-000000000011', 'active'),
  ('019f4100-0000-7000-8000-000000000212', '019f4100-0000-7000-8000-000000000101', '019f4100-0000-7000-8000-000000000012', 'active'),
  ('019f4100-0000-7000-8000-000000000213', '019f4100-0000-7000-8000-000000000101', '019f4100-0000-7000-8000-000000000013', 'active'),
  ('019f4100-0000-7000-8000-000000000215', '019f4100-0000-7000-8000-000000000101', '019f4100-0000-7000-8000-000000000015', 'active'),
  ('019f4100-0000-7000-8000-000000000216', '019f4100-0000-7000-8000-000000000101', '019f4100-0000-7000-8000-000000000016', 'active'),
  ('019f4100-0000-7000-8000-000000000217', '019f4100-0000-7000-8000-000000000101', '019f4100-0000-7000-8000-000000000017', 'active'),
  ('019f4100-0000-7000-8000-000000000218', '019f4100-0000-7000-8000-000000000101', '019f4100-0000-7000-8000-000000000018', 'active'),
  ('019f4100-0000-7000-8000-000000000221', '019f4100-0000-7000-8000-000000000102', '019f4100-0000-7000-8000-000000000021', 'active'),
  ('019f4100-0000-7000-8000-000000000222', '019f4100-0000-7000-8000-000000000102', '019f4100-0000-7000-8000-000000000022', 'active');

insert into organizations.membership_roles (membership_id, role_code)
values
  ('019f4100-0000-7000-8000-000000000211', 'owner'),
  ('019f4100-0000-7000-8000-000000000212', 'coach'),
  ('019f4100-0000-7000-8000-000000000213', 'coach'),
  ('019f4100-0000-7000-8000-000000000215', 'coach'),
  ('019f4100-0000-7000-8000-000000000216', 'admin'),
  ('019f4100-0000-7000-8000-000000000217', 'staff'),
  ('019f4100-0000-7000-8000-000000000218', 'admin'),
  ('019f4100-0000-7000-8000-000000000218', 'coach'),
  ('019f4100-0000-7000-8000-000000000221', 'owner'),
  ('019f4100-0000-7000-8000-000000000222', 'coach');

-- Ana is a client of both gyms and shares her training to plan it; Bruno only to read it.
insert into relationships.service_relationships (id, person_id, organization_id, status)
values
  ('019f4100-0000-7000-8000-000000000701', '019f4100-0000-7000-8000-000000000001', '019f4100-0000-7000-8000-000000000101', 'active'),
  ('019f4100-0000-7000-8000-000000000702', '019f4100-0000-7000-8000-000000000002', '019f4100-0000-7000-8000-000000000101', 'active'),
  ('019f4100-0000-7000-8000-000000000706', '019f4100-0000-7000-8000-000000000001', '019f4100-0000-7000-8000-000000000102', 'active');

insert into relationships.relationship_professional_assignments (
  id, relationship_id, person_id, organization_id, membership_id, covers_membership_id,
  kind, status, ends_on, accepted_by_person_at
) values
  ('019f4100-0000-7000-8000-000000000801', '019f4100-0000-7000-8000-000000000701', '019f4100-0000-7000-8000-000000000001',
   '019f4100-0000-7000-8000-000000000101', '019f4100-0000-7000-8000-000000000212', null, 'holder', 'active', null, null),
  ('019f4100-0000-7000-8000-000000000802', '019f4100-0000-7000-8000-000000000702', '019f4100-0000-7000-8000-000000000002',
   '019f4100-0000-7000-8000-000000000101', '019f4100-0000-7000-8000-000000000212', null, 'holder', 'active', null, null),
  ('019f4100-0000-7000-8000-000000000805', '019f4100-0000-7000-8000-000000000701', '019f4100-0000-7000-8000-000000000001',
   '019f4100-0000-7000-8000-000000000101', '019f4100-0000-7000-8000-000000000213', '019f4100-0000-7000-8000-000000000212',
   'substitute', 'active', (clock_timestamp() + interval '10 days')::date, clock_timestamp()),
  ('019f4100-0000-7000-8000-000000000807', '019f4100-0000-7000-8000-000000000706', '019f4100-0000-7000-8000-000000000001',
   '019f4100-0000-7000-8000-000000000102', '019f4100-0000-7000-8000-000000000222', null, 'holder', 'active', null, null);

insert into privacy.scope_definitions (id, scope_code, version_number, status, published_at)
values ('019f4100-0000-7000-8000-000000000301', 'relationship_training', 4, 'published', clock_timestamp());

insert into identity.invitations (
  id, organization_id, issued_by_membership_id, channel, contact,
  token_hash, token_key_version, proposal_hash, responsible_party, status, expires_at
) values (
  '019f4100-0000-7000-8000-000000000401', '019f4100-0000-7000-8000-000000000101',
  '019f4100-0000-7000-8000-000000000211', 'email', 'ana@example.test',
  extensions.digest('manage-token', 'sha256'), 1, extensions.digest('manage-proposal', 'sha256'),
  '{"party_kind":"legal_entity","party_name":"Gym A SAS","purpose":"studio_operations"}',
  'completed', clock_timestamp() + interval '7 days'
);
insert into identity.invitation_intents (id, invitation_id, kind, status, proposed_role_code)
values ('019f4100-0000-7000-8000-000000000501', '019f4100-0000-7000-8000-000000000401',
  'service_relationship', 'pending', null);
insert into privacy.invitation_scope_options (
  id, invitation_intent_id, scope_definition_id, scope_code,
  offered_access_level, purpose, presented_snapshot, decision, decided_at
) values (
  '019f4100-0000-7000-8000-000000000601', '019f4100-0000-7000-8000-000000000501',
  '019f4100-0000-7000-8000-000000000301', 'relationship_training', 'contribute',
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
    '019f4100-0000-7000-8000-000000000601', '019f4100-0000-7000-8000-000000000301',
    'relationship_training', 'accepted', '{"title":"Training"}'::jsonb
  );
  insert into privacy.data_grants (
    id, person_id, relationship_id, organization_id, scope_definition_id, scope_code,
    consent_event_id, access_level, purpose
  ) values (
    grant_id, subject.person_id, relationship, subject.organization_id,
    '019f4100-0000-7000-8000-000000000301', 'relationship_training', grant_id, level,
    'Plan the training'
  );
end
$$;

select pg_temp.share('019f4100-0000-7000-8000-000000000701', '019f4100-0000-7000-8000-000000000a01', 'contribute');
select pg_temp.share('019f4100-0000-7000-8000-000000000702', '019f4100-0000-7000-8000-000000000a02', 'read');
select pg_temp.share('019f4100-0000-7000-8000-000000000706', '019f4100-0000-7000-8000-000000000a06', 'contribute');


-- Content. Gym A: a routine with a strength step (warm-up, then two working sets) and a
-- run, in a two-week program. Gym B: its own routine. Ana: her own program.
insert into planning.session_templates (id, content_scope, owner_organization_id, owner_person_id, author_person_id, discipline_code, status)
values
  ('019f4100-0000-7000-8000-000000000311', 'organization', '019f4100-0000-7000-8000-000000000101', null, '019f4100-0000-7000-8000-000000000012', 'test_strength', 'published'),
  ('019f4100-0000-7000-8000-000000000361', 'organization', '019f4100-0000-7000-8000-000000000102', null, '019f4100-0000-7000-8000-000000000022', 'test_strength', 'published'),
  ('019f4100-0000-7000-8000-000000000371', 'person', null, '019f4100-0000-7000-8000-000000000001', '019f4100-0000-7000-8000-000000000001', 'test_strength', 'published');
insert into planning.programs (id, content_scope, owner_organization_id, owner_person_id, author_person_id, status)
values
  ('019f4100-0000-7000-8000-000000000331', 'organization', '019f4100-0000-7000-8000-000000000101', null, '019f4100-0000-7000-8000-000000000012', 'published'),
  ('019f4100-0000-7000-8000-000000000381', 'person', null, '019f4100-0000-7000-8000-000000000001', '019f4100-0000-7000-8000-000000000001', 'published');

select set_config('app.planning_publication', 'true', true);
insert into planning.session_template_versions (id, template_id, version_number, discipline_code, activity_type_id, title, content_hash)
values
  ('019f4100-0000-7000-8000-000000000312', '019f4100-0000-7000-8000-000000000311', 1, 'test_strength', '019c0000-0000-7000-8000-000000000011', 'Fuerza A', decode(repeat('c1', 32), 'hex')),
  ('019f4100-0000-7000-8000-000000000362', '019f4100-0000-7000-8000-000000000361', 1, 'test_strength', '019c0000-0000-7000-8000-000000000011', 'Fuerza B', decode(repeat('c2', 32), 'hex')),
  ('019f4100-0000-7000-8000-000000000372', '019f4100-0000-7000-8000-000000000371', 1, 'test_strength', '019c0000-0000-7000-8000-000000000011', 'Mía', decode(repeat('c3', 32), 'hex'));
insert into planning.planned_steps (id, template_version_id, position, movement_id, activity_type_id)
values
  ('019f4100-0000-7000-8000-000000000313', '019f4100-0000-7000-8000-000000000312', 1, null, null),
  ('019f4100-0000-7000-8000-000000000314', '019f4100-0000-7000-8000-000000000312', 2, null, '019c0000-0000-7000-8000-000000000012'),
  ('019f4100-0000-7000-8000-000000000363', '019f4100-0000-7000-8000-000000000362', 1, null, null);
-- IX-22 resolves the family through a definer reader under FORCE RLS, so each target is
-- written as a coach who can see that gym's content; without one it sees nothing.
select set_config('app.actor_kind', 'person', true);
select set_config('app.actor_person_id', '019f4100-0000-7000-8000-000000000022', true);
select set_config('app.actor_org_id', '019f4100-0000-7000-8000-000000000102', true);
select set_config('app.actor_membership_id', '019f4100-0000-7000-8000-000000000222', true);
insert into planning.strength_targets (planned_step_id, target_sets, target_reps, target_rpe)
values ('019f4100-0000-7000-8000-000000000363', 3, 8, null);
select set_config('app.actor_person_id', '019f4100-0000-7000-8000-000000000012', true);
select set_config('app.actor_org_id', '019f4100-0000-7000-8000-000000000101', true);
select set_config('app.actor_membership_id', '019f4100-0000-7000-8000-000000000212', true);
insert into planning.strength_targets (planned_step_id, target_sets, target_reps, target_rpe)
values ('019f4100-0000-7000-8000-000000000313', 3, null, 7);
insert into planning.planned_sets (planned_step_id, set_order, kind, target_reps, target_load_value, target_load_unit_code)
values
  ('019f4100-0000-7000-8000-000000000313', 1, 'warmup', 12, 20, 'test_kg'),
  ('019f4100-0000-7000-8000-000000000313', 2, 'normal', 8, 60, 'test_kg'),
  ('019f4100-0000-7000-8000-000000000313', 3, 'normal', 8, 60, 'test_kg');
insert into planning.endurance_targets (planned_step_id, target_distance_value, target_distance_unit_code, target_duration_seconds)
values ('019f4100-0000-7000-8000-000000000314', 1000, 'test_m', 300);
insert into planning.program_versions (id, program_id, version_number, title, content_hash, status, repeats_forever)
values
  ('019f4100-0000-7000-8000-000000000332', '019f4100-0000-7000-8000-000000000331', 1, 'Bloque A', decode(repeat('d1', 32), 'hex'), 'published', false),
  ('019f4100-0000-7000-8000-000000000382', '019f4100-0000-7000-8000-000000000381', 1, 'Lo mío', decode(repeat('d2', 32), 'hex'), 'published', false);
insert into planning.program_version_sessions (program_version_id, template_version_id, position, week, day)
values
  ('019f4100-0000-7000-8000-000000000332', '019f4100-0000-7000-8000-000000000312', 1, 1, 1),
  ('019f4100-0000-7000-8000-000000000332', '019f4100-0000-7000-8000-000000000312', 2, 1, 3),
  ('019f4100-0000-7000-8000-000000000332', '019f4100-0000-7000-8000-000000000312', 3, 2, 1),
  ('019f4100-0000-7000-8000-000000000332', '019f4100-0000-7000-8000-000000000312', 4, 2, 3),
  ('019f4100-0000-7000-8000-000000000382', '019f4100-0000-7000-8000-000000000372', 1, 1, 1);
select set_config('app.planning_publication', '', true);

select (clock_timestamp() at time zone 'America/Bogota')::date as today \gset
select (date_trunc('week', :'today'::date) + interval '7 days')::date as week2 \gset

-- Ana's own program; Bruno's, managed under a grant that only reads; and one of Ana's
-- that the gym no longer manages.
insert into planning.program_assignments (id, person_id, program_version_id, origin_relationship_id, lifecycle, starts_on, timezone, assigned_at, display_order)
values
  ('019f4100-0000-7000-8000-000000000901', '019f4100-0000-7000-8000-000000000001', '019f4100-0000-7000-8000-000000000382',
   null, 'personal', :'today', 'America/Bogota', clock_timestamp() - interval '1 day', 1),
  ('019f4100-0000-7000-8000-000000000911', '019f4100-0000-7000-8000-000000000002', '019f4100-0000-7000-8000-000000000332',
   '019f4100-0000-7000-8000-000000000702', 'active', :'today', 'America/Bogota', clock_timestamp() - interval '1 day', 1),
  ('019f4100-0000-7000-8000-000000000921', '019f4100-0000-7000-8000-000000000001', '019f4100-0000-7000-8000-000000000332',
   '019f4100-0000-7000-8000-000000000701', 'detached_pending_choice', :'today', 'America/Bogota', clock_timestamp() - interval '2 days', 5);
insert into planning.assignment_management_periods (assignment_id, person_id, relationship_id, started_at, ended_at, end_reason)
values
  ('019f4100-0000-7000-8000-000000000911', '019f4100-0000-7000-8000-000000000002', '019f4100-0000-7000-8000-000000000702',
   clock_timestamp() - interval '1 day', null, null),
  ('019f4100-0000-7000-8000-000000000921', '019f4100-0000-7000-8000-000000000001', '019f4100-0000-7000-8000-000000000701',
   clock_timestamp() - interval '2 days', clock_timestamp() - interval '1 day', 'relationship_ended');
insert into planning.planned_sessions (id, assignment_id, person_id, template_version_id, scheduled_at, timezone, week_starts_on, program_day, status)
values
  ('019f4100-0000-7000-8000-000000000903', '019f4100-0000-7000-8000-000000000901', '019f4100-0000-7000-8000-000000000001',
   '019f4100-0000-7000-8000-000000000372', (:'week2'::date)::timestamp at time zone 'America/Bogota', 'America/Bogota', :'week2', 1, 'scheduled'),
  ('019f4100-0000-7000-8000-000000000912', '019f4100-0000-7000-8000-000000000911', '019f4100-0000-7000-8000-000000000002',
   '019f4100-0000-7000-8000-000000000312', (:'week2'::date)::timestamp at time zone 'America/Bogota', 'America/Bogota', :'week2', 1, 'scheduled'),
  ('019f4100-0000-7000-8000-000000000922', '019f4100-0000-7000-8000-000000000921', '019f4100-0000-7000-8000-000000000001',
   '019f4100-0000-7000-8000-000000000312', (:'week2'::date)::timestamp at time zone 'America/Bogota', 'America/Bogota', :'week2', 1, 'paused');

create function pg_temp.act(person uuid) returns void language plpgsql as $$
begin
  perform set_config('app.actor_kind', 'person', true);
  perform set_config('app.actor_person_id', person::text, true);
  perform set_config('app.actor_org_id', '', true);
  perform set_config('app.actor_membership_id', '', true);
  perform set_config('app.contract_scope_purpose', '', true);
  perform set_config('app.contract_scope_id', '', true);
  perform set_config('app.contract_scope_token', '', true);
  perform set_config('app.request_id', gen_random_uuid()::text, true);
end
$$;

-- A member's context, as a command leaves it, for reading tables under their policies.
create function pg_temp.member(person uuid, org uuid, membership uuid) returns void language plpgsql as $$
begin
  perform pg_temp.act(person);
  perform set_config('app.actor_org_id', org::text, true);
  perform set_config('app.actor_membership_id', membership::text, true);
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

-- A data-modifying CTE cannot sit in a subquery; the row count is what a policy decides.
create function pg_temp.affected(statement text) returns integer
language plpgsql as $$
declare
  touched integer;
begin
  execute statement;
  get diagnostics touched = row_count;
  return touched;
end
$$;

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

create function pg_temp.assign(actor uuid, relationship uuid, idem uuid)
returns jsonb language sql as $$
  select result from planning.assign_program_from_relationship(
    actor, '019f4100-0000-7000-8000-000000000101', relationship, '019f4100-0000-7000-8000-000000000332',
    (clock_timestamp() at time zone 'America/Bogota')::date, 'America/Bogota', idem, idem,
    extensions.digest(idem::text, 'sha256'))
$$;

create function pg_temp.reschedule(actor uuid, org uuid, session uuid, day date, revision bigint, idem uuid)
returns table (result jsonb, replayed boolean) language sql as $$
  select * from planning.reschedule_planned_session(
    actor, org, session, day, revision, idem, idem, extensions.digest(idem::text, 'sha256'))
$$;

create function pg_temp.try_reschedule(actor uuid, org uuid, session uuid, day date, revision bigint)
returns text language sql as $$
  select pg_temp.failure(format(
    'select * from pg_temp.reschedule(%L, %L, %L, %L, %L, gen_random_uuid())',
    actor, org, session, day, revision))
$$;

create function pg_temp.revise(actor uuid, org uuid, assignment uuid, step uuid, kind text, value jsonb, unit text, idem uuid)
returns table (result jsonb, replayed boolean) language sql as $$
  select * from planning.revise_prescription(
    actor, org, assignment, step, kind, value, unit, idem, idem, extensions.digest(idem::text, 'sha256'))
$$;

create function pg_temp.try_revise(actor uuid, org uuid, assignment uuid, step uuid, kind text, value jsonb, unit text)
returns text language sql as $$
  select pg_temp.failure(format(
    'select * from pg_temp.revise(%L, %L, %L, %L, %L, %L, %L, gen_random_uuid())',
    actor, org, assignment, step, kind, value, unit))
$$;

create function pg_temp.cancel(actor uuid, org uuid, assignment uuid, idem uuid)
returns table (result jsonb, replayed boolean) language sql as $$
  select * from planning.cancel_managed_assignment(
    actor, org, assignment, idem, idem, extensions.digest(idem::text, 'sha256'))
$$;

create function pg_temp.try_cancel(actor uuid, org uuid, assignment uuid)
returns text language sql as $$
  select pg_temp.failure(format(
    'select * from pg_temp.cancel(%L, %L, %L, gen_random_uuid())', actor, org, assignment))
$$;

-- ———————————————————————————————————— Camilo gives Ana the program; she starts its first session

set local role allfit_api;

select pg_temp.act('019f4100-0000-7000-8000-000000000012');
select (pg_temp.assign('019f4100-0000-7000-8000-000000000012', '019f4100-0000-7000-8000-000000000701',
  'b0000000-0000-4000-8000-000000000001')->>'id') as a1 \gset
select (pg_temp.assign('019f4100-0000-7000-8000-000000000012', '019f4100-0000-7000-8000-000000000701',
  'b0000000-0000-4000-8000-000000000002')->>'id') as a2 \gset
select (pg_temp.assign('019f4100-0000-7000-8000-000000000012', '019f4100-0000-7000-8000-000000000701',
  'b0000000-0000-4000-8000-000000000003')->>'id') as a3 \gset

reset role;
select id as w1d1 from planning.planned_sessions
where assignment_id = :'a1' and program_day = 1 and week_starts_on < :'week2' \gset
select id as w2d1 from planning.planned_sessions
where assignment_id = :'a1' and program_day = 1 and week_starts_on = :'week2' \gset
select id as w2d3 from planning.planned_sessions
where assignment_id = :'a1' and program_day = 3 and week_starts_on = :'week2' \gset
-- A1 goes in front of everything Ana follows, so her week shows it.
update planning.program_assignments set display_order = -100 where id = :'a1';
set local role allfit_api;

select pg_temp.act('019f4100-0000-7000-8000-000000000001');
select (sessions->0->>'set_count')::integer as sets_before
from planning.read_week_plan('019f4100-0000-7000-8000-000000000001', 'America/Bogota') \gset
select execution.start_planned_session_attempt(
  '019f4100-0000-7000-8000-000000000001', :'w1d1'::uuid, clock_timestamp(), 'America/Bogota',
  'detailed', 'manual', 'b0000000-0000-4000-8000-000000000010',
  '019f4100-0000-7000-8000-000000000e01', decode(repeat('e1', 32), 'hex'));

select is(:sets_before, 3, 'T-PLN-MANAGE-INT-01 before any adjustment her week counts the program''s three sets');

-- ———————————————————————————————————— OP-PLN-012 · moving a session

select pg_temp.act('019f4100-0000-7000-8000-000000000012');
select result as moved, replayed::text as moved_replayed
from pg_temp.reschedule('019f4100-0000-7000-8000-000000000012', '019f4100-0000-7000-8000-000000000101',
  :'w2d1', (:'week2'::date + 2), 0, 'b0000000-0000-4000-8000-000000000011') \gset

select is(:'moved'::jsonb->>'scheduled_on', (:'week2'::date + 2)::text,
  'T-PLN-MANAGE-API-01 the holder moves a session to another day of its week');
select is(:'moved'::jsonb->>'revision_number', '1', 'T-PLN-MANAGE-INT-02 and the session is one revision further');
select is(:'moved_replayed'::text, 'false', 'T-PLN-MANAGE-IDEM-01 the first command is not a replay');

reset role;
select is(
  (select (week_starts_on, program_day, template_version_id)::text from planning.planned_sessions where id = :'w2d1'),
  (select (:'week2'::date, 1, '019f4100-0000-7000-8000-000000000312'::uuid)::text),
  'T-PLN-MANAGE-INT-03 it keeps its week, the day the program gave it and its routine (HU-048 criterion 5)');
select is(
  (select (moved_from, moved_to, rescheduled_by_membership_id, relationship_id)::text
     from planning.planned_session_reschedules where planned_session_id = :'w2d1'),
  (select (:'week2'::date, :'week2'::date + 2, '019f4100-0000-7000-8000-000000000212'::uuid,
           '019f4100-0000-7000-8000-000000000701'::uuid)::text),
  'T-PLN-MANAGE-INT-04 the move is kept with who made it');
select is(
  (select count(*)::integer from system.outbox_events
    where aggregate_id = :'w2d1' and event_type = 'planning.session_rescheduled.v1'),
  1, 'T-PLN-MANAGE-INT-05 and announced once');
set local role allfit_api;

select pg_temp.act('019f4100-0000-7000-8000-000000000012');
select is(
  (select (result->>'scheduled_on') || ' ' || replayed::text
     from pg_temp.reschedule('019f4100-0000-7000-8000-000000000012', '019f4100-0000-7000-8000-000000000101',
       :'w2d1', (:'week2'::date + 2), 0, 'b0000000-0000-4000-8000-000000000011')),
  (:'week2'::date + 2)::text || ' true', 'T-PLN-MANAGE-IDEM-02 retrying returns the same move');
select is(left(pg_temp.try_reschedule('019f4100-0000-7000-8000-000000000012', '019f4100-0000-7000-8000-000000000101',
  :'w2d1', (:'week2'::date + 4), 0), 6), '40001 ',
  'T-PLN-MANAGE-INT-06 a move based on a revision that is no longer current is refused');
select is(pg_temp.try_reschedule('019f4100-0000-7000-8000-000000000012', '019f4100-0000-7000-8000-000000000101',
  :'w2d1', (:'today'::date - 1), 1),
  '22023 ["scheduled-on"]', 'T-PLN-MANAGE-INT-07 a session does not move into the past');
select is(pg_temp.try_reschedule('019f4100-0000-7000-8000-000000000012', '019f4100-0000-7000-8000-000000000101',
  :'w2d1', (:'week2'::date + 7), 1),
  '22023 ["scheduled-on-week"]', 'T-PLN-MANAGE-INT-08 nor out of its week');
select is(pg_temp.try_reschedule('019f4100-0000-7000-8000-000000000012', '019f4100-0000-7000-8000-000000000101',
  :'w1d1', :'today', 0),
  '55000 ', 'T-PLN-MANAGE-INT-09 a session she already started stays where it was (HU-048 criterion 3)');

-- Wednesday of week two is where it already is: nothing to move, nothing to record.
select is(
  (select result->>'revision_number' from pg_temp.reschedule('019f4100-0000-7000-8000-000000000012',
     '019f4100-0000-7000-8000-000000000101', :'w2d3', (:'week2'::date + 2), 0,
     'b0000000-0000-4000-8000-000000000012')),
  '0', 'T-PLN-MANAGE-INT-10 moving a session to the day it is on changes nothing');

select pg_temp.act('019f4100-0000-7000-8000-000000000013');
select is(
  (select result->>'scheduled_on' from pg_temp.reschedule('019f4100-0000-7000-8000-000000000013',
     '019f4100-0000-7000-8000-000000000101', :'w2d3', (:'week2'::date + 3), 0,
     'b0000000-0000-4000-8000-000000000013')),
  (:'week2'::date + 3)::text, 'T-PLN-MANAGE-RLS-01 the accepted cover moves sessions too');

select pg_temp.act('019f4100-0000-7000-8000-000000000015');
select is(pg_temp.try_reschedule('019f4100-0000-7000-8000-000000000015', '019f4100-0000-7000-8000-000000000101',
  :'w2d3', (:'week2'::date + 4), 1),
  'P0002 ', 'T-PLN-MANAGE-RLS-02 a coach who does not attend her does not find the session');
-- She can assign programs and sees Ana in the directory, but does not attend her.
select pg_temp.act('019f4100-0000-7000-8000-000000000018');
select is(pg_temp.try_reschedule('019f4100-0000-7000-8000-000000000018', '019f4100-0000-7000-8000-000000000101',
  :'w2d3', (:'week2'::date + 4), 1),
  'P0002 ', 'T-PLN-MANAGE-RLS-33 nor does an administrator who coaches, but not her');
select pg_temp.act('019f4100-0000-7000-8000-000000000016');
select is(pg_temp.try_reschedule('019f4100-0000-7000-8000-000000000016', '019f4100-0000-7000-8000-000000000101',
  :'w2d3', (:'week2'::date + 4), 1),
  '42501 ', 'T-PLN-MANAGE-RLS-03 the administrator does not plan sessions');
select pg_temp.act('019f4100-0000-7000-8000-000000000017');
select is(pg_temp.try_reschedule('019f4100-0000-7000-8000-000000000017', '019f4100-0000-7000-8000-000000000101',
  :'w2d3', (:'week2'::date + 4), 1),
  '42501 ', 'T-PLN-MANAGE-RLS-04 nor does staff');
select pg_temp.act('019f4100-0000-7000-8000-000000000022');
select is(pg_temp.try_reschedule('019f4100-0000-7000-8000-000000000022', '019f4100-0000-7000-8000-000000000102',
  :'w2d3', (:'week2'::date + 4), 1),
  'P0002 ', 'T-PLN-MANAGE-RLS-05 another gym''s coach does not find it through her own gym');
select pg_temp.act('019f4100-0000-7000-8000-000000000012');
select is(pg_temp.try_reschedule('019f4100-0000-7000-8000-000000000012', '019f4100-0000-7000-8000-000000000101',
  '019f4100-0000-7000-8000-000000000912', (:'week2'::date + 2), 0),
  'AF430 relationship_training:contribute', 'T-PLN-MANAGE-RLS-06 reading her training is not enough to move it');
select is(pg_temp.try_reschedule('019f4100-0000-7000-8000-000000000012', '019f4100-0000-7000-8000-000000000101',
  '019f4100-0000-7000-8000-000000000903', (:'week2'::date + 2), 0),
  'P0002 ', 'T-PLN-MANAGE-RLS-07 her own program has no manager (HU-048 criterion 4)');
select is(pg_temp.try_reschedule('019f4100-0000-7000-8000-000000000012', '019f4100-0000-7000-8000-000000000101',
  '019f4100-0000-7000-8000-000000000922', (:'week2'::date + 2), 0),
  '55000 ', 'T-PLN-MANAGE-INT-11 nor does one the gym stopped managing');
select is(pg_temp.try_reschedule('019f4100-0000-7000-8000-000000000012', '019f4100-0000-7000-8000-000000000101',
  '019f4100-0000-7000-8000-000000000999', (:'week2'::date + 2), 0),
  'P0002 ', 'T-PLN-MANAGE-INT-12 a session that does not exist is not found');

-- ———————————————————————————————————— OP-PLN-013 · adjusting the prescription

select result as load70, replayed::text as load70_replayed
from pg_temp.revise('019f4100-0000-7000-8000-000000000012', '019f4100-0000-7000-8000-000000000101', :'a1',
  '019f4100-0000-7000-8000-000000000313', 'target_load', '70', 'test_kg',
  'b0000000-0000-4000-8000-000000000021') \gset

select is(
  (select (:'load70'::jsonb->>'kind') || ' ' || (:'load70'::jsonb->>'value') || ' ' || (:'load70'::jsonb->>'unit_code')),
  'target_load 70 test_kg', 'T-PLN-MANAGE-API-02 the holder adjusts the load of a step for Ana');
select is(:'load70_replayed'::text, 'false', 'T-PLN-MANAGE-IDEM-03 the first adjustment is not a replay');
select is(
  (select replayed::text from pg_temp.revise('019f4100-0000-7000-8000-000000000012', '019f4100-0000-7000-8000-000000000101',
     :'a1', '019f4100-0000-7000-8000-000000000313', 'target_load', '70', 'test_kg',
     'b0000000-0000-4000-8000-000000000021')),
  'true', 'T-PLN-MANAGE-IDEM-04 retrying returns the same adjustment');

select pg_temp.act('019f4100-0000-7000-8000-000000000013');
select ok(
  (select result->>'id' is not null from pg_temp.revise('019f4100-0000-7000-8000-000000000013',
     '019f4100-0000-7000-8000-000000000101', :'a1', '019f4100-0000-7000-8000-000000000313', 'target_sets', '4', null,
     'b0000000-0000-4000-8000-000000000022')),
  'T-PLN-MANAGE-RLS-08 the accepted cover adjusts too');

select pg_temp.act('019f4100-0000-7000-8000-000000000012');
select pg_temp.revise('019f4100-0000-7000-8000-000000000012', '019f4100-0000-7000-8000-000000000101', :'a1',
  '019f4100-0000-7000-8000-000000000313', 'target_reps', '10', null, 'b0000000-0000-4000-8000-000000000023');
select pg_temp.revise('019f4100-0000-7000-8000-000000000012', '019f4100-0000-7000-8000-000000000101', :'a1',
  '019f4100-0000-7000-8000-000000000313', 'target_load', '75', 'test_kg', 'b0000000-0000-4000-8000-000000000024');
select is(
  (select result->>'value' from pg_temp.revise('019f4100-0000-7000-8000-000000000012',
     '019f4100-0000-7000-8000-000000000101', :'a1', '019f4100-0000-7000-8000-000000000314', 'target_distance',
     '1200', 'test_m', 'b0000000-0000-4000-8000-000000000025')),
  '1200', 'T-PLN-MANAGE-INT-13 a run takes a distance');
select is(
  (select result->>'value' from pg_temp.revise('019f4100-0000-7000-8000-000000000012',
     '019f4100-0000-7000-8000-000000000101', :'a1', '019f4100-0000-7000-8000-000000000314', 'notes',
     '"Suave, sin pasar de zona 2"', null, 'b0000000-0000-4000-8000-000000000026')),
  'Suave, sin pasar de zona 2', 'T-PLN-MANAGE-INT-14 and any step takes a note');

select is(pg_temp.try_revise('019f4100-0000-7000-8000-000000000012', '019f4100-0000-7000-8000-000000000101', :'a1',
  '019f4100-0000-7000-8000-000000000313', 'target_distance', '1200', 'test_m'),
  '22023 ["kind"]', 'T-PLN-MANAGE-INT-15 a strength step takes no distance');
select is(pg_temp.try_revise('019f4100-0000-7000-8000-000000000012', '019f4100-0000-7000-8000-000000000101', :'a1',
  '019f4100-0000-7000-8000-000000000313', 'tempo', '3', null),
  '22023 ["kind"]', 'T-PLN-MANAGE-INT-16 an adjustment the dictionary does not type is refused');
select is(pg_temp.try_revise('019f4100-0000-7000-8000-000000000012', '019f4100-0000-7000-8000-000000000101', :'a1',
  '019f4100-0000-7000-8000-000000000363', 'target_sets', '4', null),
  '22023 ["planned-step"]', 'T-PLN-MANAGE-INT-17 a step outside the assigned version is refused');
select is(pg_temp.try_revise('019f4100-0000-7000-8000-000000000012', '019f4100-0000-7000-8000-000000000101', :'a1',
  '019f4100-0000-7000-8000-000000000313', 'target_reps', '0', null),
  '22023 ["value"]', 'T-PLN-MANAGE-INT-18 a value outside the target''s range is refused');
select is(pg_temp.try_revise('019f4100-0000-7000-8000-000000000012', '019f4100-0000-7000-8000-000000000101', :'a1',
  '019f4100-0000-7000-8000-000000000313', 'target_reps', '"8"', null),
  '22023 ["value"]', 'T-PLN-MANAGE-INT-19 and so is one of the wrong type');
select is(pg_temp.try_revise('019f4100-0000-7000-8000-000000000012', '019f4100-0000-7000-8000-000000000101', :'a1',
  '019f4100-0000-7000-8000-000000000313', 'target_load', '70', null),
  '22023 ["unit-code"]', 'T-PLN-MANAGE-INT-20 a load needs its unit');
select is(pg_temp.try_revise('019f4100-0000-7000-8000-000000000012', '019f4100-0000-7000-8000-000000000101', :'a1',
  '019f4100-0000-7000-8000-000000000313', 'target_load', '70', 'stone'),
  '22023 ["unit-code"]', 'T-PLN-MANAGE-INT-21 a unit the catalogue does not know');
select is(pg_temp.try_revise('019f4100-0000-7000-8000-000000000012', '019f4100-0000-7000-8000-000000000101', :'a1',
  '019f4100-0000-7000-8000-000000000313', 'target_rpe', '8', 'test_kg'),
  '22023 ["unit-code"]', 'T-PLN-MANAGE-INT-22 and an effort takes none');
select is(pg_temp.try_revise('019f4100-0000-7000-8000-000000000012', '019f4100-0000-7000-8000-000000000101',
  '019f4100-0000-7000-8000-000000000911', '019f4100-0000-7000-8000-000000000313', 'target_sets', '4', null),
  'AF430 relationship_training:contribute', 'T-PLN-MANAGE-RLS-09 reading her training is not enough to adjust it');
select is(pg_temp.try_revise('019f4100-0000-7000-8000-000000000012', '019f4100-0000-7000-8000-000000000101',
  '019f4100-0000-7000-8000-000000000901', '019f4100-0000-7000-8000-000000000313', 'target_sets', '4', null),
  'P0002 ', 'T-PLN-MANAGE-RLS-10 her own program is not the gym''s to adjust');
select is(pg_temp.try_revise('019f4100-0000-7000-8000-000000000012', '019f4100-0000-7000-8000-000000000101',
  '019f4100-0000-7000-8000-000000000921', '019f4100-0000-7000-8000-000000000313', 'target_sets', '4', null),
  '55000 ', 'T-PLN-MANAGE-INT-23 nor one the gym stopped managing (HU-049 criterion 4)');
select pg_temp.act('019f4100-0000-7000-8000-000000000016');
select is(pg_temp.try_revise('019f4100-0000-7000-8000-000000000016', '019f4100-0000-7000-8000-000000000101', :'a1',
  '019f4100-0000-7000-8000-000000000313', 'target_sets', '4', null),
  '42501 ', 'T-PLN-MANAGE-RLS-11 the administrator does not prescribe');
select pg_temp.act('019f4100-0000-7000-8000-000000000022');
select is(pg_temp.try_revise('019f4100-0000-7000-8000-000000000022', '019f4100-0000-7000-8000-000000000102', :'a1',
  '019f4100-0000-7000-8000-000000000313', 'target_sets', '4', null),
  'P0002 ', 'T-PLN-MANAGE-RLS-12 another gym''s coach does not find the assignment');

reset role;
select is(
  (select (created_by_assignment_id, person_id)::text from planning.prescription_revisions
    where assignment_id = :'a1' and override_kind = 'target_sets'),
  (select ('019f4100-0000-7000-8000-000000000805'::uuid, '019f4100-0000-7000-8000-000000000001'::uuid)::text),
  'T-PLN-MANAGE-INT-24 each adjustment names the professional assignment that made it (HU-049 criterion 2)');
select is(
  (select array_agg(target_load_value order by set_order)::text from planning.planned_sets
    where planned_step_id = '019f4100-0000-7000-8000-000000000313'),
  '{20,60,60}', 'T-PLN-MANAGE-INT-25 the published routine keeps its loads (HU-049 criterion 1, T-ASG-7)');
select is(
  (select (target_sets, target_reps)::text from planning.strength_targets
    where planned_step_id = '019f4100-0000-7000-8000-000000000313'),
  '(3,)', 'T-PLN-MANAGE-INT-26 and its sets and reps');
select is(
  (select count(*)::integer from system.outbox_events
    where aggregate_id = :'a1' and event_type = 'planning.prescription_revised.v1'),
  6, 'T-PLN-MANAGE-INT-27 each adjustment is announced once');
select is(
  pg_temp.failure(format('update planning.prescription_revisions set value_integer = 5 where assignment_id = %L', :'a1')),
  '23514 ', 'T-PLN-MANAGE-INT-28 an adjustment is never rewritten');
select is(
  pg_temp.failure(format('delete from planning.prescription_revisions where assignment_id = %L', :'a1')),
  '23514 ', 'T-PLN-MANAGE-INT-29 nor erased');
-- Below the command, as the coach who could have written them: IX-13 still holds.
select pg_temp.member('019f4100-0000-7000-8000-000000000012', '019f4100-0000-7000-8000-000000000101', '019f4100-0000-7000-8000-000000000212');
select is(
  pg_temp.failure(format($sql$
    insert into planning.prescription_revisions (assignment_id, person_id, planned_step_id, override_kind,
      value_numeric, unit_code, created_by_assignment_id)
    values (%L, '019f4100-0000-7000-8000-000000000001', '019f4100-0000-7000-8000-000000000313',
      'target_distance', 1200, 'test_m', '019f4100-0000-7000-8000-000000000801')$sql$, :'a1')),
  '23514 ', 'T-PLN-MANAGE-INT-30 IX-13 holds below the command: a kind its step cannot take');
select is(
  pg_temp.failure(format($sql$
    insert into planning.prescription_revisions (assignment_id, person_id, planned_step_id, override_kind,
      value_integer, created_by_assignment_id)
    values (%L, '019f4100-0000-7000-8000-000000000001', '019f4100-0000-7000-8000-000000000363',
      'target_sets', 4, '019f4100-0000-7000-8000-000000000801')$sql$, :'a1')),
  '23514 ', 'T-PLN-MANAGE-INT-31 and a step from another version');
select is(
  pg_temp.violated(format($sql$
    insert into planning.prescription_revisions (assignment_id, person_id, planned_step_id, override_kind,
      value_integer, value_text, created_by_assignment_id)
    values (%L, '019f4100-0000-7000-8000-000000000001', '019f4100-0000-7000-8000-000000000313',
      'target_sets', 4, 'four', '019f4100-0000-7000-8000-000000000801')$sql$, :'a1')),
  '23514 ck_prescription_revisions_value', 'T-PLN-MANAGE-INT-32 an adjustment carries exactly one value');
set local role allfit_api;

-- ———————————————————————————————————— What Space trains

select pg_temp.act('019f4100-0000-7000-8000-000000000001');
select planned, exercises from execution.read_execution(
  '019f4100-0000-7000-8000-000000000001', '019f4100-0000-7000-8000-000000000e01') \gset

select is(
  (select (:'planned'::jsonb->0->'target'->>'target_sets') || ' ' || (:'planned'::jsonb->0->'target'->>'target_reps')
          || ' ' || (:'planned'::jsonb->0->'target'->>'target_load_value')),
  '4 10 75', 'T-PLN-MANAGE-INT-33 the session she trains asks for the adjusted sets, reps and the latest load');
select is(
  (select jsonb_agg(jsonb_build_array(item->>'set_order', item->>'kind', item->>'target_reps', item->>'target_load_value')
                    order by position)
     from jsonb_array_elements(:'planned'::jsonb->0->'sets') with ordinality as entry (item, position)),
  '[["1","warmup","12","20"],["2","normal","10","75"],["3","normal","10","75"],["4","normal","10","75"]]'::jsonb,
  'T-PLN-MANAGE-INT-34 a fourth working set joins, and the warm-up stays light');
select is(:'exercises'::jsonb->0->'target'->>'target_sets', '4',
  'T-PLN-MANAGE-INT-35 the session''s own list reads the same prescription');
select is(
  (select (:'planned'::jsonb->1->'target'->>'target_distance_value') || ' ' || (:'planned'::jsonb->1->'target'->>'notes')),
  '1200 Suave, sin pasar de zona 2', 'T-PLN-MANAGE-INT-36 the run carries its distance and its note');
select is(
  (select (sessions->0->>'set_count')::integer
     from planning.read_week_plan('019f4100-0000-7000-8000-000000000001', 'America/Bogota')),
  4, 'T-PLN-MANAGE-INT-37 and her week counts four sets');

-- ———————————————————————————————————— OP-PLN-018 shows it

select pg_temp.act('019f4100-0000-7000-8000-000000000012');
select item as listed from (
  select result as item from planning.list_relationship_assignments(
    '019f4100-0000-7000-8000-000000000012', '019f4100-0000-7000-8000-000000000101',
    '019f4100-0000-7000-8000-000000000701', 25, null, null)
) as page where item->>'id' = :'a1' \gset

select is(
  (select jsonb_agg(jsonb_build_array(adjustment->>'kind', adjustment->>'value')
                    order by adjustment->>'planned_step_id', adjustment->>'kind')
     from jsonb_array_elements(:'listed'::jsonb->'adjustments') as adjustment),
  '[["target_load","75"],["target_reps","10"],["target_sets","4"],["notes","Suave, sin pasar de zona 2"],["target_distance","1200"]]'::jsonb,
  'T-PLN-MANAGE-INT-38 the gym reads the adjustments in force, the latest of each');
select is(
  (select (session->>'started') || ' ' || (session->>'revision_number')
     from jsonb_array_elements(:'listed'::jsonb->'sessions') as session where session->>'id' = :'w1d1'),
  'true 0', 'T-PLN-MANAGE-INT-39 and which sessions already started');
select is(
  (select session->>'revision_number'
     from jsonb_array_elements(:'listed'::jsonb->'sessions') as session where session->>'id' = :'w2d1'),
  '1', 'T-PLN-MANAGE-INT-40 with the revision each one is at');

-- ———————————————————————————————————— Row policies, directly

reset role;
set local role allfit_owner;

select pg_temp.member('019f4100-0000-7000-8000-000000000012', '019f4100-0000-7000-8000-000000000101', '019f4100-0000-7000-8000-000000000212');
select is(
  pg_temp.affected(format(
    'update planning.planned_sessions set revision_number = revision_number where id = %L', :'w2d3')),
  1, 'T-PLN-MANAGE-RLS-13 planned_sessions_update_managing lets the holder write a session she manages');
select is(
  pg_temp.affected($sql$
    update planning.planned_sessions set revision_number = revision_number
    where id = '019f4100-0000-7000-8000-000000000912'$sql$),
  0, 'T-PLN-MANAGE-RLS-14 and not one she may only read');
select is(
  pg_temp.affected(format(
    'update planning.program_assignments set lifecycle = lifecycle where id = %L', :'a1')),
  0, 'T-PLN-MANAGE-RLS-34 program_assignments_update_administration: no coach ends a program by writing it');
select is(
  pg_temp.affected(format(
    $sql$update planning.assignment_management_periods set ended_at = clock_timestamp(), end_reason = 'cancelled'
    where assignment_id = %L and ended_at is null$sql$, :'a1')),
  0, 'T-PLN-MANAGE-RLS-35 assignment_management_periods_update_administration: nor closes its management');
select is(
  (select count(*)::integer from execution.planned_session_executions where planned_session_id = :'w1d1'),
  1, 'T-PLN-MANAGE-RLS-15 planned_session_executions_select_managing shows her that a session started');
select is(
  (select count(*)::integer from planning.prescription_revisions where assignment_id = :'a1'),
  6, 'T-PLN-MANAGE-RLS-16 prescription_revisions_select_managing shows her the adjustments');
select is(
  pg_temp.failure(format($sql$
    insert into planning.prescription_revisions (assignment_id, person_id, planned_step_id, override_kind,
      value_integer, created_by_assignment_id)
    values (%L, '019f4100-0000-7000-8000-000000000001', '019f4100-0000-7000-8000-000000000313',
      'target_sets', 5, '019f4100-0000-7000-8000-000000000805')$sql$, :'a1')),
  '42501 ', 'T-PLN-MANAGE-RLS-17 prescription_revisions_insert_managing: nobody signs as another professional');
select is(
  pg_temp.failure(format($sql$
    insert into planning.planned_session_reschedules (planned_session_id, person_id, assignment_id,
      relationship_id, moved_from, moved_to, rescheduled_by_membership_id)
    values (%L, '019f4100-0000-7000-8000-000000000001', %L, '019f4100-0000-7000-8000-000000000701',
      %L, %L, '019f4100-0000-7000-8000-000000000213')$sql$,
    :'w2d3', :'a1', (:'week2'::date + 3), (:'week2'::date + 4))),
  '42501 ', 'T-PLN-MANAGE-RLS-18 planned_session_reschedules_insert_managing: nor records a move as someone else');

select pg_temp.member('019f4100-0000-7000-8000-000000000015', '019f4100-0000-7000-8000-000000000101', '019f4100-0000-7000-8000-000000000215');
select is(
  (select count(*)::integer from execution.planned_session_executions where planned_session_id = :'w1d1'),
  0, 'T-PLN-MANAGE-RLS-19 a coach who does not attend her does not see the attempt');
select is(
  (select count(*)::integer from planning.prescription_revisions where assignment_id = :'a1'),
  0, 'T-PLN-MANAGE-RLS-20 nor the adjustments');

select pg_temp.member('019f4100-0000-7000-8000-000000000022', '019f4100-0000-7000-8000-000000000102', '019f4100-0000-7000-8000-000000000222');
select is(
  (select count(*)::integer from planning.prescription_revisions where assignment_id = :'a1'),
  0, 'T-PLN-MANAGE-RLS-21 nor does her coach at another gym');

select pg_temp.act('019f4100-0000-7000-8000-000000000001');
select is(
  (select count(*)::integer from planning.prescription_revisions where assignment_id = :'a1'),
  6, 'T-PLN-MANAGE-RLS-22 prescription_revisions_select_self shows Ana what was adjusted for her');
select pg_temp.act('019f4100-0000-7000-8000-000000000002');
select is(
  (select count(*)::integer from planning.prescription_revisions where assignment_id = :'a1'),
  0, 'T-PLN-MANAGE-RLS-23 and nobody else');

-- The administration scope opens only inside a command: an administrator sees nothing,
-- even naming the scope without its token.
select pg_temp.member('019f4100-0000-7000-8000-000000000016', '019f4100-0000-7000-8000-000000000101', '019f4100-0000-7000-8000-000000000216');
select is(
  (select count(*)::integer from planning.program_assignments where id = :'a1')
  + (select count(*)::integer from planning.planned_sessions where assignment_id = :'a1')
  + (select count(*)::integer from planning.assignment_management_periods where assignment_id = :'a1'),
  0, 'T-PLN-MANAGE-RLS-24 the administrator reads none of the assignment outside a command');
select set_config('app.contract_scope_purpose', 'assignment_administration', true);
select set_config('app.contract_scope_id', :'a1', true);
select set_config('app.contract_scope_token', 'forged', true);
select is(
  (select count(*)::integer from planning.program_assignments where id = :'a1')
  + (select count(*)::integer from planning.planned_sessions where id = :'w2d1'),
  0, 'T-PLN-MANAGE-RLS-25 and a forged scope opens nothing');
select set_config('app.contract_scope_purpose', 'planned_session_lookup', true);
select set_config('app.contract_scope_id', :'w2d1', true);
select is(
  (select count(*)::integer from planning.planned_sessions where id = :'w2d1'),
  0, 'T-PLN-MANAGE-RLS-26 nor does the lookup scope');

reset role;
set local role allfit_api;

-- ———————————————————————————————————— OP-PLN-014 · cancelling

-- A session left behind yesterday, which cancelling must not touch.
reset role;
insert into planning.planned_sessions (id, assignment_id, person_id, template_version_id, scheduled_at, timezone, week_starts_on, program_day)
values ('019f4100-0000-7000-8000-000000000931', :'a1', '019f4100-0000-7000-8000-000000000001',
  '019f4100-0000-7000-8000-000000000312', ((:'today'::date - 1)::timestamp at time zone 'America/Bogota'),
  'America/Bogota', date_trunc('week', (:'today'::date - 1))::date,
  extract(isodow from (:'today'::date - 1))::integer);
set local role allfit_api;

select pg_temp.act('019f4100-0000-7000-8000-000000000017');
select is(pg_temp.try_cancel('019f4100-0000-7000-8000-000000000017', '019f4100-0000-7000-8000-000000000101', :'a1'),
  '42501 ', 'T-PLN-MANAGE-RLS-27 staff does not cancel a program');
select pg_temp.act('019f4100-0000-7000-8000-000000000015');
select is(pg_temp.try_cancel('019f4100-0000-7000-8000-000000000015', '019f4100-0000-7000-8000-000000000101', :'a1'),
  'P0002 ', 'T-PLN-MANAGE-RLS-28 a coach who does not attend her does not find it');
select pg_temp.act('019f4100-0000-7000-8000-000000000021');
select is(pg_temp.try_cancel('019f4100-0000-7000-8000-000000000021', '019f4100-0000-7000-8000-000000000102', :'a1'),
  'P0002 ', 'T-PLN-MANAGE-RLS-29 another gym''s owner does not find it through her own gym');
select pg_temp.act('019f4100-0000-7000-8000-000000000016');
select is(pg_temp.try_cancel('019f4100-0000-7000-8000-000000000016', '019f4100-0000-7000-8000-000000000101',
  '019f4100-0000-7000-8000-000000000911'),
  'AF430 relationship_training:contribute', 'T-PLN-MANAGE-RLS-30 without the permission at contribute not even the administrator cancels');
select is(pg_temp.try_cancel('019f4100-0000-7000-8000-000000000016', '019f4100-0000-7000-8000-000000000101',
  '019f4100-0000-7000-8000-000000000921'),
  '55000 ', 'T-PLN-MANAGE-INT-41 a program the gym stopped managing is not its to cancel');
select is(pg_temp.try_cancel('019f4100-0000-7000-8000-000000000016', '019f4100-0000-7000-8000-000000000101',
  '019f4100-0000-7000-8000-000000000901'),
  'P0002 ', 'T-PLN-MANAGE-RLS-31 nor is her own');

-- psql unsets a variable a NULL lands in; a missing document must fail by name instead.
select coalesce(result, 'null'::jsonb) as cancelled, replayed::text as cancelled_replayed
from pg_temp.cancel('019f4100-0000-7000-8000-000000000016', '019f4100-0000-7000-8000-000000000101', :'a1',
  'b0000000-0000-4000-8000-000000000031') \gset

select is(
  (select (:'cancelled'::jsonb->>'status') || ' ' || (:'cancelled'::jsonb->>'sessions_cancelled')),
  'cancelled 3', 'T-PLN-MANAGE-API-03 the administrator cancels, and three sessions still to come stop');
select is(:'cancelled_replayed'::text, 'false', 'T-PLN-MANAGE-IDEM-05 the first cancellation is not a replay');

reset role;
select is(
  (select lifecycle::text from planning.program_assignments where id = :'a1'),
  'ended', 'T-PLN-MANAGE-INT-42 the assignment ends and stays (HU-050 criterion 3)');
select is(
  (select (ended_at is not null, end_reason)::text from planning.assignment_management_periods where assignment_id = :'a1'),
  '(t,cancelled)', 'T-PLN-MANAGE-INT-43 its management period closes as cancelled');
select is(
  (select jsonb_object_agg(id::text, status) from planning.planned_sessions where assignment_id = :'a1'),
  jsonb_build_object(
    :'w1d1', 'scheduled',
    '019f4100-0000-7000-8000-000000000931', 'scheduled',
    :'w2d1', 'cancelled',
    :'w2d3', 'cancelled'
  ) || (select jsonb_object_agg(id::text, 'cancelled') from planning.planned_sessions
        -- Yesterday's session is day 3 whenever today is a Thursday; it stays scheduled.
        where assignment_id = :'a1' and program_day = 3 and week_starts_on < :'week2'
          and id <> '019f4100-0000-7000-8000-000000000931'),
  'T-PLN-MANAGE-INT-44 only what was still to come and not started is cancelled (HU-050 criteria 1 and 2)');
select is(
  (select count(*)::integer from execution.planned_session_executions where planned_session_id = :'w1d1'),
  1, 'T-PLN-MANAGE-INT-45 what she trained stays');
select is(
  (select count(*)::integer from planning.prescription_revisions where assignment_id = :'a1'),
  6, 'T-PLN-MANAGE-INT-46 and so do the adjustments');
set local role allfit_api;

select pg_temp.act('019f4100-0000-7000-8000-000000000012');
select is(
  (select (result->>'sessions_cancelled') || ' ' || replayed::text
     from pg_temp.cancel('019f4100-0000-7000-8000-000000000012', '019f4100-0000-7000-8000-000000000101', :'a1',
       'b0000000-0000-4000-8000-000000000032')),
  '3 false', 'T-PLN-MANAGE-IDEM-06 cancelling again converges on the same cancellation');
select pg_temp.act('019f4100-0000-7000-8000-000000000016');
select is(
  (select replayed::text from pg_temp.cancel('019f4100-0000-7000-8000-000000000016',
     '019f4100-0000-7000-8000-000000000101', :'a1', 'b0000000-0000-4000-8000-000000000031')),
  'true', 'T-PLN-MANAGE-IDEM-07 and retrying the same command replays it');

reset role;
select is(
  (select count(*)::integer from system.outbox_events
    where aggregate_id = :'a1' and event_type = 'planning.assignment_cancelled.v1'),
  1, 'T-PLN-MANAGE-INT-47 the cancellation is announced once');
set local role allfit_api;

select pg_temp.act('019f4100-0000-7000-8000-000000000012');
select is(pg_temp.try_reschedule('019f4100-0000-7000-8000-000000000012', '019f4100-0000-7000-8000-000000000101',
  '019f4100-0000-7000-8000-000000000931', :'today', 0),
  '55000 ', 'T-PLN-MANAGE-INT-48 a cancelled program has no session left to move');
select is(pg_temp.try_revise('019f4100-0000-7000-8000-000000000012', '019f4100-0000-7000-8000-000000000101', :'a1',
  '019f4100-0000-7000-8000-000000000313', 'target_sets', '5', null),
  '55000 ', 'T-PLN-MANAGE-INT-49 nor a prescription to adjust');
select is(
  (select result->'status' || coalesce(result->'management', 'null'::jsonb)
     from planning.list_relationship_assignments('019f4100-0000-7000-8000-000000000012',
       '019f4100-0000-7000-8000-000000000101', '019f4100-0000-7000-8000-000000000701', 25, null, null)
    where result->>'id' = :'a1'),
  '["cancelled", null]'::jsonb, 'T-PLN-MANAGE-INT-50 the gym reads it as cancelled, no longer managed');

select pg_temp.act('019f4100-0000-7000-8000-000000000001');
select is(
  (select count(*)::integer from planning.read_my_programs('019f4100-0000-7000-8000-000000000001')
    where assignment_id = :'a1'),
  0, 'T-PLN-MANAGE-INT-51 Ana no longer finds it among the programs she follows');

select pg_temp.act('019f4100-0000-7000-8000-000000000011');
select is(
  (select result->>'status' from pg_temp.cancel('019f4100-0000-7000-8000-000000000011',
     '019f4100-0000-7000-8000-000000000101', :'a2', 'b0000000-0000-4000-8000-000000000033')),
  'cancelled', 'T-PLN-MANAGE-RLS-32 the owner cancels too');

-- ———————————————————————————————————— Adjustments outlive the relationship

select pg_temp.act('019f4100-0000-7000-8000-000000000012');
select pg_temp.revise('019f4100-0000-7000-8000-000000000012', '019f4100-0000-7000-8000-000000000101', :'a3',
  '019f4100-0000-7000-8000-000000000313', 'target_sets', '5', null, 'b0000000-0000-4000-8000-000000000041');

select pg_temp.act('019f4100-0000-7000-8000-000000000011');
select relationships.terminate_relationship(
  '019f4100-0000-7000-8000-000000000011', '019f4100-0000-7000-8000-000000000101',
  '019f4100-0000-7000-8000-000000000701', null, 'b0000000-0000-4000-8000-000000000042',
  'b0000000-0000-4000-8000-000000000042', extensions.digest('terminate', 'sha256'));

reset role;
select is(
  (select lifecycle::text from planning.program_assignments where id = :'a3'),
  'detached_pending_choice', 'T-PLN-MANAGE-INT-52 ending the relationship detaches the program');
-- Read as Ana: the gym no longer sees it, she does.
select pg_temp.act('019f4100-0000-7000-8000-000000000001');
select is(
  (planning.effective_target(:'a3'::uuid, '019f4100-0000-7000-8000-000000000313',
     '{"family":"strength","target_sets":3}'::jsonb) ->> 'target_sets'),
  '5', 'T-PLN-MANAGE-INT-53 and its adjustment is still the one in force (HU-049 criterion 3)');
select is(
  (planning.effective_target(null, '019f4100-0000-7000-8000-000000000313',
     '{"family":"strength","target_sets":3}'::jsonb) ->> 'target_sets'),
  '3', 'T-PLN-MANAGE-INT-54 a session outside any assignment reads the routine as published');

reset role;
select is(
  pg_temp.failure($sql$update planning.planned_session_reschedules set moved_to = moved_to$sql$),
  '23514 ', 'T-PLN-MANAGE-INT-55 a move is history and is never rewritten');
select is(
  pg_temp.violated(format($sql$
    insert into planning.prescription_revisions (assignment_id, person_id, planned_step_id, override_kind,
      value_integer, created_by_assignment_id)
    values (%L, '019f4100-0000-7000-8000-000000000001', '019f4100-0000-7000-8000-000000000313',
      'tempo', 3, '019f4100-0000-7000-8000-000000000801')$sql$, :'a1')),
  '23514 ck_prescription_revisions_kind', 'T-PLN-MANAGE-INT-56 an adjustment the dictionary does not type is refused below the command');

-- Bruno withdraws what he shared: the session is still found, and the answer names what is missing.
update privacy.data_grants set status = 'revoked', revoked_at = clock_timestamp()
where id = '019f4100-0000-7000-8000-000000000a02';
select pg_temp.act('019f4100-0000-7000-8000-000000000012');
select is(pg_temp.try_reschedule('019f4100-0000-7000-8000-000000000012', '019f4100-0000-7000-8000-000000000101',
  '019f4100-0000-7000-8000-000000000912', (:'week2'::date + 2), 0),
  'AF430 relationship_training:contribute', 'T-PLN-MANAGE-RLS-36 planned_sessions_select_lookup: with nothing shared the coach is told which permission is missing');

select * from finish();
rollback;
