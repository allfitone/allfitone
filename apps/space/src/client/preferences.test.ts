import { describe, expect, test } from 'bun:test'

import { createLocaleStore, textFor } from '../i18n'
import { createUnitsStore } from '../units/units-store'
import { ApiError } from './api-error'
import {
  applyOptimistically,
  applyPreferences,
  languageRow,
  NO_PREFERENCES,
  preferenceFailure,
  withDistance,
  withLocale,
  withMass,
  type SpacePreferences,
} from './preferences'

const es = textFor('es').preferences
const en = textFor('en').preferences

function stores() {
  const locale = createLocaleStore(() => 'es')
  const units = createUnitsStore()
  return { locale, units, apply: { setLocale: locale.set, setUnits: units.set } }
}

describe('her units and language reach the app (TECH-44, HU-SP-094)', () => {
  test('T-SPC-UNIT-730 what she chose moves the stores', () => {
    const held = stores()
    applyPreferences({ mass_unit: 'lb', distance_unit: 'mi', locale: 'en' }, held.apply)
    expect(held.locale.get()).toBe('en')
    expect(held.units.get()).toEqual({ mass: 'lb', distance: 'mi' })
  })

  test('T-SPC-UNIT-731 what she never chose follows the phone, in kilos and kilometres', () => {
    const held = stores()
    applyPreferences({ mass_unit: 'lb', distance_unit: 'mi', locale: 'en' }, held.apply)
    applyPreferences(NO_PREFERENCES, held.apply)
    expect(held.locale.get()).toBe('es')
    expect(held.units.get()).toEqual({ mass: 'kg', distance: 'km' })
  })

  test('T-SPC-UNIT-732 a change keeps the other keys, so all three travel', () => {
    const base: SpacePreferences = { mass_unit: null, distance_unit: 'mi', locale: null }
    expect(withMass(base, 'lb')).toEqual({ mass_unit: 'lb', distance_unit: 'mi', locale: null })
    expect(withDistance(base, 'km')).toEqual({ mass_unit: null, distance_unit: 'km', locale: null })
    expect(withLocale(base, 'en')).toEqual({ mass_unit: null, distance_unit: 'mi', locale: 'en' })
  })
})

describe('a change is shown at once and undone if it fails', () => {
  test('T-SPC-UNIT-733 the stores move before the answer, and keep what the server kept', async () => {
    const held = stores()
    const next = withLocale(NO_PREFERENCES, 'en')
    let seenWhileSaving: string | undefined
    const kept = await applyOptimistically(NO_PREFERENCES, next, held.apply, async (sent) => {
      seenWhileSaving = held.locale.get()
      return sent
    })
    expect(seenWhileSaving).toBe('en')
    expect(kept).toEqual(next)
    expect(held.locale.get()).toBe('en')
  })

  test('T-SPC-UNIT-734 a refused save puts back what she had and says why', async () => {
    const held = stores()
    const previous: SpacePreferences = { mass_unit: 'kg', distance_unit: null, locale: null }
    const attempt = applyOptimistically(previous, withMass(previous, 'lb'), held.apply, () =>
      Promise.reject(new ApiError('unavailable')),
    )
    await expect(attempt).rejects.toBeInstanceOf(ApiError)
    expect(held.units.get().mass).toBe('kg')
  })

  test('T-SPC-UNIT-735 failures are worded in her language', () => {
    expect(preferenceFailure(new ApiError('unavailable'), es)).toBe(es.failures.offline)
    expect(preferenceFailure(new ApiError('validation-failed'), en)).toBe(en.failures.refused)
    expect(preferenceFailure(new ApiError('unauthenticated'), es)).toBe(es.failures.expired)
    expect(preferenceFailure(new Error('boom'), es)).toBe(es.failures.offline)
  })
})

describe('the language row', () => {
  test('T-SPC-UNIT-736 names the chosen language in itself, or the phone’s with a word', () => {
    expect(languageRow('en', 'en', es)).toEqual({ name: 'English' })
    expect(languageRow(null, 'es', es)).toEqual({ name: 'Español', caption: 'Como el teléfono' })
    expect(languageRow(null, 'en', en)).toEqual({ name: 'English', caption: 'Same as your phone' })
  })
})
