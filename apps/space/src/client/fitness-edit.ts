/**
 * The edit screens of «Perfil fitness» as data: what each one opens on, what «Guardar»
 * sends, and what «Versiones» says about one datum.
 *
 * **Each screen opens on what the profile shows**, read through the same functions the
 * onboarding uses for its own answers, so a value one of them cannot draw is dropped
 * the same way in both and never blanks a screen.
 *
 * **An answer is changed, never withdrawn.** The profile has no command that removes a
 * declaration, so a cleared draft writes nothing rather than an empty value.
 */

import { readLevel, type TrainingExperience } from './experience-form'
import {
  entryOf,
  fitnessSections,
  provenanceLine,
  valueLine,
  type FitnessProfile,
  type SessionDuration,
} from './fitness-profile'
import { areasFor, selectionFromAreas, type FocusSelection } from './focus-form'
import { TRAINING_GOALS, type TrainingGoal } from './goal-form'

export interface Routine {
  readonly days: number | undefined
  readonly duration: SessionDuration | undefined
}

export interface RoutineWrite {
  readonly code: 'training_days_per_week' | 'session_duration'
  readonly value: string
}

const DURATIONS: readonly SessionDuration[] = [
  'up_to_30_min',
  '30_to_45_min',
  '45_to_60_min',
  'over_60_min',
]

function first(profile: FitnessProfile | undefined, code: string): string | undefined {
  return entryOf(profile, code)?.values[0]
}

export function declaredGoal(profile: FitnessProfile | undefined): TrainingGoal | undefined {
  const value = first(profile, 'primary_training_goal')
  return TRAINING_GOALS.find((goal) => goal === value)
}

export function declaredExperience(
  profile: FitnessProfile | undefined,
): TrainingExperience | undefined {
  return readLevel(first(profile, 'training_experience'))
}

export function declaredFocus(profile: FitnessProfile | undefined): FocusSelection {
  return selectionFromAreas(entryOf(profile, 'focus_areas')?.values)
}

export function declaredRoutine(profile: FitnessProfile | undefined): Routine {
  const days = Number(first(profile, 'training_days_per_week'))
  const duration = first(profile, 'session_duration')
  return {
    days: Number.isInteger(days) && days >= 1 && days <= 7 ? days : undefined,
    duration: DURATIONS.find((one) => one === duration),
  }
}

/** The set is what the contract carries, so the order the zones were tapped in is noise. */
export function focusChanged(held: FocusSelection, draft: FocusSelection): boolean {
  const key = (selection: FocusSelection) => [...areasFor(selection)].sort().join()
  return key(held) !== key(draft)
}

/** Two answers, two claims: each keeps its own origin, so only a changed one is written. */
export function routineWrites(held: Routine, draft: Routine): readonly RoutineWrite[] {
  const writes: RoutineWrite[] = []
  if (draft.days !== undefined && draft.days !== held.days) {
    writes.push({ code: 'training_days_per_week', value: String(draft.days) })
  }
  if (draft.duration !== undefined && draft.duration !== held.duration) {
    writes.push({ code: 'session_duration', value: draft.duration })
  }
  return writes
}

export interface DatumVersion {
  readonly line: string
  readonly origin: string
  readonly current: boolean
}

export interface DatumVersions {
  readonly title: string
  readonly reason: string
  readonly versions: readonly DatumVersion[]
}

const SHORT_DATE = new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'short' })

/** The one shown and why, then the others, none hidden (`OP-IDN-013`). */
export function versionsOf(
  profile: FitnessProfile | undefined,
  code: string,
): DatumVersions | undefined {
  const row = fitnessSections(profile)
    .flatMap((section) => section.rows)
    .find((one) => one.code === code)
  const entry = row?.entry
  if (!row || !entry) return undefined
  const shown = valueLine(code, entry.values) ?? '—'
  const version = (
    one: { values: readonly string[]; provenance: typeof entry.provenance; valid_from: string },
    current: boolean,
  ): DatumVersion => ({
    line: valueLine(code, one.values) ?? '—',
    origin: `${provenanceLine(one)} · ${SHORT_DATE.format(new Date(one.valid_from))}`,
    current,
  })
  return {
    title: row.title,
    reason:
      entry.selected_because === 'declared_by_you'
        ? `Mostramos «${shown}» porque lo declaraste tú.`
        : `Mostramos «${shown}» porque es la versión más reciente.`,
    versions: [version(entry, true), ...entry.alternatives.map((other) => version(other, false))],
  }
}
