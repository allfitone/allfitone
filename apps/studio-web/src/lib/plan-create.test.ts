import { describe, expect, test } from 'bun:test'

import { planNameError, planNameRequest, planWriteFailure } from './plan-create'

describe('a plan’s name', () => {
  test('is asked for, and no longer than 80 characters', () => {
    expect(planNameError('   ')).toBe('Escribe el nombre del plan.')
    expect(planNameError('x'.repeat(81))).toBe('El nombre admite hasta 80 caracteres.')
    expect(planNameError('Mensual ilimitado')).toBeUndefined()
  })

  test('is sent trimmed, and alone', () => {
    expect(planNameRequest('  Mensual ilimitado  ')).toEqual({ name: 'Mensual ilimitado' })
  })
})

describe('a refusal', () => {
  /*
   * Criterion 3. The unique index ignores case, so «mensual ilimitado» is
   * taken by «Mensual ilimitado»; the `409` is said as that.
   */
  test('a 409 is a name the organization already uses', () => {
    expect(planWriteFailure(409)).toBe(
      'Ya hay un plan con ese nombre, aunque esté escrito con otras mayúsculas.',
    )
  })

  // `manage_billing` is the owner's and the admin's: a coach is refused with 403.
  test('a 403 says who manages the plans', () => {
    expect(planWriteFailure(403)).toBe(
      'Crear y cambiar planes corresponde a propietario y administración, y tu rol ya no lo permite.',
    )
  })

  test('a 404 says the plan is gone', () => {
    expect(planWriteFailure(404)).toBe('Este plan ya no está disponible para tu organización.')
  })
})
