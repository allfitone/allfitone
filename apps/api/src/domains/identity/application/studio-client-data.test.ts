import { describe, expect, test } from 'bun:test'
import { createMemoryObjectStore, ObjectStoreError } from '@allfitone/object-store'

import type { StudioClientDataDatabase } from '../domain/studio-client-data.js'
import { createStudioClientDataService } from './studio-client-data.js'

const QUERY = {
  personId: '019f4900-0000-7000-8000-000000000012',
  organizationId: '019f4900-0000-7000-8000-000000000101',
  subjectPersonId: '019f4900-0000-7000-8000-000000000001',
  requestId: '3f1c2a4e-8b3d-4c5e-9f60-7a8b9c0d1e2f',
  photoId: '019f4900-0000-7000-8000-000000000e01',
}
const KEY = 'body/019f4900-0000-7000-8000-000000000001/e01.jpg'

function harness(opened: string | null) {
  const store = createMemoryObjectStore()
  const asked: unknown[] = []
  const unused = async (): Promise<never> => {
    throw new Error('outside the photo test')
  }
  const database: StudioClientDataDatabase = {
    readProfile: unused,
    listBodyProgress: unused,
    listBodyPhotos: unused,
    listHealthContext: unused,
    openBodyPhoto: async (input) => {
      asked.push(input)
      return opened
    },
  }
  return { service: createStudioClientDataService(database, store), store, asked }
}

describe('a client photo for her coach (OP-IDN-060)', () => {
  test('T-IDN-AUTHORIZED-UNIT-10 the store is read only after PostgreSQL opens the photo', async () => {
    const { service, store, asked } = harness(KEY)
    await store.put(KEY, new Uint8Array([1, 2]), 'image/jpeg')

    expect(await service.bodyPhotoContent(QUERY)).toEqual({
      bytes: new Uint8Array([1, 2]),
      contentType: 'image/jpeg',
    })
    expect(asked).toEqual([QUERY])
  })

  test('T-IDN-AUTHORIZED-UNIT-11 a photo PostgreSQL does not open is never fetched', async () => {
    const { service, store } = harness(null)
    await store.put(KEY, new Uint8Array([1, 2]), 'image/jpeg')
    store.failNext('get')

    // Had the store been asked, the armed failure would have thrown.
    expect(await service.bodyPhotoContent(QUERY)).toBeNull()
  })

  test('T-IDN-AUTHORIZED-UNIT-12 an object already gone reads as no photo; a failing store fails', async () => {
    const missing = harness(KEY)
    expect(await missing.service.bodyPhotoContent(QUERY)).toBeNull()

    const failing = harness(KEY)
    failing.store.failNext('get')
    await expect(failing.service.bodyPhotoContent(QUERY)).rejects.toBeInstanceOf(ObjectStoreError)
  })
})
