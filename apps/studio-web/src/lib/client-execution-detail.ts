/**
 * One session a client shares with her coach, in full: `HU-STUDIO-055`.
 *
 * **Most of this story is enforced before the screen sees it.** `OP-EXE-018`
 * never carries heart rate, pain, body weight or the device that captured the
 * session — pain and weight are read through their own categories — so
 * criteria 3, 5 and 6 are the operation's, not this module's. What is left for
 * the screen is harder to see and easier to break:
 *
 * **Criterion 4: a field she did not share is indistinguishable from one she
 * did not record.** So nothing here fills an absence. A family with no rows is
 * drawn nowhere rather than drawn empty, and no value is ever replaced by
 * «sin registrar» — that sentence would claim the field exists and is empty,
 * which is exactly the deduction the criterion forbids.
 *
 * **One `404` covers six different reasons** — hidden, unfinished, annulled,
 * another relationship's, another person's, or none at all. The screen says the
 * same thing for all six and names none of them, because naming one would be a
 * guess about her.
 *
 * **Criterion 7 needs no code.** She revokes, or the relationship ends, and the
 * answer stops existing: the operation refuses and the read is never cached.
 */

import type {
  AuthorizedExecution,
  ExecutionDetailEnduranceLap,
  ExecutionDetailIntervalResult,
  ExecutionDetailMobilityResult,
  ExecutionDetailRoundResult,
  ExecutionDetailStrengthSet,
  ProfessionalObservation,
} from './studio-api'

/** The five shapes a result can take, and the rows the session actually has. */
export type ResultFamily = 'strength' | 'endurance' | 'interval' | 'round' | 'mobility'

export interface FamilyRows {
  readonly family: ResultFamily
  readonly title: string
  readonly count: number
  /** One line saying what the family is, where its name does not say it. */
  readonly note: string | null
}

const FAMILY_TITLES: Record<ResultFamily, string> = {
  strength: 'Series',
  endurance: 'Vueltas',
  interval: 'Intervalos',
  round: 'Rondas',
  mobility: 'Movilidad',
}

/*
 * Only the name that does not explain itself carries a line. «Series»,
 * «Intervalos», «Rondas» and «Movilidad» are the words a coach already works
 * in; «vuelta» is the one that reads as going around something, when what it
 * holds is a piece of a longer effort with its own distance and time. A line
 * under every family would be padding, and padding is what makes the one that
 * matters invisible.
 */
const FAMILY_NOTES: Partial<Record<ResultFamily, string>> = {
  endurance:
    'Cada vuelta es un trozo del esfuerzo, con la distancia y el tiempo que ella registró.',
}

/**
 * Which families this session recorded something in, in the order the contract
 * lists them.
 *
 * **A family with no rows is absent, not empty.** A session of running has no
 * sets, and drawing an empty «Series» panel would say she recorded none — which
 * is a claim about her training, not about the data.
 */
export function recordedFamilies(execution: AuthorizedExecution): readonly FamilyRows[] {
  const counts: readonly [ResultFamily, number][] = [
    ['strength', execution.strength_sets.length],
    ['endurance', execution.endurance_laps.length],
    ['interval', execution.interval_results.length],
    ['round', execution.round_results.length],
    ['mobility', execution.mobility_results.length],
  ]
  return counts
    .filter(([, count]) => count > 0)
    .map(([family, count]) => ({
      family,
      title: FAMILY_TITLES[family],
      count,
      note: FAMILY_NOTES[family] ?? null,
    }))
}

/** True when the session recorded nothing at all in any of the five families. */
export function recordedNothing(execution: AuthorizedExecution): boolean {
  return recordedFamilies(execution).length === 0
}

/**
 * How a result row says which part of the session it belongs to.
 *
 * `segment_position` is null for a session that was not split, and a number
 * otherwise. The label comes from the session's own `segments`, so a position
 * the list does not describe is said by its number rather than invented.
 */
export function segmentLabel(
  execution: AuthorizedExecution,
  position: number | null,
): string | null {
  if (position === null) return null
  const segment = execution.segments.find((candidate) => candidate.position === position)
  // The code is nullable: a block can exist without the catalogue naming it.
  const code = segment?.activity_type_code
  const name = typeof code === 'string' && code.length > 0 ? activityLabel(code) : null
  return name ? `Bloque ${String(position)} · ${name}` : `Bloque ${String(position)}`
}

/** True when the session is split into blocks worth labelling. */
export function hasSegments(execution: AuthorizedExecution): boolean {
  return execution.segments.length > 0
}

/*
 * The activity codes Studio knows how to say in Spanish. A code that is not
 * here is shown as it came: the catalogue is the product's vocabulary and this
 * list can only ever fall behind it, so it must never replace a real code with
 * a guess.
 */
const ACTIVITIES: Record<string, string> = {
  strength_training: 'Fuerza',
  running: 'Carrera',
  cycling: 'Ciclismo',
  swimming: 'Natación',
  interval_training: 'Intervalos',
  mobility: 'Movilidad',
  functional_training: 'Funcional',
}

export function activityLabel(code: string): string {
  return ACTIVITIES[code] ?? code
}

/**
 * A duration in seconds, said the way a coach reads it.
 *
 * Null stays null: a lap with no duration is one nothing timed, which is not a
 * lap of zero seconds.
 */
export function durationLine(seconds: number | null | undefined): string | null {
  if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds <= 0) return null
  if (seconds < 60) return `${String(Math.round(seconds))} s`
  const minutes = Math.floor(seconds / 60)
  const rest = Math.round(seconds % 60)
  if (minutes < 60)
    return rest === 0 ? `${String(minutes)} min` : `${String(minutes)} min ${String(rest)} s`
  const hours = Math.floor(minutes / 60)
  const restMinutes = minutes % 60
  return restMinutes === 0 ? `${String(hours)} h` : `${String(hours)} h ${String(restMinutes)} min`
}

/**
 * A measured quantity as the person typed it, unit included.
 *
 * The contract says a load and a distance «come back as the person typed
 * them», so nothing here converts or rounds: 80 kg and 176.37 lb are two
 * different facts and only she knows which one she meant.
 */
export function quantityLine(
  quantity: { value?: number; unit?: string } | null | undefined,
): string | null {
  if (!quantity || typeof quantity.value !== 'number' || !Number.isFinite(quantity.value)) {
    return null
  }
  const value = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 2 }).format(quantity.value)
  return quantity.unit ? `${value} ${quantity.unit}` : value
}

/** What a strength set achieved, in one line, skipping whatever is absent. */
export function strengthLine(set: ExecutionDetailStrengthSet): string {
  const parts: string[] = []
  if (typeof set.achieved_reps === 'number') {
    parts.push(
      set.achieved_reps === 1 ? '1 repetición' : `${String(set.achieved_reps)} repeticiones`,
    )
  }
  const load = quantityLine(set.load)
  if (load) parts.push(load)
  if (typeof set.rpe === 'number') parts.push(`RPE ${String(set.rpe)}`)
  return parts.join(' · ')
}

/** What an endurance lap covered, skipping whatever is absent. */
export function enduranceLine(lap: ExecutionDetailEnduranceLap): string {
  const parts: string[] = []
  const distance = quantityLine(lap.distance)
  if (distance) parts.push(distance)
  const duration = durationLine(lap.duration_seconds)
  if (duration) parts.push(duration)
  return parts.join(' · ')
}

/**
 * What one interval achieved.
 *
 * `completed` is a fact of its own and the only one said even when false: an
 * interval she started and did not finish is different from one she never
 * reached, and the first is in the answer while the second is not.
 */
export function intervalLine(interval: ExecutionDetailIntervalResult): string {
  const parts: string[] = []
  const work = durationLine(interval.work_duration_seconds)
  if (work) parts.push(`trabajo ${work}`)
  const rest = durationLine(interval.rest_duration_seconds)
  if (rest) parts.push(`descanso ${rest}`)
  if (typeof interval.achieved_repetitions === 'number') {
    parts.push(`${String(interval.achieved_repetitions)} repeticiones`)
  }
  const distance = quantityLine(interval.distance)
  if (distance) parts.push(distance)
  if (interval.completed === false) parts.push('sin completar')
  return parts.join(' · ')
}

/** What one round achieved. */
export function roundLine(round: ExecutionDetailRoundResult): string {
  const parts: string[] = []
  if (typeof round.completed_repetitions === 'number') {
    parts.push(`${String(round.completed_repetitions)} repeticiones`)
  }
  const load = quantityLine(round.load)
  if (load) parts.push(load)
  const distance = quantityLine(round.distance)
  if (distance) parts.push(distance)
  const duration = durationLine(round.duration_seconds)
  if (duration) parts.push(duration)
  return parts.join(' · ')
}

/**
 * What one mobility hold achieved, with the side when there is one.
 *
 * A side of `both` is not said: it is the ordinary case, and naming it on every
 * row would make the rows that do name a side harder to spot.
 */
export function mobilityLine(result: ExecutionDetailMobilityResult): string {
  const parts: string[] = []
  const hold = durationLine(result.hold_duration_seconds)
  if (hold) parts.push(`sostuvo ${hold}`)
  if (typeof result.completed_repetitions === 'number') {
    parts.push(`${String(result.completed_repetitions)} repeticiones`)
  }
  const side = sideLabel(result.side)
  if (side) parts.push(side)
  return parts.join(' · ')
}

const SIDES: Record<string, string> = { left: 'lado izquierdo', right: 'lado derecho' }

export function sideLabel(side: string | null | undefined): string | null {
  return typeof side === 'string' ? (SIDES[side] ?? null) : null
}

/**
 * The observations on the session, oldest first, as the contract orders them.
 *
 * Each arrives under its own category, so one of health context is here only
 * while she shares it. The screen never says how many are missing, because it
 * cannot know and saying «some are hidden» would answer whether she shares a
 * category she chose not to.
 */
export function observationsOldestFirst(
  observations: readonly ProfessionalObservation[],
): readonly ProfessionalObservation[] {
  return [...observations].sort((left, right) => left.created_at.localeCompare(right.created_at))
}

/** Said under an observation that was edited after it was written. */
export function observationRevisionNote(observation: ProfessionalObservation): string | null {
  return observation.revision_number > 0 ? 'Corregida después de escribirse' : null
}

/** Who wrote it, saying «tú» where it was this coach. */
export function observationAuthor(observation: ProfessionalObservation): string {
  return observation.authored_by_me ? 'Tú' : observation.author_name
}
