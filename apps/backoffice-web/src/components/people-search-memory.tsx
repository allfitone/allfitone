'use client'

/**
 * The last people search, kept while the workspace is open.
 *
 * Every search is recorded on each person it answers, so coming back from a
 * file must not search again: that would add a record to everyone on the list
 * for a look the operator already had. Nor does the search go in the address,
 * where a name, an email or a phone would reach the browser's history and the
 * server's logs.
 *
 * So it lives in memory under the session gate, and nowhere else: a reload
 * loses it, and ending the session unmounts it with everything else on screen.
 */

import { createContext, useContext, useMemo, useState, type ReactNode } from 'react'

import type { SupportPeopleSearch } from '@/lib/backoffice-api'

export interface RememberedSearch {
  term: string
  /** Normalized, or empty: the case the search was recorded under. */
  caseReference: string
  result: SupportPeopleSearch
}

interface Memory {
  last: RememberedSearch | null
  remember: (search: RememberedSearch) => void
}

const PeopleSearchMemoryContext = createContext<Memory | null>(null)

export function PeopleSearchMemory({ children }: { children: ReactNode }) {
  const [last, setLast] = useState<RememberedSearch | null>(null)
  const memory = useMemo(() => ({ last, remember: setLast }), [last])
  return (
    <PeopleSearchMemoryContext.Provider value={memory}>
      {children}
    </PeopleSearchMemoryContext.Provider>
  )
}

export function usePeopleSearchMemory(): Memory {
  const memory = useContext(PeopleSearchMemoryContext)
  if (!memory) throw new Error('usePeopleSearchMemory needs a PeopleSearchMemory above it')
  return memory
}
