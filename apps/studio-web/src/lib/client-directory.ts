/**
 * What the client directory screen needs to know before it asks for anything.
 *
 * Permission is read from the role catalog the server publishes rather than
 * from a list of role codes written here. PostgreSQL opens the directory
 * through two capabilities, and a copy of that mapping in the client is a
 * second source of truth that drifts silently the day the grant changes.
 *
 * The two capabilities are not two levels of the same permission. Holding
 * `view_directory` shows every client and every unanswered invitation of the
 * organization; holding only `view_assigned_directory` shows the clients that
 * person was assigned and the invitations they sent. Both are a real
 * directory, so both open the screen — the narrowing happens in the database,
 * never here.
 */
import type { ClientDirectoryItem, OrganizationRole } from './studio-api'
import type { ClientFilter } from './studio-query'

const VIEW_DIRECTORY = 'view_directory'
const VIEW_ASSIGNED_DIRECTORY = 'view_assigned_directory'

export function canViewClientDirectory(
  roles: readonly string[],
  catalog: readonly OrganizationRole[] | undefined,
): boolean {
  if (!catalog?.length) return false
  return roles.some((role) =>
    catalog
      .find((entry) => entry.code === role)
      ?.capabilities.some(
        (capability) =>
          capability.code === VIEW_DIRECTORY || capability.code === VIEW_ASSIGNED_DIRECTORY,
      ),
  )
}

/**
 * True when the caller sees the whole organization rather than their own
 * assignments. Used only to word the screen honestly — a coach is told the list
 * is theirs, not the organization's, so an incomplete list does not read as
 * missing clients.
 */
export function seesEveryClient(
  roles: readonly string[],
  catalog: readonly OrganizationRole[] | undefined,
): boolean {
  if (!catalog?.length) return false
  return roles.some((role) =>
    catalog
      .find((entry) => entry.code === role)
      ?.capabilities.some((capability) => capability.code === VIEW_DIRECTORY),
  )
}

/** The id an entry is keyed and linked by, whichever kind it is. */
export function directoryEntryId(entry: ClientDirectoryItem): string {
  return entry.kind === 'invitation' ? entry.invitation_id : entry.relationship_id
}

/**
 * What a person is called in the list. An invitation has no name to show,
 * because until somebody accepts, no person exists — so the masked contact
 * stands in for one, and the caller can tell the difference.
 */
export function directoryEntryLabel(entry: ClientDirectoryItem): string {
  return entry.kind === 'invitation' ? entry.contact_hint : entry.display_name
}

export function clientInitials(displayName: string): string {
  return displayName
    .trim()
    .split(/\s+/u)
    .slice(0, 2)
    .map((part) => Array.from(part)[0]?.toLocaleUpperCase('es-CO') ?? '')
    .join('')
}

/*
 * Searching the directory — HU-STUDIO-082.
 *
 * The search belongs to the server: `q` narrows what the caller already reads
 * and never widens it, so a coach finds only the people assigned to them and
 * this screen filters nothing. A second narrowing here would be a second place
 * for that rule to be wrong.
 *
 * What lives below is only what the screen must know before it asks: when a
 * term is worth a request, and when searching is not offered at all.
 */

/** What the route accepts before it trims anything; past this it answers 422. */
export const SEARCH_RAW_LIMIT = 200
const SEARCH_MIN_LENGTH = 2
const SEARCH_MAX_LENGTH = 80

/**
 * The same normalization the route applies — surrounding and repeated spaces
 * are ignored. Written here so the screen only asks for terms the server will
 * accept, instead of learning the rule from a rejection.
 */
export function normalizeSearchTerm(raw: string): string {
  return raw.trim().replace(/\s+/gu, ' ')
}

export type SearchTermState = 'idle' | 'too-short' | 'ready' | 'too-long'

/**
 * `idle` is an empty box, not an error: the directory simply shows everything.
 * `too-short` is the state a person passes through on the way to typing a
 * name, so it asks for nothing and says nothing until there is something to
 * say.
 */
export function searchTermState(raw: string): SearchTermState {
  if (raw.length > SEARCH_RAW_LIMIT) return 'too-long'
  const term = normalizeSearchTerm(raw)
  if (term.length === 0) return 'idle'
  if (term.length < SEARCH_MIN_LENGTH) return 'too-short'
  return term.length <= SEARCH_MAX_LENGTH ? 'ready' : 'too-long'
}

/** The term to send, or undefined while the box is not worth a request yet. */
export function searchTermToSend(raw: string): string | undefined {
  return searchTermState(raw) === 'ready' ? normalizeSearchTerm(raw) : undefined
}

/**
 * An invitation nobody has answered carries no name — until somebody accepts,
 * no person exists — so the route refuses a search together with that filter.
 * The screen offers no search there rather than letting the request fail: a
 * control that errors on a combination the product forbids teaches nothing.
 */
export function canSearchWithin(filter: ClientFilter): boolean {
  return filter !== 'invited'
}

export const SEARCH_UNAVAILABLE_REASON =
  'Una invitación sin responder todavía no tiene nombre, así que no se puede buscar entre ellas.'

export const SEARCH_TOO_LONG_REASON = `Escribe un nombre más corto, de máximo ${SEARCH_MAX_LENGTH} caracteres.`
