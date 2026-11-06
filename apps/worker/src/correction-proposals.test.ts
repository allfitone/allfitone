import { describe, expect, test } from 'bun:test'

import { NotificationDeliveryError } from '@allfitone/notifications'
import type { Queue, QueueMessage } from '@allfitone/queue'

import { createCorrectionProposalBatchProcessor } from './correction-proposals.js'

// 03:00 UTC is still the 5th in Colombia: the day she reads must be hers.
const NOTICE = {
  proposal_id: '019f5200-0000-7000-8000-000000000c01',
  contact: 'ana@example.test',
  person_name: 'Ana Álvarez',
  proposer_name: 'Camilo Restrepo',
  organization_name: 'Allfit Gym',
  expires_at: '2026-12-06T03:00:00.123456+00:00',
}

const BRAND = 'https://studio.example.test/email/lockup.png'

function queueWith(messages: QueueMessage[]) {
  const claimed: Array<{ topic: string; limit: number }> = []
  const acked: string[] = []
  const nacked: Array<{ id: string; reason: string; retryable: boolean }> = []
  const queue: Queue = {
    claim: async (topic: string, limit: number) => {
      claimed.push({ topic, limit })
      return messages
    },
    ack: async (id: string) => {
      acked.push(id)
    },
    nack: async (id: string, reason: string, retryable: boolean) => {
      nacked.push({ id, reason, retryable })
    },
  } as unknown as Queue
  return { queue, claimed, acked, nacked }
}

function message(payload: unknown = NOTICE): QueueMessage {
  return {
    id: '01991600-7000-7000-8000-0000000000e3',
    topic: 'execution.correction_proposed.v1',
    payload,
    attempt: 1,
  }
}

function emailSpy() {
  const sent: Array<Record<string, unknown>> = []
  return {
    sent,
    sender: {
      send: async (email: Record<string, unknown>) => {
        sent.push(email)
      },
    },
  }
}

function deliver(payload: unknown = NOTICE) {
  const { queue, claimed, acked, nacked } = queueWith([message(payload)])
  const email = emailSpy()
  const run = createCorrectionProposalBatchProcessor({
    queue,
    email: email.sender as never,
    brandAssetUrl: BRAND,
  })
  return { run, email, claimed, acked, nacked }
}

describe('telling a person a professional proposes a correction (HU-STUDIO-059 c4)', () => {
  test('tells her at the address she has, from the proposed event', async () => {
    const { run, email, claimed, acked } = deliver()

    const result = await run()

    expect(claimed[0]?.topic).toBe('execution.correction_proposed.v1')
    expect(result).toMatchObject({ claimed: 1, delivered: 1, deadOrDelayed: 0 })
    expect(acked).toHaveLength(1)
    expect(email.sent[0]?.to).toBe('ana@example.test')
    expect(String(email.sent[0]?.text)).toContain('Camilo Restrepo, de Allfit Gym')
  })

  // A message about her own record reads as a change already made unless it says otherwise.
  test('says nothing changes unless she accepts, and that silence changes nothing', async () => {
    const { run, email } = deliver()
    await run()

    const text = String(email.sent[0]?.text)
    expect(text).toContain('Nada cambia a menos que lo aceptes')
    expect(text).toContain('Si no respondes, la propuesta vence y todo queda como lo registraste')
  })

  test('names the deadline as a day in words, the day it is in Colombia', async () => {
    const { run, email } = deliver()
    await run()

    expect(String(email.sent[0]?.text)).toContain('5 de diciembre de 2026')
    expect(String(email.sent[0]?.html)).toContain('5 de diciembre de 2026')
    expect(String(email.sent[0]?.text)).not.toContain('6 de diciembre')
  })

  // What she declared and what he proposes are seen in the app, where she is herself.
  test('never carries a value, even one that reached the payload', async () => {
    const { run, email } = deliver({ ...NOTICE, proposed_value: 62.5, current_value: 60 })
    await run()

    for (const part of ['subject', 'text', 'html']) {
      expect(String(email.sent[0]?.[part])).not.toContain('62.5')
      expect(String(email.sent[0]?.[part])).not.toContain('62,5')
    }
  })

  test('carries nothing to click', async () => {
    const { run, email } = deliver()
    await run()

    expect(String(email.sent[0]?.html)).not.toContain('<a href')
  })

  test('the same event tells her once however often it arrives', async () => {
    const { run, email } = deliver()
    await run()

    expect(email.sent[0]?.idempotencyKey).toBe(
      'correction-proposal/01991600-7000-7000-8000-0000000000e3',
    )
  })

  test('a payload it cannot read is not retried', async () => {
    for (const payload of [
      { ...NOTICE, contact: '' },
      { ...NOTICE, proposer_name: '  ' },
      { ...NOTICE, expires_at: 'in thirty days' },
      null,
    ]) {
      const { run, email, nacked } = deliver(payload)

      const result = await run()

      expect(result.deadOrDelayed).toBe(1)
      expect(email.sent).toHaveLength(0)
      expect(nacked[0]).toMatchObject({ reason: 'invalid_delivery_projection', retryable: false })
    }
  })

  test('a delivery failure the provider says is temporary is retried', async () => {
    const { queue, nacked } = queueWith([message()])
    const run = createCorrectionProposalBatchProcessor({
      queue,
      email: {
        send: async () => {
          throw new NotificationDeliveryError('provider_unavailable', true)
        },
      } as never,
      brandAssetUrl: BRAND,
    })

    const result = await run()

    expect(result.deadOrDelayed).toBe(1)
    expect(nacked[0]).toMatchObject({ reason: 'provider_unavailable', retryable: true })
  })

  test('delivery turned off claims nothing at all', async () => {
    const { queue, claimed, acked, nacked } = queueWith([message()])
    const email = emailSpy()
    const result = await createCorrectionProposalBatchProcessor({
      queue,
      email: email.sender as never,
      brandAssetUrl: BRAND,
      deliveryEnabled: false,
    })()

    expect(result).toEqual({ claimed: 0, delivered: 0, deadOrDelayed: 0, skipped: 0 })
    expect(claimed).toHaveLength(0)
    expect(email.sent).toHaveLength(0)
    expect(acked).toHaveLength(0)
    expect(nacked).toHaveLength(0)
  })
})
