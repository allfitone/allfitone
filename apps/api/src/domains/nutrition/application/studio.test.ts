import { describe, expect, test } from 'bun:test'
import { createMemoryObjectStore, ObjectStoreError } from '@allfitone/object-store'

import type { StudioNutritionDatabase } from '../domain/studio.js'
import { createStudioNutritionService } from './studio.js'

const QUERY = {
  personId: '019f6100-0000-7000-8000-000000000012',
  organizationId: '019f6100-0000-7000-8000-000000000101',
  subjectPersonId: '019f6100-0000-7000-8000-000000000001',
  requestId: '3f1c2a4e-8b3d-4c5e-9f60-7a8b9c0d1e2f',
  mealId: '019f6100-0000-7000-8000-000000000e01',
}
const KEY = 'nutrition/019f6100-0000-7000-8000-000000000001/e01.jpg'

function harness(opened: string | null) {
  const store = createMemoryObjectStore()
  const asked: unknown[] = []
  const unused = async (): Promise<never> => {
    throw new Error('outside the photo test')
  }
  const database: StudioNutritionDatabase = {
    listMeals: unused,
    readDailySummaries: unused,
    listGoalVersions: unused,
    proposeGoalVersion: unused,
    openMealPhoto: async (input) => {
      asked.push(input)
      return opened
    },
  }
  return { service: createStudioNutritionService(database, store), store, asked }
}

describe('a meal photo for her coach (OP-NUT-013)', () => {
  test('T-NUT-STUDIO-UNIT-01 the store is read only after PostgreSQL opens the photo', async () => {
    const { service, store, asked } = harness(KEY)
    await store.put(KEY, new Uint8Array([1, 2]), 'image/jpeg')

    expect(await service.mealPhoto(QUERY)).toEqual({
      bytes: new Uint8Array([1, 2]),
      contentType: 'image/jpeg',
    })
    expect(asked).toEqual([QUERY])
  })

  test('T-NUT-STUDIO-UNIT-02 a photo PostgreSQL does not open is never fetched', async () => {
    const { service, store } = harness(null)
    await store.put(KEY, new Uint8Array([1, 2]), 'image/jpeg')
    store.failNext('get')

    // Had the store been asked, the armed failure would have thrown.
    expect(await service.mealPhoto(QUERY)).toBeNull()
  })

  test('T-NUT-STUDIO-UNIT-03 an object already gone reads as no photo; a failing store fails', async () => {
    const missing = harness(KEY)
    expect(await missing.service.mealPhoto(QUERY)).toBeNull()

    const failing = harness(KEY)
    failing.store.failNext('get')
    await expect(failing.service.mealPhoto(QUERY)).rejects.toBeInstanceOf(ObjectStoreError)
  })
})
