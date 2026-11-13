'use client'

/**
 * Reading what a person had shared until the relationship ended, through an
 * open case: `HU-STUDIO-062`.
 *
 * The screen is shaped by what it must not do. It writes nothing, corrects
 * nothing, observes nothing and exports nothing (criterion 3): there is no
 * control here but «Ver más» and the way back. It reaches only the relationship
 * the case names (criterion 4): no list of former clients, no search.
 *
 * **What is missing is not explained** (criterion 8). A section exists only for
 * a frozen category with a historical read, and inside one, a read that found
 * nothing and a read refused with `scope-required` say the same line. The
 * guide's word for it: what is not there is not there, and the screen does not
 * say why. Its rules are in `@/lib/historical-reading`.
 *
 * **Every read is recorded, with the case** (criterion 5), before it answers; a
 * failed record answers nothing, which reaches this screen as an ordinary
 * failure. Each read also needs a sign-in less than ten minutes old, so a «Ver
 * más» pressed later can ask to sign in again, and coming back lands here.
 *
 * **Duplicated on purpose.** The sessions reuse the words of the live client
 * screen (`@/lib/client-executions`); the measurements and goals have no live
 * screen in Studio yet, so they are written here and should converge with it
 * when it exists.
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
import { Skeleton } from '@allfitone/react/components/skeleton'
import { Spinner } from '@allfitone/react/components/spinner'
import { useInfiniteQuery, useQuery, type InfiniteData } from '@tanstack/react-query'
import Link from 'next/link'
import { useParams, useSearchParams } from 'next/navigation'
import type { ReactNode } from 'react'

import { useOrganizationContext } from './organization-context'
import { WorkspacePageHeader } from './workspace-page-header'
import { executionLength, executionWhen, levelLabel, originLabel } from '@/lib/client-executions'
import { caseWindowLine, memberName, purposeLabel } from '@/lib/historical-access'
import {
  cutLine,
  decisionLine,
  goalStatusLabel,
  historicalSections,
  measuredOnLine,
  measurementLine,
  metricLabel,
  readFailure,
  targetLine,
  type HistoricalSection,
  type ReadFailure,
} from '@/lib/historical-reading'
import { reauthenticationUrl, rememberReturn } from '@/lib/historical-return'
import { readerTimeZone } from '@/lib/reader-zone'
import {
  StudioApiError,
  studioApi,
  type ClientBodyProgressRecord,
  type FrozenExecutionSummary,
  type FrozenNutritionGoalVersion,
} from '@/lib/studio-api'
import {
  flattenById,
  frozenBodyProgressQueryOptions,
  frozenExecutionsQueryOptions,
  frozenGoalVersionsQueryOptions,
  historicalRelationshipQueryOptions,
} from '@/lib/studio-query'

const PAGE_SIZE = 25
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

interface Target {
  organizationId: string
  relationshipId: string
  caseId: string
  /** This page, to come back to after signing in again. */
  path: string
}

function failureOf(error: unknown): ReadFailure {
  return error instanceof StudioApiError
    ? readFailure(error.status, error.code)
    : readFailure(0, 'network')
}

function signInAgain(path: string) {
  rememberReturn(path, Date.now())
  window.location.assign(reauthenticationUrl(studioApi.apiUrl))
}

export function HistoricalCaseReading() {
  const { current } = useOrganizationContext()
  const params = useParams<{ caseId: string }>()
  const relationshipId = useSearchParams().get('relationship') ?? ''
  const organizationId = current.organization_id
  const casesPath = `/organizations/${organizationId}/historical-access-cases`
  const valid = UUID.test(relationshipId) && UUID.test(params.caseId)
  const target: Target = {
    organizationId,
    relationshipId,
    caseId: params.caseId,
    path: `${casesPath}/${params.caseId}?relationship=${relationshipId}`,
  }
  const query = useQuery({
    ...historicalRelationshipQueryOptions(organizationId, relationshipId, params.caseId),
    enabled: valid,
  })

  if (!valid) return <GoneState casesPath={casesPath} />
  if (query.isPending) return <LoadingState />
  if (!query.data) {
    const failure = failureOf(query.error)
    if (failure === 'reauthenticate') {
      return (
        <section data-historical-reading aria-label="Historial congelado">
          <ReauthenticateAlert path={target.path} />
        </section>
      )
    }
    if (failure === 'retry') return <FailureState onRetry={() => void query.refetch()} />
    return <GoneState casesPath={casesPath} />
  }

  const { relationship, case: entry, scopes } = query.data
  const name = memberName(relationship.person)

  return (
    <section data-historical-reading aria-label="Historial congelado">
      <WorkspacePageHeader
        description={`Lo que ${name} nos había compartido hasta el día en que terminó la relación. Solo se puede leer: desde aquí no se registra, no se corrige, no se observa y no se exporta nada.`}
        actions={
          <Link
            href={casesPath}
            data-slot="button"
            data-variant="outline"
            className={buttonVariants({ variant: 'outline', size: 'sm' })}
          >
            Volver a los casos
          </Link>
        }
      />

      <Card data-historical-reading-case>
        <CardHeader>
          <CardTitle role="heading" aria-level={2}>
            {name}
          </CardTitle>
          {/* Criterion 1: the history stops here. */}
          <CardDescription data-historical-reading-cut>
            {cutLine(relationship.ended_at)}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <dl data-historical-case-facts>
            <dt>Propósito</dt>
            <dd>{purposeLabel(entry.purpose)}</dd>
            <dt>Referencia</dt>
            <dd>{entry.case_reference}</dd>
            <dt>Justificación</dt>
            <dd>{entry.justification}</dd>
            <dt>Plazo</dt>
            <dd>{caseWindowLine(entry)}</dd>
          </dl>
          {/* Criterion 5. */}
          <p data-historical-reading-record>
            Nada posterior al corte existe para este caso. Cada consulta queda registrada con este
            caso, y si el registro falla no se muestra nada.
          </p>
        </CardContent>
      </Card>

      {historicalSections(scopes).map((section) => (
        <FrozenSection key={section} section={section} target={target} />
      ))}
    </section>
  )
}

function FrozenSection({ section, target }: { section: HistoricalSection; target: Target }) {
  if (section === 'sessions') return <FrozenSessions target={target} />
  if (section === 'body') return <FrozenMeasurements target={target} />
  return <FrozenGoals target={target} />
}

const TITLES: Record<HistoricalSection, string> = {
  sessions: 'Sesiones',
  body: 'Progreso corporal',
  nutrition: 'Objetivos de nutrición',
}

/** The frame every section shares, and the one place its states are decided. */
function SectionFrame<T extends { id: string }>({
  section,
  target,
  query,
  render,
}: {
  section: HistoricalSection
  target: Target
  query: {
    isPending: boolean
    error: unknown
    data: InfiniteData<{ data: T[] }, unknown> | undefined
    hasNextPage: boolean
    isFetchingNextPage: boolean
    isFetchNextPageError: boolean
    fetchNextPage: () => unknown
    refetch: () => unknown
  }
  render: (item: T) => ReactNode
}) {
  const items = flattenById(query.data)
  const failure = query.error ? failureOf(query.error) : null

  return (
    <Card data-historical-reading-section={section}>
      <CardHeader>
        <CardTitle role="heading" aria-level={2}>
          {TITLES[section]}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {query.isPending ? (
          <Skeleton data-historical-reading-placeholder />
        ) : items.length > 0 ? (
          <ul data-historical-entries>
            {items.map((item) => (
              <li key={item.id}>{render(item)}</li>
            ))}
          </ul>
        ) : failure === null || failure === 'nothing' ? (
          // Criterion 8: found nothing and refused read the same.
          <p data-historical-reading-nothing>No hay registros que este caso deje ver.</p>
        ) : null}

        {failure === 'reauthenticate' ? <ReauthenticateAlert path={target.path} /> : null}
        {failure === 'gone' ? <GoneAlert /> : null}
        {failure === 'retry' ? (
          <Alert variant="danger" live="polite" data-historical-reading-section-failure>
            <AlertTitle>No pudimos cargar esta sección</AlertTitle>
            <AlertDescription>La conexión falló de forma temporal.</AlertDescription>
            <AlertAction>
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  void (query.isFetchNextPageError ? query.fetchNextPage() : query.refetch())
                }
              >
                Reintentar
              </Button>
            </AlertAction>
          </Alert>
        ) : null}

        {failure === null && query.hasNextPage ? (
          <div data-historical-entries-more>
            <Button
              size="sm"
              variant="outline"
              disabled={query.isFetchingNextPage}
              onClick={() => void query.fetchNextPage()}
            >
              {query.isFetchingNextPage ? <Spinner label="Cargando más" /> : null}
              {query.isFetchingNextPage ? 'Cargando…' : 'Ver más'}
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}

function FrozenSessions({ target }: { target: Target }) {
  const query = useInfiniteQuery(
    frozenExecutionsQueryOptions(
      target.organizationId,
      target.relationshipId,
      target.caseId,
      PAGE_SIZE,
    ),
  )
  const reader = readerTimeZone()
  return (
    <SectionFrame<FrozenExecutionSummary>
      section="sessions"
      target={target}
      query={query}
      render={(session) => <SessionEntry session={session} reader={reader} />}
    />
  )
}

function SessionEntry({
  session,
  reader,
}: {
  session: FrozenExecutionSummary
  reader: string | null
}) {
  const when = executionWhen(session, reader)
  const length = executionLength(session)
  const level = levelLabel(session.achieved_level)
  return (
    <article data-historical-entry>
      <div data-historical-entry-head>
        <strong data-historical-entry-title>{when.line}</strong>
        <Badge variant={session.origin === 'relationship' ? 'success' : 'secondary'}>
          {originLabel(session.origin)}
        </Badge>
      </div>
      <p data-historical-entry-line>{session.activity_type_name}</p>
      {length || level || when.zone ? (
        <dl data-historical-case-facts>
          {length ? (
            <>
              <dt>Duración</dt>
              <dd>{length}</dd>
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
      ) : null}
    </article>
  )
}

function FrozenMeasurements({ target }: { target: Target }) {
  const query = useInfiniteQuery(
    frozenBodyProgressQueryOptions(
      target.organizationId,
      target.relationshipId,
      target.caseId,
      PAGE_SIZE,
    ),
  )
  return (
    <SectionFrame<ClientBodyProgressRecord>
      section="body"
      target={target}
      query={query}
      render={(record) => <MeasurementEntry record={record} />}
    />
  )
}

function MeasurementEntry({ record }: { record: ClientBodyProgressRecord }) {
  const value = measurementLine(record)
  return (
    <article data-historical-entry>
      <div data-historical-entry-head>
        <strong data-historical-entry-title>{metricLabel(record.metric_code)}</strong>
      </div>
      {value ? <p data-historical-entry-line>{value}</p> : null}
      <dl data-historical-case-facts>
        <dt>Fecha</dt>
        <dd>{measuredOnLine(record.measured_on)}</dd>
      </dl>
    </article>
  )
}

function FrozenGoals({ target }: { target: Target }) {
  const query = useInfiniteQuery(
    frozenGoalVersionsQueryOptions(
      target.organizationId,
      target.relationshipId,
      target.caseId,
      PAGE_SIZE,
    ),
  )
  return (
    <SectionFrame<FrozenNutritionGoalVersion>
      section="nutrition"
      target={target}
      query={query}
      render={(goal) => <GoalEntry goal={goal} />}
    />
  )
}

function GoalEntry({ goal }: { goal: FrozenNutritionGoalVersion }) {
  const status = goalStatusLabel(goal.status_at_cut)
  const targets = goal.targets.flatMap((target) => {
    const line = targetLine(target)
    return line ? [line] : []
  })
  const decision = decisionLine(goal.decision)
  const proposed = new Intl.DateTimeFormat('es-CO', { dateStyle: 'medium' }).format(
    new Date(goal.created_at),
  )
  return (
    <article data-historical-entry>
      <div data-historical-entry-head>
        <strong data-historical-entry-title>Propuesto el {proposed}</strong>
        {status ? <Badge variant="secondary">{status}</Badge> : null}
      </div>
      {goal.rationale ? <p data-historical-entry-line>{goal.rationale}</p> : null}
      {targets.length > 0 ? (
        <ul data-historical-goal-targets>
          {targets.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      ) : null}
      {decision ? <p data-historical-entry-line>{decision}</p> : null}
    </article>
  )
}

function ReauthenticateAlert({ path }: { path: string }) {
  return (
    <Alert variant="warning" live="assertive" data-historical-reading-reauthenticate>
      <AlertTitle>Vuelve a iniciar sesión para consultar</AlertTitle>
      <AlertDescription>
        Cada consulta del historial exige haber iniciado sesión hace menos de diez minutos. Al
        volver, sigues en este caso.
      </AlertDescription>
      <AlertAction>
        <Button size="sm" onClick={() => signInAgain(path)}>
          Iniciar sesión de nuevo
        </Button>
      </AlertAction>
    </Alert>
  )
}

function GoneAlert() {
  return (
    <Alert variant="warning" live="polite" data-historical-reading-gone>
      <AlertTitle>Este caso ya no deja consultar nada</AlertTitle>
      <AlertDescription>
        Un caso deja de servir cuando vence, cuando se cierra o cuando la persona retira el permiso,
        y solo sirve a quien autoriza.
      </AlertDescription>
    </Alert>
  )
}

/**
 * A case that is closed, expired, revoked, not this member's or not there at all:
 * the read answers 404 for every one, and so does this.
 */
function GoneState({ casesPath }: { casesPath: string }) {
  return (
    <section data-historical-reading aria-label="Historial congelado">
      <GoneAlert />
      <Link
        href={casesPath}
        data-slot="button"
        data-variant="outline"
        className={buttonVariants({ variant: 'outline', size: 'sm' })}
      >
        Volver a los casos
      </Link>
    </section>
  )
}

function LoadingState() {
  return (
    <section data-historical-reading aria-label="Historial congelado">
      <Skeleton data-historical-reading-header-placeholder />
      <Skeleton data-historical-reading-placeholder />
    </section>
  )
}

function FailureState({ onRetry }: { onRetry: () => void }) {
  return (
    <section data-historical-reading aria-label="Historial congelado">
      <Alert variant="danger" live="polite" data-historical-reading-failure>
        <AlertTitle>No pudimos abrir el historial</AlertTitle>
        <AlertDescription>
          La conexión falló de forma temporal, o no se pudo registrar la consulta. Sin registro no
          se muestra nada.
        </AlertDescription>
        <AlertAction>
          <Button size="sm" variant="outline" onClick={onRetry}>
            Reintentar
          </Button>
        </AlertAction>
      </Alert>
    </section>
  )
}
