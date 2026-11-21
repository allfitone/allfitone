'use client'

/**
 * The movements a gym can plan with: `HU-STUDIO-067`.
 *
 * The third tab of the library, beside the templates and programs that are
 * built out of these. The template editor searches the same list while a step
 * is written; here it can be browsed on its own, which is also where the gym's
 * own movements are created, corrected and archived.
 *
 * Every filter goes to the server, which owns all three criteria: what this
 * screen adds is saying whose each movement is, and marking the archived ones
 * when somebody asks to see them. The toolbar and the two views are the ones
 * the other tabs use.
 */

import { Alert, AlertAction, AlertDescription, AlertTitle } from '@allfitone/react/components/alert'
import { Badge } from '@allfitone/react/components/badge'
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
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@allfitone/react/components/empty'
import { Field, FieldLabel } from '@allfitone/react/components/field'
import { Input } from '@allfitone/react/components/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@allfitone/react/components/select'
import { Spinner } from '@allfitone/react/components/spinner'
import { Switch } from '@allfitone/react/components/switch'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@allfitone/react/components/table'
import { FoundationIcon } from '@allfitone/react/icons'
import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import Link from 'next/link'
import { useState } from 'react'

import { LibrarySkeleton, LibraryViewToggle } from './library-views'
import { useOrganizationContext } from './organization-context'
import type { LibraryView } from '@/lib/content-library'
import {
  MOVEMENT_SEARCH_LIMIT,
  disciplineName,
  flattenMovementPages,
  movementEmptyMessage,
  movementScopeLabel,
  movementSearchTerm,
} from '@/lib/movement-search'
import { disciplineOptions } from '@/lib/session-template-create'
import type { StudioMovement } from '@/lib/studio-api'
import {
  catalogDisciplinesQueryOptions,
  organizationMovementsQueryOptions,
} from '@/lib/studio-query'
import { useCompactTable } from '@/lib/use-compact-table'
import { useDebouncedValue } from '@/lib/use-debounced-value'

const PAGE_SIZE = 25
const SEARCH_SETTLE_MS = 300
const EVERY_DISCIPLINE = 'all'

export function MovementLibrary({
  view,
  onViewChange,
}: {
  view: LibraryView
  onViewChange: (view: LibraryView) => void
}) {
  const { current } = useOrganizationContext()
  const { compact, measuredRef } = useCompactTable<HTMLDivElement>()
  const [searchBox, setSearchBox] = useState('')
  const [disciplineCode, setDisciplineCode] = useState(EVERY_DISCIPLINE)
  const [includeArchived, setIncludeArchived] = useState(false)
  const settledBox = useDebouncedValue(searchBox, SEARCH_SETTLE_MS)
  const filters = {
    term: movementSearchTerm(settledBox),
    disciplineCode: disciplineCode === EVERY_DISCIPLINE ? undefined : disciplineCode,
    includeArchived,
  }

  const disciplinesQuery = useQuery(catalogDisciplinesQueryOptions())
  const query = useInfiniteQuery(
    organizationMovementsQueryOptions(current.organization_id, filters, PAGE_SIZE),
  )
  const movements = flattenMovementPages(query.data)
  const disciplines = disciplinesQuery.data?.items
  const options = [
    { value: EVERY_DISCIPLINE, label: 'Todas las disciplinas' },
    ...disciplineOptions(disciplines ?? []),
  ]
  const empty = movementEmptyMessage(filters)
  const basePath = `/organizations/${current.organization_id}/content/movements`
  // Rows that do not fit fall back to cards, whatever was chosen.
  const rows = view === 'rows' && !compact

  return (
    <div data-content-panel ref={measuredRef}>
      <div data-library-toolbar>
        {/* One search over both libraries (criterion 1); each result says whose it is. */}
        <Input
          type="search"
          name="q"
          autoComplete="off"
          maxLength={MOVEMENT_SEARCH_LIMIT}
          aria-label="Buscar un movimiento"
          placeholder="Buscar por nombre u otro nombre"
          value={searchBox}
          onChange={(event) => setSearchBox(event.target.value)}
          data-library-search
        />
        <Select
          value={disciplineCode}
          onValueChange={(value) => setDisciplineCode(value ?? EVERY_DISCIPLINE)}
          items={options}
        >
          <SelectTrigger aria-label="Disciplina" data-library-filter>
            <SelectValue />
          </SelectTrigger>
          <SelectContent align="start">
            {options.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Field orientation="horizontal" data-library-switch>
          <Switch
            id="movement-archived"
            checked={includeArchived}
            onCheckedChange={(checked) => setIncludeArchived(checked)}
          />
          <FieldLabel htmlFor="movement-archived">Incluir los archivados</FieldLabel>
        </Field>
        <LibraryViewToggle view={view} onChange={onViewChange} />
      </div>

      {query.isFetching && !query.isPending && !query.isFetchingNextPage ? (
        <p data-query-refreshing role="status" aria-live="polite">
          Buscando…
        </p>
      ) : null}

      {query.isPending ? <LibrarySkeleton label="Buscando movimientos" /> : null}

      {query.isError && movements.length === 0 ? (
        <Alert variant="danger" live="polite">
          <AlertTitle>No pudimos buscar los movimientos</AlertTitle>
          <AlertDescription>
            La conexión falló de forma temporal. Nada se muestra hasta comprobarlo de nuevo, para
            que no parezca que no hay movimientos.
          </AlertDescription>
          <AlertAction>
            <Button variant="outline" onClick={() => void query.refetch()}>
              Reintentar
            </Button>
          </AlertAction>
        </Alert>
      ) : null}

      {query.isSuccess && movements.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <FoundationIcon name="search" decorative />
            </EmptyMedia>
            <EmptyTitle>{empty.title}</EmptyTitle>
            <EmptyDescription>{empty.description}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : null}

      {movements.length > 0 && rows ? (
        <Table
          aria-label="Movimientos"
          scrollAreaLabel="Tabla de movimientos"
          data-studio-register="library-movements"
        >
          <colgroup>
            <col />
            <col />
            <col />
          </colgroup>
          <TableHeader>
            <TableRow>
              <TableHead>Nombre</TableHead>
              <TableHead>Disciplina</TableHead>
              <TableHead>Origen</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {movements.map((movement) => (
              <TableRow key={movement.id} data-library-row="movements">
                <TableCell>
                  <Link href={`${basePath}/${movement.id}`} data-library-entry-link>
                    {movement.name}
                  </Link>
                </TableCell>
                <TableCell>{disciplineName(movement.discipline_code, disciplines)}</TableCell>
                <TableCell>
                  <MovementBadges movement={movement} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : null}

      {movements.length > 0 && !rows ? (
        <ul data-library-grid aria-label="Movimientos">
          {movements.map((movement) => (
            <li key={movement.id}>
              <Card size="sm" data-library-card="movements">
                <CardHeader>
                  <CardTitle role="heading" aria-level={2}>
                    <Link href={`${basePath}/${movement.id}`} data-library-entry-link>
                      {movement.name}
                    </Link>
                  </CardTitle>
                  <CardDescription>
                    {disciplineName(movement.discipline_code, disciplines)}
                  </CardDescription>
                </CardHeader>
                <CardFooter data-library-card-foot>
                  <MovementBadges movement={movement} />
                </CardFooter>
              </Card>
            </li>
          ))}
        </ul>
      ) : null}

      {query.hasNextPage ? (
        <div data-client-pagination>
          <Button
            variant="outline"
            disabled={query.isFetchingNextPage}
            onClick={() => void query.fetchNextPage()}
          >
            {query.isFetchingNextPage ? <Spinner label="Cargando más movimientos" /> : null}
            {query.isFetchingNextPage ? 'Cargando…' : 'Ver más'}
          </Button>
        </div>
      ) : null}
    </div>
  )
}

function MovementBadges({ movement }: { movement: StudioMovement }) {
  return (
    <span data-library-badges>
      {/* Criterion 1: the two libraries are one list, told apart. */}
      <Badge variant={movement.scope === 'global' ? 'secondary' : 'outline'}>
        {movementScopeLabel(movement.scope)}
      </Badge>
      {movement.archived ? <Badge variant="outline">Archivado</Badge> : null}
    </span>
  )
}
