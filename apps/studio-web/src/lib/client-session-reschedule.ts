/**
 * Moving a managed session to another day of its own week: `HU-STUDIO-048`.
 *
 * Its five criteria, and who holds each one:
 *
 * 1. **Only sessions of a program we manage.** `management` is what says so,
 *    and the contract answers 409 `conflict` once it is null — so the action is
 *    not offered there rather than offered and refused.
 * 2. **The person does not reschedule what a professional manages.** Nothing
 *    here: that is Space's side of the same rule.
 * 3. **A session she started does not move.** The session says it itself, in
 *    `started`, which the contract put there for exactly this.
 * 4. **A personal or detached program has no administrator**, so the action
 *    does not apply — the same `management` check as the first.
 * 5. **Rescheduling never touches the content or the targets.** Nothing here
 *    either, and it is the half worth saying out loud in the dialog, because a
 *    coach moving a day may fear it rewrites the week.
 *
 * **The day is bounded three ways and the server is the authority on all
 * three.** It must be inside the session's own calendar week, today or later
 * **in her zone**, and not before the program starts. The screen computes the
 * same bounds so it can offer only days that will be accepted — but her zone is
 * the assignment's, never the reader's, which is the mistake this module exists
 * to prevent.
 */

import { todayIn } from './calendar-day'
import type { AssignPermission } from './client-program-assignment'
import type { RelationshipAssignment, RelationshipAssignmentSession } from './studio-api'

/** One day of the session's week, and whether it can be chosen. */
export interface RescheduleDay {
  readonly day: string
  /**
   * `current` is the day it is on, `open` a day the server will accept, and
   * `closed` one of the three bounds. **No label here on purpose:** the test
   * runner and the browser carry different locale data, so the words are the
   * component's and are asserted end to end.
   */
  readonly state: 'current' | 'open' | 'closed'
}

const DAYS_IN_WEEK = 7

/**
 * The seven days of the week this session belongs to, in order, each with
 * whether it can be chosen.
 *
 * The day it is on is `current` even when it is already past: it is where the
 * session stands, and a week behind her still has to show which day that was.
 */
export function rescheduleWeek(
  session: Pick<RelationshipAssignmentSession, 'scheduled_on' | 'week_starts_on'>,
  assignment: Pick<RelationshipAssignment, 'starts_on' | 'timezone'>,
  now: Date = new Date(),
): readonly RescheduleDay[] {
  const earliest = laterOf(todayIn(assignment.timezone, now), assignment.starts_on)

  return Array.from({ length: DAYS_IN_WEEK }, (_unused, offset) => {
    const day = addDays(session.week_starts_on, offset)
    if (day === session.scheduled_on) return { day, state: 'current' as const }
    return { day, state: day < earliest ? ('closed' as const) : ('open' as const) }
  })
}

/**
 * Whether to offer the move at all.
 *
 * Four conditions, and each one is a refusal the server would otherwise give:
 * the program must still be managed, the session must be scheduled and
 * unstarted, and she must have shared her training at the writing level. Her
 * card carries the level, so the screen decides before asking — and the refusal
 * is still handled, because she can withdraw it while the dialog is open.
 */
export function canRescheduleSession(
  session: Pick<RelationshipAssignmentSession, 'status' | 'started'>,
  assignment: Pick<RelationshipAssignment, 'management'>,
  permission: AssignPermission,
): boolean {
  if (permission !== 'granted') return false
  if (assignment.management === null) return false
  return session.status === 'scheduled' && !session.started
}

/**
 * Whether to draw the control at all.
 *
 * Two different questions, and both have to be yes: the server would accept a
 * move, **and** the session's own week still has a day it could go to. A week
 * entirely behind her leaves nowhere to put it, and a control that can only
 * answer "no" is worse than the plain day it replaces.
 */
export function rescheduleIsOffered(
  session: Pick<
    RelationshipAssignmentSession,
    'status' | 'started' | 'scheduled_on' | 'week_starts_on'
  >,
  assignment: Pick<RelationshipAssignment, 'management' | 'starts_on' | 'timezone'>,
  permission: AssignPermission,
  now: Date = new Date(),
): boolean {
  if (!canRescheduleSession(session, assignment, permission)) return false
  return rescheduleWeek(session, assignment, now).some((day) => day.state === 'open')
}

/** Which session is about to move. */
export function rescheduleTitle(session: Pick<RelationshipAssignmentSession, 'title'>): string {
  return `¿Mover «${session.title}» a otro día?`
}

/**
 * The three bounds, said once.
 *
 * Seven days each explaining themselves would be noise, and the reason a day is
 * closed never changes within a week. The second sentence is the fifth
 * criterion: a coach moving a day may fear it rewrites the week.
 */
export function rescheduleBoundsNote(): string {
  return 'Solo dentro de su propia semana, desde hoy en adelante y nunca antes de que empiece el programa. Lo que cambia es el día: la rutina, sus objetivos y la semana a la que pertenece se quedan igual.'
}

/**
 * What a refusal means, in the coach's words.
 *
 * **`stale-draft` is not an error and does not read like one.** Somebody moved
 * the session while the dialog was open, and the answer hands back the session
 * as it stands, so the screen shows that instead of losing either version.
 *
 * The other 409 covers two causes the answer does not separate — she started
 * it, or we no longer manage the program — so the sentence names both and sends
 * the reader to re-read the calendar rather than guessing which.
 */
export function rescheduleWriteFailure(status: number, code?: string): string {
  if (status === 409 && code === 'stale-draft') {
    return 'Esta sesión se movió mientras la mirabas. Abajo está el día en el que quedó; vuelve a elegir desde ahí.'
  }
  if (status === 409 && code === 'service-paused') {
    return 'No se movió: su servicio con la organización está pausado. Eso se resuelve reactivándolo o terminando el vínculo, no sesión por sesión.'
  }
  if (status === 409) {
    return 'No se movió: o ella ya empezó esta sesión, o este programa ya no lo administramos. Vuelve a cargar la agenda para verla como está.'
  }
  if (status === 403) {
    return 'No se movió: el permiso de entrenamiento no alcanza para cambiarle la agenda.'
  }
  if (status === 422) {
    return 'Ese día no vale: tiene que ser de esta misma semana, de hoy en adelante y no antes de que empiece el programa.'
  }
  if (status === 404) return 'Esta sesión ya no está disponible para tu organización.'
  if (status === 503) {
    return 'No pudimos mover la sesión ahora mismo. Sigue en su día; vuelve a intentarlo en un momento.'
  }
  return 'No pudimos mover la sesión. Sigue en su día; vuelve a intentarlo.'
}

/** Later of two calendar days. Both are `yyyy-mm-dd`, which sorts as it reads. */
function laterOf(left: string, right: string): string {
  return left > right ? left : right
}

/**
 * A calendar day plus `offset` days, still as `yyyy-mm-dd`.
 *
 * Built and read back in UTC on purpose. A day is not an instant, so stepping
 * through local time would shift it across a DST boundary or a zone west of
 * Greenwich — the same trap `formatCalendarDay` exists for.
 */
function addDays(day: string, offset: number): string {
  const [year, month, date] = day.split('-').map(Number)
  const stepped = new Date(Date.UTC(year ?? 0, (month ?? 1) - 1, (date ?? 1) + offset))
  return stepped.toISOString().slice(0, 10)
}
