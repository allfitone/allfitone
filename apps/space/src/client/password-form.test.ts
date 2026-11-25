import { describe, expect, test } from 'bun:test'

import { textFor } from '../i18n'
import { ApiError } from './api-error'
import {
  canChangePassword,
  isSignUpPassword,
  passwordChecks,
  passwordFailure,
  passwordRequirements,
  signUpRequirements,
} from './password-form'

const es = textFor('es').password
const en = textFor('en').password

describe('the rules of a new password (PF-E18)', () => {
  test('T-SPC-UNIT-PWD-10 the four rules, in the order the screen lists them', () => {
    expect(passwordRequirements('', '', es.rules).map((rule) => rule.label)).toEqual([
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
    expect(passwordFailure(new ApiError('wrong-password'), es)).toEqual({
      field: 'current',
      message: 'La contraseña actual no es correcta.',
    })
  })

  test('T-SPC-UNIT-PWD-14 a refused new password lands on the new one', () => {
    expect(passwordFailure(new ApiError('weak-password'), es)).toEqual({
      field: 'next',
      message: 'Esa contraseña es demasiado fácil de adivinar. Cámbiale algunas letras o alárgala.',
    })
  })

  test('T-SPC-UNIT-PWD-15 waiting, a lost connection and anything else say so above the button', () => {
    expect(passwordFailure(new ApiError('rate-limited'), es)).toEqual({
      message: 'Hiciste muchos intentos. Espera un rato y vuelve a intentarlo.',
    })
    expect(passwordFailure(new ApiError('unavailable'), es)).toEqual({
      message: 'No pudimos conectar. Revisa tu conexión e inténtalo otra vez.',
    })
    expect(passwordFailure(new Error('boom'), es)).toEqual({
      message: 'No pudimos cambiar tu contraseña. Inténtalo otra vez.',
    })
  })
})

describe('the rules of a sign-up password (HU-SP-001)', () => {
  test('T-SPC-UNIT-PWD-16 the sign-up lists the change rules but the last, with nothing to differ from', () => {
    expect(signUpRequirements('', es.rules).map((rule) => rule.label)).toEqual([
      'Al menos 8 caracteres',
      'Una mayúscula y una minúscula',
      'Un número',
    ])
    expect(signUpRequirements('', es.rules).every((rule) => !rule.met)).toBe(true)
  })

  test('T-SPC-UNIT-PWD-17 each lights on its own, and the account waits for all three', () => {
    expect(signUpRequirements('abcdefgh', es.rules).map((rule) => rule.met)).toEqual([
      true,
      false,
      false,
    ])
    expect(signUpRequirements('Abcdefg1', es.rules).map((rule) => rule.met)).toEqual([
      true,
      true,
      true,
    ])
    expect(isSignUpPassword('Abcdefg')).toBe(false)
    expect(isSignUpPassword('abcdefg1')).toBe(false)
    expect(isSignUpPassword('Abcdefg1')).toBe(true)
  })
})

describe('the password in English (TECH-44)', () => {
  test('T-SPC-UNIT-357 the rules and the refusals read the dictionary they are given', () => {
    expect(passwordRequirements('Actual-2026', 'Entreno', en.rules)).toEqual([
      { label: 'At least 8 characters', met: false },
      { label: 'An uppercase and a lowercase letter', met: true },
      { label: 'A number', met: false },
      { label: 'Different from your current one', met: true },
    ])
    expect(passwordFailure(new ApiError('wrong-password'), en)).toEqual({
      field: 'current',
      message: 'Your current password is incorrect.',
    })
    expect(en.toggleLabel(false, en.current)).toBe('Show current password')
    expect(es.toggleLabel(true, es.next)).toBe('Ocultar contraseña nueva')
  })
})
