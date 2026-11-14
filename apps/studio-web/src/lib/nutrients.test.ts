import { describe, expect, test } from 'bun:test'

import { inNutrientOrder, nutrientAmount, nutrientName } from './nutrients'
import type { NutrientValue } from './studio-api'

describe('a nutrient, in the words she reads in Space', () => {
  test('names every published nutrient', () => {
    expect(nutrientName('energy')).toBe('Energía')
    expect(nutrientName('thiamin')).toBe('Vitamina B1')
  })

  test('says an amount in its own unit, as a person writes a number here', () => {
    expect(nutrientAmount({ value: 42, unit: 'g' })).toBe('42 g')
    expect(nutrientAmount({ value: 1840, unit: 'kcal' })).toBe('1.840 kcal')
    expect(nutrientAmount({ value: 12.25, unit: 'g' })).toBe('12,3 g')
  })

  /*
   * The API answers in code order, which puts calcium before energy. A reader
   * looks for energy and the macros first, in the same place every day.
   */
  test('puts energy and the macros first, whatever order they arrived in', () => {
    const arrived: NutrientValue[] = [
      { nutrient_code: 'sodium', value: 900, unit: 'mg' },
      { nutrient_code: 'protein', value: 42, unit: 'g' },
      { nutrient_code: 'energy', value: 1840, unit: 'kcal' },
      { nutrient_code: 'carbohydrates', value: 210, unit: 'g' },
    ]
    expect(inNutrientOrder(arrived).map((one) => one.nutrient_code)).toEqual([
      'energy',
      'protein',
      'carbohydrates',
      'sodium',
    ])
  })
})
