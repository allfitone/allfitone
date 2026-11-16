/**
 * A waitlist sign-up is linked to its Allfit Space account (`OP-WL-006`, HU-SP-119,
 * ADR-050 decisions 5 and 7).
 *
 * `identity.person_activated.v1` is enqueued in the transaction that activates a person,
 * which is when she finishes the onboarding. This takes it from there.
 *
 * **The worker is what joins the two domains.** `identity` says who was activated, her
 * verified email and the store of her phone; `waitlist` finds the sign-up with that
 * email, confirms it if it never was, and makes its Founding Member number the person's.
 * Neither domain reads the other's tables, and both calls share one transaction, so a
 * failure between them leaves nothing half done.
 *
 * **Most events link nothing, and that is not a failure.** A person who was never on the
 * list, one activated in Studio without a contact email, and a second account of a
 * mailbox that is already linked are all acknowledged.
 *
 * No switch turns this off: it sends nothing to anybody. Nothing here logs an email.
 *
 * Delivery is at-least-once, and the database answers a repeated link with what the
 * first one did.
 */

import type { Queue, QueueMessage } from '@allfitone/queue'
import type postgres from 'postgres'

import { mapWithConcurrency } from './invitations.js'

export const PERSON_ACTIVATED_EVENT = 'identity.person_activated.v1'

export type WaitlistAccountLinkOutcome =
  'linked' | 'already_linked' | 'no_signup' | 'conflict' | 'skipped'

export interface WaitlistAccountLinkBatchResult {
  claimed: number
  /** Events that linked a sign-up, counting one that was already linked. */
  delivered: number
  deadOrDelayed: number
  skipped: number
}

export interface WaitlistAccountLinkDatabase {
  link(eventId: string): Promise<WaitlistAccountLinkOutcome>
}

const LINK_OUTCOMES: ReadonlySet<string> = new Set([
  'linked',
  'already_linked',
  'no_signup',
  'conflict',
])

export function createWaitlistAccountLinkDatabase(sql: postgres.Sql): WaitlistAccountLinkDatabase {
  return {
    async link(eventId) {
      return sql.begin(async (transaction) => {
        await transaction`select set_config('app.actor_kind', 'worker', true)`
        const [activated] = await transaction<
          Array<{
            link_state: 'ready' | 'skipped'
            person_id: string | null
            verified_email: string | null
            store: string | null
          }>
        >`select * from identity.prepare_account_link(${eventId}::uuid)`
        if (!activated) throw new Error('PostgreSQL did not prepare the account link')
        if (activated.link_state !== 'ready') return 'skipped'
        if (!activated.person_id || !activated.verified_email) {
          throw new Error('PostgreSQL prepared an account link without its person')
        }

        const [link] = await transaction<Array<{ outcome: string }>>`
          select outcome
          from waitlist.link_signup(
            ${activated.person_id}::uuid, ${activated.verified_email}, ${activated.store}
          )
        `
        if (!link || !isLinkOutcome(link.outcome)) {
          throw new Error('PostgreSQL did not answer the account link')
        }
        return link.outcome
      })
    },
  }
}

export function createWaitlistAccountLinkBatchProcessor(dependencies: {
  queue: Queue
  database: WaitlistAccountLinkDatabase
}) {
  const { queue, database } = dependencies

  return async function processWaitlistAccountLinkBatch(): Promise<WaitlistAccountLinkBatchResult> {
    const messages = await queue.claim(PERSON_ACTIVATED_EVENT, 25)
    // One at a time: every link waits on the same lock, the one that hands out numbers.
    const results = await mapWithConcurrency(messages, 1, link)
    return {
      claimed: messages.length,
      delivered: results.filter((outcome) => outcome === 'linked').length,
      deadOrDelayed: results.filter((outcome) => outcome === 'failed').length,
      skipped: results.filter((outcome) => outcome === 'skipped').length,
    }
  }

  async function link(message: QueueMessage): Promise<'linked' | 'failed' | 'skipped'> {
    try {
      const outcome = await database.link(message.id)
      await queue.ack(message.id)
      return outcome === 'linked' || outcome === 'already_linked' ? 'linked' : 'skipped'
    } catch {
      await queue.nack(message.id, 'worker_error', true)
      return 'failed'
    }
  }
}

function isLinkOutcome(value: string): value is WaitlistAccountLinkOutcome {
  return LINK_OUTCOMES.has(value)
}
