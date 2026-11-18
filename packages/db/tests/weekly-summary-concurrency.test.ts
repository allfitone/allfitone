/**
 * OP-ITL-004 against itself (ADR-053, decision 10): the ceiling of a week under a real
 * race, and one request sent twice at the same instant.
 *
 * The ceiling is counted, and a count read before writing breaks when two requests
 * arrive together: both see one place left and both take it. An advisory lock per person
 * makes the second wait for the first; the first test is what tells that apart from the
 * look-before-you-write version, and it was watched failing without the lock.
 *
 * Fixtures are committed so independent sessions see them. Runs, consents, subscriptions
 * and plan versions are history and refuse deletion, so each run of this file uses fresh
 * identifiers and the cleanup removes only its own rows, past those guards.
 */

import { afterAll, beforeAll, beforeEach, expect, test } from 'bun:test'
import { randomUUID } from 'node:crypto'
import postgres from 'postgres'

const run = randomUUID().slice(0, 8)
const PERSON = randomUUID()
const PROPOSER = randomUUID()
const GRANTOR = randomUUID()
const DUTY = randomUUID()
const PLAN = randomUUID()
const VERSION = randomUUID()
const PRODUCT = `allfit.summary.${run}`
const PEOPLE = [PERSON, PROPOSER, GRANTOR]
// A text no migration will ever publish, so the fixture cannot meet a real one.
const TEXT = '2099-03-01'
const ZONE = 'America/Bogota'

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

async function forgetRuns(tx: Transaction) {
  await tx`delete from intelligence.weekly_summaries where person_id = ${PERSON}::uuid`
  await tx`delete from intelligence.runs where actor_person_id = ${PERSON}::uuid`
  await tx`
    delete from system.idempotency_keys
    where operation_code = 'OP-ITL-004'
      and principal_fingerprint = extensions.digest(convert_to(${PERSON}, 'UTF8'), 'sha256')`
}

async function cleanup() {
  await admin.begin(async (tx) => {
    // History is kept by triggers; only this fixture is removed past them.
    await tx`set local session_replication_role = replica`
    await forgetRuns(tx)
    await tx`delete from intelligence.consents where person_id = ${PERSON}::uuid`
    await tx`delete from intelligence.consent_versions where version = ${TEXT}`
    await tx`delete from payments.platform_payment_records where person_id = ${PERSON}::uuid`
    await tx`
      delete from payments.platform_subscription_events
      where platform_subscription_id in (
        select id from payments.platform_subscriptions where person_id = ${PERSON}::uuid)`
    await tx`
      delete from system.outbox_events
      where aggregate_id in (
        select id from payments.platform_subscriptions where person_id = ${PERSON}::uuid)`
    await tx`delete from payments.platform_subscriptions where person_id = ${PERSON}::uuid`
    await tx`delete from payments.platform_store_products where product_id = ${PRODUCT}`
    await tx`delete from payments.platform_plan_versions where id = ${VERSION}::uuid`
    await tx`delete from payments.platform_plans where id = ${PLAN}::uuid`
    await tx`delete from support.platform_duty_assignments where id = ${DUTY}::uuid`
    await tx`
      delete from system.idempotency_keys
      where principal_fingerprint in (
        select extensions.digest(convert_to(person::text, 'UTF8'), 'sha256')
        from unnest(${PEOPLE}::uuid[]) as person)`
    await tx`delete from identity.people where id = any(${PEOPLE}::uuid[])`
  })
}

async function actAsPerson(tx: Transaction) {
  await tx`set local role allfit_api`
  await tx`select set_config('app.actor_kind', 'person', true),
    set_config('app.actor_person_id', ${PERSON}, true),
    set_config('app.request_id', gen_random_uuid()::text, true)`
}

beforeAll(async () => {
  await admin.begin(async (tx) => {
    await tx`
      insert into identity.people (id, given_name, family_name, status)
      values (${PERSON}::uuid, 'Race', 'Summary', 'active'),
             (${PROPOSER}::uuid, 'Race', 'Proposer', 'active'),
             (${GRANTOR}::uuid, 'Race', 'Grantor', 'active')`
    // A plan she can hold: only the catalogue's author is needed, so its guards stay off.
    await tx`set local session_replication_role = replica`
    await tx`
      insert into support.platform_duty_assignments (
        id, person_id, duty_code, actor_mode, status, valid_from, valid_to,
        granted_by_person_id, reason_code
      ) values (
        ${DUTY}::uuid, ${PROPOSER}::uuid, 'manage_platform_commercial', 'A11', 'active',
        clock_timestamp(), clock_timestamp() + interval '30 days', ${GRANTOR}::uuid, 'RACE'
      )`
    await tx`set local session_replication_role = origin`
    await tx`
      insert into payments.platform_plans (
        id, code, name, plan_kind, created_by_person_id, created_by_duty_assignment_id
      ) values (
        ${PLAN}::uuid, ${`summary_${run}`}, 'Race', 'paid', ${PROPOSER}::uuid, ${DUTY}::uuid
      )`
    await tx`
      insert into payments.platform_plan_versions (
        id, platform_plan_id, plan_kind, version_number, amount_minor, currency_code,
        billing_period, proposed_by_person_id, proposed_by_duty_assignment_id
      ) values (
        ${VERSION}::uuid, ${PLAN}::uuid, 'paid', 1, 19900, 'COP', 'month',
        ${PROPOSER}::uuid, ${DUTY}::uuid
      )`
    await tx`
      insert into payments.platform_store_products (store, product_id, platform_plan_version_id)
      values ('app_store', ${PRODUCT}, ${VERSION}::uuid)`
    await tx`insert into intelligence.consent_versions (version) values (${TEXT})`
    await tx`insert into intelligence.consents (person_id, text_version)
      values (${PERSON}::uuid, ${TEXT})`
  })
  // Pro the way a person gets it: the store says she bought it.
  const bought = {
    store: 'app_store',
    environment: 'sandbox',
    product_id: PRODUCT,
    subscription_ref: `${run}-pro`,
    transaction_id: `${run}-pro`,
    account_token: PERSON,
    status: 'active',
    auto_renews: true,
    current_period_end: new Date(Date.now() + 30 * 86_400_000).toISOString(),
    observed_at: new Date().toISOString(),
  }
  await client.begin(async (tx) => {
    await actAsPerson(tx)
    await tx`select * from payments.record_store_subscription(
      ${PERSON}::uuid, ${JSON.stringify(bought)}::text::jsonb,
      ${randomUUID()}::uuid, ${randomUUID()}::uuid, extensions.gen_random_bytes(32))`
  })
})

beforeEach(async () => {
  await admin.begin(async (tx) => {
    await tx`set local session_replication_role = replica`
    await forgetRuns(tx)
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

/** Asks for the current week's summary; the key says which request it is. */
async function ask(tx: Transaction, key: string): Promise<string> {
  await actAsPerson(tx)
  const [row] = await tx<{ answer: { state: string } }[]>`
    select intelligence.begin_weekly_summary(
      ${PERSON}::uuid, date_trunc('week', clock_timestamp() at time zone ${ZONE})::date, ${ZONE},
      ${TEXT}, 'weekly-summary/1',
      ${key}::uuid, ${key}::uuid, extensions.digest(${key}, 'sha256')) as answer`
  return row?.answer.state ?? 'no answer'
}

async function sqlState(work: Promise<unknown> | undefined) {
  try {
    await work
    return 'no error'
  } catch (error) {
    return typeof error === 'object' && error !== null && 'code' in error ? error.code : 'unknown'
  }
}

async function runs() {
  const [state] = await admin<{ open: number; over: number }[]>`
    select count(*) filter (where outcome is null)::integer as open,
           count(*) filter (where outcome = 'over-ceiling')::integer as over
    from intelligence.runs where actor_person_id = ${PERSON}::uuid`
  return state
}

const pause = () => new Promise((resolve) => setTimeout(resolve, 200))

test('T-ITL-INT-23 two requests at the same instant for the last place: one takes it, the other is over the ceiling', async () => {
  for (let taken = 0; taken < 3; taken += 1) {
    expect(await client.begin((tx) => ask(tx, randomUUID()))).toBe('opened')
  }

  let second: Promise<string> | undefined
  const first = await client.begin(async (tx) => {
    const state = await ask(tx, randomUUID())
    second = other.begin((tx2) => ask(tx2, randomUUID()))
    await pause()
    return state
  })

  expect([first, await second]).toEqual(['opened', 'over-ceiling'])
  expect(await runs()).toEqual({ open: 4, over: 1 })
})

test('T-ITL-IDEM-11 one request sent twice at the same instant opens one run, and the second waits for it', async () => {
  const key = randomUUID()
  let second: Promise<string> | undefined
  const first = await client.begin(async (tx) => {
    const state = await ask(tx, key)
    second = other.begin((tx2) => ask(tx2, key))
    await pause()
    return state
  })

  expect(first).toBe('opened')
  // The model is still being asked: the copy is told to come back, and asks nothing.
  expect(await sqlState(second)).toBe('40001')
  expect(await runs()).toEqual({ open: 1, over: 0 })
})
