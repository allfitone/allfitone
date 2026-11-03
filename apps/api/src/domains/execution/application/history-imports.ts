/**
 * Bringing a history from another app (ADR-044, `OP-EXE-027..030`).
 *
 * The file is read here, in the request, and never kept: what reaches the database is
 * the reader's model and the file's SHA-256, which is how the same file a second time
 * lands on the import already alive. A file the reader refuses never reaches the
 * database at all; the refusal comes back as a value, because it is the person's file
 * that is wrong, not the system.
 *
 * Imports are strength training: the only reader today is Hevy's, and Hevy's sets are
 * load and repetitions. A reader for another discipline will bring its own code.
 */

import { createHash } from 'node:crypto'
import {
  HistoryFormatError,
  readHistory,
  type HistoryRefusal,
  type ImportedHistory,
} from '@allfitone/history-import'

import type {
  HistoryImport,
  HistoryImportDatabase,
  ImportCommand,
  StagedSession,
} from '../domain/history-imports.js'

const DISCIPLINE = 'strength'

export type StageOutcome =
  | { kind: 'refused'; refusal: HistoryRefusal; row: number | null }
  | { kind: 'staged'; document: HistoryImport; created: boolean }

export interface SpaceHistoryImportService {
  stage(
    input: ImportCommand & { personId: string; timezone: string; content: string },
  ): Promise<StageOutcome>
  commit: HistoryImportDatabase['commit']
  undo: HistoryImportDatabase['undo']
  list: HistoryImportDatabase['list']
  read: HistoryImportDatabase['read']
}

export function createSpaceHistoryImportService(
  database: HistoryImportDatabase,
  read: (content: string) => ImportedHistory = readHistory,
): SpaceHistoryImportService {
  return {
    async stage({ content, ...input }) {
      let history: ImportedHistory
      try {
        history = read(content)
      } catch (cause) {
        if (cause instanceof HistoryFormatError) {
          return { kind: 'refused', refusal: cause.refusal, row: cause.row }
        }
        throw cause
      }
      const document = await database.stage({
        ...input,
        source: history.source,
        modelVersion: history.modelVersion,
        disciplineCode: DISCIPLINE,
        contentSha256: createHash('sha256').update(content, 'utf8').digest(),
        sessions: history.sessions.map(stagedSession),
        issues: history.issues.map(({ row, code }) => ({ row, code })),
      })
      // The command's id names a new import; any other id is the one already alive.
      return { kind: 'staged', document, created: document.id === input.commandId }
    },
    commit: (input) => database.commit(input),
    undo: (input) => database.undo(input),
    list: (input) => database.list(input),
    read: (input) => database.read(input),
  }
}

function stagedSession(session: ImportedHistory['sessions'][number]): StagedSession {
  return {
    fingerprint: session.fingerprint,
    title: session.title,
    started_local: session.startedLocal,
    ended_local: session.endedLocal,
    description: session.description,
    exercises: session.exercises.map((exercise) => ({
      position: exercise.position,
      source_name: exercise.sourceName,
      note: exercise.note,
      superset_group: exercise.supersetGroup,
      sets: exercise.sets.map((set) => ({
        order: set.order,
        kind: set.kind,
        load_kg: set.loadKg,
        reps: set.reps,
        rpe: set.rpe,
      })),
    })),
  }
}
