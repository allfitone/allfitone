import { describe, expect, test } from 'bun:test'

import {
  canRetireContent,
  deriveFailure,
  derivedFromLabel,
  describeTarget,
  formatSeconds,
  parseVersionNumber,
  programVersionWeeks,
  retireFailure,
  versionStatusLabel,
} from './content-version'

describe('the version in the address', () => {
  test('accepts a positive whole number and nothing else', () => {
    expect(parseVersionNumber('3')).toBe(3)
    for (const value of ['0', '-1', '1.5', 'abc', '', undefined, '01']) {
      expect(parseVersionNumber(value)).toBeNull()
    }
  })
})

describe('the status of a version', () => {
  test('says published or retired', () => {
    expect(versionStatusLabel('published')).toBe('Publicada')
    expect(versionStatusLabel('deprecated')).toBe('Retirada')
  })
})

describe('a duration', () => {
  test('reads as seconds, minutes, or both', () => {
    expect(formatSeconds(45)).toBe('45 s')
    expect(formatSeconds(90)).toBe('1 min 30 s')
    expect(formatSeconds(300)).toBe('5 min')
  })
})

describe('a step’s targets, read back', () => {
  test('a strength step reads set by set, with its rest', () => {
    expect(
      describeTarget({
        family: 'strength',
        sets: [
          {
            set_order: 1,
            kind: 'warmup',
            target_reps: 10,
            target_load_value: 20,
            target_load_unit_code: 'kg',
            target_rpe: null,
          },
          {
            set_order: 2,
            kind: 'normal',
            target_reps: 8,
            target_load_value: 42.5,
            target_load_unit_code: 'kg',
            target_rpe: 8,
          },
          {
            set_order: 3,
            kind: 'to_failure',
            target_reps: null,
            target_load_value: null,
            target_load_unit_code: null,
            target_rpe: null,
          },
        ],
        target_rest_seconds: 90,
      }),
    ).toEqual([
      'Serie 1 (calentamiento): 10 repeticiones · 20 kg',
      'Serie 2: 8 repeticiones · 42,5 kg · RPE 8',
      'Serie 3 (al fallo): hasta el fallo',
      'Descanso entre series: 1 min 30 s',
    ])
  })

  // An older draft carries only the aggregate, and a version published from it may too.
  test('a strength step written as an aggregate still reads', () => {
    expect(
      describeTarget({
        family: 'strength',
        target_sets: 3,
        target_reps: 12,
        target_load_value: null,
        target_load_unit_code: null,
        target_rpe: null,
        target_rest_seconds: null,
      }),
    ).toEqual(['3 series de 12 repeticiones'])
  })

  test('an endurance step reads its distance, duration and pace', () => {
    expect(
      describeTarget({
        family: 'endurance',
        target_distance_value: 5000,
        target_distance_unit_code: 'm',
        target_duration_seconds: 1800,
        target_pace_seconds_per_unit: 360,
        target_pace_unit_code: 'km',
      }),
    ).toEqual(['Distancia: 5.000 m', 'Duración: 30 min', 'Ritmo: 6 min por km'])
  })

  test('an interval step reads its rounds, work and rest', () => {
    expect(
      describeTarget({
        family: 'interval',
        rounds: 8,
        work_duration_seconds: 20,
        rest_duration_seconds: 10,
        target_rpe: 9,
      }),
    ).toEqual(['8 rondas de 20 s de trabajo y 10 s de descanso', 'Esfuerzo: RPE 9'])
  })

  test('a mobility step reads what it holds or repeats, and its side', () => {
    expect(
      describeTarget({
        family: 'mobility',
        sequence_position: 1,
        hold_duration_seconds: 30,
        target_repetitions: null,
        side: 'left',
      }),
    ).toEqual(['Sostener 30 s', 'Lado: izquierdo'])
    expect(
      describeTarget({
        family: 'mobility',
        sequence_position: 2,
        hold_duration_seconds: null,
        target_repetitions: 10,
        side: 'not_applicable',
      }),
    ).toEqual(['10 repeticiones'])
  })
})

describe('a program version, by week', () => {
  test('groups its sessions by week, in day and then position order', () => {
    const weeks = programVersionWeeks([
      { position: 3, week: 2, day: 1, template_version_id: 'c' },
      { position: 2, week: 1, day: 4, template_version_id: 'b' },
      { position: 1, week: 1, day: 1, template_version_id: 'a' },
    ])
    expect(weeks.map((entry) => [entry.week, entry.sessions.map((s) => s.position)])).toEqual([
      [1, [1, 2]],
      [2, [3]],
    ])
  })
})

describe('who retires a version', () => {
  // `planning.assert_deprecate_content` asks for the role, not a capability.
  test('is an owner or an admin, never a coach alone', () => {
    expect(canRetireContent(['owner'])).toBe(true)
    expect(canRetireContent(['coach', 'admin'])).toBe(true)
    expect(canRetireContent(['coach'])).toBe(false)
    expect(canRetireContent([])).toBe(false)
  })
})

describe('where a draft comes from', () => {
  const versions = [
    { id: 'v2', version_number: 2 },
    { id: 'v1', version_number: 1 },
  ]

  test('names the version a draft was started from', () => {
    expect(derivedFromLabel('v1', versions)).toBe('Parte de la versión 1.')
  })

  test('says nothing when it was not started from one', () => {
    expect(derivedFromLabel(null, versions)).toBeUndefined()
    expect(derivedFromLabel(undefined, versions)).toBeUndefined()
  })

  test('still says it is an adaptation when the version is not at hand', () => {
    expect(derivedFromLabel('other', versions)).toBe('Parte de una versión publicada.')
  })
})

describe('refusals', () => {
  test('a retirement refused says who may retire', () => {
    expect(retireFailure(403)).toBe(
      'Retirar versiones corresponde a propietario y administración, y tu rol ya no lo permite.',
    )
    expect(retireFailure(404)).toBe('Esta versión ya no está disponible para tu organización.')
  })

  // Only a published version can be started from; a retired one answers 404.
  test('a start refused because the version is gone or retired says so', () => {
    expect(deriveFailure(404)).toBe(
      'Esa versión ya no se puede usar como punto de partida: no está publicada o no es de tu organización.',
    )
    expect(deriveFailure(403)).toBe(
      'Ya no puedes editar esta plantilla: tu rol cambió o la organización no está activa.',
    )
  })
})
