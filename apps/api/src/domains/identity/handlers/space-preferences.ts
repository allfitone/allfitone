/**
 * How things reach a person, on /space/v1: units and language (`OP-IDN-070`,
 * `OP-IDN-071`), the channel for each kind of notice (`OP-IDN-023`, `OP-IDN-024`) and
 * the phones that may receive push (`OP-IDN-072`, `OP-IDN-073`). ADR-054.
 *
 * Every body is checked against its exact shape and closed lists, so a malformed one is
 * 422 before it reaches the database; a key outside the shape is refused rather than
 * ignored, so a client cannot believe it was stored. Whether a channel may be turned on
 * is the database's to say, because only it knows the verified email and the phones.
 */

import { Hono } from 'hono'

import { problem } from '../../../platform/http/index.js'
import {
  exactObject,
  isJsonRequest,
  readJson,
  spaceCommand,
  spaceFailure,
  spaceTokenVerifier,
  verifiedSpaceToken,
  type TokenVerifier,
} from '../../../platform/http/space-requests.js'
import type { SpacePreferencesService } from '../application/space-preferences.js'
import { spacePreferencesService } from '../dependencies.js'
import {
  DISTANCE_UNITS,
  LOCALES,
  MASS_UNITS,
  MAX_PUSH_TOKEN_LENGTH,
  NOTIFICATION_CATEGORIES,
  NOTIFICATION_CHANNELS,
  PUSH_PLATFORMS,
  type SpaceNotificationCategory,
  type SpaceNotificationChannel,
  type SpaceNotificationPreferenceChoice,
  type SpacePreferences,
  type SpacePushDeviceRegistration,
  type SpacePushPlatform,
} from '../domain/space-preferences.js'

const OPERATION = 'space-preferences'
// Any version: the installation id is the app's, generated once.
const DEVICE_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export function spacePreferencesRoutes(
  injectedService?: SpacePreferencesService,
  injectedVerifier?: TokenVerifier,
): Hono {
  const choices = () => injectedService ?? spacePreferencesService()
  const verify = injectedVerifier ?? spaceTokenVerifier()
  const routes = new Hono()

  routes.use('*', async (c, next) => {
    await next()
    c.header('Cache-Control', 'no-store')
  })

  routes.get('/me/preferences', async (c) => {
    const token = await verifiedSpaceToken(c, verify)
    if (!token) return problem(c, 'unauthenticated')
    try {
      return c.json(await choices().readPreferences(token))
    } catch (error) {
      return spaceFailure(c, error, OPERATION)
    }
  })

  routes.put('/me/preferences', async (c) => {
    const token = await verifiedSpaceToken(c, verify)
    if (!token) return problem(c, 'unauthenticated')
    if (!isJsonRequest(c)) return problem(c, 'unsupported-media-type')
    const preferences = unitsAndLanguage(await readJson(c))
    if (!preferences) return problem(c, 'validation-failed')
    const command = spaceCommand(c, preferences)
    if (!command) return problem(c, 'invalid-request')

    try {
      const result = await choices().putPreferences(token, { ...command, preferences })
      if (result.replayed) c.header('Idempotent-Replay', 'true')
      return c.json(result.resource, 200)
    } catch (error) {
      return spaceFailure(c, error, OPERATION)
    }
  })

  routes.get('/me/notification-preferences', async (c) => {
    const token = await verifiedSpaceToken(c, verify)
    if (!token) return problem(c, 'unauthenticated')
    try {
      return c.json(await choices().readNotificationPreferences(token))
    } catch (error) {
      return spaceFailure(c, error, OPERATION)
    }
  })

  routes.put('/me/notification-preferences', async (c) => {
    const token = await verifiedSpaceToken(c, verify)
    if (!token) return problem(c, 'unauthenticated')
    if (!isJsonRequest(c)) return problem(c, 'unsupported-media-type')
    const preferences = channelSet(await readJson(c))
    if (!preferences) return problem(c, 'validation-failed')
    const command = spaceCommand(c, { preferences })
    if (!command) return problem(c, 'invalid-request')

    try {
      const result = await choices().putNotificationPreferences(token, { ...command, preferences })
      if (result.replayed) c.header('Idempotent-Replay', 'true')
      return c.json(result.resource, 200)
    } catch (error) {
      return spaceFailure(c, error, OPERATION)
    }
  })

  routes.put('/me/push-devices/:deviceId', async (c) => {
    const token = await verifiedSpaceToken(c, verify)
    if (!token) return problem(c, 'unauthenticated')
    const deviceId = c.req.param('deviceId')
    if (!DEVICE_ID.test(deviceId)) return problem(c, 'invalid-request')
    if (!isJsonRequest(c)) return problem(c, 'unsupported-media-type')
    const device = registration(await readJson(c))
    if (!device) return problem(c, 'validation-failed')
    const command = spaceCommand(c, { deviceId, ...device })
    if (!command) return problem(c, 'invalid-request')

    try {
      const result = await choices().registerPushDevice(token, { ...command, deviceId, device })
      if (result.replayed) c.header('Idempotent-Replay', 'true')
      return c.json(result.resource, 200)
    } catch (error) {
      return spaceFailure(c, error, OPERATION)
    }
  })

  routes.delete('/me/push-devices/:deviceId', async (c) => {
    const token = await verifiedSpaceToken(c, verify)
    if (!token) return problem(c, 'unauthenticated')
    const deviceId = c.req.param('deviceId')
    if (!DEVICE_ID.test(deviceId)) return problem(c, 'invalid-request')
    const command = spaceCommand(c, { deviceId })
    if (!command) return problem(c, 'invalid-request')

    try {
      const { replayed } = await choices().retirePushDevice(token, { ...command, deviceId })
      if (replayed) c.header('Idempotent-Replay', 'true')
      return c.body(null, 204)
    } catch (error) {
      return spaceFailure(c, error, OPERATION)
    }
  })

  return routes
}

function oneOf<T extends string>(list: readonly T[], value: unknown): value is T {
  return typeof value === 'string' && (list as readonly string[]).includes(value)
}

function unitsAndLanguage(body: unknown): SpacePreferences | undefined {
  const fields = exactObject(body, ['mass_unit', 'distance_unit', 'locale'])
  if (!fields) return undefined
  const { mass_unit: mass, distance_unit: distance, locale } = fields
  // Null hands the choice back to the phone.
  if (mass !== null && !oneOf(MASS_UNITS, mass)) return undefined
  if (distance !== null && !oneOf(DISTANCE_UNITS, distance)) return undefined
  if (locale !== null && !oneOf(LOCALES, locale)) return undefined
  return { mass_unit: mass, distance_unit: distance, locale }
}

function channelSet(body: unknown): SpaceNotificationPreferenceChoice[] | undefined {
  const fields = exactObject(body, ['preferences'])
  if (!fields || !Array.isArray(fields.preferences)) return undefined
  const expected = NOTIFICATION_CATEGORIES.length * NOTIFICATION_CHANNELS.length
  if (fields.preferences.length !== expected) return undefined

  const seen = new Set<string>()
  const choices: SpaceNotificationPreferenceChoice[] = []
  for (const item of fields.preferences) {
    const choice = exactObject(item, ['category', 'channel', 'enabled'])
    if (!choice) return undefined
    const { category, channel, enabled } = choice
    if (!oneOf<SpaceNotificationCategory>(NOTIFICATION_CATEGORIES, category)) return undefined
    if (!oneOf<SpaceNotificationChannel>(NOTIFICATION_CHANNELS, channel)) return undefined
    if (typeof enabled !== 'boolean') return undefined
    if (seen.has(`${category}:${channel}`)) return undefined
    seen.add(`${category}:${channel}`)
    choices.push({ category, channel, enabled })
  }
  return choices
}

function registration(body: unknown): SpacePushDeviceRegistration | undefined {
  const fields = exactObject(body, ['token', 'platform'])
  if (!fields) return undefined
  const { token, platform } = fields
  if (typeof token !== 'string' || token.trim() === '' || token.length > MAX_PUSH_TOKEN_LENGTH) {
    return undefined
  }
  if (!oneOf<SpacePushPlatform>(PUSH_PLATFORMS, platform)) return undefined
  return { token, platform }
}
