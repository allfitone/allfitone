/** Intelligence module composition: its database and the consent text in force. */

import {
  createSpaceIntelligenceService,
  type SpaceIntelligenceService,
} from './application/index.js'
import { CURRENT_CONSENT_VERSION } from './domain/index.js'
import { createIntelligenceDatabase } from './infrastructure/index.js'

let cached: SpaceIntelligenceService | undefined

export function spaceIntelligenceService(): SpaceIntelligenceService {
  cached ??= createSpaceIntelligenceService(createIntelligenceDatabase(), CURRENT_CONSENT_VERSION)
  return cached
}
