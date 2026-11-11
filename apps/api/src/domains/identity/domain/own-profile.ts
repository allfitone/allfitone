/**
 * A person's own profile and identity: `OP-IDN-012`, `OP-IDN-013`, `OP-IDN-021` and
 * `OP-IDN-022` (the phone, ADR-050, and the email change, TECH-44), `OP-IDN-063`,
 * `OP-IDN-064`, `OP-IDN-065`.
 *
 * The vocabularies are repeated here only so a malformed request is answered 422 before
 * it reaches the database. Which person the token belongs to, which version of an
 * attribute is shown and whether a username is free are all decided in PostgreSQL.
 */

import type { AllfitV1Schemas } from '@allfitone/contracts'

import type {
  BodyProgressCommand,
  BodyProgressHolder,
  BodyProgressResult,
} from './body-progress.js'

export type SpaceIdentity = AllfitV1Schemas['SpaceIdentity']
export type SpaceFitnessProfile = AllfitV1Schemas['SpaceFitnessProfile']
export type SpaceOwnName = AllfitV1Schemas['SpaceOwnName']
export type SpaceOwnBiologicalSex = AllfitV1Schemas['SpaceOwnBiologicalSex']
export type SpaceContactPhone = AllfitV1Schemas['SpaceContactPhone']
export type SpaceEmailChange = AllfitV1Schemas['SpaceEmailChange']
/** What a code comes to; only `applying` reaches the client as a body, the rest are problems. */
export type EmailChangeOutcome = 'applying' | 'wrong_code' | 'expired' | 'too_many_attempts'
export type SpaceAvailableEquipment = AllfitV1Schemas['SpaceAvailableEquipment']
export type AvailableEquipmentPiece = AllfitV1Schemas['AvailableEquipmentPiece']

export const AVAILABLE_EQUIPMENT: readonly AvailableEquipmentPiece[] = [
  'bodyweight',
  'dumbbell',
  'kettlebell',
  'barbell',
  'bench',
  'pull_up_bar',
  'cable',
  'machine',
  'cardio_machine',
]

export const BIOLOGICAL_SEXES = ['male', 'female'] as const

export const MAX_NAME_LENGTH = 80
export const USERNAME = /^[A-Za-z][A-Za-z0-9_]{2,29}$/
export const MAX_PHONE_LENGTH = 32
export const MAX_EMAIL_LENGTH = 254
// Only the shape; PostgreSQL decides, with the same words for every refusal.
export const EMAIL_SHAPE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/
export const CODE = /^[0-9]{6}$/
const E164 = /^\+[1-9][0-9]{7,14}$/

/** The phone in E.164 once spaces, dashes and parentheses are dropped; undefined if it is not. */
export function e164Phone(typed: string): string | undefined {
  const phone = typed.replace(/[\s().-]/g, '')
  return E164.test(phone) ? phone : undefined
}

// A command, a holder and a result are the same shape for every kind of personal data.
export type OwnProfileCommand = BodyProgressCommand
export type OwnProfileHolder = BodyProgressHolder
export type OwnProfileResult<T> = BodyProgressResult<T>

export interface OwnProfileDatabase {
  readIdentity(input: OwnProfileHolder & { requestId: string }): Promise<SpaceIdentity>
  readProfile(input: OwnProfileHolder & { requestId: string }): Promise<SpaceFitnessProfile>
  correctName(
    input: OwnProfileHolder & OwnProfileCommand & { name: SpaceOwnName },
  ): Promise<OwnProfileResult<SpaceOwnName>>
  correctBiologicalSex(
    input: OwnProfileHolder & OwnProfileCommand & { sex: SpaceOwnBiologicalSex },
  ): Promise<OwnProfileResult<SpaceOwnBiologicalSex>>
  correctPhone(
    input: OwnProfileHolder & OwnProfileCommand & { phone: string | null },
  ): Promise<OwnProfileResult<SpaceContactPhone>>
  requestEmailChange(
    input: OwnProfileHolder & OwnProfileCommand & { email: string },
  ): Promise<OwnProfileResult<SpaceEmailChange>>
  verifyEmailChange(
    input: OwnProfileHolder & OwnProfileCommand & { code: string; sessionId: string },
  ): Promise<OwnProfileResult<{ outcome: EmailChangeOutcome }>>
  declareEquipment(
    input: OwnProfileHolder & OwnProfileCommand & { equipment: AvailableEquipmentPiece[] },
  ): Promise<OwnProfileResult<SpaceAvailableEquipment>>
}
