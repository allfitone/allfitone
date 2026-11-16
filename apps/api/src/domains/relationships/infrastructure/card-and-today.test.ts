/**
 * How the client card (`OP-REL-019`) and what needs attention today (`OP-REL-020`) reach
 * PostgreSQL.
 *
 * The handler tests mock the service and the pgTAP tests call the functions directly, so
 * neither would notice the subject bound where the organization goes, or the summary run
 * without the request its access events are written under.
 */
import { describe, expect, test } from 'bun:test'
import type postgres from 'postgres'

import { createClientCardDatabase, createStudioTodayDatabase } from './index.js'

interface CapturedQuery {
  text: string
  values: unknown[]
}

function recordingDatabase(
  captured: CapturedQuery[],
  answer: Record<string, unknown>,
): ReturnType<typeof postgres> {
  const client = Object.assign(
    (strings: TemplateStringsArray, ...values: unknown[]) => {
      const text = strings.join('$')
      captured.push({ text, values })
      return Promise.resolve(text.includes('set_config') ? [{}] : [answer])
    },
    { begin: (operation: (transaction: unknown) => Promise<unknown>) => operation(client) },
  )
  return client as unknown as ReturnType<typeof postgres>
}

const COACH = '019ae700-0000-7000-8000-000000000012'
const ORGANIZATION = '019ae700-0000-7000-8000-000000000101'
const CLIENT = '019ae700-0000-7000-8000-000000000001'
const REQUEST = '6f1c2a4e-8b3d-4c5e-9f60-7a8b9c0d1e2f'

describe('the card binding', () => {
  test('acts as the coach and asks for the client in his organization', async () => {
    const captured: CapturedQuery[] = []
    const card = {
      kind: 'former',
      person_id: CLIENT,
      reason: 'assignment_ended',
      lost_at: '2026-11-05T05:00:00+00:00',
    } as const
    const read = await createClientCardDatabase(recordingDatabase(captured, { card })).readCard(
      COACH,
      { organizationId: ORGANIZATION, personId: CLIENT },
    )
    expect(read).toEqual(card)
    expect(captured[0]?.values).toEqual([COACH])
    const call = captured.find((query) => query.text.includes('read_client_card'))
    expect(call?.values).toEqual([COACH, ORGANIZATION, CLIENT])
  })

  test('a document that is no card is a drift, not an answer', async () => {
    const database = createClientCardDatabase(recordingDatabase([], { card: { kind: 'other' } }))
    await expect(
      database.readCard(COACH, { organizationId: ORGANIZATION, personId: CLIENT }),
    ).rejects.toThrow('read_client_card returned no card')
  })
})

describe('the summary binding', () => {
  test('sets the request its access events are written under before reading', async () => {
    const captured: CapturedQuery[] = []
    const today = { organization_id: ORGANIZATION, generated_at: 'x', empty: true, notices: {} }
    await createStudioTodayDatabase(recordingDatabase(captured, { today })).readToday(COACH, {
      organizationId: ORGANIZATION,
      requestId: REQUEST,
    })
    expect(captured[0]?.text).toContain("set_config('app.request_id'")
    expect(captured[0]?.values).toEqual([COACH, REQUEST])
    const call = captured.find((query) => query.text.includes('read_studio_today'))
    expect(call?.values).toEqual([COACH, ORGANIZATION])
  })
})
