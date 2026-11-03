/**
 * A strict RFC 4180 reader, written here rather than taken from a dependency.
 *
 * Exports are small (a heavy 3.5-year history is under a megabyte) and only need the
 * standard: quoted fields with doubled quotes, commas and line breaks inside quotes,
 * CRLF or LF, an optional byte-order mark. Anything outside it — a quote opening in the
 * middle of a field, text after a closing quote, a quote left open — refuses the file,
 * because a CSV read loosely is read wrong without saying so.
 */

import { HistoryFormatError } from './model.js'

/** Every record as its fields; a final empty line is not a record. */
export function readCsv(text: string): string[][] {
  const source = text.startsWith('﻿') ? text.slice(1) : text
  const records: string[][] = []
  let record: string[] = []
  let field = ''
  let quoted = false
  let closed = false
  let index = 0

  const endField = (): void => {
    record.push(field)
    field = ''
    closed = false
  }
  const endRecord = (): void => {
    endField()
    records.push(record)
    record = []
  }

  while (index < source.length) {
    const char = source[index]
    if (quoted) {
      if (char === '"') {
        if (source[index + 1] === '"') {
          field += '"'
          index += 2
          continue
        }
        quoted = false
        closed = true
      } else {
        field += char
      }
      index += 1
      continue
    }
    if (char === ',') endField()
    else if (char === '\n') endRecord()
    else if (char === '\r' && source[index + 1] === '\n') {
      endRecord()
      index += 1
    } else if (closed) {
      throw new HistoryFormatError('malformed_csv', records.length + 1)
    } else if (char === '"') {
      if (field !== '') throw new HistoryFormatError('malformed_csv', records.length + 1)
      quoted = true
    } else {
      field += char
    }
    index += 1
  }

  if (quoted) throw new HistoryFormatError('malformed_csv', records.length + 1)
  if (field !== '' || closed || record.length > 0) endRecord()
  return records
}
