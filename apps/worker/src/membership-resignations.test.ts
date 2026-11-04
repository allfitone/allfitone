import { describe, expect, test } from 'bun:test'

import { NotificationDeliveryError } from '@allfitone/notifications'
import type { Queue, QueueMessage } from '@allfitone/queue'

import { createResignationBatchProcessor } from './membership-resignations.js'

const BRAND = 'https://studio.example.test/email/lockup.png'
const NOTICE = {
  organization_id: '019d1500-0000-7000-8000-000000000101',
  membership_id: '019d1500-0000-7000-8000-000000000203',
  person_id: '019d1500-0000-7000-8000-000000000003',
  recipient_person_id: '019d1500-0000-7000-8000-000000000001',
  contact: 'owner@example.test',
  organization_name: 'Allfit Gym',
  member_name: 'Cora Coach',
  ended_at: '2026-11-02T20:00:00.000Z',
}

function queueWith(messages: QueueMessage[]) {
  const claimed: string[] = []
  const acked: string[] = []
  const nacked: Array<{ id: string; reason: string; retryable: boolean }> = []
  const queue = {
    claim: async (topic: string) => {
      claimed.push(topic)
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
    id: '019d1500-0000-7000-8000-0000000000e1',
    topic: 'organization.membership_resigned.v1',
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

describe('telling the administration that somebody resigned', () => {
  test('T-WRK-RES-01 sends the notice to the administrator the row names', async () => {
    const { queue, claimed, acked } = queueWith([message()])
    const email = emailSpy()
    const result = await createResignationBatchProcessor({
      queue,
      email: email.sender as never,
      brandAssetUrl: BRAND,
    })()

    expect(claimed).toEqual(['organization.membership_resigned.v1'])
    expect(result).toMatchObject({ claimed: 1, delivered: 1 })
    expect(acked).toEqual(['019d1500-0000-7000-8000-0000000000e1'])
    expect(email.sent[0]?.to).toBe('owner@example.test')
  })

  // The administrator has work to do: whoever the member attended now has nobody.
  test('T-WRK-RES-02 the notice says who left and that their clients need a professional', async () => {
    const { queue } = queueWith([message()])
    const email = emailSpy()
    await createResignationBatchProcessor({
      queue,
      email: email.sender as never,
      brandAssetUrl: BRAND,
    })()

    expect(String(email.sent[0]?.subject)).toBe('Cora Coach dejó Allfit Gym')
    expect(String(email.sent[0]?.text)).toContain('no tienen profesional asignado')
    expect(String(email.sent[0]?.html)).not.toContain('<a href')
  })

  test('T-WRK-RES-03 names are escaped in the html', async () => {
    const { queue } = queueWith([message({ ...NOTICE, member_name: '<b>Cora</b>' })])
    const email = emailSpy()
    await createResignationBatchProcessor({
      queue,
      email: email.sender as never,
      brandAssetUrl: BRAND,
    })()

    expect(String(email.sent[0]?.html)).not.toContain('<b>Cora</b>')
    expect(String(email.sent[0]?.html)).toContain('&lt;b&gt;Cora&lt;/b&gt;')
  })

  // At-least-once delivery must not become two emails about the same departure.
  test('T-WRK-RES-04 the same event sends one email however often it arrives', async () => {
    const { queue } = queueWith([message()])
    const email = emailSpy()
    await createResignationBatchProcessor({
      queue,
      email: email.sender as never,
      brandAssetUrl: BRAND,
    })()

    expect(email.sent[0]?.idempotencyKey).toBe(
      'membership-resignation/019d1500-0000-7000-8000-0000000000e1',
    )
  })

  test('T-WRK-RES-05 a payload it cannot read is not retried', async () => {
    const { queue, nacked } = queueWith([message({ ...NOTICE, contact: '' })])
    const email = emailSpy()
    const result = await createResignationBatchProcessor({
      queue,
      email: email.sender as never,
      brandAssetUrl: BRAND,
    })()

    expect(result.deadOrDelayed).toBe(1)
    expect(email.sent).toHaveLength(0)
    expect(nacked[0]).toMatchObject({ reason: 'invalid_delivery_projection', retryable: false })
  })

  test('T-WRK-RES-06 a temporary provider failure is retried, an unexpected one too', async () => {
    for (const [failure, reason] of [
      [new NotificationDeliveryError('provider_unavailable', true), 'provider_unavailable'],
      [new Error('boom'), 'worker_error'],
    ] as const) {
      const { queue, nacked } = queueWith([message()])
      const result = await createResignationBatchProcessor({
        queue,
        email: {
          send: async () => {
            throw failure
          },
        } as never,
        brandAssetUrl: BRAND,
      })()

      expect(result.deadOrDelayed).toBe(1)
      expect(nacked[0]).toMatchObject({ reason, retryable: true })
    }
  })

  test('T-WRK-RES-07 delivery turned off claims nothing at all', async () => {
    const { queue, claimed } = queueWith([message()])
    const email = emailSpy()
    const result = await createResignationBatchProcessor({
      queue,
      email: email.sender as never,
      brandAssetUrl: BRAND,
      deliveryEnabled: false,
    })()

    expect(result).toEqual({ claimed: 0, delivered: 0, deadOrDelayed: 0, skipped: 0 })
    expect(claimed).toHaveLength(0)
    expect(email.sent).toHaveLength(0)
  })
})
