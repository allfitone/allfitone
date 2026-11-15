/**
 * Reviewing the waitlist: `OP-WL-011`, `OP-WL-012` and `OP-WL-016` (`HU-BO-035`).
 *
 * No authorization branch here: the commercial duty and the Backoffice session are
 * resolved inside each call's own transaction. What this layer adds is the page: it
 * asks for one sign-up more than was asked of it, which says whether another page
 * exists without counting the list.
 */

import {
  encodeWaitlistCursor,
  type BackofficeWaitlistFraudMark,
  type BackofficeWaitlistFraudWithdrawal,
  type BackofficeWaitlistTotals,
  type WaitlistReviewCommand,
  type WaitlistReviewDatabase,
  type WaitlistReviewer,
  type WaitlistSignupCommandResult,
  type WaitlistSignupPage,
  type WaitlistSignupQuery,
} from '../domain/review.js'

export interface WaitlistReviewService {
  list(reviewer: WaitlistReviewer, query: WaitlistSignupQuery): Promise<WaitlistSignupPage>
  totals(reviewer: WaitlistReviewer, requestId: string): Promise<BackofficeWaitlistTotals>
  markAsFraud(
    reviewer: WaitlistReviewer,
    input: WaitlistReviewCommand & { signupId: string; mark: BackofficeWaitlistFraudMark },
  ): Promise<WaitlistSignupCommandResult>
  withdrawFraudMark(
    reviewer: WaitlistReviewer,
    input: WaitlistReviewCommand & {
      signupId: string
      withdrawal: BackofficeWaitlistFraudWithdrawal
    },
  ): Promise<WaitlistSignupCommandResult>
}

export function createWaitlistReviewService(
  database: WaitlistReviewDatabase,
): WaitlistReviewService {
  return {
    async list(reviewer, query) {
      const rows = await database.list({ ...reviewer, ...query, limit: query.limit + 1 })
      const items = rows.slice(0, query.limit)
      const last = items.at(-1)
      const hasMore = rows.length > query.limit && last !== undefined
      return hasMore
        ? { items, hasMore, nextCursor: encodeWaitlistCursor(last.id) }
        : { items, hasMore }
    },
    totals: (reviewer, requestId) => database.totals({ ...reviewer, requestId }),
    markAsFraud: (reviewer, input) => database.markAsFraud({ ...reviewer, ...input }),
    withdrawFraudMark: (reviewer, input) => database.withdrawFraudMark({ ...reviewer, ...input }),
  }
}
