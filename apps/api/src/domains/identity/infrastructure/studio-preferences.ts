/**
 * PostgreSQL access for a person's Studio preferences.
 *
 * Both calls are closed functions: the runtime role has no privilege on
 * `identity.surface_preferences`. Each runs in a transaction that names the person as
 * the actor, and the functions answer only to her. Neither takes a product — they are
 * Studio's — so nothing a client sends can choose whose preferences, or which
 * product's, a request moves.
 */

import type postgres from 'postgres'

import { database } from '../../../platform/db/index.js'
import { measureStudioRequestPhase } from '../../../platform/observability/index.js'
import type {
  InterfaceTheme,
  StudioPreferences,
  StudioPreferencesDatabase,
} from '../domain/studio-preferences.js'

/** The document as PostgreSQL builds it; `theme` is null until she chooses. */
type RawStudioPreferences = { theme: InterfaceTheme | null }

export function createStudioPreferencesDatabase(
  sql: ReturnType<typeof database> = database(),
): StudioPreferencesDatabase {
  return {
    read: (input) =>
      transact(sql, input.personId, input.requestId, async (transaction) => {
        const [row] = await transaction<{ preferences: RawStudioPreferences | null }[]>`
          select identity.read_studio_preferences(${input.personId}::uuid) as preferences
        `
        if (!row?.preferences) throw new Error('PostgreSQL did not return the Studio preferences')
        return preferences(row.preferences)
      }),

    put: (input) =>
      transact(sql, input.personId, input.commandId, async (transaction) => {
        const [row] = await transaction<
          { preferences: RawStudioPreferences | null; replayed: boolean }[]
        >`
          select * from identity.put_studio_preferences(
            ${input.personId}::uuid, ${input.theme},
            ${input.idempotencyKey}::uuid, ${input.commandId}::uuid, ${input.requestHash}
          )
        `
        if (!row?.preferences) throw new Error('PostgreSQL did not keep the Studio preferences')
        return { resource: preferences(row.preferences), replayed: row.replayed }
      }),
  }
}

function preferences(raw: RawStudioPreferences): StudioPreferences {
  return { theme: raw.theme }
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
