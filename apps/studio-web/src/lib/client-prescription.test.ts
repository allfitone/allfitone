import { describe, expect, test } from 'bun:test'

import {
  ADJUSTMENT_SIDES,
  adjustableKinds,
  adjustedLine,
  adjustmentInForce,
  adjustmentKindLabel,
  adjustmentProblem,
  adjustmentUnit,
  adjustmentValue,
  offeredKinds,
  prescriptionNote,
  prescriptionReadFailure,
  prescriptionWriteFailure,
  publishedValue,
  sideLabelFor,
  stepFamily,
} from './client-prescription.js'
import type {
  AssignmentPrescriptionStep,
  PlannedStepContent,
  PrescriptionRevision,
} from './studio-api.js'

/** Un paso de fuerza como lo publica una rutina: series, repeticiones y carga con su unidad. */
const strength = (overrides: Record<string, unknown> = {}): PlannedStepContent =>
  ({
    position: 1,
    movement_id: '01991600-7000-7000-8000-00000000c701',
    target: {
      family: 'strength',
      sets: [{ set_order: 1, kind: 'normal', target_reps: 8 }],
      target_sets: 3,
      target_reps: 8,
      target_load_value: 60,
      target_load_unit_code: 'kg',
      target_rpe: 8,
      target_rest_seconds: 120,
      ...overrides,
    },
  }) as unknown as PlannedStepContent

const endurance = (overrides: Record<string, unknown> = {}): PlannedStepContent =>
  ({
    position: 1,
    target: {
      family: 'endurance',
      target_distance_value: 5,
      target_distance_unit_code: 'km',
      target_duration_seconds: 1800,
      target_pace_seconds_per_unit: 360,
      target_pace_unit_code: 'km',
      ...overrides,
    },
  }) as unknown as PlannedStepContent

const interval = (): PlannedStepContent =>
  ({
    position: 1,
    target: {
      family: 'interval',
      rounds: 8,
      work_duration_seconds: 30,
      rest_duration_seconds: 30,
      target_rpe: 7,
    },
  }) as unknown as PlannedStepContent

const mobility = (): PlannedStepContent =>
  ({
    position: 1,
    target: {
      family: 'mobility',
      sequence_position: 1,
      side: 'bilateral',
      hold_duration_seconds: 30,
    },
  }) as unknown as PlannedStepContent

const revision = (overrides: Partial<PrescriptionRevision> = {}): PrescriptionRevision =>
  ({
    id: '01991600-7000-7000-8000-0000000000f1',
    assignment_id: '01991600-7000-7000-8000-0000000000e1',
    planned_step_id: '01991600-7000-7000-8000-0000000000d1',
    kind: 'target_load',
    value: 62.5,
    unit_code: 'kg',
    revised_at: '2026-11-18T10:00:00.000Z',
    ...overrides,
  }) as PrescriptionRevision

describe('qué admite cada paso, según su familia', () => {
  /* El mapa es el del servidor: `planning.prescription_kind_families`. */
  test('fuerza toma series, repeticiones, carga, RPE y nota', () => {
    expect(adjustableKinds(strength())).toEqual([
      'target_sets',
      'target_reps',
      'target_load',
      'target_rpe',
      'notes',
    ])
  })

  test('resistencia toma distancia, duración, ritmo y nota — nunca RPE', () => {
    const kinds = adjustableKinds(endurance())
    expect(kinds).toEqual(['target_distance', 'target_duration', 'target_pace', 'notes'])
    expect(kinds).not.toContain('target_rpe')
  })

  /* El RPE es el único que cruza dos familias. */
  test('intervalo toma RPE, rondas, trabajo, descanso y nota', () => {
    expect(adjustableKinds(interval())).toEqual([
      'target_rpe',
      'rounds',
      'work_duration',
      'rest_duration',
      'notes',
    ])
  })

  test('movilidad toma sostenimiento, repeticiones, lado y nota', () => {
    expect(adjustableKinds(mobility())).toEqual([
      'hold_duration',
      'target_repetitions',
      'side',
      'notes',
    ])
  })

  test('una familia que no reconocemos no ofrece nada', () => {
    const extraño = { position: 1, target: { family: 'otra' } } as unknown as PlannedStepContent
    expect(stepFamily(extraño)).toBeNull()
    expect(adjustableKinds(extraño)).toEqual([])
  })
})

describe('la unidad sale del paso, nunca se elige', () => {
  test('carga, distancia y ritmo toman la del paso publicado', () => {
    expect(adjustmentUnit(strength(), 'target_load')).toBe('kg')
    expect(adjustmentUnit(endurance(), 'target_distance')).toBe('km')
    expect(adjustmentUnit(endurance(), 'target_pace')).toBe('km')
  })

  test('los demás no llevan unidad', () => {
    expect(adjustmentUnit(strength(), 'target_sets')).toBeNull()
    expect(adjustmentUnit(interval(), 'work_duration')).toBeNull()
    expect(adjustmentUnit(mobility(), 'side')).toBeNull()
  })

  /*
   * El servidor exige unidad para la carga. Si la rutina no la trae, ofrecer el
   * ajuste sería ofrecer un rechazo.
   */
  test('un paso sin unidad no ofrece el ajuste que la necesita', () => {
    const sinUnidad = strength({ target_load_unit_code: null })
    expect(adjustableKinds(sinUnidad)).toContain('target_load')
    expect(offeredKinds(sinUnidad)).not.toContain('target_load')
    expect(offeredKinds(sinUnidad)).toContain('target_sets')
  })
})

describe('lo que pide la rutina, separado de lo ajustado', () => {
  /* Criterio 1: la rutina publicada no se reescribe con el ajuste. */
  test('el valor publicado sale del paso, no del ajuste', () => {
    expect(publishedValue(strength(), 'target_load')).toBe(60)
    expect(publishedValue(strength(), 'target_sets')).toBe(3)
    expect(publishedValue(interval(), 'rounds')).toBe(8)
    expect(publishedValue(mobility(), 'side')).toBe('bilateral')
  })

  test('una nota no es algo que la rutina fije', () => {
    expect(publishedValue(strength(), 'notes')).toBeNull()
  })

  /* Que la rutina no lo fije no es lo mismo que que valga cero. */
  test('un objetivo que la rutina dejó sin fijar se dice, no se dibuja en cero', () => {
    expect(publishedValue(strength({ target_rpe: null }), 'target_rpe')).toBeNull()
    expect(adjustedLine(null, null)).toBe('La rutina no lo fija')
    expect(adjustedLine(60, 'kg')).toBe('La rutina pide 60 kg')
    expect(adjustedLine(3, null)).toBe('La rutina pide 3')
  })

  test('el ajuste en vigor se encuentra por su tipo', () => {
    const step = {
      planned_step_id: '01991600-7000-7000-8000-0000000000d1',
      step: strength(),
      adjustments: [revision(), revision({ kind: 'target_sets', value: 4, unit_code: null })],
    } as unknown as AssignmentPrescriptionStep
    expect(adjustmentInForce(step, 'target_load')?.value).toBe(62.5)
    expect(adjustmentInForce(step, 'target_sets')?.value).toBe(4)
    expect(adjustmentInForce(step, 'target_rpe')).toBeUndefined()
  })
})

describe('lo que el formulario no manda', () => {
  test('vacío y lo que no es un número', () => {
    expect(adjustmentProblem('target_sets', '  ', undefined)).toBe('empty')
    expect(adjustmentProblem('target_sets', 'tres', undefined)).toBe('not-a-number')
  })

  /* Los enteros del servidor: series, repeticiones, rondas y repeticiones de movilidad. */
  test('los que son enteros rechazan un decimal y el cero', () => {
    for (const kind of ['target_sets', 'target_reps', 'rounds', 'target_repetitions'] as const) {
      expect(adjustmentProblem(kind, '3,5', undefined)).toBe('not-whole')
      expect(adjustmentProblem(kind, '0', undefined)).toBe('out-of-range')
      expect(adjustmentProblem(kind, '4', undefined)).toBeNull()
    }
  })

  test('el RPE va de 0 a 10', () => {
    expect(adjustmentProblem('target_rpe', '-1', undefined)).toBe('out-of-range')
    expect(adjustmentProblem('target_rpe', '10,5', undefined)).toBe('out-of-range')
    expect(adjustmentProblem('target_rpe', '0', undefined)).toBeNull()
    expect(adjustmentProblem('target_rpe', '10', undefined)).toBeNull()
  })

  /* El descanso admite cero —«sin descanso»— y los demás tiempos no. */
  test('el descanso admite cero y el trabajo no', () => {
    expect(adjustmentProblem('rest_duration', '0', undefined)).toBeNull()
    expect(adjustmentProblem('work_duration', '0', undefined)).toBe('out-of-range')
    expect(adjustmentProblem('hold_duration', '0', undefined)).toBe('out-of-range')
  })

  test('la carga admite cero y la distancia no', () => {
    expect(adjustmentProblem('target_load', '0', undefined)).toBeNull()
    expect(adjustmentProblem('target_load', '-1', undefined)).toBe('out-of-range')
    expect(adjustmentProblem('target_distance', '0', undefined)).toBe('out-of-range')
  })

  test('una nota no puede pasar de 2 000 caracteres', () => {
    expect(adjustmentProblem('notes', 'a'.repeat(2000), undefined)).toBeNull()
    expect(adjustmentProblem('notes', 'a'.repeat(2001), undefined)).toBe('too-long')
  })

  /* Mandar lo que ya está en vigor guardaría una revisión que no cambia nada. */
  test('lo que ya está en vigor no se vuelve a mandar', () => {
    expect(adjustmentProblem('target_load', '62,5', revision())).toBe('unchanged')
    expect(adjustmentProblem('target_load', '65', revision())).toBeNull()
    const nota = revision({ kind: 'notes', value: 'Baja la carga', unit_code: null })
    expect(adjustmentProblem('notes', 'Baja la carga', nota)).toBe('unchanged')
  })

  test('la coma decimal se lee como punto', () => {
    expect(adjustmentValue('target_load', '62,5')).toBe(62.5)
    expect(adjustmentValue('notes', '  una nota  ')).toBe('una nota')
    expect(adjustmentValue('side', 'left')).toBe('left')
  })
})

describe('las palabras de la pantalla', () => {
  /* Criterio 1, dicho donde se ajusta. */
  test('dice que no cambia la rutina del gimnasio', () => {
    const note = prescriptionNote()
    expect(note).toContain('no cambia la rutina ni el programa del gimnasio')
    expect(note).toContain('solo para esta persona')
    expect(note).toContain('quién lo hizo')
  })

  test('cada tipo y cada lado tienen su palabra', () => {
    expect(adjustmentKindLabel('target_load')).toBe('Carga')
    expect(adjustmentKindLabel('rest_duration')).toBe('Descanso')
    for (const side of ADJUSTMENT_SIDES) {
      expect(sideLabelFor(side).length).toBeGreaterThan(0)
    }
    expect(sideLabelFor('bilateral')).toBe('Los dos')
  })
})

describe('qué significa cada negativa', () => {
  /* Criterio 4: se puede leer y no ajustar. */
  test('el 409 es que el gimnasio ya no administra el programa', () => {
    const said = prescriptionWriteFailure(409, 'conflict')
    expect(said).toContain('ya no administra este programa')
    expect(said).toContain('sigue en pie')
  })

  test('los dos 403 son conversaciones distintas', () => {
    expect(prescriptionWriteFailure(403, 'scope-required')).toContain('Ella decide ese permiso')
    expect(prescriptionWriteFailure(403, 'forbidden')).toContain('tu rol en esta organización')
  })

  test('el 422 manda a recargar en vez de explicar lo que no debería pasar', () => {
    expect(prescriptionWriteFailure(422, 'validation-failed')).toContain('Vuelve a cargar')
  })

  test('lo demás dice que no quedó nada escrito', () => {
    expect(prescriptionWriteFailure(503, undefined)).toContain('No quedó nada escrito')
    expect(prescriptionWriteFailure(0, undefined)).toContain('No quedó nada escrito')
  })

  test('la lectura rechazada dice que el intento queda registrado', () => {
    expect(prescriptionReadFailure(403)).toContain('queda registrado')
    expect(prescriptionReadFailure(404)).toContain('no está disponible para ti')
  })
})
