/**
 * The two languages the site speaks, and how a visitor lands on one.
 *
 * Spanish is the default for everyone: Space launches in Colombia, and a visitor
 * who arrives without a language gets Spanish whatever their browser prefers,
 * as on www.allfit.one. English is one switch away in the header.
 */

export const LOCALES = ['es', 'en'] as const
export type Locale = (typeof LOCALES)[number]
export const DEFAULT_LOCALE: Locale = 'es'

export function isLocale(value: string): value is Locale {
  return LOCALES.some((locale) => locale === value)
}

/** The locale a path already carries in its first segment, if any. */
export function localeFromPath(pathname: string): Locale | null {
  const [, first = ''] = pathname.split('/')
  return isLocale(first) ? first : null
}
