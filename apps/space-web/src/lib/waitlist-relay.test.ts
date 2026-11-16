import { afterEach, beforeEach, describe, expect, spyOn, test } from 'bun:test'

import {
  DEVICE_COOKIE,
  deviceFromCookies,
  PRIVACY_POLICY_VERSION,
  relayWaitlist,
  visitorAddress,
  type RelaySettings,
} from './waitlist-relay'

const API = 'https://api.allfit.test'
const SECRET = 's'.repeat(40)
const DEVICE = 'Dev1ce_Identifier-0001'
const TOKEN = 'T'.repeat(43)

interface Sent {
  url: string
  headers: Headers
  body: unknown
}

/** An API that answers one response and remembers what it was asked. */
function api(answer: () => Response | Promise<Response>) {
  const sent: Sent[] = []
  const settings: RelaySettings = {
    apiUrl: API,
    secret: SECRET,
    fetch: async (url, init) => {
      sent.push({
        url: url.toString(),
        headers: new Headers(init.headers),
        body: JSON.parse(String(init.body)) as unknown,
      })
      return answer()
    },
  }
  return { sent, settings }
}

function browser(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request('https://space.allfit.test/api/waitlist/x', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-forwarded-for': '198.51.100.9, 203.0.113.7, 130.176.1.1',
      'x-origin-verify': 'present',
      ...headers,
    },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
}

const problem = (status: number, code: string, detail?: string) =>
  Response.json(
    {
      type: `https://errors.allfit.invalid/${code}`,
      title: code,
      status,
      detail,
      request_id: 'r1',
    },
    { status, headers: { 'retry-after': '3600' } },
  )

let quiet: ReturnType<typeof spyOn>
beforeEach(() => {
  quiet = spyOn(console, 'error').mockImplementation(() => undefined)
})
afterEach(() => {
  quiet.mockRestore()
})

describe('the visitor’s address', () => {
  test('behind CloudFront is the second entry from the right, never one the visitor wrote', () => {
    const headers = new Headers({
      'x-forwarded-for': '198.51.100.9, 203.0.113.7, 130.176.1.1',
      'x-origin-verify': 'present',
    })
    expect(visitorAddress(headers)).toBe('203.0.113.7')
  })

  test('reached directly, as in development, is the last entry', () => {
    expect(visitorAddress(new Headers({ 'x-forwarded-for': '127.0.0.1' }))).toBe('127.0.0.1')
    expect(visitorAddress(new Headers({ 'x-forwarded-for': '::1' }))).toBe('::1')
  })

  test('is missing when the chain is too short or the entry is not an address', () => {
    expect(
      visitorAddress(new Headers({ 'x-forwarded-for': '130.176.1.1', 'x-origin-verify': 'x' })),
    ).toBeNull()
    expect(visitorAddress(new Headers({ 'x-forwarded-for': 'unknown' }))).toBeNull()
    expect(visitorAddress(new Headers())).toBeNull()
  })
})

describe('the device cookie', () => {
  test('is read only when it looks like one this app issued', () => {
    expect(deviceFromCookies(`a=1; ${DEVICE_COOKIE}=${DEVICE}; b=2`)).toBe(DEVICE)
    expect(deviceFromCookies(`${DEVICE_COOKIE}=short`)).toBeNull()
    expect(deviceFromCookies(`${DEVICE_COOKIE}=${'x'.repeat(20)}!`)).toBeNull()
    expect(deviceFromCookies(null)).toBeNull()
  })
})

describe('the relay', () => {
  test('forwards a sign-up with the secret, the address, a new device and the policy version', async () => {
    const { sent, settings } = api(() =>
      Response.json({ status: 'joined', referral_code: 'KEVIN7QH', referrals: 0 }, { status: 201 }),
    )
    const response = await relayWaitlist(
      'signups',
      browser({
        name: 'Kevin',
        email: 'kevin@correo.com',
        language: 'es',
        consent: true,
        referral_code: 'WAL8ERT',
        utm_source: 'instagram',
        policy_version: 'forged',
        is_admin: true,
      }),
      settings,
    )

    expect(sent).toHaveLength(1)
    const [request] = sent
    expect(request?.url).toBe(`${API}/space/v1/waitlist/signups`)
    expect(request?.headers.get('x-allfit-waitlist-secret')).toBe(SECRET)
    expect(request?.headers.get('x-allfit-visitor-address')).toBe('203.0.113.7')
    const device = request?.headers.get('x-allfit-visitor-device') ?? ''
    expect(device).toMatch(/^[A-Za-z0-9_-]{16,128}$/)
    expect(request?.body).toEqual({
      name: 'Kevin',
      email: 'kevin@correo.com',
      language: 'es',
      consent: true,
      referral_code: 'WAL8ERT',
      utm_source: 'instagram',
      policy_version: PRIVACY_POLICY_VERSION,
    })

    expect(response.status).toBe(201)
    expect(await response.json()).toEqual({
      status: 'joined',
      referral_code: 'KEVIN7QH',
      referrals: 0,
    })
    expect(response.headers.get('cache-control')).toBe('no-store')
    const cookie = response.headers.get('set-cookie') ?? ''
    expect(cookie).toContain(`${DEVICE_COOKIE}=${device};`)
    expect(cookie).toContain('HttpOnly')
    expect(cookie).toContain('Secure')
    expect(cookie).toContain('SameSite=Lax')
  })

  test('a device the browser already has is the one sent, and no cookie is set again', async () => {
    const { sent, settings } = api(() =>
      Response.json({ status: 'already_listed' }, { status: 202 }),
    )
    const response = await relayWaitlist(
      'signups',
      browser({ email: 'kevin@correo.com' }, { cookie: `${DEVICE_COOKIE}=${DEVICE}` }),
      settings,
    )
    expect(sent[0]?.headers.get('x-allfit-visitor-device')).toBe(DEVICE)
    expect(response.status).toBe(202)
    expect(await response.json()).toEqual({ status: 'already_listed' })
    expect(response.headers.get('set-cookie')).toBeNull()
  })

  test('a token operation forwards the token alone', async () => {
    const { sent, settings } = api(() => new Response(null, { status: 204 }))
    const response = await relayWaitlist(
      'departures',
      browser({ token: TOKEN, email: 'x@y.co' }),
      settings,
    )
    expect(sent[0]?.url).toBe(`${API}/space/v1/waitlist/departures`)
    expect(sent[0]?.body).toEqual({ token: TOKEN })
    expect(response.status).toBe(204)
    expect(await response.text()).toBe('')
  })

  test('the API’s failures reach the page as one word, without its request id', async () => {
    const cases = [
      [problem(422, 'validation-failed', 'disposable-email'), 422, 'disposable-email'],
      [problem(422, 'validation-failed', 'name-too-long'), 400, 'invalid-request'],
      [problem(400, 'invalid-request'), 400, 'invalid-request'],
      [problem(404, 'not-found'), 404, 'not-found'],
      [problem(429, 'rate-limited'), 429, 'rate-limited'],
      [problem(500, 'internal'), 502, 'unavailable'],
    ] as const
    for (const [answer, status, error] of cases) {
      const { settings } = api(() => answer)
      const response = await relayWaitlist('confirmations', browser({ token: TOKEN }), settings)
      expect(response.status).toBe(status)
      expect(await response.json()).toEqual({ error })
      if (status === 429) expect(response.headers.get('retry-after')).toBe('3600')
    }
  })

  test('an API that cannot be reached is a failure the page can show', async () => {
    const { settings } = api(() => {
      throw new Error('connection refused')
    })
    const response = await relayWaitlist('link-reads', browser({ token: TOKEN }), settings)
    expect(response.status).toBe(502)
    expect(await response.json()).toEqual({ error: 'unavailable' })
  })

  test('without the secret, a full-length secret or the visitor’s address, it never asks', async () => {
    for (const change of [
      { secret: undefined },
      { secret: 's'.repeat(31) },
      { apiUrl: undefined },
    ] satisfies Partial<RelaySettings>[]) {
      const { sent, settings } = api(() => new Response(null, { status: 204 }))
      const response = await relayWaitlist('departures', browser({ token: TOKEN }), {
        ...settings,
        ...change,
      })
      expect(response.status).toBe(503)
      expect(sent).toHaveLength(0)
    }

    const { sent, settings } = api(() => new Response(null, { status: 204 }))
    const response = await relayWaitlist(
      'departures',
      browser({ token: TOKEN }, { 'x-forwarded-for': '130.176.1.1' }),
      settings,
    )
    expect(response.status).toBe(503)
    expect(sent).toHaveLength(0)
  })

  test('an unknown operation or a body that is not an object is refused before asking', async () => {
    const { sent, settings } = api(() => new Response(null, { status: 204 }))
    expect((await relayWaitlist('admin', browser({}), settings)).status).toBe(404)
    expect((await relayWaitlist('signups', browser('not json'), settings)).status).toBe(400)
    expect((await relayWaitlist('signups', browser('[1, 2]'), settings)).status).toBe(400)
    expect(sent).toHaveLength(0)
  })
})
