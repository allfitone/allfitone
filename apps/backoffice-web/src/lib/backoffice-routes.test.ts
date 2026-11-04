import { describe, expect, test } from 'bun:test'

import {
  BACKOFFICE_AREAS,
  BACKOFFICE_ROUTES,
  currentBackofficeRoute,
  routesInArea,
} from './backoffice-routes'

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

describe('the areas the menu is grouped by', () => {
  test('place every entry in exactly one area, and leave no area empty', () => {
    const grouped = BACKOFFICE_AREAS.flatMap((area) => routesInArea(area))
    expect(grouped).toHaveLength(BACKOFFICE_ROUTES.length)
    for (const area of BACKOFFICE_AREAS) expect(routesInArea(area)).not.toHaveLength(0)
  })

  // A nested screen opens with the same duty as its parent, so it sits under the same heading.
  test('keep a nested screen in the area of its parent', () => {
    expect(currentBackofficeRoute('/catalogue/result-contracts')?.area).toBe(
      currentBackofficeRoute('/catalogue')?.area,
    )
  })

  test('keep the menu order inside an area', () => {
    expect(routesInArea('A12').map((route) => route.title)).toEqual([
      'Equipo de Allfit One',
      'Registro de accesos',
      'Acceso excepcional',
      'Solicitudes de eliminación',
      'Definiciones de permiso',
    ])
  })
})
