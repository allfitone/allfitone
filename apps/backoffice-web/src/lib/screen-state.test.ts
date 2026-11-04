import { describe, expect, test } from 'bun:test'

import { BackofficeApiError, BackofficeNetworkError } from './backoffice-api'
import { isRefusal } from './screen-state'

describe('what a failed read means', () => {
  test('a 403 is a refusal', () => {
    expect(isRefusal(new BackofficeApiError(403, 'forbidden'))).toBe(true)
  })

  // Separation of duties is still a refusal: the door is closed for this operator.
  test('a 403 with another code is still a refusal', () => {
    expect(isRefusal(new BackofficeApiError(403, 'separation-of-duties'))).toBe(true)
  })

  test('anything else is a failure to retry', () => {
    expect(isRefusal(new BackofficeApiError(503, 'upstream-unavailable'))).toBe(false)
    expect(isRefusal(new BackofficeNetworkError())).toBe(false)
    expect(isRefusal(new Error('boom'))).toBe(false)
  })
})
