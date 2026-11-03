/**
 * Bringing a history from another app (ADR-044): the words and the review, apart from
 * the wire so they can be tested.
 *
 * **The review is about exercises, not sessions.** A file of 340 sessions has about a
 * hundred names in it, and each name answered once answers every set it covers. So the
 * screen lists names, the ones that need a look first and the most trained first, and
 * says for each what will happen to its sets.
 *
 * **A suggestion is confirmed by committing.** The server never uses a suggestion on its
 * own (the person's word is required); the review shows it as chosen, and committing
 * without changing it is that word. A name left without a movement is not lost: its
 * sets keep the name they had in the other app.
 */

import type { AllfitV1Schemas } from '@allfitone/contracts'

import type { ApiIssue } from './api-error'

export type HistoryImport = AllfitV1Schemas['HistoryImport']
export type HistoryImportPreview = AllfitV1Schemas['HistoryImportPreview']
export type HistoryImportExercise = AllfitV1Schemas['HistoryImportExercise']
export type HistoryImportChoice = AllfitV1Schemas['HistoryImportChoice']
export type HistoryImportIssue = AllfitV1Schemas['HistoryImportIssue']

export interface PickedMovement {
  readonly id: string
  readonly name: string
}

const SOURCES: Record<HistoryImport['source'], string> = { hevy_csv: 'Hevy' }

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sept', 'oct', 'nov', 'dic']

/** «Hevy», or null for a session trained here. */
export function sourceName(source: string | null | undefined): string | null {
  if (source === null || source === undefined) return null
  return source in SOURCES ? SOURCES[source as HistoryImport['source']] : null
}

const thousands = (value: number): string => String(value).replace(/\B(?=(\d{3})+(?!\d))/g, '.')

const count = (value: number, one: string, many: string): string =>
  `${thousands(value)} ${value === 1 ? one : many}`

/** The row a refusal's path points at: `/content/37` is row 37. */
function rowOf(issue: ApiIssue): number | null {
  const match = /^\/content\/(\d+)$/.exec(issue.path)
  return match ? Number(match[1]) : null
}

/** What the person is told when the file cannot be read, and what to do about it. */
export function refusalMessage(issue: ApiIssue | undefined): string {
  if (!issue) return 'No pudimos leer este archivo.'
  const row = rowOf(issue)
  const at = row === null ? '' : ` en la fila ${String(row)}`
  switch (issue.code) {
    case 'empty':
      return 'El archivo está vacío. Exporta tus entrenamientos de nuevo desde Hevy.'
    case 'too_large':
      return 'El archivo es demasiado grande para importarlo de una vez.'
    case 'unknown_format':
      return 'Este archivo no es una exportación de entrenamientos de Hevy. Elige el CSV que exporta Hevy.'
    case 'malformed_csv':
      return `El archivo está dañado${at}. Expórtalo otra vez desde Hevy.`
    case 'unreadable_date':
      return `No pudimos leer la fecha${at}. Expórtalo otra vez desde Hevy.`
    default:
      return 'No pudimos leer este archivo.'
  }
}

/** «340 sesiones · 7.322 series». */
export function countsLine(document: Pick<HistoryImport, 'session_count' | 'set_count'>): string {
  return `${count(document.session_count, 'sesión', 'sesiones')} · ${count(document.set_count, 'serie', 'series')}`
}

/** «4 ago 2026», from the file's own local date. */
function localDay(local: string): string {
  const [year, month, day] = local.slice(0, 10).split('-').map(Number)
  return `${String(day)} ${MONTHS[(month ?? 1) - 1] ?? ''} ${String(year)}`
}

/** «Del 2 ene 2023 al 4 ago 2026», or null when nothing was read. */
export function rangeLine(preview: HistoryImportPreview | null): string | null {
  if (!preview?.first_started_local || !preview.last_started_local) return null
  const first = localDay(preview.first_started_local)
  const last = localDay(preview.last_started_local)
  return first === last ? `El ${first}` : `Del ${first} al ${last}`
}

export function duplicatesLine(preview: HistoryImportPreview): string | null {
  if (preview.duplicate_sessions === 0) return null
  if (preview.new_sessions === 0) return 'Todo esto ya está en tu historial'
  return `${thousands(preview.duplicate_sessions)} ya están en tu historial y no se duplican`
}

/** The confirm, or null when there is nothing new to bring. */
export function importButton(preview: HistoryImportPreview): string | null {
  if (preview.new_sessions === 0) return null
  return `Importar ${count(preview.new_sessions, 'sesión', 'sesiones')}`
}

const ISSUES: Record<HistoryImportIssue['code'], readonly [string, string]> = {
  unsupported_set: [
    'serie de distancia o tiempo no se importa',
    'series de distancia o tiempo no se importan',
  ],
  invalid_number: [
    'fila tenía un número que no pudimos leer',
    'filas tenían números que no pudimos leer',
  ],
  ended_before_start: [
    'sesión terminaba antes de empezar; se toma su inicio',
    'sesiones terminaban antes de empezar; se toma su inicio',
  ],
  empty_session: ['sesión sin ejercicios no se importa', 'sesiones sin ejercicios no se importan'],
}

/** What the reader left out, one line per kind, in the order they first appear. */
export function issueLines(issues: readonly HistoryImportIssue[]): readonly string[] {
  const tally = new Map<HistoryImportIssue['code'], number>()
  for (const issue of issues) tally.set(issue.code, (tally.get(issue.code) ?? 0) + 1)
  return [...tally].map(([code, times]) => {
    const [one, many] = ISSUES[code]
    return `${thousands(times)} ${times === 1 ? one : many}`
  })
}

export interface ReviewEntry {
  readonly external_name: string
  readonly source_name: string
  readonly session_count: number
  readonly set_count: number
  readonly resolution: HistoryImportExercise['resolution']
  readonly movement: PickedMovement | null
  /** A suggestion, or nothing at all: what the person should look at. */
  readonly toReview: boolean
  /** Touched by the person in this review. */
  readonly changed: boolean
}

/** Names to review first, then the rest; inside each, the most trained first. */
export function reviewEntries(exercises: readonly HistoryImportExercise[]): readonly ReviewEntry[] {
  return exercises
    .map((exercise) => ({
      external_name: exercise.external_name,
      source_name: exercise.source_name,
      session_count: exercise.session_count,
      set_count: exercise.set_count,
      resolution: exercise.resolution,
      movement: exercise.movement,
      toReview: exercise.resolution === 'suggested' || exercise.resolution === 'unmatched',
      changed: false,
    }))
    .sort(
      (left, right) =>
        Number(right.toReview) - Number(left.toReview) ||
        right.set_count - left.set_count ||
        left.source_name.localeCompare(right.source_name, 'es'),
    )
}

export function choose(
  entries: readonly ReviewEntry[],
  externalName: string,
  movement: PickedMovement | null,
): readonly ReviewEntry[] {
  return entries.map((entry) =>
    entry.external_name === externalName ? { ...entry, movement, changed: true } : entry,
  )
}

/** What will happen to this name's sets. */
export function entryState(entry: ReviewEntry | undefined): string {
  if (!entry?.movement) return 'Se guarda con su nombre de Hevy'
  if (entry.resolution === 'suggested' && !entry.changed) return `Sugerido: ${entry.movement.name}`
  return entry.movement.name
}

/** «En 12 sesiones · 48 series». */
export function entryCaption(entry: ReviewEntry): string {
  return `En ${count(entry.session_count, 'sesión', 'sesiones')} · ${count(entry.set_count, 'serie', 'series')}`
}

/** The person's word: every change, and every suggestion left standing. */
export function choicesToSend(entries: readonly ReviewEntry[]): HistoryImportChoice[] {
  return entries
    .filter((entry) => entry.changed || entry.resolution === 'suggested')
    .map((entry) => ({
      external_name: entry.external_name,
      movement_id: entry.movement?.id ?? null,
    }))
}

export function importStatusLine(document: HistoryImport): string {
  switch (document.status) {
    case 'staged':
      return 'Pendiente de revisar'
    case 'committed':
      return `${count(document.imported_count, 'sesión importada', 'sesiones importadas')}`
    case 'undone':
      return 'Deshecha: sus sesiones ya no están en tu historial'
    case 'expired':
      return 'Caducó sin importarse'
  }
}

/** «Hevy · 3 nov 2026»: what the list calls an import. */
export function importTitle(document: HistoryImport): string {
  return `${sourceName(document.source) ?? 'Importación'} · ${localDay(document.created_at)}`
}
