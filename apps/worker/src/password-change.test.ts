/**
 * T-WRK-PASSWORD-01..06 — the worker's half of a password change (TECH-325, `OP-IDN-066`,
 * ADR-051): close every other session, keep the one the change came from, and warn her.
 */

import { expect, test } from 'bun:test'
import { AuthError, type PasswordChangeIdentity } from '@allfitone/auth-provider'
import { NotificationDeliveryError, type EmailMessage } from '@allfitone/notifications'
import type { Queue } from '@allfitone/queue'

import {
  PASSWORD_CHANGED_TOPIC,
  createPasswordChangeBatchProcessor,
  type PasswordChangeDatabase,
} from './password-change.js'

const BRAND = 'https://space.allfit.one/email/allfit-one-lockup-on-light.png'

interface Trace {
  acknowledged: string[]
  rejected: Array<[string, string, boolean]>
  steps: string[]
  emails: EmailMessage[]
}

const trace = (): Trace => ({ acknowledged: [], rejected: [], steps: [], emails: [] })

function queue(seen: Trace, attempt = 1): Queue {
  return {
    claim: async (topic) =>
      topic === PASSWORD_CHANGED_TOPIC ? [{ id: 'event-7', topic, payload: {}, attempt }] : [],
    ack: async (id) => {
      seen.acknowledged.push(id)
    },
    nack: async (id, code, retryable) => {
      seen.rejected.push([id, code, retryable])
    },
  }
}

const ready: PasswordChangeDatabase = {
  prepareNotice: async () => ({
    state: 'ready',
    subject: 'user_camila',
    signInEmail: 'camila@example.test',
    keepSession: 'session_phone',
  }),
}

function identity(
  seen: Trace,
  failure?: Error,
): Pick<PasswordChangeIdentity, 'revokeOtherSessions'> {
  return {
    revokeOtherSessions: async (subject, keep) => {
      seen.steps.push(`revoke ${subject} keep ${keep}`)
      if (failure) throw failure
    },
  }
}

function email(seen: Trace, failure?: Error) {
  return {
    send: async (message: EmailMessage) => {
      seen.steps.push(`email ${message.to}`)
      if (failure) throw failure
      seen.emails.push(message)
    },
  }
}

function processor(
  seen: Trace,
  options: {
    attempt?: number
    database?: PasswordChangeDatabase
    revokeFailure?: Error
    emailFailure?: Error
    deliveryEnabled?: boolean
  } = {},
) {
  return createPasswordChangeBatchProcessor({
    queue: queue(seen, options.attempt),
    database: options.database ?? ready,
    identity: identity(seen, options.revokeFailure),
    email: email(seen, options.emailFailure),
    brandAssetUrl: BRAND,
    ...(options.deliveryEnabled === undefined ? {} : { deliveryEnabled: options.deliveryEnabled }),
  })
}

test('T-WRK-PASSWORD-01: closes the other sessions first, then warns her, then acknowledges', async () => {
  const seen = trace()

  const result = await processor(seen)()

  expect(seen.steps).toEqual(['revoke user_camila keep session_phone', 'email camila@example.test'])
  expect(seen.emails[0]).toMatchObject({
    to: 'camila@example.test',
    subject: 'Tu contraseña de Allfit cambió',
    idempotencyKey: 'password-changed-notice/event-7',
  })
  expect(seen.acknowledged).toEqual(['event-7'])
  expect(result).toEqual({ claimed: 1, delivered: 1, deadOrDelayed: 0, skipped: 0 })
})

test('T-WRK-PASSWORD-02: a session WorkOS cannot close yet is retried, and nobody is warned before', async () => {
  const seen = trace()

  await processor(seen, { revokeFailure: new AuthError('provider_unavailable') })()

  expect(seen.steps).toEqual(['revoke user_camila keep session_phone'])
  expect(seen.rejected).toEqual([['event-7', 'session_revocation_unavailable', true]])
  expect(seen.acknowledged).toEqual([])
})

test('T-WRK-PASSWORD-03: a notice that fails is retried; the sessions closing again is harmless', async () => {
  const seen = trace()

  await processor(seen, {
    emailFailure: new NotificationDeliveryError('provider_unavailable', true),
  })()

  expect(seen.rejected).toEqual([['event-7', 'provider_unavailable', true]])
  expect(seen.acknowledged).toEqual([])
})

test('T-WRK-PASSWORD-04: on the last attempt the sessions are closed even if the notice never leaves', async () => {
  const seen = trace()

  await processor(seen, {
    attempt: 5,
    emailFailure: new NotificationDeliveryError('provider_unavailable', true),
  })()

  expect(seen.steps).toEqual(['revoke user_camila keep session_phone', 'email camila@example.test'])
  expect(seen.acknowledged).toEqual(['event-7'])
})

test('T-WRK-PASSWORD-05: an event that is not a password change is skipped', async () => {
  const seen = trace()

  const result = await processor(seen, {
    database: { prepareNotice: async () => ({ state: 'skipped' }) },
  })()

  expect(seen.steps).toEqual([])
  expect(seen.acknowledged).toEqual(['event-7'])
  expect(result.skipped).toBe(1)
})

test('T-WRK-PASSWORD-06: switched off, nothing is claimed', async () => {
  const seen = trace()

  const result = await processor(seen, { deliveryEnabled: false })()

  expect(result).toEqual({ claimed: 0, delivered: 0, deadOrDelayed: 0, skipped: 0 })
  expect(seen.steps).toEqual([])
})
