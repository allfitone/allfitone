import { expect, test } from 'bun:test'
import { NotificationDeliveryError, type TeamChannel } from '@allfitone/notifications'
import type { Queue } from '@allfitone/queue'

import {
  createWaitlistTeamNoticeBatchProcessor,
  waitlistTeamChannelFromEnvironment,
} from './waitlist-team-notices.js'

const CONFIRMED = { utm_source: 'instagram', language: 'es', referred: true, confirmed_total: 41 }

function queue(
  payloads: unknown[],
  acknowledged: string[] = [],
  rejected: Array<[string, string, boolean]> = [],
  claims: string[] = [],
): Queue {
  return {
    claim: async (topic) => {
      claims.push(topic)
      return topic === 'waitlist.signup_confirmed.v1'
        ? payloads.map((payload, index) => ({
            id: `event-${index + 1}`,
            topic,
            payload,
            attempt: 1,
          }))
        : []
    },
    ack: async (id) => {
      acknowledged.push(id)
    },
    nack: async (id, code, retryable) => {
      rejected.push([id, code, retryable])
    },
  }
}

function channel(posted: string[]): TeamChannel {
  return {
    post: async (text) => {
      posted.push(text)
    },
  }
}

test('T-WRK-WL-07 a confirmed sign-up is told to the team in one notice that names nobody', async () => {
  const acknowledged: string[] = []
  const posted: string[] = []

  await expect(
    createWaitlistTeamNoticeBatchProcessor({
      queue: queue([CONFIRMED], acknowledged),
      channel: channel(posted),
    })(),
  ).resolves.toEqual({ claimed: 1, delivered: 1, deadOrDelayed: 0, skipped: 0 })

  expect(posted).toEqual([
    'Nueva inscripción confirmada en la lista de espera de Allfit Space\n' +
      'Canal: instagram · Idioma: español · Invitada por alguien: sí · Confirmadas: 41',
  ])
  expect(acknowledged).toEqual(['event-1'])
})

test('T-WRK-WL-08 no channel reads as direct, and a channel from a link is kept on one line', async () => {
  const posted: string[] = []

  await createWaitlistTeamNoticeBatchProcessor({
    queue: queue([
      { utm_source: null, language: 'en', referred: false, confirmed_total: 1 },
      { ...CONFIRMED, utm_source: ' tiktok\nCanal: falso\u0000 ' },
    ]),
    channel: channel(posted),
  })()

  expect(posted).toEqual([
    'Nueva inscripción confirmada en la lista de espera de Allfit Space\n' +
      'Canal: directo · Idioma: inglés · Invitada por alguien: no · Confirmadas: 1',
    'Nueva inscripción confirmada en la lista de espera de Allfit Space\n' +
      'Canal: tiktok Canal: falso · Idioma: español · Invitada por alguien: sí · Confirmadas: 41',
  ])
})

test('T-WRK-WL-09 an event without what the notice needs is dead, not retried', async () => {
  const broken: unknown[] = [
    null,
    {},
    { ...CONFIRMED, language: 'fr' },
    { ...CONFIRMED, referred: 'yes' },
    { ...CONFIRMED, confirmed_total: 0 },
    { ...CONFIRMED, confirmed_total: '41' },
    { ...CONFIRMED, utm_source: 7 },
  ]
  const rejected: Array<[string, string, boolean]> = []
  const posted: string[] = []

  await expect(
    createWaitlistTeamNoticeBatchProcessor({
      queue: queue(broken, [], rejected),
      channel: channel(posted),
    })(),
  ).resolves.toEqual({ claimed: 7, delivered: 0, deadOrDelayed: 7, skipped: 0 })

  expect(posted).toEqual([])
  expect(rejected).toEqual(
    broken.map((_, index) => [`event-${index + 1}`, 'invalid_delivery_projection', false]),
  )
})

test('T-WRK-WL-10 a failure of the channel keeps its own code and retry verdict', async () => {
  const failures: Array<[Error, string, boolean]> = [
    [new NotificationDeliveryError('provider_throttled', true), 'provider_throttled', true],
    [new NotificationDeliveryError('provider_rejected', false), 'provider_rejected', false],
    [new Error('boom'), 'worker_error', true],
  ]
  for (const [failure, code, retryable] of failures) {
    const acknowledged: string[] = []
    const rejected: Array<[string, string, boolean]> = []

    await expect(
      createWaitlistTeamNoticeBatchProcessor({
        queue: queue([CONFIRMED], acknowledged, rejected),
        channel: {
          post: async () => {
            throw failure
          },
        },
      })(),
    ).resolves.toEqual({ claimed: 1, delivered: 0, deadOrDelayed: 1, skipped: 0 })

    expect(acknowledged).toEqual([])
    expect(rejected).toEqual([['event-1', code, retryable]])
  }
})

test('T-WRK-WL-11 without a channel nothing is claimed, so the events wait', async () => {
  const claims: string[] = []

  await expect(
    createWaitlistTeamNoticeBatchProcessor({ queue: queue([CONFIRMED], [], [], claims) })(),
  ).resolves.toEqual({ claimed: 0, delivered: 0, deadOrDelayed: 0, skipped: 0 })

  expect(claims).toEqual([])
})

test('T-WRK-WL-12 the environment gives a channel only for a Slack webhook address', () => {
  const logged: unknown[][] = []
  const original = console.error
  console.error = (...parts: unknown[]) => {
    logged.push(parts)
  }
  try {
    expect(waitlistTeamChannelFromEnvironment({})).toBeUndefined()
    expect(waitlistTeamChannelFromEnvironment({ SLACK_WAITLIST_WEBHOOK_URL: '' })).toBeUndefined()
    expect(logged).toEqual([])

    expect(
      waitlistTeamChannelFromEnvironment({
        SLACK_WAITLIST_WEBHOOK_URL: 'https://example.com/hooks/secret-part',
      }),
    ).toBeUndefined()
    // A wrong address is reported without printing it.
    expect(logged).toHaveLength(1)
    expect(JSON.stringify(logged)).not.toContain('secret-part')

    expect(
      waitlistTeamChannelFromEnvironment({
        SLACK_WAITLIST_WEBHOOK_URL: 'https://hooks.slack.com/services/T000/B000/secret',
      }),
    ).toBeDefined()
  } finally {
    console.error = original
  }
})
