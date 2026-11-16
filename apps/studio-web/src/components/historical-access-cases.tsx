'use client'

/**
 * The historical access cases of an organization: `HU-STUDIO-061` to `063`.
 *
 * A case is the only way to read a relationship the organization ended, and it is
 * an exception: one relationship, one stated purpose, one member, a few hours.
 * This register is where an owner or an administrator opens one and where every
 * member finds the cases that name them. `OP-PRV-025` decides who sees what — the
 * whole register with `manage_historical_access`, otherwise only one's own cases —
 * so the screen asks once and shows what comes back.
 *
 * **No justification here.** The case keeps it and the events carry identifiers
 * only, so a list of cases never repeats why each one was opened. The reference
 * is what a manager looks a case up by.
 *
 * **Three states, not two.** Open, closed, and expired: a case whose time ran out
 * is the deadline doing its job, so it is not drawn as an error.
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
import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import Link from 'next/link'
import { useState } from 'react'

import { HistoricalCaseClose } from './historical-case-close'
import { useOrganizationContext } from './organization-context'
import { WorkspacePageHeader } from './workspace-page-header'
import {
  canManageHistoricalAccess,
  caseState,
  caseStateLabel,
  caseWindowLine,
  endedOnLine,
  memberName,
  purposeLabel,
  type CaseState,
} from '@/lib/historical-access'
import { closedReasonLine } from '@/lib/historical-close'
import type { HistoricalAccessCase } from '@/lib/studio-api'
import {
  flattenHistoricalCasePages,
  historicalAccessCasesQueryOptions,
  isStudioForbidden,
  organizationRolesQueryOptions,
} from '@/lib/studio-query'

const PAGE_SIZE = 25

const STATE_BADGE: Record<CaseState, 'success' | 'outline' | 'secondary'> = {
  open: 'success',
  expired: 'outline',
  closed: 'secondary',
}

export function HistoricalAccessCasesScreen() {
  const { current } = useOrganizationContext()
  const organizationId = current.organization_id
  const rolesQuery = useQuery(organizationRolesQueryOptions(organizationId))
  const query = useInfiniteQuery(historicalAccessCasesQueryOptions(organizationId, PAGE_SIZE))
  const canOpen = canManageHistoricalAccess(current.roles, rolesQuery.data?.items)
  const casesPath = `/organizations/${organizationId}/historical-access-cases`
  // Held here, not in the row: a closed case is re-read and the row's close goes away.
  const [outcome, setOutcome] = useState('')

  if (query.isPending) return <LoadingState />
  if (isStudioForbidden(query.error)) return <DeniedState />
  if (!query.data) return <FailureState onRetry={() => void query.refetch()} />

  const cases = flattenHistoricalCasePages(query.data)

  return (
    <section data-historical-cases-screen aria-label="Casos de acceso al historial">
      <WorkspacePageHeader
        description={
          canOpen
            ? 'Para consultar lo que una persona nos compartió antes de terminar la relación hace falta un caso: un propósito, una justificación y un plazo. Abrirlo no te deja leer nada por sí solo: solo lee a quien el caso autoriza.'
            : 'Los casos que te autorizan a consultar el historial de una relación terminada. Los abren propietario y administración.'
        }
        actions={
          canOpen ? (
            <Link
              href={`${casesPath}/new`}
              data-slot="button"
              data-variant="default"
              className={buttonVariants({ size: 'sm' })}
            >
              Abrir un caso
            </Link>
          ) : null
        }
      />

      <Card data-historical-cases-panel>
        <CardHeader>
          <CardTitle role="heading" aria-level={2}>
            Casos
          </CardTitle>
          <CardDescription>
            Del más reciente al más antiguo. La justificación de cada caso se queda en el caso y no
            se repite aquí.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p role="status" aria-live="polite" data-historical-cases-outcome>
            {outcome}
          </p>
          {cases.length === 0 ? (
            <Empty data-historical-cases-empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <FoundationIcon name="permissions" decorative />
                </EmptyMedia>
                <EmptyTitle>
                  {canOpen ? 'Todavía no se ha abierto ningún caso' : 'No tienes casos'}
                </EmptyTitle>
                <EmptyDescription>
                  {canOpen
                    ? 'Un caso se abre sobre una relación ya terminada, para atender una disputa, una obligación legal o una solicitud de la propia persona.'
                    : 'Cuando alguien de la organización abra un caso que te autorice, aparecerá aquí.'}
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <ul data-historical-cases-list>
              {cases.map((entry) => (
                <li key={entry.id}>
                  <CaseRow
                    entry={entry}
                    myMembershipId={current.membership_id}
                    casesPath={casesPath}
                    canClose={canOpen}
                    onClosed={setOutcome}
                  />
                </li>
              ))}
            </ul>
          )}

          {query.hasNextPage ? (
            <div data-historical-cases-more>
              <Button
                size="sm"
                variant="outline"
                disabled={query.isFetchingNextPage}
                onClick={() => void query.fetchNextPage()}
              >
                {query.isFetchingNextPage ? <Spinner label="Cargando más casos" /> : null}
                {query.isFetchingNextPage ? 'Cargando…' : 'Ver más'}
              </Button>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </section>
  )
}

function CaseRow({
  entry,
  myMembershipId,
  casesPath,
  canClose,
  onClosed,
}: {
  entry: HistoricalAccessCase
  myMembershipId: string
  casesPath: string
  canClose: boolean
  onClosed: (outcome: string) => void
}) {
  const state = caseState(entry)
  const mine = entry.authorized.membership_id === myMembershipId
  const reading = state === 'open' && mine
  // HU-063: only an open case closes; a closed one never reopens, so it offers nothing.
  const closing = state === 'open' && canClose
  const reason = closedReasonLine(entry)
  return (
    <article data-historical-case data-historical-case-state={state}>
      <div data-historical-case-head>
        <strong data-historical-case-person>{memberName(entry.person)}</strong>
        <Badge variant={STATE_BADGE[state]} data-historical-case-status>
          {caseStateLabel(state)}
        </Badge>
      </div>
      <p data-historical-case-window>{caseWindowLine(entry)}</p>
      {reason ? <p data-historical-case-reason>{reason}</p> : null}
      <dl data-historical-case-facts>
        <dt>Propósito</dt>
        <dd>{purposeLabel(entry.purpose)}</dd>
        <dt>Referencia</dt>
        <dd>{entry.case_reference}</dd>
        <dt>Autoriza a</dt>
        <dd>{mine ? `${memberName(entry.authorized)} (tú)` : memberName(entry.authorized)}</dd>
        <dt>Lo abrió</dt>
        <dd>{memberName(entry.opened_by)}</dd>
        <dt>Relación</dt>
        <dd>{endedOnLine(entry.cut_at)}</dd>
      </dl>
      {reading || closing ? (
        <div data-historical-case-actions>
          {/* HU-062: only the member the case names reads, and only while it is open. */}
          {reading ? (
            <Link
              href={`${casesPath}/${entry.id}?relationship=${entry.relationship_id}`}
              data-slot="button"
              data-variant="outline"
              className={buttonVariants({ variant: 'outline', size: 'sm' })}
            >
              Consultar el historial
            </Link>
          ) : null}
          {closing ? <HistoricalCaseClose entry={entry} onClosed={onClosed} /> : null}
        </div>
      ) : null}
    </article>
  )
}

function LoadingState() {
  return (
    <section data-historical-cases-screen aria-label="Casos de acceso al historial">
      <Skeleton data-historical-cases-header-placeholder />
      <Skeleton data-historical-cases-panel-placeholder />
    </section>
  )
}

function DeniedState() {
  return (
    <section data-historical-cases-screen aria-label="Casos de acceso al historial">
      <Alert variant="danger" live="polite" data-historical-cases-denied>
        <AlertTitle>No puedes ver casos en esta organización</AlertTitle>
        <AlertDescription>
          Tu membresía ya no lo permite. Puedes seguir trabajando en las demás secciones.
        </AlertDescription>
      </Alert>
    </section>
  )
}

function FailureState({ onRetry }: { onRetry: () => void }) {
  return (
    <section data-historical-cases-screen aria-label="Casos de acceso al historial">
      <Alert variant="danger" live="polite" data-historical-cases-failure>
        <AlertTitle>No pudimos cargar los casos</AlertTitle>
        <AlertDescription>
          La conexión falló de forma temporal. Ningún caso cambió.
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
