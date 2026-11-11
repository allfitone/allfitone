import { createWaitlistService, type WaitlistService } from './application/index.js'
import { createWaitlistDatabase } from './infrastructure/index.js'

let cached: WaitlistService | undefined

// The keys are read on each use, so a missing one fails the request that needs it
// rather than every route of the API.
export function waitlistService(): WaitlistService {
  cached ??= createWaitlistService(createWaitlistDatabase())
  return cached
}
