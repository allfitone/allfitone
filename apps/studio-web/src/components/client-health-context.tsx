'use client'

/**
 * `HU-STUDIO-053`. The pains, limitations and recoveries a client declared,
 * read by the coach who attends her so he does not prescribe something that
 * hurts her.
 *
 * Four rules, and the module beside it (`client-health-context.ts`) keeps the
 * three that are about words and order.
 *
 * **It needs the most restrictive of the four permissions** (criterion 1), and
 * without it nothing of hers is drawn, not even empty: a refusal says so once.
 *
 * **Only what she declared exists** (criteria 2 and 3). The header says, before
 * anything is read, that no clinical history, diagnosis or test can arrive — not
 * because the screen filters, but because Allfit keeps none to share.
 *
 * **What no longer holds is shown too**, sorted after what holds, because an
 * injury last month is something a coach needs to know.
 *
 * **Every arrival is a read she sees.** The pages are asked once and never
 * again on their own — see `clientHealthContextQueryOptions`.
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
import { useInfiniteQuery } from '@tanstack/react-query'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useState } from 'react'

import { useOrganizationContext } from './organization-context'
import { WorkspacePageHeader } from './workspace-page-header'
import { clientCardPath } from '@/lib/client-card'
import {
  claimHeading,
  claimOriginLine,
  claimPeriodLine,
  healthSections,
  healthVersionLine,
} from '@/lib/client-health-context'
import type { ClientHealthContextClaim } from '@/lib/studio-api'
import {
  clientHealthContextQueryOptions,
  flattenById,
  isStudioForbidden,
  isStudioNotFound,
} from '@/lib/studio-query'

const PAGE_SIZE = 20

export function ClientHealthContextScreen() {
  const { current } = useOrganizationContext()
  const params = useParams<{ personId: string }>()
  const query = useInfiniteQuery(
    clientHealthContextQueryOptions(current.organization_id, params.personId, PAGE_SIZE),
  )
  // Read once: which section a claim falls in must not move while she reads it.
  const [now] = useState(() => new Date())
  const cardPath = clientCardPath(current.organization_id, params.personId)
  const directoryPath = `/organizations/${current.organization_id}/clients`

  if (query.isPending) return <LoadingState />
  // This operation lists `403` only as `scope-required`, so the status says which.
  if (isStudioForbidden(query.error)) return <ScopeRequiredState cardPath={cardPath} />
  if (isStudioNotFound(query.error)) return <UnreachableState directoryPath={directoryPath} />
  const first = query.data?.pages[0]
  if (!query.data || !first) return <FailureState onRetry={() => void query.refetch()} />

  const claims = flattenById(query.data)
  const sections = healthSections(claims, now)

  return (
    <div data-client-health-screen>
      <WorkspacePageHeader
        description="Los dolores, limitaciones y recuperaciones que declaró. Allfit no guarda historia clínica, diagnósticos, exámenes ni documentos médicos, así que nada de eso puede llegar aquí."
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

      <Card data-client-health-panel>
        <CardHeader>
          <CardTitle role="heading" aria-level={2}>
            Lo que declaró
          </CardTitle>
          <CardDescription>
            {healthVersionLine(first.applied_scope.version)}. Un dato que esa versión no incluye no
            aparece.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {sections.length === 0 ? (
            <Empty data-client-health-nothing>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <FoundationIcon name="person" decorative />
                </EmptyMedia>
                <EmptyTitle>No hay nada de su contexto de salud que podamos mostrarte</EmptyTitle>
                {/* Both readings, and no choosing between them: the answer is
                    the same whether she declared nothing or the version this
                    gym holds leaves it out. */}
                <EmptyDescription>
                  Puede ser que no haya declarado nada, o que la versión del permiso que tienes no
                  lo incluya. Desde aquí no se puede distinguir, y no vamos a suponerlo.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <div data-client-health-section-list>
              {sections.map((section) => (
                <section key={section.key} data-client-health-section={section.key}>
                  <h3 data-client-health-section-name>{section.title}</h3>
                  <ul data-client-health-claims>
                    {section.claims.map((claim) => (
                      <li key={claim.id}>
                        <HealthClaim claim={claim} now={now} />
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          )}

          {query.isFetchNextPageError ? (
            <Alert variant="danger" live="polite" data-client-health-more-failure>
              <AlertTitle>No pudimos cargar más</AlertTitle>
              <AlertDescription>La conexión falló de forma temporal.</AlertDescription>
              <AlertAction>
                <Button size="sm" variant="outline" onClick={() => void query.fetchNextPage()}>
                  Reintentar
                </Button>
              </AlertAction>
            </Alert>
          ) : query.hasNextPage ? (
            <div data-client-health-more>
              <Button
                size="sm"
                variant="outline"
                disabled={query.isFetchingNextPage}
                onClick={() => void query.fetchNextPage()}
              >
                {query.isFetchingNextPage ? 'Cargando…' : 'Ver más'}
              </Button>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  )
}

/**
 * Its type and area, her words, and when and from whom. A field the version
 * withholds is left out of its line rather than described.
 */
function HealthClaim({ claim, now }: { claim: ClientHealthContextClaim; now: Date }) {
  const origin = claimOriginLine(claim)
  const period = claimPeriodLine(claim, now)
  return (
    <article data-client-health-claim>
      <strong data-client-health-claim-heading>{claimHeading(claim)}</strong>
      {claim.description ? <p data-client-health-claim-description>{claim.description}</p> : null}
      <p data-client-health-claim-meta>{origin ? `${period} · ${origin}` : period}</p>
    </article>
  )
}

function LoadingState() {
  return (
    <div data-client-health-screen data-client-health-loading>
      <Skeleton data-client-health-header-placeholder />
      <Skeleton data-client-health-panel-placeholder />
    </div>
  )
}

/**
 * Criterion 1: without the health permission in force, nothing. No retry —
 * pressing it again would refuse again, and each attempt is recorded for her.
 */
function ScopeRequiredState({ cardPath }: { cardPath: string }) {
  return (
    <div data-client-health-screen>
      <Alert variant="warning" live="polite" data-client-health-scope-required>
        <AlertTitle>No te autorizó su contexto de salud</AlertTitle>
        <AlertDescription>
          Hace falta el permiso de contexto de salud vigente, el más restrictivo de los cuatro, y
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
    <div data-client-health-screen>
      <Empty data-client-health-unreachable>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <FoundationIcon name="person" decorative />
          </EmptyMedia>
          <EmptyTitle>No encontramos este contexto de salud</EmptyTitle>
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
    <div data-client-health-screen>
      <Alert variant="danger" live="polite" data-client-health-failure>
        <AlertTitle>No pudimos cargar su contexto de salud</AlertTitle>
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
