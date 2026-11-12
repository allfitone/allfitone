/**
 * What the edit screens of «Perfil fitness» read and write (one screen per datum): each
 * opens on what the profile shows, «Guardar» only means something once the answer
 * changed, and «Versiones» says which version is shown and why.
 */

import { describe, expect, test } from 'bun:test'

import {
  declaredExperience,
  declaredFocus,
  declaredGoal,
  declaredRoutine,
  focusChanged,
  routineWrites,
  versionsOf,
} from './fitness-edit'
import type { FitnessProfile, ProfileEntry } from './fitness-profile'

const entry = (over: Partial<ProfileEntry>): ProfileEntry => ({
  attribute_code: 'primary_training_goal',
  values: ['build_muscle'],
  provenance: 'person_declared',
  selected_because: 'declared_by_you',
  valid_from: '2026-08-01T09:00:00.000Z',
  alternatives: [],
  ...over,
})

const profile = (attributes: ProfileEntry[]): FitnessProfile => ({
  biological_sex: 'male',
  attributes,
})

describe('what each screen opens on', () => {
  test('T-SPC-UNIT-FE-01 the goal and the level, only when this app knows them', () => {
    const read = profile([
      entry({}),
      entry({ attribute_code: 'training_experience', values: ['some_practice'] }),
    ])
    expect(declaredGoal(read)).toBe('build_muscle')
    expect(declaredExperience(read)).toBe('some_practice')

    const unknown = profile([
      entry({ values: ['juggle'] }),
      entry({ attribute_code: 'training_experience', values: ['legend'] }),
    ])
    expect(declaredGoal(unknown)).toBeUndefined()
    expect(declaredExperience(unknown)).toBeUndefined()
    expect(declaredGoal(undefined)).toBeUndefined()
  })

  test('T-SPC-UNIT-FE-02 the zones as the onboarding reads them', () => {
    const zones = profile([entry({ attribute_code: 'focus_areas', values: ['legs', 'chest'] })])
    expect(declaredFocus(zones)).toEqual({ zones: ['chest', 'legs'], whole: false })

    const whole = profile([entry({ attribute_code: 'focus_areas', values: ['whole_body'] })])
    expect(declaredFocus(whole)).toEqual({ zones: [], whole: true })
    expect(declaredFocus(profile([]))).toEqual({ zones: [], whole: false })
  })

  test('T-SPC-UNIT-FE-03 the days and the time, each on its own', () => {
    const both = profile([
      entry({ attribute_code: 'training_days_per_week', values: ['4'] }),
      entry({ attribute_code: 'session_duration', values: ['45_to_60_min'] }),
    ])
    expect(declaredRoutine(both)).toEqual({ days: 4, duration: '45_to_60_min' })

    const odd = profile([
      entry({ attribute_code: 'training_days_per_week', values: ['nine'] }),
      entry({ attribute_code: 'session_duration', values: ['forever'] }),
    ])
    expect(declaredRoutine(odd)).toEqual({ days: undefined, duration: undefined })
  })
})

describe('what «Guardar» sends', () => {
  test('T-SPC-UNIT-FE-04 zones changed only when the set changed, not its order', () => {
    const held = { zones: ['chest', 'legs'] as const, whole: false }
    expect(focusChanged(held, { zones: ['chest', 'legs'], whole: false })).toBe(false)
    expect(focusChanged(held, { zones: ['chest'], whole: false })).toBe(true)
    expect(focusChanged(held, { zones: [], whole: true })).toBe(true)
  })

  test('T-SPC-UNIT-FE-05 the routine writes only what changed, one claim each', () => {
    const held = { days: 3, duration: '30_to_45_min' as const }
    expect(routineWrites(held, held)).toEqual([])
    expect(routineWrites(held, { days: 5, duration: '30_to_45_min' })).toEqual([
      { code: 'training_days_per_week', value: '5' },
    ])
    expect(routineWrites(held, { days: 5, duration: 'over_60_min' })).toEqual([
      { code: 'training_days_per_week', value: '5' },
      { code: 'session_duration', value: 'over_60_min' },
    ])
  })

  test('T-SPC-UNIT-FE-06 an answer is never withdrawn by leaving it empty', () => {
    expect(
      routineWrites({ days: 3, duration: undefined }, { days: undefined, duration: undefined }),
    ).toEqual([])
  })
})

describe('the versions of one datum', () => {
  test('T-SPC-UNIT-FE-07 the one shown first, with why, then the others', () => {
    const read = profile([
      entry({
        alternatives: [
          {
            values: ['lose_weight'],
            provenance: 'professional_observation',
            valid_from: '2026-09-10T09:00:00.000Z',
          },
        ],
      }),
    ])
    const versions = versionsOf(read, 'primary_training_goal')
    expect(versions?.title).toBe('Objetivo')
    expect(versions?.reason).toBe('Mostramos «Construir músculo» porque lo declaraste tú.')
    expect(versions?.versions.map((one) => [one.line, one.current])).toEqual([
      ['Construir músculo', true],
      ['Bajar de peso', false],
    ])
    expect(versions?.versions[1]?.origin).toStartWith('Observado por tu coach · ')
  })

  test('T-SPC-UNIT-FE-08 the most recent says so, and an absent datum has none', () => {
    const read = profile([
      entry({
        attribute_code: 'training_days_per_week',
        values: ['4'],
        provenance: 'professional_observation',
        selected_because: 'most_recent',
      }),
    ])
    expect(versionsOf(read, 'training_days_per_week')?.reason).toBe(
      'Mostramos «4 días» porque es la versión más reciente.',
    )
    expect(versionsOf(read, 'session_duration')).toBeUndefined()
    expect(versionsOf(read, 'not_a_row')).toBeUndefined()
  })
})
