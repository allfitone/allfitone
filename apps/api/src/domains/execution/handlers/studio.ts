/**
 * `/studio/v1/organizations/{organizationId}/clients/{personId}/executions`: what a
 * client trained, read by the coach who attends her (HU-STUDIO-054, HU-STUDIO-055).
 *
 * Whom the caller attends, what the client shares and what she hid are PostgreSQL's
 * answers, and so is the access record, written before anything comes back. This route
 * checks the shape of the request, carries the coach through, and translates the
 * answer: a list with nothing shared is empty, a detail with nothing shared names the
 * scope, and a session the coach may not see is simply not there.
 */

import { randomUUID } from 'node:crypto'

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
import { failScopeRequired, problem } from '../../../platform/http/index.js'
import type { StudioExecutionReviewService } from '../application/index.js'
import { studioExecutionReviewService } from '../dependencies.js'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export function studioExecutionRoutes(
  injectedReview?: StudioExecutionReviewService,
  injectedSessions?: StudioSessionService,
): Hono {
  const studioOrigin = new URL(trustedStudioWebUrl()).origin
  const review = () => injectedReview ?? studioExecutionReviewService()
  const sessions = () => injectedSessions ?? studioSessionService()
  const routes = new Hono()

  routes.use(
    '/organizations/:organizationId/clients/*',
    cors({
      origin: studioOrigin,
      credentials: true,
      allowMethods: ['GET', 'OPTIONS'],
      allowHeaders: ['Content-Type'],
      exposeHeaders: ['Retry-After', 'Server-Timing'],
      maxAge: 600,
    }),
  )
  routes.use('/organizations/:organizationId/clients/*', async (c, next) => {
    await next()
    c.header('Vary', 'Origin')
    if (c.res.status >= 400) c.header('Cache-Control', 'no-store')
  })

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

function operationFailure(c: Context, error: unknown) {
  if (error instanceof StudioSessionError) return problem(c, error.code)
  const sqlState =
    typeof error === 'object' && error !== null && 'code' in error && typeof error.code === 'string'
      ? error.code
      : undefined
  // Not attending her and no such client read the same.
  if (sqlState === 'P0002') return problem(c, 'not-found')
  if (sqlState === '42501') return problem(c, 'forbidden')
  if (sqlState === '22023' || sqlState === '22P02') return problem(c, 'validation-failed')
  console.error('[studio-execution] operation failed')
  return problem(c, 'upstream-unavailable')
}
