/**
 * «Eres Founding Member» (`OP-WL-007`, HU-SP-118, ADR-050 decision 5).
 *
 * `waitlist.founding_number_assigned.v1` is enqueued in the transaction that gives a
 * sign-up one of the hundred numbers: when it confirms among the first hundred, or when
 * it inherits the number of somebody who left. Its payload is the number alone.
 *
 * **The database decides whether the email is still true.** A person who left, or whose
 * number was taken back before this ran, comes back `skipped` and is acknowledged
 * without an email.
 *
 * **No token is written for it.** The email carries the sign-up's newest private link,
 * derived again from the row's identifier with the versioned key, as every other
 * waitlist email does (`waitlist-emails.ts`).
 *
 * It rides the waitlist's own delivery switch: the pages its links open are the same.
 */

import {
  NotificationDeliveryError,
  createWaitlistToken,
  invitationTokenKey,
  renderWaitlistFoundingEmail,
  type EmailLanguage,
  type EmailSender,
} from '@allfitone/notifications'
import type { Queue, QueueMessage } from '@allfitone/queue'
import type postgres from 'postgres'

import { mapWithConcurrency, trustedPublicBaseUrl } from './invitations.js'
import { waitlistRecipient, type WaitlistEmailBatchResult } from './waitlist-emails.js'

export const WAITLIST_FOUNDING_EVENT = 'waitlist.founding_number_assigned.v1'

export interface WaitlistFoundingEmailDelivery {
  state: 'ready' | 'skipped'
  name?: string
  email?: string
  language?: EmailLanguage
  referralCode?: string
  referrals?: number
  foundingNumber?: number
  privateTokenId?: string
  tokenKeyVersion?: number
}

export interface WaitlistFoundingEmailDatabase {
  prepare(eventId: string): Promise<WaitlistFoundingEmailDelivery>
}

export function createWaitlistFoundingEmailDatabase(
  sql: postgres.Sql,
): WaitlistFoundingEmailDatabase {
  return {
    async prepare(eventId) {
      return sql.begin(async (transaction) => {
        await transaction`select set_config('app.actor_kind', 'worker', true)`
        const [row] = await transaction<
          Array<{
            delivery_state: WaitlistFoundingEmailDelivery['state']
            recipient_name: string | null
            recipient_email: string | null
            language: EmailLanguage | null
            referral_code: string | null
            referrals: number | null
            founding_number: number | null
            private_token_id: string | null
            token_key_version: number | null
          }>
        >`select * from waitlist.prepare_founding_email(${eventId}::uuid)`
        if (!row) throw new Error('PostgreSQL did not prepare the Founding Member email')
        return {
          state: row.delivery_state,
          ...(row.recipient_name ? { name: row.recipient_name } : {}),
          ...(row.recipient_email ? { email: row.recipient_email } : {}),
          ...(row.language ? { language: row.language } : {}),
          ...(row.referral_code ? { referralCode: row.referral_code } : {}),
          ...(row.referrals === null ? {} : { referrals: row.referrals }),
          ...(row.founding_number === null ? {} : { foundingNumber: row.founding_number }),
          ...(row.private_token_id ? { privateTokenId: row.private_token_id } : {}),
          ...(row.token_key_version ? { tokenKeyVersion: row.token_key_version } : {}),
        }
      })
    },
  }
}

export function createWaitlistFoundingEmailBatchProcessor(dependencies: {
  queue: Queue
  database: WaitlistFoundingEmailDatabase
  email: EmailSender
  /** Where space-web is served: the waitlist pages live there. */
  publicBaseUrl: string
  brandAssetUrl: string
  environment?: NodeJS.ProcessEnv
  deliveryEnabled?: boolean
}) {
  const environment = dependencies.environment ?? process.env
  const baseUrl = trustedPublicBaseUrl(dependencies.publicBaseUrl, environment)

  return async function processWaitlistFoundingEmailBatch(): Promise<WaitlistEmailBatchResult> {
    if (dependencies.deliveryEnabled === false) {
      return { claimed: 0, delivered: 0, deadOrDelayed: 0, skipped: 0 }
    }
    const messages = await dependencies.queue.claim(WAITLIST_FOUNDING_EVENT, 25)
    const results = await mapWithConcurrency(messages, 5, deliver)
    return {
      claimed: messages.length,
      delivered: results.filter((outcome) => outcome === 'delivered').length,
      deadOrDelayed: results.filter((outcome) => outcome === 'failed').length,
      skipped: results.filter((outcome) => outcome === 'skipped').length,
    }
  }

  async function deliver(message: QueueMessage): Promise<'delivered' | 'failed' | 'skipped'> {
    try {
      const delivery = await dependencies.database.prepare(message.id)
      if (delivery.state !== 'ready') {
        await dependencies.queue.ack(message.id)
        return 'skipped'
      }
      const { name, email, language, referralCode, foundingNumber } = delivery
      const { referrals, privateTokenId, tokenKeyVersion } = delivery
      if (
        !name ||
        !email ||
        !language ||
        !referralCode ||
        referrals === undefined ||
        !privateTokenId ||
        !tokenKeyVersion ||
        foundingNumber === undefined ||
        !Number.isInteger(foundingNumber) ||
        foundingNumber < 1 ||
        foundingNumber > 100
      ) {
        await dependencies.queue.nack(message.id, 'invalid_delivery_projection', false)
        return 'failed'
      }

      const key = invitationTokenKey(tokenKeyVersion, environment)
      const rendered = renderWaitlistFoundingEmail({
        ...waitlistRecipient({
          baseUrl,
          brandAssetUrl: dependencies.brandAssetUrl,
          language,
          name,
          referralCode,
          referrals,
          privateToken: createWaitlistToken(privateTokenId, key),
        }),
        foundingNumber,
      })

      await dependencies.email.send({
        to: email,
        ...rendered,
        idempotencyKey: `waitlist-founding-email/${message.id}`,
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
