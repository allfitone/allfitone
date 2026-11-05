/**
 * How hiding a session reaches PostgreSQL (`OP-PRV-006`, `OP-PRV-007`, `OP-PRV-017`).
 *
 * The handler tests mock the service and the pgTAP tests call the functions directly,
 * so a swapped session and relationship would pass both. These assert the bindings and
 * what a denial row becomes on the wire.
 */
import { afterEach, describe, expect, test } from 'bun:test'
import type postgres from 'postgres'

import { setDatabase } from '../../../platform/db/index.js'
import type { SessionVisibilityDenial } from '../domain/index.js'
import { createSessionVisibilityDatabase } from './index.js'

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

const PERSON = '019f4800-0000-7000-8000-000000000001'
const EXECUTION = '019f4800-0000-7000-8000-000000000e01'
const RELATIONSHIP = '019f4800-0000-7000-8000-000000000701'
const DOCUMENT: SessionVisibilityDenial = {
  executed_session_id: EXECUTION,
  relationship_id: RELATIONSHIP,
  organization: { id: '019f4800-0000-7000-8000-000000000101', display_name: 'Gym A' },
  status: 'active',
  denied_at: '2026-11-04T15:00:00.000Z',
  restored_at: null,
  session: { started_at: '2026-11-01T11:00:00.000Z', activity_type_name: 'Fuerza' },
}
const command = {
  personId: PERSON,
  executionId: EXECUTION,
  relationshipId: RELATIONSHIP,
  idempotencyKey: '51111111-1111-4111-8111-111111111111',
  commandId: '019f4800-0000-7000-8000-000000000f01',
  requestHash: Buffer.alloc(32, 7),
}

afterEach(async () => {
  await setDatabase(undefined)
})

describe('hiding and restoring', () => {
  test('T-PRV-HIDE-INT-11 she acts as herself, the session before the relationship', async () => {
    for (const operation of ['hide', 'restore'] as const) {
      const captured: CapturedQuery[] = []
      await setDatabase(
        recordingDatabase(captured, (text) =>
          text.includes('_session(') ? [{ result: DOCUMENT, replayed: false }] : [{}],
        ),
      )

      const answer = await createSessionVisibilityDatabase()[operation](command)

      expect(captured[0]?.text).toContain("set_config('app.actor_person_id'")
      expect(captured[0]?.values).toEqual([PERSON])
      const call = captured.find((query) => query.text.includes('_session('))
      expect(call?.text).toContain(`privacy.${operation}_session(`)
      expect(call?.values).toEqual([
        PERSON,
        EXECUTION,
        RELATIONSHIP,
        command.idempotencyKey,
        command.commandId,
        command.requestHash,
      ])
      expect(answer).toEqual({ resource: DOCUMENT, replayed: false })
    }
  })

  test('T-PRV-HIDE-INT-12 no document back is an error, never a silent success', async () => {
    await setDatabase(recordingDatabase([], () => [{ result: null, replayed: false }]))
    await expect(createSessionVisibilityDatabase().hide(command)).rejects.toThrow()
  })
})

describe('what she hides', () => {
  test('T-PRV-HIDE-INT-13 a page asks for one more, and its last row is the next cursor', async () => {
    const captured: CapturedQuery[] = []
    const denied = new Date('2026-11-04T15:00:00.123Z')
    await setDatabase(
      recordingDatabase(captured, (text) =>
        text.includes('list_my_session_denials')
          ? [1, 2, 3].map((n) => ({
              id: `019f4800-0000-7000-8000-00000000d00${n}`,
              executed_session_id: EXECUTION,
              relationship_id: RELATIONSHIP,
              organization_id: '019f4800-0000-7000-8000-000000000101',
              organization_name: 'Gym A',
              denied_at: denied,
              session_started_at: new Date('2026-11-01T11:00:00Z'),
              activity_type_name: 'Fuerza',
            }))
          : [{}],
      ),
    )

    const page = await createSessionVisibilityDatabase().listMine({
      personId: PERSON,
      limit: 2,
      cursor: { deniedAt: '2026-11-05T00:00:00.000Z', id: '019f4800-0000-7000-8000-00000000d009' },
    })

    const call = captured.find((query) => query.text.includes('list_my_session_denials'))
    expect(call?.values).toEqual([
      PERSON,
      3,
      '2026-11-05T00:00:00.000Z',
      '019f4800-0000-7000-8000-00000000d009',
    ])
    expect(page.hasMore).toBe(true)
    expect(page.items).toHaveLength(2)
    expect(page.items[0]).toEqual({
      executed_session_id: EXECUTION,
      relationship_id: RELATIONSHIP,
      organization: { id: '019f4800-0000-7000-8000-000000000101', display_name: 'Gym A' },
      status: 'active',
      denied_at: '2026-11-04T15:00:00.123Z',
      restored_at: null,
      session: { started_at: '2026-11-01T11:00:00.000Z', activity_type_name: 'Fuerza' },
    })
    expect(page.nextCursor).toEqual({
      deniedAt: '2026-11-04T15:00:00.123Z',
      id: '019f4800-0000-7000-8000-00000000d002',
    })
  })
})
