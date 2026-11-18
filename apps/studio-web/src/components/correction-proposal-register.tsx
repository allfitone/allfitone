'use client'

/**
 * The register of corrections one proposed: `HU-STUDIO-060`.
 *
 * The other half of `HU-STUDIO-059`: there a coach proposes, here he finds out
 * what came of it. Each professional sees only their own — the operation is
 * scoped to the caller's membership, so this screen never has to filter.
 *
 * **The state is the server's word.** A proposal past its thirty days arrives
 * as `expired` whether or not a sweep has marked it, so nothing here derives a
 * state from `expires_at`: that would be a second source of truth, and the
 * filter would disagree with the rows. The rules are in
 * `@/lib/correction-proposal-register`.
 *
 * **Her current value is not here.** The answer carries what he proposed and
 * never what she has, so there is no before-and-after to draw: pairing them
 * would need a read of her session, which is another permission and another
 * line in her access log. A row that still points somewhere links to it
 * instead.
 */

import { Alert, AlertAction, AlertDescription, AlertTitle } from '@allfitone/react/components/alert'
import { Badge } from '@allfitone/react/components/badge'
import { Button, buttonVariants } from '@allfitone/react/components/button'
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@allfitone/react/components/empty'
import { Skeleton } from '@allfitone/react/components/skeleton'
import { Spinner } from '@allfitone/react/components/spinner'
import { ToggleGroup, ToggleGroupItem } from '@allfitone/react/components/toggle-group'
import { FoundationIcon } from '@allfitone/react/icons'
import { useInfiniteQuery } from '@tanstack/react-query'
import Link from 'next/link'
import { useState } from 'react'

import { useOrganizationContext } from './organization-context'
import { WorkspacePageHeader } from './workspace-page-header'
import { correctionFieldLabel } from '@/lib/client-correction-proposal'
import {
  PROPOSAL_FILTERS,
  proposalCancelNote,
  proposalEmptyNote,
  proposalFilterLabel,
  proposalRegisterFailure,
  proposalSessionTarget,
  proposalStatusLabel,
  proposalStatusNote,
  proposalStatusTone,
  proposalUnreachableNote,
  type ProposalFilter,
} from '@/lib/correction-proposal-register'
import { readerTimeZone } from '@/lib/reader-zone'
import { StudioApiError, type ProposedCorrection } from '@/lib/studio-api'
import { proposedCorrectionsRegisterQueryOptions } from '@/lib/studio-query'

const PAGE_SIZE = 25

const TONE_VARIANT = {
  waiting: 'outline',
  done: 'secondary',
  refused: 'secondary',
  lapsed: 'secondary',
} as const

export function CorrectionProposalRegisterScreen() {
  const { current } = useOrganizationContext()
  const organizationId = current.organization_id
  const [filter, setFilter] = useState<ProposalFilter>('all')
  const query = useInfiniteQuery(
    proposedCorrectionsRegisterQueryOptions(organizationId, filter, PAGE_SIZE),
  )

  const items = query.data?.pages.flatMap((page) => page.data) ?? []
  const nextCursor = query.hasNextPage ? (query.data?.pages.at(-1)?.page.next_cursor ?? null) : null
  const refusal = query.error instanceof StudioApiError ? query.error : undefined

  return (
    <section data-correction-proposal-page aria-label="Propuestas de corrección">
      <WorkspacePageHeader description="Las correcciones que propusiste a las personas que atiendes, de la que vence primero a la que vence después. Solo las tuyas." />

      <ToggleGroup
        value={[filter]}
        onValueChange={(chosen: string[]) => {
          const next = chosen[0]
          if (next && (PROPOSAL_FILTERS as readonly string[]).includes(next)) {
            setFilter(next as ProposalFilter)
          }
        }}
        aria-label="Estado de las propuestas"
        data-correction-proposal-filter
      >
        {PROPOSAL_FILTERS.map((option) => (
          <ToggleGroupItem key={option} value={option}>
            {proposalFilterLabel(option)}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>

      {/* The register may refresh by itself — it holds none of her data — so it
          says when it is doing it. */}
      {query.isFetching && !query.isPending && !query.isFetchingNextPage ? (
        <p data-query-refreshing role="status" aria-live="polite">
          Actualizando tus propuestas…
        </p>
      ) : null}

      {query.isPending ? (
        <div data-correction-proposal-loading>
          <Skeleton data-correction-proposal-placeholder />
          <Skeleton data-correction-proposal-placeholder />
        </div>
      ) : refusal ? (
        <Alert variant="danger" data-correction-proposal-failure>
          <AlertTitle>No pudimos mostrar tus propuestas</AlertTitle>
          <AlertDescription>{proposalRegisterFailure(refusal.status)}</AlertDescription>
          <AlertAction>
            <Button size="sm" variant="outline" onClick={() => void query.refetch()}>
              Volver a intentar
            </Button>
          </AlertAction>
        </Alert>
      ) : items.length === 0 ? (
        <Empty data-correction-proposal-empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <FoundationIcon name="time" size="lg" decorative />
            </EmptyMedia>
            <EmptyTitle>Nada que seguir por ahora</EmptyTitle>
            <EmptyDescription>{proposalEmptyNote(filter)}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <ul data-correction-proposal-list>
          {items.map((proposal) => (
            <li key={proposal.id}>
              <ProposalRow proposal={proposal} organizationId={organizationId} />
            </li>
          ))}
        </ul>
      )}

      {nextCursor ? (
        <div data-correction-proposal-pagination>
          <Button
            variant="outline"
            disabled={query.isFetchingNextPage}
            onClick={() => void query.fetchNextPage()}
          >
            {query.isFetchingNextPage ? <Spinner label="Cargando más propuestas" /> : null}
            {query.isFetchingNextPage ? 'Cargando…' : 'Ver más'}
          </Button>
        </div>
      ) : null}
    </section>
  )
}

function ProposalRow({
  proposal,
  organizationId,
}: {
  proposal: ProposedCorrection
  organizationId: string
}) {
  const target = proposalSessionTarget(proposal)
  const tone = proposalStatusTone(proposal.status)
  const unit = proposal.proposed.unit === null ? '' : ` ${proposal.proposed.unit}`
  return (
    <article data-correction-proposal data-tone={tone}>
      <div data-correction-proposal-head>
        <strong data-correction-proposal-client>{proposal.client.name}</strong>
        <Badge variant={TONE_VARIANT[tone]} data-correction-proposal-status>
          {proposalStatusLabel(proposal.status)}
        </Badge>
      </div>

      <p data-correction-proposal-what>
        Le propusiste {correctionFieldLabel(proposal.field).toLocaleLowerCase('es-CO')}{' '}
        <b>
          {String(proposal.proposed.value)}
          {unit}
        </b>{' '}
        en la serie {String(proposal.target?.set_order ?? '—')}.
      </p>

      {/* Her own words are not here; his are, because she read them. */}
      <p data-correction-proposal-reason>«{proposal.reason}»</p>

      <p data-correction-proposal-state>{proposalStatusNote(proposal.status)}</p>

      {proposal.status === 'cancelled' && proposal.cancel_reason ? (
        <p data-correction-proposal-cancel>{proposalCancelNote(proposal.cancel_reason)}</p>
      ) : null}

      <p data-correction-proposal-when>
        Propuesta el {formatInstant(proposal.created_at)}
        {proposal.status === 'pending' ? ` · vence el ${formatInstant(proposal.expires_at)}` : ''}
        {proposal.settled_at === null
          ? ''
          : ` · se resolvió el ${formatInstant(proposal.settled_at)}`}
      </p>

      {target ? (
        <Link
          href={`/organizations/${organizationId}/clients/people/${proposal.client.person_id}/executions/${target.executionId}`}
          data-slot="button"
          data-variant="outline"
          data-correction-proposal-session
          className={buttonVariants({ variant: 'outline', size: 'sm' })}
        >
          Abrir esa sesión
        </Link>
      ) : (
        <p data-correction-proposal-unreachable>{proposalUnreachableNote()}</p>
      )}
    </article>
  )
}

/**
 * An instant in the reader's own zone: the deadline is his, not her training.
 *
 * The browser may refuse to name a zone, and then the default is already the
 * reader's — so the option is omitted rather than guessed at.
 */
function formatInstant(value: string): string {
  const zone = readerTimeZone()
  return new Intl.DateTimeFormat('es-CO', {
    dateStyle: 'medium',
    ...(zone === null ? {} : { timeZone: zone }),
  }).format(new Date(value))
}
