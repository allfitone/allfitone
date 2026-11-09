/**
 * `T-REL-CARD-API`, `T-REL-TODAY-API` — the client card (OP-REL-019) and what needs
 * attention today (OP-REL-020) over HTTP.
 *
 * Who attends whom, what she shares and what each role sees are PostgreSQL's answers
 * (`T-REL-CARD-01`, `T-REL-CARD-02`, `T-REL-TODAY-01`, `T-REL-TODAY-02`). What these hold
 * is the route's own part: the Studio origin and cookie, the caller and a fresh request id
 * carried through, the shape the contract publishes, the operations each section and
 * notice points to, and the database's refusals translated without saying more.
 */

import { beforeEach, describe, expect, test } from 'bun:test'
import { allfitV1ContractSchemas } from '@allfitone/contracts'
import Ajv2020 from 'ajv/dist/2020'
import addFormats from 'ajv-formats'
import { Hono } from 'hono'

import type { StudioSessionService } from '../../identity/index.js'
import type { ClientCardService, StudioTodayService } from '../application/index.js'
import type { ClientCard, StudioToday } from '../domain/index.js'
import { studioRelationshipRoutes } from './studio.js'
import { CARD_READS } from './client-card.js'

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

const ORGANIZATION = '019ae700-0000-7000-8000-000000000101'
const CLIENT = '019ae700-0000-7000-8000-000000000001'
const RELATIONSHIP = '019ae700-0000-7000-8000-000000000701'
const CARD_PATH = `/studio/v1/organizations/${ORGANIZATION}/clients/${CLIENT}`
const TODAY_PATH = `/studio/v1/organizations/${ORGANIZATION}/today`
const HEADERS = { origin: 'https://studio.example.test', cookie: 'allfit_studio_session=opaque' }
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

const TRAINING = {
  scope_code: 'relationship_training',
  scope_version: 3,
  access_level: 'read',
  granted_at: '2026-09-01T10:00:00.123456+00:00',
} as const
const MEAL_PHOTOS = { ...TRAINING, scope_code: 'nutrition_media', scope_version: 1 } as const

const ATTENDED: ClientCard = {
  kind: 'attending',
  person_id: CLIENT,
  display_name: 'Ana Cliente',
  relationship: { id: RELATIONSHIP, started_at: '2026-09-01T10:00:00+00:00' },
  attendance: { role: 'substitute', ends_on: '2026-12-31' },
  sections: [TRAINING, MEAL_PHOTOS],
  withdrawn: [{ scope_code: 'health_context', withdrawn_at: '2026-11-03T15:00:00+00:00' }],
}

const FORMER: ClientCard = {
  kind: 'former',
  person_id: CLIENT,
  reason: 'substitution_ended',
  lost_at: '2026-11-05T05:00:00+00:00',
}

function sessions(personId: string | null = 'coach'): StudioSessionService {
  return {
    completeCode: async () => ({ opaqueToken: 'opaque' }),
    readSession: async () => ({
      authenticated: true,
      registration_status: 'complete',
      identity: { given_name: 'Ada', family_name: 'Lovelace' },
    }),
    resolveActor: async () => ({ accountId: 'account', personId }),
    resolveAccountIdentity: async () => ({
      actor: { accountId: 'account', personId },
      identity: { givenName: 'Ada', familyName: 'Lovelace', verifiedEmail: 'ada@example.test' },
    }),
    logout: async () => ({ redirectUrl: 'https://studio.example.test', outcome: 'already-absent' }),
  } as StudioSessionService
}

function sqlError(code: string): Error {
  return Object.assign(new Error(code), { code })
}

function cardApp(cards: ClientCardService): Hono {
  const routes = new Hono()
  routes.route('/studio/v1', studioRelationshipRoutes({ sessions: sessions(), cards }))
  return routes
}

function todayApp(today: StudioTodayService): Hono {
  const routes = new Hono()
  routes.route('/studio/v1', studioRelationshipRoutes({ sessions: sessions(), today }))
  return routes
}

beforeEach(() => {
  process.env.STUDIO_WEB_URL = 'https://studio.example.test'
})

describe('OP-REL-019: the card of a client', () => {
  test('T-REL-CARD-API-01 the card of a client he attends, with what reads each section', async () => {
    const calls: unknown[] = []
    const response = await cardApp({
      read: async (actor, query) => {
        calls.push({ actor, query })
        return ATTENDED
      },
    }).request(CARD_PATH, { headers: HEADERS })

    expect(response.status).toBe(200)
    expect(response.headers.get('Cache-Control')).toBe('private, no-store')
    const body = (await response.json()) as Record<string, unknown>
    assertMatchesContract('StudioClientCard', body)
    expect(body).toEqual({
      ...ATTENDED,
      sections: [
        {
          ...TRAINING,
          reads: [
            'getAuthorizedClientTrainingProfile',
            'listAuthorizedClientExecutions',
            'getAuthorizedClientProgress',
            'listRelationshipAssignments',
          ],
        },
        { ...MEAL_PHOTOS, reads: ['getAuthorizedClientNutritionMealPhoto'] },
      ],
    })
    expect(calls).toEqual([
      {
        actor: { accountId: 'account', personId: 'coach' },
        query: { organizationId: ORGANIZATION, personId: CLIENT },
      },
    ])
  })

  test('T-REL-CARD-API-02 why a coach no longer attends her, and nothing else', async () => {
    const response = await cardApp({ read: async () => FORMER }).request(CARD_PATH, {
      headers: HEADERS,
    })

    expect(response.status).toBe(200)
    const body = (await response.json()) as Record<string, unknown>
    assertMatchesContract('StudioClientCard', body)
    expect(body).toEqual(FORMER)
  })

  test('T-REL-CARD-API-03 every category reads through at least one published operation', () => {
    for (const [scope, reads] of Object.entries(CARD_READS)) {
      expect(reads.length, scope).toBeGreaterThan(0)
      for (const read of reads) assertMatchesContract('StudioClientCardRead', read)
    }
    expect(Object.keys(CARD_READS).sort()).toEqual([
      'body_progress',
      'health_context',
      'nutrition_guidance',
      'nutrition_intake',
      'nutrition_media',
      'prior_training_history',
      'relationship_training',
    ])
  })

  test('T-REL-CARD-API-04 the refusals say no more than the database does', async () => {
    const cases: [Error, number, string][] = [
      [sqlError('P0002'), 404, 'not-found'],
      [sqlError('42501'), 403, 'forbidden'],
    ]
    for (const [error, status, code] of cases) {
      const response = await cardApp({
        read: async () => {
          throw error
        },
      }).request(CARD_PATH, { headers: HEADERS })
      expect(response.status).toBe(status)
      expect(((await response.json()) as { error: { code: string } }).error.code).toBe(code)
    }
  })

  test('T-REL-CARD-API-05 a malformed path, a foreign origin or no session never reaches the database', async () => {
    const calls: unknown[] = []
    const service: ClientCardService = {
      read: async (...args) => {
        calls.push(args)
        return ATTENDED
      },
    }
    const badPath = await cardApp(service).request(
      `/studio/v1/organizations/${ORGANIZATION}/clients/not-a-uuid`,
      { headers: HEADERS },
    )
    expect(badPath.status).toBe(400)
    const foreign = await cardApp(service).request(CARD_PATH, {
      headers: { ...HEADERS, origin: 'https://elsewhere.example.test' },
    })
    expect(foreign.status).toBe(403)
    const anonymous = await cardApp(service).request(CARD_PATH, {
      headers: { origin: HEADERS.origin },
    })
    expect(anonymous.status).toBe(401)
    expect(calls).toEqual([])
  })
})

const TODAY: StudioToday = {
  organization_id: ORGANIZATION,
  generated_at: '2026-11-09T13:00:00.123456+00:00',
  empty: false,
  notices: {
    client_invitations: {
      count: 1,
      awaiting: 0,
      lapsed: 1,
      items: [
        {
          invitation_id: '019ae700-0000-7000-8000-000000000501',
          contact: 'b***@example.test',
          state: 'lapsed',
          created_at: '2026-11-01T10:00:00+00:00',
          expires_at: '2026-11-08T10:00:00+00:00',
        },
      ],
    },
    training: {
      count: 1,
      items: [
        {
          person_id: CLIENT,
          display_name: 'Ana Cliente',
          relationship_id: RELATIONSHIP,
          closed_week: { week_starts_on: '2026-11-02', planned: 4, not_logged: 2 },
          recent_results: { count: 0, last_ended_at: null },
        },
      ],
    },
  },
}

describe('OP-REL-020: what needs attention today', () => {
  test('T-REL-TODAY-API-01 the notices of the caller, each with where it is resolved', async () => {
    const calls: { actor: unknown; query: { organizationId: string; requestId: string } }[] = []
    const response = await todayApp({
      read: async (actor, query) => {
        calls.push({ actor, query })
        return TODAY
      },
    }).request(TODAY_PATH, { headers: HEADERS })

    expect(response.status).toBe(200)
    expect(response.headers.get('Cache-Control')).toBe('private, no-store')
    const body = (await response.json()) as { notices: Record<string, { link: unknown }> }
    assertMatchesContract('StudioToday', body)
    expect(Object.keys(body.notices).sort()).toEqual(['client_invitations', 'training'])
    expect(body.notices.client_invitations?.link).toEqual({
      operation_id: 'listStudioOrganizationClients',
      query: { status: 'invited' },
    })
    expect(body.notices.training?.link).toEqual({ operation_id: 'getStudioClientCard', query: {} })
    expect(calls[0]?.query.organizationId).toBe(ORGANIZATION)
    expect(calls[0]?.query.requestId).toMatch(UUID_V4)
  })

  test('T-REL-TODAY-API-02 every notice the contract knows has a link that resolves it', async () => {
    const every: StudioToday = {
      ...TODAY,
      empty: true,
      notices: {
        client_invitations: { count: 0, awaiting: 0, lapsed: 0, items: [] },
        unassigned_relationships: { count: 0, items: [] },
        termination_requests: { count: 0, items: [] },
        team_invitations: { count: 0, awaiting: 0, lapsed: 0, items: [] },
        team: { count: 1, by_role: [{ role_code: 'owner', count: 1 }] },
        new_relationships: { count: 0, items: [] },
        training: { count: 0, items: [] },
      },
    }
    const response = await todayApp({ read: async () => every }).request(TODAY_PATH, {
      headers: HEADERS,
    })
    const body = (await response.json()) as { notices: Record<string, { link: unknown }> }
    assertMatchesContract('StudioToday', body)
    expect(
      Object.fromEntries(Object.entries(body.notices).map(([key, value]) => [key, value.link])),
    ).toEqual({
      client_invitations: {
        operation_id: 'listStudioOrganizationClients',
        query: { status: 'invited' },
      },
      unassigned_relationships: { operation_id: 'assignRelationshipHolder', query: {} },
      termination_requests: { operation_id: 'terminateRelationship', query: {} },
      team_invitations: { operation_id: 'listStudioTeamInvitations', query: {} },
      team: { operation_id: 'listStudioOrganizationMemberships', query: {} },
      new_relationships: {
        operation_id: 'listStudioOrganizationClients',
        query: { status: 'active' },
      },
      training: { operation_id: 'getStudioClientCard', query: {} },
    })
  })

  test('T-REL-TODAY-API-03 the refusals say no more than the database does', async () => {
    for (const [error, status] of [
      [sqlError('42501'), 403],
      [sqlError('22023'), 422],
    ] as const) {
      const response = await todayApp({
        read: async () => {
          throw error
        },
      }).request(TODAY_PATH, { headers: HEADERS })
      expect(response.status).toBe(status)
    }
    const badPath = await todayApp({ read: async () => TODAY }).request(
      '/studio/v1/organizations/nope/today',
      { headers: HEADERS },
    )
    expect(badPath.status).toBe(400)
  })
})
