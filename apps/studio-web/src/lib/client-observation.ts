/**
 * Leaving a professional observation on a session, and correcting one's own:
 * `HU-STUDIO-057` and `HU-STUDIO-058`.
 *
 * Both stories act on the same object, so they share this module — and the same
 * 2 000-character limit, which is the column's and not a choice.
 *
 * **Correcting one (`HU-STUDIO-058`)** turns on who may do it and what the
 * correction cannot move:
 *
 * 1. **Only its author**, and only while he still attends her with her category
 *    at the writing level. Anybody else's observation and one he no longer
 *    reaches answer the same 404, so the control is offered only where it can
 *    work — the screen decides from what it already read.
 * 2. **Nothing of hers is correctable here.** What she declared and what a
 *    device captured are not observations; a correction reaches one row of this
 *    list and nothing else on the session.
 * 3. **The old text is kept with the reason**, which is why the reason is
 *    required rather than optional: without it the history says what changed
 *    and never why.
 * 4. **A transcription stays hers.** Correcting what she said does not make the
 *    coach its author: provenance, session and category never move.
 *
 * Its four criteria, and who holds each one:
 *
 * 1. **Contributing needs the writing level**, and a read-only grant does not
 *    enable it. Her card carries the level she granted, so the form decides
 *    before asking rather than offering a field the server will refuse — and
 *    the refusal is still handled, because she can withdraw it while the form
 *    is open.
 * 2. **An observation coexists with what she declared.** Nothing here edits
 *    anything of hers: the command only adds, and the screen lists what was
 *    added beside the rest.
 * 3. **A transcription stays hers.** `person_declared` records the coach as who
 *    captured it, not as its author — and that has to be said where it is
 *    chosen, because a reader who does not know it would think he is signing
 *    her words.
 * 4. **Pain or a limitation is health context**, protected by that category and
 *    not by the session's. That is why there are two categories here with
 *    **two different grants**, which is the thing about this story that is easy
 *    to get wrong: having her training at the writing level says nothing about
 *    whether pain may be written down.
 *
 * **And the form is not offered at all on a session this relationship did not
 * produce.** The contract answers 422 for one she trained before it, so
 * offering the field there would be offering a refusal.
 */

import type {
  AuthorizedExecution,
  ClientCardSection,
  ObservationCategory,
  ObservationProvenance,
  ProfessionalObservation,
} from './studio-api'

/** The column holds 2 000 characters, and the API refuses 2 001. */
const CONTENT_LIMIT = 2000

/** The reason for a correction has its own, shorter column. */
export const REASON_LIMIT = 500

/**
 * What the picker can show for one category.
 *
 * Three states and not two, for the same reason the assignment's permission has
 * three: «she shared it only to read» is something a coach can act on by asking
 * her, and «she never shared it» is not. A category she never shared is absent
 * rather than read-only, because drawing it would claim she shared it.
 */
export interface ObservationCategoryOffer {
  readonly category: ObservationCategory
  readonly state: 'open' | 'read-only'
}

/**
 * Which categories this coach may write on this session, in reading order.
 *
 * Empty when the session cannot be written on at all: one this relationship did
 * not produce, or one that has not finished. The operation says «one finished,
 * valid session this relationship produced», and both halves are checkable here.
 */
export function observationCategories(
  execution: Pick<AuthorizedExecution, 'origin' | 'ended_at'>,
  sections: readonly ClientCardSection[],
): readonly ObservationCategoryOffer[] {
  if (execution.origin !== 'relationship' || execution.ended_at === null) return []

  const offers: ObservationCategoryOffer[] = []
  for (const [category, scope] of [
    ['training', 'relationship_training'],
    ['health', 'health_context'],
  ] as const) {
    const shared = sections.find((section) => section.scope_code === scope)
    if (!shared) continue
    offers.push({
      category,
      state: shared.access_level === 'contribute' ? 'open' : 'read-only',
    })
  }
  return offers
}

/** What each category is for, said where it is chosen. */
export function observationCategoryNote(category: ObservationCategory): string {
  if (category === 'training') {
    return 'Tu lectura de cómo entrenó. Queda junto a lo que ella registró, sin cambiarlo.'
  }
  return 'Dolor o una limitación que observaste. Se guarda como contexto de salud y se protege con ese permiso, no con el de la sesión.'
}

/**
 * What choosing each provenance does. This is the third criterion, and it lives
 * at the point of choice because nothing else on the screen can say it.
 */
export function observationProvenanceNote(provenance: ObservationProvenance): string {
  if (provenance === 'professional_observation') {
    return 'Queda firmada por ti, como tu lectura profesional.'
  }
  return 'Lo dijo ella y tú solo lo transcribes: el dato sigue siendo suyo y tú quedas como quien lo capturó.'
}

/** What the form will not send, and why, before anybody presses anything. */
export function observationContentProblem(content: string): 'empty' | 'too-long' | null {
  const written = content.trim()
  if (written.length === 0) return 'empty'
  return written.length > CONTENT_LIMIT ? 'too-long' : null
}

/**
 * What was written, said back.
 *
 * A transcription says whose the content stays rather than which category it
 * went under: that is the fact a coach would otherwise have to take on trust.
 */
export function observationOutcome(observation: ProfessionalObservation): string {
  if (observation.provenance === 'person_declared') {
    return 'Quedó transcrito lo que ella dijo. El dato sigue siendo suyo.'
  }
  if (observation.category === 'health') return 'Quedó tu observación de contexto de salud.'
  return 'Quedó tu observación sobre cómo entrenó.'
}

/**
 * What a refusal means, in the coach's words.
 *
 * The 403 **names the category**, because the level is hers to raise and he
 * cannot ask for the right thing without knowing which one it was. The 409 says
 * where a paused service is resolved, which is never here. And nothing says
 * «try again» where retrying cannot work.
 */
export function observationWriteFailure(
  status: number,
  code: string | undefined,
  category: ObservationCategory,
): string {
  if (status === 403) {
    const which = category === 'health' ? 'su contexto de salud' : 'su entrenamiento'
    return `No se guardó: ya no tienes ${which} en nivel de registro. Ella decide ese permiso.`
  }
  if (status === 409 && code === 'service-paused') {
    return 'No se guardó: su servicio con la organización está pausado. Eso se resuelve reactivándolo o terminando el vínculo, no observación por observación.'
  }
  if (status === 422) {
    return 'No se guardó: sobre esta sesión no se puede escribir. Vuelve a cargarla para verla como está.'
  }
  if (status === 404) return 'Esta sesión ya no está disponible para ti.'
  if (status === 503) {
    return 'No pudimos guardar la observación ahora mismo. No quedó nada escrito; vuelve a intentarlo.'
  }
  return 'No pudimos guardar la observación. No quedó nada escrito; vuelve a intentarlo.'
}

/**
 * Whether this reader may correct this observation.
 *
 * Two conditions and not one: **his own** (`authored_by_me`, which the contract
 * says is what makes it correctable) **and** the category still open to him.
 * The second is what carries the fourth criterion — a relationship that ended
 * leaves no offer at all, so the control disappears with it rather than waiting
 * for a 404 to say so.
 */
export function observationCorrectable(
  offers: readonly ObservationCategoryOffer[],
  observation: Pick<ProfessionalObservation, 'authored_by_me' | 'category'>,
): boolean {
  if (!observation.authored_by_me) return false
  return offers.some((offer) => offer.category === observation.category && offer.state === 'open')
}

/**
 * What the correction will not send, before anybody presses anything.
 *
 * `unchanged` is a refusal the server makes too, and it is caught here because
 * «no se guardó» on a correction that changed nothing reads like a failure when
 * it is a no-op.
 */
export function observationCorrectionProblem(
  content: string,
  original: string,
): 'empty' | 'too-long' | 'unchanged' | null {
  const written = content.trim()
  if (written.length === 0) return 'empty'
  if (written.length > CONTENT_LIMIT) return 'too-long'
  return written === original.trim() ? 'unchanged' : null
}

/** The reason is required: the history keeps what changed, and this is the why. */
export function observationReasonProblem(reason: string): 'empty' | 'too-long' | null {
  const written = reason.trim()
  if (written.length === 0) return 'empty'
  return written.length > REASON_LIMIT ? 'too-long' : null
}

/** What a correction cannot move, said where it is made. */
export function observationCorrectionNote(provenance: ObservationProvenance): string {
  if (provenance === 'person_declared') {
    return 'Esto lo dijo ella y tú lo transcribiste. Corregirlo no te vuelve su autor: el dato sigue siendo suyo y tú sigues siendo quien lo capturó.'
  }
  return 'Se guarda el texto anterior junto con tu motivo, y eso ya no se puede editar. Quién la escribió, sobre qué sesión y bajo qué categoría no cambian.'
}

/** What was corrected, said back. */
export function observationCorrectionOutcome(observation: ProfessionalObservation): string {
  if (observation.provenance === 'person_declared') {
    return 'Quedó corregida la transcripción. Se guardó el texto anterior con tu motivo, y el dato sigue siendo suyo.'
  }
  return 'Quedó corregida. Se guardó el texto anterior con tu motivo.'
}

/**
 * What a refusal of the correction means, in the coach's words.
 *
 * `stale-draft` is not here: it is not a failure, it hands back the observation
 * as it stands and the screen shows it. The 404 covers «no longer yours to
 * correct» without telling the two causes apart, because the contract does not
 * — and the control is only offered on his own, so the relationship ending
 * while the screen was open is the case worth naming.
 */
export function observationCorrectionFailure(
  status: number,
  code: string | undefined,
  category: ObservationCategory,
): string {
  if (status === 403) {
    const which = category === 'health' ? 'su contexto de salud' : 'su entrenamiento'
    return `No se corrigió: ya no tienes ${which} en nivel de registro. Ella decide ese permiso.`
  }
  if (status === 409 && code === 'service-paused') {
    return 'No se corrigió: su servicio con la organización está pausado. Eso se resuelve reactivándolo o terminando el vínculo, no observación por observación.'
  }
  if (status === 404) {
    return 'No se corrigió: ya no puedes corregir esta observación. Pasa cuando el vínculo con ella terminó mientras tenías la pantalla abierta.'
  }
  if (status === 422) {
    return 'No se corrigió: la corrección no se pudo aplicar. Vuelve a cargar la sesión para verla como está ahora.'
  }
  if (status === 503) {
    return 'No pudimos guardar la corrección ahora mismo. La observación quedó como estaba; vuelve a intentarlo.'
  }
  return 'No pudimos guardar la corrección. La observación quedó como estaba; vuelve a intentarlo.'
}

/**
 * The observation a `stale-draft` hands back, when it is one.
 *
 * `current_state` is typed `unknown` because a problem document may carry
 * anything, and here the contract is narrower than the server: it lists three
 * draft shapes and not this one. A shape that is not an observation is treated
 * as absent rather than rendered half-read.
 */
export function observationFromConflict(value: unknown): ProfessionalObservation | undefined {
  if (typeof value !== 'object' || value === null) return undefined
  if (!('content' in value) || typeof value.content !== 'string') return undefined
  if (!('revision_number' in value) || typeof value.revision_number !== 'number') return undefined
  return value as ProfessionalObservation
}
