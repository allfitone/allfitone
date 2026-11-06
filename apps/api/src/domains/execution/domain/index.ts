/**
 * What a training session is once it has happened.
 *
 * Types come from the contract, as every Space-facing shape does: this is a client of
 * the OpenAPI document, not a second place where a session is defined.
 */

import type { AllfitV1Schemas } from '@allfitone/contracts'

export type Execution = AllfitV1Schemas['SpaceExecution']
export type Attempt = AllfitV1Schemas['Attempt']
export type FreeSession = AllfitV1Schemas['FreeSession']
export type ResultsState = AllfitV1Schemas['ExecutionResultsState']
export type Finalized = AllfitV1Schemas['ExecutionFinalized']
export type Abandoned = AllfitV1Schemas['ExecutionAbandoned']
export type ExecutionResultsReplace = AllfitV1Schemas['ExecutionResultsReplace']
export type WeekSummary = AllfitV1Schemas['SpaceWeekSummary']
export type ExecutionSummary = AllfitV1Schemas['SpaceExecutionSummary']
export type FinishedExecution = AllfitV1Schemas['SpaceFinishedExecution']
export type ExecutionRevision = AllfitV1Schemas['ExecutionRevision']
export type Revised = AllfitV1Schemas['ExecutionRevised']
export type Invalidated = AllfitV1Schemas['ExecutionInvalidated']
export type InvalidationPreview = AllfitV1Schemas['SpaceInvalidationPreview']
export type Repeated = AllfitV1Schemas['ExecutionRepeated']

/** The summary as PostgreSQL holds it: the photograph is still a storage key. */
export type SummaryRow = Omit<ExecutionSummary, 'cover_url'> & { cover_object_key: string | null }
export type HistoryItem = AllfitV1Schemas['SpaceHistoryItem']
export type HistoryPage = AllfitV1Schemas['SpaceHistoryPage']
export type HistoryMonth = AllfitV1Schemas['SpaceHistoryMonth']
export type PeriodComparison = AllfitV1Schemas['SpacePeriodComparison']
/** A history row as PostgreSQL answers it: the thumbnail's key, never its address. */
export type HistoryRow = Omit<HistoryItem, 'thumbnail_url'> & {
  thumbnail_object_key: string | null
}
export interface HistoryRowPage {
  readonly data: readonly HistoryRow[]
  readonly window: HistoryPage['window']
  readonly page: HistoryPage['page']
}
export interface HistoryQuery {
  personId: string
  timezone: string
  /** Any day of the month, in the person's zone; null for every month. */
  month: string | null
  discipline: string | null
  withRecord: boolean | null
  free: boolean | null
  query: string | null
  cursor: string | null
  limit: number
  /** A day picked on the month's calendar; null for the whole month. */
  day: string | null
  requestId: string
}

export interface ExecutionCommand {
  idempotencyKey: string
  commandId: string
  requestHash: Buffer
}

export interface ExecutionDatabase {
  startAttempt(
    input: ExecutionCommand & {
      personId: string
      plannedSessionId: string
      startedAt: string
      timezone: string
      requestedLevel: string
      captureSource: string
    },
  ): Promise<Attempt>
  /** A session with no planned session behind it; one is open at a time (55006 otherwise). */
  startFreeSession(
    input: ExecutionCommand & {
      personId: string
      disciplineCode: string
      startedAt: string
      timezone: string
      requestedLevel: string
      captureSource: string
    },
  ): Promise<FreeSession>
  readOpenFreeSession(input: { personId: string; requestId: string }): Promise<string | null>
  replaceResults(
    input: ExecutionCommand & {
      personId: string
      executedSessionId: string
      revisionNumber: number
      results: ExecutionResultsReplace
    },
  ): Promise<ResultsState>
  finalize(
    input: ExecutionCommand & { personId: string; executedSessionId: string; endedAt: string },
  ): Promise<Finalized>
  abandon(
    input: ExecutionCommand & { personId: string; executedSessionId: string; endedAt: string },
  ): Promise<Abandoned>
  /** Null when it does not exist or is not this person's — the same answer, on purpose. */
  readExecution(input: {
    personId: string
    executedSessionId: string
    requestId: string
  }): Promise<Execution | null>
  readWeekSummary(input: {
    personId: string
    timezone: string
    requestId: string
  }): Promise<WeekSummary>
  /**
   * Null when it does not exist or is not this person's. A session still open is refused
   * by PostgreSQL with SQLSTATE 55000 (ADR-036).
   */
  readSummary(input: {
    personId: string
    executedSessionId: string
    timezone: string
    requestId: string
  }): Promise<SummaryRow | null>
  /** `OP-EXE-014`. A malformed cursor is refused by PostgreSQL with SQLSTATE 22023. */
  listHistory(input: HistoryQuery): Promise<HistoryRowPage>
  /** `OP-EXE-023`. Null when annulled, unfinished, absent or another person's. */
  readFinished(input: {
    personId: string
    executedSessionId: string
    timezone: string
    requestId: string
  }): Promise<FinishedExecution | null>
  /** `OP-EXE-007`. A stale revision is refused with SQLSTATE 40001. */
  revise(
    input: ExecutionCommand & {
      personId: string
      executedSessionId: string
      revisionNumber: number
      revision: ExecutionRevision
    },
  ): Promise<Revised>
  /** `OP-EXE-009`. Null reason is recorded as PostgreSQL's default. */
  annul(
    input: ExecutionCommand & {
      personId: string
      executedSessionId: string
      reason: string | null
    },
  ): Promise<Invalidated>
  /** `OP-EXE-024`. Null when the session cannot be annulled. */
  readAnnulmentPreview(input: {
    personId: string
    executedSessionId: string
    timezone: string
    requestId: string
  }): Promise<InvalidationPreview | null>
  /** `OP-EXE-025`. Another session open is refused with SQLSTATE 55006. */
  repeat(
    input: ExecutionCommand & {
      personId: string
      executedSessionId: string
      startedAt: string
      timezone: string
    },
  ): Promise<Repeated>
  /** `OP-EXE-022`. A month with nothing in it answers zeros, never null. */
  readHistoryMonth(input: {
    personId: string
    timezone: string
    month: string
    requestId: string
  }): Promise<HistoryMonth>
  /** `OP-EXE-026`. Pro: the database refuses with AF402 when the plan does not open it. */
  comparePeriods(input: {
    personId: string
    timezone: string
    period: PeriodComparison['period']
    count: number
    /** An assignment id, `free`, or null for everything. */
    program: string | null
    requestId: string
  }): Promise<PeriodComparison>
  /** `OP-EXE-020`. Hers, soonest to expire first. */
  listCorrectionProposals(input: CorrectionQuery): Promise<CorrectionPage<CorrectionProposal>>
  /** `OP-EXE-013`. Settled, cancelled or past its thirty days is 55000 naming the state. */
  decideCorrectionProposal(
    input: ExecutionCommand & {
      personId: string
      proposalId: string
      decision: CorrectionDecision
    },
  ): Promise<CorrectionCommandResult<CorrectionProposal>>
}

/**
 * What the coach who attends a person may read of her training (`OP-EXE-017`,
 * `OP-EXE-018`). Which sessions, under which category, is PostgreSQL's answer.
 */
export type AuthorizedExecution = AllfitV1Schemas['AuthorizedExecution']
export type AuthorizedExecutionSummary = AllfitV1Schemas['AuthorizedExecutionSummary']

export interface AuthorizedExecutionQuery {
  /** The coach, resolved from the Studio session. */
  personId: string
  organizationId: string
  subjectPersonId: string
  requestId: string
}

export interface AuthorizedExecutionCursor {
  startedAt: string
  id: string
}

export interface AuthorizedExecutionPage {
  items: AuthorizedExecutionSummary[]
  hasMore: boolean
  nextCursor?: AuthorizedExecutionCursor
}

export type AuthorizedExecutionRead =
  | { outcome: 'found'; execution: AuthorizedExecution }
  | { outcome: 'not_found' }
  | { outcome: 'scope_required'; requiredScope: { code: string; level: 'read' | 'contribute' } }

/**
 * Her progress as the coach may see it (`OP-EXE-019`), and the coach's reading of a
 * session beside what she declared (`OP-EXE-010`, `OP-EXE-011`).
 */
export type ClientProgress = AllfitV1Schemas['ClientProgress']
export type ProfessionalObservation = AllfitV1Schemas['ProfessionalObservation']
export type ProfessionalObservationCategory = AllfitV1Schemas['ProfessionalObservationCategory']
export type ProfessionalObservationProvenance = AllfitV1Schemas['ProfessionalObservationProvenance']

export type ClientProgressRead =
  | { outcome: 'found'; progress: ClientProgress }
  | { outcome: 'scope_required'; requiredScope: { code: string; level: 'read' | 'contribute' } }

export interface ObservationCommandResult {
  resource: ProfessionalObservation
  replayed: boolean
}

/**
 * A correction a professional proposes to a set she declared (`OP-EXE-012`), as he sees it
 * and as she sees it (`OP-EXE-020`), and her decision (`OP-EXE-013`).
 */
export type ProposedCorrection = AllfitV1Schemas['ProposedCorrection']
export type CorrectionProposal = AllfitV1Schemas['CorrectionProposal']
export type CorrectionField = AllfitV1Schemas['CorrectionField']
export type CorrectionProposalStatus = AllfitV1Schemas['CorrectionProposalStatus']
export type CorrectionDecision = AllfitV1Schemas['CorrectionDecisionCreate']['decision']

/** The full precision PostgreSQL gave: a coarser key would skip proposals between pages. */
export interface CorrectionCursor {
  expiresAt: string
  id: string
}

export interface CorrectionPage<T> {
  items: T[]
  hasMore: boolean
  nextCursor?: CorrectionCursor
}

export interface CorrectionQuery {
  personId: string
  status: CorrectionProposalStatus | null
  limit: number
  cursor?: CorrectionCursor
}

export interface CorrectionCommandResult<T> {
  resource: T
  replayed: boolean
}

export interface ExecutionReviewDatabase {
  listAuthorized(
    input: AuthorizedExecutionQuery & { limit: number; cursor?: AuthorizedExecutionCursor },
  ): Promise<AuthorizedExecutionPage>
  readAuthorized(
    input: AuthorizedExecutionQuery & { executionId: string },
  ): Promise<AuthorizedExecutionRead>
  /** An unknown zone is refused by PostgreSQL with SQLSTATE 22023. */
  readProgress(
    input: AuthorizedExecutionQuery & {
      timezone: string
      period: ClientProgress['period']
      count: number
    },
  ): Promise<ClientProgressRead>
  /** A missing grant is AF430 naming it; a paused service is AF424. */
  recordObservation(
    input: ExecutionCommand & {
      personId: string
      organizationId: string
      subjectPersonId: string
      executionId: string
      category: ProfessionalObservationCategory
      provenance: ProfessionalObservationProvenance
      content: string
    },
  ): Promise<ObservationCommandResult>
  /** Over an older revision it is refused with SQLSTATE 40001 and the current observation. */
  reviseObservation(
    input: ExecutionCommand & {
      personId: string
      organizationId: string
      observationId: string
      expectedRevision: number
      content: string
      reason: string
    },
  ): Promise<ObservationCommandResult>
  /** A field already waiting on her is 23505; she has no address to be told, P0004. */
  proposeCorrection(
    input: ExecutionCommand & {
      personId: string
      organizationId: string
      subjectPersonId: string
      executionId: string
      setOrder: number
      field: CorrectionField
      value: number
      unit: string | null
      reason: string
    },
  ): Promise<CorrectionCommandResult<ProposedCorrection>>
  /** No live membership in the organization is 42501. */
  listProposedCorrections(
    input: CorrectionQuery & { organizationId: string },
  ): Promise<CorrectionPage<ProposedCorrection>>
}
