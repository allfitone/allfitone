/**
 * Changing a password from Space (TECH-325, `OP-IDN-066`, `HU-SP-005`).
 *
 * ADR-051 is why this use case speaks to WorkOS: the outbox would have to hold the
 * password. So the order is fixed. PostgreSQL first says whether she may try and answers a
 * replay, because after a change the old password is no longer the current one. WorkOS
 * then checks the current password, which opens a session, and sets the new one. Only
 * then does PostgreSQL record the change, which hands the other sessions to the worker.
 *
 * The session the check opened is closed here whenever the worker will not close it: when
 * the new password is refused, when WorkOS fails, or when PostgreSQL fails after WorkOS.
 * Nothing here logs or rethrows what was typed.
 */

import {
  AuthError,
  type PasswordChangeIdentity,
  type VerifiedToken,
} from '@allfitone/auth-provider'

import { measureRequestPhase } from '../../../platform/observability/index.js'
import type { OwnProfileCommand } from '../domain/own-profile.js'
import type { PasswordChangeDatabase } from '../domain/password-change.js'

export type PasswordChangeIdentityPort = Pick<
  PasswordChangeIdentity,
  'checkPassword' | 'setPassword' | 'revokeSession'
>

export type PasswordChangeErrorCode =
  'validation-failed' | 'wrong-password' | 'weak-password' | 'rate-limited' | 'upstream-unavailable'

export class PasswordChangeError extends Error {
  constructor(readonly code: PasswordChangeErrorCode) {
    super(code)
    this.name = 'PasswordChangeError'
  }
}

export interface PasswordChangeService {
  changePassword(
    token: VerifiedToken,
    input: Omit<OwnProfileCommand, 'requestId'> & { currentPassword: string; newPassword: string },
  ): Promise<{ replayed: boolean }>
}

export function createPasswordChangeService(dependencies: {
  database: PasswordChangeDatabase
  identity: PasswordChangeIdentityPort
  issuer: string
  requestId: () => string
}): PasswordChangeService {
  const { database, identity } = dependencies

  return {
    async changePassword(token, input) {
      if (input.currentPassword === input.newPassword) {
        throw new PasswordChangeError('validation-failed')
      }
      const holder = { issuer: dependencies.issuer, subject: String(token.subject) }

      const prepared = await database.prepare({
        ...holder,
        requestId: dependencies.requestId(),
        idempotencyKey: input.idempotencyKey,
      })
      if (prepared.state === 'replayed') return { replayed: true }
      if (prepared.state === 'too_many_attempts') throw new PasswordChangeError('rate-limited')

      let check: { sessionId: string }
      try {
        check = await measureRequestPhase('workos-refresh', () =>
          identity.checkPassword(prepared.signInEmail, input.currentPassword),
        )
      } catch (error) {
        if (error instanceof AuthError && error.code === 'invalid_credentials') {
          await database.reject({ ...holder, requestId: dependencies.requestId() })
          throw new PasswordChangeError('wrong-password')
        }
        throw new PasswordChangeError('upstream-unavailable')
      }

      try {
        await measureRequestPhase('workos-refresh', () =>
          identity.setPassword(holder.subject, input.newPassword),
        )
      } catch (error) {
        await closeQuietly(identity, check.sessionId)
        throw new PasswordChangeError(
          error instanceof AuthError && error.code === 'weak_password'
            ? 'weak-password'
            : 'upstream-unavailable',
        )
      }

      try {
        return await database.record({
          ...holder,
          requestId: dependencies.requestId(),
          idempotencyKey: input.idempotencyKey,
          commandId: input.commandId,
          requestHash: input.requestHash,
          keepSessionId: token.sessionId,
        })
      } catch (error) {
        // The password changed but no event will close the check's session: close it here.
        await closeQuietly(identity, check.sessionId)
        throw error
      }
    },
  }
}

// Best effort: a session left open expires on its own, and the answer must not wait on it.
async function closeQuietly(identity: PasswordChangeIdentityPort, sessionId: string) {
  try {
    await identity.revokeSession(sessionId)
  } catch {
    return
  }
}
