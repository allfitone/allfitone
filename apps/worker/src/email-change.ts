/**
 * The worker's half of a person changing her email (TECH-44, `OP-IDN-021`, `OP-IDN-022`).
 * This is the `contact-change` consumer `consumers/README.md` described before it existed.
 *
 * **The code** (`identity.contact_changed.v1`). Six random digits, recorded as a hash
 * before the email leaves, so the code in her inbox is always one PostgreSQL can check.
 * A retry draws a new code and sends it under a key of its own: only the last one is
 * valid, and the email that carries it must not be swallowed as a duplicate.
 *
 * **The change** (`identity.contact_verified.v1`). WorkOS first, because it holds the
 * address she signs in with; then the notice to the previous address; then her other
 * sessions; and only then `identity.people`. Every step repeats harmlessly, so a retry
 * after any of them walks the same path again and completes. If WorkOS refuses the
 * address, the request fails and nothing moved on either side.
 *
 * The notice is worth retrying but not worth blocking on: on the last attempt the change
 * completes without it, because a change WorkOS already holds must reach PostgreSQL.
 *
 * Nothing here logs an address or a code.
 */

import { randomInt } from 'node:crypto'

import { AuthError, type EmailChangeIdentity } from '@allfitone/auth-provider'
import {
  NotificationDeliveryError,
  renderEmailChangeCodeEmail,
  renderEmailChangedNoticeEmail,
  type EmailSender,
} from '@allfitone/notifications'
import type { Queue, QueueMessage } from '@allfitone/queue'
import type postgres from 'postgres'

import { mapWithConcurrency } from './invitations.js'

export const EMAIL_CHANGE_CODE_TOPIC = 'identity.contact_changed.v1'
export const EMAIL_CHANGE_APPLY_TOPIC = 'identity.contact_verified.v1'

// The governed queue dead-letters a message on its fifth attempt.
const LAST_ATTEMPT = 5

export interface EmailChangeDelivery {
  state: 'ready' | 'skipped'
  contact?: string
  expiresAt?: string
}

export interface EmailChangeApply {
  state: 'ready' | 'skipped'
  subject?: string
  newEmail?: string
  previousEmail?: string
  keepSession?: string
}

export interface EmailChangeDatabase {
  prepareDelivery(eventId: string): Promise<EmailChangeDelivery>
  recordCode(eventId: string, code: string): Promise<void>
  failDelivery(eventId: string): Promise<void>
  prepareApply(eventId: string): Promise<EmailChangeApply>
  complete(eventId: string): Promise<void>
  failApply(eventId: string): Promise<void>
}

export interface EmailChangeBatchResult {
  claimed: number
  delivered: number
  deadOrDelayed: number
  skipped: number
}

type Outcome = 'delivered' | 'failed' | 'skipped'

export function createEmailChangeDatabase(sql: postgres.Sql): EmailChangeDatabase {
  return {
    prepareDelivery: (eventId) =>
      asWorker(sql, async (transaction) => {
        const [row] = await transaction<
          Array<{
            delivery_state: EmailChangeDelivery['state']
            contact: string | null
            expires_at: Date | null
          }>
        >`select delivery_state, contact, expires_at
          from identity.prepare_email_change_delivery(${eventId}::uuid)`
        if (!row) throw new Error('PostgreSQL did not prepare the email change delivery')
        return {
          state: row.delivery_state,
          ...(row.contact ? { contact: row.contact } : {}),
          ...(row.expires_at ? { expiresAt: row.expires_at.toISOString() } : {}),
        }
      }),
    recordCode: (eventId, code) =>
      asWorker(sql, async (transaction) => {
        await transaction`select identity.record_email_change_code(${eventId}::uuid, ${code})`
      }),
    failDelivery: (eventId) =>
      asWorker(sql, async (transaction) => {
        await transaction`select identity.fail_email_change_delivery(${eventId}::uuid)`
      }),
    prepareApply: (eventId) =>
      asWorker(sql, async (transaction) => {
        const [row] = await transaction<
          Array<{
            apply_state: EmailChangeApply['state']
            subject: string | null
            new_email: string | null
            previous_email: string | null
            keep_session: string | null
          }>
        >`select apply_state, subject, new_email, previous_email, keep_session
          from identity.prepare_email_change_apply(${eventId}::uuid)`
        if (!row) throw new Error('PostgreSQL did not prepare the email change')
        return {
          state: row.apply_state,
          ...(row.subject ? { subject: row.subject } : {}),
          ...(row.new_email ? { newEmail: row.new_email } : {}),
          ...(row.previous_email ? { previousEmail: row.previous_email } : {}),
          ...(row.keep_session ? { keepSession: row.keep_session } : {}),
        }
      }),
    complete: (eventId) =>
      asWorker(sql, async (transaction) => {
        await transaction`select identity.complete_email_change(${eventId}::uuid)`
      }),
    failApply: (eventId) =>
      asWorker(sql, async (transaction) => {
        await transaction`select identity.fail_email_change_apply(${eventId}::uuid)`
      }),
  }
}

/** Six digits, leading zeros included, from the operating system's generator. */
export function sixDigitCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, '0')
}

export function createEmailChangeBatchProcessor(dependencies: {
  queue: Queue
  database: EmailChangeDatabase
  identity: EmailChangeIdentity
  email: EmailSender
  brandAssetUrl: string
  generateCode?: () => string
  deliveryEnabled?: boolean
}) {
  const generateCode = dependencies.generateCode ?? sixDigitCode

  return async function processEmailChangeBatch(): Promise<EmailChangeBatchResult> {
    if (dependencies.deliveryEnabled === false) {
      return { claimed: 0, delivered: 0, deadOrDelayed: 0, skipped: 0 }
    }
    const codes = await dependencies.queue.claim(EMAIL_CHANGE_CODE_TOPIC, 25)
    const changes = await dependencies.queue.claim(EMAIL_CHANGE_APPLY_TOPIC, 25)
    const outcomes = [
      ...(await mapWithConcurrency(codes, 5, sendCode)),
      ...(await mapWithConcurrency(changes, 5, applyChange)),
    ]
    return {
      claimed: codes.length + changes.length,
      delivered: outcomes.filter((outcome) => outcome === 'delivered').length,
      deadOrDelayed: outcomes.filter((outcome) => outcome === 'failed').length,
      skipped: outcomes.filter((outcome) => outcome === 'skipped').length,
    }
  }

  async function sendCode(message: QueueMessage): Promise<Outcome> {
    try {
      const target = await dependencies.database.prepareDelivery(message.id)
      if (target.state === 'skipped') {
        await dependencies.queue.ack(message.id)
        return 'skipped'
      }
      if (!target.contact || !target.expiresAt) {
        await dependencies.queue.nack(message.id, 'invalid_delivery_projection', false)
        return 'failed'
      }

      const code = generateCode()
      await dependencies.database.recordCode(message.id, code)
      const minutes = Math.max(1, Math.round((Date.parse(target.expiresAt) - Date.now()) / 60_000))
      try {
        await dependencies.email.send({
          to: target.contact,
          ...renderEmailChangeCodeEmail({
            code,
            minutes,
            brandAssetUrl: dependencies.brandAssetUrl,
          }),
          idempotencyKey: `email-change-code/${message.id}/${String(message.attempt)}`,
        })
      } catch (error) {
        const { code: reason, retryable } = deliveryFailure(error)
        if (retryable && message.attempt < LAST_ATTEMPT) {
          await dependencies.queue.nack(message.id, reason, true)
          return 'failed'
        }
        await dependencies.database.failDelivery(message.id)
        await dependencies.queue.nack(message.id, reason, false)
        return 'failed'
      }

      await dependencies.queue.ack(message.id)
      return 'delivered'
    } catch {
      await dependencies.queue.nack(message.id, 'worker_error', true)
      return 'failed'
    }
  }

  async function applyChange(message: QueueMessage): Promise<Outcome> {
    try {
      const target = await dependencies.database.prepareApply(message.id)
      if (target.state === 'skipped') {
        await dependencies.queue.ack(message.id)
        return 'skipped'
      }
      const { subject, newEmail, previousEmail, keepSession } = target
      if (!subject || !newEmail || !previousEmail || !keepSession) {
        await dependencies.queue.nack(message.id, 'invalid_delivery_projection', false)
        return 'failed'
      }

      try {
        await dependencies.identity.updateEmail(subject, newEmail)
      } catch (error) {
        const retryable = !(error instanceof AuthError) || error.retryable
        if (retryable && message.attempt < LAST_ATTEMPT) {
          await dependencies.queue.nack(message.id, 'email_change_unavailable', true)
          return 'failed'
        }
        await dependencies.database.failApply(message.id)
        await dependencies.queue.nack(
          message.id,
          retryable ? 'email_change_unavailable' : 'email_change_rejected',
          false,
        )
        return 'failed'
      }

      try {
        await dependencies.email.send({
          to: previousEmail,
          ...renderEmailChangedNoticeEmail({
            newEmailHint: maskEmail(newEmail),
            brandAssetUrl: dependencies.brandAssetUrl,
          }),
          idempotencyKey: `email-changed-notice/${message.id}`,
        })
      } catch (error) {
        const { code: reason, retryable } = deliveryFailure(error)
        if (retryable && message.attempt < LAST_ATTEMPT) {
          await dependencies.queue.nack(message.id, reason, true)
          return 'failed'
        }
      }

      await dependencies.identity.revokeOtherSessions(subject, keepSession)
      await dependencies.database.complete(message.id)
      await dependencies.queue.ack(message.id)
      return 'delivered'
    } catch {
      await dependencies.queue.nack(message.id, 'worker_error', true)
      return 'failed'
    }
  }
}

function deliveryFailure(error: unknown): { code: string; retryable: boolean } {
  if (error instanceof NotificationDeliveryError) {
    return { code: error.code, retryable: error.retryable }
  }
  return { code: 'worker_error', retryable: true }
}

/** «••••••••va@example.test»: enough for her to recognise it, not enough to aim at. */
function maskEmail(address: string): string {
  const [local = '', domain = ''] = address.split('@')
  return `${'•'.repeat(8)}${local.slice(-2)}@${domain}`
}

async function asWorker<T>(
  sql: postgres.Sql,
  operation: (transaction: postgres.TransactionSql) => Promise<T>,
): Promise<T> {
  const result = await sql.begin(async (transaction) => {
    await transaction`select set_config('app.actor_kind', 'worker', true)`
    return { value: await operation(transaction) }
  })
  return result.value
}
