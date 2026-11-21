/**
 * The plans a gym sells, as the whole team reads them: `HU-STUDIO-077`.
 *
 * A plan is a name; its price lives in versions, and **one price is on sale at
 * a time** — publishing a new one retires the previous in the same command
 * (`payments.publish_plan_version`). So a plan is in one of three states, not
 * two:
 *
 * - **a draft**, with a name and no price, which nobody can subscribe to;
 * - **on sale**, with `current_version` being the price on offer;
 * - **off sale**, published once but with every price retired since.
 *
 * Criterion 1, drafts told apart from published versions, is that state: a
 * badge wherever a plan is listed, and a sentence on the plan's own page.
 * Criterion 2, never another organization's plans, is `OP-PAY-006`'s: the read
 * is scoped by the organization in the path. Nothing here filters by it.
 *
 * Every member reads this, coach and staff included, because a price is
 * nobody's personal data. Writing is `manage_billing`'s, which is the same
 * capability the subscriptions screen asks for (`canManageBilling`).
 */

import {
  foldText,
  formatAmount,
  formatDay,
  formatDaySpan,
  formatPeriod,
} from './organization-billing'
import type { OrganizationPlan, PlanDeliveryMode, PlanVersion } from './studio-api'

export function priceLabel(
  version: Pick<PlanVersion, 'amount_minor' | 'currency_code' | 'billing_period'>,
): string {
  return `${formatAmount(version.amount_minor, version.currency_code)} ${formatPeriod(version.billing_period)}`
}

/** Inside a sentence: «$ 120.000 al mes · presencial». */
export function deliveryLabel(mode: PlanDeliveryMode): string {
  return mode === 'in_person' ? 'presencial' : 'remoto'
}

/** Standing alone, in a cell or after a price. */
export function deliveryName(mode: PlanDeliveryMode): string {
  return mode === 'in_person' ? 'Presencial' : 'Remoto'
}

export type PlanState = 'draft' | 'on_sale' | 'off_sale'

export function planState(plan: OrganizationPlan): PlanState {
  if (plan.status === 'draft') return 'draft'
  return plan.on_sale && plan.current_version ? 'on_sale' : 'off_sale'
}

export function planStateLabel(state: PlanState): string {
  if (state === 'draft') return 'Borrador'
  return state === 'on_sale' ? 'A la venta' : 'Fuera de venta'
}

/** What a plan sells at, in a list: the price on sale, or that it has none. */
export function planPriceLine(plan: OrganizationPlan): string {
  const current = plan.on_sale ? plan.current_version : null
  if (current) return `${priceLabel(current)} · ${deliveryName(current.delivery_mode)}`
  return plan.status === 'draft' ? 'Sin precio' : 'Sin precio a la venta'
}

/** Why a plan cannot be bought now, on its own page. Nothing to say of one on sale. */
export function planStateNote(plan: OrganizationPlan): string | undefined {
  const state = planState(plan)
  if (state === 'draft') return 'Todavía no tiene precio, así que nadie puede suscribirse.'
  if (state === 'off_sale') return 'No tiene ningún precio a la venta ahora.'
  return undefined
}

export function priceCountLabel(count: number): string {
  return count === 1 ? '1 precio' : `${count} precios`
}

export function planVersionLine(version: PlanVersion): string {
  return `Versión ${version.version_number} · ${priceLabel(version)} · ${deliveryLabel(version.delivery_mode)}`
}

export function versionStatusLabel(version: Pick<PlanVersion, 'status'>): string {
  return version.status === 'published' ? 'A la venta' : 'Retirada'
}

/** While a price was on sale: since when, or from when to when once retired. */
export function versionSpan(
  version: Pick<PlanVersion, 'status' | 'published_at' | 'deprecated_at'>,
): string {
  return version.deprecated_at
    ? formatDaySpan(version.published_at, version.deprecated_at)
    : `Desde el ${formatDay(version.published_at)}`
}

export function filterPlans(plans: readonly OrganizationPlan[], term: string): OrganizationPlan[] {
  const wanted = foldText(term)
  return plans.filter((plan) => wanted === '' || foldText(plan.name).includes(wanted))
}
