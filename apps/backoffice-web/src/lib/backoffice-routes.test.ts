import { describe, expect, test } from 'bun:test'

import { BACKOFFICE_ROUTES, currentBackofficeRoute } from './backoffice-routes'

describe('the navigation entry a screen belongs to', () => {
  test('picks the most specific entry, not the first prefix that matches', () => {
    expect(currentBackofficeRoute('/catalogue/result-contracts')?.title).toBe(
      'Reglas de resultados',
    )
    expect(currentBackofficeRoute('/catalogue')?.title).toBe('Catálogo global')
    expect(currentBackofficeRoute('/catalogue/disciplines/abc')?.title).toBe('Catálogo global')
  })

  test('does not mistake a sibling path for a child', () => {
    expect(currentBackofficeRoute('/catalogues')).toBeUndefined()
  })

  test('lights no entry for a screen outside the menu', () => {
    expect(currentBackofficeRoute('/')).toBeUndefined()
  })

  // Order in the menu is presentation; it must never decide which entry is lit.
  test('does not depend on the order the menu lists its entries in', () => {
    const reversed = [...BACKOFFICE_ROUTES].reverse()
    expect(currentBackofficeRoute('/catalogue/result-contracts', reversed)?.href).toBe(
      '/catalogue/result-contracts',
    )
  })
})
