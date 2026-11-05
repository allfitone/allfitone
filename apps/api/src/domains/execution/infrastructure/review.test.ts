/**
 * How the coach's review reaches PostgreSQL (`OP-EXE-017`, `OP-EXE-018`).
 *
 * The handler tests mock the service and the pgTAP tests call the functions directly,
 * so neither would notice a binding in the wrong position: the coach and the client
 * swapped, or the request id left out of the context that the access record needs.
 * These assert the bindings themselves and what the rows become.
 */
import { afterEach, describe, expect, test } from 'bun:test'
import type postgres from 'postgres'

import { setDatabase } from '../../../platform/db/index.js'
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
