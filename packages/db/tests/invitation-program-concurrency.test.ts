import { afterAll, beforeEach, expect, test } from 'bun:test'
import postgres from 'postgres'

// HU-STUDIO-023 criteria 6 and 7 against OP-PLN-009: the program an invitation proposes
// is a published version when it is proposed and when it is created, whatever retirement
// crosses either moment. The ADR on invitation intents forbids substituting another, so
// a version retired first is recorded as not created, never replaced. Fixtures and every
// command commit, so independent sessions see them.
const id = (n: number) => `019f1601-0000-7000-8000-${String(n).padStart(12, '0')}`
const key = (n: number) => `019f1601-0001-7000-8000-${String(n).padStart(12, '0')}`
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
const twin = postgres(options)
const owner = postgres(options)
const coach = postgres(options)
type Transaction = postgres.TransactionSql

const CLIENT = id(1)
const OWNER = id(11)
const COACH = id(12)
const ORGANIZATION = id(101)
const PROGRAM = id(331)
const VERSION = id(332)
const INVITATION = key(801)
const CONTACT = 'race-program@example.test'
const NEWCOMER = 'race-program-newcomer@example.test'
const TOKEN = 'race-program-token'
const COMMANDS = [key(801), key(802), key(901), key(902), key(903), key(904)]
const OFFER = JSON.stringify([
  {
    scope_code: 'relationship_training',
    access_level: 'contribute',
    purpose: 'Plan the training',
    presented_snapshot: { title: 'Training' },
  },
])

async function cleanup() {
  await admin.begin(async (tx) => {
    // Commands leave append-only history behind; only this fixture is removed past it.
    await tx`set local session_replication_role = replica`
    await tx`delete from system.idempotency_keys where command_id = any(${COMMANDS}::uuid[])`
    await tx`delete from system.outbox_events where aggregate_id = any(${COMMANDS}::uuid[])
      or aggregate_id = ${VERSION}::uuid
      or aggregate_id in (select id from planning.program_assignments where person_id = ${CLIENT}::uuid)
      or aggregate_id in (select id from relationships.service_relationships where organization_id = ${ORGANIZATION}::uuid)`
    await tx`delete from planning.planned_sessions where person_id = ${CLIENT}::uuid`
    await tx`delete from planning.assignment_management_periods where person_id = ${CLIENT}::uuid`
    await tx`delete from identity.invitation_intents where invitation_id in
      (select id from identity.invitations where organization_id = ${ORGANIZATION}::uuid)`
    await tx`delete from planning.program_assignments where person_id = ${CLIENT}::uuid`
    await tx`delete from privacy.data_grants where organization_id = ${ORGANIZATION}::uuid`
    await tx`delete from privacy.consent_events where organization_id = ${ORGANIZATION}::uuid`
    await tx`delete from privacy.invitation_scope_options where scope_definition_id = ${id(301)}::uuid`
    await tx`delete from identity.invitations where organization_id = ${ORGANIZATION}::uuid`
    await tx`delete from relationships.service_relationships where organization_id = ${ORGANIZATION}::uuid`
    await tx`delete from planning.program_version_sessions where program_version_id = ${VERSION}::uuid`
    await tx`delete from planning.program_versions where id = ${VERSION}::uuid`
    await tx`delete from planning.programs where id = ${PROGRAM}::uuid`
    await tx`delete from planning.session_template_versions where id = ${id(312)}::uuid`
    await tx`delete from planning.session_templates where id = ${id(311)}::uuid`
    await tx`delete from privacy.scope_definitions where id = ${id(301)}::uuid`
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
    await tx`insert into identity.people (id, given_name, family_name) values
      (${CLIENT}::uuid, 'Race', 'Client'),
      (${OWNER}::uuid, 'Race', 'Owner'),
      (${COACH}::uuid, 'Race', 'Coach')`
    await tx`insert into organizations.organizations (id, type_code, display_name, responsible_party)
      values (${ORGANIZATION}::uuid, 'gym', 'Invitation program race',
      '{"party_kind":"legal_entity","party_name":"Program race","purpose":"studio_operations"}')`
    await tx`insert into organizations.organization_memberships (id, organization_id, person_id) values
      (${id(211)}::uuid, ${ORGANIZATION}::uuid, ${OWNER}::uuid),
      (${id(212)}::uuid, ${ORGANIZATION}::uuid, ${COACH}::uuid)`
    await tx`insert into organizations.membership_roles (membership_id, role_code) values
      (${id(211)}::uuid, 'owner'), (${id(212)}::uuid, 'coach')`
    // A version number no other fixture uses: scope versions are unique per code.
    await tx`insert into privacy.scope_definitions (id, scope_code, version_number, status, published_at)
      values (${id(301)}::uuid, 'relationship_training', 9161, 'published', clock_timestamp())`
    await tx`insert into planning.session_templates
        (id, content_scope, owner_organization_id, author_person_id, discipline_code, status)
      values (${id(311)}::uuid, 'organization', ${ORGANIZATION}::uuid, ${COACH}::uuid,
        'test_strength', 'published')`
    await tx`insert into planning.programs
        (id, content_scope, owner_organization_id, author_person_id, status)
      values (${PROGRAM}::uuid, 'organization', ${ORGANIZATION}::uuid, ${COACH}::uuid, 'published')`
    await tx`select set_config('app.planning_publication', 'true', true)`
    await tx`insert into planning.session_template_versions
        (id, template_id, version_number, discipline_code, activity_type_id, title, content_hash)
      values (${id(312)}::uuid, ${id(311)}::uuid, 1, 'test_strength',
        '019c0000-0000-7000-8000-000000000011', 'Race', decode(repeat('c1', 32), 'hex'))`
    await tx`insert into planning.program_versions (id, program_id, version_number, title, content_hash)
      values (${VERSION}::uuid, ${PROGRAM}::uuid, 1, 'Race block', decode(repeat('c2', 32), 'hex'))`
    await tx`insert into planning.program_version_sessions
        (program_version_id, template_version_id, position, week, day)
      values (${VERSION}::uuid, ${id(312)}::uuid, 1, 1, 1), (${VERSION}::uuid, ${id(312)}::uuid, 2, 2, 1)`
  })
  // The invitation the races answer, proposing the version they retire.
  await coach.begin((tx) => issue(tx, CONTACT, key(801)))
})

afterAll(async () => {
  try {
    await cleanup()
  } finally {
    await Promise.all(
      [admin, client, twin, owner, coach].map((connection) => connection.end({ timeout: 1 })),
    )
  }
})

async function actAs(tx: Transaction, personId: string, verifiedEmail = '') {
  await tx`set local role allfit_api`
  await tx`select set_config('app.actor_kind', 'person', true),
    set_config('app.actor_person_id', ${personId}, true),
    set_config('app.actor_verified_email', ${verifiedEmail}, true),
    set_config('app.request_id', gen_random_uuid()::text, true)`
}

async function issue(tx: Transaction, contact: string, command: string) {
  await actAs(tx, COACH)
  return tx`select * from identity.issue_client_invitation(
    ${COACH}::uuid, ${ORGANIZATION}::uuid, 'email', ${contact}, ${OFFER}::text::jsonb,
    extensions.digest(${TOKEN + contact}, 'sha256'), 1::smallint, ${command}::uuid,
    ${command}::uuid, extensions.digest(${'issue' + command}, 'sha256'),
    ${VERSION}::uuid, (clock_timestamp() at time zone 'America/Bogota')::date, 'America/Bogota')`
}

// The intent id arrives as an argument: the API learns it from the resolution read.
async function decide(tx: Transaction, command: string) {
  const [intent] = await admin<{ id: string }[]>`
    select id from identity.invitation_intents
    where invitation_id = ${INVITATION}::uuid and kind = 'service_relationship'`
  await actAs(tx, CLIENT, CONTACT)
  const [row] = await tx<{ program_proposal: Record<string, unknown> }[]>`
    select * from identity.decide_client_invitation(
      ${CLIENT}::uuid, extensions.digest(${TOKEN + CONTACT}, 'sha256'), ${intent?.id}::uuid,
      'accepted', '{"relationship_training":"accepted"}'::jsonb, ${command}::uuid,
      ${command}::uuid, extensions.digest(${'decide' + command}, 'sha256'), 'accepted',
      'America/Bogota')`
  return row
}

async function retire(tx: Transaction) {
  await actAs(tx, OWNER)
  return tx`select * from planning.deprecate_program_version(
    ${OWNER}::uuid, ${ORGANIZATION}::uuid, ${PROGRAM}::uuid, 1,
    ${key(903)}::uuid, ${key(903)}::uuid, extensions.digest('retire', 'sha256'))`
}

async function assignments() {
  return admin<{ lifecycle: string; version: string; sessions: number }[]>`
    select assignment.lifecycle::text, version.status::text as version,
           (select count(*)::int from planning.planned_sessions as session
             where session.assignment_id = assignment.id) as sessions
    from planning.program_assignments as assignment
    join planning.program_versions as version on version.id = assignment.program_version_id
    where assignment.person_id = ${CLIENT}::uuid`
}

const pause = () => new Promise((resolve) => setTimeout(resolve, 200))

test('an acceptance arriving while a retirement commits records the program as not created', async () => {
  let accepting: Promise<Awaited<ReturnType<typeof decide>>> | undefined
  await owner.begin(async (tx) => {
    await retire(tx)
    accepting = client.begin((inner) => decide(inner, key(901)))
    await pause()
  })
  const decided = await accepting

  expect(decided?.program_proposal).toMatchObject({
    intent_status: 'accepted',
    assignment_id: null,
    unmaterialized_reason: 'program_unavailable',
  })
  expect(await assignments()).toEqual([])
})

test('a retirement arriving while the acceptance commits waits for it, and the program stays hers', async () => {
  let retiring: Promise<unknown> | undefined
  let retired = false
  await client.begin(async (tx) => {
    await decide(tx, key(901))
    retiring = owner.begin(retire).then(() => {
      retired = true
    })
    await pause()
    // Held by the acceptance: a retirement that did not wait would already be done.
    expect(retired).toBe(false)
  })
  await retiring

  expect(await assignments()).toEqual([{ lifecycle: 'active', version: 'deprecated', sessions: 2 }])
})

test('a second answer arriving while the first commits waits, then finds the invitation answered', async () => {
  let second: Promise<unknown> | undefined
  await client.begin(async (tx) => {
    await decide(tx, key(901))
    second = twin.begin((inner) => decide(inner, key(902)))
    await pause()
  })

  // A stale read would go on to a second relationship and fail on its unique index instead.
  await expect(second).rejects.toMatchObject({ code: '23514' })
  expect(await assignments()).toEqual([{ lifecycle: 'active', version: 'published', sessions: 2 }])
  const [relationships] = await admin<{ count: number }[]>`
    select count(*)::int from relationships.service_relationships
    where organization_id = ${ORGANIZATION}::uuid`
  expect(relationships?.count).toBe(1)
})

test('an invitation issued while a retirement commits refuses the retired version', async () => {
  let issuing: Promise<unknown> | undefined
  await owner.begin(async (tx) => {
    await retire(tx)
    issuing = coach.begin((inner) => issue(inner, NEWCOMER, key(802)))
    await pause()
  })

  await expect(issuing).rejects.toMatchObject({ code: '22023', detail: '["program-version"]' })
  const [invitations] = await admin<{ count: number }[]>`
    select count(*)::int from identity.invitations
    where organization_id = ${ORGANIZATION}::uuid and contact = ${NEWCOMER}`
  expect(invitations?.count).toBe(0)
})
