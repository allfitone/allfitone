/**
 * The Allfit Space waitlist, as the owner's launch strategy sets it (internal
 * document «Estrategia de lanzamiento de Allfit Space», v1.0, November 2026):
 *
 * - The first 100 people who join and confirm their email are its Founding
 *   Members, numbered #001 to #100 in the order they confirm.
 * - Everyone gets a link and a code of their own. People who join through them
 *   count toward the referral levels below. Levels add up: the person gets the
 *   reward of every level they reach (owner's decision of 10 November 2026, ADR-050).
 *
 * The rules that need a database (the confirmation email, the numbering, which
 * referrals count) belong to the API. This module only holds what the page
 * shows and sends.
 *
 * Ported from www.allfit.one, where the form was first built, when the owner
 * moved the waitlist here in November 2026. The two copies are not shared: www
 * now only links to this one.
 */

import type { Locale } from './locale'
import { SITE_URL } from './site'

/** The waitlist page, under each locale: `/es/waitlist`, `/en/waitlist`. */
export const WAITLIST_PATH = '/waitlist'

/**
 * The pages the waitlist emails link to, with the token in the fragment (`#token=…`).
 * The worker writes these exact paths (`apps/worker/src/waitlist-emails.ts`).
 */
export const CONFIRM_PATH = `${WAITLIST_PATH}/confirm`
export const REFERRALS_PATH = `${WAITLIST_PATH}/referrals`
export const LEAVE_PATH = `${WAITLIST_PATH}/leave`

/**
 * Where the pages post: `/api/waitlist/<operation>`, a route handler of this app that
 * forwards to the API from the server (`waitlist-relay.ts`), so the API stays off the browser.
 */
export const WAITLIST_ENDPOINT = '/api/waitlist'

/** Referral levels, keyed by the number of people it takes. The copy uses the same keys. */
export const REFERRAL_LEVELS = [5, 15, 30, 100] as const
export type ReferralLevel = (typeof REFERRAL_LEVELS)[number]

/** The next level a person can reach with `referrals` people, or `null` past the last one. */
export function nextReferralLevel(referrals: number): ReferralLevel | null {
  return REFERRAL_LEVELS.find((level) => level > referrals) ?? null
}

/** The highest level already reached, or 0 before the first one. */
export function reachedReferralLevel(referrals: number): ReferralLevel | 0 {
  return [...REFERRAL_LEVELS].reverse().find((level) => level <= referrals) ?? 0
}

/** The query parameter a referral link carries: `/es/waitlist?ref=KEVIN7QH`. */
export const REFERRAL_PARAM = 'ref'

/** A referral code: 4 to 16 letters and digits, so it reads aloud and survives a URL. */
export function normalizeReferralCode(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const code = value.trim().toUpperCase()
  return /^[A-Z0-9]{4,16}$/.test(code) ? code : null
}

/** The link a person shares. It opens the waitlist page, made for joining, in their language. */
export function referralLink(locale: Locale, code: string): string {
  return `${SITE_URL}/${locale}${WAITLIST_PATH}?${REFERRAL_PARAM}=${encodeURIComponent(code)}`
}

/** WhatsApp's share link with the message prefilled; it opens the app or WhatsApp Web. */
export function whatsappShareUrl(message: string): string {
  return `https://wa.me/?text=${encodeURIComponent(message)}`
}

/** Loose on purpose: the confirmation email proves the address; this only catches typos. */
export function isPlausibleEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value)
}

/** Where a visitor came from, as the `utm_*` parameters of the link they opened say. */
export interface Campaign {
  source?: string
  medium?: string
  campaign?: string
}

/** The API keeps up to 64 characters of each; a longer value is dropped, never cut. */
export function campaignFrom(search: URLSearchParams): Campaign {
  const read = (name: string) => {
    const value = search.get(name)?.trim()
    return value && value.length <= 64 ? value : undefined
  }
  const source = read('utm_source')
  const medium = read('utm_medium')
  const campaign = read('utm_campaign')
  return {
    ...(source ? { source } : {}),
    ...(medium ? { medium } : {}),
    ...(campaign ? { campaign } : {}),
  }
}

export interface WaitlistEntry {
  /** First name only, for the greeting in the emails. */
  name: string
  email: string
  /** Ley 1581 de 2012: the person authorized processing their data under the privacy policy. */
  consent: true
  /** The code of whoever invited them, read from the link they arrived with. */
  referredBy: string | null
  campaign: Campaign
  /** The language of the page they joined from, for the emails that follow. */
  locale: Locale
}

/**
 * What joining answers. A new address gets its code and counter on screen. An address
 * already on the list gets neither: they go to its inbox, which only its owner reads.
 */
export type WaitlistJoinResult =
  { status: 'joined'; code: string; referrals: number } | { status: 'already_listed' }

/** What a private link shows: the person's own code and counter, and whether they confirmed. */
export interface WaitlistLink {
  code: string
  referrals: number
  confirmed: boolean
}

/** Why a request failed, as far as a page can act on it. */
export type WaitlistFailureReason = 'disposable-email' | 'rate-limited' | 'unavailable'

export class WaitlistRequestError extends Error {
  constructor(readonly reason: WaitlistFailureReason) {
    super(`waitlist: ${reason}`)
    this.name = 'WaitlistRequestError'
  }
}

const isCount = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0

const fieldsOf = (body: unknown): Record<string, unknown> =>
  typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : {}

/** Reads joining's answer, refusing anything that is not one of its two shapes. */
export function parseJoin(body: unknown): WaitlistJoinResult {
  const { status, referral_code: code, referrals } = fieldsOf(body)
  if (status === 'already_listed') return { status }
  const valid = normalizeReferralCode(code)
  if (status === 'joined' && valid && isCount(referrals)) return { status, code: valid, referrals }
  throw new WaitlistRequestError('unavailable')
}

/** Reads a private link's answer, refusing anything without a code and a count. */
export function parseLink(body: unknown): WaitlistLink {
  const { referral_code: code, referrals, confirmed } = fieldsOf(body)
  const valid = normalizeReferralCode(code)
  if (!valid || !isCount(referrals) || typeof confirmed !== 'boolean') {
    throw new WaitlistRequestError('unavailable')
  }
  return { code: valid, referrals, confirmed }
}

/** The failure a page shows for an answer it did not expect. */
export function failureOf(status: number, body: unknown): WaitlistRequestError {
  const { error } = fieldsOf(body)
  if (status === 422 && error === 'disposable-email') {
    return new WaitlistRequestError('disposable-email')
  }
  if (status === 429) return new WaitlistRequestError('rate-limited')
  return new WaitlistRequestError('unavailable')
}

async function post(operation: string, body: unknown): Promise<{ status: number; body: unknown }> {
  let response: Response
  try {
    response = await fetch(`${WAITLIST_ENDPOINT}/${operation}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
  } catch {
    throw new WaitlistRequestError('unavailable')
  }
  const text = await response.text()
  try {
    return { status: response.status, body: text ? (JSON.parse(text) as unknown) : null }
  } catch {
    return { status: response.status, body: null }
  }
}

/** Adds a person to the list. It throws on any failure, and the form says which. */
export async function joinWaitlist(entry: WaitlistEntry): Promise<WaitlistJoinResult> {
  const { campaign } = entry
  const { status, body } = await post('signups', {
    name: entry.name,
    email: entry.email,
    language: entry.locale,
    consent: entry.consent,
    ...(entry.referredBy ? { referral_code: entry.referredBy } : {}),
    ...(campaign.source ? { utm_source: campaign.source } : {}),
    ...(campaign.medium ? { utm_medium: campaign.medium } : {}),
    ...(campaign.campaign ? { utm_campaign: campaign.campaign } : {}),
  })
  if (status === 201 || status === 202) return parseJoin(body)
  throw failureOf(status, body)
}

/** Asks for the waitlist email again. The answer is the same whether the address is listed. */
export async function requestWaitlistEmail(email: string): Promise<void> {
  const { status, body } = await post('email-requests', { email })
  if (status !== 202) throw failureOf(status, body)
}

/** Confirms the email a confirmation link was sent to; `invalid` for a link that is not one. */
export async function confirmWaitlistEmail(
  token: string,
): Promise<'confirmed' | 'already_confirmed' | 'invalid'> {
  const { status, body } = await post('confirmations', { token })
  if (status === 404) return 'invalid'
  const outcome = fieldsOf(body).status
  if (status === 200 && (outcome === 'confirmed' || outcome === 'already_confirmed')) {
    return outcome
  }
  throw failureOf(status, body)
}

/** Reads what a private link shows; `invalid` for a link that is not, or no longer, one. */
export async function readWaitlistLink(token: string): Promise<WaitlistLink | 'invalid'> {
  const { status, body } = await post('link-reads', { token })
  if (status === 404) return 'invalid'
  if (status === 200) return parseLink(body)
  throw failureOf(status, body)
}

/** Deletes the sign-up a private link belongs to. It cannot be undone. */
export async function leaveWaitlist(token: string): Promise<'left' | 'invalid'> {
  const { status, body } = await post('departures', { token })
  if (status === 204) return 'left'
  if (status === 404) return 'invalid'
  throw failureOf(status, body)
}

/** A link token is 43 base64url characters; anything else is not one of ours. */
const LINK_TOKEN = /^[A-Za-z0-9_-]{43}$/

export function isLinkToken(value: unknown): value is string {
  return typeof value === 'string' && LINK_TOKEN.test(value)
}

/** The token an email link carries in its fragment: `#token=…`. */
export function tokenFromFragment(hash: string): string | null {
  const token = new URLSearchParams(hash.replace(/^#/, '')).get('token')
  return isLinkToken(token) ? token : null
}
