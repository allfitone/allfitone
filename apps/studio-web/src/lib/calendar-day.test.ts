import { describe, expect, test } from 'bun:test'

import { formatCalendarDay } from './calendar-day'

/*
 * The test this function never had, written when it moved out of the
 * relationship screen. The bug it exists to prevent is off by exactly one day
 * and only west of Greenwich, so it reads as a correct screen to anybody
 * testing in Europe.
 */
describe('a day in the gym calendar', () => {
  test('is shown as that day, not the one before', () => {
    expect(formatCalendarDay('2026-03-12')).toContain('12')
  })

  test('the first of a month keeps its month', () => {
    // `new Date('2026-03-01')` is 7pm on February 28th in Bogotá, so this is
    // where the bug used to move both the day and the month.
    const formatted = formatCalendarDay('2026-03-01')
    expect(formatted).toContain('1')
    expect(formatted).not.toContain('feb')
  })

  test('the first of January keeps its year', () => {
    expect(formatCalendarDay('2026-01-01')).toContain('2026')
  })

  test('something that is not a day is handed back untouched', () => {
    expect(formatCalendarDay('')).toBe('')
    expect(formatCalendarDay('pronto')).toBe('pronto')
  })
})
