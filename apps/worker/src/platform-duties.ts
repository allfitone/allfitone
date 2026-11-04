/**
 * `HU-BO-028` criterion 5: a platform duty past its window lapses, and a requester left
 * without `request_break_glass` loses the break-glass windows they had open.
 *
 * Nothing else notices a duty running out of time: no command happens at `valid_to`. The
 * rule is the database's (`support.lapse_platform_duties`); this only runs it on the
 * minute job, as the worker, so the closure is a fact of the clock attributed to nobody.
 */

import type postgres from 'postgres'

export interface PlatformDutyLapseResult {
  claimed: number
  deadOrDelayed: number
  lapsed: number
}

export function createPlatformDutyLapseProcessor(
  sql: postgres.Sql,
): () => Promise<PlatformDutyLapseResult> {
  return async () => {
    const lapsed = await sql.begin(async (transaction) => {
      await transaction`select set_config('app.actor_kind', 'worker', true)`
      const [row] = await transaction<
        { lapsed: number }[]
      >`select support.lapse_platform_duties() as lapsed`
      if (!row) throw new Error('PostgreSQL did not answer the platform duty sweep')
      return row.lapsed
    })
    return { claimed: lapsed, deadOrDelayed: 0, lapsed }
  }
}
