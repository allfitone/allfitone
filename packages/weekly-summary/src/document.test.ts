import { describe, expect, test } from 'bun:test'

import { documentOf, sourcesOf } from './document.js'
import { numbersOf, strangers } from './numbers.js'
import type { ExerciseLogged, NutritionDayLogged, SessionLogged, WeeksLogged } from './port.js'

const SQUAT = '019f5000-0000-7000-8000-000000000001'
const BENCH = '019f5000-0000-7000-8000-000000000002'

const exercise = (over: Partial<ExerciseLogged> = {}): ExerciseLogged => ({
  movementId: SQUAT,
  name: 'Sentadilla',
  workSets: 4,
  bestSet: { loadKg: 80, reps: 5 },
  volumeKg: 1600,
  record: false,
  ...over,
})

const session = (trainedOn: string, over: Partial<SessionLogged> = {}): SessionLogged => ({
  trainedOn,
  durationSeconds: 3300,
  exercises: [exercise()],
  ...over,
})

const day = (date: string, over: Partial<NutritionDayLogged> = {}): NutritionDayLogged => ({
  date,
  meals: 3,
  energyKcal: 2100,
  proteinG: 130,
  carbohydratesG: 240,
  fatG: 70,
  ...over,
})

// Monday 9 November 2026; the week before starts on Monday 2 November.
const logged = (over: Partial<WeeksLogged> = {}): WeeksLogged => ({
  weekStartsOn: '2026-11-09',
  inProgress: false,
  sessions: [],
  nutritionDays: [],
  goal: [],
  ...over,
})

describe('the document a model is shown', () => {
  test('T-WSM-UNIT-11: a week with nothing logged has no document', () => {
    expect(documentOf(logged(), 'es')).toBeNull()
  })

  test('T-WSM-UNIT-12: what she logged only the week before is not a week to summarise', () => {
    const weeks = logged({ sessions: [session('2026-11-03')], nutritionDays: [day('2026-11-04')] })
    expect(documentOf(weeks, 'es')).toBeNull()
  })

  test('T-WSM-UNIT-13: the week runs from its Monday to its Sunday', () => {
    const document = documentOf(logged({ sessions: [session('2026-11-09')] }), 'es')
    expect(document?.week).toEqual({
      from: '2026-11-09',
      to: '2026-11-15',
      days: 7,
      in_progress: false,
    })
  })

  test('T-WSM-UNIT-56: the week says how many days it has, so «6 de 7 días» can be said', () => {
    const six = ['09', '10', '11', '12', '13', '14'].map((at) => day(`2026-11-${at}`))
    const document = documentOf(logged({ nutritionDays: six }), 'es')
    expect(strangers('Registraste 6 de 7 días.', numbersOf(document))).toEqual([])
  })

  test('T-WSM-UNIT-14: training adds up the sessions of the week, and only those', () => {
    const document = documentOf(
      logged({
        sessions: [
          session('2026-11-09', { durationSeconds: 3300 }),
          session('2026-11-09', { durationSeconds: 1500 }),
          session('2026-11-12', {
            durationSeconds: 2710,
            exercises: [exercise({ workSets: 3, volumeKg: 1250.4 }), exercise({ volumeKg: null })],
          }),
          session('2026-11-16'),
        ],
      }),
      'es',
    )
    expect(document?.training?.this_week).toEqual({
      sessions: 3,
      days_trained: 2,
      minutes: 125,
      work_sets: 15,
      volume_kg: 4450,
    })
    expect(document?.training?.week_before).toBeNull()
    expect(document?.training?.change).toBeNull()
  })

  test('T-WSM-UNIT-15: nothing weighed is no volume, not zero', () => {
    const unweighed = exercise({ bestSet: null, volumeKg: null })
    const document = documentOf(
      logged({ sessions: [session('2026-11-10', { exercises: [unweighed] })] }),
      'es',
    )
    expect(document?.training?.this_week.volume_kg).toBeNull()
    expect(document?.training?.sessions[0]?.exercises[0]?.best_set).toBeNull()
  })

  test('T-WSM-UNIT-16: the week before is totalled and subtracted here', () => {
    const document = documentOf(
      logged({
        sessions: [
          session('2026-11-03', { durationSeconds: 3000 }),
          session('2026-11-09', { durationSeconds: 3300 }),
          session('2026-11-11', { durationSeconds: 3300 }),
        ],
      }),
      'es',
    )
    expect(document?.training?.week_before).toEqual({
      sessions: 1,
      days_trained: 1,
      minutes: 50,
      work_sets: 4,
      volume_kg: 1600,
    })
    expect(document?.training?.change).toEqual({
      sessions: 1,
      minutes: 60,
      work_sets: 4,
      volume_kg: 1600,
    })
  })

  test('T-WSM-UNIT-17: a session says its day in her language, and never an identifier', () => {
    const spanish = documentOf(logged({ sessions: [session('2026-11-11')] }), 'es')
    const english = documentOf(logged({ sessions: [session('2026-11-11')] }), 'en')
    expect(spanish?.training?.sessions[0]).toEqual({
      date: '2026-11-11',
      weekday: 'miércoles',
      minutes: 55,
      exercises: [
        {
          name: 'Sentadilla',
          work_sets: 4,
          best_set: { kg: 80, reps: 5 },
          personal_record: false,
        },
      ],
    })
    expect(english?.training?.sessions[0]?.weekday).toBe('Wednesday')
    expect(JSON.stringify(spanish)).not.toContain(SQUAT)
  })

  test('T-WSM-UNIT-18: an exercise weighed in both weeks is compared by its best load', () => {
    const document = documentOf(
      logged({
        sessions: [
          session('2026-11-02', {
            exercises: [
              exercise({ bestSet: { loadKg: 77.5, reps: 5 } }),
              exercise({
                movementId: BENCH,
                name: 'Press de banca',
                bestSet: { loadKg: 60, reps: 8 },
              }),
            ],
          }),
          session('2026-11-05', { exercises: [exercise({ bestSet: { loadKg: 80, reps: 3 } })] }),
          session('2026-11-09', {
            exercises: [
              exercise({ bestSet: { loadKg: 82.5, reps: 5 } }),
              exercise({
                movementId: BENCH,
                name: 'Press de banca',
                bestSet: { loadKg: 60, reps: 9 },
              }),
            ],
          }),
          session('2026-11-12', { exercises: [exercise({ bestSet: { loadKg: 85, reps: 2 } })] }),
        ],
      }),
      'es',
    )
    expect(document?.training?.compared).toEqual([
      { name: 'Sentadilla', best_kg: 85, best_kg_week_before: 80, change_kg: 5 },
      { name: 'Press de banca', best_kg: 60, best_kg_week_before: 60, change_kg: 0 },
    ])
  })

  test('T-WSM-UNIT-19: an exercise she did in one week only is not compared', () => {
    const document = documentOf(
      logged({
        sessions: [
          session('2026-11-03', { exercises: [exercise({ movementId: BENCH, name: 'Press' })] }),
          session('2026-11-10'),
        ],
      }),
      'es',
    )
    expect(document?.training?.compared).toEqual([])
  })

  test('T-WSM-UNIT-20: nutrition averages the days she logged, not the seven of the week', () => {
    const document = documentOf(
      logged({
        nutritionDays: [
          day('2026-11-09', { energyKcal: 2000, proteinG: 120, carbohydratesG: 230, fatG: 66 }),
          day('2026-11-10', { energyKcal: 2301, proteinG: 141, carbohydratesG: 250, fatG: 75 }),
        ],
      }),
      'es',
    )
    expect(document?.training).toBeNull()
    expect(document?.nutrition?.this_week).toEqual({
      days_logged: 2,
      kcal_per_day: 2151,
      protein_g_per_day: 131,
      carbohydrates_g_per_day: 240,
      fat_g_per_day: 71,
    })
    expect(document?.nutrition?.days).toEqual([
      {
        date: '2026-11-09',
        weekday: 'lunes',
        kcal: 2000,
        protein_g: 120,
        carbohydrates_g: 230,
        fat_g: 66,
      },
      {
        date: '2026-11-10',
        weekday: 'martes',
        kcal: 2301,
        protein_g: 141,
        carbohydrates_g: 250,
        fat_g: 75,
      },
    ])
    expect(document?.nutrition?.week_before).toBeNull()
    expect(document?.nutrition?.change).toBeNull()
  })

  test('T-WSM-UNIT-21: a nutrient nobody wrote has no average, and a day without meals is not a day', () => {
    const document = documentOf(
      logged({
        nutritionDays: [
          day('2026-11-09', { fatG: null }),
          day('2026-11-10', { fatG: null }),
          day('2026-11-11', {
            meals: 0,
            energyKcal: null,
            proteinG: null,
            carbohydratesG: null,
            fatG: null,
          }),
        ],
      }),
      'es',
    )
    expect(document?.nutrition?.this_week.days_logged).toBe(2)
    expect(document?.nutrition?.this_week.fat_g_per_day).toBeNull()
    expect(document?.nutrition?.days).toHaveLength(2)
  })

  test('T-WSM-UNIT-22: nutrition is compared with the week before, average against average', () => {
    const document = documentOf(
      logged({
        nutritionDays: [
          day('2026-11-04', { energyKcal: 2300, proteinG: 120, fatG: null }),
          day('2026-11-09', { energyKcal: 2100, proteinG: 130 }),
        ],
      }),
      'es',
    )
    expect(document?.nutrition?.week_before?.kcal_per_day).toBe(2300)
    expect(document?.nutrition?.change).toEqual({
      kcal_per_day: -200,
      protein_g_per_day: 10,
      carbohydrates_g_per_day: 0,
      fat_g_per_day: null,
    })
  })

  test('T-WSM-UNIT-23: a goal says its bounds and how many logged days were inside them', () => {
    const document = documentOf(
      logged({
        nutritionDays: [
          day('2026-11-09', { energyKcal: 2000, proteinG: 139.4 }),
          day('2026-11-10', { energyKcal: 2400, proteinG: 150 }),
          day('2026-11-11', { energyKcal: 2600, proteinG: 141 }),
        ],
        goal: [
          { nutrient: 'protein', minimum: 140, maximum: null, exact: null },
          { nutrient: 'energy', minimum: 2200, maximum: 2500, exact: null },
          { nutrient: 'fat', minimum: null, maximum: 80, exact: null },
        ],
      }),
      'es',
    )
    expect(document?.nutrition?.goal).toEqual([
      { nutrient: 'energy', unit: 'kcal', minimum: 2200, maximum: 2500, exact: null, days_met: 1 },
      { nutrient: 'protein', unit: 'g', minimum: 140, maximum: null, exact: null, days_met: 2 },
      { nutrient: 'fat', unit: 'g', minimum: null, maximum: 80, exact: null, days_met: 3 },
    ])
  })

  test('T-WSM-UNIT-24: an exact target counts no days: nothing says how near is near enough', () => {
    const document = documentOf(
      logged({
        nutritionDays: [day('2026-11-09')],
        goal: [{ nutrient: 'energy', minimum: null, maximum: null, exact: 2300 }],
      }),
      'es',
    )
    expect(document?.nutrition?.goal[0]?.days_met).toBeNull()
  })

  test('T-WSM-UNIT-25: a goal without meals that week is not sent', () => {
    const document = documentOf(
      logged({
        sessions: [session('2026-11-09')],
        goal: [{ nutrient: 'energy', minimum: null, maximum: null, exact: 2300 }],
      }),
      'es',
    )
    expect(document?.nutrition).toBeNull()
    expect(JSON.stringify(document)).not.toContain('2300')
  })

  test('T-WSM-UNIT-26: a week still running says so', () => {
    const document = documentOf(
      logged({ inProgress: true, sessions: [session('2026-11-09')] }),
      'en',
    )
    expect(document?.week.in_progress).toBe(true)
    expect(document?.language).toBe('en')
  })

  test('T-WSM-UNIT-27: the sources are the parts the document has', () => {
    const both = documentOf(
      logged({
        sessions: [session('2026-11-09')],
        nutritionDays: [day('2026-11-09')],
        goal: [{ nutrient: 'energy', minimum: null, maximum: null, exact: 2300 }],
      }),
      'es',
    )
    const training = documentOf(logged({ sessions: [session('2026-11-09')] }), 'es')
    const meals = documentOf(logged({ nutritionDays: [day('2026-11-09')] }), 'es')
    expect(both && sourcesOf(both)).toEqual(['training', 'nutrition', 'nutrition_goal'])
    expect(training && sourcesOf(training)).toEqual(['training'])
    expect(meals && sourcesOf(meals)).toEqual(['nutrition'])
  })
})
