/**
 * `/studio/v1/me/preferences`: what a person chose for how Studio looks
 * (`OP-IDN-068`, `OP-IDN-069`).
 *
 * The preferences are the signed-in person's and Studio's. The route is what says
 * "Studio": the body names a theme and nothing else, so no client can aim a request at
 * another person or another product. `theme` is null until she chooses, because the
 * default is the screen's to show.
 *
 * An account that has not completed registration, or whose person is closed, gets the
 * status and the code `GET /studio/v1/me` gives it. Errors are problems, as the contract
 * declares them.
 *
 * The session, origin and command helpers repeat the ones in the files beside this one
 * on purpose: each handler file here keeps its own, and they diverge as they grow.
 */

import { createHash, randomUUID } from 'node:crypto'
import type { AllfitV1Schemas } from '@allfitone/contracts'
import { Hono, type Context } from 'hono'
import { getCookie } from 'hono/cookie'
import { cors } from 'hono/cors'

import { problem, type ApiErrorCode } from '../../../platform/http/index.js'
import { StudioSessionError, type StudioSessionService } from '../application/index.js'
import type {
  StudioPreferences,
  StudioPreferencesService,
} from '../application/studio-preferences.js'
import {
  studioPreferencesService,
  studioSessionService,
  trustedStudioWebUrl,
} from '../dependencies.js'
import { isInterfaceTheme } from '../domain/studio-preferences.js'
import { STUDIO_SESSION_COOKIE } from './studio.js'

type StudioPreferencesPut = AllfitV1Schemas['StudioPreferencesPut']

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const UUID_V7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const PREFERENCES = '/me/preferences'

export function studioPreferencesRoutes(
  injectedPreferences?: StudioPreferencesService,
  injectedSessions?: StudioSessionService,
): Hono {
  const studioOrigin = new URL(trustedStudioWebUrl()).origin
  const preferences = () => injectedPreferences ?? studioPreferencesService()
  const sessions = () => injectedSessions ?? studioSessionService()
  const routes = new Hono()

  routes.use(
    PREFERENCES,
    cors({
      origin: studioOrigin,
      credentials: true,
      allowMethods: ['GET', 'PUT', 'OPTIONS'],
      allowHeaders: ['Content-Type', 'Idempotency-Key', 'Command-Id'],
      exposeHeaders: ['Idempotent-Replay', 'Server-Timing'],
      maxAge: 600,
    }),
  )

  // `OP-IDN-068`.
  routes.get(PREFERENCES, async (c) => {
    try {
      const actor = await studioActor(c, sessions)
      if (actor instanceof Response) return actor
      const read = await preferences().read({ ...actor, requestId: randomUUID() })
      c.header('Cache-Control', 'private, no-store')
      return c.json(preferencesResponse(read))
    } catch (error) {
      return operationFailure(c, error)
    }
  })

  // `OP-IDN-069`.
  routes.put(PREFERENCES, async (c) => {
    if (c.req.header('origin') !== studioOrigin) {
      return refuse(c, 'forbidden', 'origin is not allowed')
    }
    const body = await readJson(c)
    if (!isStudioPreferencesPut(body)) return refuse(c, 'validation-failed')
    const command = commandContext(c, body)
    if (!command) return refuse(c, 'invalid-request', 'valid command headers are required')

    try {
      const actor = await studioActor(c, sessions)
      if (actor instanceof Response) return actor
      const result = await preferences().put({ ...actor, theme: body.theme, ...command })
      c.header('Cache-Control', 'no-store')
      if (result.replayed) c.header('Idempotent-Replay', 'true')
      return c.json(preferencesResponse(result.resource))
    } catch (error) {
      return operationFailure(c, error)
    }
  })

  return routes
}

async function studioActor(c: Context, sessions: () => StudioSessionService) {
  const token = getCookie(c, STUDIO_SESSION_COOKIE)
  if (!token) return refuse(c, 'unauthenticated', 'missing session cookie')
  try {
    const actor = await sessions().resolveActor(token)
    return actor.personId ? { personId: actor.personId } : refuse(c, 'registration-incomplete')
  } catch (error) {
    if (error instanceof StudioSessionError) return refuse(c, error.code)
    throw error
  }
}

function preferencesResponse(preferences: StudioPreferences): AllfitV1Schemas['StudioPreferences'] {
  return { theme: preferences.theme }
}

/** The contract keeps an account's own refusals private; every other error is not stored. */
function refuse(c: Context, code: ApiErrorCode, detail?: string) {
  const ownAccount = code === 'registration-incomplete' || code === 'account-closed'
  c.header('Cache-Control', ownAccount ? 'private, no-store' : 'no-store')
  return problem(c, code, detail)
}

function commandContext(c: Context, body: StudioPreferencesPut) {
  const idempotencyKey = c.req.header('idempotency-key') ?? ''
  const commandId = c.req.header('command-id') ?? ''
  if (!UUID_V4.test(idempotencyKey) || !UUID_V7.test(commandId)) return undefined
  return {
    idempotencyKey,
    commandId,
    // One key in a closed body: its JSON is already canonical.
    requestHash: createHash('sha256')
      .update(JSON.stringify({ theme: body.theme }))
      .digest(),
  }
}

async function readJson(c: Context): Promise<unknown> {
  try {
    return await c.req.json()
  } catch {
    return undefined
  }
}

function isStudioPreferencesPut(value: unknown): value is StudioPreferencesPut {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    Object.keys(value).join(',') === 'theme' &&
    'theme' in value &&
    isInterfaceTheme(value.theme)
  )
}

function operationFailure(c: Context, error: unknown) {
  if (error instanceof StudioSessionError) return refuse(c, error.code)
  const sqlState =
    typeof error === 'object' && error !== null && 'code' in error && typeof error.code === 'string'
      ? error.code
      : undefined
  if (sqlState === '42501') return refuse(c, 'forbidden')
  if (sqlState === '23505' || sqlState === '40001') return refuse(c, 'conflict')
  if (sqlState === '22023' || sqlState === '23514' || sqlState === '22P02') {
    return refuse(c, 'validation-failed')
  }
  console.error('[studio-preferences] operation failed')
  return refuse(c, 'upstream-unavailable')
}
