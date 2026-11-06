import { describe, expect, test } from 'bun:test'

import {
  createMemoryObjectStore,
  createObjectStoreFromEnv,
  createS3ObjectStore,
  ObjectStoreError,
} from './index.js'

const env = {
  OBJECT_STORE_BUCKET: 'allfit-private',
  OBJECT_STORE_REGION: 'us-east-1',
  OBJECT_STORE_ACCESS_KEY_ID: 'AKIAEXAMPLE',
  OBJECT_STORE_SECRET_ACCESS_KEY: 'secret',
}

describe('the object store', () => {
  test('T-OBJ-UNIT-01 names the setting that is missing', () => {
    expect(() => createObjectStoreFromEnv({ ...env, OBJECT_STORE_BUCKET: '' })).toThrow(
      'OBJECT_STORE_BUCKET is not set',
    )
  })

  test('T-OBJ-UNIT-02 signs a read of one object for the seconds asked, offline', async () => {
    const store = createObjectStoreFromEnv(env)
    const read = await store.signedGet('nutrition/p/m/photo.jpg', 300)
    const url = new URL(read.url)

    expect(url.protocol).toBe('https:')
    expect(url.pathname).toBe('/nutrition/p/m/photo.jpg')
    expect(url.searchParams.get('X-Amz-Expires')).toBe('300')
    expect(read.expiresAt.getTime() - Date.now()).toBeLessThanOrEqual(300_000)
  })

  test('T-OBJ-UNIT-03 a custom endpoint addresses the bucket by path', async () => {
    const store = createObjectStoreFromEnv({
      ...env,
      OBJECT_STORE_ENDPOINT: 'http://127.0.0.1:9000',
    })
    const url = new URL((await store.signedGet('nutrition/k.jpg', 60)).url)

    expect(`${url.host}${url.pathname}`).toBe('127.0.0.1:9000/allfit-private/nutrition/k.jpg')
  })

  test('T-OBJ-UNIT-04 the memory store keeps, signs, removes and fails when told', async () => {
    const store = createMemoryObjectStore()
    await store.put('a', new Uint8Array([1]), 'image/jpeg')
    expect(store.objects.has('a')).toBe(true)
    await store.remove('a')
    expect(store.objects.has('a')).toBe(false)
    store.failNext('put')
    expect(store.put('b', new Uint8Array([1]), 'image/jpeg')).rejects.toBeInstanceOf(
      ObjectStoreError,
    )
  })

  test('T-OBJ-UNIT-06 the memory store gives back what it keeps, and nothing for a key it lacks', async () => {
    const store = createMemoryObjectStore()
    await store.put('body/p/a.jpg', new Uint8Array([7, 8]), 'image/jpeg')
    expect(await store.get('body/p/a.jpg')).toEqual({
      bytes: new Uint8Array([7, 8]),
      contentType: 'image/jpeg',
    })
    expect(await store.get('body/p/missing.jpg')).toBeNull()
    store.failNext('get')
    expect(store.get('body/p/a.jpg')).rejects.toBeInstanceOf(ObjectStoreError)
  })

  test('T-OBJ-UNIT-07 the S3 store reads an object, says when there is none, and fails closed', async () => {
    // A stand-in for the S3 API on this machine: one object, one missing key, one fault.
    const server = Bun.serve({
      port: 0,
      fetch(request) {
        const path = new URL(request.url).pathname
        if (path === '/allfit-private/body/p/a.jpg') {
          return new Response(new Uint8Array([1, 2, 3]), {
            headers: { 'Content-Type': 'image/jpeg' },
          })
        }
        if (path === '/allfit-private/body/p/missing.jpg') {
          return new Response(
            '<?xml version="1.0" encoding="UTF-8"?><Error><Code>NoSuchKey</Code>' +
              '<Message>The specified key does not exist.</Message></Error>',
            { status: 404, headers: { 'Content-Type': 'application/xml' } },
          )
        }
        return new Response('<Error><Code>InternalError</Code></Error>', { status: 500 })
      },
    })
    try {
      const store = createS3ObjectStore({
        bucket: 'allfit-private',
        region: 'us-east-1',
        endpoint: `http://127.0.0.1:${String(server.port)}`,
        accessKeyId: 'AKIAEXAMPLE',
        secretAccessKey: 'secret',
      })
      expect(await store.get('body/p/a.jpg')).toEqual({
        bytes: new Uint8Array([1, 2, 3]),
        contentType: 'image/jpeg',
      })
      expect(await store.get('body/p/missing.jpg')).toBeNull()
      await expect(store.get('body/p/broken.jpg')).rejects.toBeInstanceOf(ObjectStoreError)
    } finally {
      await server.stop(true)
    }
  })

  test('T-OBJ-UNIT-05 a store that does not answer fails in seconds, not minutes', async () => {
    // A non-routable address never answers. Without limits of its own the client kept
    // retrying for 225 s while a meal waited to be saved.
    const store = createS3ObjectStore({
      bucket: 'allfit-private',
      region: 'us-east-1',
      endpoint: 'http://10.255.255.1:9000',
      accessKeyId: 'AKIAEXAMPLE',
      secretAccessKey: 'secret',
      connectTimeoutMs: 150,
      requestTimeoutMs: 300,
    })
    const started = Date.now()
    await expect(store.put('k.jpg', new Uint8Array([1]), 'image/jpeg')).rejects.toBeInstanceOf(
      ObjectStoreError,
    )
    expect(Date.now() - started).toBeLessThan(3000)
  })
})
