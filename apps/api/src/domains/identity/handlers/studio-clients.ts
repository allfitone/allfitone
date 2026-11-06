/**
 * `/studio/v1/organizations/{organizationId}/clients/{personId}/…`: what a client shares
 * about herself, read by the coach who attends her (HU-STUDIO-051..053).
 *
 * Whom the caller attends, which category she shares, which fields its version carries
 * and the access record are PostgreSQL's answers. This route checks the shape of the
 * request, carries the coach through and translates the answer: nothing shared names the
 * category it would take, and a client the coach does not attend is simply not there.
 *
 * A photo is streamed by the API itself (`x-allfit-media-url-policy.studio_professional`):
 * no redirect, no signed address, rechecked and recorded on every request, and 404 for
 * anything short of a photo she shows. The page asks for it with a credentialed fetch,
 * so a link copied elsewhere opens nothing.
 *
 * The session, origin and failure helpers repeat the ones in the execution review on
 * purpose: each domain's handlers are its own, and these two will diverge as they grow.
 */

import { randomUUID } from 'node:crypto'

import { ObjectStoreError } from '@allfitone/object-store'
import { Hono, type Context } from 'hono'
import { getCookie } from 'hono/cookie'
import { cors } from 'hono/cors'

import { failScopeRequired, problem } from '../../../platform/http/index.js'
import { StudioSessionError, type StudioSessionService } from '../application/index.js'
import type {
  ClientCursor,
  ClientPage,
  ClientPageQuery,
  ClientRead,
  StudioClientDataService,
} from '../application/studio-client-data.js'
import {
  studioClientDataService,
  studioSessionService,
  trustedStudioWebUrl,
} from '../dependencies.js'
import { STUDIO_SESSION_COOKIE } from './studio.js'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const DAY = /^\d{4}-\d{2}-\d{2}$/
const CLIENT = '/organizations/:organizationId/clients/:personId'

type Key = 'day' | 'instant'
type ClientList = (input: ClientPageQuery) => Promise<ClientRead<ClientPage<unknown>>>

export function studioClientDataRoutes(
  injectedData?: StudioClientDataService,
  injectedSessions?: StudioSessionService,
): Hono {
  const studioOrigin = new URL(trustedStudioWebUrl()).origin
  const data = () => injectedData ?? studioClientDataService()
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

  // `OP-IDN-018`.
  routes.get(`${CLIENT}/profile`, async (c) => {
    const ids = clientPath(c, studioOrigin)
    if (ids instanceof Response) return ids
    try {
      const actor = await studioActor(c, sessions)
      if (actor instanceof Response) return actor
      const read = await data().profile({ ...actor, ...ids, requestId: randomUUID() })
      if (read.outcome === 'scope_required') return failScopeRequired(c, read.requiredScope)
      c.header('Cache-Control', 'private, no-store')
      return c.json(read.value)
    } catch (error) {
      return operationFailure(c, error)
    }
  })

  const list =
    (key: Key, read: (service: StudioClientDataService) => ClientList) => async (c: Context) => {
      const ids = clientPath(c, studioOrigin)
      if (ids instanceof Response) return ids
      const pagination = parsePagination(c, key)
      if (!pagination) return problem(c, 'validation-failed')
      try {
        const actor = await studioActor(c, sessions)
        if (actor instanceof Response) return actor
        const answer = await read(data())({
          ...actor,
          ...ids,
          requestId: randomUUID(),
          ...pagination,
        })
        if (answer.outcome === 'scope_required') return failScopeRequired(c, answer.requiredScope)
        // What she shares under a live grant: never kept to decide access later.
        c.header('Cache-Control', 'private, no-store')
        return c.json({
          applied_scope: answer.value.appliedScope,
          data: answer.value.items,
          page: {
            has_more: answer.value.hasMore,
            next_cursor: answer.value.nextCursor ? encodeCursor(answer.value.nextCursor) : null,
          },
        })
      } catch (error) {
        return operationFailure(c, error)
      }
    }

  // `OP-IDN-019`, `OP-IDN-059` and `OP-IDN-020`.
  routes.get(
    `${CLIENT}/body-progress`,
    list('day', (service) => service.bodyProgress),
  )
  routes.get(
    `${CLIENT}/body-photos`,
    list('day', (service) => service.bodyPhotos),
  )
  routes.get(
    `${CLIENT}/health-context`,
    list('instant', (service) => service.healthContext),
  )

  // `OP-IDN-060`.
  routes.get(`${CLIENT}/body-photos/:photoId/content`, async (c) => {
    const ids = clientPath(c, studioOrigin)
    if (ids instanceof Response) return ids
    const photoId = c.req.param('photoId')
    if (!photoId || !UUID.test(photoId)) return problem(c, 'invalid-request')
    try {
      const actor = await studioActor(c, sessions)
      if (actor instanceof Response) return actor
      const image = await data().bodyPhotoContent({
        ...actor,
        ...ids,
        photoId,
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

function encodeCursor(cursor: ClientCursor): string {
  return Buffer.from(JSON.stringify(cursor)).toString('base64url')
}

function parsePagination(c: Context, key: Key) {
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
      !('key' in parsed) ||
      !('id' in parsed) ||
      typeof parsed.key !== 'string' ||
      !validKey(parsed.key, key) ||
      typeof parsed.id !== 'string' ||
      !UUID.test(parsed.id)
    ) {
      return undefined
    }
    return { limit, cursor: { key: parsed.key, id: parsed.id } }
  } catch {
    return undefined
  }
}

function validKey(value: string, key: Key): boolean {
  if (key === 'instant') return !Number.isNaN(Date.parse(value))
  if (!DAY.test(value)) return false
  const parsed = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
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
  console.error('[studio-client-data] operation failed')
  return problem(c, 'upstream-unavailable')
}
