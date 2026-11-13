'use client'

/**
 * `HU-STUDIO-047`. The programs this relationship gave a person, newest first,
 * each with the calendar that was planted for it.
 *
 * **The filtering is the operation's, not the screen's.** The story's first two
 * criteria — only what this relationship originated, never what she took on her
 * own nor what another gym gave her — are true because the operation is keyed by
 * the relationship. Nothing here filters anything, and nothing here should: a
 * client-side filter over a wider answer would be a second rule to keep in step
 * with the first, and the one on the server is the one that is enforced.
 *
 * **This is why the screen reads her card first.** It is the only one of the
 * card's four doors keyed by the relationship rather than by the person, and the
 * relationship's id is in the card. The contract says opening a card «reads none
 * of her data and writes no access event», so that first read costs a round trip
 * and nothing else — the assignments read is the only one she will see recorded,
 * which is the story's fourth criterion.
 *
 * **Criterion 3 needs no code.** Once the relationship ends there is neither
 * grant nor relationship, so the detached program and its later sessions stop
 * being answered at all. A former coach gets the card's `former` answer here and
 * is told that, instead of firing a read that would only be refused.
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@allfitone/react/components/table'
import { FoundationIcon } from '@allfitone/react/icons'
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query'
import Link from 'next/link'
import { useParams } from 'next/navigation'

import { ClientProgramAssignment } from './client-program-assignment'
import { useOrganizationContext } from './organization-context'
import { WorkspacePageHeader } from './workspace-page-header'
import { formatCalendarDay } from '@/lib/calendar-day'
import { clientCardPath } from '@/lib/client-card'
import {
  assignPermission,
  assignPermissionNote,
  plantedZone,
} from '@/lib/client-program-assignment'
import {
  adjustmentsLine,
  assignmentIsRunning,
  assignmentStatusLabel,
  growsForever,
  managedLine,
  progressLine,
  sessionStatusLabel,
  spanLine,
  versionLine,
} from '@/lib/client-programs'
import {
  StudioApiError,
  type RelationshipAssignment,
  type RelationshipAssignmentSession,
} from '@/lib/studio-api'
import { readerTimeZone } from '@/lib/reader-zone'
import {
  clientCardQueryOptions,
  flattenAssignmentPages,
  isStudioForbidden,
  isStudioNotFound,
  relationshipAssignmentsQueryOptions,
} from '@/lib/studio-query'
import { useCompactTable } from '@/lib/use-compact-table'

/*
 * Ten, where the contract's own default is twenty-five: every row here carries
 * a whole calendar, so a page of twenty-five programs would be several hundred
 * session rows arriving at once.
 */
const PAGE_SIZE = 10

export function ClientProgramsScreen() {
  const { current } = useOrganizationContext()
  const params = useParams<{ personId: string }>()
  const queryClient = useQueryClient()
  const organizationId = current.organization_id
  const cardPath = clientCardPath(organizationId, params.personId)
  const directoryPath = `/organizations/${organizationId}/clients`

  const cardQuery = useQuery(clientCardQueryOptions(organizationId, params.personId))
  const card = cardQuery.data
  const relationshipId = card?.kind === 'attending' ? card.relationship.id : undefined

  const options = relationshipAssignmentsQueryOptions(
    organizationId,
    /* Never sent: the query does not run until the card has answered one. */
    relationshipId ?? '',
    PAGE_SIZE,
  )
  const query = useInfiniteQuery({ ...options, enabled: relationshipId !== undefined })

  if (cardQuery.isPending) return <LoadingState />
  if (isStudioNotFound(cardQuery.error)) return <UnreachableState directoryPath={directoryPath} />
  if (isStudioForbidden(cardQuery.error)) return <DeniedState />
  if (!card) return <FailureState onRetry={() => void cardQuery.refetch()} />
  if (card.kind === 'former') return <NoLongerHersState directoryPath={directoryPath} />

  if (query.isPending) return <LoadingState />
  if (isStudioForbidden(query.error)) return <ScopeRequiredState cardPath={cardPath} />
  if (isStudioNotFound(query.error)) return <UnreachableState directoryPath={directoryPath} />
  if (!query.data) return <FailureState onRetry={() => void query.refetch()} />

  const assignments = flattenAssignmentPages(query.data)
  /*
   * Criterion 1, decided before the server is asked: the level she granted is
   * on her card, so a coach who may only read is told which permission is
   * missing instead of being offered a button that would be refused.
   */
  const permission = assignPermission(card.sections)
  const her = plantedZone(assignments, readerTimeZone())
  /*
   * A cursor the server will not read again, which is what it answers when the
   * list moved under the reader. Starting over is the only honest recovery.
   */
  const staleCursor =
    query.isFetchNextPageError &&
    query.error instanceof StudioApiError &&
    query.error.status === 422

  return (
    <div data-client-programs-screen>
      <WorkspacePageHeader
        description={`Los programas que le asignamos a ${card.display_name} desde este vínculo, del más reciente al más antiguo. No aparecen los que ella se puso por su cuenta ni los que le dio otra organización.`}
        actions={
          <>
            <Link
              href={cardPath}
              data-slot="button"
              data-variant="outline"
              data-client-programs-card-link
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

      {assignments.length === 0 ? (
        <Empty data-client-programs-empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <FoundationIcon name="checklist" decorative />
            </EmptyMedia>
            <EmptyTitle>Todavía no le asignamos ningún programa</EmptyTitle>
            <EmptyDescription>
              Aquí van a aparecer los programas que le demos desde este vínculo, con la agenda que
              se le siembre a cada uno.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <>
          <ul data-client-programs-list>
            {assignments.map((assignment) => (
              <li key={assignment.id}>
                <AssignmentPanel assignment={assignment} />
              </li>
            ))}
          </ul>

          {staleCursor ? (
            <Alert variant="warning" live="polite" data-client-programs-stale-cursor>
              <AlertTitle>La lista cambió mientras la leías</AlertTitle>
              <AlertDescription>
                Entró o salió algún programa, así que el punto por donde seguíamos ya no vale.
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
            <div data-client-programs-more>
              <Button
                size="sm"
                variant="outline"
                disabled={query.isFetchingNextPage}
                onClick={() => void query.fetchNextPage()}
              >
                {query.isFetchingNextPage ? <Spinner label="Cargando más programas" /> : null}
                {query.isFetchingNextPage ? 'Cargando…' : 'Ver más'}
              </Button>
            </div>
          ) : null}
        </>
      )}

      {permission === 'granted' ? (
        <ClientProgramAssignment
          organizationId={organizationId}
          relationshipId={card.relationship.id}
          zone={her.zone}
          zoneIsHers={her.fromHer}
        />
      ) : (
        <Alert variant="warning" live="polite" data-client-programs-cannot-assign>
          <AlertTitle>No le puedes asignar un programa</AlertTitle>
          <AlertDescription>{assignPermissionNote(permission)}</AlertDescription>
        </Alert>
      )}
    </div>
  )
}

/**
 * One program: what it is, how it stands, and the calendar planted for it.
 *
 * The hook that decides between the table and the cards watches one register,
 * so it is instantiated here, inside the panel, rather than once for the screen.
 */
function AssignmentPanel({ assignment }: { assignment: RelationshipAssignment }) {
  const { compact, measuredRef } = useCompactTable<HTMLDivElement>()
  const sessions = assignment.sessions
  const span = spanLine(assignment)
  const adjustments = adjustmentsLine(assignment)
  const running = assignmentIsRunning(assignment.status)

  return (
    <Card data-client-program>
      <CardHeader>
        <div data-client-program-head>
          <CardTitle role="heading" aria-level={2} data-client-program-title>
            {assignment.program_version.title}
          </CardTitle>
          <Badge
            variant={running ? 'success' : 'secondary'}
            data-client-program-status
            data-status={assignment.status}
          >
            {assignmentStatusLabel(assignment.status)}
          </Badge>
        </div>
        <CardDescription>
          {versionLine(assignment)}
          {growsForever(assignment)
            ? ' · Sin fecha de final: la agenda crece una semana a la vez, a medida que ella llega.'
            : ' · La agenda quedó sembrada entera desde el día que se asignó.'}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <dl data-client-program-facts>
          <dt>Empieza</dt>
          <dd>{formatCalendarDay(assignment.starts_on)}</dd>

          <dt>Sesiones</dt>
          <dd data-client-program-progress>{progressLine(assignment)}</dd>

          {span ? (
            <>
              <dt>Agenda</dt>
              <dd>{span}</dd>
            </>
          ) : null}

          <dt>Administración</dt>
          <dd data-client-program-managed>{managedLine(assignment)}</dd>

          {/* What was adjusted is deliberately not said: see `client-programs.ts`. */}
          {adjustments ? (
            <>
              <dt>Ajustes</dt>
              <dd data-client-program-adjustments>{adjustments}</dd>
            </>
          ) : null}
        </dl>

        {sessions.length === 0 ? (
          <p data-client-program-no-sessions>
            Todavía no hay sesiones sembradas para este programa.
          </p>
        ) : (
          <div ref={measuredRef} data-client-program-calendar>
            {compact ? (
              <ul data-client-program-session-cards>
                {sessions.map((session) => (
                  <li key={session.id}>
                    <SessionCard session={session} />
                  </li>
                ))}
              </ul>
            ) : (
              <Table
                aria-label={`Agenda de ${assignment.program_version.title}`}
                scrollAreaLabel={`Tabla de la agenda de ${assignment.program_version.title}`}
                data-studio-register="client-program-sessions"
              >
                <colgroup>
                  <col />
                  <col />
                  <col />
                </colgroup>
                <TableHeader>
                  <TableRow>
                    <TableHead>Día</TableHead>
                    <TableHead>Sesión</TableHead>
                    <TableHead>Estado</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sessions.map((session) => (
                    <TableRow key={session.id} data-client-program-session>
                      <TableCell data-client-program-session-day>
                        {formatCalendarDay(session.scheduled_on)}
                      </TableCell>
                      <TableCell>
                        {/* The title is its own element rather than the cell's
                            text: the cell inherits `nowrap`, and only something
                            inside it can be told to wrap — and be measured. */}
                        <span data-client-program-session-title>{session.title}</span>
                      </TableCell>
                      <TableCell>
                        <SessionState session={session} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function SessionCard({ session }: { session: RelationshipAssignmentSession }) {
  return (
    <article data-client-program-session>
      <div data-client-program-session-head>
        <strong data-client-program-session-day>{formatCalendarDay(session.scheduled_on)}</strong>
        <SessionState session={session} />
      </div>
      <p data-client-program-session-title>{session.title}</p>
    </article>
  )
}

/**
 * What state a planted session is in, and whether she already started it.
 *
 * «Empezada» is said beside the state rather than instead of it: a session she
 * started is still a scheduled one, and the contract gives the fact its own
 * field precisely because it is what stops the session from being moved.
 */
function SessionState({ session }: { session: RelationshipAssignmentSession }) {
  const done = session.status === 'completed'
  const stopped = session.status === 'cancelled'
  return (
    <span data-client-program-session-state>
      <Badge
        variant={done ? 'success' : stopped ? 'secondary' : 'outline'}
        data-status={session.status}
      >
        {sessionStatusLabel(session.status)}
      </Badge>
      {session.started && !done ? (
        <span data-client-program-session-started>Ya la empezó</span>
      ) : null}
    </span>
  )
}

function LoadingState() {
  return (
    <div data-client-programs-screen data-client-programs-loading>
      <Skeleton data-client-programs-header-placeholder />
      <Skeleton data-client-programs-panel-placeholder />
    </div>
  )
}

/**
 * Absent, or not this caller's to read — the card answers the same for both, and
 * so does this.
 */
function UnreachableState({ directoryPath }: { directoryPath: string }) {
  return (
    <div data-client-programs-screen>
      <Empty data-client-programs-unreachable>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <FoundationIcon name="person" decorative />
          </EmptyMedia>
          <EmptyTitle>No encontramos estos programas</EmptyTitle>
          <EmptyDescription>
            Los programas de una persona solo los abre quien la atiende. Vuelve a clientes para
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
 * The story's third criterion, answered before it is asked. The relationship
 * ended, so the detached program and its later sessions are no longer anybody's
 * here to read — and asking for them would only produce a refusal.
 */
function NoLongerHersState({ directoryPath }: { directoryPath: string }) {
  return (
    <div data-client-programs-screen>
      <Empty data-client-programs-no-longer-hers>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <FoundationIcon name="person" decorative />
          </EmptyMedia>
          <EmptyTitle>Ya no la atiendes</EmptyTitle>
          <EmptyDescription>
            Cuando el vínculo termina, sus programas dejan de verse desde aquí, incluidas las
            sesiones que vengan después. No es un fallo de la aplicación.
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
 * The operation lists `403` only as `scope-required`, so the status alone says
 * which refusal it is. No retry: pressing again would refuse again, and every
 * attempt is recorded for her to read.
 */
function ScopeRequiredState({ cardPath }: { cardPath: string }) {
  return (
    <div data-client-programs-screen>
      <Alert variant="warning" live="polite" data-client-programs-scope-required>
        <AlertTitle>No te autorizó su entrenamiento</AlertTitle>
        <AlertDescription>
          Hace falta el permiso de entrenamiento vigente, y hoy no lo hay — así que no se muestra
          ningún programa suyo, ni siquiera vacío. El intento queda registrado y ella puede verlo.
          En su ficha está qué categorías sí te autorizó.
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

/**
 * The card's plain `403`, which is not about her: it is this membership no
 * longer being able to read anything here. A denial, so no retry.
 */
function DeniedState() {
  return (
    <div data-client-programs-screen>
      <Alert variant="danger" live="polite" data-client-programs-denied>
        <AlertTitle>No puedes consultar programas de clientes</AlertTitle>
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
    <div data-client-programs-screen>
      <Alert variant="danger" live="polite" data-client-programs-failure>
        <AlertTitle>No pudimos cargar sus programas</AlertTitle>
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
