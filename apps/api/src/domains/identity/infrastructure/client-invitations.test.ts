/**
 * The program an invitation offers reaches PostgreSQL as trailing positional
 * arguments that default to null. A value bound one place off would still
 * typecheck and reach the wrong parameter, so the bindings are asserted here,
 * together with how each row's `program_proposal` becomes the domain's.
 */
import { afterEach, describe, expect, test } from 'bun:test'
import type postgres from 'postgres'

import { setDatabase } from '../../../platform/db/index.js'
import { createClientInvitationDatabase } from './client-invitations.js'

function recordingDatabase(
  captured: unknown[][],
  row: Record<string, unknown>,
): ReturnType<typeof postgres> {
  const client = Object.assign(
    (_strings: TemplateStringsArray, ...values: unknown[]) => {
      captured.push(values)
      return Promise.resolve([row])
    },
    {
      begin: (operation: (transaction: unknown) => Promise<unknown>) => operation(client),
      end: () => Promise.resolve(),
    },
  )
  return client as unknown as ReturnType<typeof postgres>
}

const PERSON = '019f1602-0000-7000-8000-000000000001'
const INVITATION = '019f1602-0000-7000-8000-000000000031'
const INTENT = '019f1602-0000-7000-8000-000000000041'
const PROGRAM_INTENT = '019f1602-0000-7000-8000-000000000042'
const VERSION = '019f1602-0000-7000-8000-000000000201'
const command = {
  idempotencyKey: '11111111-1111-4111-8111-111111111111',
  commandId: '019f1602-0000-7000-8000-000000000301',
  requestHash: Buffer.alloc(32),
}

const ISSUED = {
  invitation_id: INVITATION,
  invitation_intent_id: INTENT,
  status: 'pending',
  channel: 'email',
  contact_hint: 'a***@example.test',
  expires_at: new Date('2026-11-11T12:00:00.000Z'),
  scope_codes: ['relationship_training'],
  program_proposal: {
    invitation_intent_id: PROGRAM_INTENT,
    program_version_id: VERSION,
    starts_on: '2026-11-09',
    timezone: 'America/Bogota',
  },
  reused: false,
  replayed: false,
}

const DECIDED = {
  invitation_id: INVITATION,
  invitation_status: 'completed',
  organization_id: '019f1602-0000-7000-8000-000000000101',
  invitation_intent_id: INTENT,
  intent_status: 'accepted',
  relationship_id: '019f1602-0000-7000-8000-000000000701',
  granted_scope_codes: [],
  program_proposal: {
    invitation_intent_id: PROGRAM_INTENT,
    intent_status: 'accepted',
    assignment_id: null,
    unmaterialized_reason: 'training_not_granted',
  },
  replayed: false,
}

afterEach(async () => {
  await setDatabase(undefined)
})

function issue(program: { programVersionId: string; startsOn: string; timezone: string } | null) {
  return createClientInvitationDatabase().issue({
    personId: PERSON,
    organizationId: '019f1602-0000-7000-8000-000000000101',
    channel: 'email',
    contact: 'ana@example.test',
    scopes: [],
    program,
    tokenHash: new Uint8Array(32),
    tokenKeyVersion: 1,
    ...command,
  })
}

function decide(
  invitation: { tokenHash: Uint8Array } | { invitationId: string },
  programDecision: 'accepted' | 'rejected' | null,
  timezone: string | null,
) {
  return createClientInvitationDatabase().decide({
    personId: PERSON,
    verifiedEmail: 'ana@example.test',
    invitation,
    intentId: INTENT,
    relationshipDecision: 'accepted',
    scopeDecisions: {},
    programDecision,
    timezone,
    ...command,
  })
}

describe('T-REL-INVITE-PROGRAM-API-13 issuing binds the proposal last', () => {
  test('as version, start and zone, in the order the function declares them', async () => {
    const captured: unknown[][] = []
    await setDatabase(recordingDatabase(captured, ISSUED))
    const issued = await issue({
      programVersionId: VERSION,
      startsOn: '2026-11-09',
      timezone: 'America/Bogota',
    })
    expect(captured.at(-1)?.slice(-4)).toEqual([
      command.requestHash,
      VERSION,
      '2026-11-09',
      'America/Bogota',
    ])
    expect(issued.resource.programProposal).toEqual({
      intentId: PROGRAM_INTENT,
      programVersionId: VERSION,
      startsOn: '2026-11-09',
      timezone: 'America/Bogota',
    })
  })

  test('and as three nulls when there is none', async () => {
    const captured: unknown[][] = []
    await setDatabase(recordingDatabase(captured, { ...ISSUED, program_proposal: null }))
    const issued = await issue(null)
    expect(captured.at(-1)?.slice(-3)).toEqual([null, null, null])
    expect(issued.resource.programProposal).toBeNull()
  })
})

describe('T-REL-INVITE-PROGRAM-API-14 answering binds her program answer and zone last', () => {
  test.each([
    ['by the emailed token', { tokenHash: new Uint8Array(32) }],
    ['by the invitation id', { invitationId: INVITATION }],
  ])('%s', async (_, invitation) => {
    const captured: unknown[][] = []
    await setDatabase(recordingDatabase(captured, DECIDED))
    const decided = await decide(invitation, 'accepted', 'Europe/Madrid')
    expect(captured.at(-1)?.slice(-3)).toEqual([command.requestHash, 'accepted', 'Europe/Madrid'])
    expect(decided.resource.programProposal).toEqual({
      intentId: PROGRAM_INTENT,
      intentStatus: 'accepted',
      assignmentId: null,
      unmaterializedReason: 'training_not_granted',
    })
  })

  test('and as nulls when she said nothing, which declines it', async () => {
    const captured: unknown[][] = []
    await setDatabase(recordingDatabase(captured, { ...DECIDED, program_proposal: null }))
    const decided = await decide({ invitationId: INVITATION }, null, null)
    expect(captured.at(-1)?.slice(-2)).toEqual([null, null])
    expect(decided.resource.programProposal).toBeNull()
  })
})

describe('T-REL-INVITE-PROGRAM-API-15 reading carries the offer as she is shown it', () => {
  test('with its length, its start and the scope it needs', async () => {
    const captured: unknown[][] = []
    await setDatabase(
      recordingDatabase(captured, {
        invitation_id: INVITATION,
        status: 'pending',
        organization_id: '019f1602-0000-7000-8000-000000000101',
        organization_display_name: 'Gym A',
        responsible_party: {},
        expires_at: new Date('2026-11-11T12:00:00.000Z'),
        invitation_intent_id: INTENT,
        scope_options: [],
        invited_by: 'Camilo',
        program_proposal: {
          invitation_intent_id: PROGRAM_INTENT,
          program_version_id: VERSION,
          title: 'Bloque A',
          version_number: 1,
          weeks: null,
          repeats_forever: true,
          starts_on: '2026-11-09',
          required_scope: { scope_code: 'relationship_training', access_level: 'contribute' },
          decision: 'rejected',
        },
      }),
    )
    const read = await createClientInvitationDatabase().readMine({
      personId: PERSON,
      verifiedEmail: 'ana@example.test',
      invitationId: INVITATION,
    })
    expect(read?.programProposal).toEqual({
      intentId: PROGRAM_INTENT,
      programVersionId: VERSION,
      title: 'Bloque A',
      versionNumber: 1,
      weeks: null,
      repeatsForever: true,
      startsOn: '2026-11-09',
      requiredScope: { scopeCode: 'relationship_training', accessLevel: 'contribute' },
      decision: 'rejected',
    })
  })
})
