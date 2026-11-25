import { describe, expect, it, test } from 'bun:test'

import { trainedLabel, weekFromToday } from './week'

describe('weekFromToday', () => {
  it('starts today and runs six days on', () => {
    // A Saturday, which is the day the approved design shows.
    const week = weekFromToday(new Date(2026, 7, 29))

    expect(week).toHaveLength(7)
    expect(week.map((day) => day.today)).toEqual([true, false, false, false, false, false, false])
  })

  it('rolls over the end of a month', () => {
    const week = weekFromToday(new Date(2026, 7, 30))

    expect(week.map((day) => day.key)).toEqual([
      '2026-8-30',
      '2026-8-31',
      '2026-9-1',
      '2026-9-2',
      '2026-9-3',
      '2026-9-4',
      '2026-9-5',
    ])
  })

  it('rolls over the end of a year', () => {
    const week = weekFromToday(new Date(2026, 11, 30))

    expect(week.at(0)?.key).toBe('2026-12-30')
    expect(week.at(-1)?.key).toBe('2027-1-5')
  })

  it('gives every day a distinct key', () => {
    const keys = new Set(weekFromToday(new Date(2026, 7, 29)).map((day) => day.key))

    expect(keys.size).toBe(7)
  })
})

describe('what a history row says', () => {
  test('T-SPC-UNIT-60 reads a week in hours only once it has one', () => {
    expect(trainedLabel(16_200)).toBe('4h 30m')
    expect(trainedLabel(2_700)).toBe('45m')
    expect(trainedLabel(0)).toBe('0m')
  })
})
