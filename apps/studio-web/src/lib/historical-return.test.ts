import { describe, expect, test } from 'bun:test'

import {
  clearCaseDraft,
  readCaseDraft,
  reauthenticationUrl,
  rememberReturn,
  returnBelongsTo,
  saveCaseDraft,
  takeReturn,
  type KeyValueStore,
} from './historical-return'
import type { CaseDraft } from './historical-access'

const ORG = '01991600-1000-7000-8000-000000000002'
const OTHER_ORG = '01991600-1000-7000-8000-000000000004'
const NOW = Date.parse('2026-11-12T15:00:00.000Z')
const MINUTE = 60 * 1000

function memory(): KeyValueStore & { size: () => number } {
  const map = new Map<string, string>()
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => {
      map.set(key, value)
    },
    removeItem: (key) => {
      map.delete(key)
    },
    size: () => map.size,
  }
}

const draft: CaseDraft = {
  relationship: { id: 'rel-1', name: 'Bruno Bello', endedAt: '2026-09-28T16:00:00.000Z' },
  authorized: 'membership-me',
  purpose: 'legal_or_regulatory_obligation',
  reference: 'RAD-2026-114',
  justification: 'Requerimiento de la Superintendencia.',
  hours: 6,
}

describe('signing in again', () => {
  test('asks the provider for fresh credentials', () => {
    expect(reauthenticationUrl('https://api.example.test')).toBe(
      'https://api.example.test/studio/v1/auth/start?reauthenticate=true',
    )
  })
})

describe('coming back to the page after signing in again', () => {
  test('returns once to the page that asked', () => {
    const store = memory()
    const path = `/organizations/${ORG}/historical-access-cases/new`
    rememberReturn(path, NOW, store)
    expect(takeReturn(NOW + MINUTE, store)).toBe(path)
    expect(takeReturn(NOW + MINUTE, store)).toBeUndefined()
  })

  test('returns to the history a case was reading', () => {
    const store = memory()
    const path = `/organizations/${ORG}/historical-access-cases/${OTHER_ORG}?relationship=${ORG}`
    rememberReturn(path, NOW, store)
    expect(takeReturn(NOW, store)).toBe(path)
    expect(returnBelongsTo(path, [ORG])).toBe(true)
  })

  test('returns to the list as well', () => {
    const store = memory()
    rememberReturn(`/organizations/${ORG}/historical-access-cases`, NOW, store)
    expect(takeReturn(NOW, store)).toBe(`/organizations/${ORG}/historical-access-cases`)
  })

  test('never returns anywhere else, whatever was stored', () => {
    for (const path of [
      'https://evil.example.test/organizations',
      '//evil.example.test',
      `/organizations/${ORG}/billing`,
      `/organizations/${ORG}/historical-access-cases/new/../../billing`,
      '/organizations/not-a-uuid/historical-access-cases',
      `/organizations/${ORG}/historical-access-cases/${ORG}?relationship=${ORG}&next=//evil`,
    ]) {
      const store = memory()
      store.setItem('allfit-historical-return:v1', JSON.stringify({ path, savedAt: NOW }))
      expect(takeReturn(NOW, store)).toBeUndefined()
      expect(store.size()).toBe(0)
    }
  })

  test('forgets a return nobody came back for', () => {
    const store = memory()
    rememberReturn(`/organizations/${ORG}/historical-access-cases/new`, NOW, store)
    expect(takeReturn(NOW + 16 * MINUTE, store)).toBeUndefined()
  })

  test('ignores what it cannot read', () => {
    const store = memory()
    store.setItem('allfit-historical-return:v1', '{not json')
    expect(takeReturn(NOW, store)).toBeUndefined()
    expect(takeReturn(NOW, undefined)).toBeUndefined()
  })

  test('belongs to an organization this account still holds', () => {
    const path = `/organizations/${ORG}/historical-access-cases/new`
    expect(returnBelongsTo(path, [ORG])).toBe(true)
    expect(returnBelongsTo(path, [OTHER_ORG])).toBe(false)
  })
})

describe('the draft of a case, kept across the sign-in', () => {
  test('comes back as it was written', () => {
    const store = memory()
    saveCaseDraft(ORG, draft, NOW, store)
    expect(readCaseDraft(ORG, NOW + 5 * MINUTE, store)).toEqual(draft)
  })

  test('belongs to its organization', () => {
    const store = memory()
    saveCaseDraft(ORG, draft, NOW, store)
    expect(readCaseDraft(OTHER_ORG, NOW, store)).toBeUndefined()
  })

  test('is forgotten after half an hour', () => {
    const store = memory()
    saveCaseDraft(ORG, draft, NOW, store)
    expect(readCaseDraft(ORG, NOW + 31 * MINUTE, store)).toBeUndefined()
    expect(store.size()).toBe(0)
  })

  test('is cleared on purpose', () => {
    const store = memory()
    saveCaseDraft(ORG, draft, NOW, store)
    clearCaseDraft(store)
    expect(readCaseDraft(ORG, NOW, store)).toBeUndefined()
  })

  test('refuses a draft of the wrong shape', () => {
    const store = memory()
    store.setItem(
      'allfit-historical-case-draft:v1',
      JSON.stringify({ organizationId: ORG, savedAt: NOW, draft: { ...draft, hours: 99 } }),
    )
    expect(readCaseDraft(ORG, NOW, store)).toBeUndefined()
    store.setItem(
      'allfit-historical-case-draft:v1',
      JSON.stringify({
        organizationId: ORG,
        savedAt: NOW,
        draft: { ...draft, purpose: 'marketing' },
      }),
    )
    expect(readCaseDraft(ORG, NOW, store)).toBeUndefined()
  })
})
