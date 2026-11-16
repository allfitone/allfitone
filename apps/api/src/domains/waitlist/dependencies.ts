import { createWaitlistService, type WaitlistService } from './application/index.js'
import { createWaitlistReviewService, type WaitlistReviewService } from './application/review.js'
import { createWaitlistDatabase } from './infrastructure/index.js'
import { createWaitlistReviewDatabase } from './infrastructure/review.js'

let cached: WaitlistService | undefined
let cachedReview: WaitlistReviewService | undefined

// The keys are read on each use, so a missing one fails the request that needs it
// rather than every route of the API.
export function waitlistService(): WaitlistService {
  cached ??= createWaitlistService(createWaitlistDatabase())
  return cached
}

export function waitlistReviewService(): WaitlistReviewService {
  cachedReview ??= createWaitlistReviewService(createWaitlistReviewDatabase())
  return cachedReview
}
