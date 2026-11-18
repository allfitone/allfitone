'use client'

/**
 * `HU-STUDIO-055`. One session a client shares with her coach, with what she
 * recorded in it: her sets, laps, intervals, rounds and holds, and what this
 * relationship's coaches noted on it.
 *
 * **Three rules, and all three are refusals to fill an absence.**
 *
 * **A family with no rows is drawn nowhere.** A session of running has no sets,
 * and an empty «Series» panel would say she recorded none — a claim about her
 * training rather than about the data. Only the families that recorded
 * something appear, and a session that recorded nothing says that once.
 *
 * **No value is replaced by «sin registrar».** Criterion 4 says a field she did
 * not share is indistinguishable from one she did not record, so a sentence
 * claiming the field exists and is empty is exactly the deduction it forbids.
 * A part that did not arrive is skipped.
 *
 * **One `404` covers six reasons** — hidden, unfinished, annulled, another
 * relationship's, another person's, or none at all — so the screen says the
 * same thing for all six and names none. Naming one would be a guess about her.
 *
 * What the screen never has to hide: heart rate, pain, body weight and the
 * capture device are not in the answer at all. Pain and weight are read through
 * their own categories, which is why their absence here is the contract and not
 * a gap.
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
import { FoundationIcon } from '@allfitone/react/icons'
import { useQuery } from '@tanstack/react-query'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import type { ReactNode } from 'react'

import { useOrganizationContext } from './organization-context'
import { WorkspacePageHeader } from './workspace-page-header'
import { clientCardPath, clientExecutionsPath } from '@/lib/client-card'
import {
  durationLine,
  enduranceLine,
  intervalLine,
  mobilityLine,
  observationAuthor,
  observationRevisionNote,
  observationsOldestFirst,
  recordedFamilies,
  recordedNothing,
  roundLine,
  segmentLabel,
  strengthLine,
  type ResultFamily,
} from '@/lib/client-execution-detail'
import { ClientCorrectionProposal } from './client-correction-proposal'
import { ClientObservationCorrection } from './client-observation-correction'
import { ClientObservationForm } from './client-observation-form'
import { canProposeCorrection } from '@/lib/client-correction-proposal'
import { observationCategories, observationCorrectable } from '@/lib/client-observation'
import { executionWhen, levelLabel, originLabel } from '@/lib/client-executions'
import { readerTimeZone } from '@/lib/reader-zone'
import type {
  AuthorizedExecution,
  ExecutionDetailStrengthSet,
  ProfessionalObservation,
  ProposedCorrection,
} from '@/lib/studio-api'
import {
  clientCardQueryOptions,
  clientExecutionQueryOptions,
  isStudioForbidden,
  isStudioNotFound,
  proposedCorrectionsQueryOptions,
} from '@/lib/studio-query'

export function ClientExecutionDetailScreen() {
  const { current } = useOrganizationContext()
  const params = useParams<{ personId: string; executionId: string }>()
  const organizationId = current.organization_id
  const query = useQuery(
    clientExecutionQueryOptions(organizationId, params.personId, params.executionId),
  )
  /*
   * Her card as well, for the two levels the observation form needs. It costs a
   * round trip and nothing else: `OP-REL-019` reads none of her data and writes
   * no access event, which is why a second read here is affordable.
   */
  const cardQuery = useQuery(clientCardQueryOptions(organizationId, params.personId))
  /*
   * The caller's own pending proposals, so a field that already waits on her is
   * not offered twice. `OP-EXE-020` holds none of her data and writes no access
   * record, and one page caps at a hundred — past that the 409 is what prevents
   * a duplicate, as it always was.
   */
  const proposalsQuery = useQuery(proposedCorrectionsQueryOptions(organizationId))
  const executionsPath = clientExecutionsPath(organizationId, params.personId)
  const cardPath = clientCardPath(organizationId, params.personId)

  if (query.isPending) return <LoadingState />
  if (isStudioForbidden(query.error)) return <ScopeRequiredState cardPath={cardPath} />
  if (isStudioNotFound(query.error)) return <UnreachableState executionsPath={executionsPath} />
  if (!query.data) return <FailureState onRetry={() => void query.refetch()} />

  const execution = query.data
  const when = executionWhen(execution, readerTimeZone())
  const families = recordedFamilies(execution)
  const observations = observationsOldestFirst(execution.observations)
  const card = cardQuery.data
  const offers =
    card && card.kind === 'attending' ? observationCategories(execution, card.sections) : []
  /*
   * Proposing needs only her training at the writing level — health context has
   * nothing to do with what she recorded — and it reaches a session she trained
   * on her own as well, so where the session came from is not a condition.
   */
  const mayPropose = card?.kind === 'attending' && canProposeCorrection(card.sections)
  const pendingProposals: readonly ProposedCorrection[] = proposalsQuery.data?.data ?? []

  return (
    <div data-client-execution-detail-screen>
      <WorkspacePageHeader
        description={`Lo que registró en esta sesión, comparado con nada más: es lo que ella guardó. ${when.line}.`}
        actions={
          <>
            <Link
              href={executionsPath}
              data-slot="button"
              data-variant="outline"
              data-client-execution-back
              className={buttonVariants({ variant: 'outline', size: 'sm' })}
            >
              Volver a sus sesiones
            </Link>
            <Link
              href={cardPath}
              data-slot="button"
              data-variant="outline"
              className={buttonVariants({ variant: 'outline', size: 'sm' })}
            >
              Volver a su ficha
            </Link>
          </>
        }
      />

      <Card data-client-execution-summary>
        <CardHeader>
          <div data-client-execution-summary-head>
            <CardTitle role="heading" aria-level={2}>
              {execution.activity_type_name}
            </CardTitle>
            <Badge
              variant={execution.origin === 'relationship' ? 'success' : 'secondary'}
              data-client-execution-origin
            >
              {originLabel(execution.origin)}
            </Badge>
          </div>
          {/* What the answer never carries, said once so nobody looks for it. */}
          <CardDescription>
            Series, cargas y repeticiones como ella las registró. El dolor y el peso corporal se
            leen por sus propias categorías, y la frecuencia cardiaca y los datos de dispositivos no
            se muestran en esta versión.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <dl data-client-execution-facts>
            <dt>Cuándo</dt>
            <dd>{when.line}</dd>

            {when.zone ? (
              <>
                <dt>Zona horaria</dt>
                <dd>{when.zone}</dd>
              </>
            ) : null}

            {durationLine(sessionSeconds(execution)) ? (
              <>
                <dt>Duración</dt>
                <dd>{durationLine(sessionSeconds(execution))}</dd>
              </>
            ) : null}

            {levelLabel(execution.achieved_level) ? (
              <>
                <dt>Registro</dt>
                <dd>{levelLabel(execution.achieved_level)}</dd>
              </>
            ) : null}

            <dt>Permiso</dt>
            <dd data-client-execution-scope>
              Se te mostró con {execution.applied_scope.code}, versión{' '}
              {String(execution.applied_scope.version)}
            </dd>
          </dl>
        </CardContent>
      </Card>

      {recordedNothing(execution) ? (
        /* Said once, rather than as five empty panels. */
        <Empty data-client-execution-nothing-recorded>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <FoundationIcon name="activity" decorative />
            </EmptyMedia>
            <EmptyTitle>No hay resultados guardados en esta sesión</EmptyTitle>
            <EmptyDescription>
              La sesión existe y está terminada, y no tiene series, vueltas, intervalos, rondas ni
              movilidad guardados. Desde aquí no se puede saber si no registró nada o si eso
              pertenece a una categoría que no te compartió.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        families.map((entry) => (
          <ResultPanel
            key={entry.family}
            execution={execution}
            family={entry.family}
            title={entry.title}
            note={entry.note}
            /* Only a strength set takes a proposal, and only while she shares
               her training at the writing level. */
            action={
              mayPropose
                ? (set) => (
                    <ClientCorrectionProposal
                      set={set}
                      pending={pendingProposals}
                      executionId={params.executionId}
                      organizationId={organizationId}
                      personId={params.personId}
                    />
                  )
                : undefined
            }
          />
        ))
      )}

      {/* The card now holds the form as well, so it stays even with nothing
          written: a coach who may annotate needs somewhere to do it. */}
      {observations.length > 0 || offers.length > 0 ? (
        <Card data-client-execution-observations>
          <CardHeader>
            <CardTitle role="heading" aria-level={2}>
              Observaciones
            </CardTitle>
            {/* Never how many are missing: each arrives under its own category,
                and saying «some are hidden» would answer whether she shares one
                she chose not to. */}
            <CardDescription>
              Lo que anotaron los profesionales de este vínculo sobre la sesión, de la más antigua a
              la más reciente.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {observations.length > 0 ? (
              <ul data-client-execution-observation-list>
                {observations.map((note) => (
                  <li key={note.id}>
                    <ObservationRow
                      observation={note}
                      /* Only his own, and only while her category is still open
                         to him: the other rows have nothing to press. */
                      correction={
                        observationCorrectable(offers, note) ? (
                          <ClientObservationCorrection
                            observation={note}
                            executionId={params.executionId}
                            organizationId={organizationId}
                            personId={params.personId}
                          />
                        ) : null
                      }
                    />
                  </li>
                ))}
              </ul>
            ) : (
              <p data-client-execution-observations-none>
                Todavía nadie de este vínculo anotó nada sobre esta sesión.
              </p>
            )}
            <ClientObservationForm
              offers={offers}
              executionId={params.executionId}
              organizationId={organizationId}
              personId={params.personId}
            />
          </CardContent>
        </Card>
      ) : null}
    </div>
  )
}

/** Seconds between the start and the end, or null when nobody closed it. */
function sessionSeconds(execution: AuthorizedExecution): number | null {
  if (!execution.ended_at) return null
  const seconds =
    (new Date(execution.ended_at).getTime() - new Date(execution.started_at).getTime()) / 1000
  return Number.isFinite(seconds) && seconds > 0 ? seconds : null
}

/**
 * One family of results, as rows.
 *
 * Each row says which block of the session it belongs to, but only when the
 * session was split: on an unsegmented session that column would be empty on
 * every row, which is the kind of emptiness this screen refuses to draw.
 */
function ResultPanel({
  execution,
  family,
  title,
  note,
  action,
}: {
  execution: AuthorizedExecution
  family: ResultFamily
  title: string
  /** Said only where the family's name does not explain itself. */
  note: string | null
  /** What a row of this family offers, when it offers anything. */
  action?: ((set: ExecutionDetailStrengthSet) => ReactNode) | undefined
}) {
  const rows = familyRows(execution, family)
  return (
    <Card data-client-execution-results data-family={family}>
      <CardHeader>
        <CardTitle role="heading" aria-level={2}>
          {title}
        </CardTitle>
        {note ? <CardDescription data-client-execution-family-note>{note}</CardDescription> : null}
      </CardHeader>
      <CardContent>
        <ul data-client-execution-result-list>
          {rows.map((row) => (
            <li key={row.key}>
              <article data-client-execution-result>
                <div data-client-execution-result-head>
                  <strong data-client-execution-result-name>{row.name}</strong>
                  {row.block ? (
                    <Badge variant="outline" data-client-execution-result-block>
                      {row.block}
                    </Badge>
                  ) : null}
                </div>
                {row.detail ? <p data-client-execution-result-detail>{row.detail}</p> : null}
                {action && row.set ? action(row.set) : null}
              </article>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  )
}

interface ResultRow {
  readonly key: string
  readonly name: string
  readonly detail: string
  readonly block: string | null
  /** Only a strength set has one: the three fields a proposal can point at. */
  readonly set: ExecutionDetailStrengthSet | null
}

/**
 * The rows of one family, each with the name a coach reads it by.
 *
 * A strength set and a mobility hold are named by their movement; the other
 * three have no movement of their own, so they are named by their number — that
 * is what the contract gives them.
 */
function familyRows(execution: AuthorizedExecution, family: ResultFamily): readonly ResultRow[] {
  const block = (position: number | null) => segmentLabel(execution, position)
  if (family === 'strength') {
    return execution.strength_sets.map((set, index) => ({
      key: `${set.movement_id}-${String(set.order)}-${String(index)}`,
      name: `${String(set.order)}. ${set.movement_name}`,
      detail: strengthLine(set),
      block: block(set.segment_position),
      set,
    }))
  }
  if (family === 'endurance') {
    return execution.endurance_laps.map((lap, index) => ({
      key: `lap-${String(lap.lap_number)}-${String(index)}`,
      name: `Vuelta ${String(lap.lap_number)}`,
      detail: enduranceLine(lap),
      block: block(lap.segment_position),
      set: null,
    }))
  }
  if (family === 'interval') {
    return execution.interval_results.map((interval, index) => ({
      key: `interval-${String(interval.interval_number)}-${String(index)}`,
      name: `Intervalo ${String(interval.interval_number)}`,
      detail: intervalLine(interval),
      block: block(interval.segment_position),
      set: null,
    }))
  }
  if (family === 'round') {
    return execution.round_results.map((round, index) => ({
      key: `round-${String(round.round_number)}-${String(index)}`,
      name: `Ronda ${String(round.round_number)}`,
      detail: roundLine(round),
      block: block(round.segment_position),
      set: null,
    }))
  }
  return execution.mobility_results.map((result, index) => ({
    key: `${result.movement_id}-${String(result.sequence_position)}-${String(index)}`,
    name: `${String(result.sequence_position)}. ${result.movement_name}`,
    detail: mobilityLine(result),
    block: block(result.segment_position),
    set: null,
  }))
}

function ObservationRow({
  observation,
  correction,
}: {
  observation: ProfessionalObservation
  correction: ReactNode
}) {
  const revised = observationRevisionNote(observation)
  return (
    <article data-client-execution-observation>
      <div data-client-execution-observation-head>
        <strong data-client-execution-observation-author>{observationAuthor(observation)}</strong>
        {revised ? (
          <Badge variant="secondary" data-client-execution-observation-revised>
            {revised}
          </Badge>
        ) : null}
      </div>
      <p data-client-execution-observation-content>{observation.content}</p>
      {/* Under the text it corrects, not in the head: the action belongs to the
          observation, and the head is where the row says whose it is. */}
      {correction}
    </article>
  )
}

function LoadingState() {
  return (
    <div data-client-execution-detail-screen data-client-execution-detail-loading>
      <Skeleton data-client-execution-detail-header-placeholder />
      <Skeleton data-client-execution-detail-panel-placeholder />
    </div>
  )
}

/**
 * The one `404` that covers six reasons. It names none of them: hidden,
 * unfinished, annulled, another relationship's, another person's and absent all
 * answer the same, and picking one would be a guess about her.
 */
function UnreachableState({ executionsPath }: { executionsPath: string }) {
  return (
    <div data-client-execution-detail-screen>
      <Empty data-client-execution-unreachable>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <FoundationIcon name="activity" decorative />
          </EmptyMedia>
          <EmptyTitle>No encontramos esta sesión</EmptyTitle>
          <EmptyDescription>
            Puede que ya no esté a la vista, que no esté terminada, o que no sea de las que puedes
            consultar. Desde aquí no se puede distinguir, y no vamos a suponerlo.
          </EmptyDescription>
        </EmptyHeader>
        <Link
          href={executionsPath}
          data-slot="button"
          data-variant="outline"
          className={buttonVariants({ variant: 'outline', size: 'sm' })}
        >
          Volver a sus sesiones
        </Link>
      </Empty>
    </div>
  )
}

/**
 * The operation lists `403` only as `scope-required`, and only when she shares
 * neither training category. No retry: pressing again would refuse again, and
 * every attempt is recorded for her to read.
 */
function ScopeRequiredState({ cardPath }: { cardPath: string }) {
  return (
    <div data-client-execution-detail-screen>
      <Alert variant="warning" live="polite" data-client-execution-scope-required>
        <AlertTitle>No te autorizó su entrenamiento</AlertTitle>
        <AlertDescription>
          Hace falta que comparta su entrenamiento con nosotros o su historial anterior, y hoy no
          comparte ninguno de los dos. El intento queda registrado y ella puede verlo. En su ficha
          está qué categorías sí te autorizó.
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

function FailureState({ onRetry }: { onRetry: () => void }) {
  return (
    <div data-client-execution-detail-screen>
      <Alert variant="danger" live="polite" data-client-execution-detail-failure>
        <AlertTitle>No pudimos cargar esta sesión</AlertTitle>
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
