/**
 * Which section of «Clientes» is open, and how the address says so.
 *
 * The directory, the category catalogue, the authorizations and the reader's
 * own correction proposals were four addresses under one sidebar entry, each
 * titling itself differently, reached from a row of text links at the foot of
 * the directory. They are one screen now, as the library's three are and as
 * the team's three became.
 *
 * The first tab is fixed, so the address is the only place the tab lives and
 * nothing has to reconcile it with component state.
 */

export type ClientTab = 'directory' | 'categories' | 'authorizations' | 'proposals'

const TABS: readonly ClientTab[] = ['directory', 'categories', 'authorizations', 'proposals']
const DEFAULT_TAB: ClientTab = 'directory'

function single(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value
}

/** An address that names no tab, or one that does not exist, opens the first. */
export function clientTabFromQuery(value: string | string[] | undefined): ClientTab {
  const named = single(value)
  return TABS.find((tab) => tab === named) ?? DEFAULT_TAB
}

export function clientsPath(organizationId: string, tab: ClientTab = DEFAULT_TAB): string {
  const base = `/organizations/${organizationId}/clients`
  return tab === DEFAULT_TAB ? base : `${base}?tab=${tab}`
}
