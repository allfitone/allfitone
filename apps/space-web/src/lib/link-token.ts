/**
 * The token a waitlist email link carries in its fragment (`#token=…`).
 *
 * The fragment never reaches a server, so the token stays out of CloudFront's and the
 * load balancer's logs and out of every `Referer`. The page reads it here, posts it in a
 * request body, and takes it off the address bar. It is kept in session storage for the
 * tab, so a refresh or the language switch still finds it, and the «mi link» and leave
 * pages share it: both emails' links carry the same private token.
 */

import { useEffect, useSyncExternalStore } from 'react'

import { isLinkToken, tokenFromFragment } from './waitlist'

/** A confirmation link carries its own token; «mi link» and leaving carry the private one. */
export type LinkTokenKind = 'confirmation' | 'private'

const storageKey = (kind: LinkTokenKind) => `allfit-space.waitlist-${kind}`

/** The last token each kind read from a fragment, for when session storage is blocked. */
const remembered: Partial<Record<LinkTokenKind, string>> = {}

function readToken(kind: LinkTokenKind): string | null {
  const fromLink = tokenFromFragment(window.location.hash)
  if (fromLink) remembered[kind] = fromLink
  try {
    if (fromLink) window.sessionStorage.setItem(storageKey(kind), fromLink)
    const kept = window.sessionStorage.getItem(storageKey(kind))
    if (isLinkToken(kept)) return kept
  } catch {
    // Blocked storage: the token lives in memory until the tab reloads.
  }
  return remembered[kind] ?? null
}

const noUpdates = () => () => undefined
const unread = () => undefined

/** `undefined` until the page runs in the browser, then the token or `null` when there is none. */
export function useLinkToken(kind: LinkTokenKind): string | null | undefined {
  const token = useSyncExternalStore(noUpdates, () => readToken(kind), unread)

  // Only once read: React reads the store again after hydration, and the token must be there.
  useEffect(() => {
    if (token === undefined || !window.location.hash) return
    window.history.replaceState(null, '', window.location.pathname + window.location.search)
  }, [token])

  return token
}

/** After leaving, the token belongs to nothing: no page of this tab should offer it again. */
export function forgetLinkToken(kind: LinkTokenKind): void {
  delete remembered[kind]
  try {
    window.sessionStorage.removeItem(storageKey(kind))
  } catch {
    // Nothing was kept where storage is blocked.
  }
}
