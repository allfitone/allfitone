import { expect, test } from 'bun:test'
import type { Queue } from '@allfitone/queue'

import { createBackofficeAuthBatchProcessor } from './backoffice-auth.js'

test('expires attempts and idempotently cleans provider sessions and pending factors', async () => {
  const acknowledged: string[] = []
  const revoked: string[] = []
  const deleted: string[] = []
  const queue: Queue = {
    claim: async (topic) =>
      topic === 'identity.backoffice_auth_cleanup_requested.v1'
        ? [{ id: 'event-1', topic, payload: {}, attempt: 1 }]
        : [],
    ack: async (id) => {
      acknowledged.push(id)
    },
    nack: async () => undefined,
  }
  const process = createBackofficeAuthBatchProcessor({
    queue,
    database: {
      expire: async () => 3,
      expireSessions: async () => 2,
      prepare: async () => ({
        state: 'ready',
        providerSessionId: 'session-1',
        providerFactorId: 'factor-1',
      }),
    },
    provider: {
      revokeSession: async (id) => {
        revoked.push(id)
      },
      deleteAuthenticationFactor: async (id) => {
        deleted.push(id)
      },
    },
  })

  await expect(process()).resolves.toEqual({
    expired: 3,
    sessionsExpired: 2,
    claimed: 1,
    completed: 1,
    deadOrDelayed: 0,
    skipped: 0,
  })
  expect(revoked).toEqual(['session-1'])
  expect(deleted).toEqual(['factor-1'])
  expect(acknowledged).toEqual(['event-1'])
})

test('nacks cleanup failures so the queue can retry and dead-letter them', async () => {
  const nacks: Array<[string, string, boolean]> = []
  const process = createBackofficeAuthBatchProcessor({
    queue: {
      claim: async (topic) =>
        topic === 'identity.backoffice_session_revocation_requested.v1'
          ? [{ id: 'event-2', topic, payload: {}, attempt: 2 }]
          : [],
      ack: async () => undefined,
      nack: async (id, reason, retryable) => {
        nacks.push([id, reason, retryable])
      },
    },
    database: {
      expire: async () => 0,
      expireSessions: async () => 0,
      prepare: async () => ({ state: 'ready', providerSessionId: 'session-2' }),
    },
    provider: {
      revokeSession: async () => Promise.reject(new Error('provider unavailable')),
      deleteAuthenticationFactor: async () => undefined,
    },
  })

  const result = await process()
  expect(result.deadOrDelayed).toBe(1)
  expect(nacks).toEqual([['event-2', 'backoffice_auth_cleanup_failed', true]])
})

// HU-BO-002 c3: a session nobody presented again was never revoked with the provider.
test('sweeps idle sessions before claiming, so their revocation goes out in the same run', async () => {
  const order: string[] = []
  const process = createBackofficeAuthBatchProcessor({
    queue: {
      claim: async (topic) => {
        order.push(`claim:${topic}`)
        return []
      },
      ack: async () => undefined,
      nack: async () => undefined,
    },
    database: {
      expire: async () => 0,
      expireSessions: async (limit) => {
        order.push(`sweep:${limit}`)
        return 1
      },
      prepare: async () => ({ state: 'skipped' }),
    },
    provider: {
      revokeSession: async () => undefined,
      deleteAuthenticationFactor: async () => undefined,
    },
  })

  const result = await process()

  expect(result.sessionsExpired).toBe(1)
  expect(order[0]).toBe('sweep:100')
  expect(order).toContain('claim:identity.backoffice_session_revocation_requested.v1')
})
