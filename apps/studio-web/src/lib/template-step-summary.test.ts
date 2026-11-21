import { describe, expect, test } from 'bun:test'

import type { EditorSet, EditorTarget } from './session-template-editor'
import { stepSummary } from './template-step-summary'

function set(patch: Partial<EditorSet> = {}): EditorSet {
  return { kind: 'normal', reps: '8', load: '40', rpe: '', ...patch }
}

function strength(sets: EditorSet[], loadUnit: 'kg' | 'lb' = 'kg'): EditorTarget {
  return { family: 'strength', sets, loadUnit, rest: '90' }
}

describe('stepSummary', () => {
  test('equal sets read as the coach says them: how many, the reps and the load', () => {
    expect(stepSummary(strength([set(), set(), set()]))).toBe('3 series · 8 reps · 40 kg')
  })

  test('one set is singular, and the load keeps its unit and its comma', () => {
    expect(stepSummary(strength([set({ reps: '5', load: '42,5' })], 'lb'))).toBe(
      '1 serie · 5 reps · 42,5 lb',
    )
  })

  test('sets that differ show the range, lowest first', () => {
    const sets = [set({ reps: '12', load: '30' }), set({ reps: '10', load: '35' }), set()]
    expect(stepSummary(strength(sets))).toBe('3 series · 8–12 reps · 30–40 kg')
  })

  test('what is not written is left out, never shown as a zero', () => {
    expect(stepSummary(strength([set({ reps: '', load: '' }), set({ reps: '', load: '' })]))).toBe(
      '2 series',
    )
    expect(stepSummary(strength([set({ load: ' ' })]))).toBe('1 serie · 8 reps')
  })

  test('sets to failure have no reps to count', () => {
    const toFailure = set({ kind: 'to_failure', reps: '', load: '20' })
    expect(stepSummary(strength([toFailure, toFailure]))).toBe('2 series · al fallo · 20 kg')
    // Mixed: the reps are those of the sets that have them.
    expect(stepSummary(strength([set(), toFailure]))).toBe('2 series · 8 reps · 20–40 kg')
  })

  test('a value that is not a number yet is left out until it is', () => {
    expect(stepSummary(strength([set({ reps: 'och', load: '4o' }), set()]))).toBe('2 series')
  })

  test('endurance reads its distance and its time', () => {
    const target: EditorTarget = {
      family: 'endurance',
      distance: '5000',
      minutes: '30',
      pace: null,
    }
    expect(stepSummary(target)).toBe('5000 m · 30 min')
    expect(stepSummary({ ...target, minutes: '' })).toBe('5000 m')
  })

  test('an interval reads its rounds, work and rest', () => {
    const target: EditorTarget = {
      family: 'interval',
      rounds: '8',
      work: '30',
      rest: '15',
      rpe: '',
    }
    expect(stepSummary(target)).toBe('8 rondas · 30 s de trabajo · 15 s de descanso')
    expect(stepSummary({ ...target, rounds: '1', rest: '' })).toBe('1 ronda · 30 s de trabajo')
  })

  test('mobility reads the hold, the reps and the side when there is one', () => {
    const target: EditorTarget = { family: 'mobility', hold: '30', reps: '10', side: 'left' }
    expect(stepSummary(target)).toBe('30 s · 10 reps · Izquierdo')
    expect(stepSummary({ ...target, reps: '', side: 'not_applicable' })).toBe('30 s')
  })

  test('a step with nothing written says so', () => {
    expect(stepSummary({ family: 'mobility', hold: '', reps: '', side: 'not_applicable' })).toBe(
      'Sin objetivos',
    )
    expect(stepSummary({ family: 'endurance', distance: '', minutes: '', pace: null })).toBe(
      'Sin objetivos',
    )
  })
})
