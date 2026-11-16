/**
 * The assistant's domain, as far as it exists: the AI consent and the weekly summary of
 * Space (ADR-053, decisions 4, 6 to 8, 10 and 13).
 *
 * The assistant is one domain for Space and Studio. Its commercial name is copy, never
 * code; here it is `intelligence`. Every capability needs the person's consent before it
 * may send anything to a model, and each brings its own runs, ceiling and what it keeps.
 *
 * **The text in force is the API's to say, not the database's.** A version is a text, and
 * the text names where a person's data goes. So the version in force belongs with the
 * code that decides where data goes, exactly as the meal-photo consent follows its
 * recogniser (ADR-045, decision 10): data cannot reach a vendor she did not accept,
 * whatever order code and migrations are released in. PostgreSQL keeps what is published
 * and what she holds.
 *
 * **What refuses a summary is PostgreSQL's to say, and it says it before reading.** Her
 * plan, her consent and her ceiling are decided in the transaction that would read her
 * weeks. The errors below are what those refusals are called here; none of them carries
 * anything she logged.
 */

import type { AllfitV1Schemas } from '@allfitone/contracts'
import type { Source, WeeklySummary as SummaryText, WeeksLogged } from '@allfitone/weekly-summary'

export type IntelligenceConsent = AllfitV1Schemas['IntelligenceConsent']
export type WeeklySummary = AllfitV1Schemas['WeeklySummary']
export type WeeklySummaryAnswer = AllfitV1Schemas['WeeklySummaryAnswer']

/** The consent as the database keeps it; which text is in force is the API's to say. */
export type ConsentRow = Omit<IntelligenceConsent, 'current_version'>

/**
 * The text a person must hold for any capability to run. None exists yet: it is written
 * with the first capability's model and reviewed before it is published (ADR-053, open
 * questions). While this is null no consent can be given and nothing runs.
 */
export const CURRENT_CONSENT_VERSION: string | null = null

export interface IntelligenceCommand {
  idempotencyKey: string
  commandId: string
  requestHash: Uint8Array
}

/** How a run ends. `over-ceiling` is PostgreSQL's to say, never the API's. */
export type RunOutcome = 'answered' | 'unavailable' | 'refused' | 'over-ceiling' | 'nothing-logged'

/**
 * What the first half of `OP-ITL-004` answers. A refusal that leaves nothing behind (no
 * Pro, no consent, a week she may not ask about) is raised instead: its transaction rolls
 * back, so the same request can be sent again once it may.
 */
export type SummaryOpening =
  | { state: 'opened'; runId: string; logged: WeeksLogged }
  | { state: 'over-ceiling'; renewsAt: string }
  | { state: 'replayed'; outcome: RunOutcome; weekStartsOn: string; renewsAt: string }

export interface SummaryClosing {
  personId: string
  runId: string
  outcome: Exclude<RunOutcome, 'over-ceiling'>
  /** The exact model asked; null when none was. */
  model: string | null
  tokens: { input: number; output: number } | null
  /** What the model wrote and from which of her data, exactly when it answered. */
  summary: (SummaryText & { sources: readonly Source[] }) | null
}

export interface ConsentDatabase {
  /** Null when PostgreSQL does not answer for this person as the actor. */
  readConsent(input: { personId: string; requestId: string }): Promise<ConsentRow | null>
  giveConsent(
    input: IntelligenceCommand & { personId: string; version: string },
  ): Promise<ConsentRow>
  withdrawConsent(input: IntelligenceCommand & { personId: string }): Promise<ConsentRow>
}

export interface WeeklySummaryDatabase {
  /** Decides, reads her two weeks as herself and opens the run, in one transaction. */
  beginWeeklySummary(
    input: IntelligenceCommand & {
      personId: string
      weekStartsOn: string
      timezone: string
      consentVersion: string | null
      contract: string
    },
  ): Promise<SummaryOpening>
  /** Closes the run and keeps the summary it wrote, in another transaction. */
  finishWeeklySummary(input: SummaryClosing): Promise<WeeklySummary | null>
  readWeeklySummary(input: {
    personId: string
    weekStartsOn: string
  }): Promise<WeeklySummary | null>
  listWeeklySummaries(input: {
    personId: string
    before: string | null
    limit: number
    requestId: string
  }): Promise<WeeklySummaryList>
  deleteWeeklySummary(
    input: IntelligenceCommand & { personId: string; weekStartsOn: string },
  ): Promise<void>
}

export type IntelligenceDatabase = ConsentDatabase & WeeklySummaryDatabase

export interface WeeklySummaryList {
  data: WeeklySummary[]
  /** The week the next page starts before; null on the last page. */
  nextBefore: string | null
}

/** The version named is not the text in force, or no text is in force at all. */
export class ConsentTextNotInForce extends Error {
  constructor() {
    super('the consent text named is not the one in force')
    this.name = 'ConsentTextNotInForce'
  }
}

/** She does not hold the consent in force. Nothing of hers was read. */
export class ConsentRequired extends Error {
  constructor() {
    super('the AI consent in force is required')
    this.name = 'ConsentRequired'
  }
}

/** Her ceiling of the week is reached. Nothing of hers was read. */
export class SummaryCeilingReached extends Error {
  constructor(readonly renewsAt: string) {
    super('the weekly summary ceiling is reached')
    this.name = 'SummaryCeilingReached'
  }
}

/**
 * No summary can be given now: no model is configured, the model did not answer, or its
 * answer may not be shown. `reason` is a closed value and never anything a model wrote.
 */
export class SummaryUnavailable extends Error {
  constructor(readonly reason: string) {
    super(`the weekly summary is unavailable: ${reason}`)
    this.name = 'SummaryUnavailable'
  }
}

/** The request ran, and she has deleted the summary it wrote since. */
export class SummaryDisposed extends Error {
  constructor() {
    super('the weekly summary this request wrote was deleted')
    this.name = 'SummaryDisposed'
  }
}
