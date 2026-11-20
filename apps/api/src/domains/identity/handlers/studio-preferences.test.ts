/**
 * `/studio/v1/me/preferences` over HTTP — what a person chose for how Studio looks
 * (`OP-IDN-068`, `OP-IDN-069`).
 *
 * Who she is, that the preferences are Studio's and that a retried command is answered
 * once are PostgreSQL's answers (`T-IDN-STUDIO-PREFERENCES-01`). What these hold is the
 * route's own part: it serves the Studio web origin with its session cookie, lets the
 * body name a theme and nothing else, carries the person and the command through, and
 * answers in the contract's shape, errors included.
 */

import { beforeEach, describe, expect, test } from 'bun:test'
import { allfitV1ContractManifest, allfitV1ContractSchemas } from '@allfitone/contracts'
import Ajv2020 from 'ajv/dist/2020'
import addFormats from 'ajv-formats'
import { Hono } from 'hono'

import { createApp } from '../../../application.js'
import { StudioSessionError, type StudioSessionService } from '../application/index.js'
import type { StudioPreferencesService } from '../application/studio-preferences.js'
import { studioPreferencesRoutes } from './studio-preferences.js'

// The DTOs only prove the handler compiles; the published schema proves what the wire carries.
const validator = new Ajv2020({ strict: false, allErrors: true })
addFormats(validator)
validator.addSchema({ $id: 'allfit-v1', components: { schemas: allfitV1ContractSchemas } })

function assertMatchesContract(schemaName: string, projection: unknown): void {
  const validate = validator.getSchema(`allfit-v1#/components/schemas/${schemaName}`)
  if (!validate) throw new Error(`The contract declares no schema named ${schemaName}`)
  if (validate(projection)) return
  const failures = (validate.errors ?? [])
    .map((error) => `${error.instancePath || '/'} ${error.message ?? 'is invalid'}`)
    .join('; ')
  throw new Error(`${schemaName} violates the contract: ${failures}`)
}

const OPERATIONS = ['OP-IDN-068', 'OP-IDN-069']
const PERSON = '019f8100-0000-7000-8000-000000000001'
const PATH = '/studio/v1/me/preferences'
const KEY = 'a8111111-1111-4111-8111-111111111103'
const COMMAND = '019f8100-0000-7000-8000-000000000103'
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
const SESSION = { origin: 'https://studio.example.test', cookie: 'allfit_studio_session=opaque' }
const COMMANDED = {
  ...SESSION,
  'idempotency-key': KEY,
  'command-id': COMMAND,
  'content-type': 'application/json',
}

type Call = { operation: 'read' | 'put'; input: Record<string, unknown> }

function preferences(
  calls: Call[] = [],
  overrides: Partial<StudioPreferencesService> = {},
): StudioPreferencesService {
  return {
    read: async (input) => {
      calls.push({ operation: 'read', input: { ...input } })
      return { theme: null }
    },
    put: async (input) => {
      calls.push({ operation: 'put', input: { ...input } })
      return { resource: { theme: input.theme }, replayed: false }
    },
    ...overrides,
  }
}

function sessions(
  resolveActor: StudioSessionService['resolveActor'] = async () => ({
    accountId: '019f8100-0000-7000-8000-000000000011',
    personId: PERSON,
  }),
): StudioSessionService {
  const unused = async (): Promise<never> => {
    throw new Error('This session operation is outside the preferences test')
  }
  return {
    completeCode: unused,
    readSession: unused,
    resolveActor,
    resolveAccountIdentity: unused,
    logout: unused,
  }
}

function app(service = preferences(), sessionService = sessions()): Hono {
  const routes = new Hono()
  routes.route('/studio/v1', studioPreferencesRoutes(service, sessionService))
  return routes
}

const put = (instance: Hono, body: unknown, headers: Record<string, string> = COMMANDED) =>
  instance.request(PATH, {
    method: 'PUT',
    headers,
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })

async function problemCode(response: Response): Promise<string | undefined> {
  expect(response.headers.get('content-type')).toContain('application/problem+json')
  const body = (await response.json()) as { type: string }
  assertMatchesContract('Problem', body)
  return body.type.split('/').at(-1)
}

const databaseError = (code: string) => Object.assign(new Error('database failure'), { code })

beforeEach(() => {
  process.env.STUDIO_WEB_URL = 'https://studio.example.test'
  process.env.BACKOFFICE_WEB_URL = 'https://backoffice.example.test'
  process.env.API_PUBLIC_URL = 'https://api.example.test'
})

describe('the Studio preferences surface honours the contract', () => {
  test('T-IDN-API-01 mounts the two operations as the contract declares them, where the cookie travels', () => {
    const declared = allfitV1ContractManifest.operations.filter((operation) =>
      OPERATIONS.includes(operation.allfitOperation),
    )
    expect(
      declared.map(
        (operation) => `${operation.allfitOperation} ${operation.method} ${operation.path}`,
      ),
    ).toEqual([`OP-IDN-068 GET ${PATH}`, `OP-IDN-069 PUT ${PATH}`])
    expect(declared.map((operation) => operation.security)).toEqual([
      ['cookieAuth'],
      ['cookieAuth'],
    ])
    expect(declared.map((operation) => operation.responses)).toEqual([
      ['200', '401', '403', '503'],
      ['200', '400', '401', '403', '409', '422', '503'],
    ])

    const mounted = studioPreferencesRoutes(preferences(), sessions())
      .routes.filter((route) => route.method !== 'ALL')
      .map((route) => `${route.method} /studio/v1${route.path}`)
      .sort()
    expect(mounted).toEqual([`GET ${PATH}`, `PUT ${PATH}`])
    // And the application serves them, not only the router.
    const application = createApp().routes.map((route) => `${route.method} ${route.path}`)
    expect(mounted.filter((route) => !application.includes(route))).toEqual([])
  })

  test('T-IDN-API-02 the contract has room for no theme yet, and none for another theme or field', () => {
    assertMatchesContract('StudioPreferences', { theme: null })
    assertMatchesContract('StudioPreferences', { theme: 'dark' })
    assertMatchesContract('StudioPreferences', { theme: 'light' })
    expect(() => assertMatchesContract('StudioPreferences', {})).toThrow()
    expect(() => assertMatchesContract('StudioPreferences', { theme: 'sepia' })).toThrow()
    expect(() =>
      assertMatchesContract('StudioPreferences', { theme: 'dark', surface: 'studio' }),
    ).toThrow()

    assertMatchesContract('StudioPreferencesPut', { theme: 'light' })
    // Choosing is naming one of the two: there is no way to ask for "none" again.
    expect(() => assertMatchesContract('StudioPreferencesPut', { theme: null })).toThrow()
    expect(() => assertMatchesContract('StudioPreferencesPut', { theme: 'system' })).toThrow()
  })
})

describe('OP-IDN-068: reading what she chose', () => {
  test('T-IDN-API-03 reads as the person the session resolves to, under a fresh request', async () => {
    const calls: Call[] = []
    const response = await app(preferences(calls)).request(PATH, { headers: SESSION })

    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    const body = await response.json()
    assertMatchesContract('StudioPreferences', body)
    // Never chosen is null: the default is Studio's to show, not the server's to invent.
    expect(body).toEqual({ theme: null })
    expect(calls).toHaveLength(1)
    expect(calls[0]?.input.personId).toBe(PERSON)
    expect(calls[0]?.input.requestId).toMatch(UUID_V4)
  })

  test('T-IDN-API-04 answers the theme she keeps', async () => {
    const response = await app(preferences([], { read: async () => ({ theme: 'light' }) })).request(
      PATH,
      { headers: SESSION },
    )

    expect(response.status).toBe(200)
    const body = await response.json()
    assertMatchesContract('StudioPreferences', body)
    expect(body).toEqual({ theme: 'light' })
  })
})

describe('who may ask, for both operations', () => {
  const both = [
    [
      'GET',
      (instance: Hono, headers: Record<string, string>) => instance.request(PATH, { headers }),
    ],
    [
      'PUT',
      (instance: Hono, headers: Record<string, string>) =>
        put(instance, { theme: 'light' }, headers),
    ],
  ] as const

  test('T-IDN-API-05 nothing answers without the Studio session cookie', async () => {
    for (const [, send] of both) {
      const calls: Call[] = []
      const { cookie: _cookie, ...withoutCookie } = COMMANDED
      const response = await send(app(preferences(calls)), withoutCookie)
      expect(response.status).toBe(401)
      expect(response.headers.get('cache-control')).toBe('no-store')
      expect(await problemCode(response)).toBe('unauthenticated')
      expect(calls).toEqual([])
    }
  })

  test('T-IDN-API-06 a session that no longer stands is 401', async () => {
    for (const [, send] of both) {
      const response = await send(
        app(
          preferences(),
          sessions(async () => Promise.reject(new StudioSessionError('unauthenticated'))),
        ),
        COMMANDED,
      )
      expect(response.status).toBe(401)
      expect(await problemCode(response)).toBe('unauthenticated')
    }
  })

  test('T-IDN-API-07 an account that has not completed registration gets what GET /me gives it', async () => {
    for (const [, send] of both) {
      const calls: Call[] = []
      const response = await send(
        app(
          preferences(calls),
          sessions(async () => ({ accountId: '019f8100-0000-7000-8000-000000000011' })),
        ),
        COMMANDED,
      )
      expect(response.status).toBe(403)
      expect(response.headers.get('cache-control')).toBe('private, no-store')
      expect(await problemCode(response)).toBe('registration-incomplete')
      expect(calls).toEqual([])
    }
  })

  test('T-IDN-API-08 a closed account gets what GET /me gives it', async () => {
    for (const [, send] of both) {
      const calls: Call[] = []
      const response = await send(
        app(
          preferences(calls),
          sessions(async () => Promise.reject(new StudioSessionError('account-closed'))),
        ),
        COMMANDED,
      )
      expect(response.status).toBe(403)
      expect(response.headers.get('cache-control')).toBe('private, no-store')
      expect(await problemCode(response)).toBe('account-closed')
      expect(calls).toEqual([])
    }
  })

  test('T-IDN-API-09 the database’s refusals keep their meaning, and an unknown failure says nothing', async () => {
    const failing = (cause: unknown) =>
      app(
        preferences([], {
          read: async () => Promise.reject(cause),
          put: async () => Promise.reject(cause),
        }),
      )
    const expected = [
      ['42501', 403, 'forbidden'],
      ['22023', 422, 'validation-failed'],
      ['23514', 422, 'validation-failed'],
      ['23505', 409, 'conflict'],
      ['40001', 409, 'conflict'],
      ['08006', 503, 'upstream-unavailable'],
    ] as const

    for (const [, send] of both) {
      for (const [sqlState, status, code] of expected) {
        const response = await send(failing(databaseError(sqlState)), COMMANDED)
        expect(response.status).toBe(status)
        expect(response.headers.get('cache-control')).toBe('no-store')
        expect(await problemCode(response)).toBe(code)
      }
      const unknown = await send(failing(new Error('relation "secret" does not exist')), COMMANDED)
      expect(unknown.status).toBe(503)
      expect(JSON.stringify(await unknown.clone().json())).not.toContain('secret')
      expect(await problemCode(unknown)).toBe('upstream-unavailable')

      const provider = await send(
        app(
          preferences(),
          sessions(async () => Promise.reject(new StudioSessionError('upstream-unavailable'))),
        ),
        COMMANDED,
      )
      expect(provider.status).toBe(503)
      expect(await problemCode(provider)).toBe('upstream-unavailable')
    }
  })
})

describe('OP-IDN-069: keeping what she chose', () => {
  test('T-IDN-API-10 keeps the theme as herself, with the command she sent', async () => {
    const calls: Call[] = []
    const response = await put(app(preferences(calls)), { theme: 'light' })

    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(response.headers.get('idempotent-replay')).toBeNull()
    const body = await response.json()
    assertMatchesContract('StudioPreferences', body)
    expect(body).toEqual({ theme: 'light' })
    expect(calls).toHaveLength(1)
    expect(calls[0]?.input).toMatchObject({
      personId: PERSON,
      theme: 'light',
      idempotencyKey: KEY,
      commandId: COMMAND,
    })
    // The body names a theme and nothing else: no product and no person reach the service.
    expect(Object.keys(calls[0]?.input ?? {}).sort()).toEqual([
      'commandId',
      'idempotencyKey',
      'personId',
      'requestHash',
      'theme',
    ])
  })

  test('T-IDN-API-11 a body outside the contract is 422 before anything runs', async () => {
    const outside = [
      { theme: 'sepia' },
      { theme: 'system' },
      { theme: null },
      { theme: 'Dark' },
      {},
      { theme: 'light', surface: 'backoffice' },
      { theme: 'light', person_id: '019f8100-0000-7000-8000-000000000002' },
      ['light'],
      'light',
      '{"theme":',
    ]
    for (const body of outside) {
      const calls: Call[] = []
      const response = await put(app(preferences(calls)), body)
      expect(response.status).toBe(422)
      expect(response.headers.get('cache-control')).toBe('no-store')
      expect(await problemCode(response)).toBe('validation-failed')
      expect(calls).toEqual([])
    }
  })

  test('T-IDN-API-12 only the Studio origin may send the command', async () => {
    const { origin: _origin, ...withoutOrigin } = COMMANDED
    for (const headers of [
      { ...COMMANDED, origin: 'https://attacker.test' },
      { ...COMMANDED, origin: 'https://studio.example.test.attacker.test' },
      withoutOrigin,
    ]) {
      const calls: Call[] = []
      const response = await put(app(preferences(calls)), { theme: 'light' }, headers)
      expect(response.status).toBe(403)
      expect(response.headers.get('cache-control')).toBe('no-store')
      expect(await problemCode(response)).toBe('forbidden')
      expect(calls).toEqual([])
    }
  })

  test('T-IDN-API-13 a command without its two identifiers is 400 before anything runs', async () => {
    const { 'idempotency-key': _key, ...withoutKey } = COMMANDED
    const { 'command-id': _command, ...withoutCommand } = COMMANDED
    for (const headers of [
      withoutKey,
      withoutCommand,
      { ...COMMANDED, 'idempotency-key': COMMAND },
      { ...COMMANDED, 'command-id': KEY },
      { ...COMMANDED, 'idempotency-key': 'not-a-uuid' },
    ]) {
      const calls: Call[] = []
      const response = await put(app(preferences(calls)), { theme: 'light' }, headers)
      expect(response.status).toBe(400)
      expect(response.headers.get('cache-control')).toBe('no-store')
      expect(await problemCode(response)).toBe('invalid-request')
      expect(calls).toEqual([])
    }
  })

  test('T-IDN-API-14 a replay says so, and the request is hashed from what she chose', async () => {
    const hashes: string[] = []
    const service = preferences([], {
      put: async (input) => {
        hashes.push(Buffer.from(input.requestHash).toString('hex'))
        return { resource: { theme: input.theme }, replayed: hashes.length > 1 }
      },
    })
    const first = await put(app(service), { theme: 'light' })
    const retried = await put(app(service), { theme: 'light' })
    await put(app(service), { theme: 'dark' })

    expect(first.headers.get('idempotent-replay')).toBeNull()
    expect(retried.status).toBe(200)
    expect(retried.headers.get('idempotent-replay')).toBe('true')
    const replayed: unknown = await retried.json()
    assertMatchesContract('StudioPreferences', replayed)
    expect(replayed).toEqual({ theme: 'light' })
    // The same choice hashes the same, so a retry replays; another choice under the
    // same key hashes differently, which is what PostgreSQL refuses (T-IDN-IDEM-20).
    expect(hashes).toHaveLength(3)
    expect(hashes[0]).toMatch(/^[0-9a-f]{64}$/)
    expect(hashes[1]).toBe(hashes[0])
    expect(hashes[2]).not.toBe(hashes[0])
  })
})
