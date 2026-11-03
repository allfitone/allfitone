/**
 * How a request failed, and the error that carries it.
 *
 * Apart from the transport on purpose. The failure vocabulary is what screens branch on
 * to decide what to tell somebody, and that decision is pure logic worth testing — but
 * `index.ts` reaches for `fetch`, `expo-crypto` and the stored session, none of which
 * load in the test runner. Splitting the word from the wire is what lets the wording of
 * a failure be asserted at all.
 */

export type ApiFailure =
  /** The request was malformed. Only reachable if client validation drifts. */
  | 'invalid-request'
  /** Wrong code, wrong password, unknown address — one answer, by design. */
  | 'unauthenticated'
  /**
   * The request was well formed and the server would not take it.
   *
   * Deliberately **not** named after one of its cases. A `422` is a password the
   * provider refused, an image that will not decode, or anything else a route declares
   * as unusable; the screen that sent it knows which of those it asked for and says so.
   */
  | 'validation-failed'
  /** Something else already holds what was asked for. Only a username, today. */
  | 'conflict'
  /**
   * Not there, or not yours. The API answers both the same way on purpose: a
   * distinguishable "forbidden" would make somebody else's catalogue enumerable one
   * identifier at a time.
   */
  | 'not-found'
  /** Known, but not for this account: an invitation sent to another address. */
  | 'forbidden'
  /** The API or the provider did not answer. Retryable; nothing else is. */
  | 'unavailable'
  /**
   * The person's plan does not open this, or its limit was reached (DT-018). The error
   * carries the function, so the screen offers Pro for exactly that.
   */
  | 'plan-limit'

/** What a `422` said was wrong with the request, and where in it. */
export interface ApiIssue {
  readonly code: string
  readonly path: string
}

export class ApiError extends Error {
  constructor(
    readonly failure: ApiFailure,
    readonly feature?: string,
    readonly issues: readonly ApiIssue[] = [],
  ) {
    super(failure)
    this.name = 'ApiError'
  }
}

export function failureFor(status: number): ApiFailure {
  if (status === 400) return 'invalid-request'
  if (status === 401) return 'unauthenticated'
  if (status === 403) return 'forbidden'
  if (status === 404) return 'not-found'
  if (status === 409) return 'conflict'
  if (status === 422) return 'validation-failed'
  return 'unavailable'
}

const PLAN_LIMIT = 'https://errors.allfit.invalid/plan-limit-reached'

/** The error a refused response means, reading the problem for a plan limit or a 422's issues. */
export async function apiErrorFrom(response: Response): Promise<ApiError> {
  if (response.status === 422) {
    return new ApiError('validation-failed', undefined, issuesOf(await problemOf(response)))
  }
  if (response.status !== 403) return new ApiError(failureFor(response.status))
  let body: unknown
  try {
    body = await response.json()
  } catch {
    return new ApiError('forbidden')
  }
  if (typeof body === 'object' && body !== null && 'type' in body && body.type === PLAN_LIMIT) {
    const feature = 'feature' in body ? body.feature : undefined
    if (typeof feature === 'string') return new ApiError('plan-limit', feature)
  }
  return new ApiError('forbidden')
}

async function problemOf(response: Response): Promise<unknown> {
  try {
    return await response.json()
  } catch {
    return undefined
  }
}

/** Only entries of the contract's shape are believed; anything else is dropped. */
function issuesOf(body: unknown): readonly ApiIssue[] {
  if (typeof body !== 'object' || body === null || !('errors' in body)) return []
  if (!Array.isArray(body.errors)) return []
  return body.errors.flatMap((entry: unknown) => {
    if (typeof entry !== 'object' || entry === null) return []
    const { code, path } = entry as { code?: unknown; path?: unknown }
    return typeof code === 'string' && typeof path === 'string' ? [{ code, path }] : []
  })
}
