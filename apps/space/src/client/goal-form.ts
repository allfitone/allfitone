/**
 * The training goal screen, minus the rendering.
 *
 * Everything here could have lived in `app/onboarding/goal.tsx` and been
 * impossible to check: `bun test src` is the only glob the workspace runs, and no
 * component renderer is installed, so anything left in `app/` is untestable.
 *
 * The geometry is measured from the laid-out row, never derived from the window.
 * That mistake was made twice on the sex screen and cost two rounds: `Screen`
 * already applies `panelInset` on each side, so computing from the window
 * double-counts the padding and the content overflows by exactly that much. The
 * other half of the same lesson is that a percentage width with no resolved base
 * makes Yoga fall back to the image's intrinsic size, which turned a portrait into
 * 747 pt of height.
 *
 * Which photo a goal shows depends on what the person declared one screen earlier.
 * Female brings the woman; male and declining bring the man. Declining is not a
 * third case with its own artwork: there is no neutral body, and inventing one
 * would be a worse answer than picking a default and saying so.
 */

/** The five offered in the initial V1 launch, in the order the screen lists them. */
export const TRAINING_GOALS = [
  'lose_weight',
  'build_muscle',
  'get_fit',
  'run_a_race',
  'maintain',
] as const

export type TrainingGoal = (typeof TRAINING_GOALS)[number]

/** Lo que separa el escenario de la lista que hay debajo. */
export const CARD_GAP = 14

/**
 * El escenario, que existe desde el primer fotograma.
 *
 * **Alto fijo y no una tarjeta que crece.** La pantalla anterior promovía la fila
 * elegida a tarjeta en su propio sitio, y aunque no reordenaba nada, cada toque movía
 * las cuatro filas de debajo. Con el escenario arriba la lista no se mueve nunca: lo
 * único que cambia al elegir es lo que hay dentro del escenario.
 *
 * Doscientos cuarenta y seis es la medida del lienzo. `STAGE_CHROME` es todo lo demás
 * del marco —cabecera, título, bajada, las cinco filas, el botón y los aires—, medido
 * y no estimado, y en un aparato bajo el escenario cede alto antes que empujar el
 * botón fuera de la pantalla.
 */
export const STAGE_MAX = 246
export const STAGE_MIN = 168
export const STAGE_CHROME = 615

export function stageHeight(screenHeight: number): number {
  const affordable = screenHeight - STAGE_CHROME
  return Math.max(STAGE_MIN, Math.min(STAGE_MAX, affordable))
}

/**
 * When the sex question is declined, the artwork is mixed rather than defaulting
 * to one sex for everything. A screen where every goal shows a man would be a
 * statement, and declining is precisely the answer that asks us not to make one.
 * The split is decided per goal so the screen as a whole reads as neither.
 */
const DECLINED_VARIANT: Record<TrainingGoal, 'male' | 'female'> = {
  lose_weight: 'female',
  build_muscle: 'male',
  get_fit: 'female',
  run_a_race: 'male',
  maintain: 'male',
}

/**
 * Which body to show. Declared female brings the woman and declared male brings
 * the man; declining brings the mix above.
 */
export function bodyVariant(
  biologicalSex: 'male' | 'female' | null,
  goal: TrainingGoal,
): 'male' | 'female' {
  if (biologicalSex === 'female') return 'female'
  if (biologicalSex === 'male') return 'male'
  return DECLINED_VARIANT[goal]
}

export interface GoalSubmission {
  /** Undefined means nothing chosen yet, which is not the same as a choice. */
  goal: TrainingGoal | undefined
  submitting: boolean
  sessionExpired: boolean
}

export function canSubmitGoal({ goal, submitting, sessionExpired }: GoalSubmission): boolean {
  if (submitting || sessionExpired) return false
  return goal !== undefined
}

/** Share of the card width the figures may occupy, leaving the rest for the copy. */
export const STRIP_SHARE = 0.56

/** How far the front figure of a pair sits from the one behind, as a share of its
 *  width: the designed spacing, and the closest the two may get before they shrink. */
export const PAIR_OVERLAP = 0.55
export const PAIR_OVERLAP_MIN = 0.25

/**
 * How tall the pair is and how close its figures stand.
 *
 * The artwork is cut at the chin, and the cut only reads as intended on the card's top
 * edge, so the pair takes the card height first. Sized by the width alone it stopped
 * short and the heads looked sliced off. When the strip is short the figures move
 * closer; only past `PAIR_OVERLAP_MIN` do they shrink, which keeps the wide running
 * profile out of the copy.
 */
export function pairLayout(
  cardWidth: number,
  cardHeight: number,
  beforeAspect: number,
  afterAspect: number,
  edge: number,
): { height: number; overlap: number } {
  const strip = cardWidth * STRIP_SHARE - edge
  if (afterAspect <= 0 || beforeAspect <= 0 || strip <= 0) return { height: 0, overlap: 0 }
  const needed = (strip / cardHeight - beforeAspect) / afterAspect
  if (needed >= PAIR_OVERLAP_MIN) {
    return { height: cardHeight, overlap: Math.min(PAIR_OVERLAP, needed) }
  }
  const height = strip / (afterAspect * PAIR_OVERLAP_MIN + beforeAspect)
  return { height: Math.min(cardHeight, height), overlap: PAIR_OVERLAP_MIN }
}

/** The narrowest the copy column gets, as the share of the card kept free on its right. */
export const COPY_FLOOR = 0.42

/**
 * How much of the card's right side the copy leaves free: up to where the front figure
 * starts. The figure behind may sit under the copy, because the veil fades it.
 */
export function copyInset(
  cardWidth: number,
  frontWidth: number,
  frontRight: number,
  gap: number,
): number {
  return Math.max(cardWidth * COPY_FLOOR, frontRight + frontWidth + gap)
}

/**
 * How tall the lone figure may be: `maintain`, and the stage before a goal is chosen.
 *
 * The artwork is cut at the chin on purpose, and the cut only reads as intended when it
 * sits on the top edge of the card. It used to be sized to a third of the width, which
 * left it short of the top with the cut floating in the card like a head sliced off. Same
 * rule as the pair: the card height when the strip allows it, smaller only when it does not.
 */
export function singleHeight(
  cardWidth: number,
  cardHeight: number,
  aspect: number,
  edge: number,
): number {
  if (aspect <= 0) return 0
  const affordable = (cardWidth * STRIP_SHARE - edge) / aspect
  return Math.max(0, Math.min(cardHeight, affordable))
}
