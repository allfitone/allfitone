/**
 * Proposing a correction to something she declared: `HU-STUDIO-059`.
 *
 * Its five criteria, and who holds each one:
 *
 * 1. **Proposing changes nothing.** There is no way from here to overwrite a
 *    value of hers, and the screen must not read as if there were: the control
 *    proposes, she decides in Space, and her value stands meanwhile.
 * 2. **Only what she declared, and only what this coach can see.** Her sharing
 *    her training at the writing level is checkable here, and so is whether she
 *    wrote anything in that field at all. What a device captured is **not**
 *    checkable: the session answer deliberately carries no capture source, so
 *    that refusal is worded rather than prevented.
 * 3. **She is told, always.** And if she has no address to be told at, there is
 *    no proposal — the server refuses it, and that arrives in the same 409 as a
 *    field that already waits on her.
 * 4. **Thirty days, and silence is not acceptance.** Both halves are said: when
 *    it expires, and that expiring is not a «no» from her.
 * 5. **One proposal per field at a time.** The screen marks a field that is
 *    already waiting, from the caller's own pending list, and does not offer a
 *    second. That list holds one page, so the 409 remains what guarantees it.
 *
 * **The load is proposed in her own unit.** The operation needs a mass unit and
 * hers is one, so there is no unit to pick: a coach correcting 60 kg proposes
 * kilograms. That removes a control, a catalogue read and a way to be wrong.
 */

import type {
  ClientCardSection,
  CorrectionField,
  ExecutionDetailStrengthSet,
  ProposedCorrection,
} from './studio-api'

/** The reason travels with the proposal and she reads it; the column holds 500. */
export const PROPOSAL_REASON_LIMIT = 500

/** What each field is called where it is proposed. */
const FIELD_LABEL: Readonly<Record<CorrectionField, string>> = {
  achieved_reps: 'Repeticiones',
  load: 'Carga',
  rpe: 'RPE',
}

export function correctionFieldLabel(field: CorrectionField): string {
  return FIELD_LABEL[field]
}

/**
 * Whether this coach may propose at all: her training at the writing level.
 *
 * Only that one category — a proposal touches what she recorded of her
 * training, and health context has nothing to do with it. Unlike an
 * observation, a proposal also lands on a session she trained on her own and
 * shares, so where the session came from is not a condition here.
 */
export function canProposeCorrection(sections: readonly ClientCardSection[]): boolean {
  const training = sections.find((section) => section.scope_code === 'relationship_training')
  return training?.access_level === 'contribute'
}

/** One field of one set, as the form offers it. */
export interface CorrectionTarget {
  readonly field: CorrectionField
  /** What she declared, which is what the proposal would replace if she accepts. */
  readonly declared: number
  /** Her own mass unit for a load, and null for the other two. */
  readonly unit: string | null
}

/**
 * Which of a set's three fields can take a proposal.
 *
 * A field she left empty is absent rather than offered: there is nothing to
 * correct, and the server says so with 422 `field`. This is the checkable half
 * of the second criterion.
 */
export function correctionTargets(set: ExecutionDetailStrengthSet): readonly CorrectionTarget[] {
  const targets: CorrectionTarget[] = []
  if (typeof set.achieved_reps === 'number') {
    targets.push({ field: 'achieved_reps', declared: set.achieved_reps, unit: null })
  }
  if (set.load && typeof set.load.value === 'number' && typeof set.load.unit === 'string') {
    targets.push({ field: 'load', declared: set.load.value, unit: set.load.unit })
  }
  if (typeof set.rpe === 'number') {
    targets.push({ field: 'rpe', declared: set.rpe, unit: null })
  }
  return targets
}

/**
 * The proposal of this caller's that is already waiting on this field, if one is.
 *
 * Matched on where it points — the session and the set's order — plus the
 * field. A proposal whose `target` is null is one he no longer reaches, so it
 * cannot be this set's.
 */
export function pendingProposalFor(
  proposals: readonly ProposedCorrection[],
  executionId: string,
  setOrder: number,
  field: CorrectionField,
): ProposedCorrection | undefined {
  return proposals.find(
    (proposal) =>
      proposal.status === 'pending' &&
      proposal.field === field &&
      proposal.target !== null &&
      proposal.target.execution_id === executionId &&
      proposal.target.set_order === setOrder,
  )
}

/**
 * What the form will not send, before anybody presses anything.
 *
 * Every bound here is the server's own, read from the operation: repetitions a
 * whole number from 1 to 1000, an RPE from 0 to 10, a load from 0 and below
 * 10 000. `unchanged` is the server's refusal too — proposing what she already
 * declared is not a correction.
 */
export function proposedValueProblem(
  target: CorrectionTarget,
  written: string,
): 'empty' | 'not-a-number' | 'out-of-range' | 'not-whole' | 'unchanged' | null {
  const trimmed = written.trim()
  if (trimmed.length === 0) return 'empty'
  const value = Number(trimmed.replace(',', '.'))
  if (!Number.isFinite(value)) return 'not-a-number'
  if (target.field === 'achieved_reps') {
    if (!Number.isInteger(value)) return 'not-whole'
    if (value < 1 || value > 1000) return 'out-of-range'
  }
  if (target.field === 'rpe' && (value < 0 || value > 10)) return 'out-of-range'
  if (target.field === 'load' && (value < 0 || value >= 10000)) return 'out-of-range'
  return value === target.declared ? 'unchanged' : null
}

/** The number the form would send, once `proposedValueProblem` says nothing. */
export function proposedValue(written: string): number {
  return Number(written.trim().replace(',', '.'))
}

/** The reason is required: she reads it, and it is what makes the proposal answerable. */
export function proposalReasonProblem(reason: string): 'empty' | 'too-long' | null {
  const written = reason.trim()
  if (written.length === 0) return 'empty'
  return written.length > PROPOSAL_REASON_LIMIT ? 'too-long' : null
}

/**
 * The first criterion, said before the form: nothing of hers moves yet.
 *
 * It sits above the field because the control the coach just pressed reads like
 * it corrects her data, and it does not.
 */
export function proposalNote(): string {
  return 'Esto no cambia nada de lo que ella registró. Le llega la propuesta, ella decide en su app, y mientras tanto su dato sigue como está.'
}

/** The fourth criterion, both halves of it, from the proposal that came back. */
export function proposalExpiryNote(proposal: ProposedCorrection, now: Date): string {
  const expires = new Date(proposal.expires_at)
  const days = Math.max(0, Math.ceil((expires.getTime() - now.getTime()) / 86_400_000))
  const when = days === 1 ? 'mañana' : `en ${String(days)} días`
  return `Vence ${when}. Si no responde, vence sin aceptarse: su silencio no es un sí.`
}

/** Said on a field that already waits on her, instead of offering a second proposal. */
export function pendingProposalNote(proposal: ProposedCorrection, now: Date): string {
  return `Ya le propusiste un cambio en este dato y está esperando su respuesta. ${proposalExpiryNote(proposal, now)}`
}

/** What was proposed, said back. */
export function proposalOutcome(proposal: ProposedCorrection, now: Date): string {
  return `Le propusiste ${correctionFieldLabel(proposal.field).toLocaleLowerCase('es-CO')} y ya le avisamos. Su dato sigue igual hasta que ella acepte. ${proposalExpiryNote(proposal, now)}`
}

/**
 * What a refusal means, in the coach's words.
 *
 * Two different 403s, and they are not the same conversation: `scope-required`
 * is a level she decides, and `forbidden` is a permission the organization
 * decides. Saying «pídele permiso» for the second would send him to the wrong
 * person.
 *
 * The 409 covers three facts at once — a field already waiting, no address to
 * tell her at, an already-settled proposal — and the contract does not tell
 * them apart. So it names the two he can act on without claiming which it was.
 */
export function proposalFailure(
  status: number,
  code: string | undefined,
  issues: readonly { code: string }[],
): string {
  if (status === 403 && code === 'scope-required') {
    return 'No se propuso: ya no tienes su entrenamiento en nivel de registro. Ella decide ese permiso.'
  }
  if (status === 403) {
    return 'No se propuso: tu rol en esta organización no incluye proponer correcciones. Eso lo cambia quien administra el equipo.'
  }
  if (status === 409 && code === 'service-paused') {
    return 'No se propuso: su servicio con la organización está pausado. Eso se resuelve reactivándolo o terminando el vínculo, no propuesta por propuesta.'
  }
  if (status === 409) {
    return 'No se propuso. O ya hay una propuesta esperando su respuesta en este dato, o no tenemos a dónde avisarle: sin forma de avisarle no hay propuesta. Vuelve a cargar la sesión para verla como está.'
  }
  if (status === 422 && issues.some((issue) => issue.code === 'execution')) {
    return 'No se propuso: este dato no lo declaró ella, así que no es suyo para corregir. Solo se puede proponer sobre lo que ella registró a mano.'
  }
  if (status === 422 && issues.some((issue) => issue.code === 'value')) {
    return 'No se propuso: ese valor es el que ella ya tiene registrado, así que no habría nada que corregir.'
  }
  if (status === 422) {
    return 'No se propuso: la propuesta no es válida sobre esta serie. Vuelve a cargar la sesión para verla como está.'
  }
  if (status === 404) {
    return 'No se propuso: esta sesión ya no está disponible para ti. Pasa cuando el vínculo terminó o cuando ella la quitó.'
  }
  if (status === 503) {
    return 'No pudimos enviar la propuesta ahora mismo. No le llegó nada; vuelve a intentarlo.'
  }
  return 'No pudimos enviar la propuesta. No le llegó nada; vuelve a intentarlo.'
}
