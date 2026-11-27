/**
 * A person's choices in Space about how things reach her, read and kept as herself
 * (`OP-IDN-023`, `OP-IDN-024`, `OP-IDN-070` to `OP-IDN-073`).
 *
 * The token is carried through, never interpreted: its subject is resolved to a person
 * inside each function's own transaction, so this layer cannot read or choose for anyone
 * else. Nothing is decided here.
 */

import type { VerifiedToken } from '@allfitone/auth-provider'

import type {
  SpaceNotificationPreferenceChoice,
  SpaceNotificationPreferences,
  SpacePreferences,
  SpacePreferencesCommand,
  SpacePreferencesDatabase,
  SpacePreferencesResult,
  SpacePushDevice,
  SpacePushDeviceRegistration,
} from '../domain/space-preferences.js'

type Command = Omit<SpacePreferencesCommand, 'requestId'>

export interface SpacePreferencesService {
  /** `OP-IDN-070`. */
  readPreferences(token: VerifiedToken): Promise<SpacePreferences>
  /** `OP-IDN-071`. */
  putPreferences(
    token: VerifiedToken,
    input: Command & { preferences: SpacePreferences },
  ): Promise<SpacePreferencesResult<SpacePreferences>>
  /** `OP-IDN-023`. */
  readNotificationPreferences(token: VerifiedToken): Promise<SpaceNotificationPreferences>
  /** `OP-IDN-024`. */
  putNotificationPreferences(
    token: VerifiedToken,
    input: Command & { preferences: readonly SpaceNotificationPreferenceChoice[] },
  ): Promise<SpacePreferencesResult<SpaceNotificationPreferences>>
  /** `OP-IDN-072`. */
  registerPushDevice(
    token: VerifiedToken,
    input: Command & { deviceId: string; device: SpacePushDeviceRegistration },
  ): Promise<SpacePreferencesResult<SpacePushDevice>>
  /** `OP-IDN-073`. */
  retirePushDevice(
    token: VerifiedToken,
    input: Command & { deviceId: string },
  ): Promise<{ replayed: boolean }>
}

export function createSpacePreferencesService(dependencies: {
  database: SpacePreferencesDatabase
  issuer: string
  requestId: () => string
}): SpacePreferencesService {
  const holder = (token: VerifiedToken) => ({
    issuer: dependencies.issuer,
    subject: String(token.subject),
    requestId: dependencies.requestId(),
  })
  const { database } = dependencies

  return {
    readPreferences: (token) => database.readPreferences(holder(token)),
    putPreferences: (token, input) => database.putPreferences({ ...holder(token), ...input }),
    readNotificationPreferences: (token) => database.readNotificationPreferences(holder(token)),
    putNotificationPreferences: (token, input) =>
      database.putNotificationPreferences({ ...holder(token), ...input }),
    registerPushDevice: (token, input) =>
      database.registerPushDevice({ ...holder(token), ...input }),
    retirePushDevice: (token, input) => database.retirePushDevice({ ...holder(token), ...input }),
  }
}
