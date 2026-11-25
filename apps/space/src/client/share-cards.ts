/**
 * What «Compártelo» says about a finished session (FIN-17a, FIN-17, ADR-036).
 *
 * Pure, so every line a card prints can be asserted without drawing one. The numbers
 * come from the server, which derives records, streak and session number when they are
 * read; this file only decides which cards appear and how each figure is worded.
 *
 * **A card that has nothing true to say does not appear.** No record, no record card;
 * a streak of one week is just a week. A card announcing «0 récords» is a card telling
 * somebody they failed on the day they trained.
 *
 * Words come in as `text.session`; every weight is canonical kilograms, printed in the
 * person's unit.
 */

import type { AllfitV1Schemas } from '@allfitone/contracts'
import { intlLocale, type Dictionary, type Locale } from '../i18n'
import { massIn, type MassUnit } from '../units/units'

/** What the cards say: `text.session`. */
export type CardWords = Dictionary['session']

export type ShareSummary = AllfitV1Schemas['SpaceExecutionSummary']
export type ShareRecord = ShareSummary['records'][number]

export type CardKind =
  | 'photo'
  | 'record'
  | 'streak'
  | 'session'
  | 'muscles'
  | 'number'
  | 'plain'
  | 'total'
  | 'time'
  | 'records'
  | 'sets'

/** The transparent stickers of FIN-SH2, to go over a photograph of the person's own. */
export type StickerKind = 'figures' | 'record' | 'streak' | 'strip' | 'muscles' | 'number'

/** Below this, a run of weeks is not yet a streak worth a card of its own. */
const SHORTEST_STREAK = 2

/** The ones the record card is for, most legible first: «más peso» needs no explaining. */
const RECORD_ORDER: readonly ShareRecord['kind'][] = [
  'heaviest',
  'e1rm',
  'best_set',
  'session_volume',
]

export function cardsFor(summary: ShareSummary): readonly CardKind[] {
  return [
    'photo',
    ...(summary.records.length > 0 ? (['record'] as const) : []),
    ...(summary.streak_weeks >= SHORTEST_STREAK ? (['streak'] as const) : []),
    'session',
    'muscles',
    'number',
    'plain',
    // The minimal ones of FIN-SH: one idea each, after the full cards.
    ...(summary.total_volume_kg !== null ? (['total'] as const) : []),
    'time',
    ...(summary.records.length > 0 ? (['records'] as const) : []),
    'sets',
  ]
}

export function stickersFor(summary: ShareSummary): readonly StickerKind[] {
  return [
    'figures',
    ...(summary.records.length > 0 ? (['record'] as const) : []),
    ...(summary.streak_weeks >= SHORTEST_STREAK ? (['streak'] as const) : []),
    'strip',
    'muscles',
    'number',
  ]
}

/** «+2,5 KG», and what beating it means. */
export function recordGain(
  record: ShareRecord,
  locale: Locale,
  unit: MassUnit,
  words: CardWords,
): {
  readonly gain: string
  readonly meaning: string
} {
  const gain =
    Math.round((massIn(record.value, unit) - massIn(record.previous_value, unit)) * 10) / 10
  return {
    gain: `+${kilos(gain, locale)} ${unit.toUpperCase()}`,
    meaning: words.cards.meaning[record.kind],
  }
}

/** «EN 26 MINUTOS», or «EN 1 H 05» past an hour. */
export function minutesLine(seconds: number, words: CardWords): string {
  const minutes = Math.max(1, Math.round(seconds / 60))
  if (minutes < 60) return words.cards.minutes(minutes)
  return words.cards.hours(Math.floor(minutes / 60), String(minutes % 60).padStart(2, '0'))
}

/** «Tirón · sesión 14 · 2 récords», with only the parts there are. */
export function shareSubtitle(summary: ShareSummary, words: CardWords): string {
  const said = words.cards
  const count = summary.records.length
  const parts = [
    summary.title,
    summary.title
      ? said.subtitleSession(summary.session_number)
      : said.subtitleSessionAlone(summary.session_number),
    count === 0 ? null : said.subtitleRecords(count),
  ]
  return parts.filter((part): part is string => Boolean(part)).join(' · ')
}

/** «MAR 29 · SESIÓN 14»: the day it was trained, in the zone it was trained in. */
export function whenLine(
  summary: ShareSummary,
  timeZone: string,
  locale: Locale,
  words: CardWords,
): string {
  const at = new Date(summary.started_at)
  const weekday = new Intl.DateTimeFormat(intlLocale(locale), { weekday: 'short', timeZone })
    .format(at)
    .replace('.', '')
  const day = new Intl.DateTimeFormat(intlLocale(locale), { day: 'numeric', timeZone }).format(at)
  return words.cards.when(weekday, day, summary.session_number).toUpperCase()
}

/** «48:12», or «1:02:05» past an hour. */
export function durationLabel(seconds: number): string {
  const whole = Math.max(0, Math.round(seconds))
  const pad = (value: number) => String(value).padStart(2, '0')
  const hours = Math.floor(whole / 3600)
  const minutes = Math.floor(whole / 60) % 60
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(whole % 60)}` : `${minutes}:${pad(whole % 60)}`
}

/** «4×6», «4×8–10» when the reps varied, «3 series» when none were counted. */
export function exerciseShape(
  exercise: ShareSummary['exercises'][number],
  words: CardWords,
): string {
  const { work_sets: sets, reps_min: low, reps_max: high } = exercise
  if (low === null || high === null) return words.cards.setsAlone(sets)
  return low === high ? `${sets}×${low}` : `${sets}×${low}–${high}`
}

interface Catalogue {
  readonly movements: readonly { readonly id: string; readonly muscles: readonly string[] }[]
  readonly muscles: readonly {
    readonly code: string
    readonly name: string
    readonly body_slug?: string | null
  }[]
}

export interface WorkedMuscle {
  readonly code: string
  readonly name: string
  readonly main: boolean
  /** The work sets that trained it: as the main muscle, or only helping. */
  readonly sets: number
}

/**
 * Every muscle the session worked: the main ones first, by the sets they took, then the
 * ones that only helped. The main muscle is each movement's first, as on Hoy, so the
 * two never disagree about what a routine trains.
 */
/** What the muscles are read from: a summary, or a finished session's detail. */
export interface WorkedSource {
  readonly title: string | null
  readonly exercises: readonly { readonly movement_id: string | null; readonly work_sets: number }[]
}

export function workedMuscles(
  summary: WorkedSource,
  catalogue: Catalogue,
): readonly WorkedMuscle[] {
  const musclesOf = new Map(catalogue.movements.map((movement) => [movement.id, movement.muscles]))
  const named = new Map(catalogue.muscles.map((muscle) => [muscle.code, muscle.name]))
  const main = new Map<string, number>()
  const helping = new Map<string, number>()
  for (const exercise of summary.exercises) {
    const codes = exercise.movement_id ? (musclesOf.get(exercise.movement_id) ?? []) : []
    codes.forEach((code, index) => {
      const into = index === 0 ? main : helping
      into.set(code, (into.get(code) ?? 0) + exercise.work_sets)
    })
  }
  const byLoad = (load: ReadonlyMap<string, number>) =>
    [...load.entries()]
      .filter(([code]) => named.has(code))
      .sort(
        ([one, a], [other, b]) =>
          b - a || (named.get(one) ?? one).localeCompare(named.get(other) ?? other, 'es'),
      )
  return [
    ...byLoad(main).map(([code, sets]) => ({
      code,
      name: named.get(code) ?? code,
      main: true,
      sets,
    })),
    ...byLoad(helping)
      .filter(([code]) => !main.has(code))
      .map(([code, sets]) => ({ code, name: named.get(code) ?? code, main: false, sets })),
  ]
}

/** «DORSAL Y BÍCEPS»: the two main groups, the routine's name without them, never empty. */
export function groupsTitle(summary: WorkedSource, catalogue: Catalogue, words: CardWords): string {
  const leading = workedMuscles(summary, catalogue)
    .filter((muscle) => muscle.main)
    .slice(0, 2)
    .map((muscle) => muscle.name)
  const title =
    leading.length > 0 ? leading.join(words.cards.and) : (summary.title ?? words.workout)
  return title.toUpperCase()
}

/**
 * The routine's own name for the header, or the groups when the session had none.
 * The groups lead the muscles card; everywhere else the name is what was trained.
 */
export function routineTitle(
  summary: ShareSummary,
  catalogue: Catalogue,
  words: CardWords,
): string {
  return summary.title ? summary.title.toUpperCase() : groupsTitle(summary, catalogue, words)
}

/** The record the card leads with, by `RECORD_ORDER`. */
export function headline(records: readonly ShareRecord[]): ShareRecord | undefined {
  return [...records].sort(
    (one, other) => RECORD_ORDER.indexOf(one.kind) - RECORD_ORDER.indexOf(other.kind),
  )[0]
}

const kilos = (value: number, locale: Locale) =>
  value.toLocaleString(intlLocale(locale), { maximumFractionDigits: 1 })

export interface RecordFigure {
  readonly big: string
  readonly unit: string
  readonly tail: string
  readonly label: string
}

/** How each kind of record is printed: the figure, its unit, and what it measured. */
export function recordFigure(
  record: ShareRecord,
  locale: Locale,
  unit: MassUnit,
  words: CardWords,
): RecordFigure {
  const value = massIn(record.value, unit)
  const big = kilos(value, locale)
  const shown = unit.toUpperCase()
  const label = words.cards.figureLabel[record.kind]
  switch (record.kind) {
    case 'heaviest':
      return { big, unit: shown, tail: record.reps ? `× ${record.reps}` : '', label }
    case 'e1rm':
      return { big: kilos(Math.round(value), locale), unit: shown, tail: '1RM', label }
    case 'best_set':
      return { big, unit: shown, tail: words.cards.inASet, label }
    case 'session_volume':
      return { big, unit: shown, tail: words.cards.inTheSession, label }
  }
}

/** Calendar days from the earlier best to the session, both as local dates. */
export function daysSince(record: ShareRecord, trainedOn: string): number {
  return Math.round(
    (Date.parse(`${trainedOn}T00:00:00Z`) - Date.parse(`${record.previous_on}T00:00:00Z`)) /
      86_400_000,
  )
}

/** The design's phone and card: a 300-point card on a 390-point screen. */
const DESIGN_SCREEN = 390
const DESIGN_CARD = { width: 300, height: 533 } as const

/**
 * How much a card is scaled on this phone: the design's proportion of the width, unless
 * the height left for it is less, so the actions below never fall off the screen.
 */
export function cardScale(screenWidth: number, roomHeight: number): number {
  return Math.min(screenWidth / DESIGN_SCREEN, roomHeight / DESIGN_CARD.height)
}

export interface RecordJump {
  readonly before: string
  readonly now: string
  /** Signed, so it reads as the gain: «+2,5». */
  readonly delta: string
  /** The earlier best as a share of today's, for bars drawn to scale. */
  readonly ratio: number
}

/** A record told as the jump it was, in the person's unit. */
export function recordJump(record: ShareRecord, locale: Locale, unit: MassUnit): RecordJump {
  const before = massIn(record.previous_value, unit)
  const now = massIn(record.value, unit)
  return {
    before: kilos(before, locale),
    now: kilos(now, locale),
    delta: `+${kilos(now - before, locale)}`,
    ratio: record.value > 0 ? record.previous_value / record.value : 0,
  }
}

/**
 * One size for every figure of a band, set by the longest. Each shrunk on its own,
 * the four sat at four sizes and read as unrelated numbers.
 */
export function bandFigureSize(values: readonly string[]): number {
  const longest = Math.max(0, ...values.map((value) => value.length))
  return longest <= 5 ? 30 : longest <= 7 ? 24 : 20
}

/** «17 SEP» from a calendar date, without a time zone to move it. */
export function shortDay(date: string, words: CardWords): string {
  const [, month, day] = date.split('-').map(Number)
  return words.cards.shortDay(day ?? 1, words.cards.monthsShort[(month ?? 1) - 1] ?? '')
}

/** «1 ejercicio», «5 ejercicios». */
export const exercisesLabel = (count: number, words: CardWords) => words.cards.exercises(count)

/**
 * Where «Historias» sends the card. Instagram's story composer needs Meta's app id
 * and the app on the phone; without either, the system sheet still reaches it.
 */
export function storyRoute(
  appId: string | undefined,
  instagramAvailable: boolean,
): 'instagram' | 'sheet' {
  return appId?.trim() && instagramAvailable ? 'instagram' : 'sheet'
}

/** What undoing a picked background offers: the routine's photo back, or none. */
export const restoreLabel = (cover: string | null, words: CardWords) =>
  cover ? words.share.routinePhoto : words.share.removePhoto

/** The most steps the streak card draws; a longer streak shows its last ones. */
const MOST_STEPS = 5

/** Which weeks the steps show: the last `shown` of the streak, from week `first`. */
export function streakSteps(weeks: number): { readonly first: number; readonly shown: number } {
  const shown = Math.min(weeks, MOST_STEPS)
  return { first: weeks - shown + 1, shown }
}

/**
 * «EL 28 DE SEPTIEMBRE»: the Monday of the week `weeksBack` before the session's, in
 * the person's zone, which is where the streak counts its ISO weeks.
 */
export function weekStartLabel(
  summary: ShareSummary,
  timeZone: string,
  weeksBack: number,
  words: CardWords,
): string {
  const local = new Intl.DateTimeFormat('en-CA', { timeZone }).format(new Date(summary.started_at))
  const day = new Date(`${local}T00:00:00Z`)
  const isoWeekday = day.getUTCDay() === 0 ? 7 : day.getUTCDay()
  day.setUTCDate(day.getUTCDate() - (isoWeekday - 1) - 7 * weeksBack)
  const month = (words.calendar.months[day.getUTCMonth()] ?? '').toUpperCase()
  return words.cards.weekStart(day.getUTCDate(), month)
}
