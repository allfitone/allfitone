/**
 * PostgreSQL access for the execution domain.
 *
 * The runtime role has no privilege on these tables; every call is a closed function,
 * so there is no query here that could widen what a person reads or writes.
 *
 * The four result families arrive as separate arrays, which is the contract's shape,
 * and are flattened into one discriminated list for the command. Keeping them apart in
 * the contract is what lets each carry its own required fields; flattening them here is
 * what lets the command replace a session in one pass.
 *
 * The list travels as `::text::jsonb`, and the `::text` is load-bearing. `postgres.js`
 * infers a parameter's type from the cast that follows it, so a bare `::jsonb` made it
 * serialize the already-serialized string a second time; the command then received the
 * JSON scalar `"[…]"` instead of an array and answered `22023 — cannot extract elements
 * from a scalar`. Casting through text says plainly what is being sent.
 */

import type postgres from 'postgres'

import { database } from '../../../platform/db/index.js'
import { measureStudioRequestPhase } from '../../../platform/observability/index.js'
import type {
  AuthorizedExecution,
  AuthorizedExecutionRead,
  AuthorizedExecutionSummary,
  ClientProgress,
  ClientProgressRead,
  CorrectionCommandResult,
  CorrectionPage,
  CorrectionProposal,
  ExecutionReviewDatabase,
  ObservationCommandResult,
  ProfessionalObservation,
  ProposedCorrection,
  Abandoned,
  Attempt,
  FreeSession,
  Execution,
  ExecutionDatabase,
  ExecutionResultsReplace,
  Finalized,
  FinishedExecution,
  HistoryMonth,
  PeriodComparison,
  InvalidationPreview,
  HistoryRowPage,
  SummaryRow,
  WeekSummary,
} from '../domain/index.js'

interface ExecutionRow {
  executed_session_id: string
  execution_status: Execution['execution_status']
  started_at: Date | string
  revision_number: string | number
  title: string | null
  discipline_code: string | null
  program_title: string | null
  week: number | null
  planned: Execution['planned']
  results: Execution['results']
  exercises: Execution['exercises'] | null
}

interface AttemptRow {
  id: string
  attempt_number: number
  revision_number: string | number
  result_contract_id: string
  contract_version: number
  requested_level: Attempt['result_contract']['requested_level']
}

type FreeSessionRow = Omit<AttemptRow, 'attempt_number'>

interface ResultsRow {
  id: string
  revision_number: string | number
  result_count: string | number
}

interface FinalizedRow {
  id: string
  revision_number: string | number
  achieved_level: Finalized['achieved_level']
  is_primary: boolean
  result_contract_id: string
  contract_version: number
}

/** `numeric` arrives as a string and timestamps as dates; the contract wants neither. */
type RawSummaryRow = Omit<
  SummaryRow,
  'duration_seconds' | 'total_volume_kg' | 'started_at' | 'ended_at'
> & {
  duration_seconds: string | number
  total_volume_kg: string | number | null
  started_at: Date | string
  ended_at: Date | string
}

function summaryOf(row: RawSummaryRow): SummaryRow {
  return {
    ...row,
    started_at: new Date(row.started_at).toISOString(),
    ended_at: new Date(row.ended_at).toISOString(),
    duration_seconds: Number(row.duration_seconds),
    // Null stays null: nothing weighed is not zero lifted.
    total_volume_kg: row.total_volume_kg === null ? null : Number(row.total_volume_kg),
  }
}

interface WeekRow {
  trained_seconds: string | number | null
  sessions_completed: number | null
  sessions_planned: number | null
  tonnage_kg: string | number | null
  history: WeekSummary['history']
  work_sets: number | null
}

export function createExecutionDatabase(): ExecutionDatabase {
  const sql = database()

  return {
    startAttempt: (input) =>
      transact(sql, input.personId, '', async (transaction) => {
        const [row] = await transaction<AttemptRow[]>`
          select * from execution.start_planned_session_attempt(
            ${input.personId}::uuid, ${input.plannedSessionId}::uuid,
            ${input.startedAt}::timestamptz, ${input.timezone},
            ${input.requestedLevel}::catalog.completeness_level, ${input.captureSource},
            ${input.idempotencyKey}::uuid, ${input.commandId}::uuid, ${input.requestHash}
          )
        `
        if (!row) throw new Error('PostgreSQL did not start the attempt')
        return attempt(row)
      }),

    startFreeSession: (input) =>
      transact(sql, input.personId, '', async (transaction) => {
        const [row] = await transaction<FreeSessionRow[]>`
          select * from execution.start_free_session(
            ${input.personId}::uuid, ${input.disciplineCode},
            ${input.startedAt}::timestamptz, ${input.timezone},
            ${input.requestedLevel}::catalog.completeness_level, ${input.captureSource},
            ${input.idempotencyKey}::uuid, ${input.commandId}::uuid, ${input.requestHash}
          )
        `
        if (!row) throw new Error('PostgreSQL did not start the free session')
        return freeSession(row)
      }),

    readOpenFreeSession: (input) =>
      transact(sql, input.personId, input.requestId, async (transaction) => {
        const [row] = await transaction<{ id: string | null }[]>`
          select execution.read_open_free_session(${input.personId}::uuid) as id
        `
        return row?.id ?? null
      }),

    replaceResults: (input) =>
      transact(sql, input.personId, '', async (transaction) => {
        const [row] = await transaction<ResultsRow[]>`
          select * from execution.replace_execution_results(
            ${input.personId}::uuid, ${input.executedSessionId}::uuid,
            ${input.revisionNumber}::bigint, ${JSON.stringify(flatten(input.results))}::text::jsonb,
            ${input.idempotencyKey}::uuid, ${input.commandId}::uuid, ${input.requestHash},
            ${exercisesOf(input.results)}::text::jsonb
          )
        `
        if (!row) throw new Error('PostgreSQL did not replace the results')
        return {
          id: row.id,
          status: 'in_progress',
          revision_number: Number(row.revision_number),
          // Space declares no segmentation, so this counts what is stored and is zero.
          segment_count: 0,
          result_count: Number(row.result_count),
        }
      }),

    finalize: (input) =>
      transact(sql, input.personId, '', async (transaction) => {
        const [row] = await transaction<FinalizedRow[]>`
          select * from execution.finalize_execution(
            ${input.personId}::uuid, ${input.executedSessionId}::uuid,
            ${input.endedAt}::timestamptz, ${input.idempotencyKey}::uuid,
            ${input.commandId}::uuid, ${input.requestHash}
          )
        `
        if (!row) throw new Error('PostgreSQL did not finalize the execution')
        return finalized(row)
      }),

    abandon: (input) =>
      transact(sql, input.personId, '', async (transaction) => {
        const [row] = await transaction<ResultsRow[]>`
          select * from execution.abandon_execution(
            ${input.personId}::uuid, ${input.executedSessionId}::uuid,
            ${input.endedAt}::timestamptz, ${input.idempotencyKey}::uuid,
            ${input.commandId}::uuid, ${input.requestHash}
          )
        `
        if (!row) throw new Error('PostgreSQL did not abandon the execution')
        return abandoned(row)
      }),

    readExecution: (input) =>
      transact(sql, input.personId, input.requestId, async (transaction) => {
        const [row] = await transaction<ExecutionRow[]>`
          select * from execution.read_execution(
            ${input.personId}::uuid, ${input.executedSessionId}::uuid
          )
        `
        return row ? execution(row) : null
      }),

    readWeekSummary: (input) =>
      transact(sql, input.personId, input.requestId, async (transaction) => {
        const [row] = await transaction<WeekRow[]>`
          select * from execution.read_week_summary(${input.personId}::uuid, ${input.timezone})
        `
        return week(row)
      }),

    readSummary: (input) =>
      transact(sql, input.personId, input.requestId, async (transaction) => {
        const [row] = await transaction<RawSummaryRow[]>`
          select * from execution.read_execution_summary(
            ${input.personId}::uuid, ${input.executedSessionId}::uuid, ${input.timezone}
          )
        `
        return row ? summaryOf(row) : null
      }),

    // Both answer jsonb, so numbers arrive as numbers and dates as ISO strings.
    listHistory: (input) =>
      transact(sql, input.personId, input.requestId, async (transaction) => {
        const [row] = await transaction<{ page: HistoryRowPage }[]>`
          select execution.list_my_executions(
            ${input.personId}::uuid, ${input.timezone}, ${input.month}::date,
            ${input.discipline}, ${input.withRecord}::boolean, ${input.free}::boolean,
            ${input.query}, ${input.cursor}, ${input.limit}::integer, ${input.day}::date
          ) as page
        `
        if (!row) throw new Error('PostgreSQL did not list the history')
        return row.page
      }),

    readFinished: (input) =>
      transact(sql, input.personId, input.requestId, async (transaction) => {
        const [row] = await transaction<{ detail: FinishedExecution | null }[]>`
          select execution.read_finished_execution(
            ${input.personId}::uuid, ${input.executedSessionId}::uuid, ${input.timezone}
          ) as detail
        `
        return row?.detail ?? null
      }),

    revise: (input) =>
      transact(sql, input.personId, '', async (transaction) => {
        const { strength_sets, exercises } = input.revision
        const results = { strength_sets, ...(exercises ? { exercises } : {}) }
        const [row] = await transaction<ResultsRow[]>`
          select * from execution.revise_execution(
            ${input.personId}::uuid, ${input.executedSessionId}::uuid,
            ${input.revisionNumber}::bigint, ${JSON.stringify(flatten(results))}::text::jsonb,
            ${exercisesOf(results)}::text::jsonb,
            ${input.revision.started_at}::timestamptz, ${input.revision.ended_at}::timestamptz,
            ${input.idempotencyKey}::uuid, ${input.commandId}::uuid, ${input.requestHash}
          )
        `
        if (!row) throw new Error('PostgreSQL did not revise the execution')
        return {
          id: row.id,
          revision_number: Number(row.revision_number),
          result_count: Number(row.result_count),
        }
      }),

    annul: (input) =>
      transact(sql, input.personId, '', async (transaction) => {
        const [row] = await transaction<{ id: string; annulled_at: Date | string }[]>`
          select * from execution.annul_execution(
            ${input.personId}::uuid, ${input.executedSessionId}::uuid, ${input.reason},
            ${input.idempotencyKey}::uuid, ${input.commandId}::uuid, ${input.requestHash}
          )
        `
        if (!row) throw new Error('PostgreSQL did not annul the execution')
        return { id: row.id, annulled_at: new Date(row.annulled_at).toISOString() }
      }),

    readAnnulmentPreview: (input) =>
      transact(sql, input.personId, input.requestId, async (transaction) => {
        const [row] = await transaction<{ preview: InvalidationPreview | null }[]>`
          select execution.read_annulment_preview(
            ${input.personId}::uuid, ${input.executedSessionId}::uuid, ${input.timezone}
          ) as preview
        `
        return row?.preview ?? null
      }),

    repeat: (input) =>
      transact(sql, input.personId, '', async (transaction) => {
        const [row] = await transaction<
          { id: string; attempt_number: number; revision_number: string | number }[]
        >`
          select * from execution.repeat_execution(
            ${input.personId}::uuid, ${input.executedSessionId}::uuid,
            ${input.startedAt}::timestamptz, ${input.timezone},
            ${input.idempotencyKey}::uuid, ${input.commandId}::uuid, ${input.requestHash}
          )
        `
        if (!row) throw new Error('PostgreSQL did not repeat the execution')
        return {
          id: row.id,
          attempt_number: row.attempt_number,
          status: 'in_progress',
          revision_number: Number(row.revision_number),
        }
      }),

    readHistoryMonth: (input) =>
      transact(sql, input.personId, input.requestId, async (transaction) => {
        const [row] = await transaction<{ month: HistoryMonth }[]>`
          select execution.read_history_month(
            ${input.personId}::uuid, ${input.timezone}, ${input.month}::date
          ) as month
        `
        if (!row) throw new Error('PostgreSQL did not read the month')
        return row.month
      }),

    comparePeriods: (input) =>
      transact(sql, input.personId, input.requestId, async (transaction) => {
        const [row] = await transaction<{ comparison: PeriodComparison }[]>`
          select execution.compare_my_periods(
            ${input.personId}::uuid, ${input.timezone}, ${input.period}, ${input.count}::integer,
            ${input.program}
          ) as comparison
        `
        if (!row) throw new Error('PostgreSQL did not compare the periods')
        return row.comparison
      }),

    // Her own proposals: nobody else's data, so no access is recorded.
    listCorrectionProposals: (input) =>
      transact(sql, input.personId, '', async (transaction) =>
        correctionPage(
          await transaction<{ proposal: CorrectionProposal }[]>`
            select proposal from execution.list_my_correction_proposals(
              ${input.personId}::uuid, ${input.status}::text, ${input.limit + 1}::integer,
              ${input.cursor?.expiresAt ?? null}::timestamptz, ${input.cursor?.id ?? null}::uuid
            )
          `,
          input.limit,
        ),
      ),

    decideCorrectionProposal: (input) =>
      transact(sql, input.personId, '', async (transaction) => {
        const [row] = await transaction<CorrectionRow<CorrectionProposal>[]>`
          select * from execution.decide_correction_proposal(
            ${input.personId}::uuid, ${input.proposalId}::uuid, ${input.decision}::text,
            ${input.idempotencyKey}::uuid, ${input.commandId}::uuid, ${input.requestHash}
          )
        `
        return commandResult(row, 'decide the correction proposal')
      }),
  }
}

/** The session's exercise list, or null so the command keeps the one it has (ADR-034). */
function exercisesOf(results: Pick<ExecutionResultsReplace, 'exercises'>): string | null {
  if (!results.exercises) return null
  return JSON.stringify(
    results.exercises.map((exercise) => ({
      position: exercise.position,
      movement_id: exercise.movement_id ?? null,
      planned_step_id: exercise.planned_step_id ?? null,
      superset_group: exercise.superset_group ?? null,
      rest_seconds: exercise.rest_seconds ?? null,
    })),
  )
}

/** The contract keeps the families apart; the command takes them as one list. */
function flatten(
  results: Pick<
    ExecutionResultsReplace,
    'strength_sets' | 'endurance_laps' | 'interval_results' | 'mobility_results'
  >,
): Record<string, unknown>[] {
  const strength = (results.strength_sets ?? []).map((entry) => ({
    family: 'strength',
    set_order: entry.order,
    movement_id: entry.movement_id ?? null,
    achieved_reps: entry.achieved_reps ?? null,
    load_value: entry.load?.value ?? null,
    load_unit_code: entry.load?.unit ?? null,
    rpe: entry.rpe ?? null,
    kind: entry.kind ?? null,
    exercise_position: entry.exercise_position ?? null,
  }))
  const endurance = (results.endurance_laps ?? []).map((entry) => ({
    family: 'endurance',
    ...entry,
  }))
  const intervals = (results.interval_results ?? []).map((entry) => ({
    family: 'interval',
    ...entry,
  }))
  const mobility = (results.mobility_results ?? []).map((entry) => ({
    family: 'mobility',
    ...entry,
  }))
  return [...strength, ...endurance, ...intervals, ...mobility]
}

function freeSession(row: FreeSessionRow): FreeSession {
  return {
    id: row.id,
    status: 'in_progress',
    revision_number: Number(row.revision_number),
    result_contract: {
      id: row.result_contract_id,
      version: row.contract_version,
      requested_level: row.requested_level,
    },
  }
}

function attempt(row: AttemptRow): Attempt {
  return {
    id: row.id,
    attempt_number: row.attempt_number,
    status: 'in_progress',
    revision_number: Number(row.revision_number),
    result_contract: {
      id: row.result_contract_id,
      version: row.contract_version,
      requested_level: row.requested_level,
    },
  }
}

function finalized(row: FinalizedRow): Finalized {
  return {
    id: row.id,
    status: 'completed',
    validation_status: 'valid',
    revision_number: Number(row.revision_number),
    achieved_level: row.achieved_level,
    is_primary: row.is_primary,
    contract: { id: row.result_contract_id, version: row.contract_version },
  }
}

function abandoned(row: ResultsRow): Abandoned {
  return {
    id: row.id,
    status: 'abandoned',
    revision_number: Number(row.revision_number),
    result_count: Number(row.result_count),
  }
}

function execution(row: ExecutionRow): Execution {
  return {
    executed_session_id: row.executed_session_id,
    execution_status: row.execution_status,
    started_at:
      row.started_at instanceof Date ? row.started_at.toISOString() : String(row.started_at),
    revision_number: Number(row.revision_number),
    title: row.title,
    discipline_code: row.discipline_code,
    program_title: row.program_title,
    week: row.week === null ? null : Number(row.week),
    planned: row.planned ?? [],
    results: row.results ?? [],
    exercises: row.exercises ?? [],
  }
}

function week(row: WeekRow | undefined): WeekSummary {
  if (!row) {
    return {
      trained_seconds: 0,
      sessions_completed: 0,
      sessions_planned: 0,
      tonnage_kg: null,
      history: [],
      work_sets: 0,
    }
  }
  return {
    trained_seconds: Number(row.trained_seconds ?? 0),
    sessions_completed: row.sessions_completed ?? 0,
    sessions_planned: row.sessions_planned ?? 0,
    // Nulo se conserva: no es lo mismo no haber registrado carga que haber movido cero,
    // y `Number(null)` sería cero.
    tonnage_kg: row.tonnage_kg === null ? null : Number(row.tonnage_kg),
    history: row.history ?? [],
    work_sets: row.work_sets ?? 0,
  }
}

interface AuthorizedRow {
  id: string
  started_at: Date
  ended_at: Date | null
  timezone: string
  activity_type_code: string
  activity_type_name: string
  discipline_code: string
  achieved_level: AuthorizedExecutionSummary['achieved_level']
  origin: AuthorizedExecutionSummary['origin']
  planned_session_id: string | null
  scope_code: AuthorizedExecutionSummary['applied_scope']['code']
  scope_version: number
}

type AuthorizedDocument =
  | { outcome: 'found'; execution: AuthorizedExecution }
  | { outcome: 'not_found' }
  | { outcome: 'scope_required'; required_scope: { code: string; level: 'read' | 'contribute' } }

type ProgressDocument =
  | ({ outcome: 'found' } & ClientProgress)
  | { outcome: 'scope_required'; required_scope: { code: string; level: 'read' | 'contribute' } }

interface ObservationRow {
  result: ProfessionalObservation
  replayed: boolean
}

interface CorrectionRow<T> {
  result: T
  replayed: boolean
}

/**
 * PostgreSQL access for the coach's review of a client (`OP-EXE-017`, `OP-EXE-018`).
 *
 * Both reads record the access themselves, inside this transaction and before they
 * answer, so the request id travels with the actor. A page is keyed on the millisecond
 * the cursor can carry; a finer key would skip sessions between pages.
 */
export function createExecutionReviewDatabase(
  sql: ReturnType<typeof database> = database(),
): ExecutionReviewDatabase {
  return {
    listAuthorized: (input) =>
      transact(sql, input.personId, input.requestId, async (transaction) => {
        const rows = await transaction<AuthorizedRow[]>`
          select * from execution.list_authorized_executions(
            ${input.personId}::uuid, ${input.organizationId}::uuid,
            ${input.subjectPersonId}::uuid, ${input.limit + 1}::integer,
            ${input.cursor?.startedAt ?? null}::timestamptz, ${input.cursor?.id ?? null}::uuid
          )
        `
        const hasMore = rows.length > input.limit
        const visible = rows.slice(0, input.limit)
        const last = visible.at(-1)
        return {
          items: visible.map((row) => ({
            id: row.id,
            started_at: row.started_at.toISOString(),
            ended_at: row.ended_at ? row.ended_at.toISOString() : null,
            timezone: row.timezone,
            activity_type_code: row.activity_type_code,
            activity_type_name: row.activity_type_name,
            discipline_code: row.discipline_code,
            achieved_level: row.achieved_level,
            origin: row.origin,
            planned_session_id: row.planned_session_id,
            applied_scope: { code: row.scope_code, version: row.scope_version },
          })),
          hasMore,
          ...(hasMore && last
            ? { nextCursor: { startedAt: last.started_at.toISOString(), id: last.id } }
            : {}),
        }
      }),

    readAuthorized: (input) =>
      transact(
        sql,
        input.personId,
        input.requestId,
        async (transaction): Promise<AuthorizedExecutionRead> => {
          const [row] = await transaction<{ document: AuthorizedDocument | null }[]>`
          select execution.read_authorized_execution(
            ${input.personId}::uuid, ${input.organizationId}::uuid,
            ${input.subjectPersonId}::uuid, ${input.executionId}::uuid
          ) as document
        `
          const document = row?.document
          if (!document) throw new Error('PostgreSQL did not answer the authorized execution')
          if (document.outcome === 'scope_required') {
            return { outcome: 'scope_required', requiredScope: document.required_scope }
          }
          return document
        },
      ),

    readProgress: (input) =>
      transact(
        sql,
        input.personId,
        input.requestId,
        async (transaction): Promise<ClientProgressRead> => {
          const [row] = await transaction<{ document: ProgressDocument | null }[]>`
            select execution.read_client_progress(
              ${input.personId}::uuid, ${input.organizationId}::uuid,
              ${input.subjectPersonId}::uuid, ${input.timezone}::text, ${input.period}::text,
              ${input.count}::integer
            ) as document
          `
          const document = row?.document
          if (!document) throw new Error('PostgreSQL did not answer the client progress')
          if (document.outcome === 'scope_required') {
            return { outcome: 'scope_required', requiredScope: document.required_scope }
          }
          return {
            outcome: 'found',
            progress: {
              period: document.period,
              sources: document.sources,
              algorithm: document.algorithm,
              periods: document.periods,
              movements: document.movements,
            },
          }
        },
      ),

    // A write records no read: no request id travels with it.
    recordObservation: (input) =>
      transact(sql, input.personId, '', async (transaction) => {
        const [row] = await transaction<ObservationRow[]>`
          select * from execution.record_observation(
            ${input.personId}::uuid, ${input.organizationId}::uuid,
            ${input.subjectPersonId}::uuid, ${input.executionId}::uuid, ${input.category}::text,
            ${input.provenance}::text, ${input.content}::text, ${input.idempotencyKey}::uuid,
            ${input.commandId}::uuid, ${input.requestHash}
          )
        `
        return observationResult(row, 'record the observation')
      }),

    reviseObservation: (input) =>
      transact(sql, input.personId, '', async (transaction) => {
        const [row] = await transaction<ObservationRow[]>`
          select * from execution.revise_observation(
            ${input.personId}::uuid, ${input.organizationId}::uuid,
            ${input.observationId}::uuid, ${input.expectedRevision}::integer,
            ${input.content}::text, ${input.reason}::text, ${input.idempotencyKey}::uuid,
            ${input.commandId}::uuid, ${input.requestHash}
          )
        `
        return observationResult(row, 'revise the observation')
      }),

    proposeCorrection: (input) =>
      transact(sql, input.personId, '', async (transaction) => {
        const [row] = await transaction<CorrectionRow<ProposedCorrection>[]>`
          select * from execution.propose_correction(
            ${input.personId}::uuid, ${input.organizationId}::uuid,
            ${input.subjectPersonId}::uuid, ${input.executionId}::uuid, ${input.setOrder}::integer,
            ${input.field}::text, ${input.value}::numeric, ${input.unit}::text,
            ${input.reason}::text, ${input.idempotencyKey}::uuid, ${input.commandId}::uuid,
            ${input.requestHash}
          )
        `
        return commandResult(row, 'propose the correction')
      }),

    listProposedCorrections: (input) =>
      transact(sql, input.personId, '', async (transaction) =>
        correctionPage(
          await transaction<{ proposal: ProposedCorrection }[]>`
            select proposal from execution.list_proposed_corrections(
              ${input.personId}::uuid, ${input.organizationId}::uuid, ${input.status}::text,
              ${input.limit + 1}::integer, ${input.cursor?.expiresAt ?? null}::timestamptz,
              ${input.cursor?.id ?? null}::uuid
            )
          `,
          input.limit,
        ),
      ),
  }
}

function commandResult<T>(
  row: CorrectionRow<T> | undefined,
  operation: string,
): CorrectionCommandResult<T> {
  if (!row) throw new Error(`PostgreSQL did not ${operation}`)
  return { resource: row.result, replayed: row.replayed }
}

/** One row past the page says there is another; its key is the last one shown. */
function correctionPage<T extends { id: string; expires_at: string }>(
  rows: ReadonlyArray<{ proposal: T }>,
  limit: number,
): CorrectionPage<T> {
  const items = rows.slice(0, limit).map((row) => row.proposal)
  const last = items.at(-1)
  const hasMore = rows.length > limit
  return {
    items,
    hasMore,
    ...(hasMore && last ? { nextCursor: { expiresAt: last.expires_at, id: last.id } } : {}),
  }
}

function observationResult(
  row: ObservationRow | undefined,
  operation: string,
): ObservationCommandResult {
  if (!row) throw new Error(`PostgreSQL did not ${operation}`)
  return { resource: row.result, replayed: row.replayed }
}

function transact<T>(
  sql: ReturnType<typeof database>,
  personId: string,
  requestId: string,
  operation: (transaction: postgres.TransactionSql) => Promise<T>,
): Promise<T> {
  return measureStudioRequestPhase('business-db', async () => {
    const result = await sql.begin(async (transaction) => {
      await transaction`
        select set_config('app.actor_kind', 'person', true),
               set_config('app.actor_person_id', ${personId}, true),
               set_config('app.request_id', ${requestId}, true)
      `
      return { value: await operation(transaction) }
    })
    return result.value
  })
}
