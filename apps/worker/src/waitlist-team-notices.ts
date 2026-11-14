/**
 * The team hears that someone confirmed on the Allfit Space waitlist (`OP-WL-002`,
 * ADR-050).
 *
 * `waitlist.signup_confirmed.v1` is enqueued once per sign-up, in the transaction that
 * confirms its address. This posts one notice about it to the founders' private channel.
 *
 * **The notice names the person.** The owner decided in November 2026 that the founders
 * read who joined, so the notice carries the name and the address. The event holds
 * neither: `waitlist.prepare_team_notice` reads them when the notice is written, and
 * answers `skipped` for somebody who left in between, who is then never announced.
 * Nothing here logs a name or an address.
 *
 * **What the channel holds is outside the list's deletion.** A person who leaves is
 * deleted from the database at once, but a notice already posted stays in the channel
 * for as long as the channel's own retention keeps it. That is set in Slack, not here.
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
import type postgres from 'postgres'

import { mapWithConcurrency } from './invitations.js'

export const WAITLIST_CONFIRMED_EVENT = 'waitlist.signup_confirmed.v1'

export interface WaitlistTeamNoticeBatchResult {
  claimed: number
  delivered: number
  deadOrDelayed: number
  skipped: number
}

export interface WaitlistTeamNoticeDelivery {
  state: 'ready' | 'skipped'
  name?: string
  email?: string
  /** The `utm_source` of the link the person arrived through, when it had one. */
  source?: string
  language?: 'es' | 'en'
  referred?: boolean
  confirmedTotal?: number
}

export interface WaitlistTeamNoticeDatabase {
  prepare(eventId: string): Promise<WaitlistTeamNoticeDelivery>
}

interface ConfirmedSignup {
  name: string
  email: string
  source: string | undefined
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

export function createWaitlistTeamNoticeDatabase(sql: postgres.Sql): WaitlistTeamNoticeDatabase {
  return {
    async prepare(eventId) {
      return sql.begin(async (transaction) => {
        await transaction`select set_config('app.actor_kind', 'worker', true)`
        const [row] = await transaction<
          Array<{
            delivery_state: WaitlistTeamNoticeDelivery['state']
            person_name: string | null
            person_email: string | null
            utm_source: string | null
            language: 'es' | 'en' | null
            referred: boolean | null
            confirmed_total: number | null
          }>
        >`select * from waitlist.prepare_team_notice(${eventId}::uuid)`
        if (!row) throw new Error('PostgreSQL did not prepare the waitlist team notice')
        return {
          state: row.delivery_state,
          ...(row.person_name ? { name: row.person_name } : {}),
          ...(row.person_email ? { email: row.person_email } : {}),
          ...(row.utm_source ? { source: row.utm_source } : {}),
          ...(row.language ? { language: row.language } : {}),
          ...(row.referred === null ? {} : { referred: row.referred }),
          ...(row.confirmed_total === null ? {} : { confirmedTotal: row.confirmed_total }),
        }
      })
    },
  }
}

export function createWaitlistTeamNoticeBatchProcessor(dependencies: {
  queue: Queue
  database: WaitlistTeamNoticeDatabase
  channel?: TeamChannel | undefined
}) {
  const { queue, database, channel } = dependencies

  return async function processWaitlistTeamNoticeBatch(): Promise<WaitlistTeamNoticeBatchResult> {
    if (!channel) return { claimed: 0, delivered: 0, deadOrDelayed: 0, skipped: 0 }
    const messages = await queue.claim(WAITLIST_CONFIRMED_EVENT, 25)
    // One at a time: Slack throttles a webhook that posts faster than about one a second.
    const results = await mapWithConcurrency(messages, 1, (message) => deliver(channel, message))
    return {
      claimed: messages.length,
      delivered: results.filter((outcome) => outcome === 'delivered').length,
      deadOrDelayed: results.filter((outcome) => outcome === 'failed').length,
      skipped: results.filter((outcome) => outcome === 'skipped').length,
    }
  }

  async function deliver(
    channel: TeamChannel,
    message: QueueMessage,
  ): Promise<'delivered' | 'failed' | 'skipped'> {
    try {
      const delivery = await database.prepare(message.id)
      if (delivery.state !== 'ready') {
        await queue.ack(message.id)
        return 'skipped'
      }
      const confirmed = confirmedSignup(delivery)
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

function confirmedSignup(delivery: WaitlistTeamNoticeDelivery): ConfirmedSignup | undefined {
  const { name, email, source, language, referred, confirmedTotal } = delivery
  if (!name || !email || !language || referred === undefined) return undefined
  if (confirmedTotal === undefined || !Number.isInteger(confirmedTotal) || confirmedTotal < 1) {
    return undefined
  }
  return { name, email, source, language, referred, confirmedTotal }
}

/** The team reads Spanish. The name is the person's own, as she wrote it when she joined. */
export function waitlistTeamNotice(confirmed: ConfirmedSignup): TeamNotice {
  const total = WHOLE_NUMBER.format(confirmed.confirmedTotal)
  const counted = confirmed.confirmedTotal === 1 ? 'confirmada' : 'confirmadas'
  return {
    summary: `${confirmed.name} se unió a la lista de espera de Allfit Space · ${total} ${counted}`,
    title: `${confirmed.name} se unió a la lista de espera`,
    origin: 'Allfit Space · Confirmó su correo',
    facts: [
      { label: 'Correo', value: confirmed.email },
      { label: 'Canal', value: channelName(confirmed.source) },
      { label: 'Idioma', value: LANGUAGE_NAMES[confirmed.language] },
      { label: 'Cómo llegó', value: confirmed.referred ? 'Invitada por alguien' : 'Por su cuenta' },
      { label: 'Confirmadas en la lista', value: total },
    ],
  }
}

/** «instagram» in a link is Instagram to the reader; no link at all is a direct visit. */
function channelName(source: string | undefined): string {
  const typed = source?.replace(/[\s\p{Cc}]+/gu, ' ').trim()
  if (!typed) return 'Directo'
  const known = CHANNEL_NAMES.get(typed.toLowerCase())
  if (known) return known
  const [first = '', ...rest] = typed
  return first.toLocaleUpperCase('es') + rest.join('')
}
