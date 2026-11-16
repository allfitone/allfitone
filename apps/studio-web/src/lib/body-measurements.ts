/**
 * The words for her body measurements and photos, shared by the two screens
 * that read them: her body progress (`HU-STUDIO-052`) and the history of an
 * ended relationship read through a case (`HU-STUDIO-062`).
 *
 * Written first for the frozen history, which said it should converge with the
 * live screen the day there was one. This is that day: the same measurement
 * reads the same way whether it is read now or as it stood at a cut.
 *
 * **A field the version does not carry is null, and is left out.** The value,
 * its unit and what she typed each travel on their own; a missing one is never
 * described, because «sin registrar» would claim the field exists and is empty.
 *
 * **The metric names are Space's** (`apps/space/src/client/body.ts`), copied on
 * purpose: an app may not import another app. They should move to a package the
 * day a third surface needs them.
 */
import type {
  BodyProgressMetricCode,
  BodyProgressUnitCode,
  ClientBodyPhoto,
  ClientBodyProgressRecord,
} from './studio-api'

const METRICS: Record<BodyProgressMetricCode, string> = {
  body_weight: 'Peso',
  body_height: 'Estatura',
  muscle_mass: 'Masa muscular',
  body_fat: 'Grasa corporal',
  waist: 'Cintura',
  hip: 'Cadera',
  chest: 'Pecho',
  arm: 'Brazo',
  thigh: 'Muslo',
}

export function metricLabel(code: BodyProgressMetricCode): string {
  return METRICS[code]
}

const UNITS: Record<BodyProgressUnitCode, string> = {
  kg: 'kg',
  lb: 'lb',
  m: 'm',
  cm: 'cm',
  in: 'in',
  percent: '%',
}

function figure(value: number): string {
  return new Intl.NumberFormat('es-CO', { maximumFractionDigits: 2 }).format(value)
}

function amount(value: number | null, unit: BodyProgressUnitCode | null): string | null {
  if (value === null) return null
  return unit ? `${figure(value)} ${UNITS[unit]}` : figure(value)
}

/**
 * The canonical value, and what she typed when it was another unit. A field the
 * version does not carry comes back null and is left out.
 */
export function measurementLine(record: ClientBodyProgressRecord): string | null {
  const canonical = amount(record.value, record.unit_code)
  const typed = amount(record.original_value, record.original_unit_code)
  if (canonical && typed) return `${canonical} (registró ${typed})`
  return canonical ?? typed
}

/** A calendar day, read as one: in UTC, so no zone moves it to the day before. */
export function measuredOnLine(day: string): string {
  return new Intl.DateTimeFormat('es-CO', { dateStyle: 'long', timeZone: 'UTC' }).format(
    new Date(`${day}T00:00:00Z`),
  )
}

export interface MeasurementRow {
  readonly record: ClientBodyProgressRecord
  readonly value: string
}

export interface MeasurementDay {
  readonly day: string
  readonly rows: readonly MeasurementRow[]
}

/**
 * One group per day she measured, newest first as the read ordered them, with
 * the line each measurement reads as. A day that spans two pages stays one group
 * once both have arrived.
 *
 * A measurement whose value did not travel is left out rather than drawn as a
 * name beside a blank, and a day left with nothing is not returned — the same
 * rule as a section with no rows.
 */
export function measurementDays(
  records: readonly ClientBodyProgressRecord[],
): readonly MeasurementDay[] {
  const days = new Map<string, MeasurementRow[]>()
  for (const record of records) {
    const value = measurementLine(record)
    if (value === null) continue
    const existing = days.get(record.measured_on)
    if (existing) existing.push({ record, value })
    else days.set(record.measured_on, [{ record, value }])
  }
  return [...days.entries()].map(([day, rows]) => ({ day, rows }))
}

/** What a photo is called: the day it was taken. */
export function photoTitle(photo: Pick<ClientBodyPhoto, 'taken_on'>): string {
  return `Foto del ${measuredOnLine(photo.taken_on)}`
}

/** When she chose to show it to this gym, which is not when it was taken. */
export function photoSharedLine(photo: Pick<ClientBodyPhoto, 'shared_at'>): string {
  const day = new Intl.DateTimeFormat('es-CO', { dateStyle: 'long' }).format(
    new Date(photo.shared_at),
  )
  return `Te la mostró el ${day}`
}
