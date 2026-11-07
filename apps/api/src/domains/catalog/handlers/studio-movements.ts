/**
 * `/studio/v1/organizations/{organizationId}/movements…` — a gym's own movements
 * (HU-STUDIO-064..067, `OP-CAT-001/002/003/009/010`).
 *
 * Who may create, edit, archive or search, which name a published version has frozen,
 * and what another organization owns are PostgreSQL's answers. This route checks the
 * shape of the request, carries the member and the command through, and translates the
 * answer. The template editor needs to know which conflict it hit — a taken name, a
 * frozen movement, an archived one — so those travel as `errors[].code` on a `conflict`,
 * and an old revision is `stale-draft`, as for every other revisioned write.
 *
 * Everything answers `private, no-store`: the library is the organization's, and a
 * cached page would offer a movement somebody archived.
 *
 * The command helpers repeat planning's on purpose: one domain does not reach into
 * another's handlers, and the request hash must be computed the same way here.
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
import { problem } from '../../../platform/http/index.js'
import type { OrganizationMovementService } from '../application/organization-movements.js'
import { organizationMovementService } from '../dependencies.js'
import {
  MovementCursorError,
  type OrganizationMovementChanges,
  type OrganizationMovementCreate,
} from '../domain/index.js'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const UUID_V7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const CACHE_CONTROL = 'private, no-store'
const RELATIONS = ['variant', 'regression', 'progression']
const CHANGE_FIELDS = ['discipline_code', 'name', 'aliases', 'equipment', 'variant']
const MAX_QUERY = 120
const MAX_DISCIPLINE = 64
const MIN_CURSOR = 16
const MAX_CURSOR = 1024
// The unique index on a name within the organization, as opposed to a reused idempotency key.
const NAME_INDEX = 'uidx_movements_organization_name'
const NAMED_CONFLICTS = ['movement-in-use', 'movement-archived']

export function studioMovementRoutes(
  injectedMovements?: OrganizationMovementService,
  injectedSessions?: StudioSessionService,
): Hono {
  const studioOrigin = new URL(trustedStudioWebUrl()).origin
  const movements = () => injectedMovements ?? organizationMovementService()
  const sessions = () => injectedSessions ?? studioSessionService()
  const routes = new Hono()

  for (const prefix of [
    '/organizations/:organizationId/movements',
    '/organizations/:organizationId/movements/*',
  ]) {
    routes.use(prefix, async (c, next) => {
      await next()
      c.header('Vary', 'Origin')
      if (c.res.status >= 400) c.header('Cache-Control', 'no-store')
    })
  }

  // `OP-CAT-009`.
  routes.get('/organizations/:organizationId/movements', async (c) => {
    const organizationId = organization(c, studioOrigin)
    if (organizationId instanceof Response) return organizationId
    const filters = searchFilters(c)
    if (!filters) return problem(c, 'invalid-request')
    try {
      const actor = await studioActor(c, sessions)
      if (actor instanceof Response) return actor
      const page = await movements().search({ ...actor, organizationId, ...filters })
      c.header('Cache-Control', CACHE_CONTROL)
      return c.json(page)
    } catch (error) {
      return operationFailure(c, error)
    }
  })

  // `OP-CAT-001`.
  routes.post('/organizations/:organizationId/movements', async (c) => {
    const organizationId = organization(c, studioOrigin)
    if (organizationId instanceof Response) return organizationId
    const payload = await jsonPayload(c)
    if (payload instanceof Response) return payload
    const command = commandContext(c, payload.value)
    if (!command) return problem(c, 'invalid-request')
    if (!isCreateBody(payload.value)) return problem(c, 'validation-failed')
    const movement = payload.value
    try {
      const actor = await studioActor(c, sessions)
      if (actor instanceof Response) return actor
      const result = await movements().create({ ...actor, organizationId, ...command, movement })
      c.header('Cache-Control', CACHE_CONTROL)
      c.header(
        'Location',
        `/studio/v1/organizations/${organizationId}/movements/${result.resource.id}`,
      )
      if (result.replayed) c.header('Idempotent-Replay', 'true')
      return c.json(result.resource, 201)
    } catch (error) {
      return operationFailure(c, error)
    }
  })

  // `OP-CAT-010`.
  routes.get('/organizations/:organizationId/movements/:movementId', async (c) => {
    const ids = movementPath(c, studioOrigin)
    if (ids instanceof Response) return ids
    try {
      const actor = await studioActor(c, sessions)
      if (actor instanceof Response) return actor
      const movement = await movements().read({ ...actor, ...ids })
      // Another organization's and one that does not exist answer the same.
      if (!movement) return problem(c, 'not-found')
      c.header('Cache-Control', CACHE_CONTROL)
      return c.json(movement)
    } catch (error) {
      return operationFailure(c, error)
    }
  })

  // `OP-CAT-002`.
  routes.patch('/organizations/:organizationId/movements/:movementId', async (c) => {
    const ids = movementPath(c, studioOrigin)
    if (ids instanceof Response) return ids
    const payload = await jsonPayload(c)
    if (payload instanceof Response) return payload
    const command = commandContext(c, payload.value)
    if (!command) return problem(c, 'invalid-request')
    if (!isUpdateBody(payload.value)) return problem(c, 'validation-failed')
    const { expected_revision: expectedRevision, ...changes } = payload.value
    try {
      const actor = await studioActor(c, sessions)
      if (actor instanceof Response) return actor
      const result = await movements().update({
        ...actor,
        ...ids,
        ...command,
        expectedRevision,
        changes,
      })
      c.header('Cache-Control', CACHE_CONTROL)
      if (result.replayed) c.header('Idempotent-Replay', 'true')
      return c.json(result.resource)
    } catch (error) {
      return operationFailure(c, error)
    }
  })

  // `OP-CAT-003`.
  routes.post('/organizations/:organizationId/movements/:movementId/archival', async (c) => {
    const ids = movementPath(c, studioOrigin)
    if (ids instanceof Response) return ids
    if ((await c.req.text()).trim()) return problem(c, 'unsupported-media-type')
    const command = commandContext(c, null)
    if (!command) return problem(c, 'invalid-request')
    try {
      const actor = await studioActor(c, sessions)
      if (actor instanceof Response) return actor
      const result = await movements().archive({ ...actor, ...ids, ...command })
      c.header('Cache-Control', CACHE_CONTROL)
      if (result.replayed) c.header('Idempotent-Replay', 'true')
      return c.json(result.resource)
    } catch (error) {
      return operationFailure(c, error)
    }
  })

  return routes
}

function organization(c: Context, origin: string): string | Response {
  if (c.req.header('origin') !== origin) return problem(c, 'forbidden')
  const organizationId = c.req.param('organizationId')
  return organizationId && UUID.test(organizationId)
    ? organizationId
    : problem(c, 'invalid-request')
}

function movementPath(c: Context, origin: string) {
  const organizationId = organization(c, origin)
  if (organizationId instanceof Response) return organizationId
  const movementId = c.req.param('movementId')
  return movementId && UUID.test(movementId)
    ? { organizationId, movementId }
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

/** Undefined is a refusal: a malformed filter is a bad request, not an empty one. */
function searchFilters(c: Context) {
  const rawQuery = c.req.query('q')
  const rawDiscipline = c.req.query('discipline')
  if ((rawQuery?.length ?? 0) > MAX_QUERY || (rawDiscipline?.length ?? 0) > MAX_DISCIPLINE) {
    return undefined
  }
  const rawArchived = c.req.query('include_archived')
  if (rawArchived !== undefined && rawArchived !== 'true' && rawArchived !== 'false') {
    return undefined
  }
  const rawLimit = c.req.query('limit') ?? '25'
  if (!/^[1-9][0-9]*$/.test(rawLimit) || Number(rawLimit) > 100) return undefined
  const cursor = c.req.query('cursor') ?? null
  if (cursor !== null && (cursor.length < MIN_CURSOR || cursor.length > MAX_CURSOR)) {
    return undefined
  }
  return {
    query: blankAsNull(rawQuery),
    discipline: blankAsNull(rawDiscipline),
    includeArchived: rawArchived === 'true',
    limit: Number(rawLimit),
    cursor,
  }
}

function blankAsNull(value: string | undefined): string | null {
  const text = (value ?? '').trim()
  return text === '' ? null : text
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

function isTextList(value: unknown, maxItems: number, maxLength: number): value is string[] {
  return (
    Array.isArray(value) &&
    value.length <= maxItems &&
    value.every((item) => isText(item, maxLength))
  )
}

function isVariant(value: unknown): boolean {
  return (
    value === null ||
    (isObject(value) &&
      hasOnly(value, ['movement_id', 'relation', 'note']) &&
      typeof value.movement_id === 'string' &&
      UUID.test(value.movement_id) &&
      RELATIONS.some((relation) => relation === value.relation) &&
      (value.note === undefined || value.note === null || isText(value.note, 200)))
  )
}

/** The fields both commands share, each valid when present. */
function hasValidFields(value: Record<string, unknown>): boolean {
  return (
    (value.discipline_code === undefined || isText(value.discipline_code, 64)) &&
    (value.name === undefined || isText(value.name, 120)) &&
    (value.aliases === undefined || isTextList(value.aliases, 10, 120)) &&
    (value.equipment === undefined || isTextList(value.equipment, 16, 64)) &&
    (value.variant === undefined || isVariant(value.variant))
  )
}

function isCreateBody(value: unknown): value is OrganizationMovementCreate {
  return (
    isObject(value) &&
    hasOnly(value, CHANGE_FIELDS) &&
    value.discipline_code !== undefined &&
    value.name !== undefined &&
    hasValidFields(value)
  )
}

function isUpdateBody(
  value: unknown,
): value is OrganizationMovementChanges & { expected_revision: number } {
  return (
    isObject(value) &&
    hasOnly(value, ['expected_revision', ...CHANGE_FIELDS]) &&
    typeof value.expected_revision === 'number' &&
    Number.isSafeInteger(value.expected_revision) &&
    value.expected_revision >= 1 &&
    Object.keys(value).length >= 2 &&
    hasValidFields(value)
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
  if (error instanceof MovementCursorError) return problem(c, 'invalid-request')
  if (!isObject(error) || typeof error.code !== 'string') return outage(c)
  const message = typeof error.message === 'string' ? error.message : ''
  switch (error.code) {
    case 'P0002':
      return problem(c, 'not-found')
    case '42501':
      return problem(c, 'forbidden')
    case '22023':
    case '22P02':
    case '23514':
      return validationProblem(c, error.detail)
    case '23505':
      return error.constraint_name === NAME_INDEX
        ? conflictProblem(
            c,
            'name-taken',
            '/name',
            'The organization already has a movement by this name.',
          )
        : problem(c, 'conflict')
    case '55000':
      return NAMED_CONFLICTS.includes(message)
        ? conflictProblem(c, message, '', `The movement cannot change: ${message}.`)
        : problem(c, 'conflict')
    case '40001':
      if (message === 'stale-movement') return problem(c, 'stale-draft')
      c.header('Retry-After', '1')
      return problem(c, 'idempotency-in-progress')
    default:
      return outage(c)
  }
}

function outage(c: Context) {
  console.error('[studio-movements] operation failed')
  return problem(c, 'upstream-unavailable')
}

const FIELD_PATHS: Record<string, string> = {
  discipline_code: '/discipline_code',
  name: '/name',
  aliases: '/aliases',
  equipment: '/equipment',
  variant: '/variant',
  expected_revision: '/expected_revision',
}

function validationProblem(c: Context, detail: unknown) {
  const codes = jsonList(detail)
  if (!codes) return problem(c, 'validation-failed')
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

function conflictProblem(c: Context, code: string, path: string, message: string) {
  return c.json(
    {
      type: 'https://errors.allfit.invalid/conflict',
      title: 'The request conflicts with current state',
      status: 409,
      request_id: randomUUID(),
      errors: [{ code, path, message }],
    },
    409,
    { 'Content-Type': 'application/problem+json' },
  )
}

function jsonList(detail: unknown): string[] | undefined {
  if (typeof detail !== 'string') return undefined
  try {
    const parsed: unknown = JSON.parse(detail)
    return Array.isArray(parsed) && parsed.every((code) => typeof code === 'string')
      ? parsed
      : undefined
  } catch {
    return undefined
  }
}
