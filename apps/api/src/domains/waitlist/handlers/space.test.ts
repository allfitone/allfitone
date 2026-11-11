/**
 * `T-WL-API-01` — the waitlist routes against the contract (`OP-WL-001` to `OP-WL-003`).
 *
 * The assertions that carry weight:
 *
 * - **Without space-web's secret the routes are not there**, and the service is never
 *   called. That covers a wrong secret, a missing one, and a deployment that has none
 *   configured (ADR-050, mandatory scenario 6).
 * - **A repeated address answers with nothing about the sign-up behind it.** The body is
 *   compared whole.
 * - **Nothing is stored without the authorization**: a request without an explicit
 *   `consent: true` never reaches the service.
 */

import { describe, expect, test } from 'bun:test'

import type { WaitlistService } from '../application/index.js'
import {
  WaitlistError,
  type WaitlistJoinInput,
  type WaitlistJoinResult,
  type WaitlistVisitor,
} from '../domain/index.js'
import { spaceWaitlistRoutes } from './space.js'

const SECRET = 'space-web-secret-for-tests-0123456789'
const ENVIRONMENT = { WAITLIST_SPACE_WEB_SECRET: SECRET }
const TOKEN = 'a'.repeat(43)
const HEADERS = {
  'content-type': 'application/json',
  'x-allfit-waitlist-secret': SECRET,
  'x-allfit-visitor-address': '203.0.113.7',
  'x-allfit-visitor-device': 'device-0123456789abcdef',
}
const SIGNUP = {
  name: ' Ana Ruiz ',
  email: 'ana.ruiz@gmail.com',
  language: 'es',
  consent: true,
  policy_version: '2026-11-10',
}

interface Calls {
  join: Array<{ input: WaitlistJoinInput; visitor: WaitlistVisitor }>
  confirm: Array<{ token: string; visitor: WaitlistVisitor }>
  requestEmail: Array<{ email: string; visitor: WaitlistVisitor }>
}

function setup(overrides: Partial<WaitlistService> = {}, environment = ENVIRONMENT) {
  const calls: Calls = { join: [], confirm: [], requestEmail: [] }
  const service: WaitlistService = {
    join: async (input, visitor): Promise<WaitlistJoinResult> => {
      calls.join.push({ input, visitor })
      return { outcome: 'joined', referralCode: 'KEVN7QHX', referrals: 0 }
    },
    confirm: async (token, visitor) => {
      calls.confirm.push({ token, visitor })
      return 'confirmed'
    },
    requestEmail: async (email, visitor) => {
      calls.requestEmail.push({ email, visitor })
      return 'accepted'
    },
    ...overrides,
  }
  const app = spaceWaitlistRoutes(service, environment)
  const post = (path: string, body: unknown, headers: Record<string, string> = HEADERS) =>
    app.request(path, { method: 'POST', headers, body: JSON.stringify(body) })
  return { calls, post }
}

describe('T-WL-API-01 the routes exist only for space-web', () => {
  const paths = ['/waitlist/signups', '/waitlist/confirmations', '/waitlist/email-requests']

  test.each(paths)('%s answers not-found without the secret', async (path) => {
    const { calls, post } = setup()
    const { 'x-allfit-waitlist-secret': _secret, ...withoutSecret } = HEADERS

    const response = await post(path, { ...SIGNUP, token: TOKEN }, withoutSecret)

    expect(response.status).toBe(404)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(calls).toEqual({ join: [], confirm: [], requestEmail: [] })
  })

  test('a wrong secret answers the same', async () => {
    const { calls, post } = setup()

    const response = await post('/waitlist/signups', SIGNUP, {
      ...HEADERS,
      'x-allfit-waitlist-secret': `${SECRET}x`,
    })

    expect(response.status).toBe(404)
    expect(calls.join).toEqual([])
  })

  test('a deployment without a configured secret closes the routes', async () => {
    const { calls, post } = setup({}, { WAITLIST_SPACE_WEB_SECRET: '' })

    const response = await post('/waitlist/signups', SIGNUP, {
      ...HEADERS,
      'x-allfit-waitlist-secret': '',
    })

    expect(response.status).toBe(404)
    expect(calls.join).toEqual([])
  })
})

describe('T-WL-API-01 joining (OP-WL-001)', () => {
  test('a new address answers 201 with its code and counter', async () => {
    const { calls, post } = setup()

    const response = await post('/waitlist/signups', {
      ...SIGNUP,
      referral_code: 'abcd2345',
      utm_source: 'instagram',
      utm_medium: ' ',
    })

    expect(response.status).toBe(201)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(await response.json()).toEqual({
      status: 'joined',
      referral_code: 'KEVN7QHX',
      referrals: 0,
    })
    expect(calls.join).toEqual([
      {
        input: {
          name: 'Ana Ruiz',
          email: 'ana.ruiz@gmail.com',
          language: 'es',
          policyVersion: '2026-11-10',
          inviterCode: 'abcd2345',
          utmSource: 'instagram',
        },
        visitor: { address: '203.0.113.7', device: 'device-0123456789abcdef' },
      },
    ])
  })

  test('an address already on the list answers 202 and nothing about its sign-up', async () => {
    const { post } = setup({ join: async () => ({ outcome: 'already_listed' }) })

    const response = await post('/waitlist/signups', SIGNUP)

    expect(response.status).toBe(202)
    expect(await response.json()).toEqual({ status: 'already_listed' })
  })

  test.each([
    ['no consent', { ...SIGNUP, consent: undefined }],
    ['consent that is not exactly true', { ...SIGNUP, consent: 'true' }],
    ['a blank name', { ...SIGNUP, name: '   ' }],
    ['a name past 80 characters', { ...SIGNUP, name: 'a'.repeat(81) }],
    ['something that is not an address', { ...SIGNUP, email: 'ana.ruiz' }],
    ['an unknown language', { ...SIGNUP, language: 'pt' }],
    ['no policy version', { ...SIGNUP, policy_version: undefined }],
    ['a code that cannot be a code', { ...SIGNUP, referral_code: 'a b' }],
    ['a channel past 64 characters', { ...SIGNUP, utm_source: 'a'.repeat(65) }],
  ])('%s is refused before the service is called', async (_case, body) => {
    const { calls, post } = setup()

    const response = await post('/waitlist/signups', body)

    expect(response.status).toBe(400)
    expect(calls.join).toEqual([])
  })

  test('a request that does not say who the visitor is is refused', async () => {
    const { calls, post } = setup()
    const { 'x-allfit-visitor-address': _address, ...withoutAddress } = HEADERS

    const response = await post('/waitlist/signups', SIGNUP, withoutAddress)

    expect(response.status).toBe(400)
    expect(calls.join).toEqual([])
  })

  test('a visitor without the device cookie still joins', async () => {
    const { calls, post } = setup()
    const { 'x-allfit-visitor-device': _device, ...withoutDevice } = HEADERS

    const response = await post('/waitlist/signups', SIGNUP, withoutDevice)

    expect(response.status).toBe(201)
    expect(calls.join[0]?.visitor).toEqual({ address: '203.0.113.7' })
  })

  test('a disposable address is a validation problem that says why', async () => {
    const { post } = setup({
      join: async () => {
        throw new WaitlistError('disposable-email')
      },
    })

    const response = await post('/waitlist/signups', SIGNUP)

    expect(response.status).toBe(422)
    expect(response.headers.get('content-type')).toContain('application/problem+json')
    expect(await response.json()).toMatchObject({
      type: 'https://errors.allfit.invalid/validation-failed',
      detail: 'disposable-email',
    })
  })

  test('the limit per connection answers 429 with when to come back', async () => {
    const { post } = setup({ join: async () => ({ outcome: 'rate_limited' }) })

    const response = await post('/waitlist/signups', SIGNUP)

    expect(response.status).toBe(429)
    expect(response.headers.get('retry-after')).toBe('3600')
  })
})

describe('T-WL-API-01 confirming (OP-WL-002)', () => {
  test('the token confirms', async () => {
    const { calls, post } = setup()

    const response = await post('/waitlist/confirmations', { token: TOKEN })

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ status: 'confirmed' })
    expect(calls.confirm[0]?.token).toBe(TOKEN)
  })

  test('confirming again says so', async () => {
    const { post } = setup({ confirm: async () => 'already_confirmed' })

    const response = await post('/waitlist/confirmations', { token: TOKEN })

    expect(await response.json()).toEqual({ status: 'already_confirmed' })
  })

  test('a token the database does not accept answers not-found', async () => {
    const { post } = setup({ confirm: async () => 'invalid' })

    expect((await post('/waitlist/confirmations', { token: TOKEN })).status).toBe(404)
  })

  test('a string that cannot be a token answers the same, without asking', async () => {
    const { calls, post } = setup()

    expect((await post('/waitlist/confirmations', { token: 'short' })).status).toBe(404)
    expect(calls.confirm).toEqual([])
  })

  test('a body without a token is malformed', async () => {
    const { post } = setup()

    expect((await post('/waitlist/confirmations', {})).status).toBe(400)
  })
})

describe('T-WL-API-01 asking for the email again (OP-WL-003)', () => {
  test('answers 202 with no body, whatever the address', async () => {
    const { calls, post } = setup()

    const response = await post('/waitlist/email-requests', { email: ' ana@example.com ' })

    expect(response.status).toBe(202)
    expect(await response.text()).toBe('')
    expect(calls.requestEmail[0]?.email).toBe('ana@example.com')
  })

  test('refuses what is not an address', async () => {
    const { calls, post } = setup()

    expect((await post('/waitlist/email-requests', { email: 'ana' })).status).toBe(400)
    expect(calls.requestEmail).toEqual([])
  })

  test('the limit per connection answers 429', async () => {
    const { post } = setup({ requestEmail: async () => 'rate_limited' })

    expect((await post('/waitlist/email-requests', { email: 'ana@example.com' })).status).toBe(429)
  })
})
