/**
 * `T-EXE-REVIEW-API` — the coach's review of a client's training over HTTP.
 *
 * Whom the coach attends, what the client shares and what she hid are PostgreSQL's
 * answers (`T-EXE-AUTHORIZED-01`). What these hold is the route's own part: it serves
 * the Studio web origin with its session cookie, carries the coach and a fresh request
 * id through, answers in the contract's shape, and translates the database's outcomes
 * without saying more than they do.
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
const LIST_PATH = `/studio/v1/organizations/${ORGANIZATION}/clients/${CLIENT}/executions`
const DETAIL_PATH = `${LIST_PATH}/${EXECUTION}`
const HEADERS = { origin: 'https://studio.example.test', cookie: 'allfit_studio_session=opaque' }
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
}

interface Calls {
  list: Array<Parameters<StudioExecutionReviewService['list']>[0]>
  read: Array<Parameters<StudioExecutionReviewService['read']>[0]>
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

const fresh = (): Calls => ({ list: [], read: [] })
const databaseError = (code: string) => Object.assign(new Error('database failure'), { code })

beforeEach(() => {
  process.env.STUDIO_WEB_URL = 'https://studio.example.test'
  process.env.BACKOFFICE_WEB_URL = 'https://backoffice.example.test'
  process.env.API_PUBLIC_URL = 'https://api.example.test'
})

describe('the review surface honours the contract', () => {
  test('T-EXE-REVIEW-API-01 mounts OP-EXE-017 and OP-EXE-018 as the contract declares them', () => {
    const declared = allfitV1ContractManifest.operations
      .filter((operation) => ['OP-EXE-017', 'OP-EXE-018'].includes(operation.allfitOperation))
      .map((operation) => `${operation.method} ${operation.path.replaceAll(/\{([^}]+)\}/g, ':$1')}`)
    const contract = declared.map((route) => route.replace('/studio/v1', '')).sort()
    const mounted = studioExecutionRoutes(review(fresh()), sessionService())
      .routes.filter((route) => route.method !== 'ALL')
      .map((route) => `${route.method} ${route.path}`)
      .sort()
    expect(mounted).toEqual(contract)
    expect(
      allfitV1ContractManifest.operations
        .filter((operation) => ['OP-EXE-017', 'OP-EXE-018'].includes(operation.allfitOperation))
        .map((operation) => operation.security),
    ).toEqual([['cookieAuth'], ['cookieAuth']])
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
