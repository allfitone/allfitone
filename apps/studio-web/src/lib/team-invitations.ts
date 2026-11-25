import type { Membership, StudioApiError, TeamInvitationCreate } from './studio-api'

export type TeamInvitationRole = TeamInvitationCreate['intents'][number]['proposed_role_code']

const ROLE_LABELS: Readonly<Record<TeamInvitationRole, string>> = {
  admin: 'Administrador',
  coach: 'Coach',
  staff: 'Staff',
}

export function canInviteTeam(roles: readonly string[]): boolean {
  return roles.some((role) => role === 'owner' || role === 'admin' || role === 'staff')
}

export function invitationRoleOptions(
  roles: Membership['roles'],
): Array<{ value: TeamInvitationRole; label: string }> {
  const allowed: TeamInvitationRole[] = roles.some((role) => role === 'owner' || role === 'admin')
    ? ['admin', 'coach', 'staff']
    : roles.includes('staff')
      ? ['staff']
      : []
  return allowed.map((value) => ({ value, label: ROLE_LABELS[value] }))
}

export function invitationRoleLabel(role: TeamInvitationRole): string {
  return ROLE_LABELS[role]
}

export const INVITATION_CREATE_UNKNOWN_ERROR =
  'No pudimos enviar la invitación. Conservamos el intento para que puedas reintentar.'

/** One message per answer the command gives, as the library's creations have. */
export function invitationCreateMessage(error: StudioApiError): string {
  if (error.status === 403) return 'Tu rol actual no permite crear esta invitación.'
  if (error.status === 404) return 'Ya no tienes acceso activo a esta organización.'
  if (error.status === 422) return 'Revisa el correo y el rol propuesto.'
  if (error.status === 503) {
    return 'Las invitaciones están pausadas temporalmente. Reintenta más tarde.'
  }
  return INVITATION_CREATE_UNKNOWN_ERROR
}

/**
 * What the register says after the command answers. The dialog closes onto the
 * list, which carries the rest — the address, the proposed role, when it
 * expires — so this only has to say that something happened, and which of the
 * two things it was: inviting an address that already had an invitation
 * renews that one rather than adding a second.
 */
export function invitationCreatedNotice(contactHint: string, reused: boolean): string {
  return reused
    ? `Renovamos la invitación de ${contactHint}.`
    : `Enviamos la invitación a ${contactHint}.`
}
