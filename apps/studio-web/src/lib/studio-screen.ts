/**
 * Which screen a reader is looking at, as the telemetry contract names it.
 *
 * The name is a screen, never a route, and the two stopped being the same
 * thing when the team became one address with three tabs. `usePathname` drops
 * the query, so a mapping built from the path alone would report the directory
 * for all three sections and two declared names would never fire again — and
 * these three are the only names in the contract that tell one workspace
 * screen from another. Everything else resolves to the organization overview.
 *
 * `studio.team_invitation_new` is deliberately absent. Inviting is a dialog
 * over the invitations now, and the button that opens it never touches the
 * address, so reporting the name for the old deep link alone would count how
 * somebody arrived rather than what they opened.
 */
import type { TelemetryScreen } from '@allfitone/telemetry'

import { teamTabFromQuery, type TeamTab } from './team-sections'

const TEAM_SCREEN: Record<TeamTab, TelemetryScreen> = {
  members: 'studio.team_directory',
  invitations: 'studio.team_invitations',
  roles: 'studio.team_roles',
}

/** `tab` is the address's own `?tab=`, absent on every screen that has no tabs. */
export function studioScreen(pathname: string, tab: string | null = null): TelemetryScreen {
  if (pathname === '/account') return 'studio.account'
  if (pathname === '/profile') return 'studio.profile'
  if (pathname.includes('/team')) return TEAM_SCREEN[teamTabFromQuery(tab ?? undefined)]
  if (pathname.startsWith('/invitations')) return 'studio.invitation_decision'
  if (pathname.startsWith('/organizations/')) return 'studio.organization_overview'
  return 'studio.entry'
}
