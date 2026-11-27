/**
 * What a person chooses in Space about how things reach her: units and language
 * (`OP-IDN-070`, `OP-IDN-071`), the channel for each kind of notice (`OP-IDN-023`,
 * `OP-IDN-024`) and the phones that may receive push (`OP-IDN-072`, `OP-IDN-073`).
 * ADR-054, `HU-SP-078`, `HU-SP-094`.
 *
 * The vocabularies are repeated here only so a malformed request is answered 422 before
 * it reaches the database. Whether a channel can be turned on, which phone a token
 * belongs to, and whose rows any of this touches are decided in PostgreSQL.
 */

import type { AllfitV1Schemas } from '@allfitone/contracts'

import type {
  BodyProgressCommand,
  BodyProgressHolder,
  BodyProgressResult,
} from './body-progress.js'

export type SpacePreferences = AllfitV1Schemas['SpacePreferences']
export type SpaceNotificationPreferences = AllfitV1Schemas['SpaceNotificationPreferences']
export type SpaceNotificationPreferenceChoice = AllfitV1Schemas['SpaceNotificationPreferenceChoice']
export type SpaceNotificationCategory = AllfitV1Schemas['SpaceNotificationCategory']
export type SpaceNotificationChannel = AllfitV1Schemas['SpaceNotificationChannel']
export type SpacePushDevice = AllfitV1Schemas['SpacePushDevice']
export type SpacePushDeviceRegistration = AllfitV1Schemas['SpacePushDeviceRegistration']
export type SpacePushPlatform = AllfitV1Schemas['SpacePushPlatform']

export const MASS_UNITS = ['kg', 'lb'] as const
export const DISTANCE_UNITS = ['km', 'mi'] as const
export const LOCALES = ['es', 'en'] as const

export const NOTIFICATION_CATEGORIES: readonly SpaceNotificationCategory[] = [
  'relationship',
  'assignment',
  'consent',
  'correction',
  'nutrition',
  'security',
]
export const NOTIFICATION_CHANNELS: readonly SpaceNotificationChannel[] = ['email', 'push']
export const PUSH_PLATFORMS: readonly SpacePushPlatform[] = ['ios', 'android']
export const MAX_PUSH_TOKEN_LENGTH = 512

// A command, a holder and a result are the same shape for every Space command.
export type SpacePreferencesCommand = BodyProgressCommand
export type SpacePreferencesHolder = BodyProgressHolder
export type SpacePreferencesResult<T> = BodyProgressResult<T>

type Read = SpacePreferencesHolder & { requestId: string }
type Command = SpacePreferencesHolder & SpacePreferencesCommand

export interface SpacePreferencesDatabase {
  readPreferences(input: Read): Promise<SpacePreferences>
  putPreferences(
    input: Command & { preferences: SpacePreferences },
  ): Promise<SpacePreferencesResult<SpacePreferences>>
  readNotificationPreferences(input: Read): Promise<SpaceNotificationPreferences>
  putNotificationPreferences(
    input: Command & { preferences: readonly SpaceNotificationPreferenceChoice[] },
  ): Promise<SpacePreferencesResult<SpaceNotificationPreferences>>
  registerPushDevice(
    input: Command & { deviceId: string; device: SpacePushDeviceRegistration },
  ): Promise<SpacePreferencesResult<SpacePushDevice>>
  retirePushDevice(input: Command & { deviceId: string }): Promise<{ replayed: boolean }>
}
