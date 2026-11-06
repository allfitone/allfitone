/**
 * Body photos (HU-SP-025..027): the person's alone, kept in private storage.
 *
 * A gym sees only the ones she shows it, one relationship at a time, and only while her
 * `body_progress` version includes photos. The key under which a photo is stored never
 * leaves the API: the person gets a URL signed for five minutes, a coach the image
 * through the API. Pro opens keeping them (`body_photos`); reading, deleting, showing
 * and taking back one's own never depends on a plan.
 */

import type { AllfitV1Schemas } from '@allfitone/contracts'

export type BodyPhoto = AllfitV1Schemas['BodyPhoto']
export type BodyPhotoPage = AllfitV1Schemas['BodyPhotoPage']
export type BodyPhotoUpload = AllfitV1Schemas['NutritionPhotoUpload']
export type BodyPhotoShare = AllfitV1Schemas['BodyPhotoShare']
export type BodyPhotoShareSummary = AllfitV1Schemas['BodyPhotoShareSummary']

/** A photo as PostgreSQL holds it: the storage key, not an address. */
export interface BodyPhotoRow {
  id: string
  taken_on: string
  created_at: string
  media_ref: string
  shared_with: BodyPhotoShareSummary[]
}

export interface BodyPhotoCommand {
  idempotencyKey: string
  commandId: string
  requestHash: Uint8Array
}

/** A command's answer, and whether it is the replay of an earlier one. */
export interface BodyPhotoShareResult {
  share: BodyPhotoShare
  replayed: boolean
}

export type BodyPhotoShareCommand = BodyPhotoCommand & {
  personId: string
  photoId: string
  relationshipId: string
}

export interface BodyPhotoDatabase {
  /** OP-IDN-056. AF402 when the plan does not keep photos. */
  record(
    input: BodyPhotoCommand & { personId: string; takenOn: string; mediaRef: string },
  ): Promise<BodyPhotoRow>
  /** OP-IDN-058, newest first. */
  list(input: { personId: string; requestId: string }): Promise<BodyPhotoRow[]>
  /** OP-IDN-057. Answers the key whose object is to be removed. */
  delete(input: BodyPhotoCommand & { personId: string; photoId: string }): Promise<string>
  seal(input: { personId: string; mediaRef: string }): Promise<void>
  /** OP-IDN-061. 55000 when the relationship is not active. */
  share(input: BodyPhotoShareCommand): Promise<BodyPhotoShareResult>
  /** OP-IDN-062. P0002 when she never showed it to that relationship. */
  withdraw(input: BodyPhotoShareCommand): Promise<BodyPhotoShareResult>
}
