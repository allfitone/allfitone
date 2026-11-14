import { describe, expect, test } from 'bun:test'

import { photoFailure } from './authorized-photo'
import { StudioApiError } from './studio-api'

/*
 * A photo that is gone, a permission she revoked, a relationship that ended and
 * a credential that expired all answer the same 404. The screen cannot tell
 * them apart, so it says one thing for the four — and offers no retry, because
 * each attempt is recorded for her and would be refused again.
 */
describe('what a photo that could not be shown says', () => {
  test('a refusal, whatever its reason, is one answer with nothing to retry', () => {
    expect(photoFailure(new StudioApiError(404, 'not-found'))).toBe('unavailable')
    expect(photoFailure(new StudioApiError(403, 'forbidden'))).toBe('unavailable')
  })

  test('a connection that failed is worth one more try, when somebody asks', () => {
    expect(photoFailure(new StudioApiError(503, 'upstream-unavailable'))).toBe('retry')
    expect(photoFailure(new TypeError('Failed to fetch'))).toBe('retry')
  })
})
