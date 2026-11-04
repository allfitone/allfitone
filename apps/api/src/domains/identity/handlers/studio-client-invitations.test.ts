import { beforeEach, describe, expect, test } from 'bun:test'
import { allfitV1ContractSchemas } from '@allfitone/contracts'
import Ajv2020 from 'ajv/dist/2020'
import addFormats from 'ajv-formats'
import { Hono } from 'hono'

import type { StudioSessionService } from '../application/index.js'
import { StudioInvitationError } from '../application/invitations.js'
import type { ClientInvitationService } from '../application/client-invitations.js'
import { studioClientInvitationRoutes } from './studio-client-invitations.js'

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

const ORGANIZATION = '0199c000-0000-7000-8000-000000000010'
const PATH = `/studio/v1/organizations/${ORGANIZATION}/client-invitations`

const HEADERS = {
  origin: 'https://studio.example.test',
  cookie: 'allfit_studio_session=opaque',
  'content-type': 'application/json',
  'idempotency-key': 'c3333333-3333-4333-8333-333333333333',
  'command-id': '0199c000-0000-7000-8000-000000000031',
}

const BODY = {
  channel: 'email',
  contact: 'Ana@Example.test',
  scopes: [
    {
      scope_code: 'body_progress',
      access_level: 'read',
      purpose: 'Seguimiento de medidas',
      presented_snapshot: { title: 'Progreso corporal' },
    },
  ],
}

function sessions(): StudioSessionService {
  return {
    completeCode: async () => ({ opaqueToken: 'opaque' }),
    readSession: async () => ({
      authenticated: true,
      registration_status: 'complete',
      identity: { given_name: null, family_name: null },
    }),
    resolveActor: async () => ({
      accountId: 'account',
      personId: '0199c000-0000-7000-8000-000000000001',
    }),
    resolveAccountIdentity: async () => ({
      actor: { accountId: 'account', personId: '0199c000-0000-7000-8000-000000000001' },
      identity: { givenName: null, familyName: null, verifiedEmail: 'owner@example.test' },
    }),
    logout: async () => ({ redirectUrl: 'https://studio.example.test', outcome: 'revoked' }),
  }
}

function invitations(overrides: Partial<ClientInvitationService> = {}): ClientInvitationService {
  return {
    issue: async () => ({
      resource: {
        id: '0199c000-0000-7000-8000-000000000031',
        intentId: '0199c000-0000-7000-8000-000000000041',
        status: 'pending' as const,
        channel: 'email' as const,
        contactHint: 'a***@example.test',
        expiresAt: new Date('2026-10-06T12:00:00.000Z'),
        scopeCodes: ['body_progress' as const],
        programProposal: null,
        reused: false,
      },
      replayed: false,
    }),
    resolve: async () => {
      throw new Error('not used here')
    },
    listMine: async () => {
      throw new Error('not used here')
    },
    readMine: async () => {
      throw new Error('not used here')
    },
    decide: async () => {
      throw new Error('not used here')
    },
    ...overrides,
  }
}

function app(service: ClientInvitationService = invitations()): Hono {
  const routes = new Hono()
  routes.route('/studio/v1', studioClientInvitationRoutes(service, sessions()))
  return routes
}

function post(body: unknown, headers: Record<string, string> = HEADERS): Request {
  return new Request(`https://api.example.test${PATH}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  process.env.STUDIO_WEB_URL = 'https://studio.example.test'
})

describe('issuing a client invitation', () => {
  test('creates one and answers 201', async () => {
    const response = await app().fetch(post(BODY))
    expect(response.status).toBe(201)
    const payload = (await response.json()) as Record<string, unknown>
    expect(payload.scope_codes).toEqual(['body_progress'])
    expect(payload.invitation_intent_id).toBe('0199c000-0000-7000-8000-000000000041')
  })

  test('never echoes the contact back in full', async () => {
    const response = await app().fetch(post(BODY))
    const body = await response.text()
    expect(body).not.toContain('Ana@Example.test')
    expect(body).not.toContain('ana@example.test')
    expect(body).toContain('a***@example.test')
  })

  test('lower-cases the contact before the database sees it', async () => {
    let seen: string | undefined
    const service = invitations({
      issue: async (_actor, input) => {
        seen = input.contact
        return {
          resource: {
            id: '0199c000-0000-7000-8000-000000000031',
            intentId: '0199c000-0000-7000-8000-000000000041',
            status: 'pending',
            channel: 'email',
            contactHint: 'a***@example.test',
            expiresAt: new Date('2026-10-06T12:00:00.000Z'),
            scopeCodes: ['body_progress'],
            programProposal: null,
            reused: false,
          },
          replayed: false,
        }
      },
    })
    await app(service).fetch(post(BODY))
    expect(seen).toBe('ana@example.test')
  })

  test('answers 200 when an equivalent invitation was reused', async () => {
    const service = invitations({
      issue: async () => ({
        resource: {
          id: '0199c000-0000-7000-8000-000000000031',
          intentId: '0199c000-0000-7000-8000-000000000041',
          status: 'pending',
          channel: 'email',
          contactHint: 'a***@example.test',
          expiresAt: new Date('2026-10-06T12:00:00.000Z'),
          scopeCodes: ['body_progress'],
          programProposal: null,
          reused: true,
        },
        replayed: false,
      }),
    })
    const response = await app(service).fetch(post(BODY))
    expect(response.status).toBe(200)
  })

  test('marks a replayed command so the client can tell', async () => {
    const service = invitations({
      issue: async () => ({
        resource: {
          id: '0199c000-0000-7000-8000-000000000031',
          intentId: '0199c000-0000-7000-8000-000000000041',
          status: 'pending',
          channel: 'email',
          contactHint: 'a***@example.test',
          expiresAt: new Date('2026-10-06T12:00:00.000Z'),
          scopeCodes: ['body_progress'],
          programProposal: null,
          reused: false,
        },
        replayed: true,
      }),
    })
    const response = await app(service).fetch(post(BODY))
    expect(response.headers.get('Idempotent-Replay')).toBe('true')
  })
})

describe('what it refuses', () => {
  test('a request from another origin', async () => {
    const response = await app().fetch(post(BODY, { ...HEADERS, origin: 'https://evil.test' }))
    expect(response.status).toBe(403)
  })

  test('a request with no session cookie', async () => {
    const { cookie: _cookie, ...headers } = HEADERS
    const response = await app().fetch(post(BODY, headers))
    expect(response.status).toBe(401)
  })

  test('command headers that are missing or malformed', async () => {
    const { 'idempotency-key': _key, ...headers } = HEADERS
    const response = await app().fetch(post(BODY, headers))
    expect(response.status).toBe(400)
  })

  test('an invitation that asks for nothing', async () => {
    const response = await app().fetch(post({ ...BODY, scopes: [] }))
    expect(response.status).toBe(422)
  })

  test('a scope code the catalogue does not define', async () => {
    const response = await app().fetch(
      post({ ...BODY, scopes: [{ ...BODY.scopes[0], scope_code: 'bank_account' }] }),
    )
    expect(response.status).toBe(422)
  })

  test('an access level that is not one of the two', async () => {
    const response = await app().fetch(
      post({ ...BODY, scopes: [{ ...BODY.scopes[0], access_level: 'write' }] }),
    )
    expect(response.status).toBe(422)
  })

  test('a scope with no purpose, because the person is owed a reason', async () => {
    const response = await app().fetch(
      post({ ...BODY, scopes: [{ ...BODY.scopes[0], purpose: '   ' }] }),
    )
    expect(response.status).toBe(422)
  })

  test('the same scope asked for twice', async () => {
    const response = await app().fetch(post({ ...BODY, scopes: [BODY.scopes[0], BODY.scopes[0]] }))
    expect(response.status).toBe(422)
  })

  test('a body carrying a field the contract does not declare', async () => {
    const response = await app().fetch(post({ ...BODY, initial_program_version_id: 'x' }))
    expect(response.status).toBe(422)
  })

  test('a role without permission, as PostgreSQL decided', async () => {
    const service = invitations({
      issue: async () => {
        throw Object.assign(new Error('denied'), { code: '42501' })
      },
    })
    const response = await app(service).fetch(post(BODY))
    expect(response.status).toBe(403)
  })

  test('T-REL-QUOTA-API-01 a gym with no guest places left gets a code the screen can explain', async () => {
    const service = invitations({
      issue: async () => {
        throw Object.assign(new Error('no guest places left'), { code: 'AF409' })
      },
    })
    const response = await app(service).fetch(post(BODY))
    expect(response.status).toBe(409)
    expect(await response.json()).toEqual({ error: { code: 'guest-quota-exhausted' } })
  })

  test('issuance while the feature is switched off', async () => {
    const service = invitations({
      issue: async () => {
        throw new StudioInvitationError('service-degraded')
      },
    })
    const response = await app(service).fetch(post(BODY))
    expect(response.status).toBe(503)
  })
})

describe('HU-STUDIO-023 criteria 2, 6 and 7: a first program in the invitation', () => {
  const PROGRAM = {
    program_version_id: '0199c000-0000-7000-8000-000000000201',
    starts_on: '2026-11-09',
    timezone: 'America/Bogota',
  }
  const TRAINING = {
    scope_code: 'relationship_training',
    access_level: 'contribute',
    purpose: 'Planear el entrenamiento',
    presented_snapshot: { title: 'Entrenamiento' },
  }
  const WITH_PROGRAM = { ...BODY, scopes: [TRAINING], program: PROGRAM }

  test('T-REL-INVITE-PROGRAM-API-01 hands the proposal to the use case and answers it back', async () => {
    let seen: unknown
    const service = invitations({
      issue: async (_actor, input) => {
        seen = input.program
        return {
          resource: {
            id: '0199c000-0000-7000-8000-000000000031',
            intentId: '0199c000-0000-7000-8000-000000000041',
            status: 'pending',
            channel: 'email',
            contactHint: 'a***@example.test',
            expiresAt: new Date('2026-10-06T12:00:00.000Z'),
            scopeCodes: ['relationship_training'],
            programProposal: {
              intentId: '0199c000-0000-7000-8000-000000000042',
              programVersionId: PROGRAM.program_version_id,
              startsOn: PROGRAM.starts_on,
              timezone: PROGRAM.timezone,
            },
            reused: false,
          },
          replayed: false,
        }
      },
    })
    const response = await app(service).fetch(post(WITH_PROGRAM))
    expect(response.status).toBe(201)
    expect(seen).toEqual({
      programVersionId: PROGRAM.program_version_id,
      startsOn: PROGRAM.starts_on,
      timezone: PROGRAM.timezone,
    })
    const payload = await response.json()
    assertMatchesContract('ClientInvitation', payload)
    expect((payload as { program_proposal: unknown }).program_proposal).toEqual({
      invitation_intent_id: '0199c000-0000-7000-8000-000000000042',
      ...PROGRAM,
    })
  })

  test('T-REL-INVITE-PROGRAM-API-02 an invitation without one says so, and asks for none', async () => {
    let seen: unknown = 'unset'
    const service = invitations()
    const issue = service.issue
    service.issue = async (actor, input) => {
      seen = input.program
      return issue(actor, input)
    }
    const response = await app(service).fetch(post(BODY))
    const payload = await response.json()
    assertMatchesContract('ClientInvitation', payload)
    expect(seen).toBeNull()
    expect((payload as { program_proposal: unknown }).program_proposal).toBeNull()
  })

  test.each([
    ['without a start', { program_version_id: PROGRAM.program_version_id, timezone: 'UTC' }],
    ['on a day that does not exist', { ...PROGRAM, starts_on: '2026-02-30' }],
    ['with a zone that is not one', { ...PROGRAM, timezone: 'Bogota time' }],
    ['with a version that is not an id', { ...PROGRAM, program_version_id: 'bloque-a' }],
    ['carrying a field the contract does not declare', { ...PROGRAM, weeks: 4 }],
  ])(
    'T-REL-INVITE-PROGRAM-API-03 refuses a program %s before asking anyone',
    async (_, program) => {
      let called = false
      const service = invitations({
        issue: async () => {
          called = true
          throw new Error('must not be reached')
        },
      })
      const response = await app(service).fetch(post({ ...WITH_PROGRAM, program }))
      expect(response.status).toBe(422)
      expect(called).toBe(false)
    },
  )

  test.each([
    ['["program-version"]', '/program/program_version_id'],
    ['["program-starts-on"]', '/program/starts_on'],
    ['["program-timezone"]', '/program/timezone'],
    ['["program"]', '/program'],
    ['["scopes"]', '/scopes'],
  ])('T-REL-INVITE-PROGRAM-API-04 a refusal naming %s points at %s', async (detail, field) => {
    const service = invitations({
      issue: async () => {
        throw Object.assign(new Error('refused'), { code: '22023', detail })
      },
    })
    const response = await app(service).fetch(post(WITH_PROGRAM))
    expect(response.status).toBe(422)
    expect(await response.json()).toEqual({ error: { code: 'validation-failed', detail: field } })
  })

  test('T-REL-INVITE-PROGRAM-API-05 a refusal naming nothing it knows names nothing', async () => {
    const service = invitations({
      issue: async () => {
        throw Object.assign(new Error('refused'), { code: '22023', detail: 'not a list' })
      },
    })
    const response = await app(service).fetch(post(WITH_PROGRAM))
    expect(await response.json()).toEqual({ error: { code: 'validation-failed' } })
  })

  test('T-REL-INVITE-PROGRAM-API-06 a member who may not assign programs is refused', async () => {
    const service = invitations({
      issue: async () => {
        throw Object.assign(new Error('assign_programs capability required'), { code: '42501' })
      },
    })
    const response = await app(service).fetch(post(WITH_PROGRAM))
    expect(response.status).toBe(403)
  })
})
