/**
 * Reading a relationship the organization ended, through an open case:
 * `HU-STUDIO-062`.
 *
 * `OP-PRV-020` and `OP-NUT-011` decide what exists. This module decides only
 * what the screen draws and the words it uses, under one rule the story puts
 * last and the design follows first:
 *
 * **What does not exist and what is not authorized look the same** (criterion
 * 8). The screen never says why something is missing — no «sin autorizar», no
 * lock, no empty section for a category nobody can read. It is the same rule as
 * the client card: what is not there is not there.
 *
 * So a section is drawn only for a frozen category that has a historical read
 * (criterion 2): the sessions, for either training category; her measurements;
 * and the goals this relationship proposed. Health context, photos, intake and
 * the current profile have no historical route in V1, and they are left out
 * rather than drawn empty. A read that answers `scope-required` reads like a
 * read that found nothing, because to her they are the same: nothing is shown.
 *
 * **Nothing after the cut** (criterion 1) is the server's filter; the screen
 * says where the cut is, so the reader knows the history stops there.
 *
 * The measurements read the way the live screen reads them, in
 * `body-measurements.ts`, and a nutrient the way her meals name it, in
 * `nutrients.ts`.
 */
import { nutrientName } from './nutrients'
import type {
  ClientNutritionGoalDecision,
  ClientNutritionGoalTarget,
  FrozenNutritionGoalVersion,
  HistoricalRelationship,
  ScopeCode,
} from './studio-api'

export type HistoricalSection = 'sessions' | 'body' | 'nutrition'

const SECTION_SCOPES: readonly [HistoricalSection, readonly ScopeCode[]][] = [
  ['sessions', ['relationship_training', 'prior_training_history']],
  ['body', ['body_progress']],
  ['nutrition', ['nutrition_guidance']],
]

export function historicalSections(
  scopes: readonly Pick<HistoricalRelationship['scopes'][number], 'code'>[],
): HistoricalSection[] {
  const frozen = new Set(scopes.map((scope) => scope.code))
  return SECTION_SCOPES.filter(([, codes]) => codes.some((code) => frozen.has(code))).map(
    ([section]) => section,
  )
}

const MOMENT = { dateStyle: 'medium', timeStyle: 'short' } as const

export function cutLine(cutAt: string): string {
  return `Hasta el corte: ${new Intl.DateTimeFormat('es-CO', MOMENT).format(new Date(cutAt))}`
}

function figure(value: number): string {
  return new Intl.NumberFormat('es-CO', { maximumFractionDigits: 2 }).format(value)
}

const GOAL_STATUS: Record<NonNullable<FrozenNutritionGoalVersion['status_at_cut']>, string> = {
  proposed: 'Propuesto',
  accepted: 'Aceptado',
  rejected: 'Rechazado',
  superseded: 'Reemplazado',
  cancelled: 'Cancelado',
}

export function goalStatusLabel(
  status: FrozenNutritionGoalVersion['status_at_cut'],
): string | null {
  return status ? GOAL_STATUS[status] : null
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

/** One target as it was set, or null when the frozen version keeps none of it. */
export function targetLine(target: ClientNutritionGoalTarget): string | null {
  const name = target.nutrient_code ? nutrientName(target.nutrient_code) : null
  const value = targetAmount(target)
  if (name && value) return `${name}: ${value}`
  return name ?? value
}

export function decisionLine(decision: ClientNutritionGoalDecision | null): string | null {
  if (!decision) return null
  const day = new Intl.DateTimeFormat('es-CO', { dateStyle: 'medium' }).format(
    new Date(decision.decided_at),
  )
  return decision.decision === 'accepted' ? `Lo aceptó el ${day}` : `Lo rechazó el ${day}`
}

export type ReadFailure = 'reauthenticate' | 'nothing' | 'gone' | 'retry'

/**
 * What a read through the case can answer besides its data. `nothing` is drawn
 * exactly like an empty section; `gone` is the case no longer serving — closed,
 * expired, revoked by her or no longer this member's — which the API answers the
 * same way for every reason.
 */
export function readFailure(status: number, code: string): ReadFailure {
  if (status === 403 && code === 'reauthentication-required') return 'reauthenticate'
  if (status === 403 && code === 'scope-required') return 'nothing'
  if (status === 403 || status === 404) return 'gone'
  return 'retry'
}
