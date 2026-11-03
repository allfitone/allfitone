/**
 * Telling an organization's owners and administrators that somebody resigned.
 *
 * `organizations.resign_membership` writes one outbox row per recipient, inside the
 * transaction that ends the membership, with everything the email says already
 * resolved. Like the reassignment notice, this consumer reads nothing from the
 * database: it would otherwise need policies that let the worker read people.
 */

import {
  NotificationDeliveryError,
  renderMembershipResignedEmail,
  type EmailSender,
} from '@allfitone/notifications'
import type { Queue, QueueMessage } from '@allfitone/queue'

import { mapWithConcurrency } from './invitations.js'

export const MEMBERSHIP_RESIGNED_TOPIC = 'organization.membership_resigned.v1'

export interface ResignationBatchResult {
  claimed: number
  delivered: number
  deadOrDelayed: number
  skipped: number
}

interface ResignationNotice {
  contact: string
  organization_name: string
  member_name: string
}

export function createResignationBatchProcessor(dependencies: {
  queue: Queue
  email: EmailSender
  brandAssetUrl: string
  deliveryEnabled?: boolean
}): () => Promise<ResignationBatchResult> {
  return async function processResignationBatch(): Promise<ResignationBatchResult> {
    if (dependencies.deliveryEnabled === false) {
      return { claimed: 0, delivered: 0, deadOrDelayed: 0, skipped: 0 }
    }
    const messages = await dependencies.queue.claim(MEMBERSHIP_RESIGNED_TOPIC, 25)
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
      // The shape is written by a database function; a retry cannot fix it, a deploy can.
      if (!notice) {
        await dependencies.queue.nack(message.id, 'invalid_delivery_projection', false)
        return 'failed'
      }
      const rendered = renderMembershipResignedEmail({
        organizationName: notice.organization_name,
        memberName: notice.member_name,
        brandAssetUrl: dependencies.brandAssetUrl,
      })
      await dependencies.email.send({
        to: notice.contact,
        ...rendered,
        idempotencyKey: `membership-resignation/${message.id}`,
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

function readNotice(payload: unknown): ResignationNotice | undefined {
  if (typeof payload !== 'object' || payload === null) return undefined
  const candidate = payload as Record<string, unknown>
  const { contact, organization_name, member_name } = candidate
  for (const value of [contact, organization_name, member_name]) {
    if (typeof value !== 'string' || value.trim() === '') return undefined
  }
  return {
    contact: contact as string,
    organization_name: organization_name as string,
    member_name: member_name as string,
  }
}
