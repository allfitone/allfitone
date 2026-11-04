import { describe, expect, test } from 'bun:test'

import { dayOf, dayValue, momentValue, timeOf } from './date-fields'

describe('dates the Backoffice keeps as text', () => {
  test('reads the calendar day of a day or a moment, in local time', () => {
    expect(dayOf('2026-11-04')).toEqual(new Date(2026, 10, 4))
    expect(dayOf('2026-11-04T23:30')).toEqual(new Date(2026, 10, 4))
  })

  test('reads nothing from an empty or impossible day', () => {
    expect(dayOf('')).toBeUndefined()
    expect(dayOf('2026-02-31')).toBeUndefined()
    expect(dayOf('04/11/2026')).toBeUndefined()
  })

  test('writes a day without moving it across a time zone', () => {
    expect(dayValue(new Date(2026, 0, 5))).toBe('2026-01-05')
    expect(dayValue(new Date(2026, 11, 31, 23, 59))).toBe('2026-12-31')
  })

  test('reads the time of a moment, and none from a bare day', () => {
    expect(timeOf('2026-11-04T07:05')).toBe('07:05')
    expect(timeOf('2026-11-04')).toBeUndefined()
    expect(timeOf('')).toBeUndefined()
  })

  test('joins a day and a time into the moment the API conversions read', () => {
    expect(momentValue(new Date(2026, 10, 4), '07:05')).toBe('2026-11-04T07:05')
    expect(momentValue(undefined, '07:05')).toBe('')
  })

  test('round-trips the value a datetime-local field used to hold', () => {
    const value = '2026-03-09T18:45'
    expect(momentValue(dayOf(value), timeOf(value) ?? '00:00')).toBe(value)
    expect(Date.parse(value)).toBe(new Date(2026, 2, 9, 18, 45).getTime())
  })
})
