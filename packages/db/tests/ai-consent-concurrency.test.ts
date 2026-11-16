import { afterAll, beforeEach, expect, test } from 'bun:test'
import postgres from 'postgres'

// OP-ITL-001 and OP-ITL-002 against themselves (ADR-053, decision 4). Two consents given
// at the same instant leave one in force; a consent given while she withdraws arrives
// after the withdrawal, so the last thing she decided is the one that stands.
// Fixtures are committed so independent sessions see them; every command commits too.
const id = (n: number) => `019f4b01-0000-7000-8000-${String(n).padStart(12, '0')}`
const key = (n: number) => `019f4b01-0000-4000-8000-${String(n).padStart(12, '0')}`
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
const other = postgres(options)
type Transaction = postgres.TransactionSql

const PERSON = id(1)
// Texts no migration will ever publish, so the fixture cannot meet a real one.
const FIRST_TEXT = '2099-01-01'
const LATER_TEXT = '2099-01-02'
const COMMANDS = [key(901), key(902), key(903), key(904), key(905)]

async function cleanup() {
  await admin.begin(async (tx) => {
    // Consents keep their history by trigger; only this fixture is removed past it.
    await tx`set local session_replication_role = replica`
    await tx`delete from system.idempotency_keys where command_id = any(${COMMANDS}::uuid[])`
    await tx`delete from intelligence.consents where person_id = ${PERSON}::uuid`
    await tx`delete from intelligence.consent_versions
      where version in (${FIRST_TEXT}, ${LATER_TEXT})`
    await tx`delete from identity.people where id = ${PERSON}::uuid`
  })
}

beforeEach(async () => {
  await cleanup()
  await admin.begin(async (tx) => {
    await tx`insert into identity.people (id, given_name, family_name, contact_email)
      values (${PERSON}::uuid, 'Race', 'Consent', null)`
    await tx`insert into intelligence.consent_versions (version)
      values (${FIRST_TEXT}), (${LATER_TEXT})`
  })
})

afterAll(async () => {
  try {
    await cleanup()
  } finally {
    await Promise.all([
      admin.end({ timeout: 1 }),
      client.end({ timeout: 1 }),
      other.end({ timeout: 1 }),
    ])
  }
})

async function actAsPerson(tx: Transaction) {
  await tx`set local role allfit_api`
  await tx`select set_config('app.actor_kind', 'person', true),
    set_config('app.actor_person_id', ${PERSON}, true),
    set_config('app.request_id', gen_random_uuid()::text, true)`
}

async function give(tx: Transaction, n: number, version: string) {
  await actAsPerson(tx)
  return tx`select intelligence.give_consent(
    ${PERSON}::uuid, ${version},
    ${key(n)}::uuid, ${key(n)}::uuid, extensions.digest(${`give-${n}`}, 'sha256'))`
}

async function withdraw(tx: Transaction, n: number) {
  await actAsPerson(tx)
  return tx`select intelligence.withdraw_consent(
    ${PERSON}::uuid,
    ${key(n)}::uuid, ${key(n)}::uuid, extensions.digest(${`withdraw-${n}`}, 'sha256'))`
}

async function sqlState(work: Promise<unknown> | undefined) {
  try {
    await work
    return 'no error'
  } catch (error) {
    return typeof error === 'object' && error !== null && 'code' in error ? error.code : 'unknown'
  }
}

async function consents() {
  const [state] = await admin<{ in_force: string[]; ended: string[] }[]>`
    select
      coalesce(array_agg(text_version) filter (where ended_at is null), '{}') as in_force,
      coalesce(array_agg(text_version || ':' || end_reason order by ended_at)
        filter (where ended_at is not null), '{}') as ended
    from intelligence.consents
    where person_id = ${PERSON}::uuid`
  return state
}

const pause = () => new Promise((resolve) => setTimeout(resolve, 200))

test('T-ITL-INT-05 the same text given twice at the same instant is one consent', async () => {
  let second: Promise<unknown> | undefined
  await client.begin(async (tx) => {
    await give(tx, 901, FIRST_TEXT)
    second = other.begin((tx2) => give(tx2, 902, FIRST_TEXT))
    await pause()
  })

  expect(await sqlState(second)).toBe('no error')
  expect(await consents()).toEqual({ in_force: [FIRST_TEXT], ended: [] })
})

test('T-ITL-INT-06 two texts given at the same instant leave one in force and keep the other', async () => {
  let second: Promise<unknown> | undefined
  await client.begin(async (tx) => {
    await give(tx, 901, FIRST_TEXT)
    second = other.begin((tx2) => give(tx2, 902, LATER_TEXT))
    await pause()
  })

  expect(await sqlState(second)).toBe('no error')
  expect(await consents()).toEqual({
    in_force: [LATER_TEXT],
    ended: [`${FIRST_TEXT}:replaced`],
  })
})

test('T-ITL-INT-07 a consent given while she withdraws arrives after it, and stands', async () => {
  await client.begin((tx) => give(tx, 901, FIRST_TEXT))

  let giving: Promise<unknown> | undefined
  await other.begin(async (tx) => {
    await withdraw(tx, 903)
    giving = client.begin((tx2) => give(tx2, 904, FIRST_TEXT))
    await pause()
  })

  expect(await sqlState(giving)).toBe('no error')
  expect(await consents()).toEqual({
    in_force: [FIRST_TEXT],
    ended: [`${FIRST_TEXT}:withdrawn`],
  })
})

test('T-ITL-INT-08 a withdrawal arriving while she gives it waits, and then ends it', async () => {
  let withdrawing: Promise<unknown> | undefined
  await client.begin(async (tx) => {
    await give(tx, 901, FIRST_TEXT)
    withdrawing = other.begin((tx2) => withdraw(tx2, 905))
    await pause()
  })

  expect(await sqlState(withdrawing)).toBe('no error')
  expect(await consents()).toEqual({ in_force: [], ended: [`${FIRST_TEXT}:withdrawn`] })
})
