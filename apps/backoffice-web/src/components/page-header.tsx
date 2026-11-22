/**
 * The head of a screen's content.
 *
 * The page `h1` belongs to the shell and names the menu entry, so a screen never
 * emits a second one. A screen below an entry — a record, or a form that makes
 * one — opens with the way back and its own name. Without them the `h1` said
 * «Gimnasios» over a gym's file and «Personas» over a person, and the only way
 * back was a link at the foot of a 2700px page.
 *
 * Duplicated deliberately from Studio's `LibraryTrail` and `WorkspacePageHeader`
 * (AGENTS.md §5): the shape is the same, but each product names its own
 * sections, and both compose the Design System's `Breadcrumb` rather than
 * sharing app code.
 */

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@allfitone/react/components/breadcrumb'
import Link from 'next/link'
import { Fragment, type ReactNode } from 'react'

import type { Crumb } from '@/lib/backoffice-routes'

/**
 * `trail` leads back, from the menu entry down; `name` is what is open, said
 * once as the last crumb and again as the heading under it. `status` sits
 * beside the name, `actions` close the row.
 */
export function RecordHeader({
  trail,
  name,
  status,
  description,
  actions,
}: {
  trail: readonly Crumb[]
  name: string
  status?: ReactNode
  description?: ReactNode
  actions?: ReactNode
}) {
  return (
    <header data-record-header>
      <Breadcrumb aria-label="Ruta" data-backoffice-trail>
        <BreadcrumbList>
          {trail.map((crumb, index) => (
            <Fragment key={crumb.href}>
              <BreadcrumbItem>
                <BreadcrumbLink render={<Link href={crumb.href} />} data-backoffice-crumb>
                  {crumb.title}
                </BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator
                data-backoffice-crumb-current-separator={
                  index === trail.length - 1 ? true : undefined
                }
              />
            </Fragment>
          ))}
          <BreadcrumbItem data-backoffice-crumb-current>
            <BreadcrumbPage>{name}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
      <div data-record-title>
        <h2 data-record-heading>{name}</h2>
        {status}
        {actions ? <div data-record-actions>{actions}</div> : null}
      </div>
      {description ? <p data-record-description>{description}</p> : null}
    </header>
  )
}
