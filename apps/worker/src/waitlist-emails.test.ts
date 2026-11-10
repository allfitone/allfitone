import { expect, test } from 'bun:test'
import {
  NotificationDeliveryError,
  createWaitlistToken,
  type EmailMessage,
} from '@allfitone/notifications'
import type { Queue } from '@allfitone/queue'

import { createWaitlistEmailBatchProcessor, type WaitlistEmailDelivery } from './waitlist-emails.js'

const KEY = Buffer.alloc(32, 7).toString('base64')
const CONFIRMATION_TOKEN_ID = '019d2000-0000-7000-8000-000000000001'
const PRIVATE_TOKEN_ID = '019d2000-0000-7000-8000-000000000002'

function queue(acknowledged: string[], rejected: Array<[string, string, boolean]> = []): Queue {
  return {
    claim: async (topic) =>
      topic === 'waitlist.email_requested.v1'
        ? [{ id: 'event-9', topic, payload: {}, attempt: 1 }]
        : [],
    ack: async (id) => {
      acknowledged.push(id)
    },
    nack: async (id, code, retryable) => {
      rejected.push([id, code, retryable])
    },
  }
}

function confirmation(overrides: Partial<WaitlistEmailDelivery> = {}): WaitlistEmailDelivery {
  return {
    state: 'ready',
    kind: 'confirmation',
    name: 'Ana Ruiz',
    email: 'ana.ruiz@gmail.com',
    language: 'es',
    referralCode: 'KEVN7QHX',
    referrals: 0,
    confirmationTokenId: CONFIRMATION_TOKEN_ID,
    privateTokenId: PRIVATE_TOKEN_ID,
    tokenKeyVersion: 1,
    confirmationExpiresAt: new Date('2026-11-17T12:00:00.000Z'),
    ...overrides,
  }
}

function processor(
  delivery: WaitlistEmailDelivery,
  options: {
    acknowledged?: string[]
    rejected?: Array<[string, string, boolean]>
    sent?: EmailMessage[]
    send?: (message: EmailMessage) => Promise<void>
    deliveryEnabled?: boolean
  } = {},
) {
  return createWaitlistEmailBatchProcessor({
    queue: queue(options.acknowledged ?? [], options.rejected),
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

test('T-WRK-WL-01 the confirmation email carries the three links, each with its own token', async () => {
  const acknowledged: string[] = []
  const sent: EmailMessage[] = []

  await expect(processor(confirmation(), { acknowledged, sent })()).resolves.toEqual({
    claimed: 1,
    delivered: 1,
    deadOrDelayed: 0,
    skipped: 0,
  })

  const confirmationToken = createWaitlistToken(CONFIRMATION_TOKEN_ID, KEY)
  const privateToken = createWaitlistToken(PRIVATE_TOKEN_ID, KEY)
  expect(acknowledged).toEqual(['event-9'])
  expect(sent[0]?.to).toBe('ana.ruiz@gmail.com')
  expect(sent[0]?.idempotencyKey).toBe('waitlist-email/event-9')
  expect(sent[0]?.subject).toBe('Confirma tu correo para la lista de Allfit Space')
  expect(sent[0]?.text).toContain(
    `http://localhost:3002/es/waitlist/confirm#token=${confirmationToken}`,
  )
  expect(sent[0]?.text).toContain(
    `http://localhost:3002/es/waitlist/referrals#token=${privateToken}`,
  )
  expect(sent[0]?.text).toContain('http://localhost:3002/es/waitlist?ref=KEVN7QHX')
  expect(confirmationToken).not.toBe(privateToken)
})

test('T-WRK-WL-02 a confirmed address gets its link in its own language, and no confirmation', async () => {
  const sent: EmailMessage[] = []
  const {
    confirmationTokenId: _id,
    confirmationExpiresAt: _expiry,
    ...link
  } = confirmation({
    kind: 'link',
    language: 'en',
    referrals: 4,
  })

  await processor(link, { sent })()

  expect(sent[0]?.subject).toBe('Your Allfit Space waitlist link')
  expect(sent[0]?.text).toContain('http://localhost:3002/en/waitlist?ref=KEVN7QHX')
  expect(sent[0]?.text).toContain('http://localhost:3002/en/waitlist/referrals#token=')
  expect(sent[0]?.text).not.toContain('waitlist/confirm')
})

test('T-WRK-WL-03 an email the database no longer wants is acknowledged without sending', async () => {
  const acknowledged: string[] = []
  const sent: EmailMessage[] = []

  await expect(processor({ state: 'skipped' }, { acknowledged, sent })()).resolves.toMatchObject({
    delivered: 0,
    skipped: 1,
  })
  expect(acknowledged).toEqual(['event-9'])
  expect(sent).toEqual([])
})

test('T-WRK-WL-04 a projection without what the email needs is dead, not retried', async () => {
  const rejected: Array<[string, string, boolean]> = []
  const { confirmationTokenId: _id, ...withoutToken } = confirmation()

  await processor(withoutToken, { rejected })()

  expect(rejected).toEqual([['event-9', 'invalid_delivery_projection', false]])
})

test('T-WRK-WL-05 a provider failure keeps its own code and retry verdict', async () => {
  const rejected: Array<[string, string, boolean]> = []

  await processor(confirmation(), {
    rejected,
    send: async () => {
      throw new NotificationDeliveryError('provider_throttled', true)
    },
  })()

  expect(rejected).toEqual([['event-9', 'provider_throttled', true]])
})

test('T-WRK-WL-06 with delivery off nothing is claimed', async () => {
  const acknowledged: string[] = []

  await expect(
    processor(confirmation(), { acknowledged, deliveryEnabled: false })(),
  ).resolves.toEqual({ claimed: 0, delivered: 0, deadOrDelayed: 0, skipped: 0 })
  expect(acknowledged).toEqual([])
})
