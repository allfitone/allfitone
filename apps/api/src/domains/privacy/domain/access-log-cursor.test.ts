import { describe, expect, test } from 'bun:test'

import { decodeAccessEventCursor, encodeAccessEventCursor } from './index.js'

const RECORD = '019a9100-0000-7000-8000-000000000502'

describe('the access log cursor (HU-BO-030)', () => {
  test('T-AUD-UNIT-01 names the last record read, and reads back as the same place', () => {
    const cursor = encodeAccessEventCursor({ at: '2026-10-01T12:00:00.000Z', id: RECORD })

    expect(decodeAccessEventCursor(cursor)).toEqual({ at: '2026-10-01T12:00:00.000Z', id: RECORD })
  })

  test('T-AUD-UNIT-03 keeps the microseconds PostgreSQL wrote', () => {
    // Rounded to a millisecond, the next page would start after records it never showed.
    const cursor = encodeAccessEventCursor({ at: '2026-10-01T12:00:00.123456Z', id: RECORD })

    expect(decodeAccessEventCursor(cursor)?.at).toBe('2026-10-01T12:00:00.123456Z')
  })

  test('T-AUD-UNIT-02 a cursor that does not name both halves is no cursor at all', () => {
    // It feeds a sort key the database trusts; a malformed one is refused, never defaulted.
    const forged = (value: unknown) =>
      Buffer.from(JSON.stringify(value), 'utf8').toString('base64url')

    expect(
      [
        'garbage',
        forged({ at: '2026-10-01T12:00:00.000Z' }),
        forged({ id: RECORD }),
        forged({ at: 'yesterday', id: RECORD }),
        forged({ at: '2026-10-01 12:00:00+00', id: RECORD }),
        forged({ at: '2026-10-01T12:00:00.000Z', id: 'not-a-record' }),
        forged(['2026-10-01T12:00:00.000Z', RECORD]),
        'x'.repeat(1025),
      ].map(decodeAccessEventCursor),
    ).toEqual(Array.from({ length: 8 }, () => undefined))
  })
})
