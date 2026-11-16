import { describe, expect, test } from 'bun:test'

import { LEGAL_URLS, legalUrl } from './legal'

describe('legal documents', () => {
  test('point at www.allfit.one, in the same language', () => {
    expect(legalUrl('es', 'terms')).toBe('https://www.allfit.one/es/legal/terms')
    expect(legalUrl('en', 'privacy')).toBe('https://www.allfit.one/en/legal/privacy')
    expect(legalUrl('es', 'analytics')).toBe('https://www.allfit.one/es/legal/analytics')
  })

  test('the workspace links the Spanish ones', () => {
    expect(LEGAL_URLS).toEqual({
      terms: 'https://www.allfit.one/es/legal/terms',
      privacy: 'https://www.allfit.one/es/legal/privacy',
    })
  })
})
