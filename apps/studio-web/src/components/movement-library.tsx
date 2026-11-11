'use client'

/**
 * The movements a gym can plan with: `HU-STUDIO-067`.
 *
 * The third tab of the content page, beside the templates and programs that are
 * built out of these. The template editor searches the same list while a step
 * is written; here it can be browsed on its own, which is also where the gym's
 * own movements will be created, corrected and archived.
 *
 * Every filter goes to the server, which owns all three criteria: what this
 * screen adds is saying whose each movement is, and marking the archived ones
 * when somebody asks to see them.
 */

import { Alert, AlertAction, AlertDescription, AlertTitle } from '@allfitone/react/components/alert'
import { Badge } from '@allfitone/react/components/badge'
import { Button } from '@allfitone/react/components/button'
import {
  Card,
  CardAction,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@allfitone/react/components/card'
import { Checkbox } from '@allfitone/react/components/checkbox'
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@allfitone/react/components/empty'
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@allfitone/react/components/field'
import { Input } from '@allfitone/react/components/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@allfitone/react/components/select'
import { Spinner } from '@allfitone/react/components/spinner'
import { FoundationIcon } from '@allfitone/react/icons'
import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { useState } from 'react'

import { useOrganizationContext } from './organization-context'
import {
  MOVEMENT_SEARCH_LIMIT,
  disciplineName,
  flattenMovementPages,
  movementEmptyMessage,
  movementScopeLabel,
  movementSearchTerm,
} from '@/lib/movement-search'
import { disciplineOptions } from '@/lib/session-template-create'
import {
  catalogDisciplinesQueryOptions,
  organizationMovementsQueryOptions,
} from '@/lib/studio-query'
import { useDebouncedValue } from '@/lib/use-debounced-value'

const PAGE_SIZE = 25
const SEARCH_SETTLE_MS = 300
const EVERY_DISCIPLINE = 'all'

export function MovementLibrary() {
  const { current } = useOrganizationContext()
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

  return (
    <div data-content-panel>
      <FieldGroup data-movement-search>
        <Field>
          <FieldLabel htmlFor="movement-search">Buscar un movimiento</FieldLabel>
          <Input
            id="movement-search"
            name="q"
            type="search"
            autoComplete="off"
            maxLength={MOVEMENT_SEARCH_LIMIT}
            placeholder="Nombre u otro nombre"
            value={searchBox}
            onChange={(event) => setSearchBox(event.target.value)}
            aria-describedby="movement-search-note"
          />
          <FieldDescription id="movement-search-note">
            Busca a la vez en el catálogo de Allfit y en los movimientos propios de{' '}
            {current.display_name}.
          </FieldDescription>
        </Field>
        <Field>
          <FieldLabel htmlFor="movement-discipline">Disciplina</FieldLabel>
          <Select
            value={disciplineCode}
            onValueChange={(value) => setDisciplineCode(value ?? EVERY_DISCIPLINE)}
            items={options}
          >
            <SelectTrigger id="movement-discipline" data-studio-select-trigger>
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
        </Field>
        <Field orientation="horizontal">
          <Checkbox
            id="movement-archived"
            checked={includeArchived}
            onCheckedChange={(checked) => setIncludeArchived(checked === true)}
          />
          <FieldLabel htmlFor="movement-archived">Incluir los archivados</FieldLabel>
        </Field>
      </FieldGroup>

      {query.isFetching && !query.isPending && !query.isFetchingNextPage ? (
        <p data-query-refreshing role="status" aria-live="polite">
          Buscando…
        </p>
      ) : null}

      {query.isPending ? (
        <div data-content-catalog-state>
          <Spinner label="Buscando movimientos" />
          <p>Buscando movimientos…</p>
        </div>
      ) : null}

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
              <FoundationIcon name="overview" decorative />
            </EmptyMedia>
            <EmptyTitle>{empty.title}</EmptyTitle>
            <EmptyDescription>{empty.description}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : null}

      {movements.length > 0 ? (
        <ul data-content-register aria-label="Movimientos">
          {movements.map((movement) => (
            <li key={movement.id}>
              <Card data-content-register-item data-movement-card>
                <CardHeader>
                  <CardTitle role="heading" aria-level={2}>
                    {movement.name}
                  </CardTitle>
                  <CardDescription>
                    {disciplineName(movement.discipline_code, disciplines)}
                  </CardDescription>
                  <CardAction>
                    <span data-movement-badges>
                      {/* Criterion 1: the two libraries are one list, told apart. */}
                      <Badge variant={movement.scope === 'global' ? 'secondary' : 'outline'}>
                        {movementScopeLabel(movement.scope)}
                      </Badge>
                      {movement.archived ? <Badge variant="outline">Archivado</Badge> : null}
                    </span>
                  </CardAction>
                </CardHeader>
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
