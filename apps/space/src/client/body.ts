/**
 * What «Cuerpo» says about the person's measurements and photos (`BODY-2`, HU-SP-025).
 *
 * Every record arrives in the canonical unit of its dimension — kilograms, centimetres,
 * a percentage. Lengths are drawn as they come; a mass is drawn in the person's unit,
 * converted by `units.ts`, the one home of the factor, and never stored converted.
 * Weight and height are free; the measures below are Pro (`body_measurements`), which
 * the database enforces whatever the screen shows.
 *
 * Height is not among `MEASURES`. It is asked once, at onboarding, and changing it is
 * a correction rather than progress.
 */

import type { AllfitV1Schemas } from '@allfitone/contracts'

import { intlLocale, type Dictionary, type Locale } from '../i18n'
import { massIn, type MassUnit } from '../units/units'

export type BodyRecord = AllfitV1Schemas['BodyProgressRecord']
export type BodyPage = AllfitV1Schemas['BodyProgressPage']
export type BodyMetric = BodyRecord['metric_code']
export type BodyPhoto = AllfitV1Schemas['BodyPhoto']
export type BodyPhotoPage = AllfitV1Schemas['BodyPhotoPage']
export type BodyDeclaration = AllfitV1Schemas['SpaceBodyProgressDeclaration']

/** Its name, its short name and how to take it are words: `text.progress.measures.each`. */
export interface Measure {
  readonly code: Exclude<BodyMetric, 'body_weight' | 'body_height'>
  /** The canonical unit of its dimension. */
  readonly unit: 'cm' | 'percent' | 'kg'
  readonly suffix: string
  readonly step: number
  readonly min: number
  readonly max: number
  /** Where a first reading starts when there is no earlier one. */
  readonly resting: number
}

export const MEASURES: readonly Measure[] = [
  {
    code: 'chest',
    unit: 'cm',
    suffix: 'cm',
    step: 0.5,
    min: 50,
    max: 180,
    resting: 95,
  },
  {
    code: 'arm',
    unit: 'cm',
    suffix: 'cm',
    step: 0.5,
    min: 15,
    max: 70,
    resting: 32,
  },
  {
    code: 'waist',
    unit: 'cm',
    suffix: 'cm',
    step: 0.5,
    min: 40,
    max: 180,
    resting: 82,
  },
  {
    code: 'hip',
    unit: 'cm',
    suffix: 'cm',
    step: 0.5,
    min: 50,
    max: 180,
    resting: 96,
  },
  {
    code: 'thigh',
    unit: 'cm',
    suffix: 'cm',
    step: 0.5,
    min: 25,
    max: 100,
    resting: 55,
  },
  {
    code: 'body_fat',
    unit: 'percent',
    suffix: '%',
    step: 0.5,
    min: 3,
    max: 60,
    resting: 20,
  },
  {
    code: 'muscle_mass',
    unit: 'kg',
    suffix: 'kg',
    step: 0.1,
    min: 10,
    max: 120,
    resting: 30,
  },
]

/**
 * A measure as the wheel shows it: muscle mass in the person's mass unit, whole pounds
 * for its bounds; every other measure as the database keeps it.
 */
export function shownMeasure(measure: Measure, mass: MassUnit): Measure {
  if (measure.unit !== 'kg' || mass === 'kg') return measure
  const pounds = (kilos: number) => Math.round(massIn(kilos, mass))
  return {
    ...measure,
    suffix: mass,
    min: pounds(measure.min),
    max: pounds(measure.max),
    resting: pounds(measure.resting),
  }
}

/** A stored reading of `measure` in the unit `shownMeasure` draws it in, in tenths. */
export function readingIn(measure: Measure, canonical: number, mass: MassUnit): number {
  if (measure.unit !== 'kg' || mass === 'kg') return canonical
  return massTenths(canonical, mass)
}

/** What recording a measure sends: what was read, in the unit it was read in. */
export function declarationOf(
  code: Measure['code'],
  value: number,
  measuredOn: string,
  mass: MassUnit,
): BodyDeclaration {
  switch (code) {
    case 'body_fat':
      return { metric_code: code, value, unit: 'percent', measured_on: measuredOn }
    case 'muscle_mass':
      return { metric_code: code, value, unit: mass, measured_on: measuredOn }
    default:
      return { metric_code: code, value, unit: 'cm', measured_on: measuredOn }
  }
}

/** Newest first by the day it was measured, then by when it was written down. */
function newestFirst(records: readonly BodyRecord[], metric: BodyMetric): BodyRecord[] {
  return records
    .filter((one) => one.metric_code === metric)
    .sort((a, b) =>
      a.measured_on === b.measured_on
        ? b.recorded_at.localeCompare(a.recorded_at)
        : b.measured_on.localeCompare(a.measured_on),
    )
}

export function latestOf(
  records: readonly BodyRecord[],
  metric: BodyMetric,
): BodyRecord | undefined {
  return newestFirst(records, metric)[0]
}

/** Against the reading before the latest; undefined until there are two. */
export function measureChange(
  records: readonly BodyRecord[],
  metric: BodyMetric,
): { readonly change: number; readonly since: string } | undefined {
  const [latest, before] = newestFirst(records, metric)
  if (!latest || !before) return undefined
  return { change: Math.round((latest.value - before.value) * 10) / 10, since: before.measured_on }
}

/** The readings of the last `months` months up to today, oldest first. */
export function seriesOf(
  records: readonly BodyRecord[],
  metric: BodyMetric,
  months: number,
  today: string,
): { readonly measured_on: string; readonly value: number }[] {
  const [year = 1970, month = 1, day = 1] = today.split('-').map(Number)
  const from = new Date(Date.UTC(year, month - 1 - months, day)).toISOString().slice(0, 10)
  return newestFirst(records, metric)
    .filter((one) => one.measured_on >= from && one.measured_on <= today)
    .reverse()
    .map((one) => ({ measured_on: one.measured_on, value: one.value }))
}

const dayNumber = (iso: string) => {
  const [year = 1970, month = 1, day = 1] = iso.split('-').map(Number)
  return Date.UTC(year, month - 1, day) / 86_400_000
}

/**
 * Where each reading sits across the last `months` months, 0 at the start and 1 today.
 * The first reading is held from the start, so a few late readings still draw a line.
 */
export function timeline(
  series: readonly { readonly measured_on: string; readonly value: number }[],
  months: number,
  today: string,
): { readonly at: number; readonly value: number }[] {
  const [year = 1970, month = 1, day = 1] = today.split('-').map(Number)
  const start = Date.UTC(year, month - 1 - months, day) / 86_400_000
  const span = Math.max(1, dayNumber(today) - start)
  const points = series.map((point) => ({
    at: Math.min(1, Math.max(0, (dayNumber(point.measured_on) - start) / span)),
    value: point.value,
  }))
  const [first] = points
  return first && first.at > 0 ? [{ at: 0, value: first.value }, ...points] : points
}

/** «84 días» between two photos, «1 día», or «El mismo día»; in the locale of `text`. */
export function daysApart(
  older: string,
  newer: string,
  text: Dictionary['progress']['body'],
): string {
  const days = Math.abs(Math.round(dayNumber(newer) - dayNumber(older)))
  return days === 0 ? text.sameDay : text.daysApart(days)
}

/**
 * The months the axis names, oldest first: at most five, always ending with this one.
 * `names` are the short month names, January first.
 */
export function monthTicks(months: number, today: string, names: readonly string[]): string[] {
  const [year = 1970, month = 1] = today.split('-').map(Number)
  const count = Math.max(2, months)
  const all = Array.from({ length: count }, (_, index) => {
    const date = new Date(Date.UTC(year, month - count + index, 1))
    return (names[date.getUTCMonth()] ?? '').toUpperCase()
  })
  if (all.length <= 5) return all
  return [0, 1, 2, 3, 4].map((tick) => all[Math.round((tick * (all.length - 1)) / 4)] ?? '')
}

/** «70,2», «82»: one decimal at most, with the locale's decimal mark and no grouping. */
export function decimal(value: number, locale: Locale): string {
  const rounded = Math.round(value * 10) / 10
  return rounded.toLocaleString(intlLocale(locale), {
    maximumFractionDigits: 1,
    useGrouping: false,
  })
}

/** A mass in tenths of the unit shown; what is stored stays the canonical kilos. */
export function massTenths(kilos: number, unit: MassUnit): number {
  return Math.round(massIn(kilos, unit) * 10) / 10
}

/** «71,0»: a weight keeps its tenth, which is where the progress is. */
export function tenths(value: number, locale: Locale): string {
  return (Math.round(value * 10) / 10).toLocaleString(intlLocale(locale), {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
    useGrouping: false,
  })
}

/** «2 ago», «Aug 2». */
export function shortDay(iso: string, text: Dictionary): string {
  const [, month = 1, day = 1] = iso.split('-').map(Number)
  return text.progress.day(day, text.common.months[month - 1] ?? '')
}

/**
 * The values a wheel turns through: `reach` either side of the last reading, on the
 * step, inside the bounds. Rounded at every step so 0.1 added seventy times is 70.2.
 */
export function runAround(
  around: number,
  step: number,
  reach: number,
  min: number,
  max: number,
): number[] {
  const scale = Math.round(1 / step)
  const low = Math.max(min, Math.round((around - reach) * scale) / scale)
  const high = Math.min(max, Math.round((around + reach) * scale) / scale)
  const count = Math.round((high - low) * scale)
  return Array.from(
    { length: count + 1 },
    (_, index) => Math.round((low + index / scale) * scale) / scale,
  )
}

/** The two photos side by side, older first: the two chosen, or the oldest and the newest. */
export function comparedPhotos(
  photos: readonly BodyPhoto[],
  chosen: readonly string[],
): BodyPhoto[] {
  const picked = photos.filter((one) => chosen.includes(one.id))
  const pair =
    picked.length === 2
      ? picked
      : [photos.at(-1), photos[0]].filter((one): one is BodyPhoto => one !== undefined)
  const unique = pair.filter(
    (one, index) => pair.findIndex((other) => other.id === one.id) === index,
  )
  return unique.sort((a, b) => a.taken_on.localeCompare(b.taken_on))
}
