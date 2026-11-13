/**
 * Signing in again in the middle of a historical access case, and coming back.
 *
 * Opening a case, and every read through one, needs a sign-in less than ten
 * minutes old. `auth/start?reauthenticate=true` asks for the credentials again,
 * but the callback always lands on the Studio entry (`/app`), not on the page
 * that asked. Two things are kept in this tab's `sessionStorage` to bridge it:
 *
 * - **where to come back to**, which the entry takes once and only when it is
 *   one of this block's own pages, in an organization the account still holds.
 *   Anything else is dropped: a stored path is input, and following it blindly
 *   would make the entry an open redirect.
 * - **the case form as it was**, so a manager does not write the justification
 *   twice. It belongs to one organization and is forgotten after half an hour,
 *   or as soon as the case opens.
 *
 * `sessionStorage` rather than `localStorage`: the sign-in happens in this tab,
 * and what was written for a case should not outlive it.
 */
import {
  HISTORICAL_DURATIONS,
  isHistoricalPurpose,
  type CaseDraft,
  type CaseDraftRelationship,
} from './historical-access'

export type KeyValueStore = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

const RETURN_KEY = 'allfit-historical-return:v1'
const DRAFT_KEY = 'allfit-historical-case-draft:v1'
const RETURN_TTL_MS = 15 * 60 * 1000
const DRAFT_TTL_MS = 30 * 60 * 1000

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
const RETURN_PATH = new RegExp(
  `^/organizations/(${UUID})/historical-access-cases(?:/new|/${UUID}\\?relationship=${UUID})?$`,
)

export function reauthenticationUrl(apiUrl: string): string {
  return `${apiUrl}/studio/v1/auth/start?reauthenticate=true`
}

/** The browser's tab store, or nothing when it is disabled. */
export function tabStore(): KeyValueStore | undefined {
  try {
    return typeof sessionStorage === 'undefined' ? undefined : sessionStorage
  } catch {
    return undefined
  }
}

function write(store: KeyValueStore | undefined, key: string, value: unknown): void {
  try {
    store?.setItem(key, JSON.stringify(value))
  } catch {
    // A full or disabled store loses the convenience, not the case.
  }
}

function read(store: KeyValueStore | undefined, key: string): unknown {
  try {
    const raw = store?.getItem(key)
    return raw ? (JSON.parse(raw) as unknown) : undefined
  } catch {
    return undefined
  }
}

function remove(store: KeyValueStore | undefined, key: string): void {
  try {
    store?.removeItem(key)
  } catch {
    // Nothing to forget in a store that cannot be reached.
  }
}

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined
}

export function rememberReturn(path: string, now: number, store = tabStore()): void {
  if (RETURN_PATH.test(path)) write(store, RETURN_KEY, { path, savedAt: now })
}

export function takeReturn(now: number, store = tabStore()): string | undefined {
  const stored = record(read(store, RETURN_KEY))
  remove(store, RETURN_KEY)
  const path = stored?.path
  const savedAt = stored?.savedAt
  if (typeof path !== 'string' || typeof savedAt !== 'number') return undefined
  if (now - savedAt > RETURN_TTL_MS || !RETURN_PATH.test(path)) return undefined
  return path
}

export function returnBelongsTo(path: string, organizationIds: readonly string[]): boolean {
  const organizationId = RETURN_PATH.exec(path)?.[1]
  return organizationId !== undefined && organizationIds.includes(organizationId)
}

export function saveCaseDraft(
  organizationId: string,
  draft: CaseDraft,
  now: number,
  store = tabStore(),
): void {
  write(store, DRAFT_KEY, { organizationId, savedAt: now, draft })
}

export function clearCaseDraft(store = tabStore()): void {
  remove(store, DRAFT_KEY)
}

export function readCaseDraft(
  organizationId: string,
  now: number,
  store = tabStore(),
): CaseDraft | undefined {
  const stored = record(read(store, DRAFT_KEY))
  if (!stored) return undefined
  if (typeof stored.savedAt !== 'number' || now - stored.savedAt > DRAFT_TTL_MS) {
    clearCaseDraft(store)
    return undefined
  }
  if (stored.organizationId !== organizationId) return undefined
  return caseDraftFrom(stored.draft)
}

function caseDraftFrom(value: unknown): CaseDraft | undefined {
  const draft = record(value)
  if (!draft) return undefined
  const relationship = relationshipFrom(draft.relationship)
  const { authorized, purpose, reference, justification, hours } = draft
  if (relationship === undefined) return undefined
  if (authorized !== null && typeof authorized !== 'string') return undefined
  if (purpose !== null && !isHistoricalPurpose(purpose)) return undefined
  if (typeof reference !== 'string' || typeof justification !== 'string') return undefined
  if (hours !== null && !(typeof hours === 'number' && HISTORICAL_DURATIONS.includes(hours))) {
    return undefined
  }
  return { relationship, authorized, purpose, reference, justification, hours }
}

function relationshipFrom(value: unknown): CaseDraftRelationship | null | undefined {
  if (value === null) return null
  const relationship = record(value)
  if (!relationship) return undefined
  const { id, name, endedAt } = relationship
  if (typeof id !== 'string' || typeof name !== 'string' || typeof endedAt !== 'string') {
    return undefined
  }
  return { id, name, endedAt }
}
