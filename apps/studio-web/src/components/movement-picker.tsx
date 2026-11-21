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
 *
 * The results are one list under the search, moved through with the arrow keys
 * and chosen with Enter. The server does the searching, so the list's own
 * filter is off: it would hide a movement found by one of its other names.
 */

import { Badge } from '@allfitone/react/components/badge'
import { Button } from '@allfitone/react/components/button'
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
  CommandLoading,
} from '@allfitone/react/components/command'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@allfitone/react/components/dialog'
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
  // The list only moves its mark when it filters, and here the server does. A
  // mark left on a result that is gone would leave Enter with nothing to choose.
  const [marked, setMarked] = useState('')
  const active = movements.some((movement) => movement.id === marked)
    ? marked
    : (movements[0]?.id ?? '')

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-movement-picker>
        <DialogHeader>
          <DialogTitle>Elegir un movimiento</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <Command
          shouldFilter={false}
          label="Buscar"
          value={active}
          onValueChange={setMarked}
          data-movement-picker-search
        >
          <CommandInput
            maxLength={MOVEMENT_SEARCH_LIMIT}
            placeholder="Buscar por nombre u otro nombre"
            value={searchBox}
            onValueChange={setSearchBox}
          />
          <CommandList label="Movimientos para elegir" data-movement-picker-results>
            {query.isPending ? (
              <CommandLoading>
                <Spinner label="Buscando movimientos" />
                Buscando movimientos…
              </CommandLoading>
            ) : null}

            {query.isError ? (
              <CommandEmpty>
                No pudimos buscar los movimientos. Cierra y vuelve a intentarlo.
              </CommandEmpty>
            ) : null}

            {query.isSuccess && movements.length === 0 ? (
              <CommandEmpty data-movement-picker-empty>
                {empty.title}. {empty.description}
              </CommandEmpty>
            ) : null}

            {movements.map((movement) => (
              <CommandItem
                key={movement.id}
                value={movement.id}
                onSelect={() => onPick(movement)}
                data-movement-option
              >
                <span data-movement-option-name>{movement.name}</span>
                <Badge variant={movement.scope === 'global' ? 'secondary' : 'outline'}>
                  {movementScopeLabel(movement.scope)}
                </Badge>
              </CommandItem>
            ))}
          </CommandList>
          {query.hasNextPage ? (
            <div data-movement-picker-more>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={query.isFetchingNextPage}
                onClick={() => void query.fetchNextPage()}
              >
                {query.isFetchingNextPage ? 'Cargando…' : 'Ver más'}
              </Button>
            </div>
          ) : null}
        </Command>
      </DialogContent>
    </Dialog>
  )
}
