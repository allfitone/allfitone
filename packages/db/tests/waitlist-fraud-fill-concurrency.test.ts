/**
 * `T-WL-INT-07` — a sign-up marked as fraud while a number is being handed on (`OP-WL-007`,
 * `OP-WL-012`; ADR-050, decision 5).
 *
 * A freed Founding Member number goes to the earliest-confirmed sign-up that waits. The
 * hand-over chooses that sign-up and then writes its row, and the row may be locked by
 * the transaction that is marking it as fraud at that moment. When the lock is released
 * the hand-over must read the sign-up again and pass over it: a number given to a sign-up
 * the team just discarded would have to be taken back from a person already told.
 *
 * The mark is written here as the owner writes it, without the Backoffice command around
 * it: the race is in `waitlist.fill_founding_numbers`, and `T-WL-INT-06` covers the command.
 */

import { afterAll, describe, expect, test } from 'bun:test'
import { randomBytes, randomUUID } from 'node:crypto'
import postgres from 'postgres'

const sql = postgres({
  host: process.env.SUPABASE_DB_HOST ?? '127.0.0.1',
  port: Number(process.env.SUPABASE_DB_PORT ?? 54322),
  database: process.env.SUPABASE_DB_NAME ?? 'postgres',
  username: process.env.SUPABASE_DB_USER ?? 'postgres',
  password: process.env.SUPABASE_DB_PASSWORD ?? 'postgres',
  prepare: false,
  max: 6,
})

// Every address of a run carries this tag, so the run removes exactly what it wrote.
const RUN = `wq${randomBytes(6).toString('hex')}`
const address = (name: string) => `${name}@${RUN}.example.com`
const connections: Buffer[] = []
// By identifier, because the holder is deleted in the test and its event would stay.
const signups: string[] = []

afterAll(async () => {
  await sql`
    delete from system.outbox_events
    where aggregate_type = 'waitlist_signup' and aggregate_id = any(${signups}::uuid[])`
  await sql`delete from waitlist.signups where canonical_email like ${`%@${RUN}.example.com`}`
  await sql`delete from waitlist.rate_windows where scope_hash in ${sql(connections)}`
  await sql.end({ timeout: 1 })
})

function connection(): Buffer {
  const hash = randomBytes(32)
  connections.push(hash)
  return hash
}

/** Joins and confirms, and answers the sign-up's identifier. */
async function confirmed(name: string): Promise<string> {
  const confirmationHash = randomBytes(32)
  await sql`
    select * from waitlist.join(
      'Ana', ${address(name)}, 'es', true, '2026-11-10', null, null, null, null,
      ${connection()}, ${randomBytes(32)},
      ${randomUUID()}::uuid, ${confirmationHash}, ${randomUUID()}::uuid, ${randomBytes(32)},
      ${1}::smallint
    )`
  await sql`select * from waitlist.confirm(${confirmationHash}, ${connection()})`
  const [row] = await sql<Array<{ id: string }>>`
    select id from waitlist.signups where canonical_email = ${address(name)}`
  if (!row) throw new Error('the sign-up was not written')
  signups.push(row.id)
  return row.id
}

async function numberOf(id: string): Promise<number | null> {
  const [row] = await sql<Array<{ founding_number: number | null }>>`
    select founding_number from waitlist.signups where id = ${id}::uuid`
  return row?.founding_number ?? null
}

/** Waits until some transaction is blocked on a lock, which is the hand-over on the row. */
async function untilSomethingWaits(): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const [{ waiting } = { waiting: 0 }] = await sql<Array<{ waiting: number }>>`
      select count(*)::integer as waiting
      from pg_stat_activity
      where wait_event_type = 'Lock' and query like '%fill_founding_numbers%'`
    if (waiting > 0) return
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
  throw new Error('the hand-over never waited for the row')
}

describe('T-WL-INT-07 marking fraud while a number is handed on', () => {
  test('a number freed at that moment passes over the sign-up being marked', async () => {
    const [{ free } = { free: 0 }] = await sql<Array<{ free: number }>>`
      select 100 - count(*)::integer as free
      from waitlist.signups where founding_number is not null`
    if (free < 1) throw new Error('this test needs a free Founding Member number to hold')

    // The free numbers are taken one by one, so the last holder is this run's.
    let holder = ''
    for (let index = 0; index < free; index += 1) holder = await confirmed(`h${String(index)}`)
    const freed = await numberOf(holder)
    const marked = await confirmed('marked')
    const next = await confirmed('next')
    expect([freed !== null, await numberOf(marked), await numberOf(next)]).toEqual([
      true,
      null,
      null,
    ])

    let release = (): void => undefined
    const released = new Promise<void>((resolve) => (release = resolve))
    let rowLocked = (): void => undefined
    const locked = new Promise<void>((resolve) => (rowLocked = resolve))

    const marking = sql.begin(async (transaction) => {
      await transaction`
        update waitlist.signups set discard_reason = 'fraud' where id = ${marked}::uuid`
      rowLocked()
      await released
    })
    await locked

    // The holder leaves: its number is free, and the earliest sign-up that waits is `marked`.
    const handingOn = sql.begin(async (transaction) => {
      await transaction`delete from waitlist.signups where id = ${holder}::uuid`
      await transaction`select waitlist.fill_founding_numbers()`
    })
    await untilSomethingWaits()
    release()
    await Promise.all([marking, handingOn])

    expect([await numberOf(marked), await numberOf(next)]).toEqual([null, freed])
  })
})
