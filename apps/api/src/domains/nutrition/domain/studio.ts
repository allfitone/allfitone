/**
 * What a client eats and the goals she keeps, as the coach who attends her sees them
 * (HU-STUDIO-068..072, ADR-027).
 *
 * Reading needs only that the coach attends her and that she shares the category;
 * proposing a goal also needs `guide_nutrition`, a verified nutrition credential in force
 * and her guidance shared at `contribute`. Every one of those is PostgreSQL's answer, and
 * so is the access record, written before anything is returned. A photo's storage key
 * reaches the API and stops there: Studio reads the image through the API.
 */

import type { AllfitV1Schemas } from '@allfitone/contracts'

export type ClientNutritionMeal = AllfitV1Schemas['ClientNutritionMeal']
export type ClientNutritionDailySummary = AllfitV1Schemas['ClientNutritionDailySummary']
export type ClientNutritionGoalVersion = AllfitV1Schemas['ClientNutritionGoalVersion']
export type ClientActiveNutritionGoal = AllfitV1Schemas['ClientActiveNutritionGoal']
export type ProfessionalGoalCreate = AllfitV1Schemas['ProfessionalNutritionGoalVersionCreate']
export type AppliedScope = AllfitV1Schemas['AppliedScope']

export interface ClientQuery {
  /** The coach, resolved from the session; never from the request. */
  personId: string
  organizationId: string
  subjectPersonId: string
  requestId: string
}

/** Her local days, both ends included, at most thirty-one of them. */
export interface DayRange {
  from: string
  to: string
}

/** The last row of a page: its instant, exactly as PostgreSQL gave it, and its id. */
export interface InstantCursor {
  at: string
  id: string
}

export interface ClientMealQuery extends ClientQuery, DayRange {
  limit: number
  cursor?: InstantCursor
}

export interface ClientGoalQuery extends ClientQuery {
  limit: number
  cursor?: InstantCursor
}

/** Nothing shared names the category it would take; everything else is the answer. */
export type ClientRead<T> =
  | { outcome: 'found'; value: T }
  | { outcome: 'scope_required'; requiredScope: { code: string; level: 'read' } }

export interface ClientMealPage {
  appliedScope: AppliedScope
  /** The `nutrition_media` version that said which meals have a photo, when she shares it. */
  photoScope: AppliedScope | null
  items: ClientNutritionMeal[]
  hasMore: boolean
  nextCursor?: InstantCursor
}

export interface ClientDailySummaries {
  appliedScope: AppliedScope
  days: ClientNutritionDailySummary[]
}

export interface ClientGoalHistory {
  appliedScope: AppliedScope
  items: ClientNutritionGoalVersion[]
  active: ClientActiveNutritionGoal | null
  hasMore: boolean
  nextCursor?: InstantCursor
}

export interface GoalProposal {
  personId: string
  organizationId: string
  subjectPersonId: string
  rationale: string
  targets: ProfessionalGoalCreate['targets']
  idempotencyKey: string
  commandId: string
  requestHash: Buffer
}

export interface GoalProposalResult {
  resource: ClientNutritionGoalVersion
  replayed: boolean
}

export interface StudioNutritionDatabase {
  /** OP-NUT-009, newest first. */
  listMeals(input: ClientMealQuery): Promise<ClientRead<ClientMealPage>>
  /** OP-NUT-010, every day of the range in order. */
  readDailySummaries(input: ClientQuery & DayRange): Promise<ClientRead<ClientDailySummaries>>
  /** OP-NUT-013. The storage key of a photo she shares, or null for anything else. */
  openMealPhoto(input: ClientQuery & { mealId: string }): Promise<string | null>
  /** OP-NUT-011, this relationship's proposals newest first, and her active goal. */
  listGoalVersions(input: ClientGoalQuery): Promise<ClientRead<ClientGoalHistory>>
  /** OP-NUT-012. */
  proposeGoalVersion(input: GoalProposal): Promise<GoalProposalResult>
}
