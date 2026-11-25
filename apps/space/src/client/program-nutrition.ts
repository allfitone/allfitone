/**
 * The nutrition goal an Allfit programme brings (PN-1), as its detail says it.
 *
 * The figures come already sized to the person from the API; this only words them: the
 * energy as a range, what the goal is for, and the three macros with the share of the
 * energy each carries, which is what their rings draw.
 */

import type { ProgramDetail } from './programs'
import { intlLocale, textFor, type Locale } from '../i18n'

export type ProgramNutrition = NonNullable<ProgramDetail['nutrition']>
type MacroCode = 'protein' | 'carbohydrates' | 'fat'

const MACROS: readonly (readonly [MacroCode, number])[] = [
  ['protein', 4],
  ['carbohydrates', 4],
  ['fat', 9],
]

export interface ProgramNutritionCopy {
  readonly energy: string
  readonly purpose: string
  readonly macros: readonly {
    readonly code: MacroCode
    readonly label: string
    readonly value: string
    /** Of the energy's midpoint, 0 to 1. */
    readonly share: number
  }[]
}

export function programNutritionCopy(
  nutrition: ProgramNutrition,
  daysPerWeek: number,
  locale: Locale,
): ProgramNutritionCopy {
  const figure = (value: number) => Math.round(value).toLocaleString(intlLocale(locale))
  const text = textFor(locale).nutrition
  const target = (code: string) => nutrition.targets.find((one) => one.nutrient_code === code)
  const energy = target('energy')
  const low = energy?.minimum ?? energy?.exact ?? 0
  const high = energy?.maximum ?? energy?.exact ?? 0
  const middle = (low + high) / 2
  return {
    energy: low === high ? figure(low) : `${figure(low)}–${figure(high)}`,
    purpose: text.program.purpose(
      text.program.purposes[nutrition.goal_code],
      text.program.days(daysPerWeek),
    ),
    macros: MACROS.flatMap(([code, kcalPerGram]) => {
      const grams = target(code)?.exact ?? target(code)?.minimum ?? null
      if (grams === null) return []
      return [
        {
          code,
          label: text.nutrientsShort[code],
          value: `${figure(grams)} g`,
          share: middle > 0 ? Math.min(1, (grams * kcalPerGram) / middle) : 0,
        },
      ]
    }),
  }
}
