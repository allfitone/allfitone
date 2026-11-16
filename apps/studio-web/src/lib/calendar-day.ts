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

/**
 * `yyyy-mm-dd` in the given zone, which is what the server compares a start
 * date against.
 *
 * Moved here from `invitation-program.ts` when a third caller appeared, which
 * is what that module's own note said to do. The three are the client
 * invitation, which proposes a program, the assignment, which gives one, and
 * the substitution's local-date variant below it.
 */
export function todayIn(timeZone: string, now: Date = new Date()): string {
  // `en-CA` is the locale that formats a date as `yyyy-mm-dd`, so no manual
  // padding or month arithmetic is involved.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now)
}
