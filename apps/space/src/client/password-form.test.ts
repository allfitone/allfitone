import { describe, expect, test } from 'bun:test'

import { ApiError } from './api-error'
import { canChangePassword, passwordChecks, passwordFailure, PASSWORD_RULES } from './password-form'

describe('the rules of a new password (PF-E18)', () => {
  test('T-SPC-UNIT-PWD-10 the four rules, in the order the screen lists them', () => {
    expect(PASSWORD_RULES.map((rule) => rule.label)).toEqual([
      'Al menos 8 caracteres',
      'Una mayúscula y una minúscula',
      'Un número',
      'Distinta de la actual',
    ])
  })

  test('T-SPC-UNIT-PWD-11 each rule lights on its own as the password grows', () => {
    expect(passwordChecks('Actual-2026', '')).toEqual({
      length: false,
      cases: false,
      digit: false,
      different: false,
    })
    expect(passwordChecks('Actual-2026', 'entreno')).toEqual({
      length: false,
      cases: false,
      digit: false,
      different: true,
    })
    expect(passwordChecks('Actual-2026', 'Entreno2026')).toEqual({
      length: true,
      cases: true,
      digit: true,
      different: true,
    })
    expect(passwordChecks('Entreno2026', 'Entreno2026').different).toBe(false)
  })

  test('T-SPC-UNIT-PWD-12 the button waits for the current password and every rule', () => {
    expect(canChangePassword('', 'Entreno2026')).toBe(false)
    expect(canChangePassword('Actual-2026', 'entreno2026')).toBe(false)
    expect(canChangePassword('Actual-2026', 'Entreno2026')).toBe(true)
    expect(canChangePassword('Actual-2026', `A1${'a'.repeat(255)}`)).toBe(false)
  })
})

describe('what a refusal says (PF-E18b)', () => {
  test('T-SPC-UNIT-PWD-13 a wrong current password lands on its field', () => {
    expect(passwordFailure(new ApiError('wrong-password'))).toEqual({
      field: 'current',
      message: 'La contraseña actual no es correcta.',
    })
  })

  test('T-SPC-UNIT-PWD-14 a refused new password lands on the new one', () => {
    expect(passwordFailure(new ApiError('weak-password'))).toEqual({
      field: 'next',
      message: 'Esa contraseña es demasiado fácil de adivinar. Cámbiale algunas letras o alárgala.',
    })
  })

  test('T-SPC-UNIT-PWD-15 waiting, a lost connection and anything else say so above the button', () => {
    expect(passwordFailure(new ApiError('rate-limited'))).toEqual({
      message: 'Hiciste muchos intentos. Espera un rato y vuelve a intentarlo.',
    })
    expect(passwordFailure(new ApiError('unavailable'))).toEqual({
      message: 'No pudimos conectar. Revisa tu conexión e inténtalo otra vez.',
    })
    expect(passwordFailure(new Error('boom'))).toEqual({
      message: 'No pudimos cambiar tu contraseña. Inténtalo otra vez.',
    })
  })
})
