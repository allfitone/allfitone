/**
 * Response envelope and error catalogue.
 *
 * Codes are stable strings, not statuses alone: clients branch on the code, and
 * a status says too little. The catalogue is closed so a new failure mode has to
 * be named here rather than invented at a call site.
 */

import { randomUUID } from 'node:crypto'
import type { Context } from 'hono'
import type { ContentfulStatusCode } from 'hono/utils/http-status'

export type ApiErrorCode =
  /** Token absent, invalid or expired. */
  | 'unauthenticated'
  /** The token's client_id does not belong to this surface. */
  | 'wrong-surface'
  /** Malformed request: missing parameter, bad shape. */
  | 'invalid-request'
  /** A JSON command used a representation other than application/json. */
  | 'unsupported-media-type'
  /** A dependency we do not control did not answer. Retryable. */
  | 'upstream-unavailable'
  /** A locally controlled feature or delivery path is intentionally unavailable. */
  | 'service-degraded'
  /** Authenticated account has not completed domain registration. */
  | 'registration-incomplete'
  /** The linked domain person was closed. */
  | 'account-closed'
  /** Authenticated request is not allowed to perform this action. */
  | 'forbidden'
  /** The person has not accepted the consent this operation needs (ADR-041). */
  | 'consent-required'
  /** The person does not share the data scope this operation needs, at the level it needs. */
  | 'scope-required'
  /** The chosen password was refused: too short, or known to be breached. */
  | 'weak-password'
  /** The command conflicts with durable state or a prior idempotent request. */
  | 'conflict'
  /** The write base revision is no longer current. */
  | 'stale-draft'
  /** A concurrency-controlled write omitted If-Match. */
  | 'precondition-required'
  /** Another transaction still owns the command or aggregate lock. */
  | 'idempotency-in-progress'
  /** A visible resource does not exist. */
  | 'not-found'
  /** A well-formed request violates a closed business schema. */
  | 'validation-failed'
  /** A closed application or database limit rejected the attempt. */
  | 'rate-limited'
  /** The command already ran, and what it created has been deleted since. */
  | 'command-effect-disposed'
  | 'separation-of-duties'
  /** The person's plan does not open this function, or its limit was reached (DT-018). */
  | 'plan-limit-reached'
  /** The organization has filled every guest place Allfit sold it (HU-STUDIO-087). */
  | 'guest-quota-exhausted'
  /** The organization is suspended and gains no client until it operates again (HU-BO-016). */
  | 'organization-not-operating'

const STATUS: Record<ApiErrorCode, ContentfulStatusCode> = {
  unauthenticated: 401,
  'wrong-surface': 403,
  'invalid-request': 400,
  'unsupported-media-type': 415,
  'upstream-unavailable': 503,
  'service-degraded': 503,
  'registration-incomplete': 403,
  'account-closed': 403,
  forbidden: 403,
  'consent-required': 403,
  'scope-required': 403,
  'weak-password': 422,
  conflict: 409,
  'stale-draft': 409,
  'precondition-required': 428,
  'idempotency-in-progress': 409,
  'not-found': 404,
  'validation-failed': 422,
  'rate-limited': 429,
  'command-effect-disposed': 410,
  'separation-of-duties': 403,
  'plan-limit-reached': 403,
  'guest-quota-exhausted': 409,
  'organization-not-operating': 409,
}

const TITLE: Record<ApiErrorCode, string> = {
  unauthenticated: 'Authentication is required',
  'wrong-surface': 'This credential cannot access this surface',
  'invalid-request': 'The request is invalid',
  'unsupported-media-type': 'Content-Type must be application/json',
  'upstream-unavailable': 'A required dependency is temporarily unavailable',
  'service-degraded': 'The service is temporarily degraded',
  'registration-incomplete': 'Registration must be completed first',
  'account-closed': 'The account is closed',
  forbidden: 'The actor cannot execute this operation',
  'consent-required': 'Consent is required first',
  'scope-required': 'Required consent is not effective',
  'weak-password': 'The password does not satisfy the security policy',
  conflict: 'The request conflicts with current state',
  'stale-draft': 'The local draft is stale',
  'precondition-required': 'If-Match is required',
  'idempotency-in-progress': 'The command is still processing',
  'not-found': 'Resource not found',
  'validation-failed': 'The request does not satisfy the contract',
  'rate-limited': 'Too many requests',
  'command-effect-disposed': 'The command effect was disposed',
  'separation-of-duties': 'This actor already asked to read this person',
  'plan-limit-reached': 'The plan does not include this function',
  'guest-quota-exhausted': 'The organization has no guest places left',
  'organization-not-operating': 'The organization is not operating',
}

/**
 * `detail` is for humans reading logs. It must never carry a token, a claim
 * value, or anything that reveals whether an account exists.
 */
export function fail(c: Context, code: ApiErrorCode, detail?: string) {
  return c.json({ error: { code, ...(detail ? { detail } : {}) } }, STATUS[code])
}

/** RFC 9457 response for contract-first endpoints migrating off the legacy envelope. */
export function problem(
  c: Context,
  code: ApiErrorCode,
  detail?: string,
  extensions: Readonly<Record<string, string | Readonly<Record<string, string>>>> = {},
) {
  return c.json(
    {
      type: `https://errors.allfit.invalid/${code}`,
      title: TITLE[code],
      status: STATUS[code],
      ...(detail ? { detail } : {}),
      ...extensions,
      request_id: randomUUID(),
    },
    STATUS[code],
    { 'Content-Type': 'application/problem+json' },
  )
}

const FEATURE_CODE = /^[a-z][a-z0-9_]{1,63}$/

/**
 * The function a plan refused, when the database raised AF402. The function's code
 * travels in the error's detail, and only a code of the catalogue's shape is believed.
 */
export function planLimitFeature(cause: unknown): string | undefined {
  if (typeof cause !== 'object' || cause === null) return undefined
  if (!('code' in cause) || cause.code !== 'AF402') return undefined
  const detail = 'detail' in cause ? cause.detail : undefined
  return typeof detail === 'string' && FEATURE_CODE.test(detail) ? detail : undefined
}

/** A plan limit is always a problem naming the function, whatever envelope the domain uses. */
export function failPlanLimit(c: Context, feature: string) {
  return problem(c, 'plan-limit-reached', undefined, { feature })
}

export interface RequiredScope {
  code: string
  level: 'read' | 'contribute'
}

const REQUIRED_SCOPE = /^([a-z][a-z0-9_]{1,63}):(read|contribute)$/

/**
 * The grant a database function found missing, when it raised AF430. The scope and
 * level travel in the detail as `code:level`, and only that shape is believed.
 */
export function requiredScope(cause: unknown): RequiredScope | undefined {
  if (typeof cause !== 'object' || cause === null) return undefined
  if (!('code' in cause) || cause.code !== 'AF430') return undefined
  const detail = 'detail' in cause ? cause.detail : undefined
  const match = typeof detail === 'string' ? REQUIRED_SCOPE.exec(detail) : null
  const [, code, level] = match ?? []
  return code && (level === 'read' || level === 'contribute') ? { code, level } : undefined
}

/** A missing grant is a problem naming the scope and level, so the client can ask for it. */
export function failScopeRequired(c: Context, scope: RequiredScope) {
  return problem(c, 'scope-required', undefined, {
    required_scope: { code: scope.code, level: scope.level },
  })
}
