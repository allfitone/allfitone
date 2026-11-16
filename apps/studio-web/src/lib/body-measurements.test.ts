import { describe, expect, test } from 'bun:test'

import {
  measuredOnLine,
  measurementDays,
  measurementLine,
  metricLabel,
  photoSharedLine,
  photoTitle,
} from './body-measurements'
import type { ClientBodyProgressRecord } from './studio-api'

function record(overrides: Partial<ClientBodyProgressRecord> = {}): ClientBodyProgressRecord {
  return {
    id: 'record-1',
    metric_code: 'body_weight',
    value: 72.5,
    unit_code: 'kg',
    original_value: null,
    original_unit_code: null,
    measured_on: '2025-06-02',
    ...overrides,
  }
}

describe('her measurements, in the fields the version carries', () => {
  test('names each metric', () => {
    expect(metricLabel('body_weight')).toBe('Peso')
    expect(metricLabel('body_fat')).toBe('Grasa corporal')
    expect(metricLabel('thigh')).toBe('Muslo')
  })

  test('says the value in its unit', () => {
    expect(measurementLine(record())).toBe('72,5 kg')
    expect(
      measurementLine(record({ metric_code: 'body_fat', value: 18, unit_code: 'percent' })),
    ).toBe('18 %')
  })

  test('adds what she typed when it was another unit', () => {
    expect(
      measurementLine(record({ value: 72.5, original_value: 159.8, original_unit_code: 'lb' })),
    ).toBe('72,5 kg (registró 159,8 lb)')
  })

  test('a value the version does not carry is left out, not explained', () => {
    expect(measurementLine(record({ value: null, unit_code: null }))).toBeNull()
  })

  test('the day she measured, as the calendar day it was', () => {
    expect(measuredOnLine('2025-06-02')).toBe('2 de junio de 2025')
  })
})

describe('her measurements, by the day she took them', () => {
  test('one group per day, newest first as they arrived, each row with its value', () => {
    const days = measurementDays([
      record({ id: 'weight-new', measured_on: '2026-09-14' }),
      record({
        id: 'waist-new',
        metric_code: 'waist',
        value: 81,
        unit_code: 'cm',
        measured_on: '2026-09-14',
      }),
      record({ id: 'weight-old', measured_on: '2026-08-01' }),
    ])
    expect(days.map((day) => day.day)).toEqual(['2026-09-14', '2026-08-01'])
    expect(days[0]?.rows.map((row) => [row.record.id, row.value])).toEqual([
      ['weight-new', '72,5 kg'],
      ['waist-new', '81 cm'],
    ])
  })

  /*
   * A measurement whose value the version withholds is not drawn as a name with
   * a blank beside it, and a day left with nothing is not drawn at all.
   */
  test('a measurement with no value that travelled is left out, and so is an empty day', () => {
    const days = measurementDays([
      record({ id: 'readable', measured_on: '2026-09-14' }),
      record({
        id: 'withheld',
        metric_code: 'waist',
        value: null,
        unit_code: null,
        measured_on: '2026-09-14',
      }),
      record({ id: 'only-withheld', value: null, unit_code: null, measured_on: '2026-08-01' }),
    ])
    expect(days.map((day) => day.day)).toEqual(['2026-09-14'])
    expect(days[0]?.rows.map((row) => row.record.id)).toEqual(['readable'])
  })

  test('nothing measured is no group at all', () => {
    expect(measurementDays([])).toEqual([])
  })
})

describe('a photo she shows this gym', () => {
  test('is called by the day it was taken', () => {
    expect(photoTitle({ taken_on: '2026-09-14' })).toBe('Foto del 14 de septiembre de 2026')
  })

  // Midday in UTC, so the day is the same in Bogotá and on a CI runner.
  test('and says when she chose to show it, which is another day', () => {
    expect(photoSharedLine({ shared_at: '2026-09-20T15:00:00.000Z' })).toBe(
      'Te la mostró el 20 de septiembre de 2026',
    )
  })
})
