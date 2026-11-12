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
  /** The gym has no guest place left for her right now (HU-STUDIO-087). */
  | 'guest-quota-exhausted'
  /** The gym is suspended and takes nobody new until it operates again (HU-BO-016). */
  | 'organization-not-operating'
  /** The current password typed to change it is not the one in force (`OP-IDN-066`). */
  | 'wrong-password'
  /** The new password was refused: too common, or known from a breach (`OP-IDN-066`). */
  | 'weak-password'
  /** Too many attempts for now; asking again later works. */
  | 'rate-limited'

/** The `409`s a person can do something about, told apart by the code in the body. */
const GYM_REFUSALS: readonly ApiFailure[] = ['guest-quota-exhausted', 'organization-not-operating']

export class ApiError extends Error {
  constructor(
    readonly failure: ApiFailure,
    readonly feature?: string,
  ) {
    super(failure)
    this.name = 'ApiError'
  }
}

/** A screen with no words of its own for waiting says what it says for no connection. */
export function unreachable(error: ApiError): boolean {
  return error.failure === 'unavailable' || error.failure === 'rate-limited'
}

export function failureFor(status: number): ApiFailure {
  if (status === 400) return 'invalid-request'
  if (status === 401) return 'unauthenticated'
  if (status === 403) return 'forbidden'
  if (status === 404) return 'not-found'
  if (status === 409) return 'conflict'
  if (status === 422) return 'validation-failed'
  if (status === 429) return 'rate-limited'
  return 'unavailable'
}

const PLAN_LIMIT = 'https://errors.allfit.invalid/plan-limit-reached'
const PASSWORD_REFUSALS: Readonly<Record<string, ApiFailure>> = {
  'https://errors.allfit.invalid/wrong-password': 'wrong-password',
  'https://errors.allfit.invalid/weak-password': 'weak-password',
}

/** The error a refused response means, reading the body only for a plan, a gym or a password. */
export async function apiErrorFrom(response: Response): Promise<ApiError> {
  if (response.status === 409) return new ApiError(await gymRefusal(response))
  if (response.status === 422) return new ApiError(await passwordRefusal(response))
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

/** Any other `409`, or one whose body cannot be read, stays a plain conflict. */
async function gymRefusal(response: Response): Promise<ApiFailure> {
  let body: unknown
  try {
    body = await response.json()
  } catch {
    return 'conflict'
  }
  const error = typeof body === 'object' && body !== null && 'error' in body ? body.error : null
  const code = typeof error === 'object' && error !== null && 'code' in error ? error.code : null
  return GYM_REFUSALS.find((failure) => failure === code) ?? 'conflict'
}

/** Only a problem whose type names one of the two password refusals is told apart. */
async function passwordRefusal(response: Response): Promise<ApiFailure> {
  let body: unknown
  try {
    body = await response.json()
  } catch {
    return 'validation-failed'
  }
  const type = typeof body === 'object' && body !== null && 'type' in body ? body.type : null
  return (typeof type === 'string' ? PASSWORD_REFUSALS[type] : undefined) ?? 'validation-failed'
}
