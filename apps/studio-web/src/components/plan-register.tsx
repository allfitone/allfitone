'use client'

/**
 * The plans a gym sells: `HU-STUDIO-077`.
 *
 * Listed the way the library lists its content, with the library's own
 * pieces: one toolbar with a search and the switch between cards and rows, a
 * card that opens the plan wherever it is pressed, and an outline while the
 * list arrives. What a plan sells at is the fact a reader came for, so it is
 * the line under the name; its state is the badge beside it (criterion 1).
 *
 * Criterion 2, never another organization's plans, is the read's: nothing here
 * filters by organization. Everything a plan can be asked to do lives on its
 * own page, so a card carries no menu.
 */

import { Alert, AlertAction, AlertDescription, AlertTitle } from '@allfitone/react/components/alert'
import { Button } from '@allfitone/react/components/button'
import {
  Card,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@allfitone/react/components/card'
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@allfitone/react/components/empty'
import { Input } from '@allfitone/react/components/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@allfitone/react/components/table'
import { FoundationIcon } from '@allfitone/react/icons'
import { useInfiniteQuery } from '@tanstack/react-query'
import Link from 'next/link'
import { useState } from 'react'

import { PlanStateBadge } from './billing-views'
import { LibrarySkeleton, LibraryViewToggle } from './library-views'
import { planPath } from '@/lib/billing-navigation'
import { filterPlans, planPriceLine, planState, priceCountLabel } from '@/lib/plan-catalog'
import type { OrganizationPlan } from '@/lib/studio-api'
import { organizationPlansQueryOptions } from '@/lib/studio-query'
import { useCompactTable } from '@/lib/use-compact-table'
import { useEveryPage } from '@/lib/use-every-page'
import { useLibraryView } from '@/lib/use-library-view'

const PAGE_SIZE = 50

export function PlanRegister({
  organizationId,
  onCreate,
}: {
  organizationId: string
  /** Absent for a role that may not create a plan. */
  onCreate?: () => void
}) {
  const query = useInfiniteQuery(organizationPlansQueryOptions(organizationId, PAGE_SIZE))
  // A gym sells a handful of plans: every page is read, so the list is whole.
  useEveryPage(query)
  const { compact, measuredRef } = useCompactTable<HTMLDivElement>()
  const [view, setView] = useLibraryView()
  const [term, setTerm] = useState('')

  if (query.isError) {
    return (
      <Alert variant="danger" live="polite">
        <AlertTitle>No pudimos cargar los planes</AlertTitle>
        <AlertDescription>
          La conexión falló de forma temporal. Nada se muestra hasta comprobarlo de nuevo, para que
          no parezca que no vendemos nada.
        </AlertDescription>
        <AlertAction>
          <Button variant="outline" onClick={() => void query.refetch()}>
            Reintentar
          </Button>
        </AlertAction>
      </Alert>
    )
  }

  if (query.isPending || query.hasNextPage) return <LibrarySkeleton label="Cargando los planes" />

  const plans = query.data.pages.flatMap((page) => page.data)

  if (plans.length === 0) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <FoundationIcon name="overview" decorative />
          </EmptyMedia>
          <EmptyTitle>Todavía no hay planes</EmptyTitle>
          <EmptyDescription>
            Un plan es lo que una persona paga para entrenar con ustedes. Se puede vender cuando se
            le publica un precio.
          </EmptyDescription>
        </EmptyHeader>
        {onCreate ? (
          <EmptyContent>
            <Button onClick={onCreate}>
              <FoundationIcon name="add" decorative />
              Nuevo plan
            </Button>
          </EmptyContent>
        ) : null}
      </Empty>
    )
  }

  const shown = filterPlans(plans, term)
  // Rows that do not fit fall back to cards, whatever was chosen.
  const rows = view === 'rows' && !compact

  return (
    <div data-content-panel ref={measuredRef}>
      <div data-library-toolbar>
        <Input
          type="search"
          name="q"
          autoComplete="off"
          aria-label="Buscar planes"
          placeholder="Buscar por nombre"
          value={term}
          onChange={(event) => setTerm(event.target.value)}
          data-library-search
        />
        <LibraryViewToggle view={view} onChange={setView} />
      </div>

      {shown.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <FoundationIcon name="search" decorative />
            </EmptyMedia>
            <EmptyTitle>Ningún plan coincide</EmptyTitle>
            <EmptyDescription>Cambia la búsqueda para ver más.</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button variant="outline" onClick={() => setTerm('')}>
              Quitar la búsqueda
            </Button>
          </EmptyContent>
        </Empty>
      ) : rows ? (
        <Table aria-label="Planes" scrollAreaLabel="Tabla de planes" data-studio-register="plans">
          <colgroup>
            <col />
            <col />
            <col />
            <col />
          </colgroup>
          <TableHeader>
            <TableRow>
              <TableHead>Nombre</TableHead>
              <TableHead>Precio</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead>Precios publicados</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {shown.map((plan) => (
              <PlanRow key={plan.plan_id} plan={plan} organizationId={organizationId} />
            ))}
          </TableBody>
        </Table>
      ) : (
        <ul data-library-grid aria-label="Planes">
          {shown.map((plan) => (
            <li key={plan.plan_id}>
              <PlanCard plan={plan} organizationId={organizationId} />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

interface PlanEntryProps {
  plan: OrganizationPlan
  organizationId: string
}

function PlanCard({ plan, organizationId }: PlanEntryProps) {
  return (
    <Card size="sm" data-library-card="plans">
      <CardHeader>
        <CardTitle role="heading" aria-level={2}>
          <Link href={planPath(organizationId, plan.plan_id)} data-library-entry-link>
            {plan.name}
          </Link>
        </CardTitle>
        <CardDescription data-plan-price={planState(plan)}>{planPriceLine(plan)}</CardDescription>
      </CardHeader>
      <CardFooter data-library-card-foot>
        <PlanStateBadge plan={plan} />
        {plan.versions.length > 0 ? (
          <span data-library-edited>{priceCountLabel(plan.versions.length)}</span>
        ) : null}
      </CardFooter>
    </Card>
  )
}

function PlanRow({ plan, organizationId }: PlanEntryProps) {
  return (
    <TableRow data-library-row="plans">
      <TableCell>
        <Link href={planPath(organizationId, plan.plan_id)} data-library-entry-link>
          {plan.name}
        </Link>
      </TableCell>
      <TableCell>
        <span data-plan-price={planState(plan)}>{planPriceLine(plan)}</span>
      </TableCell>
      <TableCell>
        <PlanStateBadge plan={plan} />
      </TableCell>
      <TableCell>{plan.versions.length}</TableCell>
    </TableRow>
  )
}
