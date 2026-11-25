/**
 * Push to a person's phone: the port, its Expo adapter, and the words of each notice.
 *
 * **The port speaks our language.** A push is a token, a title, one line and the data the
 * app needs to open the notice; each answer is `accepted`, `unregistered` (the phone no
 * longer takes push from this app, so its token must stop being used) or `rejected` with
 * a reason. Nothing of Expo's ticket shape leaves the adapter, so another provider can sit
 * behind the same port.
 *
 * **Expo over HTTPS, with no SDK** (ADR-054). The adapter posts up to 100 messages per
 * request to `https://exp.host/--/api/v2/push/send` and reads one ticket per message, in
 * order, as Expo documents at docs.expo.dev/push-notifications/sending-notifications
 * (checked 25 November 2026): `{ status: 'ok', id }` or `{ status: 'error', message,
 * details: { error } }`, where `DeviceNotRegistered` means the token is dead. A request
 * Expo refuses whole (429, 5xx) is worth another try; any other 4xx is not. The access
 * token is optional: it is only required once the project turns on enhanced security.
 * Receipts, where Apple or Google may report a token dead later, are not read yet.
 *
 * **A push says what happened and nothing about her** (`NT-3`). The words come from the
 * notice's kind in her language, Spanish while she has none, and carry at most the
 * organization's name: never a person's name, a measure, a meal or anything about health.
 */

import { NotificationDeliveryError, type FetchLike } from './index.js'

export type PushLocale = 'es' | 'en'

export type PushNoticeKind =
  | 'client_invitation'
  | 'cover_proposed'
  | 'professional_changed'
  | 'relationship_ended'
  | 'plan_paused'
  | 'plan_resumed'
  | 'plan_ended'
  | 'program_assigned'
  | 'correction_proposed'
  | 'goal_proposed'
  | 'password_changed'
  | 'email_changed'

export interface PushMessage {
  token: string
  title: string
  body: string
  /** What the app needs to open the notice; identifiers only. */
  data: Readonly<Record<string, string>>
}

export type PushOutcome =
  { kind: 'accepted' } | { kind: 'unregistered' } | { kind: 'rejected'; reason: string }

export interface PushSender {
  /** One outcome per message, in order. A request refused whole throws. */
  send(messages: readonly PushMessage[]): Promise<PushOutcome[]>
}

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send'
// Expo takes at most 100 messages per request.
const EXPO_BATCH = 100
const SEND_TIMEOUT_MS = 15_000

export function createExpoPushSender(
  config: { accessToken?: string } = {},
  fetcher: FetchLike = fetch,
): PushSender {
  return {
    async send(messages) {
      const outcomes: PushOutcome[] = []
      for (let start = 0; start < messages.length; start += EXPO_BATCH) {
        outcomes.push(...(await sendBatch(messages.slice(start, start + EXPO_BATCH))))
      }
      return outcomes
    },
  }

  async function sendBatch(batch: readonly PushMessage[]): Promise<PushOutcome[]> {
    let response: Response
    try {
      response = await fetcher(EXPO_PUSH_URL, {
        method: 'POST',
        headers: {
          accept: 'application/json',
          'accept-encoding': 'gzip, deflate',
          'content-type': 'application/json',
          ...(config.accessToken ? { authorization: `Bearer ${config.accessToken}` } : {}),
        },
        body: JSON.stringify(
          batch.map((message) => ({
            to: message.token,
            title: message.title,
            body: message.body,
            data: message.data,
            sound: 'default',
          })),
        ),
        signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
      })
    } catch {
      throw new NotificationDeliveryError('network_error', true)
    }
    if (response.status === 429) throw new NotificationDeliveryError('provider_throttled', true)
    if (response.status >= 500) throw new NotificationDeliveryError('provider_unavailable', true)
    if (!response.ok) throw new NotificationDeliveryError('provider_rejected', false)

    let tickets: unknown
    try {
      tickets = ((await response.json()) as { data?: unknown }).data
    } catch {
      throw new NotificationDeliveryError('provider_unavailable', true)
    }
    // One ticket per message, in order; anything else cannot be matched safely.
    if (!Array.isArray(tickets) || tickets.length !== batch.length) {
      throw new NotificationDeliveryError('provider_unavailable', true)
    }
    return tickets.map(outcomeOf)
  }
}

function outcomeOf(ticket: unknown): PushOutcome {
  if (typeof ticket !== 'object' || ticket === null) {
    return { kind: 'rejected', reason: 'unreadable_ticket' }
  }
  const { status, details } = ticket as { status?: unknown; details?: unknown }
  if (status === 'ok') return { kind: 'accepted' }
  const error =
    typeof details === 'object' && details !== null
      ? (details as { error?: unknown }).error
      : undefined
  if (error === 'DeviceNotRegistered') return { kind: 'unregistered' }
  return { kind: 'rejected', reason: typeof error === 'string' ? error : 'expo_error' }
}

// `lead` opens the sentence and `inner` sits inside it; both fall back to her gym unnamed.
type Words = { title: (lead: string, inner: string) => string; body: string }

const WORDS: Record<PushLocale, Record<PushNoticeKind, Words>> = {
  es: {
    client_invitation: {
      title: (org) => `${org} te invita`,
      body: 'Ábrela para ver qué te proponen.',
    },
    cover_proposed: {
      title: (org) => `${org} te propone una cobertura`,
      body: 'Ábrela para aceptarla o rechazarla.',
    },
    professional_changed: {
      title: (org) => `${org} cambió a tu profesional`,
      body: 'Ábrela para ver quién te acompaña ahora.',
    },
    relationship_ended: {
      title: (org) => `${org} terminó la relación contigo`,
      body: 'Ábrela para ver qué pasa con tus datos.',
    },
    plan_paused: {
      title: (_, org) => `Tu plan con ${org} está en pausa`,
      body: 'Ábrela para ver cómo reanudarlo.',
    },
    plan_resumed: {
      title: (_, org) => `Tu plan con ${org} se reanudó`,
      body: 'Ábrela para ver tu plan.',
    },
    plan_ended: {
      title: (_, org) => `Tu plan con ${org} terminó`,
      body: 'Ábrela para ver los detalles.',
    },
    program_assigned: {
      title: (org) => `${org} te asignó un programa`,
      body: 'Ábrela para verlo.',
    },
    correction_proposed: {
      title: (org) => `${org} te propone una corrección`,
      body: 'Ábrela para aceptarla o rechazarla.',
    },
    goal_proposed: {
      title: (org) => `${org} te propone una meta de nutrición`,
      body: 'Ábrela para revisarla.',
    },
    password_changed: {
      title: () => 'Tu contraseña cambió',
      body: 'Si no fuiste tú, ábrela ahora.',
    },
    email_changed: {
      title: () => 'Tu correo cambió',
      body: 'Si no fuiste tú, ábrela ahora.',
    },
  },
  en: {
    client_invitation: {
      title: (org) => `${org} invited you`,
      body: 'Open it to see what they offer.',
    },
    cover_proposed: {
      title: (org) => `${org} proposes a cover`,
      body: 'Open it to accept or decline it.',
    },
    professional_changed: {
      title: (org) => `${org} changed your professional`,
      body: 'Open it to see who is with you now.',
    },
    relationship_ended: {
      title: (org) => `${org} ended your relationship`,
      body: 'Open it to see what happens to your data.',
    },
    plan_paused: {
      title: (_, org) => `Your plan with ${org} is paused`,
      body: 'Open it to see how to resume it.',
    },
    plan_resumed: {
      title: (_, org) => `Your plan with ${org} resumed`,
      body: 'Open it to see your plan.',
    },
    plan_ended: {
      title: (_, org) => `Your plan with ${org} ended`,
      body: 'Open it to see the details.',
    },
    program_assigned: {
      title: (org) => `${org} assigned you a program`,
      body: 'Open it to see it.',
    },
    correction_proposed: {
      title: (org) => `${org} proposes a correction`,
      body: 'Open it to accept or decline it.',
    },
    goal_proposed: {
      title: (org) => `${org} proposes a nutrition goal`,
      body: 'Open it to review it.',
    },
    password_changed: {
      title: () => 'Your password changed',
      body: 'If it was not you, open it now.',
    },
    email_changed: {
      title: () => 'Your email changed',
      body: 'If it was not you, open it now.',
    },
  },
}

const UNNAMED: Record<PushLocale, { lead: string; inner: string }> = {
  es: { lead: 'Tu gimnasio', inner: 'tu gimnasio' },
  en: { lead: 'Your gym', inner: 'your gym' },
}

export function isPushNoticeKind(value: string): value is PushNoticeKind {
  return value in WORDS.es
}

/** The title and the one line of a notice's push, in her language. */
export function renderPushNotice(notice: {
  kind: PushNoticeKind
  organizationName: string | null
  locale: string | null
}): { title: string; body: string } {
  const locale: PushLocale = notice.locale === 'en' ? 'en' : 'es'
  const words = WORDS[locale][notice.kind]
  const name = notice.organizationName?.trim()
  return {
    title: words.title(name || UNNAMED[locale].lead, name || UNNAMED[locale].inner),
    body: words.body,
  }
}
