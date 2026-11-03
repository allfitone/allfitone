import { describe, expect, test } from 'bun:test'

import { apiErrorFrom, failureFor } from './api-error'

describe('failureFor', () => {
  test('T-SPC-UNIT-317 a refusal is not mistaken for a dropped connection', () => {
    expect(failureFor(403)).toBe('forbidden')
    expect(failureFor(404)).toBe('not-found')
    expect(failureFor(503)).toBe('unavailable')
    expect(failureFor(500)).toBe('unavailable')
  })
})

describe('apiErrorFrom', () => {
  const problem = (body: unknown, status = 403) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/problem+json' },
    })

  test('T-SPC-UNIT-PLAN-01 a plan limit says which function it refused', async () => {
    const error = await apiErrorFrom(
      problem({
        type: 'https://errors.allfit.invalid/plan-limit-reached',
        status: 403,
        feature: 'own_routines',
      }),
    )
    expect(error.failure).toBe('plan-limit')
    expect(error.feature).toBe('own_routines')
  })

  test('T-SPC-UNIT-PLAN-02 any other refusal stays what its status says', async () => {
    const forbidden = await apiErrorFrom(
      problem({ type: 'https://errors.allfit.invalid/forbidden', status: 403 }),
    )
    const odd = await apiErrorFrom(
      problem({ type: 'https://errors.allfit.invalid/plan-limit-reached', feature: 7 }),
    )
    const empty = await apiErrorFrom(new Response('', { status: 403 }))
    const missing = await apiErrorFrom(problem({}, 404))
    expect([forbidden.failure, odd.failure, empty.failure, missing.failure]).toEqual([
      'forbidden',
      'forbidden',
      'forbidden',
      'not-found',
    ])
    expect(forbidden.feature).toBeUndefined()
  })

  test('T-SPC-UNIT-IMP-01 an unusable request says what was wrong with it, and where', async () => {
    const error = await apiErrorFrom(
      problem(
        {
          type: 'https://errors.allfit.invalid/validation-failed',
          status: 422,
          errors: [
            { code: 'unreadable_date', path: '/content/37', message: 'A date cannot be read.' },
          ],
        },
        422,
      ),
    )
    expect(error.failure).toBe('validation-failed')
    expect(error.issues).toEqual([{ code: 'unreadable_date', path: '/content/37' }])
  })

  test('T-SPC-UNIT-IMP-02 a 422 without a readable problem has no issues, and is still a 422', async () => {
    const empty = await apiErrorFrom(new Response('', { status: 422 }))
    const odd = await apiErrorFrom(problem({ errors: [{ code: 7 }, 'x'] }, 422))
    expect([empty.failure, odd.failure]).toEqual(['validation-failed', 'validation-failed'])
    expect([empty.issues, odd.issues]).toEqual([[], []])
  })
})
