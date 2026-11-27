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
 * Two names were dropped from the contract rather than left unreported.
 * `studio.team_invitation_new` stopped being a screen when inviting became a
 * dialog over the invitations — the button that opens it never touches the
 * address, so reporting it for the old deep link alone would have counted how
 * somebody arrived rather than what they opened. `studio.profile` never fired
 * at all: `/profile` is a server redirect to `/account`, so nothing mounts
 * there to report it. A declared name nobody sends is a number that silently
 * reads as zero, which is worse than an absent one.
 *
 * The test beside this file holds the two ends together: every `studio.` name
 * the contract declares has an address here that produces it, and no address
 * produces a name the contract does not declare.
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
  if (pathname.includes('/team')) return TEAM_SCREEN[teamTabFromQuery(tab ?? undefined)]
  if (pathname.startsWith('/invitations')) return 'studio.invitation_decision'
  if (pathname.startsWith('/organizations/')) return 'studio.organization_overview'
  return 'studio.entry'
}
