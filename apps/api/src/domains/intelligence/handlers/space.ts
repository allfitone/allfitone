/**
 * `/space/v1/intelligence`: the person's AI consent and her weekly summaries
 * (`OP-ITL-001..006`; HU-SP-124 to HU-SP-127; ADR-053).
 *
 * The token is verified and resolved to a person; nothing in a request can name whose
 * consent or whose week this is. Structure is checked here and answers 400; a version
 * that is not the text in force, or a week she may not ask about, is 422, from the
 * service or from PostgreSQL alike.
 *
 * The withdrawal and the deletion have no body: their request hash covers the method and
 * the path, as every Space command's does, so two commands never hash the same.
 *
 * **A summary that cannot be given is 503 and says nothing else.** Which rule a refused
 * answer broke is logged as a closed value for whoever operates this; what the model
 * wrote is never logged and never reaches her.
 */

import { LANGUAGES, type Language } from '@allfitone/weekly-summary'
import { Hono, type Context } from 'hono'

import { problem } from '../../../platform/http/index.js'
import {
  exactObject,
  isCalendarDate,
  isJsonRequest,
  onlyQueryKeys,
  pageSize,
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
import {
  ConsentRequired,
  ConsentTextNotInForce,
  SummaryCeilingReached,
  SummaryDisposed,
  SummaryUnavailable,
} from '../domain/index.js'

const OPERATION = 'space-intelligence'
const CONSENT_VERSION = /^\d{4}-\d{2}-\d{2}$/
const IANA_TIME_ZONE = /^(?:UTC|[A-Za-z_]+(?:\/[A-Za-z0-9_+-]+)+)$/
const MAX_TIME_ZONE = 100
const SUMMARY_PAGE = { default: 20, maximum: 50 }
const SUMMARY_QUERY = new Set(['limit', 'cursor'])

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

  // `OP-ITL-005`.
  routes.get('/intelligence/weekly-summaries', async (c) => {
    c.header('Cache-Control', 'private, no-store')
    const token = await verifiedSpaceToken(c, verify)
    if (!token) return problem(c, 'unauthenticated')

    const limit = pageSize(c.req.query('limit'), SUMMARY_PAGE.maximum, SUMMARY_PAGE.default)
    const before = weekBefore(c.req.query('cursor'))
    if (!onlyQueryKeys(c, SUMMARY_QUERY) || limit === undefined || before === undefined) {
      return problem(c, 'invalid-request')
    }

    try {
      const personId = await actors().personFor(token.subject)
      const page = await intelligence().listWeeklySummaries({
        personId,
        before,
        limit,
        requestId: c.req.header('x-request-id') ?? '',
      })
      return c.json({
        data: page.data,
        page: { next_cursor: cursorBefore(page.nextBefore), has_more: page.nextBefore !== null },
      })
    } catch (error) {
      return failure(c, error)
    }
  })

  // `OP-ITL-004`.
  routes.post('/intelligence/weekly-summaries', async (c) => {
    c.header('Cache-Control', 'no-store')
    const token = await verifiedSpaceToken(c, verify)
    if (!token) return problem(c, 'unauthenticated')
    if (!isJsonRequest(c)) return problem(c, 'unsupported-media-type')

    const body = await readJson(c)
    const asked = summaryRequest(body)
    const command = spaceCommand(c, body)
    if (!asked || !command) return problem(c, 'invalid-request')

    try {
      const personId = await actors().personFor(token.subject)
      return c.json(await intelligence().requestWeeklySummary({ personId, ...asked, ...command }))
    } catch (error) {
      return failure(c, error)
    }
  })

  // `OP-ITL-006`.
  routes.delete('/intelligence/weekly-summaries/:weekStartsOn', async (c) => {
    c.header('Cache-Control', 'no-store')
    const token = await verifiedSpaceToken(c, verify)
    if (!token) return problem(c, 'unauthenticated')

    const weekStartsOn = c.req.param('weekStartsOn')
    const command = spaceCommand(c, {})
    if (!isCalendarDate(weekStartsOn) || !command) return problem(c, 'invalid-request')

    try {
      const personId = await actors().personFor(token.subject)
      await intelligence().deleteWeeklySummary({ personId, weekStartsOn, ...command })
      return c.body(null, 204)
    } catch (error) {
      return failure(c, error)
    }
  })

  return routes
}

/** The body of a request for a summary, or undefined when it is not one. */
function summaryRequest(
  body: unknown,
): { weekStartsOn: string; timezone: string; language: Language } | undefined {
  const fields = exactObject(body, ['week_starts_on', 'timezone', 'language'])
  if (!fields) return undefined
  const { week_starts_on: weekStartsOn, timezone, language } = fields
  if (typeof weekStartsOn !== 'string' || !isCalendarDate(weekStartsOn)) return undefined
  if (typeof timezone !== 'string' || timezone.length > MAX_TIME_ZONE) return undefined
  if (!IANA_TIME_ZONE.test(timezone)) return undefined
  const known = LANGUAGES.find((one) => one === language)
  return known ? { weekStartsOn, timezone, language: known } : undefined
}

/** The cursor is opaque to the device: the week the next page starts before. */
function cursorBefore(week: string | null): string | null {
  return week === null
    ? null
    : Buffer.from(JSON.stringify({ before: week }), 'utf8').toString('base64url')
}

/** Null without a cursor; undefined when the cursor is not one of ours. */
function weekBefore(cursor: string | undefined): string | null | undefined {
  if (cursor === undefined) return null
  try {
    const parsed: unknown = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'))
    const before = exactObject(parsed, ['before'])?.before
    return typeof before === 'string' && isCalendarDate(before) ? before : undefined
  } catch {
    return undefined
  }
}

function failure(c: Context, error: unknown): Response {
  if (error instanceof SpaceActorError) return problem(c, 'registration-incomplete')
  if (error instanceof ConsentTextNotInForce) {
    return problem(c, 'validation-failed', 'This consent text is not the one in force')
  }
  if (error instanceof ConsentRequired) return problem(c, 'consent-required')
  if (error instanceof SummaryCeilingReached) {
    return problem(c, 'rate-limited', undefined, { renews_at: error.renewsAt })
  }
  if (error instanceof SummaryDisposed) return problem(c, 'command-effect-disposed')
  if (error instanceof SummaryUnavailable) {
    console.warn('[space-intelligence] weekly summary unavailable', { reason: error.reason })
    return problem(c, 'upstream-unavailable')
  }
  return spaceFailure(c, error, OPERATION)
}
