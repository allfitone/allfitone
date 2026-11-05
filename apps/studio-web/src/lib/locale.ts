/**
 * The languages the public landing speaks, and how a visitor lands on one.
 *
 * Only the landing is bilingual. The workspace behind it is Spanish and keeps
 * its unprefixed routes, so `/app` or `/organizations/…` never negotiate.
 *
 * Spanish is the default for everyone: Studio launches in Colombia, and `/`
 * opens the Spanish landing whatever the browser prefers, as on www.allfit.one.
 * This mirrors `apps/space-web` on purpose rather than through a shared package:
 * each site owns its languages — Space prefixes every page, Studio only its landing.
 */

export const LOCALES = ['es', 'en'] as const
export type Locale = (typeof LOCALES)[number]
export const DEFAULT_LOCALE: Locale = 'es'

export function isLocale(value: string): value is Locale {
  return LOCALES.some((locale) => locale === value)
}

/** Whether a path is the landing in one of its languages, such as `/en`. */
export function isLandingPath(pathname: string): boolean {
  return LOCALES.some((locale) => pathname === `/${locale}`)
}
