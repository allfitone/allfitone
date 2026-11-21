/**
 * Where Cobros opens: the tab its address names, and a request to create a plan.
 *
 * The same two rules the library set. The address names the tab, so the way
 * back from a plan lands on the plans and not on who pays; and creating a plan
 * is a dialog over the list, which an address can ask for with `new=1`.
 */

export type BillingTab = 'subscriptions' | 'plans'

const TABS: readonly BillingTab[] = ['subscriptions', 'plans']
const DEFAULT_TAB: BillingTab = 'subscriptions'

function single(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value
}

/** An address that names no tab, or one that does not exist, opens on who pays. */
export function billingTabFromQuery(value: string | string[] | undefined): BillingTab {
  const named = single(value)
  return TABS.find((tab) => tab === named) ?? DEFAULT_TAB
}

/** `?tab=plans&new=1` opens the dialog. Only plans are created here, so only that tab asks. */
export function billingCreateFromQuery(
  value: string | string[] | undefined,
  tab: BillingTab,
): boolean {
  return tab === 'plans' && single(value) === '1'
}

export function billingPath(organizationId: string, tab: BillingTab = DEFAULT_TAB): string {
  const base = `/organizations/${organizationId}/billing`
  return tab === DEFAULT_TAB ? base : `${base}?tab=${tab}`
}

export function billingCreatePath(organizationId: string): string {
  return `/organizations/${organizationId}/billing?tab=plans&new=1`
}

export function planPath(organizationId: string, planId: string): string {
  return `/organizations/${organizationId}/billing/plans/${planId}`
}
