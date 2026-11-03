/**
 * The history another app exported, in Allfit's words (ADR-044, `imported_history.v1`).
 *
 * Every source reader produces exactly this and nothing else, so staging, review and
 * commit never learn which app a file came from. A new source is a new reader; this
 * file changes only when Allfit decides to keep something it did not keep before, and
 * then the version moves.
 *
 * Times are **local and zoneless** (`YYYY-MM-DDTHH:MM`): no export carries a zone, and
 * the person confirms one at import. A missing value is `null`, never zero (ADR-013).
 */

export const MODEL_VERSION = 1

/** The sources a reader exists for. */
export type HistorySource = 'hevy_csv'

/** The four kinds of `planning.set_kind` (ADR-033). */
export type ImportedSetKind = 'normal' | 'warmup' | 'drop' | 'to_failure'

export interface ImportedSet {
  /** 1-based order inside its exercise. */
  readonly order: number
  readonly kind: ImportedSetKind
  /** Kilograms; `null` is bodyweight, not zero. */
  readonly loadKg: number | null
  readonly reps: number | null
  readonly rpe: number | null
}

export interface ImportedExercise {
  /** 1-based position inside the session. */
  readonly position: number
  /** The name as the source wrote it; the catalogue match is resolved later. */
  readonly sourceName: string
  readonly note: string | null
  /** 1-based, numbered in order of appearance; contiguous exercises share it. */
  readonly supersetGroup: number | null
  readonly sets: readonly ImportedSet[]
}

export interface ImportedSession {
  /** Stable across exports of the same history: source, local start and title. */
  readonly fingerprint: string
  readonly title: string
  readonly startedLocal: string
  readonly endedLocal: string
  readonly description: string | null
  readonly exercises: readonly ImportedExercise[]
}

/** Something the reader kept out, reported instead of dropped in silence. */
export type ImportIssueCode =
  'unsupported_set' | 'invalid_number' | 'ended_before_start' | 'empty_session'

export interface ImportIssue {
  /** The record's number in the file, the header being 1. */
  readonly row: number
  readonly code: ImportIssueCode
}

export interface ImportedHistory {
  readonly source: HistorySource
  readonly modelVersion: typeof MODEL_VERSION
  readonly sessions: readonly ImportedSession[]
  readonly issues: readonly ImportIssue[]
}

/** Why a whole file was refused. Nothing from it is kept. */
export type HistoryRefusal =
  'empty' | 'too_large' | 'unknown_format' | 'malformed_csv' | 'unreadable_date'

export class HistoryFormatError extends Error {
  constructor(
    readonly refusal: HistoryRefusal,
    readonly row: number | null = null,
  ) {
    super(
      row === null ? `history refused: ${refusal}` : `history refused: ${refusal} at row ${row}`,
    )
    this.name = 'HistoryFormatError'
  }
}
