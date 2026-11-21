'use client'

/**
 * One movement the organization can use, read through `OP-CAT-010`.
 *
 * A global movement and one of the gym's own read the same way here, and the
 * page says whose it is. Another organization's movement answers 404, like one
 * that never existed. Creating one lands here, so the gym sees at once what
 * it made and that nobody else sees it.
 *
 * The page takes the shape of the library's editors: the trail back to the
 * movements, the name as the title, and what can be done with it in sight at
 * the top. A movement of the gym's own that is not archived opens as its form,
 * because the form is the movement; any other is read.
 */

import { Alert, AlertAction, AlertDescription, AlertTitle } from '@allfitone/react/components/alert'
import { Button, buttonVariants } from '@allfitone/react/components/button'
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@allfitone/react/components/empty'
import { Skeleton } from '@allfitone/react/components/skeleton'
import { FoundationIcon } from '@allfitone/react/icons'
import { useQuery } from '@tanstack/react-query'
import Link from 'next/link'
import { useParams } from 'next/navigation'

import { LibraryTrail } from './library-views'
import { MovementEditor } from './movement-editor'
import { MovementDetails, MovementTitle } from './movement-summary'
import { useOrganizationContext } from './organization-context'
import { libraryPath } from '@/lib/content-library'
import { canArchiveMovements } from '@/lib/movement-form'
import { canManageContent } from '@/lib/organization-content'
import { disciplineOptions } from '@/lib/session-template-create'
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
  const contentPath = libraryPath(organizationId, 'movements')
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
        <div data-editor-skeleton role="status" aria-label="Abriendo el movimiento">
          <Skeleton data-editor-skeleton-bar />
          <Skeleton data-movement-skeleton-form />
        </div>
      </section>
    )
  }

  const own = movement.scope === 'organization'
  const whose = own
    ? `Un movimiento propio de ${current.display_name}. Solo lo ve tu organización.`
    : 'Un movimiento del catálogo de Allfit. Lo carga Allfit, y se usa tal como está.'

  return (
    <section data-content-page aria-label={label}>
      <LibraryTrail organizationId={organizationId} tab="movements" current={movement.name} />

      {own && !movement.archived ? (
        <MovementEditor
          key={movement.id}
          movement={movement}
          organizationId={organizationId}
          disciplines={disciplineOptions(disciplinesQuery.data?.items ?? [])}
          catalog={disciplinesQuery.data?.items}
          whose={whose}
          // HU-066 is the owner's and the admin's; a coach is told who can.
          canArchive={canArchiveMovements(current.roles, rolesQuery.data?.items)}
        />
      ) : (
        <>
          <header data-editor-bar>
            <MovementTitle movement={movement} />
          </header>
          <p data-editor-meta-note>{whose}</p>
          <MovementDetails movement={movement} disciplines={disciplinesQuery.data?.items} />
          {/* HU-065 criterion 2: a global movement is read here, never edited. */}
          <p data-editor-meta-note>
            {own
              ? 'Está archivado: ya no se edita ni se puede sumar a contenido nuevo. Las versiones y las sesiones que lo usan siguen mostrando su nombre.'
              : 'Los movimientos del catálogo de Allfit no se editan desde aquí. Si necesitas otro nombre o una variante, crea un movimiento propio.'}
          </p>
        </>
      )}
    </section>
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
      Volver a la biblioteca
    </Link>
  )
}
