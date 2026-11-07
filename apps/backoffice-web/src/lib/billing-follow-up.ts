/**
 * `HU-BO-005` c1 and c5, `HU-BO-020` c3 — the charges to follow up.
 *
 * **The list the count stands for.** The attention panel says how many charges failed
 * and how many subscriptions are suspended; this is who. It names payers, so it asks for
 * the case first, and the server records the read against each person listed.
 *
 * **A suspension never looks like a payer in good standing.** The state is a word and a
 * colour, and the detail says since when, until when Pro lasts in grace, and why the last
 * charge failed. Each row leads to the person's payments under the same case, where the
 * rest is.
 */

import type { AllfitV1Schemas } from '@allfitone/contracts'

import { formatInstant } from './platform-access'

export type BillingFollowUp = AllfitV1Schemas['SupportBillingFollowUp']
export type BillingFollowUpItem = AllfitV1Schemas['SupportBillingFollowUpItem']

export const FOLLOW_UP_PAGE = 50

const STATE_LABELS: Record<NonNullable<BillingFollowUpItem['subscription_status']>, string> = {
  suspended: 'Suspendida',
  grace: 'En gracia',
  active: 'Activa',
  ended: 'Terminada',
}

export function followUpStateLabel(item: BillingFollowUpItem): string {
  return item.subscription_status ? STATE_LABELS[item.subscription_status] : 'Sin suscripción'
}

export function followUpTone(item: BillingFollowUpItem): 'destructive' | 'warning' | 'secondary' {
  if (item.subscription_status === 'suspended') return 'destructive'
  if (item.subscription_status === 'grace') return 'warning'
  return 'secondary'
}

/** Since when, until when, and why the last charge failed, in one line. */
export function followUpDetail(item: BillingFollowUpItem): string {
  const parts: string[] = []
  if (item.subscription_status === 'suspended' && item.suspended_at) {
    parts.push(`Suspendida desde ${formatInstant(item.suspended_at)}.`)
  }
  if (item.subscription_status === 'grace' && item.grace_until) {
    parts.push(`Conserva Pro hasta ${formatInstant(item.grace_until)}.`)
  }
  const failure = item.last_failed_charge
  if (failure) {
    const charges =
      item.failed_charges === 1 ? '1 cobro fallido' : `${item.failed_charges} cobros fallidos`
    const reason = failure.failure_code ?? 'sin motivo informado'
    parts.push(
      `${charges} en 30 días; el último, ${formatInstant(failure.occurred_at)}: ${reason}.`,
    )
  }
  return parts.join(' ')
}

export function followUpHref(item: BillingFollowUpItem, caseReference: string): string {
  return `/people/${item.person_id}?case_reference=${encodeURIComponent(caseReference)}`
}

export function followUpSummary(followUp: BillingFollowUp): string {
  const count = followUp.items.length
  if (count === 0) {
    return `Nadie por seguir: ninguna suscripción suspendida ni en gracia, y ningún cobro fallido en ${followUp.window_days} días.`
  }
  const people = count === 1 ? '1 persona por seguir.' : `${count} personas por seguir.`
  return followUp.has_more ? `${people} Hay más: la lista muestra las primeras ${count}.` : people
}

export function followUpMessage(code: string): string {
  const messages: Record<string, string> = {
    forbidden:
      'Esta lista nombra a quien paga, así que pide el deber «view_billing_metadata». Los deberes llegan con el rol de administrador: si se negó, tu rol ya no está vigente y otro administrador debe otorgártelo de nuevo.',
    'invalid-request': 'Falta una referencia de caso válida, como CASE-2026-001.',
    'validation-failed': 'Falta una referencia de caso válida, como CASE-2026-001.',
    unauthenticated: 'Tu sesión terminó. Vuelve a iniciar sesión.',
    'upstream-unavailable': 'El servicio no respondió. Reintenta en un momento.',
    'network-unavailable': 'No hay conexión con el API.',
  }
  return messages[code] ?? 'No se pudo leer la lista de seguimiento.'
}
