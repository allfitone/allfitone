/**
 * T-IDN-PASSWORD-UNIT-01..08 — the order of a password change (TECH-325, `OP-IDN-066`,
 * ADR-051): ask PostgreSQL whether she may try, check and set the password in WorkOS, and
 * record the change only once WorkOS took it.
 */

import { describe, expect, test } from 'bun:test'
import { AuthError, type VerifiedToken } from '@allfitone/auth-provider'

import type { PasswordChangeDatabase, PasswordChangeState } from '../domain/password-change.js'
import {
  createPasswordChangeService,
  PasswordChangeError,
  type PasswordChangeIdentityPort,
} from './password-change.js'

const token: VerifiedToken = {
  subject: 'user_camila',
  sessionId: 'session_phone',
  surface: 'space',
  authenticatedAt: null,
}

const COMMAND = {
  idempotencyKey: 'b6000000-0000-4000-8000-000000000001',
  commandId: '019f6000-0000-7000-8000-000000000501',
  requestHash: new Uint8Array(32),
}

function harness(
  options: {
    state?: PasswordChangeState
    check?: Error
    set?: Error
    record?: Error
  } = {},
) {
  const steps: string[] = []
  const database: PasswordChangeDatabase = {
    prepare: async (input) => {
      steps.push(`prepare ${input.subject} ${input.idempotencyKey}`)
      return options.state ?? { state: 'ready', signInEmail: 'camila@example.test' }
    },
    reject: async (input) => {
      steps.push(`reject ${input.subject}`)
    },
    record: async (input) => {
      steps.push(`record ${input.subject} keep ${input.keepSessionId} ${input.commandId}`)
      if (options.record) throw options.record
      return { replayed: false }
    },
  }
  const identity: PasswordChangeIdentityPort = {
    checkPassword: async (email, password) => {
      steps.push(`check ${email} ${password}`)
      if (options.check) throw options.check
      return { sessionId: 'session_check' }
    },
    setPassword: async (subject, password) => {
      steps.push(`set ${subject} ${password}`)
      if (options.set) throw options.set
    },
    revokeSession: async (sessionId) => {
      steps.push(`revoke ${sessionId}`)
    },
  }
  const service = createPasswordChangeService({
    database,
    identity,
    issuer: 'https://issuer.test',
    requestId: () => 'request-1',
  })
  const change = (current = 'Actual-2026', next = 'Nueva-Clave-2026') =>
    service.changePassword(token, { ...COMMAND, currentPassword: current, newPassword: next })
  return { steps, change }
}

const failure = (promise: Promise<unknown>) =>
  promise.then(
    () => undefined,
    (error: unknown) => (error instanceof PasswordChangeError ? error.code : error),
  )

describe('changing a password', () => {
  test('T-IDN-PASSWORD-UNIT-01 checks, sets, then records keeping the session it came from', async () => {
    const { steps, change } = harness()

    await expect(change()).resolves.toEqual({ replayed: false })
    expect(steps).toEqual([
      `prepare user_camila ${COMMAND.idempotencyKey}`,
      'check camila@example.test Actual-2026',
      'set user_camila Nueva-Clave-2026',
      `record user_camila keep session_phone ${COMMAND.commandId}`,
    ])
  })

  test('T-IDN-PASSWORD-UNIT-02 a replay is answered from the receipt and never asks WorkOS', async () => {
    const { steps, change } = harness({ state: { state: 'replayed' } })

    await expect(change()).resolves.toEqual({ replayed: true })
    expect(steps).toEqual([`prepare user_camila ${COMMAND.idempotencyKey}`])
  })

  test('T-IDN-PASSWORD-UNIT-03 too many wrong ones stop the attempt before WorkOS', async () => {
    const { steps, change } = harness({ state: { state: 'too_many_attempts' } })

    expect(await failure(change())).toBe('rate-limited')
    expect(steps).toEqual([`prepare user_camila ${COMMAND.idempotencyKey}`])
  })

  test('T-IDN-PASSWORD-UNIT-04 a wrong current password is counted and nothing is set', async () => {
    const { steps, change } = harness({ check: new AuthError('invalid_credentials') })

    expect(await failure(change())).toBe('wrong-password')
    expect(steps).toEqual([
      `prepare user_camila ${COMMAND.idempotencyKey}`,
      'check camila@example.test Actual-2026',
      'reject user_camila',
    ])
  })

  test('T-IDN-PASSWORD-UNIT-05 a password WorkOS refuses closes the session the check opened', async () => {
    const { steps, change } = harness({ set: new AuthError('weak_password') })

    expect(await failure(change())).toBe('weak-password')
    expect(steps.slice(-2)).toEqual(['set user_camila Nueva-Clave-2026', 'revoke session_check'])
    expect(steps.some((step) => step.startsWith('record'))).toBe(false)
  })

  test('T-IDN-PASSWORD-UNIT-06 an outage is upstream-unavailable and leaves no session behind', async () => {
    const checking = harness({ check: new AuthError('provider_unavailable') })
    const setting = harness({ set: new AuthError('provider_unavailable') })

    expect(await failure(checking.change())).toBe('upstream-unavailable')
    expect(checking.steps.some((step) => step.startsWith('reject'))).toBe(false)
    expect(await failure(setting.change())).toBe('upstream-unavailable')
    expect(setting.steps.at(-1)).toBe('revoke session_check')
  })

  test('T-IDN-PASSWORD-UNIT-07 the same password twice is refused before anything is asked', async () => {
    const { steps, change } = harness()

    expect(await failure(change('Misma-Clave-2026', 'Misma-Clave-2026'))).toBe('validation-failed')
    expect(steps).toEqual([])
  })

  test('T-IDN-PASSWORD-UNIT-08 if PostgreSQL fails after WorkOS, the check session still closes', async () => {
    const recordFailure = new Error('connection lost')
    const { steps, change } = harness({ record: recordFailure })

    expect(await failure(change())).toBe(recordFailure)
    expect(steps.at(-1)).toBe('revoke session_check')
  })
})
