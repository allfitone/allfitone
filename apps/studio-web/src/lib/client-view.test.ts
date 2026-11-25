import { afterEach, beforeEach, expect, test } from 'bun:test'

import {
  CLIENTS_VIEW_STORAGE_KEY,
  chooseClientView,
  shownClientView,
  subscribeToClientView,
} from './client-view'

let values: Map<string, string>
let listeners: Map<string, Set<(event: Event) => void>>

beforeEach(() => {
  values = new Map()
  listeners = new Map()
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
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
    },
  })
})

afterEach(() => {
  // The module keeps this visit's choice, so each test starts from the stored
  // answer rather than from the last test's.
  chooseClientView('rows')
  values.clear()
  Reflect.deleteProperty(globalThis, 'localStorage')
  Reflect.deleteProperty(globalThis, 'window')
})

function otherTabWrote(key: string) {
  const event = Object.assign(new Event('storage'), { key })
  for (const listener of listeners.get('storage') ?? []) listener(event)
}

/*
 * Rows, not cards: these registers have drawn a table wherever one fits since
 * they were written, and the switch is a preference over that, not a new
 * default. The library starts from cards and is a different screen.
 */
test('a reader who never chose gets the table these registers always drew', () => {
  const unsubscribe = subscribeToClientView(() => {})
  otherTabWrote(CLIENTS_VIEW_STORAGE_KEY)

  expect(shownClientView()).toBe('rows')
  expect(values.has(CLIENTS_VIEW_STORAGE_KEY)).toBeFalse()
  unsubscribe()
})

test('the browser remembers the answer', () => {
  chooseClientView('cards')

  expect(values.get(CLIENTS_VIEW_STORAGE_KEY)).toBe('cards')
  expect(shownClientView()).toBe('cards')
})

test('a value nobody wrote is not a view', () => {
  const unsubscribe = subscribeToClientView(() => {})
  values.set(CLIENTS_VIEW_STORAGE_KEY, 'mosaico')
  otherTabWrote(CLIENTS_VIEW_STORAGE_KEY)

  expect(shownClientView()).toBe('rows')
  unsubscribe()
})

/* A browser with storage blocked still holds the choice for this visit. */
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
    },
  })

  chooseClientView('cards')
  expect(shownClientView()).toBe('cards')
})

test('choosing tells whoever is listening, and unsubscribing stops it', () => {
  let told = 0
  const unsubscribe = subscribeToClientView(() => {
    told += 1
  })

  chooseClientView('cards')
  expect(told).toBe(1)

  unsubscribe()
  chooseClientView('rows')
  expect(told).toBe(1)
})

/* Another tab is the same person: what she chose there is what she sees here. */
test('a change in another tab is followed here', () => {
  let told = 0
  const unsubscribe = subscribeToClientView(() => {
    told += 1
  })

  values.set(CLIENTS_VIEW_STORAGE_KEY, 'cards')
  otherTabWrote(CLIENTS_VIEW_STORAGE_KEY)

  expect(told).toBe(1)
  expect(shownClientView()).toBe('cards')
  unsubscribe()
})

test('a write under another key is not ours to follow', () => {
  let told = 0
  const unsubscribe = subscribeToClientView(() => {
    told += 1
  })

  otherTabWrote('allfit-studio-library-view:v1')

  expect(told).toBe(0)
  unsubscribe()
})
