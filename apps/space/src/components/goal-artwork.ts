/**
 * What each goal looks like and says: the name, the line under it, and the bodies the
 * stage shows (`HU-SP-010`).
 *
 * Shared by the onboarding and by the screen that edits the goal later, so the same
 * question is answered with the same pictures and the same words in both. A screen
 * that wants another look composes its own; this file holds no layout.
 */

import type { TrainingGoal } from '../client/goal-form'

import loseWeightMaleBefore from '../../assets/images/goal/goal-lose-weight-male-before.webp'
import loseWeightMaleAfter from '../../assets/images/goal/goal-lose-weight-male-after.webp'
import loseWeightFemaleBefore from '../../assets/images/goal/goal-lose-weight-female-before.webp'
import loseWeightFemaleAfter from '../../assets/images/goal/goal-lose-weight-female-after.webp'
import buildMuscleMaleBefore from '../../assets/images/goal/goal-build-muscle-male-before.webp'
import buildMuscleMaleAfter from '../../assets/images/goal/goal-build-muscle-male-after.webp'
import buildMuscleFemaleBefore from '../../assets/images/goal/goal-build-muscle-female-before.webp'
import buildMuscleFemaleAfter from '../../assets/images/goal/goal-build-muscle-female-after.webp'
import getFitMaleBefore from '../../assets/images/goal/goal-get-fit-male-before.webp'
import getFitMaleAfter from '../../assets/images/goal/goal-get-fit-male-after.webp'
import getFitFemaleBefore from '../../assets/images/goal/goal-get-fit-female-before.webp'
import getFitFemaleAfter from '../../assets/images/goal/goal-get-fit-female-after.webp'
import runARaceMaleBefore from '../../assets/images/goal/goal-run-a-race-male-before.webp'
import runARaceMaleAfter from '../../assets/images/goal/goal-run-a-race-male-after.webp'
import runARaceFemaleBefore from '../../assets/images/goal/goal-run-a-race-female-before.webp'
import runARaceFemaleAfter from '../../assets/images/goal/goal-run-a-race-female-after.webp'
import maintainMaleSingle from '../../assets/images/goal/goal-maintain-male-single.webp'
import maintainFemaleSingle from '../../assets/images/goal/goal-maintain-female-single.webp'

/**
 * Copy and artwork per goal. The icon names come from the design system, whose
 * catalogue owns what an icon means; the app never decides that.
 */
export const GOAL_ARTWORK: Record<
  TrainingGoal,
  {
    name: string
    why: string
    icon: 'weight' | 'training' | 'activity' | 'race' | 'heart'
    male: { before: number; after: number | null }
    female: { before: number; after: number | null }
  }
> = {
  lose_weight: {
    name: 'Bajar de peso',
    why: 'Reduce grasa corporal y mejora tu composición.',
    icon: 'weight',
    male: { before: loseWeightMaleBefore, after: loseWeightMaleAfter },
    female: { before: loseWeightFemaleBefore, after: loseWeightFemaleAfter },
  },
  build_muscle: {
    name: 'Construir músculo',
    why: 'Aumenta tu masa muscular y tu fuerza.',
    icon: 'training',
    male: { before: buildMuscleMaleBefore, after: buildMuscleMaleAfter },
    female: { before: buildMuscleFemaleBefore, after: buildMuscleFemaleAfter },
  },
  get_fit: {
    name: 'Ponerme en forma',
    why: 'Mejora tu condición física y energía diaria.',
    icon: 'activity',
    male: { before: getFitMaleBefore, after: getFitMaleAfter },
    female: { before: getFitFemaleBefore, after: getFitFemaleAfter },
  },
  run_a_race: {
    name: 'Correr una carrera',
    why: 'Prepárate para completar tu próxima carrera.',
    icon: 'race',
    male: { before: runARaceMaleBefore, after: runARaceMaleAfter },
    female: { before: runARaceFemaleBefore, after: runARaceFemaleAfter },
  },
  maintain: {
    name: 'Mantenerme',
    why: 'Mantén tu estado actual y hábitos saludables.',
    icon: 'heart',
    male: { before: maintainMaleSingle, after: null },
    female: { before: maintainFemaleSingle, after: null },
  },
}
