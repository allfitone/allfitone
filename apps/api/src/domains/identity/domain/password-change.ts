/**
 * A person changes her password: `OP-IDN-066`, `HU-SP-005`, ADR-051.
 *
 * WorkOS holds the password. PostgreSQL holds whether she may try, the wrong attempts and
 * the change once WorkOS took it; nothing it stores is derived from a password.
 *
 * The policy is the sign-up's, repeated here so a malformed request is answered 422
 * before WorkOS is asked. WorkOS applies its own on top, and its refusal is
 * `weak-password`.
 */

import type { OwnProfileCommand, OwnProfileHolder } from './own-profile.js'

export const MAX_PASSWORD_LENGTH = 256
export const PASSWORD_POLICY = /^(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9]).{8,256}$/

export type PasswordChangeState =
  { state: 'ready'; signInEmail: string } | { state: 'replayed' } | { state: 'too_many_attempts' }

export interface PasswordChangeDatabase {
  prepare(
    input: OwnProfileHolder & { requestId: string; idempotencyKey: string },
  ): Promise<PasswordChangeState>
  reject(input: OwnProfileHolder & { requestId: string }): Promise<void>
  record(
    input: OwnProfileHolder & OwnProfileCommand & { keepSessionId: string },
  ): Promise<{ replayed: boolean }>
}
