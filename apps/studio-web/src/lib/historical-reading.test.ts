import { describe, expect, test } from 'bun:test'

import {
  cutLine,
  decisionLine,
  goalStatusLabel,
  historicalSections,
  nutrientName,
  readFailure,
  targetLine,
} from './historical-reading'
import type { ClientNutritionGoalTarget, ScopeCode } from './studio-api'

function frozen(...codes: ScopeCode[]) {
  return codes.map((code) => ({ code, version: 1, frozen_at: '2025-06-30T22:41:19.204Z' }))
}

function target(overrides: Partial<ClientNutritionGoalTarget> = {}): ClientNutritionGoalTarget {
  return {
    nutrient_code: 'protein',
    mode: 'minimum',
    minimum: 120,
    maximum: null,
    exact: null,
    unit: 'g',
    ...overrides,
  }
}

describe('HU-062 criterion 2: only what has a historical read is drawn', () => {
  test('one section per read, in a fixed order', () => {
    expect(
      historicalSections(
        frozen('nutrition_guidance', 'body_progress', 'relationship_training', 'health_context'),
      ),
    ).toEqual(['sessions', 'body', 'nutrition'])
  })

  test('either training category opens the sessions, once', () => {
    expect(historicalSections(frozen('prior_training_history'))).toEqual(['sessions'])
    expect(historicalSections(frozen('relationship_training', 'prior_training_history'))).toEqual([
      'sessions',
    ])
  })

  test('health context, photos, intake and the profile have no section at all', () => {
    expect(
      historicalSections(frozen('health_context', 'nutrition_intake', 'nutrition_media')),
    ).toEqual([])
  })
})

describe('HU-062 criterion 1: nothing after the cut exists', () => {
  test('says the instant of the cut', () => {
    expect(cutLine('2025-06-30T22:41:19.204Z')).toStartWith('Hasta el corte: ')
  })
})

describe('the goals this relationship proposed, as they stood at the cut', () => {
  test('says where each one stood', () => {
    expect(goalStatusLabel('proposed')).toBe('Propuesto')
    expect(goalStatusLabel('accepted')).toBe('Aceptado')
    expect(goalStatusLabel('superseded')).toBe('Reemplazado')
    expect(goalStatusLabel(null)).toBeNull()
  })

  test('names every published nutrient', () => {
    expect(nutrientName('energy')).toBe('Energía')
    expect(nutrientName('thiamin')).toBe('Vitamina B1')
  })

  test('says a target the way it was set', () => {
    expect(targetLine(target())).toBe('Proteína: al menos 120 g')
    expect(targetLine(target({ mode: 'maximum', minimum: null, maximum: 70 }))).toBe(
      'Proteína: hasta 70 g',
    )
    expect(targetLine(target({ mode: 'range', minimum: 200, maximum: 250 }))).toBe(
      'Proteína: entre 200 y 250 g',
    )
    expect(
      targetLine(
        target({
          nutrient_code: 'energy',
          mode: 'exact',
          minimum: null,
          exact: 2100,
          unit: 'kcal',
        }),
      ),
    ).toBe('Energía: 2.100 kcal')
  })

  test('a target with nothing readable is left out', () => {
    expect(
      targetLine(
        target({ nutrient_code: null, mode: null, minimum: null, maximum: null, unit: null }),
      ),
    ).toBeNull()
  })

  test('says what she decided, and when', () => {
    expect(decisionLine({ decision: 'accepted', decided_at: '2025-05-10T15:00:00Z' })).toStartWith(
      'Lo aceptó el ',
    )
    expect(decisionLine({ decision: 'rejected', decided_at: '2025-05-10T15:00:00Z' })).toStartWith(
      'Lo rechazó el ',
    )
    expect(decisionLine(null)).toBeNull()
  })
})

describe('what a read through the case can answer', () => {
  test('an old sign-in asks to sign in again', () => {
    expect(readFailure(403, 'reauthentication-required')).toBe('reauthenticate')
  })

  test('criterion 8: a category kept from her reads like nothing there', () => {
    expect(readFailure(403, 'scope-required')).toBe('nothing')
  })

  test('criterion 7: a case that no longer serves, whatever the reason', () => {
    expect(readFailure(404, 'not-found')).toBe('gone')
    expect(readFailure(403, 'forbidden')).toBe('gone')
  })

  test('anything else is worth another try', () => {
    expect(readFailure(503, 'upstream-unavailable')).toBe('retry')
    expect(readFailure(0, 'network')).toBe('retry')
  })
})
