/**
 * The coach's reading of what a client shares about herself (HU-STUDIO-051..053).
 *
 * The reads are the database's: it decides, records and shapes. What this adds is the
 * photo itself, fetched from the private store only after PostgreSQL has rechecked the
 * share and recorded the access, so the image travels through the API and the key
 * never leaves it. A key whose object is gone reads as no photo, like any other miss.
 */

import type { ObjectStore, StoredObject } from '@allfitone/object-store'

import type { ClientQuery, StudioClientDataDatabase } from '../domain/studio-client-data.js'

export type {
  ClientBodyPhoto,
  ClientBodyProgressRecord,
  ClientCursor,
  ClientHealthContextClaim,
  ClientPage,
  ClientPageQuery,
  ClientRead,
  ClientTrainingProfile,
} from '../domain/studio-client-data.js'

export interface StudioClientDataService {
  profile: StudioClientDataDatabase['readProfile']
  bodyProgress: StudioClientDataDatabase['listBodyProgress']
  bodyPhotos: StudioClientDataDatabase['listBodyPhotos']
  healthContext: StudioClientDataDatabase['listHealthContext']
  /** OP-IDN-060. The image, or null when there is no photo she shows to give. */
  bodyPhotoContent(input: ClientQuery & { photoId: string }): Promise<StoredObject | null>
}

export function createStudioClientDataService(
  database: StudioClientDataDatabase,
  store: ObjectStore,
): StudioClientDataService {
  return {
    profile: (input) => database.readProfile(input),
    bodyProgress: (input) => database.listBodyProgress(input),
    bodyPhotos: (input) => database.listBodyPhotos(input),
    healthContext: (input) => database.listHealthContext(input),
    async bodyPhotoContent(input) {
      const mediaRef = await database.openBodyPhoto(input)
      return mediaRef ? store.get(mediaRef) : null
    },
  }
}
