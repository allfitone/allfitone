'use client'

/**
 * The tabs of a record opened so far.
 *
 * A record's tabs each read something, and a read about a person is recorded
 * on her. So a panel mounts the first time its tab opens, never before, and
 * then stays mounted while hidden: going back to it shows what was read
 * instead of reading it, and recording it, again.
 */

import { useState } from 'react'

export function useOpenedTabs<Tab extends string>(current: Tab): ReadonlySet<Tab> {
  const [opened, setOpened] = useState<ReadonlySet<Tab>>(() => new Set([current]))
  if (opened.has(current)) return opened
  // Adjusted while rendering, as React advises for state derived from a prop.
  const next = new Set([...opened, current])
  setOpened(next)
  return next
}
