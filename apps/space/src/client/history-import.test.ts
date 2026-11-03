import { describe, expect, test } from 'bun:test'

import {
  choicesToSend,
  choose,
  countsLine,
  duplicatesLine,
  entryState,
  importButton,
  importStatusLine,
  issueLines,
  rangeLine,
  refusalMessage,
  reviewEntries,
  sourceName,
  type HistoryImport,
  type HistoryImportExercise,
} from './history-import'

const exercise = (overrides: Partial<HistoryImportExercise>): HistoryImportExercise => ({
  external_name: 'squat (barbell)',
  source_name: 'Squat (Barbell)',
  session_count: 12,
  set_count: 48,
  resolution: 'catalogue',
  movement: { id: '019f1000-0000-7000-8000-000000000001', name: 'Sentadilla con barra' },
  ...overrides,
})

const staged = (overrides: Partial<HistoryImport> = {}): HistoryImport => ({
  id: '019e4000-0000-7000-8000-000000000601',
  source: 'hevy_csv',
  status: 'staged',
  timezone: 'America/Bogota',
  session_count: 340,
  set_count: 7322,
  imported_count: 0,
  issues: [],
  created_at: '2026-11-03T15:00:00+00:00',
  committed_at: null,
  undone_at: null,
  expires_at: '2026-11-10T15:00:00+00:00',
  preview: {
    new_sessions: 340,
    duplicate_sessions: 0,
    first_started_local: '2023-01-02T07:16',
    last_started_local: '2026-08-04T15:09',
    exercises: [],
  },
  ...overrides,
})

describe('what the file was', () => {
  test('T-SPC-UNIT-IMP-03 a source is named as its app, and nothing is named for training here', () => {
    expect(sourceName('hevy_csv')).toBe('Hevy')
    expect(sourceName(null)).toBeNull()
  })

  test('T-SPC-UNIT-IMP-04 a refused file says why, with its row when there is one', () => {
    expect(refusalMessage({ code: 'unreadable_date', path: '/content/37' })).toContain('fila 37')
    expect(refusalMessage({ code: 'malformed_csv', path: '/content/2' })).toContain('fila 2')
    expect(refusalMessage({ code: 'unknown_format', path: '/content/1' })).toContain('Hevy')
    expect(refusalMessage({ code: 'too_large', path: '/content' })).toContain('grande')
    expect(refusalMessage({ code: 'empty', path: '/content' })).toContain('vacío')
    expect(refusalMessage(undefined)).toBe('No pudimos leer este archivo.')
  })
})

describe('the preview', () => {
  test('T-SPC-UNIT-IMP-05 counts and the range read in Spanish, thousands with a point', () => {
    const document = staged()
    expect(countsLine(document)).toBe('340 sesiones · 7.322 series')
    expect(rangeLine(document.preview)).toBe('Del 2 ene 2023 al 4 ago 2026')
    expect(countsLine(staged({ session_count: 1, set_count: 1 }))).toBe('1 sesión · 1 serie')
  })

  test('T-SPC-UNIT-IMP-06 what is already in the history is said, and never imported twice', () => {
    const preview = staged().preview
    if (!preview) throw new Error('fixture has a preview')
    expect(duplicatesLine(preview)).toBeNull()
    expect(duplicatesLine({ ...preview, new_sessions: 2, duplicate_sessions: 338 })).toBe(
      '338 ya están en tu historial y no se duplican',
    )
    expect(duplicatesLine({ ...preview, new_sessions: 0, duplicate_sessions: 340 })).toBe(
      'Todo esto ya está en tu historial',
    )
    expect(importButton(preview)).toBe('Importar 340 sesiones')
    expect(importButton({ ...preview, new_sessions: 0 })).toBeNull()
  })

  test('T-SPC-UNIT-IMP-07 rows not taken whole are counted by what was wrong', () => {
    expect(
      issueLines([
        { row: 4, code: 'unsupported_set' },
        { row: 9, code: 'unsupported_set' },
        { row: 30, code: 'empty_session' },
      ]),
    ).toEqual([
      '2 series de distancia o tiempo no se importan',
      '1 sesión sin ejercicios no se importa',
    ])
    expect(issueLines([])).toEqual([])
  })
})

describe('reviewing the exercises', () => {
  const exercises = [
    exercise({}),
    exercise({
      external_name: 'hip adduction (machine)',
      source_name: 'Hip Adduction (Machine)',
      set_count: 347,
      resolution: 'unmatched',
      movement: null,
    }),
    exercise({
      external_name: 'barbell bench press',
      source_name: 'Barbell Bench Press',
      set_count: 20,
      resolution: 'suggested',
      movement: { id: '019f1000-0000-7000-8000-000000000012', name: 'Press de banca con barra' },
    }),
  ]

  test('T-SPC-UNIT-IMP-08 what needs a look comes first, the most trained first', () => {
    const entries = reviewEntries(exercises)
    expect(entries.map((entry) => [entry.source_name, entry.toReview])).toEqual([
      ['Hip Adduction (Machine)', true],
      ['Barbell Bench Press', true],
      ['Squat (Barbell)', false],
    ])
  })

  test('T-SPC-UNIT-IMP-09 each state says what will happen to its sets', () => {
    const [unmatched, suggested, curated] = reviewEntries(exercises)
    expect(entryState(unmatched)).toBe('Se guarda con su nombre de Hevy')
    expect(entryState(suggested)).toBe('Sugerido: Press de banca con barra')
    expect(entryState(curated)).toBe('Sentadilla con barra')
  })

  test('T-SPC-UNIT-IMP-10 committing confirms the suggestions and sends what the person changed', () => {
    const entries = reviewEntries(exercises)
    expect(choicesToSend(entries)).toEqual([
      { external_name: 'barbell bench press', movement_id: '019f1000-0000-7000-8000-000000000012' },
    ])

    const chosen = choose(entries, 'hip adduction (machine)', {
      id: '019f1000-0000-7000-8000-000000000312',
      name: 'Aducción de cadera en polea',
    })
    const cleared = choose(chosen, 'barbell bench press', null)
    expect(choicesToSend(cleared)).toEqual([
      {
        external_name: 'hip adduction (machine)',
        movement_id: '019f1000-0000-7000-8000-000000000312',
      },
      { external_name: 'barbell bench press', movement_id: null },
    ])
    expect(entryState(cleared[0])).toBe('Aducción de cadera en polea')
    expect(entryState(cleared[1])).toBe('Se guarda con su nombre de Hevy')
  })
})

describe('an import in the list', () => {
  test('T-SPC-UNIT-IMP-11 each status says where it stands', () => {
    expect(importStatusLine(staged())).toBe('Pendiente de revisar')
    expect(
      importStatusLine(
        staged({
          status: 'committed',
          imported_count: 340,
          committed_at: '2026-11-03T15:00:00+00:00',
        }),
      ),
    ).toBe('340 sesiones importadas')
    expect(
      importStatusLine(staged({ status: 'undone', undone_at: '2026-11-04T15:00:00+00:00' })),
    ).toBe('Deshecha: sus sesiones ya no están en tu historial')
    expect(importStatusLine(staged({ status: 'expired' }))).toBe('Caducó sin importarse')
  })
})
