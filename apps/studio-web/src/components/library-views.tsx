'use client'

/**
 * What the screens of the library share: the switch between the two views of a
 * list, the outline a list shows while its content arrives, the one badge that
 * says the state of a template or a program, the trail that leads back from
 * anything opened, and the place where an answer pops up.
 */

import { Badge } from '@allfitone/react/components/badge'
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@allfitone/react/components/breadcrumb'
import { Skeleton } from '@allfitone/react/components/skeleton'
import { Toaster } from '@allfitone/react/components/sonner'
import { ToggleGroup, ToggleGroupItem } from '@allfitone/react/components/toggle-group'
import Link from 'next/link'

import {
  contentStatus,
  contentStatusLabel,
  libraryPath,
  type ContentKind,
  type ContentStatus,
  type LibraryTab,
  type LibraryView,
} from '@/lib/content-library'
import type { ContentItem } from '@/lib/organization-content'

const SKELETON_SLOTS = [0, 1, 2, 3, 4, 5]
// Clear of the privacy control that floats over the bottom corner.
const TOAST_OFFSET = { bottom: 84, right: 16 }

const TAB_NAME: Record<LibraryTab, string> = {
  templates: 'Plantillas',
  programs: 'Programas',
  movements: 'Movimientos',
}

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

/**
 * Where the reader is and the way back: the library, the tab the thing lives
 * in as a link to the list it came from, and its name.
 */
export function LibraryTrail({
  organizationId,
  tab,
  current,
}: {
  organizationId: string
  tab: LibraryTab
  current: string
}) {
  return (
    <Breadcrumb aria-label="Ruta">
      <BreadcrumbList>
        <BreadcrumbItem>
          <BreadcrumbLink render={<Link href={libraryPath(organizationId)} />} data-editor-crumb>
            Biblioteca
          </BreadcrumbLink>
        </BreadcrumbItem>
        <BreadcrumbSeparator />
        <BreadcrumbItem>
          <BreadcrumbLink
            render={<Link href={libraryPath(organizationId, tab)} />}
            data-editor-crumb
          >
            {TAB_NAME[tab]}
          </BreadcrumbLink>
        </BreadcrumbItem>
        {/* On a phone the name is the title right under the trail, so it is said once. */}
        <BreadcrumbSeparator data-editor-crumb-current />
        <BreadcrumbItem data-editor-crumb-current>
          <BreadcrumbPage>{current}</BreadcrumbPage>
        </BreadcrumbItem>
      </BreadcrumbList>
    </Breadcrumb>
  )
}

/** Where the answer to publishing pops up, in every editor of the library. */
export function LibraryToaster() {
  return <Toaster position="bottom-right" closeButton offset={TOAST_OFFSET} />
}
