import { useSyncExternalStore } from 'react'

import { campaignFrom, normalizeReferralCode, REFERRAL_PARAM, type Campaign } from './waitlist'

const STORAGE_KEY = 'allfit-space.referral'
const CAMPAIGN_KEY = 'allfit-space.campaign'
const CAMPAIGN_PARAMS = ['utm_source', 'utm_medium', 'utm_campaign'] as const
const NO_CAMPAIGN: Campaign = {}

let visitCode: string | null | undefined
let visitCampaign: Campaign | undefined

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

/**
 * The campaign the visit came from (`utm_*`), kept the same way as the code: a
 * campaign link usually opens the landing, and the person may join from the waitlist page.
 */
function readCampaignForVisit(): Campaign {
  if (visitCampaign !== undefined) return visitCampaign
  const fromLink = campaignFrom(new URLSearchParams(window.location.search))
  const linked = Object.keys(fromLink).length > 0
  try {
    if (linked) {
      const kept = new URLSearchParams(window.location.search)
      for (const name of [...kept.keys()]) {
        if (!(CAMPAIGN_PARAMS as readonly string[]).includes(name)) kept.delete(name)
      }
      window.sessionStorage.setItem(CAMPAIGN_KEY, kept.toString())
    }
    visitCampaign = linked
      ? fromLink
      : campaignFrom(new URLSearchParams(window.sessionStorage.getItem(CAMPAIGN_KEY) ?? ''))
  } catch {
    visitCampaign = fromLink
  }
  return visitCampaign
}

const noCode = () => null
const noCampaign = () => NO_CAMPAIGN
const noUpdates = () => () => undefined

/** The server HTML has no code; the visit's code appears right after hydration. */
export function useReferralCode(): string | null {
  return useSyncExternalStore(noUpdates, readForVisit, noCode)
}

export function useCampaign(): Campaign {
  return useSyncExternalStore(noUpdates, readCampaignForVisit, noCampaign)
}
