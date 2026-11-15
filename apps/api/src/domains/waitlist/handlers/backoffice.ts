/**
 * Backoffice waitlist routes: `OP-WL-011` and `OP-WL-012` (`HU-BO-035`).
 *
 * The handler shapes and rejects; it decides nothing. The commercial duty, AAL2, what a
 * fraud mark changes and who takes a freed Founding Member number are resolved inside
 * each call's own transaction.
 *
 * Every filter that cannot be read is answered 400 rather than dropped. Dropping a
 * one-letter search or an unknown filter would widen the question into "show me
 * everything", and a malformed cursor silently restarting at the first page would make
 * a caller think it had reached the end.
 *
 * The fraud body carries `reason` and nothing else.
 */

import { createHash, randomUUID } from 'node:crypto'
import { Hono, type Context } from 'hono'
import { getCookie } from 'hono/cookie'
import { cors } from 'hono/cors'

import {
  BACKOFFICE_SESSION_COOKIE,
  BackofficeAuthenticationError,
  backofficeAuthenticationService,
  trustedBackofficeWebUrl,
  type BackofficeAuthenticationService,
} from '../../identity/index.js'
import { problem, type ApiErrorCode } from '../../../platform/http/index.js'
import type { WaitlistReviewService } from '../application/review.js'
import { waitlistReviewService } from '../dependencies.js'
import {
  MAX_WAITLIST_SEARCH_LENGTH,
  MIN_WAITLIST_SEARCH_LENGTH,
  WAITLIST_SIGNUP_FILTERS,
  decodeWaitlistCursor,
  fraudReason,
  type BackofficeWaitlistFraudMark,
  type WaitlistSignupFilter,
  type WaitlistSignupQuery,
} from '../domain/review.js'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const UUID_V7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const MAX_PAGE = 100
const DEFAULT_PAGE = 25

export function backofficeWaitlistRoutes(
  injectedReview?: WaitlistReviewService,
  injectedSessions?: BackofficeAuthenticationService,
): Hono {
  const origin = new URL(trustedBackofficeWebUrl()).origin
  const review = () => injectedReview ?? waitlistReviewService()
  const sessions = () => injectedSessions ?? backofficeAuthenticationService()
  const routes = new Hono()

  // Scoped to its own paths: a `*` here would answer for every Backoffice route mounted
  // after this one.
  routes.use(
    '/waitlist/*',
    cors({
      origin,
      credentials: true,
      allowMethods: ['GET', 'POST', 'OPTIONS'],
      allowHeaders: ['Content-Type', 'Idempotency-Key', 'Command-Id'],
      exposeHeaders: ['Idempotent-Replay', 'Retry-After', 'Server-Timing'],
      maxAge: 600,
    }),
  )
  routes.use('/waitlist/*', async (c, next) => {
    await next()
    c.header('Cache-Control', 'no-store')
    c.header('Referrer-Policy', 'no-referrer')
  })

  routes.get('/waitlist/signups', async (c) => {
    const query = signupQuery(c)
    if (!query) return problem(c, 'invalid-request')
    try {
      const actor = await backofficeActor(c, sessions())
      if (actor instanceof Response) return actor
      const page = await review().list(
        { actorPersonId: actor.personId, actorSessionId: actor.sessionId },
        query,
      )
      return c.json({
        data: page.items,
        page: { has_more: page.hasMore, next_cursor: page.nextCursor ?? null },
      })
    } catch (error) {
      return operationFailure(c, error)
    }
  })

  routes.get('/waitlist/totals', async (c) => {
    if (Object.keys(c.req.query()).length > 0) return problem(c, 'invalid-request')
    try {
      const actor = await backofficeActor(c, sessions())
      if (actor instanceof Response) return actor
      const totals = await review().totals(
        { actorPersonId: actor.personId, actorSessionId: actor.sessionId },
        randomUUID(),
      )
      return c.json(totals)
    } catch (error) {
      return operationFailure(c, error)
    }
  })

  routes.post('/waitlist/signups/:signupId/fraud', async (c) => {
    const signupId = c.req.param('signupId')
    const body = await commandBody(c, origin)
    if (body instanceof Response) return body
    if (!UUID.test(signupId)) return problem(c, 'invalid-request')
    const mark = fraudMark(body)
    if (!mark) return problem(c, 'validation-failed')
    const command = commandContext(c, mark)
    if (!command) return problem(c, 'invalid-request')
    try {
      const actor = await backofficeActor(c, sessions())
      if (actor instanceof Response) return actor
      const result = await review().markAsFraud(
        { actorPersonId: actor.personId, actorSessionId: actor.sessionId },
        { ...command, signupId, mark },
      )
      if (result.replayed) c.header('Idempotent-Replay', 'true')
      return c.json(result.resource)
    } catch (error) {
      return operationFailure(c, error)
    }
  })

  return routes
}

function signupQuery(c: Context): WaitlistSignupQuery | undefined {
  const allowed = new Set(['q', 'filter', 'limit', 'cursor'])
  const raw = c.req.query()
  if (Object.keys(raw).some((key) => !allowed.has(key))) return undefined

  const query: WaitlistSignupQuery = { requestId: randomUUID(), limit: DEFAULT_PAGE }

  const search = raw['q']
  if (search !== undefined) {
    const trimmed = search.trim()
    const length = [...trimmed].length
    if (length < MIN_WAITLIST_SEARCH_LENGTH || length > MAX_WAITLIST_SEARCH_LENGTH) {
      return undefined
    }
    query.query = trimmed
  }

  const filter = raw['filter']
  if (filter !== undefined) {
    if (!WAITLIST_SIGNUP_FILTERS.includes(filter as WaitlistSignupFilter)) return undefined
    query.filter = filter as WaitlistSignupFilter
  }

  const limit = raw['limit']
  if (limit !== undefined) {
    if (!/^[1-9][0-9]{0,2}$/.test(limit) || Number(limit) > MAX_PAGE) return undefined
    query.limit = Number(limit)
  }

  const cursor = raw['cursor']
  if (cursor !== undefined) {
    const beforeId = decodeWaitlistCursor(cursor)
    if (!beforeId) return undefined
    query.beforeId = beforeId
  }

  return query
}

/**
 * The shape is checked here to answer 422 instead of a database error. The database
 * checks it again and is the authority.
 */
function fraudMark(body: unknown): BackofficeWaitlistFraudMark | undefined {
  if (!isObject(body) || Object.keys(body).some((key) => key !== 'reason')) return undefined
  const reason = fraudReason(body['reason'])
  return reason === undefined ? undefined : { reason }
}

async function commandBody(c: Context, origin: string): Promise<unknown> {
  if (c.req.header('origin') !== origin) return problem(c, 'forbidden')
  if (c.req.header('content-type')?.trim().toLowerCase() !== 'application/json') {
    return problem(c, 'unsupported-media-type')
  }
  try {
    return await c.req.json<unknown>()
  } catch {
    return problem(c, 'validation-failed')
  }
}

function commandContext(c: Context, request: unknown) {
  const idempotencyKey = c.req.header('idempotency-key')
  const commandId = c.req.header('command-id')
  if (!idempotencyKey || !UUID_V4.test(idempotencyKey) || !commandId || !UUID_V7.test(commandId)) {
    return undefined
  }
  return {
    idempotencyKey,
    commandId,
    requestId: randomUUID(),
    requestHash: createHash('sha256')
      .update(
        JSON.stringify(
          canonicalJson({
            method: c.req.method.toUpperCase(),
            path: c.req.path,
            resource: request,
          }),
        ),
      )
      .digest(),
  }
}

function canonicalJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalJson)
  if (!isObject(value)) return value
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => [key, canonicalJson(child)]),
  )
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

async function backofficeActor(c: Context, sessions: BackofficeAuthenticationService) {
  const token = getCookie(c, BACKOFFICE_SESSION_COOKIE)
  if (!token) return problem(c, 'unauthenticated', 'missing session cookie')
  try {
    return await sessions.resolveActor(token)
  } catch (error) {
    if (error instanceof BackofficeAuthenticationError) return problem(c, error.code)
    throw error
  }
}

function operationFailure(c: Context, error: unknown) {
  if (error instanceof BackofficeAuthenticationError) return problem(c, error.code)
  const code = databaseErrorCode(error)
  if (code === 'idempotency-in-progress') c.header('Retry-After', '1')
  if (code) return problem(c, code)
  console.error('[backoffice-waitlist] operation failed')
  return problem(c, 'upstream-unavailable')
}

function databaseErrorCode(error: unknown): ApiErrorCode | undefined {
  if (!isObject(error)) return undefined
  const sqlState = typeof error['code'] === 'string' ? error['code'] : undefined
  if (sqlState === '42501') return 'forbidden'
  if (sqlState === 'P0002') return 'not-found'
  if (sqlState === '22023' || sqlState === '23514') return 'validation-failed'
  // 55000 is a sign-up already marked; 23505 an idempotency key reused for another request.
  if (sqlState === '55000' || sqlState === '23505') return 'conflict'
  if (sqlState === '40001') return 'idempotency-in-progress'
  return undefined
}
