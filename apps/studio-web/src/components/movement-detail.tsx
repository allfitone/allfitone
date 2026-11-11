'use client'

/**
 * One movement the organization can use, read through `OP-CAT-010`.
 *
 * A global movement and one of the gym's own read the same way here, and the
 * page says whose it is. Another organization's movement answers 404, like one
 * that never existed. Creating one lands here, so the gym sees at once what
 * it made and that nobody else sees it.
 */

import { Alert, AlertAction, AlertDescription, AlertTitle } from '@allfitone/react/components/alert'
import { Badge } from '@allfitone/react/components/badge'
import { Button, buttonVariants } from '@allfitone/react/components/button'
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
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
import { Spinner } from '@allfitone/react/components/spinner'
import { FoundationIcon } from '@allfitone/react/icons'
import { useQuery } from '@tanstack/react-query'
import Link from 'next/link'
import { useParams } from 'next/navigation'

import { useOrganizationContext } from './organization-context'
import { WorkspacePageHeader } from './workspace-page-header'
import { RELATION_LABEL } from '@/lib/movement-form'
import { disciplineName, movementScopeLabel } from '@/lib/movement-search'
import { canManageContent } from '@/lib/organization-content'
import type { CatalogDiscipline, OrganizationMovement } from '@/lib/studio-api'
import {
  catalogDisciplinesQueryOptions,
  isStudioNotFound,
  organizationMovementQueryOptions,
  organizationRolesQueryOptions,
} from '@/lib/studio-query'

export function MovementDetail() {
  const params = useParams<{ movementId: string }>()
  const { current } = useOrganizationContext()
  const organizationId = current.organization_id
  const contentPath = `/organizations/${organizationId}/content`
  const rolesQuery = useQuery(organizationRolesQueryOptions(organizationId))
  const movementQuery = useQuery(
    organizationMovementQueryOptions(organizationId, params.movementId),
  )
  const disciplinesQuery = useQuery(catalogDisciplinesQueryOptions())
  const label = 'Movimiento'

  if (!rolesQuery.isPending && !canManageContent(current.roles, rolesQuery.data?.items)) {
    return (
      <section data-version-refusal>
        <Alert variant="warning" live="polite">
          <AlertTitle>Tu rol no consulta contenido</AlertTitle>
          <AlertDescription>
            Los movimientos corresponden a quienes tienen el rol de coach, administración o
            propietario en {current.display_name}.
          </AlertDescription>
        </Alert>
        <BackToContent href={contentPath} />
      </section>
    )
  }

  if (isStudioNotFound(movementQuery.error)) {
    return (
      <section data-content-page aria-label={label}>
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <FoundationIcon name="overview" decorative />
            </EmptyMedia>
            <EmptyTitle>No encontramos este movimiento</EmptyTitle>
            <EmptyDescription>
              No existe o es de otra organización. Solo se ven el catálogo de Allfit y los
              movimientos propios de {current.display_name}.
            </EmptyDescription>
          </EmptyHeader>
          <BackToContent href={contentPath} />
        </Empty>
      </section>
    )
  }

  if (movementQuery.isError) {
    return (
      <section data-content-page aria-label={label}>
        <Alert variant="danger" live="polite">
          <AlertTitle>No pudimos abrir el movimiento</AlertTitle>
          <AlertDescription>
            La conexión falló de forma temporal. Nada se muestra hasta comprobarlo de nuevo.
          </AlertDescription>
          <AlertAction>
            <Button variant="outline" onClick={() => void movementQuery.refetch()}>
              Reintentar
            </Button>
          </AlertAction>
        </Alert>
      </section>
    )
  }

  const movement = movementQuery.data
  if (!movement) {
    return (
      <section data-content-page aria-label={label}>
        <div data-content-catalog-state>
          <Spinner label="Abriendo el movimiento" />
          <p>Abriendo el movimiento…</p>
        </div>
      </section>
    )
  }

  return (
    <section data-content-page aria-label={label}>
      <WorkspacePageHeader
        description={
          movement.scope === 'global'
            ? 'Un movimiento del catálogo de Allfit. Lo carga Allfit, y se usa tal como está.'
            : `Un movimiento propio de ${current.display_name}. Solo lo ve tu organización.`
        }
        actions={<BackToContent href={contentPath} />}
      />
      <MovementSummary movement={movement} disciplines={disciplinesQuery.data?.items} />
    </section>
  )
}

export function MovementSummary({
  movement,
  disciplines,
}: {
  movement: OrganizationMovement
  disciplines: readonly CatalogDiscipline[] | undefined
}) {
  return (
    <Card data-movement-summary>
      <CardHeader>
        <CardTitle role="heading" aria-level={2}>
          {movement.name}
        </CardTitle>
        <CardDescription>{disciplineName(movement.discipline_code, disciplines)}</CardDescription>
        <CardAction>
          <span data-movement-badges>
            <Badge variant={movement.scope === 'global' ? 'secondary' : 'outline'}>
              {movementScopeLabel(movement.scope)}
            </Badge>
            {movement.archived ? <Badge variant="outline">Archivado</Badge> : null}
          </span>
        </CardAction>
      </CardHeader>
      <CardContent>
        <dl data-version-details>
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
      </CardContent>
    </Card>
  )
}

function BackToContent({ href }: { href: string }) {
  return (
    <Link
      href={href}
      className={buttonVariants({ variant: 'outline' })}
      data-variant="outline"
      data-slot="button"
    >
      Volver al contenido
    </Link>
  )
}
