/**
 * Reads the CSV Hevy exports from its settings (ADR-044).
 *
 * One record per set, with the session repeated on every record and no identifier:
 * a session is its title and start time, and an exercise is a run of consecutive
 * records with the same name whose set index keeps climbing. The same exercise later
 * in the session is another entry, as the person did it.
 *
 * Exercise names arrive in English whatever the app's language, and are kept as
 * written; matching them to the catalogue is not a reader's job. What the model does
 * not hold — a set measured in distance or time — becomes an issue, never a silent loss.
 */

import { createHash } from 'node:crypto'

import { readLocalDateTime } from '../dates.js'
import {
  HistoryFormatError,
  MODEL_VERSION,
  type ImportedExercise,
  type ImportedHistory,
  type ImportedSession,
  type ImportedSet,
  type ImportedSetKind,
  type ImportIssue,
  type ImportIssueCode,
} from '../model.js'

export const HEVY_COLUMNS = [
  'title',
  'start_time',
  'end_time',
  'description',
  'exercise_title',
  'superset_id',
  'exercise_notes',
  'set_index',
  'set_type',
  'weight_kg',
  'reps',
  'distance_km',
  'duration_seconds',
  'rpe',
] as const

type Column = (typeof HEVY_COLUMNS)[number]
type HevyRecord = Readonly<Record<Column, string>> & { readonly row: number }

const KINDS: Readonly<Record<string, ImportedSetKind>> = {
  normal: 'normal',
  warmup: 'warmup',
  dropset: 'drop',
  failure: 'to_failure',
}

/** Whether a header is Hevy's, column for column. */
export function isHevyHeader(header: readonly string[]): boolean {
  return (
    header.length === HEVY_COLUMNS.length &&
    HEVY_COLUMNS.every((column, index) => header[index] === column)
  )
}

/** The fingerprint ADR-044 deduplicates by: source, local start and title. */
export function sessionFingerprint(startedLocal: string, title: string): string {
  return createHash('sha256').update(`hevy_csv\n${startedLocal}\n${title}`).digest('hex')
}

const blankToNull = (value: string): string | null => (value.trim() === '' ? null : value.trim())

/** A decimal from the file: empty is `null`, anything else must be a finite number. */
function decimal(value: string): number | null | 'invalid' {
  const text = value.trim()
  if (text === '') return null
  const number = Number(text)
  return Number.isFinite(number) ? number : 'invalid'
}

/** Reads a whole Hevy export. The header must already be known to be Hevy's. */
export function readHevyCsv(records: readonly (readonly string[])[]): ImportedHistory {
  const issues: ImportIssue[] = []
  const flag = (row: number, code: ImportIssueCode): void => {
    issues.push({ row, code })
  }

  const sessions = new Map<string, HevyRecord[]>()
  records.slice(1).forEach((fields, index) => {
    const row = index + 2
    if (fields.length === 1 && fields[0] === '') return
    if (fields.length !== HEVY_COLUMNS.length) throw new HistoryFormatError('malformed_csv', row)
    const record = Object.fromEntries(
      HEVY_COLUMNS.map((column, at) => [column, fields[at] ?? '']),
    ) as Record<Column, string>
    const key = `${record.title}\u0000${record.start_time}`
    const group = sessions.get(key)
    if (group) group.push({ ...record, row })
    else sessions.set(key, [{ ...record, row }])
  })

  const read: ImportedSession[] = []
  for (const group of sessions.values()) {
    const session = readSession(group, flag)
    if (session) read.push(session)
  }
  read.sort((left, right) => left.startedLocal.localeCompare(right.startedLocal))
  return { source: 'hevy_csv', modelVersion: MODEL_VERSION, sessions: read, issues }
}

function readSession(
  group: readonly HevyRecord[],
  flag: (row: number, code: ImportIssueCode) => void,
): ImportedSession | null {
  const [first] = group
  if (!first) return null
  const startedLocal = readLocalDateTime(first.start_time)
  if (!startedLocal) throw new HistoryFormatError('unreadable_date', first.row)
  const endedRead = first.end_time.trim() === '' ? startedLocal : readLocalDateTime(first.end_time)
  if (!endedRead) throw new HistoryFormatError('unreadable_date', first.row)
  let endedLocal = endedRead
  if (endedLocal < startedLocal) {
    flag(first.row, 'ended_before_start')
    endedLocal = startedLocal
  }

  const exercises: ImportedExercise[] = []
  const supersets = new Map<string, number>()
  let current: {
    name: string
    note: string | null
    superset: number | null
    sets: ImportedSet[]
  } | null = null
  let lastIndex = -1

  const close = (): void => {
    if (current && current.sets.length > 0) {
      exercises.push({
        position: exercises.length + 1,
        sourceName: current.name,
        note: current.note,
        supersetGroup: current.superset,
        sets: current.sets,
      })
    }
    current = null
  }

  for (const record of group) {
    const name = record.exercise_title.trim()
    const index = Number(record.set_index)
    if (!current || current.name !== name || !Number.isInteger(index) || index <= lastIndex) {
      close()
      const supersetKey = blankToNull(record.superset_id)
      let superset: number | null = null
      if (supersetKey !== null) {
        superset = supersets.get(supersetKey) ?? supersets.size + 1
        supersets.set(supersetKey, superset)
      }
      current = { name, note: blankToNull(record.exercise_notes), superset, sets: [] }
    }
    lastIndex = Number.isInteger(index) ? index : lastIndex

    if (blankToNull(record.distance_km) !== null || blankToNull(record.duration_seconds) !== null) {
      flag(record.row, 'unsupported_set')
      continue
    }
    const kind = KINDS[record.set_type.trim()]
    const load = decimal(record.weight_kg)
    const reps = decimal(record.reps)
    const rpe = decimal(record.rpe)
    if (
      kind === undefined ||
      load === 'invalid' ||
      (load !== null && load < 0) ||
      reps === 'invalid' ||
      (reps !== null && (!Number.isInteger(reps) || reps < 0)) ||
      rpe === 'invalid' ||
      (rpe !== null && (rpe < 0 || rpe > 10))
    ) {
      flag(record.row, 'invalid_number')
      continue
    }
    current.sets.push({
      order: current.sets.length + 1,
      kind,
      loadKg: load,
      // Zero repetitions is a set not done; the execution model keeps it unrecorded.
      reps: reps === 0 ? null : reps,
      rpe,
    })
  }
  close()

  if (exercises.length === 0) {
    flag(first.row, 'empty_session')
    return null
  }
  const title = first.title.trim()
  return {
    fingerprint: sessionFingerprint(startedLocal, title),
    title,
    startedLocal,
    endedLocal,
    description: blankToNull(first.description),
    exercises,
  }
}
