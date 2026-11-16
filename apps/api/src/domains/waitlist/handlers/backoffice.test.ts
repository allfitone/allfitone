/**
 * `T-WL-API-02` — the Backoffice waitlist routes against the contract (`OP-WL-011`,
 * `OP-WL-012`, `OP-WL-016`; `HU-BO-035`).
 *
 * The assertions that carry weight:
 *
 * - **A question that cannot be read is refused, never widened.** A one-letter search,
 *   an unknown filter or a cursor this API did not issue answers 400 and the service is
 *   never called.
 * - **A fraud mark carries a reason and nothing else, and so does taking it back**,
 *   and a body that says anything more is refused before anybody is asked who is acting.
 * - **Without a Backoffice session nothing is read.** Who holds the commercial duty is
 *   PostgreSQL's answer (`T-WL-RLS-02`); what is proved here is that its refusal reaches
 *   the caller as 403 and not as a list.
 */

import { beforeEach, describe, expect, test } from 'bun:test'
import { allfitV1ContractManifest, type AllfitV1Schemas } from '@allfitone/contracts'
import { Hono } from 'hono'

import {
  BACKOFFICE_SESSION_COOKIE,
  BackofficeAuthenticationError,
  type BackofficeAuthenticationService,
} from '../../identity/index.js'
import { mountSurfaces } from '../../../surfaces.js'
import type { WaitlistReviewService } from '../application/review.js'
import { encodeWaitlistCursor, type WaitlistSignupQuery } from '../domain/review.js'
import { backofficeWaitlistRoutes } from './backoffice.js'

const ORIGIN = 'https://backoffice.example.test'
const ACTOR_PERSON_ID = '019ab000-0000-7000-8000-000000000003'
const ACTOR_SESSION_ID = '019ab000-0000-7000-8000-000000000023'
const SIGNUP_ID = '019ab000-0000-7000-8000-000000000901'
const IDEMPOTENCY_KEY = 'd1000000-0000-4000-8000-000000000001'
const COMMAND_ID = '019ab000-0000-7000-8000-000000000501'
const REASON = 'Correos en serie desde un mismo equipo'
const WITHDRAWAL_REASON = 'La persona escribió y es real'

const signup: AllfitV1Schemas['BackofficeWaitlistSignup'] = {
  id: SIGNUP_ID,
  name: 'Bruno Díaz',
  email: 'bruno@example.com',
  language: 'es',
  referral_code: 'KEVN7QHX',
  joined_at: '2026-11-14T15:00:00.000Z',
  confirmed_at: '2026-11-14T15:02:00.000Z',
  founding_number: 2,
  channel: { kind: 'source', source: 'instagram' },
  invited_by: { name: 'Ana Ruiz', referral_code: 'ANAR2Q7M' },
  discard_reason: null,
  fraud: null,
  fraud_withdrawal: null,
  referrals: 3,
  referrals_sharing_connection: 2,
  has_space_account: false,
}

const marked: AllfitV1Schemas['BackofficeWaitlistSignup'] = {
  ...signup,
  founding_number: null,
  discard_reason: 'fraud',
  fraud: {
    reason: REASON,
    marked_at: '2026-11-14T16:00:00.000Z',
    previous_discard_reason: null,
    withheld_founding_number: null,
  },
}

const unmarked: AllfitV1Schemas['BackofficeWaitlistSignup'] = {
  ...signup,
  founding_number: null,
  fraud_withdrawal: { reason: WITHDRAWAL_REASON, withdrawn_at: '2026-11-14T17:00:00.000Z' },
}

const totals: AllfitV1Schemas['BackofficeWaitlistTotals'] = {
  signups: 7,
  confirmed: 4,
  founding_members: 4,
  marked_as_fraud: 0,
  with_account: 2,
  channels: [
    { channel: { kind: 'referral', source: null }, signups: 3, confirmed: 1 },
    { channel: { kind: 'direct', source: null }, signups: 2, confirmed: 2 },
    { channel: { kind: 'source', source: 'instagram' }, signups: 2, confirmed: 1 },
  ],
}

interface Calls {
  list: Array<{ reviewer: unknown; query: WaitlistSignupQuery }>
  totals: unknown[]
  markAsFraud: Array<{ reviewer: unknown; signupId: string; mark: unknown; hash: string }>
  withdrawFraudMark: Array<{
    reviewer: unknown
    signupId: string
    withdrawal: unknown
    hash: string
  }>
}

function noCalls(): Calls {
  return { list: [], totals: [], markAsFraud: [], withdrawFraudMark: [] }
}

let calls: Calls = noCalls()

function reviewService(
  overrides: Partial<WaitlistReviewService> = {},
  replayed = false,
): WaitlistReviewService {
  return {
    list: (reviewer, query) => {
      calls.list.push({ reviewer, query })
      return Promise.resolve({
        items: [signup],
        hasMore: true,
        nextCursor: encodeWaitlistCursor(SIGNUP_ID),
      })
    },
    totals: (reviewer) => {
      calls.totals.push(reviewer)
      return Promise.resolve(totals)
    },
    markAsFraud: (reviewer, input) => {
      calls.markAsFraud.push({
        reviewer,
        signupId: input.signupId,
        mark: input.mark,
        hash: Buffer.from(input.requestHash).toString('hex'),
      })
      return Promise.resolve({ resource: marked, replayed })
    },
    withdrawFraudMark: (reviewer, input) => {
      calls.withdrawFraudMark.push({
        reviewer,
        signupId: input.signupId,
        withdrawal: input.withdrawal,
        hash: Buffer.from(input.requestHash).toString('hex'),
      })
      return Promise.resolve({ resource: unmarked, replayed })
    },
    ...overrides,
  }
}

function sessionService(
  overrides: Partial<BackofficeAuthenticationService> = {},
): BackofficeAuthenticationService {
  return {
    resolveActor: async () => ({ personId: ACTOR_PERSON_ID, sessionId: ACTOR_SESSION_ID }),
    ...overrides,
  } as BackofficeAuthenticationService
}

function routes(
  review: WaitlistReviewService = reviewService(),
  sessions: BackofficeAuthenticationService = sessionService(),
): Hono {
  return new Hono().route('/backoffice/v1', backofficeWaitlistRoutes(review, sessions))
}

function get(path: string, init: { cookie?: boolean } = {}): Request {
  const headers = new Headers({ origin: ORIGIN })
  if (init.cookie !== false) headers.set('cookie', `${BACKOFFICE_SESSION_COOKIE}=session-secret`)
  return new Request(`https://api.example.test/backoffice/v1/waitlist${path}`, { headers })
}

function post(
  body: string | undefined,
  overrides: Record<string, string | null> = {},
  signupId: string = SIGNUP_ID,
  action: 'fraud' | 'fraud/withdrawal' = 'fraud',
): Request {
  const headers = new Headers({
    origin: ORIGIN,
    cookie: `${BACKOFFICE_SESSION_COOKIE}=session-secret`,
    'idempotency-key': IDEMPOTENCY_KEY,
    'command-id': COMMAND_ID,
  })
  if (body !== undefined) headers.set('content-type', 'application/json')
  for (const [name, value] of Object.entries(overrides)) {
    if (value === null) headers.delete(name)
    else headers.set(name, value)
  }
  return new Request(
    `https://api.example.test/backoffice/v1/waitlist/signups/${signupId}/${action}`,
    { method: 'POST', headers, ...(body === undefined ? {} : { body }) },
  )
}

function withdraw(
  body: string | undefined,
  overrides: Record<string, string | null> = {},
  signupId: string = SIGNUP_ID,
): Request {
  return post(body, overrides, signupId, 'fraud/withdrawal')
}

function databaseError(code: string): Error {
  return Object.assign(new Error('database refused'), { code })
}

function colonPath(path: string): string {
  return path.replace(/\{([A-Za-z0-9_]+)\}/g, ':$1')
}

beforeEach(() => {
  calls = noCalls()
  process.env.BACKOFFICE_WEB_URL = ORIGIN
  process.env.STUDIO_WEB_URL = 'https://studio.example.test'
  process.env.API_PUBLIC_URL = 'https://api.example.test'
})

describe('T-WL-API-02 the routes and the contract', () => {
  test('every Backoffice waitlist operation is mounted with its contract method', () => {
    const contract = allfitV1ContractManifest.operations
      .filter((operation) => operation.path.startsWith('/backoffice/v1/waitlist'))
      .map((operation) => `${operation.method} ${colonPath(operation.path)}`)
      .sort()
    const mounted = backofficeWaitlistRoutes()
      .routes.filter((route) => route.method !== 'ALL')
      .map((route) => `${route.method} /backoffice/v1${route.path}`)
      .sort()

    expect(contract).toHaveLength(4)
    expect(mounted).toEqual(contract)
  })

  test('they are mounted below the real Backoffice surface prefix', () => {
    const app = new Hono()
    mountSurfaces(app)
    const mounted = app.routes
      .filter((route) => route.method !== 'ALL')
      .map((route) => `${route.method} ${route.path}`)

    expect(mounted).toEqual(
      expect.arrayContaining([
        'GET /backoffice/v1/waitlist/signups',
        'GET /backoffice/v1/waitlist/totals',
        'POST /backoffice/v1/waitlist/signups/:signupId/fraud',
        'POST /backoffice/v1/waitlist/signups/:signupId/fraud/withdrawal',
      ]),
    )
  })

  test('the Backoffice origin may send the command headers, and no other origin may', async () => {
    const preflight = (origin: string) =>
      routes().request(
        new Request(`https://api.example.test/backoffice/v1/waitlist/signups/${SIGNUP_ID}/fraud`, {
          method: 'OPTIONS',
          headers: {
            origin,
            'access-control-request-method': 'POST',
            'access-control-request-headers': 'content-type,idempotency-key,command-id',
          },
        }),
      )

    const allowed = await preflight(ORIGIN)
    expect(allowed.headers.get('access-control-allow-origin')).toBe(ORIGIN)
    expect(allowed.headers.get('access-control-allow-credentials')).toBe('true')
    expect(allowed.headers.get('access-control-allow-headers')).toContain('Idempotency-Key')

    const refused = await preflight('https://elsewhere.example.test')
    expect(refused.headers.get('access-control-allow-origin')).toBeNull()
  })
})

describe('T-WL-API-02 reading the list (OP-WL-011)', () => {
  test('answers a page of sign-ups as the contract shapes it, never cached', async () => {
    const response = await routes().request(get('/signups'))

    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(response.headers.get('referrer-policy')).toBe('no-referrer')
    expect(await response.json()).toEqual({
      data: [signup],
      page: { has_more: true, next_cursor: encodeWaitlistCursor(SIGNUP_ID) },
    })
    expect(calls.list).toHaveLength(1)
    expect(calls.list[0]?.reviewer).toEqual({
      actorPersonId: ACTOR_PERSON_ID,
      actorSessionId: ACTOR_SESSION_ID,
    })
    expect(calls.list[0]?.query.limit).toBe(25)
  })

  test('the last page says so with a null cursor', async () => {
    const review = reviewService({
      list: () => Promise.resolve({ items: [signup], hasMore: false }),
    })

    const response = await routes(review).request(get('/signups'))

    expect(await response.json()).toEqual({
      data: [signup],
      page: { has_more: false, next_cursor: null },
    })
  })

  test('carries the search trimmed, the filter, the limit and the cursor', async () => {
    const cursor = encodeWaitlistCursor(SIGNUP_ID)

    const response = await routes().request(
      get(`/signups?q=%20bruno%20&filter=founding_members&limit=50&cursor=${cursor}`),
    )

    expect(response.status).toBe(200)
    expect(calls.list[0]?.query).toMatchObject({
      query: 'bruno',
      filter: 'founding_members',
      limit: 50,
      beforeId: SIGNUP_ID,
    })
  })

  test.each([
    ['a search of one character', '?q=a'],
    ['a search that is only spaces', '?q=%20%20%20'],
    ['a search longer than an address', `?q=${'a'.repeat(255)}`],
    ['a filter the list does not know', '?filter=everyone'],
    ['a limit of zero', '?limit=0'],
    ['a limit past the page', '?limit=101'],
    ['a limit that is not a number', '?limit=ten'],
    ['a cursor this API did not issue', '?cursor=bm90LWEtY3Vyc29yLWF0LWFsbA'],
    [
      'a cursor that names more than a sign-up',
      `?cursor=${Buffer.from(JSON.stringify({ id: SIGNUP_ID, name: 'x' })).toString('base64url')}`,
    ],
    ['a parameter nobody defined', '?status=confirmed'],
  ])('%s is refused and nothing is read', async (_name, query) => {
    const response = await routes().request(get(`/signups${query}`))

    expect(response.status).toBe(400)
    expect(calls.list).toHaveLength(0)
  })

  test('without a session cookie nothing is read', async () => {
    const response = await routes().request(get('/signups', { cookie: false }))

    expect(response.status).toBe(401)
    expect(calls.list).toHaveLength(0)
  })

  test('a session that is no longer good answers what the session service says', async () => {
    const sessions = sessionService({
      resolveActor: () => Promise.reject(new BackofficeAuthenticationError('unauthenticated')),
    })

    const response = await routes(reviewService(), sessions).request(get('/signups'))

    expect(response.status).toBe(401)
    expect(calls.list).toHaveLength(0)
  })

  test('a person without the commercial duty is refused, and reads nothing', async () => {
    const review = reviewService({ list: () => Promise.reject(databaseError('42501')) })

    const response = await routes(review).request(get('/signups'))

    expect(response.status).toBe(403)
    expect(await response.text()).not.toContain('bruno@example.com')
  })

  test('a failure nobody named is unavailable, not a list', async () => {
    const review = reviewService({ list: () => Promise.reject(new Error('connection lost')) })

    const response = await routes(review).request(get('/signups'))

    expect(response.status).toBe(503)
  })
})

describe('T-WL-API-02 reading the totals (OP-WL-011)', () => {
  test('answers the totals of the whole list', async () => {
    const response = await routes().request(get('/totals'))

    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(await response.json()).toEqual(totals)
    expect(calls.totals).toEqual([
      { actorPersonId: ACTOR_PERSON_ID, actorSessionId: ACTOR_SESSION_ID },
    ])
  })

  test('takes no parameter', async () => {
    const response = await routes().request(get('/totals?filter=confirmed'))

    expect(response.status).toBe(400)
    expect(calls.totals).toHaveLength(0)
  })

  test('without a session cookie nothing is read', async () => {
    const response = await routes().request(get('/totals', { cookie: false }))

    expect(response.status).toBe(401)
    expect(calls.totals).toHaveLength(0)
  })

  test('a person without the commercial duty is refused', async () => {
    const review = reviewService({ totals: () => Promise.reject(databaseError('42501')) })

    const response = await routes(review).request(get('/totals'))

    expect(response.status).toBe(403)
  })
})

describe('T-WL-API-02 marking fraud (OP-WL-012)', () => {
  test('marks with the reason trimmed and answers the sign-up as it now reads', async () => {
    const response = await routes().request(post(JSON.stringify({ reason: `  ${REASON} ` })))

    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(response.headers.get('idempotent-replay')).toBeNull()
    expect(await response.json()).toEqual(marked)
    expect(calls.markAsFraud).toHaveLength(1)
    expect(calls.markAsFraud[0]).toMatchObject({
      reviewer: { actorPersonId: ACTOR_PERSON_ID, actorSessionId: ACTOR_SESSION_ID },
      signupId: SIGNUP_ID,
      mark: { reason: REASON },
    })
  })

  test('a repeated command says it is a replay', async () => {
    const response = await routes(reviewService({}, true)).request(
      post(JSON.stringify({ reason: REASON })),
    )

    expect(response.status).toBe(200)
    expect(response.headers.get('idempotent-replay')).toBe('true')
  })

  test('the request hash is of the reason as it is stored and of the sign-up it names', async () => {
    const other = '019ab000-0000-7000-8000-000000000902'
    await routes().request(post(JSON.stringify({ reason: REASON })))
    await routes().request(post(JSON.stringify({ reason: `  ${REASON}  ` })))
    await routes().request(post(JSON.stringify({ reason: 'Otro motivo distinto' })))
    await routes().request(post(JSON.stringify({ reason: REASON }), {}, other))

    const [first, spaced, reworded, elsewhere] = calls.markAsFraud.map((call) => call.hash)
    expect(first).toHaveLength(64)
    expect(spaced).toBe(first)
    expect(reworded).not.toBe(first)
    expect(elsewhere).not.toBe(first)
  })

  test.each([
    ['no reason', {}],
    ['a blank reason', { reason: '    ' }],
    ['a reason too short to say anything', { reason: 'no' }],
    ['a reason past two hundred characters', { reason: 'a'.repeat(201) }],
    ['a reason over several lines', { reason: 'Correos en serie\nmismo equipo' }],
    ['a reason that is not text', { reason: 42 }],
    ['a field nobody defined', { reason: REASON, founding_number: 1 }],
    ['a list', [REASON]],
  ])('a body with %s is a validation problem and marks nothing', async (_name, body) => {
    const response = await routes().request(post(JSON.stringify(body)))

    expect(response.status).toBe(422)
    expect(calls.markAsFraud).toHaveLength(0)
  })

  test('a body that is not JSON is a validation problem', async () => {
    const response = await routes().request(post('{reason'))

    expect(response.status).toBe(422)
    expect(calls.markAsFraud).toHaveLength(0)
  })

  test('a body of another media type is refused', async () => {
    const response = await routes().request(
      post(JSON.stringify({ reason: REASON }), { 'content-type': 'text/plain' }),
    )

    expect(response.status).toBe(415)
    expect(calls.markAsFraud).toHaveLength(0)
  })

  test('a command from another origin is refused', async () => {
    const response = await routes().request(
      post(JSON.stringify({ reason: REASON }), { origin: 'https://elsewhere.example.test' }),
    )

    expect(response.status).toBe(403)
    expect(calls.markAsFraud).toHaveLength(0)
  })

  test.each([
    ['without an idempotency key', { 'idempotency-key': null }],
    ['with a key that is not a UUIDv4', { 'idempotency-key': COMMAND_ID }],
    ['without a command identifier', { 'command-id': null }],
    ['with a command identifier that is not a UUIDv7', { 'command-id': IDEMPOTENCY_KEY }],
  ])('a command %s is refused', async (_name, headers) => {
    const response = await routes().request(post(JSON.stringify({ reason: REASON }), headers))

    expect(response.status).toBe(400)
    expect(calls.markAsFraud).toHaveLength(0)
  })

  test('a sign-up identifier that is not one is refused', async () => {
    const response = await routes().request(
      post(JSON.stringify({ reason: REASON }), {}, 'not-a-signup'),
    )

    expect(response.status).toBe(400)
    expect(calls.markAsFraud).toHaveLength(0)
  })

  test('without a session cookie nothing is marked', async () => {
    const response = await routes().request(
      post(JSON.stringify({ reason: REASON }), { cookie: null }),
    )

    expect(response.status).toBe(401)
    expect(calls.markAsFraud).toHaveLength(0)
  })

  test.each([
    ['a person without the commercial duty', '42501', 403],
    ['a sign-up that is not on the list', 'P0002', 404],
    ['a sign-up already marked', '55000', 409],
    ['a key used for another request', '23505', 409],
    ['a reason the database refuses', '22023', 422],
  ])('%s answers its own status', async (_name, sqlState, status) => {
    const review = reviewService({
      markAsFraud: () => Promise.reject(databaseError(sqlState)),
    })

    const response = await routes(review).request(post(JSON.stringify({ reason: REASON })))

    expect(response.status).toBe(status)
  })

  test('a command still in progress says when to try again', async () => {
    const review = reviewService({ markAsFraud: () => Promise.reject(databaseError('40001')) })

    const response = await routes(review).request(post(JSON.stringify({ reason: REASON })))

    expect(response.status).toBe(409)
    expect(response.headers.get('retry-after')).toBe('1')
  })
})

describe('T-WL-API-02 taking a fraud mark back (OP-WL-016)', () => {
  test('takes it back with the reason trimmed and answers the sign-up as it now reads', async () => {
    const response = await routes().request(
      withdraw(JSON.stringify({ reason: `  ${WITHDRAWAL_REASON} ` })),
    )

    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(response.headers.get('idempotent-replay')).toBeNull()
    expect(await response.json()).toEqual(unmarked)
    expect(calls.markAsFraud).toHaveLength(0)
    expect(calls.withdrawFraudMark).toHaveLength(1)
    expect(calls.withdrawFraudMark[0]).toMatchObject({
      reviewer: { actorPersonId: ACTOR_PERSON_ID, actorSessionId: ACTOR_SESSION_ID },
      signupId: SIGNUP_ID,
      withdrawal: { reason: WITHDRAWAL_REASON },
    })
  })

  test('a repeated command says it is a replay', async () => {
    const response = await routes(reviewService({}, true)).request(
      withdraw(JSON.stringify({ reason: WITHDRAWAL_REASON })),
    )

    expect(response.status).toBe(200)
    expect(response.headers.get('idempotent-replay')).toBe('true')
  })

  test('the request hash tells a withdrawal from a mark with the same words', async () => {
    await routes().request(post(JSON.stringify({ reason: REASON })))
    await routes().request(withdraw(JSON.stringify({ reason: REASON })))
    await routes().request(withdraw(JSON.stringify({ reason: `  ${REASON}  ` })))

    const [taken, spaced] = calls.withdrawFraudMark.map((call) => call.hash)
    expect(taken).toHaveLength(64)
    expect(taken).not.toBe(calls.markAsFraud[0]?.hash)
    expect(spaced).toBe(taken)
  })

  test.each([
    ['no reason', {}],
    ['a blank reason', { reason: '    ' }],
    ['a reason too short to say anything', { reason: 'no' }],
    ['a reason past two hundred characters', { reason: 'a'.repeat(201) }],
    ['a reason over several lines', { reason: 'Escribió\ny es real' }],
    ['a reason that is not text', { reason: 42 }],
    ['a field nobody defined', { reason: WITHDRAWAL_REASON, founding_number: 2 }],
    ['a list', [WITHDRAWAL_REASON]],
  ])('a body with %s is a validation problem and takes nothing back', async (_name, body) => {
    const response = await routes().request(withdraw(JSON.stringify(body)))

    expect(response.status).toBe(422)
    expect(calls.withdrawFraudMark).toHaveLength(0)
  })

  test('a body of another media type is refused', async () => {
    const response = await routes().request(
      withdraw(JSON.stringify({ reason: WITHDRAWAL_REASON }), { 'content-type': 'text/plain' }),
    )

    expect(response.status).toBe(415)
    expect(calls.withdrawFraudMark).toHaveLength(0)
  })

  test('a command from another origin is refused', async () => {
    const response = await routes().request(
      withdraw(JSON.stringify({ reason: WITHDRAWAL_REASON }), {
        origin: 'https://elsewhere.example.test',
      }),
    )

    expect(response.status).toBe(403)
    expect(calls.withdrawFraudMark).toHaveLength(0)
  })

  test.each([
    ['without an idempotency key', { 'idempotency-key': null }],
    ['with a key that is not a UUIDv4', { 'idempotency-key': COMMAND_ID }],
    ['without a command identifier', { 'command-id': null }],
    ['with a command identifier that is not a UUIDv7', { 'command-id': IDEMPOTENCY_KEY }],
  ])('a command %s is refused', async (_name, headers) => {
    const response = await routes().request(
      withdraw(JSON.stringify({ reason: WITHDRAWAL_REASON }), headers),
    )

    expect(response.status).toBe(400)
    expect(calls.withdrawFraudMark).toHaveLength(0)
  })

  test('a sign-up identifier that is not one is refused', async () => {
    const response = await routes().request(
      withdraw(JSON.stringify({ reason: WITHDRAWAL_REASON }), {}, 'not-a-signup'),
    )

    expect(response.status).toBe(400)
    expect(calls.withdrawFraudMark).toHaveLength(0)
  })

  test('without a session cookie nothing is taken back', async () => {
    const response = await routes().request(
      withdraw(JSON.stringify({ reason: WITHDRAWAL_REASON }), { cookie: null }),
    )

    expect(response.status).toBe(401)
    expect(calls.withdrawFraudMark).toHaveLength(0)
  })

  test.each([
    ['a person without the commercial duty', '42501', 403],
    ['a sign-up that is not on the list', 'P0002', 404],
    ['a sign-up that is not marked', '55000', 409],
    ['a key used for another request', '23505', 409],
    ['a reason the database refuses', '22023', 422],
  ])('%s answers its own status', async (_name, sqlState, status) => {
    const review = reviewService({
      withdrawFraudMark: () => Promise.reject(databaseError(sqlState)),
    })

    const response = await routes(review).request(
      withdraw(JSON.stringify({ reason: WITHDRAWAL_REASON })),
    )

    expect(response.status).toBe(status)
  })

  test('a command still in progress says when to try again', async () => {
    const review = reviewService({
      withdrawFraudMark: () => Promise.reject(databaseError('40001')),
    })

    const response = await routes(review).request(
      withdraw(JSON.stringify({ reason: WITHDRAWAL_REASON })),
    )

    expect(response.status).toBe(409)
    expect(response.headers.get('retry-after')).toBe('1')
  })
})
