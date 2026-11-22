/**
 * An identifier as an operator reads it.
 *
 * The identifier is what an operator quotes in a case, and a full UUID is
 * unreadable in a row and broke a phone's width. The short form is for
 * reading, never for matching: the whole value stays in the title and is what
 * the copy button hands over.
 *
 * It keeps the end as well as the start. A UUIDv7 begins with its timestamp,
 * so the first eight characters of two people created in the same minute are
 * the same; Diagnóstico cut there, and Equipo already kept the end.
 */
export function shortIdentifier(id: string): string {
  return id.length <= 13 ? id : `${id.slice(0, 8)}…${id.slice(-4)}`
}
