import { beforeEach, describe, expect, test } from 'bun:test'
import type { VerifiedToken } from '@allfitone/auth-provider'
import { allfitV1ContractManifest, type AllfitV1Schemas } from '@allfitone/contracts'
import { Hono } from 'hono'

import { mountSurfaces } from '../../../surfaces.js'
import type { SpacePreferencesService } from '../application/space-preferences.js'
import { spacePreferencesRoutes } from './space-preferences.js'

const OPERATIONS = [
  'OP-IDN-023',
  'OP-IDN-024',
  'OP-IDN-070',
  'OP-IDN-071',
  'OP-IDN-072',
  'OP-IDN-073',
]
const IDEMPOTENCY_KEY = 'a0000000-0000-4000-8000-000000000701'
const COMMAND_ID = '019b7000-0000-7000-8000-000000000701'
const DEVICE_ID = 'a4000000-0000-4000-8000-000000000001'

const CATEGORIES = ['relationship', 'assignment', 'consent', 'correction', 'nutrition', 'security']
const CHANNELS = ['email', 'push']

const units: AllfitV1Schemas['SpacePreferences'] = {
  mass_unit: 'lb',
  distance_unit: 'mi',
  locale: 'en',
}

function channelSet(off: string[] = []) {
  return CATEGORIES.flatMap((category) =>
    CHANNELS.map((channel) => ({
      category,
      channel,
      enabled: !off.includes(`${category}:${channel}`),
    })),
  )
}

const channels = {
  preferences: channelSet().map((choice) => ({
    ...choice,
    locked: choice.category === 'security',
    available: choice.channel === 'email',
  })),
} as AllfitV1Schemas['SpaceNotificationPreferences']

const device: AllfitV1Schemas['SpacePushDevice'] = {
  id: DEVICE_ID,
  platform: 'ios',
  registered_at: '2026-11-25T10:00:00.000Z',
  last_seen_at: '2026-11-25T10:00:00.000Z',
}

const token = { subject: 'user_subject', sessionId: 'session_1' } as unknown as VerifiedToken

let captured: { operation: string; token: unknown; input?: unknown }[] = []

function service(overrides: Partial<SpacePreferencesService> = {}): SpacePreferencesService {
  return {
    readPreferences: (verified) => {
      captured.push({ operation: 'readPreferences', token: verified })
      return Promise.resolve({ mass_unit: null, distance_unit: null, locale: null })
    },
    putPreferences: (verified, input) => {
      captured.push({ operation: 'putPreferences', token: verified, input })
      return Promise.resolve({ resource: input.preferences, replayed: false })
    },
    readNotificationPreferences: (verified) => {
      captured.push({ operation: 'readNotificationPreferences', token: verified })
      return Promise.resolve(channels)
    },
    putNotificationPreferences: (verified, input) => {
      captured.push({ operation: 'putNotificationPreferences', token: verified, input })
      return Promise.resolve({ resource: channels, replayed: false })
    },
    registerPushDevice: (verified, input) => {
      captured.push({ operation: 'registerPushDevice', token: verified, input })
      return Promise.resolve({ resource: device, replayed: false })
    },
    retirePushDevice: (verified, input) => {
      captured.push({ operation: 'retirePushDevice', token: verified, input })
      return Promise.resolve({ replayed: false })
    },
    ...overrides,
  }
}

function routes(injected: SpacePreferencesService = service()): Hono {
  return new Hono().route(
    '/space/v1',
    spacePreferencesRoutes(injected, async (value) => {
      if (value !== 'good-token') throw new Error('rejected')
      return token
    }),
  )
}

function request(
  path: string,
  init: {
    method?: string
    bearer?: string | null
    headers?: Record<string, string>
    body?: unknown
  } = {},
): Request {
  const headers = new Headers(init.headers)
  if (init.bearer !== null) headers.set('authorization', `Bearer ${init.bearer ?? 'good-token'}`)
  return new Request(`https://api.example.test/space/v1${path}`, {
    method: init.method ?? 'GET',
    headers,
    ...(init.body === undefined
      ? {}
      : { body: typeof init.body === 'string' ? init.body : JSON.stringify(init.body) }),
  })
}

function command(
  path: string,
  method: 'PUT' | 'DELETE',
  body?: unknown,
  headers: Record<string, string> = {},
): Request {
  return request(path, {
    method,
    headers: {
      'idempotency-key': IDEMPOTENCY_KEY,
      'command-id': COMMAND_ID,
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      ...headers,
    },
    body,
  })
}

function rejecting(sqlState: string) {
  return () => Promise.reject(Object.assign(new Error('refused'), { code: sqlState }))
}

function colonPath(path: string): string {
  return path.replace(/\{([A-Za-z0-9_]+)\}/g, ':$1')
}

beforeEach(() => {
  captured = []
  process.env.BACKOFFICE_WEB_URL = 'https://backoffice.example.test'
  process.env.STUDIO_WEB_URL = 'https://studio.example.test'
  process.env.API_PUBLIC_URL = 'https://api.example.test'
})

describe('Space units, language, channels and phones API contract', () => {
  test('T-IDN-PREFS-API-01 mounts the six operations with their contract methods', () => {
    const contract = allfitV1ContractManifest.operations
      .filter((operation) => OPERATIONS.includes(operation.allfitOperation))
      .map((operation) => `${operation.method} ${colonPath(operation.path)}`)
      .sort()
    const mounted = spacePreferencesRoutes(service())
      .routes.filter((route) => route.method !== 'ALL')
      .map((route) => `${route.method} /space/v1${route.path}`)
      .sort()

    expect(contract).toHaveLength(6)
    expect(mounted).toEqual(contract)
  })

  test('T-IDN-PREFS-API-02 mounts below the real Space surface prefix', () => {
    const app = new Hono()
    mountSurfaces(app)
    const mounted = app.routes
      .filter((route) => route.method !== 'ALL')
      .map((route) => `${route.method} ${route.path}`)

    expect(mounted).toContain('GET /space/v1/me/preferences')
    expect(mounted).toContain('PUT /space/v1/me/preferences')
    expect(mounted).toContain('GET /space/v1/me/notification-preferences')
    expect(mounted).toContain('PUT /space/v1/me/notification-preferences')
    expect(mounted).toContain('PUT /space/v1/me/push-devices/:deviceId')
    expect(mounted).toContain('DELETE /space/v1/me/push-devices/:deviceId')
  })

  test('T-IDN-PREFS-API-03 reads units and language, null until she chooses (OP-IDN-070)', async () => {
    const response = await routes().fetch(request('/me/preferences'))

    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')
    await expect(response.json()).resolves.toEqual({
      mass_unit: null,
      distance_unit: null,
      locale: null,
    })
    expect(captured[0]?.token).toBe(token)
  })

  test('T-IDN-PREFS-API-04 keeps what she chose, and a null hands it back to the phone (OP-IDN-071)', async () => {
    const chosen = await routes().fetch(command('/me/preferences', 'PUT', units))
    const cleared = await routes().fetch(
      command('/me/preferences', 'PUT', { mass_unit: null, distance_unit: 'km', locale: null }),
    )

    expect([chosen.status, cleared.status]).toEqual([200, 200])
    await expect(chosen.json()).resolves.toEqual(units)
    expect(captured[0]?.input).toMatchObject({
      idempotencyKey: IDEMPOTENCY_KEY,
      commandId: COMMAND_ID,
      preferences: units,
    })
    expect(captured[1]?.input).toMatchObject({
      preferences: { mass_unit: null, distance_unit: 'km', locale: null },
    })
  })

  test('T-IDN-PREFS-API-05 refuses a unit or language outside its list, or a missing key, with 422', async () => {
    const bodies: unknown[] = [
      { ...units, mass_unit: 'stone' },
      { ...units, distance_unit: 'league' },
      { ...units, locale: 'fr' },
      { mass_unit: 'kg', distance_unit: 'km' },
      { ...units, theme: 'dark' },
      '{not json',
    ]
    const answers = await Promise.all(
      bodies.map((body) => routes().fetch(command('/me/preferences', 'PUT', body))),
    )

    expect(answers.map((response) => response.status)).toEqual(bodies.map(() => 422))
    expect(captured).toEqual([])
  })

  test('T-IDN-PREFS-API-06 reads every category by channel (OP-IDN-023)', async () => {
    const response = await routes().fetch(request('/me/notification-preferences'))

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual(channels)
  })

  test('T-IDN-PREFS-API-07 replaces the whole set of channels (OP-IDN-024)', async () => {
    const set = channelSet(['nutrition:email'])
    const response = await routes().fetch(
      command('/me/notification-preferences', 'PUT', { preferences: set }),
    )

    expect(response.status).toBe(200)
    expect(captured[0]?.input).toMatchObject({ preferences: set, idempotencyKey: IDEMPOTENCY_KEY })
  })

  test('T-IDN-PREFS-API-08 refuses a set that is not every category and channel once, with 422', async () => {
    const full = channelSet()
    const bodies: unknown[] = [
      { preferences: full.slice(1) },
      { preferences: [...full.slice(1), full[2]] },
      { preferences: [{ ...full[0], channel: 'sms' }, ...full.slice(1)] },
      { preferences: [{ ...full[0], category: 'billing' }, ...full.slice(1)] },
      { preferences: [{ ...full[0], enabled: 'yes' }, ...full.slice(1)] },
      { preferences: [{ ...full[0], locked: false }, ...full.slice(1)] },
      { preferences: full, extra: true },
      full,
    ]
    const answers = await Promise.all(
      bodies.map((body) => routes().fetch(command('/me/notification-preferences', 'PUT', body))),
    )

    expect(answers.map((response) => response.status)).toEqual(bodies.map(() => 422))
    expect(captured).toEqual([])
  })

  test('T-IDN-PREFS-API-09 security off or an unavailable channel turned on is the database refusing: 422', async () => {
    const response = await routes(
      service({ putNotificationPreferences: rejecting('22023') }),
    ).fetch(command('/me/notification-preferences', 'PUT', { preferences: channelSet() }))

    expect(response.status).toBe(422)
    expect(response.headers.get('content-type')).toContain('application/problem+json')
  })

  test('T-IDN-PREFS-API-10 registers this phone and never answers the token back (OP-IDN-072)', async () => {
    const response = await routes().fetch(
      command(`/me/push-devices/${DEVICE_ID}`, 'PUT', {
        token: 'ExponentPushToken[abc]',
        platform: 'ios',
      }),
    )

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body).toEqual(device)
    expect(JSON.stringify(body)).not.toContain('ExponentPushToken')
    expect(captured[0]?.input).toMatchObject({
      deviceId: DEVICE_ID,
      device: { token: 'ExponentPushToken[abc]', platform: 'ios' },
    })
  })

  test('T-IDN-PREFS-API-11 refuses an unknown platform or an empty token with 422, and a bad id with 400', async () => {
    const answers = await Promise.all([
      routes().fetch(
        command(`/me/push-devices/${DEVICE_ID}`, 'PUT', { token: 'x', platform: 'windows' }),
      ),
      routes().fetch(
        command(`/me/push-devices/${DEVICE_ID}`, 'PUT', { token: '  ', platform: 'ios' }),
      ),
      routes().fetch(command(`/me/push-devices/${DEVICE_ID}`, 'PUT', { platform: 'ios' })),
      routes().fetch(
        command(`/me/push-devices/${DEVICE_ID}`, 'PUT', {
          token: 'x'.repeat(513),
          platform: 'ios',
        }),
      ),
      routes().fetch(
        command('/me/push-devices/not-a-device', 'PUT', { token: 'x', platform: 'ios' }),
      ),
    ])

    expect(answers.map((response) => response.status)).toEqual([422, 422, 422, 422, 400])
    expect(captured).toEqual([])
  })

  test('T-IDN-PREFS-API-12 retires this phone with 204, the same for one that is not hers (OP-IDN-073)', async () => {
    const retired = await routes().fetch(command(`/me/push-devices/${DEVICE_ID}`, 'DELETE'))
    const malformed = await routes().fetch(command('/me/push-devices/nope', 'DELETE'))

    expect([retired.status, malformed.status]).toEqual([204, 400])
    expect(await retired.text()).toBe('')
    expect(captured[0]?.input).toMatchObject({ deviceId: DEVICE_ID, commandId: COMMAND_ID })
  })

  test('T-IDN-PREFS-IDEM-01 every command says when it replays', async () => {
    const replaying = service({
      putPreferences: async (_, input) => ({ resource: input.preferences, replayed: true }),
      putNotificationPreferences: async () => ({ resource: channels, replayed: true }),
      registerPushDevice: async () => ({ resource: device, replayed: true }),
      retirePushDevice: async () => ({ replayed: true }),
    })
    const answers = await Promise.all([
      routes(replaying).fetch(command('/me/preferences', 'PUT', units)),
      routes(replaying).fetch(
        command('/me/notification-preferences', 'PUT', { preferences: channelSet() }),
      ),
      routes(replaying).fetch(
        command(`/me/push-devices/${DEVICE_ID}`, 'PUT', { token: 'x', platform: 'android' }),
      ),
      routes(replaying).fetch(command(`/me/push-devices/${DEVICE_ID}`, 'DELETE')),
    ])

    expect(answers.map((response) => response.status)).toEqual([200, 200, 200, 204])
    expect(answers.map((response) => response.headers.get('idempotent-replay'))).toEqual([
      'true',
      'true',
      'true',
      'true',
    ])
  })

  test('T-IDN-PREFS-IDEM-02 the same body hashes the same, and another body differently', async () => {
    await routes().fetch(command('/me/preferences', 'PUT', units))
    await routes().fetch(
      command('/me/preferences', 'PUT', { locale: 'en', distance_unit: 'mi', mass_unit: 'lb' }),
    )
    await routes().fetch(command('/me/preferences', 'PUT', { ...units, locale: 'es' }))

    const hashes = captured.map(({ input }) =>
      Buffer.from((input as { requestHash: Uint8Array }).requestHash).toString('hex'),
    )
    expect(hashes[0]).toBe(hashes[1])
    expect(hashes[2]).not.toBe(hashes[0])
  })

  test('T-IDN-PREFS-IDEM-03 a key reused for another request is 409', async () => {
    const response = await routes(service({ putPreferences: rejecting('23505') })).fetch(
      command('/me/preferences', 'PUT', units),
    )
    expect(response.status).toBe(409)
  })

  test('T-IDN-PREFS-API-13 requires a JSON body and the command identifiers', async () => {
    const answers = await Promise.all([
      routes().fetch(command('/me/preferences', 'PUT', units, { 'content-type': 'text/plain' })),
      routes().fetch(command('/me/preferences', 'PUT', units, { 'idempotency-key': 'nope' })),
      routes().fetch(
        command(`/me/push-devices/${DEVICE_ID}`, 'DELETE', undefined, {
          'command-id': 'a0000000-0000-4000-8000-000000000501',
        }),
      ),
    ])

    expect(answers.map((response) => response.status)).toEqual([415, 400, 400])
    expect(captured).toEqual([])
  })

  test('T-IDN-PREFS-API-14 never reaches the service without a token it can verify', async () => {
    const answers = await Promise.all([
      routes().fetch(request('/me/preferences', { bearer: null })),
      routes().fetch(request('/me/notification-preferences', { bearer: 'forged' })),
      routes().fetch(
        request(`/me/push-devices/${DEVICE_ID}`, {
          method: 'DELETE',
          bearer: 'forged',
          headers: { 'idempotency-key': IDEMPOTENCY_KEY, 'command-id': COMMAND_ID },
        }),
      ),
    ])

    expect(answers.map((response) => response.status)).toEqual([401, 401, 401])
    expect(captured).toEqual([])
  })

  test('T-IDN-PREFS-API-15 a token behind no active person is 403, and a database down is 503', async () => {
    const forbidden = await routes(service({ readPreferences: rejecting('42501') })).fetch(
      request('/me/preferences'),
    )
    const broken = await routes(
      service({ readNotificationPreferences: () => Promise.reject(new Error('down')) }),
    ).fetch(request('/me/notification-preferences'))

    expect([forbidden.status, broken.status]).toEqual([403, 503])
  })
})
