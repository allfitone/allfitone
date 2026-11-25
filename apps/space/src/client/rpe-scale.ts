/**
 * The effort scale, and what each number means.
 *
 * **Nobody has to know what RPE is.** A bare 1-to-10 field is a question in a language
 * half the people do not speak, and the half that does disagree on where it starts. So
 * the scale opens explained: what is measured above, and what the number just marked
 * means below.
 *
 * **From six up it is measured in reps left**, which is how it is really prescribed: an
 * 8 is «you could have done two more». Below six nobody counts reps — too many are left
 * for the number to mean anything — so those rungs are described by how they feel.
 *
 * **It is marked while training, not while planning** (`ADR-033`): it is what the set
 * cost, known only after doing it, which is why the scale speaks in the past. The words
 * are `text.session.rpe`, one rung per entry.
 */

import type { Dictionary } from '../i18n'

export const RPE_MIN = 1
export const RPE_MAX = 10

/** The scale's words, rung by rung: `text.session.rpe`. */
export type RpeWords = Dictionary['session']['rpe']

export interface RpeLevel {
  readonly value: number
  /** Two words: what is read at a glance while marking. */
  readonly name: string
  /** What is being asked, in the unit that serves that stretch of the scale. */
  readonly detail: string
}

/** The ten rungs, numbered from one in the order the words list them. */
export function rpeLevels(words: RpeWords): readonly RpeLevel[] {
  return words.levels.map((level, index) => ({ value: RPE_MIN + index, ...level }))
}

/** The rung for a number, or nothing for one the scale does not have. */
export function rpeLevel(value: number | undefined, words: RpeWords): RpeLevel | undefined {
  if (value === undefined) return undefined
  return rpeLevels(words).find((level) => level.value === value)
}

/**
 * What the row writes in its column. A dash and not a zero: not marking effort and
 * marking the minimum are different things, and a zero would say the second.
 */
export function rpeShown(value: number | undefined): string {
  return value === undefined ? '—' : String(value)
}

/**
 * The copy the scale shows, which changes with what is marked. Unmarked it says it is
 * optional instead of staying blank: the gap reads as something left to fill.
 */
export function rpeCopy(value: number | undefined, words: RpeWords): string {
  const level = rpeLevel(value, words)
  return level === undefined ? words.unset : `${level.name}. ${level.detail}`
}
