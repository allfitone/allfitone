/**
 * Public interface of the waitlist domain (ADR-050).
 *
 * The Allfit Space waitlist: people who join before they have an account. Nothing
 * outside reaches past this file.
 */

export { spaceWaitlistRoutes } from './handlers/space.js'
export { waitlistService } from './dependencies.js'
export type { WaitlistService } from './application/index.js'
export type {
  WaitlistConfirmationResult,
  WaitlistEmailRequestResult,
  WaitlistJoinInput,
  WaitlistJoinResult,
  WaitlistLanguage,
  WaitlistVisitor,
} from './domain/index.js'
