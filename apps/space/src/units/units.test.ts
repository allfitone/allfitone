import { describe, expect, test } from 'bun:test'

import {
  DEFAULT_UNITS,
  distanceLabel,
  isDistanceUnit,
  isMassUnit,
  kilogramsFrom,
  kilometresFrom,
  massIn,
  massLabel,
} from './units'
import { createUnitsStore } from './units-store'

describe('the units she reads in (TECH-44, HU-SP-094)', () => {
  test('T-SPC-UNIT-460 kilos and kilometres read as they are', () => {
    expect(massLabel(80, 'kg', 'es')).toBe('80 kg')
    expect(massLabel(82.46, 'kg', 'es')).toBe('82,5 kg')
    expect(distanceLabel(5, 'km', 'en')).toBe('5 km')
  })

  test('T-SPC-UNIT-461 pounds and miles convert only to be shown, in her language', () => {
    expect(massLabel(80, 'lb', 'es')).toBe('176,4 lb')
    expect(massLabel(80, 'lb', 'en')).toBe('176.4 lb')
    expect(distanceLabel(5, 'mi', 'en')).toBe('3.11 mi')
  })

  test('T-SPC-UNIT-462 going to pounds and back lands where it started', () => {
    expect(kilogramsFrom(massIn(73.9, 'lb'), 'lb')).toBeCloseTo(73.9, 10)
    expect(kilometresFrom(3.10686, 'mi')).toBeCloseTo(5, 4)
  })

  test('T-SPC-UNIT-463 the store reads kilos and kilometres until she chooses, and tells readers once', () => {
    const store = createUnitsStore()
    let calls = 0
    store.subscribe(() => (calls += 1))
    expect(store.get()).toEqual(DEFAULT_UNITS)
    store.set({ mass: 'lb', distance: null })
    store.set({ mass: 'lb', distance: null })
    expect(store.get()).toEqual({ mass: 'lb', distance: 'km' })
    expect(calls).toBe(1)
  })

  test('T-SPC-UNIT-464 only the four units are accepted from outside', () => {
    expect(isMassUnit('lb')).toBe(true)
    expect(isMassUnit('st')).toBe(false)
    expect(isDistanceUnit('mi')).toBe(true)
    expect(isDistanceUnit(null)).toBe(false)
  })
})
