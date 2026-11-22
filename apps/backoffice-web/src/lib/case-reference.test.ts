import { describe, expect, test } from 'bun:test'

import {
  isValidCaseReference,
  isValidOptionalCaseReference,
  normalizeCaseReference,
} from './case-reference'

describe('a case reference', () => {
  test('accepts a structured reference and refuses free prose', () => {
    expect(isValidCaseReference('CASE-2026-001')).toBe(true)
    expect(isValidCaseReference('  SUP-1234  ')).toBe(true)
    expect(isValidCaseReference('ZD-99887')).toBe(true)
    expect(isValidCaseReference('el usuario no puede entrar')).toBe(false)
    expect(isValidCaseReference('')).toBe(false)
  })

  // LUX-POSTEL-01: the reference was refused in lowercase although the screen
  // could write it as the API takes it. Prose stays refused: it has spaces.
  test('takes a reference typed in lowercase, and sends it in capitals', () => {
    expect(isValidCaseReference('case-2026-001')).toBe(true)
    expect(normalizeCaseReference('  case-2026-001 ')).toBe('CASE-2026-001')
  })

  test('takes no case at all, but never a case in free text (ADR-046)', () => {
    expect(isValidOptionalCaseReference('')).toBe(true)
    expect(isValidOptionalCaseReference('   ')).toBe(true)
    expect(isValidOptionalCaseReference('case-2026-001')).toBe(true)
    expect(isValidOptionalCaseReference('el usuario no puede entrar')).toBe(false)
  })
})
