/**
 * Which language the app speaks, and how that language is written by `Intl`.
 *
 * Space speaks Spanish and English. Spanish is the product's own language and the
 * fallback for everything else: a phone set to French or Portuguese gets Spanish, and
 * only a phone set to English gets English.
 *
 * **The device language is read through `Intl`, not a native module.** Hermes answers
 * `Intl.DateTimeFormat().resolvedOptions().locale` from the platform on both iOS and
 * Android, so no dependency is needed; `deviceTimezone()` already relies on the same
 * call. On iOS that locale is the app's resolved localization, which is why `app.json`
 * declares `CFBundleLocalizations` — without it every iPhone would answer English.
 *
 * **Language is not region.** The app locale says which words to use; `intlLocale()` is
 * the one place that turns it into the tag `Intl` formats numbers and dates with. Spanish
 * writes as Colombia does (`1.234,5`), where V1 operates; English as the United States.
 */

export type Locale = 'es' | 'en'

export const LOCALES: readonly Locale[] = ['es', 'en']

export const DEFAULT_LOCALE: Locale = 'es'

const INTL_LOCALE: Readonly<Record<Locale, string>> = { es: 'es-CO', en: 'en-US' }

/** The tag `Intl` and `toLocaleString` format with for an app locale. */
export function intlLocale(locale: Locale): string {
  return INTL_LOCALE[locale]
}

/** `en`, `en-US`, `en_GB` → English; anything else, including nothing, → Spanish. */
export function localeFromTag(tag: string | null | undefined): Locale {
  const language = (tag ?? '').trim().toLowerCase().split(/[-_]/)[0]
  return language === 'en' ? 'en' : DEFAULT_LOCALE
}

/** Whether a stored value names a locale the app speaks, for preferences read from outside. */
export function isLocale(value: unknown): value is Locale {
  return value === 'es' || value === 'en'
}

const intlTag = (): string => Intl.DateTimeFormat().resolvedOptions().locale

/** The language the phone is set to; `Intl` can throw without ICU data, so it is guarded. */
export function deviceLocale(readTag: () => string | undefined = intlTag): Locale {
  try {
    return localeFromTag(readTag())
  } catch {
    return DEFAULT_LOCALE
  }
}
