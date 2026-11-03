/**
 * The local date and time an export writes, read in the languages it is written in.
 *
 * Hevy writes the time in the app's language and with no zone: `Aug 4, 2026, 3:09 PM`
 * in English, `4 ago 2026, 15:09` in Spanish, where September is `sept`. The month is
 * always a word, so day and month never swap. A date in any other shape is refused,
 * not guessed: a session placed on the wrong day breaks records and streaks quietly.
 */

const MONTHS: Readonly<Record<string, number>> = {
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  may: 5,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  sept: 9,
  oct: 10,
  nov: 11,
  dec: 12,
  ene: 1,
  abr: 4,
  ago: 8,
  dic: 12,
}

// Newer ICU writes a narrow no-break space before AM/PM; both read as a plain space.
const SPACES = /[\u00A0\u202F]/g
const MONTH_FIRST = /^([a-z]+)\.? (\d{1,2}), (\d{4}),? (\d{1,2}):(\d{2})(?: ?([ap])\.? ?m\.?)?$/
const DAY_FIRST =
  /^(\d{1,2}) (?:de )?([a-z]+)\.? (?:de )?(\d{4}),? (\d{1,2}):(\d{2})(?: ?([ap])\.? ?m\.?)?$/

const pad = (value: number): string => String(value).padStart(2, '0')

/** `YYYY-MM-DDTHH:MM`, or `null` when the text is not a date this reader knows. */
export function readLocalDateTime(text: string): string | null {
  const value = text.replace(SPACES, ' ').trim().toLowerCase()
  const monthFirst = MONTH_FIRST.exec(value)
  const dayFirst = monthFirst ? null : DAY_FIRST.exec(value)
  const parts = monthFirst
    ? {
        month: monthFirst[1],
        day: monthFirst[2],
        year: monthFirst[3],
        hour: monthFirst[4],
        minute: monthFirst[5],
        half: monthFirst[6],
      }
    : dayFirst
      ? {
          day: dayFirst[1],
          month: dayFirst[2],
          year: dayFirst[3],
          hour: dayFirst[4],
          minute: dayFirst[5],
          half: dayFirst[6],
        }
      : null
  if (!parts?.month || !parts.day || !parts.year || !parts.hour || !parts.minute) return null

  const month = MONTHS[parts.month]
  const day = Number(parts.day)
  const year = Number(parts.year)
  const minute = Number(parts.minute)
  let hour = Number(parts.hour)
  if (month === undefined || minute > 59) return null
  if (parts.half) {
    if (hour < 1 || hour > 12) return null
    hour = (hour % 12) + (parts.half === 'p' ? 12 : 0)
  } else if (hour > 23) {
    return null
  }
  // Rejects 31 sept or 29 feb outside a leap year: the calendar has to agree.
  const calendar = new Date(Date.UTC(year, month - 1, day))
  if (
    calendar.getUTCFullYear() !== year ||
    calendar.getUTCMonth() !== month - 1 ||
    calendar.getUTCDate() !== day
  ) {
    return null
  }
  return `${year}-${pad(month)}-${pad(day)}T${pad(hour)}:${pad(minute)}`
}
