'use client'

/**
 * What every list of the library shares: the switch between its two views and
 * the outline it shows while its content arrives.
 */

import { Skeleton } from '@allfitone/react/components/skeleton'
import { ToggleGroup, ToggleGroupItem } from '@allfitone/react/components/toggle-group'

import type { LibraryView } from '@/lib/content-library'

const SKELETON_SLOTS = [0, 1, 2, 3, 4, 5]

export function LibraryViewToggle({
  view,
  onChange,
}: {
  view: LibraryView
  onChange: (view: LibraryView) => void
}) {
  function choose(values: LibraryView[]) {
    const next = values[0]
    // Pressing the view already on leaves it on: a list always has one.
    if (next && next !== view) onChange(next)
  }

  return (
    <ToggleGroup value={[view]} onValueChange={choose} aria-label="Vista" data-library-view>
      <ToggleGroupItem value="cards">Tarjetas</ToggleGroupItem>
      <ToggleGroupItem value="rows">Filas</ToggleGroupItem>
    </ToggleGroup>
  )
}

/** The shape of the list to come, so nothing jumps when it arrives. */
export function LibrarySkeleton({ label }: { label: string }) {
  return (
    <div data-library-grid role="status" aria-label={label}>
      {SKELETON_SLOTS.map((slot) => (
        <Skeleton key={slot} data-library-skeleton />
      ))}
    </div>
  )
}
