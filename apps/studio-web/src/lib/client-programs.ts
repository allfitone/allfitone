/**
 * What the assigned-programs screen needs to decide, and the words it says
 * things in.
 *
 * `OP-PLN-018` answers the programs this relationship gave her, newest first,
 * each with the calendar planted for it. Three things about that answer shape
 * the screen, and none of them is in the story.
 *
 * **Only one of the two counts has a denominator.** A finite version is planted
 * whole when it is assigned, so every session it will ever have is in the
 * answer and «8 de 24» is true. An open-ended one grows a week at a time as she
 * reaches it, so the same phrase would be measuring her against a total that
 * does not exist yet. `repeats_forever` is what tells them apart, and it is the
 * only reason this module reads that field.
 *
 * **The adjustments cannot be named here.** Each one carries a
 * `planned_step_id` and no step, no movement and no session — naming what it
 * changed would need the version's content, which this operation does not
 * answer and this screen does not read. So the screen says the plan carries
 * adjustments and when the last one was made, and stops there.
 *
 * **Nothing here asks what day it is.** «The next session» would need a clock,
 * and a clock makes the same screen say different things on two machines. The
 * calendar is shown in the order the server sent it and the reader finds today
 * in it, which is what a calendar is for.
 */
import { formatCalendarDay } from './calendar-day'
import type { RelationshipAssignment, RelationshipAssignmentSession } from './studio-api'

/*
 * Two kinds of date live in this answer and they must not be formatted the same
 * way. `starts_on` and `scheduled_on` are days in her calendar and go through
 * `formatCalendarDay`, which builds them from their parts; `assigned_at`,
 * `since` and `revised_at` are instants and go through this, which reads them
 * in the reader's zone. Taking the first ten characters of an instant would
 * give whichever day it was in the offset the server wrote it in, and that is
 * the day before anywhere west of it.
 */
const INSTANT_DAY = new Intl.DateTimeFormat('es-CO', { dateStyle: 'medium' })

function formatInstantDay(value: string): string {
  return INSTANT_DAY.format(new Date(value))
}

type AssignmentStatus = RelationshipAssignment['status']
type SessionStatus = RelationshipAssignmentSession['status']

/*
 * `detached_pending_choice` is hers to resolve, not the coach's: the program
 * outlived the relationship and she has not yet said whether she keeps it. The
 * label says that without implying anybody here can act on it.
 */
const ASSIGNMENT_STATUS: Record<AssignmentStatus, string> = {
  active: 'En curso',
  detached_pending_choice: 'Ella decide si sigue',
  ended: 'Terminado',
  cancelled: 'Cancelado',
}

export function assignmentStatusLabel(status: AssignmentStatus): string {
  return ASSIGNMENT_STATUS[status] ?? status
}

/** Only `active` is a program she is training today; the rest are history. */
export function assignmentIsRunning(status: AssignmentStatus): boolean {
  return status === 'active'
}

const SESSION_STATUS: Record<SessionStatus, string> = {
  scheduled: 'Programada',
  paused: 'En pausa',
  cancelled: 'Cancelada',
  completed: 'Hecha',
}

export function sessionStatusLabel(status: SessionStatus): string {
  return SESSION_STATUS[status] ?? status
}

export interface SessionsDone {
  readonly done: number
  /** Null for an open-ended program: there is no total to be a part of. */
  readonly total: number | null
}

/**
 * How many of the planted sessions she finished.
 *
 * The count is over what the answer carries, which for a finite version is the
 * whole program and for an open-ended one is only as far as it has grown —
 * hence the null, and hence no arithmetic anywhere else in the screen.
 */
export function sessionsDone(assignment: RelationshipAssignment): SessionsDone {
  const done = assignment.sessions.filter((session) => session.status === 'completed').length
  return {
    done,
    total: assignment.program_version.repeats_forever ? null : assignment.sessions.length,
  }
}

/**
 * Said in one line, and never as a percentage: a share of a total that grows
 * every week would fall while she trains.
 */
export function progressLine(assignment: RelationshipAssignment): string {
  const { done, total } = sessionsDone(assignment)
  if (total === null) {
    return done === 1 ? '1 sesión hecha' : `${String(done)} sesiones hechas`
  }
  return `${String(done)} de ${String(total)} sesiones hechas`
}

/**
 * The days the planted calendar covers, read off its ends rather than computed:
 * the operation answers the sessions in calendar order, so the first and the
 * last are the span. Null when nothing was planted, which is not a span of one
 * day.
 */
export function spanLine(assignment: RelationshipAssignment): string | null {
  const sessions = assignment.sessions
  const first = sessions.at(0)
  const last = sessions.at(-1)
  if (!first || !last) return null
  const from = formatCalendarDay(first.scheduled_on)
  if (first.scheduled_on === last.scheduled_on) return from
  return `${from} — ${formatCalendarDay(last.scheduled_on)}`
}

/**
 * Whether the gym still runs this program for her.
 *
 * `management` goes null when the organization stops managing it, and from that
 * moment the plan is hers: nobody here reschedules it or adjusts it any more.
 * That is a different thing from the program having ended, so it is said
 * separately from the status.
 */
export function managedLine(assignment: RelationshipAssignment): string {
  return assignment.management
    ? `Lo administramos desde el ${formatInstantDay(assignment.management.since)}`
    : 'Ya no lo administramos: el plan quedó en sus manos'
}

/**
 * That the plan was adapted for her, and when it last was.
 *
 * It never says what was adapted. Every revision points at a `planned_step_id`
 * and this answer carries no steps, so a sentence naming one would be invented.
 * Null when there are none, because «sin ajustes» is a line nobody needs.
 */
export function adjustmentsLine(assignment: RelationshipAssignment): string | null {
  const revisions = assignment.adjustments
  if (revisions.length === 0) return null
  const latest = revisions.reduce((newest, revision) =>
    revision.revised_at > newest.revised_at ? revision : newest,
  )
  const when = formatInstantDay(latest.revised_at)
  return revisions.length === 1
    ? `Ajustado para ella una vez, la última el ${when}`
    : `Ajustado para ella ${String(revisions.length)} veces, la última el ${when}`
}

/**
 * How the version is named on screen: its title and which version it is.
 *
 * The number matters to a coach because the program is published as immutable
 * versions — hers is the one she was given, and the gym may already be on a
 * later one.
 */
export function versionLine(assignment: RelationshipAssignment): string {
  return `Versión ${String(assignment.program_version.version_number)}`
}

/**
 * A program with no end, said once where the absent total would otherwise be
 * read as a missing number.
 */
export function growsForever(assignment: RelationshipAssignment): boolean {
  return assignment.program_version.repeats_forever
}
