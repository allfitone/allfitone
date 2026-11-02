import { afterAll, beforeEach, expect, test } from 'bun:test'
import postgres from 'postgres'

// OP-ORG-009 races. Dedicated namespace; fixtures are committed so independent sessions see them.
const id = (n: number) => `019d1401-0000-7000-8000-${String(n).padStart(12, '0')}`
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
type Transaction = postgres.TransactionSql

async function cleanup() {
  await admin.begin(async (tx) => {
    await tx`set constraints all deferred`
    await tx`update organizations.organizations set status = 'closed' where id = ${id(101)}::uuid`
    await tx`delete from system.outbox_events where aggregate_type = 'service_relationship' and aggregate_id = ${id(301)}::uuid`
    await tx`delete from system.idempotency_keys where command_id in (${id(901)}::uuid, ${id(902)}::uuid, ${id(903)}::uuid)`
    await tx`delete from relationships.relationship_professional_assignments where organization_id = ${id(101)}::uuid`
    await tx`delete from relationships.service_relationships where organization_id = ${id(101)}::uuid`
    await tx`delete from organizations.membership_events where membership_id in (${id(201)}::uuid, ${id(202)}::uuid)`
    await tx`delete from organizations.membership_roles where membership_id in (${id(201)}::uuid, ${id(202)}::uuid)`
    await tx`delete from organizations.organization_memberships where organization_id = ${id(101)}::uuid`
    await tx`delete from organizations.organizations where id = ${id(101)}::uuid`
    await tx`delete from identity.people where id in (${id(1)}::uuid, ${id(2)}::uuid, ${id(4)}::uuid)`
  })
}

beforeEach(async () => {
  await cleanup()
  await admin.begin(async (tx) => {
    await tx`set constraints all deferred`
    for (const n of [1, 2, 4]) {
      await tx`insert into identity.people (id, given_name, family_name) values (${id(n)}::uuid, 'Race', 'Fixture')`
    }
    await tx`insert into organizations.organizations (id, type_code, display_name, responsible_party)
      values (${id(101)}::uuid, 'gym', 'Termination race',
      '{"party_kind":"legal_entity","party_name":"Termination race","purpose":"studio_operations"}')`
    for (const n of [1, 2]) {
      await tx`insert into organizations.organization_memberships (id, organization_id, person_id)
        values (${id(200 + n)}::uuid, ${id(101)}::uuid, ${id(n)}::uuid)`
      await tx`insert into organizations.membership_roles (membership_id, role_code)
        values (${id(200 + n)}::uuid, ${n === 1 ? 'owner' : 'coach'})`
    }
    await tx`insert into relationships.service_relationships (id, person_id, organization_id, status)
      values (${id(301)}::uuid, ${id(4)}::uuid, ${id(101)}::uuid, 'active')`
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
    ])
  }
})

async function actor(tx: Transaction) {
  await tx`set local role allfit_api`
  await tx`select set_config('app.actor_kind', 'person', true),
    set_config('app.actor_person_id', ${id(1)}, true)`
}

function terminate(command: number) {
  return async (tx: Transaction) => {
    await actor(tx)
    return tx<{ result: { ended_at: string }; replayed: boolean }[]>`
      select * from organizations.terminate_membership(
        ${id(1)}::uuid, ${id(101)}::uuid, ${id(202)}::uuid,
        ${`019d1401-0000-4000-8000-${String(command).padStart(12, '0')}`}::uuid,
        ${id(command)}::uuid, extensions.digest('terminate', 'sha256'))`
  }
}

async function assign(tx: Transaction) {
  await actor(tx)
  return tx`select * from relationships.assign_relationship_holder(
    ${id(1)}::uuid, ${id(101)}::uuid, ${id(301)}::uuid, ${id(202)}::uuid,
    '019d1401-0000-4000-8000-000000000902', ${id(902)}::uuid, extensions.digest('assign', 'sha256'))`
}

test('an uncommitted assignment blocks termination; retry ends the committed assignment', async () => {
  await first.begin(async (assignment) => {
    await assign(assignment)
    await expect(second.begin(terminate(901))).rejects.toMatchObject({ code: '55P03' })
  })
  await second.begin(terminate(901))
  const [row] = await admin`select
      (select count(*)::int from relationships.relationship_professional_assignments
        where membership_id = ${id(202)}::uuid and status = 'active') as active,
      (select status::text from relationships.service_relationships
        where id = ${id(301)}::uuid) as relationship`
  expect(row).toEqual({ active: 0, relationship: 'active' })
})

test('a committed termination wins over a concurrent new assignment', async () => {
  await first.begin(async (termination) => {
    await terminate(901)(termination)
    await expect(second.begin(assign)).rejects.toMatchObject({ code: '55P03' })
  })
  await expect(second.begin(assign)).rejects.toMatchObject({ code: '42501' })
})

test('two concurrent terminations serialize and converge on one closing instant', async () => {
  let original = ''
  await first.begin(async (termination) => {
    const [row] = await terminate(901)(termination)
    original = row?.result.ended_at ?? ''
    await expect(second.begin(terminate(903))).rejects.toMatchObject({ code: '55P03' })
  })
  const [converged] = await second.begin(terminate(903))
  expect(converged).toEqual({
    result: expect.objectContaining({ ended_at: original }),
    replayed: false,
  })
  const [events] = await admin`select count(*)::int as count from organizations.membership_events
    where membership_id = ${id(202)}::uuid and event_type = 'organization.membership_terminated.v1'`
  expect(events?.count).toBe(1)
})
