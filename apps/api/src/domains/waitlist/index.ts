/**
 * Public interface of the waitlist domain (ADR-050).
 *
 * The Allfit Space waitlist: people who join before they have an account, and the team
 * that reviews who joined. Nothing outside reaches past this file.
 */

export { backofficeWaitlistRoutes } from './handlers/backoffice.js'
export { spaceWaitlistRoutes } from './handlers/space.js'
export { waitlistReviewService, waitlistService } from './dependencies.js'
export type { WaitlistService } from './application/index.js'
export type { WaitlistReviewService } from './application/review.js'
export type {
  WaitlistConfirmationResult,
  WaitlistEmailRequestResult,
  WaitlistJoinInput,
  WaitlistJoinResult,
  WaitlistLanguage,
  WaitlistVisitor,
} from './domain/index.js'
