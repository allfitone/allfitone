/**
 * The Allfit Space waitlist, as ADR-050 shapes it.
 *
 * A sign-up is not a person: it has no account and arrives through space-web, which is
 * the only caller these operations accept. What identifies the visitor here is never
 * stored as it arrives. The address and the device become keyed hashes before they
 * reach the database, and exist only to discard repeated sign-ups.
 */

export type WaitlistLanguage = 'es' | 'en'

/** What space-web says about the visitor behind a request. */
export interface WaitlistVisitor {
  /** The visitor's IP address, as space-web saw it. */
  address: string
  /** The random identifier space-web keeps in a first-party cookie, when there is one. */
  device?: string
}

export interface WaitlistJoinInput {
  name: string
  email: string
  language: WaitlistLanguage
  /** The version of the privacy policy the person authorized. */
  policyVersion: string
  /** The code of whoever invited them, as typed or as the link carried it. */
  inviterCode?: string
  utmSource?: string
  utmMedium?: string
  utmCampaign?: string
}

/**
 * `already_listed` carries nothing about the sign-up behind the address: its code and
 * counter go to the inbox only its owner reads (HU-SP-115, criterion 5).
 */
export type WaitlistJoinResult =
  | { outcome: 'joined'; referralCode: string; referrals: number }
  | { outcome: 'already_listed' }
  | { outcome: 'rate_limited' }

export type WaitlistConfirmationResult =
  'confirmed' | 'already_confirmed' | 'invalid' | 'rate_limited'

export type WaitlistEmailRequestResult = 'accepted' | 'rate_limited'

/** What the private link reads: the person's own code and counter, and nobody else. */
export type WaitlistLinkResult =
  | {
      outcome: 'found'
      referralCode: string
      referrals: number
      language: WaitlistLanguage
      confirmed: boolean
    }
  | { outcome: 'invalid' }
  | { outcome: 'rate_limited' }

export type WaitlistLeaveResult = 'left' | 'invalid' | 'rate_limited'

/** A token as the database receives it: the identifier it is derived from, and its hash. */
export interface WaitlistTokenRecord {
  id: string
  hash: Uint8Array
}

export interface WaitlistEmailTokens {
  confirmation: WaitlistTokenRecord
  privateLink: WaitlistTokenRecord
  keyVersion: number
}

export interface WaitlistFingerprints {
  connection: Uint8Array
  device?: Uint8Array
}

export interface WaitlistDatabase {
  join(
    input: WaitlistJoinInput,
    fingerprints: WaitlistFingerprints,
    tokens: WaitlistEmailTokens,
  ): Promise<WaitlistJoinResult>
  confirm(tokenHash: Uint8Array, connection: Uint8Array): Promise<WaitlistConfirmationResult>
  requestEmail(
    email: string,
    connection: Uint8Array,
    tokens: WaitlistEmailTokens,
  ): Promise<WaitlistEmailRequestResult>
  readLink(tokenHash: Uint8Array, connection: Uint8Array): Promise<WaitlistLinkResult>
  leave(tokenHash: Uint8Array, connection: Uint8Array): Promise<WaitlistLeaveResult>
}

export class WaitlistError extends Error {
  constructor(readonly code: 'disposable-email' | 'invalid-visitor') {
    super(code)
    this.name = 'WaitlistError'
  }
}
