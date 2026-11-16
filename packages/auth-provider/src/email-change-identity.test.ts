/**
 * What the worker asks WorkOS when a person changes her email (TECH-44, `OP-IDN-022`).
 *
 * The address arrives proven: Allfit's own code confirmed the mailbox, so WorkOS takes it
 * as verified. Her other sessions close; the one she confirmed from stays.
 */

import { describe, expect, test } from 'bun:test'

import { createEmailChangeIdentity, createEmailChangeIdentityFromEnv } from './factory.js'

function fake(overrides: Record<string, unknown> = {}) {
  const calls: { method: string; args: unknown }[] = []
  const userManagement = {
    updateUser: async (options: unknown) => {
      calls.push({ method: 'updateUser', args: options })
      return {}
    },
    listSessions: async (userId: string) => {
      calls.push({ method: 'listSessions', args: userId })
      return { data: [{ id: 'session_kept' }, { id: 'session_other' }, { id: 'session_third' }] }
    },
    revokeSession: async (options: unknown) => {
      calls.push({ method: 'revokeSession', args: options })
    },
    ...overrides,
  }
  return { identity: createEmailChangeIdentity(userManagement), calls }
}

const failing = (status: number) => () =>
  Promise.reject(Object.assign(new Error('provider said no'), { status }))

describe('createEmailChangeIdentity', () => {
  test('changes the sign-in address as verified', async () => {
    const { identity, calls } = fake()

    await identity.updateEmail('user_camila', 'nueva@example.test')

    expect(calls).toEqual([
      {
        method: 'updateUser',
        args: { userId: 'user_camila', email: 'nueva@example.test', emailVerified: true },
      },
    ])
  })

  test('an address WorkOS refuses stays refused; an outage might pass', async () => {
    await expect(
      fake({ updateUser: failing(409) }).identity.updateEmail('u', 'x@example.test'),
    ).rejects.toMatchObject({ code: 'invalid_email', retryable: false })
    await expect(
      fake({ updateUser: failing(422) }).identity.updateEmail('u', 'x@example.test'),
    ).rejects.toMatchObject({ code: 'invalid_email' })
    await expect(
      fake({ updateUser: failing(503) }).identity.updateEmail('u', 'x@example.test'),
    ).rejects.toMatchObject({ code: 'provider_unavailable', retryable: true })
  })

  test('closes every other session and keeps the confirming one', async () => {
    const { identity, calls } = fake()

    await identity.revokeOtherSessions('user_camila', 'session_kept')

    expect(calls).toEqual([
      { method: 'listSessions', args: 'user_camila' },
      { method: 'revokeSession', args: { sessionId: 'session_other' } },
      { method: 'revokeSession', args: { sessionId: 'session_third' } },
    ])
  })

  test('a session already gone is not a failure', async () => {
    const { identity } = fake({ revokeSession: failing(404) })

    await expect(identity.revokeOtherSessions('user_camila', 'session_kept')).resolves.toBe(
      undefined,
    )
  })

  test('names the Space key it needs rather than failing vaguely', () => {
    expect(() => createEmailChangeIdentityFromEnv({})).toThrow('WORKOS_API_KEY_SPACE')
  })
})
