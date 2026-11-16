/**
 * The rules and refusals of changing a password (`PF-E18`, `PF-E18b`, `OP-IDN-066`).
 *
 * The rules are the sign-up's, plus one: the new password differs from the current one.
 * Each lights on its own as the password grows, and the button waits for all of them, so
 * the API's own check is only ever reached by a client that drifted. WorkOS may still
 * refuse a password that passes them, and that refusal lands on the new password's field.
 */

import { ApiError } from './api-error'

export type PasswordRule = 'length' | 'cases' | 'digit' | 'different'

export const PASSWORD_RULES: readonly { readonly rule: PasswordRule; readonly label: string }[] = [
  { rule: 'length', label: 'Al menos 8 caracteres' },
  { rule: 'cases', label: 'Una mayúscula y una minúscula' },
  { rule: 'digit', label: 'Un número' },
  { rule: 'different', label: 'Distinta de la actual' },
]

const MIN_LENGTH = 8
const MAX_LENGTH = 256

export function passwordChecks(current: string, next: string): Record<PasswordRule, boolean> {
  return {
    length: next.length >= MIN_LENGTH,
    cases: /[a-z]/.test(next) && /[A-Z]/.test(next),
    digit: /[0-9]/.test(next),
    different: next !== '' && next !== current,
  }
}

export function canChangePassword(current: string, next: string): boolean {
  if (current === '' || next.length > MAX_LENGTH) return false
  return Object.values(passwordChecks(current, next)).every(Boolean)
}

export interface PasswordFailure {
  readonly field?: 'current' | 'next'
  readonly message: string
}

export function passwordFailure(cause: unknown): PasswordFailure {
  if (!(cause instanceof ApiError)) {
    return { message: 'No pudimos cambiar tu contraseña. Inténtalo otra vez.' }
  }
  switch (cause.failure) {
    case 'wrong-password':
      return { field: 'current', message: 'La contraseña actual no es correcta.' }
    case 'weak-password':
      return {
        field: 'next',
        message:
          'Esa contraseña es demasiado fácil de adivinar. Cámbiale algunas letras o alárgala.',
      }
    case 'rate-limited':
      return { message: 'Hiciste muchos intentos. Espera un rato y vuelve a intentarlo.' }
    case 'unavailable':
      return { message: 'No pudimos conectar. Revisa tu conexión e inténtalo otra vez.' }
    default:
      return { message: 'No pudimos cambiar tu contraseña. Inténtalo otra vez.' }
  }
}
