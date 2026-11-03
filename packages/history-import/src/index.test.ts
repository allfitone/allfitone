import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'

import { readCsv } from './csv.js'
import { readLocalDateTime } from './dates.js'
import {
  HistoryFormatError,
  MAX_HISTORY_CHARACTERS,
  readHistory,
  type HistoryRefusal,
} from './index.js'
import { HEVY_COLUMNS } from './sources/hevy-csv.js'

// Four real sessions exported twice from the same account, once per app language,
// with the titles replaced. They cover supersets, drops, failure, bodyweight and `sept`.
const fixture = (name: string): string =>
  readFileSync(new URL(`../fixtures/${name}`, import.meta.url), 'utf8')
const english = fixture('hevy-en.csv')
const spanish = fixture('hevy-es.csv')

const HEADER = HEVY_COLUMNS.map((column) => `"${column}"`).join(',')
const hevy = (...lines: string[]): string => [HEADER, ...lines].join('\n')
const row = (fields: Partial<Record<(typeof HEVY_COLUMNS)[number], string>>): string =>
  HEVY_COLUMNS.map((column) => {
    const value =
      fields[column] ??
      (
        {
          title: 'Day',
          start_time: 'Aug 4, 2026, 3:09 PM',
          end_time: 'Aug 4, 2026, 4:15 PM',
          exercise_title: 'Bench Press (Barbell)',
          set_index: '0',
          set_type: 'normal',
          weight_kg: '60',
          reps: '8',
        } as Record<string, string>
      )[column] ??
      ''
    return /^[\d.]*$/.test(value) ? value : `"${value.replace(/"/g, '""')}"`
  }).join(',')

const refusal = (run: () => unknown): { refusal: HistoryRefusal; row: number | null } => {
  try {
    run()
  } catch (error) {
    if (error instanceof HistoryFormatError) return { refusal: error.refusal, row: error.row }
    throw error
  }
  throw new Error('expected a refusal')
}

describe('a Hevy export becomes imported_history.v1 (ADR-044)', () => {
  test('T-IMP-UNIT-01 the English and the Spanish export of one history read the same', () => {
    const fromEnglish = readHistory(english)
    expect(readHistory(spanish)).toEqual(fromEnglish)
    expect(fromEnglish.source).toBe('hevy_csv')
    expect(fromEnglish.modelVersion).toBe(1)
    expect(fromEnglish.issues).toEqual([])
    expect(
      fromEnglish.sessions.map((session) => [
        session.title,
        session.startedLocal,
        session.endedLocal,
      ]),
    ).toEqual([
      ['Legs', '2023-10-16T08:33', '2023-10-16T10:28'],
      ['Push', '2023-12-19T17:32', '2023-12-19T19:42'],
      ['Upper', '2024-02-19T17:54', '2024-02-19T19:33'],
      ['Pull', '2025-09-25T17:21', '2025-09-25T19:02'],
    ])
    const sets = fromEnglish.sessions.flatMap((session) =>
      session.exercises.flatMap((exercise) => exercise.sets),
    )
    expect(sets).toHaveLength(100)
  })

  test('T-IMP-UNIT-02 an exercise is a run of climbing set indexes, and a repeat later is its own entry', () => {
    const legs = readHistory(english).sessions[0]
    expect(
      legs?.exercises.map((exercise) => [
        exercise.position,
        exercise.sourceName,
        exercise.supersetGroup,
        exercise.sets.length,
      ]),
    ).toEqual([
      [1, 'Leg Extension (Machine)', null, 2],
      [2, 'Hip Adduction (Machine)', null, 2],
      [3, 'Lying Leg Curl (Machine)', null, 2],
      [4, 'Squat (Smith Machine)', null, 3],
      [5, 'Leg Press (Machine)', null, 3],
      [6, 'Hack Squat (Machine)', null, 4],
      [7, 'Leg Extension (Machine)', 1, 3],
      [8, 'Hip Adduction (Machine)', 1, 3],
    ])
  })

  test('T-IMP-UNIT-03 supersets are numbered from 1 by appearance, and set kinds map to ADR-033', () => {
    const push = readHistory(english).sessions[1]
    expect(push?.exercises.map((exercise) => exercise.supersetGroup)).toEqual([
      null,
      null,
      null,
      1,
      1,
      null,
      2,
      2,
      3,
      3,
    ])
    const lateral = push?.exercises[5]
    expect(lateral?.sourceName).toBe('Lateral Raise (Dumbbell)')
    expect(lateral?.sets.map((set) => set.kind)).toEqual([
      'normal',
      'drop',
      'drop',
      'normal',
      'drop',
      'to_failure',
      'normal',
      'to_failure',
      'to_failure',
    ])
    expect(lateral?.sets.map((set) => set.order)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9])
  })

  test('T-IMP-UNIT-04 no weight is bodyweight, not zero, and RPE keeps its half points', () => {
    const pull = readHistory(english).sessions[3]
    const abWheel = pull?.exercises.find((exercise) => exercise.sourceName === 'Ab Wheel')
    expect(abWheel?.sets.every((set) => set.loadKg === null && set.reps !== null)).toBe(true)
    expect(pull?.exercises[0]?.sets[0]).toEqual({
      order: 1,
      kind: 'warmup',
      loadKg: 20,
      reps: 8,
      rpe: 7.5,
    })
  })

  test('T-IMP-UNIT-05 the description travels and an empty one is null', () => {
    const [legs, , upper] = readHistory(english).sessions
    expect(upper?.description).toBe('Descarga - 60%')
    expect(legs?.description).toBeNull()
  })

  test('T-IMP-UNIT-06 the fingerprint depends on source, local start and title only', () => {
    const [legs, push] = readHistory(english).sessions
    expect(legs?.fingerprint).toMatch(/^[0-9a-f]{64}$/)
    expect(legs?.fingerprint).not.toBe(push?.fingerprint)
    const same = readHistory(
      hevy(
        row({
          title: 'Legs',
          start_time: 'Oct 16, 2023, 8:33 AM',
          end_time: 'Oct 16, 2023, 9:00 AM',
        }),
      ),
    )
    expect(same.sessions[0]?.fingerprint).toBe(legs?.fingerprint ?? '')
  })
})

describe('what a reader keeps out is said, never dropped in silence (ADR-044)', () => {
  test('T-IMP-UNIT-07 a set measured in distance or time is an unsupported set', () => {
    const history = readHistory(
      hevy(
        row({ set_index: '0' }),
        row({
          exercise_title: 'Treadmill',
          set_index: '0',
          weight_kg: '',
          reps: '',
          distance_km: '2.5',
          duration_seconds: '900',
        }),
      ),
    )
    expect(history.issues).toEqual([{ row: 3, code: 'unsupported_set' }])
    expect(history.sessions[0]?.exercises.map((exercise) => exercise.sourceName)).toEqual([
      'Bench Press (Barbell)',
    ])
  })

  test('T-IMP-UNIT-08 an impossible number or kind is flagged and that set is left out', () => {
    const history = readHistory(
      hevy(
        row({ set_index: '0' }),
        row({ set_index: '1', rpe: '11' }),
        row({ set_index: '2', weight_kg: 'heavy' }),
        row({ set_index: '3', set_type: 'myoreps' }),
        row({ set_index: '4', reps: '0' }),
      ),
    )
    expect(history.issues).toEqual([
      { row: 3, code: 'invalid_number' },
      { row: 4, code: 'invalid_number' },
      { row: 5, code: 'invalid_number' },
    ])
    expect(history.sessions[0]?.exercises[0]?.sets.map((set) => set.reps)).toEqual([8, null])
  })

  test('T-IMP-UNIT-09 a session with nothing left is reported empty and not kept', () => {
    const history = readHistory(hevy(row({ weight_kg: '', reps: '', distance_km: '5' })))
    expect(history.sessions).toEqual([])
    expect(history.issues).toEqual([
      { row: 2, code: 'unsupported_set' },
      { row: 2, code: 'empty_session' },
    ])
  })

  test('T-IMP-UNIT-10 an end before the start is flagged and the session lasts zero', () => {
    const history = readHistory(hevy(row({ end_time: 'Aug 4, 2026, 2:00 PM' })))
    expect(history.issues).toEqual([{ row: 2, code: 'ended_before_start' }])
    expect(history.sessions[0]?.endedLocal).toBe('2026-08-04T15:09')
  })
})

describe('a file that is not understood is refused whole (ADR-044)', () => {
  test('T-IMP-UNIT-11 an unknown header, an empty file and an oversized one are refused', () => {
    expect(refusal(() => readHistory('date,exercise,weight\n2026-01-01,Squat,100'))).toEqual({
      refusal: 'unknown_format',
      row: 1,
    })
    expect(refusal(() => readHistory(HEADER.replace('"rpe"', '"rir"')))).toEqual({
      refusal: 'unknown_format',
      row: 1,
    })
    expect(refusal(() => readHistory('  \n'))).toEqual({ refusal: 'empty', row: null })
    expect(refusal(() => readHistory('x'.repeat(MAX_HISTORY_CHARACTERS + 1)))).toEqual({
      refusal: 'too_large',
      row: null,
    })
  })

  test('T-IMP-UNIT-12 one unreadable date refuses the file and names its row', () => {
    const file = hevy(row({}), row({ title: 'Other', start_time: '2026-08-04 15:09' }))
    expect(refusal(() => readHistory(file))).toEqual({ refusal: 'unreadable_date', row: 3 })
  })

  test('T-IMP-UNIT-13 a record with the wrong number of fields refuses the file', () => {
    expect(refusal(() => readHistory(hevy(row({}), '"Day","Aug 4, 2026, 3:09 PM"')))).toEqual({
      refusal: 'malformed_csv',
      row: 3,
    })
  })

  test('T-IMP-UNIT-14 a header-only export reads as no sessions', () => {
    expect(readHistory(HEADER)).toEqual({
      source: 'hevy_csv',
      modelVersion: 1,
      sessions: [],
      issues: [],
    })
  })
})

describe('the CSV is read to RFC 4180, strictly', () => {
  test('T-IMP-UNIT-15 quotes, doubled quotes, commas and line breaks inside quotes, CRLF and a BOM', () => {
    expect(readCsv('﻿a,"b, c","say ""hi""",\r\n"line\none",,x\r\n')).toEqual([
      ['a', 'b, c', 'say "hi"', ''],
      ['line\none', '', 'x'],
    ])
  })

  test('T-IMP-UNIT-16 a stray or unclosed quote refuses instead of guessing', () => {
    expect(refusal(() => readCsv('a,b"c\n'))).toEqual({ refusal: 'malformed_csv', row: 1 })
    expect(refusal(() => readCsv('a,"b"c\n'))).toEqual({ refusal: 'malformed_csv', row: 1 })
    expect(refusal(() => readCsv('a\n"open,b\n'))).toEqual({ refusal: 'malformed_csv', row: 2 })
  })

  test('T-IMP-UNIT-17 notes with commas, quotes and line breaks reach the model intact', () => {
    const history = readHistory(hevy(row({ exercise_notes: 'Left first, then "right"\nslow' })))
    expect(history.sessions[0]?.exercises[0]?.note).toBe('Left first, then "right"\nslow')
  })
})

describe('dates are read in the languages Hevy writes them in', () => {
  test('T-IMP-UNIT-18 English and Spanish, twelve and twenty-four hours, every month', () => {
    expect(readLocalDateTime('Aug 4, 2026, 3:09 PM')).toBe('2026-08-04T15:09')
    expect(readLocalDateTime('Jan 2, 2023, 12:05 AM')).toBe('2023-01-02T00:05')
    expect(readLocalDateTime('Jan 2, 2023, 12:05 PM')).toBe('2023-01-02T12:05')
    expect(readLocalDateTime('Aug 4, 2026, 3:09\u202FPM')).toBe('2026-08-04T15:09')
    expect(readLocalDateTime('4 ago 2026, 15:09')).toBe('2026-08-04T15:09')
    expect(readLocalDateTime('25 sept 2025, 17:21')).toBe('2025-09-25T17:21')
    expect(readLocalDateTime('4 ago 2026, 3:09 p. m.')).toBe('2026-08-04T15:09')
    const english = [
      'Jan',
      'Feb',
      'Mar',
      'Apr',
      'May',
      'Jun',
      'Jul',
      'Aug',
      'Sep',
      'Oct',
      'Nov',
      'Dec',
    ]
    const spanish = [
      'ene',
      'feb',
      'mar',
      'abr',
      'may',
      'jun',
      'jul',
      'ago',
      'sept',
      'oct',
      'nov',
      'dic',
    ]
    english.forEach((month, index) => {
      const expected = `2024-${String(index + 1).padStart(2, '0')}-01T09:00`
      expect(readLocalDateTime(`${month} 1, 2024, 9:00 AM`)).toBe(expected)
      expect(readLocalDateTime(`1 ${spanish[index] ?? ''} 2024, 9:00`)).toBe(expected)
    })
  })

  test('T-IMP-UNIT-19 anything else is not a date, including days the calendar does not have', () => {
    for (const text of [
      '2026-08-04 15:09',
      '08/04/2026 15:09',
      'Agosto 4, 2026',
      '31 sept 2025, 10:00',
      'Feb 29, 2025, 9:00 AM',
      'Aug 4, 2026, 13:09 PM',
      '4 ago 2026, 24:00',
      '',
    ]) {
      expect(readLocalDateTime(text)).toBeNull()
    }
  })
})
