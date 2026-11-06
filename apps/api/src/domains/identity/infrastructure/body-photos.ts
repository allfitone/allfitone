/** PostgreSQL access for body photos: closed functions, the person set in the transaction. */

import type postgres from 'postgres'

import { database } from '../../../platform/db/index.js'
import type {
  BodyPhotoDatabase,
  BodyPhotoRow,
  BodyPhotoShare,
  BodyPhotoShareResult,
} from '../domain/body-photos.js'

export function createBodyPhotoDatabase(): BodyPhotoDatabase {
  const sql = database()

  return {
    record: (input) =>
      asPerson(sql, input.personId, '', async (transaction) => {
        const [row] = await transaction<{ id: string }[]>`
          select identity.record_body_photo(
            ${input.personId}::uuid, ${input.takenOn}::date, ${input.mediaRef},
            ${input.idempotencyKey}::uuid, ${input.commandId}::uuid, ${input.requestHash}
          ) as id
        `
        const [photos] = await transaction<{ photos: BodyPhotoRow[] }[]>`
          select identity.list_my_body_photos(${input.personId}::uuid) as photos
        `
        const kept = photos?.photos.find((photo) => photo.id === row?.id)
        if (!kept) throw new Error('PostgreSQL did not keep the body photo')
        return kept
      }),

    list: (input) =>
      asPerson(sql, input.personId, input.requestId, async (transaction) => {
        const [row] = await transaction<{ photos: BodyPhotoRow[] }[]>`
          select identity.list_my_body_photos(${input.personId}::uuid) as photos
        `
        return row?.photos ?? []
      }),

    delete: (input) =>
      asPerson(sql, input.personId, '', async (transaction) => {
        const [row] = await transaction<{ media_ref: string | null }[]>`
          select identity.delete_my_body_photo(
            ${input.personId}::uuid, ${input.photoId}::uuid,
            ${input.idempotencyKey}::uuid, ${input.commandId}::uuid, ${input.requestHash}
          ) as media_ref
        `
        if (!row?.media_ref) throw new Error('PostgreSQL did not delete the body photo')
        return row.media_ref
      }),

    seal: (input) =>
      asPerson(sql, input.personId, '', async (transaction) => {
        await transaction`
          select identity.seal_body_photo_disposal(${input.personId}::uuid, ${input.mediaRef})
        `
      }),

    share: (input) =>
      asPerson(sql, input.personId, '', async (transaction) =>
        answered(
          await transaction<ShareRow[]>`
            select result, replayed from identity.share_body_photo(
              ${input.personId}::uuid, ${input.photoId}::uuid, ${input.relationshipId}::uuid,
              ${input.idempotencyKey}::uuid, ${input.commandId}::uuid, ${input.requestHash}
            )
          `,
        ),
      ),

    withdraw: (input) =>
      asPerson(sql, input.personId, '', async (transaction) =>
        answered(
          await transaction<ShareRow[]>`
            select result, replayed from identity.withdraw_body_photo_share(
              ${input.personId}::uuid, ${input.photoId}::uuid, ${input.relationshipId}::uuid,
              ${input.idempotencyKey}::uuid, ${input.commandId}::uuid, ${input.requestHash}
            )
          `,
        ),
      ),
  }
}

type ShareRow = { result: BodyPhotoShare | null; replayed: boolean }

function answered(rows: readonly ShareRow[]): BodyPhotoShareResult {
  const [row] = rows
  if (!row?.result) throw new Error('PostgreSQL did not answer the body photo share')
  return { share: row.result, replayed: row.replayed }
}

function asPerson<T>(
  sql: ReturnType<typeof database>,
  personId: string,
  requestId: string,
  operation: (transaction: postgres.TransactionSql) => Promise<T>,
): Promise<T> {
  return sql
    .begin(async (transaction) => {
      await transaction`
        select set_config('app.actor_kind', 'person', true),
               set_config('app.actor_person_id', ${personId}, true),
               set_config('app.request_id', ${requestId}, true)
      `
      return { value: await operation(transaction) }
    })
    .then((result) => result.value)
}
