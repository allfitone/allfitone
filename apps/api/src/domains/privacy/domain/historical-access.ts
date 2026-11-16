/**
 * The historical access case (HU-STUDIO-061..063, OP-PRV-018/019/020/025): a time-boxed,
 * audited, read-only window onto a relationship the organization ended.
 *
 * PostgreSQL owns every rule here. It decides who may open a case and whom it may
 * authorize, when the case stops counting, whether the sign-in is recent enough, and
 * what stayed readable after the cut. It also writes the access record before it
 * answers. These types carry its answers and nothing else.
 */

import type { AllfitV1Schemas } from '@allfitone/contracts'

export type HistoricalAccessPurpose = AllfitV1Schemas['HistoricalAccessPurpose']
export type HistoricalAccessCase = AllfitV1Schemas['HistoricalAccessCase']
export type HistoricalRelationship = AllfitV1Schemas['HistoricalRelationship']
export type FrozenExecutionSummary = AllfitV1Schemas['FrozenExecutionSummary']
export type FrozenExecution = AllfitV1Schemas['FrozenExecution']
export type FrozenBodyProgressRecord = AllfitV1Schemas['ClientBodyProgressRecord']
export type FrozenNutritionGoalVersion = AllfitV1Schemas['FrozenNutritionGoalVersion']
export type AppliedScope = AllfitV1Schemas['AppliedScope']

export const HISTORICAL_ACCESS_PURPOSES: readonly HistoricalAccessPurpose[] = [
  'service_dispute',
  'legal_or_regulatory_obligation',
  'customer_support_request',
  'security_investigation',
  'authorized_quality_review',
]

/** The Studio member, and the access session whose sign-in a step-up asks about. */
export interface HistoricalAccessActor {
  personId: string
  sessionId: string
}

export interface CaseCommand {
  idempotencyKey: string
  commandId: string
  requestHash: Buffer
}

export interface OpenCaseInput extends CaseCommand {
  organizationId: string
  relationshipId: string
  authorizedMembershipId: string
  purpose: HistoricalAccessPurpose
  caseReference: string
  justification: string
  durationHours: number
}

export interface CloseCaseInput extends CaseCommand {
  organizationId: string
  caseId: string
}

export interface CaseCommandResult {
  resource: HistoricalAccessCase
  replayed: boolean
}

export interface CaseCursor {
  openedAt: string
  id: string
}

export interface CaseListQuery {
  organizationId: string
  relationshipId?: string
  limit: number
  cursor?: CaseCursor
}

export interface CasePage {
  items: HistoricalAccessCase[]
  hasMore: boolean
  nextCursor?: CaseCursor
}

/** Which case a read goes through, over which relationship. */
export interface FrozenTarget {
  organizationId: string
  relationshipId: string
  caseId: string
  requestId: string
}

export interface FrozenExecutionCursor {
  startedAt: string
  id: string
}

export interface FrozenBodyCursor {
  measuredOn: string
  id: string
}

export interface FrozenPageQuery<Cursor> {
  limit: number
  cursor?: Cursor
}

export interface RequiredFrozenScope {
  code: string
  level: 'read' | 'contribute'
}

/** Not found also stands for a case the caller may not use: the two read the same. */
export type FrozenRead<T> =
  | { outcome: 'found'; value: T }
  | { outcome: 'not_found' }
  | { outcome: 'scope_required'; requiredScope: RequiredFrozenScope }

export interface FrozenPage<Item, Cursor> {
  items: Item[]
  hasMore: boolean
  nextCursor?: Cursor
}

export interface FrozenBodyPage extends FrozenPage<FrozenBodyProgressRecord, FrozenBodyCursor> {
  appliedScope: AppliedScope
}

/** A proposal's creation, exactly as PostgreSQL wrote it, and its id. */
export interface FrozenGoalCursor {
  createdAt: string
  id: string
}

export interface FrozenGoalPage extends FrozenPage<FrozenNutritionGoalVersion, FrozenGoalCursor> {
  appliedScope: AppliedScope
}

export interface HistoricalAccessDatabase {
  open(actor: HistoricalAccessActor, input: OpenCaseInput): Promise<CaseCommandResult>
  close(actor: HistoricalAccessActor, input: CloseCaseInput): Promise<CaseCommandResult>
  list(actor: HistoricalAccessActor, query: CaseListQuery): Promise<CasePage>
  readRelationship(
    actor: HistoricalAccessActor,
    target: FrozenTarget,
  ): Promise<FrozenRead<HistoricalRelationship>>
  listExecutions(
    actor: HistoricalAccessActor,
    target: FrozenTarget,
    page: FrozenPageQuery<FrozenExecutionCursor>,
  ): Promise<FrozenRead<FrozenPage<FrozenExecutionSummary, FrozenExecutionCursor>>>
  readExecution(
    actor: HistoricalAccessActor,
    target: FrozenTarget,
    executionId: string,
  ): Promise<FrozenRead<FrozenExecution>>
  listBodyProgress(
    actor: HistoricalAccessActor,
    target: FrozenTarget,
    page: FrozenPageQuery<FrozenBodyCursor>,
  ): Promise<FrozenRead<FrozenBodyPage>>
  /** OP-NUT-011 through a case: what the relationship proposed by the cut. */
  listGoalVersions(
    actor: HistoricalAccessActor,
    target: FrozenTarget,
    page: FrozenPageQuery<FrozenGoalCursor>,
  ): Promise<FrozenRead<FrozenGoalPage>>
}
