/**
 * A history brought from another app (ADR-044), as the execution domain holds it.
 *
 * The document is the contract's; what the database receives is the reader's model in
 * the database's own spelling, so the two sides of `readHistory` never share field names
 * by accident.
 */

import type { AllfitV1Schemas } from '@allfitone/contracts'

/** A command's identity; the hash is any byte array, as the shared Space helpers give it. */
export interface ImportCommand {
  idempotencyKey: string
  commandId: string
  requestHash: Uint8Array
}

export type HistoryImport = AllfitV1Schemas['HistoryImport']
export type HistoryImportChoice = AllfitV1Schemas['HistoryImportChoice']

export interface StagedSet {
  order: number
  kind: string
  load_kg: number | null
  reps: number | null
  rpe: number | null
}

export interface StagedExercise {
  position: number
  source_name: string
  note: string | null
  superset_group: number | null
  sets: StagedSet[]
}

export interface StagedSession {
  fingerprint: string
  title: string
  started_local: string
  ended_local: string
  description: string | null
  exercises: StagedExercise[]
}

export interface HistoryImportDatabase {
  stage(
    input: ImportCommand & {
      personId: string
      source: string
      modelVersion: number
      disciplineCode: string
      timezone: string
      contentSha256: Uint8Array
      sessions: StagedSession[]
      issues: { row: number; code: string }[]
    },
  ): Promise<HistoryImport>
  commit(
    input: ImportCommand & {
      personId: string
      importId: string
      timezone: string
      choices: HistoryImportChoice[]
    },
  ): Promise<HistoryImport>
  undo(input: ImportCommand & { personId: string; importId: string }): Promise<HistoryImport>
  list(input: { personId: string; requestId: string }): Promise<HistoryImport[]>
  read(input: { personId: string; importId: string; requestId: string }): Promise<HistoryImport>
}
