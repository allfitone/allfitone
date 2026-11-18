/**
 * Intelligence module composition: its database, the consent text in force and the
 * summariser the environment describes. Without `WEEKLY_SUMMARY_MODEL` there is no
 * summariser, and the weekly summary is closed.
 */

import { createWeeklySummarizerFromEnv } from '@allfitone/weekly-summary'

import {
  createSpaceIntelligenceService,
  type SpaceIntelligenceService,
} from './application/index.js'
import { CURRENT_CONSENT_VERSION } from './domain/index.js'
import { createIntelligenceDatabase } from './infrastructure/index.js'

let cached: SpaceIntelligenceService | undefined

export function spaceIntelligenceService(): SpaceIntelligenceService {
  cached ??= createSpaceIntelligenceService(
    createIntelligenceDatabase(),
    CURRENT_CONSENT_VERSION,
    createWeeklySummarizerFromEnv(process.env),
  )
  return cached
}
