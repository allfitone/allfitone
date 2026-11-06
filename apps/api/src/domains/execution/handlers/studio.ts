/**
 * `/studio/v1/organizations/{organizationId}/clients/{personId}/…`: what a client trained
 * and how it is going, read by the coach who attends her (HU-STUDIO-054..056), and the
 * observations he leaves on a session and corrects (HU-STUDIO-057, HU-STUDIO-058).
 *
 * Whom the caller attends, what the client shares and what she hid are PostgreSQL's
 * answers, and so is the access record, written before anything comes back. This route
 * checks the shape of the request, carries the coach through, and translates the
 * answer: a list with nothing shared is empty, a detail with nothing shared names the
 * scope, and a session the coach may not see is simply not there.
 *
 * The command helpers repeat planning's on purpose: one domain does not reach into
 * another's handlers, and the request hash must be computed the same way here.
 */

import { createHash, randomUUID } from 'node:crypto'

import { Hono, type Context } from 'hono'
import { getCookie } from 'hono/cookie'
import { cors } from 'hono/cors'

import {
  STUDIO_SESSION_COOKIE,
  StudioSessionError,
  studioSessionService,
  trustedStudioWebUrl,
  type StudioSessionService,
} from '../../identity/index.js'
import {
  failScopeRequired,
  problem,
  requiredScope,
  type ApiErrorCode,
} from '../../../platform/http/index.js'
import type { ProfessionalObservation, StudioExecutionReviewService } from '../application/index.js'
import { studioExecutionReviewService } from '../dependencies.js'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const UUID_V7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const IANA_TIME_ZONE = /^(?:UTC|[A-Za-z_]+(?:\/[A-Za-z0-9_+-]+)+)$/
const CATEGORIES: ReadonlyArray<ProfessionalObservation['category']> = ['training', 'health']
const PROVENANCES: ReadonlyArray<ProfessionalObservation['provenance']> = [
  'professional_observation',
  'person_declared',
]

export function studioExecutionRoutes(
  injectedReview?: StudioExecutionReviewService,
  injectedSessions?: StudioSessionService,
): Hono {
  const studioOrigin = new URL(trustedStudioWebUrl()).origin
  const review = () => injectedReview ?? studioExecutionReviewService()
  const sessions = () => injectedSessions ?? studioSessionService()
  const routes = new Hono()

  for (const prefix of [
    '/organizations/:organizationId/clients/*',
    '/organizations/:organizationId/observations/*',
  ]) {
    routes.use(
      prefix,
      cors({
        origin: studioOrigin,
        credentials: true,
        allowMethods: ['GET', 'POST', 'OPTIONS'],
        allowHeaders: ['Content-Type', 'Idempotency-Key', 'Command-Id'],
        exposeHeaders: ['Idempotent-Replay', 'Retry-After', 'Server-Timing'],
        maxAge: 600,
      }),
    )
    routes.use(prefix, async (c, next) => {
      await next()
      c.header('Vary', 'Origin')
      if (c.res.status >= 400) c.header('Cache-Control', 'no-store')
    })
  }

  // `OP-EXE-017`.
  routes.get('/organizations/:organizationId/clients/:personId/executions', async (c) => {
    const ids = clientPath(c, studioOrigin)
    if (ids instanceof Response) return ids
    const pagination = parsePagination(c)
    if (!pagination) return problem(c, 'validation-failed')
    try {
      const actor = await studioActor(c, sessions)
      if (actor instanceof Response) return actor
      const page = await review().list({
        personId: actor.personId,
        ...ids,
        requestId: randomUUID(),
        ...pagination,
      })
      // Her training under a live grant: never kept to decide access later.
      c.header('Cache-Control', 'private, no-store')
      return c.json({
        data: page.items,
        page: {
          has_more: page.hasMore,
          next_cursor: page.nextCursor
            ? Buffer.from(JSON.stringify(page.nextCursor)).toString('base64url')
            : null,
        },
      })
    } catch (error) {
      return operationFailure(c, error)
    }
  })

  // `OP-EXE-018`.
  routes.get(
    '/organizations/:organizationId/clients/:personId/executions/:executionId',
    async (c) => {
      const ids = clientPath(c, studioOrigin)
      if (ids instanceof Response) return ids
      const executionId = c.req.param('executionId')
      if (!executionId || !UUID.test(executionId)) return problem(c, 'invalid-request')
      try {
        const actor = await studioActor(c, sessions)
        if (actor instanceof Response) return actor
        const read = await review().read({
          personId: actor.personId,
          ...ids,
          executionId,
          requestId: randomUUID(),
        })
        if (read.outcome === 'scope_required') return failScopeRequired(c, read.requiredScope)
        if (read.outcome === 'not_found') return problem(c, 'not-found')
        c.header('Cache-Control', 'private, no-store')
        return c.json(read.execution)
      } catch (error) {
        return operationFailure(c, error)
      }
    },
  )

  // `OP-EXE-019`.
  routes.get('/organizations/:organizationId/clients/:personId/progress', async (c) => {
    const ids = clientPath(c, studioOrigin)
    if (ids instanceof Response) return ids
    const window = parseWindow(c)
    if (!window) return problem(c, 'validation-failed')
    try {
      const actor = await studioActor(c, sessions)
      if (actor instanceof Response) return actor
      const read = await review().progress({
        personId: actor.personId,
        ...ids,
        ...window,
        requestId: randomUUID(),
      })
      if (read.outcome === 'scope_required') return failScopeRequired(c, read.requiredScope)
      c.header('Cache-Control', 'private, no-store')
      return c.json(read.progress)
    } catch (error) {
      return operationFailure(c, error)
    }
  })

  // `OP-EXE-010`.
  routes.post('/organizations/:organizationId/clients/:personId/observations', async (c) => {
    const ids = clientPath(c, studioOrigin)
    if (ids instanceof Response) return ids
    const payload = await jsonPayload(c)
    if (payload instanceof Response) return payload
    const body = payload.value
    if (!isObservationBody(body)) return problem(c, 'validation-failed')
    const command = commandContext(c, { ...ids, body })
    if (!command) return problem(c, 'invalid-request')
    try {
      const actor = await studioActor(c, sessions)
      if (actor instanceof Response) return actor
      const result = await review().observe({
        personId: actor.personId,
        ...ids,
        executionId: body.execution_id,
        category: body.category,
        provenance: body.provenance,
        content: body.content,
        ...command,
      })
      c.header('Cache-Control', 'no-store')
      if (result.replayed) c.header('Idempotent-Replay', 'true')
      return c.json(result.resource, 201)
    } catch (error) {
      return operationFailure(c, error)
    }
  })

  // `OP-EXE-011`.
  routes.post('/organizations/:organizationId/observations/:observationId/revisions', async (c) => {
    if (c.req.header('origin') !== studioOrigin) return problem(c, 'forbidden')
    const organizationId = c.req.param('organizationId')
    const observationId = c.req.param('observationId')
    if (
      !organizationId ||
      !UUID.test(organizationId) ||
      !observationId ||
      !UUID.test(observationId)
    ) {
      return problem(c, 'invalid-request')
    }
    const payload = await jsonPayload(c)
    if (payload instanceof Response) return payload
    const body = payload.value
    if (!isRevisionBody(body)) return problem(c, 'validation-failed')
    const command = commandContext(c, { organizationId, observationId, body })
    if (!command) return problem(c, 'invalid-request')
    try {
      const actor = await studioActor(c, sessions)
      if (actor instanceof Response) return actor
      const result = await review().reviseObservation({
        personId: actor.personId,
        organizationId,
        observationId,
        expectedRevision: body.expected_revision,
        content: body.content,
        reason: body.reason,
        ...command,
      })
      c.header('Cache-Control', 'no-store')
      if (result.replayed) c.header('Idempotent-Replay', 'true')
      return c.json(result.resource, 201)
    } catch (error) {
      return operationFailure(c, error)
    }
  })

  return routes
}

function clientPath(c: Context, origin: string) {
  if (c.req.header('origin') !== origin) return problem(c, 'forbidden')
  const organizationId = c.req.param('organizationId')
  const subjectPersonId = c.req.param('personId')
  return organizationId &&
    UUID.test(organizationId) &&
    subjectPersonId &&
    UUID.test(subjectPersonId)
    ? { organizationId, subjectPersonId }
    : problem(c, 'invalid-request')
}

async function studioActor(c: Context, sessions: () => StudioSessionService) {
  const token = getCookie(c, STUDIO_SESSION_COOKIE)
  if (!token) return problem(c, 'unauthenticated', 'missing session cookie')
  try {
    const actor = await sessions().resolveActor(token)
    return actor.personId ? { personId: actor.personId } : problem(c, 'registration-incomplete')
  } catch (error) {
    if (error instanceof StudioSessionError) return problem(c, error.code)
    throw error
  }
}

function parsePagination(c: Context) {
  const rawLimit = c.req.query('limit') ?? '25'
  if (!/^[1-9][0-9]*$/.test(rawLimit) || Number(rawLimit) > 100) return undefined
  const limit = Number(rawLimit)
  const rawCursor = c.req.query('cursor')
  if (!rawCursor) return { limit }
  try {
    const parsed: unknown = JSON.parse(Buffer.from(rawCursor, 'base64url').toString('utf8'))
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      !('startedAt' in parsed) ||
      !('id' in parsed) ||
      typeof parsed.startedAt !== 'string' ||
      Number.isNaN(Date.parse(parsed.startedAt)) ||
      typeof parsed.id !== 'string' ||
      !UUID.test(parsed.id)
    ) {
      return undefined
    }
    return { limit, cursor: { startedAt: parsed.startedAt, id: parsed.id } }
  } catch {
    return undefined
  }
}

function parseWindow(c: Context) {
  const timezone = c.req.query('timezone')
  const period = c.req.query('period')
  const count = c.req.query('count')
  if (!timezone || !IANA_TIME_ZONE.test(timezone)) return undefined
  if (period !== 'week' && period !== 'month') return undefined
  if (!count || !/^[1-9][0-9]?$/.test(count) || Number(count) > 12) return undefined
  return { timezone, period, count: Number(count) } as const
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function hasOnly(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return Object.keys(value).every((key) => keys.includes(key))
}

function isText(value: unknown, max: number): value is string {
  return typeof value === 'string' && value.length > 0 && [...value].length <= max
}

function isObservationBody(value: unknown): value is {
  execution_id: string
  category: ProfessionalObservation['category']
  provenance: ProfessionalObservation['provenance']
  content: string
} {
  return (
    isObject(value) &&
    hasOnly(value, ['execution_id', 'category', 'provenance', 'content']) &&
    typeof value.execution_id === 'string' &&
    UUID.test(value.execution_id) &&
    CATEGORIES.some((category) => category === value.category) &&
    PROVENANCES.some((provenance) => provenance === value.provenance) &&
    isText(value.content, 2000)
  )
}

function isRevisionBody(
  value: unknown,
): value is { expected_revision: number; content: string; reason: string } {
  return (
    isObject(value) &&
    hasOnly(value, ['expected_revision', 'content', 'reason']) &&
    typeof value.expected_revision === 'number' &&
    Number.isSafeInteger(value.expected_revision) &&
    value.expected_revision >= 1 &&
    isText(value.content, 2000) &&
    isText(value.reason, 500)
  )
}

/** Commands that declare a request body: the canonical media type is mandatory. */
async function jsonPayload(c: Context): Promise<{ value: unknown } | Response> {
  if (c.req.header('content-type')?.trim().toLowerCase() !== 'application/json') {
    return problem(c, 'unsupported-media-type')
  }
  try {
    return { value: await c.req.json<unknown>() }
  } catch {
    return { value: undefined }
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
    // Only the inputs the command consumes feed the hash, so one command keeps one receipt.
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

function operationFailure(c: Context, error: unknown) {
  if (error instanceof StudioSessionError) return problem(c, error.code)
  const scope = requiredScope(error)
  if (scope) return failScopeRequired(c, scope)
  const code = databaseErrorCode(error)
  if (code === 'stale-draft') return staleProblem(c, error)
  if (code === 'validation-failed') return validationProblem(c, error)
  if (code === 'idempotency-in-progress') c.header('Retry-After', '1')
  if (code) return problem(c, code)
  console.error('[studio-execution] operation failed')
  return problem(c, 'upstream-unavailable')
}

function databaseErrorCode(error: unknown): ApiErrorCode | undefined {
  if (!isObject(error)) return undefined
  const sqlState = typeof error.code === 'string' ? error.code : undefined
  const message = typeof error.message === 'string' ? error.message : ''
  // Not attending her and no such client read the same.
  if (sqlState === 'P0002') return 'not-found'
  if (sqlState === '42501') return 'forbidden'
  if (sqlState === '22023' || sqlState === '22P02' || sqlState === '23514') {
    return 'validation-failed'
  }
  if (sqlState === '23505') return 'conflict'
  if (sqlState === '40001') {
    return message.includes('stale-draft') ? 'stale-draft' : 'idempotency-in-progress'
  }
  if (sqlState === 'AF424') return 'service-paused'
  return undefined
}

const FIELD_PATHS: Record<string, string> = {
  execution: '/execution_id',
  category: '/category',
  provenance: '/provenance',
  content: '/content',
  reason: '/reason',
  expected_revision: '/expected_revision',
}

function validationProblem(c: Context, error: unknown) {
  const codes = jsonDetail(error)
  if (!Array.isArray(codes) || !codes.every((code) => typeof code === 'string')) {
    return problem(c, 'validation-failed')
  }
  return c.json(
    {
      type: 'https://errors.allfit.invalid/validation-failed',
      title: 'The request failed validation',
      status: 422,
      request_id: randomUUID(),
      errors: codes.slice(0, 100).map((code) => ({
        code,
        path: FIELD_PATHS[code] ?? '',
        message: `The ${code.replaceAll('_', ' ')} is not valid.`,
      })),
    },
    422,
    { 'Content-Type': 'application/problem+json' },
  )
}

function staleProblem(c: Context, error: unknown) {
  const currentState = jsonDetail(error)
  return c.json(
    {
      type: 'https://errors.allfit.invalid/stale-draft',
      title: 'The observation changed since it was read',
      status: 409,
      request_id: randomUUID(),
      ...(currentState === undefined ? {} : { current_state: currentState }),
    },
    409,
    { 'Content-Type': 'application/problem+json' },
  )
}

function jsonDetail(error: unknown): unknown {
  if (!isObject(error) || typeof error.detail !== 'string') return undefined
  try {
    const parsed: unknown = JSON.parse(error.detail)
    return parsed
  } catch {
    return undefined
  }
}
