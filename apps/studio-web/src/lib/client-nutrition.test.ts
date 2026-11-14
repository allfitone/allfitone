import { describe, expect, test } from 'bun:test'

import {
  defaultNutritionRange,
  mealDays,
  mealItemRows,
  mealPhoto,
  mealTimeLine,
  mealTitle,
  nutritionDayHeading,
  rangeProblem,
  rangeProblemText,
} from './client-nutrition'
import type { ClientNutritionMeal, ClientNutritionMealItem } from './studio-api'

function meal(overrides: Partial<ClientNutritionMeal> = {}): ClientNutritionMeal {
  return {
    id: 'meal-1',
    occurred_at: '2026-07-28T17:30:00.000Z',
    local_date: '2026-07-28',
    timezone: 'America/Bogota',
    meal_type: 'lunch',
    note: null,
    has_photo: null,
    items: [],
    ...overrides,
  }
}

function item(overrides: Partial<ClientNutritionMealItem> = {}): ClientNutritionMealItem {
  return {
    position: 1,
    name: 'Pollo con arroz',
    quantity: 320,
    quantity_unit: 'g',
    serving: null,
    origin: 'typed',
    nutrients: null,
    ...overrides,
  }
}

// Intl may separate «p. m.» with a narrow space; the words are what matter.
function plain(text: string | null): string | null {
  return text === null ? null : text.replace(/\s/g, ' ')
}

describe('the days she is read for', () => {
  /*
   * Built from the reader's own calendar, not from UTC: at 9 p.m. in Bogotá it
   * is already tomorrow in UTC, and the range would skip today.
   */
  test('are the last seven, today included, by the reader calendar', () => {
    expect(defaultNutritionRange(new Date(2026, 10, 13, 21, 0))).toEqual({
      from: '2026-11-07',
      to: '2026-11-13',
    })
  })

  test('cross a month and a year as days, not as numbers', () => {
    expect(defaultNutritionRange(new Date(2027, 0, 3, 8, 0))).toEqual({
      from: '2026-12-28',
      to: '2027-01-03',
    })
  })

  test('may be one day, or thirty-one, and no more', () => {
    expect(rangeProblem({ from: '2026-11-13', to: '2026-11-13' })).toBeNull()
    expect(rangeProblem({ from: '2026-10-14', to: '2026-11-13' })).toBeNull()
    expect(rangeProblem({ from: '2026-10-13', to: '2026-11-13' })).toBe('too-long')
  })

  test('cannot end before they start, nor miss an end', () => {
    expect(rangeProblem({ from: '2026-11-13', to: '2026-11-12' })).toBe('reversed')
    expect(rangeProblem({ from: '', to: '2026-11-13' })).toBe('missing')
    expect(rangeProblem({ from: '2026-11-13', to: '' })).toBe('missing')
  })

  test('and each problem is said in a sentence', () => {
    expect(rangeProblemText('missing')).toBe('Elige las dos fechas.')
    expect(rangeProblemText('reversed')).toBe('«Hasta» no puede ir antes de «Desde».')
    expect(rangeProblemText('too-long')).toBe('Puedes consultar hasta 31 días seguidos.')
  })
})

describe('a meal, in the fields her version shares', () => {
  test('is called by its type, and by a plain word when the type is withheld', () => {
    expect(mealTitle('breakfast')).toBe('Desayuno')
    expect(mealTitle('snack')).toBe('Snack')
    expect(mealTitle('other')).toBe('Otra comida')
    expect(mealTitle(null)).toBe('Comida')
  })

  test('says the hour it was in her zone', () => {
    expect(plain(mealTimeLine(meal()))).toBe('12:30 p. m.')
  })

  // Without her zone, any hour would be the reader's, and could be the wrong one.
  test('says no hour when her zone is withheld', () => {
    expect(mealTimeLine(meal({ timezone: null }))).toBeNull()
  })

  /*
   * `has_photo` has three values. Null is «she does not share photos», not «no
   * photo»: drawing it as false would claim the meal had none.
   */
  test('says whether it has a photo only when she shares photos', () => {
    expect(mealPhoto(meal({ has_photo: true }))).toBe('attached')
    expect(mealPhoto(meal({ has_photo: false }))).toBe('none')
    expect(mealPhoto(meal({ has_photo: null }))).toBeNull()
  })
})

describe('what she ate, item by item', () => {
  test('a food and its grams', () => {
    expect(mealItemRows([item()]).map((row) => row.line)).toEqual(['Pollo con arroz · 320 g'])
  })

  test('the portion as she said it, with its grams when they say something else', () => {
    expect(
      mealItemRows([item({ name: 'Arroz', quantity: 240, serving: '1 ½ tazas' })]).map(
        (row) => row.line,
      ),
    ).toEqual(['Arroz · 1 ½ tazas (240 g)'])
    expect(
      mealItemRows([item({ name: 'Avena', quantity: 75, serving: '75 g' })]).map((row) => row.line),
    ).toEqual(['Avena · 75 g'])
  })

  // A number with no unit says nothing true, so it is not half-drawn.
  test('a quantity whose unit is withheld is left out', () => {
    expect(mealItemRows([item({ quantity_unit: null })]).map((row) => row.line)).toEqual([
      'Pollo con arroz',
    ])
  })

  test('its nutrients, energy and the macros first', () => {
    const [row] = mealItemRows([
      item({
        nutrients: [
          { nutrient_code: 'protein', value: 42, unit: 'g' },
          { nutrient_code: 'energy', value: 520, unit: 'kcal' },
        ],
      }),
    ])
    expect(row?.nutrients).toBe('Energía 520 kcal · Proteína 42 g')
  })

  test('nutrients withheld are no line at all, not zeros', () => {
    const [withheld] = mealItemRows([item({ nutrients: null })])
    const [none] = mealItemRows([item({ nutrients: [] })])
    expect(withheld?.nutrients).toBeNull()
    expect(none?.nutrients).toBeNull()
  })

  test('an item with nothing her version shares is not drawn', () => {
    const rows = mealItemRows([
      item({ position: 1 }),
      item({ position: 2, name: null, quantity: null, quantity_unit: null, nutrients: null }),
    ])
    expect(rows.map((row) => row.item.position)).toEqual([1])
  })
})

describe('her meals, by the day she ate them', () => {
  test('one group per day of hers, newest first as they arrived', () => {
    const days = mealDays([
      meal({ id: 'dinner-28', local_date: '2026-07-28' }),
      meal({ id: 'lunch-28', local_date: '2026-07-28' }),
      meal({ id: 'dinner-27', local_date: '2026-07-27' }),
    ])
    expect(days.map((day) => [day.day, day.meals.map((one) => one.id)])).toEqual([
      ['2026-07-28', ['dinner-28', 'lunch-28']],
      ['2026-07-27', ['dinner-27']],
    ])
  })

  test('nothing eaten is no group at all', () => {
    expect(mealDays([])).toEqual([])
  })

  // Her day, not the reader's: a calendar day read as midnight UTC would slip back.
  test('each day is named as the calendar day it was', () => {
    expect(nutritionDayHeading('2026-07-28')).toBe('Martes, 28 de julio de 2026')
  })
})
