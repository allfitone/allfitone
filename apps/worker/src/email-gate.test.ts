import { describe, expect, test } from 'bun:test'
import type postgres from 'postgres'

import { createEmailGate } from './email-gate.js'
import { createPushDeliveryDatabase } from './push-deliveries.js'

interface CapturedQuery {
  text: string
  values: unknown[]
}

function recordingDatabase(captured: CapturedQuery[], answer: () => unknown): postgres.Sql {
  const client = Object.assign(
    (strings: TemplateStringsArray, ...values: unknown[]) => {
      const text = strings.join('$')
      captured.push({ text, values })
      return Promise.resolve(text.includes('set_config') ? [{}] : answer())
    },
    { begin: (operation: (transaction: unknown) => Promise<unknown>) => operation(client) },
  )
  return client as unknown as postgres.Sql
}

const EVENT = '019b9000-0000-7000-8000-000000000a01'

describe('the worker asks the database, as the worker', () => {
  test('T-WRK-GATE-01 the email gate names the worker and the event, and believes only a boolean', async () => {
    const captured: CapturedQuery[] = []
    expect(
      await createEmailGate(recordingDatabase(captured, () => [{ allowed: false }]))(EVENT),
    ).toBe(false)
    expect(captured[0]?.text).toContain("set_config('app.actor_kind', 'worker', true)")
    expect(captured[1]?.text).toContain('identity.email_allowed_for_event(')
    expect(captured[1]?.values).toEqual([EVENT])

    await expect(
      createEmailGate(recordingDatabase([], () => [{ allowed: null }]))(EVENT),
    ).rejects.toThrow('PostgreSQL did not say whether the email may go')
  })

  test('T-WRK-GATE-02 a push is settled with its own token, so a newer one is never retired', async () => {
    const captured: CapturedQuery[] = []
    await createPushDeliveryDatabase(recordingDatabase(captured, () => [])).settle(
      {
        deliveryId: '019b9000-0000-7000-8000-000000000e01',
        notificationId: '019b9000-0000-7000-8000-000000000c01',
        pushToken: 'ExponentPushToken[ana]',
        kind: 'client_invitation',
        organizationName: null,
        locale: null,
      },
      'unregistered',
      'DeviceNotRegistered',
    )
    expect(captured[1]?.text).toContain('system.settle_push_delivery(')
    expect(captured[1]?.values).toEqual([
      '019b9000-0000-7000-8000-000000000e01',
      'unregistered',
      'DeviceNotRegistered',
      'ExponentPushToken[ana]',
    ])
  })
})
