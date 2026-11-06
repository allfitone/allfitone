/**
 * A gym's own movements in PostgreSQL (`OP-CAT-001/002/003/009/010`).
 *
 * Every call runs as the member, and the functions decide the rest: membership,
 * capability, the freeze on what a published version uses, and the organization each
 * movement belongs to. The variant and the changes travel through `transaction.json`,
 * because a pre-stringified value would bind as a JSON string and fail the shape checks.
 */

import type postgres from 'postgres'

import { database } from '../../../platform/db/index.js'
import { measureStudioRequestPhase } from '../../../platform/observability/index.js'
import {
  MovementCursorError,
  type CatalogCommandResult,
  type OrganizationMovementDatabase,
  type Page,
  type StoredOrganizationMovement,
  type StoredStudioMovement,
} from '../domain/index.js'

type CommandRow = { result: StoredOrganizationMovement; replayed: boolean }

export function createOrganizationMovementDatabase(): OrganizationMovementDatabase {
  const sql = database()
  const asMember = <T>(
    personId: string,
    operation: (transaction: postgres.TransactionSql) => Promise<T>,
  ): Promise<T> =>
    measureStudioRequestPhase('business-db', async () => {
      const result = await sql.begin(async (transaction) => {
        await transaction`
          select set_config('app.actor_kind', 'person', true),
                 set_config('app.actor_person_id', ${personId}, true)
        `
        return { value: await operation(transaction) }
      })
      return result.value
    })

  return {
    search: (request) =>
      asMember(request.personId, async (transaction) => {
        const [row] = await transaction<{ page: Page<StoredStudioMovement> }[]>`
          select catalog.search_organization_movements(
            ${request.personId}::uuid, ${request.organizationId}::uuid, ${request.query}::text,
            ${request.discipline}::text, ${request.includeArchived}::boolean,
            ${request.limit}::integer, ${request.cursor}::text
          ) as page
        `
        return row?.page ?? { data: [], page: { next_cursor: null, has_more: false } }
      }).catch((cause: unknown) => {
        // The only 22023 this search raises is a cursor it cannot read.
        if (sqlState(cause) === '22023') throw new MovementCursorError()
        throw cause
      }),

    read: (input) =>
      asMember(input.personId, async (transaction) => {
        const [row] = await transaction<{ movement: StoredOrganizationMovement | null }[]>`
          select catalog.read_organization_movement(
            ${input.personId}::uuid, ${input.organizationId}::uuid, ${input.movementId}::uuid
          ) as movement
        `
        return row?.movement ?? null
      }),

    create: (input) =>
      asMember(input.personId, async (transaction) => {
        const { movement } = input
        const [row] = await transaction<CommandRow[]>`
          select * from catalog.create_organization_movement(
            ${input.personId}::uuid, ${input.organizationId}::uuid, ${movement.discipline_code},
            ${movement.name}, ${movement.aliases ?? null}::text[],
            ${movement.equipment ?? null}::text[],
            ${movement.variant ? transaction.json(movement.variant) : null}::jsonb,
            ${input.idempotencyKey}::uuid, ${input.commandId}::uuid, ${input.requestHash}
          )
        `
        return required(row, 'create the movement')
      }),

    update: (input) =>
      asMember(input.personId, async (transaction) => {
        const [row] = await transaction<CommandRow[]>`
          select * from catalog.update_organization_movement(
            ${input.personId}::uuid, ${input.organizationId}::uuid, ${input.movementId}::uuid,
            ${input.expectedRevision}::integer, ${transaction.json(input.changes)}::jsonb,
            ${input.idempotencyKey}::uuid, ${input.commandId}::uuid, ${input.requestHash}
          )
        `
        return required(row, 'update the movement')
      }),

    archive: (input) =>
      asMember(input.personId, async (transaction) => {
        const [row] = await transaction<CommandRow[]>`
          select * from catalog.archive_organization_movement(
            ${input.personId}::uuid, ${input.organizationId}::uuid, ${input.movementId}::uuid,
            ${input.idempotencyKey}::uuid, ${input.commandId}::uuid, ${input.requestHash}
          )
        `
        return required(row, 'archive the movement')
      }),
  }
}

function required(
  row: CommandRow | undefined,
  operation: string,
): CatalogCommandResult<StoredOrganizationMovement> {
  if (!row) throw new Error(`PostgreSQL did not ${operation}`)
  return { resource: row.result, replayed: row.replayed }
}

function sqlState(cause: unknown): string | undefined {
  return typeof cause === 'object' && cause !== null && 'code' in cause
    ? String(cause.code)
    : undefined
}
