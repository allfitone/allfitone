import type { OrganizationRoleCode } from './studio-api'

const DIRECTORY_ROLES = new Set<OrganizationRoleCode>(['owner', 'admin', 'staff'])

const ROLE_LABELS: Readonly<Record<OrganizationRoleCode, string>> = {
  owner: 'Propietario',
  admin: 'Administrador',
  coach: 'Coach',
  staff: 'Staff',
}

export function canViewTeamDirectory(roles: readonly string[]): boolean {
  return roles.some((role) => DIRECTORY_ROLES.has(role as OrganizationRoleCode))
}

export function organizationRoleLabel(role: OrganizationRoleCode): string {
  return ROLE_LABELS[role]
}

/**
 * What to call a role code that may not be one of the four above.
 *
 * The role catalogue belongs to the server, and codes that travel inside a
 * projection — the team summary of what needs attention today — arrive as plain
 * strings from it. A code this app has no word for means the catalogue grew, so
 * it reads as itself instead of as a blank.
 */
export function organizationRoleName(code: string): string {
  return ROLE_LABELS[code as OrganizationRoleCode] ?? code
}

export function memberInitials(displayName: string): string {
  return displayName
    .trim()
    .split(/\s+/u)
    .slice(0, 2)
    .map((part) => Array.from(part)[0]?.toLocaleUpperCase('es-CO') ?? '')
    .join('')
}
