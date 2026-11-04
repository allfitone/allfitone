import { afterAll, beforeEach, expect, test } from 'bun:test'
import postgres from 'postgres'

// OP-ORG-010 races. Dedicated namespace; fixtures are committed so independent sessions see them.
const id = (n: number) => `019d1501-0000-7000-8000-${String(n).padStart(12, '0')}`
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
    await tx`delete from system.outbox_events where aggregate_type = 'organization_membership' and aggregate_id = ${id(202)}::uuid`
    await tx`delete from system.idempotency_keys where command_id in (${id(901)}::uuid, ${id(902)}::uuid, ${id(903)}::uuid)`
    await tx`delete from organizations.membership_events where membership_id in (${id(201)}::uuid, ${id(202)}::uuid)`
    await tx`delete from organizations.membership_roles where membership_id in (${id(201)}::uuid, ${id(202)}::uuid)`
    await tx`delete from organizations.organization_memberships where organization_id = ${id(101)}::uuid`
    await tx`delete from organizations.organizations where id = ${id(101)}::uuid`
    await tx`delete from identity.people where id in (${id(1)}::uuid, ${id(2)}::uuid)`
  })
}

beforeEach(async () => {
  await cleanup()
  await admin.begin(async (tx) => {
    await tx`set constraints all deferred`
    for (const n of [1, 2]) {
      await tx`insert into identity.people (id, given_name, family_name, contact_email)
        values (${id(n)}::uuid, 'Race', 'Fixture', ${`race${n}@example.test`})`
    }
    await tx`insert into organizations.organizations (id, type_code, display_name, responsible_party)
      values (${id(101)}::uuid, 'gym', 'Resignation race',
      '{"party_kind":"legal_entity","party_name":"Resignation race","purpose":"studio_operations"}')`
    for (const n of [1, 2]) {
      await tx`insert into organizations.organization_memberships (id, organization_id, person_id)
        values (${id(200 + n)}::uuid, ${id(101)}::uuid, ${id(n)}::uuid)`
      await tx`insert into organizations.membership_roles (membership_id, role_code)
        values (${id(200 + n)}::uuid, ${n === 1 ? 'owner' : 'coach'})`
    }
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

async function actor(tx: Transaction, person: number) {
  await tx`set local role allfit_api`
  await tx`select set_config('app.actor_kind', 'person', true),
    set_config('app.actor_person_id', ${id(person)}, true)`
}

function key(command: number) {
  return `019d1501-0000-4000-8000-${String(command).padStart(12, '0')}`
}

function resign(command: number) {
  return async (tx: Transaction) => {
    await actor(tx, 2)
    return tx<{ result: { ended_at: string }; replayed: boolean }[]>`
      select * from organizations.resign_membership(
        ${id(2)}::uuid, ${id(101)}::uuid, ${key(command)}::uuid,
        ${id(command)}::uuid, extensions.digest('resign', 'sha256'))`
  }
}

async function terminate(tx: Transaction) {
  await actor(tx, 1)
  return tx`select * from organizations.terminate_membership(
    ${id(1)}::uuid, ${id(101)}::uuid, ${id(202)}::uuid,
    ${key(902)}::uuid, ${id(902)}::uuid, extensions.digest('terminate', 'sha256'))`
}

test('an uncommitted termination blocks resignation, which then finds nothing to resign', async () => {
  await first.begin(async (termination) => {
    await terminate(termination)
    await expect(second.begin(resign(901))).rejects.toMatchObject({ code: '55P03' })
  })
  await expect(second.begin(resign(901))).rejects.toMatchObject({ code: 'P0002' })
  const [row] = await admin`select count(*)::int as notices from system.outbox_events
    where aggregate_id = ${id(202)}::uuid and event_type = 'organization.membership_resigned.v1'`
  expect(row?.notices).toBe(0)
})

test('two concurrent resignations serialize, converge, and notify once', async () => {
  let original = ''
  await first.begin(async (resignation) => {
    const [row] = await resign(901)(resignation)
    original = row?.result.ended_at ?? ''
    await expect(second.begin(resign(903))).rejects.toMatchObject({ code: '55P03' })
  })
  const [converged] = await second.begin(resign(903))
  expect(converged).toEqual({
    result: expect.objectContaining({ ended_at: original }),
    replayed: false,
  })
  const [row] = await admin`select
      (select count(*)::int from organizations.membership_events
        where membership_id = ${id(202)}::uuid
          and event_type = 'organization.membership_resigned.v1') as events,
      (select count(*)::int from system.outbox_events
        where aggregate_id = ${id(202)}::uuid
          and event_type = 'organization.membership_resigned.v1') as notices`
  expect(row).toEqual({ events: 1, notices: 1 })
})
