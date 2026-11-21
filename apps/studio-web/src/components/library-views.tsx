'use client'

/**
 * What the screens of the library share: the switch between the two views of a
 * list, the outline a list shows while its content arrives, and the one badge
 * that says the state of a template or a program, in the list and in its editor.
 */

import { Badge } from '@allfitone/react/components/badge'
import { Skeleton } from '@allfitone/react/components/skeleton'
import { ToggleGroup, ToggleGroupItem } from '@allfitone/react/components/toggle-group'

import {
  contentStatus,
  contentStatusLabel,
  type ContentKind,
  type ContentStatus,
  type LibraryView,
} from '@/lib/content-library'
import type { ContentItem } from '@/lib/organization-content'

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

const STATUS_VARIANT: Record<ContentStatus['kind'], 'success' | 'secondary' | 'outline'> = {
  published: 'success',
  draft: 'secondary',
  retired: 'outline',
  archived: 'outline',
}

export function ContentStatusBadge({ item, kind }: { item: ContentItem; kind: ContentKind }) {
  const status = contentStatus(item)
  return (
    <Badge variant={STATUS_VARIANT[status.kind]} data-library-status={status.kind}>
      {contentStatusLabel(status, kind)}
    </Badge>
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
