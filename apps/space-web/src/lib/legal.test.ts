import { describe, expect, test } from 'bun:test'

import { legalUrl } from './legal'

describe('legalUrl', () => {
  test('points at the document on www.allfit.one, in the same language', () => {
    expect(legalUrl('es', 'terms')).toBe('https://www.allfit.one/es/legal/terms')
    expect(legalUrl('en', 'privacy')).toBe('https://www.allfit.one/en/legal/privacy')
    expect(legalUrl('es', 'analytics')).toBe('https://www.allfit.one/es/legal/analytics')
  })
})
