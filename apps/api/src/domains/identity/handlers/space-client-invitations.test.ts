import { describe, expect, test } from 'bun:test'
import { allfitV1ContractSchemas } from '@allfitone/contracts'
import Ajv2020 from 'ajv/dist/2020'
import addFormats from 'ajv-formats'
import { Hono } from 'hono'

import { StudioInvitationError } from '../application/invitations.js'
import type {
  ClientInvitationService,
  SpaceInvitationIdentity,
} from '../application/client-invitations.js'
import {
  spaceClientInvitationRoutes,
  type SpaceIdentityResolver,
  type TokenVerifier,
} from './space-client-invitations.js'

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
const INTENT = '0199d000-0000-7000-8000-000000000041'
const TOKEN = 'a'.repeat(43)

const HEADERS = {
  authorization: 'Bearer access-token',
  'content-type': 'application/json',
  'idempotency-key': 'd4444444-4444-4444-8444-444444444444',
  'command-id': '0199d000-0000-7000-8000-000000000051',
}

const DECISION_BODY = {
  token: TOKEN,
  invitation_intent_id: INTENT,
  relationship_decision: 'accepted',
  scope_decisions: { body_progress: 'accepted', health_context: 'rejected' },
}

const verifier: TokenVerifier = async () => ({
  subject: 'user_123',
  sessionId: 'session_123',
  surface: 'space',
  authenticatedAt: null,
})

const identity: SpaceIdentityResolver = async () => ({
  personId: '0199d000-0000-7000-8000-000000000001',
  verifiedEmail: 'ana@example.test',
})

function invitations(overrides: Partial<ClientInvitationService> = {}): ClientInvitationService {
  return {
    issue: async () => {
      throw new Error('not used here')
    },
    resolve: async () => ({
      id: '0199d000-0000-7000-8000-000000000031',
      intentId: INTENT,
      status: 'pending' as const,
      organization: {
        id: '0199d000-0000-7000-8000-000000000010',
        displayName: 'Resolve Gym',
        // `purpose` is in here because the column carries it: without it the
        // assertion below could not prove the response drops it.
        responsibleParty: {
          party_kind: 'legal_entity',
          party_name: 'Resolve SAS',
          purpose: 'studio_operations',
        },
      },
      expiresAt: new Date('2026-10-06T12:00:00.000Z'),
      invitedBy: 'Laura Gómez',
      scopeOptions: [
        {
          scopeCode: 'body_progress' as const,
          offeredAccessLevel: 'read' as const,
          purpose: 'Seguimiento de medidas',
          presentedSnapshotSchemaVersion: 1,
          presentedSnapshot: { title: 'Progreso corporal' },
          decision: null,
        },
      ],
      programProposal: null,
    }),
    listMine: async () => [
      {
        id: '0199d000-0000-7000-8000-000000000031',
        intentId: INTENT,
        organizationId: '0199d000-0000-7000-8000-000000000010',
        organizationName: 'Resolve Gym',
        invitedBy: 'Laura Gómez',
        expiresAt: new Date('2026-10-06T12:00:00.000Z'),
      },
    ],
    readMine: async () => {
      throw new StudioInvitationError('not-found')
    },
    decide: async () => ({
      resource: {
        invitationId: '0199d000-0000-7000-8000-000000000031',
        invitationStatus: 'completed' as const,
        organizationId: '0199d000-0000-7000-8000-000000000010',
        intentId: INTENT,
        intentStatus: 'accepted' as const,
        relationshipId: '0199d000-0000-7000-8000-000000000061',
        grantedScopeCodes: ['body_progress' as const],
        programProposal: null,
      },
      replayed: false,
    }),
    ...overrides,
  }
}

function app(
  service: ClientInvitationService = invitations(),
  resolver: SpaceIdentityResolver = identity,
): Hono {
  const routes = new Hono()
  routes.route('/space/v1', spaceClientInvitationRoutes(service, verifier, resolver))
  return routes
}

function post(path: string, body: unknown, headers: Record<string, string> = HEADERS): Request {
  return new Request(`https://api.example.test/space/v1/client-invitations/${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  })
}

describe('reading what an invitation asks for', () => {
  test('returns every scope separately, with its purpose and level', async () => {
    const response = await app().fetch(post('resolve', { token: TOKEN }))
    expect(response.status).toBe(200)
    const payload = (await response.json()) as { scope_options: Record<string, unknown>[] }
    expect(payload.scope_options).toHaveLength(1)
    expect(payload.scope_options[0]).toMatchObject({
      scope_code: 'body_progress',
      offered_access_level: 'read',
      purpose: 'Seguimiento de medidas',
      decision: null,
    })
  })

  test('carries the contract exactly as it was presented', async () => {
    const response = await app().fetch(post('resolve', { token: TOKEN }))
    const payload = (await response.json()) as {
      scope_options: { presented_snapshot: Record<string, unknown> }[]
    }
    expect(payload.scope_options[0]?.presented_snapshot).toEqual({ title: 'Progreso corporal' })
  })

  test('is never cached', async () => {
    const response = await app().fetch(post('resolve', { token: TOKEN }))
    expect(response.headers.get('Cache-Control')).toBe('no-store')
  })

  test('refuses a caller with no bearer token', async () => {
    const { authorization: _authorization, ...headers } = HEADERS
    const response = await app().fetch(post('resolve', { token: TOKEN }, headers))
    expect(response.status).toBe(401)
  })

  test('refuses a caller whose email the provider never verified', async () => {
    const unverified: SpaceIdentityResolver = async () => ({
      personId: '0199d000-0000-7000-8000-000000000001',
      verifiedEmail: null,
    })
    const service = invitations({
      resolve: async (caller: SpaceInvitationIdentity) => {
        if (!caller.verifiedEmail) throw new StudioInvitationError('forbidden')
        throw new Error('unreachable')
      },
    })
    const response = await app(service, unverified).fetch(post('resolve', { token: TOKEN }))
    expect(response.status).toBe(403)
  })

  test('refuses a malformed token without asking the database', async () => {
    let asked = false
    const service = invitations({
      resolve: async () => {
        asked = true
        throw new Error('unreachable')
      },
    })
    const response = await app(service).fetch(post('resolve', { token: 'too-short' }))
    expect(response.status).toBe(422)
    expect(asked).toBe(false)
  })

  test('reports an invitation nobody issued as not found', async () => {
    const service = invitations({
      resolve: async () => {
        throw new StudioInvitationError('not-found')
      },
    })
    const response = await app(service).fetch(post('resolve', { token: TOKEN }))
    expect(response.status).toBe(404)
  })
})

describe('answering an invitation', () => {
  test('passes each scope answer through as given', async () => {
    let seen: Record<string, string> | undefined
    const service = invitations({
      decide: async (_identity, input) => {
        seen = input.scopeDecisions
        return {
          resource: {
            invitationId: '0199d000-0000-7000-8000-000000000031',
            invitationStatus: 'completed',
            organizationId: '0199d000-0000-7000-8000-000000000010',
            intentId: INTENT,
            intentStatus: 'accepted',
            relationshipId: '0199d000-0000-7000-8000-000000000061',
            grantedScopeCodes: ['body_progress'],
            programProposal: null,
          },
          replayed: false,
        }
      },
    })
    await app(service).fetch(post('decisions', DECISION_BODY))
    expect(seen).toEqual({ body_progress: 'accepted', health_context: 'rejected' })
  })

  test('accepts a body with no scope answers at all: every scope is then rejected', async () => {
    let seen: Record<string, string> | undefined
    const service = invitations({
      decide: async (_identity, input) => {
        seen = input.scopeDecisions
        return {
          resource: {
            invitationId: '0199d000-0000-7000-8000-000000000031',
            invitationStatus: 'completed',
            organizationId: '0199d000-0000-7000-8000-000000000010',
            intentId: INTENT,
            intentStatus: 'accepted',
            relationshipId: '0199d000-0000-7000-8000-000000000061',
            grantedScopeCodes: [],
            programProposal: null,
          },
          replayed: false,
        }
      },
    })
    const response = await app(service).fetch(
      post('decisions', {
        token: TOKEN,
        invitation_intent_id: INTENT,
        relationship_decision: 'accepted',
      }),
    )
    expect(response.status).toBe(200)
    expect(seen).toEqual({})
  })

  /*
   * Criterion 5. A relationship in force that grants access to nothing is the
   * outcome the story asks for, not a failure to report.
   */
  test('reports an accepted relationship with no granted scope as a success', async () => {
    const service = invitations({
      decide: async () => ({
        resource: {
          invitationId: '0199d000-0000-7000-8000-000000000031',
          invitationStatus: 'completed',
          organizationId: '0199d000-0000-7000-8000-000000000010',
          intentId: INTENT,
          intentStatus: 'accepted',
          relationshipId: '0199d000-0000-7000-8000-000000000061',
          grantedScopeCodes: [],
          programProposal: null,
        },
        replayed: false,
      }),
    })
    const response = await app(service).fetch(post('decisions', DECISION_BODY))
    expect(response.status).toBe(200)
    const payload = (await response.json()) as Record<string, unknown>
    expect(payload.granted_scope_codes).toEqual([])
    expect(payload.relationship_id).toBe('0199d000-0000-7000-8000-000000000061')
  })

  test('reports a rejected relationship as creating nothing', async () => {
    const service = invitations({
      decide: async () => ({
        resource: {
          invitationId: '0199d000-0000-7000-8000-000000000031',
          invitationStatus: 'completed',
          organizationId: '0199d000-0000-7000-8000-000000000010',
          intentId: INTENT,
          intentStatus: 'rejected',
          relationshipId: null,
          grantedScopeCodes: [],
          programProposal: null,
        },
        replayed: false,
      }),
    })
    const response = await app(service).fetch(
      post('decisions', { ...DECISION_BODY, relationship_decision: 'rejected' }),
    )
    const payload = (await response.json()) as Record<string, unknown>
    expect(payload.relationship_id).toBeNull()
    expect(payload.granted_scope_codes).toEqual([])
  })

  test('marks a replay so a retried answer is not read as a second one', async () => {
    const service = invitations({
      decide: async () => ({
        resource: {
          invitationId: '0199d000-0000-7000-8000-000000000031',
          invitationStatus: 'completed',
          organizationId: '0199d000-0000-7000-8000-000000000010',
          intentId: INTENT,
          intentStatus: 'accepted',
          relationshipId: '0199d000-0000-7000-8000-000000000061',
          grantedScopeCodes: ['body_progress'],
          programProposal: null,
        },
        replayed: true,
      }),
    })
    const response = await app(service).fetch(post('decisions', DECISION_BODY))
    expect(response.headers.get('Idempotent-Replay')).toBe('true')
  })
})

describe('what answering refuses', () => {
  test('a decision that is neither accepted nor rejected', async () => {
    const response = await app().fetch(
      post('decisions', { ...DECISION_BODY, relationship_decision: 'maybe' }),
    )
    expect(response.status).toBe(422)
  })

  test('an answer for a scope the catalogue does not define', async () => {
    const response = await app().fetch(
      post('decisions', { ...DECISION_BODY, scope_decisions: { bank_account: 'accepted' } }),
    )
    expect(response.status).toBe(422)
  })

  test('command headers that are missing', async () => {
    const { 'command-id': _commandId, ...headers } = HEADERS
    const response = await app().fetch(post('decisions', DECISION_BODY, headers))
    expect(response.status).toBe(400)
  })

  test('a token that is not the shape of a token', async () => {
    const response = await app().fetch(post('decisions', { ...DECISION_BODY, token: 'nope' }))
    expect(response.status).toBe(422)
  })

  test('an answer from somebody the invitation was not addressed to', async () => {
    const service = invitations({
      decide: async () => {
        throw Object.assign(new Error('verified email mismatch'), { code: '42501' })
      },
    })
    const response = await app(service).fetch(post('decisions', DECISION_BODY))
    expect(response.status).toBe(403)
  })

  test('a second answer to an invitation already decided', async () => {
    const service = invitations({
      decide: async () => {
        throw Object.assign(new Error('conflict'), { code: 'P0004' })
      },
    })
    const response = await app(service).fetch(post('decisions', DECISION_BODY))
    expect(response.status).toBe(409)
  })

  test('T-REL-QUOTA-API-02 accepting into a gym that is over its quota says so', async () => {
    const service = invitations({
      decide: async () => {
        throw Object.assign(new Error('no guest places left'), { code: 'AF409' })
      },
    })
    const response = await app(service).fetch(post('decisions', DECISION_BODY))
    expect(response.status).toBe(409)
    expect(await response.json()).toEqual({ error: { code: 'guest-quota-exhausted' } })
  })

  test('T-ORG-SUSPEND-API-01 accepting into a suspended gym says it is not operating', async () => {
    const service = invitations({
      decide: async () => {
        throw Object.assign(new Error('the organization is not operating'), { code: 'AF423' })
      },
    })
    const response = await app(service).fetch(post('decisions', DECISION_BODY))
    expect(response.status).toBe(409)
    expect(await response.json()).toEqual({ error: { code: 'organization-not-operating' } })
  })
})

const INVITATION = '0199d000-0000-7000-8000-000000000031'

describe('her pending invitations', () => {
  const get = (path: string, resolver: SpaceIdentityResolver = identity, service = invitations()) =>
    app(service, resolver).request(`/space/v1/client-invitations${path}`, {
      headers: { authorization: 'Bearer access-token' },
    })

  test('T-IDN-CLIENT-SPACE-01 lists the invitations addressed to her verified email', async () => {
    const response = await get('')
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      data: [
        {
          id: INVITATION,
          invitation_intent_id: INTENT,
          organization_id: '0199d000-0000-7000-8000-000000000010',
          organization_name: 'Resolve Gym',
          invited_by: 'Laura Gómez',
          expires_at: '2026-10-06T12:00:00.000Z',
        },
      ],
    })
  })

  test('T-IDN-CLIENT-SPACE-02 somebody still registering is told too', async () => {
    let asked: SpaceInvitationIdentity | undefined
    const response = await get(
      '',
      async () => ({ personId: null, verifiedEmail: 'ana@example.test' }),
      invitations({
        listMine: async (who) => {
          asked = who
          return []
        },
      }),
    )
    expect(response.status).toBe(200)
    expect(asked?.personId).toBeNull()
  })

  test('T-IDN-CLIENT-SPACE-03 reads one by id, saying who sent it', async () => {
    const response = await get(
      `/${INVITATION}`,
      identity,
      invitations({
        readMine: async () =>
          invitations().resolve(await identity('x'), { token: TOKEN, requestId: 'r' }),
      }),
    )
    expect(response.status).toBe(200)
    expect(((await response.json()) as { invited_by: string }).invited_by).toBe('Laura Gómez')
  })

  test('T-IDN-CLIENT-SPACE-04 an id that is not hers or no longer open is not found', async () => {
    expect((await get(`/${INVITATION}`)).status).toBe(404)
  })

  test('T-IDN-CLIENT-SPACE-05 a malformed id is refused before the database', async () => {
    expect((await get('/not-an-id')).status).toBe(400)
  })

  test('T-IDN-CLIENT-SPACE-06 decides one by id instead of the token', async () => {
    let seen: Record<string, unknown> | undefined
    const service = invitations({
      decide: async (_who, input) => {
        seen = input as unknown as Record<string, unknown>
        return invitations().decide(_who, input)
      },
    })
    const { token: _token, ...byId } = DECISION_BODY
    const response = await app(service).fetch(
      post('decisions', { ...byId, invitation_id: INVITATION }),
    )
    expect(response.status).toBe(200)
    expect(seen?.invitationId).toBe(INVITATION)
    expect(seen?.token).toBeUndefined()
  })

  test('T-IDN-CLIENT-SPACE-07 naming both the token and the id is refused', async () => {
    const response = await app().fetch(
      post('decisions', { ...DECISION_BODY, invitation_id: INVITATION }),
    )
    expect(response.status).toBe(422)
  })
})

describe('HU-SP-016 and HU-SP-017: the first program an invitation offers', () => {
  const OFFER = {
    intentId: '0199d000-0000-7000-8000-000000000042',
    programVersionId: '0199d000-0000-7000-8000-000000000201',
    title: 'Bloque A',
    versionNumber: 1,
    weeks: 2,
    repeatsForever: false,
    startsOn: '2026-11-09',
    requiredScope: {
      scopeCode: 'relationship_training' as const,
      accessLevel: 'contribute' as const,
    },
    decision: null,
  }
  const DECISION = {
    token: TOKEN,
    invitation_intent_id: INTENT,
    relationship_decision: 'accepted',
    scope_decisions: { relationship_training: 'accepted' },
  }

  function offering(): ClientInvitationService {
    const service = invitations()
    const resolve = service.resolve
    service.resolve = async (who, input) => ({
      ...(await resolve(who, input)),
      programProposal: OFFER,
    })
    return service
  }

  test('T-REL-INVITE-PROGRAM-API-07 she reads the program, its length and what it needs', async () => {
    const response = await app(offering()).fetch(post('resolve', { token: TOKEN }))
    const payload = (await response.json()) as { program_proposal: unknown }
    /*
     * The whole payload now, not only the offer. It used to be only the offer
     * because `responsible_party` came back as the JSON column PostgreSQL
     * stores and did not match its schema (`STUDIO-162`); with that mapped, the
     * view validates end to end, so the next field to drift fails here.
     */
    assertMatchesContract('ClientInvitationPresentation', payload)
    assertMatchesContract('ClientInvitationProgramOffer', payload.program_proposal)
    expect(payload.program_proposal).toEqual({
      invitation_intent_id: OFFER.intentId,
      program_version_id: OFFER.programVersionId,
      title: 'Bloque A',
      version_number: 1,
      weeks: 2,
      repeats_forever: false,
      starts_on: '2026-11-09',
      required_scope: { scope_code: 'relationship_training', access_level: 'contribute' },
      decision: null,
    })
  })

  test('T-REL-INVITE-PROGRAM-API-08 an invitation without one shows none', async () => {
    const response = await app().fetch(post('resolve', { token: TOKEN }))
    const payload = (await response.json()) as Record<string, unknown>
    expect('program_proposal' in payload).toBe(true)
    expect(payload.program_proposal).toBeNull()
  })

  test('T-REL-INVITE-PROGRAM-API-09 her answer and her zone reach the use case, and the outcome comes back', async () => {
    let seen: unknown
    const service = invitations({
      decide: async (_identity, input) => {
        seen = { programDecision: input.programDecision, timezone: input.timezone }
        return {
          resource: {
            invitationId: '0199d000-0000-7000-8000-000000000031',
            invitationStatus: 'completed',
            organizationId: '0199d000-0000-7000-8000-000000000010',
            intentId: INTENT,
            intentStatus: 'accepted',
            relationshipId: '0199d000-0000-7000-8000-000000000061',
            grantedScopeCodes: ['relationship_training'],
            programProposal: {
              intentId: OFFER.intentId,
              intentStatus: 'accepted',
              assignmentId: '0199d000-0000-7000-8000-000000000071',
              unmaterializedReason: null,
            },
          },
          replayed: false,
        }
      },
    })
    const response = await app(service).fetch(
      post('decisions', { ...DECISION, program_decision: 'accepted', timezone: 'Europe/Madrid' }),
    )
    expect(response.status).toBe(200)
    expect(seen).toEqual({ programDecision: 'accepted', timezone: 'Europe/Madrid' })
    const payload = await response.json()
    assertMatchesContract('ClientInvitationDecisionResult', payload)
    expect((payload as { program_proposal: unknown }).program_proposal).toEqual({
      invitation_intent_id: OFFER.intentId,
      intent_status: 'accepted',
      assignment_id: '0199d000-0000-7000-8000-000000000071',
      unmaterialized_reason: null,
    })
  })

  test('T-REL-INVITE-PROGRAM-API-10 a client that says nothing about the program declines it', async () => {
    let seen: unknown
    const service = invitations()
    const decide = service.decide
    service.decide = async (who, input) => {
      seen = { programDecision: input.programDecision, timezone: input.timezone }
      return decide(who, input)
    }
    const response = await app(service).fetch(post('decisions', DECISION))
    expect(response.status).toBe(200)
    expect(seen).toEqual({ programDecision: null, timezone: null })
    assertMatchesContract('ClientInvitationDecisionResult', await response.json())
  })

  test.each([
    ['a program answer other than the two', { program_decision: 'maybe' }],
    ['a zone that is not one', { timezone: 'Madrid' }],
    ['a field the contract does not declare', { program_version_id: OFFER.programVersionId }],
  ])('T-REL-INVITE-PROGRAM-API-11 refuses %s before asking anyone', async (_, extra) => {
    let called = false
    const service = invitations({
      decide: async () => {
        called = true
        throw new Error('must not be reached')
      },
    })
    const response = await app(service).fetch(post('decisions', { ...DECISION, ...extra }))
    expect(response.status).toBe(422)
    expect(called).toBe(false)
  })

  test.each([
    ['["program-decision"]', '/program_decision'],
    ['["timezone"]', '/timezone'],
  ])('T-REL-INVITE-PROGRAM-API-12 a refusal naming %s points at %s', async (detail, field) => {
    const service = invitations({
      decide: async () => {
        throw Object.assign(new Error('refused'), { code: '22023', detail })
      },
    })
    const response = await app(service).fetch(post('decisions', DECISION))
    expect(response.status).toBe(422)
    expect(await response.json()).toEqual({ error: { code: 'validation-failed', detail: field } })
  })
})
