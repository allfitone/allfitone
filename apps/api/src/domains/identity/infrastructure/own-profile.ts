/**
 * PostgreSQL access for a person's own profile and identity.
 *
 * The transaction starts without a person: the functions resolve the token's subject and
 * establish the actor themselves, because the API cannot know who the subject is before
 * the database says so.
 */

import type postgres from 'postgres'

import { database } from '../../../platform/db/index.js'
import { measureRequestPhase } from '../../../platform/observability/index.js'
import type {
  OwnProfileDatabase,
  OwnProfileResult,
  SpaceAvailableEquipment,
  SpaceFitnessProfile,
  SpaceIdentity,
  SpaceContactPhone,
  SpaceOwnBiologicalSex,
  SpaceOwnName,
} from '../domain/own-profile.js'

const PROVIDER = 'workos'

type CommandRow<T> = { result: T; replayed: boolean }

export function createOwnProfileDatabase(): OwnProfileDatabase {
  const sql = database()

  return {
    readIdentity: (input) =>
      withinRequest(sql, input.requestId, async (transaction) => {
        const [row] = await transaction<{ read_own_identity: SpaceIdentity }[]>`
          select identity.read_own_identity(${PROVIDER}, ${input.issuer}, ${input.subject})
        `
        if (!row) throw new Error('PostgreSQL did not read the identity')
        return row.read_own_identity
      }),

    readProfile: (input) =>
      withinRequest(sql, input.requestId, async (transaction) => {
        const [row] = await transaction<{ read_own_profile: SpaceFitnessProfile }[]>`
          select identity.read_own_profile(${PROVIDER}, ${input.issuer}, ${input.subject})
        `
        if (!row) throw new Error('PostgreSQL did not read the profile')
        return row.read_own_profile
      }),

    correctName: (input) =>
      withinRequest(sql, input.requestId, async (transaction) => {
        const rows = await transaction<CommandRow<SpaceOwnName>[]>`
          select * from identity.correct_own_name(
            ${PROVIDER}, ${input.issuer}, ${input.subject}, ${input.name.given_name},
            ${input.name.family_name}, ${input.name.username}, ${input.idempotencyKey}::uuid,
            ${input.commandId}::uuid, ${input.requestHash}
          )
        `
        return result(rows, 'correct the name')
      }),

    correctPhone: (input) =>
      withinRequest(sql, input.requestId, async (transaction) => {
        const rows = await transaction<CommandRow<SpaceContactPhone>[]>`
          select * from identity.correct_own_phone(
            ${PROVIDER}, ${input.issuer}, ${input.subject}, ${input.phone}::text,
            ${input.idempotencyKey}::uuid, ${input.commandId}::uuid, ${input.requestHash}
          )
        `
        return result(rows, 'correct the phone')
      }),

    correctBiologicalSex: (input) =>
      withinRequest(sql, input.requestId, async (transaction) => {
        const rows = await transaction<CommandRow<SpaceOwnBiologicalSex>[]>`
          select * from identity.correct_own_biological_sex(
            ${PROVIDER}, ${input.issuer}, ${input.subject}, ${input.sex.biological_sex}::text,
            ${input.idempotencyKey}::uuid, ${input.commandId}::uuid, ${input.requestHash}
          )
        `
        return result(rows, 'correct the biological sex')
      }),

    declareEquipment: (input) =>
      withinRequest(sql, input.requestId, async (transaction) => {
        const rows = await transaction<CommandRow<SpaceAvailableEquipment>[]>`
          select * from identity.declare_available_equipment(
            ${PROVIDER}, ${input.issuer}, ${input.subject}, ${input.equipment}::text[],
            ${input.idempotencyKey}::uuid, ${input.commandId}::uuid, ${input.requestHash}
          )
        `
        return result(rows, 'declare the equipment')
      }),
  }
}

function result<T>(rows: CommandRow<T>[], operation: string): OwnProfileResult<T> {
  const [row] = rows
  if (!row) throw new Error(`PostgreSQL did not ${operation}`)
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
