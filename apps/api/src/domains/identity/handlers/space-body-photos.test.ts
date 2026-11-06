import { describe, expect, test } from 'bun:test'
import type { VerifiedToken } from '@allfitone/auth-provider'
import { allfitV1ContractManifest, allfitV1ContractSchemas } from '@allfitone/contracts'
import Ajv2020 from 'ajv/dist/2020'
import addFormats from 'ajv-formats'

import type { BodyPhotoService } from '../application/body-photos.js'
import type { SpaceActorResolver } from '../application/space-actor.js'
import type { BodyPhoto, BodyPhotoShare, BodyPhotoShareCommand } from '../domain/body-photos.js'
import { spaceBodyPhotoRoutes } from './space-body-photos.js'

// The DTOs only prove the handler compiles; the published schema proves what the wire carries.
const validator = new Ajv2020({ strict: false, allErrors: true })
addFormats(validator)
validator.addSchema({ $id: 'allfit-v1', components: { schemas: allfitV1ContractSchemas } })

function matchesContract(schemaName: string, projection: unknown): boolean {
  const validate = validator.getSchema(`allfit-v1#/components/schemas/${schemaName}`)
  if (!validate) throw new Error(`The contract declares no schema named ${schemaName}`)
  return validate(projection) === true
}

const PERSON = '019f1000-0000-7000-8000-000000000001'
const PHOTO = '019f1000-0000-7000-8000-0000000000c1'
const RELATIONSHIP = '019f1000-0000-7000-8000-000000000701'
const OTHER_RELATIONSHIP = '019f1000-0000-7000-8000-000000000702'
const kept: BodyPhoto = {
  id: PHOTO,
  taken_on: '2026-10-25',
  created_at: '2026-10-25T12:00:00.000Z',
  photo: { url: 'https://objects.test/x', expires_at: '2026-10-25T12:05:00.000Z', method: 'GET' },
  shared_with: [
    {
      relationship_id: RELATIONSHIP,
      organization_name: 'Gym A',
      shared_at: '2026-10-26T09:00:00.000Z',
    },
  ],
}
const shared: BodyPhotoShare = {
  body_photo_id: PHOTO,
  relationship_id: RELATIONSHIP,
  organization: { id: '019f1000-0000-7000-8000-000000000101', display_name: 'Gym A' },
  status: 'shared',
  shared_at: '2026-10-26T09:00:00.000Z',
  withdrawn_at: null,
}
const withdrawn: BodyPhotoShare = {
  ...shared,
  status: 'withdrawn',
  withdrawn_at: '2026-10-27T09:00:00.000Z',
}
const commanded = {
  authorization: 'Bearer token',
  'content-type': 'application/json',
  'idempotency-key': '2b4f0d4e-2f3c-4c1d-9a4b-6f1e2d3c4b5a',
  'command-id': PHOTO,
}
const body = JSON.stringify({
  taken_on: '2026-10-25',
  photo: { content_type: 'image/jpeg', content: Buffer.from([1, 2, 3]).toString('base64') },
})

const token: VerifiedToken = { subject: 'subject', sessionId: 'sid', surface: 'space' }

function harness(service: Partial<BodyPhotoService> = {}) {
  const actors: SpaceActorResolver = {
    actorFor: async () => ({ accountId: 'account', personId: PERSON }),
    personFor: async () => PERSON,
  }
  return spaceBodyPhotoRoutes(
    {
      record: async () => kept,
      list: async () => ({ data: [kept] }),
      delete: async () => undefined,
      share: async () => ({ share: shared, replayed: false }),
      withdraw: async () => ({ share: withdrawn, replayed: false }),
      ...service,
    },
    async () => token,
    actors,
  )
}

describe('/space/v1/body-photos', () => {
  test('T-IDN-API-BODYPHOTO-10 keeps a photo and answers it signed', async () => {
    const response = await harness().request('/body-photos', {
      method: 'POST',
      headers: commanded,
      body,
    })
    expect(response.status).toBe(201)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(await response.json()).toEqual(kept)
  })

  test('T-IDN-API-BODYPHOTO-11 a plan without photos says which function it lacks', async () => {
    const refused = harness({
      record: async () => {
        throw Object.assign(new Error('this function comes with Pro'), {
          code: 'AF402',
          detail: 'body_photos',
        })
      },
    })
    const response = await refused.request('/body-photos', {
      method: 'POST',
      headers: commanded,
      body,
    })
    expect(response.status).toBe(403)
    expect(await response.json()).toMatchObject({ feature: 'body_photos' })
  })

  test('T-IDN-API-BODYPHOTO-12 refuses a body outside the contract', async () => {
    for (const wrong of [
      JSON.stringify({ taken_on: '2026-10-25' }),
      JSON.stringify({
        taken_on: '2026-02-30',
        photo: { content_type: 'image/jpeg', content: 'AQID' },
      }),
      JSON.stringify({
        taken_on: '2026-10-25',
        photo: { content_type: 'image/gif', content: 'AQID' },
      }),
      JSON.stringify({
        taken_on: '2026-10-25',
        photo: { content_type: 'image/jpeg', content: 'AQID' },
        x: 1,
      }),
    ]) {
      const response = await harness().request('/body-photos', {
        method: 'POST',
        headers: commanded,
        body: wrong,
      })
      expect(response.status).toBe(400)
    }
  })

  test("T-IDN-API-BODYPHOTO-13 lists the person's photos", async () => {
    const response = await harness().request('/body-photos', {
      headers: { authorization: 'Bearer token' },
    })
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ data: [kept] })
  })

  test('T-IDN-API-BODYPHOTO-14 deletes one, and refuses an identifier that is not one', async () => {
    const gone = await harness().request(`/body-photos/${PHOTO}`, {
      method: 'DELETE',
      headers: commanded,
    })
    const wrong = await harness().request('/body-photos/nope', {
      method: 'DELETE',
      headers: commanded,
    })
    expect(gone.status).toBe(204)
    expect(wrong.status).toBe(400)
  })

  test('T-IDN-API-BODYPHOTO-15 nothing without a bearer token', async () => {
    const response = await harness().request('/body-photos', {})
    expect(response.status).toBe(401)
  })

  test('T-IDN-API-BODYPHOTO-16 her list matches the contract, whom she shows each photo to included', () => {
    expect(matchesContract('BodyPhoto', kept)).toBe(true)
    expect(matchesContract('BodyPhoto', { ...kept, shared_with: undefined })).toBe(false)
  })
})

describe('/space/v1/body-photos/{photoId}/shares', () => {
  const sharePath = `/body-photos/${PHOTO}/shares`
  const shareBody = JSON.stringify({ relationship_id: RELATIONSHIP })

  test('T-IDN-API-PHOTOSHARE-01 mounts OP-IDN-061 and OP-IDN-062 as the contract declares them', () => {
    const declared = allfitV1ContractManifest.operations
      .filter((operation) => ['OP-IDN-061', 'OP-IDN-062'].includes(operation.allfitOperation))
      .map((operation) => ({
        route: `${operation.method} ${operation.path.replace('/space/v1', '').replaceAll(/\{([^}]+)\}/g, ':$1')}`,
        security: operation.security,
      }))
    const mounted = harness().routes.map((route) => `${route.method} ${route.path}`)
    expect(declared.map(({ route }) => route).filter((route) => !mounted.includes(route))).toEqual(
      [],
    )
    expect(declared.map(({ security }) => security)).toEqual([['bearerAuth'], ['bearerAuth']])
  })

  test('T-IDN-API-PHOTOSHARE-02 shows a photo to one of her relationships, as herself', async () => {
    const calls: BodyPhotoShareCommand[] = []
    const response = await harness({
      share: async (input) => {
        calls.push(input)
        return { share: shared, replayed: false }
      },
    }).request(sharePath, { method: 'PUT', headers: commanded, body: shareBody })

    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(response.headers.get('idempotent-replay')).toBeNull()
    const answer = await response.json()
    expect(answer).toEqual(shared)
    expect(matchesContract('BodyPhotoShare', answer)).toBe(true)
    expect(calls).toHaveLength(1)
    expect(calls[0]).toMatchObject({
      personId: PERSON,
      photoId: PHOTO,
      relationshipId: RELATIONSHIP,
      idempotencyKey: commanded['idempotency-key'],
      commandId: PHOTO,
    })
  })

  test('T-IDN-PHOTOSHARE-IDEM-01 a replay says so, and the request hash names the relationship', async () => {
    const hashes: string[] = []
    const routes = harness({
      share: async (input) => {
        hashes.push(Buffer.from(input.requestHash).toString('hex'))
        return { share: shared, replayed: true }
      },
    })
    const replay = await routes.request(sharePath, {
      method: 'PUT',
      headers: commanded,
      body: shareBody,
    })
    await routes.request(sharePath, { method: 'PUT', headers: commanded, body: shareBody })
    await routes.request(sharePath, {
      method: 'PUT',
      headers: commanded,
      body: JSON.stringify({ relationship_id: OTHER_RELATIONSHIP }),
    })

    expect(replay.headers.get('idempotent-replay')).toBe('true')
    expect(hashes[0]).toBe(hashes[1])
    expect(hashes[2]).not.toBe(hashes[0])
  })

  test('T-IDN-API-PHOTOSHARE-03 refuses a body, a path or headers outside the contract before anything runs', async () => {
    let reached = 0
    const routes = harness({
      share: async () => {
        reached += 1
        return { share: shared, replayed: false }
      },
    })
    const cases: Array<[string, RequestInit, number]> = [
      [sharePath, { method: 'PUT', headers: commanded, body: '{}' }, 400],
      [
        sharePath,
        { method: 'PUT', headers: commanded, body: JSON.stringify({ relationship_id: 'gym' }) },
        400,
      ],
      [
        sharePath,
        {
          method: 'PUT',
          headers: commanded,
          body: JSON.stringify({ relationship_id: RELATIONSHIP, organization_id: RELATIONSHIP }),
        },
        400,
      ],
      ['/body-photos/nope/shares', { method: 'PUT', headers: commanded, body: shareBody }, 400],
      [
        sharePath,
        {
          method: 'PUT',
          headers: { ...commanded, 'command-id': 'not-a-command' },
          body: shareBody,
        },
        400,
      ],
      [
        sharePath,
        { method: 'PUT', headers: { ...commanded, 'content-type': 'text/plain' }, body: shareBody },
        415,
      ],
      [
        sharePath,
        { method: 'PUT', headers: { 'content-type': 'application/json' }, body: shareBody },
        401,
      ],
    ]
    for (const [path, init, status] of cases) {
      expect((await routes.request(path, init)).status).toBe(status)
    }
    expect(reached).toBe(0)
  })

  test('T-IDN-API-PHOTOSHARE-04 a photo or relationship that is not hers is not found; an ended one conflicts', async () => {
    const failing = (code: string) =>
      harness({
        share: async () => {
          throw Object.assign(new Error('database failure'), { code })
        },
      })
    const request = { method: 'PUT', headers: commanded, body: shareBody }

    expect((await failing('P0002').request(sharePath, request)).status).toBe(404)
    expect((await failing('55000').request(sharePath, request)).status).toBe(409)
    expect((await failing('23505').request(sharePath, request)).status).toBe(409)
    expect((await failing('42501').request(sharePath, request)).status).toBe(403)
  })

  test('T-IDN-API-PHOTOSHARE-05 takes a photo back from one relationship', async () => {
    const calls: BodyPhotoShareCommand[] = []
    const response = await harness({
      withdraw: async (input) => {
        calls.push(input)
        return { share: withdrawn, replayed: true }
      },
    }).request(`${sharePath}/${RELATIONSHIP}`, { method: 'DELETE', headers: commanded })

    expect(response.status).toBe(200)
    expect(response.headers.get('idempotent-replay')).toBe('true')
    const answer = await response.json()
    expect(answer).toEqual(withdrawn)
    expect(matchesContract('BodyPhotoShare', answer)).toBe(true)
    expect(calls[0]).toMatchObject({
      personId: PERSON,
      photoId: PHOTO,
      relationshipId: RELATIONSHIP,
    })
  })

  test('T-IDN-API-PHOTOSHARE-06 taking back what was never shown is not found, and a bad id never runs', async () => {
    let reached = 0
    const routes = harness({
      withdraw: async () => {
        reached += 1
        throw Object.assign(new Error('nothing to withdraw'), { code: 'P0002' })
      },
    })
    const missing = await routes.request(`${sharePath}/${RELATIONSHIP}`, {
      method: 'DELETE',
      headers: commanded,
    })
    const wrong = await routes.request(`${sharePath}/gym`, { method: 'DELETE', headers: commanded })

    expect(missing.status).toBe(404)
    expect(wrong.status).toBe(400)
    expect(reached).toBe(1)
  })
})
