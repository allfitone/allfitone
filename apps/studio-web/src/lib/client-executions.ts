/**
 * What the authorized sessions screen needs to decide, and the words it says
 * things in.
 *
 * `OP-EXE-017` answers her completed, valid sessions newest first, a page at a
 * time, mixing two categories in one chronological stream: what she trained
 * inside this relationship and what she trained on her own. Four things about
 * that answer shape the screen, and two are not in the story.
 *
 * **There is no total, and the screen must not make one.** The page carries
 * only a cursor and `has_more`. A figure counted from what is on screen would
 * be false twice: it is one page, and the story says a session she hid must not
 * show up as a difference in a total.
 *
 * **An empty list is two things at once.** The function returns nothing both
 * when she has no sessions and when she shares neither category — the refusal
 * is recorded, not returned. So the screen cannot tell them apart and must not
 * pretend to.
 *
 * **The hiding is the row policy's work, not the query's.** A session she hid
 * never reaches a page or a page boundary, so there are no gaps to detect and
 * nothing here looks for one.
 *
 * **Each session carries its own time zone**, because it is where she trained.
 * A session is shown at the hour she lived it, not at the hour the coach would
 * have read it.
 */
import type { AuthorizedExecutionSummary, CompletenessLevel } from './studio-api'

/*
 * Said about her and about us. `origin` and `applied_scope.code` are the same
 * fact twice — the function derives one from the other — so only this is shown.
 */
const ORIGINS: Record<string, string> = {
  relationship: 'Con nosotros',
  prior: 'Por su cuenta',
}

export function originLabel(origin: string): string {
  return ORIGINS[origin] ?? origin
}

/**
 * How complete the record of a session is, which tells a coach how much of it
 * he can trust before opening it.
 *
 * A null is the level never being set, and it is said as unknown rather than
 * guessed at the bottom of the scale: «partial» is a claim about what she
 * recorded.
 */
const LEVELS: Record<CompletenessLevel, string> = {
  partial: 'Registro parcial',
  summary: 'Solo el resumen',
  detailed: 'Registro detallado',
  sensor_enriched: 'Con datos de dispositivo',
}

export function levelLabel(level: CompletenessLevel | null): string | null {
  return level ? (LEVELS[level] ?? null) : null
}

export interface ExecutionWhen {
  readonly line: string
  /** The session's zone, only when it is not the reader's. */
  readonly zone: string | null
}

/**
 * The contract's `IanaTimeZone` generates as `string | 'UTC' | unknown` — an
 * `anyOf` of a const and a pattern collapses to `unknown` — so the type
 * protects nothing and the value is narrowed here instead. The fix belongs in
 * the OpenAPI, not in a cast, so this narrowing is the stopgap and not the cure.
 */
function zoneOf(timezone: unknown): string | null {
  return typeof timezone === 'string' && timezone.length > 0 ? timezone : null
}

/**
 * When she trained, in the zone where she trained.
 *
 * Rendering a session in the reader's zone would move it: one she started at
 * six in the morning in Madrid reads as the afternoon for a coach in Bogotá,
 * and «entrenó de madrugada» is the kind of thing a coach acts on. The zone is
 * named only when it differs from the reader's, because naming it on every row
 * of a list that never leaves one city is noise.
 *
 * A zone the browser does not know falls back to the reader's rather than
 * throwing: IANA names are retired, and one old session must not take the whole
 * list down with it.
 */
export function executionWhen(
  summary: Pick<AuthorizedExecutionSummary, 'started_at' | 'timezone'>,
  reader: string | null,
): ExecutionWhen {
  const zone = zoneOf(summary.timezone)
  const at = new Date(summary.started_at)
  if (zone) {
    try {
      const line = new Intl.DateTimeFormat('es-CO', { ...SHAPE, timeZone: zone }).format(at)
      return { line, zone: zone === reader ? null : zone }
    } catch {
      // Falls through to the reader's zone, and says nothing it cannot support.
    }
  }
  return { line: new Intl.DateTimeFormat('es-CO', SHAPE).format(at), zone: null }
}

/*
 * The locale decides the shape, and in a browser `es-CO` renders this as
 * `28/07/2026, 6:04 a. m.` — the same numeric date every other screen shows.
 *
 * Do not assert the date's exact text in a unit test: bun and the browser ship
 * different ICU data, and the same options read `28 jul 2026` under bun. The
 * suite asserts the hour, and the end-to-end tests assert what a browser draws.
 */
const SHAPE = { dateStyle: 'medium', timeStyle: 'short' } as const

/**
 * How long it lasted, in whole minutes, or null when no end was recorded.
 *
 * Null is left as null rather than shown as zero: a session without an end is
 * one nobody closed, which is not a session of no duration.
 */
export function executionLength(
  summary: Pick<AuthorizedExecutionSummary, 'started_at' | 'ended_at'>,
): string | null {
  if (!summary.ended_at) return null
  const minutes = Math.round(
    (new Date(summary.ended_at).getTime() - new Date(summary.started_at).getTime()) / 60000,
  )
  if (!Number.isFinite(minutes) || minutes <= 0) return null
  if (minutes < 60) return `${String(minutes)} min`
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  const hourPart = hours === 1 ? '1 h' : `${String(hours)} h`
  return rest === 0 ? hourPart : `${hourPart} ${String(rest)} min`
}

/**
 * True when the session fulfilled a session we had planned for her.
 *
 * The contract only fills `planned_session_id` for a session of this
 * relationship, so this is never true for one she did on her own — and saying
 * it is worth a row, because a coach reading his own programme wants to know
 * which sessions were his.
 */
export function fulfilledOurPlan(
  summary: Pick<AuthorizedExecutionSummary, 'planned_session_id'>,
): boolean {
  return summary.planned_session_id !== null
}
