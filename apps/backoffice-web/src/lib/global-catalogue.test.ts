import { describe, expect, test } from 'bun:test'

import {
  catalogueCommandMessage,
  catalogueKindLabel,
  catalogueOutcomeMessage,
  catalogueStatusLabel,
  catalogueStatusTone,
  equipmentDraft,
  equipmentInUseExplanation,
  equipmentItems,
  equipmentOutcomeMessage,
  globalCatalogueMessage,
  inUseExplanation,
  isValidCatalogueCode,
  isValidCatalogueName,
  movementEquipmentSentence,
  publishedDisciplines,
  publishedEquipment,
  type BackofficeGlobalCatalogue,
  type GlobalCatalogueEntry,
  type GlobalCatalogueEquipment,
} from './global-catalogue'

function entry(overrides: Partial<GlobalCatalogueEntry> = {}): GlobalCatalogueEntry {
  return {
    kind: 'discipline',
    id: '019b2000-0000-7000-8000-000000000801',
    code: 'test_global_yoga',
    discipline_code: 'test_global_yoga',
    name: 'Yoga',
    status: 'published',
    created_at: '2026-09-16T12:00:00.000Z',
    in_use_count: 0,
    ...overrides,
  }
}

function equipment(overrides: Partial<GlobalCatalogueEquipment> = {}): GlobalCatalogueEquipment {
  return {
    id: '019b2000-0000-7000-8000-000000000811',
    code: 'test_barbell',
    name: 'Barra olímpica',
    status: 'published',
    created_at: '2026-11-04T12:00:00.000Z',
    in_use_count: 0,
    ...overrides,
  }
}

describe('global catalogue presentation', () => {
  test('a code is checked before it travels, and so is a name', () => {
    expect(isValidCatalogueCode('yoga_flow')).toBeTrue()
    expect(isValidCatalogueCode('Yoga Flow')).toBeFalse()
    expect(isValidCatalogueCode('yogá')).toBeFalse()
    expect(isValidCatalogueName('  Yoga  ')).toBeTrue()
    expect(isValidCatalogueName('   ')).toBeFalse()
    expect(isValidCatalogueName('y'.repeat(121))).toBeFalse()
  })

  test('every state reads differently and archived never looks published', () => {
    for (const status of ['draft', 'published', 'deprecated', 'archived'] as const) {
      expect(catalogueStatusLabel(status)).not.toBe('')
    }
    expect(catalogueStatusTone('archived')).not.toBe(catalogueStatusTone('published'))
    expect(catalogueKindLabel('activity_type')).toBe('Tipo de actividad')
  })

  test('what depends on an entry is said before anyone archives it', () => {
    expect(inUseExplanation(entry())).toContain('Nada lo usa')
    expect(inUseExplanation(entry({ in_use_count: 1 }))).toContain('1 referencia.')
    const many = inUseExplanation(entry({ in_use_count: 4 }))
    expect(many).toContain('4 referencias')
    expect(many).toContain('siguen funcionando')
  })

  test('only a published discipline can receive new content', () => {
    const catalogue = {
      disciplines: [entry(), entry({ id: 'x', code: 'old', status: 'archived' })],
      activity_types: [],
      movements: [],
      equipment: [],
      equipment_availability: 'available' as const,
    }
    expect(publishedDisciplines(catalogue).map((item) => item.code)).toEqual(['test_global_yoga'])
  })

  test('the outcome says what publishing and archiving actually did', () => {
    expect(catalogueOutcomeMessage('publish', entry())).toContain('gimnasios y personas')
    const archived = catalogueOutcomeMessage('archive', entry({ status: 'archived' }))
    expect(archived).toContain('Sale de las búsquedas')
    expect(archived).toContain('sigue funcionando')
  })

  // HU-BO-022: equipment is published here, and a movement says what it uses.
  test('equipment says how many movements use it before anyone archives it', () => {
    expect(equipmentInUseExplanation(equipment({ in_use_count: 0 }))).toBe(
      'Ningún movimiento lo usa todavía.',
    )
    expect(equipmentInUseExplanation(equipment({ in_use_count: 1 }))).toContain('1 movimiento')
    expect(equipmentInUseExplanation(equipment({ in_use_count: 3 }))).toContain('3 movimientos')
    expect(equipmentOutcomeMessage('publish', equipment())).toContain('«Barra olímpica»')
    expect(equipmentOutcomeMessage('archive', equipment())).toContain('Sale de las búsquedas')
  })

  test('a movement says what it needs and what is optional, in words', () => {
    expect(movementEquipmentSentence(entry({ kind: 'movement', equipment: [] }))).toBe(
      'No necesita equipamiento.',
    )
    expect(
      movementEquipmentSentence(
        entry({
          kind: 'movement',
          equipment: [
            { code: 'test_barbell', name: 'Barra olímpica', requirement: 'required' },
            { code: 'test_rack', name: 'Rack', requirement: 'required' },
            { code: 'test_bench', name: 'Banco plano', requirement: 'optional' },
          ],
        }),
      ),
    ).toBe('Necesita: Barra olímpica, Rack. Opcional: Banco plano.')
  })

  test('the editor starts from what is stored and sends the whole list', () => {
    const movement = entry({
      kind: 'movement',
      equipment: [{ code: 'test_bench', name: 'Banco plano', requirement: 'optional' }],
    })
    const draft = equipmentDraft(movement)
    expect(draft).toEqual({ test_bench: 'optional' })
    expect(equipmentItems({ ...draft, test_barbell: 'required', test_rack: 'none' })).toEqual([
      { code: 'test_barbell', requirement: 'required' },
      { code: 'test_bench', requirement: 'optional' },
    ])
    expect(equipmentItems({})).toEqual([])
  })

  test('only published equipment can be named by a movement', () => {
    const catalogue: BackofficeGlobalCatalogue = {
      disciplines: [],
      activity_types: [],
      movements: [],
      equipment: [equipment(), equipment({ id: 'x', code: 'test_old', status: 'archived' })],
      equipment_availability: 'available',
    }
    expect(publishedEquipment(catalogue).map((item) => item.code)).toEqual(['test_barbell'])
  })

  test('refusals explain themselves', () => {
    expect(globalCatalogueMessage('forbidden')).toContain('deber de curaduría')
    expect(catalogueCommandMessage('conflict')).toContain('ya nombra otra cosa')
    expect(catalogueCommandMessage('not-found')).toContain('contenido privado')
    expect(catalogueCommandMessage('something-new')).toBe('No se pudo completar la acción.')
  })
})
