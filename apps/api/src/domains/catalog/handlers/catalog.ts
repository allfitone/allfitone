/**
 * The global catalogue as the web products read it: `OP-CAT-007`, `OP-CAT-008`,
 * `OP-CAT-012` and `OP-PRV-022`.
 *
 * The content is global — no subject, no tenant — but a browser only proves who
 * is reading with its product's session cookie, and that cookie is scoped to its
 * surface: `/backoffice/v1` or `/studio/v1`. These reads once lived on
 * `/catalog/v1`, where neither cookie travels, so every one of them answered 401
 * in production. They are served inside each product surface instead, mounted on
 * a `catalog/` sub-prefix so their middleware stays theirs. `/catalog/v1` keeps
 * the reads Space makes with a bearer token (`movements.ts`).
 *
 * Each router reads its own cookie and nothing else, so a browser that has signed
 * into both products can no longer be read as the wrong one. Only the reads a
 * product uses are mounted on it: Backoffice publishes result contracts, and
 * Studio shows a member what they may ask a client for.
 *
 * It is still not public. The operation sheets require any authenticated
 * account, and the closed database functions refuse a caller that is not an
 * active person, so an abandoned session stops reading the moment the person is
 * closed.
 *
 * Every read answers uncached and never 304: the callers are browsers reading
 * across origins, and a 304 reached them without `Access-Control-Allow-Origin`
 * although the application sets it, so the browser blocked the revalidation.
 * Backoffice answers `no-store` like the rest of its surface; Studio keeps
 * `private, no-store`.
 */

import { Hono, type Context } from 'hono'
import { getCookie } from 'hono/cookie'
import { cors } from 'hono/cors'

import {
  BACKOFFICE_SESSION_COOKIE,
  BackofficeAuthenticationError,
  backofficeAuthenticationService,
  STUDIO_SESSION_COOKIE,
  StudioSessionError,
  studioSessionService,
  trustedBackofficeWebUrl,
  type BackofficeAuthenticationService,
  type StudioSessionService,
} from '../../identity/index.js'
import { problem, type ApiErrorCode } from '../../../platform/http/index.js'
import type { GlobalCatalogService } from '../application/index.js'
import { globalCatalogService } from '../dependencies.js'
import type { CatalogReader } from '../domain/index.js'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

type ReaderOf = (c: Context) => Promise<CatalogReader | Response>

/** Mounted at `/backoffice/v1/catalog`. */
export function backofficeCatalogReadRoutes(
  injectedCatalog?: GlobalCatalogService,
  injectedSessions?: BackofficeAuthenticationService,
): Hono {
  const catalog = () => injectedCatalog ?? globalCatalogService()
  const sessions = () => injectedSessions ?? backofficeAuthenticationService()
  const routes = new Hono()

  routes.use(
    '*',
    cors({
      origin: new URL(trustedBackofficeWebUrl()).origin,
      credentials: true,
      allowMethods: ['GET', 'OPTIONS'],
      allowHeaders: ['Content-Type'],
      exposeHeaders: ['Server-Timing'],
      maxAge: 600,
    }),
  )
  routes.use('*', async (c, next) => {
    await next()
    c.header('Cache-Control', 'no-store')
    c.header('Referrer-Policy', 'no-referrer')
    c.header('Vary', 'Origin')
  })

  const reader: ReaderOf = async (c) => {
    const token = getCookie(c, BACKOFFICE_SESSION_COOKIE)
    if (!token) return problem(c, 'unauthenticated', 'missing session cookie')
    try {
      const actor = await sessions().resolveActor(token)
      return { personId: actor.personId, actorKind: 'support' }
    } catch (error) {
      if (error instanceof BackofficeAuthenticationError) return problem(c, error.code)
      throw error
    }
  }

  routes.get('/disciplines', (c) =>
    catalogResponse(c, reader, (actor) => catalog().listDisciplines(actor)),
  )

  routes.get('/activity-types', (c) =>
    catalogResponse(c, reader, (actor) => catalog().listActivityTypes(actor)),
  )

  routes.get('/activity-types/:activityTypeId/result-contracts', (c) => {
    const activityTypeId = c.req.param('activityTypeId')
    if (!UUID.test(activityTypeId)) return problem(c, 'invalid-request')
    return catalogResponse(c, reader, (actor) =>
      catalog().listActivityTypeResultContracts(actor, activityTypeId),
    )
  })

  return routes
}

/** Mounted at `/studio/v1/catalog`, under the CORS the whole Studio surface shares. */
export function studioCatalogReadRoutes(
  injectedCatalog?: GlobalCatalogService,
  injectedSessions?: StudioSessionService,
): Hono {
  const catalog = () => injectedCatalog ?? globalCatalogService()
  const sessions = () => injectedSessions ?? studioSessionService()
  const routes = new Hono()

  const reader: ReaderOf = async (c) => {
    const token = getCookie(c, STUDIO_SESSION_COOKIE)
    if (!token) return problem(c, 'unauthenticated', 'missing session cookie')
    try {
      const actor = await sessions().resolveActor(token)
      if (!actor.personId) return problem(c, 'registration-incomplete')
      return { personId: actor.personId, actorKind: 'person' }
    } catch (error) {
      if (error instanceof StudioSessionError) return problem(c, error.code)
      throw error
    }
  }

  // `OP-PRV-022`. What a member reads to know what they may ask a client for; the
  // closed function admits a person alone, so a support actor is refused, never served.
  routes.get('/information-categories', (c) => {
    c.header('Cache-Control', 'private, no-store')
    return catalogResponse(c, reader, (actor) => catalog().listInformationCategories(actor))
  })

  return routes
}

async function catalogResponse(
  c: Context,
  readerOf: ReaderOf,
  load: (reader: CatalogReader) => Promise<unknown[]>,
) {
  try {
    const reader = await readerOf(c)
    if (reader instanceof Response) return reader
    return c.json({ items: await load(reader) })
  } catch (error) {
    return operationFailure(c, error)
  }
}

function operationFailure(c: Context, error: unknown) {
  if (error instanceof BackofficeAuthenticationError || error instanceof StudioSessionError) {
    return problem(c, error.code)
  }
  const code = databaseErrorCode(error)
  if (code) return problem(c, code)
  console.error('[catalog-surface] operation failed')
  return problem(c, 'upstream-unavailable')
}

function databaseErrorCode(error: unknown): ApiErrorCode | undefined {
  if (typeof error !== 'object' || error === null) return undefined
  const sqlState = 'code' in error && typeof error.code === 'string' ? error.code : undefined
  if (sqlState === 'P0002') return 'not-found'
  if (sqlState === '42501') return 'forbidden'
  if (sqlState === '22023' || sqlState === '22P02') return 'invalid-request'
  return undefined
}
