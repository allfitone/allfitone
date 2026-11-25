import { describe, expect, test } from 'bun:test'
import {
  NotificationDeliveryError,
  type PushMessage,
  type PushOutcome,
  type PushSender,
} from '@allfitone/notifications'

import {
  createPushDeliveryProcessor,
  type ClaimedPush,
  type PushDeliveryDatabase,
  type PushSettlement,
} from './push-deliveries.js'

function claimed(overrides: Partial<ClaimedPush> = {}): ClaimedPush {
  return {
    deliveryId: '019b9000-0000-7000-8000-000000000e01',
    notificationId: '019b9000-0000-7000-8000-000000000c01',
    pushToken: 'ExponentPushToken[ana]',
    kind: 'client_invitation',
    organizationName: 'Bodytech Chicó',
    locale: null,
    ...overrides,
  }
}

/** A database that hands out each push once, as the lease in PostgreSQL does. */
function databaseWith(due: ClaimedPush[]) {
  const settled: Array<[string, PushSettlement, string | null, string]> = []
  let claims = 0
  let purges = 0
  let pending = [...due]
  const database: PushDeliveryDatabase = {
    claim: async () => {
      claims += 1
      const taken = pending
      pending = []
      return taken
    },
    settle: async (push, outcome, code) => {
      settled.push([push.deliveryId, outcome, code, push.pushToken])
    },
    purge: async () => {
      purges += 1
      return 2
    },
  }
  return {
    database,
    settled,
    claims: () => claims,
    purges: () => purges,
  }
}

function senderAnswering(answer: (messages: readonly PushMessage[]) => PushOutcome[]) {
  const sent: PushMessage[] = []
  const push: PushSender = {
    send: async (messages) => {
      sent.push(...messages)
      return answer(messages)
    },
  }
  return { push, sent }
}

const accepted = (messages: readonly PushMessage[]): PushOutcome[] =>
  messages.map(() => ({ kind: 'accepted' }))

describe('pushing each notice to her phones (ADR-054 scenario 7)', () => {
  test('T-WRK-PUSH-01 while the job is off nothing is claimed or sent, and old rows are still purged', async () => {
    const db = databaseWith([claimed()])
    const sender = senderAnswering(accepted)

    const result = await createPushDeliveryProcessor({
      database: db.database,
      push: sender.push,
      enabled: false,
    })()

    expect(result).toEqual({
      claimed: 0,
      delivered: 0,
      deadOrDelayed: 0,
      unregistered: 0,
      purged: 2,
    })
    expect(db.claims()).toBe(0)
    expect(sender.sent).toEqual([])
    expect(db.purges()).toBe(1)
  })

  test('T-WRK-PUSH-02 each claimed push is sent once to its phone and settled as sent', async () => {
    const db = databaseWith([
      claimed(),
      claimed({
        deliveryId: '019b9000-0000-7000-8000-000000000e02',
        pushToken: 'ExponentPushToken[ana-2]',
      }),
    ])
    const sender = senderAnswering(accepted)
    const run = createPushDeliveryProcessor({
      database: db.database,
      push: sender.push,
      enabled: true,
    })

    const first = await run()
    const second = await run()

    expect(first).toMatchObject({ claimed: 2, delivered: 2, deadOrDelayed: 0 })
    expect(second).toMatchObject({ claimed: 0, delivered: 0 })
    expect(sender.sent.map((message) => message.token)).toEqual([
      'ExponentPushToken[ana]',
      'ExponentPushToken[ana-2]',
    ])
    expect(db.settled.map(([id, outcome]) => [id, outcome])).toEqual([
      ['019b9000-0000-7000-8000-000000000e01', 'sent'],
      ['019b9000-0000-7000-8000-000000000e02', 'sent'],
    ])
  })

  test('T-WRK-PUSH-03 a push says what happened in her language and carries no personal data', async () => {
    const db = databaseWith([
      claimed(),
      claimed({
        deliveryId: '019b9000-0000-7000-8000-000000000e03',
        kind: 'password_changed',
        organizationName: null,
        locale: 'en',
      }),
    ])
    const sender = senderAnswering(accepted)

    await createPushDeliveryProcessor({ database: db.database, push: sender.push, enabled: true })()

    expect(sender.sent).toEqual([
      {
        token: 'ExponentPushToken[ana]',
        title: 'Bodytech Chicó te invita',
        body: 'Ábrela para ver qué te proponen.',
        data: { notice_id: '019b9000-0000-7000-8000-000000000c01', kind: 'client_invitation' },
      },
      {
        token: 'ExponentPushToken[ana]',
        title: 'Your password changed',
        body: 'If it was not you, open it now.',
        data: { notice_id: '019b9000-0000-7000-8000-000000000c01', kind: 'password_changed' },
      },
    ])
  })

  test('T-WRK-PUSH-04 a token Expo reports unregistered is settled so its phone is retired', async () => {
    const db = databaseWith([claimed()])
    const sender = senderAnswering(() => [{ kind: 'unregistered' }])

    const result = await createPushDeliveryProcessor({
      database: db.database,
      push: sender.push,
      enabled: true,
    })()

    expect(result).toMatchObject({ claimed: 1, delivered: 0, unregistered: 1, deadOrDelayed: 1 })
    // The token travels with it: the database retires the phone only while it still holds it.
    expect(db.settled).toEqual([
      [
        '019b9000-0000-7000-8000-000000000e01',
        'unregistered',
        'DeviceNotRegistered',
        'ExponentPushToken[ana]',
      ],
    ])
  })

  test('T-WRK-PUSH-05 a push Expo refuses fails with its reason', async () => {
    const db = databaseWith([claimed()])
    const sender = senderAnswering(() => [{ kind: 'rejected', reason: 'MessageTooBig' }])

    await createPushDeliveryProcessor({ database: db.database, push: sender.push, enabled: true })()

    expect(db.settled.map(([, outcome, code]) => [outcome, code])).toEqual([
      ['failed', 'MessageTooBig'],
    ])
  })

  test('T-WRK-PUSH-06 Expo down leaves every push of the request waiting; a request refused for good fails them', async () => {
    const down = databaseWith([claimed()])
    await createPushDeliveryProcessor({
      database: down.database,
      push: {
        send: async () => {
          throw new NotificationDeliveryError('provider_unavailable', true)
        },
      },
      enabled: true,
    })()
    const refused = databaseWith([claimed()])
    await createPushDeliveryProcessor({
      database: refused.database,
      push: {
        send: async () => {
          throw new NotificationDeliveryError('provider_rejected', false)
        },
      },
      enabled: true,
    })()

    expect(down.settled.map(([, outcome, code]) => [outcome, code])).toEqual([
      ['retry', 'provider_unavailable'],
    ])
    expect(refused.settled.map(([, outcome, code]) => [outcome, code])).toEqual([
      ['failed', 'provider_rejected'],
    ])
  })

  test('T-WRK-PUSH-07 a kind this worker cannot word is never sent blank', async () => {
    const db = databaseWith([claimed({ kind: 'weight_logged' })])
    const sender = senderAnswering(accepted)

    await createPushDeliveryProcessor({ database: db.database, push: sender.push, enabled: true })()

    expect(sender.sent).toEqual([])
    expect(db.settled.map(([, outcome, code]) => [outcome, code])).toEqual([
      ['failed', 'unknown_notice_kind'],
    ])
  })

  test('T-WRK-PUSH-08 security goes like any other push: nothing in the job can hold it back', async () => {
    const db = databaseWith([claimed({ kind: 'email_changed', organizationName: null })])
    const sender = senderAnswering(accepted)

    const result = await createPushDeliveryProcessor({
      database: db.database,
      push: sender.push,
      enabled: true,
    })()

    expect(result).toMatchObject({ delivered: 1 })
    expect(sender.sent[0]?.title).toBe('Tu correo cambió')
  })
})
