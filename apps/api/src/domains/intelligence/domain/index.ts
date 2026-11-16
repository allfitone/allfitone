/**
 * The assistant's domain, as far as it exists: the AI consent (ADR-053, decision 4).
 *
 * The assistant is one domain for Space and Studio. Its commercial name is copy, never
 * code; here it is `intelligence`. What it has today is the one thing every capability
 * needs before it may send anything to a model: the person's consent. Runs, ceilings and
 * summaries arrive with the capability that writes them.
 *
 * **The text in force is the API's to say, not the database's.** A version is a text, and
 * the text names where a person's data goes. So the version in force belongs with the
 * code that decides where data goes, exactly as the meal-photo consent follows its
 * recogniser (ADR-045, decision 10): data cannot reach a vendor she did not accept,
 * whatever order code and migrations are released in. PostgreSQL keeps what is published
 * and what she holds.
 */

import type { AllfitV1Schemas } from '@allfitone/contracts'

export type IntelligenceConsent = AllfitV1Schemas['IntelligenceConsent']

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

export interface IntelligenceDatabase {
  /** Null when PostgreSQL does not answer for this person as the actor. */
  readConsent(input: { personId: string; requestId: string }): Promise<ConsentRow | null>
  giveConsent(
    input: IntelligenceCommand & { personId: string; version: string },
  ): Promise<ConsentRow>
  withdrawConsent(input: IntelligenceCommand & { personId: string }): Promise<ConsentRow>
}

/** The version named is not the text in force, or no text is in force at all. */
export class ConsentTextNotInForce extends Error {
  constructor() {
    super('the consent text named is not the one in force')
    this.name = 'ConsentTextNotInForce'
  }
}
