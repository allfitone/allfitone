import { afterAll, beforeEach, expect, test } from 'bun:test'
import postgres from 'postgres'

// HU-STUDIO-058 against itself, and HU-STUDIO-057/058 against OP-REL-008. Two corrections
// made over the same revision leave one, and the other learns the observation moved on; an
// observation or a correction racing the end of the relationship lands before it or is
// refused exactly as after it. Fixtures are committed so independent sessions see them.
const id = (n: number) => `019f5001-0000-7000-8000-${String(n).padStart(12, '0')}`
const key = (n: number) => `019f5001-0000-4000-8000-${String(n).padStart(12, '0')}`
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
const first = postgres(options)
const second = postgres(options)
const owner = postgres(options)
type Transaction = postgres.TransactionSql

const CLIENT = id(1)
const OWNER = id(11)
const COACH = id(12)
const ORGANIZATION = id(101)
const RELATIONSHIP = id(701)
const ASSIGNMENT = id(801)
const SESSION = id(901)
const OBSERVATION = id(951)
const RECORDED = id(952)
const COMMANDS = [RECORDED, id(953), id(954), key(902)]

async function cleanup() {
  await admin.begin(async (tx) => {
    // Revisions are append-only; only this fixture is removed past that.
    await tx`set local session_replication_role = replica`
    await tx`delete from system.idempotency_keys where command_id = any(${COMMANDS}::uuid[])`
    await tx`delete from system.outbox_events where aggregate_id in
      (${RELATIONSHIP}::uuid, ${ASSIGNMENT}::uuid, ${OBSERVATION}::uuid, ${RECORDED}::uuid)`
    await tx`delete from execution.observation_revisions where person_id = ${CLIENT}::uuid`
    await tx`delete from execution.professional_observations where person_id = ${CLIENT}::uuid`
    await tx`delete from execution.executed_sessions where person_id = ${CLIENT}::uuid`
    await tx`delete from privacy.data_grants where relationship_id = ${RELATIONSHIP}::uuid`
    await tx`delete from privacy.consent_events where relationship_id = ${RELATIONSHIP}::uuid`
    await tx`delete from privacy.invitation_scope_options where id = ${id(601)}::uuid`
    await tx`delete from identity.invitation_intents where id = ${id(501)}::uuid`
    await tx`delete from identity.invitations where id = ${id(401)}::uuid`
    await tx`delete from privacy.scope_resource_rules where scope_definition_id = ${id(301)}::uuid`
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
      values (${ORGANIZATION}::uuid, 'gym', 'Observation race',
      '{"party_kind":"legal_entity","party_name":"Observation race","purpose":"studio_operations"}')`
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
        (id, relationship_id, person_id, organization_id, membership_id, kind, status, valid_from)
      values (${ASSIGNMENT}::uuid, ${RELATIONSHIP}::uuid, ${CLIENT}::uuid, ${ORGANIZATION}::uuid,
        ${id(212)}::uuid, 'holder', 'active', clock_timestamp() - interval '29 days')`
    // A version number no other fixture uses: scope versions are unique per code.
    await tx`insert into privacy.scope_definitions (id, scope_code, version_number, status, published_at)
      values (${id(301)}::uuid, 'relationship_training', 9151, 'draft', null)`
    // IX-06: contributing is offered only where the published version admits it.
    await tx`insert into privacy.scope_resource_rules
        (scope_definition_id, resource, field, data_classification_code, max_action)
      values (${id(301)}::uuid, 'execution.professional_observations', '*', 'training', 'contribute')`
    await tx`update privacy.scope_definitions
      set status = 'published', published_at = clock_timestamp() where id = ${id(301)}::uuid`
    await tx`insert into identity.invitations (
        id, organization_id, issued_by_membership_id, channel, contact, token_hash,
        token_key_version, proposal_hash, responsible_party, status, expires_at)
      values (${id(401)}::uuid, ${ORGANIZATION}::uuid, ${id(211)}::uuid, 'email',
        'observation-race@example.test', extensions.digest('observation-race-token', 'sha256'), 1,
        extensions.digest('observation-race-proposal', 'sha256'),
        '{"party_kind":"legal_entity","party_name":"Observation race","purpose":"studio_operations"}',
        'completed', clock_timestamp() + interval '7 days')`
    await tx`insert into identity.invitation_intents (id, invitation_id, kind, status)
      values (${id(501)}::uuid, ${id(401)}::uuid, 'service_relationship', 'pending')`
    await tx`insert into privacy.invitation_scope_options (
        id, invitation_intent_id, scope_definition_id, scope_code, offered_access_level,
        purpose, presented_snapshot, decision, decided_at)
      values (${id(601)}::uuid, ${id(501)}::uuid, ${id(301)}::uuid, 'relationship_training',
        'contribute', 'Read and annotate the training', '{"title":"Training"}'::jsonb, 'accepted',
        clock_timestamp())`
    await tx`insert into privacy.consent_events (
        id, person_id, relationship_id, organization_id, invitation_scope_option_id,
        scope_definition_id, scope_code, decision, presented_snapshot)
      values (${id(611)}::uuid, ${CLIENT}::uuid, ${RELATIONSHIP}::uuid, ${ORGANIZATION}::uuid,
        ${id(601)}::uuid, ${id(301)}::uuid, 'relationship_training', 'accepted',
        '{"title":"Training"}'::jsonb)`
    await tx`insert into privacy.data_grants (
        id, person_id, relationship_id, organization_id, scope_definition_id, scope_code,
        consent_event_id, access_level, purpose)
      values (${id(612)}::uuid, ${CLIENT}::uuid, ${RELATIONSHIP}::uuid, ${ORGANIZATION}::uuid,
        ${id(301)}::uuid, 'relationship_training', ${id(611)}::uuid, 'contribute',
        'Read and annotate the training')`
    await tx`insert into execution.executed_sessions (id, person_id, activity_type_id,
        result_contract_id, contract_version, is_autonomous, context_relationship_id,
        context_organization_id, started_at, ended_at, timezone, execution_status,
        validation_status, requested_level, achieved_level, capture_source)
      values (${SESSION}::uuid, ${CLIENT}::uuid, '019c0000-0000-7000-8000-000000000011',
        '019c0000-0000-7000-8000-000000000031', 1, false, ${RELATIONSHIP}::uuid,
        ${ORGANIZATION}::uuid, clock_timestamp() - interval '1 day',
        clock_timestamp() - interval '23 hours', 'America/Bogota', 'completed', 'valid',
        'detailed', 'detailed', 'manual')`
    await tx`insert into execution.professional_observations (
        id, person_id, executed_session_id, relationship_id, organization_id,
        author_assignment_id, author_membership_id, data_classification_code, provenance, content)
      values (${OBSERVATION}::uuid, ${CLIENT}::uuid, ${SESSION}::uuid, ${RELATIONSHIP}::uuid,
        ${ORGANIZATION}::uuid, ${ASSIGNMENT}::uuid, ${id(212)}::uuid, 'training',
        'professional_observation', 'Una serie floja.')`
  })
})

afterAll(async () => {
  try {
    await cleanup()
  } finally {
    await Promise.all([
      admin.end({ timeout: 1 }),
      first.end({ timeout: 1 }),
      second.end({ timeout: 1 }),
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

async function revise(tx: Transaction, command: string, content: string) {
  await actAs(tx, COACH)
  return tx`select * from execution.revise_observation(
    ${COACH}::uuid, ${ORGANIZATION}::uuid, ${OBSERVATION}::uuid, 1, ${content}, 'Eran más.',
    ${command}::uuid, ${command}::uuid, extensions.digest(${content}, 'sha256'))`
}

async function observe(tx: Transaction) {
  await actAs(tx, COACH)
  return tx`select * from execution.record_observation(
    ${COACH}::uuid, ${ORGANIZATION}::uuid, ${CLIENT}::uuid, ${SESSION}::uuid, 'training',
    'professional_observation', 'Buena técnica.', ${RECORDED}::uuid, ${RECORDED}::uuid,
    extensions.digest('observe', 'sha256'))`
}

async function terminate(tx: Transaction) {
  await actAs(tx, OWNER)
  return tx`select * from relationships.terminate_relationship(
    ${OWNER}::uuid, ${ORGANIZATION}::uuid, ${RELATIONSHIP}::uuid, null,
    ${key(902)}::uuid, ${key(902)}::uuid, extensions.digest('terminate', 'sha256'))`
}

const pause = () => new Promise((resolve) => setTimeout(resolve, 200))
const failure = (error: unknown) => error

async function observation() {
  return admin<{ revision_number: number; content: string; revisions: number; events: number }[]>`
    select observation.revision_number, observation.content,
      (select count(*)::int from execution.observation_revisions
        where observation_id = ${OBSERVATION}::uuid) as revisions,
      (select count(*)::int from system.outbox_events
        where event_type = 'execution.observation_revised.v1'
          and aggregate_id = ${OBSERVATION}::uuid) as events
    from execution.professional_observations as observation
    where observation.id = ${OBSERVATION}::uuid`
}

test('two corrections over the same revision leave one, and the other is told what it missed', async () => {
  let other: Promise<unknown> | undefined
  await first.begin(async (tx) => {
    await revise(tx, id(953), 'Dos series flojas.')
    other = second.begin((tx2) => revise(tx2, id(954), 'Tres series flojas.')).catch(failure)
    await pause()
  })
  const outcome = await other

  expect(outcome).toMatchObject({ code: '40001', message: 'stale-draft' })
  const current: unknown = JSON.parse(String((outcome as { detail?: string }).detail))
  expect(current).toMatchObject({ revision_number: 2, content: 'Dos series flojas.' })
  expect(await observation()).toEqual([
    { revision_number: 2, content: 'Dos series flojas.', revisions: 1, events: 1 },
  ])
})

test('an observation arriving while the termination commits is refused as after it', async () => {
  let observing: Promise<unknown> | undefined
  await owner.begin(async (tx) => {
    await terminate(tx)
    observing = first.begin(observe).catch(failure)
    await pause()
  })

  expect(await observing).toMatchObject({ code: 'P0002', message: 'client not found' })
  const [left] = await admin<{ count: number }[]>`
    select count(*)::int as count from execution.professional_observations
    where id = ${RECORDED}::uuid`
  expect(left?.count).toBe(0)
})

test('a correction arriving while the termination commits is refused as after it', async () => {
  let revising: Promise<unknown> | undefined
  await owner.begin(async (tx) => {
    await terminate(tx)
    revising = first.begin((tx2) => revise(tx2, id(953), 'Dos series flojas.')).catch(failure)
    await pause()
  })

  expect(await revising).toMatchObject({ code: 'P0002', message: 'client not found' })
  expect(await observation()).toEqual([
    { revision_number: 1, content: 'Una serie floja.', revisions: 0, events: 0 },
  ])
})
