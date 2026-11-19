/**
 * The whole curation, loaded the way production loads it.
 *
 * `migrate curate` runs the scripts of `curation/RUN_ORDER`, in that order, against a
 * database built from the migrations alone. Nothing else in the repository runs them
 * all: `global-catalogue.test.ts` loads the first one and `db:reset` loads none, so a
 * migration that breaks a script would be found in production. This runs the same list
 * here, and runs it again, because a rerun is what production does the next time.
 *
 * The first pass is where the order earns its place. A demonstration is skipped while
 * its movement is not there yet, so on a fresh database the script that brings the
 * movements has to come before the one that brings their demonstrations. Run by
 * number, the first pass leaves 34 demonstrations out of 388 and says nothing.
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import postgres from 'postgres'

const CURATION = join(import.meta.dir, '..', 'curation')
const TWO_MINUTES = 120_000

const admin = postgres({
  host: process.env.SUPABASE_DB_HOST ?? '127.0.0.1',
  port: Number(process.env.SUPABASE_DB_PORT ?? 54322),
  database: process.env.SUPABASE_DB_NAME ?? 'postgres',
  username: process.env.SUPABASE_DB_USER ?? 'postgres',
  password: process.env.SUPABASE_DB_PASSWORD ?? 'postgres',
  prepare: false,
  max: 1,
  onnotice: () => undefined,
})

const order = readFileSync(join(CURATION, 'RUN_ORDER'), 'utf8')
  .split('\n')
  .map((line) => line.trim())
  .filter((line) => line !== '' && !line.startsWith('#'))

/** `psql` meta-commands are not SQL, so they cannot travel through the driver. */
function sqlOf(script: string): string {
  return readFileSync(join(CURATION, script), 'utf8')
    .split('\n')
    .filter((line) => !line.startsWith('\\'))
    .join('\n')
}

async function curate(): Promise<void> {
  for (const script of order) await admin.unsafe(sqlOf(script))
}

/** What a person's data points at: a rerun that moved one of these would orphan it. */
async function identities(): Promise<string> {
  const [row] = await admin<{ digest: string }[]>`
    select md5(string_agg(entry, '|' order by entry)) as digest
    from (
      select 'movement ' || id::text from catalog.movements
      union all select 'activity type ' || id::text from catalog.activity_types
      union all select 'result contract ' || id::text from catalog.result_contracts
      union all select 'program ' || id::text from planning.programs
      union all select 'program version ' || id::text from planning.program_versions
      union all select 'session template version ' || id::text
        from planning.session_template_versions
      union all select 'food ' || id::text from nutrition.foods
      union all select 'product ' || id::text from nutrition.products
    ) as identity(entry)
  `
  return row?.digest ?? ''
}

let afterTheFirstPass = ''

beforeAll(async () => {
  await curate()
  afterTheFirstPass = await identities()
}, TWO_MINUTES)

afterAll(async () => {
  await admin.end()
})

describe('the curation, in the order production runs it', () => {
  test('one pass leaves every reviewed demonstration on its movement', async () => {
    const reviewed = sqlOf('002_movement_demonstrations.sql')
      .split('\n')
      .filter((line) => /^\s+\('019f1000-/.test(line)).length
    const [row] = await admin<{ loaded: number }[]>`
      select count(*)::int as loaded from catalog.movement_media where kind = 'demo'
    `

    expect(reviewed).toBeGreaterThan(0)
    expect(row?.loaded).toBe(reviewed)
  })

  test(
    'a second run moves no identity that other rows point at',
    async () => {
      await curate()

      expect(await identities()).toBe(afterTheFirstPass)
    },
    TWO_MINUTES,
  )
})
