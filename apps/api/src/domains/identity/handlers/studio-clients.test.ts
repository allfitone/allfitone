/**
 * `T-IDN-AUTHORIZED-API` over HTTP — what a client shares, read by the coach who attends her.
 *
 * Whom the coach attends, what she shares and which fields its version carries are
 * PostgreSQL's answers (`T-IDN-AUTHORIZED-01`, `T-IDN-PHOTO-SHARE-01`). What these hold
 * is the route's own part: it serves the Studio web origin with its session cookie,
 * carries the coach and a fresh request id through, answers in the contract's shape, and
 * streams a photo itself, never as an address, without saying more than the database did.
 */

import { beforeEach, describe, expect, test } from 'bun:test'
import { allfitV1ContractManifest, allfitV1ContractSchemas } from '@allfitone/contracts'
import { ObjectStoreError } from '@allfitone/object-store'
import Ajv2020 from 'ajv/dist/2020'
import addFormats from 'ajv-formats'
import { Hono } from 'hono'

import { createApp } from '../../../application.js'
import type { StudioSessionService } from '../application/index.js'
import type {
  ClientBodyPhoto,
  ClientBodyProgressRecord,
  ClientHealthContextClaim,
  ClientTrainingProfile,
  StudioClientDataService,
} from '../application/studio-client-data.js'
import { studioClientDataRoutes } from './studio-clients.js'

// The DTOs only prove the handler compiles; the published schema proves what the wire carries.
const validator = new Ajv2020({ strict: false, allErrors: true })
addFormats(validator)
validator.addSchema({ $id: 'allfit-v1', components: { schemas: allfitV1ContractSchemas } })

function assertMatchesContract(schemaName: string, projection: unknown): void {
  const validate = validator.getSchema(`allfit-v1#/components/schemas/${schemaName}`)
  if (!validate) throw new Error(`The contract declares no schema named ${schemaName}`)
  if (validate(projection)) return
  const failures = (validate.errors ?? [])
    .map((error) => `${error.instancePath || '/'} ${error.message ?? 'is invalid'}`)
    .join('; ')
  throw new Error(`${schemaName} violates the contract: ${failures}`)
}

const OPERATIONS = ['OP-IDN-018', 'OP-IDN-019', 'OP-IDN-020', 'OP-IDN-059', 'OP-IDN-060']
const COACH = '019f4900-0000-7000-8000-000000000012'
const ORGANIZATION = '019f4900-0000-7000-8000-000000000101'
const CLIENT = '019f4900-0000-7000-8000-000000000001'
const PHOTO = '019f4900-0000-7000-8000-000000000e01'
const BASE = `/studio/v1/organizations/${ORGANIZATION}/clients/${CLIENT}`
const HEADERS = { origin: 'https://studio.example.test', cookie: 'allfit_studio_session=opaque' }
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

const PROFILE: ClientTrainingProfile = {
  applied_scope: { code: 'relationship_training', version: 4 },
  biological_sex: { value: 'female', provenance: 'person_declared' },
  attributes: [
    {
      id: '019f4900-0000-7000-8000-000000000c03',
      attribute_code: 'training_experience',
      value_text: 'experienced',
      value_numeric: null,
      unit_code: null,
      provenance: 'professional_observation',
      valid_from: '2026-10-31T10:00:00.000+00:00',
    },
  ],
}
const MEASUREMENT: ClientBodyProgressRecord = {
  id: '019f4900-0000-7000-8000-000000000b01',
  metric_code: 'body_weight',
  value: 70,
  unit_code: 'kg',
  original_value: 154.32,
  original_unit_code: 'lb',
  measured_on: '2026-11-04',
}
const SHOWN: ClientBodyPhoto = {
  id: PHOTO,
  taken_on: '2026-11-02',
  shared_at: '2026-11-03T09:00:00.000+00:00',
}
const DECLARED: ClientHealthContextClaim = {
  id: '019f4900-0000-7000-8000-000000000d01',
  context_type: 'pain',
  description: 'Me duele al bajar escaleras',
  body_area: 'knee',
  provenance: 'person_declared',
  valid_from: '2026-10-31T10:00:00.123+00:00',
  valid_to: null,
}
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3])

type Call = { operation: string; input: Record<string, unknown> }

function data(calls: Call[], overrides: Partial<StudioClientDataService> = {}) {
  const record = (operation: string, input: object) =>
    calls.push({ operation, input: { ...input } })
  const service: StudioClientDataService = {
    profile: async (input) => {
      record('profile', input)
      return { outcome: 'found', value: PROFILE }
    },
    bodyProgress: async (input) => {
      record('bodyProgress', input)
      return {
        outcome: 'found',
        value: {
          appliedScope: { code: 'body_progress', version: 2 },
          items: [MEASUREMENT],
          hasMore: false,
        },
      }
    },
    bodyPhotos: async (input) => {
      record('bodyPhotos', input)
      return {
        outcome: 'found',
        value: {
          appliedScope: { code: 'body_progress', version: 3 },
          items: [SHOWN],
          hasMore: false,
        },
      }
    },
    healthContext: async (input) => {
      record('healthContext', input)
      return {
        outcome: 'found',
        value: {
          appliedScope: { code: 'health_context', version: 1 },
          items: [DECLARED],
          hasMore: true,
          nextCursor: { key: DECLARED.valid_from, id: DECLARED.id },
        },
      }
    },
    bodyPhotoContent: async (input) => {
      record('bodyPhotoContent', input)
      return { bytes: JPEG, contentType: 'application/octet-stream' }
    },
    ...overrides,
  }
  return service
}

function sessionService(): StudioSessionService {
  const unused = async (): Promise<never> => {
    throw new Error('This session operation is outside the client data test')
  }
  return {
    completeCode: unused,
    readSession: unused,
    resolveActor: async () => ({
      accountId: '019d0000-0000-7000-8000-000000000002',
      personId: COACH,
    }),
    resolveAccountIdentity: unused,
    logout: unused,
  }
}

function app(service: StudioClientDataService): Hono {
  const routes = new Hono()
  routes.route('/studio/v1', studioClientDataRoutes(service, sessionService()))
  return routes
}

const databaseError = (code: string) => Object.assign(new Error('database failure'), { code })
const refused = (code: string) =>
  ({ outcome: 'scope_required', requiredScope: { code, level: 'read' } }) as const

beforeEach(() => {
  process.env.STUDIO_WEB_URL = 'https://studio.example.test'
  process.env.BACKOFFICE_WEB_URL = 'https://backoffice.example.test'
  process.env.API_PUBLIC_URL = 'https://api.example.test'
})

describe('the client data surface honours the contract', () => {
  test('T-IDN-AUTHORIZED-API-HTTP-01 mounts the five operations as the contract declares them', () => {
    const declared = allfitV1ContractManifest.operations
      .filter((operation) => OPERATIONS.includes(operation.allfitOperation))
      .map((operation) => `${operation.method} ${operation.path.replaceAll(/\{([^}]+)\}/g, ':$1')}`)
    const contract = declared.map((route) => route.replace('/studio/v1', '')).sort()
    const mounted = studioClientDataRoutes(data([]), sessionService())
      .routes.filter((route) => route.method !== 'ALL')
      .map((route) => `${route.method} ${route.path}`)
      .sort()
    expect(mounted).toEqual(contract)
    expect(
      allfitV1ContractManifest.operations
        .filter((operation) => OPERATIONS.includes(operation.allfitOperation))
        .map((operation) => operation.security),
    ).toEqual(OPERATIONS.map(() => ['cookieAuth']))
    // And the application serves them, not only the router.
    const application = createApp().routes.map((route) => `${route.method} ${route.path}`)
    expect(declared.filter((route) => !application.includes(route))).toEqual([])
  })
})

describe('OP-IDN-018: her training profile', () => {
  test('T-IDN-AUTHORIZED-API-HTTP-02 reads as the coach, for the client in the path, under a fresh request', async () => {
    const calls: Call[] = []
    const response = await app(data(calls)).request(`${BASE}/profile`, { headers: HEADERS })

    expect(response.status).toBe(200)
    expect(response.headers.get('Cache-Control')).toBe('private, no-store')
    const body = await response.json()
    assertMatchesContract('ClientTrainingProfile', body)
    expect(body).toEqual(PROFILE)
    expect(calls[0]?.input).toMatchObject({
      personId: COACH,
      organizationId: ORGANIZATION,
      subjectPersonId: CLIENT,
    })
    expect(calls[0]?.input.requestId).toMatch(UUID_V4)
  })

  test('T-IDN-AUTHORIZED-API-HTTP-03 the contract has room for a field the version hides, and none for a body or health one', () => {
    const hidden = { ...PROFILE.attributes[0], provenance: null, valid_from: null }
    assertMatchesContract('ClientTrainingProfile', {
      ...PROFILE,
      biological_sex: null,
      attributes: [hidden],
    })
    expect(() =>
      assertMatchesContract('ClientTrainingProfile', { ...PROFILE, body_weight: 70 }),
    ).toThrow()
    expect(() =>
      assertMatchesContract('ClientTrainingProfile', {
        ...PROFILE,
        attributes: [{ ...PROFILE.attributes[0], pain: 'knee' }],
      }),
    ).toThrow()
  })

  test('T-IDN-AUTHORIZED-API-HTTP-04 with nothing shared the answer names the category it needs', async () => {
    const response = await app(
      data([], { profile: async () => refused('relationship_training') }),
    ).request(`${BASE}/profile`, { headers: HEADERS })
    expect(response.status).toBe(403)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    expect(await response.json()).toMatchObject({
      type: 'https://errors.allfit.invalid/scope-required',
      required_scope: { code: 'relationship_training', level: 'read' },
    })
  })
})

describe('OP-IDN-019, OP-IDN-059 and OP-IDN-020: her lists', () => {
  const lists = [
    ['body-progress', 'bodyProgress', 'ClientBodyProgressPage', 'body_progress'],
    ['body-photos', 'bodyPhotos', 'ClientBodyPhotoPage', 'body_progress'],
    ['health-context', 'healthContext', 'ClientHealthContextPage', 'health_context'],
  ] as const

  test('T-IDN-AUTHORIZED-API-HTTP-05 each list answers in its contract shape, as the coach and for her', async () => {
    for (const [path, operation, schema] of lists) {
      const calls: Call[] = []
      const response = await app(data(calls)).request(`${BASE}/${path}`, { headers: HEADERS })
      expect(response.status).toBe(200)
      expect(response.headers.get('Cache-Control')).toBe('private, no-store')
      assertMatchesContract(schema, await response.json())
      expect(calls).toHaveLength(1)
      expect(calls[0]?.operation).toBe(operation)
      expect(calls[0]?.input).toMatchObject({
        personId: COACH,
        organizationId: ORGANIZATION,
        subjectPersonId: CLIENT,
        limit: 25,
      })
      expect(calls[0]?.input.requestId).toMatch(UUID_V4)
    }
  })

  test('T-IDN-AUTHORIZED-API-HTTP-06 a page names the version it used and the next one starts where the cursor says', async () => {
    const calls: Call[] = []
    const routes = app(data(calls))
    const first = await routes.request(`${BASE}/health-context?limit=1`, { headers: HEADERS })
    const body = (await first.json()) as {
      applied_scope: unknown
      data: unknown[]
      page: { next_cursor: string; has_more: boolean }
    }
    expect(body.applied_scope).toEqual({ code: 'health_context', version: 1 })
    expect(body.data).toEqual([DECLARED])
    expect(body.page.has_more).toBe(true)

    await routes.request(`${BASE}/health-context?limit=1&cursor=${body.page.next_cursor}`, {
      headers: HEADERS,
    })
    expect(calls[1]?.input).toMatchObject({
      limit: 1,
      cursor: { key: DECLARED.valid_from, id: DECLARED.id },
    })
    expect(calls[1]?.input.requestId).not.toBe(calls[0]?.input.requestId)
  })

  test('T-IDN-AUTHORIZED-API-HTTP-07 a page size or cursor outside the contract is refused before anything runs', async () => {
    const calls: Call[] = []
    const cursor = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url')
    const wrong = [
      ['body-progress', 'limit=0'],
      ['body-progress', 'limit=101'],
      ['body-photos', 'limit=ten'],
      ['health-context', 'cursor=not-a-cursor-at-all'],
      ['body-progress', `cursor=${cursor({ key: '2026-02-30', id: MEASUREMENT.id })}`],
      ['body-photos', `cursor=${cursor({ key: '2026-11-02T10:00:00Z', id: PHOTO })}`],
      ['health-context', `cursor=${cursor({ key: 'yesterday', id: DECLARED.id })}`],
      ['health-context', `cursor=${cursor({ key: DECLARED.valid_from, id: 'someone' })}`],
    ]
    for (const [path, query] of wrong) {
      const response = await app(data(calls)).request(`${BASE}/${path}?${query}`, {
        headers: HEADERS,
      })
      expect(response.status).toBe(422)
    }
    expect(calls).toHaveLength(0)
  })

  test('T-IDN-AUTHORIZED-API-HTTP-08 with nothing shared each list names its category', async () => {
    for (const [path, operation, , scope] of lists) {
      const response = await app(data([], { [operation]: async () => refused(scope) })).request(
        `${BASE}/${path}`,
        { headers: HEADERS },
      )
      expect(response.status).toBe(403)
      expect(await response.json()).toMatchObject({
        required_scope: { code: scope, level: 'read' },
      })
    }
  })

  test('T-IDN-AUTHORIZED-API-HTTP-09 a photo in the list is a day and when she showed it, never where it is kept', () => {
    expect(() =>
      assertMatchesContract('ClientBodyPhotoPage', {
        applied_scope: { code: 'body_progress', version: 3 },
        data: [{ ...SHOWN, media_ref: 'body/x.jpg' }],
        page: { has_more: false, next_cursor: null },
      }),
    ).toThrow()
    expect(() =>
      assertMatchesContract('ClientBodyPhotoPage', {
        applied_scope: { code: 'body_progress', version: 3 },
        data: [{ ...SHOWN, url: 'https://objects.test/x' }],
        page: { has_more: false, next_cursor: null },
      }),
    ).toThrow()
  })
})

describe('OP-IDN-060: one photo', () => {
  const path = `${BASE}/body-photos/${PHOTO}/content`

  test('T-IDN-AUTHORIZED-API-HTTP-10 streams the image itself, never an address, and keeps nothing', async () => {
    const calls: Call[] = []
    const response = await app(data(calls)).request(path, { headers: HEADERS })

    expect(response.status).toBe(200)
    expect(response.headers.get('Content-Type')).toBe('image/jpeg')
    expect(response.headers.get('Cache-Control')).toBe('private, no-store')
    expect(response.headers.get('Content-Disposition')).toBe('inline')
    expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff')
    expect(response.headers.get('Location')).toBeNull()
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(JPEG)
    expect(calls[0]?.input).toMatchObject({
      personId: COACH,
      organizationId: ORGANIZATION,
      subjectPersonId: CLIENT,
      photoId: PHOTO,
    })
    expect(calls[0]?.input.requestId).toMatch(UUID_V4)
  })

  test('T-IDN-AUTHORIZED-API-HTTP-11 every request asks again: the photo she took back is not found next time', async () => {
    let shown = true
    const calls: Call[] = []
    const routes = app(
      data(calls, {
        bodyPhotoContent: async (input) => {
          calls.push({ operation: 'bodyPhotoContent', input: { ...input } })
          return shown ? { bytes: JPEG, contentType: 'image/jpeg' } : null
        },
      }),
    )
    expect((await routes.request(path, { headers: HEADERS })).status).toBe(200)
    shown = false
    const gone = await routes.request(path, { headers: HEADERS })
    expect(gone.status).toBe(404)
    expect(gone.headers.get('Cache-Control')).toBe('no-store')
    expect(await gone.json()).not.toHaveProperty('required_scope')
    expect(calls).toHaveLength(2)
  })

  test('T-IDN-AUTHORIZED-API-HTTP-12 a store that fails is an outage, not a photo', async () => {
    const response = await app(
      data([], {
        bodyPhotoContent: async () => {
          throw new ObjectStoreError('get', new Error('timeout'))
        },
      }),
    ).request(path, { headers: HEADERS })
    expect(response.status).toBe(503)
  })
})

describe('what reaches no read', () => {
  test('T-IDN-AUTHORIZED-API-HTTP-13 another origin, no cookie or an id that is not one never reaches the database', async () => {
    const calls: Call[] = []
    const routes = app(data(calls))

    const foreign = await routes.request(`${BASE}/profile`, {
      headers: { ...HEADERS, origin: 'https://evil.example.test' },
    })
    expect(foreign.status).toBe(403)
    const noOrigin = await routes.request(`${BASE}/body-photos/${PHOTO}/content`, {
      headers: { cookie: HEADERS.cookie },
    })
    expect(noOrigin.status).toBe(403)
    const anonymous = await routes.request(`${BASE}/health-context`, {
      headers: { origin: HEADERS.origin },
    })
    expect(anonymous.status).toBe(401)
    const badClient = await routes.request(
      `/studio/v1/organizations/${ORGANIZATION}/clients/someone/profile`,
      { headers: HEADERS },
    )
    expect(badClient.status).toBe(400)
    const badPhoto = await routes.request(`${BASE}/body-photos/not-an-id/content`, {
      headers: HEADERS,
    })
    expect(badPhoto.status).toBe(400)

    expect(calls).toHaveLength(0)
  })

  test('T-IDN-AUTHORIZED-API-HTTP-14 nobody who does not attend her learns she is a client; a non-member is forbidden', async () => {
    for (const [code, status] of [
      ['P0002', 404],
      ['42501', 403],
      ['22023', 422],
    ] as const) {
      const failing = data([], {
        profile: async () => {
          throw databaseError(code)
        },
        bodyPhotoContent: async () => {
          throw databaseError(code)
        },
      })
      expect((await app(failing).request(`${BASE}/profile`, { headers: HEADERS })).status).toBe(
        status,
      )
      expect(
        (await app(failing).request(`${BASE}/body-photos/${PHOTO}/content`, { headers: HEADERS }))
          .status,
      ).toBe(status)
    }
    const down = data([], {
      healthContext: async () => {
        throw new Error('connection reset')
      },
    })
    expect((await app(down).request(`${BASE}/health-context`, { headers: HEADERS })).status).toBe(
      503,
    )
  })
})
