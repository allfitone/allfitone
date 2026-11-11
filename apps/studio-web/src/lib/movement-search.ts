/**
 * Searching the movements a gym can plan with: `HU-STUDIO-067`.
 *
 * One list holds two libraries — the global one Allfit publishes and the
 * gym's own — and the three criteria divide cleanly between the server and
 * this file:
 *
 * 1. **The global library plus our own, and nothing of another gym's.** The
 *    filtering is `catalog.search_organization_movements`'; what is left here
 *    is saying which of the two each result belongs to.
 * 2. **The search covers names and other names.** The server matches both,
 *    case-insensitively, but does not fold accents, and the empty state says
 *    so rather than letting «presion» look like a gap in the catalogue.
 * 3. **Archived movements appear only when asked for.** The server leaves them
 *    out unless `include_archived` is sent; the screen offers the switch and
 *    marks them when they come.
 *
 * The template editor's picker reads the same search, so these rules are its
 * rules too.
 */

import type { InfiniteData } from '@tanstack/react-query'

import type { CatalogDiscipline, StudioMovement, StudioMovementPage } from './studio-api'

export const MOVEMENT_SEARCH_LIMIT = 120

export interface MovementSearchFilters {
  term: string | undefined
  disciplineCode: string | undefined
  includeArchived: boolean
}

export function movementSearchTerm(raw: string): string | undefined {
  const term = raw.trim()
  return term ? term : undefined
}

export function movementScopeLabel(scope: StudioMovement['scope']): string {
  return scope === 'global' ? 'Catálogo de Allfit' : 'Propio'
}

export function disciplineName(
  code: string,
  disciplines: readonly CatalogDiscipline[] | undefined,
): string {
  return disciplines?.find((discipline) => discipline.code === code)?.name ?? code
}

export function flattenMovementPages(
  data: InfiniteData<StudioMovementPage, unknown> | undefined,
): StudioMovement[] {
  if (!data) return []
  const movements: StudioMovement[] = []
  const seen = new Set<string>()
  for (const page of data.pages) {
    for (const movement of page.data) {
      if (seen.has(movement.id)) continue
      seen.add(movement.id)
      movements.push(movement)
    }
  }
  return movements
}

export function movementEmptyMessage(filters: {
  term: string | undefined
  includeArchived: boolean
}): { title: string; description: string } {
  if (filters.term) {
    return {
      title: `Ningún movimiento coincide con «${filters.term}»`,
      description:
        'La búsqueda mira el nombre y los otros nombres, y distingue las tildes. Prueba con menos letras.',
    }
  }
  return {
    title: 'Todavía no hay movimientos aquí',
    description: filters.includeArchived
      ? 'Ni el catálogo de Allfit ni tu organización tienen movimientos en esta selección.'
      : 'Ni el catálogo de Allfit ni tu organización tienen movimientos en esta selección. Los archivados solo aparecen si los incluyes.',
  }
}
