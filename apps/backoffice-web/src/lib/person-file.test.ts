import { describe, expect, test } from 'bun:test'

import { personFileHref, personTabFromQuery } from './person-file'

const PERSON = '019a5000-0000-7000-8000-000000000001'

describe('the address of a person file', () => {
  test('opens on her state, which needs no parameter', () => {
    expect(personFileHref(PERSON, '')).toBe(`/people/${PERSON}`)
    expect(personFileHref(PERSON, '', 'state')).toBe(`/people/${PERSON}`)
  })

  test('carries the case, and the tab after it', () => {
    expect(personFileHref(PERSON, 'CASE-2026-001')).toBe(
      `/people/${PERSON}?case_reference=CASE-2026-001`,
    )
    expect(personFileHref(PERSON, 'CASE-2026-001', 'payments')).toBe(
      `/people/${PERSON}?case_reference=CASE-2026-001&tab=payments`,
    )
    expect(personFileHref(PERSON, '', 'recovery')).toBe(`/people/${PERSON}?tab=recovery`)
  })

  test('reads an unknown or missing tab as her state', () => {
    expect(personTabFromQuery('payments')).toBe('payments')
    expect(personTabFromQuery('recovery')).toBe('recovery')
    expect(personTabFromQuery('pagos')).toBe('state')
    expect(personTabFromQuery(null)).toBe('state')
  })
})
