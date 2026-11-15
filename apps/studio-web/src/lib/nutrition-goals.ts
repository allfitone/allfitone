/**
 * The words for a nutrition goal, shared by the two screens that show one: the
 * goals this relationship proposed (`HU-STUDIO-070`) and the goals of an ended
 * relationship read through a case (`HU-STUDIO-062`).
 *
 * Written first for the frozen history, which said they would converge with the
 * live screen the day there was one. A target now reads the same way in both.
 *
 * **A field her version withholds is left out, never guessed.** Every field of a
 * target can arrive null, and a target with nothing readable is no line at all.
 * A mode without its value says nothing, rather than a zero.
 *
 * **Her active goal says little about itself, on purpose.** `OP-NUT-011` names
 * its origin only when this relationship proposed it; otherwise nothing says who
 * set it, why or which number it is. So there is a line for the first case and
 * none for the second, and no way to ask who proposed it.
 */
import { inNutrientOrder, nutrientName } from './nutrients'
import type {
  ClientActiveNutritionGoal,
  ClientNutritionGoalDecision,
  ClientNutritionGoalTarget,
  NutritionGoalStatus,
} from './studio-api'

const DAY = new Intl.DateTimeFormat('es-CO', { dateStyle: 'medium' })

function day(value: string): string {
  return DAY.format(new Date(value))
}

function figure(value: number): string {
  return new Intl.NumberFormat('es-CO', { maximumFractionDigits: 2 }).format(value)
}

function withUnit(value: number, unit: ClientNutritionGoalTarget['unit']): string {
  return unit ? `${figure(value)} ${unit}` : figure(value)
}

function targetAmount(target: ClientNutritionGoalTarget): string | null {
  const { mode, minimum, maximum, exact, unit } = target
  if (mode === 'range' && minimum !== null && maximum !== null) {
    return `entre ${figure(minimum)} y ${withUnit(maximum, unit)}`
  }
  if (mode === 'minimum' && minimum !== null) return `al menos ${withUnit(minimum, unit)}`
  if (mode === 'maximum' && maximum !== null) return `hasta ${withUnit(maximum, unit)}`
  if (mode === 'exact' && exact !== null) return withUnit(exact, unit)
  return null
}

/** One target as it was set, or null when her version keeps none of it. */
export function targetLine(target: ClientNutritionGoalTarget): string | null {
  const name = target.nutrient_code ? nutrientName(target.nutrient_code) : null
  const value = targetAmount(target)
  if (name && value) return `${name}: ${value}`
  return name ?? value
}

/** A goal's targets as lines, energy and the macros first, the unreadable left out. */
export function targetLines(targets: readonly ClientNutritionGoalTarget[]): string[] {
  return inNutrientOrder(targets).flatMap((target) => {
    const line = targetLine(target)
    return line ? [line] : []
  })
}

export function decisionLine(decision: ClientNutritionGoalDecision | null): string | null {
  if (!decision) return null
  const when = day(decision.decided_at)
  return decision.decision === 'accepted' ? `Lo aceptó el ${when}` : `Lo rechazó el ${when}`
}

export function proposedLine(createdAt: string): string {
  return `Propuesto el ${day(createdAt)}`
}

const PROPOSAL_STATUS: Record<NutritionGoalStatus, string> = {
  proposed: 'Esperando su decisión',
  active: 'Lo sigue hoy',
  rejected: 'Rechazado',
  superseded: 'Reemplazado',
  cancelled: 'Cancelado',
}

/** Where a proposal of this relationship stands today. */
export function proposalStatusLabel(status: NutritionGoalStatus): string {
  return PROPOSAL_STATUS[status]
}

export function activeSinceLine(activatedAt: string | null): string | null {
  return activatedAt ? `Lo sigue desde el ${day(activatedAt)}` : null
}

export function activeOriginLine(
  active: Pick<ClientActiveNutritionGoal, 'from_this_relationship'>,
): string | null {
  return active.from_this_relationship ? 'Es una propuesta de esta relación que ella aceptó.' : null
}
