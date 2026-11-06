/**
 * How the coach's review reaches PostgreSQL (`OP-EXE-017`, `OP-EXE-018`), and the
 * corrections he proposes (`OP-EXE-012`, `OP-EXE-020`).
 *
 * The handler tests mock the service and the pgTAP tests call the functions directly,
 * so neither would notice a binding in the wrong position: the coach and the client
 * swapped, or the request id left out of the context that the access record needs.
 * These assert the bindings themselves and what the rows become.
 */
import { afterEach, describe, expect, test } from 'bun:test'
import type postgres from 'postgres'

import { setDatabase } from '../../../platform/db/index.js'
import type {
  ClientProgress,
  ProfessionalObservation,
  ProposedCorrection,
} from '../domain/index.js'
import { createExecutionReviewDatabase } from './index.js'

interface CapturedQuery {
  text: string
  values: unknown[]
}

function recordingDatabase(
  captured: CapturedQuery[],
  answer: (text: string) => unknown[],
): ReturnType<typeof postgres> {
  const client = Object.assign(
    (strings: TemplateStringsArray, ...values: unknown[]) => {
      const text = strings.join('$')
      captured.push({ text, values })
      return Promise.resolve(answer(text))
    },
    {
      begin: (operation: (transaction: unknown) => Promise<unknown>) => operation(client),
      json: (value: unknown) => ({ json: value }),
      end: () => Promise.resolve(),
    },
  )
  return client as unknown as ReturnType<typeof postgres>
}

const COACH = '019f4700-0000-7000-8000-000000000012'
const ORGANIZATION = '019f4700-0000-7000-8000-000000000101'
const CLIENT = '019f4700-0000-7000-8000-000000000001'
const REQUEST = '3f1c2a4e-8b3d-4c5e-9f60-7a8b9c0d1e2f'
const FIRST = '019f4700-0000-7000-8000-000000000e01'
const SECOND = '019f4700-0000-7000-8000-000000000e02'
const THIRD = '019f4700-0000-7000-8000-000000000e03'

const row = (id: string, startedAt: string, autonomous: boolean) => ({
  id,
  started_at: new Date(startedAt),
  ended_at: new Date(startedAt),
  timezone: 'America/Bogota',
  activity_type_code: 'test_strength',
  activity_type_name: 'Fuerza',
  discipline_code: 'test_strength',
  achieved_level: 'detailed',
  origin: autonomous ? 'prior' : 'relationship',
  planned_session_id: null,
  scope_code: autonomous ? 'prior_training_history' : 'relationship_training',
  scope_version: autonomous ? 2 : 4,
})

afterEach(async () => {
  await setDatabase(undefined)
})

describe('the list binding', () => {
  test('T-EXE-REVIEW-INT-01 the coach acts with the request id, and the client is the subject', async () => {
    const captured: CapturedQuery[] = []
    await setDatabase(
      recordingDatabase(captured, (text) =>
        text.includes('list_authorized_executions')
          ? [
              row(FIRST, '2026-11-02T10:00:00.123Z', false),
              row(SECOND, '2026-11-01T10:00:00.456Z', true),
              row(THIRD, '2026-10-31T10:00:00.789Z', true),
            ]
          : [{}],
      ),
    )

    const page = await createExecutionReviewDatabase().listAuthorized({
      personId: COACH,
      organizationId: ORGANIZATION,
      subjectPersonId: CLIENT,
      requestId: REQUEST,
      limit: 2,
      cursor: { startedAt: '2026-11-03T10:00:00.000Z', id: FIRST },
    })

    const context = captured.find((query) => query.text.includes('app.request_id'))
    expect(context?.values).toEqual([COACH, REQUEST])
    const call = captured.find((query) => query.text.includes('list_authorized_executions'))
    // One more than the page, so the next one is known to exist.
    expect(call?.values).toEqual([
      COACH,
      ORGANIZATION,
      CLIENT,
      3,
      '2026-11-03T10:00:00.000Z',
      FIRST,
    ])

    expect(page.hasMore).toBe(true)
    expect(page.items.map((item) => item.id)).toEqual([FIRST, SECOND])
    expect(page.items[0]?.applied_scope).toEqual({ code: 'relationship_training', version: 4 })
    expect(page.items[0]?.started_at).toBe('2026-11-02T10:00:00.123Z')
    expect(page.nextCursor).toEqual({ startedAt: '2026-11-01T10:00:00.456Z', id: SECOND })
  })

  test('T-EXE-REVIEW-INT-02 the last page carries no cursor', async () => {
    await setDatabase(
      recordingDatabase([], (text) =>
        text.includes('list_authorized_executions')
          ? [row(SECOND, '2026-11-01T10:00:00Z', true)]
          : [{}],
      ),
    )
    const page = await createExecutionReviewDatabase().listAuthorized({
      personId: COACH,
      organizationId: ORGANIZATION,
      subjectPersonId: CLIENT,
      requestId: REQUEST,
      limit: 25,
    })
    expect(page.hasMore).toBe(false)
    expect(page.nextCursor).toBeUndefined()
    expect(page.items[0]?.origin).toBe('prior')
  })
})

describe('the detail binding', () => {
  test('T-EXE-REVIEW-INT-03 the session is the fourth argument, after the client', async () => {
    const captured: CapturedQuery[] = []
    await setDatabase(
      recordingDatabase(captured, (text) =>
        text.includes('read_authorized_execution')
          ? [
              {
                document: {
                  outcome: 'scope_required',
                  required_scope: { code: 'relationship_training', level: 'read' },
                },
              },
            ]
          : [{}],
      ),
    )

    const read = await createExecutionReviewDatabase().readAuthorized({
      personId: COACH,
      organizationId: ORGANIZATION,
      subjectPersonId: CLIENT,
      executionId: FIRST,
      requestId: REQUEST,
    })

    const call = captured.find((query) => query.text.includes('read_authorized_execution'))
    expect(call?.values).toEqual([COACH, ORGANIZATION, CLIENT, FIRST])
    expect(read).toEqual({
      outcome: 'scope_required',
      requiredScope: { code: 'relationship_training', level: 'read' },
    })
  })

  test('T-EXE-REVIEW-INT-04 no answer at all is an error, never an empty session', async () => {
    await setDatabase(recordingDatabase([], () => [{ document: null }]))
    await expect(
      createExecutionReviewDatabase().readAuthorized({
        personId: COACH,
        organizationId: ORGANIZATION,
        subjectPersonId: CLIENT,
        executionId: FIRST,
        requestId: REQUEST,
      }),
    ).rejects.toThrow()
  })
})

const OBSERVATION_ID = '019f5000-0000-7000-8000-000000000c01'
const KEY = '7a1c2a4e-8b3d-4c5e-9f60-7a8b9c0d1e2f'
const HASH = Buffer.alloc(32, 7)
const OBSERVATION: ProfessionalObservation = {
  id: OBSERVATION_ID,
  execution_id: FIRST,
  category: 'training',
  provenance: 'professional_observation',
  content: 'Bajó la técnica.',
  revision_number: 1,
  created_at: '2026-11-02T12:00:00.000Z',
  revised_at: null,
  author_name: 'Camilo Coach',
  authored_by_me: true,
}

describe('the progress binding', () => {
  test('T-EXE-REVIEW-INT-05 the window follows the client, and the read carries the request id', async () => {
    const captured: CapturedQuery[] = []
    const progress: ClientProgress = {
      period: 'week',
      sources: [{ code: 'relationship_training', version: 4 }],
      algorithm: { e1rm: 'epley', version: 1 },
      periods: [],
      movements: [],
    }
    await setDatabase(
      recordingDatabase(captured, (text) =>
        text.includes('read_client_progress')
          ? [{ document: { outcome: 'found', ...progress } }]
          : [{}],
      ),
    )

    const read = await createExecutionReviewDatabase().readProgress({
      personId: COACH,
      organizationId: ORGANIZATION,
      subjectPersonId: CLIENT,
      requestId: REQUEST,
      timezone: 'America/Bogota',
      period: 'week',
      count: 4,
    })

    const context = captured.find((query) => query.text.includes('app.request_id'))
    expect(context?.values).toEqual([COACH, REQUEST])
    const call = captured.find((query) => query.text.includes('read_client_progress'))
    expect(call?.values).toEqual([COACH, ORGANIZATION, CLIENT, 'America/Bogota', 'week', 4])
    expect(read).toEqual({ outcome: 'found', progress })
  })

  test('T-EXE-REVIEW-INT-06 with nothing shared it names the scope, and no answer is an error', async () => {
    await setDatabase(
      recordingDatabase([], (text) =>
        text.includes('read_client_progress')
          ? [
              {
                document: {
                  outcome: 'scope_required',
                  required_scope: { code: 'relationship_training', level: 'read' },
                },
              },
            ]
          : [{}],
      ),
    )
    const input = {
      personId: COACH,
      organizationId: ORGANIZATION,
      subjectPersonId: CLIENT,
      requestId: REQUEST,
      timezone: 'UTC',
      period: 'month' as const,
      count: 2,
    }
    expect(await createExecutionReviewDatabase().readProgress(input)).toEqual({
      outcome: 'scope_required',
      requiredScope: { code: 'relationship_training', level: 'read' },
    })
    await setDatabase(recordingDatabase([], () => [{ document: null }]))
    await expect(createExecutionReviewDatabase().readProgress(input)).rejects.toThrow()
  })
})

describe('the observation bindings', () => {
  test('T-EXE-REVIEW-INT-07 the observation is written as the coach, on the client and session given', async () => {
    const captured: CapturedQuery[] = []
    await setDatabase(
      recordingDatabase(captured, (text) =>
        text.includes('record_observation') ? [{ result: OBSERVATION, replayed: true }] : [{}],
      ),
    )

    const result = await createExecutionReviewDatabase().recordObservation({
      personId: COACH,
      organizationId: ORGANIZATION,
      subjectPersonId: CLIENT,
      executionId: FIRST,
      category: 'training',
      provenance: 'professional_observation',
      content: 'Bajó la técnica.',
      idempotencyKey: KEY,
      commandId: OBSERVATION_ID,
      requestHash: HASH,
    })

    // A write records no read, so it carries no request id.
    const context = captured.find((query) => query.text.includes('app.actor_person_id'))
    expect(context?.values).toEqual([COACH, ''])
    const call = captured.find((query) => query.text.includes('record_observation'))
    expect(call?.values).toEqual([
      COACH,
      ORGANIZATION,
      CLIENT,
      FIRST,
      'training',
      'professional_observation',
      'Bajó la técnica.',
      KEY,
      OBSERVATION_ID,
      HASH,
    ])
    expect(result).toEqual({ resource: OBSERVATION, replayed: true })
  })

  test('T-EXE-REVIEW-INT-08 a correction names the observation and the revision it was made over', async () => {
    const captured: CapturedQuery[] = []
    await setDatabase(
      recordingDatabase(captured, (text) =>
        text.includes('revise_observation') ? [{ result: OBSERVATION, replayed: false }] : [{}],
      ),
    )

    await createExecutionReviewDatabase().reviseObservation({
      personId: COACH,
      organizationId: ORGANIZATION,
      observationId: OBSERVATION_ID,
      expectedRevision: 1,
      content: 'Dos series.',
      reason: 'Eran dos.',
      idempotencyKey: KEY,
      commandId: '019f5000-0000-7000-8000-000000000d01',
      requestHash: HASH,
    })

    const call = captured.find((query) => query.text.includes('revise_observation'))
    expect(call?.values).toEqual([
      COACH,
      ORGANIZATION,
      OBSERVATION_ID,
      1,
      'Dos series.',
      'Eran dos.',
      KEY,
      '019f5000-0000-7000-8000-000000000d01',
      HASH,
    ])
    await setDatabase(recordingDatabase([], () => []))
    await expect(
      createExecutionReviewDatabase().reviseObservation({
        personId: COACH,
        organizationId: ORGANIZATION,
        observationId: OBSERVATION_ID,
        expectedRevision: 1,
        content: 'Dos series.',
        reason: 'Eran dos.',
        idempotencyKey: KEY,
        commandId: '019f5000-0000-7000-8000-000000000d01',
        requestHash: HASH,
      }),
    ).rejects.toThrow()
  })
})

const PROPOSAL_ID = '019f5200-0000-7000-8000-000000000c01'
const proposed = (id: string, expiresAt: string): ProposedCorrection => ({
  id,
  client: { person_id: CLIENT, name: 'Ana Cliente' },
  target: null,
  field: 'load',
  proposed: { value: 62.5, unit: 'kg' },
  reason: 'La barra pesaba más.',
  status: 'pending',
  cancel_reason: null,
  created_at: '2026-11-06T12:00:00.123456+00:00',
  expires_at: expiresAt,
  settled_at: null,
})

describe('the proposal bindings', () => {
  test('T-EXE-PROPOSAL-INT-01 the proposal is written as the coach, on the client, session and set given', async () => {
    const captured: CapturedQuery[] = []
    const resource = proposed(PROPOSAL_ID, '2026-12-06T12:00:00.123456+00:00')
    await setDatabase(
      recordingDatabase(captured, (text) =>
        text.includes('propose_correction') ? [{ result: resource, replayed: true }] : [{}],
      ),
    )

    const result = await createExecutionReviewDatabase().proposeCorrection({
      personId: COACH,
      organizationId: ORGANIZATION,
      subjectPersonId: CLIENT,
      executionId: FIRST,
      setOrder: 2,
      field: 'load',
      value: 62.5,
      unit: 'kg',
      reason: 'La barra pesaba más.',
      idempotencyKey: KEY,
      commandId: PROPOSAL_ID,
      requestHash: HASH,
    })

    const context = captured.find((query) => query.text.includes('app.actor_person_id'))
    expect(context?.values).toEqual([COACH, ''])
    const call = captured.find((query) => query.text.includes('propose_correction'))
    expect(call?.values).toEqual([
      COACH,
      ORGANIZATION,
      CLIENT,
      FIRST,
      2,
      'load',
      62.5,
      'kg',
      'La barra pesaba más.',
      KEY,
      PROPOSAL_ID,
      HASH,
    ])
    expect(result).toEqual({ resource, replayed: true })
    await setDatabase(recordingDatabase([], () => []))
    await expect(
      createExecutionReviewDatabase().proposeCorrection({
        personId: COACH,
        organizationId: ORGANIZATION,
        subjectPersonId: CLIENT,
        executionId: FIRST,
        setOrder: 2,
        field: 'rpe',
        value: 9,
        unit: null,
        reason: 'Fue más dura.',
        idempotencyKey: KEY,
        commandId: PROPOSAL_ID,
        requestHash: HASH,
      }),
    ).rejects.toThrow()
  })

  test('T-EXE-PROPOSAL-INT-02 the list asks one past the page and keys the next on the last shown', async () => {
    const captured: CapturedQuery[] = []
    const rows = [
      proposed(FIRST, '2026-12-01T10:00:00.111111+00:00'),
      proposed(SECOND, '2026-12-02T10:00:00.222222+00:00'),
      proposed(THIRD, '2026-12-03T10:00:00.333333+00:00'),
    ]
    await setDatabase(
      recordingDatabase(captured, (text) =>
        text.includes('list_proposed_corrections') ? rows.map((proposal) => ({ proposal })) : [{}],
      ),
    )

    const page = await createExecutionReviewDatabase().listProposedCorrections({
      personId: COACH,
      organizationId: ORGANIZATION,
      status: 'pending',
      limit: 2,
      cursor: { expiresAt: '2026-11-30T10:00:00.000001+00:00', id: PROPOSAL_ID },
    })

    const call = captured.find((query) => query.text.includes('list_proposed_corrections'))
    expect(call?.values).toEqual([
      COACH,
      ORGANIZATION,
      'pending',
      3,
      '2026-11-30T10:00:00.000001+00:00',
      PROPOSAL_ID,
    ])
    expect(page).toEqual({
      items: rows.slice(0, 2),
      hasMore: true,
      nextCursor: { expiresAt: '2026-12-02T10:00:00.222222+00:00', id: SECOND },
    })

    await setDatabase(
      recordingDatabase([], () => rows.slice(0, 1).map((proposal) => ({ proposal }))),
    )
    const last = await createExecutionReviewDatabase().listProposedCorrections({
      personId: COACH,
      organizationId: ORGANIZATION,
      status: null,
      limit: 2,
    })
    expect(last).toEqual({ items: rows.slice(0, 1), hasMore: false })
  })
})
