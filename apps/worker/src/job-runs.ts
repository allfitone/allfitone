/**
 * `HU-BO-031` criterion 2: each scheduled job leaves its run behind.
 *
 * The jobs reported to telemetry only, so a job that failed every minute, or a worker
 * that stopped running at all, was visible nowhere in the Backoffice. A run is written
 * through `system.record_job_run`, as the worker, after the job ends: whether it
 * succeeded, and the error code when it did not. The database prunes old runs as new
 * ones arrive, so nothing here has to.
 */

import type postgres from 'postgres'

export interface JobRun {
  job: string
  startedAt: Date
  outcome: 'succeeded' | 'failed'
  errorCode: string | null
}

export function createJobRunRecorder(sql: postgres.Sql): (run: JobRun) => Promise<void> {
  return async (run) => {
    await sql.begin(async (transaction) => {
      await transaction`select set_config('app.actor_kind', 'worker', true)`
      await transaction`
        select system.record_job_run(
          ${run.job}, ${run.startedAt.toISOString()}::timestamptz, ${run.outcome}, ${run.errorCode}
        )
      `
    })
  }
}
