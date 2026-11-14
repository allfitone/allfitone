import { expect, test } from 'bun:test'
import {
  NotificationDeliveryError,
  type TeamChannel,
  type TeamNotice,
} from '@allfitone/notifications'
import type { Queue } from '@allfitone/queue'

import {
  createWaitlistTeamNoticeBatchProcessor,
  type WaitlistTeamNoticeDelivery,
} from './waitlist-team-notices.js'

function confirmed(
  overrides: Partial<WaitlistTeamNoticeDelivery> = {},
): WaitlistTeamNoticeDelivery {
  return {
    state: 'ready',
    name: 'Ana Ruiz',
    email: 'ana.ruiz@gmail.com',
    source: 'instagram',
    language: 'es',
    referred: true,
    confirmedTotal: 41,
    ...overrides,
  }
}

function without(
  field: Exclude<keyof WaitlistTeamNoticeDelivery, 'state'>,
): WaitlistTeamNoticeDelivery {
  const delivery = confirmed()
  delete delivery[field]
  return delivery
}

/** One claimed event per delivery; the database answers each event with its own. */
function processor(
  deliveries: WaitlistTeamNoticeDelivery[],
  options: {
    acknowledged?: string[]
    rejected?: Array<[string, string, boolean]>
    claims?: string[]
    posted?: TeamNotice[]
    channel?: TeamChannel | null
  } = {},
) {
  const queue: Queue = {
    claim: async (topic) => {
      options.claims?.push(topic)
      return topic === 'waitlist.signup_confirmed.v1'
        ? deliveries.map((_, index) => ({
            id: `event-${index + 1}`,
            topic,
            payload: { confirmed_total: 41 },
            attempt: 1,
          }))
        : []
    },
    ack: async (id) => {
      options.acknowledged?.push(id)
    },
    nack: async (id, code, retryable) => {
      options.rejected?.push([id, code, retryable])
    },
  }
  const channel: TeamChannel = options.channel ?? {
    post: async (notice) => {
      options.posted?.push(notice)
    },
  }
  return createWaitlistTeamNoticeBatchProcessor({
    queue,
    database: {
      prepare: async (eventId) => {
        const delivery = deliveries[Number(eventId.replace('event-', '')) - 1]
        if (!delivery) throw new Error(`no delivery for ${eventId}`)
        return delivery
      },
    },
    ...(options.channel === null ? {} : { channel }),
  })
}

test('T-WRK-WL-07 a confirmed sign-up is told to the team in one notice, by name', async () => {
  const acknowledged: string[] = []
  const posted: TeamNotice[] = []

  await expect(processor([confirmed()], { acknowledged, posted })()).resolves.toEqual({
    claimed: 1,
    delivered: 1,
    deadOrDelayed: 0,
    skipped: 0,
  })

  expect(posted).toEqual([
    {
      summary: 'Ana Ruiz se unió a la lista de espera de Allfit Space · 41 confirmadas',
      title: 'Ana Ruiz se unió a la lista de espera',
      origin: 'Allfit Space · Confirmó su correo',
      facts: [
        { label: 'Correo', value: 'ana.ruiz@gmail.com' },
        { label: 'Canal', value: 'Instagram' },
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
  const direct = {
    ...without('source'),
    name: 'Bruno Díaz',
    email: 'bruno@example.com',
    language: 'en' as const,
    referred: false,
    confirmedTotal: 1,
  }

  await processor(
    [direct, confirmed({ source: ' tiktok\nCanal: falso\u0000 ', confirmedTotal: 1240 })],
    { posted },
  )()

  // No channel reads as direct, and one person is not «confirmadas».
  expect(posted[0]?.summary).toBe(
    'Bruno Díaz se unió a la lista de espera de Allfit Space · 1 confirmada',
  )
  expect(posted[0]?.facts).toEqual([
    { label: 'Correo', value: 'bruno@example.com' },
    { label: 'Canal', value: 'Directo' },
    { label: 'Idioma', value: 'Inglés' },
    { label: 'Cómo llegó', value: 'Por su cuenta' },
    { label: 'Confirmadas en la lista', value: '1' },
  ])
  // A channel from a link stays on one line, and thousands are grouped as in Colombia.
  expect(posted[1]?.facts[1]).toEqual({ label: 'Canal', value: 'Tiktok Canal: falso' })
  expect(posted[1]?.facts[4]).toEqual({ label: 'Confirmadas en la lista', value: '1.240' })
  expect(posted[1]?.summary).toBe(
    'Ana Ruiz se unió a la lista de espera de Allfit Space · 1.240 confirmadas',
  )
})

test('T-WRK-WL-09 a projection without what the notice needs is dead, not retried', async () => {
  const broken = [
    without('name'),
    without('email'),
    without('language'),
    without('referred'),
    without('confirmedTotal'),
    confirmed({ confirmedTotal: 0 }),
    confirmed({ confirmedTotal: 1.5 }),
  ]
  const rejected: Array<[string, string, boolean]> = []
  const posted: TeamNotice[] = []

  await expect(processor(broken, { rejected, posted })()).resolves.toEqual({
    claimed: 7,
    delivered: 0,
    deadOrDelayed: 7,
    skipped: 0,
  })

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
    const channel: TeamChannel = {
      post: async () => {
        throw failure
      },
    }

    await expect(processor([confirmed()], { acknowledged, rejected, channel })()).resolves.toEqual({
      claimed: 1,
      delivered: 0,
      deadOrDelayed: 1,
      skipped: 0,
    })

    expect(acknowledged).toEqual([])
    expect(rejected).toEqual([['event-1', code, retryable]])
  }
})

test('T-WRK-WL-11 without a channel nothing is claimed, so the events wait', async () => {
  const claims: string[] = []

  await expect(processor([confirmed()], { claims, channel: null })()).resolves.toEqual({
    claimed: 0,
    delivered: 0,
    deadOrDelayed: 0,
    skipped: 0,
  })

  expect(claims).toEqual([])
})

test('T-WRK-WL-13 the channel is written the way its name is written', async () => {
  const written: Array<[string, string]> = [
    ['instagram', 'Instagram'],
    ['INSTAGRAM', 'Instagram'],
    [' Instagram ', 'Instagram'],
    ['tiktok', 'TikTok'],
    ['TIKTOK', 'TikTok'],
    ['whatsapp', 'WhatsApp'],
    ['youtube', 'YouTube'],
    ['linkedin', 'LinkedIn'],
    ['facebook', 'Facebook'],
    ['embajador-william', 'Embajador-william'],
    ['ñandú', 'Ñandú'],
    ['x', 'X'],
    // A name every object answers to is still just a channel somebody typed.
    ['constructor', 'Constructor'],
    ['   ', 'Directo'],
  ]
  const posted: TeamNotice[] = []

  await processor(
    written.map(([source]) => confirmed({ source })),
    { posted },
  )()

  expect(posted.map((notice) => notice.facts[1]?.value)).toEqual(written.map(([, name]) => name))
})

test('T-WRK-WL-14 somebody who left before the notice was written is never announced', async () => {
  const acknowledged: string[] = []
  const posted: TeamNotice[] = []

  await expect(
    processor([{ state: 'skipped' }, confirmed()], { acknowledged, posted })(),
  ).resolves.toEqual({ claimed: 2, delivered: 1, deadOrDelayed: 0, skipped: 1 })

  expect(posted).toHaveLength(1)
  expect(acknowledged).toEqual(['event-1', 'event-2'])
})

test('T-WRK-WL-15 a failure never logs who the notice was about', async () => {
  const logged: unknown[][] = []
  const originals = { error: console.error, info: console.info, log: console.log }
  console.error =
    console.info =
    console.log =
      (...parts: unknown[]) => {
        logged.push(parts)
      }
  try {
    const channel: TeamChannel = {
      post: async () => {
        throw new Error('boom')
      },
    }
    await processor([confirmed()], { channel })()
  } finally {
    Object.assign(console, originals)
  }

  expect(JSON.stringify(logged)).not.toContain('Ana Ruiz')
  expect(JSON.stringify(logged)).not.toContain('ana.ruiz@gmail.com')
})
