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

/** Where the form posts. A route handler of this app, so the API stays off the browser. */
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

export interface WaitlistEntry {
  /** First name only, for the greeting in the confirmation email. */
  name: string
  email: string
  /** Ley 1581 de 2012: the person authorized processing their data under the privacy policy. */
  consent: true
  /** The code of whoever invited them, read from the link they arrived with. */
  referredBy: string | null
  /** The language of the page they joined from, for the emails that follow. */
  locale: Locale
}

export interface WaitlistJoined {
  /** Their own code; their link is `referralLink(locale, code)`. */
  code: string
  /** People who joined through them and confirmed their email. */
  referrals: number
}

/** Reads the endpoint's answer, refusing anything that is not a code and a count. */
export function parseJoined(body: unknown): WaitlistJoined {
  if (body === null || typeof body !== 'object') throw new Error('waitlist: unexpected answer')
  const { code, referrals } = body as Record<string, unknown>
  const valid = normalizeReferralCode(code)
  if (!valid || typeof referrals !== 'number' || !Number.isInteger(referrals) || referrals < 0) {
    throw new Error('waitlist: unexpected answer')
  }
  return { code: valid, referrals }
}

/** Adds a person to the list. It throws on any failure, and the form says so. */
export async function joinWaitlist(entry: WaitlistEntry): Promise<WaitlistJoined> {
  const response = await fetch(WAITLIST_ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(entry),
  })
  if (!response.ok) throw new Error(`waitlist: ${String(response.status)}`)
  return parseJoined(await response.json())
}
