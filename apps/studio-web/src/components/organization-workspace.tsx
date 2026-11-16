'use client'

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
import { Skeleton } from '@allfitone/react/components/skeleton'
import { FoundationIcon } from '@allfitone/react/icons'
import { useQuery } from '@tanstack/react-query'
import Link from 'next/link'
import type { ReactNode } from 'react'

import { useOrganizationContext } from './organization-context'
import { WorkspacePageHeader } from './workspace-page-header'
import { organizationRoleName } from '@/lib/team-directory'
import type {
  StudioToday,
  TodayInvitations,
  TodayRelationships,
  TodayTeam,
  TodayTerminationRequests,
  TodayTraining,
} from '@/lib/studio-api'
import { isStudioForbidden, todayQueryOptions } from '@/lib/studio-query'
import {
  hiddenCount,
  invitationExpiryPhrase,
  invitationStateLabel,
  noticeHref,
  noticeRowHref,
  noticesInReadingOrder,
  teamRoleSummary,
  trainingRowSentence,
  type TodayNoticeKind,
} from '@/lib/studio-today'

const DATE_FORMATTER = new Intl.DateTimeFormat('es-CO', { dateStyle: 'medium' })

/**
 * The landing of an organization: what needs this caller's attention today.
 *
 * It renders the notices the server sent and asks no role of its own. That is
 * the whole of `HU-STUDIO-081`'s fourth criterion — what you see depends on
 * your role — and the server is the only place that can answer it, because the
 * decision is made by the policies, not by a claim the client could read.
 *
 * **It reads once, on arrival.** Working the panel out evaluates every client
 * this caller attends and records each one in that person's access log, so a
 * refresh on focus or on a timer would write those lines again for nobody's
 * benefit. See `todayQueryOptions`.
 */
export function OrganizationWorkspace() {
  const { current } = useOrganizationContext()
  const organizationId = current.organization_id
  const query = useQuery(todayQueryOptions(organizationId))

  if (query.isPending) return <LoadingPanel />
  if (isStudioForbidden(query.error)) return <DeniedPanel />
  if (!query.data) return <FailurePanel onRetry={() => void query.refetch()} />

  const today = query.data
  const kinds = noticesInReadingOrder(today.notices)

  return (
    <div data-today-panel>
      <WorkspacePageHeader description="Solo aparece lo que tu rol te permite resolver." />

      {/* The contract decides this, not a count of the cards below: `team` is a
          state and never makes the day non-empty, so a workspace with nothing
          waiting still has a team panel under this message. */}
      {today.empty ? <NothingWaiting /> : null}

      {kinds.map((kind) => (
        <Notice key={kind} kind={kind} notices={today.notices} organizationId={organizationId} />
      ))}
    </div>
  )
}

/**
 * One notice, by the key the contract filed it under.
 *
 * Seven explicit branches rather than a table of renderers: the notices share
 * three shapes and no words at all, and the shape is the lesser half of what
 * makes each one legible.
 */
function Notice({
  kind,
  notices,
  organizationId,
}: {
  kind: TodayNoticeKind
  notices: StudioToday['notices']
  organizationId: string
}) {
  switch (kind) {
    case 'unassigned_relationships': {
      const notice = notices.unassigned_relationships
      return notice ? <UnassignedNotice notice={notice} organizationId={organizationId} /> : null
    }
    case 'termination_requests': {
      const notice = notices.termination_requests
      return notice ? <TerminationNotice notice={notice} organizationId={organizationId} /> : null
    }
    case 'client_invitations': {
      const notice = notices.client_invitations
      return notice ? (
        <InvitationsNotice
          notice={notice}
          organizationId={organizationId}
          slot="client-invitations"
          title="Invitaciones a clientes"
          action="Ver invitados"
        />
      ) : null
    }
    case 'training': {
      const notice = notices.training
      return notice ? <TrainingNotice notice={notice} organizationId={organizationId} /> : null
    }
    case 'team_invitations': {
      const notice = notices.team_invitations
      return notice ? (
        <InvitationsNotice
          notice={notice}
          organizationId={organizationId}
          slot="team-invitations"
          title="Invitaciones al equipo"
          action="Ver invitaciones"
        />
      ) : null
    }
    case 'new_relationships': {
      const notice = notices.new_relationships
      return notice ? <NewClientsNotice notice={notice} organizationId={organizationId} /> : null
    }
    case 'team': {
      const notice = notices.team
      return notice ? <TeamState notice={notice} organizationId={organizationId} /> : null
    }
  }
}

/**
 * A person accepted and has nobody assigned to her, so she is already waiting.
 * This is the first notice on the page for that reason.
 *
 * Each row leads to the link itself, which is where a professional is assigned.
 * The notice has no destination of its own: no screen in Studio lists the links
 * nobody attends, so the remainder beyond five is a count, not a promise.
 */
function UnassignedNotice({
  notice,
  organizationId,
}: {
  notice: TodayRelationships
  organizationId: string
}) {
  return (
    <Card data-today-notice data-today-notice-slot="unassigned">
      <CardHeader>
        <NoticeTitle count={notice.count}>Personas sin profesional asignado</NoticeTitle>
        <CardDescription>Aceptaron la invitación y nadie las acompaña todavía.</CardDescription>
      </CardHeader>
      <CardContent>
        <ul data-today-rows>
          {notice.items.map((item) => (
            <li key={item.relationship_id}>
              <RowLink href={noticeRowHref(notice.link, organizationId, item)}>
                <strong data-today-row-subject>{item.display_name}</strong>
                <span data-today-row-detail>Desde el {formatDate(item.started_at)}</span>
              </RowLink>
            </li>
          ))}
        </ul>
        <Remainder count={hiddenCount(notice)} href={noticeHref(notice.link, organizationId)} />
      </CardContent>
    </Card>
  )
}

/** Somebody asked to end a link. It is resolved on the link's own screen. */
function TerminationNotice({
  notice,
  organizationId,
}: {
  notice: TodayTerminationRequests
  organizationId: string
}) {
  return (
    <Card data-today-notice data-today-notice-slot="terminations">
      <CardHeader>
        <NoticeTitle count={notice.count}>Solicitudes para terminar un vínculo</NoticeTitle>
        <CardDescription>Esperan una decisión de la organización.</CardDescription>
      </CardHeader>
      <CardContent>
        <ul data-today-rows>
          {notice.items.map((item) => (
            <li key={item.request_id}>
              <RowLink href={noticeRowHref(notice.link, organizationId, item)}>
                <strong data-today-row-subject>{item.display_name}</strong>
                <span data-today-row-detail>Pedida el {formatDate(item.requested_at)}</span>
              </RowLink>
            </li>
          ))}
        </ul>
        <Remainder count={hiddenCount(notice)} href={noticeHref(notice.link, organizationId)} />
      </CardContent>
    </Card>
  )
}

/**
 * Invitations waiting for an answer, to a client or to the team. One component
 * for both because the contract gives them one shape, one rule for what they
 * hold, and a different register to open.
 *
 * **The sentence is not "the ones you sent".** A caller who reads the directory
 * gets every unanswered invitation of the organization, not only hers, so the
 * description says what the list holds rather than who sent it.
 *
 * The contact arrives masked and is shown as it arrived. A row carries the
 * proposed role only for the team, which is also the only place the contract
 * sends one.
 */
function InvitationsNotice({
  notice,
  organizationId,
  slot,
  title,
  action,
}: {
  notice: TodayInvitations
  organizationId: string
  slot: string
  title: string
  action: string
}) {
  const href = noticeHref(notice.link, organizationId)

  return (
    <Card data-today-notice data-today-notice-slot={slot}>
      <CardHeader>
        <NoticeTitle count={notice.count}>{title}</NoticeTitle>
        <CardDescription>Sin respuesta, o vencidas en los últimos siete días.</CardDescription>
        {href ? (
          <CardAction>
            <NoticeAction href={href}>{action}</NoticeAction>
          </CardAction>
        ) : null}
      </CardHeader>
      <CardContent>
        <ul data-today-rows>
          {notice.items.map((item) => (
            <li key={item.invitation_id}>
              <div data-today-row>
                <strong data-today-row-subject>{item.contact}</strong>
                <span data-today-row-detail>
                  {invitationExpiryPhrase(item.state)} {formatDate(item.expires_at)}
                </span>
                <div data-today-row-marks>
                  {item.proposed_role_code ? (
                    <Badge variant="secondary">
                      {organizationRoleName(item.proposed_role_code)}
                    </Badge>
                  ) : null}
                  {/* The client directory marks a pending invitation `warning`
                      and a finished link `secondary`. Same two states here, so
                      the same two variants. */}
                  <Badge variant={item.state === 'awaiting' ? 'warning' : 'secondary'}>
                    {invitationStateLabel(item.state)}
                  </Badge>
                </div>
              </div>
            </li>
          ))}
        </ul>
        <Remainder count={hiddenCount(notice)} href={href} />
      </CardContent>
    </Card>
  )
}

/**
 * The caller's own clients: sessions of their last closed week left unlogged,
 * and results they finished in the last forty-eight hours.
 *
 * The description is not decoration. Building this notice reads each of those
 * clients and writes a line each of them can see, so the professional is told
 * what opening the screen did.
 */
function TrainingNotice({
  notice,
  organizationId,
}: {
  notice: TodayTraining
  organizationId: string
}) {
  return (
    <Card data-today-notice data-today-notice-slot="training">
      <CardHeader>
        <NoticeTitle count={notice.count}>Tus clientes esta semana</NoticeTitle>
        <CardDescription>
          Revisar esta lista queda en el registro de accesos de cada cliente.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ul data-today-rows>
          {notice.items.map((item) => (
            <li key={item.person_id}>
              <RowLink href={noticeRowHref(notice.link, organizationId, item)}>
                <strong data-today-row-subject>{item.display_name}</strong>
                <span data-today-row-detail>{trainingRowSentence(item)}</span>
              </RowLink>
            </li>
          ))}
        </ul>
        <Remainder count={hiddenCount(notice)} href={noticeHref(notice.link, organizationId)} />
      </CardContent>
    </Card>
  )
}

/** Who joined in the last seven days. Nothing waits on the caller here. */
function NewClientsNotice({
  notice,
  organizationId,
}: {
  notice: TodayRelationships
  organizationId: string
}) {
  const href = noticeHref(notice.link, organizationId)

  return (
    <Card data-today-notice data-today-notice-slot="new-clients">
      <CardHeader>
        <NoticeTitle count={notice.count}>Clientes nuevos</NoticeTitle>
        <CardDescription>Se sumaron en los últimos siete días.</CardDescription>
        {href ? (
          <CardAction>
            <NoticeAction href={href}>Ver clientes</NoticeAction>
          </CardAction>
        ) : null}
      </CardHeader>
      <CardContent>
        <ul data-today-rows>
          {notice.items.map((item) => (
            <li key={item.relationship_id}>
              <div data-today-row>
                <strong data-today-row-subject>{item.display_name}</strong>
                <span data-today-row-detail>Desde el {formatDate(item.started_at)}</span>
              </div>
            </li>
          ))}
        </ul>
        <Remainder count={hiddenCount(notice)} href={href} />
      </CardContent>
    </Card>
  )
}

/**
 * How the team stands, which the contract calls a state: it never makes the day
 * non-empty. So it is a line and not a card — the page keeps one rank for what
 * waits on somebody and a quieter one for how things are.
 */
function TeamState({ notice, organizationId }: { notice: TodayTeam; organizationId: string }) {
  const href = noticeHref(notice.link, organizationId)
  const summary = teamRoleSummary(notice.by_role)

  return (
    <section data-today-state aria-label="Tu equipo">
      <p data-today-state-figure>
        <strong>{notice.count}</strong>{' '}
        {notice.count === 1 ? 'integrante con rol vigente' : 'integrantes con rol vigente'}
        {summary ? <span data-today-state-detail>{summary}</span> : null}
      </p>
      {href ? <NoticeAction href={href}>Ver equipo</NoticeAction> : null}
    </section>
  )
}

/**
 * The count belongs beside the title, because it is the first thing the reader
 * is after and the list below it is capped at five. The heading level is the
 * page's second: the `h1` is the organization, in the shell.
 */
function NoticeTitle({ count, children }: { count: number; children: string }) {
  return (
    <CardTitle role="heading" aria-level={2}>
      {children} <span data-today-notice-count>{count}</span>
    </CardTitle>
  )
}

/**
 * A row that leads somewhere, which is every row of a notice whose operation
 * acts on one thing. A `null` destination would mean this app has no screen for
 * that operation, so the row stays readable rather than becoming a dead link.
 */
function RowLink({ href, children }: { href: string | null; children: ReactNode }) {
  if (!href) return <div data-today-row>{children}</div>
  return (
    <Link href={href} data-today-row data-today-row-link>
      {children}
    </Link>
  )
}

/**
 * What the notice covers beyond the rows it listed.
 *
 * A link when a screen lists the rest, plain text when none does. Saying "y 7
 * más" and leading nowhere is honest; a button to a screen that cannot filter
 * to those seven would not be.
 */
function Remainder({ count, href }: { count: number; href: string | null }) {
  if (count === 0) return null

  const words = `y ${count} más`
  if (!href) return <p data-today-remainder>{words}</p>
  return (
    <Link href={href} data-today-remainder>
      {words}
    </Link>
  )
}

/** The one way into a notice's register, styled as this workspace styles links. */
function NoticeAction({ href, children }: { href: string; children: string }) {
  return (
    <Link
      href={href}
      data-slot="button"
      data-variant="outline"
      className={buttonVariants({ variant: 'outline', size: 'sm' })}
    >
      {children}
    </Link>
  )
}

/**
 * Said, rather than left as a blank page. The sixth criterion asks for exactly
 * this, and a team panel may still follow it.
 */
function NothingWaiting() {
  return (
    <Empty data-today-empty>
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <FoundationIcon name="success" decorative />
        </EmptyMedia>
        <EmptyTitle>Nada espera por ti ahora</EmptyTitle>
        <EmptyDescription>
          Cuando una invitación, un vínculo o una sesión necesite tu atención aparecerá acá.
        </EmptyDescription>
      </EmptyHeader>
    </Empty>
  )
}

function LoadingPanel() {
  return (
    <div data-today-panel data-today-loading>
      <Skeleton data-today-notice-placeholder />
      <Skeleton data-today-notice-placeholder />
    </div>
  )
}

/**
 * Not this caller's to read. The copy says what it means for them rather than
 * naming a policy, and offers no way to ask again: this screen has no part in
 * granting anything.
 */
function DeniedPanel() {
  return (
    <div data-today-panel>
      <Alert variant="danger" live="polite" data-today-denied>
        <AlertTitle>No puedes ver el estado de esta organización</AlertTitle>
        <AlertDescription>
          Tu membresía ya no lo permite. Puedes seguir trabajando en las demás secciones.
        </AlertDescription>
      </Alert>
    </div>
  )
}

function FailurePanel({ onRetry }: { onRetry: () => void }) {
  return (
    <div data-today-panel>
      <Alert variant="danger" live="polite" data-today-failure>
        <AlertTitle>No pudimos cargar lo que necesita tu atención</AlertTitle>
        <AlertDescription>
          La conexión falló de forma temporal. Nada de lo pendiente cambió.
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

function formatDate(value: string): string {
  return DATE_FORMATTER.format(new Date(value))
}
