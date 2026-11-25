/**
 * Which section of «Mi cuenta» is open, and how the address says so.
 *
 * The library settled this for the product: the address names the tab, so the
 * section survives a reload and can be sent to somebody. The account was the
 * last register keeping its tab in component state alone, where reloading sent
 * the reader back to the first section and no link to a section existed.
 *
 * **Absent is not the same as unknown here**, which is why this returns null
 * rather than a default. The account opens on the profile for somebody who has
 * one and on their spaces for somebody who does not, and only the screen has
 * read the account by then. A function that picked a tab would be picking it
 * without the one fact that decides.
 */

/** The three sections, in the order the strip shows them. */
export type AccountTab = 'profile' | 'spaces' | 'preferences'

const TABS: readonly AccountTab[] = ['profile', 'spaces', 'preferences']

export function isAccountTab(value: unknown): value is AccountTab {
  return TABS.some((tab) => tab === value)
}

/** Null when the address names no tab, and when it names one that is not ours. */
export function accountTabFromQuery(value: string | string[] | undefined): AccountTab | null {
  const named = Array.isArray(value) ? value[0] : value
  return TABS.find((tab) => tab === named) ?? null
}

/**
 * Every tab is named, including the one the account would have opened on.
 * The library can leave its first tab out of the address because that tab is
 * fixed; here it depends on the reader, so a bare `/account` means «decide for
 * me» and would reopen somewhere else for somebody else.
 */
export function accountPath(tab: AccountTab): string {
  return `/account?tab=${tab}`
}
