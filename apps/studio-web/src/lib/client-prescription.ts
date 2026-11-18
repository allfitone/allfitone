/**
 * Adjusting the prescription for one person: `HU-STUDIO-049`.
 *
 * Its four criteria, and who holds each one:
 *
 * 1. **The adaptation does not edit what was published.** The routine and the
 *    programme stay as they are; the adjustment lives in this person's
 *    assignment. The contract keeps the two apart — `step` is the routine as
 *    published and `adjustments` the revisions in force — and this module keeps
 *    them apart too: nothing here merges one into the other, because a screen
 *    that showed only the adjusted value would make the published routine
 *    unreadable and the first criterion unverifiable.
 * 2. **Each adjustment is kept with who made it.** The server records the
 *    professional assignment; nothing on the screen needs to claim authorship.
 * 3. **Adjustments outlive the management period.** A detached programme keeps
 *    them, so the screen reads them whether or not the organization still
 *    manages it.
 * 4. **Adjusting is only while we manage it.** Reading is not: the operation
 *    says a programme the organization stopped managing is still read, and 409
 *    `conflict` is what stops the write.
 *
 * **What a step admits is decided by its family, not guessed.** Each target
 * carries `family`, and the operation refuses a kind that family does not take
 * with 422 `kind`. The map below is the server's own, read from
 * `planning.prescription_kind_families`.
 *
 * **A unit is never chosen here.** Load, distance and pace need one, and the
 * routine already states which: the adjustment travels in the unit its own step
 * was published in. That removes a control, a catalogue read and the mismatch
 * where somebody adjusts 132 meaning pounds against a routine written in kilos.
 */

import type {
  AssignmentPrescriptionStep,
  PlannedStepContent,
  PrescriptionAdjustmentKind,
  PrescriptionRevision,
} from './studio-api'

/** The four families a step can belong to, as its target names itself. */
export type StepFamily = 'strength' | 'endurance' | 'interval' | 'mobility'

/** The server's own map, from `planning.prescription_kind_families`. */
const KIND_FAMILIES: Readonly<Record<PrescriptionAdjustmentKind, readonly StepFamily[]>> = {
  target_sets: ['strength'],
  target_reps: ['strength'],
  target_load: ['strength'],
  target_rpe: ['strength', 'interval'],
  target_distance: ['endurance'],
  target_duration: ['endurance'],
  target_pace: ['endurance'],
  rounds: ['interval'],
  work_duration: ['interval'],
  rest_duration: ['interval'],
  hold_duration: ['mobility'],
  target_repetitions: ['mobility'],
  side: ['mobility'],
  notes: ['strength', 'endurance', 'interval', 'mobility'],
}

/** What each kind is called where it is adjusted. */
const KIND_LABEL: Readonly<Record<PrescriptionAdjustmentKind, string>> = {
  target_sets: 'Series',
  target_reps: 'Repeticiones',
  target_load: 'Carga',
  target_rpe: 'RPE',
  target_distance: 'Distancia',
  target_duration: 'Duración',
  target_pace: 'Ritmo',
  rounds: 'Rondas',
  work_duration: 'Trabajo',
  rest_duration: 'Descanso',
  hold_duration: 'Sostenimiento',
  target_repetitions: 'Repeticiones',
  side: 'Lado',
  notes: 'Nota',
}

export function adjustmentKindLabel(kind: PrescriptionAdjustmentKind): string {
  return KIND_LABEL[kind]
}

/** The sides the operation takes, in the order they are offered. */
export const ADJUSTMENT_SIDES = ['left', 'right', 'bilateral', 'not_applicable'] as const

const SIDE_LABEL: Readonly<Record<(typeof ADJUSTMENT_SIDES)[number], string>> = {
  left: 'Izquierdo',
  right: 'Derecho',
  bilateral: 'Los dos',
  not_applicable: 'No aplica',
}

export function sideLabelFor(value: string): string {
  return value in SIDE_LABEL ? SIDE_LABEL[value as (typeof ADJUSTMENT_SIDES)[number]] : value
}

/** The family a step belongs to, which is what decides everything else. */
export function stepFamily(step: PlannedStepContent): StepFamily | null {
  const target: unknown = step.target
  if (typeof target !== 'object' || target === null || !('family' in target)) return null
  const family = (target as { family: unknown }).family
  return family === 'strength' || family === 'endurance' || family === 'interval'
    ? family
    : family === 'mobility'
      ? family
      : null
}

/** What this step can take, in reading order. Empty when its family is unknown. */
export function adjustableKinds(step: PlannedStepContent): readonly PrescriptionAdjustmentKind[] {
  const family = stepFamily(step)
  if (!family) return []
  return (Object.keys(KIND_FAMILIES) as PrescriptionAdjustmentKind[]).filter((kind) =>
    KIND_FAMILIES[kind].includes(family),
  )
}

/**
 * The unit a kind travels in, taken from the step that was published.
 *
 * Null where the kind carries none. A kind that needs one and finds none on its
 * step cannot be sent: the operation refuses it, so the screen does not offer
 * it rather than offering a refusal.
 */
export function adjustmentUnit(step: PlannedStepContent, kind: PrescriptionAdjustmentKind) {
  const target = step.target as Record<string, unknown> | null
  if (!target) return null
  if (kind === 'target_load') return asUnit(target['target_load_unit_code'])
  if (kind === 'target_distance') return asUnit(target['target_distance_unit_code'])
  if (kind === 'target_pace') return asUnit(target['target_pace_unit_code'])
  return null
}

function asUnit(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null
}

/** A kind the screen offers: the ones its family takes and whose unit it has. */
export function offeredKinds(step: PlannedStepContent): readonly PrescriptionAdjustmentKind[] {
  return adjustableKinds(step).filter((kind) => {
    if (kind !== 'target_load' && kind !== 'target_distance' && kind !== 'target_pace') return true
    return adjustmentUnit(step, kind) !== null
  })
}

/** The revision in force for a kind on this step, if one is. */
export function adjustmentInForce(
  step: AssignmentPrescriptionStep,
  kind: PrescriptionAdjustmentKind,
): PrescriptionRevision | undefined {
  return step.adjustments.find((revision) => revision.kind === kind)
}

/**
 * What the published routine asks for this kind, as it was written.
 *
 * Null where the routine left it unset — which is not the same as zero, and is
 * why the screen says «la rutina no lo fija» instead of drawing a number.
 */
export function publishedValue(
  step: PlannedStepContent,
  kind: PrescriptionAdjustmentKind,
): number | string | null {
  const target = step.target as Record<string, unknown> | null
  if (!target) return null
  const field = PUBLISHED_FIELD[kind]
  const value = field === null ? null : target[field]
  if (typeof value === 'number' || typeof value === 'string') return value
  return null
}

const PUBLISHED_FIELD: Readonly<Record<PrescriptionAdjustmentKind, string | null>> = {
  target_sets: 'target_sets',
  target_reps: 'target_reps',
  target_load: 'target_load_value',
  target_rpe: 'target_rpe',
  target_distance: 'target_distance_value',
  target_duration: 'target_duration_seconds',
  target_pace: 'target_pace_seconds_per_unit',
  rounds: 'rounds',
  work_duration: 'work_duration_seconds',
  rest_duration: 'rest_duration_seconds',
  hold_duration: 'hold_duration_seconds',
  target_repetitions: 'target_repetitions',
  side: 'side',
  // A note is not a target the routine states: it is only ever an adjustment.
  notes: null,
}

/**
 * What the form will not send, before anybody presses anything.
 *
 * Every bound is the server's own, read from `planning.prescription_value_fits`.
 * `unchanged` is this screen's own courtesy: sending the value already in force
 * would record a revision that changes nothing.
 */
export function adjustmentProblem(
  kind: PrescriptionAdjustmentKind,
  written: string,
  inForce: PrescriptionRevision | undefined,
): 'empty' | 'not-a-number' | 'not-whole' | 'out-of-range' | 'too-long' | 'unchanged' | null {
  const trimmed = written.trim()
  if (trimmed.length === 0) return 'empty'

  if (kind === 'notes') {
    if (trimmed.length > 2000) return 'too-long'
    return inForce?.value === trimmed ? 'unchanged' : null
  }
  if (kind === 'side') {
    return inForce?.value === trimmed ? 'unchanged' : null
  }

  const value = Number(trimmed.replace(',', '.'))
  if (!Number.isFinite(value)) return 'not-a-number'
  if (WHOLE_KINDS.has(kind)) {
    if (!Number.isInteger(value)) return 'not-whole'
    if (value <= 0) return 'out-of-range'
  }
  if (kind === 'target_rpe' && (value < 0 || value > 10)) return 'out-of-range'
  if (kind === 'target_load' && value < 0) return 'out-of-range'
  if (kind === 'rest_duration' && value < 0) return 'out-of-range'
  if (POSITIVE_KINDS.has(kind) && value <= 0) return 'out-of-range'
  return inForce?.value === value ? 'unchanged' : null
}

const WHOLE_KINDS = new Set<PrescriptionAdjustmentKind>([
  'target_sets',
  'target_reps',
  'rounds',
  'target_repetitions',
])

const POSITIVE_KINDS = new Set<PrescriptionAdjustmentKind>([
  'target_distance',
  'target_pace',
  'target_duration',
  'work_duration',
  'hold_duration',
])

/** The value the form sends, once `adjustmentProblem` says nothing. */
export function adjustmentValue(
  kind: PrescriptionAdjustmentKind,
  written: string,
): number | string {
  const trimmed = written.trim()
  if (kind === 'notes' || kind === 'side') return trimmed
  return Number(trimmed.replace(',', '.'))
}

/**
 * The first criterion, said where a coach is about to adjust.
 *
 * It is the thing this screen is most likely to be misread as doing: editing
 * the gym's routine. It does not — the routine stays, and what is written here
 * reaches only this person's copy.
 */
export function prescriptionNote(): string {
  return 'Esto no cambia la rutina ni el programa del gimnasio: el ajuste es solo para esta persona, y queda guardado con quién lo hizo.'
}

/** Said once a routine's step carries adjustments, so the pair reads as a pair. */
export function adjustedLine(published: number | string | null, unit: string | null): string {
  if (published === null) return 'La rutina no lo fija'
  return `La rutina pide ${String(published)}${unit === null ? '' : ` ${unit}`}`
}

/**
 * What a refusal means, in the coach's words.
 *
 * The 409 is the fourth criterion arriving from the server: the organization no
 * longer manages this programme, so it can be read and not adjusted. The 422s
 * are shapes the screen tries not to reach — a kind its family does not take, a
 * step outside the version — so they say «reload» rather than pretending to
 * explain a case that should not occur.
 */
export function prescriptionWriteFailure(status: number, code: string | undefined): string {
  if (status === 409) {
    return 'No se guardó: el gimnasio ya no administra este programa, así que no se puede ajustar. Lo que ya estaba ajustado sigue en pie.'
  }
  if (status === 403 && code === 'scope-required') {
    return 'No se guardó: ya no tienes su entrenamiento en nivel de registro. Ella decide ese permiso.'
  }
  if (status === 403) {
    return 'No se guardó: tu rol en esta organización no incluye ajustar programas.'
  }
  if (status === 422) {
    return 'No se guardó: ese ajuste no encaja con este paso. Vuelve a cargar la prescripción para verla como está.'
  }
  if (status === 404) {
    return 'No se guardó: este programa ya no está disponible para ti.'
  }
  if (status === 503) {
    return 'No pudimos guardar el ajuste ahora mismo. No quedó nada escrito; vuelve a intentarlo.'
  }
  return 'No pudimos guardar el ajuste. No quedó nada escrito; vuelve a intentarlo.'
}

/** What a refused read means. */
export function prescriptionReadFailure(status: number): string {
  if (status === 403) {
    return 'No podemos mostrarte esta prescripción: hace falta que ella comparta su entrenamiento. El intento queda registrado para que ella lo vea.'
  }
  if (status === 404) {
    return 'Este programa no está disponible para ti. Pasa cuando el vínculo terminó o cuando el programa no es de este gimnasio.'
  }
  return 'No pudimos cargar la prescripción. Vuelve a intentarlo.'
}
