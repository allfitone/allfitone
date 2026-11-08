/**
 * `T-PRV-API-SPACE` — what she shares, taking one category back, and hiding one
 * session from one gym, over HTTP.
 *
 * Whose grant it is, and whether it can still be revoked, is PostgreSQL's answer
 * (`T-PRV-REVOKE-01`). What these hold is the route's own part: it acts only as the
 * caller, refuses a command it cannot replay, and says «not found» for somebody
 * else's grant rather than «not yours».
 */

import { describe, expect, test } from 'bun:test'
import { Hono } from 'hono'

import type { VerifiedToken } from '@allfitone/auth-provider'
import { allfitV1ContractManifest } from '@allfitone/contracts'
import { createApp } from '../../../application.js'
import type { SpaceActorResolver } from '../../identity/index.js'
import { allfitV1ContractSchemas } from '@allfitone/contracts'
import Ajv2020 from 'ajv/dist/2020'
import addFormats from 'ajv-formats'

import type { MyConsentService, SessionVisibilityService } from '../application/index.js'
import type {
  MyConsent,
  MyConsentCommand,
  SessionVisibilityCommand,
  SessionVisibilityDenial,
} from '../domain/index.js'
import { spacePrivacyRoutes } from './space.js'

const PERSON = '019c8000-0000-7000-8000-000000000002'
const GRANT = '019c8000-0000-7000-8000-000000000501'
const AUTH = { authorization: 'Bearer token' }
const COMMAND_HEADERS = {
  ...AUTH,
  'idempotency-key': '6f1c2a4e-8b3d-4c5e-9f60-7a8b9c0d1e2f',
  'command-id': '019c8000-0000-7000-8000-000000000f01',
}

const verifier = async (): Promise<VerifiedToken> => ({
  subject: 'auth0|ana',
  sessionId: 'session',
  surface: 'space',
  authenticatedAt: null,
})

const actors: SpaceActorResolver = {
  actorFor: async () => ({ accountId: 'account', personId: PERSON }),
  personFor: async () => PERSON,
}

const CONSENT: MyConsent = {
  relationship_id: '019c8000-0000-7000-8000-000000000201',
  organization_id: '019c8000-0000-7000-8000-000000000101',
  organization_name: 'Bodytech Chicó',
  relationship_status: 'active',
  started_at: '2026-09-12T14:00:00.000Z',
  ended_at: null,
  scope_code: 'body_progress',
  presented_snapshot: { title: 'Medidas del cuerpo' },
  decision: 'accepted',
  decided_at: '2026-09-12T14:00:00.000Z',
  grant_id: GRANT,
  grant_status: 'active',
  access_level: 'read',
  granted_at: '2026-09-12T14:00:00.000Z',
  frozen_at: null,
  revoked_at: null,
}

function consents(overrides: Partial<MyConsentService> = {}): MyConsentService {
  return {
    listMine: async () => [CONSENT],
    revoke: async (command) => ({
      resource: {
        grantId: command.grantId,
        status: 'revoked',
        revokedAt: '2026-10-21T15:00:00.000Z',
      },
      replayed: false,
    }),
    ...overrides,
  }
}

function app(service: MyConsentService = consents()): Hono {
  const routes = new Hono()
  routes.route('/space/v1', spacePrivacyRoutes(service, verifier, actors))
  return routes
}

const revoke = (service?: MyConsentService, headers: Record<string, string> = COMMAND_HEADERS) =>
  app(service).request(`/space/v1/consents/${GRANT}/revocation`, { method: 'POST', headers })

describe('what she shares', () => {
  test('T-PRV-API-SPACE-01 lists her own, as herself, never stored', async () => {
    const seen: string[] = []
    const response = await app(
      consents({
        listMine: async (personId) => {
          seen.push(personId)
          return [CONSENT]
        },
      }),
    ).request('/space/v1/consents', { headers: AUTH })

    expect(response.status).toBe(200)
    expect(response.headers.get('Cache-Control')).toBe('private, no-store')
    expect(await response.json()).toEqual({ data: [CONSENT] })
    expect(seen).toEqual([PERSON])
  })

  test('T-PRV-API-SPACE-02 without a session nothing is read', async () => {
    const response = await app().request('/space/v1/consents')
    expect(response.status).toBe(401)
  })
})

describe('taking one category back', () => {
  test('T-PRV-API-SPACE-03 revokes the grant named in the path', async () => {
    const seen: MyConsentCommand[] = []
    const response = await revoke(
      consents({
        revoke: async (command) => {
          seen.push(command)
          return {
            resource: { grantId: GRANT, status: 'revoked', revokedAt: '2026-10-21T15:00:00.000Z' },
            replayed: false,
          }
        },
      }),
    )

    expect(response.status).toBe(200)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    expect(await response.json()).toEqual({
      id: GRANT,
      status: 'revoked',
      revoked_at: '2026-10-21T15:00:00.000Z',
    })
    expect(seen[0]?.personId).toBe(PERSON)
    expect(seen[0]?.grantId).toBe(GRANT)
  })

  test('T-PRV-API-SPACE-04 the same command again says it is a replay', async () => {
    const response = await revoke(
      consents({
        revoke: async () => ({
          resource: { grantId: GRANT, status: 'revoked', revokedAt: '2026-10-21T15:00:00.000Z' },
          replayed: true,
        }),
      }),
    )
    expect(response.status).toBe(200)
    expect(response.headers.get('Idempotent-Replay')).toBe('true')
  })

  test('T-PRV-API-SPACE-05 a command it could not replay is refused before anything runs', async () => {
    let ran = false
    const response = await revoke(
      consents({
        revoke: async () => {
          ran = true
          throw new Error('must not run')
        },
      }),
      AUTH,
    )
    expect(response.status).toBe(400)
    expect(ran).toBe(false)
  })

  test("T-PRV-API-SPACE-06 somebody else's grant is not found, not forbidden", async () => {
    const response = await revoke(
      consents({
        revoke: async () => {
          throw Object.assign(new Error('grant not found'), { code: 'P0002' })
        },
      }),
    )
    expect(response.status).toBe(404)
  })

  test('T-PRV-API-SPACE-07 a grant already revoked is a conflict, not an outage', async () => {
    const response = await revoke(
      consents({
        revoke: async () => {
          throw Object.assign(new Error('already revoked'), { code: 'P0004' })
        },
      }),
    )
    expect(response.status).toBe(409)
  })

  test('T-PRV-API-SPACE-08 a path that is not a grant id is refused', async () => {
    const response = await app().request('/space/v1/consents/not-an-id/revocation', {
      method: 'POST',
      headers: COMMAND_HEADERS,
    })
    expect(response.status).toBe(400)
  })
})

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

const EXECUTION = '019c8000-0000-7000-8000-000000000e01'
const RELATIONSHIP = '019c8000-0000-7000-8000-000000000201'
const DENIAL: SessionVisibilityDenial = {
  executed_session_id: EXECUTION,
  relationship_id: RELATIONSHIP,
  organization: { id: '019c8000-0000-7000-8000-000000000101', display_name: 'Bodytech Chicó' },
  status: 'active',
  denied_at: '2026-11-04T15:00:00.000Z',
  restored_at: null,
  session: { started_at: '2026-11-01T11:00:00.000Z', activity_type_name: 'Fuerza' },
}

function visibility(overrides: Partial<SessionVisibilityService> = {}): SessionVisibilityService {
  return {
    hide: async () => ({ resource: DENIAL, replayed: false }),
    restore: async () => ({
      resource: { ...DENIAL, status: 'reverted', restored_at: '2026-11-04T16:00:00.000Z' },
      replayed: false,
    }),
    listMine: async () => ({ items: [DENIAL], hasMore: false }),
    ...overrides,
  }
}

function visibilityApp(service: SessionVisibilityService = visibility()): Hono {
  const routes = new Hono()
  routes.route('/space/v1', spacePrivacyRoutes(consents(), verifier, actors, service))
  return routes
}

const hide = (
  service?: SessionVisibilityService,
  body: unknown = { relationship_id: RELATIONSHIP },
  headers: Record<string, string> = COMMAND_HEADERS,
) =>
  visibilityApp(service).request(`/space/v1/executions/${EXECUTION}/visibility`, {
    method: 'PUT',
    headers: { ...headers, 'content-type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })

const restore = (
  service?: SessionVisibilityService,
  headers: Record<string, string> = COMMAND_HEADERS,
) =>
  visibilityApp(service).request(`/space/v1/executions/${EXECUTION}/visibility/${RELATIONSHIP}`, {
    method: 'DELETE',
    headers,
  })

describe('hiding one session from one gym', () => {
  test('T-PRV-API-SPACE-09 hides her session from the relationship in the body, as herself', async () => {
    const seen: SessionVisibilityCommand[] = []
    const response = await hide(
      visibility({
        hide: async (command) => {
          seen.push(command)
          return { resource: DENIAL, replayed: false }
        },
      }),
    )

    expect(response.status).toBe(200)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    const body = await response.json()
    assertMatchesContract('SessionVisibilityDenial', body)
    expect(body).toEqual(DENIAL)
    expect(seen[0]).toMatchObject({
      personId: PERSON,
      executionId: EXECUTION,
      relationshipId: RELATIONSHIP,
      idempotencyKey: COMMAND_HEADERS['idempotency-key'],
      commandId: COMMAND_HEADERS['command-id'],
    })
  })

  test('T-PRV-API-SPACE-10 the same command again says it is a replay', async () => {
    const response = await hide(
      visibility({ hide: async () => ({ resource: DENIAL, replayed: true }) }),
    )
    expect(response.headers.get('Idempotent-Replay')).toBe('true')
  })

  test('T-PRV-API-SPACE-11 a body outside the contract, or no command headers, is refused before anything runs', async () => {
    let ran = false
    const service = visibility({
      hide: async () => {
        ran = true
        throw new Error('must not run')
      },
    })
    expect((await hide(service, {})).status).toBe(422)
    expect((await hide(service, { relationship_id: 'nope' })).status).toBe(422)
    expect((await hide(service, { relationship_id: RELATIONSHIP, extra: true })).status).toBe(422)
    expect((await hide(service, '{not json')).status).toBe(400)
    expect((await hide(service, { relationship_id: RELATIONSHIP }, AUTH)).status).toBe(400)
    expect(ran).toBe(false)
  })

  test('T-PRV-API-SPACE-12 hide, restore and another gym never share a request hash', async () => {
    const hashes: string[] = []
    const service = visibility({
      hide: async (command) => {
        hashes.push(Buffer.from(command.requestHash).toString('hex'))
        return { resource: DENIAL, replayed: false }
      },
      restore: async (command) => {
        hashes.push(Buffer.from(command.requestHash).toString('hex'))
        return { resource: DENIAL, replayed: false }
      },
    })
    await hide(service)
    await restore(service)
    await hide(service, { relationship_id: '019c8000-0000-7000-8000-000000000202' })
    expect(hashes).toHaveLength(3)
    expect(new Set(hashes).size).toBe(3)
  })

  test('T-PRV-API-SPACE-13 what PostgreSQL refuses keeps its meaning', async () => {
    const refusing = (code: string) =>
      visibility({
        hide: async () => {
          throw Object.assign(new Error('refused'), { code })
        },
      })
    // A session produced inside the relationship cannot be hidden from it.
    expect((await hide(refusing('22023'))).status).toBe(422)
    // Not hers, or no such session or relationship.
    expect((await hide(refusing('P0002'))).status).toBe(404)
    // An ended relationship with nothing left to hide from, or a key reused for another body.
    expect((await hide(refusing('P0004'))).status).toBe(409)
    expect((await hide(refusing('23505'))).status).toBe(409)
  })
})

describe('sharing it again', () => {
  test('T-PRV-API-SPACE-14 restores the pair in the path', async () => {
    const seen: SessionVisibilityCommand[] = []
    const response = await restore(
      visibility({
        restore: async (command) => {
          seen.push(command)
          return {
            resource: { ...DENIAL, status: 'reverted', restored_at: '2026-11-04T16:00:00.000Z' },
            replayed: false,
          }
        },
      }),
    )
    expect(response.status).toBe(200)
    const body = await response.json()
    assertMatchesContract('SessionVisibilityDenial', body)
    expect(body).toMatchObject({ status: 'reverted', restored_at: '2026-11-04T16:00:00.000Z' })
    expect(seen[0]).toMatchObject({
      personId: PERSON,
      executionId: EXECUTION,
      relationshipId: RELATIONSHIP,
    })
  })

  test('T-PRV-API-SPACE-15 nothing hidden there is not found, and ids that are not ids are refused', async () => {
    const missing = await restore(
      visibility({
        restore: async () => {
          throw Object.assign(new Error('denial not found'), { code: 'P0002' })
        },
      }),
    )
    expect(missing.status).toBe(404)
    const malformed = await visibilityApp().request(
      `/space/v1/executions/${EXECUTION}/visibility/nope`,
      { method: 'DELETE', headers: COMMAND_HEADERS },
    )
    expect(malformed.status).toBe(400)
  })
})

describe('what she hides', () => {
  test('T-PRV-API-SPACE-16 lists her own, a page at a time, never stored', async () => {
    const seen: Array<Parameters<SessionVisibilityService['listMine']>[0]> = []
    const service = visibility({
      listMine: async (input) => {
        seen.push(input)
        return {
          items: [DENIAL],
          hasMore: true,
          nextCursor: { deniedAt: DENIAL.denied_at, id: '019c8000-0000-7000-8000-000000000d01' },
        }
      },
    })
    const first = await visibilityApp(service).request('/space/v1/visibility-denials?limit=1', {
      headers: AUTH,
    })
    expect(first.status).toBe(200)
    expect(first.headers.get('Cache-Control')).toBe('private, no-store')
    const body = (await first.json()) as { page: { next_cursor: string } }
    assertMatchesContract('SessionVisibilityDenialPage', body)

    await visibilityApp(service).request(
      `/space/v1/visibility-denials?limit=1&cursor=${body.page.next_cursor}`,
      { headers: AUTH },
    )
    expect(seen[0]).toEqual({ personId: PERSON, limit: 1 })
    expect(seen[1]).toEqual({
      personId: PERSON,
      limit: 1,
      cursor: { deniedAt: DENIAL.denied_at, id: '019c8000-0000-7000-8000-000000000d01' },
    })
  })

  test('T-PRV-API-SPACE-17 without a session, or with a page outside the contract, nothing is read', async () => {
    let ran = false
    const service = visibility({
      listMine: async () => {
        ran = true
        return { items: [], hasMore: false }
      },
    })
    expect((await visibilityApp(service).request('/space/v1/visibility-denials')).status).toBe(401)
    const oversized = await visibilityApp(service).request(
      '/space/v1/visibility-denials?limit=101',
      { headers: AUTH },
    )
    expect(oversized.status).toBe(400)
    expect(ran).toBe(false)
  })
})

describe('where the application serves it', () => {
  test('T-PRV-API-SPACE-18 OP-PRV-006, OP-PRV-007 and OP-PRV-017 are served as declared', () => {
    process.env.API_PUBLIC_URL = 'https://api.example.test'
    process.env.STUDIO_WEB_URL = 'https://studio.example.test'
    process.env.BACKOFFICE_WEB_URL = 'https://backoffice.example.test'
    const declared = allfitV1ContractManifest.operations
      .filter((operation) =>
        ['OP-PRV-006', 'OP-PRV-007', 'OP-PRV-017'].includes(operation.allfitOperation),
      )
      .map((operation) => `${operation.method} ${operation.path.replaceAll(/\{([^}]+)\}/g, ':$1')}`)
    expect(declared).toHaveLength(3)
    const application = createApp().routes.map((route) => `${route.method} ${route.path}`)
    expect(declared.filter((route) => !application.includes(route))).toEqual([])
  })
})
