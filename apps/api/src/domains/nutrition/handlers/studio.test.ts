/**
 * `T-NUT-STUDIO-API` over HTTP — a client's nutrition, read and guided by the coach who
 * attends her (HU-STUDIO-068..072).
 *
 * Whom the coach attends, what she shares, his credential and the access record are
 * PostgreSQL's answers (`T-NUT-STUDIO-01`, `T-NUT-STUDIO-02`). What these hold is the
 * route's own part: it serves the Studio web origin with its session cookie, carries the
 * coach and a fresh request id through, checks the shape of what it is sent, answers in
 * the contract's shape, and streams a photo itself without saying more than the database.
 */

import { beforeEach, describe, expect, test } from 'bun:test'
import { allfitV1ContractManifest, allfitV1ContractSchemas } from '@allfitone/contracts'
import { ObjectStoreError } from '@allfitone/object-store'
import Ajv2020 from 'ajv/dist/2020'
import addFormats from 'ajv-formats'
import { Hono } from 'hono'

import { createApp } from '../../../application.js'
import type { StudioSessionService } from '../../identity/index.js'
import type {
  ClientNutritionGoalVersion,
  ClientNutritionMeal,
  ProfessionalGoalCreate,
  StudioNutritionService,
} from '../application/studio.js'
import { studioNutritionRoutes } from './studio.js'

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

const OPERATIONS = ['OP-NUT-009', 'OP-NUT-010', 'OP-NUT-011', 'OP-NUT-012', 'OP-NUT-013']
const COACH = '019f6100-0000-7000-8000-000000000012'
const ORGANIZATION = '019f6100-0000-7000-8000-000000000101'
const CLIENT = '019f6100-0000-7000-8000-000000000001'
const MEAL = '019f6100-0000-7000-8000-000000000a01'
const PROPOSAL = '019f6100-0000-7000-8000-000000000c01'
const BASE = `/studio/v1/organizations/${ORGANIZATION}/clients/${CLIENT}/nutrition`
const HEADERS = { origin: 'https://studio.example.test', cookie: 'allfit_studio_session=opaque' }
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
const COMMAND = {
  'content-type': 'application/json',
  'idempotency-key': '5d1a1c4e-2b3d-4c5e-9f60-7a8b9c0d1e2f',
  'command-id': PROPOSAL,
}

const MEAL_ROW: ClientNutritionMeal = {
  id: MEAL,
  occurred_at: '2026-11-07T12:30:00.123456+00:00',
  local_date: '2026-11-07',
  timezone: 'America/Bogota',
  meal_type: 'lunch',
  note: null,
  has_photo: true,
  items: [
    {
      position: 1,
      name: 'Pollo con arroz',
      quantity: 320,
      quantity_unit: 'g',
      serving: null,
      origin: 'typed',
      nutrients: [{ nutrient_code: 'protein', value: 42, unit: 'g' }],
    },
  ],
}
const PROTEIN = {
  nutrient_code: 'protein',
  mode: 'minimum',
  minimum: 140,
  maximum: null,
  exact: null,
  unit: 'g',
} as const
const PROPOSED: ClientNutritionGoalVersion = {
  id: PROPOSAL,
  status: 'proposed',
  rationale: 'Para tu fase de definición',
  author: { kind: 'professional', person_id: COACH },
  targets: [PROTEIN],
  created_at: '2026-11-07T10:00:00.654321+00:00',
  activated_at: null,
  cancelled_at: null,
  decision: null,
}
const BODY: ProfessionalGoalCreate = { rationale: 'Para tu fase de definición', targets: [PROTEIN] }
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3])

type Call = { operation: string; input: Record<string, unknown> }

function nutrition(calls: Call[], overrides: Partial<StudioNutritionService> = {}) {
  const record = (operation: string, input: object) =>
    calls.push({ operation, input: { ...input } })
  const service: StudioNutritionService = {
    meals: async (input) => {
      record('meals', input)
      return {
        outcome: 'found',
        value: {
          appliedScope: { code: 'nutrition_intake', version: 3 },
          photoScope: { code: 'nutrition_media', version: 1 },
          items: [MEAL_ROW],
          hasMore: true,
          nextCursor: { at: MEAL_ROW.occurred_at, id: MEAL },
        },
      }
    },
    dailySummaries: async (input) => {
      record('dailySummaries', input)
      return {
        outcome: 'found',
        value: {
          appliedScope: { code: 'nutrition_intake', version: 3 },
          days: [
            {
              local_date: '2026-11-07',
              meal_count: 2,
              nutrient_totals: [{ nutrient_code: 'energy', value: 1840, unit: 'kcal' }],
            },
            { local_date: '2026-11-08', meal_count: 0, nutrient_totals: [] },
          ],
        },
      }
    },
    goalVersions: async (input) => {
      record('goalVersions', input)
      return {
        outcome: 'found',
        value: {
          appliedScope: { code: 'nutrition_guidance', version: 2 },
          items: [PROPOSED],
          active: {
            goal_version_id: null,
            from_this_relationship: false,
            activated_at: '2026-10-01T10:00:00+00:00',
            targets: [PROTEIN],
          },
          hasMore: false,
        },
      }
    },
    proposeGoal: async (input) => {
      record('proposeGoal', input)
      return { resource: PROPOSED, replayed: false }
    },
    mealPhoto: async (input) => {
      record('mealPhoto', input)
      return { bytes: JPEG, contentType: 'application/octet-stream' }
    },
    ...overrides,
  }
  return service
}

function sessionService(): StudioSessionService {
  const unused = async (): Promise<never> => {
    throw new Error('This session operation is outside the client nutrition test')
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

function app(service: StudioNutritionService): Hono {
  const routes = new Hono()
  routes.route('/studio/v1', studioNutritionRoutes(service, sessionService()))
  return routes
}

const databaseError = (code: string, detail?: string) =>
  Object.assign(new Error('database failure'), { code, ...(detail ? { detail } : {}) })
const failing = (error: unknown) => async (): Promise<never> => {
  throw error
}
const refused = (code: string) =>
  ({ outcome: 'scope_required', requiredScope: { code, level: 'read' } }) as const

function propose(service: StudioNutritionService, body: unknown, headers = COMMAND) {
  return app(service).request(`${BASE}/goals/versions`, {
    method: 'POST',
    headers: { ...HEADERS, ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
}

beforeEach(() => {
  process.env.STUDIO_WEB_URL = 'https://studio.example.test'
  process.env.BACKOFFICE_WEB_URL = 'https://backoffice.example.test'
  process.env.API_PUBLIC_URL = 'https://api.example.test'
})

describe('the client nutrition surface honours the contract', () => {
  test('T-NUT-STUDIO-API-01 mounts the five live operations as the contract declares them', () => {
    const declared = allfitV1ContractManifest.operations
      .filter(
        (operation) =>
          OPERATIONS.includes(operation.allfitOperation) && operation.path.includes('/clients/'),
      )
      .map((operation) => `${operation.method} ${operation.path.replaceAll(/\{([^}]+)\}/g, ':$1')}`)
    const contract = declared.map((route) => route.replace('/studio/v1', '')).sort()
    const mounted = studioNutritionRoutes(nutrition([]), sessionService())
      .routes.filter((route) => route.method !== 'ALL')
      .map((route) => `${route.method} ${route.path}`)
      .sort()
    expect(contract).toHaveLength(5)
    expect(mounted).toEqual(contract)
    expect(
      allfitV1ContractManifest.operations
        .filter((operation) => OPERATIONS.includes(operation.allfitOperation))
        .map((operation) => operation.security),
    ).toEqual(OPERATIONS.concat('OP-NUT-011').map(() => ['cookieAuth']))
    // And the application serves them, not only the router.
    const application = createApp().routes.map((route) => `${route.method} ${route.path}`)
    expect(declared.filter((route) => !application.includes(route))).toEqual([])
  })

  test('T-NUT-STUDIO-API-02 serves only the Studio origin with its session cookie', async () => {
    const calls: Call[] = []
    const elsewhere = await app(nutrition(calls)).request(
      `${BASE}/meals?from=2026-11-01&to=2026-11-07`,
      { headers: { ...HEADERS, origin: 'https://evil.example.test' } },
    )
    expect(elsewhere.status).toBe(403)
    const anonymous = await app(nutrition(calls)).request(
      `${BASE}/meals?from=2026-11-01&to=2026-11-07`,
      { headers: { origin: HEADERS.origin } },
    )
    expect(anonymous.status).toBe(401)
    expect(anonymous.headers.get('cache-control')).toBe('no-store')
    const malformed = await app(nutrition(calls)).request(
      `/studio/v1/organizations/${ORGANIZATION}/clients/not-a-person/nutrition/meals?from=2026-11-01&to=2026-11-07`,
      { headers: HEADERS },
    )
    expect(malformed.status).toBe(400)
    expect(calls).toEqual([])
  })
})

describe('OP-NUT-009: her meals', () => {
  test('T-NUT-STUDIO-API-03 carries the coach, a fresh request id, the range and the page', async () => {
    const calls: Call[] = []
    const cursor = Buffer.from(
      JSON.stringify({ at: '2026-11-08T08:00:00.5+00:00', id: MEAL }),
    ).toString('base64url')
    const response = await app(nutrition(calls)).request(
      `${BASE}/meals?from=2026-11-01&to=2026-11-07&limit=10&cursor=${cursor}`,
      { headers: HEADERS },
    )

    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    const body = (await response.json()) as { page: { next_cursor: string } }
    assertMatchesContract('ClientNutritionMealPage', body)
    expect(body).toMatchObject({
      applied_scope: { code: 'nutrition_intake', version: 3 },
      photo_scope: { code: 'nutrition_media', version: 1 },
      data: [MEAL_ROW],
      page: { has_more: true },
    })
    // The next page starts at the exact instant PostgreSQL gave, microseconds included.
    expect(JSON.parse(Buffer.from(body.page.next_cursor, 'base64url').toString('utf8'))).toEqual({
      at: MEAL_ROW.occurred_at,
      id: MEAL,
    })
    expect(calls).toHaveLength(1)
    expect(calls[0]?.operation).toBe('meals')
    const input = calls[0]?.input ?? {}
    expect(input).toMatchObject({
      personId: COACH,
      organizationId: ORGANIZATION,
      subjectPersonId: CLIENT,
      from: '2026-11-01',
      to: '2026-11-07',
      limit: 10,
      cursor: { at: '2026-11-08T08:00:00.5+00:00', id: MEAL },
    })
    expect(String(input.requestId)).toMatch(UUID_V4)
  })

  test('T-NUT-STUDIO-API-04 a range that is missing, reversed, impossible or past 31 days is 422', async () => {
    const calls: Call[] = []
    for (const query of [
      '',
      'from=2026-11-01',
      'from=2026-11-07&to=2026-11-01',
      'from=2026-02-27&to=2026-02-30',
      'from=2026-10-01&to=2026-11-01',
      'from=2026-11-01&to=2026-11-07&limit=0',
      'from=2026-11-01&to=2026-11-07&limit=101',
      'from=2026-11-01&to=2026-11-07&cursor=bm90LWEtY3Vyc29y',
    ]) {
      const response = await app(nutrition(calls)).request(`${BASE}/meals?${query}`, {
        headers: HEADERS,
      })
      expect({ query, status: response.status }).toEqual({ query, status: 422 })
    }
    // Thirty-one days, both ends included, is the widest range.
    const widest = await app(nutrition(calls)).request(
      `${BASE}/meals?from=2026-10-01&to=2026-10-31`,
      { headers: HEADERS },
    )
    expect(widest.status).toBe(200)
    expect(calls).toHaveLength(1)
  })

  test('T-NUT-STUDIO-API-05 nothing shared names the scope; a client not attended is not there', async () => {
    const none = await app(
      nutrition([], { meals: async () => refused('nutrition_intake') }),
    ).request(`${BASE}/meals?from=2026-11-01&to=2026-11-07`, { headers: HEADERS })
    expect(none.status).toBe(403)
    expect(await none.json()).toMatchObject({
      type: 'https://errors.allfit.invalid/scope-required',
      required_scope: { code: 'nutrition_intake', level: 'read' },
    })
    expect(none.headers.get('cache-control')).toBe('no-store')

    for (const [code, status] of [
      ['P0002', 404],
      ['42501', 403],
      ['22023', 422],
      ['XX000', 503],
    ] as const) {
      const response = await app(nutrition([], { meals: failing(databaseError(code)) })).request(
        `${BASE}/meals?from=2026-11-01&to=2026-11-07`,
        { headers: HEADERS },
      )
      expect({ code, status: response.status }).toEqual({ code, status })
    }
  })
})

describe('OP-NUT-013: one meal photo', () => {
  test('T-NUT-STUDIO-API-06 streams the photo as JPEG, never cached, never sniffed', async () => {
    const calls: Call[] = []
    const response = await app(nutrition(calls)).request(`${BASE}/meals/${MEAL}/photo`, {
      headers: HEADERS,
    })

    expect(response.status).toBe(200)
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(JPEG)
    expect(response.headers.get('content-type')).toBe('image/jpeg')
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect(response.headers.get('content-disposition')).toBe('inline')
    expect(response.headers.get('x-content-type-options')).toBe('nosniff')
    expect(response.headers.get('location')).toBeNull()
    expect(calls[0]?.input).toMatchObject({
      personId: COACH,
      subjectPersonId: CLIENT,
      mealId: MEAL,
    })
    expect(String(calls[0]?.input.requestId)).toMatch(UUID_V4)
  })

  test('T-NUT-STUDIO-API-07 anything short of a photo she shares is the same 404', async () => {
    for (const mealPhoto of [
      async () => null,
      failing(databaseError('P0002')),
      failing(databaseError('42501')),
    ]) {
      const response = await app(nutrition([], { mealPhoto })).request(
        `${BASE}/meals/${MEAL}/photo`,
        { headers: HEADERS },
      )
      expect(response.status).toBe(404)
      expect(response.headers.get('content-type')).toContain('application/problem+json')
      expect(response.headers.get('cache-control')).toBe('no-store')
    }
    const store = await app(
      nutrition([], { mealPhoto: failing(new ObjectStoreError('get', 'down')) }),
    ).request(`${BASE}/meals/${MEAL}/photo`, { headers: HEADERS })
    expect(store.status).toBe(503)
    const malformed = await app(nutrition([])).request(`${BASE}/meals/not-a-meal/photo`, {
      headers: HEADERS,
    })
    expect(malformed.status).toBe(400)
  })
})

describe('OP-NUT-010: her days', () => {
  test('T-NUT-STUDIO-API-08 every day of the range, under the intake version', async () => {
    const calls: Call[] = []
    const response = await app(nutrition(calls)).request(
      `${BASE}/daily-summaries?from=2026-11-07&to=2026-11-08`,
      { headers: HEADERS },
    )

    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    const body: unknown = await response.json()
    assertMatchesContract('ClientNutritionDailySummaryPage', body)
    expect(body).toMatchObject({ applied_scope: { code: 'nutrition_intake', version: 3 } })
    expect(calls[0]?.input).toMatchObject({
      personId: COACH,
      subjectPersonId: CLIENT,
      from: '2026-11-07',
      to: '2026-11-08',
    })

    const tooWide = await app(nutrition(calls)).request(
      `${BASE}/daily-summaries?from=2026-10-01&to=2026-11-01`,
      { headers: HEADERS },
    )
    expect(tooWide.status).toBe(422)
    expect(calls).toHaveLength(1)
  })
})

describe('OP-NUT-011: the goals this relationship proposed', () => {
  test('T-NUT-STUDIO-API-09 the proposals, a page at a time, and her active goal', async () => {
    const calls: Call[] = []
    const response = await app(nutrition(calls)).request(`${BASE}/goals/versions?limit=5`, {
      headers: HEADERS,
    })

    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    const body: unknown = await response.json()
    assertMatchesContract('ClientNutritionGoalHistory', body)
    expect(body).toMatchObject({
      applied_scope: { code: 'nutrition_guidance', version: 2 },
      data: [PROPOSED],
      page: { has_more: false, next_cursor: null },
      active: { goal_version_id: null, from_this_relationship: false },
    })
    expect(calls[0]?.input).toMatchObject({ personId: COACH, subjectPersonId: CLIENT, limit: 5 })

    const none = await app(
      nutrition([], { goalVersions: async () => refused('nutrition_guidance') }),
    ).request(`${BASE}/goals/versions`, { headers: HEADERS })
    expect(none.status).toBe(403)
    expect(await none.json()).toMatchObject({
      required_scope: { code: 'nutrition_guidance', level: 'read' },
    })
  })
})

describe('OP-NUT-012: proposing a goal', () => {
  test('T-NUT-STUDIO-API-10 answers 201 with the proposal, and says when it is a replay', async () => {
    const calls: Call[] = []
    const response = await propose(nutrition(calls), BODY)

    expect(response.status).toBe(201)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(response.headers.get('idempotent-replay')).toBeNull()
    const body: unknown = await response.json()
    assertMatchesContract('ClientNutritionGoalVersion', body)
    expect(body).toEqual(PROPOSED)
    expect(calls[0]?.input).toMatchObject({
      personId: COACH,
      organizationId: ORGANIZATION,
      subjectPersonId: CLIENT,
      rationale: BODY.rationale,
      targets: BODY.targets,
      idempotencyKey: COMMAND['idempotency-key'],
      commandId: PROPOSAL,
    })

    const replay = await propose(
      nutrition([], { proposeGoal: async () => ({ resource: PROPOSED, replayed: true }) }),
      BODY,
    )
    expect(replay.status).toBe(201)
    expect(replay.headers.get('idempotent-replay')).toBe('true')
  })

  test('T-NUT-STUDIO-API-11 the hash follows the command: same body, same hash; another, another', async () => {
    const calls: Call[] = []
    await propose(nutrition(calls), BODY)
    await propose(nutrition(calls), { targets: BODY.targets, rationale: BODY.rationale })
    await propose(nutrition(calls), { ...BODY, rationale: 'Otra razón' })
    const [first, reordered, other] = calls.map((call) =>
      Buffer.from(call.input.requestHash as Buffer).toString('hex'),
    )
    expect(reordered).toBe(first)
    expect(other).not.toBe(first)
  })

  test('T-NUT-STUDIO-API-12 the media type, the command headers and the body shape come first', async () => {
    const calls: Call[] = []
    const plain = await propose(nutrition(calls), BODY, {
      ...COMMAND,
      'content-type': 'text/plain',
    })
    expect(plain.status).toBe(415)
    const keyless = await propose(nutrition(calls), BODY, {
      ...COMMAND,
      'idempotency-key': 'not-a-key',
    })
    expect(keyless.status).toBe(400)
    const v4Command = await propose(nutrition(calls), BODY, {
      ...COMMAND,
      'command-id': COMMAND['idempotency-key'],
    })
    expect(v4Command.status).toBe(400)

    for (const body of [
      'not json',
      {},
      { rationale: BODY.rationale },
      { ...BODY, rationale: '   ' },
      { ...BODY, rationale: 'x'.repeat(2001) },
      { ...BODY, targets: [] },
      { ...BODY, targets: Array.from({ length: 7 }, () => PROTEIN) },
      { ...BODY, targets: [{ ...PROTEIN, food: 'arroz' }] },
      {
        ...BODY,
        targets: [{ nutrient_code: 'protein', mode: 'minimum', minimum: 140, unit: 'g' }],
      },
      { ...BODY, targets: [{ ...PROTEIN, minimum: -1 }] },
      { ...BODY, targets: [{ ...PROTEIN, mode: 'about' }] },
      { ...BODY, menu: 'arroz con pollo' },
    ]) {
      const response = await propose(nutrition(calls), body)
      expect({ body, status: response.status }).toEqual({ body, status: 422 })
    }
    expect(calls).toEqual([])
  })

  test('T-NUT-STUDIO-API-13 each refusal reads as what it is', async () => {
    for (const [error, status, type] of [
      [databaseError('AF431'), 403, 'credential-required'],
      [databaseError('42501'), 403, 'forbidden'],
      [databaseError('P0002'), 404, 'not-found'],
      [databaseError('AF424'), 409, 'service-paused'],
      [databaseError('23505'), 409, 'conflict'],
      [databaseError('P0004'), 409, 'conflict'],
      [databaseError('40001'), 409, 'idempotency-in-progress'],
      [databaseError('23514'), 422, 'validation-failed'],
      [databaseError('XX000'), 503, 'upstream-unavailable'],
    ] as const) {
      const response = await propose(nutrition([], { proposeGoal: failing(error) }), BODY)
      const body = (await response.json()) as { type: string }
      expect({ code: error.code, status: response.status, type: body.type }).toEqual({
        code: error.code,
        status,
        type: `https://errors.allfit.invalid/${type}`,
      })
      expect(response.headers.get('cache-control')).toBe('no-store')
      if (type === 'idempotency-in-progress') expect(response.headers.get('retry-after')).toBe('1')
    }

    const unshared = await propose(
      nutrition([], {
        proposeGoal: failing(databaseError('AF430', 'nutrition_guidance:contribute')),
      }),
      BODY,
    )
    expect(unshared.status).toBe(403)
    expect(await unshared.json()).toMatchObject({
      type: 'https://errors.allfit.invalid/scope-required',
      required_scope: { code: 'nutrition_guidance', level: 'contribute' },
    })

    const invalid = await propose(
      nutrition([], { proposeGoal: failing(databaseError('22023', '["rationale","targets"]')) }),
      BODY,
    )
    expect(invalid.status).toBe(422)
    expect(await invalid.json()).toMatchObject({
      errors: [
        { code: 'rationale', path: '/rationale' },
        { code: 'targets', path: '/targets' },
      ],
    })
  })
})
