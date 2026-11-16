import { expect, test } from 'bun:test'
import type { Queue } from '@allfitone/queue'
import type postgres from 'postgres'

import {
  createWaitlistAccountLinkBatchProcessor,
  createWaitlistAccountLinkDatabase,
  type WaitlistAccountLinkOutcome,
} from './waitlist-account-links.js'

/** One claimed event per outcome; an `Error` in its place is the database failing. */
function processor(
  outcomes: Array<WaitlistAccountLinkOutcome | Error>,
  options: {
    acknowledged?: string[]
    rejected?: Array<[string, string, boolean]>
    claims?: Array<[string, number]>
  } = {},
) {
  const queue: Queue = {
    claim: async (topic, limit) => {
      options.claims?.push([topic, limit])
      return outcomes.map((_, index) => ({
        id: `event-${index + 1}`,
        topic,
        payload: { person_id: `person-${index + 1}` },
        attempt: 1,
      }))
    },
    ack: async (id) => {
      options.acknowledged?.push(id)
    },
    nack: async (id, code, retryable) => {
      options.rejected?.push([id, code, retryable])
    },
  }
  return createWaitlistAccountLinkBatchProcessor({
    queue,
    database: {
      link: async (eventId) => {
        const outcome = outcomes[Number(eventId.replace('event-', '')) - 1]
        if (outcome === undefined) throw new Error(`no outcome for ${eventId}`)
        if (outcome instanceof Error) throw outcome
        return outcome
      },
    },
  })
}

// What a link does is `T-WL-INT-09`; this holds who asks for it and in what order.
function recordingSql(answer: (text: string) => unknown[]) {
  const statements: string[] = []
  const values: unknown[][] = []
  const transaction = (strings: TemplateStringsArray, ...bound: unknown[]) => {
    const text = strings.join('$')
    statements.push(text)
    values.push(bound)
    return Promise.resolve(answer(text))
  }
  const sql = {
    begin: (operation: (tx: typeof transaction) => Promise<unknown>) => operation(transaction),
  } as unknown as postgres.Sql
  return { sql, statements, values }
}

test('T-WRK-WL-23 an activated person is linked to her sign-up and the event is closed', async () => {
  const acknowledged: string[] = []
  const claims: Array<[string, number]> = []

  await expect(
    processor(['linked', 'already_linked'], { acknowledged, claims })(),
  ).resolves.toEqual({ claimed: 2, delivered: 2, deadOrDelayed: 0, skipped: 0 })

  expect(claims).toEqual([['identity.person_activated.v1', 25]])
  expect(acknowledged).toEqual(['event-1', 'event-2'])
})

test('T-WRK-WL-24 an event that links nothing is closed, never retried', async () => {
  const acknowledged: string[] = []
  const rejected: Array<[string, string, boolean]> = []

  await expect(
    processor(['no_signup', 'conflict', 'skipped'], { acknowledged, rejected })(),
  ).resolves.toEqual({ claimed: 3, delivered: 0, deadOrDelayed: 0, skipped: 3 })

  expect(acknowledged).toEqual(['event-1', 'event-2', 'event-3'])
  expect(rejected).toEqual([])
})

test('T-WRK-WL-25 a failure leaves the event to be tried again, and the rest go on', async () => {
  const acknowledged: string[] = []
  const rejected: Array<[string, string, boolean]> = []

  await expect(
    processor([new Error('connection lost'), 'linked'], { acknowledged, rejected })(),
  ).resolves.toEqual({ claimed: 2, delivered: 1, deadOrDelayed: 1, skipped: 0 })

  expect(rejected).toEqual([['event-1', 'worker_error', true]])
  expect(acknowledged).toEqual(['event-2'])
})

test('T-WRK-WL-26 the link runs as the worker, in one transaction, with what identity read', async () => {
  const { sql, statements, values } = recordingSql((text) => {
    if (text.includes('identity.prepare_account_link')) {
      return [
        {
          link_state: 'ready',
          person_id: 'person-1',
          verified_email: 'ana@example.com',
          store: 'app_store',
        },
      ]
    }
    return text.includes('waitlist.link_signup') ? [{ outcome: 'linked' }] : [{}]
  })

  await expect(createWaitlistAccountLinkDatabase(sql).link('event-1')).resolves.toBe('linked')

  expect(statements[0]).toContain("set_config('app.actor_kind', 'worker', true)")
  expect(statements[1]).toContain('identity.prepare_account_link(')
  expect(values[1]).toEqual(['event-1'])
  expect(statements[2]).toContain('waitlist.link_signup(')
  expect(values[2]).toEqual(['person-1', 'ana@example.com', 'app_store'])
})

test('T-WRK-WL-27 a person identity does not hand over is never looked up on the list', async () => {
  const { sql, statements } = recordingSql((text) =>
    text.includes('identity.prepare_account_link')
      ? [{ link_state: 'skipped', person_id: null, verified_email: null, store: null }]
      : [{}],
  )

  await expect(createWaitlistAccountLinkDatabase(sql).link('event-1')).resolves.toBe('skipped')

  expect(statements.some((text) => text.includes('waitlist.link_signup'))).toBe(false)
})

test('T-WRK-WL-28 an answer the worker does not know is a failure, never a link', async () => {
  const unknown = recordingSql((text) => {
    if (text.includes('identity.prepare_account_link')) {
      return [
        {
          link_state: 'ready',
          person_id: 'person-1',
          verified_email: 'ana@example.com',
          store: null,
        },
      ]
    }
    return text.includes('waitlist.link_signup') ? [{ outcome: 'merged' }] : [{}]
  })
  const silent = recordingSql(() => [])

  await expect(createWaitlistAccountLinkDatabase(unknown.sql).link('event-1')).rejects.toThrow()
  await expect(createWaitlistAccountLinkDatabase(silent.sql).link('event-1')).rejects.toThrow()
})
