/**
 * Free training (`HU-SP-052`, `LIB-1..3`): what Today brings back for a session with no
 * routine behind it.
 *
 * A free session is the only one without a title — a planned session always carries its
 * routine's — so the title's absence is what names it. Only one is open at a time, and
 * Today learns which from `open_free_session_id`: the same bar that brings back a
 * minimised routine brings it back, named with `text.session.freeSession`.
 */

export interface OpenSession {
  readonly executionId: string
  readonly title: string
}

/** What the «En curso» bar brings back: the routine first, as it did, then the free one. */
export function openSessionBar(
  planned: OpenSession | undefined,
  openFreeSessionId: string | null,
  freeTitle: string,
): OpenSession | undefined {
  if (planned) return planned
  return openFreeSessionId ? { executionId: openFreeSessionId, title: freeTitle } : undefined
}
