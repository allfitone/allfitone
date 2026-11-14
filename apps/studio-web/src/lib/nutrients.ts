/**
 * The words for a nutrient and an amount of it, shared by every screen that
 * shows what she eats: her meals and her days (`HU-STUDIO-068`, `069`), and the
 * goals of an ended relationship read through a case (`HU-STUDIO-062`).
 *
 * Written first for the frozen history, which said they should converge with
 * the live screens the day there were any. A nutrient now reads the same way in
 * a meal, in a day's total and in a goal.
 *
 * **The names are Space's** (`apps/space/src/client/nutrition.ts`), copied on
 * purpose: an app may not import another app. They should move to a package the
 * day a third surface needs them.
 */
import type { NutrientCode, NutrientValue } from './studio-api'

// Also the reading order: energy and the macros first, then a label's detail.
const NUTRIENTS: Record<NutrientCode, string> = {
  energy: 'Energía',
  protein: 'Proteína',
  carbohydrates: 'Carbohidratos',
  fat: 'Grasa',
  fiber: 'Fibra',
  water: 'Agua',
  saturated_fat: 'Grasas saturadas',
  trans_fat: 'Grasas trans',
  cholesterol: 'Colesterol',
  sodium: 'Sodio',
  sugars: 'Azúcares',
  vitamin_a: 'Vitamina A',
  vitamin_c: 'Vitamina C',
  vitamin_d: 'Vitamina D',
  vitamin_e: 'Vitamina E',
  vitamin_k: 'Vitamina K',
  thiamin: 'Vitamina B1',
  riboflavin: 'Vitamina B2',
  niacin: 'Vitamina B3',
  pantothenic_acid: 'Vitamina B5',
  vitamin_b6: 'Vitamina B6',
  vitamin_b12: 'Vitamina B12',
  folate: 'Folato',
  calcium: 'Calcio',
  iron: 'Hierro',
  magnesium: 'Magnesio',
  phosphorus: 'Fósforo',
  potassium: 'Potasio',
  zinc: 'Zinc',
  selenium: 'Selenio',
  copper: 'Cobre',
}

const RANK = new Map(Object.keys(NUTRIENTS).map((code, at) => [code, at]))

const AMOUNT = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 1 })

export function nutrientName(code: NutrientCode): string {
  return NUTRIENTS[code]
}

/** «42 g», «1.840 kcal»: each nutrient is written in its own unit only. */
export function nutrientAmount(value: Pick<NutrientValue, 'value' | 'unit'>): string {
  return `${AMOUNT.format(value.value)} ${value.unit}`
}

/** The API answers in code order; a reader looks for energy and the macros first. */
export function inNutrientOrder<T extends Pick<NutrientValue, 'nutrient_code'>>(
  values: readonly T[],
): T[] {
  const rank = (value: T) => RANK.get(value.nutrient_code) ?? RANK.size
  return [...values].sort((left, right) => rank(left) - rank(right))
}
