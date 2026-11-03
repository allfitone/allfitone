/**
 * `/space/v1/history-imports` against its contract (ADR-044, `OP-EXE-027..030`).
 *
 * The application and the reader are the real ones; only the database is a fake that
 * records what it was handed. That is what lets these tests say what a real Hevy export
 * becomes on its way to PostgreSQL, which the database's own tests then take from there.
 */

import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { allfitV1ContractManifest } from '@allfitone/contracts'
import { Hono } from 'hono'

import { SpaceActorError, type SpaceActorResolver } from '../../identity/index.js'
import { createSpaceHistoryImportService } from '../application/history-imports.js'
import type { HistoryImport, HistoryImportDatabase } from '../domain/history-imports.js'
import { spaceHistoryImportRoutes } from './space-history-imports.js'

const PERSON_ID = '019e4000-0000-7000-8000-000000000001'
const IMPORT_ID = '019e4000-0000-7000-8000-000000000601'
const OTHER_IMPORT_ID = '019e4000-0000-7000-8000-000000000602'
const IDEMPOTENCY_KEY = '51111111-1111-4111-8111-111111111111'
const MOVEMENT_ID = '019f1000-0000-7000-8000-000000000012'

const FIXTURES = join(
  import.meta.dir,
  '..',
  '..',
  '..',
  '..',
  '..',
  '..',
  'packages',
  'history-import',
  'fixtures',
)
const english = readFileSync(join(FIXTURES, 'hevy-en.csv'), 'utf8')
const spanish = readFileSync(join(FIXTURES, 'hevy-es.csv'), 'utf8')

function documentFor(id: string, status: HistoryImport['status'] = 'staged'): HistoryImport {
  return {
    id,
    source: 'hevy_csv',
    status,
    timezone: 'America/Bogota',
    session_count: 4,
    set_count: 99,
    imported_count: 0,
    issues: [],
    created_at: '2026-11-03T12:00:00+00:00',
    committed_at: null,
    undone_at: null,
    expires_at: '2026-11-10T12:00:00+00:00',
    preview: null,
  }
}

class DatabaseError extends Error {
  constructor(readonly code: string) {
    super(code)
  }
}

type Calls = { [K in keyof HistoryImportDatabase]: Parameters<HistoryImportDatabase[K]>[0][] }

function harness(overrides: Partial<HistoryImportDatabase> = {}, actorFails = false) {
  const calls: Calls = { stage: [], commit: [], undo: [], list: [], read: [] }
  const database: HistoryImportDatabase = {
    stage: async (input) => {
      calls.stage.push(input)
      return documentFor(input.commandId)
    },
    commit: async (input) => {
      calls.commit.push(input)
      return documentFor(input.importId, 'committed')
    },
    undo: async (input) => {
      calls.undo.push(input)
      return documentFor(input.importId, 'undone')
    },
    list: async (input) => {
      calls.list.push(input)
      return [documentFor(IMPORT_ID, 'committed')]
    },
    read: async (input) => {
      calls.read.push(input)
      return documentFor(input.importId)
    },
    ...overrides,
  }
  const actors: SpaceActorResolver = {
    actorFor: async () => ({ accountId: 'account', personId: PERSON_ID }),
    personFor: async () => {
      if (actorFails) throw new SpaceActorError('registration-incomplete')
      return PERSON_ID
    },
  }
  const app = new Hono()
  app.route(
    '/space/v1',
    spaceHistoryImportRoutes(
      createSpaceHistoryImportService(database),
      async () => ({ subject: 'sub', sessionId: 'sid', surface: 'space' as const }),
      actors,
    ),
  )
  return { app, calls }
}

const authorized = { authorization: 'Bearer token' }
const commanded = (commandId = IMPORT_ID) => ({
  ...authorized,
  'content-type': 'application/json',
  'idempotency-key': IDEMPOTENCY_KEY,
  'command-id': commandId,
})

function upload(app: Hono, content: string, headers: Record<string, string> = commanded()) {
  return app.request('/space/v1/history-imports', {
    method: 'POST',
    headers,
    body: JSON.stringify({ timezone: 'America/Bogota', content }),
  })
}

function commit(app: Hono, body: unknown, importId = IMPORT_ID) {
  return app.request(`/space/v1/history-imports/${importId}/commit`, {
    method: 'POST',
    headers: commanded('019e4000-0000-7000-8000-000000000611'),
    body: JSON.stringify(body),
  })
}

const failing = (code: string) => async () => {
  throw new DatabaseError(code)
}

describe('the history import surface honours the contract', () => {
  test('T-EXE-API-34 declares OP-EXE-027..030 under /space/v1/history-imports', () => {
    const declared = allfitV1ContractManifest.operations
      .filter((operation) => operation.path.startsWith('/space/v1/history-imports'))
      .map((operation) => `${operation.method} ${operation.path} ${operation.allfitOperation}`)
      .sort()
    expect(declared).toEqual([
      'GET /space/v1/history-imports OP-EXE-030',
      'GET /space/v1/history-imports/{importId} OP-EXE-030',
      'POST /space/v1/history-imports OP-EXE-027',
      'POST /space/v1/history-imports/{importId}/commit OP-EXE-028',
      'POST /space/v1/history-imports/{importId}/undo OP-EXE-029',
    ])
  })
})

describe('staging a file (OP-EXE-027)', () => {
  test('T-EXE-API-35 a Hevy export is read and staged as strength, in the database spelling', async () => {
    const { app, calls } = harness()
    const response = await upload(app, english)

    expect(response.status).toBe(201)
    expect(response.headers.get('location')).toBe(`/space/v1/history-imports/${IMPORT_ID}`)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(((await response.json()) as HistoryImport).id).toBe(IMPORT_ID)

    const [staged] = calls.stage
    expect(staged?.personId).toBe(PERSON_ID)
    expect(staged?.source).toBe('hevy_csv')
    expect(staged?.modelVersion).toBe(1)
    expect(staged?.disciplineCode).toBe('strength')
    expect(staged?.timezone).toBe('America/Bogota')
    expect(staged?.contentSha256.byteLength).toBe(32)
    expect(staged?.sessions).toHaveLength(4)
    const first = staged?.sessions[0]
    expect(Object.keys(first ?? {}).sort()).toEqual([
      'description',
      'ended_local',
      'exercises',
      'fingerprint',
      'started_local',
      'title',
    ])
    expect(first?.fingerprint).toMatch(/^[0-9a-f]{64}$/)
    expect(Object.keys(first?.exercises[0]?.sets[0] ?? {}).sort()).toEqual([
      'kind',
      'load_kg',
      'order',
      'reps',
      'rpe',
    ])
  })

  test('T-EXE-API-36 the same history exported in Spanish stages the same sessions', async () => {
    const { app, calls } = harness()
    await upload(app, english)
    await upload(app, spanish, commanded('019e4000-0000-7000-8000-000000000603'))

    const [inEnglish, inSpanish] = calls.stage
    expect(inSpanish?.sessions).toEqual(inEnglish?.sessions ?? [])
    expect(
      Buffer.from(inSpanish?.contentSha256 ?? []).equals(
        Buffer.from(inEnglish?.contentSha256 ?? []),
      ),
    ).toBe(false)
  })

  test('T-EXE-API-37 a file already alive answers that import with 200 and no Location', async () => {
    const { app } = harness({ stage: async () => documentFor(OTHER_IMPORT_ID) })
    const response = await upload(app, english)

    expect(response.status).toBe(200)
    expect(response.headers.get('location')).toBeNull()
    expect(((await response.json()) as HistoryImport).id).toBe(OTHER_IMPORT_ID)
  })

  test('T-EXE-API-38 a file no reader knows is a 422 naming why, and never reaches the database', async () => {
    const { app, calls } = harness()
    const response = await upload(app, 'date,exercise,kg\n2026-01-01,Squat,100\n')

    expect(response.status).toBe(422)
    expect(response.headers.get('content-type')).toContain('application/problem+json')
    const body = (await response.json()) as { type: string; errors: unknown[] }
    expect(body.type).toBe('https://errors.allfit.invalid/validation-failed')
    expect(body.errors).toEqual([
      { code: 'unknown_format', path: '/content/1', message: expect.any(String) },
    ])
    expect(calls.stage).toHaveLength(0)
  })

  test('T-EXE-API-39 an unreadable date names its row; an oversized file says it is too large', async () => {
    const { app } = harness()
    const [header, ...rows] = english.split('\n')
    const broken = [
      header,
      rows[0]?.replace(/^([^,]*),"[^"]*"/, '$1,"someday"'),
      ...rows.slice(1),
    ].join('\n')
    const unreadable = (await (await upload(app, broken)).json()) as {
      errors: { code: string; path: string }[]
    }
    expect(unreadable.errors[0]).toMatchObject({ code: 'unreadable_date', path: '/content/2' })

    const huge = await upload(app, 'x'.repeat(4_000_001))
    expect(huge.status).toBe(422)
    const tooLarge = (await huge.json()) as { errors: { code: string; path: string }[] }
    expect(tooLarge.errors[0]).toMatchObject({ code: 'too_large', path: '/content' })
  })

  test('T-EXE-API-40 the request is refused before reading: token, media type, command, shape', async () => {
    const { app, calls } = harness()

    expect((await upload(app, english, { 'content-type': 'application/json' })).status).toBe(401)
    expect(
      (await upload(app, english, { ...commanded(), 'content-type': 'text/csv' })).status,
    ).toBe(415)
    const { 'command-id': _dropped, ...withoutCommand } = commanded()
    expect((await upload(app, english, withoutCommand)).status).toBe(400)
    const extra = await app.request('/space/v1/history-imports', {
      method: 'POST',
      headers: commanded(),
      body: JSON.stringify({ timezone: 'America/Bogota', content: english, source: 'hevy_csv' }),
    })
    expect(extra.status).toBe(400)
    expect(calls.stage).toHaveLength(0)
  })

  test('T-EXE-API-41 somebody without a person yet is refused as registration incomplete', async () => {
    const { app } = harness({}, true)
    const response = await upload(app, english)
    expect(response.status).toBe(403)
    expect(((await response.json()) as { type: string }).type).toBe(
      'https://errors.allfit.invalid/registration-incomplete',
    )
  })
})

describe('committing and undoing (OP-EXE-028, OP-EXE-029)', () => {
  test('T-EXE-API-42 a commit carries the zone and each choice, none of them a movement or one', async () => {
    const { app, calls } = harness()
    const choices = [
      { external_name: 'Bench Press (Barbell)', movement_id: MOVEMENT_ID },
      { external_name: 'Mystery Move', movement_id: null },
    ]
    const response = await commit(app, { timezone: 'Europe/Madrid', choices })

    expect(response.status).toBe(200)
    expect(((await response.json()) as HistoryImport).status).toBe('committed')
    expect(calls.commit[0]).toMatchObject({
      personId: PERSON_ID,
      importId: IMPORT_ID,
      timezone: 'Europe/Madrid',
      choices,
    })
  })

  test('T-EXE-API-43 a choice that is not a movement id, or a body with more, is a 400', async () => {
    const { app, calls } = harness()
    const bad = [
      { timezone: 'America/Bogota', choices: [{ external_name: 'Squat', movement_id: 'squat' }] },
      { timezone: 'America/Bogota', choices: [{ external_name: '', movement_id: null }] },
      {
        timezone: 'America/Bogota',
        choices: [{ external_name: 'Squat', movement_id: null, note: 'x' }],
      },
      { timezone: 'America/Bogota' },
      { timezone: '', choices: [] },
    ]
    for (const body of bad) expect((await commit(app, body)).status).toBe(400)
    expect(
      (await commit(app, { timezone: 'America/Bogota', choices: [] }, 'not-an-id')).status,
    ).toBe(400)
    expect(calls.commit).toHaveLength(0)
  })

  test("T-EXE-API-44 somebody else's import is absent; one not waiting is a conflict; a movement outside the catalogue is a 422", async () => {
    const body = { timezone: 'America/Bogota', choices: [] }
    expect((await commit(harness({ commit: failing('42501') }).app, body)).status).toBe(404)
    expect((await commit(harness({ commit: failing('55000') }).app, body)).status).toBe(409)
    expect((await commit(harness({ commit: failing('23514') }).app, body)).status).toBe(422)
    expect((await commit(harness({ commit: failing('22023') }).app, body)).status).toBe(422)
  })

  test("T-EXE-API-45 undoing answers the import undone, and somebody else's as absent", async () => {
    const undo = (app: Hono) =>
      app.request(`/space/v1/history-imports/${IMPORT_ID}/undo`, {
        method: 'POST',
        headers: commanded('019e4000-0000-7000-8000-000000000621'),
      })
    const { app, calls } = harness()
    const response = await undo(app)
    expect(response.status).toBe(200)
    expect(((await response.json()) as HistoryImport).status).toBe('undone')
    expect(calls.undo[0]).toMatchObject({ personId: PERSON_ID, importId: IMPORT_ID })

    expect((await undo(harness({ undo: failing('42501') }).app)).status).toBe(404)
  })
})

describe('reading imports (OP-EXE-030)', () => {
  test('T-EXE-API-46 the list is wrapped in data; one import is read by its id', async () => {
    const { app } = harness()
    const list = await app.request('/space/v1/history-imports', { headers: authorized })
    expect(list.status).toBe(200)
    expect(list.headers.get('cache-control')).toBe('no-store')
    expect(((await list.json()) as { data: HistoryImport[] }).data.map((item) => item.id)).toEqual([
      IMPORT_ID,
    ])

    const one = await app.request(`/space/v1/history-imports/${IMPORT_ID}`, { headers: authorized })
    expect(one.status).toBe(200)
    expect(((await one.json()) as HistoryImport).id).toBe(IMPORT_ID)
  })

  test('T-EXE-API-47 an absent import is a 404 and an id that cannot be one is a 400', async () => {
    const { app } = harness({ read: failing('P0002') })
    expect(
      (await app.request(`/space/v1/history-imports/${IMPORT_ID}`, { headers: authorized })).status,
    ).toBe(404)
    expect(
      (await app.request('/space/v1/history-imports/42', { headers: authorized })).status,
    ).toBe(400)
    expect((await app.request('/space/v1/history-imports')).status).toBe(401)
  })
})
