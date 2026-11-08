/**
 * `/studio/v1/organizations/{organizationId}/historical-access-cases` and
 * `/studio/v1/organizations/{organizationId}/historical-relationships/{relationshipId}/…`:
 * the historical access case (HU-STUDIO-061..063).
 *
 * A manager opens a time-boxed case over a relationship the organization ended, lists
 * and closes cases, and the member it authorizes reads what the person left readable
 * at the cut. PostgreSQL decides every rule and writes the access record before it
 * answers, including the recent sign-in, which it checks against this request's access
 * session. This route checks shapes, carries the member and that session, and maps the
 * answer. A case the caller may not use reads exactly like one that does not exist.
 *
 * The command and cursor helpers repeat execution's on purpose: one domain does not
 * reach into another's handlers, and the request hash must be computed the same way.
 */

import { createHash, randomUUID } from 'node:crypto'

import { Hono, type Context } from 'hono'
import { getCookie } from 'hono/cookie'

import {
  STUDIO_SESSION_COOKIE,
  StudioSessionError,
  studioSessionService,
  trustedStudioWebUrl,
  type StudioSessionService,
} from '../../identity/index.js'
import { failScopeRequired, problem, type ApiErrorCode } from '../../../platform/http/index.js'
import type { HistoricalAccessService } from '../application/historical-access.js'
import { historicalAccessService } from '../dependencies.js'
import {
  HISTORICAL_ACCESS_PURPOSES,
  type FrozenRead,
  type FrozenTarget,
  type HistoricalAccessActor,
  type HistoricalAccessPurpose,
} from '../domain/historical-access.js'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const UUID_V7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const DAY = /^\d{4}-\d{2}-\d{2}$/
const CASE_HEADER = 'x-historical-access-case'
const CREATE_FIELDS = [
  'relationship_id',
  'authorized_membership_id',
  'purpose',
  'case_reference',
  'justification',
  'duration_hours',
] as const

export function studioHistoricalAccessRoutes(
  injectedService?: HistoricalAccessService,
  injectedSessions?: StudioSessionService,
): Hono {
  const studioOrigin = new URL(trustedStudioWebUrl()).origin
  const cases = () => injectedService ?? historicalAccessService()
  const sessions = () => injectedSessions ?? studioSessionService()
  const routes = new Hono()

  for (const prefix of [
    '/organizations/:organizationId/historical-access-cases',
    '/organizations/:organizationId/historical-access-cases/*',
    '/organizations/:organizationId/historical-relationships/*',
  ]) {
    routes.use(prefix, async (c, next) => {
      await next()
      c.header('Vary', 'Origin')
      if (c.res.status >= 400) c.header('Cache-Control', 'no-store')
    })
  }

  // `OP-PRV-018`.
  routes.post('/organizations/:organizationId/historical-access-cases', async (c) => {
    const organizationId = organizationPath(c, studioOrigin)
    if (organizationId instanceof Response) return organizationId
    const payload = await jsonPayload(c)
    if (payload instanceof Response) return payload
    if (!isCreateBody(payload.value)) return problem(c, 'validation-failed')
    const body = payload.value
    const command = commandContext(c, body)
    if (!command) return problem(c, 'invalid-request', 'valid command headers are required')
    try {
      const actor = await studioActor(c, sessions)
      if (actor instanceof Response) return actor
      const result = await cases().open(actor, {
        organizationId,
        relationshipId: body.relationship_id,
        authorizedMembershipId: body.authorized_membership_id,
        purpose: body.purpose,
        caseReference: body.case_reference,
        justification: body.justification,
        durationHours: body.duration_hours,
        ...command,
      })
      c.header('Cache-Control', 'no-store')
      if (result.replayed) c.header('Idempotent-Replay', 'true')
      return c.json(result.resource, 201)
    } catch (error) {
      return failure(c, error)
    }
  })

  // `OP-PRV-025`.
  routes.get('/organizations/:organizationId/historical-access-cases', async (c) => {
    const organizationId = organizationPath(c, studioOrigin)
    if (organizationId instanceof Response) return organizationId
    const relationshipId = c.req.query('relationship_id')
    if (relationshipId !== undefined && !UUID.test(relationshipId)) {
      return problem(c, 'invalid-request')
    }
    const pagination = parsePagination(c, decodeCaseCursor)
    if (!pagination) return problem(c, 'invalid-request')
    try {
      const actor = await studioActor(c, sessions)
      if (actor instanceof Response) return actor
      const page = await cases().list(actor, {
        organizationId,
        ...(relationshipId ? { relationshipId } : {}),
        ...pagination,
      })
      c.header('Cache-Control', 'private, no-store')
      return c.json({
        data: page.items,
        page: {
          has_more: page.hasMore,
          next_cursor: page.nextCursor ? encodeCursor(page.nextCursor) : null,
        },
      })
    } catch (error) {
      return failure(c, error)
    }
  })

  // `OP-PRV-019`.
  routes.post(
    '/organizations/:organizationId/historical-access-cases/:caseId/closure',
    async (c) => {
      const organizationId = organizationPath(c, studioOrigin)
      if (organizationId instanceof Response) return organizationId
      const caseId = c.req.param('caseId')
      if (!caseId || !UUID.test(caseId)) return problem(c, 'invalid-request')
      const command = commandContext(c, null)
      if (!command) return problem(c, 'invalid-request', 'valid command headers are required')
      try {
        const actor = await studioActor(c, sessions)
        if (actor instanceof Response) return actor
        const result = await cases().close(actor, { organizationId, caseId, ...command })
        c.header('Cache-Control', 'no-store')
        if (result.replayed) c.header('Idempotent-Replay', 'true')
        return c.json(result.resource, 200)
      } catch (error) {
        return failure(c, error)
      }
    },
  )

  // `OP-PRV-020`: the relationship as the case froze it.
  routes.get(
    '/organizations/:organizationId/historical-relationships/:relationshipId',
    async (c) => {
      const target = frozenTarget(c, studioOrigin)
      if (target instanceof Response) return target
      try {
        const actor = await studioActor(c, sessions)
        if (actor instanceof Response) return actor
        return answer(c, await cases().readRelationship(actor, target), (value) => value)
      } catch (error) {
        return failure(c, error)
      }
    },
  )

  // `OP-PRV-020`: her frozen sessions.
  routes.get(
    '/organizations/:organizationId/historical-relationships/:relationshipId/executions',
    async (c) => {
      const target = frozenTarget(c, studioOrigin)
      if (target instanceof Response) return target
      const pagination = parsePagination(c, decodeExecutionCursor)
      if (!pagination) return problem(c, 'invalid-request')
      try {
        const actor = await studioActor(c, sessions)
        if (actor instanceof Response) return actor
        const read = await cases().listExecutions(actor, target, pagination)
        return answer(c, read, (page) => ({
          data: page.items,
          page: {
            has_more: page.hasMore,
            next_cursor: page.nextCursor ? encodeCursor(page.nextCursor) : null,
          },
        }))
      } catch (error) {
        return failure(c, error)
      }
    },
  )

  // `OP-PRV-020`: one frozen session.
  routes.get(
    '/organizations/:organizationId/historical-relationships/:relationshipId/executions/:executionId',
    async (c) => {
      const target = frozenTarget(c, studioOrigin)
      if (target instanceof Response) return target
      const executionId = c.req.param('executionId')
      if (!executionId || !UUID.test(executionId)) return problem(c, 'invalid-request')
      try {
        const actor = await studioActor(c, sessions)
        if (actor instanceof Response) return actor
        const read = await cases().readExecution(actor, target, executionId)
        return answer(c, read, (execution) => execution)
      } catch (error) {
        return failure(c, error)
      }
    },
  )

  // `OP-PRV-020`: her frozen measurements.
  routes.get(
    '/organizations/:organizationId/historical-relationships/:relationshipId/body-progress',
    async (c) => {
      const target = frozenTarget(c, studioOrigin)
      if (target instanceof Response) return target
      const pagination = parsePagination(c, decodeBodyCursor)
      if (!pagination) return problem(c, 'invalid-request')
      try {
        const actor = await studioActor(c, sessions)
        if (actor instanceof Response) return actor
        const read = await cases().listBodyProgress(actor, target, pagination)
        return answer(c, read, (page) => ({
          applied_scope: page.appliedScope,
          data: page.items,
          page: {
            has_more: page.hasMore,
            next_cursor: page.nextCursor ? encodeCursor(page.nextCursor) : null,
          },
        }))
      } catch (error) {
        return failure(c, error)
      }
    },
  )

  return routes
}

function organizationPath(c: Context, origin: string): string | Response {
  if (c.req.header('origin') !== origin) return problem(c, 'forbidden')
  const organizationId = c.req.param('organizationId')
  return organizationId && UUID.test(organizationId)
    ? organizationId
    : problem(c, 'invalid-request')
}

function frozenTarget(c: Context, origin: string): FrozenTarget | Response {
  const organizationId = organizationPath(c, origin)
  if (organizationId instanceof Response) return organizationId
  const relationshipId = c.req.param('relationshipId')
  const caseId = c.req.header(CASE_HEADER)
  if (!relationshipId || !UUID.test(relationshipId) || !caseId || !UUID.test(caseId)) {
    return problem(
      c,
      'invalid-request',
      'a relationship and an X-Historical-Access-Case are required',
    )
  }
  return { organizationId, relationshipId, caseId, requestId: randomUUID() }
}

// A step-up asks about this request's access session, so a session that cannot name it fails.
async function studioActor(
  c: Context,
  sessions: () => StudioSessionService,
): Promise<HistoricalAccessActor | Response> {
  const token = getCookie(c, STUDIO_SESSION_COOKIE)
  if (!token) return problem(c, 'unauthenticated', 'missing session cookie')
  try {
    const actor = await sessions().resolveActor(token)
    if (!actor.personId) return problem(c, 'registration-incomplete')
    if (!actor.sessionId) return problem(c, 'unauthenticated')
    return { personId: actor.personId, sessionId: actor.sessionId }
  } catch (error) {
    if (error instanceof StudioSessionError) return problem(c, error.code)
    throw error
  }
}

// Everything read through a case is personal data held for an exception: never kept.
function answer<T>(c: Context, read: FrozenRead<T>, present: (value: T) => unknown) {
  if (read.outcome === 'not_found') return problem(c, 'not-found')
  if (read.outcome === 'scope_required') return failScopeRequired(c, read.requiredScope)
  c.header('Cache-Control', 'private, no-store')
  return c.json(present(read.value))
}

function parsePagination<Cursor>(
  c: Context,
  decode: (raw: string) => Cursor | undefined,
): { limit: number; cursor?: Cursor } | undefined {
  const rawLimit = c.req.query('limit') ?? '25'
  if (!/^[1-9][0-9]*$/.test(rawLimit) || Number(rawLimit) > 100) return undefined
  const limit = Number(rawLimit)
  const rawCursor = c.req.query('cursor')
  if (!rawCursor) return { limit }
  const cursor = decode(rawCursor)
  return cursor ? { limit, cursor } : undefined
}

function encodeCursor(cursor: object): string {
  return Buffer.from(JSON.stringify(cursor)).toString('base64url')
}

function readCursor(raw: string): Record<string, unknown> | undefined {
  if (raw.length > 1024 || !/^[A-Za-z0-9_-]+$/.test(raw)) return undefined
  try {
    const parsed: unknown = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'))
    return isObject(parsed) && typeof parsed.id === 'string' && UUID.test(parsed.id)
      ? parsed
      : undefined
  } catch {
    return undefined
  }
}

function instant(value: unknown): value is string {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value))
}

function decodeCaseCursor(raw: string) {
  const cursor = readCursor(raw)
  return cursor && instant(cursor.openedAt)
    ? { openedAt: cursor.openedAt, id: String(cursor.id) }
    : undefined
}

function decodeExecutionCursor(raw: string) {
  const cursor = readCursor(raw)
  return cursor && instant(cursor.startedAt)
    ? { startedAt: cursor.startedAt, id: String(cursor.id) }
    : undefined
}

function decodeBodyCursor(raw: string) {
  const cursor = readCursor(raw)
  return cursor && typeof cursor.measuredOn === 'string' && DAY.test(cursor.measuredOn)
    ? { measuredOn: cursor.measuredOn, id: String(cursor.id) }
    : undefined
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isText(value: unknown, max: number): value is string {
  return typeof value === 'string' && value.trim().length > 0 && [...value].length <= max
}

function isCreateBody(value: unknown): value is {
  relationship_id: string
  authorized_membership_id: string
  purpose: HistoricalAccessPurpose
  case_reference: string
  justification: string
  duration_hours: number
} {
  return (
    isObject(value) &&
    Object.keys(value).every((key) => (CREATE_FIELDS as readonly string[]).includes(key)) &&
    typeof value.relationship_id === 'string' &&
    UUID.test(value.relationship_id) &&
    typeof value.authorized_membership_id === 'string' &&
    UUID.test(value.authorized_membership_id) &&
    HISTORICAL_ACCESS_PURPOSES.some((purpose) => purpose === value.purpose) &&
    isText(value.case_reference, 120) &&
    isText(value.justification, 2000) &&
    typeof value.duration_hours === 'number' &&
    Number.isSafeInteger(value.duration_hours) &&
    value.duration_hours >= 1 &&
    value.duration_hours <= 24
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

function failure(c: Context, error: unknown) {
  if (error instanceof StudioSessionError) return problem(c, error.code)
  const code = databaseErrorCode(error)
  if (code === 'idempotency-in-progress') c.header('Retry-After', '1')
  if (code) return problem(c, code)
  console.error('[studio-historical-access] operation failed')
  return problem(c, 'upstream-unavailable')
}

function databaseErrorCode(error: unknown): ApiErrorCode | undefined {
  if (!isObject(error)) return undefined
  const sqlState = typeof error.code === 'string' ? error.code : undefined
  // The sign-in is older than the window PostgreSQL holds; the client signs in again.
  if (sqlState === 'AF401') return 'reauthentication-required'
  if (sqlState === '42501') return 'forbidden'
  // Not this organization's ended relationship, or not a case the caller may close.
  if (sqlState === 'P0002') return 'not-found'
  // An equivalent case already open, a key reused, or nothing left frozen to open.
  if (sqlState === '23505' || sqlState === 'P0004') return 'conflict'
  if (
    sqlState === '22023' ||
    sqlState === '22P02' ||
    sqlState === '23514' ||
    sqlState === '23503'
  ) {
    return 'validation-failed'
  }
  if (sqlState === '40001') return 'idempotency-in-progress'
  return undefined
}
