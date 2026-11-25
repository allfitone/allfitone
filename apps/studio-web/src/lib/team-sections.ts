/**
 * Which section of «Equipo» is open, and how the address says so.
 *
 * The team was three routes under one sidebar entry, each with its own page
 * heading and a sub-navigation of its own above it. The library had already
 * settled the shape the rest of the workspace follows: one screen, one
 * heading, and the sections as tabs the address names. Three headings for one
 * entry is what made the workspace stop confirming where you were.
 *
 * Unlike the account, the first tab here is fixed, so the address is the only
 * place the tab lives and nothing has to reconcile it with component state.
 */

export type TeamTab = 'members' | 'invitations' | 'roles'

const TABS: readonly TeamTab[] = ['members', 'invitations', 'roles']
const DEFAULT_TAB: TeamTab = 'members'

function single(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value
}

/** An address that names no tab, or one that does not exist, opens the first. */
export function teamTabFromQuery(value: string | string[] | undefined): TeamTab {
  const named = single(value)
  return TABS.find((tab) => tab === named) ?? DEFAULT_TAB
}

export function teamPath(organizationId: string, tab: TeamTab = DEFAULT_TAB): string {
  const base = `/organizations/${organizationId}/team`
  return tab === DEFAULT_TAB ? base : `${base}?tab=${tab}`
}

/**
 * Where «Invitar integrante» leads. Two registers link to it, so the address
 * is built once: when this form becomes a dialog over the invitations, only
 * this function changes.
 */
export function teamInvitationFormPath(organizationId: string): string {
  return `/organizations/${organizationId}/team/invitations/new`
}
