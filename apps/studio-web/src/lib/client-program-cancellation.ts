/**
 * Stopping a program the organization manages: `HU-STUDIO-050`.
 *
 * Its three criteria, and who holds each one:
 *
 * 1. **Only future sessions nobody started are cancelled.** The server decides
 *    which, and says how many in `sessions_cancelled`. The screen's share is to
 *    say so before the click and to report that figure after, rather than
 *    counting the rows it happens to have on screen.
 * 2. **Cancelling deletes no history.** What she trained and the sessions
 *    already past stay (`T-ASG-5`). This is the half a reader fears is false,
 *    so the dialog says it as plainly as the first.
 * 3. **The assignment stays in her personal history.** Nothing here does that —
 *    it is why the card is left on screen afterwards with its new status instead
 *    of disappearing, which would show the opposite of what happened.
 *
 * **Two rules come from the contract and from no criterion.** Everybody needs
 * `relationship_training` at `contribute`, which is the same gate as assigning,
 * so `canCancelAssignment` reuses that classification rather than copying it.
 * And a paused service answers 409: the contract says it is resolved by
 * reactivating the service or ending the relationship, **never program by
 * program** — so that refusal cannot say "try again".
 */

import type { AssignPermission } from './client-program-assignment'
import type { AssignmentCancellation, RelationshipAssignment } from './studio-api'

/**
 * Whether to offer the action at all.
 *
 * Management is what decides, not the status alone: the contract answers 409
 * `conflict` for a program the organization no longer manages, and a program
 * waiting on her choice is still managed and still stoppable. An assignment
 * already ended or cancelled has nothing left to stop.
 *
 * The permission is checked here for the same reason assigning checks it: her
 * card already carries the level she granted, so the screen decides before
 * asking instead of offering a button the server will refuse. The refusal is
 * still handled, because she can withdraw the level while the dialog is open.
 */
export function canCancelAssignment(
  assignment: RelationshipAssignment,
  permission: AssignPermission,
): boolean {
  if (permission !== 'granted') return false
  if (assignment.management === null) return false
  return assignment.status === 'active' || assignment.status === 'detached_pending_choice'
}

/** Which program is about to stop, named the way the card names it. */
export function cancelTitle(assignment: RelationshipAssignment): string {
  const version = assignment.program_version
  return `¿Cancelar «${version.title}», versión ${String(version.version_number)}?`
}

/** Criteria 1 and 2, both halves, before the click. */
export function cancelConsequences(): string[] {
  return [
    'Se detienen las sesiones de hoy en adelante que ella no haya empezado.',
    'Lo que ya entrenó y las sesiones pasadas quedan intactas, y el programa sigue en su historial.',
    'Una sesión que ya empezó no se detiene.',
  ]
}

/**
 * What stopped, from the answer's own figure.
 *
 * Nothing to stop is not a failure — a program whose sessions were all past or
 * already started cancels with none — and "0 sesiones" invites the reader to
 * wonder what went wrong, so that case says it in words.
 */
export function cancelOutcome(cancellation: AssignmentCancellation): string {
  const stopped = cancellation.sessions_cancelled
  if (stopped === 0) return 'Cancelado. No quedaban sesiones futuras por detener.'
  if (stopped === 1) return 'Cancelado. Se detuvo 1 sesión futura.'
  return `Cancelado. Se detuvieron ${String(stopped)} sesiones futuras.`
}

/**
 * Why the action is not offered, in the coach's words. Null when it is.
 *
 * Two answers and not one, because «she shared her training only to read» and
 * «she never shared her training» are different facts and the coach can act on
 * the first by asking her for the level.
 */
export function cancelPermissionNote(permission: AssignPermission): string | null {
  if (permission === 'granted') return null
  if (permission === 'read-only') {
    return 'Te autorizó su entrenamiento solo para leerlo, así que no puedes cancelarle un programa. Hace falta que lo suba a nivel de registro, y eso lo decide ella.'
  }
  return 'No te autorizó su entrenamiento, así que no puedes cancelarle un programa. El permiso que hace falta es el de entrenamiento, en nivel de registro.'
}

/**
 * What a refusal means, in the coach's words.
 *
 * **The two causes of the 409 are told apart by their code**, because the advice
 * is opposite: a paused service is resolved by reactivating it or ending the
 * relationship — never program by program — while a program the organization no
 * longer manages cannot be stopped by anybody here. One sentence covering both
 * would be sound advice for one case and misdirection for the other.
 *
 * Every sentence says whether the program kept running, which is the question a
 * failed command leaves open.
 */
export function cancelWriteFailure(status: number, code?: string): string {
  if (status === 409 && code === 'service-paused') {
    return 'No se canceló: su servicio con la organización está pausado. Eso se resuelve reactivándolo o terminando el vínculo, no programa por programa.'
  }
  if (status === 409) {
    return 'No se canceló: este programa ya no lo administramos, así que no hay nada que detener desde aquí.'
  }
  if (status === 403) {
    return 'No se canceló: tu rol o el permiso de entrenamiento no alcanzan para detener este programa.'
  }
  if (status === 404) return 'Este programa ya no está disponible para tu organización.'
  if (status === 503) {
    return 'No pudimos cancelar el programa ahora mismo. Sigue activo; vuelve a intentarlo en un momento.'
  }
  return 'No pudimos cancelar el programa. Sigue activo; vuelve a intentarlo.'
}
