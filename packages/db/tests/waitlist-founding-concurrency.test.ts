/**
 * `T-WL-INT-05` — confirming at the same instant (`OP-WL-002`, `OP-WL-007`; ADR-050
 * invariant 5).
 *
 * A Founding Member number has one holder. The pgTAP suite proves the order and the
 * hand-over one call at a time; this proves the part that is a race by nature: several
 * people confirming in the same moment, each in a real transaction of its own, the way
 * the API runs them.
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
  max: 12,
})

// Every address of a run carries this tag, so the run removes exactly what it wrote.
const RUN = `wf${randomBytes(6).toString('hex')}`
const address = (name: string) => `${name}@${RUN}.example.com`
const connections: Buffer[] = []

afterAll(async () => {
  await sql`
    delete from system.outbox_events
    where aggregate_type = 'waitlist_signup'
      and aggregate_id in (
        select id from waitlist.signups where canonical_email like ${`%@${RUN}.example.com`}
      )`
  await sql`delete from waitlist.signups where canonical_email like ${`%@${RUN}.example.com`}`
  await sql`delete from waitlist.rate_windows where scope_hash in ${sql(connections)}`
  await sql.end({ timeout: 1 })
})

function connection(): Buffer {
  const hash = randomBytes(32)
  connections.push(hash)
  return hash
}

/** Joins and answers the hash of the confirmation token, which is all confirming needs. */
async function join(email: string): Promise<Buffer> {
  const confirmationHash = randomBytes(32)
  await sql`
    select * from waitlist.join(
      'Ana', ${email}, 'es', true, '2026-11-10', null, null, null, null,
      ${connection()}, ${randomBytes(32)},
      ${randomUUID()}::uuid, ${confirmationHash}, ${randomUUID()}::uuid, ${randomBytes(32)},
      ${1}::smallint
    )`
  return confirmationHash
}

async function confirm(tokenHash: Buffer): Promise<number | null> {
  const [row] = await sql<Array<{ outcome: string; founding_number: number | null }>>`
    select * from waitlist.confirm(${tokenHash}, ${connection()})`
  if (row?.outcome !== 'confirmed') throw new Error('the confirmation did not confirm')
  return row.founding_number
}

async function freeNumbers(): Promise<number> {
  const [{ held } = { held: -1 }] = await sql<Array<{ held: number }>>`
    select count(*)::integer as held from waitlist.signups where founding_number is not null`
  return 100 - held
}

describe('T-WL-INT-05 confirming at the same instant', () => {
  test('ten people confirming at once take ten different numbers', async () => {
    const people = Array.from({ length: 10 }, (_, index) => address(`p${String(index)}`))
    const tokens = await Promise.all(people.map((email) => join(email)))
    const free = await freeNumbers()

    const numbers = await Promise.all(tokens.map((token) => confirm(token)))

    const given = numbers.filter((number): number is number => number !== null)
    expect(given).toHaveLength(Math.min(10, free))
    expect(new Set(given).size).toBe(given.length)
    // What each call answered is what its sign-up holds.
    const rows = await sql<Array<{ founding_number: number | null }>>`
      select founding_number from waitlist.signups
      where canonical_email like ${`p_@${RUN}.example.com`}`
    expect(rows.map((row) => row.founding_number).sort()).toEqual([...numbers].sort())
    const [{ events } = { events: -1 }] = await sql<Array<{ events: number }>>`
      select count(*)::integer as events
      from system.outbox_events as outbox
      join waitlist.signups as signup on signup.id = outbox.aggregate_id
      where outbox.event_type = 'waitlist.founding_number_assigned.v1'
        and signup.canonical_email like ${`p_@${RUN}.example.com`}`
    expect(events).toBe(given.length)
  })
})
