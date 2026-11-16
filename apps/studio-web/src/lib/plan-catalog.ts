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
 * Criterion 2, never another organization's plans, is `OP-PAY-006`'s: the read
 * is scoped by the organization in the path. Nothing here filters.
 *
 * Every member reads this, coach and staff included, because a price is
 * nobody's personal data. Writing is `manage_billing`'s, which is the same
 * capability the subscriptions screen asks for (`canManageBilling`).
 */

import { formatAmount, formatPeriod } from './organization-billing'
import type { OrganizationPlan, PlanDeliveryMode, PlanVersion } from './studio-api'

export function priceLabel(
  version: Pick<PlanVersion, 'amount_minor' | 'currency_code' | 'billing_period'>,
): string {
  return `${formatAmount(version.amount_minor, version.currency_code)} ${formatPeriod(version.billing_period)}`
}

export function deliveryLabel(mode: PlanDeliveryMode): string {
  return mode === 'in_person' ? 'presencial' : 'remoto'
}

export function planStateLine(plan: OrganizationPlan): string {
  if (plan.status === 'draft') {
    return 'Borrador: todavía no tiene precio, así que nadie puede suscribirse.'
  }
  if (plan.on_sale && plan.current_version) {
    const current = plan.current_version
    return `A la venta: ${priceLabel(current)} · ${deliveryLabel(current.delivery_mode)}`
  }
  return 'Fuera de venta: no tiene ningún precio a la venta ahora.'
}

export function planVersionLine(version: PlanVersion): string {
  return `Versión ${version.version_number} · ${priceLabel(version)} · ${deliveryLabel(version.delivery_mode)}`
}

export function versionStatusLabel(version: Pick<PlanVersion, 'status'>): string {
  return version.status === 'published' ? 'A la venta' : 'Retirada'
}
