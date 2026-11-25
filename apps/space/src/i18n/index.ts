/**
 * The app's languages: which one is spoken, the words for it, and how `Intl` writes it.
 *
 * Screens read words with `useText()` (from `use-text.ts`, which needs React). Everything
 * in `src/client` stays pure and testable under `bun test`: a function that words
 * something takes the dictionary area it needs — `planCaption(status, text.profile)` — and
 * one that formats a number or a date takes the `Locale`. Nothing reads the current
 * locale behind the caller's back.
 */

import { en } from './en'
import { es, type Dictionary } from './es'
import type { Locale } from './locale'

export type { Dictionary } from './es'
export {
  DEFAULT_LOCALE,
  LOCALES,
  deviceLocale,
  intlLocale,
  isLocale,
  localeFromTag,
  type Locale,
} from './locale'
export { createLocaleStore, getLocale, setLocale, subscribeLocale } from './locale-store'

const DICTIONARIES: Readonly<Record<Locale, Dictionary>> = { es, en }

/** The words of one locale. */
export function textFor(locale: Locale): Dictionary {
  return DICTIONARIES[locale]
}
