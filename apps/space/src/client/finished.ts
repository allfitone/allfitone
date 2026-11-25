/**
 * A finished session as its detail shows it, and as its edit changes it (FIN-18, ADR-038).
 *
 * **Dates are said in the zone the person trains in**, worked out here rather than with
 * `Intl`'s month names, whose abbreviations vary by engine («sept.», «sep»): the row on
 * the phone has to read the same as the one in the test. The names are the dictionary's.
 *
 * **Loads read in the person's unit.** A set keeps the unit it was logged in; it is shown
 * as is when that is her unit, and converted to one decimal when it is not.
 *
 * **Editing is the session screen itself** (`session-form.ts`), so a corrected set is
 * written exactly as a logged one. Two things differ. A past session opens with only what
 * was recorded, never the rows the routine proposed and nobody did; and each recorded set
 * carries its `origin` and shows itself as recorded where the session shows last time,
 * so the changes can be counted even after sets were removed and the ladder renumbered.
 */

import type { Execution, FinishedExecution, FinishedSet, InvalidationPreview } from './execution'
import { workingStateFrom, type WorkingExercise } from './session-form'
import { intlLocale, type Dictionary, type Locale } from '../i18n'
import { isMassUnit, kilogramsFrom, massIn, type MassUnit } from '../units/units'

/** What a finished session says: `text.session`. */
export type SessionWords = Dictionary['session']

/** The half of the day: `text.session.time`. */
type Periods = SessionWords['time']

const figure = (value: number, locale: Locale) =>
  value.toLocaleString(intlLocale(locale), { maximumFractionDigits: 2 })

/** A load logged in `from`, as a figure in `unit`: exact when they match, else one decimal. */
function loadFigure(value: number, from: MassUnit, unit: MassUnit, locale: Locale): string {
  if (from === unit) return figure(value, locale)
  return figure(Math.round(massIn(kilogramsFrom(value, from), unit) * 10) / 10, locale)
}

/** The local calendar day and clock of an instant, in the person's zone. */
function localParts(iso: string, timeZone: string) {
  const at = new Date(iso)
  const [year = 1970, month = 1, day = 1] = new Intl.DateTimeFormat('en-CA', { timeZone })
    .format(at)
    .split('-')
    .map(Number)
  const clock = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(at)
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay()
  return { day, month: month - 1, weekday, clock }
}

/** «18:02», the clock an instant shows in the person's zone. */
export function clockOf(iso: string, timeZone: string): string {
  return localParts(iso, timeZone).clock
}

/** The wheels' hour, 1 to 12, and which half of the day; 0 is twelve at night. */
export function toTwelve(hour: number): { readonly hour: number; readonly pm: boolean } {
  return { hour: hour % 12 === 0 ? 12 : hour % 12, pm: hour >= 12 }
}

export const fromTwelve = (hour: number, pm: boolean): number => (hour % 12) + (pm ? 12 : 0)

/** «18:02» as people read it: «6:02» and «p. m.», or «PM». */
export function twelveHour(
  clock: string,
  periods: Periods,
): { readonly time: string; readonly period: string } {
  const [hour = 0, minute = '00'] = clock.split(':')
  const twelve = toTwelve(Number(hour))
  return { time: `${String(twelve.hour)}:${minute}`, period: twelve.pm ? periods.pm : periods.am }
}

const label = (clock: string, periods: Periods) => {
  const { time, period } = twelveHour(clock, periods)
  return `${time} ${period}`
}

/** «6:02 p. m.», the clock an instant shows in the person's zone. */
export const clockLabel = (iso: string, timeZone: string, periods: Periods): string =>
  label(clockOf(iso, timeZone), periods)

/** «6:02–6:50 p. m.», or «11:40 a. m.–12:20 p. m.» when the range crosses noon. */
export function rangeLabel(start: string, end: string, periods: Periods): string {
  const from = twelveHour(start, periods)
  const to = twelveHour(end, periods)
  return from.period === to.period
    ? `${from.time}–${label(end, periods)}`
    : `${label(start, periods)}–${label(end, periods)}`
}

/**
 * The instant at «HH:MM» on the same local day, in the person's zone; null for anything
 * that is not a clock. The zone's offset is read at that moment, so a change of offset
 * on another day cannot move it.
 */
export function withClock(iso: string, clock: string, timeZone: string): string | null {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(clock.trim())
  if (!match) return null
  const [year = 1970, month = 1, day = 1] = new Intl.DateTimeFormat('en-CA', { timeZone })
    .format(new Date(iso))
    .split('-')
    .map(Number)
  const wall = Date.UTC(year, month - 1, day, Number(match[1]), Number(match[2]))
  const shown = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  })
    .formatToParts(new Date(wall))
    .reduce<Record<string, number>>(
      (parts, part) => ({ ...parts, [part.type]: Number(part.value) }),
      {},
    )
  const offset =
    Date.UTC(
      shown.year ?? year,
      (shown.month ?? month) - 1,
      shown.day ?? day,
      shown.hour ?? 0,
      shown.minute ?? 0,
    ) - wall
  return new Date(wall - offset).toISOString()
}

/** «70 kg × 8», «10 reps», «70 kg», or «—» for a set with neither; the load in her unit. */
export function setLine(
  set: FinishedSet,
  locale: Locale,
  unit: MassUnit,
  words: SessionWords,
): string {
  const from = isMassUnit(set.load_unit_code) ? set.load_unit_code : 'kg'
  const load =
    set.load_value === null ? null : `${loadFigure(set.load_value, from, unit, locale)} ${unit}`
  if (load && set.achieved_reps !== null) return words.finished.loadTimes(load, set.achieved_reps)
  if (load) return load
  if (set.achieved_reps !== null) return words.finished.reps(set.achieved_reps)
  return '—'
}

/** «Mejor serie 70 kg × 8», or nothing when no work set was weighed. */
export function bestSetLine(
  best: FinishedExecution['exercises'][number]['best_set'],
  locale: Locale,
  unit: MassUnit,
  words: SessionWords,
): string | null {
  if (!best) return null
  const load = `${loadFigure(best.load_kg, 'kg', unit, locale)} ${unit}`
  return words.finished.bestSet(words.finished.loadTimes(load, best.reps))
}

/** «4 ejercicios · 12 series». A warmup is not a work set. */
export function exercisesLine(detail: FinishedExecution, words: SessionWords): string {
  const work = detail.exercises.reduce(
    (total, exercise) => total + exercise.sets.filter((one) => one.kind !== 'warmup').length,
    0,
  )
  return words.finished.exercisesLine(detail.exercises.length, work)
}

/** «+4 % de carga frente al 17 sep», against the last time the same routine was done. */
export function comparisonLine(
  previous: FinishedExecution['previous'],
  timeZone: string,
  words: SessionWords,
): string | null {
  if (!previous || previous.change_percent === null) return null
  const { day, month } = localParts(previous.started_at, timeZone)
  const when = words.finished.dayMonth(day, words.calendar.monthsShort[month] ?? '')
  const change = Math.round(previous.change_percent)
  if (change === 0) return words.finished.sameLoad(when)
  const sign = change > 0 ? '+' : '−'
  return words.finished.loadChange(`${sign}${String(Math.abs(change))}`, when)
}

/** «mar 29 sep · 6:02–6:50 p. m.». */
export function whenRange(
  detail: FinishedExecution,
  timeZone: string,
  words: SessionWords,
): string {
  const start = localParts(detail.started_at, timeZone)
  const end = localParts(detail.ended_at, timeZone)
  return words.finished.when(
    words.calendar.weekdays[start.weekday] ?? '',
    start.day,
    words.calendar.monthsShort[start.month] ?? '',
    rangeLabel(start.clock, end.clock, words.time),
  )
}

/** «Tirón · mar 29», the title of the session's menu. */
export function menuTitle(
  name: string,
  startedAt: string,
  timeZone: string,
  words: SessionWords,
): string {
  const { weekday, day } = localParts(startedAt, timeZone)
  return words.finished.menuTitle(name, words.calendar.weekdays[weekday] ?? '', day)
}

/** «Tirón del martes 29 sale de tu historial…»: what «Eliminar» is about to do. */
export function deletionLine(
  name: string,
  startedAt: string,
  timeZone: string,
  words: SessionWords,
): string {
  const { weekday, day } = localParts(startedAt, timeZone)
  return words.finished.deletion(name, words.calendar.weekdaysLong[weekday] ?? '', day)
}

export interface Consequence {
  readonly icon: 'record' | 'energy' | 'weight'
  readonly text: string
}

/** What annulling takes with it, said before it is confirmed (FIN-18c). */
export function annulConsequences(
  preview: InvalidationPreview,
  words: SessionWords,
): readonly Consequence[] {
  const said = words.finished
  const lines: Consequence[] = []
  if (preview.records === 1) lines.push({ icon: 'record', text: said.loseRecord })
  else if (preview.records > 1) {
    lines.push({ icon: 'record', text: said.loseRecords(preview.records) })
  }
  const { streak_weeks: now, streak_weeks_after: after } = preview
  if (after < now) {
    lines.push({
      icon: 'energy',
      text: after === 0 ? said.loseStreak(now) : said.streakDrops(now, after),
    })
  }
  lines.push({ icon: 'weight', text: said.totalsRecalculate })
  return lines
}

// ———————————————————————————————————————— editing

const originOf = (position: number, order: number) => `${position}:${order}`

/** «65 × 8», as the session writes last time's set; a load alone carries its unit. */
const recordedLine = (load: string, reps: string, unit: MassUnit) =>
  load && reps ? `${load} × ${reps}` : load ? `${load} ${unit}` : reps ? `× ${reps}` : '—'

/** What was recorded, and nothing the routine proposed that nobody did. */
export function editStateFrom(
  execution: Execution,
  extra: Parameters<typeof workingStateFrom>[1] = {},
): readonly WorkingExercise[] {
  const unit = extra.unit ?? 'kg'
  let order = 0
  return workingStateFrom(execution, extra).map((exercise) => ({
    ...exercise,
    key: exercise.key ?? `edit-${exercise.position}`,
    sets: exercise.sets
      .filter((one) => one.done)
      .map((one) => ({
        ...one,
        order: (order += 1),
        origin: originOf(exercise.position, one.order),
        // «Antes» is the column the session calls «anterior»: here it is the set as recorded.
        previous: recordedLine(one.load, one.reps, unit),
      })),
  }))
}

const numeric = (text: string) => {
  const value = Number(text.replace(',', '.'))
  return text.trim() === '' || !Number.isFinite(value) ? null : value
}

type Set = WorkingExercise['sets'][number]

const sameSet = (one: Set, other: Set) =>
  numeric(one.load) === numeric(other.load) &&
  numeric(one.reps) === numeric(other.reps) &&
  one.kind === other.kind &&
  one.rpe === other.rpe &&
  one.done === other.done

const recordedSets = (exercises: readonly WorkingExercise[]) =>
  new Map(
    exercises.flatMap((exercise) =>
      exercise.sets.flatMap((one) => (one.origin ? [[one.origin, one] as const] : [])),
    ),
  )

/** How many things changed: each set edited, added or removed, the order, and the time. */
export function changesBetween(
  before: readonly WorkingExercise[],
  after: readonly WorkingExercise[],
  timeChanged: boolean,
): number {
  const recorded = recordedSets(before)
  const kept = new Set<string>()
  let changes = 0
  for (const one of after.flatMap((exercise) => exercise.sets)) {
    const original = one.origin ? recorded.get(one.origin) : undefined
    if (!one.origin || !original) changes += 1
    else {
      kept.add(one.origin)
      if (!sameSet(original, one)) changes += 1
    }
  }
  changes += recorded.size - kept.size
  const keys = (list: readonly WorkingExercise[]) => list.map((exercise) => exercise.key)
  const shared = new Set(keys(after))
  const order = keys(before).filter((key) => shared.has(key))
  const reordered = keys(after).filter((key) => order.includes(key))
  if (order.join() !== reordered.join()) changes += 1
  return changes + (timeChanged ? 1 : 0)
}
