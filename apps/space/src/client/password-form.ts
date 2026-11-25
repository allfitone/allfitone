/**
 * The rules and refusals of changing a password (`PF-E18`, `PF-E18b`, `OP-IDN-066`).
 *
 * The rules are the sign-up's, plus one: the new password differs from the current one.
 * Each lights on its own as the password grows, and the button waits for all of them, so
 * the API's own check is only ever reached by a client that drifted. WorkOS may still
 * refuse a password that passes them, and that refusal lands on the new password's field.
 */

import type { Dictionary } from '../i18n'
import { ApiError } from './api-error'

type PasswordText = Dictionary['password']

export type PasswordRule = 'length' | 'cases' | 'digit' | 'different'

/** In the order the screen lists them; their words are `password.rules` in the dictionary. */
export const PASSWORD_RULES: readonly PasswordRule[] = ['length', 'cases', 'digit', 'different']

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

export interface Requirement {
  readonly label: string
  readonly met: boolean
}

/** The change's four rules, worded, and whether each is met. */
export function passwordRequirements(
  current: string,
  next: string,
  rules: PasswordText['rules'],
): readonly Requirement[] {
  const checks = passwordChecks(current, next)
  return PASSWORD_RULES.map((rule) => ({ label: rules[rule], met: checks[rule] }))
}

const SIGN_UP_RULES = PASSWORD_RULES.filter((rule) => rule !== 'different')

/** The sign-up's rules: the change's, without the one that compares to a current password. */
export function signUpRequirements(
  password: string,
  rules: PasswordText['rules'],
): readonly Requirement[] {
  const checks = passwordChecks('', password)
  return SIGN_UP_RULES.map((rule) => ({ label: rules[rule], met: checks[rule] }))
}

export function isSignUpPassword(password: string): boolean {
  const checks = passwordChecks('', password)
  return SIGN_UP_RULES.every((rule) => checks[rule])
}

export function canChangePassword(current: string, next: string): boolean {
  if (current === '' || next.length > MAX_LENGTH) return false
  return Object.values(passwordChecks(current, next)).every(Boolean)
}

export interface PasswordFailure {
  readonly field?: 'current' | 'next'
  readonly message: string
}

export function passwordFailure(cause: unknown, text: PasswordText): PasswordFailure {
  const words = text.failure
  if (!(cause instanceof ApiError)) return { message: words.generic }
  switch (cause.failure) {
    case 'wrong-password':
      return { field: 'current', message: words.wrongPassword }
    case 'weak-password':
      return { field: 'next', message: words.weakPassword }
    case 'rate-limited':
      return { message: words.rateLimited }
    case 'unavailable':
      return { message: words.unavailable }
    default:
      return { message: words.generic }
  }
}
