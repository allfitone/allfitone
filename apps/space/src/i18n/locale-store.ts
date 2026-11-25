/**
 * The locale the app is speaking right now, held in memory.
 *
 * It is the device language unless something overrides it. The override is the seam for
 * the person's stored preference (`GET/PUT /space/v1/me/preferences`): whoever reads it
 * calls `setLocale('en')`, and `setLocale(null)` goes back to following the phone.
 *
 * **Changing it re-renders at once.** Every component that reads text subscribes through
 * `useSyncExternalStore` (see `use-text.ts`), so the whole app switches language without a
 * restart and without a provider to mount. Nothing here is persisted: the preference lives
 * on the server, not on the phone.
 */

import { deviceLocale, type Locale } from './locale'

export interface LocaleStore {
  readonly get: () => Locale
  /** A locale to speak regardless of the phone, or null to follow the phone again. */
  readonly set: (locale: Locale | null) => void
  readonly subscribe: (listener: () => void) => () => void
}

/** A store that reads the device once, when first asked, through `readDevice`. */
export function createLocaleStore(readDevice: () => Locale = deviceLocale): LocaleStore {
  let device: Locale | undefined
  let override: Locale | null = null
  const listeners = new Set<() => void>()

  const get = (): Locale => {
    if (override) return override
    device ??= readDevice()
    return device
  }

  return {
    get,
    set: (locale) => {
      const before = get()
      override = locale
      if (get() !== before) listeners.forEach((listener) => listener())
    },
    subscribe: (listener) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
  }
}

const store = createLocaleStore()

export const getLocale = store.get
export const setLocale = store.set
export const subscribeLocale = store.subscribe
