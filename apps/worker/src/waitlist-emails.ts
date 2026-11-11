/**
 * Delivery of the Allfit Space waitlist emails (`OP-WL-001` to `OP-WL-003`, ADR-050).
 *
 * `waitlist.email_requested.v1` asks for one of two emails: the confirmation, while the
 * address is unconfirmed, or the person's link once it is. The database decides which is
 * still worth sending. A confirmation whose link a newer one voided, or whose address
 * confirmed meanwhile, comes back `skipped` and is acknowledged without an email.
 *
 * **The tokens are written here and nowhere else.** The outbox carries the identifiers of
 * the token rows, never the tokens: this derives each one again with the versioned key,
 * exactly as the API did when it stored its hash.
 *
 * **Four links, on space-web.** The referral link is public and made for sharing. The
 * confirmation link, the «Ver mis referidos» link and the link to leave are bearer
 * credentials, so their token travels in the fragment, which browsers never send to a server and no access
 * log records. The page reads it and posts it.
 */

import {
  NotificationDeliveryError,
  createWaitlistToken,
  invitationTokenKey,
  renderWaitlistConfirmationEmail,
  renderWaitlistLinkEmail,
  type EmailLanguage,
  type EmailSender,
} from '@allfitone/notifications'
import type { Queue, QueueMessage } from '@allfitone/queue'
import type postgres from 'postgres'

import { mapWithConcurrency, trustedPublicBaseUrl } from './invitations.js'

export const WAITLIST_EMAIL_EVENT = 'waitlist.email_requested.v1'

export interface WaitlistEmailDelivery {
  state: 'ready' | 'skipped'
  kind?: 'confirmation' | 'link'
  name?: string
  email?: string
  language?: EmailLanguage
  referralCode?: string
  referrals?: number
  confirmationTokenId?: string
  privateTokenId?: string
  tokenKeyVersion?: number
  confirmationExpiresAt?: Date
}

export interface WaitlistEmailDeliveryDatabase {
  prepare(eventId: string): Promise<WaitlistEmailDelivery>
}

export interface WaitlistEmailBatchResult {
  claimed: number
  delivered: number
  deadOrDelayed: number
  skipped: number
}

export function createWaitlistEmailDeliveryDatabase(
  sql: postgres.Sql,
): WaitlistEmailDeliveryDatabase {
  return {
    async prepare(eventId) {
      return sql.begin(async (transaction) => {
        await transaction`select set_config('app.actor_kind', 'worker', true)`
        const [row] = await transaction<
          Array<{
            delivery_state: WaitlistEmailDelivery['state']
            email_kind: 'confirmation' | 'link' | null
            recipient_name: string | null
            recipient_email: string | null
            language: EmailLanguage | null
            referral_code: string | null
            referrals: number | null
            confirmation_token_id: string | null
            private_token_id: string | null
            token_key_version: number | null
            confirmation_expires_at: Date | null
          }>
        >`select * from waitlist.prepare_email_delivery(${eventId}::uuid)`
        if (!row) throw new Error('PostgreSQL did not prepare the waitlist email delivery')
        return {
          state: row.delivery_state,
          ...(row.email_kind ? { kind: row.email_kind } : {}),
          ...(row.recipient_name ? { name: row.recipient_name } : {}),
          ...(row.recipient_email ? { email: row.recipient_email } : {}),
          ...(row.language ? { language: row.language } : {}),
          ...(row.referral_code ? { referralCode: row.referral_code } : {}),
          ...(row.referrals === null ? {} : { referrals: row.referrals }),
          ...(row.confirmation_token_id ? { confirmationTokenId: row.confirmation_token_id } : {}),
          ...(row.private_token_id ? { privateTokenId: row.private_token_id } : {}),
          ...(row.token_key_version ? { tokenKeyVersion: row.token_key_version } : {}),
          ...(row.confirmation_expires_at
            ? { confirmationExpiresAt: new Date(row.confirmation_expires_at) }
            : {}),
        }
      })
    },
  }
}

export function createWaitlistEmailBatchProcessor(dependencies: {
  queue: Queue
  database: WaitlistEmailDeliveryDatabase
  email: EmailSender
  /** Where space-web is served: the waitlist pages live there. */
  publicBaseUrl: string
  brandAssetUrl: string
  environment?: NodeJS.ProcessEnv
  deliveryEnabled?: boolean
}) {
  const environment = dependencies.environment ?? process.env
  const baseUrl = trustedPublicBaseUrl(dependencies.publicBaseUrl, environment)

  return async function processWaitlistEmailBatch(): Promise<WaitlistEmailBatchResult> {
    if (dependencies.deliveryEnabled === false) {
      return { claimed: 0, delivered: 0, deadOrDelayed: 0, skipped: 0 }
    }
    const messages = await dependencies.queue.claim(WAITLIST_EMAIL_EVENT, 25)
    const results = await mapWithConcurrency(messages, 5, deliver)
    return {
      claimed: messages.length,
      delivered: results.filter((outcome) => outcome === 'delivered').length,
      deadOrDelayed: results.filter((outcome) => outcome === 'failed').length,
      skipped: results.filter((outcome) => outcome === 'skipped').length,
    }
  }

  function page(language: EmailLanguage, path: string, token?: string): string {
    const url = new URL(`${language}/${path}`, baseUrl)
    if (token) url.hash = `token=${encodeURIComponent(token)}`
    return url.toString()
  }

  async function deliver(message: QueueMessage): Promise<'delivered' | 'failed' | 'skipped'> {
    try {
      const delivery = await dependencies.database.prepare(message.id)
      if (delivery.state !== 'ready') {
        await dependencies.queue.ack(message.id)
        return 'skipped'
      }
      const { kind, name, email, language, referralCode, privateTokenId, tokenKeyVersion } =
        delivery
      if (
        !kind ||
        !name ||
        !email ||
        !language ||
        !referralCode ||
        delivery.referrals === undefined ||
        !privateTokenId ||
        !tokenKeyVersion ||
        (kind === 'confirmation' &&
          (!delivery.confirmationTokenId || !delivery.confirmationExpiresAt))
      ) {
        await dependencies.queue.nack(message.id, 'invalid_delivery_projection', false)
        return 'failed'
      }

      const key = invitationTokenKey(tokenKeyVersion, environment)
      const privateToken = createWaitlistToken(privateTokenId, key)
      const referralUrl = new URL(`${language}/waitlist`, baseUrl)
      referralUrl.searchParams.set('ref', referralCode)
      const recipient = {
        language,
        name,
        brandAssetUrl: dependencies.brandAssetUrl,
        code: referralCode,
        referralUrl: referralUrl.toString(),
        referrals: delivery.referrals,
        referralsPageUrl: page(language, 'waitlist/referrals', privateToken),
        leaveUrl: page(language, 'waitlist/leave', privateToken),
      }
      const rendered =
        kind === 'confirmation' && delivery.confirmationTokenId && delivery.confirmationExpiresAt
          ? renderWaitlistConfirmationEmail({
              ...recipient,
              confirmationUrl: page(
                language,
                'waitlist/confirm',
                createWaitlistToken(delivery.confirmationTokenId, key),
              ),
              expiresAt: delivery.confirmationExpiresAt,
            })
          : renderWaitlistLinkEmail(recipient)

      await dependencies.email.send({
        to: email,
        ...rendered,
        idempotencyKey: `waitlist-email/${message.id}`,
      })
      await dependencies.queue.ack(message.id)
      return 'delivered'
    } catch (error) {
      if (error instanceof NotificationDeliveryError) {
        await dependencies.queue.nack(message.id, error.code, error.retryable)
      } else {
        await dependencies.queue.nack(message.id, 'worker_error', true)
      }
      return 'failed'
    }
  }
}
