/**
 * What Allfit asks WorkOS when a person changes her password (TECH-325, `OP-IDN-066`,
 * ADR-051).
 *
 * WorkOS has no call that only checks a password: signing in is the check, and it opens a
 * session, which the caller must be able to close. The new password is set on the person;
 * a refusal of it is the one failure worth describing. The worker then closes every other
 * session and keeps the one the change came from.
 */

import { describe, expect, test } from 'bun:test'

import { createPasswordChangeIdentity, createPasswordChangeIdentityFromEnv } from './factory.js'

const token = (claims: Record<string, unknown>) =>
  ['header', Buffer.from(JSON.stringify(claims)).toString('base64url'), 'signature'].join('.')

function fake(overrides: Record<string, unknown> = {}) {
  const calls: { method: string; args: unknown }[] = []
  const userManagement = {
    authenticateWithPassword: async (options: unknown) => {
      calls.push({ method: 'authenticateWithPassword', args: options })
      return {
        accessToken: token({ sub: 'user_camila', sid: 'session_check' }),
        refreshToken: 'refresh',
        user: {
          id: 'user_camila',
          email: 'camila@example.test',
          emailVerified: true,
          firstName: null,
          lastName: null,
        },
      }
    },
    updateUser: async (options: unknown) => {
      calls.push({ method: 'updateUser', args: options })
      return {}
    },
    listSessions: async (userId: string) => {
      calls.push({ method: 'listSessions', args: userId })
      return { data: [{ id: 'session_phone' }, { id: 'session_check' }, { id: 'session_web' }] }
    },
    revokeSession: async (options: unknown) => {
      calls.push({ method: 'revokeSession', args: options })
    },
    ...overrides,
  }
  return { identity: createPasswordChangeIdentity(userManagement, 'client_space'), calls }
}

const failing =
  (status: number, extra: Record<string, unknown> = {}) =>
  () =>
    Promise.reject(Object.assign(new Error('provider said no'), { status, ...extra }))

describe('createPasswordChangeIdentity', () => {
  test('checks the current password by signing in under Space, and names that session', async () => {
    const { identity, calls } = fake()

    await expect(identity.checkPassword('camila@example.test', 'Actual-2026')).resolves.toEqual({
      sessionId: 'session_check',
    })
    expect(calls).toEqual([
      {
        method: 'authenticateWithPassword',
        args: { email: 'camila@example.test', password: 'Actual-2026', clientId: 'client_space' },
      },
    ])
  })

  test('a wrong current password is invalid credentials; an outage might pass', async () => {
    await expect(
      fake({
        authenticateWithPassword: failing(400, { code: 'invalid_credentials' }),
      }).identity.checkPassword('c@example.test', 'x'),
    ).rejects.toMatchObject({ code: 'invalid_credentials', retryable: false })
    await expect(
      fake({ authenticateWithPassword: failing(401) }).identity.checkPassword(
        'c@example.test',
        'x',
      ),
    ).rejects.toMatchObject({ code: 'invalid_credentials' })
    await expect(
      fake({ authenticateWithPassword: failing(429) }).identity.checkPassword(
        'c@example.test',
        'x',
      ),
    ).rejects.toMatchObject({ code: 'provider_unavailable', retryable: true })
    await expect(
      fake({ authenticateWithPassword: failing(503) }).identity.checkPassword(
        'c@example.test',
        'x',
      ),
    ).rejects.toMatchObject({ code: 'provider_unavailable' })
  })

  test('a sign-in without a session is not taken as a check', async () => {
    const { identity } = fake({
      authenticateWithPassword: async () => ({
        accessToken: token({ sub: 'user_camila' }),
        refreshToken: 'refresh',
        user: { id: 'u', email: 'e', emailVerified: true, firstName: null, lastName: null },
      }),
    })

    await expect(identity.checkPassword('c@example.test', 'x')).rejects.toMatchObject({
      code: 'provider_unavailable',
    })
  })

  test('sets the new password on the person and nothing else', async () => {
    const { identity, calls } = fake()

    await identity.setPassword('user_camila', 'Nueva-Clave-2026')

    expect(calls).toEqual([
      { method: 'updateUser', args: { userId: 'user_camila', password: 'Nueva-Clave-2026' } },
    ])
  })

  test('a password WorkOS refuses is weak; an outage might pass', async () => {
    await expect(
      fake({ updateUser: failing(400, { code: 'password_strength_error' }) }).identity.setPassword(
        'u',
        'password',
      ),
    ).rejects.toMatchObject({ code: 'weak_password', retryable: false })
    await expect(
      fake({ updateUser: failing(500) }).identity.setPassword('u', 'Nueva-Clave-2026'),
    ).rejects.toMatchObject({ code: 'provider_unavailable' })
  })

  test('no failure carries what was typed', async () => {
    const error: unknown = await fake({ updateUser: failing(400) })
      .identity.setPassword('u', 'Secreta-2026')
      .catch((caught: unknown) => caught)

    expect(JSON.stringify(error)).not.toContain('Secreta-2026')
    expect(String(error)).not.toContain('Secreta-2026')
  })

  test('closes the session the check opened', async () => {
    const { identity, calls } = fake()

    await identity.revokeSession('session_check')

    expect(calls).toEqual([{ method: 'revokeSession', args: { sessionId: 'session_check' } }])
  })

  test('closes every other session and keeps the one the change came from', async () => {
    const { identity, calls } = fake()

    await identity.revokeOtherSessions('user_camila', 'session_phone')

    expect(calls).toEqual([
      { method: 'listSessions', args: 'user_camila' },
      { method: 'revokeSession', args: { sessionId: 'session_check' } },
      { method: 'revokeSession', args: { sessionId: 'session_web' } },
    ])
  })

  test('a session already gone is not a failure', async () => {
    const { identity } = fake({ revokeSession: failing(404) })

    await expect(identity.revokeSession('session_check')).resolves.toBe(undefined)
    await expect(identity.revokeOtherSessions('user_camila', 'session_phone')).resolves.toBe(
      undefined,
    )
  })

  test('names the Space credential it needs rather than failing vaguely', () => {
    expect(() => createPasswordChangeIdentityFromEnv({ WORKOS_API_KEY_SPACE: 'sk_test' })).toThrow(
      'WORKOS_CLIENT_ID_SPACE',
    )
  })
})
