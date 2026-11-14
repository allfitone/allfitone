import { expect, test } from 'bun:test'
import {
  NotificationDeliveryError,
  type TeamChannel,
  type TeamNotice,
} from '@allfitone/notifications'
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

function channel(posted: TeamNotice[]): TeamChannel {
  return {
    post: async (notice) => {
      posted.push(notice)
    },
  }
}

test('T-WRK-WL-07 a confirmed sign-up is told to the team in one notice that names nobody', async () => {
  const acknowledged: string[] = []
  const posted: TeamNotice[] = []

  await expect(
    createWaitlistTeamNoticeBatchProcessor({
      queue: queue([CONFIRMED], acknowledged),
      channel: channel(posted),
    })(),
  ).resolves.toEqual({ claimed: 1, delivered: 1, deadOrDelayed: 0, skipped: 0 })

  expect(posted).toEqual([
    {
      summary: 'Nueva persona en la lista de espera de Allfit Space · 41 confirmadas',
      title: 'Nueva persona en la lista de espera',
      origin: 'Allfit Space · Confirmó su correo',
      facts: [
        { label: 'Canal', value: 'instagram' },
        { label: 'Idioma', value: 'Español' },
        { label: 'Cómo llegó', value: 'Invitada por alguien' },
        { label: 'Confirmadas en la lista', value: '41' },
      ],
    },
  ])
  expect(acknowledged).toEqual(['event-1'])
})

test('T-WRK-WL-08 the notice reads each fact as the team says it', async () => {
  const posted: TeamNotice[] = []

  await createWaitlistTeamNoticeBatchProcessor({
    queue: queue([
      { utm_source: null, language: 'en', referred: false, confirmed_total: 1 },
      { ...CONFIRMED, utm_source: ' tiktok\nCanal: falso\u0000 ', confirmed_total: 1240 },
    ]),
    channel: channel(posted),
  })()

  // No channel reads as direct, and one person is not «confirmadas».
  expect(posted[0]?.summary).toBe(
    'Nueva persona en la lista de espera de Allfit Space · 1 confirmada',
  )
  expect(posted[0]?.facts).toEqual([
    { label: 'Canal', value: 'Directo' },
    { label: 'Idioma', value: 'Inglés' },
    { label: 'Cómo llegó', value: 'Por su cuenta' },
    { label: 'Confirmadas en la lista', value: '1' },
  ])
  // A channel from a link stays on one line, and thousands are grouped as in Colombia.
  expect(posted[1]?.facts[0]).toEqual({ label: 'Canal', value: 'tiktok Canal: falso' })
  expect(posted[1]?.facts[3]).toEqual({ label: 'Confirmadas en la lista', value: '1.240' })
  expect(posted[1]?.summary).toBe(
    'Nueva persona en la lista de espera de Allfit Space · 1.240 confirmadas',
  )
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
  const posted: TeamNotice[] = []

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
