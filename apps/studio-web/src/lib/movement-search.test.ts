import { describe, expect, test } from 'bun:test'

import {
  disciplineName,
  flattenMovementPages,
  movementEmptyMessage,
  movementScopeLabel,
  movementSearchTerm,
} from './movement-search.js'
import type { StudioMovement } from './studio-api.js'

function movement(id: string, name: string, scope: 'global' | 'organization'): StudioMovement {
  return {
    id,
    discipline_code: 'strength',
    name,
    scope,
    archived: false,
    muscles: [],
    equipment: [],
    demo_url: null,
  }
}

describe('the term a search sends', () => {
  test('is trimmed, and a blank one sends nothing', () => {
    expect(movementSearchTerm('  sentadilla ')).toBe('sentadilla')
    expect(movementSearchTerm('   ')).toBeUndefined()
  })
})

describe('whose a movement is', () => {
  // Criterion 1: the library and the gym's own, side by side and told apart.
  test('the global library and the gym’s own read differently', () => {
    expect(movementScopeLabel('global')).toBe('Catálogo de Allfit')
    expect(movementScopeLabel('organization')).toBe('Propio')
  })
})

describe('the discipline a movement belongs to', () => {
  test('is shown by name, and by code only when the catalogue has none', () => {
    const catalogue = [{ code: 'strength', name: 'Fuerza' }]
    expect(disciplineName('strength', catalogue)).toBe('Fuerza')
    expect(disciplineName('yoga', catalogue)).toBe('yoga')
  })
})

describe('the pages of a search', () => {
  test('read as one list, without repeating a movement two pages share', () => {
    const squat = movement('a', 'Sentadilla', 'global')
    const press = movement('b', 'Press de banca', 'organization')
    const pages = {
      pages: [
        { data: [squat], page: { has_more: true, next_cursor: 'cursor-0000000001' } },
        { data: [squat, press], page: { has_more: false, next_cursor: null } },
      ],
      pageParams: [null, 'cursor-0000000001'],
    }
    expect(flattenMovementPages(pages).map((entry) => entry.id)).toEqual(['a', 'b'])
    expect(flattenMovementPages(undefined)).toEqual([])
  })
})

describe('a search that finds nothing', () => {
  test('names the term, and says accents count, because the server does not fold them', () => {
    expect(movementEmptyMessage({ term: 'press banca', includeArchived: false })).toEqual({
      title: 'Ningún movimiento coincide con «press banca»',
      description:
        'La búsqueda mira el nombre y los otros nombres, y distingue las tildes. Prueba con menos letras.',
    })
  })

  test('without a term says the discipline is empty', () => {
    expect(movementEmptyMessage({ term: undefined, includeArchived: false }).title).toBe(
      'Todavía no hay movimientos aquí',
    )
  })

  test('with archived excluded says where they went', () => {
    expect(movementEmptyMessage({ term: undefined, includeArchived: false }).description).toContain(
      'Los archivados solo aparecen si los incluyes.',
    )
    expect(
      movementEmptyMessage({ term: undefined, includeArchived: true }).description,
    ).not.toContain('archivados')
  })
})
