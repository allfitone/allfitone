/**
 * PostgreSQL access for a person's units, language, channels and phones in Space.
 *
 * Every call is a closed function: the runtime role has no privilege on the tables. The
 * transaction starts without a person; each function resolves the token's subject and
 * names her as the actor itself, because the API cannot know who the subject is before
 * the database says so.
 */

import type postgres from 'postgres'

import { database } from '../../../platform/db/index.js'
import { measureRequestPhase } from '../../../platform/observability/index.js'
import type {
  SpaceNotificationPreferences,
  SpacePreferences,
  SpacePreferencesDatabase,
  SpacePreferencesResult,
  SpacePushDevice,
} from '../domain/space-preferences.js'

const PROVIDER = 'workos'

type CommandRow<T> = { result: T | null; replayed: boolean }

export function createSpacePreferencesDatabase(
  sql: ReturnType<typeof database> = database(),
): SpacePreferencesDatabase {
  return {
    readPreferences: (input) =>
      withinRequest(sql, input.requestId, async (transaction) => {
        const [row] = await transaction<{ result: SpacePreferences | null }[]>`
          select identity.read_my_preferences(${PROVIDER}, ${input.issuer}, ${input.subject}) as result
        `
        if (!row?.result) throw new Error('PostgreSQL did not read the preferences')
        return row.result
      }),

    putPreferences: (input) =>
      withinRequest(sql, input.requestId, async (transaction) => {
        const rows = await transaction<CommandRow<SpacePreferences>[]>`
          select preferences as result, replayed from identity.put_my_preferences(
            ${PROVIDER}, ${input.issuer}, ${input.subject},
            ${input.preferences.mass_unit}::text, ${input.preferences.distance_unit}::text,
            ${input.preferences.locale}::text,
            ${input.idempotencyKey}::uuid, ${input.commandId}::uuid, ${input.requestHash}
          )
        `
        return result(rows, 'keep the preferences')
      }),

    readNotificationPreferences: (input) =>
      withinRequest(sql, input.requestId, async (transaction) => {
        const [row] = await transaction<{ result: SpaceNotificationPreferences | null }[]>`
          select identity.read_my_notification_preferences(
            ${PROVIDER}, ${input.issuer}, ${input.subject}
          ) as result
        `
        if (!row?.result) throw new Error('PostgreSQL did not read the notification preferences')
        return row.result
      }),

    putNotificationPreferences: (input) =>
      withinRequest(sql, input.requestId, async (transaction) => {
        const rows = await transaction<CommandRow<SpaceNotificationPreferences>[]>`
          select preferences as result, replayed from identity.put_my_notification_preferences(
            ${PROVIDER}, ${input.issuer}, ${input.subject},
            ${transaction.json(input.preferences.map((choice) => ({ ...choice })))}::jsonb,
            ${input.idempotencyKey}::uuid, ${input.commandId}::uuid, ${input.requestHash}
          )
        `
        return result(rows, 'keep the notification preferences')
      }),

    registerPushDevice: (input) =>
      withinRequest(sql, input.requestId, async (transaction) => {
        const rows = await transaction<CommandRow<SpacePushDevice>[]>`
          select device as result, replayed from identity.register_my_push_device(
            ${PROVIDER}, ${input.issuer}, ${input.subject}, ${input.deviceId}::uuid,
            ${input.device.token}, ${input.device.platform},
            ${input.idempotencyKey}::uuid, ${input.commandId}::uuid, ${input.requestHash}
          )
        `
        return result(rows, 'register the phone')
      }),

    retirePushDevice: (input) =>
      withinRequest(sql, input.requestId, async (transaction) => {
        const [row] = await transaction<{ replayed: boolean }[]>`
          select replayed from identity.retire_my_push_device(
            ${PROVIDER}, ${input.issuer}, ${input.subject}, ${input.deviceId}::uuid,
            ${input.idempotencyKey}::uuid, ${input.commandId}::uuid, ${input.requestHash}
          )
        `
        if (!row) throw new Error('PostgreSQL did not retire the phone')
        return { replayed: row.replayed }
      }),
  }
}

function result<T>(rows: CommandRow<T>[], operation: string): SpacePreferencesResult<T> {
  const [row] = rows
  if (!row?.result) throw new Error(`PostgreSQL did not ${operation}`)
  return { resource: row.result, replayed: row.replayed }
}

function withinRequest<T>(
  sql: ReturnType<typeof database>,
  requestId: string,
  operation: (transaction: postgres.TransactionSql) => Promise<T>,
): Promise<T> {
  return measureRequestPhase('business-db', async () => {
    const outcome = await sql.begin(async (transaction) => {
      await transaction`select set_config('app.request_id', ${requestId}, true)`
      return { value: await operation(transaction) }
    })
    return outcome.value
  })
}
