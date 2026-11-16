'use client'

/**
 * `HU-STUDIO-054`. What a client trained, as the coach who attends her may see
 * it: one list, newest first, mixing the sessions she did inside this
 * relationship with the ones she did on her own.
 *
 * Four rules, and three of them are about what the screen must not do.
 *
 * **It shows no total, and must never grow one.** The page carries a cursor and
 * `has_more`, and nothing else. A figure counted from what is on screen would be
 * false twice over: it is one page of many, and the story says a session she hid
 * must not appear as a difference in a total.
 *
 * **An empty list is two answers at once.** The function returns nothing both
 * when she has trained nothing and when she shares neither category — the
 * refusal is recorded, not returned. So the empty state offers both readings and
 * chooses neither.
 *
 * **It looks for no gaps.** A session she hid never reaches a page or a page
 * boundary: the row policy filters before the cursor is ever compared. There is
 * nothing missing to detect, and code that tried would be inventing it.
 *
 * **Each page is a read she sees.** Recorded in the same transaction that
 * answers it, under every category it used — so the screen asks on arrival and
 * when somebody presses for more, never on its own.
 */

import { Alert, AlertAction, AlertDescription, AlertTitle } from '@allfitone/react/components/alert'
import { Badge } from '@allfitone/react/components/badge'
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
import { Spinner } from '@allfitone/react/components/spinner'
import { FoundationIcon } from '@allfitone/react/icons'
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query'
import Link from 'next/link'
import { useParams } from 'next/navigation'

import { useOrganizationContext } from './organization-context'
import { WorkspacePageHeader } from './workspace-page-header'
import { clientCardPath, clientExecutionPath } from '@/lib/client-card'
import {
  executionLength,
  executionWhen,
  fulfilledOurPlan,
  levelLabel,
  originLabel,
} from '@/lib/client-executions'
import { readerTimeZone } from '@/lib/reader-zone'
import { StudioApiError, type AuthorizedExecutionSummary } from '@/lib/studio-api'
import {
  clientExecutionsQueryOptions,
  flattenExecutionPages,
  isStudioForbidden,
  isStudioNotFound,
} from '@/lib/studio-query'

/* The contract's own default. One screenful of sessions, and a cursor for more. */
const PAGE_SIZE = 25

export function ClientExecutionsScreen() {
  const { current } = useOrganizationContext()
  const params = useParams<{ personId: string }>()
  const queryClient = useQueryClient()
  const options = clientExecutionsQueryOptions(current.organization_id, params.personId, PAGE_SIZE)
  const query = useInfiniteQuery(options)
  const cardPath = clientCardPath(current.organization_id, params.personId)
  const directoryPath = `/organizations/${current.organization_id}/clients`
  /* Resolved once per render, not per row: it is the same browser all the way down. */
  const reader = readerTimeZone()

  if (query.isPending) return <LoadingState />
  if (isStudioNotFound(query.error)) return <UnreachableState directoryPath={directoryPath} />
  if (isStudioForbidden(query.error)) return <DeniedState />
  if (!query.data) return <FailureState onRetry={() => void query.refetch()} />

  const sessions = flattenExecutionPages(query.data)
  /*
   * A cursor the server will not read again, which is what it answers when the
   * list moved under the reader. Starting the list over is the only honest
   * recovery, and it is not a failure of the screen.
   */
  const staleCursor =
    query.isFetchNextPageError &&
    query.error instanceof StudioApiError &&
    query.error.status === 422

  return (
    <div data-client-executions-screen>
      <WorkspacePageHeader
        description="Lo que esta persona entrenó, de lo más reciente a lo más antiguo. Se mezcla lo que hizo con nosotros y lo que hizo por su cuenta, y cada sesión dice de cuál de las dos viene."
        actions={
          <>
            <Link
              href={cardPath}
              data-slot="button"
              data-variant="outline"
              data-client-executions-card-link
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

      <Card data-client-executions-list-panel>
        <CardHeader>
          <CardTitle role="heading" aria-level={2}>
            Sesiones ejecutadas
          </CardTitle>
          {/* No count, on purpose, and the reason said once: it is the same
              reason a hidden session leaves no trace. */}
          <CardDescription>
            Solo las sesiones terminadas. Esta pantalla no lleva totales: lo que una persona decidió
            no compartir no deja hueco ni resta de ninguna cuenta.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {sessions.length === 0 ? (
            <Empty data-client-executions-empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <FoundationIcon name="activity" decorative />
                </EmptyMedia>
                <EmptyTitle>No hay sesiones que podamos mostrarte</EmptyTitle>
                {/* Both readings, and no choosing: the operation answers an
                    empty page for either, and records the attempt. */}
                <EmptyDescription>
                  Puede ser que todavía no haya entrenado, o que no te haya autorizado ni su
                  entrenamiento con nosotros ni su historial anterior. Desde aquí no se puede
                  distinguir, y no vamos a suponerlo.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <>
              <ul data-client-executions-list>
                {sessions.map((session) => (
                  <li key={session.id}>
                    <ExecutionRow
                      session={session}
                      reader={reader}
                      href={clientExecutionPath(
                        current.organization_id,
                        params.personId,
                        session.id,
                      )}
                    />
                  </li>
                ))}
              </ul>

              {staleCursor ? (
                <Alert variant="warning" live="polite" data-client-executions-stale-cursor>
                  <AlertTitle>La lista cambió mientras la leías</AlertTitle>
                  <AlertDescription>
                    Entró o salió alguna sesión, así que el punto por donde seguíamos ya no vale.
                    Vuelve a empezar la lista para verla completa.
                  </AlertDescription>
                  <AlertAction>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        void queryClient.resetQueries({ queryKey: options.queryKey, exact: true })
                      }}
                    >
                      Empezar de nuevo
                    </Button>
                  </AlertAction>
                </Alert>
              ) : null}

              {!staleCursor && query.hasNextPage ? (
                <div data-client-executions-more>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={query.isFetchingNextPage}
                    onClick={() => void query.fetchNextPage()}
                  >
                    {query.isFetchingNextPage ? <Spinner label="Cargando más sesiones" /> : null}
                    {query.isFetchingNextPage ? 'Cargando…' : 'Ver más'}
                  </Button>
                </div>
              ) : null}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

/**
 * One session: when she trained it, what it was, and whose it was.
 *
 * The hour comes first because it is how a coach finds a session, and it is read
 * in the zone where she trained rather than the one the reader is sitting in.
 */
function ExecutionRow({
  session,
  reader,
  href,
}: {
  session: AuthorizedExecutionSummary
  reader: string | null
  /** Where the session opens in full: `HU-STUDIO-055`. */
  href: string
}) {
  const when = executionWhen(session, reader)
  const length = executionLength(session)
  const level = levelLabel(session.achieved_level)
  const ours = session.origin === 'relationship'
  return (
    <article data-client-execution>
      <div data-client-execution-head>
        {/* The row's lead is what opens it, so the clickable thing is the one
            that identifies the session. Until HU-055 no row led anywhere. */}
        <strong data-client-execution-when>
          <Link href={href} data-client-execution-open>
            {when.line}
          </Link>
        </strong>
        <Badge variant={ours ? 'success' : 'secondary'} data-client-execution-origin>
          {originLabel(session.origin)}
        </Badge>
      </div>
      <p data-client-execution-what>{session.activity_type_name}</p>
      <dl data-client-execution-facts>
        {length ? (
          <>
            <dt>Duración</dt>
            <dd>{length}</dd>
          </>
        ) : null}

        {/* Only a session of this relationship can carry one, so this never
            appears on something she did alone. */}
        {fulfilledOurPlan(session) ? (
          <>
            <dt>Programa</dt>
            <dd>Cumplió una sesión que le asignamos</dd>
          </>
        ) : null}

        {level ? (
          <>
            <dt>Registro</dt>
            <dd>{level}</dd>
          </>
        ) : null}

        {when.zone ? (
          <>
            <dt>Zona horaria</dt>
            <dd>{when.zone}</dd>
          </>
        ) : null}
      </dl>
    </article>
  )
}

function LoadingState() {
  return (
    <div data-client-executions-screen data-client-executions-loading>
      <Skeleton data-client-executions-header-placeholder />
      <Skeleton data-client-executions-panel-placeholder />
    </div>
  )
}

/**
 * Absent, or not this caller's to read — the operation answers the same for
 * both, and so does this.
 */
function UnreachableState({ directoryPath }: { directoryPath: string }) {
  return (
    <div data-client-executions-screen>
      <Empty data-client-executions-unreachable>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <FoundationIcon name="person" decorative />
          </EmptyMedia>
          <EmptyTitle>No encontramos estas sesiones</EmptyTitle>
          <EmptyDescription>
            Las sesiones de una persona solo las abre quien la atiende. Vuelve a clientes para
            elegir a alguien.
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

/**
 * The operation's plain `403`, which is not about her: it is this membership no
 * longer being able to read anything here. A denial, so no retry.
 */
function DeniedState() {
  return (
    <div data-client-executions-screen>
      <Alert variant="danger" live="polite" data-client-executions-denied>
        <AlertTitle>No puedes consultar sesiones de clientes</AlertTitle>
        <AlertDescription>
          Tu membresía en esta organización ya no lo permite. Puedes seguir trabajando en las demás
          secciones.
        </AlertDescription>
      </Alert>
    </div>
  )
}

function FailureState({ onRetry }: { onRetry: () => void }) {
  return (
    <div data-client-executions-screen>
      <Alert variant="danger" live="polite" data-client-executions-failure>
        <AlertTitle>No pudimos cargar sus sesiones</AlertTitle>
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
