/**
 * Changing my password on /space/v1: `OP-IDN-066`, `HU-SP-005`, ADR-051.
 *
 * Kept apart from the rest of the own profile because it is the one command that speaks to
 * WorkOS inside the request, and its body is two secrets. Neither reaches a log, an error
 * detail or the idempotency receipt: the request hash is taken over the method and path
 * only, so a stored hash can never be cracked back into a password.
 */

import { Hono, type Context } from 'hono'

import { problem } from '../../../platform/http/index.js'
import {
  exactObject,
  isJsonRequest,
  readJson,
  spaceCommand,
  spaceFailure,
  spaceTokenVerifier,
  verifiedSpaceToken,
  type TokenVerifier,
} from '../../../platform/http/space-requests.js'
import { PasswordChangeError, type PasswordChangeService } from '../application/password-change.js'
import { spacePasswordChangeService } from '../dependencies.js'
import { MAX_PASSWORD_LENGTH, PASSWORD_POLICY } from '../domain/password-change.js'

const OPERATION = 'space-password-change'
// The window of the limit: five wrong ones in an hour.
const RETRY_AFTER_SECONDS = '3600'

export function spacePasswordRoutes(
  injectedService?: PasswordChangeService,
  injectedVerifier?: TokenVerifier,
): Hono {
  const changing = () => injectedService ?? spacePasswordChangeService()
  const verify = injectedVerifier ?? spaceTokenVerifier()
  const routes = new Hono()

  routes.use('*', async (c, next) => {
    await next()
    c.header('Cache-Control', 'no-store')
  })

  routes.post('/me/password', async (c) => {
    const token = await verifiedSpaceToken(c, verify)
    if (!token) return problem(c, 'unauthenticated')
    if (!isJsonRequest(c)) return problem(c, 'unsupported-media-type')
    const passwords = ownPasswords(await readJson(c))
    if (!passwords) return problem(c, 'validation-failed')
    const command = spaceCommand(c, {})
    if (!command) return problem(c, 'invalid-request')

    try {
      const { replayed } = await changing().changePassword(token, { ...command, ...passwords })
      if (replayed) c.header('Idempotent-Replay', 'true')
      return c.body(null, 204)
    } catch (error) {
      return answer(c, error)
    }
  })

  return routes
}

function answer(c: Context, error: unknown) {
  if (!(error instanceof PasswordChangeError)) return spaceFailure(c, error, OPERATION)
  if (error.code === 'rate-limited') c.header('Retry-After', RETRY_AFTER_SECONDS)
  return problem(c, error.code)
}

function ownPasswords(body: unknown): { currentPassword: string; newPassword: string } | undefined {
  const fields = exactObject(body, ['current_password', 'new_password'])
  if (!fields) return undefined
  const { current_password: current, new_password: next } = fields
  if (typeof current !== 'string' || current === '' || current.length > MAX_PASSWORD_LENGTH) {
    return undefined
  }
  if (typeof next !== 'string' || !PASSWORD_POLICY.test(next)) return undefined
  return { currentPassword: current, newPassword: next }
}
