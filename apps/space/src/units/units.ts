/**
 * The units a person reads her weights and distances in (`HU-SP-094`, ADR-054).
 *
 * **Showing converts; nothing stored moves.** Every value arrives in its canonical unit
 * (kilograms, kilometres) and is converted only to be drawn, so switching kilos to pounds
 * and back never drifts a record. A value the person typed in pounds keeps its original
 * unit on the server; this module only decides how a canonical value reads.
 *
 * The preference itself lives on the server (`GET/PUT /space/v1/me/preferences`); until it
 * arrives, or while she has not chosen, the app reads kilos and kilometres.
 */

import { intlLocale, type Locale } from '../i18n/locale'

export type MassUnit = 'kg' | 'lb'
export type DistanceUnit = 'km' | 'mi'

export interface Units {
  readonly mass: MassUnit
  readonly distance: DistanceUnit
}

export const DEFAULT_UNITS: Units = { mass: 'kg', distance: 'km' }

const KG_PER_LB = 0.45359237
const KM_PER_MI = 1.609344

export function massIn(kilograms: number, unit: MassUnit): number {
  return unit === 'kg' ? kilograms : kilograms / KG_PER_LB
}

export function distanceIn(kilometres: number, unit: DistanceUnit): number {
  return unit === 'km' ? kilometres : kilometres / KM_PER_MI
}

/** Back to the canonical unit, for a value the person typed in her own unit. */
export function kilogramsFrom(value: number, unit: MassUnit): number {
  return unit === 'kg' ? value : value * KG_PER_LB
}

export function kilometresFrom(value: number, unit: DistanceUnit): number {
  return unit === 'km' ? value : value * KM_PER_MI
}

function figure(value: number, locale: Locale, digits: number): string {
  return value.toLocaleString(intlLocale(locale), {
    maximumFractionDigits: digits,
    useGrouping: false,
  })
}

/** «80 kg», «176,4 lb»: at most one decimal, none when it is whole. */
export function massLabel(kilograms: number, unit: MassUnit, locale: Locale): string {
  return `${figure(Math.round(massIn(kilograms, unit) * 10) / 10, locale, 1)} ${unit}`
}

/** «5 km», «3,11 mi»: up to two decimals, the precision a run is read with. */
export function distanceLabel(kilometres: number, unit: DistanceUnit, locale: Locale): string {
  return `${figure(Math.round(distanceIn(kilometres, unit) * 100) / 100, locale, 2)} ${unit}`
}

export function isMassUnit(value: unknown): value is MassUnit {
  return value === 'kg' || value === 'lb'
}

export function isDistanceUnit(value: unknown): value is DistanceUnit {
  return value === 'km' || value === 'mi'
}
