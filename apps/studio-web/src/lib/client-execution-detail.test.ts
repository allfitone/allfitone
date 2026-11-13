import { describe, expect, test } from 'bun:test'

import {
  activityLabel,
  durationLine,
  enduranceLine,
  hasSegments,
  intervalLine,
  mobilityLine,
  observationAuthor,
  observationRevisionNote,
  observationsOldestFirst,
  quantityLine,
  recordedFamilies,
  recordedNothing,
  roundLine,
  segmentLabel,
  sideLabel,
  strengthLine,
} from './client-execution-detail'
import type { AuthorizedExecution, ProfessionalObservation } from './studio-api'

function execution(partial: Partial<AuthorizedExecution> = {}): AuthorizedExecution {
  return {
    id: '0190a0b1-2c3d-7e4f-8a9b-0c1d2e3f4a5b',
    started_at: '2026-07-27T06:04:00-05:00',
    ended_at: '2026-07-27T07:01:00-05:00',
    timezone: 'America/Bogota',
    activity_type_code: 'strength_training',
    activity_type_name: 'Entrenamiento de fuerza',
    discipline_code: 'strength',
    achieved_level: 'detailed',
    origin: 'relationship',
    planned_session_id: null,
    applied_scope: { code: 'relationship_training', version: 1 },
    segments: [],
    strength_sets: [],
    endurance_laps: [],
    interval_results: [],
    round_results: [],
    mobility_results: [],
    observations: [],
    ...partial,
  } as AuthorizedExecution
}

const set = (partial: Record<string, unknown> = {}) =>
  ({
    segment_position: null,
    order: 1,
    movement_id: 'm1',
    movement_name: 'Sentadilla',
    achieved_reps: 8,
    load: { value: 80, unit: 'kg' },
    rpe: 8,
    ...partial,
  }) as never

const observation = (partial: Partial<ProfessionalObservation> = {}): ProfessionalObservation =>
  ({
    id: 'o1',
    execution_id: '0190a0b1-2c3d-7e4f-8a9b-0c1d2e3f4a5b',
    category: 'relationship_training',
    provenance: 'professional',
    content: 'Buena técnica en la última serie.',
    revision_number: 0,
    created_at: '2026-07-27T08:00:00.000Z',
    revised_at: '2026-07-27T08:00:00.000Z',
    author_name: 'Carlos Coach',
    authored_by_me: false,
    ...partial,
  }) as ProfessionalObservation

describe('which families the session recorded in', () => {
  /*
   * Criterion 4. A session of running has no sets, and an empty «Series» panel
   * would say she recorded none — a claim about her training, not about data.
   */
  test('a family with no rows is absent, not empty', () => {
    const running = execution({ endurance_laps: [set(), set()] as never })
    expect(recordedFamilies(running).map((entry) => entry.family)).toEqual(['endurance'])
  })

  test('several families come in the order the contract lists them', () => {
    const mixed = execution({
      strength_sets: [set()] as never,
      interval_results: [set()] as never,
      mobility_results: [set()] as never,
    })
    expect(recordedFamilies(mixed).map((entry) => entry.family)).toEqual([
      'strength',
      'interval',
      'mobility',
    ])
  })

  test('each family carries how many rows it has, and its own name', () => {
    const strength = execution({ strength_sets: [set(), set(), set()] as never })
    expect(recordedFamilies(strength)[0]).toEqual({
      family: 'strength',
      title: 'Series',
      count: 3,
      note: null,
    })
  })

  /*
   * Only the name that does not explain itself carries a line. A line under
   * every family would be padding, and padding is what makes the one that
   * matters invisible.
   */
  test('«Vueltas» says what it is, and the names that explain themselves do not', () => {
    const run = execution({ endurance_laps: [set()] as never })
    expect(recordedFamilies(run)[0]?.note).toContain('un trozo del esfuerzo')

    for (const family of [
      execution({ strength_sets: [set()] as never }),
      execution({ interval_results: [set()] as never }),
      execution({ round_results: [set()] as never }),
      execution({ mobility_results: [set()] as never }),
    ]) {
      expect(recordedFamilies(family)[0]?.note).toBeNull()
    }
  })

  test('a session that recorded nothing is said once, not as five empty panels', () => {
    expect(recordedNothing(execution())).toBe(true)
    expect(recordedFamilies(execution())).toEqual([])
    expect(recordedNothing(execution({ strength_sets: [set()] as never }))).toBe(false)
  })
})

describe('which block a row belongs to', () => {
  test('a session that was not split has no block to name', () => {
    expect(segmentLabel(execution(), null)).toBeNull()
    expect(hasSegments(execution())).toBe(false)
  })

  test('a block is named by its number and its activity', () => {
    const split = execution({
      segments: [
        { position: 1, activity_type_code: 'strength_training' },
        { position: 2, activity_type_code: 'running' },
      ] as never,
    })
    expect(hasSegments(split)).toBe(true)
    expect(segmentLabel(split, 1)).toBe('Bloque 1 · Fuerza')
    expect(segmentLabel(split, 2)).toBe('Bloque 2 · Carrera')
  })

  /* A position the session does not describe is said by its number alone. */
  test('a block the list does not describe is not invented', () => {
    const split = execution({ segments: [{ position: 1, activity_type_code: null }] as never })
    expect(segmentLabel(split, 1)).toBe('Bloque 1')
    expect(segmentLabel(split, 7)).toBe('Bloque 7')
  })
})

describe('how an activity is named', () => {
  test('a code Studio knows reads in Spanish', () => {
    expect(activityLabel('strength_training')).toBe('Fuerza')
    expect(activityLabel('swimming')).toBe('Natación')
  })

  /* The catalogue is the product's vocabulary and this list can only fall
     behind it, so an unknown code is handed over rather than guessed. */
  test('a code it does not know is shown as it came', () => {
    expect(activityLabel('rowing')).toBe('rowing')
  })
})

describe('a duration', () => {
  test('reads in seconds, minutes or hours', () => {
    expect(durationLine(45)).toBe('45 s')
    expect(durationLine(90)).toBe('1 min 30 s')
    expect(durationLine(600)).toBe('10 min')
    expect(durationLine(3600)).toBe('1 h')
    expect(durationLine(5400)).toBe('1 h 30 min')
  })

  /* A lap with no duration is one nothing timed, not a lap of zero seconds. */
  test('absent stays absent, and so does zero', () => {
    expect(durationLine(null)).toBeNull()
    expect(durationLine(undefined)).toBeNull()
    expect(durationLine(0)).toBeNull()
  })
})

describe('a measured quantity', () => {
  /*
   * The contract says a load comes back as she typed it, so nothing converts
   * or rounds: 80 kg and 176.37 lb are two different facts.
   */
  test('comes with its own unit, unconverted', () => {
    expect(quantityLine({ value: 80, unit: 'kg' })).toBe('80 kg')
    expect(quantityLine({ value: 176.37, unit: 'lb' })).toBe('176,37 lb')
  })

  test('a value with no unit is still a value', () => {
    expect(quantityLine({ value: 12 })).toBe('12')
  })

  test('absent is absent', () => {
    expect(quantityLine(null)).toBeNull()
    expect(quantityLine(undefined)).toBeNull()
    expect(quantityLine({ unit: 'kg' })).toBeNull()
  })
})

describe('what one row says', () => {
  test('a strength set: reps, load and effort', () => {
    expect(strengthLine(set())).toBe('8 repeticiones · 80 kg · RPE 8')
  })

  test('one repetition reads as one', () => {
    expect(strengthLine(set({ achieved_reps: 1 }))).toContain('1 repetición')
  })

  /*
   * Criterion 4 at the row level: a part that did not arrive is skipped, never
   * replaced by a sentence claiming the field exists and is empty.
   */
  test('a part that did not arrive is skipped, not filled', () => {
    const line = strengthLine(set({ load: null, rpe: null }))
    expect(line).toBe('8 repeticiones')
    expect(line).not.toContain('sin registrar')
    expect(line).not.toContain('—')
  })

  test('an endurance lap: how far and how long', () => {
    expect(
      enduranceLine({ distance: { value: 1, unit: 'km' }, duration_seconds: 240 } as never),
    ).toBe('1 km · 4 min')
  })

  test('a round: reps, load, distance and time, in that order', () => {
    expect(
      roundLine({
        completed_repetitions: 10,
        load: { value: 24, unit: 'kg' },
        distance: null,
        duration_seconds: 75,
      } as never),
    ).toBe('10 repeticiones · 24 kg · 1 min 15 s')
  })
})

describe('an interval', () => {
  test('work, rest and what it achieved', () => {
    expect(
      intervalLine({
        work_duration_seconds: 30,
        rest_duration_seconds: 15,
        achieved_repetitions: 12,
        distance: null,
        completed: true,
      } as never),
    ).toBe('trabajo 30 s · descanso 15 s · 12 repeticiones')
  })

  /*
   * The one fact said even when false: an interval she started and did not
   * finish is in the answer, and one she never reached is not.
   */
  test('one she did not complete says so', () => {
    expect(
      intervalLine({
        work_duration_seconds: 30,
        rest_duration_seconds: null,
        achieved_repetitions: null,
        distance: null,
        completed: false,
      } as never),
    ).toBe('trabajo 30 s · sin completar')
  })
})

describe('a mobility hold', () => {
  test('how long she held it, and how many times', () => {
    expect(
      mobilityLine({
        hold_duration_seconds: 45,
        completed_repetitions: 3,
        side: 'both',
      } as never),
    ).toBe('sostuvo 45 s · 3 repeticiones')
  })

  /* Both sides is the ordinary case, so naming it would bury the ones that
     really are one-sided. */
  test('a single side is named and «both» is not', () => {
    expect(sideLabel('left')).toBe('lado izquierdo')
    expect(sideLabel('right')).toBe('lado derecho')
    expect(sideLabel('both')).toBeNull()
    expect(sideLabel(null)).toBeNull()
    expect(
      mobilityLine({
        hold_duration_seconds: 30,
        completed_repetitions: null,
        side: 'right',
      } as never),
    ).toBe('sostuvo 30 s · lado derecho')
  })
})

describe('the observations on the session', () => {
  test('oldest first, as the contract orders them', () => {
    const sorted = observationsOldestFirst([
      observation({ id: 'b', created_at: '2026-07-28T10:00:00.000Z' }),
      observation({ id: 'a', created_at: '2026-07-27T10:00:00.000Z' }),
    ])
    expect(sorted.map((entry) => entry.id)).toEqual(['a', 'b'])
  })

  test('one that was corrected after being written says so', () => {
    expect(observationRevisionNote(observation({ revision_number: 0 }))).toBeNull()
    expect(observationRevisionNote(observation({ revision_number: 2 }))).toBe(
      'Corregida después de escribirse',
    )
  })

  test('the reader sees «tú» on their own', () => {
    expect(observationAuthor(observation({ authored_by_me: true }))).toBe('Tú')
    expect(observationAuthor(observation({ author_name: 'Ana Coach' }))).toBe('Ana Coach')
  })

  /*
   * No test asks how many observations are hidden, because the screen must
   * never say: each arrives under its own category, and «some are hidden»
   * would answer whether she shares one she chose not to.
   */
})
