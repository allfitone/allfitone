/**
 * Allfit One's legal documents. They live on www.allfit.one, one set for every
 * product: the terms, the privacy policy and the analytics notice, in each
 * language. The landing links all three in its own language; the workspace
 * speaks Spanish, so the activation links the Spanish terms and policy. The
 * analytics panel takes its notice's address from `@allfitone/telemetry`, next
 * to the consent version it belongs to.
 *
 * Duplicated on purpose in `apps/space` and `apps/space-web`: three addresses do
 * not earn a package, and an app never imports another.
 */

import type { Locale } from './locale'

export const LEGAL_SITE_URL = 'https://www.allfit.one'

export type LegalDocument = 'terms' | 'privacy' | 'analytics'

/** The address of one legal document in the given language. */
export function legalUrl(locale: Locale, document: LegalDocument): string {
  return `${LEGAL_SITE_URL}/${locale}/legal/${document}`
}

export const LEGAL_URLS = {
  terms: legalUrl('es', 'terms'),
  privacy: legalUrl('es', 'privacy'),
} as const
