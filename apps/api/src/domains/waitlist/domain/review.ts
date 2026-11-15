/**
 * The waitlist as the team reviews it: `OP-WL-011` and `OP-WL-012` (`HU-BO-035`).
 *
 * The rules — who may review, what a fraud mark changes, who takes a freed number —
 * live in PostgreSQL. What is here is the shape of the question and of the command, so a
 * request that cannot be read is answered before it reaches the database.
 *
 * A page is cut by the identifier of its last sign-up alone: identifiers are UUIDv7, so
 * newest first is identifier descending and nothing else is needed to resume.
 */

import type { AllfitV1Schemas } from '@allfitone/contracts'

export type BackofficeWaitlistSignup = AllfitV1Schemas['BackofficeWaitlistSignup']
export type BackofficeWaitlistTotals = AllfitV1Schemas['BackofficeWaitlistTotals']
export type BackofficeWaitlistFraudMark = AllfitV1Schemas['BackofficeWaitlistFraudMark']

export const WAITLIST_SIGNUP_FILTERS = [
  'confirmed',
  'unconfirmed',
  'founding_members',
  'discarded',
] as const
export type WaitlistSignupFilter = (typeof WAITLIST_SIGNUP_FILTERS)[number]

export const MIN_WAITLIST_SEARCH_LENGTH = 2
/** The longest an email address is, which is the longest thing a search can match whole. */
export const MAX_WAITLIST_SEARCH_LENGTH = 254

export const MIN_FRAUD_REASON_LENGTH = 4
export const MAX_FRAUD_REASON_LENGTH = 200

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export interface WaitlistReviewer {
  actorPersonId: string
  actorSessionId: string
}

export interface WaitlistSignupQuery {
  requestId: string
  limit: number
  query?: string
  filter?: WaitlistSignupFilter
  /** The identifier of the last sign-up of the page before. */
  beforeId?: string
}

export interface WaitlistSignupPage {
  items: BackofficeWaitlistSignup[]
  hasMore: boolean
  nextCursor?: string
}

export interface WaitlistReviewCommand {
  requestId: string
  idempotencyKey: string
  commandId: string
  requestHash: Uint8Array
}

export interface WaitlistFraudMarkResult {
  resource: BackofficeWaitlistSignup
  replayed: boolean
}

export interface WaitlistReviewDatabase {
  /** Answers up to `limit` sign-ups as asked; the use case asks for one more than a page. */
  list(input: WaitlistReviewer & WaitlistSignupQuery): Promise<BackofficeWaitlistSignup[]>
  totals(input: WaitlistReviewer & { requestId: string }): Promise<BackofficeWaitlistTotals>
  markAsFraud(
    input: WaitlistReviewer &
      WaitlistReviewCommand & { signupId: string; mark: BackofficeWaitlistFraudMark },
  ): Promise<WaitlistFraudMarkResult>
}

export function encodeWaitlistCursor(lastSignupId: string): string {
  return Buffer.from(JSON.stringify({ id: lastSignupId }), 'utf8').toString('base64url')
}

/** Undefined for anything that is not a cursor this API issued. */
export function decodeWaitlistCursor(value: string): string | undefined {
  if (value.length < 16 || value.length > 1024) return undefined
  try {
    const parsed: unknown = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'))
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return undefined
    const entries = Object.entries(parsed)
    const [entry] = entries
    if (entries.length !== 1 || !entry || entry[0] !== 'id') return undefined
    const id: unknown = entry[1]
    return typeof id === 'string' && UUID.test(id) ? id.toLowerCase() : undefined
  } catch {
    return undefined
  }
}

/** C0, DEL and C1: what PostgreSQL's `[[:cntrl:]]` refuses, so both say no to the same text. */
function hasControlCharacter(value: string): boolean {
  return [...value].some((character) => {
    const code = character.codePointAt(0) ?? 0
    return code < 0x20 || (code >= 0x7f && code <= 0x9f)
  })
}

/** The reason trimmed, or undefined when it is not one line of 4 to 200 characters. */
export function fraudReason(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  const length = [...trimmed].length
  if (length < MIN_FRAUD_REASON_LENGTH || length > MAX_FRAUD_REASON_LENGTH) return undefined
  return hasControlCharacter(trimmed) ? undefined : trimmed
}
