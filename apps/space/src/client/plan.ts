/**
 * What the person's plan opens, read from the functions `GET /pro` and `GET /pro/plans`
 * answer (DT-018). The database is what enforces every limit; this is only what the
 * screens say about them before anybody hits one, and the sheet that offers Pro when
 * somebody does.
 *
 * **A function the plan does not declare limits nothing**, as in the database: a plan
 * published before the function existed never promised a limit on it.
 */

import type { Dictionary } from '../i18n'
import type { ProFeature } from './pro'

const find = (features: readonly ProFeature[], code: string) =>
  features.find((feature) => feature.code === code)

/** False only when the plan declares the function closed. */
export function opens(features: readonly ProFeature[], code: string): boolean {
  return find(features, code)?.enabled ?? true
}

/** The number the plan allows; null when it is unlimited or not limited at all. */
export function limitOf(features: readonly ProFeature[], code: string): number | null {
  const feature = find(features, code)
  return feature?.enabled ? feature.limit_value : null
}

/** The first visible day of a history window, in the phone's own day; null shows all. */
export function visibleFrom(
  features: readonly ProFeature[],
  code: string,
  now = new Date(),
): Date | null {
  const months = limitOf(features, code)
  if (months === null) return null
  return new Date(now.getFullYear(), now.getMonth() - months, now.getDate())
}

// ———————————————————————————————————————— the sheet that offers Pro

type PlansText = Dictionary['plans']
type Copy = { title: string; body: string }

const UPGRADE: Readonly<
  Record<string, (free: readonly ProFeature[], text: PlansText['upgrade']) => Copy>
> = {
  training_history_months: (free, text) => ({
    title: text.training_history_months.title,
    body: text.training_history_months.body(text.window(limitOf(free, 'training_history_months'))),
  }),
  nutrition_history_months: (free, text) => ({
    title: text.nutrition_history_months.title,
    body: text.nutrition_history_months.body(
      text.window(limitOf(free, 'nutrition_history_months')),
    ),
  }),
  active_personal_programs: (free, text) => ({
    title: text.active_personal_programs.title,
    body: text.active_personal_programs.body(limitOf(free, 'active_personal_programs') ?? 1),
  }),
  own_routines: (free, text) => ({
    title: text.own_routines.title,
    body: text.own_routines.body(limitOf(free, 'own_routines') ?? 3),
  }),
  routine_duplication: (_free, text) => text.routine_duplication,
  full_program_catalogue: (_free, text) => text.full_program_catalogue,
  period_analysis: (_free, text) => text.period_analysis,
  body_measurements: (_free, text) => text.body_measurements,
  body_photos: (_free, text) => text.body_photos,
  meal_photo_recognition: (_free, text) => text.meal_photo_recognition,
}

/** What Pro opens for the function that was refused. */
export function upgradeCopy(code: string, free: readonly ProFeature[], text: PlansText): Copy {
  const copy = UPGRADE[code]?.(free, text.upgrade) ?? text.upgrade.other
  return { title: copy.title, body: copy.body }
}

// ———————————————————————————————————————— the comparison, side by side

export interface ComparisonRow {
  readonly key: string
  readonly label: string
  /** Text for the plan's value, or true for «included». */
  readonly free: string | true
  readonly pro: string | true
}

type Cells = PlansText['cells']
type Cell = (features: readonly ProFeature[], text: Cells) => string | true

const historyWindow =
  (code: string): Cell =>
  (features, text) => {
    const limit = limitOf(features, code)
    if (!opens(features, code)) return text.notIncluded
    if (limit === null) return text.complete
    return limit === 1 ? text.lastMonth : text.lastMonths(limit)
  }

const count =
  (code: string, prefixed = true): Cell =>
  (features, text) => {
    const limit = limitOf(features, code)
    if (!opens(features, code)) return text.notIncluded
    if (limit === null) return text.unlimited
    return limit === 1 || !prefixed ? String(limit) : text.upTo(limit)
  }

/** The cells that are plain words, not counts. */
type Word = { [K in keyof Cells]: Cells[K] extends string ? K : never }[keyof Cells]

const either =
  (code: string, without: Word, withIt: Word): Cell =>
  (features, text) =>
    opens(features, code) ? text[withIt] : text[without]

const always: Cell = () => true

const ROWS: readonly (readonly [keyof PlansText['rows'], Cell])[] = [
  ['sessions', always],
  ['full_program_catalogue', either('full_program_catalogue', 'basicSelection', 'fullCatalogue')],
  ['training_history_months', historyWindow('training_history_months')],
  ['period_analysis', either('period_analysis', 'sessionSummary', 'loadsVolumeConsistency')],
  [
    'body_measurements',
    (features, text) =>
      opens(features, 'body_photos')
        ? text.measuresAndPhotos
        : opens(features, 'body_measurements')
          ? text.measures
          : text.weight,
  ],
  ['meal_photo_recognition', either('meal_photo_recognition', 'logAndGoals', 'logGoalsAndPhotos')],
  ['nutrition_history_months', historyWindow('nutrition_history_months')],
  ['active_personal_programs', count('active_personal_programs', false)],
  ['own_routines', count('own_routines')],
  [
    'routine_duplication',
    (features, text) => (opens(features, 'routine_duplication') ? true : text.notIncluded),
  ],
  ['organization', always],
  ['privacy', always],
]

/** Every row of the table, from what each plan declares. */
export function comparisonRows(
  free: readonly ProFeature[],
  pro: readonly ProFeature[],
  text: PlansText,
): ComparisonRow[] {
  return ROWS.map(([key, cell]) => ({
    key,
    label: text.rows[key],
    free: cell(free, text.cells),
    pro: cell(pro, text.cells),
  }))
}
