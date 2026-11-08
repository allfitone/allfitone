/**
 * `/studio/v1/organizations/{organizationId}/clients/{personId}/nutrition/…`: a client's
 * meals, days and goals, read by the coach who attends her, and the goals he proposes
 * for her to decide (HU-STUDIO-068..072).
 *
 * Whom the caller attends, what she shares, his capability and credential, and the access
 * record are PostgreSQL's answers. This route checks the shape of the request, carries the
 * coach through and translates the answer: nothing shared names the category it would
 * take, and a client the coach does not attend is simply not there.
 *
 * A photo is streamed by the API itself (`x-allfit-media-url-policy.studio_professional`):
 * no redirect, no signed address, both shares rechecked and the access recorded on every
 * request, and one 404 for anything short of a photo she shares.
 *
 * The session, origin, command and failure helpers repeat execution's on purpose: one
 * domain does not reach into another's handlers, and the request hash must be computed
 * the same way. CORS is the surface's, declared once in `surfaces.ts`.
 */

import { createHash, randomUUID } from 'node:crypto'

import { ObjectStoreError } from '@allfitone/object-store'
import { Hono, type Context } from 'hono'
import { getCookie } from 'hono/cookie'

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
import type {
  InstantCursor,
  ProfessionalGoalCreate,
  StudioNutritionService,
} from '../application/studio.js'
import { studioNutritionService } from '../dependencies.js'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const UUID_V7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const DAY = /^\d{4}-\d{2}-\d{2}$/
const DAY_MS = 86_400_000
const CLIENT = '/organizations/:organizationId/clients/:personId/nutrition'
const TARGET_FIELDS = ['nutrient_code', 'mode', 'minimum', 'maximum', 'exact', 'unit'] as const
const MODES = ['minimum', 'maximum', 'range', 'exact']

export function studioNutritionRoutes(
  injectedNutrition?: StudioNutritionService,
  injectedSessions?: StudioSessionService,
): Hono {
  const studioOrigin = new URL(trustedStudioWebUrl()).origin
  const nutrition = () => injectedNutrition ?? studioNutritionService()
  const sessions = () => injectedSessions ?? studioSessionService()
  const routes = new Hono()

  routes.use('/organizations/:organizationId/clients/:personId/nutrition/*', async (c, next) => {
    await next()
    c.header('Vary', 'Origin')
    if (c.res.status >= 400) c.header('Cache-Control', 'no-store')
  })

  // `OP-NUT-009`.
  routes.get(`${CLIENT}/meals`, async (c) => {
    const ids = clientPath(c, studioOrigin)
    if (ids instanceof Response) return ids
    const range = parseRange(c)
    const pagination = parsePagination(c)
    if (!range || !pagination) return problem(c, 'validation-failed')
    try {
      const actor = await studioActor(c, sessions)
      if (actor instanceof Response) return actor
      const read = await nutrition().meals({
        ...actor,
        ...ids,
        ...range,
        ...pagination,
        requestId: randomUUID(),
      })
      if (read.outcome === 'scope_required') return failScopeRequired(c, read.requiredScope)
      // What she shares under a live grant: never kept to decide access later.
      c.header('Cache-Control', 'private, no-store')
      return c.json({
        applied_scope: read.value.appliedScope,
        photo_scope: read.value.photoScope,
        data: read.value.items,
        page: {
          has_more: read.value.hasMore,
          next_cursor: read.value.nextCursor ? encodeCursor(read.value.nextCursor) : null,
        },
      })
    } catch (error) {
      return operationFailure(c, error)
    }
  })

  // `OP-NUT-013`.
  routes.get(`${CLIENT}/meals/:mealId/photo`, async (c) => {
    const ids = clientPath(c, studioOrigin)
    if (ids instanceof Response) return ids
    const mealId = c.req.param('mealId')
    if (!mealId || !UUID.test(mealId)) return problem(c, 'invalid-request')
    try {
      const actor = await studioActor(c, sessions)
      if (actor instanceof Response) return actor
      const image = await nutrition().mealPhoto({
        ...actor,
        ...ids,
        mealId,
        requestId: randomUUID(),
      })
      if (!image) return problem(c, 'not-found')
      // Every photo was sanitised to JPEG when she kept it; the store's own label is not trusted.
      return c.body(new Uint8Array(image.bytes), 200, {
        'Content-Type': 'image/jpeg',
        'Cache-Control': 'private, no-store',
        'Content-Disposition': 'inline',
        'X-Content-Type-Options': 'nosniff',
      })
    } catch (error) {
      if (error instanceof ObjectStoreError) return problem(c, 'upstream-unavailable')
      // A refusal says no more than a missing photo would.
      const code = databaseErrorCode(error)
      if (code === 'not-found' || code === 'forbidden') return problem(c, 'not-found')
      return operationFailure(c, error)
    }
  })

  // `OP-NUT-010`.
  routes.get(`${CLIENT}/daily-summaries`, async (c) => {
    const ids = clientPath(c, studioOrigin)
    if (ids instanceof Response) return ids
    const range = parseRange(c)
    if (!range) return problem(c, 'validation-failed')
    try {
      const actor = await studioActor(c, sessions)
      if (actor instanceof Response) return actor
      const read = await nutrition().dailySummaries({
        ...actor,
        ...ids,
        ...range,
        requestId: randomUUID(),
      })
      if (read.outcome === 'scope_required') return failScopeRequired(c, read.requiredScope)
      c.header('Cache-Control', 'private, no-store')
      return c.json({ applied_scope: read.value.appliedScope, data: read.value.days })
    } catch (error) {
      return operationFailure(c, error)
    }
  })

  // `OP-NUT-011`.
  routes.get(`${CLIENT}/goals/versions`, async (c) => {
    const ids = clientPath(c, studioOrigin)
    if (ids instanceof Response) return ids
    const pagination = parsePagination(c)
    if (!pagination) return problem(c, 'validation-failed')
    try {
      const actor = await studioActor(c, sessions)
      if (actor instanceof Response) return actor
      const read = await nutrition().goalVersions({
        ...actor,
        ...ids,
        ...pagination,
        requestId: randomUUID(),
      })
      if (read.outcome === 'scope_required') return failScopeRequired(c, read.requiredScope)
      c.header('Cache-Control', 'private, no-store')
      return c.json({
        applied_scope: read.value.appliedScope,
        data: read.value.items,
        page: {
          has_more: read.value.hasMore,
          next_cursor: read.value.nextCursor ? encodeCursor(read.value.nextCursor) : null,
        },
        active: read.value.active,
      })
    } catch (error) {
      return operationFailure(c, error)
    }
  })

  // `OP-NUT-012`.
  routes.post(`${CLIENT}/goals/versions`, async (c) => {
    const ids = clientPath(c, studioOrigin)
    if (ids instanceof Response) return ids
    const payload = await jsonPayload(c)
    if (payload instanceof Response) return payload
    const body = payload.value
    if (!isGoalBody(body)) return problem(c, 'validation-failed')
    const command = commandContext(c, { ...ids, body })
    if (!command) return problem(c, 'invalid-request', 'valid command headers are required')
    try {
      const actor = await studioActor(c, sessions)
      if (actor instanceof Response) return actor
      const result = await nutrition().proposeGoal({
        ...actor,
        ...ids,
        rationale: body.rationale,
        targets: body.targets,
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

function calendarDay(value: string | undefined): number | undefined {
  if (!value || !DAY.test(value)) return undefined
  const parsed = new Date(`${value}T00:00:00Z`)
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value)
    return undefined
  return parsed.getTime()
}

// Her local days, both ends included: at most thirty-one, as PostgreSQL also holds.
function parseRange(c: Context) {
  const from = c.req.query('from')
  const to = c.req.query('to')
  const start = calendarDay(from)
  const end = calendarDay(to)
  if (!from || !to || start === undefined || end === undefined) return undefined
  return end >= start && end - start <= 30 * DAY_MS ? { from, to } : undefined
}

function parsePagination(c: Context): { limit: number; cursor?: InstantCursor } | undefined {
  const rawLimit = c.req.query('limit') ?? '25'
  if (!/^[1-9][0-9]*$/.test(rawLimit) || Number(rawLimit) > 100) return undefined
  const limit = Number(rawLimit)
  const rawCursor = c.req.query('cursor')
  if (!rawCursor) return { limit }
  const cursor = decodeCursor(rawCursor)
  return cursor ? { limit, cursor } : undefined
}

function encodeCursor(cursor: InstantCursor): string {
  return Buffer.from(JSON.stringify(cursor)).toString('base64url')
}

function decodeCursor(raw: string): InstantCursor | undefined {
  if (raw.length > 1024 || !/^[A-Za-z0-9_-]+$/.test(raw)) return undefined
  try {
    const parsed: unknown = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'))
    if (!isObject(parsed) || !hasOnly(parsed, ['at', 'id'])) return undefined
    const { at, id } = parsed
    if (typeof at !== 'string' || Number.isNaN(Date.parse(at))) return undefined
    return typeof id === 'string' && UUID.test(id) ? { at, id } : undefined
  } catch {
    return undefined
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function hasOnly(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return Object.keys(value).every((key) => keys.includes(key))
}

function isAmount(value: unknown): boolean {
  return value === null || (typeof value === 'number' && Number.isFinite(value) && value >= 0)
}

// A target is a nutrient and its bounds, nothing else; PostgreSQL checks the rest.
function isTarget(value: unknown): boolean {
  return (
    isObject(value) &&
    hasOnly(value, TARGET_FIELDS) &&
    TARGET_FIELDS.every((field) => field in value) &&
    typeof value.nutrient_code === 'string' &&
    typeof value.mode === 'string' &&
    MODES.includes(value.mode) &&
    typeof value.unit === 'string' &&
    isAmount(value.minimum) &&
    isAmount(value.maximum) &&
    isAmount(value.exact)
  )
}

function isGoalBody(value: unknown): value is ProfessionalGoalCreate {
  return (
    isObject(value) &&
    hasOnly(value, ['rationale', 'targets']) &&
    typeof value.rationale === 'string' &&
    /\S/.test(value.rationale) &&
    [...value.rationale].length <= 2000 &&
    Array.isArray(value.targets) &&
    value.targets.length >= 1 &&
    value.targets.length <= 6 &&
    value.targets.every(isTarget)
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
  if (code === 'validation-failed') return validationProblem(c, error)
  if (code === 'idempotency-in-progress') c.header('Retry-After', '1')
  if (code) return problem(c, code)
  console.error('[studio-nutrition] operation failed')
  return problem(c, 'upstream-unavailable')
}

function databaseErrorCode(error: unknown): ApiErrorCode | undefined {
  if (!isObject(error)) return undefined
  const sqlState = typeof error.code === 'string' ? error.code : undefined
  // Not attending her and no such client read the same.
  if (sqlState === 'P0002') return 'not-found'
  if (sqlState === '42501') return 'forbidden'
  // Proposing needs a verified nutrition credential in force (STUDIO-64).
  if (sqlState === 'AF431') return 'credential-required'
  if (sqlState === '22023' || sqlState === '22P02' || sqlState === '23514') {
    return 'validation-failed'
  }
  if (sqlState === '23505' || sqlState === 'P0004') return 'conflict'
  if (sqlState === '40001') return 'idempotency-in-progress'
  if (sqlState === 'AF424') return 'service-paused'
  return undefined
}

const FIELD_PATHS: Record<string, string> = {
  rationale: '/rationale',
  targets: '/targets',
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

function jsonDetail(error: unknown): unknown {
  if (!isObject(error) || typeof error.detail !== 'string') return undefined
  try {
    const parsed: unknown = JSON.parse(error.detail)
    return parsed
  } catch {
    return undefined
  }
}
