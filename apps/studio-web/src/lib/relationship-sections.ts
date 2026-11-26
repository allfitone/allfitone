/**
 * Which section of a client's link is open, and how the address says so.
 *
 * The state and the history were two addresses for one subject, and the only
 * way into the history was a button in the state's header, answered by a
 * «Volver al vínculo» in its own. Going between them was two presses, and the
 * two titled themselves differently — the history did not title itself at all,
 * because its route was never added to the workspace's map and fell through to
 * «Studio».
 *
 * They are tabs of one address now, which is also why that cannot happen
 * again: there is one route to name.
 *
 * The address itself is built by `relationshipPath` in `client-directory.ts`,
 * which already had that job: one builder for one address.
 */

export type RelationshipTab = 'state' | 'history'

const TABS: readonly RelationshipTab[] = ['state', 'history']
const DEFAULT_TAB: RelationshipTab = 'state'

function single(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value
}

/** An address that names no tab, or one that does not exist, opens the state. */
export function relationshipTabFromQuery(value: string | string[] | undefined): RelationshipTab {
  const named = single(value)
  return TABS.find((tab) => tab === named) ?? DEFAULT_TAB
}
