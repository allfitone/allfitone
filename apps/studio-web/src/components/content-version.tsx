'use client'

/**
 * One published version, read whole: `HU-STUDIO-045`, for a template and for a
 * program.
 *
 * Nothing on these pages can be changed, and they say so: a version has no
 * write route, so what is read here is what anyone it was assigned to trained.
 * Only its status moves, when it is retired. Another organization's version
 * answers 404 from `OP-PLN-021`, and the page cannot tell that apart from one
 * that never existed, so it does not try.
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
import { useInfiniteQuery, useQueries, useQuery } from '@tanstack/react-query'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useEffect, type ReactNode } from 'react'

import { DeriveFromVersion } from './content-version-actions'
import { useOrganizationContext } from './organization-context'
import { WorkspacePageHeader } from './workspace-page-header'
import {
  describeTarget,
  parseVersionNumber,
  programVersionWeeks,
  versionStatusLabel,
} from '@/lib/content-version'
import { disciplineName } from '@/lib/movement-search'
import { canManageContent } from '@/lib/organization-content'
import { templateVersionIndex } from '@/lib/program-editor'
import {
  catalogActivityTypesQueryOptions,
  catalogDisciplinesQueryOptions,
  isStudioNotFound,
  organizationMovementQueryOptions,
  organizationRolesQueryOptions,
  organizationSessionTemplatePagesQueryOptions,
  programVersionQueryOptions,
  sessionTemplateVersionQueryOptions,
} from '@/lib/studio-query'

const LIBRARY_PAGE_SIZE = 50

export function SessionTemplateVersionView() {
  const params = useParams<{ templateId: string; versionNumber: string }>()
  const { current } = useOrganizationContext()
  const organizationId = current.organization_id
  const versionNumber = parseVersionNumber(params.versionNumber)
  const rolesQuery = useQuery(organizationRolesQueryOptions(organizationId))
  const versionQuery = useQuery({
    ...sessionTemplateVersionQueryOptions(organizationId, params.templateId, versionNumber ?? 0),
    enabled: versionNumber !== null,
  })
  const activityTypesQuery = useQuery(catalogActivityTypesQueryOptions())
  const disciplinesQuery = useQuery(catalogDisciplinesQueryOptions())
  const movementIds = [
    ...new Set(
      versionQuery.data?.steps.flatMap((step) => (step.movement_id ? [step.movement_id] : [])) ??
        [],
    ),
  ]
  const movementQueries = useQueries({
    queries: movementIds.map((movementId) =>
      organizationMovementQueryOptions(organizationId, movementId),
    ),
  })
  const movementNames = new Map(
    movementQueries.flatMap((query) => (query.data ? [[query.data.id, query.data.name]] : [])),
  )

  const label = 'Versión de plantilla'
  const gate = versionGate({
    allowed: canManageContent(current.roles, rolesQuery.data?.items),
    rolesPending: rolesQuery.isPending,
    notFound: versionNumber === null || isStudioNotFound(versionQuery.error),
    failed: versionQuery.isError,
    pending: versionQuery.isPending,
    label,
    organizationName: current.display_name,
    contentPath: `/organizations/${organizationId}/content`,
    retry: () => void versionQuery.refetch(),
  })
  if (gate) return gate
  const version = versionQuery.data
  if (!version) return null

  const activityType = activityTypesQuery.data?.items.find(
    (type) => type.id === version.activity_type_id,
  )

  return (
    <section data-content-page aria-label={label}>
      <WorkspacePageHeader
        description={`«${version.title}», versión ${version.version_number}. ${IMMUTABLE}`}
        actions={<BackToContent href={`/organizations/${organizationId}/content`} />}
      />

      <Card>
        <CardHeader>
          <CardTitle role="heading" aria-level={2}>
            {version.title}
          </CardTitle>
          <CardDescription>
            Versión {version.version_number} · publicada el {formatDate(version.published_at)}
          </CardDescription>
          <CardAction>
            <Badge variant={version.status === 'deprecated' ? 'outline' : 'secondary'}>
              {versionStatusLabel(version.status)}
            </Badge>
          </CardAction>
        </CardHeader>
        <CardContent>
          <dl data-version-details>
            <div>
              <dt>Disciplina</dt>
              <dd>{disciplineName(version.discipline_code, disciplinesQuery.data?.items)}</dd>
            </div>
            <div>
              <dt>Tipo de actividad</dt>
              <dd>{activityType?.name ?? 'Cargando…'}</dd>
            </div>
            <div>
              <dt>Pasos</dt>
              <dd>{version.steps.length}</dd>
            </div>
            {version.derived_from_version_id ? (
              <div>
                <dt>Origen</dt>
                <dd>Adaptada de otra versión</dd>
              </div>
            ) : null}
          </dl>
        </CardContent>
      </Card>

      {version.status === 'deprecated' ? <RetiredNote kind="template" /> : null}
      {version.status === 'published' ? (
        <DeriveFromVersion version={version} organizationId={organizationId} />
      ) : null}

      <ol data-template-steps aria-label="Pasos">
        {version.steps
          .toSorted((left, right) => left.position - right.position)
          .map((step) => (
            <li key={step.position}>
              <Card>
                <CardHeader>
                  <CardTitle role="heading" aria-level={2}>
                    Paso {step.position}
                  </CardTitle>
                  <CardDescription>
                    {step.movement_id
                      ? (movementNames.get(step.movement_id) ?? 'Cargando el movimiento…')
                      : 'Sin movimiento'}
                    {step.superset_group ? ` · Superserie ${step.superset_group}` : ''}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <ul data-content-version-list>
                    {describeTarget(step.target).map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                    {step.notes ? <li>Notas: {step.notes}</li> : null}
                  </ul>
                </CardContent>
              </Card>
            </li>
          ))}
      </ol>
    </section>
  )
}

export function ProgramVersionView() {
  const params = useParams<{ programId: string; versionNumber: string }>()
  const { current } = useOrganizationContext()
  const organizationId = current.organization_id
  const contentPath = `/organizations/${organizationId}/content`
  const versionNumber = parseVersionNumber(params.versionNumber)
  const rolesQuery = useQuery(organizationRolesQueryOptions(organizationId))
  const versionQuery = useQuery({
    ...programVersionQueryOptions(organizationId, params.programId, versionNumber ?? 0),
    enabled: versionNumber !== null,
  })
  const templatesQuery = useInfiniteQuery(
    organizationSessionTemplatePagesQueryOptions(organizationId, LIBRARY_PAGE_SIZE),
  )
  // A session names its template version by id; every template is read to name it.
  const readingTemplates = templatesQuery.hasNextPage
  useEffect(() => {
    if (readingTemplates && !templatesQuery.isFetchingNextPage) void templatesQuery.fetchNextPage()
  }, [readingTemplates, templatesQuery])

  const label = 'Versión de programa'
  const gate = versionGate({
    allowed: canManageContent(current.roles, rolesQuery.data?.items),
    rolesPending: rolesQuery.isPending,
    notFound: versionNumber === null || isStudioNotFound(versionQuery.error),
    failed: versionQuery.isError || templatesQuery.isError,
    pending: versionQuery.isPending || templatesQuery.isPending || readingTemplates,
    label,
    organizationName: current.display_name,
    contentPath,
    retry: () => {
      void versionQuery.refetch()
      void templatesQuery.refetch()
    },
  })
  if (gate) return gate
  const version = versionQuery.data
  if (!version) return null

  const index = templateVersionIndex(templatesQuery.data?.pages.flatMap((page) => page.data) ?? [])
  const retired = new Set(version.deprecated_template_version_ids)
  const weeks = programVersionWeeks(version.sessions)

  return (
    <section data-content-page aria-label={label}>
      <WorkspacePageHeader
        description={`«${version.title}», versión ${version.version_number}. ${IMMUTABLE}`}
        actions={<BackToContent href={contentPath} />}
      />

      <Card>
        <CardHeader>
          <CardTitle role="heading" aria-level={2}>
            {version.title}
          </CardTitle>
          <CardDescription>
            Versión {version.version_number} · publicada el {formatDate(version.published_at)}
          </CardDescription>
          <CardAction>
            <Badge variant={version.status === 'deprecated' ? 'outline' : 'secondary'}>
              {versionStatusLabel(version.status)}
            </Badge>
          </CardAction>
        </CardHeader>
        <CardContent>
          <dl data-version-details>
            <div>
              <dt>Sesiones</dt>
              <dd>{version.session_count}</dd>
            </div>
            <div>
              <dt>Semanas</dt>
              <dd>{weeks.length}</dd>
            </div>
            <div>
              <dt>Al terminar</dt>
              <dd>{version.repeats_forever ? 'Vuelve a empezar' : 'Termina'}</dd>
            </div>
            {version.notes ? (
              <div>
                <dt>Notas</dt>
                <dd>{version.notes}</dd>
              </div>
            ) : null}
          </dl>
        </CardContent>
      </Card>

      {version.status === 'deprecated' ? <RetiredNote kind="program" /> : null}

      <ol data-program-weeks aria-label="Semanas">
        {weeks.map(({ week, sessions }) => (
          <li key={week}>
            <Card data-program-week>
              <CardHeader>
                <CardTitle role="heading" aria-level={2}>
                  Semana {week}
                </CardTitle>
                <CardDescription>
                  {sessions.length === 1 ? '1 sesión' : `${sessions.length} sesiones`}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ul data-content-version-list aria-label={`Sesiones de la semana ${week}`}>
                  {sessions.map((session) => {
                    const named = index.get(session.template_version_id)
                    return (
                      <li key={session.position}>
                        <span>
                          <strong>Día {session.day}</strong> ·{' '}
                          {named
                            ? `${named.templateTitle} · versión ${named.versionNumber}`
                            : 'Una versión de plantilla que ya no está disponible'}
                        </span>
                        {retired.has(session.template_version_id) ? (
                          <Badge variant="outline">Retirada</Badge>
                        ) : null}
                        {named ? (
                          <Link
                            href={`${contentPath}/templates/${named.templateId}/versions/${named.versionNumber}`}
                            data-slot="button"
                            data-variant="link"
                            className={buttonVariants({ variant: 'link' })}
                            aria-label={`Ver ${named.templateTitle}, versión ${named.versionNumber}`}
                          >
                            Ver
                          </Link>
                        ) : null}
                      </li>
                    )
                  })}
                </ul>
              </CardContent>
            </Card>
          </li>
        ))}
      </ol>
    </section>
  )
}

const IMMUTABLE = 'Una versión publicada no cambia: lo que lees hoy es lo que se entrenó con ella.'

function RetiredNote({ kind }: { kind: 'template' | 'program' }) {
  return (
    <Alert variant="warning" data-version-retired>
      <AlertTitle>Esta versión está retirada</AlertTitle>
      <AlertDescription>
        {kind === 'template'
          ? 'Ya no se puede sumar a programas nuevos ni servir de punto de partida. Los programas que ya la usan la conservan.'
          : 'Ya no se puede asignar a nadie más. Quien ya la tiene asignada la conserva.'}
      </AlertDescription>
    </Alert>
  )
}

/** The states before the version itself: the role, the 404, the failure, the wait. */
function versionGate(state: {
  allowed: boolean
  rolesPending: boolean
  notFound: boolean
  failed: boolean
  pending: boolean
  label: string
  organizationName: string
  contentPath: string
  retry: () => void
}): ReactNode {
  if (!state.rolesPending && !state.allowed) {
    return (
      <section data-version-refusal>
        <Alert variant="warning" live="polite">
          <AlertTitle>Tu rol no consulta contenido</AlertTitle>
          <AlertDescription>
            Leer las versiones publicadas corresponde a quienes tienen el rol de coach,
            administración o propietario en {state.organizationName}.
          </AlertDescription>
        </Alert>
        <BackToContent href={state.contentPath} />
      </section>
    )
  }
  if (state.notFound) {
    return (
      <section data-content-page aria-label={state.label}>
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <FoundationIcon name="overview" decorative />
            </EmptyMedia>
            <EmptyTitle>No encontramos esta versión</EmptyTitle>
            <EmptyDescription>
              No existe o no es de {state.organizationName}. Solo se leen las versiones de tu
              organización.
            </EmptyDescription>
          </EmptyHeader>
          <BackToContent href={state.contentPath} />
        </Empty>
      </section>
    )
  }
  if (state.failed) {
    return (
      <section data-content-page aria-label={state.label}>
        <Alert variant="danger" live="polite">
          <AlertTitle>No pudimos abrir la versión</AlertTitle>
          <AlertDescription>
            La conexión falló de forma temporal. Nada se muestra hasta comprobarlo de nuevo.
          </AlertDescription>
          <AlertAction>
            <Button variant="outline" onClick={state.retry}>
              Reintentar
            </Button>
          </AlertAction>
        </Alert>
      </section>
    )
  }
  if (state.pending) {
    return (
      <section data-content-page aria-label={state.label}>
        <div data-content-catalog-state>
          <Spinner label="Abriendo la versión" />
          <p>Abriendo la versión…</p>
        </div>
      </section>
    )
  }
  return null
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

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('es-CO', { dateStyle: 'medium' }).format(new Date(value))
}
