-- T-SUP-BG-TRAIN-01 — OP-SUP-003: the training a standard window reads (`HU-BO-008`).
--
-- Criterion 2: a session opens to everything it recorded, by modality. The projection
-- carried strength sets and endurance laps only; intervals, rounds and mobility were
-- recorded and never shown.
--
-- Criterion 3, as decided: the agenda says what is planned and from which programme by
-- its name, and nothing of the programme's content. Her own programmes are part of
-- `prior_training_history`; a gym's are `relationship_training`, which until now
-- answered that the platform held no data although gyms assign programmes.

begin;

select plan(11);

insert into identity.people (id, given_name, family_name, status)
values
  ('019a8200-0000-7000-8000-000000000001', 'Manager', 'Alpha', 'active'),
  ('019a8200-0000-7000-8000-000000000002', 'Manager', 'Beta', 'active'),
  ('019a8200-0000-7000-8000-000000000003', 'Requester', 'Gamma', 'active'),
  ('019a8200-0000-7000-8000-000000000004', 'Approver', 'Delta', 'active'),
  ('019a8200-0000-7000-8000-000000000006', 'Subject', 'Zeta', 'active'),
  ('019a8200-0000-7000-8000-000000000008', 'Owner', 'Theta', 'active');

insert into identity.access_accounts (id, provider, issuer, subject, person_id)
values
  ('019a8200-0000-7000-8000-000000000011', 'workos', 'https://issuer.test', 'alpha82', null),
  ('019a8200-0000-7000-8000-000000000012', 'workos', 'https://issuer.test', 'beta82', null),
  ('019a8200-0000-7000-8000-000000000013', 'workos', 'https://issuer.test', 'gamma82',
    '019a8200-0000-7000-8000-000000000003'),
  ('019a8200-0000-7000-8000-000000000014', 'workos', 'https://issuer.test', 'delta82',
    '019a8200-0000-7000-8000-000000000004');

select support.bootstrap_backoffice_administrators(
  '019a8200-0000-7000-8000-000000000001', 'alpha82',
  '019a8200-0000-7000-8000-000000000002', 'beta82',
  'https://issuer.test', clock_timestamp() + interval '30 days', 'CEREMONY-BG-TRAIN-01'
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
  ('019a8200-0000-7000-8000-000000000021'::uuid, '019a8200-0000-7000-8000-000000000011'::uuid,
    'alpha82', 'b1'),
  ('019a8200-0000-7000-8000-000000000023'::uuid, '019a8200-0000-7000-8000-000000000013'::uuid,
    'gamma82', 'b3'),
  ('019a8200-0000-7000-8000-000000000024'::uuid, '019a8200-0000-7000-8000-000000000014'::uuid,
    'delta82', 'b4')
) as session_row(session_id, account_id, suffix, hash_byte);

select support.assign_platform_role(
  '019a8200-0000-7000-8000-000000000001', '019a8200-0000-7000-8000-000000000021',
  person_id, 'allfit_admin', key, command, decode(repeat(hash_byte, 32), 'hex')
)
from (values
  ('019a8200-0000-7000-8000-000000000003'::uuid, '019a8200-0000-7000-8000-000000000103'::uuid,
    '019a8200-0000-7000-8000-000000000203'::uuid, '53'),
  ('019a8200-0000-7000-8000-000000000004'::uuid, '019a8200-0000-7000-8000-000000000104'::uuid,
    '019a8200-0000-7000-8000-000000000204'::uuid, '54')
) as grant_row(person_id, key, command, hash_byte);

select support.assign_platform_duty(
  '019a8200-0000-7000-8000-000000000001', '019a8200-0000-7000-8000-000000000021',
  person_id, duty_code, clock_timestamp(), clock_timestamp() + interval '30 days', 'CASE-2026-082',
  key, command, decode(repeat(hash_byte, 32), 'hex')
)
from (values
  ('019a8200-0000-7000-8000-000000000003'::uuid, 'request_break_glass',
    '019a8200-0000-7000-8000-000000000113'::uuid, '019a8200-0000-7000-8000-000000000213'::uuid, '63'),
  ('019a8200-0000-7000-8000-000000000004'::uuid, 'approve_break_glass',
    '019a8200-0000-7000-8000-000000000114'::uuid, '019a8200-0000-7000-8000-000000000214'::uuid, '64')
) as duty_row(person_id, duty_code, key, command, hash_byte);

-- A gym she trains at, which assigned her a programme; and a programme of her own.
insert into organizations.organizations (id, type_code, display_name, responsible_party)
values ('019a8200-0000-7000-8000-000000000101', 'gym', 'Gimnasio Agenda',
  '{"party_kind":"legal_entity","party_name":"Gimnasio Agenda","purpose":"studio_operations"}');
insert into organizations.organization_memberships (id, organization_id, person_id)
values ('019a8200-0000-7000-8000-000000000201', '019a8200-0000-7000-8000-000000000101',
  '019a8200-0000-7000-8000-000000000008');
insert into organizations.membership_roles (membership_id, role_code)
values ('019a8200-0000-7000-8000-000000000201', 'owner');
insert into relationships.service_relationships (id, person_id, organization_id, status)
values ('019a8200-0000-7000-8000-000000000301', '019a8200-0000-7000-8000-000000000006',
  '019a8200-0000-7000-8000-000000000101', 'active');

insert into planning.session_templates (
  id, content_scope, owner_organization_id, owner_person_id, author_person_id, discipline_code, status
) values
  ('019a8200-0000-7000-8000-000000000801', 'organization', '019a8200-0000-7000-8000-000000000101',
    null, '019a8200-0000-7000-8000-000000000008', 'test_strength', 'published'),
  ('019a8200-0000-7000-8000-000000000802', 'person', null,
    '019a8200-0000-7000-8000-000000000006', '019a8200-0000-7000-8000-000000000006',
    'test_strength', 'published');
insert into planning.programs (
  id, content_scope, owner_organization_id, owner_person_id, author_person_id, status
) values
  ('019a8200-0000-7000-8000-000000000803', 'organization', '019a8200-0000-7000-8000-000000000101',
    null, '019a8200-0000-7000-8000-000000000008', 'published'),
  ('019a8200-0000-7000-8000-000000000804', 'person', null,
    '019a8200-0000-7000-8000-000000000006', '019a8200-0000-7000-8000-000000000006', 'published');
select set_config('app.planning_publication', 'true', true);
insert into planning.session_template_versions (
  id, template_id, version_number, discipline_code, activity_type_id, title, content_hash
) values
  ('019a8200-0000-7000-8000-000000000805', '019a8200-0000-7000-8000-000000000801', 1,
    'test_strength', '019c0000-0000-7000-8000-000000000011', 'Pierna pesada',
    decode(repeat('d5', 32), 'hex')),
  ('019a8200-0000-7000-8000-000000000806', '019a8200-0000-7000-8000-000000000802', 1,
    'test_strength', '019c0000-0000-7000-8000-000000000011', 'Movilidad en casa',
    decode(repeat('d6', 32), 'hex'));
insert into planning.program_versions (id, program_id, version_number, title, content_hash)
values
  ('019a8200-0000-7000-8000-000000000807', '019a8200-0000-7000-8000-000000000803', 1,
    'Fuerza 8 semanas', decode(repeat('d7', 32), 'hex')),
  ('019a8200-0000-7000-8000-000000000808', '019a8200-0000-7000-8000-000000000804', 1,
    'Mi rutina de casa', decode(repeat('d8', 32), 'hex'));
select set_config('app.planning_publication', '', true);
insert into planning.program_assignments (
  id, person_id, program_version_id, origin_relationship_id, lifecycle, starts_on, timezone,
  display_order
) values
  ('019a8200-0000-7000-8000-000000000811', '019a8200-0000-7000-8000-000000000006',
    '019a8200-0000-7000-8000-000000000807', '019a8200-0000-7000-8000-000000000301', 'active',
    current_date - 40, 'UTC', 0),
  ('019a8200-0000-7000-8000-000000000812', '019a8200-0000-7000-8000-000000000006',
    '019a8200-0000-7000-8000-000000000808', null, 'personal', current_date, 'UTC', 1);
insert into planning.assignment_management_periods (assignment_id, person_id, relationship_id, started_at)
values ('019a8200-0000-7000-8000-000000000811', '019a8200-0000-7000-8000-000000000006',
  '019a8200-0000-7000-8000-000000000301', clock_timestamp() - interval '40 days');
insert into planning.planned_sessions (
  id, assignment_id, person_id, template_version_id, scheduled_at, timezone, status,
  week_starts_on, program_day
)
select id, assignment_id, '019a8200-0000-7000-8000-000000000006', template_version_id, at, 'UTC',
       'scheduled', date_trunc('week', at)::date, 1
from (values
  ('019a8200-0000-7000-8000-000000000813'::uuid, '019a8200-0000-7000-8000-000000000811'::uuid,
    '019a8200-0000-7000-8000-000000000805'::uuid, clock_timestamp() + interval '2 days'),
  ('019a8200-0000-7000-8000-000000000814'::uuid, '019a8200-0000-7000-8000-000000000811'::uuid,
    '019a8200-0000-7000-8000-000000000805'::uuid, clock_timestamp() - interval '30 days'),
  ('019a8200-0000-7000-8000-000000000815'::uuid, '019a8200-0000-7000-8000-000000000812'::uuid,
    '019a8200-0000-7000-8000-000000000806'::uuid, clock_timestamp() + interval '1 day')
) as planned(id, assignment_id, template_version_id, at);

-- A session of her own with intervals, a round and a mobility hold.
insert into execution.executed_sessions (
  id, person_id, activity_type_id, result_contract_id, contract_version,
  started_at, ended_at, timezone, requested_level, capture_source
) values (
  '019a8200-0000-7000-8000-000000000901', '019a8200-0000-7000-8000-000000000006',
  '019c0000-0000-7000-8000-000000000011', '019c0000-0000-7000-8000-000000000031', 1,
  clock_timestamp() - interval '1 day', clock_timestamp() - interval '1 day' + interval '1 hour',
  'America/Bogota', 'summary', 'manual'
);
insert into execution.interval_results (
  executed_session_id, interval_number, work_duration_seconds, rest_duration_seconds, completed
) values
  ('019a8200-0000-7000-8000-000000000901', 1, 40, 20, true),
  ('019a8200-0000-7000-8000-000000000901', 2, 40, 20, false);
insert into execution.round_results (
  executed_session_id, round_number, activity_family, completed_repetitions
) values ('019a8200-0000-7000-8000-000000000901', 1, 'strength', 12);
insert into execution.mobility_results (
  executed_session_id, sequence_position, side, hold_duration_seconds
) values ('019a8200-0000-7000-8000-000000000901', 1, 'left', 30);

-- One standard window for both training categories.
select set_config('app.actor_kind', 'support', true),
       set_config('app.actor_person_id', '019a8200-0000-7000-8000-000000000003', true);

select support.request_break_glass(
  '019a8200-0000-7000-8000-000000000003', '019a8200-0000-7000-8000-000000000023',
  '019a8200-0000-7000-8000-000000000006', array['relationship_training', 'prior_training_history'],
  'customer_support_request', 'CASE-2026-084',
  'c2000000-0000-4000-8000-000000000001', '019a8200-0000-7000-8000-000000000301',
  decode(repeat('a1', 32), 'hex')
);
select support.decide_break_glass(
  '019a8200-0000-7000-8000-000000000004', '019a8200-0000-7000-8000-000000000024',
  (select id from support.break_glass_requests where case_reference = 'CASE-2026-084'),
  'approved', 'REASON-OK',
  'c2000000-0000-4000-8000-000000000002', '019a8200-0000-7000-8000-000000000302',
  decode(repeat('a2', 32), 'hex')
);

create temporary table own_read on commit drop as
select support.exercise_break_glass(
  '019a8200-0000-7000-8000-000000000003', '019a8200-0000-7000-8000-000000000023',
  (select id from support.break_glass_requests where case_reference = 'CASE-2026-084'),
  'prior_training_history', 'execution.executed_sessions', null
) as answer;

create temporary table gym_read on commit drop as
select support.exercise_break_glass(
  '019a8200-0000-7000-8000-000000000003', '019a8200-0000-7000-8000-000000000023',
  (select id from support.break_glass_requests where case_reference = 'CASE-2026-084'),
  'relationship_training', 'execution.executed_sessions', null
) as answer;

-- ---------------------------------------------------------------------------
-- Criterion 2 — a session opens to everything it recorded
-- ---------------------------------------------------------------------------

select results_eq(
  $$ select jsonb_array_length(entry->'interval_results'),
            jsonb_array_length(entry->'round_results'),
            jsonb_array_length(entry->'mobility_results')
     from own_read, jsonb_array_elements(answer->'content'->'prior_training_history') as entry $$,
  $$ values (2, 1, 1) $$,
  'T-SUP-BG-TRAIN-INT-01 a session carries its intervals, rounds and mobility, not only sets and laps'
);

select ok(
  (select entry->'interval_results'->1->>'completed' = 'false'
     and entry->'mobility_results'->0->>'side' = 'left'
   from own_read, jsonb_array_elements(answer->'content'->'prior_training_history') as entry),
  'T-SUP-BG-TRAIN-INT-02 each one as it was recorded, an unfinished interval included'
);

-- ---------------------------------------------------------------------------
-- Criterion 3 — the agenda, with the programme by its name and nothing else of it
-- ---------------------------------------------------------------------------

select results_eq(
  $$ select entry->>'program_title', (entry->>'from_gym')::boolean
     from own_read, jsonb_array_elements(answer->'content'->'agenda') as entry $$,
  $$ values ('Mi rutina de casa'::text, false) $$,
  'T-SUP-BG-TRAIN-INT-03 her history window shows what her own programmes plan'
);

select is(
  (select answer->>'outcome' from gym_read),
  'allowed',
  'T-SUP-BG-TRAIN-INT-04 a gym''s training is no longer answered as absent'
);

select results_eq(
  $$ select entry->>'program_title', (entry->>'from_gym')::boolean, entry->>'status'
     from gym_read, jsonb_array_elements(answer->'content'->'agenda') as entry $$,
  $$ values ('Fuerza 8 semanas'::text, true, 'scheduled'::text) $$,
  'T-SUP-BG-TRAIN-INT-05 the gym window shows the gym''s plan, from two weeks back onwards'
);

select ok(
  (select bool_and(position('Pierna pesada' in answer::text) = 0
     and position('Movilidad en casa' in answer::text) = 0
     and position('Gimnasio Agenda' in answer::text) = 0)
   from (select answer from own_read union all select answer from gym_read) as both_reads),
  'T-SUP-BG-TRAIN-INT-06 the agenda never carries the programme''s content or the gym''s name'
);

select is(
  (select jsonb_array_length(answer->'content'->'relationship_training') from gym_read),
  0,
  'T-SUP-BG-TRAIN-INT-07 a session trained under a gym is the gym window''s, and none exists yet'
);

-- ---------------------------------------------------------------------------
-- The policies the reads stand on: the reader of a live window, nobody else
-- ---------------------------------------------------------------------------

set local role allfit_owner;
select is(
  (select count(*)::integer from planning.planned_sessions
   where person_id = '019a8200-0000-7000-8000-000000000006'),
  3,
  'T-SUP-BG-TRAIN-RLS-01 under a live training window the reader sees her planned sessions'
);
select is(
  (select count(*)::integer from planning.program_versions
   where id in ('019a8200-0000-7000-8000-000000000807', '019a8200-0000-7000-8000-000000000808')),
  2,
  'T-SUP-BG-TRAIN-RLS-02 and the versions those sessions come from'
);
select set_config('app.actor_person_id', '019a8200-0000-7000-8000-000000000004', true);
select is(
  (select count(*)::integer from planning.planned_sessions
   where person_id = '019a8200-0000-7000-8000-000000000006'),
  0,
  'T-SUP-BG-TRAIN-RLS-03 whoever approved the window sees none of it'
);
select is(
  (select count(*)::integer from planning.program_assignments
   where person_id = '019a8200-0000-7000-8000-000000000006'),
  0,
  'T-SUP-BG-TRAIN-RLS-04 nor her assignments'
);
reset role;

select * from finish();
rollback;
