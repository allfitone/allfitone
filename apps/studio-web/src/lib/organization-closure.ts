/**
 * Closing the organization: the heaviest thing this product lets anybody do.
 *
 * `HU-STUDIO-013`, `OP-ORG-012`. Everything below was read out of
 * `organizations.close_organization` and the contracts it coordinates, because
 * four of the story's six criteria are promises the dialog makes and three of
 * them would have been wrong if written from the story alone.
 *
 * **What it really does** (criterion 1): one transaction ends every live
 * relationship through `close_relationship`, revokes the organization's pending
 * invitations, cancels pending nutrition proposals, closes **every** membership
 * — including the owner's who ran it — and marks the organization closed. If
 * any contract fails, nothing closes (criteria 4 and 6).
 *
 * **What it does not do** (criterion 2): nobody's Fitness ID and nobody's
 * sessions are deleted. The relationships end; the person and their history
 * stay theirs.
 *
 * Three things the story does not say, and the screen has to:
 *
 * - **A live client subscription blocks it.** `payments.check_organization_closure`
 *   refuses while any subscription is not `ended` — so a *suspended* one blocks
 *   too — because no contract ends an external charge, and a client billed by a
 *   closed gym is worse than a closure that waits. The screen checks it first
 *   rather than letting a `22023` come back with nothing to act on.
 * - **The clients are not told.** The closure enqueues the relationship notice,
 *   and `relationship.terminated.v1` has no worker: the delivery-coverage test
 *   names it as open, in writing. Promising it would promise something the
 *   product does not do, exactly as `STUDIO-78`'s dialog decided.
 * - **There is no term to state.** Criterion 3 asks for «una finalidad y un
 *   plazo», and the migration says the disposition of the kept evidence «needs
 *   a retention policy with a period, which is a legal decision not yet taken».
 *   So the copy says what is kept and why, and invents no deadline.
 */

import type { OrganizationRole, OrganizationSubscription } from './studio-api'

const CLOSE_ORGANIZATION = 'close_organization'

/** Only the owner holds it: one row in the catalogue, and the function demands it. */
export function canCloseOrganization(
  roles: readonly string[],
  catalog: readonly OrganizationRole[] | undefined,
): boolean {
  if (!catalog?.length) return false
  return roles.some((role) =>
    catalog
      .find((entry) => entry.code === role)
      ?.capabilities.some((capability) => capability.code === CLOSE_ORGANIZATION),
  )
}

/**
 * The subscriptions that stand in the way.
 *
 * `status <> 'ended'` is the function's own test, so a **suspended**
 * subscription blocks the closure as much as an active one. Counting only the
 * active ones would show a reader nothing in the way and then refuse them.
 */
export function blockingSubscriptions(
  subscriptions: readonly OrganizationSubscription[],
): OrganizationSubscription[] {
  return subscriptions.filter((subscription) => subscription.status !== 'ended')
}

/** Why the control is unavailable, or null when nothing is in the way. */
export function closureBlockedReason(
  subscriptions: readonly OrganizationSubscription[],
): string | null {
  const blocking = blockingSubscriptions(subscriptions)
  if (blocking.length === 0) return null
  const suspended = blocking.filter((subscription) => subscription.status === 'suspended').length
  const live = blocking.length - suspended
  const parts: string[] = []
  if (live === 1) parts.push('1 suscripción activa')
  else if (live > 1) parts.push(`${live} suscripciones activas`)
  if (suspended === 1) parts.push('1 suspendida')
  else if (suspended > 1) parts.push(`${suspended} suspendidas`)
  return `Todavía hay ${parts.join(' y ')}. Una suspendida cuenta igual: mientras no esté terminada, el cobro sigue existiendo, y un cliente facturado por un gimnasio cerrado es peor que un cierre que espera. Termínalas primero en Cobros.`
}

/** Criterion 1, in the order somebody worries about it. */
export const WHAT_CLOSING_DOES =
  'Termina todas las relaciones activas con su efecto completo: lo que cada persona compartió queda congelado, los programas se desacoplan y todas las membresías se cierran, incluida la tuya. Las invitaciones pendientes dejan de poder aceptarse.'

/** Criterion 2, the half that reassures, said second because it answers the first. */
export const WHAT_CLOSING_DOES_NOT_DO =
  'No se borra el Fitness ID de nadie ni las sesiones de ninguna persona. La relación con el gimnasio termina; lo que cada quien registró sigue siendo suyo.'

/**
 * Criterion 3 without the part that does not exist. The organization keeps
 * minimal evidence and the purpose is said; the period is a legal decision
 * nobody has taken, so no deadline is promised here.
 */
export const WHAT_IS_KEPT =
  'La organización conserva solo evidencia mínima de lo ocurrido, para poder responder por lo que hizo. Conservar no es seguir teniendo acceso: ningún profesional vuelve a ver los datos de nadie.'

/** Criteria 4 and 6: there is no half-closure. */
export const ALL_OR_NOTHING =
  'Si alguna terminación no se puede completar, no se cierra nada: el cierre entero se deshace y la organización sigue abierta.'

/** What the closure cannot promise, and the reason it is said out loud. */
export const CLIENTS_ARE_NOT_TOLD =
  'A los clientes no les avisa nadie por ahora, así que conviene decírselo tú antes.'

export type ClosureRefusal = 'not-allowed' | 'subscriptions' | 'conflict' | 'unavailable'

export function closureRefusalFor(status: number | undefined): ClosureRefusal {
  if (status === 403) return 'not-allowed'
  // The one the screen tries to prevent: a subscription somebody revived, or a
  // contract that refused while the transaction ran.
  if (status === 422) return 'subscriptions'
  if (status === 409) return 'conflict'
  return 'unavailable'
}

export function closureRefusalTitle(refusal: ClosureRefusal): string {
  if (refusal === 'not-allowed') return 'Ya no puedes cerrar esta organización'
  if (refusal === 'subscriptions') return 'No se pudo cerrar todavía'
  if (refusal === 'conflict') return 'Alguien más está cambiando algo'
  return 'No pudimos cerrar la organización'
}

export function closureRefusalDescription(refusal: ClosureRefusal): string {
  if (refusal === 'not-allowed') {
    return 'Cerrar es cosa del propietario, y tu rol ya no lo es. Si acabas de transferir la propiedad, actualiza la pantalla.'
  }
  if (refusal === 'subscriptions') {
    return 'Algo quedó sin terminar, casi siempre una suscripción que seguía viva. Actualiza la pantalla para ver qué falta. La organización sigue abierta.'
  }
  if (refusal === 'conflict') {
    return 'Otra operación sobre esta organización estaba en curso. No se cerró nada: inténtalo de nuevo en un momento.'
  }
  return 'La conexión falló de forma temporal. La organización sigue abierta y no se terminó ninguna relación.'
}

/**
 * What the confirmation can say, and the number the earlier closure dialogs
 * could not give: the response carries `relationships_terminated`.
 */
export function closedSummary(relationshipsTerminated: number): string {
  if (relationshipsTerminated === 0) {
    return 'No había ninguna relación activa que terminar.'
  }
  if (relationshipsTerminated === 1) {
    return 'Se terminó 1 relación con su efecto completo.'
  }
  return `Se terminaron ${relationshipsTerminated} relaciones con su efecto completo.`
}
