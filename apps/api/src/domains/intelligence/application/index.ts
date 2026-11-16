/**
 * The assistant's use cases for the person herself: her AI consent (HU-SP-124,
 * HU-SP-125) and, beside it, the weekly summary (`weekly-summary.ts`).
 *
 * The rules live in PostgreSQL: one consent in force, history kept, only the person
 * decides. This layer adds the one thing the database cannot know, which text is in
 * force, and holds a command to it.
 *
 * **Only the text in force can be given.** Giving a text ends the one she holds. If any
 * published version were accepted, an app build that still shows an older text would
 * replace her current consent with a superseded one, and every capability would stop for
 * her without her having decided anything.
 */

import type { WeeklySummarizer } from '@allfitone/weekly-summary'

import {
  ConsentTextNotInForce,
  type ConsentDatabase,
  type ConsentRow,
  type IntelligenceCommand,
  type IntelligenceConsent,
  type IntelligenceDatabase,
} from '../domain/index.js'
import { createWeeklySummaryService, type WeeklySummaryService } from './weekly-summary.js'

export interface ConsentService {
  readConsent(input: { personId: string; requestId: string }): Promise<IntelligenceConsent>
  giveConsent(
    input: IntelligenceCommand & { personId: string; version: string },
  ): Promise<IntelligenceConsent>
  withdrawConsent(input: IntelligenceCommand & { personId: string }): Promise<IntelligenceConsent>
}

export type SpaceIntelligenceService = ConsentService & WeeklySummaryService

export function createConsentService(
  database: ConsentDatabase,
  currentConsent: string | null,
): ConsentService {
  const answer = (row: ConsentRow | null): IntelligenceConsent => ({
    current_version: currentConsent,
    accepted_version: row?.accepted_version ?? null,
    accepted_at: row?.accepted_at ?? null,
    withdrawn_at: row?.withdrawn_at ?? null,
  })

  return {
    readConsent: async (input) => answer(await database.readConsent(input)),

    async giveConsent(input) {
      if (input.version !== currentConsent) throw new ConsentTextNotInForce()
      return answer(await database.giveConsent(input))
    },

    // Taking it back never depends on a text: she can always stop.
    withdrawConsent: async (input) => answer(await database.withdrawConsent(input)),
  }
}

/** One consent, and every capability under it: the same text decides both. */
export function createSpaceIntelligenceService(
  database: IntelligenceDatabase,
  currentConsent: string | null,
  summarizer: WeeklySummarizer | null,
): SpaceIntelligenceService {
  return {
    ...createConsentService(database, currentConsent),
    ...createWeeklySummaryService(database, currentConsent, summarizer),
  }
}
