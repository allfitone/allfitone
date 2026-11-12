/**
 * The time zone of whoever is looking.
 *
 * Its own module because two screens need it and neither owns it: the sessions
 * list uses it to decide whether a session's zone is worth naming, and the
 * progress read is required to send a zone, which decides what counts as a week.
 *
 * The product stores no zone for a gym — neither an organization nor a site
 * carries one — so the reader's is the only zone a screen can honestly use.
 */

/** Null when the browser will not say, which is a case every caller must word. */
export function readerTimeZone(): string | null {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || null
  } catch {
    return null
  }
}
