import { useSyncExternalStore } from 'react'

import { normalizeReferralCode, REFERRAL_PARAM } from './waitlist'

const STORAGE_KEY = 'allfit-space.referral'

let visitCode: string | null | undefined

/**
 * The code of whoever invited this visitor. It comes from the link they arrived
 * with (`?ref=`) and is kept for the visit, so it still counts if they open the
 * landing from a shared link and join from the waitlist page, or the other way
 * round.
 */
function readForVisit(): string | null {
  if (visitCode !== undefined) return visitCode
  const fromLink = normalizeReferralCode(
    new URLSearchParams(window.location.search).get(REFERRAL_PARAM),
  )
  try {
    if (fromLink) window.sessionStorage.setItem(STORAGE_KEY, fromLink)
    visitCode = fromLink ?? normalizeReferralCode(window.sessionStorage.getItem(STORAGE_KEY))
  } catch {
    // Storage can be blocked; the link alone still counts on the page it opened.
    visitCode = fromLink
  }
  return visitCode
}

const noCode = () => null
const noUpdates = () => () => undefined

/** The server HTML has no code; the visit's code appears right after hydration. */
export function useReferralCode(): string | null {
  return useSyncExternalStore(noUpdates, readForVisit, noCode)
}
