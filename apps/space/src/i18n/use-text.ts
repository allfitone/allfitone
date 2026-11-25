/**
 * The hooks a screen reads its language through.
 *
 * They subscribe to the in-memory locale with `useSyncExternalStore`, so `setLocale()`
 * re-renders every component that reads text, immediately and without a provider.
 */

import { useSyncExternalStore } from 'react'

import { getLocale, intlLocale, subscribeLocale, textFor, type Dictionary, type Locale } from '.'

export function useLocale(): Locale {
  return useSyncExternalStore(subscribeLocale, getLocale, getLocale)
}

/** The words of the locale the app is speaking. */
export function useText(): Dictionary {
  return textFor(useLocale())
}

/** The `Intl` tag for numbers and dates, for a screen that formats one itself. */
export function useIntlLocale(): string {
  return intlLocale(useLocale())
}
