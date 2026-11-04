import { afterAll, beforeEach, expect, test } from 'bun:test'
import postgres from 'postgres'

/**
 * The last two Allfit administrators revoking each other at once (HU-BO-028).
 *
 * `prevent_last_platform_administrator_revocation` asks whether another administrator
 * is still active. Each revocation locks only its own row, so two revocations that start
 * together each see the other administrator active, both pass, and Backoffice is left
 * with nobody who can grant access again. One of them has to wait for the other.
 */

// Dedicated namespace; fixtures are committed so independent sessions see them.
const id = (n: number) => `019d1700-0000-7000-8000-${String(n).padStart(12, '0')}`
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

const ADA = id(1)
const BEA = id(2)

async function cleanup() {
  await admin.begin(async (tx) => {
    // Platform access history refuses deletion by trigger; only this fixture is removed.
    await tx`set local session_replication_role = replica`
    await tx`delete from support.platform_role_assignments where person_id in (${ADA}::uuid, ${BEA}::uuid)`
    await tx`delete from identity.people where id in (${ADA}::uuid, ${BEA}::uuid, ${id(3)}::uuid)`
  })
}

async function activeAdministrators(): Promise<number> {
  const [row] = await admin`select count(*)::int as active from support.platform_role_assignments
    where platform_role = 'allfit_admin' and status = 'active'`
  return row?.active ?? -1
}

beforeEach(async () => {
  await cleanup()
  await admin.begin(async (tx) => {
    for (const n of [1, 2, 3]) {
      await tx`insert into identity.people (id, given_name, family_name) values (${id(n)}::uuid, 'Admin', 'Race')`
    }
    for (const person of [ADA, BEA]) {
      await tx`insert into support.platform_role_assignments (person_id, platform_role, granted_by_person_id)
        values (${person}::uuid, 'allfit_admin', ${id(3)}::uuid)`
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

function revoke(tx: Transaction, person: string, by: string) {
  return tx`update support.platform_role_assignments
    set status = 'revoked', revoked_by_person_id = ${by}::uuid, revoked_at = clock_timestamp()
    where person_id = ${person}::uuid and status = 'active'`
}

/** Resolves once another session waits on a lock, or after a second if none ever does. */
async function untilSomebodyWaits(): Promise<void> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const [row] = await admin`select count(*)::int as waiting from pg_locks where not granted`
    if ((row?.waiting ?? 0) > 0) return
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
}

test('two administrators revoking each other at once leave one of them', async () => {
  // Cleaned here as well as after all: an administrator left active would stop being
  // the "last" one other suites count on.
  try {
    expect(await activeAdministrators()).toBe(2)

    let other: Promise<string> = Promise.resolve('not started')
    await first.begin(async (tx) => {
      await revoke(tx, ADA, BEA)
      other = second
        .begin((race) => revoke(race, BEA, ADA))
        .then(
          () => 'committed',
          (error: unknown) => String((error as { code?: unknown }).code),
        )
      // A check that does not wait lets the second revocation commit right here.
      await Promise.race([other, untilSomebodyWaits()])
    })

    expect(await other).toBe('23514')
    expect(await activeAdministrators()).toBe(1)
  } finally {
    await cleanup()
  }
})
