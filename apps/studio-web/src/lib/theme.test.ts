import { afterEach, beforeEach, expect, test } from 'bun:test'

import {
  followAccountTheme,
  isStudioTheme,
  rememberStudioTheme,
  rememberedStudioTheme,
  showStudioTheme,
  shownStudioTheme,
  STUDIO_DEFAULT_THEME,
  STUDIO_THEME_STORAGE_KEY,
  studioThemeScript,
  subscribeToStudioTheme,
} from './theme'

let values: Map<string, string>
let attributes: Map<string, string>
let listeners: Map<string, Set<(event: Event) => void>>

beforeEach(() => {
  values = new Map()
  attributes = new Map()
  listeners = new Map()
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
    },
  })
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: {
      documentElement: {
        getAttribute: (name: string) => attributes.get(name) ?? null,
        setAttribute: (name: string, value: string) => attributes.set(name, value),
      },
    },
  })
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      addEventListener: (type: string, listener: (event: Event) => void) => {
        const registered = listeners.get(type) ?? new Set()
        registered.add(listener)
        listeners.set(type, registered)
      },
      removeEventListener: (type: string, listener: (event: Event) => void) => {
        listeners.get(type)?.delete(listener)
      },
      dispatchEvent: (event: Event) => {
        for (const listener of listeners.get(event.type) ?? []) listener(event)
        return true
      },
    },
  })
})

afterEach(() => {
  Reflect.deleteProperty(globalThis, 'localStorage')
  Reflect.deleteProperty(globalThis, 'document')
  Reflect.deleteProperty(globalThis, 'window')
})

function otherTabWrote(key: string) {
  const event = Object.assign(new Event('storage'), { key })
  for (const listener of listeners.get('storage') ?? []) listener(event)
}

test('Studio is dark until somebody chooses otherwise', () => {
  expect(STUDIO_DEFAULT_THEME).toBe('dark')
  expect(shownStudioTheme()).toBe('dark')
  expect(rememberedStudioTheme()).toBeUndefined()
})

test('only the two themes are a theme', () => {
  expect(isStudioTheme('dark')).toBeTrue()
  expect(isStudioTheme('light')).toBeTrue()
  expect(isStudioTheme('system')).toBeFalse()
  expect(isStudioTheme(null)).toBeFalse()
})

test('the browser remembers the answer and forgets it on null', () => {
  rememberStudioTheme('light')
  expect(values.get(STUDIO_THEME_STORAGE_KEY)).toBe('light')
  expect(rememberedStudioTheme()).toBe('light')

  rememberStudioTheme(null)
  expect(values.has(STUDIO_THEME_STORAGE_KEY)).toBeFalse()
  expect(rememberedStudioTheme()).toBeUndefined()
})

test('a value nobody wrote is not remembered', () => {
  values.set(STUDIO_THEME_STORAGE_KEY, 'sepia')
  expect(rememberedStudioTheme()).toBeUndefined()
})

test('a store that throws is a browser that remembers nothing', () => {
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: () => {
        throw new Error('blocked')
      },
      setItem: () => {
        throw new Error('blocked')
      },
      removeItem: () => {
        throw new Error('blocked')
      },
    },
  })
  expect(rememberedStudioTheme()).toBeUndefined()
  expect(() => rememberStudioTheme('light')).not.toThrow()
  expect(() => rememberStudioTheme(null)).not.toThrow()
})

test('showing a theme tells whoever listens, once per change', () => {
  let told = 0
  const stop = subscribeToStudioTheme(() => {
    told += 1
  })

  showStudioTheme('light')
  expect(shownStudioTheme()).toBe('light')
  expect(told).toBe(1)

  showStudioTheme('light')
  expect(told).toBe(1)

  stop()
  showStudioTheme('dark')
  expect(told).toBe(1)
})

test('what the account answers is shown and remembered', () => {
  followAccountTheme('light')
  expect(shownStudioTheme()).toBe('light')
  expect(rememberedStudioTheme()).toBe('light')
})

test('an account with no choice shows the default and leaves nothing remembered', () => {
  followAccountTheme('light')

  followAccountTheme(null)
  expect(shownStudioTheme()).toBe('dark')
  expect(values.has(STUDIO_THEME_STORAGE_KEY)).toBeFalse()
})

test('a change in another tab is followed here', () => {
  const stop = subscribeToStudioTheme(() => undefined)

  values.set(STUDIO_THEME_STORAGE_KEY, 'light')
  otherTabWrote(STUDIO_THEME_STORAGE_KEY)
  expect(shownStudioTheme()).toBe('light')

  values.delete(STUDIO_THEME_STORAGE_KEY)
  otherTabWrote(STUDIO_THEME_STORAGE_KEY)
  expect(shownStudioTheme()).toBe('dark')

  values.set(STUDIO_THEME_STORAGE_KEY, 'light')
  otherTabWrote('some-other-key')
  expect(shownStudioTheme()).toBe('dark')
  stop()
})

test('the opening script writes only a known theme', () => {
  const script = studioThemeScript()
  expect(script).toContain(JSON.stringify(STUDIO_THEME_STORAGE_KEY))
  expect(script).toContain("t==='light'||t==='dark'")
  expect(script).toContain("setAttribute('data-afo-theme',t)")

  const run = new Function('localStorage', 'document', script)
  values.set(STUDIO_THEME_STORAGE_KEY, 'light')
  run(globalThis.localStorage, globalThis.document)
  expect(attributes.get('data-afo-theme')).toBe('light')

  attributes.clear()
  values.set(STUDIO_THEME_STORAGE_KEY, '"><script>')
  run(globalThis.localStorage, globalThis.document)
  expect(attributes.has('data-afo-theme')).toBeFalse()
})
