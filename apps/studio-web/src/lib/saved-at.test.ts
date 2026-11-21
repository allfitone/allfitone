import { describe, expect, test } from 'bun:test'

import { savedAtTime } from './saved-at'

describe('the hour a save landed', () => {
  test('reads as an hour and its minutes', () => {
    expect(savedAtTime('2026-11-20T15:11:00.000Z')).toMatch(/\d{1,2}:11/)
  })

  // «a las 10:11 a. m..» is what the status said before: the hour ends in a period.
  test('never ends in the period the sentence adds', () => {
    for (const hour of ['2026-11-20T03:05:00.000Z', '2026-11-20T15:11:00.000Z']) {
      expect(`Guardado a las ${savedAtTime(hour)}.`).not.toContain('..')
    }
  })

  test('takes a date as well as the text of one', () => {
    const when = new Date('2026-11-20T15:11:00.000Z')
    expect(savedAtTime(when)).toBe(savedAtTime(when.toISOString()))
  })
})
