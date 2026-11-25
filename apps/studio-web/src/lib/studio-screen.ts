/**
 * Which screen a reader is looking at, as the telemetry contract names it.
 *
 * The name is a screen, never a route, and the two stopped being the same
 * thing when the team became one address with three tabs. `usePathname` drops
 * the query, so a mapping built from the path alone would report the directory
 * for all three sections and three declared names would never fire again —
 * and these four are the only names in the contract that tell one workspace
 * screen from another. Everything else resolves to the organization overview.
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
  // Matched before the team itself, or the form would report the directory.
  if (pathname.includes('/team/invitations/new')) return 'studio.team_invitation_new'
  if (pathname.includes('/team')) return TEAM_SCREEN[teamTabFromQuery(tab ?? undefined)]
  if (pathname.startsWith('/invitations')) return 'studio.invitation_decision'
  if (pathname.startsWith('/organizations/')) return 'studio.organization_overview'
  return 'studio.entry'
}
