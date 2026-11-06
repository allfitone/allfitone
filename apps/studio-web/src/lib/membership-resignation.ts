/**
 * Leaving an organization yourself.
 *
 * It is the sibling of ending somebody else's membership and lives somewhere
 * else on purpose: `organizations.resign_membership` resolves the membership
 * **from the person in the transaction context**, not from an id in the path,
 * and the termination command refuses `target.person_id = actor` outright. So
 * this is never an action on a row in the team directory — it is an action on
 * your own card, in the list of gyms you work in.
 *
 * What the command does, read from the migration rather than assumed: it closes
 * every open role, ends the professional assignments through
 * `relationships.end_assignments_for_membership`, marks the membership, and
 * **enqueues one notice per owner and admin of the gym who has a contact
 * email**. Authorship survives because the command closes rows and deletes
 * nothing.
 *
 * Two things set it apart from the administrator's version:
 *
 * - **The notice actually arrives.** `organization.membership_resigned.v1` has
 *   a worker that claims it, with no flag in front of it, and a coverage test
 *   that exists because a delivery event once went unclaimed in silence. The
 *   screen may say the administration is told; the relationship-termination
 *   screen may not.
 * - **It converges only on a resignation.** A membership an administrator ended
 *   is not one, and replaying gets `P0002` rather than a quiet success.
 */

import type { Membership } from './studio-api'

/**
 * Criterion 2 is the one a role-shaped gate would get wrong: **any active
 * non-owner membership may resign, even with no roles left.** The command asks
 * only that the membership be active and hold no live `owner` role.
 */
export function canResign(membership: Membership): boolean {
  if (membership.status !== 'active') return false
  return !membership.roles.includes('owner')
}

/** Criterion 1, as the reason the control is absent rather than a refusal. */
export function whyResignationUnavailable(
  membership: Membership,
): 'owner' | 'already-ended' | null {
  if (membership.status !== 'active') return 'already-ended'
  if (membership.roles.includes('owner')) return 'owner'
  return null
}

/**
 * What the person leaving cannot see, and would otherwise assume wrongly.
 *
 * Only a coach holds professional assignments, so only a coach leaves clients
 * without anybody attending them — and that is the half they are most likely to
 * care about, because those are people they were looking after. Saying it to
 * somebody who attended nobody would invent a worry.
 */
export function whatResigningLeavesSentence(membership: Membership): string {
  if (membership.roles.includes('coach')) {
    return 'Las personas que atiendes siguen siendo clientes del gimnasio y quedan sin profesional responsable: la administración tendrá que reasignarlas. No se termina ninguna relación ni se revoca ningún permiso.'
  }
  return 'No atiendes a nadie en este gimnasio, así que no dejas ninguna relación sin responsable.'
}

export type ResignationRefusal = 'not-found' | 'rejected' | 'unavailable'

export function resignationRefusalFor(status: number | undefined): ResignationRefusal {
  // There is no 403 to map: the command authorises by being you, so a reader
  // who may reach this screen may always run it on their own membership.
  if (status === 404) return 'not-found'
  if (status === 409 || status === 422) return 'rejected'
  return 'unavailable'
}

export function resignationRefusalTitle(refusal: ResignationRefusal): string {
  if (refusal === 'not-found') return 'Ya no tienes esta vinculación'
  if (refusal === 'rejected') return 'No puedes renunciar todavía'
  return 'No pudimos registrar tu renuncia'
}

export function resignationRefusalDescription(refusal: ResignationRefusal): string {
  if (refusal === 'not-found') {
    return 'Puede que la administración la haya cerrado mientras tenías esta pantalla abierta. Actualiza para ver cómo quedó.'
  }
  if (refusal === 'rejected') {
    // The one the command refuses by design, and the screen already hides the
    // control for it — so arriving here means somebody made you owner since
    // this page loaded.
    return 'Un propietario no puede renunciar: primero hay que transferir la propiedad del gimnasio a otra persona. Si acabas de recibir ese rol, actualiza la pantalla.'
  }
  return 'La conexión falló de forma temporal. Sigues vinculado, así que puedes intentarlo otra vez.'
}
