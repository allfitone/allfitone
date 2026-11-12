/**
 * The worker's half of a person changing her password (TECH-325, `OP-IDN-066`, ADR-051).
 *
 * The API already set the new password in WorkOS and recorded the change; this closes
 * every other session of the account, keeping the one the change came from, and then
 * emails a notice to the address she signs in with. The session the API opened to check
 * her current password is one of the others, so it closes here too.
 *
 * **Sessions first.** Closing them is what protects her if the change was not hers; the
 * notice tells her about it. A notice that fails is retried, and closing the sessions
 * again on the retry is harmless. On the last attempt the change is acknowledged without
 * the notice, because the sessions are already closed.
 *
 * Nothing here logs an address. No password ever reaches the worker.
 */

import type { PasswordChangeIdentity } from '@allfitone/auth-provider'
import {
  NotificationDeliveryError,
  renderPasswordChangedNoticeEmail,
  type EmailSender,
} from '@allfitone/notifications'
import type { Queue, QueueMessage } from '@allfitone/queue'
import type postgres from 'postgres'

import { mapWithConcurrency } from './invitations.js'

export const PASSWORD_CHANGED_TOPIC = 'identity.password_changed.v1'

// The governed queue dead-letters a message on its fifth attempt.
const LAST_ATTEMPT = 5

export interface PasswordChangeNotice {
  state: 'ready' | 'skipped'
  subject?: string
  signInEmail?: string
  keepSession?: string
}

export interface PasswordChangeDatabase {
  prepareNotice(eventId: string): Promise<PasswordChangeNotice>
}

export interface PasswordChangeBatchResult {
  claimed: number
  delivered: number
  deadOrDelayed: number
  skipped: number
}

type Outcome = 'delivered' | 'failed' | 'skipped'

export function createPasswordChangeDatabase(sql: postgres.Sql): PasswordChangeDatabase {
  return {
    prepareNotice: (eventId) =>
      asWorker(sql, async (transaction) => {
        const [row] = await transaction<
          Array<{
            notice_state: PasswordChangeNotice['state']
            subject: string | null
            sign_in_email: string | null
            keep_session: string | null
          }>
        >`select notice_state, subject, sign_in_email, keep_session
          from identity.prepare_password_change_notice(${eventId}::uuid)`
        if (!row) throw new Error('PostgreSQL did not prepare the password change notice')
        return {
          state: row.notice_state,
          ...(row.subject ? { subject: row.subject } : {}),
          ...(row.sign_in_email ? { signInEmail: row.sign_in_email } : {}),
          ...(row.keep_session ? { keepSession: row.keep_session } : {}),
        }
      }),
  }
}

export function createPasswordChangeBatchProcessor(dependencies: {
  queue: Queue
  database: PasswordChangeDatabase
  identity: Pick<PasswordChangeIdentity, 'revokeOtherSessions'>
  email: EmailSender
  brandAssetUrl: string
  deliveryEnabled?: boolean
}) {
  return async function processPasswordChangeBatch(): Promise<PasswordChangeBatchResult> {
    if (dependencies.deliveryEnabled === false) {
      return { claimed: 0, delivered: 0, deadOrDelayed: 0, skipped: 0 }
    }
    const changes = await dependencies.queue.claim(PASSWORD_CHANGED_TOPIC, 25)
    const outcomes = await mapWithConcurrency(changes, 5, closeOtherSessions)
    return {
      claimed: changes.length,
      delivered: outcomes.filter((outcome) => outcome === 'delivered').length,
      deadOrDelayed: outcomes.filter((outcome) => outcome === 'failed').length,
      skipped: outcomes.filter((outcome) => outcome === 'skipped').length,
    }
  }

  async function closeOtherSessions(message: QueueMessage): Promise<Outcome> {
    try {
      const target = await dependencies.database.prepareNotice(message.id)
      if (target.state === 'skipped') {
        await dependencies.queue.ack(message.id)
        return 'skipped'
      }
      const { subject, signInEmail, keepSession } = target
      if (!subject || !signInEmail || !keepSession) {
        await dependencies.queue.nack(message.id, 'invalid_delivery_projection', false)
        return 'failed'
      }

      try {
        await dependencies.identity.revokeOtherSessions(subject, keepSession)
      } catch {
        const last = message.attempt >= LAST_ATTEMPT
        await dependencies.queue.nack(
          message.id,
          last ? 'session_revocation_failed' : 'session_revocation_unavailable',
          !last,
        )
        return 'failed'
      }

      try {
        await dependencies.email.send({
          to: signInEmail,
          ...renderPasswordChangedNoticeEmail({ brandAssetUrl: dependencies.brandAssetUrl }),
          idempotencyKey: `password-changed-notice/${message.id}`,
        })
      } catch (error) {
        const { code: reason, retryable } = deliveryFailure(error)
        if (retryable && message.attempt < LAST_ATTEMPT) {
          await dependencies.queue.nack(message.id, reason, true)
          return 'failed'
        }
      }

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
