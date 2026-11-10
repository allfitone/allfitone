import { describe, expect, test } from 'bun:test'
import { createMemoryObjectStore } from '@allfitone/object-store'
import type postgres from 'postgres'

import {
  createMediaDisposalDatabase,
  createMediaDisposalProcessor,
  type MediaDisposalDatabase,
  type PhotoDisposal,
  type PhotoQueue,
} from './media-disposals.js'

// What is due and how long a refusal waits is `T-NUT-MEDIA-SWEEP-01`; this holds the order.
function queues(due: Partial<Record<PhotoQueue, PhotoDisposal[]>>) {
  const sealed: Array<[PhotoQueue, string]> = []
  const database: MediaDisposalDatabase = {
    claim: async (queue) => due[queue] ?? [],
    seal: async (queue, disposalId) => {
      sealed.push([queue, disposalId])
    },
  }
  return { database, sealed }
}

async function storeHolding(...keys: string[]) {
  const store = createMemoryObjectStore()
  for (const key of keys) await store.put(key, new Uint8Array([1]), 'image/jpeg')
  return store
}

describe('photos no longer used leave the store (HU-BO-033)', () => {
  test('removes each due photo from both queues, then seals it', async () => {
    const store = await storeHolding('nutrition/a.jpg', 'body/p/b.jpg')
    const { database, sealed } = queues({
      meal: [{ id: 'm1', mediaRef: 'nutrition/a.jpg' }],
      body: [{ id: 'b1', mediaRef: 'body/p/b.jpg' }],
    })

    const result = await createMediaDisposalProcessor({ database, store: () => store })()

    expect(await store.get('nutrition/a.jpg')).toBeNull()
    expect(await store.get('body/p/b.jpg')).toBeNull()
    expect(sealed).toEqual([
      ['meal', 'm1'],
      ['body', 'b1'],
    ])
    expect(result).toEqual({ claimed: 2, deadOrDelayed: 0, removed: 2 })
  })

  test('a photo the store refuses stays queued, unsealed, and the others still go', async () => {
    const store = await storeHolding('nutrition/a.jpg', 'nutrition/b.jpg')
    store.failNext('remove')
    const { database, sealed } = queues({
      meal: [
        { id: 'm1', mediaRef: 'nutrition/a.jpg' },
        { id: 'm2', mediaRef: 'nutrition/b.jpg' },
      ],
    })

    const result = await createMediaDisposalProcessor({ database, store: () => store })()

    expect(sealed).toEqual([['meal', 'm2']])
    expect(store.objects.has('nutrition/a.jpg')).toBeTrue()
    expect(result).toEqual({ claimed: 2, deadOrDelayed: 1, removed: 1 })
  })

  test('a photo already gone is sealed: the store answers it as removed', async () => {
    const { database, sealed } = queues({ body: [{ id: 'b1', mediaRef: 'body/p/gone.jpg' }] })

    const result = await createMediaDisposalProcessor({
      database,
      store: () => createMemoryObjectStore(),
    })()

    expect(sealed).toEqual([['body', 'b1']])
    expect(result.removed).toBe(1)
  })

  test('with nothing due the store is never built, so an environment without one runs', async () => {
    const { database } = queues({})

    const result = await createMediaDisposalProcessor({
      database,
      store: () => {
        throw new Error('OBJECT_STORE_BUCKET is not set')
      },
    })()

    expect(result).toEqual({ claimed: 0, deadOrDelayed: 0, removed: 0 })
  })

  test('a photo due with no store to remove it from fails the job by name', async () => {
    const { database, sealed } = queues({ meal: [{ id: 'm1', mediaRef: 'nutrition/a.jpg' }] })

    await expect(
      createMediaDisposalProcessor({
        database,
        store: () => {
          throw new Error('OBJECT_STORE_BUCKET is not set')
        },
      })(),
    ).rejects.toThrow('OBJECT_STORE_BUCKET is not set')
    expect(sealed).toEqual([])
  })
})

describe('the sweep runs as the worker', () => {
  function recordingSql(answer: (text: string) => unknown[]) {
    const statements: string[] = []
    const values: unknown[][] = []
    const transaction = (strings: TemplateStringsArray, ...bound: unknown[]) => {
      const text = strings.join('$')
      statements.push(text)
      values.push(bound)
      return Promise.resolve(answer(text))
    }
    const sql = {
      begin: (operation: (tx: typeof transaction) => Promise<unknown>) => operation(transaction),
    } as unknown as postgres.Sql
    return { sql, statements, values }
  }

  test('claims each queue in a transaction of its own, as the worker', async () => {
    const { sql, statements, values } = recordingSql((text) =>
      text.includes('claim_') ? [{ id: 'm1', media_ref: 'nutrition/a.jpg' }] : [],
    )
    const database = createMediaDisposalDatabase(sql)

    expect(await database.claim('meal', 20)).toEqual([{ id: 'm1', mediaRef: 'nutrition/a.jpg' }])
    await database.claim('body', 20)

    expect(statements[0]).toContain("set_config('app.actor_kind', 'worker', true)")
    expect(statements[1]).toContain('nutrition.claim_media_disposals(')
    expect(values[1]).toEqual([20])
    expect(statements[2]).toContain("set_config('app.actor_kind', 'worker', true)")
    expect(statements[3]).toContain('identity.claim_body_photo_disposals(')
  })

  test('seals in the queue the photo came from', async () => {
    const { sql, statements, values } = recordingSql(() => [{ sealed: true }])
    const database = createMediaDisposalDatabase(sql)

    await database.seal('meal', 'm1')
    await database.seal('body', 'b1')

    expect(statements[1]).toContain('nutrition.seal_swept_media_disposal(')
    expect(values[1]).toEqual(['m1'])
    expect(statements[3]).toContain('identity.seal_swept_body_photo_disposal(')
    expect(values[3]).toEqual(['b1'])
  })
})
