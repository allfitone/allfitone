/**
 * `/space/v1/consents`: what the caller shares with each gym, and taking one category
 * back (HU-SP-030, HU-SP-031). `/space/v1/executions/{id}/visibility` and
 * `/space/v1/visibility-denials`: hiding one session from one gym, sharing it again,
 * and what she hides (HU-SP-032, HU-SP-033, HU-SP-034).
 *
 * Both act as the caller and nobody else. Which rows come back, whose grant it is and
 * whether it can still be revoked are PostgreSQL's answers; this route checks the shape
 * of the request, carries the person through, and translates the refusal.
 *
 * The revocation has no body, so what makes it idempotent is hashed from the path: an
 * empty object would let one key replay across two different grants.
 */

import { createHash } from 'node:crypto'

import type { VerifiedToken } from '@allfitone/auth-provider'
import { Hono, type Context } from 'hono'

import { authProvider } from '../../../platform/auth/index.js'
import { fail } from '../../../platform/http/index.js'
import {
  SpaceActorError,
  spaceActorResolver,
  type SpaceActorResolver,
} from '../../identity/index.js'
import { myConsentService, sessionVisibilityService } from '../dependencies.js'
import type { MyConsentService, SessionVisibilityService } from '../application/index.js'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const UUID_V7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export type TokenVerifier = (token: string) => Promise<VerifiedToken>

export function spacePrivacyRoutes(
  injectedConsents?: MyConsentService,
  injectedVerifier?: TokenVerifier,
  injectedActors?: SpaceActorResolver,
  injectedVisibility?: SessionVisibilityService,
): Hono {
  const consents = () => injectedConsents ?? myConsentService()
  const visibility = () => injectedVisibility ?? sessionVisibilityService()
  const actors = () => injectedActors ?? spaceActorResolver()
  const verify: TokenVerifier =
    injectedVerifier ?? ((token) => authProvider().verifyAccessToken(token, 'space'))
  const routes = new Hono()

  // `OP-PRV-013`.
  routes.get('/consents', async (c) => {
    c.header('Cache-Control', 'private, no-store')

    const token = await verified(c, verify)
    if (!token) return fail(c, 'unauthenticated')

    try {
      const personId = await actors().personFor(token.subject)
      return c.json({ data: await consents().listMine(personId) })
    } catch (cause) {
      return failure(c, cause)
    }
  })

  // `OP-PRV-005`. Only that grant; a revoked one never comes back.
  routes.post('/consents/:grantId/revocation', async (c) => {
    c.header('Cache-Control', 'no-store')

    const grantId = c.req.param('grantId')
    if (!UUID.test(grantId)) return fail(c, 'invalid-request')
    const command = commandContext(c, { grantId })
    if (!command) return fail(c, 'invalid-request', 'valid command headers are required')

    const token = await verified(c, verify)
    if (!token) return fail(c, 'unauthenticated')

    try {
      const personId = await actors().personFor(token.subject)
      const result = await consents().revoke({ personId, grantId, ...command })
      if (result.replayed) c.header('Idempotent-Replay', 'true')
      return c.json({
        id: result.resource.grantId,
        status: result.resource.status,
        revoked_at: result.resource.revokedAt,
      })
    } catch (cause) {
      return failure(c, cause)
    }
  })

  // `OP-PRV-017`. Hers only; no gym ever reads a denial.
  routes.get('/visibility-denials', async (c) => {
    c.header('Cache-Control', 'private, no-store')

    const pagination = parsePagination(c)
    if (!pagination) return fail(c, 'invalid-request')

    const token = await verified(c, verify)
    if (!token) return fail(c, 'unauthenticated')

    try {
      const personId = await actors().personFor(token.subject)
      const page = await visibility().listMine({ personId, ...pagination })
      return c.json({
        data: page.items,
        page: {
          has_more: page.hasMore,
          next_cursor: page.nextCursor
            ? Buffer.from(JSON.stringify(page.nextCursor)).toString('base64url')
            : null,
        },
      })
    } catch (cause) {
      return failure(c, cause)
    }
  })

  // `OP-PRV-006`. The relationship travels in the body; the hash binds it to the key.
  routes.put('/executions/:executionId/visibility', async (c) => {
    c.header('Cache-Control', 'no-store')

    const executionId = c.req.param('executionId')
    if (!UUID.test(executionId)) return fail(c, 'invalid-request')
    let body: unknown
    try {
      body = await c.req.json()
    } catch {
      return fail(c, 'invalid-request')
    }
    const relationshipId = relationshipOf(body)
    if (!relationshipId) return fail(c, 'validation-failed', 'relationship_id is required')
    const command = commandContext(c, { operation: 'hide', executionId, relationshipId })
    if (!command) return fail(c, 'invalid-request', 'valid command headers are required')

    const token = await verified(c, verify)
    if (!token) return fail(c, 'unauthenticated')

    try {
      const personId = await actors().personFor(token.subject)
      const result = await visibility().hide({ personId, executionId, relationshipId, ...command })
      if (result.replayed) c.header('Idempotent-Replay', 'true')
      return c.json(result.resource)
    } catch (cause) {
      return failure(c, cause)
    }
  })

  // `OP-PRV-007`. Sharing again converges: an already shared session answers the same.
  routes.delete('/executions/:executionId/visibility/:relationshipId', async (c) => {
    c.header('Cache-Control', 'no-store')

    const executionId = c.req.param('executionId')
    const relationshipId = c.req.param('relationshipId')
    if (!UUID.test(executionId) || !UUID.test(relationshipId)) return fail(c, 'invalid-request')
    const command = commandContext(c, { operation: 'restore', executionId, relationshipId })
    if (!command) return fail(c, 'invalid-request', 'valid command headers are required')

    const token = await verified(c, verify)
    if (!token) return fail(c, 'unauthenticated')

    try {
      const personId = await actors().personFor(token.subject)
      const result = await visibility().restore({
        personId,
        executionId,
        relationshipId,
        ...command,
      })
      if (result.replayed) c.header('Idempotent-Replay', 'true')
      return c.json(result.resource)
    } catch (cause) {
      return failure(c, cause)
    }
  })

  return routes
}

function commandContext(c: Context, target: Record<string, string>) {
  const idempotencyKey = c.req.header('idempotency-key') ?? ''
  const commandId = c.req.header('command-id') ?? ''
  if (!UUID_V4.test(idempotencyKey) || !UUID_V7.test(commandId)) return undefined
  const canonical = Object.entries(target)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${JSON.stringify(key)}:${JSON.stringify(value)}`)
    .join(',')
  return {
    idempotencyKey,
    commandId,
    requestHash: createHash('sha256').update(`{${canonical}}`).digest(),
  }
}

function relationshipOf(body: unknown): string | undefined {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) return undefined
  const entries = Object.entries(body)
  if (entries.length !== 1) return undefined
  const [key, value] = entries[0] ?? []
  return key === 'relationship_id' && typeof value === 'string' && UUID.test(value)
    ? value
    : undefined
}

function parsePagination(c: Context) {
  const rawLimit = c.req.query('limit') ?? '25'
  if (!/^[1-9][0-9]*$/.test(rawLimit) || Number(rawLimit) > 100) return undefined
  const limit = Number(rawLimit)
  const rawCursor = c.req.query('cursor')
  if (!rawCursor) return { limit }
  try {
    const parsed: unknown = JSON.parse(Buffer.from(rawCursor, 'base64url').toString('utf8'))
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      !('deniedAt' in parsed) ||
      !('id' in parsed) ||
      typeof parsed.deniedAt !== 'string' ||
      Number.isNaN(Date.parse(parsed.deniedAt)) ||
      typeof parsed.id !== 'string' ||
      !UUID.test(parsed.id)
    ) {
      return undefined
    }
    return { limit, cursor: { deniedAt: parsed.deniedAt, id: parsed.id } }
  } catch {
    return undefined
  }
}

async function verified(c: Context, verify: TokenVerifier): Promise<VerifiedToken | undefined> {
  const [scheme, value] = (c.req.header('authorization') ?? '').split(' ')
  if (scheme?.toLowerCase() !== 'bearer' || !value) return undefined
  try {
    return await verify(value)
  } catch {
    return undefined
  }
}

function failure(c: Parameters<typeof fail>[0], error: unknown): Response {
  if (error instanceof SpaceActorError) return fail(c, error.code)
  const sqlState =
    typeof error === 'object' && error !== null && 'code' in error && typeof error.code === 'string'
      ? error.code
      : undefined
  if (sqlState === '42501') return fail(c, 'forbidden')
  // Somebody else's grant answers «not found»: whether it exists is not hers to learn.
  if (sqlState === 'P0002') return fail(c, 'not-found')
  // Already revoked is a state she can see by looking, not something to retry; a key
  // reused for another request is a conflict too.
  if (sqlState === 'P0004' || sqlState === '40001' || sqlState === '23505') {
    return fail(c, 'conflict')
  }
  if (sqlState === '22023' || sqlState === '22P02') return fail(c, 'validation-failed')
  console.error('[space-privacy] operation failed')
  return fail(c, 'upstream-unavailable')
}
