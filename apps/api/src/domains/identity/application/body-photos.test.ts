import { describe, expect, test } from 'bun:test'
import { createMemoryObjectStore } from '@allfitone/object-store'

import type { BodyPhotoDatabase, BodyPhotoRow } from '../domain/body-photos.js'
import { createBodyPhotoService } from './body-photos.js'

const PERSON = '019f1000-0000-7000-8000-000000000001'
const COMMAND = '019f1000-0000-7000-8000-0000000000c1'
const command = { idempotencyKey: 'k', commandId: COMMAND, requestHash: Buffer.alloc(32) }
const photo = {
  content_type: 'image/jpeg' as const,
  content: Buffer.from([1, 2, 3]).toString('base64'),
}

const row = (overrides: Partial<BodyPhotoRow> = {}): BodyPhotoRow => ({
  id: COMMAND,
  taken_on: '2026-10-25',
  created_at: '2026-10-25T12:00:00.000Z',
  media_ref: `body/${PERSON}/${COMMAND}.jpg`,
  shared_with: [],
  ...overrides,
})

const RELATIONSHIP = '019f1000-0000-7000-8000-000000000701'
const SHARE = {
  body_photo_id: COMMAND,
  relationship_id: RELATIONSHIP,
  organization: { id: '019f1000-0000-7000-8000-000000000101', display_name: 'Gym A' },
  status: 'shared' as const,
  shared_at: '2026-11-05T12:00:00.000Z',
  withdrawn_at: null,
}

function harness(database: Partial<BodyPhotoDatabase> = {}) {
  const store = createMemoryObjectStore()
  const sealed: string[] = []
  const db: BodyPhotoDatabase = {
    record: async ({ mediaRef }) => row({ media_ref: mediaRef }),
    list: async () => [row()],
    delete: async () => `body/${PERSON}/${COMMAND}.jpg`,
    seal: async ({ mediaRef }) => {
      sealed.push(mediaRef)
    },
    share: async () => ({ share: SHARE, replayed: false }),
    withdraw: async () => ({
      share: { ...SHARE, status: 'withdrawn', withdrawn_at: '2026-11-05T13:00:00.000Z' },
      replayed: false,
    }),
    ...database,
  }
  const service = createBodyPhotoService(db, store, { sanitize: async () => new Uint8Array([7]) })
  return { service, store, sealed }
}

describe('body photos (OP-IDN-056..058)', () => {
  test('T-IDN-API-BODYPHOTO-01 a photo is sanitised and stored under its person before it is recorded', async () => {
    let recordedRef = ''
    const { service, store } = harness({
      record: async ({ mediaRef }) => {
        recordedRef = mediaRef
        return row({ media_ref: mediaRef })
      },
    })
    const kept = await service.record({
      personId: PERSON,
      takenOn: '2026-10-25',
      photo,
      ...command,
    })

    expect(recordedRef).toBe(`body/${PERSON}/${COMMAND}.jpg`)
    expect(store.objects.get(recordedRef)?.contentType).toBe('image/jpeg')
    expect(kept.photo.method).toBe('GET')
    expect(kept).not.toHaveProperty('media_ref')
  })

  test('T-IDN-API-BODYPHOTO-02 when the record is refused, the stored object is removed', async () => {
    const refusal = Object.assign(new Error('this function comes with Pro'), {
      code: 'AF402',
      detail: 'body_photos',
    })
    const { service, store } = harness({
      record: async () => {
        throw refusal
      },
    })

    await expect(
      service.record({ personId: PERSON, takenOn: '2026-10-25', photo, ...command }),
    ).rejects.toBe(refusal)
    expect(store.objects.size).toBe(0)
  })

  test('T-IDN-API-BODYPHOTO-03 the list signs each photo and never shows its key', async () => {
    const { service } = harness()
    const page = await service.list({ personId: PERSON, requestId: 'r' })

    expect(page.data).toHaveLength(1)
    expect(page.data[0]?.photo.method).toBe('GET')
    expect(page.data[0]).not.toHaveProperty('media_ref')
  })

  test('T-IDN-API-BODYPHOTO-04 deleting removes the object and seals its disposal', async () => {
    const { service, sealed, store } = harness()
    await store.put(`body/${PERSON}/${COMMAND}.jpg`, new Uint8Array([1]), 'image/jpeg')
    await service.delete({ personId: PERSON, photoId: COMMAND, ...command })

    expect(store.objects.size).toBe(0)
    expect(sealed).toEqual([`body/${PERSON}/${COMMAND}.jpg`])
  })

  test('T-IDN-API-BODYPHOTO-05 the list says whom she shows each photo to', async () => {
    const shown = {
      relationship_id: RELATIONSHIP,
      organization_name: 'Gym A',
      shared_at: SHARE.shared_at,
    }
    const { service } = harness({ list: async () => [row({ shared_with: [shown] })] })
    const page = await service.list({ personId: PERSON, requestId: 'r' })

    expect(page.data[0]?.shared_with).toEqual([shown])
  })

  test('T-IDN-API-BODYPHOTO-06 showing and taking back touch the database and nothing in the store', async () => {
    const calls: string[] = []
    const { service, store } = harness({
      share: async (input) => {
        calls.push(`share ${input.photoId} ${input.relationshipId}`)
        return { share: SHARE, replayed: true }
      },
      withdraw: async (input) => {
        calls.push(`withdraw ${input.photoId} ${input.relationshipId}`)
        return { share: SHARE, replayed: false }
      },
    })
    const target = { personId: PERSON, photoId: COMMAND, relationshipId: RELATIONSHIP, ...command }

    expect(await service.share(target)).toEqual({ share: SHARE, replayed: true })
    expect(await service.withdraw(target)).toEqual({ share: SHARE, replayed: false })
    expect(calls).toEqual([
      `share ${COMMAND} ${RELATIONSHIP}`,
      `withdraw ${COMMAND} ${RELATIONSHIP}`,
    ])
    expect(store.objects.size).toBe(0)
  })
})
