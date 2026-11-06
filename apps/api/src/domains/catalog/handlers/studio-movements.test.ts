/**
 * `T-CAT-STUDIO-MOVEMENT-API` — a gym's own movements over HTTP (HU-STUDIO-064..067).
 *
 * What may be created, renamed, archived or seen is PostgreSQL's answer
 * (`T-CAT-MOVEMENT-*`). What these hold is the route's own part: it serves the Studio web
 * origin with its session cookie, carries the member and the command through, answers in
 * the contract's shape, and tells the editor which conflict it hit without saying more
 * than the database did. The application service is the real one, over a recording
 * database, so the demonstration address is composed exactly as production does.
 */

import { beforeEach, describe, expect, test } from 'bun:test'
import { allfitV1ContractSchemas } from '@allfitone/contracts'
import Ajv2020 from 'ajv/dist/2020'
import addFormats from 'ajv-formats'
import { Hono } from 'hono'

import type { StudioSessionService } from '../../identity/index.js'
import { createOrganizationMovementService } from '../application/organization-movements.js'
import {
  MovementCursorError,
  type OrganizationMovementDatabase,
  type StoredOrganizationMovement,
  type StoredStudioMovement,
} from '../domain/index.js'
import { studioMovementRoutes } from './studio-movements.js'

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

const COACH = '019f5707-0000-7000-8000-000000000002'
const ORGANIZATION = '019f5707-0000-7000-8000-000000000101'
const MOVEMENT = '019f5707-0000-7000-8000-0000000000a1'
const GLOBAL = '019f5707-0000-7000-8000-0000000000f1'
const COLLECTION = `/studio/v1/organizations/${ORGANIZATION}/movements`
const ITEM = `${COLLECTION}/${MOVEMENT}`
const ARCHIVAL = `${ITEM}/archival`
const HEADERS = { origin: 'https://studio.example.test', cookie: 'allfit_studio_session=opaque' }
const COMMAND_HEADERS = {
  ...HEADERS,
  'content-type': 'application/json',
  'idempotency-key': '3f1c2a4e-8b3d-4c5e-9f60-7a8b9c0d1e2f',
  'command-id': '019f5707-0000-7000-8000-000000000c01',
}
const CURSOR = 'c2VudGFkaWxsYXwwMTlmNTcwNw'

const LISTED: StoredStudioMovement = {
  id: GLOBAL,
  name: 'Sentadilla búlgara',
  discipline_code: 'strength',
  scope: 'global',
  archived: false,
  muscles: ['quadriceps'],
  equipment: ['dumbbell'],
  demo_object_key: 'movements/bulgarian.webp',
}

const OWN: StoredOrganizationMovement = {
  id: MOVEMENT,
  name: 'Búlgara de la casa',
  discipline_code: 'strength',
  scope: 'organization',
  archived: false,
  revision: 1,
  aliases: ['Búlgara casera'],
  equipment: ['dumbbell'],
  muscles: [],
  variant_of: { id: GLOBAL, name: 'Sentadilla búlgara', relation: 'variant', note: null },
  name_locked: false,
  demo_object_key: null,
}

type Calls = {
  search: Array<Parameters<OrganizationMovementDatabase['search']>[0]>
  read: Array<Parameters<OrganizationMovementDatabase['read']>[0]>
  create: Array<Parameters<OrganizationMovementDatabase['create']>[0]>
  update: Array<Parameters<OrganizationMovementDatabase['update']>[0]>
  archive: Array<Parameters<OrganizationMovementDatabase['archive']>[0]>
}

let calls: Calls

function database(
  overrides: Partial<OrganizationMovementDatabase> = {},
): OrganizationMovementDatabase {
  return {
    search: async (input) => {
      calls.search.push(input)
      return { data: [LISTED], page: { next_cursor: null, has_more: false } }
    },
    read: async (input) => {
      calls.read.push(input)
      return OWN
    },
    create: async (input) => {
      calls.create.push(input)
      return { resource: OWN, replayed: false }
    },
    update: async (input) => {
      calls.update.push(input)
      return { resource: { ...OWN, revision: 2, name: 'Búlgara nueva' }, replayed: false }
    },
    archive: async (input) => {
      calls.archive.push(input)
      return { resource: { ...OWN, archived: true, revision: 2 }, replayed: false }
    },
    ...overrides,
  }
}

function sessionService(): StudioSessionService {
  const unused = async (): Promise<never> => {
    throw new Error('This session operation is outside the movement test')
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

function app(overrides: Partial<OrganizationMovementDatabase> = {}): Hono {
  const service = createOrganizationMovementService({
    database: database(overrides),
    mediaBaseUrl: 'https://media.example.test/',
  })
  const routes = new Hono()
  routes.route('/studio/v1', studioMovementRoutes(service, sessionService()))
  return routes
}

function databaseError(code: string, message: string, extra: Record<string, string> = {}) {
  return Object.assign(new Error(message), { code, ...extra })
}

async function problemOf(response: Response) {
  const body: unknown = await response.json()
  assertMatchesContract('Problem', body)
  return body as { type: string; errors?: Array<{ code: string; path: string; message: string }> }
}

beforeEach(() => {
  process.env.STUDIO_WEB_URL = 'https://studio.example.test'
  calls = { search: [], read: [], create: [], update: [], archive: [] }
})

describe('searching', () => {
  test('T-CAT-STUDIO-MOVEMENT-API-01 carries the member, the organization and every filter', async () => {
    const response = await app().request(
      `${COLLECTION}?q=%20b%C3%BAlgara%20&discipline=strength&include_archived=true&limit=10&cursor=${CURSOR}`,
      { headers: HEADERS },
    )

    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect(response.headers.get('vary')).toContain('Origin')
    expect(calls.search).toEqual([
      {
        personId: COACH,
        organizationId: ORGANIZATION,
        query: 'búlgara',
        discipline: 'strength',
        includeArchived: true,
        limit: 10,
        cursor: CURSOR,
      },
    ])
    const body: unknown = await response.json()
    assertMatchesContract('StudioMovementPage', body)
    expect(body).toEqual({
      data: [
        {
          id: GLOBAL,
          name: 'Sentadilla búlgara',
          discipline_code: 'strength',
          scope: 'global',
          archived: false,
          muscles: ['quadriceps'],
          equipment: ['dumbbell'],
          demo_url: 'https://media.example.test/movements/bulgarian.webp',
        },
      ],
      page: { next_cursor: null, has_more: false },
    })
  })

  test('T-CAT-STUDIO-MOVEMENT-API-02 an empty search is the whole library, without archived', async () => {
    const response = await app().request(`${COLLECTION}?q=%20%20`, { headers: HEADERS })

    expect(response.status).toBe(200)
    expect(calls.search[0]).toMatchObject({
      query: null,
      discipline: null,
      includeArchived: false,
      limit: 25,
      cursor: null,
    })
  })

  test.each([
    ['limit=0'],
    ['limit=101'],
    ['limit=ten'],
    ['include_archived=yes'],
    [`q=${'a'.repeat(121)}`],
    [`discipline=${'d'.repeat(65)}`],
    ['cursor=short'],
  ])('T-CAT-STUDIO-MOVEMENT-API-03 a malformed %s is a bad request', async (query) => {
    const response = await app().request(`${COLLECTION}?${query}`, { headers: HEADERS })

    expect(response.status).toBe(400)
    expect((await problemOf(response)).type).toEndWith('/invalid-request')
    expect(calls.search).toEqual([])
  })

  test('T-CAT-STUDIO-MOVEMENT-API-04 a cursor the database cannot read is a bad request', async () => {
    const response = await app({
      search: async () => {
        throw new MovementCursorError()
      },
    }).request(`${COLLECTION}?cursor=${CURSOR}`, { headers: HEADERS })

    expect(response.status).toBe(400)
    expect(response.headers.get('cache-control')).toBe('no-store')
  })

  test('T-CAT-STUDIO-MOVEMENT-API-05 staff answer 403 and somebody outside 404', async () => {
    const forbidden = await app({
      search: async () => {
        throw databaseError('42501', 'this action requires manage_content')
      },
    }).request(COLLECTION, { headers: HEADERS })
    const outside = await app({
      search: async () => {
        throw databaseError('P0002', 'organization not found')
      },
    }).request(COLLECTION, { headers: HEADERS })

    expect(forbidden.status).toBe(403)
    expect(outside.status).toBe(404)
  })
})

describe('the Studio session', () => {
  test('T-CAT-STUDIO-MOVEMENT-API-06 another origin is refused before anything is read', async () => {
    const response = await app().request(COLLECTION, {
      headers: { ...HEADERS, origin: 'https://elsewhere.example.test' },
    })

    expect(response.status).toBe(403)
    expect(calls.search).toEqual([])
  })

  test('T-CAT-STUDIO-MOVEMENT-API-07 no session cookie is unauthenticated', async () => {
    const response = await app().request(COLLECTION, {
      headers: { origin: HEADERS.origin },
    })

    expect(response.status).toBe(401)
    expect(calls.search).toEqual([])
  })
})

describe('reading one', () => {
  test('T-CAT-STUDIO-MOVEMENT-API-08 answers the movement in the contract shape', async () => {
    const response = await app().request(ITEM, { headers: HEADERS })

    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect(calls.read).toEqual([
      { personId: COACH, organizationId: ORGANIZATION, movementId: MOVEMENT },
    ])
    const body: unknown = await response.json()
    assertMatchesContract('OrganizationMovement', body)
    expect(body).toMatchObject({ id: MOVEMENT, demo_url: null, name_locked: false })
  })

  test("T-CAT-STUDIO-MOVEMENT-API-09 another organization's reads as absent", async () => {
    const response = await app({ read: async () => null }).request(ITEM, { headers: HEADERS })

    expect(response.status).toBe(404)
    await problemOf(response)
  })

  test('T-CAT-STUDIO-MOVEMENT-API-10 an identifier that is not one is a bad request', async () => {
    const response = await app().request(`${COLLECTION}/not-a-uuid`, { headers: HEADERS })

    expect(response.status).toBe(400)
    expect(calls.read).toEqual([])
  })
})

const CREATE_BODY = {
  discipline_code: 'strength',
  name: 'Búlgara de la casa',
  aliases: ['Búlgara casera'],
  equipment: ['dumbbell'],
  variant: { movement_id: GLOBAL, relation: 'variant', note: null },
}

describe('creating', () => {
  test('T-CAT-STUDIO-MOVEMENT-API-11 creates with the command and points at the movement', async () => {
    const response = await app().request(COLLECTION, {
      method: 'POST',
      headers: COMMAND_HEADERS,
      body: JSON.stringify(CREATE_BODY),
    })

    expect(response.status).toBe(201)
    expect(response.headers.get('location')).toBe(ITEM)
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect(response.headers.get('idempotent-replay')).toBeNull()
    expect(calls.create).toHaveLength(1)
    expect(calls.create[0]).toMatchObject({
      personId: COACH,
      organizationId: ORGANIZATION,
      idempotencyKey: COMMAND_HEADERS['idempotency-key'],
      commandId: COMMAND_HEADERS['command-id'],
      movement: CREATE_BODY,
    })
    expect(calls.create[0]?.requestHash).toHaveLength(32)
    assertMatchesContract('OrganizationMovement', await response.json())
  })

  test('T-CAT-STUDIO-MOVEMENT-IDEM-01 a replay says so, and the same request hashes the same', async () => {
    const replaying = app({
      create: async (input) => {
        calls.create.push(input)
        return { resource: OWN, replayed: true }
      },
    })
    const send = (body: unknown) =>
      replaying.request(COLLECTION, {
        method: 'POST',
        headers: COMMAND_HEADERS,
        body: JSON.stringify(body),
      })

    const first = await send(CREATE_BODY)
    await send({ ...CREATE_BODY })
    await send({ ...CREATE_BODY, name: 'Otra' })

    expect(first.headers.get('idempotent-replay')).toBe('true')
    const [a, b, c] = calls.create.map((call) => Buffer.from(call.requestHash).toString('hex'))
    expect(a).toBe(b)
    expect(c).not.toBe(a)
  })

  test('T-CAT-STUDIO-MOVEMENT-API-12 a body that is not JSON is unsupported', async () => {
    const response = await app().request(COLLECTION, {
      method: 'POST',
      headers: { ...COMMAND_HEADERS, 'content-type': 'text/plain' },
      body: JSON.stringify(CREATE_BODY),
    })

    expect(response.status).toBe(415)
    expect(calls.create).toEqual([])
  })

  test.each([
    ['without an idempotency key', { 'idempotency-key': '' }],
    [
      'with a command id that is not a v7',
      { 'command-id': '3f1c2a4e-8b3d-4c5e-9f60-7a8b9c0d1e2f' },
    ],
  ])('T-CAT-STUDIO-MOVEMENT-API-13 a command %s is a bad request', async (_, headers) => {
    const response = await app().request(COLLECTION, {
      method: 'POST',
      headers: { ...COMMAND_HEADERS, ...headers },
      body: JSON.stringify(CREATE_BODY),
    })

    expect(response.status).toBe(400)
    expect(calls.create).toEqual([])
  })

  test.each([
    ['an unknown field', { ...CREATE_BODY, muscles: ['quadriceps'] }],
    ['no name', { discipline_code: 'strength' }],
    ['a name too long', { ...CREATE_BODY, name: 'n'.repeat(121) }],
    ['aliases that are not a list', { ...CREATE_BODY, aliases: 'Búlgara' }],
    ['eleven aliases', { ...CREATE_BODY, aliases: Array.from({ length: 11 }, (_, i) => `a${i}`) }],
    [
      'a relation nobody defined',
      { ...CREATE_BODY, variant: { movement_id: GLOBAL, relation: 'twin' } },
    ],
    ['a variant of no movement', { ...CREATE_BODY, variant: { relation: 'variant' } }],
  ])('T-CAT-STUDIO-MOVEMENT-API-14 %s fails the closed schema', async (_, body) => {
    const response = await app().request(COLLECTION, {
      method: 'POST',
      headers: COMMAND_HEADERS,
      body: JSON.stringify(body),
    })

    expect(response.status).toBe(422)
    expect((await problemOf(response)).type).toEndWith('/validation-failed')
    expect(calls.create).toEqual([])
  })

  test('T-CAT-STUDIO-MOVEMENT-API-15 what the database refuses names the fields it refused', async () => {
    const response = await app({
      create: async () => {
        throw databaseError('22023', 'the movement is not valid', {
          detail: '["name", "aliases", "equipment"]',
        })
      },
    }).request(COLLECTION, {
      method: 'POST',
      headers: COMMAND_HEADERS,
      body: JSON.stringify(CREATE_BODY),
    })

    expect(response.status).toBe(422)
    expect((await problemOf(response)).errors?.map((error) => error.path)).toEqual([
      '/name',
      '/aliases',
      '/equipment',
    ])
  })

  test('T-CAT-STUDIO-MOVEMENT-API-16 a name the organization already uses is a named conflict', async () => {
    const response = await app({
      create: async () => {
        throw databaseError('23505', 'duplicate key value violates unique constraint', {
          constraint_name: 'uidx_movements_organization_name',
        })
      },
    }).request(COLLECTION, {
      method: 'POST',
      headers: COMMAND_HEADERS,
      body: JSON.stringify(CREATE_BODY),
    })

    expect(response.status).toBe(409)
    const problem = await problemOf(response)
    expect(problem.type).toEndWith('/conflict')
    expect(problem.errors).toEqual([
      { code: 'name-taken', path: '/name', message: expect.any(String) },
    ])
  })

  test('T-CAT-STUDIO-MOVEMENT-API-17 a reused idempotency key is a bare conflict, not a taken name', async () => {
    const response = await app({
      create: async () => {
        throw databaseError('23505', 'idempotency identity reused with a different request')
      },
    }).request(COLLECTION, {
      method: 'POST',
      headers: COMMAND_HEADERS,
      body: JSON.stringify(CREATE_BODY),
    })

    expect(response.status).toBe(409)
    expect((await problemOf(response)).errors).toBeUndefined()
  })

  test('T-CAT-STUDIO-MOVEMENT-API-18 a command still running asks to retry', async () => {
    const response = await app({
      create: async () => {
        throw databaseError('40001', 'idempotency command is in progress')
      },
    }).request(COLLECTION, {
      method: 'POST',
      headers: COMMAND_HEADERS,
      body: JSON.stringify(CREATE_BODY),
    })

    expect(response.status).toBe(409)
    expect(response.headers.get('retry-after')).toBe('1')
    expect((await problemOf(response)).type).toEndWith('/idempotency-in-progress')
  })

  test('T-CAT-STUDIO-MOVEMENT-API-19 anything else is an outage, and says nothing more', async () => {
    const response = await app({
      create: async () => {
        throw new Error('connection reset')
      },
    }).request(COLLECTION, {
      method: 'POST',
      headers: COMMAND_HEADERS,
      body: JSON.stringify(CREATE_BODY),
    })

    expect(response.status).toBe(503)
    expect(JSON.stringify(await problemOf(response))).not.toContain('connection reset')
  })
})

describe('editing', () => {
  test('T-CAT-STUDIO-MOVEMENT-API-20 sends the revision apart from the changes, keeping a removed variant', async () => {
    const response = await app().request(ITEM, {
      method: 'PATCH',
      headers: COMMAND_HEADERS,
      body: JSON.stringify({ expected_revision: 1, name: 'Búlgara nueva', variant: null }),
    })

    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect(calls.update).toHaveLength(1)
    expect(calls.update[0]).toMatchObject({
      personId: COACH,
      organizationId: ORGANIZATION,
      movementId: MOVEMENT,
      expectedRevision: 1,
      changes: { name: 'Búlgara nueva', variant: null },
    })
    expect(Object.keys(calls.update[0]?.changes ?? {}).sort()).toEqual(['name', 'variant'])
    assertMatchesContract('OrganizationMovement', await response.json())
  })

  test.each([
    ['nothing to change', { expected_revision: 1 }],
    ['no revision', { name: 'Otra' }],
    ['revision zero', { expected_revision: 0, name: 'Otra' }],
    ['a revision that is not a whole number', { expected_revision: 1.5, name: 'Otra' }],
    ['a field nobody edits', { expected_revision: 1, scope: 'global' }],
    ['a blank name', { expected_revision: 1, name: '' }],
  ])('T-CAT-STUDIO-MOVEMENT-API-21 %s fails the closed schema', async (_, body) => {
    const response = await app().request(ITEM, {
      method: 'PATCH',
      headers: COMMAND_HEADERS,
      body: JSON.stringify(body),
    })

    expect(response.status).toBe(422)
    expect(calls.update).toEqual([])
  })

  test('T-CAT-STUDIO-MOVEMENT-API-22 an edit of an old revision is stale', async () => {
    const response = await app({
      update: async () => {
        throw databaseError('40001', 'stale-movement')
      },
    }).request(ITEM, {
      method: 'PATCH',
      headers: COMMAND_HEADERS,
      body: JSON.stringify({ expected_revision: 1, name: 'Otra' }),
    })

    expect(response.status).toBe(409)
    expect(response.headers.get('retry-after')).toBeNull()
    expect((await problemOf(response)).type).toEndWith('/stale-draft')
  })

  test.each([['movement-in-use'], ['movement-archived']])(
    'T-CAT-STUDIO-MOVEMENT-API-23 %s is a conflict that says which',
    async (reason) => {
      const response = await app({
        update: async () => {
          throw databaseError('55000', reason)
        },
      }).request(ITEM, {
        method: 'PATCH',
        headers: COMMAND_HEADERS,
        body: JSON.stringify({ expected_revision: 1, name: 'Otra' }),
      })

      expect(response.status).toBe(409)
      const problem = await problemOf(response)
      expect(problem.type).toEndWith('/conflict')
      expect(problem.errors?.map((error) => error.code)).toEqual([reason])
    },
  )

  test("T-CAT-STUDIO-MOVEMENT-API-24 a global movement or another organization's is not there", async () => {
    const response = await app({
      update: async () => {
        throw databaseError('P0002', 'movement not found')
      },
    }).request(ITEM, {
      method: 'PATCH',
      headers: COMMAND_HEADERS,
      body: JSON.stringify({ expected_revision: 1, name: 'Otra' }),
    })

    expect(response.status).toBe(404)
  })
})

describe('archiving', () => {
  test('T-CAT-STUDIO-MOVEMENT-API-25 archives with the command and no body', async () => {
    const { 'content-type': _, ...headers } = COMMAND_HEADERS
    const response = await app().request(ARCHIVAL, { method: 'POST', headers })

    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect(calls.archive).toHaveLength(1)
    expect(calls.archive[0]).toMatchObject({
      personId: COACH,
      organizationId: ORGANIZATION,
      movementId: MOVEMENT,
      commandId: COMMAND_HEADERS['command-id'],
    })
    const body: unknown = await response.json()
    assertMatchesContract('OrganizationMovement', body)
    expect(body).toMatchObject({ archived: true, revision: 2 })
  })

  test('T-CAT-STUDIO-MOVEMENT-API-26 a payload on a command that takes none is unsupported', async () => {
    const response = await app().request(ARCHIVAL, {
      method: 'POST',
      headers: COMMAND_HEADERS,
      body: JSON.stringify({ reason: 'ya no' }),
    })

    expect(response.status).toBe(415)
    expect(calls.archive).toEqual([])
  })

  test('T-CAT-STUDIO-MOVEMENT-IDEM-02 archiving again says it was replayed', async () => {
    const response = await app({
      archive: async () => ({ resource: { ...OWN, archived: true, revision: 2 }, replayed: true }),
    }).request(ARCHIVAL, { method: 'POST', headers: COMMAND_HEADERS })

    expect(response.status).toBe(200)
    expect(response.headers.get('idempotent-replay')).toBe('true')
  })

  test('T-CAT-STUDIO-MOVEMENT-API-27 a coach, who does not archive, is forbidden', async () => {
    const response = await app({
      archive: async () => {
        throw databaseError('42501', 'this action requires archive_movements')
      },
    }).request(ARCHIVAL, { method: 'POST', headers: COMMAND_HEADERS })

    expect(response.status).toBe(403)
    expect(response.headers.get('cache-control')).toBe('no-store')
  })
})
