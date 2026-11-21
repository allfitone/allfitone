/**
 * What every movement shows of itself, whether it is read or edited: its name
 * with whose it is, and the facts about it that are not typed on this screen.
 */

import { Badge } from '@allfitone/react/components/badge'
import type { ReactNode } from 'react'

import { RELATION_LABEL } from '@/lib/movement-form'
import { disciplineName, movementScopeLabel } from '@/lib/movement-search'
import type { CatalogDiscipline, OrganizationMovement } from '@/lib/studio-api'

/** The name as the title of the page, and beside it whose the movement is. */
export function MovementTitle({
  movement,
  children,
}: {
  movement: OrganizationMovement
  children?: ReactNode
}) {
  return (
    <div data-editor-title data-movement-title>
      <p role="heading" aria-level={2} data-editor-heading>
        {movement.name}
      </p>
      <span data-movement-badges>
        <Badge variant={movement.scope === 'global' ? 'secondary' : 'outline'}>
          {movementScopeLabel(movement.scope)}
        </Badge>
        {movement.archived ? <Badge variant="outline">Archivado</Badge> : null}
      </span>
      {children}
    </div>
  )
}

/**
 * A movement that is edited shows only what its form does not hold: the
 * equipment, which Studio cannot choose, and whether a published version uses it.
 */
export function MovementDetails({
  movement,
  disciplines,
  edited = false,
}: {
  movement: OrganizationMovement
  disciplines: readonly CatalogDiscipline[] | undefined
  edited?: boolean
}) {
  return (
    <dl data-version-details data-movement-details>
      {edited ? null : (
        <>
          <div>
            <dt>Disciplina</dt>
            <dd>{disciplineName(movement.discipline_code, disciplines)}</dd>
          </div>
          <div>
            <dt>Otros nombres</dt>
            <dd>{movement.aliases.length > 0 ? movement.aliases.join(', ') : 'Ninguno'}</dd>
          </div>
          <div>
            <dt>Variante de</dt>
            <dd>
              {movement.variant_of
                ? `${RELATION_LABEL[movement.variant_of.relation]} de ${movement.variant_of.name}${movement.variant_of.note ? `: ${movement.variant_of.note}` : ''}`
                : 'Ninguno'}
            </dd>
          </div>
        </>
      )}
      <div>
        <dt>Equipo</dt>
        <dd>{movement.equipment.length > 0 ? movement.equipment.join(', ') : 'Ninguno'}</dd>
      </div>
      {movement.scope === 'organization' ? (
        <div>
          <dt>Uso</dt>
          <dd>
            {movement.name_locked
              ? 'Una versión publicada lo usa'
              : 'Ninguna versión publicada lo usa'}
          </dd>
        </div>
      ) : null}
    </dl>
  )
}
