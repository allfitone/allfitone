/**
 * Leaving a professional observation on a session: `HU-STUDIO-057`.
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
