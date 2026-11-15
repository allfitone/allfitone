'use client'

/**
 * `HU-STUDIO-070`. The nutrition goals this relationship proposed a client, and
 * the one she follows today, so whoever attends her picks up where the last
 * proposal left off.
 *
 * **What this relationship proposed, never more.** `OP-NUT-011` lists only this
 * relationship's proposals, in any state and with what she decided: never her own
 * goals nor another organization's. The author arrives as an id and the version
 * number not at all — it would count her own goals — so neither is drawn.
 *
 * **Her active goal says little about itself.** It travels with every page, with
 * its targets, and names its origin only when this relationship proposed it. So
 * the screen attributes nothing to a goal that does not declare where it came
 * from, and offers no way to ask.
 *
 * **Live only** (criteria 2 to 4). An ended relationship's proposals are read
 * through a historical access case, in the frozen history; here the live read
 * answers 404 like any other client nobody attends, and nothing falls back to
 * the case route.
 *
 * **Never cached**: each visit reads again, and a later page is read only when
 * somebody asks for it. The words are in `nutrition-goals.ts`.
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
import { useInfiniteQuery } from '@tanstack/react-query'
import Link from 'next/link'
import { useParams } from 'next/navigation'

import { useOrganizationContext } from './organization-context'
import { WorkspacePageHeader } from './workspace-page-header'
import { clientCardPath } from '@/lib/client-card'
import {
  activeOriginLine,
  activeSinceLine,
  decisionLine,
  proposalStatusLabel,
  proposedLine,
  targetLines,
} from '@/lib/nutrition-goals'
import type {
  ClientActiveNutritionGoal,
  ClientNutritionGoalVersion,
  NutritionGoalStatus,
} from '@/lib/studio-api'
import {
  clientNutritionGoalsQueryOptions,
  flattenById,
  isStudioForbidden,
  isStudioNotFound,
} from '@/lib/studio-query'

const GOALS_PAGE = 20

const STATUS_VARIANT: Record<NutritionGoalStatus, 'success' | 'outline' | 'secondary'> = {
  proposed: 'outline',
  active: 'success',
  rejected: 'secondary',
  superseded: 'secondary',
  cancelled: 'secondary',
}

export function ClientNutritionGoalsScreen() {
  const { current } = useOrganizationContext()
  const params = useParams<{ personId: string }>()
  const organizationId = current.organization_id
  const query = useInfiniteQuery(
    clientNutritionGoalsQueryOptions(organizationId, params.personId, GOALS_PAGE),
  )
  const cardPath = clientCardPath(organizationId, params.personId)
  const directoryPath = `/organizations/${organizationId}/clients`

  if (isStudioForbidden(query.error)) return <ScopeRequiredState cardPath={cardPath} />
  if (isStudioNotFound(query.error)) return <UnreachableState directoryPath={directoryPath} />

  const first = query.data?.pages[0]
  const proposals = flattenById(query.data)
  const active = first?.active ?? null

  return (
    <div data-client-nutrition-goals-screen>
      <WorkspacePageHeader
        description="Los objetivos de nutrición que esta relación le propuso, lo que ella decidió y la meta que sigue hoy. Es un permiso aparte: no incluye sus comidas."
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

      {query.isPending ? (
        <div data-client-nutrition-goals-loading>
          <Skeleton data-client-nutrition-goals-placeholder />
        </div>
      ) : !first ? (
        <FailureState onRetry={() => void query.refetch()} />
      ) : proposals.length === 0 && !active ? (
        <Empty data-client-nutrition-goals-nothing>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <FoundationIcon name="person" decorative />
            </EmptyMedia>
            <EmptyTitle>Esta relación todavía no le ha propuesto objetivos</EmptyTitle>
            <EmptyDescription>
              Cuando le propongan uno, aparecerá aquí con lo que ella decida.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <>
          {active ? <ActiveGoalCard active={active} /> : null}
          <Card data-client-nutrition-goals-history>
            <CardHeader>
              <CardTitle role="heading" aria-level={2}>
                Lo que le propusimos
              </CardTitle>
              <CardDescription>
                Solo lo que propuso esta relación, de lo más nuevo a lo más viejo. Sus propias metas
                y las de otras organizaciones no aparecen.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {proposals.length === 0 ? (
                <p data-client-nutrition-goals-none>
                  Esta relación todavía no le ha propuesto objetivos.
                </p>
              ) : (
                <ul data-client-nutrition-goal-list>
                  {proposals.map((proposal) => (
                    <li key={proposal.id}>
                      <ProposalEntry proposal={proposal} />
                    </li>
                  ))}
                </ul>
              )}
              <MoreControl query={query} label="Ver más propuestas" />
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}

/** Her goal today: its targets, since when, and where it came from only if declared. */
function ActiveGoalCard({ active }: { active: ClientActiveNutritionGoal }) {
  const targets = targetLines(active.targets)
  const since = activeSinceLine(active.activated_at)
  const about = [since ? `${since}.` : null, activeOriginLine(active)]
    .filter((part) => part !== null)
    .join(' ')
  return (
    <Card data-client-nutrition-goals-active>
      <CardHeader>
        <CardTitle role="heading" aria-level={2}>
          Su meta de hoy
        </CardTitle>
        {about ? <CardDescription>{about}</CardDescription> : null}
      </CardHeader>
      {targets.length > 0 ? (
        <CardContent>
          <ul data-client-nutrition-goal-targets>
            {targets.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </CardContent>
      ) : null}
    </Card>
  )
}

function ProposalEntry({ proposal }: { proposal: ClientNutritionGoalVersion }) {
  const targets = targetLines(proposal.targets)
  const decision = decisionLine(proposal.decision)
  return (
    <article data-client-nutrition-goal>
      <div data-client-nutrition-goal-head>
        <strong data-client-nutrition-goal-title>{proposedLine(proposal.created_at)}</strong>
        <Badge variant={STATUS_VARIANT[proposal.status]} data-client-nutrition-goal-status>
          {proposalStatusLabel(proposal.status)}
        </Badge>
      </div>
      {/* Why, then what, then her answer: the order the frozen history reads in. */}
      {proposal.rationale ? <p data-client-nutrition-goal-rationale>{proposal.rationale}</p> : null}
      {targets.length > 0 ? (
        <ul data-client-nutrition-goal-targets>
          {targets.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      ) : null}
      {decision ? <p data-client-nutrition-goal-decision>{decision}</p> : null}
    </article>
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
      <Alert variant="danger" live="polite" data-client-nutrition-goals-more-failure>
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
    <div data-client-nutrition-goals-more>
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

/**
 * Criterion 1: her nutrition guidance, which neither her meals nor her training
 * grants. No retry — pressing it again would refuse again, and each attempt is
 * recorded for her.
 */
function ScopeRequiredState({ cardPath }: { cardPath: string }) {
  return (
    <div data-client-nutrition-goals-screen>
      <Alert variant="warning" live="polite" data-client-nutrition-goals-scope-required>
        <AlertTitle>No te autorizó sus objetivos nutricionales</AlertTitle>
        <AlertDescription>
          Hace falta el permiso de objetivos nutricionales vigente, que es aparte de los demás, y
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

/**
 * Absent, not attended by this caller, read by an owner or an admin, or a
 * relationship that already ended: the operation answers the same for all.
 */
function UnreachableState({ directoryPath }: { directoryPath: string }) {
  return (
    <div data-client-nutrition-goals-screen>
      <Empty data-client-nutrition-goals-unreachable>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <FoundationIcon name="person" decorative />
          </EmptyMedia>
          <EmptyTitle>No encontramos sus objetivos nutricionales</EmptyTitle>
          <EmptyDescription>
            Solo los abre quien la atiende hoy, ni siquiera el propietario o un administrador.
            Vuelve a clientes para elegir a alguien.
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
    <Alert variant="danger" live="polite" data-client-nutrition-goals-failure>
      <AlertTitle>No pudimos cargar sus objetivos</AlertTitle>
      <AlertDescription>
        La conexión falló de forma temporal. Lo que te autorizó sigue igual.
      </AlertDescription>
      <AlertAction>
        <Button size="sm" variant="outline" onClick={onRetry}>
          Reintentar
        </Button>
      </AlertAction>
    </Alert>
  )
}
