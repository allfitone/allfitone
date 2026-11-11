import { expect, test } from 'bun:test'
import { AuthError, type EmailChangeIdentity } from '@allfitone/auth-provider'
import { NotificationDeliveryError, type EmailMessage } from '@allfitone/notifications'
import type { Queue } from '@allfitone/queue'

import {
  EMAIL_CHANGE_CODE_TOPIC,
  EMAIL_CHANGE_APPLY_TOPIC,
  createEmailChangeBatchProcessor,
  type EmailChangeDatabase,
} from './email-change.js'

const BRAND = 'https://space.allfit.one/email/allfit-one-lockup-on-light.png'

interface Trace {
  acknowledged: string[]
  rejected: Array<[string, string, boolean]>
  steps: string[]
  emails: EmailMessage[]
}

const trace = (): Trace => ({ acknowledged: [], rejected: [], steps: [], emails: [] })

function queue(seen: Trace, topic: string, attempt = 1): Queue {
  return {
    claim: async (claimed) =>
      claimed === topic ? [{ id: 'event-9', topic: claimed, payload: {}, attempt }] : [],
    ack: async (id) => {
      seen.acknowledged.push(id)
    },
    nack: async (id, code, retryable) => {
      seen.rejected.push([id, code, retryable])
    },
  }
}

function database(seen: Trace, overrides: Partial<EmailChangeDatabase> = {}): EmailChangeDatabase {
  return {
    prepareDelivery: async () => ({
      state: 'ready',
      contact: 'nueva@example.test',
      expiresAt: new Date(Date.now() + 30 * 60_000).toISOString(),
    }),
    recordCode: async (eventId, code) => {
      seen.steps.push(`record ${eventId} ${code}`)
    },
    failDelivery: async (eventId) => {
      seen.steps.push(`fail-delivery ${eventId}`)
    },
    prepareApply: async () => ({
      state: 'ready',
      subject: 'user_camila',
      newEmail: 'nueva@example.test',
      previousEmail: 'camila@example.test',
      keepSession: 'session_main',
    }),
    complete: async (eventId) => {
      seen.steps.push(`complete ${eventId}`)
    },
    failApply: async (eventId) => {
      seen.steps.push(`fail-apply ${eventId}`)
    },
    ...overrides,
  }
}

function identity(seen: Trace, failure?: { update?: Error; revoke?: Error }): EmailChangeIdentity {
  return {
    updateEmail: async (subject, email) => {
      seen.steps.push(`workos ${subject} ${email}`)
      if (failure?.update) throw failure.update
    },
    revokeOtherSessions: async (subject, keep) => {
      seen.steps.push(`revoke ${subject} keep ${keep}`)
      if (failure?.revoke) throw failure.revoke
    },
  }
}

function email(seen: Trace, failure?: Error) {
  return {
    send: async (message: EmailMessage) => {
      seen.emails.push(message)
      if (failure) throw failure
    },
  }
}

function processor(
  seen: Trace,
  topic: string,
  options: {
    attempt?: number
    database?: Partial<EmailChangeDatabase>
    identityFailure?: { update?: Error; revoke?: Error }
    emailFailure?: Error
  } = {},
) {
  return createEmailChangeBatchProcessor({
    queue: queue(seen, topic, options.attempt),
    database: database(seen, options.database),
    identity: identity(seen, options.identityFailure),
    email: email(seen, options.emailFailure),
    brandAssetUrl: BRAND,
    generateCode: () => '482913',
  })
}

test('T-WRK-EMAIL-01 records the code before it emails it to the new address', async () => {
  const seen = trace()

  await expect(processor(seen, EMAIL_CHANGE_CODE_TOPIC)()).resolves.toEqual({
    claimed: 1,
    delivered: 1,
    deadOrDelayed: 0,
    skipped: 0,
  })
  expect(seen.steps).toEqual(['record event-9 482913'])
  expect(seen.emails).toHaveLength(1)
  expect(seen.emails[0]?.to).toBe('nueva@example.test')
  expect(seen.emails[0]?.text).toContain('482913')
  expect(seen.emails[0]?.idempotencyKey).toBe('email-change-code/event-9/1')
  expect(seen.acknowledged).toEqual(['event-9'])
})

test('T-WRK-EMAIL-02 a retry sends a new email, under its own key', async () => {
  const seen = trace()

  await processor(seen, EMAIL_CHANGE_CODE_TOPIC, { attempt: 3 })()

  expect(seen.emails[0]?.idempotencyKey).toBe('email-change-code/event-9/3')
})

test('T-WRK-EMAIL-03 a delivery outage retries, and the last attempt fails the request', async () => {
  const outage = new NotificationDeliveryError('provider_unavailable', true)
  const early = trace()
  const last = trace()

  await processor(early, EMAIL_CHANGE_CODE_TOPIC, { emailFailure: outage })()
  await processor(last, EMAIL_CHANGE_CODE_TOPIC, { emailFailure: outage, attempt: 5 })()

  expect(early.rejected).toEqual([['event-9', 'provider_unavailable', true]])
  expect(early.steps).not.toContain('fail-delivery event-9')
  expect(last.steps).toContain('fail-delivery event-9')
  expect(last.rejected).toEqual([['event-9', 'provider_unavailable', false]])
})

test('T-WRK-EMAIL-04 a request that no longer waits for a code is acknowledged untouched', async () => {
  const seen = trace()

  await processor(seen, EMAIL_CHANGE_CODE_TOPIC, {
    database: { prepareDelivery: async () => ({ state: 'skipped' }) },
  })()

  expect(seen.steps).toEqual([])
  expect(seen.emails).toEqual([])
  expect(seen.acknowledged).toEqual(['event-9'])
})

test('T-WRK-EMAIL-05 applies in order: WorkOS, the notice, the other sessions, then the database', async () => {
  const seen = trace()

  await expect(processor(seen, EMAIL_CHANGE_APPLY_TOPIC)()).resolves.toEqual({
    claimed: 1,
    delivered: 1,
    deadOrDelayed: 0,
    skipped: 0,
  })
  expect(seen.steps).toEqual([
    'workos user_camila nueva@example.test',
    'revoke user_camila keep session_main',
    'complete event-9',
  ])
  expect(seen.emails).toHaveLength(1)
  expect(seen.emails[0]?.to).toBe('camila@example.test')
  expect(seen.emails[0]?.subject).toBe('Tu correo de Allfit cambió')
  expect(seen.emails[0]?.text).not.toContain('nueva@example.test')
  expect(seen.emails[0]?.idempotencyKey).toBe('email-changed-notice/event-9')
  expect(seen.acknowledged).toEqual(['event-9'])
})

test('T-WRK-EMAIL-06 when WorkOS refuses, the request fails and nothing else happens', async () => {
  const seen = trace()

  await processor(seen, EMAIL_CHANGE_APPLY_TOPIC, {
    identityFailure: { update: new AuthError('invalid_email', 'refused') },
  })()

  expect(seen.steps).toEqual(['workos user_camila nueva@example.test', 'fail-apply event-9'])
  expect(seen.emails).toEqual([])
  expect(seen.rejected).toEqual([['event-9', 'email_change_rejected', false]])
})

test('T-WRK-EMAIL-07 a WorkOS outage retries without completing', async () => {
  const seen = trace()

  await processor(seen, EMAIL_CHANGE_APPLY_TOPIC, {
    identityFailure: { update: new AuthError('provider_unavailable', 'down') },
  })()

  expect(seen.steps).toEqual(['workos user_camila nueva@example.test'])
  expect(seen.rejected).toEqual([['event-9', 'email_change_unavailable', true]])
})

test('T-WRK-EMAIL-08 a notice that cannot leave yet retries; on the last attempt the change still completes', async () => {
  const outage = new NotificationDeliveryError('provider_unavailable', true)
  const early = trace()
  const last = trace()

  await processor(early, EMAIL_CHANGE_APPLY_TOPIC, { emailFailure: outage })()
  await processor(last, EMAIL_CHANGE_APPLY_TOPIC, { emailFailure: outage, attempt: 5 })()

  expect(early.steps).not.toContain('complete event-9')
  expect(early.rejected).toEqual([['event-9', 'provider_unavailable', true]])
  expect(last.steps).toContain('complete event-9')
  expect(last.acknowledged).toEqual(['event-9'])
})

test('T-WRK-EMAIL-09 the code never reaches a log', async () => {
  const seen = trace()
  const lines: string[] = []
  const original = { info: console.info, error: console.error, warn: console.warn }
  console.info = (...args: unknown[]) => lines.push(args.map(String).join(' '))
  console.error = console.info
  console.warn = console.info
  try {
    await processor(seen, EMAIL_CHANGE_CODE_TOPIC, {
      emailFailure: new NotificationDeliveryError('provider_rejected', false),
    })()
  } finally {
    console.info = original.info
    console.error = original.error
    console.warn = original.warn
  }

  expect(lines.join('\n')).not.toContain('482913')
})
