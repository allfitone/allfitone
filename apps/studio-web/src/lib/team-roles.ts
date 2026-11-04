/**
 * The rules for giving somebody a role in the organization.
 *
 * The one worth stating before anything uses it: **a role is not a consent.**
 * Making somebody a coach lets them work in Studio; it gives them access to no
 * person's data. That only ever comes from the person, category by category.
 * The two are easy to conflate — "coach" sounds like it comes with clients —
 * and the screen has to say so rather than let anyone assume it.
 */

import type { OrganizationMembership, OrganizationRole } from './studio-api'

const MANAGE_ROLES = 'manage_roles'

/** Owner is deliberately absent: it changes only through a transfer. */
export const ASSIGNABLE_ROLES = ['admin', 'coach', 'staff'] as const

export type AssignableRole = (typeof ASSIGNABLE_ROLES)[number]

/**
 * Read from the role catalogue the server publishes, never from a list of role
 * codes written here: PostgreSQL grants this through a capability, and a second
 * copy of that mapping drifts the day the grant changes.
 */
export function canManageRoles(
  roles: readonly string[],
  catalog: readonly OrganizationRole[] | undefined,
): boolean {
  if (!catalog?.length) return false
  return roles.some((role) =>
    catalog
      .find((entry) => entry.code === role)
      ?.capabilities.some((capability) => capability.code === MANAGE_ROLES),
  )
}

/**
 * Only a live membership takes a new role, and only one it does not already
 * hold. Granting a role somebody has is harmless — the command refuses to
 * duplicate it — but offering it spends a click to change nothing, and leaves
 * the reader unsure whether anything happened.
 */
export function grantableRoles(membership: OrganizationMembership): readonly AssignableRole[] {
  if (membership.status !== 'active') return []
  return ASSIGNABLE_ROLES.filter((role) => !membership.roles.includes(role))
}

export function canReceiveARole(membership: OrganizationMembership): boolean {
  return grantableRoles(membership).length > 0
}

/**
 * Only a live membership gives a role back, and only one it actually holds.
 * Owner is absent for the same reason it is absent from the grant: the command
 * refuses it, and the contract's path parameter cannot even spell it.
 */
export function revocableRoles(membership: OrganizationMembership): readonly AssignableRole[] {
  if (membership.status !== 'active') return []
  return ASSIGNABLE_ROLES.filter((role) => membership.roles.includes(role))
}

export function canLoseARole(membership: OrganizationMembership): boolean {
  return revocableRoles(membership).length > 0
}

/**
 * What the reader cannot see, and would otherwise get backwards.
 *
 * Criterion 2 and criterion 3 of `HU-STUDIO-020` are the same fact from two
 * sides: taking `coach` away ends that person's professional assignments, and
 * taking `admin` or `staff` away does **not**, so long as `coach` is still
 * held. The database enforces exactly that — `revoke_membership_role` calls
 * `relationships.end_assignments_for_membership` only when the role is `coach`
 * — and the sentence has to turn on the same condition or it tells half the
 * readers something false.
 *
 * The ending is a closed row, not a filter: `status = 'ended'`. Giving the role
 * back does not reopen it, which is the part nobody guesses.
 */
export function whatRevokingStopsSentence(
  role: AssignableRole,
  membership: OrganizationMembership,
  name: string,
): string {
  if (role === 'coach') {
    return `Las personas que atiende dejan de estar a su cargo en el acto. Lo que cada una autorizó sigue en pie — no se revoca nada suyo —, pero ${name} deja de poder ejercerlo, y volver a darle el rol no se las devuelve: hay que asignárselas otra vez.`
  }
  if (membership.roles.includes('coach')) {
    return `Sigue siendo coach, así que las personas que atiende continúan a su cargo y no se toca ninguna autorización.`
  }
  return `No atiende a nadie, así que no cambia el acceso a los datos de ninguna persona.`
}

export type RoleGrantRefusal = 'not-allowed' | 'gone' | 'rejected' | 'unavailable'

export function roleGrantRefusalFor(status: number | undefined): RoleGrantRefusal {
  if (status === 403) return 'not-allowed'
  if (status === 404) return 'gone'
  if (status === 409 || status === 422) return 'rejected'
  return 'unavailable'
}

export function roleGrantRefusalTitle(refusal: RoleGrantRefusal): string {
  if (refusal === 'not-allowed') return 'No puedes cambiar roles'
  if (refusal === 'gone') return 'Esta membresía ya no está'
  if (refusal === 'rejected') return 'Ese rol no se puede otorgar aquí'
  return 'No pudimos otorgar el rol'
}

export function roleGrantRefusalDescription(refusal: RoleGrantRefusal): string {
  if (refusal === 'not-allowed') {
    return 'Tu rol en esta organización no incluye administrar los roles del equipo.'
  }
  if (refusal === 'gone') {
    return 'Puede que la persona haya salido del equipo mientras tenías esta pantalla abierta. Actualiza la lista.'
  }
  if (refusal === 'rejected') {
    // The one the server refuses by design: propietario changes only through a
    // transfer of ownership, never through this command.
    return 'La propiedad del gimnasio solo cambia con una transferencia, no otorgando un rol. Si la persona ya tenía el rol, no hacía falta volver a dárselo.'
  }
  return 'La conexión falló de forma temporal. Nadie cambió de rol, así que puedes intentarlo otra vez.'
}

/**
 * Revoking refuses for the same four reasons as granting, but each one means
 * something else here, so the words are its own. The mapping is shared because
 * the statuses are the same ones; the sentences are not, because "ya no está"
 * about a role somebody no longer holds is a different event from "ya no está"
 * about a membership that cannot take one.
 */
export type RoleRevokeRefusal = RoleGrantRefusal

export const roleRevokeRefusalFor = roleGrantRefusalFor

export function roleRevokeRefusalTitle(refusal: RoleRevokeRefusal): string {
  if (refusal === 'not-allowed') return 'No puedes cambiar roles'
  if (refusal === 'gone') return 'Ese rol ya no estaba'
  if (refusal === 'rejected') return 'Ese rol no se puede retirar aquí'
  return 'No pudimos retirar el rol'
}

export function roleRevokeRefusalDescription(refusal: RoleRevokeRefusal): string {
  if (refusal === 'not-allowed') {
    return 'Tu rol en esta organización no incluye administrar los roles del equipo.'
  }
  if (refusal === 'gone') {
    // The person does not hold it any more, or the membership itself is gone.
    // Either way the screen is showing a picture from before somebody else
    // acted, and re-reading is the only honest next step.
    return 'Alguien lo retiró, o la persona salió del equipo, mientras tenías esta pantalla abierta. Actualiza la lista para ver cómo quedó.'
  }
  if (refusal === 'rejected') {
    return 'La propiedad del gimnasio solo cambia con una transferencia, nunca retirando un rol. Si la membresía ya no está activa, no hay nada que retirarle.'
  }
  return 'La conexión falló de forma temporal. Nadie perdió ningún rol, así que puedes intentarlo otra vez.'
}
