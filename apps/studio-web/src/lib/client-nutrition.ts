/**
 * What a client eats, as the coach who attends her reads it: her meals
 * (`HU-STUDIO-068`).
 *
 * `OP-NUT-009` decides what exists. This module decides the days asked for and
 * the words a meal is drawn with, under the rule every client screen follows:
 *
 * **A field her version does not share is null, and is left out.** Never «sin
 * registrar», never a zero: either would claim the field exists and is empty,
 * and a reader cannot tell a withheld field from one she never filled in.
 *
 * **The days are hers.** `from` and `to` are calendar days in her zone, at most
 * thirty-one, and each meal says which of her days it belongs to. The window her
 * Space plan gives her does not apply here, so nothing below narrows it.
 *
 * **The meal names are Space's** (`apps/space/src/client/nutrition.ts`), copied
 * on purpose, as the nutrient names are in `nutrients.ts`.
 */
import { inNutrientOrder, nutrientAmount, nutrientName } from './nutrients'
import type { ClientNutritionMeal, ClientNutritionMealItem, MealType } from './studio-api'

export interface NutritionRange {
  readonly from: string
  readonly to: string
}

/** Both ends included, as the API counts them. */
export const NUTRITION_RANGE_LIMIT = 31
const DEFAULT_DAYS = 7
const DAY_MS = 86_400_000
const CALENDAR_DAY = /^(\d{4})-(\d{2})-(\d{2})$/

function dayIndex(day: string): number | null {
  const parts = CALENDAR_DAY.exec(day)
  if (!parts) return null
  return Date.UTC(Number(parts[1]), Number(parts[2]) - 1, Number(parts[3])) / DAY_MS
}

function calendarDay(index: number): string {
  return new Date(index * DAY_MS).toISOString().slice(0, 10)
}

/**
 * The last seven days, today included. Today is the reader's calendar day, read
 * from local parts: at 9 p.m. in Bogotá UTC is already on tomorrow.
 */
export function defaultNutritionRange(now: Date): NutritionRange {
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) / DAY_MS
  return { from: calendarDay(today - (DEFAULT_DAYS - 1)), to: calendarDay(today) }
}

export type RangeProblem = 'missing' | 'reversed' | 'too-long'

export function rangeProblem(range: NutritionRange): RangeProblem | null {
  const start = dayIndex(range.from)
  const end = dayIndex(range.to)
  if (start === null || end === null) return 'missing'
  if (end < start) return 'reversed'
  return end - start >= NUTRITION_RANGE_LIMIT ? 'too-long' : null
}

const RANGE_PROBLEMS: Record<RangeProblem, string> = {
  missing: 'Elige las dos fechas.',
  reversed: '«Hasta» no puede ir antes de «Desde».',
  'too-long': `Puedes consultar hasta ${NUTRITION_RANGE_LIMIT} días seguidos.`,
}

export function rangeProblemText(problem: RangeProblem): string {
  return RANGE_PROBLEMS[problem]
}

const MEALS: Record<MealType, string> = {
  breakfast: 'Desayuno',
  lunch: 'Almuerzo',
  dinner: 'Cena',
  snack: 'Snack',
  // Space's «Otra» answers «¿qué comida?»; as a title it needs its noun.
  other: 'Otra comida',
}

/** A plain «Comida» when the type is withheld: it names the thing, not a gap. */
export function mealTitle(type: MealType | null): string {
  return type ? MEALS[type] : 'Comida'
}

/** The hour in her zone, or none: without her zone it would be the reader's. */
export function mealTimeLine(
  meal: Pick<ClientNutritionMeal, 'occurred_at' | 'timezone'>,
): string | null {
  if (!meal.timezone) return null
  return new Intl.DateTimeFormat('es-CO', { timeStyle: 'short', timeZone: meal.timezone }).format(
    new Date(meal.occurred_at),
  )
}

export type MealPhoto = 'attached' | 'none'

/**
 * Three values, not two. Null is «she does not share photos», and draws
 * nothing: reading it as false would claim the meal had no photo.
 */
export function mealPhoto(meal: Pick<ClientNutritionMeal, 'has_photo'>): MealPhoto | null {
  if (meal.has_photo === null) return null
  return meal.has_photo ? 'attached' : 'none'
}

const FIGURE = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 1 })

/** Her portion as she said it, with its grams when they say something else. */
function amountLine(item: ClientNutritionMealItem): string | null {
  // A number whose unit is withheld says nothing true.
  const measured =
    item.quantity !== null && item.quantity_unit
      ? `${FIGURE.format(item.quantity)} ${item.quantity_unit}`
      : null
  if (item.serving && measured && item.serving !== measured) {
    return `${item.serving} (${measured})`
  }
  return item.serving ?? measured
}

function nutrientsLine(item: ClientNutritionMealItem): string | null {
  if (!item.nutrients || item.nutrients.length === 0) return null
  return inNutrientOrder(item.nutrients)
    .map((value) => `${nutrientName(value.nutrient_code)} ${nutrientAmount(value)}`)
    .join(' · ')
}

export interface MealItemRow {
  readonly item: ClientNutritionMealItem
  readonly line: string | null
  readonly nutrients: string | null
}

/** Each item in what its fields say; one with nothing shared is not drawn. */
export function mealItemRows(items: readonly ClientNutritionMealItem[]): readonly MealItemRow[] {
  const rows: MealItemRow[] = []
  for (const item of items) {
    const amount = amountLine(item)
    const line = item.name && amount ? `${item.name} · ${amount}` : (item.name ?? amount)
    const nutrients = nutrientsLine(item)
    if (line !== null || nutrients !== null) rows.push({ item, line, nutrients })
  }
  return rows
}

export interface MealDay {
  readonly day: string
  readonly meals: readonly ClientNutritionMeal[]
}

/** Her meals under the day of hers they belong to, in the order they arrived. */
export function mealDays(meals: readonly ClientNutritionMeal[]): readonly MealDay[] {
  const days = new Map<string, ClientNutritionMeal[]>()
  for (const meal of meals) {
    const existing = days.get(meal.local_date)
    if (existing) existing.push(meal)
    else days.set(meal.local_date, [meal])
  }
  return [...days.entries()].map(([day, list]) => ({ day, meals: list }))
}

const DAY_HEADING = new Intl.DateTimeFormat('es-CO', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
})

/** «Martes, 28 de julio de 2026»: a calendar day of hers, read in UTC so it never slips. */
export function nutritionDayHeading(day: string): string {
  const index = dayIndex(day)
  if (index === null) return day
  const text = DAY_HEADING.format(new Date(index * DAY_MS))
  return text.charAt(0).toUpperCase() + text.slice(1)
}
