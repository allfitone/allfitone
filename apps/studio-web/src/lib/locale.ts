/**
 * The languages the public landing speaks, and how a visitor lands on one.
 *
 * Only the landing is bilingual. The workspace behind it is Spanish and keeps
 * its unprefixed routes, so `/app` or `/organizations/…` never negotiate.
 *
 * Spanish is the default: Studio launches in Colombia. The negotiation mirrors
 * the one in `apps/space-web` on purpose rather than through a shared package:
 * it is a few lines, and each site owns which languages it offers and where it
 * negotiates — Space prefixes every page, Studio only its landing.
 */

export const LOCALES = ['es', 'en'] as const
export type Locale = (typeof LOCALES)[number]
export const DEFAULT_LOCALE: Locale = 'es'

export function isLocale(value: string): value is Locale {
  return LOCALES.some((locale) => locale === value)
}

/** The supported language an `Accept-Language` header prefers, by weight. */
export function preferredLocale(header: string | null): Locale {
  if (!header) return DEFAULT_LOCALE
  const ranked = header
    .split(',')
    .map((part, position) => {
      const [tag = '', ...params] = part.trim().split(';')
      const weight = params.map((param) => param.trim()).find((param) => param.startsWith('q='))
      const quality = weight ? Number(weight.slice(2)) : 1
      return { language: tag.toLowerCase().split('-')[0] ?? '', quality, position }
    })
    .filter(({ quality }) => Number.isFinite(quality) && quality > 0)
    .sort((left, right) => right.quality - left.quality || left.position - right.position)
  for (const { language } of ranked) {
    if (isLocale(language)) return language
  }
  return DEFAULT_LOCALE
}

/** Whether a path is the landing in one of its languages, such as `/en`. */
export function isLandingPath(pathname: string): boolean {
  return LOCALES.some((locale) => pathname === `/${locale}`)
}
