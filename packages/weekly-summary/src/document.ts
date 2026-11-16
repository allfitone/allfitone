/**
 * From what the database read to what a model is shown (ADR-053, decision 6).
 *
 * This is where the context contract is applied: `documentOf` copies into the document
 * only the fields the contract names, so nothing else the database read can travel.
 *
 * - **Every total, average and difference is worked out here.** The model is told to
 *   state numbers as it finds them, and `checkSummary` refuses an answer with a number
 *   the document does not have. Whatever the summary may say with a figure must
 *   therefore already be one of these.
 * - **Figures are rounded the way the app shows them**: whole minutes, kilocalories and
 *   grams, and kilograms to two decimals. An average is of the days she logged, not of
 *   the seven of the week: a day without meals is unknown, not a fast.
 * - **Unknown stays unknown.** Nothing weighed is no volume, and a nutrient nobody wrote
 *   has no average; neither becomes a zero the summary could read as a fact.
 * - **A week with nothing logged has no document**, and so nothing is sent (HU-SP-126).
 */

import {
  GOAL_NUTRIENTS,
  type ExerciseCompared,
  type ExerciseLogged,
  type GoalInDocument,
  type Language,
  type NutritionAverages,
  type NutritionDayLogged,
  type SessionLogged,
  type Source,
  type TrainingTotals,
  type WeekDocument,
  type WeeksLogged,
} from './port.js'

const DAY_MS = 86_400_000
const COMPARED_AT_MOST = 10

const WEEKDAYS: Record<Language, readonly string[]> = {
  es: ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'],
  en: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
}

const at = (date: string): number => Date.parse(`${date}T00:00:00Z`)
const shifted = (date: string, days: number): string =>
  new Date(at(date) + days * DAY_MS).toISOString().slice(0, 10)
const weekday = (date: string, language: Language): string =>
  WEEKDAYS[language][new Date(at(date)).getUTCDay()] ?? ''

const whole = (value: number): number => Math.round(value)
const kilograms = (value: number): number => Math.round(value * 100) / 100
const known = (values: readonly (number | null)[]): number[] =>
  values.filter((value): value is number => value !== null)
const mean = (values: readonly number[]): number | null =>
  values.length > 0 ? whole(values.reduce((sum, value) => sum + value, 0) / values.length) : null
const difference = (now: number | null, before: number | null): number | null =>
  now === null || before === null ? null : kilograms(now - before)

function trainingTotals(sessions: readonly SessionLogged[]): TrainingTotals | null {
  if (sessions.length === 0) return null
  const exercises = sessions.flatMap((session) => session.exercises)
  const weighed = known(exercises.map((exercise) => exercise.volumeKg))
  return {
    sessions: sessions.length,
    days_trained: new Set(sessions.map((session) => session.trainedOn)).size,
    minutes: whole(sessions.reduce((sum, session) => sum + session.durationSeconds, 0) / 60),
    work_sets: exercises.reduce((sum, exercise) => sum + exercise.workSets, 0),
    volume_kg: weighed.length > 0 ? whole(weighed.reduce((sum, value) => sum + value, 0)) : null,
  }
}

/** The best load of each exercise weighed in a week, by the id that groups it. */
function bestLoads(sessions: readonly SessionLogged[]): Map<string, { name: string; kg: number }> {
  const best = new Map<string, { name: string; kg: number }>()
  const weighed = sessions
    .flatMap((session) => session.exercises)
    .filter(
      (exercise): exercise is ExerciseLogged & { bestSet: object } => exercise.bestSet !== null,
    )
  for (const exercise of weighed) {
    const key = exercise.movementId ?? exercise.name
    const kg = kilograms(exercise.bestSet.loadKg)
    if (kg > (best.get(key)?.kg ?? -Infinity)) best.set(key, { name: exercise.name, kg })
  }
  return best
}

function compared(
  week: readonly SessionLogged[],
  before: readonly SessionLogged[],
): ExerciseCompared[] {
  const earlier = bestLoads(before)
  return [...bestLoads(week)]
    .flatMap(([key, now]) => {
      const then = earlier.get(key)
      return then === undefined
        ? []
        : [
            {
              name: now.name,
              best_kg: now.kg,
              best_kg_week_before: then.kg,
              change_kg: kilograms(now.kg - then.kg),
            },
          ]
    })
    .sort((a, b) => Math.abs(b.change_kg) - Math.abs(a.change_kg) || a.name.localeCompare(b.name))
    .slice(0, COMPARED_AT_MOST)
}

function averages(days: readonly NutritionDayLogged[]): NutritionAverages | null {
  if (days.length === 0) return null
  return {
    days_logged: days.length,
    kcal_per_day: mean(known(days.map((day) => day.energyKcal))),
    protein_g_per_day: mean(known(days.map((day) => day.proteinG))),
    carbohydrates_g_per_day: mean(known(days.map((day) => day.carbohydratesG))),
    fat_g_per_day: mean(known(days.map((day) => day.fatG))),
  }
}

type DayInDocument = NonNullable<WeekDocument['nutrition']>['days'][number]

const AMOUNT_OF: Record<GoalInDocument['nutrient'], (day: DayInDocument) => number | null> = {
  energy: (day) => day.kcal,
  protein: (day) => day.protein_g,
  carbohydrates: (day) => day.carbohydrates_g,
  fat: (day) => day.fat_g,
}

function goalOf(logged: WeeksLogged, days: readonly DayInDocument[]): GoalInDocument[] {
  return GOAL_NUTRIENTS.flatMap((nutrient) => {
    const target = logged.goal.find((one) => one.nutrient === nutrient)
    if (!target) return []
    const { minimum, maximum } = target
    const bounded = minimum !== null || maximum !== null
    const inside = (amount: number | null): boolean =>
      amount !== null && amount >= (minimum ?? -Infinity) && amount <= (maximum ?? Infinity)
    return [
      {
        nutrient,
        unit: nutrient === 'energy' ? ('kcal' as const) : ('g' as const),
        minimum,
        maximum,
        exact: target.exact,
        days_met: bounded ? days.filter((day) => inside(AMOUNT_OF[nutrient](day))).length : null,
      },
    ]
  })
}

/** The document of a week, or null when she logged nothing in it. */
export function documentOf(logged: WeeksLogged, language: Language): WeekDocument | null {
  const from = logged.weekStartsOn
  const to = shifted(from, 6)
  const earliest = shifted(from, -7)
  const inWeek = (date: string): boolean => date >= from && date <= to
  const inWeekBefore = (date: string): boolean => date >= earliest && date < from
  const byDay = <T>(items: readonly T[], date: (item: T) => string): T[] =>
    [...items].sort((a, b) => date(a).localeCompare(date(b)))

  const sessions = byDay(logged.sessions, (session) => session.trainedOn)
  const trained = sessions.filter((session) => inWeek(session.trainedOn))
  const trainedBefore = sessions.filter((session) => inWeekBefore(session.trainedOn))
  const meals = byDay(logged.nutritionDays, (day) => day.date).filter((day) => day.meals > 0)
  const eaten = meals.filter((day) => inWeek(day.date))
  const eatenBefore = meals.filter((day) => inWeekBefore(day.date))

  const thisWeek = trainingTotals(trained)
  const weekBefore = trainingTotals(trainedBefore)
  const fed = averages(eaten)
  const fedBefore = averages(eatenBefore)
  if (thisWeek === null && fed === null) return null

  const days: DayInDocument[] = eaten.map((day) => ({
    date: day.date,
    weekday: weekday(day.date, language),
    kcal: day.energyKcal === null ? null : whole(day.energyKcal),
    protein_g: day.proteinG === null ? null : whole(day.proteinG),
    carbohydrates_g: day.carbohydratesG === null ? null : whole(day.carbohydratesG),
    fat_g: day.fatG === null ? null : whole(day.fatG),
  }))

  return {
    language,
    week: { from, to, in_progress: logged.inProgress },
    training:
      thisWeek === null
        ? null
        : {
            this_week: thisWeek,
            week_before: weekBefore,
            change:
              weekBefore === null
                ? null
                : {
                    sessions: thisWeek.sessions - weekBefore.sessions,
                    minutes: thisWeek.minutes - weekBefore.minutes,
                    work_sets: thisWeek.work_sets - weekBefore.work_sets,
                    volume_kg: difference(thisWeek.volume_kg, weekBefore.volume_kg),
                  },
            sessions: trained.map((session) => ({
              date: session.trainedOn,
              weekday: weekday(session.trainedOn, language),
              minutes: whole(session.durationSeconds / 60),
              exercises: session.exercises.map((exercise) => ({
                name: exercise.name,
                work_sets: exercise.workSets,
                best_set: exercise.bestSet
                  ? { kg: kilograms(exercise.bestSet.loadKg), reps: exercise.bestSet.reps }
                  : null,
                personal_record: exercise.record,
              })),
            })),
            compared: compared(trained, trainedBefore),
          },
    nutrition:
      fed === null
        ? null
        : {
            this_week: fed,
            week_before: fedBefore,
            change:
              fedBefore === null
                ? null
                : {
                    kcal_per_day: difference(fed.kcal_per_day, fedBefore.kcal_per_day),
                    protein_g_per_day: difference(
                      fed.protein_g_per_day,
                      fedBefore.protein_g_per_day,
                    ),
                    carbohydrates_g_per_day: difference(
                      fed.carbohydrates_g_per_day,
                      fedBefore.carbohydrates_g_per_day,
                    ),
                    fat_g_per_day: difference(fed.fat_g_per_day, fedBefore.fat_g_per_day),
                  },
            days,
            goal: goalOf(logged, days),
          },
  }
}

/** Which of her data the document, and so the summary, was written from. */
export function sourcesOf(document: WeekDocument): Source[] {
  return [
    ...(document.training ? (['training'] as const) : []),
    ...(document.nutrition ? (['nutrition'] as const) : []),
    ...(document.nutrition && document.nutrition.goal.length > 0
      ? (['nutrition_goal'] as const)
      : []),
  ]
}
