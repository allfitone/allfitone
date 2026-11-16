import { describe, expect, test } from 'bun:test'
import { allfitV1ContractManifest } from '@allfitone/contracts'
import { Hono } from 'hono'

import { SpaceActorError, type SpaceActorResolver } from '../../identity/index.js'
import type { SpaceIntelligenceService } from '../application/index.js'
import { ConsentTextNotInForce, type IntelligenceConsent } from '../domain/index.js'
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

function harness(overrides: Partial<SpaceIntelligenceService> = {}, actorFails = false): Hono {
  const service: SpaceIntelligenceService = {
    readConsent: async () => nothing,
    giveConsent: async () => held,
    withdrawConsent: async () => ({ ...nothing, withdrawn_at: '2026-12-02T12:00:00Z' }),
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
