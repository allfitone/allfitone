/**
 * The training discipline, which nobody is asked for any more.
 *
 * Strength is the only discipline Allfit covers today, so the onboarding stopped
 * showing the carousel that offered it (TECH-47) and the profile does not show it
 * either. Nothing is written in its place: a claim the app declared on its own would
 * read "declared by you" for an answer the person never gave. The default lives here.
 *
 * **The goal still depends on the discipline**, which is why `goalsFor` lives beside
 * it rather than in `goal-form.ts`: the mapping is a property of the discipline, and
 * a second discipline will mean editing this one place.
 *
 * The mapping is deliberately **not** in PostgreSQL. It is not an invariant and not a
 * security boundary — nothing breaks if strength and "run a race" end up side by side —
 * and it is curation that will change with every discipline that lands.
 */

import type { TrainingDiscipline } from './onboarding'
import type { TrainingGoal } from './goal-form'

/** What everybody trains until a second discipline exists. */
export const DEFAULT_DISCIPLINE: TrainingDiscipline = 'strength'

/**
 * The goals a discipline pursues, in the order the goal screen lists them.
 *
 * Strength drops `run_a_race`: it is the one of the five that strength training does
 * not chase, and offering it would promise a plan this discipline is never going to
 * write.
 */
export function goalsFor(
  all: readonly TrainingGoal[],
  discipline: TrainingDiscipline = DEFAULT_DISCIPLINE,
): readonly TrainingGoal[] {
  if (discipline !== 'strength') return all
  return all.filter((goal) => goal !== 'run_a_race')
}
