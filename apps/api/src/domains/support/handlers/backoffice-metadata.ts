/**
 * Backoffice support metadata routes: `OP-SUP-005` and `NEW-SUP-ATTENTION`.
 *
 * `HU-BO-006` finds a person by part of a name, an email or a phone, and
 * `HU-BO-007` opens their operational state with her name and contact (ADR-046).
 * The handler shapes and rejects; it never decides access. The admin role and
 * AAL2 are resolved inside the read's own transaction, and the access record is
 * written there too — if the record fails, the read fails.
 *
 * The case reference is optional on every support read (ADR-046 decision 5), but
 * one given in free text is refused: a reference nobody can follow back to a case
 * is worse than none, because it looks traceable.
 *
 * The attention panel (`HU-BO-005`) and the business panel (`HU-BO-004`) live here
 * because they are support reads with no subject, like the diagnosis feed. Which of
 * their figures an operator sees is decided by their duties in PostgreSQL, never by
 * this handler.
 */

import { randomUUID } from 'node:crypto'
import { Hono, type Context } from 'hono'
import { getCookie } from 'hono/cookie'
import { cors } from 'hono/cors'

import {
  BACKOFFICE_SESSION_COOKIE,
  BackofficeAuthenticationError,
  backofficeAuthenticationService,
  trustedBackofficeWebUrl,
  type BackofficeAuthenticationService,
} from '../../identity/index.js'
import { problem, type ApiErrorCode } from '../../../platform/http/index.js'
import type {
  SupportAttentionService,
  SupportBusinessService,
  SupportDiagnosisService,
  SupportMetadataService,
} from '../application/index.js'
import {
  supportAttentionService,
  supportBusinessService,
  supportDiagnosisService,
  supportMetadataService,
} from '../dependencies.js'
import {
  SUPPORT_CASE_REFERENCE,
  SUPPORT_OPERATION_SOURCES,
  SUPPORT_OPERATION_STATES,
  type SupportOperationCursor,
  type SupportOperationSourceKind,
  type SupportOperationState,
} from '../domain/index.js'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const MAX_PAGE = 100
const SEARCH_PAGE = 25
const SEARCH_QUERY = { min: 2, max: 100 }
const SEARCH_PARAMETERS = new Set(['q', 'case_reference', 'limit'])

export function backofficeSupportMetadataRoutes(
  injectedMetadata?: SupportMetadataService,
  injectedSessions?: BackofficeAuthenticationService,
  injectedDiagnosis?: SupportDiagnosisService,
  injectedAttention?: SupportAttentionService,
  injectedBusiness?: SupportBusinessService,
): Hono {
  const origin = new URL(trustedBackofficeWebUrl()).origin
  const metadata = () => injectedMetadata ?? supportMetadataService()
  const diagnosis = () => injectedDiagnosis ?? supportDiagnosisService()
  const attention = () => injectedAttention ?? supportAttentionService()
  const business = () => injectedBusiness ?? supportBusinessService()
  const sessions = () => injectedSessions ?? backofficeAuthenticationService()
  const routes = new Hono()

  routes.use(
    '*',
    cors({
      origin,
      credentials: true,
      allowMethods: ['GET', 'OPTIONS'],
      allowHeaders: ['Content-Type'],
      exposeHeaders: ['Server-Timing'],
      maxAge: 600,
    }),
  )
  routes.use('*', async (c, next) => {
    await next()
    c.header('Cache-Control', 'no-store')
    c.header('Referrer-Policy', 'no-referrer')
  })

  routes.get('/support/people', async (c) => {
    const search = peopleSearch(c)
    if (!search) {
      return problem(
        c,
        'invalid-request',
        'search with two to 100 characters and a page of 1 to 25',
      )
    }
    const caseReference = optionalCaseReference(c)
    if (caseReference === undefined) return untraceableCase(c)

    try {
      const actor = await backofficeActor(c, sessions())
      if (actor instanceof Response) return actor
      return c.json(
        await metadata().search(
          { actorPersonId: actor.personId, actorSessionId: actor.sessionId },
          { requestId: randomUUID(), caseReference, ...search },
        ),
      )
    } catch (error) {
      return operationFailure(c, error)
    }
  })

  routes.get('/support/people/:personId', async (c) => {
    const personId = c.req.param('personId')
    if (!UUID.test(personId)) return problem(c, 'invalid-request')
    const caseReference = optionalCaseReference(c)
    if (caseReference === undefined) return untraceableCase(c)

    try {
      const actor = await backofficeActor(c, sessions())
      if (actor instanceof Response) return actor
      return c.json(
        await metadata().read(
          { actorPersonId: actor.personId, actorSessionId: actor.sessionId },
          { requestId: randomUUID(), caseReference, personId },
        ),
      )
    } catch (error) {
      return operationFailure(c, error)
    }
  })

  // Its own route and its own duty: `view_billing_metadata` opens this and the
  // support duty does not, so a card that embedded it would hand one duty what the
  // other was given. The screen asks for it separately for the same reason.
  routes.get('/support/people/:personId/payments', async (c) => {
    const personId = c.req.param('personId')
    if (!UUID.test(personId)) return problem(c, 'invalid-request')
    const caseReference = optionalCaseReference(c)
    if (caseReference === undefined) return untraceableCase(c)

    try {
      const actor = await backofficeActor(c, sessions())
      if (actor instanceof Response) return actor
      return c.json(
        await metadata().payments(
          { actorPersonId: actor.personId, actorSessionId: actor.sessionId },
          { requestId: randomUUID(), caseReference, personId },
        ),
      )
    } catch (error) {
      return operationFailure(c, error)
    }
  })

  // The list the attention panel's billing count stands for. It names payers, so it
  // takes a case like a person's payments and never a filter beyond its page.
  routes.get('/support/billing-follow-up', async (c) => {
    const query = c.req.query()
    if (Object.keys(query).some((key) => key !== 'case_reference' && key !== 'limit')) {
      return problem(c, 'invalid-request')
    }
    const caseReference = optionalCaseReference(c)
    if (caseReference === undefined) return untraceableCase(c)
    const limit = query.limit === undefined ? 50 : Number(query.limit)
    if (!/^[0-9]{1,3}$/.test(query.limit ?? '50') || limit < 1 || limit > 200) {
      return problem(c, 'invalid-request')
    }

    try {
      const actor = await backofficeActor(c, sessions())
      if (actor instanceof Response) return actor
      return c.json(
        await metadata().billingFollowUp(
          { actorPersonId: actor.personId, actorSessionId: actor.sessionId },
          { requestId: randomUUID(), caseReference, limit },
        ),
      )
    } catch (error) {
      return operationFailure(c, error)
    }
  })

  // No case reference on the two diagnosis routes, not even an optional one: this
  // feed has no subject, so there is nothing to trace back to a case.
  routes.get('/support/operations', async (c) => {
    const filters = operationFilters(c)
    if (!filters) return problem(c, 'invalid-request')

    try {
      const actor = await backofficeActor(c, sessions())
      if (actor instanceof Response) return actor
      const found = await diagnosis().listOperations(
        { actorPersonId: actor.personId, actorSessionId: actor.sessionId },
        { requestId: randomUUID(), ...filters },
      )
      return c.json({
        data: found.items,
        page: { has_more: found.hasMore, next_cursor: found.nextCursor ?? null },
      })
    } catch (error) {
      return operationFailure(c, error)
    }
  })

  // HU-BO-031 c2: when each scheduled job last ran. No subject, so no case.
  routes.get('/support/job-health', async (c) => {
    if (Object.keys(c.req.query()).length > 0) return problem(c, 'invalid-request')
    try {
      const actor = await backofficeActor(c, sessions())
      if (actor instanceof Response) return actor
      return c.json(
        await diagnosis().jobHealth(
          { actorPersonId: actor.personId, actorSessionId: actor.sessionId },
          { requestId: randomUUID() },
        ),
      )
    } catch (error) {
      return operationFailure(c, error)
    }
  })

  routes.get('/support/delivery-circuits', async (c) => {
    try {
      const actor = await backofficeActor(c, sessions())
      if (actor instanceof Response) return actor
      return c.json({
        items: await diagnosis().listDeliveryCircuits(
          { actorPersonId: actor.personId, actorSessionId: actor.sessionId },
          { requestId: randomUUID() },
        ),
      })
    } catch (error) {
      return operationFailure(c, error)
    }
  })

  // Counters with no subject, so no case reference either.
  routes.get('/support/attention', async (c) => {
    try {
      const actor = await backofficeActor(c, sessions())
      if (actor instanceof Response) return actor
      return c.json(
        await attention().read(
          { actorPersonId: actor.personId, actorSessionId: actor.sessionId },
          { requestId: randomUUID() },
        ),
      )
    } catch (error) {
      return operationFailure(c, error)
    }
  })

  // Counts of everybody, so nobody in particular: no case reference either.
  routes.get('/support/business', async (c) => {
    try {
      const actor = await backofficeActor(c, sessions())
      if (actor instanceof Response) return actor
      return c.json(
        await business().read(
          { actorPersonId: actor.personId, actorSessionId: actor.sessionId },
          { requestId: randomUUID() },
        ),
      )
    } catch (error) {
      return operationFailure(c, error)
    }
  })

  return routes
}

/**
 * Every filter comes from a closed vocabulary and the cursor is this handler's
 * own, so a forged one is refused here rather than becoming a strange query.
 */
function operationFilters(c: Context) {
  const limit = Number(c.req.query('limit') ?? 25)
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_PAGE) return undefined

  const source = c.req.query('source')
  if (
    source !== undefined &&
    !SUPPORT_OPERATION_SOURCES.includes(source as SupportOperationSourceKind)
  ) {
    return undefined
  }
  const state = c.req.query('state')
  if (state !== undefined && !SUPPORT_OPERATION_STATES.includes(state as SupportOperationState)) {
    return undefined
  }
  const aggregateId = c.req.query('aggregate_id')
  if (aggregateId !== undefined && !UUID.test(aggregateId)) return undefined

  const encoded = c.req.query('cursor')
  let cursor: SupportOperationCursor | undefined
  if (encoded !== undefined) {
    cursor = decodeCursor(encoded)
    if (!cursor) return undefined
  }

  return {
    limit,
    ...(source === undefined ? {} : { source: source as SupportOperationSourceKind }),
    ...(state === undefined ? {} : { state: state as SupportOperationState }),
    ...(aggregateId === undefined ? {} : { aggregateId }),
    ...(cursor === undefined ? {} : { cursor }),
  }
}

function decodeCursor(encoded: string): SupportOperationCursor | undefined {
  try {
    const parsed: unknown = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'))
    if (typeof parsed !== 'object' || parsed === null) return undefined
    const { occurredAt, id } = parsed as Record<string, unknown>
    if (typeof occurredAt !== 'string' || Number.isNaN(Date.parse(occurredAt))) return undefined
    if (typeof id !== 'string' || !UUID.test(id)) return undefined
    return { occurredAt, id }
  } catch {
    return undefined
  }
}

/**
 * The term and its page, refused here so a malformed search never becomes a
 * recorded query. The old exact lookups (`email`, `phone`, `identifier`) are
 * refused rather than ignored, so a stale client fails loudly instead of listing.
 */
function peopleSearch(c: Context): { query: string; limit: number } | undefined {
  const parameters = c.req.query()
  if (Object.keys(parameters).some((key) => !SEARCH_PARAMETERS.has(key))) return undefined
  const query = (parameters.q ?? '').trim()
  if (query.length < SEARCH_QUERY.min || query.length > SEARCH_QUERY.max) return undefined
  if (parameters.limit !== undefined && !/^[0-9]{1,2}$/.test(parameters.limit)) return undefined
  const limit = parameters.limit === undefined ? SEARCH_PAGE : Number(parameters.limit)
  if (limit < 1 || limit > SEARCH_PAGE) return undefined
  return { query, limit }
}

/** Null when no case was given; undefined when one was given and is not traceable. */
function optionalCaseReference(c: Context): string | null | undefined {
  const caseReference = c.req.query('case_reference')
  if (caseReference === undefined) return null
  return SUPPORT_CASE_REFERENCE.test(caseReference) ? caseReference : undefined
}

function untraceableCase(c: Context) {
  return problem(c, 'invalid-request', 'a case reference is a traceable code, never free text')
}

async function backofficeActor(c: Context, sessions: BackofficeAuthenticationService) {
  const token = getCookie(c, BACKOFFICE_SESSION_COOKIE)
  if (!token) return problem(c, 'unauthenticated', 'missing session cookie')
  try {
    return await sessions.resolveActor(token)
  } catch (error) {
    if (error instanceof BackofficeAuthenticationError) return problem(c, error.code)
    throw error
  }
}

function operationFailure(c: Context, error: unknown) {
  if (error instanceof BackofficeAuthenticationError) return problem(c, error.code)
  const code = databaseErrorCode(error)
  if (code) return problem(c, code)
  console.error('[backoffice-support] operation failed')
  return problem(c, 'upstream-unavailable')
}

function databaseErrorCode(error: unknown): ApiErrorCode | undefined {
  if (typeof error !== 'object' || error === null) return undefined
  const sqlState = 'code' in error && typeof error.code === 'string' ? error.code : undefined
  if (sqlState === 'P0002') return 'not-found'
  if (sqlState === '42501') return 'forbidden'
  if (sqlState === '22023' || sqlState === '22P02') return 'invalid-request'
  // The case reference CHECK is the database having the last word on a shape the
  // handler already refused: reaching it means the two drifted.
  if (sqlState === '23514') return 'validation-failed'
  return undefined
}
