import { afterAll, beforeEach, expect, test } from 'bun:test'
import postgres from 'postgres'

// HU-STUDIO-054 against OP-REL-008, and HU-SP-032 against itself. A session started while
// the gym lets go of the program is never produced inside a relationship that already
// ended; two hides of the same session from the same gym leave one denial. Fixtures are
// committed so independent sessions see them; every command commits too.
const id = (n: number) => `019f4701-0000-7000-8000-${String(n).padStart(12, '0')}`
const key = (n: number) => `019f4701-0000-4000-8000-${String(n).padStart(12, '0')}`
const options = {
  host: process.env.SUPABASE_DB_HOST ?? '127.0.0.1',
  port: Number(process.env.SUPABASE_DB_PORT ?? 54322),
  database: process.env.SUPABASE_DB_NAME ?? 'postgres',
  username: process.env.SUPABASE_DB_USER ?? 'postgres',
  password: process.env.SUPABASE_DB_PASSWORD ?? 'postgres',
  prepare: false,
  max: 1,
  connect_timeout: 2,
} as const
const admin = postgres(options)
const client = postgres(options)
const owner = postgres(options)
type Transaction = postgres.TransactionSql

const CLIENT = id(1)
const OWNER = id(11)
const COACH = id(12)
const ORGANIZATION = id(101)
const RELATIONSHIP = id(701)
const VERSION = id(332)
const ASSIGNMENT = id(911)
const PLANNED = id(912)
const EARLIER = id(921)
const ALONE = id(922)
const ATTEMPT = id(931)
const COMMANDS = [ATTEMPT, key(902), key(903), key(904)]

async function cleanup() {
  await admin.begin(async (tx) => {
    // Commands leave append-only history behind; only this fixture is removed past it.
    await tx`set local session_replication_role = replica`
    await tx`delete from system.idempotency_keys where command_id = any(${COMMANDS}::uuid[])`
    await tx`delete from system.outbox_events where aggregate_id = ${RELATIONSHIP}::uuid
      or aggregate_id = ${ASSIGNMENT}::uuid
      or aggregate_id in (select id from privacy.session_visibility_denials where person_id = ${CLIENT}::uuid)`
    await tx`delete from privacy.session_visibility_denials where person_id = ${CLIENT}::uuid`
    await tx`delete from execution.session_exercises where executed_session_id in
      (select id from execution.executed_sessions where person_id = ${CLIENT}::uuid)`
    await tx`delete from execution.planned_session_executions where person_id = ${CLIENT}::uuid`
    await tx`delete from execution.executed_sessions where person_id = ${CLIENT}::uuid`
    await tx`delete from planning.planned_sessions where person_id = ${CLIENT}::uuid`
    await tx`delete from planning.assignment_management_periods where person_id = ${CLIENT}::uuid`
    await tx`delete from planning.program_assignments where person_id = ${CLIENT}::uuid`
    await tx`delete from planning.program_version_sessions where program_version_id = ${VERSION}::uuid`
    await tx`delete from planning.program_versions where id = ${VERSION}::uuid`
    await tx`delete from planning.programs where id = ${id(331)}::uuid`
    await tx`delete from planning.session_template_versions where id = ${id(312)}::uuid`
    await tx`delete from planning.session_templates where id = ${id(311)}::uuid`
    await tx`delete from privacy.data_grants where relationship_id = ${RELATIONSHIP}::uuid`
    await tx`delete from privacy.consent_events where relationship_id = ${RELATIONSHIP}::uuid`
    await tx`delete from privacy.invitation_scope_options where id = ${id(601)}::uuid`
    await tx`delete from identity.invitation_intents where id = ${id(501)}::uuid`
    await tx`delete from identity.invitations where id = ${id(401)}::uuid`
    await tx`delete from privacy.scope_definitions where id = ${id(301)}::uuid`
    await tx`delete from relationships.relationship_termination_requests
      where relationship_id = ${RELATIONSHIP}::uuid`
    await tx`delete from relationships.relationship_professional_assignments
      where relationship_id = ${RELATIONSHIP}::uuid`
    await tx`delete from relationships.service_relationships where id = ${RELATIONSHIP}::uuid`
    await tx`delete from organizations.membership_events
      where membership_id in (${id(211)}::uuid, ${id(212)}::uuid)`
    await tx`delete from organizations.membership_roles
      where membership_id in (${id(211)}::uuid, ${id(212)}::uuid)`
    await tx`delete from organizations.organization_memberships
      where organization_id = ${ORGANIZATION}::uuid`
    await tx`delete from organizations.organization_events
      where organization_id = ${ORGANIZATION}::uuid`
    await tx`delete from organizations.organizations where id = ${ORGANIZATION}::uuid`
    await tx`delete from identity.people
      where id in (${CLIENT}::uuid, ${OWNER}::uuid, ${COACH}::uuid)`
  })
}

beforeEach(async () => {
  await cleanup()
  await admin.begin(async (tx) => {
    await tx`insert into identity.people (id, given_name, family_name, contact_email) values
      (${CLIENT}::uuid, 'Race', 'Client', null),
      (${OWNER}::uuid, 'Race', 'Owner', null),
      (${COACH}::uuid, 'Race', 'Coach', null)`
    await tx`insert into organizations.organizations (id, type_code, display_name, responsible_party)
      values (${ORGANIZATION}::uuid, 'gym', 'Session race',
      '{"party_kind":"legal_entity","party_name":"Session race","purpose":"studio_operations"}')`
    await tx`insert into organizations.organization_memberships (id, organization_id, person_id) values
      (${id(211)}::uuid, ${ORGANIZATION}::uuid, ${OWNER}::uuid),
      (${id(212)}::uuid, ${ORGANIZATION}::uuid, ${COACH}::uuid)`
    await tx`insert into organizations.membership_roles (membership_id, role_code) values
      (${id(211)}::uuid, 'owner'), (${id(212)}::uuid, 'coach')`
    await tx`insert into relationships.service_relationships
        (id, person_id, organization_id, status, started_at)
      values (${RELATIONSHIP}::uuid, ${CLIENT}::uuid, ${ORGANIZATION}::uuid, 'active',
        clock_timestamp() - interval '30 days')`
    await tx`insert into relationships.relationship_professional_assignments
        (relationship_id, person_id, organization_id, membership_id, kind, status, valid_from)
      values (${RELATIONSHIP}::uuid, ${CLIENT}::uuid, ${ORGANIZATION}::uuid, ${id(212)}::uuid,
        'holder', 'active', clock_timestamp() - interval '29 days')`
    // A version number no other fixture uses: scope versions are unique per code.
    await tx`insert into privacy.scope_definitions (id, scope_code, version_number, status, published_at)
      values (${id(301)}::uuid, 'relationship_training', 9147, 'published', clock_timestamp())`
    await tx`insert into identity.invitations (
        id, organization_id, issued_by_membership_id, channel, contact, token_hash,
        token_key_version, proposal_hash, responsible_party, status, expires_at)
      values (${id(401)}::uuid, ${ORGANIZATION}::uuid, ${id(211)}::uuid, 'email',
        'session-race@example.test', extensions.digest('session-race-token', 'sha256'), 1,
        extensions.digest('session-race-proposal', 'sha256'),
        '{"party_kind":"legal_entity","party_name":"Session race","purpose":"studio_operations"}',
        'completed', clock_timestamp() + interval '7 days')`
    await tx`insert into identity.invitation_intents (id, invitation_id, kind, status)
      values (${id(501)}::uuid, ${id(401)}::uuid, 'service_relationship', 'pending')`
    await tx`insert into privacy.invitation_scope_options (
        id, invitation_intent_id, scope_definition_id, scope_code, offered_access_level,
        purpose, presented_snapshot, decision, decided_at)
      values (${id(601)}::uuid, ${id(501)}::uuid, ${id(301)}::uuid, 'relationship_training',
        'contribute', 'Plan the training', '{"title":"Training"}'::jsonb, 'accepted',
        clock_timestamp())`
    await tx`insert into privacy.consent_events (
        id, person_id, relationship_id, organization_id, invitation_scope_option_id,
        scope_definition_id, scope_code, decision, presented_snapshot)
      values (${id(801)}::uuid, ${CLIENT}::uuid, ${RELATIONSHIP}::uuid, ${ORGANIZATION}::uuid,
        ${id(601)}::uuid, ${id(301)}::uuid, 'relationship_training', 'accepted',
        '{"title":"Training"}'::jsonb)`
    await tx`insert into privacy.data_grants (
        id, person_id, relationship_id, organization_id, scope_definition_id, scope_code,
        consent_event_id, access_level, purpose)
      values (${id(802)}::uuid, ${CLIENT}::uuid, ${RELATIONSHIP}::uuid, ${ORGANIZATION}::uuid,
        ${id(301)}::uuid, 'relationship_training', ${id(801)}::uuid, 'contribute',
        'Plan the training')`
    await tx`insert into planning.session_templates
        (id, content_scope, owner_organization_id, author_person_id, discipline_code, status)
      values (${id(311)}::uuid, 'organization', ${ORGANIZATION}::uuid, ${COACH}::uuid,
        'test_strength', 'published')`
    await tx`insert into planning.programs
        (id, content_scope, owner_organization_id, author_person_id, status)
      values (${id(331)}::uuid, 'organization', ${ORGANIZATION}::uuid, ${COACH}::uuid, 'published')`
    await tx`select set_config('app.planning_publication', 'true', true)`
    await tx`insert into planning.session_template_versions
        (id, template_id, version_number, discipline_code, activity_type_id, title, content_hash)
      values (${id(312)}::uuid, ${id(311)}::uuid, 1, 'test_strength',
        '019c0000-0000-7000-8000-000000000011', 'Race', decode(repeat('b1', 32), 'hex'))`
    await tx`insert into planning.program_versions (id, program_id, version_number, title, content_hash)
      values (${VERSION}::uuid, ${id(331)}::uuid, 1, 'Race block', decode(repeat('b2', 32), 'hex'))`
    await tx`insert into planning.program_version_sessions
        (program_version_id, template_version_id, position, week, day)
      values (${VERSION}::uuid, ${id(312)}::uuid, 1, 1, 1)`
    await tx`select set_config('app.planning_publication', '', true)`
    await tx`insert into planning.program_assignments (id, person_id, program_version_id,
        origin_relationship_id, lifecycle, starts_on, timezone, assigned_at, display_order)
      values (${ASSIGNMENT}::uuid, ${CLIENT}::uuid, ${VERSION}::uuid, ${RELATIONSHIP}::uuid, 'active',
        (clock_timestamp() at time zone 'America/Bogota')::date, 'America/Bogota',
        clock_timestamp() - interval '2 days', 1)`
    await tx`insert into planning.assignment_management_periods
        (assignment_id, person_id, relationship_id, started_at)
      values (${ASSIGNMENT}::uuid, ${CLIENT}::uuid, ${RELATIONSHIP}::uuid,
        clock_timestamp() - interval '2 days')`
    await tx`insert into planning.planned_sessions (id, assignment_id, person_id, template_version_id,
        scheduled_at, timezone, week_starts_on, program_day, status)
      values (${PLANNED}::uuid, ${ASSIGNMENT}::uuid, ${CLIENT}::uuid, ${id(312)}::uuid,
        clock_timestamp() - interval '1 day', 'America/Bogota',
        date_trunc('week', clock_timestamp() at time zone 'America/Bogota')::date, 1, 'completed')`
    // Done once already, inside the relationship. A termination locks only what is still
    // scheduled, so starting this one again is held back by the relationship alone.
    await tx`insert into execution.executed_sessions (id, person_id, activity_type_id,
        result_contract_id, contract_version, is_autonomous, context_relationship_id,
        context_organization_id, started_at, ended_at, timezone, execution_status,
        validation_status, requested_level, achieved_level, capture_source)
      values (${EARLIER}::uuid, ${CLIENT}::uuid, '019c0000-0000-7000-8000-000000000011',
        '019c0000-0000-7000-8000-000000000031', 1, false, ${RELATIONSHIP}::uuid,
        ${ORGANIZATION}::uuid, clock_timestamp() - interval '1 day',
        clock_timestamp() - interval '23 hours', 'America/Bogota', 'completed', 'valid',
        'detailed', 'detailed', 'manual'),
      (${ALONE}::uuid, ${CLIENT}::uuid, '019c0000-0000-7000-8000-000000000011',
        '019c0000-0000-7000-8000-000000000031', 1, true, null, null,
        clock_timestamp() - interval '3 days', clock_timestamp() - interval '71 hours',
        'America/Bogota', 'completed', 'valid', 'detailed', 'detailed', 'manual')`
    await tx`insert into execution.planned_session_executions
        (planned_session_id, executed_session_id, person_id, attempt_number)
      values (${PLANNED}::uuid, ${EARLIER}::uuid, ${CLIENT}::uuid, 1)`
  })
})

afterAll(async () => {
  try {
    await cleanup()
  } finally {
    await Promise.all([
      admin.end({ timeout: 1 }),
      client.end({ timeout: 1 }),
      owner.end({ timeout: 1 }),
    ])
  }
})

async function actAs(tx: Transaction, personId: string) {
  await tx`set local role allfit_api`
  await tx`select set_config('app.actor_kind', 'person', true),
    set_config('app.actor_person_id', ${personId}, true),
    set_config('app.request_id', gen_random_uuid()::text, true)`
}

async function start(tx: Transaction) {
  await actAs(tx, CLIENT)
  return tx`select * from execution.start_planned_session_attempt(
    ${CLIENT}::uuid, ${PLANNED}::uuid, clock_timestamp(), 'America/Bogota', 'detailed', 'manual',
    ${key(901)}::uuid, ${ATTEMPT}::uuid, extensions.digest('start', 'sha256'))`
}

async function terminate(tx: Transaction) {
  await actAs(tx, OWNER)
  return tx`select * from relationships.terminate_relationship(
    ${OWNER}::uuid, ${ORGANIZATION}::uuid, ${RELATIONSHIP}::uuid, null,
    ${key(902)}::uuid, ${key(902)}::uuid, extensions.digest('terminate', 'sha256'))`
}

async function hide(tx: Transaction, n: number) {
  await actAs(tx, CLIENT)
  return tx`select * from privacy.hide_session(
    ${CLIENT}::uuid, ${ALONE}::uuid, ${RELATIONSHIP}::uuid,
    ${key(n)}::uuid, ${key(n)}::uuid, extensions.digest('hide', 'sha256'))`
}

async function attempt() {
  return admin<{ is_autonomous: boolean; context_relationship_id: string | null }[]>`
    select is_autonomous, context_relationship_id from execution.executed_sessions
    where id = ${ATTEMPT}::uuid`
}

const pause = () => new Promise((resolve) => setTimeout(resolve, 200))

test('a start arriving while the termination commits finds the gym gone, and is hers alone', async () => {
  let starting: Promise<unknown> | undefined
  await owner.begin(async (tx) => {
    await terminate(tx)
    starting = client.begin(start)
    await pause()
  })
  await starting

  expect(await attempt()).toEqual([{ is_autonomous: true, context_relationship_id: null }])
})

test('a termination arriving while the start commits waits for it, and the session stays inside', async () => {
  let termination: Promise<unknown> | undefined
  await client.begin(async (tx) => {
    await start(tx)
    termination = owner.begin(terminate)
    await pause()
  })
  await termination

  expect(await attempt()).toEqual([{ is_autonomous: false, context_relationship_id: RELATIONSHIP }])
  const [assignment] = await admin<{ lifecycle: string }[]>`
    select lifecycle::text from planning.program_assignments where id = ${ASSIGNMENT}::uuid`
  expect(assignment?.lifecycle).toBe('detached_pending_choice')
})

test('two hides of the same session from the same gym leave one denial, announced once', async () => {
  let second: Promise<unknown> | undefined
  await client.begin(async (tx) => {
    await hide(tx, 903)
    second = owner.begin((other) => hide(other, 904))
    await pause()
  })
  await second

  const [state] = await admin<{ denials: number; events: number }[]>`
    select (select count(*)::int from privacy.session_visibility_denials
             where executed_session_id = ${ALONE}::uuid) as denials,
           (select count(*)::int from system.outbox_events
             where event_type = 'privacy.session_visibility_denied.v1'
               and aggregate_id in (select id from privacy.session_visibility_denials
                                    where executed_session_id = ${ALONE}::uuid)) as events`
  expect(state).toEqual({ denials: 1, events: 1 })
})
