/**
 * The register of corrections one proposed: `HU-STUDIO-060`.
 *
 * Its three criteria, and who holds each one:
 *
 * 1. **The state and the deadline of each proposal.** The state is the
 *    server's word and is never recomputed here — a proposal past its thirty
 *    days arrives as `expired` whether or not a sweep has marked it, and
 *    asking for `pending` leaves it out. Deriving it from `expires_at` on the
 *    screen would be a second source of truth that drifts from the first.
 * 2. **One cancelled by the relationship ending reads as cancelled**, with the
 *    reason. There are three reasons and they are different facts, so they are
 *    worded differently — except the one the contract deliberately collapses:
 *    whether she annulled the session or hid it from the organization is not
 *    his to know, and both arrive as `session_unavailable`. This module maps
 *    the narrower values to the same sentence as well, so a database that has
 *    not caught up cannot leak which it was.
 * 3. **If she accepts, the value stays hers.** He is recorded as who proposed
 *    it, not as its author, and that is said on the row where it matters —
 *    nothing else on the screen could say it.
 *
 * **Her current value is not here, and that is the contract.** The answer
 * carries what he proposed and never what she has, so the register cannot show
 * a before-and-after: pairing them would need a read of her session, which is
 * a different permission and a different access record. A row that still
 * points somewhere links to the session instead.
 */

import type {
  CorrectionProposalStatus,
  ProposedCorrection,
  ProposedCorrectionCancelReason,
} from './studio-api'

/** The filters the register offers, in the order they are read. */
export const PROPOSAL_FILTERS = [
  'all',
  'pending',
  'accepted',
  'rejected',
  'expired',
  'cancelled',
] as const

export type ProposalFilter = (typeof PROPOSAL_FILTERS)[number]

const FILTER_LABEL: Readonly<Record<ProposalFilter, string>> = {
  all: 'Todas',
  pending: 'Esperando',
  accepted: 'Aceptadas',
  rejected: 'Rechazadas',
  expired: 'Vencidas',
  cancelled: 'Canceladas',
}

export function proposalFilterLabel(filter: ProposalFilter): string {
  return FILTER_LABEL[filter]
}

/** What each state is called on a row. */
const STATUS_LABEL: Readonly<Record<CorrectionProposalStatus, string>> = {
  pending: 'Esperando su respuesta',
  accepted: 'La aceptó',
  rejected: 'La rechazó',
  expired: 'Venció sin respuesta',
  cancelled: 'Cancelada',
}

export function proposalStatusLabel(status: CorrectionProposalStatus): string {
  return STATUS_LABEL[status]
}

/** Which of the four tones a state reads in, so the list scans. */
export function proposalStatusTone(
  status: CorrectionProposalStatus,
): 'waiting' | 'done' | 'refused' | 'lapsed' {
  if (status === 'pending') return 'waiting'
  if (status === 'accepted') return 'done'
  if (status === 'rejected') return 'refused'
  return 'lapsed'
}

/**
 * What each state means for him, said once per row.
 *
 * The accepted one carries the third criterion: the value is hers and he is
 * recorded as who proposed it. The expired one says that expiring is not a
 * refusal, because the two are a single click apart on this screen and reading
 * «venció» as «dijo que no» is the misreading the story guards against.
 */
export function proposalStatusNote(status: CorrectionProposalStatus): string {
  if (status === 'pending') {
    return 'Ella decide en su app. Su dato sigue como está mientras tanto.'
  }
  if (status === 'accepted') {
    return 'El valor quedó corregido y sigue siendo suyo: tú quedas registrado como quien lo propuso, no como su autor.'
  }
  if (status === 'rejected') {
    return 'Decidió dejar su dato como lo tenía. Es su decisión y no hay nada que reintentar.'
  }
  if (status === 'expired') {
    return 'Pasaron los treinta días sin que respondiera. Vencer no es un «no» suyo: si sigue haciendo falta, puedes proponerlo otra vez.'
  }
  return 'Dejó de esperar su respuesta por algo que pasó alrededor, no por una decisión suya.'
}

/**
 * Why a cancelled proposal stopped waiting, in his words.
 *
 * `session_unavailable` covers two facts the contract refuses to tell apart —
 * she annulled the session, or she hid it from the organization. The narrower
 * database values are mapped here to the same sentence so a deployment that
 * has not caught up cannot say which it was.
 */
export function proposalCancelNote(reason: ProposedCorrectionCancelReason | string): string {
  if (reason === 'target_changed') {
    return 'Ella misma corrigió ese dato antes de responderte, así que la propuesta ya no tenía sobre qué aplicarse.'
  }
  if (reason === 'relationship_terminated') {
    return 'El vínculo con ella terminó, así que la propuesta se cerró con él.'
  }
  if (
    reason === 'session_unavailable' ||
    reason === 'session_annulled' ||
    reason === 'session_hidden'
  ) {
    return 'Esa sesión ya no está disponible, así que la propuesta se cerró. Por qué dejó de estarlo es decisión de ella y no se informa.'
  }
  return 'La propuesta se cerró sin respuesta suya.'
}

/** A proposal still points somewhere only while he reaches her session. */
export function proposalSessionTarget(
  proposal: ProposedCorrection,
): { executionId: string; setOrder: number } | null {
  if (!proposal.target) return null
  return { executionId: proposal.target.execution_id, setOrder: proposal.target.set_order }
}

/**
 * Said in place of the link when a row no longer points anywhere.
 *
 * It names what changed about his reach and not about her: the target goes
 * away when he stops attending her or when she stops sharing her training, and
 * the answer does not say which.
 */
export function proposalUnreachableNote(): string {
  return 'Ya no puedes abrir esa sesión, así que la propuesta se queda sin a dónde llevar.'
}

/** What the register says when the filter in hand matches nothing. */
export function proposalEmptyNote(filter: ProposalFilter): string {
  if (filter === 'all') {
    return 'Todavía no has propuesto ninguna corrección. Se proponen desde una serie de una sesión de la persona.'
  }
  if (filter === 'pending') {
    return 'No tienes propuestas esperando respuesta.'
  }
  return `No tienes propuestas ${proposalFilterLabel(filter).toLocaleLowerCase('es-CO')}.`
}

/**
 * What a refused read means.
 *
 * The 403 here is not about her: the register holds none of her data, so the
 * only way to be refused is to have no live membership in this organization.
 */
export function proposalRegisterFailure(status: number): string {
  if (status === 403) {
    return 'No podemos mostrar tus propuestas en esta organización. Pasa cuando tu membresía ya no está activa aquí.'
  }
  if (status === 422) {
    return 'No pudimos leer ese filtro. Vuelve a «Todas» para ver el registro completo.'
  }
  if (status === 503) {
    return 'No pudimos cargar tus propuestas ahora mismo. Vuelve a intentarlo.'
  }
  return 'No pudimos cargar tus propuestas. Vuelve a intentarlo.'
}
