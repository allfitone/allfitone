/**
 * What the authorized progress screen needs to decide, and the words it says
 * things in.
 *
 * `OP-EXE-019` computes every figure when it is read, from the sessions this
 * coach may see and no others. Four rules follow from the story, and all four
 * are about refusing to round:
 *
 * **A figure that cannot be computed is absent, never approximate.** The
 * contract says it in the data: `volume_kg` is null «when nothing in the period
 * was weighed», and `best_e1rm_kg` is null when no set had one to twelve
 * repetitions. A zero would be a claim that she lifted nothing.
 *
 * **A movement only she can name is counted without its name.** `name` arrives
 * null, and the row stays: dropping it would change the figures, and inventing a
 * name would be reading something she did not share.
 *
 * **Nothing here is drawn as a chart.** `bests` carries a null for every period
 * a movement was not trained in, and in a line or a bar an absence is exactly
 * what gets rendered as a zero or interpolated away — the approximation the
 * story forbids. A chart can come later with that rule written into it.
 *
 * **The periods are read oldest first**, as the operation answers them: a
 * progression reads forward in time, unlike the session list, where somebody is
 * looking for the most recent thing.
 */
import type { ClientProgressPeriod, SpacePeriodMuscle } from './studio-api'

const DAY_NUMBER = new Intl.DateTimeFormat('es-CO', { day: 'numeric' })
const MONTH_SHORT = new Intl.DateTimeFormat('es-CO', { month: 'short' })
const MONTH = new Intl.DateTimeFormat('es-CO', { month: 'long', year: 'numeric' })

/**
 * A calendar day arrives as `YYYY-MM-DD`, and handing that to `new Date` reads
 * it as midnight UTC — the day before, anywhere west of Greenwich. Built from
 * its parts instead, the same defect `calendar-day.ts` exists to avoid.
 */
function localDay(value: string): Date | null {
  const [year, month, day] = value.split('-').map(Number)
  if (!year || !month || !day) return null
  return new Date(year, month - 1, day)
}

/**
 * What a period is called. A month says its name; a week says the days it
 * covers, and `ends_before` is exclusive, so the last day shown is the one
 * before it.
 *
 * A week inside one month names the month once — «7 – 13 sept», not «7 de sept
 * – 13 de sept». It reads better, and it is also what let the table fit: the
 * workspace canvas is 1024px and six columns of max-content did not.
 */
export function periodLabel(
  period: 'week' | 'month',
  entry: Pick<ClientProgressPeriod, 'starts_on' | 'ends_before'>,
): string {
  const from = localDay(entry.starts_on)
  if (!from) return entry.starts_on
  if (period === 'month') return MONTH.format(from)
  const before = localDay(entry.ends_before)
  if (!before) return `${DAY_NUMBER.format(from)} ${MONTH_SHORT.format(from)}`
  const last = new Date(before.getTime() - 86_400_000)
  const fromMonth = MONTH_SHORT.format(from)
  const lastMonth = MONTH_SHORT.format(last)
  if (fromMonth === lastMonth) {
    return `${DAY_NUMBER.format(from)} – ${DAY_NUMBER.format(last)} ${lastMonth}`
  }
  return `${DAY_NUMBER.format(from)} ${fromMonth} – ${DAY_NUMBER.format(last)} ${lastMonth}`
}

/**
 * Time trained, in hours and minutes. Seconds are not shown: nobody plans a
 * week from them, and a figure to the second invites the reader to trust a
 * precision the sessions were not recorded with.
 */
export function trainedTimeLine(seconds: number): string | null {
  if (seconds <= 0) return null
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${String(minutes)} min`
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  const hourPart = hours === 1 ? '1 h' : `${String(hours)} h`
  return rest === 0 ? hourPart : `${hourPart} ${String(rest)} min`
}

/** Kilos as they are read here: at most one decimal, and never a trailing zero. */
export function kilos(value: number): string {
  return `${new Intl.NumberFormat('es-CO', { maximumFractionDigits: 1 }).format(value)} kg`
}

/**
 * The volume lifted in a period, or null when nothing in it was weighed.
 *
 * Null is the whole point: a period of bodyweight work has no volume, and
 * showing `0 kg` would say she lifted nothing when she trained all week.
 */
export function volumeLine(volume: number | null): string | null {
  return volume === null ? null : kilos(volume)
}

/** A movement's name, or what to call the one only she can name. */
export function movementName(name: string | null): string {
  return name ?? 'Un movimiento que solo ella nombra'
}

/** True for that movement, so the screen can say why it has no name. */
export function movementIsUnnamed(name: string | null): boolean {
  return name === null
}

/**
 * How a movement's best moved against the period before it.
 *
 * Null when there is nothing to compare against — the first period it appears
 * in — and said as nothing rather than as «+0 kg», which would claim she held
 * steady when in truth we have no earlier figure.
 */
export function changeLine(change: number | null): string | null {
  if (change === null || change === 0) return null
  const sign = change > 0 ? '+' : '−'
  return `${sign}${kilos(Math.abs(change))}`
}

export function changeTone(change: number | null): 'success' | 'warning' | 'secondary' {
  if (change === null || change === 0) return 'secondary'
  return change > 0 ? 'success' : 'warning'
}

/**
 * How a period's work sets fall across muscles, as a sentence.
 *
 * The operation answers them heaviest first and a set belongs to one muscle, so
 * this neither sorts nor adds anything up: a total of its own would be a figure
 * the server did not compute.
 */
export function musclesLine(muscles: readonly SpacePeriodMuscle[], most = 3): string | null {
  if (muscles.length === 0) return null
  const named = muscles.slice(0, most).map((muscle) => `${muscle.name} ${String(muscle.sets)}`)
  const rest = muscles.length - named.length
  return rest > 0 ? `${named.join(' · ')} · y ${String(rest)} más` : named.join(' · ')
}

/**
 * True when every period came back empty of training. The screen then says so
 * once instead of drawing a dozen rows of zeros, which read as a defect.
 */
export function nothingTrained(periods: readonly ClientProgressPeriod[]): boolean {
  return periods.every((entry) => entry.sessions === 0)
}

/**
 * The estimated one-repetition maximum, said as an estimate.
 *
 * Null when no set in the window had between one and twelve repetitions, which
 * is the range the formula holds for. Calling it «estimado» in the label is the
 * difference between a figure and a measurement, and the formula travels in
 * `algorithm` so the screen can name it rather than imply one.
 */
export function estimateLine(best: number | null): string | null {
  return best === null ? null : kilos(best)
}
