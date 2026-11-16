/**
 * The historical access case at the edge (OP-PRV-018/019/020/025).
 *
 * Who may open a case, whom it authorizes, the recent sign-in, the cut and the access
 * record are PostgreSQL's, covered by T-PRV-HIST-01 and T-PRV-HIST-02; a stub here would
 * only prove the stub. These cover what the handler decides: the shapes it accepts, the
 * actor and session it carries, the cursors it issues, and how it maps each refusal.
 */

import { beforeEach, describe, expect, test } from 'bun:test'
import { allfitV1ContractSchemas } from '@allfitone/contracts'
import Ajv2020 from 'ajv/dist/2020'
import addFormats from 'ajv-formats'
import { Hono } from 'hono'

import type { StudioSessionService } from '../../identity/index.js'
import type { HistoricalAccessService } from '../application/historical-access.js'
import type {
  FrozenExecution,
  FrozenExecutionSummary,
  FrozenNutritionGoalVersion,
  HistoricalAccessActor,
  HistoricalAccessCase,
  HistoricalRelationship,
} from '../domain/historical-access.js'
import { studioHistoricalAccessRoutes } from './studio-historical-access.js'

// The published schema proves what the wire carries, not the DTO the handler compiles against.
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

const ORGANIZATION = '0199e000-0000-7000-8000-000000000101'
const RELATIONSHIP = '0199e000-0000-7000-8000-000000000701'
const CASE = '0199e000-0000-7000-8000-000000000c01'
const MEMBERSHIP = '0199e000-0000-7000-8000-000000000212'
const EXECUTION = '0199e000-0000-7000-8000-000000000e01'
const PERSON = '0199e000-0000-7000-8000-000000000011'
const SESSION = '0199e000-0000-7000-8000-000000000d11'
const IDEMPOTENCY_KEY = '3f1c1e1a-6d1b-4c3e-9a51-2b7f9d0e4a11'
const COMMAND_ID = '0199e000-0000-7000-8000-00000000c0de'
const CASES = `/studio/v1/organizations/${ORGANIZATION}/historical-access-cases`
const HISTORY = `/studio/v1/organizations/${ORGANIZATION}/historical-relationships/${RELATIONSHIP}`
const BASE_HEADERS = {
  origin: 'https://studio.example.test',
  cookie: 'allfit_studio_session=opaque',
}
const READ_HEADERS = { ...BASE_HEADERS, 'x-historical-access-case': CASE }
const COMMAND_HEADERS = {
  ...BASE_HEADERS,
  'content-type': 'application/json',
  'idempotency-key': IDEMPOTENCY_KEY,
  'command-id': COMMAND_ID,
}

const OPENED: HistoricalAccessCase = {
  id: CASE,
  organization_id: ORGANIZATION,
  relationship_id: RELATIONSHIP,
  person: { id: '0199e000-0000-7000-8000-000000000001', given_name: 'Ana', family_name: 'Ríos' },
  cut_at: '2026-11-01T12:00:00+00:00',
  authorized: { membership_id: MEMBERSHIP, given_name: 'Camilo', family_name: 'Paz' },
  opened_by: {
    membership_id: '0199e000-0000-7000-8000-000000000211',
    given_name: 'Olivia',
    family_name: 'Mar',
  },
  purpose: 'service_dispute',
  case_reference: 'TICKET-42',
  justification: 'Ana disputes the sessions charged in October.',
  status: 'open',
  opened_at: '2026-11-08T10:00:00+00:00',
  expires_at: '2026-11-08T12:00:00+00:00',
  closed_at: null,
  closed_reason: null,
  closed_by: null,
}

const CREATE = {
  relationship_id: RELATIONSHIP,
  authorized_membership_id: MEMBERSHIP,
  purpose: 'service_dispute',
  case_reference: 'TICKET-42',
  justification: 'Ana disputes the sessions charged in October.',
  duration_hours: 2,
}

const SUMMARY: FrozenExecutionSummary = {
  id: EXECUTION,
  started_at: '2026-10-20T06:00:00.123456+00:00',
  ended_at: '2026-10-20T07:00:00+00:00',
  timezone: 'America/Bogota',
  activity_type_code: 'strength_training',
  activity_type_name: 'Strength training',
  discipline_code: 'strength',
  achieved_level: 'detailed',
  origin: 'relationship',
  applied_scope: { code: 'relationship_training', version: 1 },
}

const DETAIL: FrozenExecution = {
  ...SUMMARY,
  segments: [],
  strength_sets: [],
  endurance_laps: [],
  interval_results: [],
  round_results: [],
  mobility_results: [],
}

const RELATIONSHIP_READ: HistoricalRelationship = {
  relationship: { id: RELATIONSHIP, person: OPENED.person, ended_at: OPENED.cut_at },
  case: OPENED,
  scopes: [{ code: 'relationship_training', version: 1, frozen_at: OPENED.cut_at }],
}

function sessions(overrides: Partial<StudioSessionService> = {}): StudioSessionService {
  return {
    completeCode: async () => ({ opaqueToken: 'opaque' }),
    readSession: async () => ({
      authenticated: true,
      registration_status: 'complete',
      identity: { given_name: null, family_name: null },
    }),
    resolveActor: async () => ({ accountId: 'account', personId: PERSON, sessionId: SESSION }),
    resolveAccountIdentity: async () => ({
      actor: { accountId: 'account', personId: PERSON, sessionId: SESSION },
      identity: { givenName: null, familyName: null, verifiedEmail: 'ada@example.test' },
    }),
    logout: async () => ({ redirectUrl: 'https://studio.example.test', outcome: 'revoked' }),
    ...overrides,
  }
}

function service(overrides: Partial<HistoricalAccessService> = {}): HistoricalAccessService {
  return {
    open: async () => ({ resource: OPENED, replayed: false }),
    close: async () => ({
      resource: { ...OPENED, status: 'closed', closed_reason: 'closed_by_manager' },
      replayed: false,
    }),
    list: async () => ({ items: [OPENED], hasMore: false }),
    readRelationship: async () => ({ outcome: 'found', value: RELATIONSHIP_READ }),
    listExecutions: async () => ({
      outcome: 'found',
      value: { items: [SUMMARY], hasMore: false },
    }),
    readExecution: async () => ({ outcome: 'found', value: DETAIL }),
    listBodyProgress: async () => ({
      outcome: 'found',
      value: { appliedScope: { code: 'body_progress', version: 2 }, items: [], hasMore: false },
    }),
    listGoalVersions: async () => ({
      outcome: 'found',
      value: {
        appliedScope: { code: 'nutrition_guidance', version: 3 },
        items: [],
        hasMore: false,
      },
    }),
    ...overrides,
  }
}

function app(cases: HistoricalAccessService = service(), session = sessions()): Hono {
  const routes = new Hono()
  routes.route('/studio/v1', studioHistoricalAccessRoutes(cases, session))
  return routes
}

function request(
  path: string,
  init: { method?: string; headers?: Record<string, string>; body?: unknown } = {},
): Request {
  return new Request(`https://api.example.test${path}`, {
    method: init.method ?? 'GET',
    headers: init.headers ?? READ_HEADERS,
    ...(init.body === undefined
      ? {}
      : { body: typeof init.body === 'string' ? init.body : JSON.stringify(init.body) }),
  })
}

function postgresError(code: string): Error {
  return Object.assign(new Error(`postgres ${code}`), { code })
}

async function problemType(response: Response): Promise<string> {
  const payload = (await response.json()) as { type: string }
  return payload.type.replace('https://errors.allfit.invalid/', '')
}

beforeEach(() => {
  process.env.STUDIO_WEB_URL = 'https://studio.example.test'
})

describe('opening a case (OP-PRV-018)', () => {
  test('opens it as the member and through the session that signed in', async () => {
    const seen: { actor: HistoricalAccessActor; input: unknown }[] = []
    const cases = service({
      open: async (actor, input) => {
        seen.push({ actor, input })
        return { resource: OPENED, replayed: false }
      },
    })

    const response = await app(cases).fetch(
      request(CASES, { method: 'POST', headers: COMMAND_HEADERS, body: CREATE }),
    )

    expect(response.status).toBe(201)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(await response.json()).toEqual(OPENED)
    expect(seen[0]?.actor).toEqual({ personId: PERSON, sessionId: SESSION })
    expect(seen[0]?.input).toMatchObject({
      organizationId: ORGANIZATION,
      relationshipId: RELATIONSHIP,
      authorizedMembershipId: MEMBERSHIP,
      purpose: 'service_dispute',
      caseReference: 'TICKET-42',
      durationHours: 2,
      idempotencyKey: IDEMPOTENCY_KEY,
      commandId: COMMAND_ID,
    })
  })

  test('says when it answers a retry of the same command', async () => {
    const cases = service({ open: async () => ({ resource: OPENED, replayed: true }) })
    const response = await app(cases).fetch(
      request(CASES, { method: 'POST', headers: COMMAND_HEADERS, body: CREATE }),
    )
    expect(response.status).toBe(201)
    expect(response.headers.get('idempotent-replay')).toBe('true')
  })

  test('hashes the same command the same way, and a different one differently', async () => {
    const hashes: string[] = []
    const cases = service({
      open: async (_actor, input) => {
        hashes.push(input.requestHash.toString('hex'))
        return { resource: OPENED, replayed: false }
      },
    })
    const reordered = Object.fromEntries(Object.entries(CREATE).reverse())
    for (const body of [CREATE, reordered, { ...CREATE, duration_hours: 3 }]) {
      await app(cases).fetch(request(CASES, { method: 'POST', headers: COMMAND_HEADERS, body }))
    }
    expect(hashes[0]).toBe(hashes[1])
    expect(hashes[2]).not.toBe(hashes[0])
  })

  test.each([
    ['an unknown purpose', { ...CREATE, purpose: 'curiosity' }],
    ['more than a day', { ...CREATE, duration_hours: 25 }],
    ['less than an hour', { ...CREATE, duration_hours: 0 }],
    ['a fractional duration', { ...CREATE, duration_hours: 1.5 }],
    ['an empty reference', { ...CREATE, case_reference: '' }],
    ['a justification past 2000 characters', { ...CREATE, justification: 'x'.repeat(2001) }],
    ['a field the contract does not name', { ...CREATE, scope: 'health_context' }],
    ['a membership that is not an id', { ...CREATE, authorized_membership_id: 'camilo' }],
  ])('refuses %s before PostgreSQL sees it', async (_label, body) => {
    let called = false
    const cases = service({
      open: async () => {
        called = true
        return { resource: OPENED, replayed: false }
      },
    })
    const response = await app(cases).fetch(
      request(CASES, { method: 'POST', headers: COMMAND_HEADERS, body }),
    )
    expect(response.status).toBe(422)
    expect(called).toBe(false)
  })

  test('needs both command headers', async () => {
    const { 'command-id': _omitted, ...headers } = COMMAND_HEADERS
    const response = await app().fetch(request(CASES, { method: 'POST', headers, body: CREATE }))
    expect(response.status).toBe(400)
  })

  test('takes only JSON', async () => {
    const response = await app().fetch(
      request(CASES, {
        method: 'POST',
        headers: { ...COMMAND_HEADERS, 'content-type': 'text/plain' },
        body: CREATE,
      }),
    )
    expect(response.status).toBe(415)
  })

  test.each([
    ['AF401', 403, 'reauthentication-required'],
    ['42501', 403, 'forbidden'],
    ['P0002', 404, 'not-found'],
    ['23505', 409, 'conflict'],
    ['P0004', 409, 'conflict'],
    ['23514', 422, 'validation-failed'],
    ['23503', 422, 'validation-failed'],
    ['22023', 422, 'validation-failed'],
    ['40001', 409, 'idempotency-in-progress'],
  ])('answers PostgreSQL %s as %i %s', async (code, status, type) => {
    const cases = service({
      open: async () => {
        throw postgresError(code)
      },
    })
    const response = await app(cases).fetch(
      request(CASES, { method: 'POST', headers: COMMAND_HEADERS, body: CREATE }),
    )
    expect(response.status).toBe(status)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(await problemType(response)).toBe(type)
  })

  test('refuses another origin and an absent session', async () => {
    const foreign = await app().fetch(
      request(CASES, {
        method: 'POST',
        headers: { ...COMMAND_HEADERS, origin: 'https://evil.example.test' },
        body: CREATE,
      }),
    )
    const { cookie: _cookie, ...anonymous } = COMMAND_HEADERS
    const absent = await app().fetch(
      request(CASES, { method: 'POST', headers: anonymous, body: CREATE }),
    )
    expect(foreign.status).toBe(403)
    expect(absent.status).toBe(401)
  })

  test('a session that never named its access session cannot step up', async () => {
    const session = sessions({
      resolveActor: async () => ({ accountId: 'account', personId: PERSON }),
    })
    const response = await app(service(), session).fetch(
      request(CASES, { method: 'POST', headers: COMMAND_HEADERS, body: CREATE }),
    )
    expect(response.status).toBe(401)
  })
})

describe('listing cases (OP-PRV-025)', () => {
  test('returns a page and a cursor that comes back as the same position', async () => {
    const seen: unknown[] = []
    const cases = service({
      list: async (_actor, query) => {
        seen.push(query)
        return {
          items: [OPENED],
          hasMore: true,
          nextCursor: { openedAt: '2026-11-08T10:00:00.000Z', id: CASE },
        }
      },
    })
    const first = await app(cases).fetch(
      request(`${CASES}?relationship_id=${RELATIONSHIP}&limit=1`, { headers: BASE_HEADERS }),
    )
    const page = (await first.json()) as { data: unknown[]; page: { next_cursor: string } }
    expect(first.status).toBe(200)
    expect(first.headers.get('cache-control')).toBe('private, no-store')
    expect(page.data).toEqual([OPENED])

    await app(cases).fetch(
      request(`${CASES}?cursor=${page.page.next_cursor}`, { headers: BASE_HEADERS }),
    )
    expect(seen).toEqual([
      { organizationId: ORGANIZATION, relationshipId: RELATIONSHIP, limit: 1 },
      {
        organizationId: ORGANIZATION,
        limit: 25,
        cursor: { openedAt: '2026-11-08T10:00:00.000Z', id: CASE },
      },
    ])
  })

  test.each([
    ['limit=0'],
    ['limit=101'],
    ['cursor=garbage-garbage-garbage'],
    ['relationship_id=x'],
  ])('refuses %s', async (query) => {
    const response = await app().fetch(request(`${CASES}?${query}`, { headers: BASE_HEADERS }))
    expect(response.status).toBe(400)
  })
})

describe('closing a case (OP-PRV-019)', () => {
  test('closes it and answers the case as it stands', async () => {
    const seen: unknown[] = []
    const cases = service({
      close: async (_actor, input) => {
        seen.push(input)
        return {
          resource: { ...OPENED, status: 'closed', closed_reason: 'closed_by_manager' },
          replayed: true,
        }
      },
    })
    const { 'content-type': _type, ...headers } = COMMAND_HEADERS
    const response = await app(cases).fetch(
      request(`${CASES}/${CASE}/closure`, { method: 'POST', headers }),
    )
    expect(response.status).toBe(200)
    expect(response.headers.get('idempotent-replay')).toBe('true')
    expect(await response.json()).toMatchObject({ status: 'closed' })
    expect(seen[0]).toMatchObject({ organizationId: ORGANIZATION, caseId: CASE })
  })

  test('a case that is not there, or not the caller’s to close, is 404', async () => {
    const cases = service({
      close: async () => {
        throw postgresError('P0002')
      },
    })
    const response = await app(cases).fetch(
      request(`${CASES}/${CASE}/closure`, { method: 'POST', headers: COMMAND_HEADERS }),
    )
    expect(response.status).toBe(404)
  })
})

describe('reading through a case (OP-PRV-020)', () => {
  test('reads the relationship through the case the header names', async () => {
    const seen: unknown[] = []
    const cases = service({
      readRelationship: async (actor, target) => {
        seen.push({ actor, target })
        return { outcome: 'found', value: RELATIONSHIP_READ }
      },
    })
    const response = await app(cases).fetch(request(HISTORY))
    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect(await response.json()).toEqual(RELATIONSHIP_READ)
    expect(seen[0]).toMatchObject({
      actor: { personId: PERSON, sessionId: SESSION },
      target: { organizationId: ORGANIZATION, relationshipId: RELATIONSHIP, caseId: CASE },
    })
  })

  test('without a case header there is nothing to read through', async () => {
    const response = await app().fetch(request(HISTORY, { headers: BASE_HEADERS }))
    expect(response.status).toBe(400)
  })

  test('a case the caller may not use reads like none at all', async () => {
    const cases = service({ readRelationship: async () => ({ outcome: 'not_found' }) })
    const response = await app(cases).fetch(request(HISTORY))
    expect(response.status).toBe(404)
    expect(response.headers.get('cache-control')).toBe('no-store')
  })

  test('an old sign-in is asked to sign in again', async () => {
    const cases = service({
      listExecutions: async () => {
        throw postgresError('AF401')
      },
    })
    const response = await app(cases).fetch(request(`${HISTORY}/executions`))
    expect(response.status).toBe(403)
    expect(await problemType(response)).toBe('reauthentication-required')
  })

  test('pages the frozen sessions on the millisecond the cursor carries', async () => {
    const seen: unknown[] = []
    const cases = service({
      listExecutions: async (_actor, _target, page) => {
        seen.push(page)
        return {
          outcome: 'found',
          value: {
            items: [SUMMARY],
            hasMore: true,
            nextCursor: { startedAt: '2026-10-20T06:00:00.123Z', id: EXECUTION },
          },
        }
      },
    })
    const first = await app(cases).fetch(request(`${HISTORY}/executions?limit=1`))
    const page = (await first.json()) as { data: unknown[]; page: { next_cursor: string } }
    expect(page.data).toEqual([SUMMARY])
    await app(cases).fetch(request(`${HISTORY}/executions?cursor=${page.page.next_cursor}`))
    expect(seen).toEqual([
      { limit: 1 },
      { limit: 25, cursor: { startedAt: '2026-10-20T06:00:00.123Z', id: EXECUTION } },
    ])
  })

  test('one frozen session, or 403 naming the category when none stayed readable', async () => {
    const found = await app().fetch(request(`${HISTORY}/executions/${EXECUTION}`))
    expect(found.status).toBe(200)
    expect(await found.json()).toEqual(DETAIL)

    const cases = service({
      readExecution: async () => ({
        outcome: 'scope_required',
        requiredScope: { code: 'relationship_training', level: 'read' },
      }),
    })
    const refused = await app(cases).fetch(request(`${HISTORY}/executions/${EXECUTION}`))
    expect(refused.status).toBe(403)
    expect(await refused.json()).toMatchObject({
      required_scope: { code: 'relationship_training', level: 'read' },
    })
  })

  test('the frozen measurements carry the version that kept them readable', async () => {
    const seen: unknown[] = []
    const cases = service({
      listBodyProgress: async (_actor, _target, page) => {
        seen.push(page)
        return {
          outcome: 'found',
          value: {
            appliedScope: { code: 'body_progress', version: 2 },
            items: [],
            hasMore: true,
            nextCursor: { measuredOn: '2026-10-01', id: EXECUTION },
          },
        }
      },
    })
    const first = await app(cases).fetch(request(`${HISTORY}/body-progress`))
    const page = (await first.json()) as {
      applied_scope: unknown
      page: { next_cursor: string; has_more: boolean }
    }
    expect(first.status).toBe(200)
    expect(page.applied_scope).toEqual({ code: 'body_progress', version: 2 })
    expect(page.page.has_more).toBe(true)
    await app(cases).fetch(request(`${HISTORY}/body-progress?cursor=${page.page.next_cursor}`))
    expect(seen[1]).toEqual({ limit: 25, cursor: { measuredOn: '2026-10-01', id: EXECUTION } })
  })

  test('without body progress frozen readable, 403 names it', async () => {
    const cases = service({
      listBodyProgress: async () => ({
        outcome: 'scope_required',
        requiredScope: { code: 'body_progress', level: 'read' },
      }),
    })
    const response = await app(cases).fetch(request(`${HISTORY}/body-progress`))
    expect(response.status).toBe(403)
    expect(await problemType(response)).toBe('scope-required')
  })
})

describe('the goals an ended relationship proposed (OP-NUT-011, through a case)', () => {
  const GOAL = '0199e000-0000-7000-8000-000000000a01'
  const FROZEN_GOAL: FrozenNutritionGoalVersion = {
    id: GOAL,
    status_at_cut: 'accepted',
    rationale: null,
    author: { kind: 'professional', person_id: PERSON },
    targets: [
      {
        nutrient_code: 'protein',
        mode: 'minimum',
        minimum: 140,
        maximum: null,
        exact: null,
        unit: 'g',
      },
    ],
    created_at: '2026-10-01T10:00:00.123456+00:00',
    activated_at: '2026-10-02T09:00:00+00:00',
    decision: { decision: 'accepted', decided_at: '2026-10-02T09:00:00+00:00' },
  }

  test('carries the version that kept them readable, and pages on the exact instant', async () => {
    const seen: unknown[] = []
    const cases = service({
      listGoalVersions: async (actor, target, page) => {
        seen.push({ actor, target, page })
        return {
          outcome: 'found',
          value: {
            appliedScope: { code: 'nutrition_guidance', version: 3 },
            items: [FROZEN_GOAL],
            hasMore: true,
            nextCursor: { createdAt: FROZEN_GOAL.created_at, id: GOAL },
          },
        }
      },
    })
    const first = await app(cases).fetch(request(`${HISTORY}/nutrition/goal-versions?limit=1`))
    expect(first.status).toBe(200)
    expect(first.headers.get('cache-control')).toBe('private, no-store')
    const page = (await first.json()) as { page: { next_cursor: string } }
    assertMatchesContract('FrozenNutritionGoalVersionPage', page)
    expect(page).toMatchObject({
      applied_scope: { code: 'nutrition_guidance', version: 3 },
      data: [FROZEN_GOAL],
      page: { has_more: true },
    })
    await app(cases).fetch(
      request(`${HISTORY}/nutrition/goal-versions?cursor=${page.page.next_cursor}`),
    )
    expect(seen[0]).toMatchObject({
      actor: { personId: PERSON, sessionId: SESSION },
      target: { organizationId: ORGANIZATION, relationshipId: RELATIONSHIP, caseId: CASE },
      page: { limit: 1 },
    })
    expect(seen[1]).toMatchObject({
      page: { limit: 25, cursor: { createdAt: FROZEN_GOAL.created_at, id: GOAL } },
    })
  })

  test('403 names the guidance when it was not frozen readable; a case not usable is 404', async () => {
    const unshared = await app(
      service({
        listGoalVersions: async () => ({
          outcome: 'scope_required',
          requiredScope: { code: 'nutrition_guidance', level: 'read' },
        }),
      }),
    ).fetch(request(`${HISTORY}/nutrition/goal-versions`))
    expect(unshared.status).toBe(403)
    expect(await unshared.json()).toMatchObject({
      required_scope: { code: 'nutrition_guidance', level: 'read' },
    })

    const absent = await app(
      service({ listGoalVersions: async () => ({ outcome: 'not_found' }) }),
    ).fetch(request(`${HISTORY}/nutrition/goal-versions`))
    expect(absent.status).toBe(404)

    const stale = await app(
      service({
        listGoalVersions: async () => {
          throw postgresError('AF401')
        },
      }),
    ).fetch(request(`${HISTORY}/nutrition/goal-versions`))
    expect(stale.status).toBe(403)
    expect(await problemType(stale)).toBe('reauthentication-required')

    const caseless = await app().fetch(
      request(`${HISTORY}/nutrition/goal-versions`, { headers: BASE_HEADERS }),
    )
    expect(caseless.status).toBe(400)
    const forged = await app().fetch(
      request(`${HISTORY}/nutrition/goal-versions?cursor=bm90LWEtY3Vyc29y`),
    )
    expect(forged.status).toBe(400)
  })
})
