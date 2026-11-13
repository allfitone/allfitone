'use client'

/**
 * `HU-STUDIO-052`. The measurements and photos a client shares with the coach
 * who attends her, so he can follow how her body changes.
 *
 * **Two reads, one screen.** `body_progress` names both on the card and the
 * card offers one door, so both are asked for here: her measurements and the
 * list of photos she chose to show this gym. Neither is asked for elsewhere.
 *
 * **Her gallery does not exist here** (criterion 2). The list holds only what
 * she showed this relationship, and only while her version includes photos —
 * never what she showed another gym, never one she took back.
 *
 * **A photo is asked for only when somebody opens it**, one at a time. Each
 * image is an access she reads, so there are no thumbnails and no prefetch:
 * opening a list of twenty must not write her twenty lines. The bytes come from
 * the API and live in memory while open, so there is never a link to reuse or
 * share (criterion 4) — see `authorized-photo.ts`.
 *
 * **No location or device metadata reaches the screen** (criterion 3): the API
 * keeps only the sanitised image, and the list carries a day and an instant.
 */

import { Alert, AlertAction, AlertDescription, AlertTitle } from '@allfitone/react/components/alert'
import { Button, buttonVariants } from '@allfitone/react/components/button'
import {
  Card,
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
import { Skeleton } from '@allfitone/react/components/skeleton'
import { FoundationIcon } from '@allfitone/react/icons'
import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { Fragment, useState } from 'react'

import { PhotoFrame } from './authorized-photo'
import { useOrganizationContext } from './organization-context'
import { WorkspacePageHeader } from './workspace-page-header'
import {
  measuredOnLine,
  measurementDays,
  metricLabel,
  photoSharedLine,
  photoTitle,
} from '@/lib/body-measurements'
import { clientCardPath } from '@/lib/client-card'
import type { ClientBodyPhoto } from '@/lib/studio-api'
import {
  clientBodyPhotoQueryOptions,
  clientBodyPhotosQueryOptions,
  clientBodyProgressQueryOptions,
  flattenById,
  isStudioForbidden,
  isStudioNotFound,
} from '@/lib/studio-query'

const MEASUREMENTS_PAGE = 30
const PHOTOS_PAGE = 12

export function ClientBodyProgressScreen() {
  const { current } = useOrganizationContext()
  const params = useParams<{ personId: string }>()
  const organizationId = current.organization_id
  const measurements = useInfiniteQuery(
    clientBodyProgressQueryOptions(organizationId, params.personId, MEASUREMENTS_PAGE),
  )
  const photos = useInfiniteQuery(
    clientBodyPhotosQueryOptions(organizationId, params.personId, PHOTOS_PAGE),
  )
  // One photo open at a time: opening another closes, and forgets, the first.
  const [openPhoto, setOpenPhoto] = useState<string | null>(null)
  const cardPath = clientCardPath(organizationId, params.personId)
  const directoryPath = `/organizations/${organizationId}/clients`

  if (measurements.isPending || photos.isPending) return <LoadingState />
  // Both reads belong to one category, so a refusal of either is the category's.
  if (isStudioForbidden(measurements.error) || isStudioForbidden(photos.error)) {
    return <ScopeRequiredState cardPath={cardPath} />
  }
  if (isStudioNotFound(measurements.error) || isStudioNotFound(photos.error)) {
    return <UnreachableState directoryPath={directoryPath} />
  }
  const first = measurements.data?.pages[0]
  if (!measurements.data || !first) {
    return <FailureState onRetry={() => void measurements.refetch()} />
  }

  const days = measurementDays(flattenById(measurements.data))
  const shown = flattenById(photos.data)
  const photosFailed = photos.isError && !photos.isFetchNextPageError
  const nothing = days.length === 0 && shown.length === 0 && !photosFailed

  return (
    <div data-client-body-screen>
      <WorkspacePageHeader
        description="Las medidas y las fotos que comparte contigo. Es un permiso aparte del de entrenamiento: tener uno no te da el otro."
        actions={
          <>
            <Link
              href={cardPath}
              data-slot="button"
              data-variant="outline"
              className={buttonVariants({ variant: 'outline', size: 'sm' })}
            >
              Volver a su ficha
            </Link>
            <Link
              href={directoryPath}
              data-slot="button"
              data-variant="outline"
              className={buttonVariants({ variant: 'outline', size: 'sm' })}
            >
              Volver a clientes
            </Link>
          </>
        }
      />

      {nothing ? (
        <Empty data-client-body-nothing>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <FoundationIcon name="person" decorative />
            </EmptyMedia>
            <EmptyTitle>No hay nada de su progreso corporal que podamos mostrarte</EmptyTitle>
            {/* Both readings, and no choosing between them. */}
            <EmptyDescription>
              Puede ser que no haya registrado medidas ni te haya mostrado fotos, o que la versión
              del permiso que tienes no las incluya. Desde aquí no se puede distinguir, y no vamos a
              suponerlo.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : null}

      {days.length > 0 ? (
        <Card data-client-body-measurements>
          <CardHeader>
            <CardTitle role="heading" aria-level={2}>
              Medidas
            </CardTitle>
            <CardDescription>
              Versión {String(first.applied_scope.version)} del permiso de progreso corporal. Un
              dato que esa versión no incluye no aparece.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div data-client-body-day-list>
              {days.map((day) => (
                <section key={day.day} data-client-body-day>
                  <h3 data-client-body-day-name>{measuredOnLine(day.day)}</h3>
                  <dl data-client-body-facts>
                    {day.rows.map((row) => (
                      <Fragment key={row.record.id}>
                        <dt>{metricLabel(row.record.metric_code)}</dt>
                        <dd data-client-body-measurement>{row.value}</dd>
                      </Fragment>
                    ))}
                  </dl>
                </section>
              ))}
            </div>
            <MoreControl query={measurements} label="Ver más medidas" />
          </CardContent>
        </Card>
      ) : null}

      {shown.length > 0 || photosFailed ? (
        <Card data-client-body-photos>
          <CardHeader>
            <CardTitle role="heading" aria-level={2}>
              Fotos
            </CardTitle>
            <CardDescription>
              Solo las que eligió mostrarle a este gimnasio, sin ubicación ni datos del teléfono.
              Cada foto se pide al abrirla, y cada vez que la abres queda registrado y ella lo puede
              ver.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {photosFailed ? (
              <Alert variant="danger" live="polite" data-client-body-photos-failure>
                <AlertTitle>No pudimos cargar sus fotos</AlertTitle>
                <AlertDescription>La conexión falló de forma temporal.</AlertDescription>
                <AlertAction>
                  <Button size="sm" variant="outline" onClick={() => void photos.refetch()}>
                    Reintentar
                  </Button>
                </AlertAction>
              </Alert>
            ) : (
              <ul data-client-body-photo-list>
                {shown.map((photo) => (
                  <li key={photo.id}>
                    <BodyPhotoEntry
                      photo={photo}
                      open={openPhoto === photo.id}
                      onToggle={() => setOpenPhoto(openPhoto === photo.id ? null : photo.id)}
                      organizationId={organizationId}
                      personId={params.personId}
                    />
                  </li>
                ))}
              </ul>
            )}
            <MoreControl query={photos} label="Ver más fotos" />
          </CardContent>
        </Card>
      ) : null}
    </div>
  )
}

function BodyPhotoEntry({
  photo,
  open,
  onToggle,
  organizationId,
  personId,
}: {
  photo: ClientBodyPhoto
  open: boolean
  onToggle: () => void
  organizationId: string
  personId: string
}) {
  const title = photoTitle(photo)
  return (
    <article data-client-body-photo>
      <div data-client-body-photo-head>
        <div data-client-body-photo-identity>
          <strong data-client-body-photo-title>{title}</strong>
          <span data-client-body-photo-shared>{photoSharedLine(photo)}</span>
        </div>
        <Button size="sm" variant="outline" aria-expanded={open} onClick={onToggle}>
          {open ? 'Ocultar la foto' : 'Ver la foto'}
        </Button>
      </div>
      {open ? (
        <BodyPhotoViewer
          organizationId={organizationId}
          personId={personId}
          photoId={photo.id}
          alt={title}
        />
      ) : null}
    </article>
  )
}

/** Mounted only while open: mounting it is the request, unmounting forgets it. */
function BodyPhotoViewer({
  organizationId,
  personId,
  photoId,
  alt,
}: {
  organizationId: string
  personId: string
  photoId: string
  alt: string
}) {
  const query = useQuery(clientBodyPhotoQueryOptions(organizationId, personId, photoId))
  return (
    <div data-client-body-photo-view>
      <PhotoFrame
        isPending={query.isPending}
        error={query.error}
        data={query.data}
        onRetry={() => void query.refetch()}
        alt={alt}
      />
    </div>
  )
}

/** The next page, only when asked: each page is a read recorded for her. */
function MoreControl({
  query,
  label,
}: {
  query: {
    hasNextPage: boolean
    isFetchingNextPage: boolean
    isFetchNextPageError: boolean
    fetchNextPage: () => unknown
  }
  label: string
}) {
  if (query.isFetchNextPageError) {
    return (
      <Alert variant="danger" live="polite" data-client-body-more-failure>
        <AlertTitle>No pudimos cargar más</AlertTitle>
        <AlertDescription>La conexión falló de forma temporal.</AlertDescription>
        <AlertAction>
          <Button size="sm" variant="outline" onClick={() => void query.fetchNextPage()}>
            Reintentar
          </Button>
        </AlertAction>
      </Alert>
    )
  }
  if (!query.hasNextPage) return null
  return (
    <div data-client-body-more>
      <Button
        size="sm"
        variant="outline"
        disabled={query.isFetchingNextPage}
        onClick={() => void query.fetchNextPage()}
      >
        {query.isFetchingNextPage ? 'Cargando…' : label}
      </Button>
    </div>
  )
}

function LoadingState() {
  return (
    <div data-client-body-screen data-client-body-loading>
      <Skeleton data-client-body-header-placeholder />
      <Skeleton data-client-body-panel-placeholder />
    </div>
  )
}

/**
 * Criterion 1: the body permission, which training does not grant. No retry —
 * pressing it again would refuse again, and each attempt is recorded for her.
 */
function ScopeRequiredState({ cardPath }: { cardPath: string }) {
  return (
    <div data-client-body-screen>
      <Alert variant="warning" live="polite" data-client-body-scope-required>
        <AlertTitle>No te autorizó su progreso corporal</AlertTitle>
        <AlertDescription>
          Hace falta el permiso de progreso corporal vigente, que es aparte del de entrenamiento, y
          hoy no lo hay: no se muestra nada suyo, ni siquiera en blanco. El intento queda registrado
          y ella puede verlo. En su ficha está qué categorías sí te autorizó.
        </AlertDescription>
        <AlertAction>
          <Link
            href={cardPath}
            data-slot="button"
            data-variant="outline"
            className={buttonVariants({ variant: 'outline', size: 'sm' })}
          >
            Ver su ficha
          </Link>
        </AlertAction>
      </Alert>
    </div>
  )
}

/** Absent, or not this caller's to read: the operation answers the same for both. */
function UnreachableState({ directoryPath }: { directoryPath: string }) {
  return (
    <div data-client-body-screen>
      <Empty data-client-body-unreachable>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <FoundationIcon name="person" decorative />
          </EmptyMedia>
          <EmptyTitle>No encontramos este progreso corporal</EmptyTitle>
          <EmptyDescription>
            Solo lo abre quien atiende a la persona. Vuelve a clientes para elegir a alguien.
          </EmptyDescription>
        </EmptyHeader>
        <Link
          href={directoryPath}
          data-slot="button"
          data-variant="outline"
          className={buttonVariants({ variant: 'outline', size: 'sm' })}
        >
          Volver a clientes
        </Link>
      </Empty>
    </div>
  )
}

function FailureState({ onRetry }: { onRetry: () => void }) {
  return (
    <div data-client-body-screen>
      <Alert variant="danger" live="polite" data-client-body-failure>
        <AlertTitle>No pudimos cargar su progreso corporal</AlertTitle>
        <AlertDescription>
          La conexión falló de forma temporal. Lo que te autorizó sigue igual.
        </AlertDescription>
        <AlertAction>
          <Button size="sm" variant="outline" onClick={onRetry}>
            Reintentar
          </Button>
        </AlertAction>
      </Alert>
    </div>
  )
}
