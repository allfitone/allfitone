import { describe, expect, test } from 'bun:test'

import {
  activeOriginLine,
  activeSinceLine,
  decisionLine,
  proposalStatusLabel,
  proposedLine,
  targetLine,
  targetLines,
} from './nutrition-goals'
import type { ClientNutritionGoalTarget } from './studio-api'

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

describe('a target, said the way it was set', () => {
  test('each of the four modes', () => {
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

  test('a field her version withholds is left out, never guessed', () => {
    expect(targetLine(target({ mode: null }))).toBe('Proteína')
    expect(targetLine(target({ nutrient_code: null }))).toBe('al menos 120 g')
    expect(targetLine(target({ unit: null }))).toBe('Proteína: al menos 120')
  })

  test('energy and the macros come first, whatever order they arrive in', () => {
    expect(
      targetLines([
        target({ nutrient_code: 'water', minimum: 2000, unit: 'ml' }),
        target(),
        target({ nutrient_code: null, mode: null, minimum: null, unit: null }),
        target({
          nutrient_code: 'energy',
          mode: 'maximum',
          minimum: null,
          maximum: 2200,
          unit: 'kcal',
        }),
      ]),
    ).toEqual(['Energía: hasta 2.200 kcal', 'Proteína: al menos 120 g', 'Agua: al menos 2.000 ml'])
  })
})

describe('what she decided, and when', () => {
  test('accepted or rejected, with the day', () => {
    expect(decisionLine({ decision: 'accepted', decided_at: '2025-05-10T15:00:00Z' })).toStartWith(
      'Lo aceptó el ',
    )
    expect(decisionLine({ decision: 'rejected', decided_at: '2025-05-10T15:00:00Z' })).toStartWith(
      'Lo rechazó el ',
    )
    expect(decisionLine(null)).toBeNull()
  })

  test('the day a proposal was made', () => {
    expect(proposedLine('2025-05-02T15:00:00Z')).toStartWith('Propuesto el ')
    expect(proposedLine('2025-05-02T15:00:00Z')).toContain('2025')
  })
})

describe('HU-070: where each proposal of this relationship stands today', () => {
  test('one phrase for each state', () => {
    expect(proposalStatusLabel('proposed')).toBe('Esperando su decisión')
    expect(proposalStatusLabel('active')).toBe('Lo sigue hoy')
    expect(proposalStatusLabel('rejected')).toBe('Rechazado')
    expect(proposalStatusLabel('superseded')).toBe('Reemplazado')
    expect(proposalStatusLabel('cancelled')).toBe('Cancelado')
  })
})

describe('her active goal, which says little about itself', () => {
  test('since when she follows it, when that is known', () => {
    expect(activeSinceLine('2025-05-03T15:00:00Z')).toStartWith('Lo sigue desde el ')
    expect(activeSinceLine(null)).toBeNull()
  })

  test('its origin only when it is this relationship’s, and nothing otherwise', () => {
    expect(activeOriginLine({ from_this_relationship: true })).toBe(
      'Es una propuesta de esta relación que ella aceptó.',
    )
    expect(activeOriginLine({ from_this_relationship: false })).toBeNull()
  })
})
