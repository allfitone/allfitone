/**
 * A day in the gym's calendar, formatted as that day.
 *
 * Moved out of the relationship screen when the client card became the second
 * reader of it. The fix below is subtle enough that a second copy would be a
 * second place to forget it.
 */

const DATE_FORMATTER = new Intl.DateTimeFormat('es-CO', { dateStyle: 'medium' })

/**
 * `ends_on` is a day in the gym's calendar, not an instant, and it arrives as
 * `YYYY-MM-DD`. Handing that to `new Date` reads it as midnight UTC, which in
 * Colombia renders as **the day before** — a cover ending on the 12th would be
 * shown ending on the 11th. Building the date from its parts keeps it local.
 */
export function formatCalendarDay(value: string): string {
  const [year, month, day] = value.split('-').map(Number)
  if (!year || !month || !day) return value
  return DATE_FORMATTER.format(new Date(year, month - 1, day))
}
