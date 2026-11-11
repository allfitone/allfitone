/**
 * `T-WL-IDEM-01` — joining the waitlist at the same instant (`OP-WL-001`, ADR-050
 * invariants 2 and 6).
 *
 * Joining has no idempotency key: the mailbox is the key. These run the calls the way the
 * API does, through the same driver and with real concurrent transactions, because both
 * rules are races by nature. Two requests for one mailbox must leave one sign-up, and five
 * friends signing up from one connection in the same second must not all slip under the
 * ceiling of three.
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
  max: 8,
})

// Every address of a run carries this tag, so the run removes exactly what it wrote.
const RUN = `wl${randomBytes(6).toString('hex')}`
const address = (name: string) => `${name}@${RUN}.example.com`
// The attempt windows have no address to tag, so the run remembers its connections.
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

interface Joined {
  outcome: string
  referral_code: string | null
}

async function join(
  email: string,
  options: { inviterCode?: string; connection?: Buffer; device?: Buffer } = {},
): Promise<Joined> {
  const connection = options.connection ?? randomBytes(32)
  connections.push(connection)
  const [row] = await sql<Joined[]>`
    select * from waitlist.join(
      'Ana', ${email}, 'es', true, '2026-11-10', ${options.inviterCode ?? null},
      null, null, null,
      ${connection}, ${options.device ?? randomBytes(32)},
      ${randomUUID()}::uuid, ${randomBytes(32)}, ${randomUUID()}::uuid, ${randomBytes(32)},
      ${1}::smallint
    )`
  if (!row) throw new Error('waitlist.join returned no row')
  return row
}

describe('T-WL-IDEM-01 joining at the same instant', () => {
  test('one mailbox written five ways at once is one sign-up', async () => {
    const spellings = ['ana', 'Ana', 'ana+a', 'ana+b', 'ANA+c'].map(address)

    const results = await Promise.all(spellings.map((email) => join(email)))

    expect(results.map((result) => result.outcome).sort()).toEqual([
      'already_listed',
      'already_listed',
      'already_listed',
      'already_listed',
      'joined',
    ])
    const [{ count } = { count: -1 }] = await sql<Array<{ count: number }>>`
      select count(*)::integer as count from waitlist.signups
      where canonical_email = ${address('ana')}`
    expect(count).toBe(1)
  })

  test('five sign-ups for one inviter from one connection at once: three count', async () => {
    const inviter = await join(address('inviter'))
    if (!inviter.referral_code) throw new Error('the inviter got no code')
    const connection = randomBytes(32)

    await Promise.all(
      ['f1', 'f2', 'f3', 'f4', 'f5'].map((friend) =>
        join(address(friend), { inviterCode: inviter.referral_code ?? '', connection }),
      ),
    )

    const rows = await sql<Array<{ discard_reason: string | null }>>`
      select discard_reason from waitlist.signups
      where canonical_email like ${`f_@${RUN}.example.com`}`
    const reasons = rows.map((row) => row.discard_reason ?? 'counts').sort()
    expect(reasons).toEqual(['connection_cap', 'connection_cap', 'counts', 'counts', 'counts'])
  })
})
