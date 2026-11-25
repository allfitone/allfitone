/**
 * The seven days the closing screen shows, and nothing else.
 *
 * It is **not a calendar week**. The first chip is today, and the six that follow
 * are the days after it, because the screen says "tu primera semana" and the first
 * week of somebody who just finished starts the moment they finish — not on the
 * Monday they may already have missed.
 *
 * It promises no sessions. Nothing schedules training yet, and the chips say when
 * what follows begins and nothing more; a chip that implied a planned session would
 * be the screen inventing a plan that does not exist.
 *
 * Each language letters the days itself (`onboarding.continues.weekLetters`).
 */

export interface WeekDay {
  /** Stable across a render, and distinct even when two letters repeat. */
  readonly key: string
  readonly today: boolean
}

export function weekFromToday(from: Date): readonly WeekDay[] {
  return Array.from({ length: 7 }, (_unused, offset) => {
    // Local midnight plus a day count: `setDate` past the end of the month rolls
    // over, and it is the only arithmetic here that daylight saving cannot skew.
    const day = new Date(from.getFullYear(), from.getMonth(), from.getDate() + offset)
    return {
      key: `${day.getFullYear()}-${day.getMonth() + 1}-${day.getDate()}`,
      today: offset === 0,
    }
  })
}

/** "4h 30m", or "45m" while a week has not reached an hour. */
export function trainedLabel(totalSeconds: number): string {
  const minutes = Math.round(Math.max(0, totalSeconds) / 60)
  const hours = Math.floor(minutes / 60)
  return hours > 0 ? `${hours}h ${minutes % 60}m` : `${minutes}m`
}
