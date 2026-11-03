/**
 * How an imported history's lists reach PostgreSQL (ADR-044).
 *
 * The trap the results list fell into (see `index.test.ts`) is the same here: a list
 * bound behind a bare `::jsonb` arrives as a JSON string, and the command refuses it.
 * The binding is asserted directly — the value is serialized text and the cast after it
 * goes through text — because the handler tests fake the database and pgTAP passes
 * literals.
 */
import { afterEach, describe, expect, test } from 'bun:test'
import type postgres from 'postgres'

import { setDatabase } from '../../../platform/db/index.js'
import { createHistoryImportDatabase } from './history-imports.js'

interface CapturedQuery {
  strings: readonly string[]
  values: unknown[]
}

function recordingDatabase(captured: CapturedQuery[]): ReturnType<typeof postgres> {
  const client = Object.assign(
    (strings: TemplateStringsArray, ...values: unknown[]) => {
      captured.push({ strings: [...strings], values })
      return Promise.resolve([{ document: { id: IMPORT_ID } }])
    },
    {
      begin: (operation: (transaction: unknown) => Promise<unknown>) => operation(client),
      end: () => Promise.resolve(),
    },
  )
  return client as unknown as ReturnType<typeof postgres>
}

const PERSON_ID = '019e4000-0000-7000-8000-000000000001'
const IMPORT_ID = '019e4000-0000-7000-8000-000000000601'

const command = {
  idempotencyKey: '51111111-1111-4111-8111-111111111111',
  commandId: IMPORT_ID,
  requestHash: Buffer.alloc(32),
}

/** The value bound at `index`, and the SQL text right after it. */
function binding(query: CapturedQuery | undefined, index: number) {
  return { value: query?.values[index], cast: query?.strings[index + 1]?.trimStart() ?? '' }
}

afterEach(async () => {
  await setDatabase(undefined)
})

describe('the history import bindings', () => {
  test('T-EXE-IDEM-12 staging sends the sessions and the issues as serialized lists through text', async () => {
    const captured: CapturedQuery[] = []
    await setDatabase(recordingDatabase(captured))
    const sessions = [
      {
        fingerprint: 'a'.repeat(64),
        title: 'Push',
        started_local: '2026-01-10T09:00',
        ended_local: '2026-01-10T10:00',
        description: null,
        exercises: [],
      },
    ]

    await createHistoryImportDatabase().stage({
      personId: PERSON_ID,
      source: 'hevy_csv',
      modelVersion: 1,
      disciplineCode: 'strength',
      timezone: 'America/Bogota',
      contentSha256: Buffer.alloc(32),
      sessions,
      issues: [{ row: 7, code: 'unsupported_set' }],
      ...command,
    })

    const query = captured.at(-1)
    const staged = binding(query, 6)
    const issues = binding(query, 7)
    expect(typeof staged.value).toBe('string')
    expect(JSON.parse(String(staged.value))).toEqual(sessions)
    expect(staged.cast.startsWith('::text::jsonb')).toBe(true)
    expect(JSON.parse(String(issues.value))).toEqual([{ row: 7, code: 'unsupported_set' }])
    expect(issues.cast.startsWith('::text::jsonb')).toBe(true)
  })

  test('T-EXE-IDEM-13 committing sends the choices as a serialized list through text', async () => {
    const captured: CapturedQuery[] = []
    await setDatabase(recordingDatabase(captured))
    const choices = [{ external_name: 'Mystery Move', movement_id: null }]

    await createHistoryImportDatabase().commit({
      personId: PERSON_ID,
      importId: IMPORT_ID,
      timezone: 'America/Bogota',
      choices,
      ...command,
    })

    const bound = binding(captured.at(-1), 3)
    expect(JSON.parse(String(bound.value))).toEqual(choices)
    expect(bound.cast.startsWith('::text::jsonb')).toBe(true)
  })
})
