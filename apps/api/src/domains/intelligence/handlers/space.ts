/**
 * `/space/v1/intelligence/consent`: the person reads, gives and withdraws her AI consent
 * (`OP-ITL-001..003`; HU-SP-124 and HU-SP-125; ADR-053, decision 4).
 *
 * The token is verified and resolved to a person; nothing in a request can name whose
 * consent this is. Structure is checked here and answers 400; a version that is not the
 * text in force is 422, from the service or from PostgreSQL alike.
 *
 * The withdrawal has no body: its request hash covers the method and the path, as every
 * Space command's does, so it never hashes the same as giving the consent.
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
import {
  SpaceActorError,
  spaceActorResolver,
  type SpaceActorResolver,
} from '../../identity/index.js'
import type { SpaceIntelligenceService } from '../application/index.js'
import { spaceIntelligenceService } from '../dependencies.js'
import { ConsentTextNotInForce } from '../domain/index.js'

const OPERATION = 'space-intelligence-consent'
const CONSENT_VERSION = /^\d{4}-\d{2}-\d{2}$/

export function spaceIntelligenceRoutes(
  injectedService?: SpaceIntelligenceService,
  injectedVerifier?: TokenVerifier,
  injectedActors?: SpaceActorResolver,
): Hono {
  const intelligence = () => injectedService ?? spaceIntelligenceService()
  const actors = () => injectedActors ?? spaceActorResolver()
  const verify = injectedVerifier ?? spaceTokenVerifier()
  const routes = new Hono()

  // `OP-ITL-003`.
  routes.get('/intelligence/consent', async (c) => {
    c.header('Cache-Control', 'private, no-store')
    const token = await verifiedSpaceToken(c, verify)
    if (!token) return problem(c, 'unauthenticated')

    try {
      const personId = await actors().personFor(token.subject)
      return c.json(
        await intelligence().readConsent({
          personId,
          requestId: c.req.header('x-request-id') ?? '',
        }),
      )
    } catch (error) {
      return failure(c, error)
    }
  })

  // `OP-ITL-001`.
  routes.put('/intelligence/consent', async (c) => {
    c.header('Cache-Control', 'no-store')
    const token = await verifiedSpaceToken(c, verify)
    if (!token) return problem(c, 'unauthenticated')
    if (!isJsonRequest(c)) return problem(c, 'unsupported-media-type')

    const body = await readJson(c)
    const version = exactObject(body, ['version'])?.version
    const command = spaceCommand(c, body)
    if (typeof version !== 'string' || !CONSENT_VERSION.test(version) || !command) {
      return problem(c, 'invalid-request')
    }

    try {
      const personId = await actors().personFor(token.subject)
      return c.json(await intelligence().giveConsent({ personId, version, ...command }))
    } catch (error) {
      return failure(c, error)
    }
  })

  // `OP-ITL-002`.
  routes.post('/intelligence/consent/withdrawal', async (c) => {
    c.header('Cache-Control', 'no-store')
    const token = await verifiedSpaceToken(c, verify)
    if (!token) return problem(c, 'unauthenticated')

    const command = spaceCommand(c, {})
    if (!command) return problem(c, 'invalid-request')

    try {
      const personId = await actors().personFor(token.subject)
      return c.json(await intelligence().withdrawConsent({ personId, ...command }))
    } catch (error) {
      return failure(c, error)
    }
  })

  return routes
}

function failure(c: Context, error: unknown): Response {
  if (error instanceof SpaceActorError) return problem(c, 'registration-incomplete')
  if (error instanceof ConsentTextNotInForce) {
    return problem(c, 'validation-failed', 'This consent text is not the one in force')
  }
  return spaceFailure(c, error, OPERATION)
}
