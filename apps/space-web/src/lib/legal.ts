/**
 * Allfit One's legal documents live on www.allfit.one, one set for every
 * product: the terms, the privacy policy and the analytics notice, in each
 * language. This site links there and keeps no copy of its own; its former
 * `/terms` and `/privacy` drafts redirect there (`next.config.ts`).
 *
 * Duplicated on purpose in `apps/space` and `apps/studio-web`: three addresses
 * do not earn a package, and an app never imports another.
 */

import type { Locale } from './locale'

export const LEGAL_SITE_URL = 'https://www.allfit.one'

export type LegalDocument = 'terms' | 'privacy' | 'analytics'

/** The address of one legal document in the given language. */
export function legalUrl(locale: Locale, document: LegalDocument): string {
  return `${LEGAL_SITE_URL}/${locale}/legal/${document}`
}
