import { afterAll, beforeEach, expect, test } from 'bun:test'
import postgres from 'postgres'

// HU-STUDIO-033 criterion 7 under concurrency: a request is never left pending behind a
// change that should have settled it. Fixtures are committed so independent sessions
// see them; every command commits too.
const id = (n: number) => `019d1201-0000-7000-8000-${String(n).padStart(12, '0')}`
const key = (n: number) => `019d1201-0000-4000-8000-${String(n).padStart(12, '0')}`
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
const coach = postgres(options)
const owner = postgres(options)
type Transaction = postgres.TransactionSql

const ORGANIZATION = id(101)
const RELATIONSHIP = id(701)
const OWNER = id(11)
const COACH = id(12)

async function cleanup() {
  await admin.begin(async (tx) => {
    // Commands leave append-only history behind; only this fixture is removed past it.
    await tx`set local session_replication_role = replica`
    await tx`delete from system.idempotency_keys where command_id in (
      ${id(901)}::uuid, ${id(902)}::uuid, ${id(903)}::uuid)`
    await tx`delete from system.outbox_events where aggregate_id = ${RELATIONSHIP}::uuid
      or aggregate_id in (select id from relationships.relationship_termination_requests
                          where relationship_id = ${RELATIONSHIP}::uuid)`
    await tx`delete from relationships.relationship_termination_requests
      where relationship_id = ${RELATIONSHIP}::uuid`
    await tx`delete from relationships.relationship_professional_assignments
      where relationship_id = ${RELATIONSHIP}::uuid`
    await tx`delete from relationships.service_relationships where id = ${RELATIONSHIP}::uuid`
    await tx`delete from organizations.membership_events
      where membership_id in (${id(201)}::uuid, ${id(202)}::uuid, ${id(203)}::uuid)`
    await tx`delete from organizations.membership_roles
      where membership_id in (${id(201)}::uuid, ${id(202)}::uuid, ${id(203)}::uuid)`
    await tx`delete from organizations.organization_memberships
      where organization_id = ${ORGANIZATION}::uuid`
    await tx`delete from organizations.organization_events
      where organization_id = ${ORGANIZATION}::uuid`
    await tx`delete from organizations.organizations where id = ${ORGANIZATION}::uuid`
    await tx`delete from identity.people
      where id in (${id(1)}::uuid, ${OWNER}::uuid, ${COACH}::uuid, ${id(13)}::uuid)`
  })
}

beforeEach(async () => {
  await cleanup()
  await admin.begin(async (tx) => {
    await tx`insert into identity.people (id, given_name, family_name, contact_email) values
      (${id(1)}::uuid, 'Race', 'Client', 'race-client@example.test'),
      (${OWNER}::uuid, 'Race', 'Owner', null),
      (${COACH}::uuid, 'Race', 'Coach', null),
      (${id(13)}::uuid, 'Next', 'Coach', null)`
    await tx`insert into organizations.organizations (id, type_code, display_name, responsible_party)
      values (${ORGANIZATION}::uuid, 'gym', 'Request race',
      '{"party_kind":"legal_entity","party_name":"Request race","purpose":"studio_operations"}')`
    await tx`insert into organizations.organization_memberships (id, organization_id, person_id) values
      (${id(201)}::uuid, ${ORGANIZATION}::uuid, ${OWNER}::uuid),
      (${id(202)}::uuid, ${ORGANIZATION}::uuid, ${COACH}::uuid),
      (${id(203)}::uuid, ${ORGANIZATION}::uuid, ${id(13)}::uuid)`
    await tx`insert into organizations.membership_roles (membership_id, role_code) values
      (${id(201)}::uuid, 'owner'), (${id(202)}::uuid, 'coach'), (${id(203)}::uuid, 'coach')`
    await tx`insert into relationships.service_relationships
        (id, person_id, organization_id, status, started_at)
      values (${RELATIONSHIP}::uuid, ${id(1)}::uuid, ${ORGANIZATION}::uuid, 'active',
        clock_timestamp() - interval '30 days')`
    await tx`insert into relationships.relationship_professional_assignments
        (relationship_id, person_id, organization_id, membership_id, kind, status, valid_from)
      values (${RELATIONSHIP}::uuid, ${id(1)}::uuid, ${ORGANIZATION}::uuid, ${id(202)}::uuid,
        'holder', 'active', clock_timestamp() - interval '29 days')`
  })
})

afterAll(async () => {
  try {
    await cleanup()
  } finally {
    await Promise.all([
      admin.end({ timeout: 1 }),
      coach.end({ timeout: 1 }),
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

async function ask(tx: Transaction) {
  await actAs(tx, COACH)
  return tx`select * from relationships.request_relationship_termination(
    ${COACH}::uuid, ${ORGANIZATION}::uuid, ${RELATIONSHIP}::uuid, null,
    ${key(901)}::uuid, ${id(901)}::uuid, extensions.digest('ask', 'sha256'))`
}

async function terminate(tx: Transaction) {
  await actAs(tx, OWNER)
  return tx`select * from relationships.terminate_relationship(
    ${OWNER}::uuid, ${ORGANIZATION}::uuid, ${RELATIONSHIP}::uuid, null,
    ${key(902)}::uuid, ${id(902)}::uuid, extensions.digest('terminate', 'sha256'))`
}

async function reassign(tx: Transaction) {
  await actAs(tx, OWNER)
  return tx`select * from relationships.reassign_relationship_holder(
    ${OWNER}::uuid, ${ORGANIZATION}::uuid, ${RELATIONSHIP}::uuid, ${id(203)}::uuid,
    ${key(903)}::uuid, ${id(903)}::uuid, extensions.digest('reassign', 'sha256'))`
}

async function requests() {
  return admin<{ status: string; resolved_by_membership_id: string | null }[]>`
    select status::text, resolved_by_membership_id
    from relationships.relationship_termination_requests
    where relationship_id = ${RELATIONSHIP}::uuid`
}

const pause = () => new Promise((resolve) => setTimeout(resolve, 200))

test('a termination arriving while the request commits waits for it, then resolves it', async () => {
  let termination: Promise<unknown> | undefined
  await coach.begin(async (tx) => {
    await ask(tx)
    termination = owner.begin(terminate)
    await pause()
  })
  await termination

  expect(await requests()).toEqual([{ status: 'resolved', resolved_by_membership_id: id(201) }])
})

test('a request arriving while the termination commits finds the relationship over', async () => {
  let asking: Promise<unknown> | undefined
  await owner.begin(async (tx) => {
    await terminate(tx)
    asking = coach.begin(ask)
    await pause()
  })

  await expect(asking).rejects.toMatchObject({ code: 'P0004' })
  expect(await requests()).toEqual([])
})

test('a reassignment arriving while the request commits waits for it, then supersedes it', async () => {
  let reassignment: Promise<unknown> | undefined
  await coach.begin(async (tx) => {
    await ask(tx)
    reassignment = owner.begin(reassign)
    await pause()
  })
  await reassignment

  expect(await requests()).toEqual([{ status: 'superseded', resolved_by_membership_id: null }])
})
