/**
 * Putting a price on sale: `HU-STUDIO-075`.
 *
 * Its four criteria, and who holds them:
 *
 * 1. **Amount, currency, monthly or yearly, in person or remote, nothing
 *    else.** The form asks those four; the currency is COP alone, because
 *    Mercado Pago Colombia charges in pesos, so it is said rather than asked.
 * 2. **A published version is never edited.** The database refuses it
 *    (`55000`); the dialog says changing a price is publishing another.
 * 3. **Nobody subscribed pays more.** A subscription freezes its version, and
 *    publishing retires the old price without moving anybody. The dialog says
 *    so whenever there is somebody who could have subscribed.
 * 4. **In person is paid in Space, remote only by the payment link
 *    (`HU-STUDIO-088`).** That link does not exist yet, so the dialog says a
 *    remote price cannot be charged for now instead of implying it can.
 *
 * A plan has one price on sale: publishing retires the previous one in the
 * same command, and publishing exactly the price on sale changes nothing
 * (`200` rather than `201`). The client sees only the body, so "nothing
 * changed" is read as the same version still on sale.
 */

import { planWriteFailure } from './plan-create'
import { deliveryLabel, priceLabel } from './plan-catalog'
import type {
  OrganizationPlan,
  PlanDeliveryMode,
  PlanVersionPublish,
  StudioApiError,
} from './studio-api'

export interface PublishDraft {
  amount: string
  period: PlanVersionPublish['billing_period']
  delivery: PlanDeliveryMode
}

// The contract's ceiling, 1e11 in the minor unit.
const MAX_PESOS = 1_000_000_000
const PLAIN = /^\d+$/
const GROUPED = /^\d{1,3}(\.\d{3})+$/

export function parsePesos(text: string): number | undefined {
  const compact = text.replace(/[$\s]/g, '')
  if (PLAIN.test(compact)) return Number(compact)
  if (GROUPED.test(compact)) return Number(compact.replaceAll('.', ''))
  return undefined
}

export function amountError(text: string): string | undefined {
  if (!text.trim()) return 'Escribe el precio en pesos.'
  const pesos = parsePesos(text)
  if (pesos === undefined) {
    return 'Escribe el precio en pesos enteros, sin centavos: por ejemplo 120000 o 120.000.'
  }
  if (pesos < 1) return 'El precio tiene que ser de al menos un peso.'
  if (pesos > MAX_PESOS) return 'El precio no puede pasar de mil millones de pesos.'
  return undefined
}

export function publishRequest(draft: PublishDraft): PlanVersionPublish {
  return {
    amount_minor: (parsePesos(draft.amount) ?? 0) * 100,
    currency_code: 'COP',
    billing_period: draft.period,
    delivery_mode: draft.delivery,
  }
}

export function initialPublishDraft(plan: OrganizationPlan): PublishDraft {
  const current = plan.current_version
  if (!current) return { amount: '', period: 'month', delivery: 'in_person' }
  return {
    amount: String(current.amount_minor / 100),
    period: current.billing_period,
    delivery: current.delivery_mode,
  }
}

export function sameAsOnSale(plan: OrganizationPlan, request: PlanVersionPublish): boolean {
  const current = plan.current_version
  return (
    current !== null &&
    current.amount_minor === request.amount_minor &&
    current.currency_code === request.currency_code &&
    current.billing_period === request.billing_period &&
    current.delivery_mode === request.delivery_mode
  )
}

export function publishTitle(request: PlanVersionPublish): string {
  return `¿Publicar ${priceLabel(request)} · ${deliveryLabel(request.delivery_mode)}?`
}

export function publishConsequences(plan: OrganizationPlan, request: PlanVersionPublish): string[] {
  const lines: string[] = []
  const current = plan.current_version
  if (current) {
    lines.push(
      `Se retira el precio que está a la venta ahora: ${priceLabel(current)} · ${deliveryLabel(current.delivery_mode)}. Un plan tiene un solo precio a la venta.`,
    )
  }
  lines.push(
    request.delivery_mode === 'remote'
      ? 'Es remoto, así que no se ofrece en Allfit Space: se cobra solo con el link de pago que se manda a cada persona. Ese link todavía no está disponible, y hasta entonces nadie podrá pagarlo.'
      : 'Desde ese momento se ofrece en Allfit Space y la gente puede suscribirse.',
  )
  if (plan.versions.length > 0) {
    lines.push('Quien ya está suscrito conserva el precio que aceptó: a nadie se le sube.')
  }
  lines.push('Un precio publicado no se edita nunca: cambiarlo será publicar otro.')
  return lines
}

export function publishOutcome(before: OrganizationPlan, after: OrganizationPlan): string {
  const current = after.current_version
  if (!current || current.plan_version_id === before.current_version?.plan_version_id) {
    return 'Ese precio ya estaba a la venta; no cambió nada.'
  }
  return `Publicado: la versión ${current.version_number} está a la venta.`
}

export function publishWriteFailure(status: StudioApiError['status']): string {
  if (status === 409) {
    return 'Alguien cambió los precios de este plan al mismo tiempo. Revisa cuál está a la venta y vuelve a intentarlo.'
  }
  if (status === 403) {
    return 'Publicar y retirar precios corresponde a propietario y administración, y tu rol ya no lo permite.'
  }
  if (status === 422)
    return 'Revisa el precio: pesos enteros, mensual o anual, presencial o remoto.'
  if (status === 404 || status === 503) return planWriteFailure(status)
  return 'No pudimos publicar el precio. Conservamos lo que escribiste para que puedas reintentar.'
}
