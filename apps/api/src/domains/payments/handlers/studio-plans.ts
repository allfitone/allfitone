/**
 * `/studio/v1/organizations/{organizationId}/plans`: what a gym sells and at what price
 * (`OP-PAY-002..006`, `HU-STUDIO-074..077`).
 *
 * **The whole team reads; `manage_billing` writes.** A price is nobody's personal data,
 * so a coach sees the plans too, and a refusal to change one is a 403 rather than the 404
 * the subscription routes answer: there is nothing here the team may not know exists.
 *
 * A body carries exactly its declared fields. A field this file does not know is refused,
 * not ignored, so a client that believes it set `status` learns that it did not. The hash
 * covers method, path and the normalised body, so one key never serves two commands.
 */

import type { Context, Hono } from 'hono'

import type { StudioSessionService } from '../../identity/index.js'
import { fail } from '../../../platform/http/index.js'
import type { OrganizationPlanService } from '../application/organization-plans.js'
import { MAX_AMOUNT_MINOR, MAX_PLAN_NAME } from '../domain/index.js'
import {
  ORGANIZATION_PLAN_STATUSES,
  PLAN_AMOUNT_STEP,
  PLAN_BILLING_PERIODS,
  PLAN_CURRENCY,
  PLAN_DELIVERY_MODES,
  type OrganizationPlanCursor,
  type OrganizationPlanResult,
  type OrganizationPlanStatus,
  type PlanBillingPeriod,
  type PlanDeliveryMode,
  type StudioPlanVersionPublish,
} from '../domain/organization-plans.js'
import {
  UUID,
  actingPerson,
  commandContext,
  isObject,
  parseLimit,
  studioFailure,
} from './studio-requests.js'

export interface StudioPlanRouteDependencies {
  readonly studioOrigin: string
  readonly plans: () => OrganizationPlanService
  readonly sessions: () => StudioSessionService
}

export function registerStudioPlanRoutes(routes: Hono, dependencies: StudioPlanRouteDependencies) {
  const { studioOrigin, plans, sessions } = dependencies
  const requestId = (c: Context) => c.req.header('x-request-id') ?? ''

  /* OP-PAY-006. On sale first, then by name; drafts included, because the team made them. */
  routes.get('/organizations/:organizationId/plans', async (c) => {
    c.header('Cache-Control', 'private, no-store')
    if (c.req.header('origin') !== studioOrigin) {
      return fail(c, 'forbidden', 'origin is not allowed')
    }
    const organizationId = c.req.param('organizationId')
    if (!UUID.test(organizationId)) return fail(c, 'invalid-request')

    const limit = parseLimit(c.req.query('limit'))
    if (!limit) return fail(c, 'validation-failed')
    const cursor = parsePlanCursor(c.req.query('cursor'))
    if (cursor === null) return fail(c, 'validation-failed')

    try {
      const personId = await actingPerson(c, sessions())
      if (personId instanceof Response) return personId
      const page = await plans().list(personId, {
        organizationId,
        limit,
        requestId: requestId(c),
        ...(cursor ?? {}),
      })
      const last = page.items.at(-1)
      return c.json({
        data: page.items,
        page: {
          has_more: page.hasMore,
          next_cursor:
            page.hasMore && last ? encodePlanCursor([last.status, last.name, last.plan_id]) : null,
        },
      })
    } catch (error) {
      return studioFailure(c, error)
    }
  })

  /* OP-PAY-002. A draft with a name and no price, which nobody can buy yet. */
  routes.post('/organizations/:organizationId/plans', async (c) => {
    const request = await planRequest(c, { body: true })
    if (request instanceof Response) return request
    const name = planName(request.body)
    if (!name) return fail(c, 'validation-failed')
    return answer(c, request, { name }, 201, (personId, command) =>
      plans().create(personId, { ...command, name }),
    )
  })

  /* OP-PAY-003. On sale or not; whoever pays for the plan reads the new name. */
  routes.patch('/organizations/:organizationId/plans/:planId', async (c) => {
    const request = await planRequest(c, { body: true, planId: true })
    if (request instanceof Response) return request
    const name = planName(request.body)
    if (!name) return fail(c, 'validation-failed')
    return answer(c, request, { name }, 200, (personId, command) =>
      plans().rename(personId, { ...command, planId: request.planId, name }),
    )
  })

  /*
   * OP-PAY-004. Retires the price on sale in the same command. A new version is 201; the
   * price already on sale converges with 200, and a replay repeats whichever it was.
   */
  routes.post('/organizations/:organizationId/plans/:planId/versions', async (c) => {
    const request = await planRequest(c, { body: true, planId: true })
    if (request instanceof Response) return request
    const version = planVersion(request.body)
    if (!version) return fail(c, 'validation-failed')
    const command = commandFor(c, request, version)
    if (!command) return fail(c, 'invalid-request', 'valid command headers are required')
    try {
      const personId = await actingPerson(c, sessions())
      if (personId instanceof Response) return personId
      const result = await plans().publish(personId, {
        ...command,
        planId: request.planId,
        version,
      })
      if (result.replayed) c.header('Idempotent-Replay', 'true')
      return c.json(result.resource, result.created ? 201 : 200)
    } catch (error) {
      return studioFailure(c, error)
    }
  })

  /* OP-PAY-005. Stops new sales of this version and touches nobody who already pays it. */
  routes.post(
    '/organizations/:organizationId/plans/:planId/versions/:planVersionId/deprecation',
    async (c) => {
      const request = await planRequest(c, { planId: true })
      if (request instanceof Response) return request
      const planVersionId = c.req.param('planVersionId')
      if (!UUID.test(planVersionId)) return fail(c, 'invalid-request')
      return answer(c, request, { plan_version_id: planVersionId }, 200, (personId, command) =>
        plans().deprecate(personId, { ...command, planId: request.planId, planVersionId }),
      )
    },
  )

  type PlanRequest = { organizationId: string; planId: string; body: Record<string, unknown> }

  /**
   * Origin, path ids and body, in the order the contract answers them: 403, 400, 415,
   * 422. The session is resolved last, so a malformed request costs no session lookup.
   */
  async function planRequest(
    c: Context,
    expects: { body?: boolean; planId?: boolean },
  ): Promise<PlanRequest | Response> {
    c.header('Cache-Control', 'no-store')
    if (c.req.header('origin') !== studioOrigin) {
      return fail(c, 'forbidden', 'origin is not allowed')
    }
    const organizationId = c.req.param('organizationId') ?? ''
    const planId = expects.planId ? (c.req.param('planId') ?? '') : ''
    if (!UUID.test(organizationId) || (expects.planId && !UUID.test(planId))) {
      return fail(c, 'invalid-request')
    }
    if (!expects.body) return { organizationId, planId, body: {} }
    if (c.req.header('content-type')?.trim().toLowerCase() !== 'application/json') {
      return fail(c, 'unsupported-media-type')
    }
    let body: unknown
    try {
      body = await c.req.json<unknown>()
    } catch {
      return fail(c, 'validation-failed')
    }
    return isObject(body) ? { organizationId, planId, body } : fail(c, 'validation-failed')
  }

  function commandFor(c: Context, request: PlanRequest, resource: object) {
    const command = commandContext(c, { method: c.req.method, path: c.req.path, resource })
    return (
      command && { ...command, organizationId: request.organizationId, requestId: requestId(c) }
    )
  }

  async function answer(
    c: Context,
    request: PlanRequest,
    resource: object,
    status: 200 | 201,
    run: (
      personId: string,
      command: NonNullable<ReturnType<typeof commandFor>>,
    ) => Promise<OrganizationPlanResult>,
  ): Promise<Response> {
    const command = commandFor(c, request, resource)
    if (!command) return fail(c, 'invalid-request', 'valid command headers are required')
    try {
      const personId = await actingPerson(c, sessions())
      if (personId instanceof Response) return personId
      const result = await run(personId, command)
      if (result.replayed) c.header('Idempotent-Replay', 'true')
      return c.json(result.resource, status)
    } catch (error) {
      return studioFailure(c, error)
    }
  }
}

function planName(body: Record<string, unknown>): string | undefined {
  if (!hasExactly(body, ['name']) || typeof body.name !== 'string') return undefined
  const name = body.name.trim()
  return name.length > 0 && name.length <= MAX_PLAN_NAME ? name : undefined
}

function planVersion(body: Record<string, unknown>): StudioPlanVersionPublish | undefined {
  const fields = ['amount_minor', 'currency_code', 'billing_period', 'delivery_mode']
  if (!hasExactly(body, fields)) return undefined
  const { amount_minor: amount, currency_code: currency } = body
  const { billing_period: period, delivery_mode: delivery } = body
  if (typeof amount !== 'number' || !Number.isSafeInteger(amount)) return undefined
  if (amount <= 0 || amount > MAX_AMOUNT_MINOR || amount % PLAN_AMOUNT_STEP !== 0) return undefined
  if (currency !== PLAN_CURRENCY) return undefined
  if (!PLAN_BILLING_PERIODS.includes(period as PlanBillingPeriod)) return undefined
  if (!PLAN_DELIVERY_MODES.includes(delivery as PlanDeliveryMode)) return undefined
  return {
    amount_minor: amount,
    currency_code: currency,
    billing_period: period as PlanBillingPeriod,
    delivery_mode: delivery as PlanDeliveryMode,
  }
}

function hasExactly(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const present = Object.keys(value)
  return present.length === keys.length && keys.every((key) => key in value)
}

// JSON, not a separator: a plan name is free text and may hold any character at all.
function encodePlanCursor(parts: [OrganizationPlanStatus, string, string]): string {
  return Buffer.from(JSON.stringify(parts), 'utf8').toString('base64url')
}

function parsePlanCursor(value: string | undefined): OrganizationPlanCursor | null | undefined {
  if (value === undefined) return undefined
  if (!/^[A-Za-z0-9_-]{8,1024}$/.test(value)) return null
  let parts: unknown
  try {
    parts = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'))
  } catch {
    return null
  }
  if (!Array.isArray(parts) || parts.length !== 3) return null
  const [status, name, planId] = parts as unknown[]
  if (!ORGANIZATION_PLAN_STATUSES.includes(status as OrganizationPlanStatus)) return null
  if (typeof name !== 'string' || name.length === 0 || name.length > MAX_PLAN_NAME) return null
  if (typeof planId !== 'string' || !UUID.test(planId)) return null
  return {
    cursorStatus: status as OrganizationPlanStatus,
    cursorName: name,
    cursorPlanId: planId,
  }
}
