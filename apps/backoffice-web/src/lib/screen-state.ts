/**
 * What a failed read means for the screen that asked.
 *
 * A refusal is not an error: the API answered, and the answer is that this
 * session holds no duty that opens the screen. It gets drawn as a closed door
 * with the duty's name, never as a failure the operator should retry.
 */

import { BackofficeApiError } from './backoffice-api'

export function isRefusal(error: unknown): boolean {
  return error instanceof BackofficeApiError && error.status === 403
}
