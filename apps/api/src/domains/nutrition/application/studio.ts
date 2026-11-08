/**
 * The coach's side of a client's nutrition (HU-STUDIO-068..072).
 *
 * The reads and the proposal are the database's: it decides, records and shapes. What
 * this adds is the photo itself, fetched from the private store only after PostgreSQL
 * has rechecked both shares and recorded the access, so the image travels through the
 * API and the key never leaves it. A key whose object is gone reads as no photo.
 */

import type { ObjectStore, StoredObject } from '@allfitone/object-store'

import type { ClientQuery, StudioNutritionDatabase } from '../domain/studio.js'

export type {
  ClientDailySummaries,
  ClientGoalHistory,
  ClientGoalQuery,
  ClientMealPage,
  ClientMealQuery,
  ClientNutritionMeal,
  ClientNutritionGoalVersion,
  ClientRead,
  GoalProposal,
  GoalProposalResult,
  InstantCursor,
  ProfessionalGoalCreate,
} from '../domain/studio.js'

export interface StudioNutritionService {
  meals: StudioNutritionDatabase['listMeals']
  dailySummaries: StudioNutritionDatabase['readDailySummaries']
  goalVersions: StudioNutritionDatabase['listGoalVersions']
  proposeGoal: StudioNutritionDatabase['proposeGoalVersion']
  /** OP-NUT-013. The image, or null when there is no photo she shares to give. */
  mealPhoto(input: ClientQuery & { mealId: string }): Promise<StoredObject | null>
}

export function createStudioNutritionService(
  database: StudioNutritionDatabase,
  store: ObjectStore,
): StudioNutritionService {
  return {
    meals: (input) => database.listMeals(input),
    dailySummaries: (input) => database.readDailySummaries(input),
    goalVersions: (input) => database.listGoalVersions(input),
    proposeGoal: (input) => database.proposeGoalVersion(input),
    async mealPhoto(input) {
      const mediaRef = await database.openMealPhoto(input)
      return mediaRef ? store.get(mediaRef) : null
    },
  }
}
