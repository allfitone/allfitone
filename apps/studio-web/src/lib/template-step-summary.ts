/**
 * A step of a template draft, said in one line.
 *
 * A closed step shows this in place of its fields, so a whole session can be
 * read at once. It reads what is typed, as typed: a value that is empty or not
 * a number yet is left out, never shown as a zero or a guess, because the
 * line is a reading of the draft and not a check of it.
 */

import { SIDE_LABEL, type EditorSet, type EditorTarget } from './session-template-editor'

const NOTHING = 'Sin objetivos'

function amount(raw: string): number | null {
  const value = raw.trim().replace(',', '.')
  if (!/^\d+(\.\d+)?$/.test(value)) return null
  return Number(value)
}

/** One value when every set agrees, the range when they do not, nothing when any is unreadable. */
function spread(values: readonly string[]): string | null {
  const written = values.map((value) => value.trim()).filter(Boolean)
  if (written.length === 0) return null
  const read = written.map((text) => ({ text, value: amount(text) }))
  if (read.some((entry) => entry.value === null)) return null
  const sorted = [...read].sort((first, second) => (first.value ?? 0) - (second.value ?? 0))
  const lowest = sorted[0]
  const highest = sorted.at(-1)
  if (!lowest || !highest) return null
  return lowest.value === highest.value ? lowest.text : `${lowest.text}–${highest.text}`
}

function strengthParts(sets: readonly EditorSet[], loadUnit: string): string[] {
  const parts = [sets.length === 1 ? '1 serie' : `${sets.length} series`]
  const counted = sets.filter((set) => set.kind !== 'to_failure')
  if (counted.length === 0 && sets.length > 0) {
    parts.push('al fallo')
  } else {
    const reps = spread(counted.map((set) => set.reps))
    if (reps) parts.push(`${reps} reps`)
  }
  const load = spread(sets.map((set) => set.load))
  if (load) parts.push(`${load} ${loadUnit}`)
  return parts
}

function written(value: string, say: (value: string) => string): string[] {
  const text = value.trim()
  return text ? [say(text)] : []
}

export function stepSummary(target: EditorTarget): string {
  const parts =
    target.family === 'strength'
      ? strengthParts(target.sets, target.loadUnit)
      : target.family === 'endurance'
        ? [
            ...written(target.distance, (value) => `${value} m`),
            ...written(target.minutes, (value) => `${value} min`),
          ]
        : target.family === 'interval'
          ? [
              ...written(target.rounds, (value) => (value === '1' ? '1 ronda' : `${value} rondas`)),
              ...written(target.work, (value) => `${value} s de trabajo`),
              ...written(target.rest, (value) => `${value} s de descanso`),
            ]
          : [
              ...written(target.hold, (value) => `${value} s`),
              ...written(target.reps, (value) => `${value} reps`),
              ...(target.side === 'not_applicable' ? [] : [SIDE_LABEL[target.side]]),
            ]
  return parts.length > 0 ? parts.join(' · ') : NOTHING
}
