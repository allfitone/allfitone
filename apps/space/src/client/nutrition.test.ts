import { describe, expect, test } from 'bun:test'

import { textFor } from '../i18n'
import {
  averageOfLogged,
  compareTarget,
  emptyItem,
  formFromMeal,
  formTotals,
  itemsFromForm,
  targetText,
  createNutritionFlow,
  dayAfterDeleting,
  deletionHeldNote,
  dayTitle,
  daysBefore,
  emptyDaysNote,
  eatenFor,
  etagOf,
  formFromGoal,
  goalFigure,
  mealPrompt,
  mealTotals,
  goalLine,
  rangeCardCopy,
  rangeProgress,
  remainingFor,
  targetsFromForm,
  type DailySummary,
  type NutritionMeal,
  type NutritionTransport,
  dailyReference,
  mealGrams,
  nutrientFigure,
  NUTRIENT_GROUP,
  type GoalTarget,
  type MealItem,
  unchangedTarget,
} from './nutrition'

const es = textFor('es').nutrition
const en = textFor('en').nutrition

const ZONE = 'America/Bogota'

const meal = (overrides: Partial<NutritionMeal> = {}): NutritionMeal => ({
  id: '019f1000-0000-7000-8000-000000000101',
  occurred_at: '2026-09-30T18:10:00.000Z',
  local_date: '2026-09-30',
  timezone: ZONE,
  meal_type: 'lunch',
  note: null,
  revision_number: 2,
  items: [
    {
      position: 1,
      name: 'Pechuga de pollo',
      quantity: 150,
      quantity_unit: 'g',
      nutrients: [
        { nutrient_code: 'energy', value: 248, unit: 'kcal' },
        { nutrient_code: 'protein', value: 46, unit: 'g' },
        { nutrient_code: 'fat', value: 5, unit: 'g' },
      ],
    },
    {
      position: 2,
      name: 'Arroz blanco',
      quantity: 180,
      quantity_unit: 'g',
      nutrients: [
        { nutrient_code: 'energy', value: 234, unit: 'kcal' },
        { nutrient_code: 'protein', value: 5, unit: 'g' },
        { nutrient_code: 'carbohydrates', value: 51, unit: 'g' },
      ],
    },
  ],
  photo: null,
  applied_scopes: [],
  ...overrides,
})

const day = (local_date: string, energy: number | null, meals = 1): DailySummary => ({
  local_date,
  hidden: false,
  meal_count: energy === null ? 0 : meals,
  nutrient_totals:
    energy === null ? [] : [{ nutrient_code: 'energy', value: energy, unit: 'kcal' }],
  applied_scope: null,
})

describe('what a meal adds up to (N-2c)', () => {
  test('T-SPC-UNIT-204 sums each nutrient written; one nobody wrote is absent, not zero', () => {
    expect(mealTotals(meal().items)).toEqual({
      energy: 482,
      protein: 51,
      carbohydrates: 51,
      fat: 5,
    })
    expect(mealTotals([])).toEqual({})
  })
})

describe('the day against the goal (N-1e)', () => {
  const energy = {
    nutrient_code: 'energy' as const,
    mode: 'exact' as const,
    minimum: null,
    maximum: null,
    exact: 2300,
    unit: 'kcal' as const,
  }

  test('T-SPC-UNIT-205 the goal figure follows its mode', () => {
    expect(goalFigure(energy, 'es')).toEqual({ value: 2300, label: '2.300' })
    expect(goalFigure({ ...energy, mode: 'minimum', exact: null, minimum: 150 }, 'es')).toEqual({
      value: 150,
      label: 'mín. 150',
    })
    expect(goalFigure({ ...energy, mode: 'maximum', exact: null, maximum: 70 }, 'es')).toEqual({
      value: 70,
      label: 'máx. 70',
    })
    expect(
      goalFigure({ ...energy, mode: 'range', exact: null, minimum: 220, maximum: 260 }, 'es'),
    ).toEqual({
      value: 260,
      label: '220–260',
    })
  })

  test('T-SPC-UNIT-206 what is left, what was eaten, and never below zero', () => {
    const totals = [day('2026-09-30', 1420)]
    expect(eatenFor(totals[0], 'energy')).toBe(1420)
    expect(remainingFor(energy, 1420)).toEqual({ left: 880, share: 0.62 })
    expect(remainingFor(energy, 2600)).toEqual({ left: 0, share: 1 })
    expect(eatenFor(day('2026-09-29', null), 'energy')).toBe(0)
  })

  test('T-SPC-UNIT-207 the next meal is asked for by the hour, with what is left', () => {
    expect(
      mealPrompt('2026-09-30T13:30:00.000Z', ZONE, { energy: 880, protein: 54 }, [], 'es'),
    ).toEqual({
      type: 'breakfast',
      title: '¿Qué desayunaste?',
      detail: 'Restante: 880 kcal · 54 g de proteína',
    })
    expect(
      mealPrompt('2026-10-01T01:30:00.000Z', ZONE, { energy: 880, protein: null }, [], 'es').title,
    ).toBe('¿Qué cenaste?')
    expect(mealPrompt('2026-09-30T18:30:00.000Z', ZONE, {}, [], 'es').detail).toBeNull()
    expect(
      mealPrompt('2026-09-30T13:30:00.000Z', ZONE, { energy: 1880, protein: 54 }, [], 'en'),
    ).toMatchObject({
      title: 'What did you have for breakfast?',
      detail: 'Left: 1,880 kcal · 54 g of protein',
    })
  })

  test('T-SPC-UNIT-217 a meal already logged is not asked for again', () => {
    expect(mealPrompt('2026-10-01T01:30:00.000Z', ZONE, {}, ['dinner'], 'es')).toMatchObject({
      type: 'snack',
      title: '¿Comiste algo más?',
    })
    expect(mealPrompt('2026-10-01T01:30:00.000Z', ZONE, {}, ['lunch'], 'es').title).toBe(
      '¿Qué cenaste?',
    )
  })
})

describe('days and history (N-5)', () => {
  test('T-SPC-UNIT-208 the average counts only days with something recorded', () => {
    const days = [day('2026-09-28', 2000), day('2026-09-29', null), day('2026-09-30', 2400)]
    expect(averageOfLogged(days, 'energy')).toEqual({ value: 2200, days: 2 })
    expect(averageOfLogged([day('2026-09-29', null)], 'energy')).toEqual({ value: null, days: 0 })
  })

  test('T-SPC-UNIT-218 the empty days are named once, today aside', () => {
    const one = [day('2026-09-28', 2000), day('2026-10-01', null), day('2026-09-30', 2400)]
    expect(emptyDaysNote(one, '2026-10-02', 'es')).toBe(
      'El jueves no registraste nada: no cuenta como cero.',
    )
    expect(emptyDaysNote(one, '2026-10-02', 'en')).toBe(
      "You logged nothing on Thursday: it doesn't count as zero.",
    )
    const many = [day('2026-09-28', null), day('2026-09-29', null), day('2026-09-30', null)]
    expect(emptyDaysNote(many, '2026-10-01', 'es')).toBe(
      '3 días sin registro: no cuentan como cero.',
    )
    expect(emptyDaysNote([day('2026-10-01', null)], '2026-10-01', 'es')).toBeNull()
  })

  test('T-SPC-UNIT-219 a meal is named with its own article', () => {
    expect(es.deleteMeal('dinner')).toBe('¿Eliminar la cena?')
    expect(es.deleteMeal('lunch')).toBe('¿Eliminar el almuerzo?')
    expect(es.undoMeal('other')).toBe('Deshacer: borrar esta comida')
    expect(en.deleteMeal('dinner')).toBe('Delete dinner?')
    expect(en.undoMeal('other')).toBe('Undo: delete this meal')
  })

  test('T-SPC-UNIT-209 a day is named as people name it', () => {
    expect(dayTitle('2026-09-30', '2026-09-30', 'es')).toBe('Hoy')
    expect(dayTitle('2026-09-29', '2026-09-30', 'es')).toBe('Ayer')
    expect(dayTitle('2026-09-27', '2026-09-30', 'es')).toBe('Domingo 27')
    expect(dayTitle('2026-09-29', '2026-09-30', 'en')).toBe('Yesterday')
    expect(dayTitle('2026-09-27', '2026-09-30', 'en')).toBe('Sunday 27')
  })

  // The history screen adds the date under «Hoy» and «Ayer» from this, not from the words.
  test('T-SPC-UNIT-339 a day counts back from today in whole days', () => {
    expect(daysBefore('2026-09-30', '2026-09-30')).toBe(0)
    expect(daysBefore('2026-09-29', '2026-09-30')).toBe(1)
    expect(daysBefore('2026-08-31', '2026-09-01')).toBe(1)
    expect(daysBefore('2026-09-27', '2026-09-30')).toBe(3)
  })
})

describe('deleting a meal (N-4c)', () => {
  test('T-SPC-UNIT-210 the day as it will be, the meal taken out of it', () => {
    const today: DailySummary = {
      local_date: '2026-09-30',
      hidden: false,
      meal_count: 3,
      nutrient_totals: [
        { nutrient_code: 'energy', value: 1420, unit: 'kcal' },
        { nutrient_code: 'protein', value: 96, unit: 'g' },
      ],
      applied_scope: null,
    }
    expect(dayAfterDeleting(today, meal())).toEqual({
      energy: { before: 1420, after: 938 },
      protein: { before: 96, after: 45 },
    })
  })

  test('T-SPC-UNIT-328 a meal a legal hold keeps says so, on what ground and until when', async () => {
    const held = {
      status: 'suspended' as const,
      hold: { reason_code: 'judicial_order' as const, valid_to: '2027-02-01T12:00:00Z' },
    }
    const flow = createNutritionFlow({
      transport: { deleteMeal: async () => held } as unknown as NutritionTransport,
      newCommand: () => ({ idempotencyKey: 'key-1', commandId: 'command-1' }),
    })

    await expect(flow.deleteMeal(meal().id)).resolves.toEqual(held)
    const note = deletionHeldNote(held, 'es')
    expect(note).toContain('No la eliminamos todavía')
    expect(note).toContain('una orden judicial')
    expect(note).toContain('2027')
    expect(deletionHeldNote(held, 'en')).toContain('because of a court order until Feb 1, 2027')
  })

  test('T-SPC-UNIT-329 a meal whose hold just ended says its deletion is on its way', async () => {
    const flow = createNutritionFlow({
      transport: { deleteMeal: async () => null } as unknown as NutritionTransport,
      newCommand: () => ({ idempotencyKey: 'key-1', commandId: 'command-1' }),
    })

    await expect(flow.deleteMeal(meal().id)).resolves.toBeNull()
    expect(deletionHeldNote({ status: 'pending', hold: null }, 'es')).toContain('en un momento')
  })
})

describe('the goal form (N-6)', () => {
  test('T-SPC-UNIT-211 a form becomes targets, «sin meta» leaves the nutrient out', () => {
    const targets = targetsFromForm({
      energy: { mode: 'exact', low: 2300, high: null },
      protein: { mode: 'minimum', low: 150, high: null },
      carbohydrates: { mode: 'range', low: 220, high: 260 },
      fat: { mode: 'maximum', low: null, high: 70 },
      fiber: { mode: 'none', low: null, high: null },
      water: { mode: 'none', low: null, high: null },
    })
    expect(targets).toEqual([
      {
        nutrient_code: 'energy',
        mode: 'exact',
        minimum: null,
        maximum: null,
        exact: 2300,
        unit: 'kcal',
      },
      {
        nutrient_code: 'protein',
        mode: 'minimum',
        minimum: 150,
        maximum: null,
        exact: null,
        unit: 'g',
      },
      {
        nutrient_code: 'carbohydrates',
        mode: 'range',
        minimum: 220,
        maximum: 260,
        exact: null,
        unit: 'g',
      },
      { nutrient_code: 'fat', mode: 'maximum', minimum: null, maximum: 70, exact: null, unit: 'g' },
    ])
    expect(formFromGoal(targets).fiber.mode).toBe('none')
    expect(formFromGoal(targets).carbohydrates).toEqual({ mode: 'range', low: 220, high: 260 })
  })
})

describe('the nutrition flow', () => {
  test('T-SPC-UNIT-212 a correction names the revision it read; a retried record keeps its key', async () => {
    const sent: { keys: string[]; matches: string[] } = { keys: [], matches: [] }
    let calls = 0
    const transport = {
      recordMeal: async (command: { idempotencyKey: string }) => {
        sent.keys.push(command.idempotencyKey)
        calls += 1
        if (calls === 1) throw new Error('offline')
        return meal()
      },
      reviseMeal: async (_command: unknown, _id: string, ifMatch: string) => {
        sent.matches.push(ifMatch)
        return meal({ revision_number: 3 })
      },
    } as unknown as NutritionTransport
    let issued = 0
    const flow = createNutritionFlow({
      transport,
      newCommand: () => {
        issued += 1
        return { idempotencyKey: `key-${String(issued)}`, commandId: `command-${String(issued)}` }
      },
    })
    const draft = {
      occurred_at: meal().occurred_at,
      timezone: ZONE,
      meal_type: 'lunch' as const,
      items: meal().items,
    }

    await flow.recordMeal('draft-1', draft).catch(() => undefined)
    await flow.recordMeal('draft-1', draft)
    await flow.reviseMeal(meal(), { note: 'Otra' })

    expect(sent.keys).toEqual(['key-1', 'key-1'])
    expect(sent.matches).toEqual([etagOf(meal())])
    expect(etagOf(meal())).toBe('"nutrition-meal:019f1000-0000-7000-8000-000000000101:r2"')
  })
})

describe('the meal form (N-2c, N-4d)', () => {
  test('T-SPC-UNIT-213 a meal opens in the form with each written value, and nothing invented', () => {
    const form = formFromMeal(meal(), 'es')
    expect(form.items[1]).toMatchObject({
      name: 'Arroz blanco',
      quantity: '180',
      values: { energy: '234', protein: '5', carbohydrates: '51' },
      extras: [],
    })
    expect(form.items[1]?.values.fat).toBeUndefined()
  })

  test('T-SPC-UNIT-214 the form back to items: blanks are left out, «7,5» is seven and a half', () => {
    const item = {
      ...emptyItem('a'),
      name: ' Avena ',
      quantity: '80',
      values: { energy: '420', protein: '7,5', fat: '' },
    }
    expect(itemsFromForm([item, { ...emptyItem('b'), name: '   ' }])).toEqual([
      {
        position: 1,
        name: 'Avena',
        quantity: 80,
        quantity_unit: 'g',
        nutrients: [
          { nutrient_code: 'energy', value: 420, unit: 'kcal' },
          { nutrient_code: 'protein', value: 7.5, unit: 'g' },
        ],
      },
    ])
  })

  test('T-SPC-UNIT-215 the totals as they are typed', () => {
    expect(formTotals(formFromMeal(meal(), 'es').items)).toEqual({
      energy: 482,
      protein: 51,
      carbohydrates: 51,
      fat: 5,
    })
  })
})

describe('a proposal against the goal kept (N-3b)', () => {
  const now = {
    nutrient_code: 'energy' as const,
    mode: 'exact' as const,
    minimum: null,
    maximum: null,
    exact: 2300,
    unit: 'kcal' as const,
  }

  test('T-SPC-UNIT-216 each nutrient says what it is now and what is proposed', () => {
    expect(targetText(now, 'es')).toBe('2.300 kcal')
    expect(compareTarget(now, { ...now, exact: 2100 }, 'es')).toBe('2.300 → 2.100 kcal')
    expect(compareTarget(now, now, 'es')).toBe('2.300 kcal · sin cambio')
    const water = {
      nutrient_code: 'water' as const,
      mode: 'exact' as const,
      minimum: null,
      maximum: null,
      exact: 2500,
      unit: 'ml' as const,
    }
    expect(compareTarget(undefined, water, 'es')).toBe('Nueva · 2.500 ml')
    expect(compareTarget(now, undefined, 'es')).toBe('2.300 kcal → Sin meta')
    expect(compareTarget(now, now, 'en')).toBe('2,300 kcal · no change')
    expect(compareTarget(now, undefined, 'en')).toBe('2,300 kcal → No goal')
    expect(unchangedTarget(now, now)).toBe(true)
    expect(unchangedTarget(now, { ...now, exact: 2100 })).toBe(false)
    expect(unchangedTarget(undefined, undefined)).toBe(false)
  })
})

describe('what a nutrient is measured against (Resolución 810 de 2021)', () => {
  const protein: GoalTarget = {
    nutrient_code: 'protein',
    mode: 'exact',
    minimum: null,
    maximum: null,
    exact: 140,
    unit: 'g',
  }

  test('T-SPC-UNIT-238 a person’s own goal comes first; else the norm; else nothing', () => {
    expect(dailyReference('protein', [protein])).toBe(140)
    expect(dailyReference('protein', [])).toBe(50)
    expect(dailyReference('sodium', [protein])).toBe(2000)
    expect(dailyReference('copper', [])).toBe(0.9)
    expect(dailyReference('sugars', [])).toBeNull()
    expect(dailyReference('water', [])).toBeNull()
  })

  test('T-SPC-UNIT-239 every nutrient belongs to one group of the facts panel', () => {
    expect(NUTRIENT_GROUP.sodium).toBe('detail')
    expect(NUTRIENT_GROUP.folate).toBe('vitamin')
    expect(NUTRIENT_GROUP.zinc).toBe('mineral')
    expect(NUTRIENT_GROUP.energy).toBe('macro')
  })

  test('T-SPC-UNIT-241 a figure keeps the precision its size needs, in Spanish', () => {
    expect(nutrientFigure(231.4, 'kcal', 'es')).toBe('231 kcal')
    expect(nutrientFigure(4.13, 'g', 'es')).toBe('4,1 g')
    expect(nutrientFigure(0.324, 'mg', 'es')).toBe('0,32 mg')
    expect(nutrientFigure(2456, 'kcal', 'es')).toBe('2.456 kcal')
    expect(nutrientFigure(201.6, 'mcg', 'es')).toBe('202 µg')
    expect(nutrientFigure(undefined, 'g', 'es')).toBe('—')
  })

  test('T-SPC-UNIT-359 in English the same figures take a decimal point and a comma for thousands', () => {
    expect(nutrientFigure(4.13, 'g', 'en')).toBe('4.1 g')
    expect(nutrientFigure(2456, 'kcal', 'en')).toBe('2,456 kcal')
  })
})

describe('a whole meal', () => {
  test('T-SPC-UNIT-242 a meal weighs what its items weighed in grams; the rest does not count', () => {
    const base = { position: 1, name: 'x', serving: null, food_id: null, product_id: null }
    const weighed = (quantity: number, unit: string): MealItem => ({
      ...base,
      origin: 'typed',
      quantity,
      quantity_unit: unit,
      nutrients: [],
    })
    const unweighed: MealItem = {
      ...base,
      origin: 'typed',
      quantity: null,
      quantity_unit: null,
      nutrients: [],
    }
    expect(mealGrams([weighed(250, 'g'), weighed(40, 'g'), weighed(2, 'lb'), unweighed])).toBe(290)
  })
})

describe('progress against an energy range', () => {
  const range: GoalTarget = {
    nutrient_code: 'energy',
    unit: 'kcal',
    mode: 'range',
    minimum: 2100,
    maximum: 2400,
    exact: null,
  }

  test('T-SPC-UNIT-276 below the range, what is left runs from the minimum to the maximum', () => {
    const below = rangeProgress(range, 1420)
    expect(below).toMatchObject({ state: 'below', fromLow: 680, fromHigh: 980 })
    // The arc puts the maximum at four fifths, so going past it still shows.
    expect(below?.highAt).toBeCloseTo(0.8)
    expect(below?.lowAt).toBeCloseTo(0.7)
    expect(below?.eatenAt).toBeCloseTo(1420 / 3000)
  })

  test('T-SPC-UNIT-277 inside the range it says the room left; past it, by how much', () => {
    expect(rangeProgress(range, 2250)).toMatchObject({ state: 'within', fromHigh: 150 })
    expect(rangeProgress(range, 2520)).toMatchObject({ state: 'above', over: 120 })
    expect(rangeProgress(range, 9000)?.eatenAt).toBe(1)
  })

  test('T-SPC-UNIT-305 below the range, the card leads with what is missing for the minimum', () => {
    const goal = { ...range, minimum: 2000, maximum: 2850 }
    const nothing = rangeProgress(goal, 0)
    const halfway = rangeProgress(goal, 1420)
    if (!nothing || !halfway) throw new Error('a range goal has range progress')
    expect(rangeCardCopy(goal, 0, nothing, 'es')).toEqual({
      figure: '2.000',
      line: 'Te faltan para tu mínimo',
      center: '0%',
      centerLabel: 'Del mínimo',
      detail: 'Meta 2.000–2.850',
      over: false,
    })
    expect(rangeCardCopy(goal, 1420, halfway, 'es')).toMatchObject({ figure: '580', center: '71%' })
    expect(rangeCardCopy(goal, 0, nothing, 'en')).toMatchObject({
      figure: '2,000',
      line: 'Left to reach your minimum',
      detail: 'Goal 2,000–2,850',
    })
  })

  test('T-SPC-UNIT-306 inside it the margin to the maximum; past it, the excess, flagged', () => {
    const goal = { ...range, minimum: 2000, maximum: 2850 }
    const within = rangeProgress(goal, 2300)
    const above = rangeProgress(goal, 3100)
    if (!within || !above) throw new Error('a range goal has range progress')
    expect(rangeCardCopy(goal, 2300, within, 'es')).toMatchObject({
      figure: '550',
      line: 'Margen hasta tu máximo',
      center: 'En meta',
      centerLabel: '2.000–2.850',
      over: false,
    })
    expect(rangeCardCopy(goal, 3100, above, 'es')).toMatchObject({
      figure: '250',
      line: 'Por encima de tu máximo',
      center: '+250',
      centerLabel: 'De más',
      over: true,
    })
  })

  test('T-SPC-UNIT-307 the range is said once, in the line under the card', () => {
    const goal = { ...range, minimum: 2000, maximum: 2850 }
    const nothing = rangeProgress(goal, 0)
    if (!nothing) throw new Error('a range goal has range progress')
    const copy = rangeCardCopy(goal, 0, nothing, 'es')
    const said = [copy.figure, copy.line, copy.center, copy.centerLabel, copy.detail]
    expect(said.filter((text) => text.includes('2.000–2.850'))).toHaveLength(1)
  })

  test('T-SPC-UNIT-278 a goal that is not a range has no range progress', () => {
    expect(
      rangeProgress({ ...range, mode: 'exact', exact: 2300, minimum: null, maximum: null }, 100),
    ).toBeNull()
  })
})

describe('the goal under a macro card', () => {
  const base = {
    nutrient_code: 'protein',
    unit: 'g',
    minimum: null,
    maximum: null,
    exact: null,
  } as const

  test('T-SPC-UNIT-279 a card says what the eaten figure is measured against', () => {
    expect(goalLine({ ...base, mode: 'minimum', minimum: 120 }, 'g', 'es')).toBe('De mín. 120 g')
    expect(goalLine({ ...base, mode: 'maximum', maximum: 70 }, 'g', 'es')).toBe('De máx. 70 g')
    expect(goalLine({ ...base, mode: 'exact', exact: 150 }, 'g', 'es')).toBe('De 150 g')
    expect(goalLine({ ...base, mode: 'range', minimum: 200, maximum: 240 }, 'g', 'es')).toBe(
      'De 200–240 g',
    )
    expect(goalLine(undefined, 'g', 'es')).toBe('Sin meta')
    expect(goalLine({ ...base, mode: 'minimum', minimum: 120 }, 'g', 'en')).toBe('Goal min. 120 g')
    expect(goalLine(undefined, 'g', 'en')).toBe('No goal')
  })
})

describe('a meal named in a sentence', () => {
  test('T-SPC-UNIT-286 the saved notice agrees with each meal: el desayuno, la cena', () => {
    expect(es.mealSaved('breakfast')).toBe('Desayuno guardado')
    expect(es.mealSaved('lunch')).toBe('Almuerzo guardado')
    expect(es.mealSaved('snack')).toBe('Snack guardado')
    expect(es.mealSaved('dinner')).toBe('Cena guardada')
    expect(es.mealSaved('other')).toBe('Comida guardada')
    expect(en.mealSaved('dinner')).toBe('Dinner saved')
    expect(en.mealSaved('other')).toBe('Meal saved')
  })

  test('T-SPC-UNIT-287 adding a food names the meal with its own article', () => {
    expect(es.addToMeal('breakfast')).toBe('Añadir al desayuno')
    expect(es.addToMeal('lunch')).toBe('Añadir al almuerzo')
    expect(es.addToMeal('snack')).toBe('Añadir al snack')
    expect(es.addToMeal('dinner')).toBe('Añadir a la cena')
    expect(es.addToMeal('other')).toBe('Añadir a esta comida')
    expect(en.addToMeal('dinner')).toBe('Add to dinner')
    expect(en.addToMeal('other')).toBe('Add to this meal')
  })
})
