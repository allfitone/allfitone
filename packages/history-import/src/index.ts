/**
 * Reads a history exported by another app into `imported_history.v1` (ADR-044).
 *
 * The caller hands over the file's text and gets back the model or a refusal. Which
 * reader applies is decided by the file itself, through its header, so the person never
 * has to say which app it came from and a file from an unknown app is refused whole.
 */

import { readCsv } from './csv.js'
import { HistoryFormatError, type ImportedHistory } from './model.js'
import { isHevyHeader, readHevyCsv } from './sources/hevy-csv.js'

export * from './model.js'
export { readLocalDateTime } from './dates.js'

/** Characters, not bytes: the text travels as a JSON string below the platform's body limit. */
export const MAX_HISTORY_CHARACTERS = 4_000_000

export function readHistory(content: string): ImportedHistory {
  if (content.length > MAX_HISTORY_CHARACTERS) throw new HistoryFormatError('too_large')
  if (content.trim() === '') throw new HistoryFormatError('empty')
  const records = readCsv(content)
  const [header] = records
  if (header && isHevyHeader(header)) return readHevyCsv(records)
  throw new HistoryFormatError('unknown_format', 1)
}
