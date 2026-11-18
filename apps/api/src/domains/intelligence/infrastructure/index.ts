/**
 * PostgreSQL access for the assistant: the AI consent and the weekly summary.
 *
 * Every call is a closed function: the runtime role has no privilege on the tables of
 * `intelligence`. Each runs in a transaction that names the person as the actor, and the
 * functions answer only to her.
 *
 * The functions answer jsonb, so numbers arrive as numbers and dates as ISO strings; what
 * goes in travels as `::text::jsonb`. The summary's two halves are two calls here, and so
 * two transactions: none is open while a model is asked.
 */

import type { GoalNutrient, WeeksLogged } from '@allfitone/weekly-summary'
import type postgres from 'postgres'

import { database } from '../../../platform/db/index.js'
import { measureStudioRequestPhase } from '../../../platform/observability/index.js'
import {
  ConsentRequired,
  type ConsentRow,
  type IntelligenceDatabase,
  type RunOutcome,
  type SummaryOpening,
  type WeeklySummary,
} from '../domain/index.js'

interface LoggedRow {
  week_starts_on: string
  in_progress: boolean
  sessions: {
    trained_on: string
    duration_seconds: number
    exercises: {
      movement_id: string | null
      name: string
      work_sets: number
      best_set: { load_kg: number; reps: number } | null
      volume_kg: number | null
      record: boolean
    }[]
  }[]
  nutrition_days: {
    date: string
    meals: number
    energy_kcal: number | null
    protein_g: number | null
    carbohydrates_g: number | null
    fat_g: number | null
  }[]
  goal: {
    nutrient: GoalNutrient
    minimum: number | null
    maximum: number | null
    exact: number | null
  }[]
}

type OpeningRow =
  | { state: 'opened'; run_id: string; logged: LoggedRow }
  | { state: 'over-ceiling'; renews_at: string }
  | { state: 'replayed'; outcome: RunOutcome; week_starts_on: string; renews_at: string }

interface PageRow {
  data: WeeklySummary[]
  page: { next_cursor: string | null; has_more: boolean }
}

export function createIntelligenceDatabase(): IntelligenceDatabase {
  const sql = database()

  return {
    readConsent: (input) =>
      transact(sql, input.personId, input.requestId, async (transaction) => {
        const [row] = await transaction<{ consent: ConsentRow | null }[]>`
          select intelligence.read_consent(${input.personId}::uuid) as consent
        `
        return row?.consent ?? null
      }),

    giveConsent: (input) =>
      transact(sql, input.personId, '', async (transaction) => {
        const [row] = await transaction<{ consent: ConsentRow | null }[]>`
          select intelligence.give_consent(
            ${input.personId}::uuid, ${input.version},
            ${input.idempotencyKey}::uuid, ${input.commandId}::uuid, ${input.requestHash}
          ) as consent
        `
        if (!row?.consent) throw new Error('PostgreSQL did not record the consent')
        return row.consent
      }),

    withdrawConsent: (input) =>
      transact(sql, input.personId, '', async (transaction) => {
        const [row] = await transaction<{ consent: ConsentRow | null }[]>`
          select intelligence.withdraw_consent(
            ${input.personId}::uuid,
            ${input.idempotencyKey}::uuid, ${input.commandId}::uuid, ${input.requestHash}
          ) as consent
        `
        if (!row?.consent) throw new Error('PostgreSQL did not record the withdrawal')
        return row.consent
      }),

    beginWeeklySummary: (input) =>
      transact(sql, input.personId, '', async (transaction) => {
        const [row] = await transaction<{ opening: OpeningRow | null }[]>`
          select intelligence.begin_weekly_summary(
            ${input.personId}::uuid, ${input.weekStartsOn}::date, ${input.timezone},
            ${input.consentVersion}::text, ${input.contract},
            ${input.idempotencyKey}::uuid, ${input.commandId}::uuid, ${input.requestHash}
          ) as opening
        `
        if (!row?.opening) throw new Error('PostgreSQL did not answer the summary request')
        return openingOf(row.opening)
      }).catch(nameConsentRefusal),

    finishWeeklySummary: (input) =>
      transact(sql, input.personId, '', async (transaction) => {
        const [row] = await transaction<{ summary: WeeklySummary | null }[]>`
          select intelligence.finish_weekly_summary(
            ${input.personId}::uuid, ${input.runId}::uuid, ${input.outcome},
            ${input.model}::text,
            ${input.tokens?.input ?? null}::integer, ${input.tokens?.output ?? null}::integer,
            ${input.summary ? JSON.stringify(input.summary) : null}::text::jsonb
          ) as summary
        `
        return row?.summary ?? null
      }),

    readWeeklySummary: (input) =>
      transact(sql, input.personId, '', async (transaction) => {
        const [row] = await transaction<{ summary: WeeklySummary | null }[]>`
          select intelligence.read_weekly_summary(
            ${input.personId}::uuid, ${input.weekStartsOn}::date
          ) as summary
        `
        return row?.summary ?? null
      }),

    listWeeklySummaries: (input) =>
      transact(sql, input.personId, input.requestId, async (transaction) => {
        const [row] = await transaction<{ page: PageRow | null }[]>`
          select intelligence.list_weekly_summaries(
            ${input.personId}::uuid, ${input.before}::date, ${input.limit}::integer
          ) as page
        `
        return { data: row?.page?.data ?? [], nextBefore: row?.page?.page.next_cursor ?? null }
      }),

    deleteWeeklySummary: (input) =>
      transact(sql, input.personId, '', async (transaction) => {
        await transaction`
          select intelligence.delete_weekly_summary(
            ${input.personId}::uuid, ${input.weekStartsOn}::date,
            ${input.idempotencyKey}::uuid, ${input.commandId}::uuid, ${input.requestHash}
          )
        `
      }),
  }
}

/** AF432 is «she does not hold the consent in force»; every other failure keeps its own. */
function nameConsentRefusal(cause: unknown): never {
  if (typeof cause === 'object' && cause !== null && 'code' in cause && cause.code === 'AF432') {
    throw new ConsentRequired()
  }
  throw cause
}

function openingOf(row: OpeningRow): SummaryOpening {
  if (row.state === 'over-ceiling') return { state: 'over-ceiling', renewsAt: row.renews_at }
  if (row.state === 'replayed') {
    return {
      state: 'replayed',
      outcome: row.outcome,
      weekStartsOn: row.week_starts_on,
      renewsAt: row.renews_at,
    }
  }
  return { state: 'opened', runId: row.run_id, logged: loggedOf(row.logged) }
}

function loggedOf(row: LoggedRow): WeeksLogged {
  return {
    weekStartsOn: row.week_starts_on,
    inProgress: row.in_progress,
    sessions: row.sessions.map((session) => ({
      trainedOn: session.trained_on,
      durationSeconds: session.duration_seconds,
      exercises: session.exercises.map((exercise) => ({
        movementId: exercise.movement_id,
        name: exercise.name,
        workSets: exercise.work_sets,
        bestSet: exercise.best_set && {
          loadKg: exercise.best_set.load_kg,
          reps: exercise.best_set.reps,
        },
        volumeKg: exercise.volume_kg,
        record: exercise.record,
      })),
    })),
    nutritionDays: row.nutrition_days.map((day) => ({
      date: day.date,
      meals: day.meals,
      energyKcal: day.energy_kcal,
      proteinG: day.protein_g,
      carbohydratesG: day.carbohydrates_g,
      fatG: day.fat_g,
    })),
    goal: row.goal,
  }
}

function transact<T>(
  sql: ReturnType<typeof database>,
  personId: string,
  requestId: string,
  operation: (transaction: postgres.TransactionSql) => Promise<T>,
): Promise<T> {
  return measureStudioRequestPhase('business-db', async () => {
    const result = await sql.begin(async (transaction) => {
      // Transaction-local: session-scoped config does not survive the pooler.
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
