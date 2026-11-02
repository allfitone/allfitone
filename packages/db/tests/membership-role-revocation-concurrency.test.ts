import { afterAll, beforeEach, expect, test } from 'bun:test'
import postgres from 'postgres'

// Dedicated namespace; fixtures are committed so independent sessions see them.
const id = (n: number) => `019d1301-0000-7000-8000-${String(n).padStart(12, '0')}`
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
    await tx`delete from system.idempotency_keys where command_id in (${id(901)}::uuid, ${id(902)}::uuid)`
    await tx`delete from relationships.relationship_professional_assignments where organization_id = ${id(101)}::uuid`
    await tx`delete from relationships.service_relationships where organization_id = ${id(101)}::uuid`
    await tx`delete from organizations.membership_events where membership_id in (${id(201)}::uuid, ${id(202)}::uuid, ${id(203)}::uuid)`
    await tx`delete from organizations.membership_roles where membership_id in (${id(201)}::uuid, ${id(202)}::uuid, ${id(203)}::uuid)`
    await tx`delete from organizations.organization_memberships where organization_id = ${id(101)}::uuid`
    await tx`delete from organizations.organizations where id = ${id(101)}::uuid`
    await tx`delete from identity.people where id in (${id(1)}::uuid, ${id(2)}::uuid, ${id(3)}::uuid, ${id(4)}::uuid)`
  })
}

beforeEach(async () => {
  await cleanup()
  await admin.begin(async (tx) => {
    await tx`set constraints all deferred`
    for (const n of [1, 2, 3, 4]) {
      await tx`insert into identity.people (id, given_name, family_name) values (${id(n)}::uuid, 'Race', 'Fixture')`
    }
    await tx`insert into organizations.organizations (id, type_code, display_name, responsible_party)
      values (${id(101)}::uuid, 'gym', 'Role race',
      '{"party_kind":"legal_entity","party_name":"Role race","purpose":"studio_operations"}')`
    for (const n of [1, 2, 3]) {
      await tx`insert into organizations.organization_memberships (id, organization_id, person_id)
        values (${id(200 + n)}::uuid, ${id(101)}::uuid, ${id(n)}::uuid)`
      await tx`insert into organizations.membership_roles (membership_id, role_code)
        values (${id(200 + n)}::uuid, ${n === 1 ? 'owner' : 'coach'})`
    }
    await tx`insert into relationships.service_relationships (id, person_id, organization_id, status)
      values (${id(301)}::uuid, ${id(4)}::uuid, ${id(101)}::uuid, 'active')`
    await tx`insert into relationships.relationship_professional_assignments
      (id, relationship_id, person_id, organization_id, membership_id, kind, status,
       ends_on, covers_membership_id)
      values (${id(401)}::uuid, ${id(301)}::uuid, ${id(4)}::uuid, ${id(101)}::uuid,
       ${id(202)}::uuid, 'substitute', 'proposed', current_date + 5, ${id(203)}::uuid)`
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

async function actor(tx: Transaction, person = 1) {
  await tx`set local role allfit_api`
  await tx`select set_config('app.actor_kind', 'person', true),
    set_config('app.actor_person_id', ${id(person)}, true)`
}

async function revoke(tx: Transaction) {
  await actor(tx)
  return tx`select * from organizations.revoke_membership_role(
    ${id(1)}::uuid, ${id(101)}::uuid, ${id(202)}::uuid, 'coach',
    '019d1301-0000-4000-8000-000000000901', ${id(901)}::uuid, extensions.digest('revoke', 'sha256'))`
}

async function assign(tx: Transaction) {
  await actor(tx)
  return tx`select * from relationships.assign_relationship_holder(
    ${id(1)}::uuid, ${id(101)}::uuid, ${id(301)}::uuid, ${id(202)}::uuid,
    '019d1301-0000-4000-8000-000000000902', ${id(902)}::uuid, extensions.digest('assign', 'sha256'))`
}

async function accept(tx: Transaction) {
  await actor(tx, 4)
  return tx`select * from relationships.decide_substitution(
    ${id(4)}::uuid, ${id(301)}::uuid, ${id(401)}::uuid, 'accepted',
    '019d1301-0000-4000-8000-000000000902', ${id(902)}::uuid, extensions.digest('accept', 'sha256'))`
}

test('an uncommitted assignment blocks revoke; retry closes the committed assignment', async () => {
  await first.begin(async (assignment) => {
    await assign(assignment)
    await expect(second.begin(revoke)).rejects.toMatchObject({ code: '55P03' })
  })
  await second.begin(revoke)
  const [row] =
    await admin`select count(*)::int as active from relationships.relationship_professional_assignments
    where membership_id = ${id(202)}::uuid and status = 'active'`
  expect(row?.active).toBe(0)
})

test('a committed revocation wins over a concurrent new assignment', async () => {
  await first.begin(async (revocation) => {
    await revoke(revocation)
    await expect(second.begin(assign)).rejects.toMatchObject({ code: '55P03' })
  })
  await expect(second.begin(assign)).rejects.toMatchObject({ code: '42501' })
})

test('acceptance holding its assignment fails promptly against revoke membership lock, then stays denied', async () => {
  await first.begin(async (revocation) => {
    // Exact lock held by the coordinator before it reaches the assignments.
    await revocation`select id from organizations.organization_memberships where id = ${id(202)}::uuid for update`
    await expect(
      second.begin(async (decision) => {
        // Reproduce the reverse order used by decide_substitution.
        await decision`select id from relationships.relationship_professional_assignments where id = ${id(401)}::uuid for update`
        await accept(decision)
      }),
    ).rejects.toMatchObject({ code: '55P03' })
    await revoke(revocation)
  })
  await expect(second.begin(accept)).rejects.toMatchObject({ code: '42501' })
  const [row] =
    await admin`select status from relationships.relationship_professional_assignments where id = ${id(401)}::uuid`
  expect(row?.status).toBe('proposed')
})

test('a client outside the organization can accept a valid coach, then revoke ends that cover', async () => {
  await first.begin(accept)
  const [accepted] =
    await admin`select status from relationships.relationship_professional_assignments where id = ${id(401)}::uuid`
  expect(accepted?.status).toBe('active')
  await second.begin(revoke)
  const [ended] =
    await admin`select status, accepted_by_person_at from relationships.relationship_professional_assignments where id = ${id(401)}::uuid`
  expect(ended?.status).toBe('ended')
  expect(ended?.accepted_by_person_at).not.toBeNull()
})
