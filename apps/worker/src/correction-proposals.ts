/**
 * Telling a person a professional proposes to correct something she recorded
 * (`HU-STUDIO-059` criterion 4, `OP-EXE-012`).
 *
 * Like the substitution question, this reads nothing from the database: who proposes,
 * from where and until when were resolved inside the transaction that created the
 * proposal, and the values were deliberately left out of the event. Reading the proposal
 * here would mean widening a policy written to keep her training out of the worker.
 *
 * The proposal changes nothing until she answers, so a message that never arrives is a
 * proposal that silently expires. That is why an unreadable payload dies loudly instead
 * of being retried forever: the shape is written by a database function, so a deploy
 * fixes it and another attempt does not.
 */

import {
  NotificationDeliveryError,
  renderCorrectionProposedEmail,
  type EmailSender,
} from '@allfitone/notifications'
import type { Queue, QueueMessage } from '@allfitone/queue'

import { mapWithConcurrency } from './invitations.js'

export interface CorrectionProposalBatchResult {
  claimed: number
  delivered: number
  deadOrDelayed: number
  skipped: number
}

interface CorrectionProposalNotice {
  contact: string
  proposerName: string
  organizationName: string
  expiresAt: Date
}

export function createCorrectionProposalBatchProcessor(dependencies: {
  queue: Queue
  email: EmailSender
  brandAssetUrl: string
  deliveryEnabled?: boolean
}): () => Promise<CorrectionProposalBatchResult> {
  return async function processCorrectionProposalBatch(): Promise<CorrectionProposalBatchResult> {
    if (dependencies.deliveryEnabled === false) {
      return { claimed: 0, delivered: 0, deadOrDelayed: 0, skipped: 0 }
    }
    const messages = await dependencies.queue.claim('execution.correction_proposed.v1', 25)
    const results = await mapWithConcurrency(messages, 5, deliver)
    return {
      claimed: messages.length,
      delivered: results.filter((outcome) => outcome === 'delivered').length,
      deadOrDelayed: results.filter((outcome) => outcome === 'failed').length,
      skipped: 0,
    }
  }

  async function deliver(message: QueueMessage): Promise<'delivered' | 'failed'> {
    try {
      const notice = readNotice(message.payload)
      if (!notice) {
        await dependencies.queue.nack(message.id, 'invalid_delivery_projection', false)
        return 'failed'
      }
      const rendered = renderCorrectionProposedEmail({
        organizationName: notice.organizationName,
        proposerName: notice.proposerName,
        expiresAt: notice.expiresAt,
        brandAssetUrl: dependencies.brandAssetUrl,
      })
      await dependencies.email.send({
        to: notice.contact,
        ...rendered,
        // At-least-once delivery must not read as two proposals to answer.
        idempotencyKey: `correction-proposal/${message.id}`,
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

/** Only what the email says is read; anything else in the payload is never rendered. */
function readNotice(payload: unknown): CorrectionProposalNotice | undefined {
  if (typeof payload !== 'object' || payload === null) return undefined
  const text = (field: string) => {
    const value: unknown = Reflect.get(payload, field)
    return typeof value === 'string' && value.trim() !== '' ? value : undefined
  }
  const contact = text('contact')
  const proposerName = text('proposer_name')
  const organizationName = text('organization_name')
  const rawExpiry = text('expires_at')
  const expiresAt = rawExpiry === undefined ? undefined : new Date(rawExpiry)
  if (!contact || !proposerName || !organizationName || !expiresAt) return undefined
  // A deadline that is not an instant would render as `Invalid Date` in the line she acts on.
  if (Number.isNaN(expiresAt.getTime())) return undefined
  return { contact, proposerName, organizationName, expiresAt }
}
