/**
 * PostgreSQL access for imported histories (ADR-044).
 *
 * Every call is a closed function of the execution schema; the runtime role holds no
 * privilege on its tables. Lists travel as `::text::jsonb` for the reason the module's
 * other file explains: a bare `::jsonb` makes `postgres.js` serialise them twice.
 */

import { database } from '../../../platform/db/index.js'
import type { HistoryImport, HistoryImportDatabase } from '../domain/history-imports.js'
import { transact } from './index.js'

export function createHistoryImportDatabase(): HistoryImportDatabase {
  const sql = database()

  return {
    stage: (input) =>
      transact(sql, input.personId, '', async (transaction) => {
        const [row] = await transaction<{ document: HistoryImport }[]>`
          select execution.stage_history_import(
            ${input.personId}::uuid, ${input.source}, ${input.modelVersion}::integer,
            ${input.disciplineCode}, ${input.timezone}, ${input.contentSha256},
            ${JSON.stringify(input.sessions)}::text::jsonb, ${JSON.stringify(input.issues)}::text::jsonb,
            ${input.idempotencyKey}::uuid, ${input.commandId}::uuid, ${input.requestHash}
          ) as document
        `
        if (!row) throw new Error('PostgreSQL did not stage the history')
        return row.document
      }),

    commit: (input) =>
      transact(sql, input.personId, '', async (transaction) => {
        const [row] = await transaction<{ document: HistoryImport }[]>`
          select execution.commit_history_import(
            ${input.personId}::uuid, ${input.importId}::uuid, ${input.timezone},
            ${JSON.stringify(input.choices)}::text::jsonb,
            ${input.idempotencyKey}::uuid, ${input.commandId}::uuid, ${input.requestHash}
          ) as document
        `
        if (!row) throw new Error('PostgreSQL did not commit the history')
        return row.document
      }),

    undo: (input) =>
      transact(sql, input.personId, '', async (transaction) => {
        const [row] = await transaction<{ document: HistoryImport }[]>`
          select execution.undo_history_import(
            ${input.personId}::uuid, ${input.importId}::uuid,
            ${input.idempotencyKey}::uuid, ${input.commandId}::uuid, ${input.requestHash}
          ) as document
        `
        if (!row) throw new Error('PostgreSQL did not undo the history')
        return row.document
      }),

    list: (input) =>
      transact(sql, input.personId, input.requestId, async (transaction) => {
        const [row] = await transaction<{ documents: HistoryImport[] }[]>`
          select execution.list_history_imports(${input.personId}::uuid) as documents
        `
        return row?.documents ?? []
      }),

    read: (input) =>
      transact(sql, input.personId, input.requestId, async (transaction) => {
        const [row] = await transaction<{ document: HistoryImport }[]>`
          select execution.read_history_import(${input.personId}::uuid, ${input.importId}::uuid) as document
        `
        if (!row) throw new Error('PostgreSQL did not read the history import')
        return row.document
      }),
  }
}
