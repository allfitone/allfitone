/**
 * Own profile and identity use cases for Space.
 *
 * The token is carried through, never interpreted: its subject is resolved to an active
 * person inside the database's own transaction, so this layer cannot read or correct
 * anybody else's profile.
 */

import type { VerifiedToken } from '@allfitone/auth-provider'

import type {
  AvailableEquipmentPiece,
  OwnProfileCommand,
  OwnProfileDatabase,
  OwnProfileResult,
  SpaceAvailableEquipment,
  SpaceFitnessProfile,
  SpaceIdentity,
  SpaceOwnBiologicalSex,
  SpaceOwnName,
} from '../domain/own-profile.js'

type Command = Omit<OwnProfileCommand, 'requestId'>

export interface OwnProfileService {
  readIdentity(token: VerifiedToken): Promise<SpaceIdentity>
  readProfile(token: VerifiedToken): Promise<SpaceFitnessProfile>
  correctName(
    token: VerifiedToken,
    input: Command & { name: SpaceOwnName },
  ): Promise<OwnProfileResult<SpaceOwnName>>
  correctBiologicalSex(
    token: VerifiedToken,
    input: Command & { sex: SpaceOwnBiologicalSex },
  ): Promise<OwnProfileResult<SpaceOwnBiologicalSex>>
  declareEquipment(
    token: VerifiedToken,
    input: Command & { equipment: AvailableEquipmentPiece[] },
  ): Promise<OwnProfileResult<SpaceAvailableEquipment>>
}

export function createOwnProfileService(dependencies: {
  database: OwnProfileDatabase
  issuer: string
  requestId: () => string
}): OwnProfileService {
  const holder = (token: VerifiedToken) => ({
    issuer: dependencies.issuer,
    subject: String(token.subject),
    requestId: dependencies.requestId(),
  })

  return {
    readIdentity: (token) => dependencies.database.readIdentity(holder(token)),
    readProfile: (token) => dependencies.database.readProfile(holder(token)),
    correctName: (token, input) =>
      dependencies.database.correctName({ ...holder(token), ...input }),
    correctBiologicalSex: (token, input) =>
      dependencies.database.correctBiologicalSex({ ...holder(token), ...input }),
    declareEquipment: (token, input) =>
      dependencies.database.declareEquipment({ ...holder(token), ...input }),
  }
}
