/**
 * Her units and language (`PF-14`), as the API keeps them and as the app shows them.
 * HU-SP-094, ADR-054, `OP-IDN-070`/`OP-IDN-071`.
 *
 * **The server keeps the choice; the stores show it.** On sign-in and on every start the
 * app reads `GET /space/v1/me/preferences` and hands it to the locale and units stores,
 * which re-render every screen at once. A value she never chose is null and the stores
 * read it as «follow the phone» (Spanish or English) and kilos and kilometres.
 *
 * **A change is shown before it is saved, and undone if it is not.** Waiting for the
 * round trip to switch the language would make the screen look broken for a second; so
 * `applyOptimistically` moves the stores, sends the `PUT`, and moves them back if the
 * server refuses. The `PUT` carries all three keys every time: a key left out is 422.
 */

import type { AllfitV1Schemas } from '@allfitone/contracts'

import { ApiError } from './api-error'
import type { Dictionary, Locale } from '../i18n'
import { isLocale } from '../i18n/locale'
import type { UnitsChoice } from '../units/units-store'
import { isDistanceUnit, isMassUnit, type DistanceUnit, type MassUnit } from '../units/units'

export type SpacePreferences = AllfitV1Schemas['SpacePreferences']

export const NO_PREFERENCES: SpacePreferences = {
  mass_unit: null,
  distance_unit: null,
  locale: null,
}

export interface PreferenceStores {
  readonly setLocale: (locale: Locale | null) => void
  readonly setUnits: (choice: UnitsChoice) => void
}

/** Hands what the server keeps to the stores; anything outside the lists reads as unchosen. */
export function applyPreferences(preferences: SpacePreferences, stores: PreferenceStores): void {
  stores.setLocale(isLocale(preferences.locale) ? preferences.locale : null)
  stores.setUnits({
    mass: isMassUnit(preferences.mass_unit) ? preferences.mass_unit : null,
    distance: isDistanceUnit(preferences.distance_unit) ? preferences.distance_unit : null,
  })
}

export function withMass(preferences: SpacePreferences, mass: MassUnit): SpacePreferences {
  return { ...preferences, mass_unit: mass }
}

export function withDistance(
  preferences: SpacePreferences,
  distance: DistanceUnit,
): SpacePreferences {
  return { ...preferences, distance_unit: distance }
}

export function withLocale(preferences: SpacePreferences, locale: Locale): SpacePreferences {
  return { ...preferences, locale }
}

/**
 * Shows `next` at once, saves it, and shows `previous` again if the save fails.
 * Resolves with what the server kept; rejects with the failure, already undone.
 */
export async function applyOptimistically(
  previous: SpacePreferences,
  next: SpacePreferences,
  stores: PreferenceStores,
  save: (next: SpacePreferences) => Promise<SpacePreferences>,
): Promise<SpacePreferences> {
  applyPreferences(next, stores)
  try {
    const kept = await save(next)
    applyPreferences(kept, stores)
    return kept
  } catch (cause) {
    applyPreferences(previous, stores)
    throw cause
  }
}

type PreferencesText = Dictionary['preferences']

/** Why a change to her units, language or channels did not land, in her language. */
export function preferenceFailure(cause: unknown, text: PreferencesText): string {
  if (!(cause instanceof ApiError)) return text.failures.offline
  if (cause.failure === 'unauthenticated') return text.failures.expired
  if (cause.failure === 'conflict') return text.failures.stale
  if (cause.failure === 'validation-failed' || cause.failure === 'invalid-request') {
    return text.failures.refused
  }
  return text.failures.offline
}

/** The language row's value: the one she chose, or the phone's with a word saying so. */
export function languageRow(
  chosen: Locale | null,
  speaking: Locale,
  text: PreferencesText,
): { readonly name: string; readonly caption?: string } {
  if (chosen) return { name: text.language.names[chosen] }
  return { name: text.language.names[speaking], caption: text.language.followsPhone }
}
