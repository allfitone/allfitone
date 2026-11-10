/**
 * A person's own profile and identity: `OP-IDN-012`, `OP-IDN-013`, `OP-IDN-063`,
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
  declareEquipment(
    input: OwnProfileHolder & OwnProfileCommand & { equipment: AvailableEquipmentPiece[] },
  ): Promise<OwnProfileResult<SpaceAvailableEquipment>>
}
