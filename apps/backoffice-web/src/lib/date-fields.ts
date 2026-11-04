/**
 * The Backoffice keeps dates as text, the way its API conversions already read
 * them: a calendar day as `YYYY-MM-DD` and a moment as `YYYY-MM-DDTHH:MM`, both in
 * the viewer's own time zone. That is what the browser's `datetime-local` and
 * `date` fields produced, so nothing downstream changes.
 *
 * The Design System's pickers hold a `Date` for the day and an `HH:MM` string for
 * the time. These functions translate between the two shapes using local calendar
 * fields only, never `toISOString`, which would move a late-evening day into the
 * next one for anyone west of UTC.
 */

const DAY = /^(\d{4})-(\d{2})-(\d{2})(?:T|$)/
const TIME = /T(\d{2}:\d{2})$/

const pad = (value: number) => String(value).padStart(2, '0')

/** The calendar day a value names, or `undefined` when it names none. */
export function dayOf(value: string): Date | undefined {
  const match = DAY.exec(value)
  if (!match) return undefined
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])]
  const date = new Date(year, month - 1, day)
  // `new Date` rolls 31 February into March; a day that moved was never a day.
  return date.getMonth() === month - 1 && date.getDate() === day ? date : undefined
}

export function dayValue(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

/** The `HH:MM` of a moment, or `undefined` for a bare day or an empty value. */
export function timeOf(value: string): string | undefined {
  return TIME.exec(value)?.[1]
}

/** A moment needs a day; without one there is nothing to filter or record. */
export function momentValue(day: Date | undefined, time: string): string {
  return day ? `${dayValue(day)}T${time}` : ''
}
