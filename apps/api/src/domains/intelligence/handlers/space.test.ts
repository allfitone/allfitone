import { describe, expect, test } from 'bun:test'
import { allfitV1ContractManifest } from '@allfitone/contracts'
import { Hono } from 'hono'

import { SpaceActorError, type SpaceActorResolver } from '../../identity/index.js'
import type { SpaceIntelligenceService } from '../application/index.js'
import {
  ConsentRequired,
  ConsentTextNotInForce,
  SummaryCeilingReached,
  SummaryDisposed,
  SummaryUnavailable,
  type IntelligenceConsent,
  type WeeklySummary,
} from '../domain/index.js'
import { spaceIntelligenceRoutes } from './space.js'

const PERSON = '019f1400-0000-7000-8000-000000000001'
const KEY = 'f7111111-1111-4111-8111-111111111401'
const COMMAND = '019f1400-0000-7000-8000-000000000401'

const nothing: IntelligenceConsent = {
  current_version: '2026-12-01',
  accepted_version: null,
  accepted_at: null,
  withdrawn_at: null,
}
const held: IntelligenceConsent = {
  ...nothing,
  accepted_version: '2026-12-01',
  accepted_at: '2026-12-01T12:00:00Z',
}

const WEEK = '2026-11-09'
const summary: WeeklySummary = {
  week_starts_on: WEEK,
  overview: 'Entrenaste una vez esta semana.',
  training: 'El martes hiciste Sentadilla.',
  nutrition: null,
  changes: null,
  sources: ['training'],
  model: 'bedrock/us.anthropic.claude-test',
  generated_at: '2026-11-16T15:00:00+00:00',
}
const asking = { week_starts_on: WEEK, timezone: 'America/Bogota', language: 'es' }

function harness(overrides: Partial<SpaceIntelligenceService> = {}, actorFails = false): Hono {
  const service: SpaceIntelligenceService = {
    readConsent: async () => nothing,
    giveConsent: async () => held,
    withdrawConsent: async () => ({ ...nothing, withdrawn_at: '2026-12-02T12:00:00Z' }),
    requestWeeklySummary: async () => ({ outcome: 'summarized', summary }),
    listWeeklySummaries: async () => ({ data: [summary], nextBefore: null }),
    deleteWeeklySummary: async () => undefined,
    ...overrides,
  }
  const actors: SpaceActorResolver = {
    actorFor: async () => ({ accountId: 'account', personId: PERSON }),
    personFor: async () => {
      if (actorFails) throw new SpaceActorError('registration-incomplete')
      return PERSON
    },
  }
  const app = new Hono()
  app.route(
    '/space/v1',
    spaceIntelligenceRoutes(
      service,
      async () => ({
        subject: 'sub',
        sessionId: 'sid',
        surface: 'space' as const,
        authenticatedAt: null,
      }),
      actors,
    ),
  )
  return app
}

const authorized = { authorization: 'Bearer token' }
const commanded = { ...authorized, 'idempotency-key': KEY, 'command-id': COMMAND }
const json = { ...commanded, 'content-type': 'application/json' }

const send = (
  app: Hono,
  method: string,
  path: string,
  headers: Record<string, string>,
  body?: unknown,
) =>
  app.request(`/space/v1/intelligence${path}`, {
    method,
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })

const code = async (response: Response) =>
  ((await response.json()) as { type: string }).type.split('/').at(-1)

describe('the Space intelligence surface honours the contract', () => {
  test('T-ITL-API-01 declares the consent and the summary operations, each once', () => {
    const declared = allfitV1ContractManifest.operations
      .filter((operation) => operation.path.startsWith('/space/v1/intelligence'))
      .map((operation) => `${operation.allfitOperation} ${operation.method} ${operation.path}`)
    expect(declared.sort()).toEqual([
      'OP-ITL-001 PUT /space/v1/intelligence/consent',
      'OP-ITL-002 POST /space/v1/intelligence/consent/withdrawal',
      'OP-ITL-003 GET /space/v1/intelligence/consent',
      'OP-ITL-004 POST /space/v1/intelligence/weekly-summaries',
      'OP-ITL-005 GET /space/v1/intelligence/weekly-summaries',
      'OP-ITL-006 DELETE /space/v1/intelligence/weekly-summaries/{weekStartsOn}',
    ])
  })

  test('T-ITL-API-02 nothing answers without a token, and nothing is cached', async () => {
    for (const [method, path] of [
      ['GET', '/consent'],
      ['PUT', '/consent'],
      ['POST', '/consent/withdrawal'],
      ['GET', '/weekly-summaries'],
      ['POST', '/weekly-summaries'],
      ['DELETE', `/weekly-summaries/${WEEK}`],
    ] as const) {
      const response = await send(harness(), method, path, {})
      expect(response.status).toBe(401)
      expect(response.headers.get('cache-control')).toContain('no-store')
    }
  })

  test('T-ITL-API-03 the consent is read as the person the token resolves to', async () => {
    let asked: unknown
    const app = harness({
      readConsent: async (input) => {
        asked = input
        return held
      },
    })
    const response = await send(app, 'GET', '/consent', { ...authorized, 'x-request-id': 'r-1' })
    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect(await response.json()).toEqual(held)
    expect(asked).toEqual({ personId: PERSON, requestId: 'r-1' })
  })

  test('T-ITL-API-04 giving is a JSON command that names one version and nothing else', async () => {
    const body = { version: '2026-12-01' }
    expect((await send(harness(), 'PUT', '/consent', authorized, body)).status).toBe(415)
    expect(
      (
        await send(
          harness(),
          'PUT',
          '/consent',
          { ...authorized, 'content-type': 'application/json' },
          body,
        )
      ).status,
    ).toBe(400)
    expect((await send(harness(), 'PUT', '/consent', json, { version: 'la-de-hoy' })).status).toBe(
      400,
    )
    expect(
      (await send(harness(), 'PUT', '/consent', json, { ...body, person_id: PERSON })).status,
    ).toBe(400)

    let given: unknown
    const app = harness({
      giveConsent: async (input) => {
        given = input
        return held
      },
    })
    const response = await send(app, 'PUT', '/consent', json, body)
    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(await response.json()).toEqual(held)
    expect(given).toMatchObject({
      personId: PERSON,
      version: '2026-12-01',
      idempotencyKey: KEY,
      commandId: COMMAND,
    })
  })

  test('T-ITL-API-05 a text that is not the one in force is 422, and says so', async () => {
    const response = await send(
      harness({ giveConsent: async () => Promise.reject(new ConsentTextNotInForce()) }),
      'PUT',
      '/consent',
      json,
      { version: '2026-10-04' },
    )
    expect(response.status).toBe(422)
    expect(await code(response)).toBe('validation-failed')
  })

  test('T-ITL-API-06 withdrawing is a command without a body, hashed from where it was sent', async () => {
    expect((await send(harness(), 'POST', '/consent/withdrawal', authorized)).status).toBe(400)

    const hashes: string[] = []
    const app = harness({
      withdrawConsent: async (input) => {
        hashes.push(Buffer.from(input.requestHash).toString('hex'))
        return { ...nothing, withdrawn_at: '2026-12-02T12:00:00Z' }
      },
      giveConsent: async (input) => {
        hashes.push(Buffer.from(input.requestHash).toString('hex'))
        return held
      },
    })
    const response = await send(app, 'POST', '/consent/withdrawal', commanded)
    expect(response.status).toBe(200)
    expect(((await response.json()) as IntelligenceConsent).withdrawn_at).toBe(
      '2026-12-02T12:00:00Z',
    )

    // The same headers on the other command hash differently: the path is in the hash.
    await send(app, 'PUT', '/consent', json, { version: '2026-12-01' })
    expect(hashes).toHaveLength(2)
    expect(hashes[0]).not.toBe(hashes[1])
  })

  test('T-ITL-API-07 the database’s refusals keep their meaning, and an unknown failure says nothing', async () => {
    const refusing = (sqlState: string) =>
      harness({
        giveConsent: async () => Promise.reject(Object.assign(new Error('x'), { code: sqlState })),
      })
    const give = (app: Hono) => send(app, 'PUT', '/consent', json, { version: '2026-12-01' })

    expect((await give(refusing('42501'))).status).toBe(403)
    expect((await give(refusing('22023'))).status).toBe(422)
    expect((await give(refusing('23505'))).status).toBe(409)
    const busy = await give(refusing('40001'))
    expect(busy.status).toBe(409)
    expect(busy.headers.get('retry-after')).toBe('1')

    const unknown = await give(
      harness({
        giveConsent: async () => Promise.reject(new Error('relation "x" does not exist')),
      }),
    )
    expect(unknown.status).toBe(503)
    expect(JSON.stringify(await unknown.json())).not.toContain('relation')
  })

  test('T-ITL-API-08 an account without a person decides nothing', async () => {
    const response = await send(harness({}, true), 'GET', '/consent', authorized)
    expect(response.status).toBe(403)
    expect(await code(response)).toBe('registration-incomplete')
  })
})

describe('the weekly summary on the Space surface (HU-SP-126, HU-SP-127)', () => {
  const ask = (app: Hono, body: unknown = asking, headers: Record<string, string> = json) =>
    send(app, 'POST', '/weekly-summaries', headers, body)
  const refusing = (cause: unknown) =>
    harness({ requestWeeklySummary: async () => Promise.reject(cause) })

  test('T-ITL-API-09 asking is a JSON command that names a week, a zone and a language, and nothing else', async () => {
    expect((await ask(harness(), asking, authorized)).status).toBe(415)
    expect(
      (await ask(harness(), asking, { ...authorized, 'content-type': 'application/json' })).status,
    ).toBe(400)
    for (const body of [
      { ...asking, week_starts_on: '2026-02-30' },
      { ...asking, week_starts_on: 20261109 },
      { ...asking, timezone: 'Bogota' },
      { ...asking, timezone: `America/${'a'.repeat(100)}` },
      { ...asking, language: 'fr' },
      { ...asking, person_id: PERSON },
      { week_starts_on: WEEK, timezone: 'America/Bogota' },
      [asking],
    ]) {
      expect((await ask(harness(), body)).status).toBe(400)
    }

    let asked: unknown
    const app = harness({
      requestWeeklySummary: async (input) => {
        asked = input
        return { outcome: 'summarized', summary }
      },
    })
    const response = await ask(app)
    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(await response.json()).toEqual({ outcome: 'summarized', summary })
    expect(asked).toMatchObject({
      personId: PERSON,
      weekStartsOn: WEEK,
      timezone: 'America/Bogota',
      language: 'es',
      idempotencyKey: KEY,
      commandId: COMMAND,
    })
  })

  test('T-ITL-API-10 a week with nothing logged is an answer, not a failure', async () => {
    const response = await ask(
      harness({
        requestWeeklySummary: async () => ({ outcome: 'nothing-logged', summary: null }),
      }),
    )
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ outcome: 'nothing-logged', summary: null })
  })

  test('T-ITL-API-11 without Pro it names the function, and without the consent it asks for it', async () => {
    const free = await ask(
      refusing(Object.assign(new Error('x'), { code: 'AF402', detail: 'weekly_summary' })),
    )
    expect(free.status).toBe(403)
    expect(await free.json()).toMatchObject({
      type: 'https://errors.allfit.invalid/plan-limit-reached',
      feature: 'weekly_summary',
    })

    const unconsented = await ask(refusing(new ConsentRequired()))
    expect(unconsented.status).toBe(403)
    expect(await code(unconsented)).toBe('consent-required')
  })

  test('T-ITL-API-12 over the ceiling is 429 and says when it renews', async () => {
    const response = await ask(refusing(new SummaryCeilingReached('2026-11-23T05:00:00+00:00')))
    expect(response.status).toBe(429)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(await response.json()).toMatchObject({
      type: 'https://errors.allfit.invalid/rate-limited',
      renews_at: '2026-11-23T05:00:00+00:00',
    })
  })

  test('T-ITL-API-13 a summary that cannot be given is 503, and never says what the model wrote or why', async () => {
    for (const reason of ['closed', 'run-closed', 'unknown-number', 'medical']) {
      const response = await ask(refusing(new SummaryUnavailable(reason)))
      expect(response.status).toBe(503)
      const body = (await response.json()) as Record<string, unknown>
      expect(body.type).toBe('https://errors.allfit.invalid/upstream-unavailable')
      expect(body.detail).toBeUndefined()
      expect(JSON.stringify(body)).not.toContain(reason)
    }
  })

  test('T-ITL-API-14 sent again it waits while the model is asked, and says so when its summary was deleted', async () => {
    const busy = await ask(refusing(Object.assign(new Error('x'), { code: '40001' })))
    expect(busy.status).toBe(409)
    expect(await code(busy)).toBe('idempotency-in-progress')
    expect(busy.headers.get('retry-after')).toBe('1')

    const gone = await ask(refusing(new SummaryDisposed()))
    expect(gone.status).toBe(410)
    expect(await code(gone)).toBe('command-effect-disposed')

    // A week she may not ask about, a zone PostgreSQL does not know, a key used for another request.
    expect((await ask(refusing(Object.assign(new Error('x'), { code: '22023' })))).status).toBe(422)
    expect((await ask(refusing(Object.assign(new Error('x'), { code: '23505' })))).status).toBe(409)
    expect((await ask(harness({}, true))).status).toBe(403)
  })

  test('T-ITL-API-15 her summaries are listed in pages, with a cursor the device cannot read', async () => {
    const pages: unknown[] = []
    const app = harness({
      listWeeklySummaries: async (input) => {
        pages.push(input)
        return input.before === null
          ? { data: [summary], nextBefore: WEEK }
          : { data: [], nextBefore: null }
      },
    })
    const list = (query = '') =>
      send(app, 'GET', `/weekly-summaries${query}`, { ...authorized, 'x-request-id': 'r-2' })

    const first = await list()
    expect(first.status).toBe(200)
    expect(first.headers.get('cache-control')).toBe('private, no-store')
    const page = (await first.json()) as {
      data: WeeklySummary[]
      page: { next_cursor: string; has_more: boolean }
    }
    expect(page.data).toEqual([summary])
    expect(page.page.has_more).toBe(true)
    expect(page.page.next_cursor.length).toBeGreaterThanOrEqual(16)
    expect(page.page.next_cursor).not.toContain(WEEK)

    const last = await list(`?limit=5&cursor=${page.page.next_cursor}`)
    expect(await last.json()).toEqual({ data: [], page: { next_cursor: null, has_more: false } })
    expect(pages).toEqual([
      { personId: PERSON, before: null, limit: 20, requestId: 'r-2' },
      { personId: PERSON, before: WEEK, limit: 5, requestId: 'r-2' },
    ])

    for (const query of [
      '?limit=0',
      '?limit=51',
      '?limit=ten',
      '?cursor=2026-11-09',
      `?cursor=${Buffer.from('{"before":"ayer"}').toString('base64url')}`,
      `?cursor=${Buffer.from(`{"before":"${WEEK}","person_id":"x"}`).toString('base64url')}`,
      '?person_id=someone',
    ]) {
      expect((await list(query)).status).toBe(400)
    }
    expect(pages).toHaveLength(2)
  })

  test('T-ITL-API-16 deleting is a command without a body, for the week the path names', async () => {
    const remove = (app: Hono, week: string, headers: Record<string, string> = commanded) =>
      send(app, 'DELETE', `/weekly-summaries/${week}`, headers)

    expect((await remove(harness(), WEEK, authorized)).status).toBe(400)
    expect((await remove(harness(), 'last-week')).status).toBe(400)
    expect((await remove(harness(), '2026-13-01')).status).toBe(400)

    const removed: unknown[] = []
    const hashes: string[] = []
    const app = harness({
      deleteWeeklySummary: async (input) => {
        removed.push({ personId: input.personId, weekStartsOn: input.weekStartsOn })
        hashes.push(Buffer.from(input.requestHash).toString('hex'))
      },
    })
    const response = await remove(app, WEEK)
    expect(response.status).toBe(204)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(await response.text()).toBe('')
    expect(removed).toEqual([{ personId: PERSON, weekStartsOn: WEEK }])

    // The same headers for another week are another command: the path is in the hash.
    await remove(app, '2026-11-02')
    expect(hashes[0]).not.toBe(hashes[1])

    const missing = await remove(
      harness({
        deleteWeeklySummary: async () =>
          Promise.reject(Object.assign(new Error('x'), { code: 'P0002' })),
      }),
      WEEK,
    )
    expect(missing.status).toBe(404)
  })
})
