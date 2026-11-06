/**
 * Ending somebody's membership in the organization.
 *
 * The rule worth stating before anything uses it, because it is the opposite of
 * what the reader fears: **ending a membership does not end the gym's service
 * relationships.** The clients that person was attending stay active and
 * **lose their responsible professional**, so somebody has to reassign them.
 *
 * It is not a guard, it is an absence: `organizations.terminate_membership`
 * closes the roles, ends the professional assignments and marks the membership,
 * and never touches `relationships.service_relationships`. Authorship survives
 * for the same reason — the command closes rows and deletes nothing.
 *
 * Three cases the command refuses, and the screen has to refuse first because
 * each one would come back as a `422` the reader cannot interpret:
 *
 * - **The owner.** Ownership leaves only through a transfer; terminating it
 *   would orphan the tenant.
 * - **Yourself.** Leaving is a resignation (`OP-ORG-010`), a different command
 *   with a different story. The function rejects `target.person_id = actor`.
 * - **A membership that already ended.** It converges without effect, so the
 *   control would spend a click to change nothing.
 */

import type { OrganizationMembership, OrganizationRole } from './studio-api'

const MANAGE_MEMBERSHIPS = 'manage_memberships'

/**
 * Its own capability, and **not** `manage_roles`.
 *
 * They are two entries in the catalogue because they are two powers: changing
 * what somebody may do, and ending their participation. A reader can hold
 * either without the other, so a single gate would both hide the action from
 * somebody allowed to use it and offer it to somebody who would get a `403`.
 *
 * Read from the catalogue the server publishes, never from a list of role
 * codes written here — PostgreSQL grants this through the capability, and a
 * second copy of that mapping drifts the day the grant changes.
 */
export function canManageMemberships(
  roles: readonly string[],
  catalog: readonly OrganizationRole[] | undefined,
): boolean {
  if (!catalog?.length) return false
  return roles.some((role) =>
    catalog
      .find((entry) => entry.code === role)
      ?.capabilities.some((capability) => capability.code === MANAGE_MEMBERSHIPS),
  )
}

/**
 * `membership_id` and not the person: the team list is a minimum identity
 * projection and carries no `person_id`, by design. The reader's own
 * `membership_id` comes from the organization context, and in production both
 * sides are `organizations.organization_memberships.id`.
 */
export function canTerminateMembership(
  membership: OrganizationMembership,
  ownMembershipId: string,
): boolean {
  if (membership.status !== 'active') return false
  if (membership.membership_id === ownMembershipId) return false
  return !membership.roles.includes('owner')
}

/**
 * Why the action is absent, when it is. The menu does not render a disabled
 * item — it renders nothing — so this exists for the one place that needs to
 * explain itself rather than stay silent.
 */
export type TerminationUnavailable = 'own-membership' | 'owner' | 'already-ended' | null

export function whyTerminationUnavailable(
  membership: OrganizationMembership,
  ownMembershipId: string,
): TerminationUnavailable {
  if (membership.status !== 'active') return 'already-ended'
  if (membership.membership_id === ownMembershipId) return 'own-membership'
  if (membership.roles.includes('owner')) return 'owner'
  return null
}

/**
 * What the reader cannot see, and would get backwards.
 *
 * Only a coach holds professional assignments, so only a coach leaves clients
 * without anybody attending them. Saying it for a staff member would send an
 * administrator looking for relationships to reassign that never existed;
 * never saying it lets a gym end its only coach and keep clients nobody
 * attends, without noticing.
 */
export function whatTerminationLeavesSentence(membership: OrganizationMembership): string {
  if (membership.roles.includes('coach')) {
    return 'Las personas que atiende siguen siendo clientes del gimnasio y quedan sin profesional responsable: hay que reasignarlas una por una. No se termina ninguna relación ni se revoca ningún permiso — lo que falta es quién las atienda.'
  }
  return 'No atiende a nadie, así que no deja ninguna relación sin responsable.'
}

export type TerminationRefusal = 'not-allowed' | 'gone' | 'rejected' | 'unavailable'

export function terminationRefusalFor(status: number | undefined): TerminationRefusal {
  if (status === 403) return 'not-allowed'
  if (status === 404) return 'gone'
  if (status === 409 || status === 422) return 'rejected'
  return 'unavailable'
}

export function terminationRefusalTitle(refusal: TerminationRefusal): string {
  if (refusal === 'not-allowed') return 'No puedes dar de baja a nadie'
  if (refusal === 'gone') return 'Esta membresía ya no está'
  if (refusal === 'rejected') return 'Esta membresía no se puede dar de baja'
  return 'No pudimos dar de baja'
}

export function terminationRefusalDescription(refusal: TerminationRefusal): string {
  if (refusal === 'not-allowed') {
    return 'Tu rol en esta organización no incluye administrar las membresías del equipo.'
  }
  if (refusal === 'gone') {
    return 'Puede que alguien la haya cerrado mientras tenías esta pantalla abierta. Actualiza la lista para ver cómo quedó.'
  }
  if (refusal === 'rejected') {
    // The three the command refuses on purpose. The screen hides the action in
    // all three cases, so arriving here means the list was stale — somebody
    // became owner, or the reader is looking at their own row after a change.
    return 'Al propietario hay que transferirle la propiedad antes, y la membresía propia se cierra renunciando, no dando de baja. Actualiza la lista: lo que ves puede ser de antes de que alguien más cambiara algo.'
  }
  return 'La conexión falló de forma temporal. Nadie salió del equipo, así que puedes intentarlo otra vez.'
}
