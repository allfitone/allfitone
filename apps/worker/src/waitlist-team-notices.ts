/**
 * The team hears that someone confirmed on the Allfit Space waitlist (`OP-WL-002`,
 * ADR-050).
 *
 * `waitlist.signup_confirmed.v1` is enqueued once per sign-up, in the transaction that
 * confirms its address. This posts one notice about it to the team's channel.
 *
 * **The notice names nobody.** The event carries the channel the person arrived through,
 * the language, whether the sign-up counts for somebody who invited it and the list's
 * total. The team's channel belongs to a third party, so no name and no address ever
 * reach it, and this needs nothing from the database to write the notice.
 *
 * **The channel is optional, and never stops the emails.** This rides the same job as
 * every email delivery. Without an address, or with one that is not a Slack webhook,
 * the events wait unclaimed and everything else is delivered as usual.
 *
 * Delivery is at-least-once: an event whose acknowledgement is lost is posted again.
 * A repeated notice in the channel costs less than a missed one.
 */

import {
  NotificationDeliveryError,
  createSlackTeamChannel,
  type TeamChannel,
  type TeamNotice,
} from '@allfitone/notifications'
import type { Queue, QueueMessage } from '@allfitone/queue'

import { mapWithConcurrency } from './invitations.js'

export const WAITLIST_CONFIRMED_EVENT = 'waitlist.signup_confirmed.v1'

export interface WaitlistTeamNoticeBatchResult {
  claimed: number
  delivered: number
  deadOrDelayed: number
  skipped: number
}

interface ConfirmedSignup {
  source: string | null
  language: 'es' | 'en'
  referred: boolean
  confirmedTotal: number
}

const LANGUAGE_NAMES = { es: 'Español', en: 'Inglés' } as const
const WHOLE_NUMBER = new Intl.NumberFormat('es-CO')
// However a link spells them, these read as their own names. Anything else gets a capital.
const CHANNEL_NAMES = new Map(
  Object.entries({
    instagram: 'Instagram',
    facebook: 'Facebook',
    tiktok: 'TikTok',
    whatsapp: 'WhatsApp',
    youtube: 'YouTube',
    linkedin: 'LinkedIn',
    telegram: 'Telegram',
    threads: 'Threads',
    strava: 'Strava',
    google: 'Google',
    twitter: 'Twitter',
    x: 'X',
  }),
)

/** The channel the environment names, or none: a wrong address must not stop the worker. */
export function waitlistTeamChannelFromEnvironment(
  environment: NodeJS.ProcessEnv = process.env,
): TeamChannel | undefined {
  const address = environment.SLACK_WAITLIST_WEBHOOK_URL
  if (!address) return undefined
  try {
    return createSlackTeamChannel(address)
  } catch {
    // The address is a credential: say that it is wrong, never what it is.
    console.error('[worker-outbox] SLACK_WAITLIST_WEBHOOK_URL is not a Slack incoming webhook')
    return undefined
  }
}

export function createWaitlistTeamNoticeBatchProcessor(dependencies: {
  queue: Queue
  channel?: TeamChannel | undefined
}) {
  const { queue, channel } = dependencies

  return async function processWaitlistTeamNoticeBatch(): Promise<WaitlistTeamNoticeBatchResult> {
    if (!channel) return { claimed: 0, delivered: 0, deadOrDelayed: 0, skipped: 0 }
    const messages = await queue.claim(WAITLIST_CONFIRMED_EVENT, 25)
    // One at a time: Slack throttles a webhook that posts faster than about one a second.
    const results = await mapWithConcurrency(messages, 1, (message) => deliver(channel, message))
    return {
      claimed: messages.length,
      delivered: results.filter((outcome) => outcome === 'delivered').length,
      deadOrDelayed: results.filter((outcome) => outcome === 'failed').length,
      skipped: 0,
    }
  }

  async function deliver(
    channel: TeamChannel,
    message: QueueMessage,
  ): Promise<'delivered' | 'failed'> {
    try {
      const confirmed = confirmedSignup(message.payload)
      if (!confirmed) {
        await queue.nack(message.id, 'invalid_delivery_projection', false)
        return 'failed'
      }
      await channel.post(waitlistTeamNotice(confirmed))
      await queue.ack(message.id)
      return 'delivered'
    } catch (error) {
      if (error instanceof NotificationDeliveryError) {
        await queue.nack(message.id, error.code, error.retryable)
      } else {
        await queue.nack(message.id, 'worker_error', true)
      }
      return 'failed'
    }
  }
}

function confirmedSignup(payload: unknown): ConfirmedSignup | undefined {
  if (typeof payload !== 'object' || payload === null) return undefined
  const { utm_source, language, referred, confirmed_total } = payload as Record<string, unknown>
  if (utm_source !== null && typeof utm_source !== 'string') return undefined
  if (language !== 'es' && language !== 'en') return undefined
  if (typeof referred !== 'boolean') return undefined
  if (typeof confirmed_total !== 'number' || !Number.isInteger(confirmed_total)) return undefined
  if (confirmed_total < 1) return undefined
  return { source: utm_source, language, referred, confirmedTotal: confirmed_total }
}

/** The team reads Spanish. The channel name came from a link anybody can write. */
export function waitlistTeamNotice(confirmed: ConfirmedSignup): TeamNotice {
  const source = channelName(confirmed.source)
  const total = WHOLE_NUMBER.format(confirmed.confirmedTotal)
  const counted = confirmed.confirmedTotal === 1 ? 'confirmada' : 'confirmadas'
  return {
    summary: `Nueva persona en la lista de espera de Allfit Space · ${total} ${counted}`,
    title: 'Nueva persona en la lista de espera',
    origin: 'Allfit Space · Confirmó su correo',
    facts: [
      { label: 'Canal', value: source },
      { label: 'Idioma', value: LANGUAGE_NAMES[confirmed.language] },
      { label: 'Cómo llegó', value: confirmed.referred ? 'Invitada por alguien' : 'Por su cuenta' },
      { label: 'Confirmadas en la lista', value: total },
    ],
  }
}

/** «instagram» in a link is Instagram to the reader; no link at all is a direct visit. */
function channelName(source: string | null): string {
  const typed = source?.replace(/[\s\p{Cc}]+/gu, ' ').trim()
  if (!typed) return 'Directo'
  const known = CHANNEL_NAMES.get(typed.toLowerCase())
  if (known) return known
  const [first = '', ...rest] = typed
  return first.toLocaleUpperCase('es') + rest.join('')
}
