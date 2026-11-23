/**
 * The address of a person's file: who, under which case, and which tab.
 *
 * The case travels because every read the file makes is recorded against it.
 * The tab travels so a reload, or a link from «Cobros por seguir», opens where
 * the operator meant; the state is the default and needs no parameter.
 */

export const PERSON_TABS = ['state', 'payments', 'recovery'] as const

export type PersonTab = (typeof PERSON_TABS)[number]

const DEFAULT_TAB: PersonTab = 'state'

export function personTabFromQuery(value: string | null): PersonTab {
  return PERSON_TABS.find((tab) => tab === value) ?? DEFAULT_TAB
}

export function personFileHref(
  personId: string,
  caseReference: string,
  tab: PersonTab = DEFAULT_TAB,
): string {
  const query = new URLSearchParams()
  if (caseReference) query.set('case_reference', caseReference)
  if (tab !== DEFAULT_TAB) query.set('tab', tab)
  const search = query.toString()
  return search ? `/people/${personId}?${search}` : `/people/${personId}`
}
