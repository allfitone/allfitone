/**
 * Taking a price off sale: `HU-STUDIO-076`.
 *
 * Its two criteria are the two halves the dialog says before the click:
 *
 * 1. **No new subscriptions.** Space offers only the version on sale, and a
 *    subscription in flight waits for the retirement and is then refused.
 * 2. **Nobody already subscribed is cancelled, suspended or moved.** Each
 *    subscription froze its version by id, and nothing rewrites it.
 *
 * A plan has one price on sale, so the only version worth retiring is that
 * one, and retiring it takes the plan off sale until another is published. A
 * retired version never comes back (`55000`). The command names the version,
 * so if somebody published a new price a moment earlier, retiring the old one
 * changes nothing and the new one stays on sale: `retireOutcome` says which.
 */

import { deliveryLabel, priceLabel } from './plan-catalog'
import { planWriteFailure } from './plan-create'
import { publishWriteFailure } from './plan-publish'
import type { OrganizationPlan, PlanVersion, StudioApiError } from './studio-api'

export function retireTitle(version: PlanVersion): string {
  return `¿Retirar la versión ${version.version_number}: ${priceLabel(version)} · ${deliveryLabel(version.delivery_mode)}?`
}

export function retireConsequences(): string[] {
  return [
    'Nadie más podrá suscribirse a este precio.',
    'Quien ya lo paga lo conserva: no se cancela, no se suspende y no cambia de plan a nadie.',
    'El plan queda fuera de venta hasta que publiques otro precio.',
  ]
}

export function retireOutcome(retired: PlanVersion, after: OrganizationPlan): string {
  const current = after.current_version
  if (current && current.plan_version_id !== retired.plan_version_id) {
    return `Ese precio ya se había reemplazado por la versión ${current.version_number}, que sigue a la venta.`
  }
  return 'Retirado: el plan queda fuera de venta hasta que publiques otro precio.'
}

export function retireWriteFailure(status: StudioApiError['status']): string {
  if (status === 409 || status === 403) return publishWriteFailure(status)
  if (status === 404) return 'Este precio ya no está disponible para tu organización.'
  if (status === 503) return planWriteFailure(status)
  return 'No pudimos retirar el precio. Sigue a la venta; vuelve a intentarlo.'
}
