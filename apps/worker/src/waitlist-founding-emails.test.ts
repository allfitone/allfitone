import { expect, test } from 'bun:test'
import {
  NotificationDeliveryError,
  createWaitlistToken,
  type EmailMessage,
} from '@allfitone/notifications'
import type { Queue } from '@allfitone/queue'

import {
  createWaitlistFoundingEmailBatchProcessor,
  type WaitlistFoundingEmailDelivery,
} from './waitlist-founding-emails.js'

const KEY = Buffer.alloc(32, 7).toString('base64')
const PRIVATE_TOKEN_ID = '019d2000-0000-7000-8000-000000000002'

function founding(
  overrides: Partial<WaitlistFoundingEmailDelivery> = {},
): WaitlistFoundingEmailDelivery {
  return {
    state: 'ready',
    name: 'Ana Ruiz',
    email: 'ana.ruiz@gmail.com',
    language: 'es',
    referralCode: 'KEVN7QHX',
    referrals: 2,
    foundingNumber: 37,
    privateTokenId: PRIVATE_TOKEN_ID,
    tokenKeyVersion: 1,
    ...overrides,
  }
}

function processor(
  delivery: WaitlistFoundingEmailDelivery,
  options: {
    acknowledged?: string[]
    rejected?: Array<[string, string, boolean]>
    claims?: string[]
    sent?: EmailMessage[]
    send?: (message: EmailMessage) => Promise<void>
    deliveryEnabled?: boolean
  } = {},
) {
  const queue: Queue = {
    claim: async (topic) => {
      options.claims?.push(topic)
      return topic === 'waitlist.founding_number_assigned.v1'
        ? [{ id: 'event-9', topic, payload: { founding_number: 37 }, attempt: 1 }]
        : []
    },
    ack: async (id) => {
      options.acknowledged?.push(id)
    },
    nack: async (id, code, retryable) => {
      options.rejected?.push([id, code, retryable])
    },
  }
  return createWaitlistFoundingEmailBatchProcessor({
    queue,
    database: { prepare: async () => delivery },
    email: {
      send:
        options.send ??
        (async (message) => {
          options.sent?.push(message)
        }),
    },
    publicBaseUrl: 'http://localhost:3002/',
    brandAssetUrl: 'http://localhost:3000/email/logo.png',
    environment: { NODE_ENV: 'development', INVITATION_TOKEN_KEY_V1: KEY },
    ...(options.deliveryEnabled === undefined ? {} : { deliveryEnabled: options.deliveryEnabled }),
  })
}

test('T-WRK-WL-16 a Founding Member is told their number, with their own links', async () => {
  const acknowledged: string[] = []
  const sent: EmailMessage[] = []

  await expect(processor(founding(), { acknowledged, sent })()).resolves.toEqual({
    claimed: 1,
    delivered: 1,
    deadOrDelayed: 0,
    skipped: 0,
  })

  const privateToken = createWaitlistToken(PRIVATE_TOKEN_ID, KEY)
  expect(acknowledged).toEqual(['event-9'])
  expect(sent[0]?.to).toBe('ana.ruiz@gmail.com')
  expect(sent[0]?.idempotencyKey).toBe('waitlist-founding-email/event-9')
  expect(sent[0]?.subject).toBe('Eres Founding Member #037 de Allfit Space')
  expect(sent[0]?.text).toContain('Tu número: #037')
  expect(sent[0]?.text).toContain('http://localhost:3002/es/waitlist?ref=KEVN7QHX')
  expect(sent[0]?.text).toContain(
    `http://localhost:3002/es/waitlist/referrals#token=${privateToken}`,
  )
  expect(sent[0]?.text).toContain(`http://localhost:3002/es/waitlist/leave#token=${privateToken}`)
  expect(sent[0]?.text).not.toContain('waitlist/confirm')
})

test('T-WRK-WL-17 the email speaks the language the person joined in', async () => {
  const sent: EmailMessage[] = []

  await processor(founding({ language: 'en', foundingNumber: 100 }), { sent })()

  expect(sent[0]?.subject).toBe('You’re Founding Member #100 of Allfit Space')
  expect(sent[0]?.text).toContain('http://localhost:3002/en/waitlist?ref=KEVN7QHX')
})

test('T-WRK-WL-18 a number its sign-up no longer holds is acknowledged without an email', async () => {
  const acknowledged: string[] = []
  const sent: EmailMessage[] = []

  await expect(processor({ state: 'skipped' }, { acknowledged, sent })()).resolves.toMatchObject({
    delivered: 0,
    skipped: 1,
  })
  expect(acknowledged).toEqual(['event-9'])
  expect(sent).toEqual([])
})

test('T-WRK-WL-19 a projection without what the email needs is dead, not retried', async () => {
  for (const delivery of [
    founding({ foundingNumber: 0 }),
    founding({ foundingNumber: 101 }),
    (() => {
      const { privateTokenId: _id, ...withoutToken } = founding()
      return withoutToken
    })(),
  ]) {
    const rejected: Array<[string, string, boolean]> = []
    const sent: EmailMessage[] = []

    await processor(delivery, { rejected, sent })()

    expect(rejected).toEqual([['event-9', 'invalid_delivery_projection', false]])
    expect(sent).toEqual([])
  }
})

test('T-WRK-WL-20 a provider failure keeps its own code and retry verdict', async () => {
  const rejected: Array<[string, string, boolean]> = []

  await processor(founding(), {
    rejected,
    send: async () => {
      throw new NotificationDeliveryError('provider_throttled', true)
    },
  })()

  expect(rejected).toEqual([['event-9', 'provider_throttled', true]])
})

test('T-WRK-WL-21 with delivery off nothing is claimed, so the events wait', async () => {
  const claims: string[] = []

  await expect(processor(founding(), { claims, deliveryEnabled: false })()).resolves.toEqual({
    claimed: 0,
    delivered: 0,
    deadOrDelayed: 0,
    skipped: 0,
  })
  expect(claims).toEqual([])
})
