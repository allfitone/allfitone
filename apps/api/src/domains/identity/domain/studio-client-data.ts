/**
 * What a client shares about herself with the coach who attends her (HU-STUDIO-051..053).
 *
 * Her training profile, her measurements, the photos she chose to show this gym and her
 * health context, each under its own category and in the shape of the version she
 * accepted. Whether the coach attends her, whether she shares the category and which
 * fields that version carries are PostgreSQL's answers, and so is the access record,
 * written before anything is returned. A photo's storage key reaches the API and stops
 * there: Studio reads the image through the API, never through a signed address.
 */

import type { AllfitV1Schemas } from '@allfitone/contracts'

export type ClientTrainingProfile = AllfitV1Schemas['ClientTrainingProfile']
export type ClientBodyProgressRecord = AllfitV1Schemas['ClientBodyProgressRecord']
export type ClientBodyPhoto = AllfitV1Schemas['ClientBodyPhoto']
export type ClientHealthContextClaim = AllfitV1Schemas['ClientHealthContextClaim']
export type AppliedScope = AllfitV1Schemas['AppliedScope']

export interface ClientQuery {
  /** The coach, resolved from the session; never from the request. */
  personId: string
  organizationId: string
  subjectPersonId: string
  requestId: string
}

/** The last row of a page: its ordering key (a day or an instant) and its id. */
export interface ClientCursor {
  key: string
  id: string
}

export interface ClientPageQuery extends ClientQuery {
  limit: number
  cursor?: ClientCursor
}

export interface ClientPage<T> {
  appliedScope: AppliedScope
  items: T[]
  hasMore: boolean
  nextCursor?: ClientCursor
}

/** Nothing shared names the category it would take; everything else is the answer. */
export type ClientRead<T> =
  | { outcome: 'found'; value: T }
  | { outcome: 'scope_required'; requiredScope: { code: string; level: 'read' } }

export interface StudioClientDataDatabase {
  /** OP-IDN-018. */
  readProfile(input: ClientQuery): Promise<ClientRead<ClientTrainingProfile>>
  /** OP-IDN-019, newest day first. */
  listBodyProgress(
    input: ClientPageQuery,
  ): Promise<ClientRead<ClientPage<ClientBodyProgressRecord>>>
  /** OP-IDN-059, the photos she shows this relationship. */
  listBodyPhotos(input: ClientPageQuery): Promise<ClientRead<ClientPage<ClientBodyPhoto>>>
  /** OP-IDN-060. The storage key of a photo she shows, or null for anything else. */
  openBodyPhoto(input: ClientQuery & { photoId: string }): Promise<string | null>
  /** OP-IDN-020, newest first. */
  listHealthContext(
    input: ClientPageQuery,
  ): Promise<ClientRead<ClientPage<ClientHealthContextClaim>>>
}
