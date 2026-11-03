/**
 * The curated Hevy names (ADR-044), and what makes them safe to load into production.
 *
 * Not a pgTAP test for the same reason as the global catalogue's: the script has to be
 * run, and `db:reset` does not run curation. It needs the movements of 001 and 003 first,
 * so it loads them too; all three are rerunnable, which is the first thing asserted.
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import postgres from 'postgres'

const CURATION = join(import.meta.dir, '..', 'curation')
const SCRIPTS = [
  '001_global_training_catalogue.sql',
  '003_movement_wave_1.sql',
  '009_hevy_movement_names.sql',
]

const admin = postgres({
  host: process.env.SUPABASE_DB_HOST ?? '127.0.0.1',
  port: Number(process.env.SUPABASE_DB_PORT ?? 54322),
  database: process.env.SUPABASE_DB_NAME ?? 'postgres',
  username: process.env.SUPABASE_DB_USER ?? 'postgres',
  password: process.env.SUPABASE_DB_PASSWORD ?? 'postgres',
  prepare: false,
  max: 1,
})

/** `psql` meta-commands are not SQL, so they cannot travel through the driver. */
const script = (name: string): string =>
  readFileSync(join(CURATION, name), 'utf8')
    .split('\n')
    .filter((line) => !line.startsWith('\\'))
    .join('\n')

async function loadAll(): Promise<void> {
  for (const name of SCRIPTS) await admin.unsafe(script(name))
}

async function mappings(): Promise<string> {
  const [row] = await admin<{ digest: string }[]>`
    select md5(string_agg(external_name || '>' || movement_id::text, '|' order by external_name)) as digest
    from catalog.external_movement_names where source = 'hevy_csv'
  `
  return row?.digest ?? ''
}

beforeAll(async () => {
  await loadAll()
})

afterAll(async () => {
  await admin.end()
})

describe('the curated Hevy names (ADR-044)', () => {
  test('T-IMP-INT-01 loading the scripts again changes nothing', async () => {
    const before = await mappings()
    await loadAll()
    expect(await mappings()).toBe(before)
  })

  test('T-IMP-INT-02 every name is a key and points at a published global strength movement', async () => {
    const [row] = await admin<{ names: number; wrong: number }[]>`
      select count(*)::int as names,
             count(*) filter (
               where name.external_name <> execution.external_name_key(name.external_name)
                  or movement.content_scope <> 'global' or movement.status <> 'published'
                  or movement.discipline_code <> 'strength')::int as wrong
      from catalog.external_movement_names as name
      join catalog.movements as movement on movement.id = name.movement_id
      where name.source = 'hevy_csv'
    `
    expect(row?.names).toBe(73)
    expect(row?.wrong).toBe(0)
  })

  test('T-IMP-INT-03 a name reads the same whatever its case, spacing or hyphens', async () => {
    const [row] = await admin<{ movement: string | null }[]>`
      select movement.name as movement
      from catalog.external_movement_names as name
      join catalog.movements as movement on movement.id = name.movement_id
      where name.source = 'hevy_csv'
        and name.external_name = execution.external_name_key('  LAT pulldown  -  Close grip (CABLE) ')
    `
    expect(row?.movement).toBe('Jalón al pecho')
  })
})
