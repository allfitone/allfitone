/**
 * `T-EXE-REVIEW-API` — the coach's review of a client's training over HTTP.
 *
 * Whom the coach attends, what the client shares and what she hid are PostgreSQL's
 * answers (`T-EXE-AUTHORIZED-01`). What these hold is the route's own part: it serves
 * the Studio web origin with its session cookie, carries the coach and a fresh request
 * id through, answers in the contract's shape, and translates the database's outcomes
 * without saying more than they do. The corrections a coach proposes (`OP-EXE-012`,
 * `OP-EXE-020`) are held to the same: `T-EXE-PROPOSAL-01` owns what PostgreSQL decides.
 */

import { beforeEach, describe, expect, test } from 'bun:test'
import { allfitV1ContractManifest, allfitV1ContractSchemas } from '@allfitone/contracts'
import Ajv2020 from 'ajv/dist/2020'
import addFormats from 'ajv-formats'
import { Hono } from 'hono'

import { createApp } from '../../../application.js'
import type { StudioSessionService } from '../../identity/index.js'
import type {
  AuthorizedExecution,
  AuthorizedExecutionPage,
  AuthorizedExecutionRead,
  ClientProgress,
  ProfessionalObservation,
  ProposedCorrection,
  StudioExecutionReviewService,
} from '../application/index.js'
import { studioExecutionRoutes } from './studio.js'

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

const COACH = '019f4700-0000-7000-8000-000000000012'
const ORGANIZATION = '019f4700-0000-7000-8000-000000000101'
const CLIENT = '019f4700-0000-7000-8000-000000000001'
const EXECUTION = '019f4700-0000-7000-8000-000000000e01'
const OBSERVATION_ID = '019f5000-0000-7000-8000-000000000c01'
const CLIENT_PATH = `/studio/v1/organizations/${ORGANIZATION}/clients/${CLIENT}`
const LIST_PATH = `${CLIENT_PATH}/executions`
const DETAIL_PATH = `${LIST_PATH}/${EXECUTION}`
const PROGRESS_PATH = `${CLIENT_PATH}/progress?timezone=America/Bogota&period=week&count=4`
const OBSERVATIONS_PATH = `${CLIENT_PATH}/observations`
const REVISIONS_PATH = `/studio/v1/organizations/${ORGANIZATION}/observations/${OBSERVATION_ID}/revisions`
const PROPOSAL_ID = '019f5200-0000-7000-8000-000000000c01'
const PROPOSALS_PATH = `${CLIENT_PATH}/correction-proposals`
const PROPOSED_PATH = `/studio/v1/organizations/${ORGANIZATION}/correction-proposals`
const HEADERS = { origin: 'https://studio.example.test', cookie: 'allfit_studio_session=opaque' }
const COMMAND_HEADERS = {
  ...HEADERS,
  'content-type': 'application/json',
  'idempotency-key': '3f1c2a4e-8b3d-4c5e-9f60-7a8b9c0d1e2f',
  'command-id': '019f5000-0000-7000-8000-000000000c01',
}
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

const SUMMARY: AuthorizedExecutionPage['items'][number] = {
  id: EXECUTION,
  started_at: '2026-11-01T11:00:00.000Z',
  ended_at: '2026-11-01T12:00:00.000Z',
  timezone: 'America/Bogota',
  activity_type_code: 'test_strength',
  activity_type_name: 'Fuerza',
  discipline_code: 'test_strength',
  achieved_level: 'detailed',
  origin: 'relationship',
  planned_session_id: '019f4700-0000-7000-8000-000000000912',
  applied_scope: { code: 'relationship_training', version: 4 },
}

const DETAIL: AuthorizedExecution = {
  ...SUMMARY,
  segments: [],
  strength_sets: [
    {
      segment_position: null,
      order: 1,
      movement_id: null,
      movement_name: null,
      achieved_reps: 8,
      load: { value: 60, unit: 'kg' },
      rpe: 8,
    },
  ],
  endurance_laps: [
    {
      segment_position: null,
      lap_number: 1,
      distance: { value: 1000, unit: 'm' },
      duration_seconds: 300,
    },
  ],
  interval_results: [],
  round_results: [],
  mobility_results: [],
  observations: [],
}

const OBSERVATION: ProfessionalObservation = {
  id: OBSERVATION_ID,
  execution_id: EXECUTION,
  category: 'training',
  provenance: 'professional_observation',
  content: 'Bajó la técnica en la última serie.',
  revision_number: 1,
  created_at: '2026-11-02T12:00:00.000Z',
  revised_at: null,
  author_name: 'Camilo Coach',
  authored_by_me: true,
}

const PROGRESS: ClientProgress = {
  period: 'week',
  sources: [{ code: 'relationship_training', version: 4 }],
  algorithm: { e1rm: 'epley', version: 1 },
  periods: [
    {
      starts_on: '2026-10-26',
      ends_before: '2026-11-02',
      sessions: 1,
      trained_seconds: 3600,
      work_sets: 2,
      volume_kg: 500,
      muscles: [{ code: 'chest', name: 'Pecho', sets: 2 }],
    },
  ],
  movements: [
    {
      movement_id: '019f4900-0000-7000-8000-0000000000a1',
      name: null,
      best_kg: 100,
      previous_best_kg: null,
      change_kg: null,
      best_e1rm_kg: 116.67,
      bests: [100],
    },
  ],
}

const PROPOSED: ProposedCorrection = {
  id: PROPOSAL_ID,
  client: { person_id: CLIENT, name: 'Ana Cliente' },
  target: { execution_id: EXECUTION, set_order: 1 },
  field: 'load',
  proposed: { value: 62.5, unit: 'kg' },
  reason: 'La barra pesaba más.',
  status: 'pending',
  cancel_reason: null,
  created_at: '2026-11-06T12:00:00.123456+00:00',
  expires_at: '2026-12-06T12:00:00.123456+00:00',
  settled_at: null,
}
const PROPOSAL_BODY = {
  execution_id: EXECUTION,
  set_order: 1,
  field: 'load',
  value: 62.5,
  unit: 'kg',
  reason: 'La barra pesaba más.',
}

const OBSERVATION_BODY = {
  execution_id: EXECUTION,
  category: 'training',
  provenance: 'professional_observation',
  content: 'Bajó la técnica en la última serie.',
}
const REVISION_BODY = {
  expected_revision: 1,
  content: 'Bajó la técnica en las dos últimas series.',
  reason: 'Eran dos series, no una.',
}

interface Calls {
  list: Array<Parameters<StudioExecutionReviewService['list']>[0]>
  read: Array<Parameters<StudioExecutionReviewService['read']>[0]>
  progress: Array<Parameters<StudioExecutionReviewService['progress']>[0]>
  observe: Array<Parameters<StudioExecutionReviewService['observe']>[0]>
  reviseObservation: Array<Parameters<StudioExecutionReviewService['reviseObservation']>[0]>
  propose: Array<Parameters<StudioExecutionReviewService['propose']>[0]>
  listProposed: Array<Parameters<StudioExecutionReviewService['listProposed']>[0]>
}

function review(
  calls: Calls,
  overrides: Partial<StudioExecutionReviewService> = {},
): StudioExecutionReviewService {
  return {
    list: async (input) => {
      calls.list.push(input)
      return { items: [SUMMARY], hasMore: false }
    },
    read: async (input) => {
      calls.read.push(input)
      return { outcome: 'found', execution: DETAIL }
    },
    progress: async (input) => {
      calls.progress.push(input)
      return { outcome: 'found', progress: PROGRESS }
    },
    observe: async (input) => {
      calls.observe.push(input)
      return { resource: OBSERVATION, replayed: false }
    },
    reviseObservation: async (input) => {
      calls.reviseObservation.push(input)
      return {
        resource: { ...OBSERVATION, content: REVISION_BODY.content, revision_number: 2 },
        replayed: false,
      }
    },
    propose: async (input) => {
      calls.propose.push(input)
      return { resource: PROPOSED, replayed: false }
    },
    listProposed: async (input) => {
      calls.listProposed.push(input)
      return { items: [PROPOSED], hasMore: false }
    },
    ...overrides,
  }
}

function sessionService(): StudioSessionService {
  const unused = async (): Promise<never> => {
    throw new Error('This session operation is outside the execution review test')
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

function app(service: StudioExecutionReviewService): Hono {
  const routes = new Hono()
  routes.route('/studio/v1', studioExecutionRoutes(service, sessionService()))
  return routes
}

const fresh = (): Calls => ({
  list: [],
  read: [],
  progress: [],
  observe: [],
  reviseObservation: [],
  propose: [],
  listProposed: [],
})
const databaseError = (code: string, detail?: string) =>
  Object.assign(new Error(code === '40001' && detail ? 'stale-draft' : 'database failure'), {
    code,
    ...(detail === undefined ? {} : { detail }),
  })
const post = (path: string, body: unknown, headers: Record<string, string> = COMMAND_HEADERS) => ({
  path,
  init: { method: 'POST', headers, body: JSON.stringify(body) },
})

beforeEach(() => {
  process.env.STUDIO_WEB_URL = 'https://studio.example.test'
  process.env.BACKOFFICE_WEB_URL = 'https://backoffice.example.test'
  process.env.API_PUBLIC_URL = 'https://api.example.test'
})

describe('the review surface honours the contract', () => {
  test('T-EXE-REVIEW-API-01 mounts OP-EXE-010, 011, 012, 017, 018, 019 and 020 as the contract declares them', () => {
    const operations = [
      'OP-EXE-010',
      'OP-EXE-011',
      'OP-EXE-012',
      'OP-EXE-017',
      'OP-EXE-018',
      'OP-EXE-019',
      'OP-EXE-020',
    ]
    // OP-EXE-020 is also her list in Space, which is another router's.
    const studio = allfitV1ContractManifest.operations.filter(
      (operation) =>
        operations.includes(operation.allfitOperation) && operation.path.startsWith('/studio/v1/'),
    )
    const declared = studio.map(
      (operation) => `${operation.method} ${operation.path.replaceAll(/\{([^}]+)\}/g, ':$1')}`,
    )
    const contract = declared.map((route) => route.replace('/studio/v1', '')).sort()
    const mounted = studioExecutionRoutes(review(fresh()), sessionService())
      .routes.filter((route) => route.method !== 'ALL')
      .map((route) => `${route.method} ${route.path}`)
      .sort()
    expect(mounted).toEqual(contract)
    expect(studio.map((operation) => operation.security)).toEqual(studio.map(() => ['cookieAuth']))
    expect(studio).toHaveLength(operations.length)
    // And the application serves them, not only the router.
    const application = createApp().routes.map((route) => `${route.method} ${route.path}`)
    expect(declared.filter((route) => !application.includes(route))).toEqual([])
  })
})

describe('OP-EXE-017: what she trained', () => {
  test('T-EXE-REVIEW-API-02 lists as the coach, for the client in the path, under a fresh request', async () => {
    const calls = fresh()
    const response = await app(review(calls)).request(LIST_PATH, { headers: HEADERS })

    expect(response.status).toBe(200)
    expect(response.headers.get('Cache-Control')).toBe('private, no-store')
    const body = await response.json()
    assertMatchesContract('AuthorizedExecutionPage', body)
    expect(body).toEqual({ data: [SUMMARY], page: { has_more: false, next_cursor: null } })
    expect(calls.list).toHaveLength(1)
    expect(calls.list[0]).toMatchObject({
      personId: COACH,
      organizationId: ORGANIZATION,
      subjectPersonId: CLIENT,
      limit: 25,
    })
    expect(calls.list[0]?.requestId).toMatch(UUID_V4)
  })

  test('T-EXE-REVIEW-API-03 the next page starts where the cursor says', async () => {
    const calls = fresh()
    const service = review(calls, {
      list: async (input) => {
        calls.list.push(input)
        return {
          items: [SUMMARY],
          hasMore: true,
          nextCursor: { startedAt: SUMMARY.started_at, id: SUMMARY.id },
        }
      },
    })
    const first = await app(service).request(`${LIST_PATH}?limit=1`, { headers: HEADERS })
    const body = (await first.json()) as { page: { next_cursor: string; has_more: boolean } }
    expect(body.page.has_more).toBe(true)

    await app(service).request(`${LIST_PATH}?limit=1&cursor=${body.page.next_cursor}`, {
      headers: HEADERS,
    })
    expect(calls.list[1]).toMatchObject({
      limit: 1,
      cursor: { startedAt: SUMMARY.started_at, id: SUMMARY.id },
    })
    expect(calls.list[1]?.requestId).not.toBe(calls.list[0]?.requestId)
  })

  test('T-EXE-REVIEW-API-04 a page size or cursor outside the contract is refused before anything runs', async () => {
    const calls = fresh()
    for (const query of ['limit=0', 'limit=101', 'limit=ten', 'cursor=not-a-cursor-at-all']) {
      const response = await app(review(calls)).request(`${LIST_PATH}?${query}`, {
        headers: HEADERS,
      })
      expect(response.status).toBe(422)
    }
    expect(calls.list).toHaveLength(0)
  })

  test('T-EXE-REVIEW-API-05 with nothing shared the page is empty, not an error', async () => {
    const service = review(fresh(), { list: async () => ({ items: [], hasMore: false }) })
    const response = await app(service).request(LIST_PATH, { headers: HEADERS })
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      data: [],
      page: { has_more: false, next_cursor: null },
    })
  })

  test('T-EXE-REVIEW-API-06 nobody who does not attend her learns she is a client', async () => {
    const service = review(fresh(), {
      list: async () => {
        throw databaseError('P0002')
      },
    })
    const response = await app(service).request(LIST_PATH, { headers: HEADERS })
    expect(response.status).toBe(404)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
  })

  test('T-EXE-REVIEW-API-07 a caller who is not a member is forbidden, and an outage is an outage', async () => {
    const forbidden = review(fresh(), {
      list: async () => {
        throw databaseError('42501')
      },
    })
    expect((await app(forbidden).request(LIST_PATH, { headers: HEADERS })).status).toBe(403)
    const down = review(fresh(), {
      list: async () => {
        throw new Error('connection reset')
      },
    })
    expect((await app(down).request(LIST_PATH, { headers: HEADERS })).status).toBe(503)
  })
})

describe('OP-EXE-018: one session', () => {
  test('T-EXE-REVIEW-API-08 reads the session in the path, in the contract shape', async () => {
    const calls = fresh()
    const response = await app(review(calls)).request(DETAIL_PATH, { headers: HEADERS })

    expect(response.status).toBe(200)
    expect(response.headers.get('Cache-Control')).toBe('private, no-store')
    const body = await response.json()
    assertMatchesContract('AuthorizedExecution', body)
    expect(body).toEqual(DETAIL)
    expect(calls.read[0]).toMatchObject({
      personId: COACH,
      organizationId: ORGANIZATION,
      subjectPersonId: CLIENT,
      executionId: EXECUTION,
    })
    expect(calls.read[0]?.requestId).toMatch(UUID_V4)
  })

  test('T-EXE-REVIEW-API-09 the contract has no room for heart rate, pain or body weight', () => {
    for (const extra of [
      { body_weight: { value: 70, unit: 'kg' } },
      { pain_reports: ['knee'] },
      { capture_source: 'device' },
    ]) {
      expect(() => assertMatchesContract('AuthorizedExecution', { ...DETAIL, ...extra })).toThrow()
    }
    const lap = { ...DETAIL.endurance_laps[0], avg_heart_rate_bpm: 150 }
    expect(() =>
      assertMatchesContract('AuthorizedExecution', { ...DETAIL, endurance_laps: [lap] }),
    ).toThrow()
  })

  test('T-EXE-REVIEW-API-10 with nothing shared the answer names the scope it needs', async () => {
    const outcome: AuthorizedExecutionRead = {
      outcome: 'scope_required',
      requiredScope: { code: 'relationship_training', level: 'read' },
    }
    const response = await app(review(fresh(), { read: async () => outcome })).request(
      DETAIL_PATH,
      {
        headers: HEADERS,
      },
    )
    expect(response.status).toBe(403)
    expect(await response.json()).toMatchObject({
      type: 'https://errors.allfit.invalid/scope-required',
      required_scope: { code: 'relationship_training', level: 'read' },
    })
  })

  test('T-EXE-REVIEW-API-11 a session the coach may not see is simply not there', async () => {
    const response = await app(
      review(fresh(), { read: async () => ({ outcome: 'not_found' }) }),
    ).request(DETAIL_PATH, { headers: HEADERS })
    expect(response.status).toBe(404)
    expect(await response.json()).not.toHaveProperty('required_scope')
  })
})

describe('what reaches neither read', () => {
  test('T-EXE-REVIEW-API-12 another origin, no cookie or an id that is not one never reaches the database', async () => {
    const calls = fresh()
    const routes = app(review(calls))

    const foreign = await routes.request(LIST_PATH, {
      headers: { ...HEADERS, origin: 'https://evil.example.test' },
    })
    expect(foreign.status).toBe(403)
    const anonymous = await routes.request(DETAIL_PATH, {
      headers: { origin: HEADERS.origin },
    })
    expect(anonymous.status).toBe(401)
    const badClient = await routes.request(
      `/studio/v1/organizations/${ORGANIZATION}/clients/someone/executions`,
      { headers: HEADERS },
    )
    expect(badClient.status).toBe(400)
    const badExecution = await routes.request(`${LIST_PATH}/not-an-id`, { headers: HEADERS })
    expect(badExecution.status).toBe(400)

    expect(calls.list).toHaveLength(0)
    expect(calls.read).toHaveLength(0)
  })
})

describe('OP-EXE-019: how her training is going', () => {
  test('T-EXE-REVIEW-API-13 reads her progress for the window asked, as the coach, under a fresh request', async () => {
    const calls = fresh()
    const response = await app(review(calls)).request(PROGRESS_PATH, { headers: HEADERS })

    expect(response.status).toBe(200)
    expect(response.headers.get('Cache-Control')).toBe('private, no-store')
    const body = await response.json()
    assertMatchesContract('ClientProgress', body)
    expect(body).toEqual(PROGRESS)
    expect(calls.progress[0]).toMatchObject({
      personId: COACH,
      organizationId: ORGANIZATION,
      subjectPersonId: CLIENT,
      timezone: 'America/Bogota',
      period: 'week',
      count: 4,
    })
    expect(calls.progress[0]?.requestId).toMatch(UUID_V4)
  })

  test('T-EXE-REVIEW-API-14 a window outside the contract is refused before anything runs', async () => {
    const calls = fresh()
    for (const query of [
      'period=week&count=4',
      'timezone=America/Bogota&count=4',
      'timezone=America/Bogota&period=day&count=4',
      'timezone=America/Bogota&period=week',
      'timezone=America/Bogota&period=week&count=0',
      'timezone=America/Bogota&period=week&count=13',
      'timezone=America/Bogota&period=week&count=four',
      'timezone=not%20a%20zone&period=week&count=4',
    ]) {
      const response = await app(review(calls)).request(`${CLIENT_PATH}/progress?${query}`, {
        headers: HEADERS,
      })
      expect(response.status).toBe(422)
    }
    expect(calls.progress).toHaveLength(0)
  })

  test('T-EXE-REVIEW-API-15 with nothing shared the answer names the scope it needs', async () => {
    const service = review(fresh(), {
      progress: async () => ({
        outcome: 'scope_required',
        requiredScope: { code: 'relationship_training', level: 'read' },
      }),
    })
    const response = await app(service).request(PROGRESS_PATH, { headers: HEADERS })
    expect(response.status).toBe(403)
    expect(await response.json()).toMatchObject({
      type: 'https://errors.allfit.invalid/scope-required',
      required_scope: { code: 'relationship_training', level: 'read' },
    })
  })

  test('T-EXE-REVIEW-API-16 a zone PostgreSQL does not know is a validation failure; no client is a 404', async () => {
    const unknownZone = review(fresh(), {
      progress: async () => {
        throw databaseError('22023', '["timezone"]')
      },
    })
    const zone = await app(unknownZone).request(PROGRESS_PATH, { headers: HEADERS })
    expect(zone.status).toBe(422)
    expect(await zone.json()).toMatchObject({ errors: [{ code: 'timezone' }] })
    const absent = review(fresh(), {
      progress: async () => {
        throw databaseError('P0002')
      },
    })
    expect((await app(absent).request(PROGRESS_PATH, { headers: HEADERS })).status).toBe(404)
  })

  test('T-EXE-REVIEW-API-17 the contract has no room for adherence, a programme or body weight', () => {
    for (const extra of [{ programs: [] }, { body_weight: 70 }]) {
      expect(() => assertMatchesContract('ClientProgress', { ...PROGRESS, ...extra })).toThrow()
    }
    const [period] = PROGRESS.periods
    for (const extra of [{ planned: 3 }, { fulfilled: 2 }]) {
      expect(() =>
        assertMatchesContract('ClientProgress', {
          ...PROGRESS,
          periods: [{ ...period, ...extra }],
        }),
      ).toThrow()
    }
  })
})

describe('OP-EXE-010: leaving an observation', () => {
  test('T-EXE-REVIEW-API-18 records the observation as the coach, for the client in the path', async () => {
    const calls = fresh()
    const request = post(OBSERVATIONS_PATH, OBSERVATION_BODY)
    const response = await app(review(calls)).request(request.path, request.init)

    expect(response.status).toBe(201)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    expect(response.headers.get('Idempotent-Replay')).toBeNull()
    const body = await response.json()
    assertMatchesContract('ProfessionalObservation', body)
    expect(body).toEqual(OBSERVATION)
    expect(calls.observe[0]).toMatchObject({
      personId: COACH,
      organizationId: ORGANIZATION,
      subjectPersonId: CLIENT,
      executionId: EXECUTION,
      category: 'training',
      provenance: 'professional_observation',
      content: OBSERVATION_BODY.content,
      idempotencyKey: COMMAND_HEADERS['idempotency-key'],
      commandId: COMMAND_HEADERS['command-id'],
    })
    expect(calls.observe[0]?.requestHash).toHaveLength(32)
  })

  test('T-EXE-REVIEW-API-19 the same request hashes the same, and a replay says so', async () => {
    const calls = fresh()
    const service = review(calls, {
      observe: async (input) => {
        calls.observe.push(input)
        return { resource: OBSERVATION, replayed: calls.observe.length > 1 }
      },
    })
    const request = post(OBSERVATIONS_PATH, OBSERVATION_BODY)
    await app(service).request(request.path, request.init)
    const again = await app(service).request(request.path, request.init)

    expect(again.status).toBe(201)
    expect(again.headers.get('Idempotent-Replay')).toBe('true')
    const [first, second] = calls.observe
    expect(first && second && second.requestHash.equals(first.requestHash)).toBe(true)
  })

  test('T-EXE-REVIEW-API-20 a body, media type or command identity outside the contract never reaches the database', async () => {
    const calls = fresh()
    const routes = app(review(calls))
    for (const body of [
      {},
      { ...OBSERVATION_BODY, execution_id: 'not-an-id' },
      { ...OBSERVATION_BODY, category: 'mood' },
      { ...OBSERVATION_BODY, provenance: 'device_observed' },
      { ...OBSERVATION_BODY, content: '' },
      { ...OBSERVATION_BODY, content: 'x'.repeat(2001) },
      { ...OBSERVATION_BODY, author_name: 'Otra persona' },
    ]) {
      const request = post(OBSERVATIONS_PATH, body)
      expect((await routes.request(request.path, request.init)).status).toBe(422)
    }
    const text = post(OBSERVATIONS_PATH, OBSERVATION_BODY, {
      ...COMMAND_HEADERS,
      'content-type': 'text/plain',
    })
    expect((await routes.request(text.path, text.init)).status).toBe(415)
    const keyless = post(OBSERVATIONS_PATH, OBSERVATION_BODY, {
      ...COMMAND_HEADERS,
      'idempotency-key': '',
    })
    expect((await routes.request(keyless.path, keyless.init)).status).toBe(400)
    const v4Command = post(OBSERVATIONS_PATH, OBSERVATION_BODY, {
      ...COMMAND_HEADERS,
      'command-id': COMMAND_HEADERS['idempotency-key'],
    })
    expect((await routes.request(v4Command.path, v4Command.init)).status).toBe(400)
    expect(calls.observe).toHaveLength(0)
  })

  test('T-EXE-REVIEW-API-21 the database refusals keep their meaning', async () => {
    const answers: Array<[Error, number, Record<string, unknown>]> = [
      [
        databaseError('AF430', 'health_context:contribute'),
        403,
        { required_scope: { code: 'health_context', level: 'contribute' } },
      ],
      [databaseError('AF424'), 409, { type: 'https://errors.allfit.invalid/service-paused' }],
      [databaseError('23505'), 409, { type: 'https://errors.allfit.invalid/conflict' }],
      [
        databaseError('40001'),
        409,
        { type: 'https://errors.allfit.invalid/idempotency-in-progress' },
      ],
      [
        databaseError('22023', '["execution"]'),
        422,
        { errors: [{ code: 'execution', path: '/execution_id' }] },
      ],
      [databaseError('P0002'), 404, { type: 'https://errors.allfit.invalid/not-found' }],
      [databaseError('42501'), 403, { type: 'https://errors.allfit.invalid/forbidden' }],
    ]
    for (const [error, status, body] of answers) {
      const service = review(fresh(), {
        observe: async () => {
          throw error
        },
      })
      const request = post(OBSERVATIONS_PATH, OBSERVATION_BODY)
      const response = await app(service).request(request.path, request.init)
      expect(response.status).toBe(status)
      expect(response.headers.get('Cache-Control')).toBe('no-store')
      expect(await response.json()).toMatchObject(body)
    }
  })
})

describe('OP-EXE-011: correcting an observation', () => {
  test('T-EXE-REVIEW-API-22 corrects the observation in the path over the revision the coach saw', async () => {
    const calls = fresh()
    const request = post(REVISIONS_PATH, REVISION_BODY)
    const response = await app(review(calls)).request(request.path, request.init)

    expect(response.status).toBe(201)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    const body = await response.json()
    assertMatchesContract('ProfessionalObservation', body)
    expect(body).toMatchObject({ content: REVISION_BODY.content, revision_number: 2 })
    expect(calls.reviseObservation[0]).toMatchObject({
      personId: COACH,
      organizationId: ORGANIZATION,
      observationId: OBSERVATION_ID,
      expectedRevision: 1,
      content: REVISION_BODY.content,
      reason: REVISION_BODY.reason,
    })
    expect(calls.reviseObservation[0]?.requestHash).toHaveLength(32)
  })

  test('T-EXE-REVIEW-API-23 a correction over an older revision answers with the observation as it stands', async () => {
    const service = review(fresh(), {
      reviseObservation: async () => {
        throw databaseError('40001', JSON.stringify({ ...OBSERVATION, revision_number: 2 }))
      },
    })
    const request = post(REVISIONS_PATH, REVISION_BODY)
    const response = await app(service).request(request.path, request.init)
    expect(response.status).toBe(409)
    expect(await response.json()).toMatchObject({
      type: 'https://errors.allfit.invalid/stale-draft',
      current_state: { id: OBSERVATION_ID, revision_number: 2 },
    })
  })

  test('T-EXE-REVIEW-API-24 a correction outside the contract never reaches the database', async () => {
    const calls = fresh()
    const routes = app(review(calls))
    for (const body of [
      { ...REVISION_BODY, expected_revision: 0 },
      { ...REVISION_BODY, expected_revision: 1.5 },
      { content: REVISION_BODY.content, expected_revision: 1 },
      { ...REVISION_BODY, reason: 'x'.repeat(501) },
      { ...REVISION_BODY, provenance: 'person_declared' },
    ]) {
      const request = post(REVISIONS_PATH, body)
      expect((await routes.request(request.path, request.init)).status).toBe(422)
    }
    const badId = post(
      `/studio/v1/organizations/${ORGANIZATION}/observations/not-an-id/revisions`,
      REVISION_BODY,
    )
    expect((await routes.request(badId.path, badId.init)).status).toBe(400)
    const foreign = post(REVISIONS_PATH, REVISION_BODY, {
      ...COMMAND_HEADERS,
      origin: 'https://evil.example.test',
    })
    expect((await routes.request(foreign.path, foreign.init)).status).toBe(403)
    expect(calls.reviseObservation).toHaveLength(0)
  })
})

describe('OP-EXE-012: proposing a correction', () => {
  test('T-EXE-PROPOSAL-API-01 proposes as the coach, for the client and the set in the body', async () => {
    const calls = fresh()
    const request = post(PROPOSALS_PATH, PROPOSAL_BODY)
    const response = await app(review(calls)).request(request.path, request.init)

    expect(response.status).toBe(201)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    expect(response.headers.get('Idempotent-Replay')).toBeNull()
    const body = await response.json()
    assertMatchesContract('ProposedCorrection', body)
    expect(body).toEqual(PROPOSED)
    expect(calls.propose[0]).toMatchObject({
      personId: COACH,
      organizationId: ORGANIZATION,
      subjectPersonId: CLIENT,
      executionId: EXECUTION,
      setOrder: 1,
      field: 'load',
      value: 62.5,
      unit: 'kg',
      reason: PROPOSAL_BODY.reason,
      idempotencyKey: COMMAND_HEADERS['idempotency-key'],
      commandId: COMMAND_HEADERS['command-id'],
    })
    expect(calls.propose[0]?.requestHash).toHaveLength(32)
  })

  test('T-EXE-PROPOSAL-API-02 a field without a unit carries none, and a replay says so', async () => {
    const calls = fresh()
    const service = review(calls, {
      propose: async (input) => {
        calls.propose.push(input)
        return { resource: PROPOSED, replayed: calls.propose.length > 1 }
      },
    })
    const { unit: _unit, ...reps } = { ...PROPOSAL_BODY, field: 'achieved_reps', value: 10 }
    const request = post(PROPOSALS_PATH, reps)
    await app(service).request(request.path, request.init)
    const again = await app(service).request(request.path, request.init)

    expect(again.status).toBe(201)
    expect(again.headers.get('Idempotent-Replay')).toBe('true')
    expect(calls.propose[0]).toMatchObject({ field: 'achieved_reps', value: 10, unit: null })
    const [first, second] = calls.propose
    expect(first && second && second.requestHash.equals(first.requestHash)).toBe(true)
  })

  test('T-EXE-PROPOSAL-API-03 a body, media type or command identity outside the contract never reaches the database', async () => {
    const calls = fresh()
    const routes = app(review(calls))
    for (const body of [
      {},
      { ...PROPOSAL_BODY, execution_id: 'not-an-id' },
      { ...PROPOSAL_BODY, set_order: 0 },
      { ...PROPOSAL_BODY, set_order: 1.5 },
      { ...PROPOSAL_BODY, field: 'duration_seconds' },
      { ...PROPOSAL_BODY, value: -1 },
      { ...PROPOSAL_BODY, value: '62.5' },
      { ...PROPOSAL_BODY, unit: '' },
      { ...PROPOSAL_BODY, reason: '' },
      { ...PROPOSAL_BODY, reason: 'x'.repeat(501) },
      { ...PROPOSAL_BODY, current_value: 60 },
    ]) {
      const request = post(PROPOSALS_PATH, body)
      expect((await routes.request(request.path, request.init)).status).toBe(422)
    }
    const text = post(PROPOSALS_PATH, PROPOSAL_BODY, {
      ...COMMAND_HEADERS,
      'content-type': 'text/plain',
    })
    expect((await routes.request(text.path, text.init)).status).toBe(415)
    const keyless = post(PROPOSALS_PATH, PROPOSAL_BODY, {
      ...COMMAND_HEADERS,
      'idempotency-key': '',
    })
    expect((await routes.request(keyless.path, keyless.init)).status).toBe(400)
    const foreign = post(PROPOSALS_PATH, PROPOSAL_BODY, {
      ...COMMAND_HEADERS,
      origin: 'https://evil.example.test',
    })
    expect((await routes.request(foreign.path, foreign.init)).status).toBe(403)
    expect(calls.propose).toHaveLength(0)
  })

  test('T-EXE-PROPOSAL-API-04 the database refusals keep their meaning', async () => {
    const answers: Array<[Error, number, Record<string, unknown>]> = [
      [
        databaseError('AF430', 'relationship_training:contribute'),
        403,
        { required_scope: { code: 'relationship_training', level: 'contribute' } },
      ],
      [databaseError('AF424'), 409, { type: 'https://errors.allfit.invalid/service-paused' }],
      // One proposal already waits on that field, or she cannot be told.
      [databaseError('23505'), 409, { type: 'https://errors.allfit.invalid/conflict' }],
      [databaseError('P0004'), 409, { type: 'https://errors.allfit.invalid/conflict' }],
      [
        databaseError('22023', '["set_order","value"]'),
        422,
        {
          errors: [
            { code: 'set_order', path: '/set_order' },
            { code: 'value', path: '/value' },
          ],
        },
      ],
      [databaseError('22023', '["unit"]'), 422, { errors: [{ code: 'unit', path: '/unit' }] }],
      [databaseError('P0002'), 404, { type: 'https://errors.allfit.invalid/not-found' }],
      [databaseError('42501'), 403, { type: 'https://errors.allfit.invalid/forbidden' }],
    ]
    for (const [error, status, body] of answers) {
      const service = review(fresh(), {
        propose: async () => {
          throw error
        },
      })
      const request = post(PROPOSALS_PATH, PROPOSAL_BODY)
      const response = await app(service).request(request.path, request.init)
      expect(response.status).toBe(status)
      expect(response.headers.get('Cache-Control')).toBe('no-store')
      expect(await response.json()).toMatchObject(body)
    }
  })
})

describe('OP-EXE-020: the corrections a coach proposed', () => {
  test('T-EXE-PROPOSAL-API-05 lists as the coach, in the organization of the path, filtered and paged', async () => {
    const calls = fresh()
    const service = review(calls, {
      listProposed: async (input) => {
        calls.listProposed.push(input)
        return {
          items: [PROPOSED],
          hasMore: true,
          nextCursor: { expiresAt: PROPOSED.expires_at, id: PROPOSAL_ID },
        }
      },
    })
    const response = await app(service).request(`${PROPOSED_PATH}?status=pending&limit=1`, {
      headers: HEADERS,
    })

    expect(response.status).toBe(200)
    expect(response.headers.get('Cache-Control')).toBe('private, no-store')
    const body = (await response.json()) as { page: { next_cursor: string } }
    assertMatchesContract('ProposedCorrectionPage', body)
    expect(body).toMatchObject({ data: [PROPOSED], page: { has_more: true } })
    expect(calls.listProposed[0]).toEqual({
      personId: COACH,
      organizationId: ORGANIZATION,
      status: 'pending',
      limit: 1,
    })

    await app(service).request(`${PROPOSED_PATH}?cursor=${body.page.next_cursor}`, {
      headers: HEADERS,
    })
    expect(calls.listProposed[1]).toEqual({
      personId: COACH,
      organizationId: ORGANIZATION,
      status: null,
      limit: 25,
      cursor: { expiresAt: PROPOSED.expires_at, id: PROPOSAL_ID },
    })
  })

  test('T-EXE-PROPOSAL-API-09 Studio says a session is unavailable, never that she hid it (HU-STUDIO-084)', () => {
    const cancelled = { ...PROPOSED, status: 'cancelled', settled_at: PROPOSED.created_at }
    assertMatchesContract('ProposedCorrection', {
      ...cancelled,
      cancel_reason: 'session_unavailable',
    })
    for (const leaked of ['session_hidden', 'session_annulled']) {
      expect(() =>
        assertMatchesContract('ProposedCorrection', { ...cancelled, cancel_reason: leaked }),
      ).toThrow('cancel_reason')
    }
    // She, who did it, still reads which.
    assertMatchesContract('CorrectionCancelReason', 'session_hidden')
  })

  test('T-EXE-PROPOSAL-API-06 a filter, page size or cursor outside the contract never reaches the database', async () => {
    const calls = fresh()
    const routes = app(review(calls))
    for (const query of [
      'status=waiting',
      'limit=0',
      'limit=101',
      'cursor=not-a-cursor-of-ours',
      `cursor=${Buffer.from(JSON.stringify({ expiresAt: 'soon', id: PROPOSAL_ID })).toString('base64url')}`,
    ]) {
      const response = await routes.request(`${PROPOSED_PATH}?${query}`, { headers: HEADERS })
      expect(response.status).toBe(422)
    }
    const foreign = await routes.request(PROPOSED_PATH, {
      headers: { ...HEADERS, origin: 'https://evil.example.test' },
    })
    expect(foreign.status).toBe(403)
    expect(calls.listProposed).toHaveLength(0)
  })

  test('T-EXE-PROPOSAL-API-07 somebody who is not a member is forbidden, and an outage is an outage', async () => {
    for (const [error, status] of [
      [databaseError('42501'), 403],
      [new Error('connection reset'), 503],
    ] as const) {
      const service = review(fresh(), {
        listProposed: async () => {
          throw error
        },
      })
      const response = await app(service).request(PROPOSED_PATH, { headers: HEADERS })
      expect(response.status).toBe(status)
      expect(response.headers.get('Cache-Control')).toBe('no-store')
    }
  })
})
