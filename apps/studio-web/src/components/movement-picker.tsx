'use client'

/**
 * Choosing a movement out of the search of `HU-STUDIO-067`.
 *
 * Two screens ask for one. A template step takes any movement the organization
 * can use, held to the template's discipline, because the server refuses a step
 * whose movement is of another one. A gym's own movement can be a variant of a
 * global one only (`catalog.valid_movement_variant`), so that use keeps the
 * global library's results and nothing else. Archived movements are left out
 * of both, because archiving is precisely «not for new content».
 */

import { Badge } from '@allfitone/react/components/badge'
import { Button } from '@allfitone/react/components/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@allfitone/react/components/dialog'
import { Field, FieldError, FieldLabel } from '@allfitone/react/components/field'
import { Input } from '@allfitone/react/components/input'
import { Spinner } from '@allfitone/react/components/spinner'
import { useInfiniteQuery } from '@tanstack/react-query'
import { useState } from 'react'

import {
  MOVEMENT_SEARCH_LIMIT,
  flattenMovementPages,
  movementEmptyMessage,
  movementScopeLabel,
  movementSearchTerm,
} from '@/lib/movement-search'
import type { StudioMovement } from '@/lib/studio-api'
import { organizationMovementsQueryOptions } from '@/lib/studio-query'
import { useDebouncedValue } from '@/lib/use-debounced-value'

const PICKER_PAGE_SIZE = 25
const PICKER_SETTLE_MS = 300

export function MovementPicker({
  open,
  onOpenChange,
  organizationId,
  disciplineCode,
  description,
  onlyGlobal = false,
  onPick,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  organizationId: string
  disciplineCode: string
  description: string
  /** Only the global library's movements, for a variant. */
  onlyGlobal?: boolean
  onPick: (movement: StudioMovement) => void
}) {
  const [searchBox, setSearchBox] = useState('')
  const settledBox = useDebouncedValue(searchBox, PICKER_SETTLE_MS)
  const filters = {
    term: movementSearchTerm(settledBox),
    disciplineCode,
    includeArchived: false,
  }
  const query = useInfiniteQuery({
    ...organizationMovementsQueryOptions(organizationId, filters, PICKER_PAGE_SIZE),
    enabled: open,
  })
  const movements = flattenMovementPages(query.data).filter(
    (movement) => !onlyGlobal || movement.scope === 'global',
  )
  const empty = movementEmptyMessage(filters)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-movement-picker>
        <DialogHeader>
          <DialogTitle>Elegir un movimiento</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <Field>
          <FieldLabel htmlFor="movement-picker-search">Buscar</FieldLabel>
          <Input
            id="movement-picker-search"
            type="search"
            autoComplete="off"
            maxLength={MOVEMENT_SEARCH_LIMIT}
            placeholder="Nombre u otro nombre"
            value={searchBox}
            onChange={(event) => setSearchBox(event.target.value)}
          />
        </Field>

        {query.isPending ? (
          <div data-content-catalog-state>
            <Spinner label="Buscando movimientos" />
            <p>Buscando movimientos…</p>
          </div>
        ) : null}

        {query.isError ? (
          <FieldError>No pudimos buscar los movimientos. Cierra y vuelve a intentarlo.</FieldError>
        ) : null}

        {query.isSuccess && movements.length === 0 ? (
          <p data-movement-picker-empty>
            <b>{empty.title}.</b> {empty.description}
          </p>
        ) : null}

        {movements.length > 0 ? (
          <ul data-movement-picker-results aria-label="Movimientos para elegir">
            {movements.map((movement) => (
              <li key={movement.id}>
                <Button type="button" variant="outline" onClick={() => onPick(movement)}>
                  {movement.name}
                </Button>
                <Badge variant={movement.scope === 'global' ? 'secondary' : 'outline'}>
                  {movementScopeLabel(movement.scope)}
                </Badge>
              </li>
            ))}
          </ul>
        ) : null}

        <DialogFooter>
          {query.hasNextPage ? (
            <Button
              type="button"
              variant="outline"
              disabled={query.isFetchingNextPage}
              onClick={() => void query.fetchNextPage()}
            >
              {query.isFetchingNextPage ? 'Cargando…' : 'Ver más'}
            </Button>
          ) : null}
          <DialogClose render={<Button type="button" variant="ghost" />}>Cancelar</DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
