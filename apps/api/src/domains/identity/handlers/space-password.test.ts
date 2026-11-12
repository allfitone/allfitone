import { beforeEach, describe, expect, test } from 'bun:test'
import type { VerifiedToken } from '@allfitone/auth-provider'
import { allfitV1ContractManifest } from '@allfitone/contracts'
import { Hono } from 'hono'

import { mountSurfaces } from '../../../surfaces.js'
import {
  PasswordChangeError,
  type PasswordChangeErrorCode,
  type PasswordChangeService,
} from '../application/password-change.js'
import { spacePasswordRoutes } from './space-password.js'

const COMMAND_ID = '019f6000-0000-7000-8000-000000000501'
const IDEMPOTENCY_KEY = 'b6000000-0000-4000-8000-000000000001'
const CURRENT = 'Actual-Clave-2026'
const NEXT = 'Nueva-Clave-2026'

const token: VerifiedToken = {
  subject: 'user_camila',
  sessionId: 'session_phone',
  surface: 'space',
  authenticatedAt: null,
}

let calls: {
  token: VerifiedToken
  input: Parameters<PasswordChangeService['changePassword']>[1]
}[] = []

function service(outcome: { replayed?: boolean; error?: PasswordChangeErrorCode } = {}) {
  const changing: PasswordChangeService = {
    changePassword: async (verified, input) => {
      calls.push({ token: verified, input })
      if (outcome.error) throw new PasswordChangeError(outcome.error)
      return { replayed: outcome.replayed ?? false }
    },
  }
  return changing
}

function routes(changing: PasswordChangeService = service()): Hono {
  return new Hono().route(
    '/space/v1',
    spacePasswordRoutes(changing, async (value) => {
      if (value !== 'good-token') throw new Error('rejected')
      return token
    }),
  )
}

function change(
  body: unknown,
  options: { bearer?: string | null; headers?: Record<string, string> } = {},
): Request {
  const headers = new Headers({
    'idempotency-key': IDEMPOTENCY_KEY,
    'command-id': COMMAND_ID,
    'content-type': 'application/json',
    ...options.headers,
  })
  if (options.bearer !== null)
    headers.set('authorization', `Bearer ${options.bearer ?? 'good-token'}`)
  return new Request('https://api.example.test/space/v1/me/password', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  })
}

const both = { current_password: CURRENT, new_password: NEXT }

beforeEach(() => {
  calls = []
  process.env.BACKOFFICE_WEB_URL = 'https://backoffice.example.test'
  process.env.STUDIO_WEB_URL = 'https://studio.example.test'
  process.env.API_PUBLIC_URL = 'https://api.example.test'
})

describe('Space password change API contract (OP-IDN-066)', () => {
  test('T-IDN-PASSWORD-API-01 mounts the contract operation below the real Space surface', () => {
    const contract = allfitV1ContractManifest.operations
      .filter((operation) => operation.allfitOperation === 'OP-IDN-066')
      .map((operation) => `${operation.method} ${operation.path}`)
    const app = new Hono()
    mountSurfaces(app)
    const mounted = app.routes.map((route) => `${route.method} ${route.path}`)

    expect(contract).toEqual(['POST /space/v1/me/password'])
    expect(mounted).toContain('POST /space/v1/me/password')
  })

  test('T-IDN-PASSWORD-API-02 a change answers 204, never cached, for the token that asked', async () => {
    const response = await routes().fetch(change(both))

    expect(response.status).toBe(204)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(calls).toHaveLength(1)
    expect(calls[0]?.token).toBe(token)
    expect(calls[0]?.input).toMatchObject({
      currentPassword: CURRENT,
      newPassword: NEXT,
      idempotencyKey: IDEMPOTENCY_KEY,
      commandId: COMMAND_ID,
    })
  })

  test('T-IDN-PASSWORD-API-03 the receipt hash never depends on the passwords', async () => {
    await routes().fetch(change(both))
    await routes().fetch(
      change({ current_password: 'Otra-Clave-2026', new_password: 'Mas-Claves-2027' }),
    )

    const [first, second] = calls.map((call) => Buffer.from(call.input.requestHash).toString('hex'))
    expect(first).toBe(second)
  })

  test('T-IDN-PASSWORD-API-04 a replay says so', async () => {
    const response = await routes(service({ replayed: true })).fetch(change(both))

    expect(response.status).toBe(204)
    expect(response.headers.get('idempotent-replay')).toBe('true')
  })

  test('T-IDN-PASSWORD-API-05 a wrong current password and a refused new one are told apart', async () => {
    const wrong = await routes(service({ error: 'wrong-password' })).fetch(change(both))
    const weak = await routes(service({ error: 'weak-password' })).fetch(change(both))

    expect(wrong.status).toBe(422)
    expect(await wrong.json()).toMatchObject({
      type: 'https://errors.allfit.invalid/wrong-password',
    })
    expect(weak.status).toBe(422)
    expect(await weak.json()).toMatchObject({ type: 'https://errors.allfit.invalid/weak-password' })
  })

  test('T-IDN-PASSWORD-API-06 too many wrong ones answer 429 with when to come back', async () => {
    const response = await routes(service({ error: 'rate-limited' })).fetch(change(both))

    expect(response.status).toBe(429)
    expect(response.headers.get('retry-after')).toBe('3600')
  })

  test('T-IDN-PASSWORD-API-07 a new password outside the policy is refused before anything is asked', async () => {
    for (const next of ['corta1A', 'sinmayuscula2026', 'SINMINUSCULA2026', 'SinNumeroNunca']) {
      const response = await routes().fetch(
        change({ current_password: CURRENT, new_password: next }),
      )
      expect(response.status).toBe(422)
    }
    const extra = await routes().fetch(change({ ...both, confirm: NEXT }))
    expect(extra.status).toBe(422)
    expect(calls).toHaveLength(0)
  })

  test('T-IDN-PASSWORD-API-08 without a token or the command headers nothing is asked', async () => {
    const anonymous = await routes().fetch(change(both, { bearer: null }))
    const headless = await routes().fetch(change(both, { headers: { 'idempotency-key': 'nope' } }))

    expect(anonymous.status).toBe(401)
    expect(headless.status).toBe(400)
    expect(calls).toHaveLength(0)
  })

  test('T-IDN-PASSWORD-API-09 no answer carries what was typed', async () => {
    for (const error of ['wrong-password', 'weak-password', 'upstream-unavailable'] as const) {
      const response = await routes(service({ error })).fetch(change(both))
      const text = await response.text()
      expect(text).not.toContain(CURRENT)
      expect(text).not.toContain(NEXT)
    }
  })
})
