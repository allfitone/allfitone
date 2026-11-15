/**
 * `T-WL-UNIT-02` — what reviewing the waitlist does before the database (`OP-WL-011`,
 * `OP-WL-012`): cutting a page, the cursor that resumes it, and the reason of a mark.
 */

import { describe, expect, test } from 'bun:test'

import {
  decodeWaitlistCursor,
  encodeWaitlistCursor,
  fraudReason,
  type BackofficeWaitlistSignup,
  type WaitlistReviewDatabase,
  type WaitlistSignupQuery,
} from '../domain/review.js'
import { createWaitlistReviewService } from './review.js'

const REVIEWER = {
  actorPersonId: '019ab000-0000-7000-8000-000000000003',
  actorSessionId: '019ab000-0000-7000-8000-000000000023',
}
const REQUEST_ID = '019ab000-0000-7000-8000-000000000777'

function signup(n: number): BackofficeWaitlistSignup {
  return {
    id: `019ab000-0000-7000-8000-${String(n).padStart(12, '0')}`,
    name: `Persona ${String(n)}`,
    email: `p${String(n)}@example.com`,
    language: 'es',
    referral_code: `CODE${String(n).padStart(4, '0')}`,
    joined_at: '2026-11-14T15:00:00.000Z',
    confirmed_at: null,
    founding_number: null,
    channel: { kind: 'direct', source: null },
    invited_by: null,
    discard_reason: null,
    fraud: null,
    referrals: 0,
    referrals_sharing_connection: 0,
  }
}

/** A list of `total` sign-ups, newest first, that answers as many as it is asked for. */
function setup(total: number) {
  const asked: Array<WaitlistSignupQuery & typeof REVIEWER> = []
  const all = Array.from({ length: total }, (_, index) => signup(total - index))
  const database: WaitlistReviewDatabase = {
    list: (input) => {
      asked.push(input)
      return Promise.resolve(all.slice(0, input.limit))
    },
    totals: () => Promise.reject(new Error('not asked here')),
    markAsFraud: () => Promise.reject(new Error('not asked here')),
  }
  return { asked, service: createWaitlistReviewService(database) }
}

describe('T-WL-UNIT-02 cutting a page', () => {
  test('asks for one sign-up more than the page, as the reviewer and with the question', async () => {
    const { asked, service } = setup(5)

    await service.list(REVIEWER, {
      requestId: REQUEST_ID,
      limit: 3,
      query: 'ana',
      filter: 'confirmed',
    })

    expect(asked).toEqual([
      { ...REVIEWER, requestId: REQUEST_ID, limit: 4, query: 'ana', filter: 'confirmed' },
    ])
  })

  test('a list longer than the page answers the page and a cursor at its last sign-up', async () => {
    const { service } = setup(5)

    const page = await service.list(REVIEWER, { requestId: REQUEST_ID, limit: 3 })

    expect(page.items.map((item) => item.name)).toEqual(['Persona 5', 'Persona 4', 'Persona 3'])
    expect(page.hasMore).toBe(true)
    expect(decodeWaitlistCursor(page.nextCursor ?? '')).toBe(signup(3).id)
  })

  test('a list that fits the page exactly has no next page', async () => {
    const { service } = setup(3)

    const page = await service.list(REVIEWER, { requestId: REQUEST_ID, limit: 3 })

    expect(page.items).toHaveLength(3)
    expect(page).toMatchObject({ hasMore: false })
    expect(page.nextCursor).toBeUndefined()
  })

  test('an empty list is an empty page', async () => {
    const { service } = setup(0)

    expect(await service.list(REVIEWER, { requestId: REQUEST_ID, limit: 25 })).toEqual({
      items: [],
      hasMore: false,
    })
  })
})

describe('T-WL-UNIT-02 the cursor', () => {
  const id = '019ab000-0000-7000-8000-000000000901'
  const encoded = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url')

  test('names the last sign-up of a page and reads back', () => {
    const cursor = encodeWaitlistCursor(id)

    expect(cursor.length).toBeGreaterThanOrEqual(16)
    expect(decodeWaitlistCursor(cursor)).toBe(id)
  })

  test.each([
    ['text that is not base64 of anything', 'not-a-cursor-at-all'],
    ['a value shorter than a cursor', 'e30'],
    ['an identifier that is not a UUID', encoded({ id: 'the-first-signup' })],
    ['an identifier that is not text', encoded({ id: 12345678901234 })],
    ['a second field beside the identifier', encoded({ id, name: 'Ana' })],
    ['a list', encoded([id, id])],
    ['a null', encoded(null) + encoded(null) + encoded(null)],
  ])('%s is not a cursor', (_name, value) => {
    expect(decodeWaitlistCursor(value)).toBeUndefined()
  })
})

describe('T-WL-UNIT-02 the reason of a fraud mark', () => {
  test('is one line of four to two hundred characters, trimmed', () => {
    expect(fraudReason('  Correos en serie  ')).toBe('Correos en serie')
    expect(fraudReason('spam')).toBe('spam')
    expect(fraudReason('a'.repeat(200))).toHaveLength(200)
  })

  test('is counted in characters, like the database counts it', () => {
    expect(fraudReason('ñ'.repeat(200))).toHaveLength(200)
    expect(fraudReason('🙂'.repeat(200))).toBeDefined()
    expect(fraudReason('🙂'.repeat(201))).toBeUndefined()
  })

  test.each([
    ['nothing', undefined],
    ['a number', 42],
    ['only spaces', '      '],
    ['three characters', 'no '],
    ['two hundred and one characters', 'a'.repeat(201)],
    ['a line break', 'Correos en serie\nmismo equipo'],
    ['a tab', 'Correos\ten serie'],
    ['a C1 control character', 'Correos\u0085en serie'],
  ])('%s is not a reason', (_name, value) => {
    expect(fraudReason(value)).toBeUndefined()
  })
})
