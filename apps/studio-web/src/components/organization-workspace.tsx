'use client'

import { Alert, AlertAction, AlertDescription, AlertTitle } from '@allfitone/react/components/alert'
import { Avatar, AvatarFallback } from '@allfitone/react/components/avatar'
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
import { Skeleton } from '@allfitone/react/components/skeleton'
import { FoundationIcon } from '@allfitone/react/icons'
import { useQuery } from '@tanstack/react-query'
import Link from 'next/link'
import type { ReactNode } from 'react'

import { useOrganizationContext } from './organization-context'
import { clientInitials } from '@/lib/client-directory'
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
  teamRoles,
  todayFigures,
  trainingRowSentence,
  weekTicks,
  type TodayNoticeKind,
} from '@/lib/studio-today'

const DATE_FORMATTER = new Intl.DateTimeFormat('es-CO', { dateStyle: 'medium' })
const DAY_FORMATTER = new Intl.DateTimeFormat('es-CO', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
})

/**
 * The landing of an organization: what needs this caller's attention today.
 *
 * It renders the notices the server sent and asks no role of its own. That is
 * the whole of `HU-STUDIO-081`'s fourth criterion — what you see depends on
 * your role — and the server is the only place that can answer it, because the
 * decision is made by the policies, not by a claim the client could read.
 *
 * **Three ranks, in the order the eye takes them.** The scoreboard says how
 * much there is; the board says who and what, one card per notice in order of
 * debt; the team sits under both, because it is a state and nobody has to act
 * on it. Every number on the scoreboard is a count the answer already carried —
 * see `todayFigures`.
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
  const cards = kinds.filter((kind) => kind !== 'team')
  const team = today.notices.team

  return (
    <div data-today-panel="board">
      <Scoreboard today={today} />

      {cards.length > 0 ? (
        <div data-today-board>
          {cards.map((kind) => (
            <Notice
              key={kind}
              kind={kind}
              notices={today.notices}
              organizationId={organizationId}
            />
          ))}
        </div>
      ) : null}

      {team ? <TeamState notice={team} organizationId={organizationId} /> : null}
    </div>
  )
}

/**
 * The head of the panel: the day it was read, whether anything waits, and the
 * counts.
 *
 * `today.empty` decides the sentence, not a count of the figures: `team` is a
 * state and never makes the day non-empty, so a workspace with nothing waiting
 * still has a figure for its team under that sentence.
 *
 * It carries the dark theme the sidebar carries. Only tokens are read inside
 * it, so every colour here answers to that theme and none is restated.
 */
function Scoreboard({ today }: { today: StudioToday }) {
  const figures = todayFigures(today.notices)

  return (
    <section
      data-today-scoreboard
      data-today-scoreboard-size={figures.length > 2 ? 'full' : 'brief'}
      data-afo-theme="dark"
      aria-labelledby="today-heading"
    >
      <div data-today-lead>
        <h2 id="today-heading" data-today-day>
          <time dateTime={today.generated_at}>
            {DAY_FORMATTER.format(new Date(today.generated_at))}
          </time>
        </h2>
        <p data-today-status>
          {today.empty ? 'Nada espera por ti ahora' : 'Esto necesita tu atención hoy'}
        </p>
        <p data-today-status-note>
          {today.empty
            ? 'Cuando una invitación, un vínculo o una sesión necesite tu atención aparecerá acá.'
            : 'Solo aparece lo que tu rol te permite resolver.'}
        </p>
      </div>

      {figures.length > 0 ? (
        <ul data-today-figures>
          {figures.map((figure) => (
            <li
              key={figure.key}
              data-today-figure={figure.key}
              data-today-figure-urgent={figure.urgent ? '' : undefined}
            >
              <strong data-today-figure-value>{figure.value}</strong>
              <span data-today-figure-label>{figure.label}</span>
              <span data-today-figure-detail>{figure.detail}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  )
}

/**
 * One notice, by the key the contract filed it under.
 *
 * Six explicit branches rather than a table of renderers: the notices share
 * three shapes and no words at all, and the shape is the lesser half of what
 * makes each one legible. The seventh notice, `team`, is a state and is drawn
 * by `TeamState` below the board.
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
    case 'team':
      return null
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
        <NoticeTitle count={notice.count} waiting>
          Personas sin profesional asignado
        </NoticeTitle>
        <CardDescription>Aceptaron la invitación y nadie las acompaña todavía.</CardDescription>
      </CardHeader>
      <CardContent>
        <ul data-today-rows>
          {notice.items.map((item) => (
            <li key={item.relationship_id}>
              <RowLink href={noticeRowHref(notice.link, organizationId, item)}>
                <PersonMark name={item.display_name} />
                <RowText
                  subject={item.display_name}
                  detail={`Desde el ${formatDate(item.started_at)}`}
                />
              </RowLink>
            </li>
          ))}
          <Remainder count={hiddenCount(notice)} href={noticeHref(notice.link, organizationId)} />
        </ul>
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
        <NoticeTitle count={notice.count} waiting>
          Solicitudes para terminar un vínculo
        </NoticeTitle>
        <CardDescription>Esperan una decisión de la organización.</CardDescription>
      </CardHeader>
      <CardContent>
        <ul data-today-rows>
          {notice.items.map((item) => (
            <li key={item.request_id}>
              <RowLink href={noticeRowHref(notice.link, organizationId, item)}>
                <PersonMark name={item.display_name} />
                <RowText
                  subject={item.display_name}
                  detail={`Pedida el ${formatDate(item.requested_at)}`}
                />
              </RowLink>
            </li>
          ))}
          <Remainder count={hiddenCount(notice)} href={noticeHref(notice.link, organizationId)} />
        </ul>
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
                <RowText
                  subject={item.contact}
                  detail={`${invitationExpiryPhrase(item.state)} ${formatDate(item.expires_at)}`}
                />
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
          <Remainder count={hiddenCount(notice)} href={href} />
        </ul>
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
 *
 * Beside the sentence, the week itself: one mark per session that was due. The
 * marks are hidden from assistive technology because the sentence already says
 * the count, and a row with no closed week draws none.
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
                <PersonMark name={item.display_name} />
                <RowText subject={item.display_name} detail={trainingRowSentence(item)} />
                <Ticks marks={weekTicks(item.closed_week)} slot="week" />
              </RowLink>
            </li>
          ))}
          <Remainder count={hiddenCount(notice)} href={noticeHref(notice.link, organizationId)} />
        </ul>
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
                <PersonMark name={item.display_name} />
                <RowText
                  subject={item.display_name}
                  detail={`Desde el ${formatDate(item.started_at)}`}
                />
              </div>
            </li>
          ))}
          <Remainder count={hiddenCount(notice)} href={href} />
        </ul>
      </CardContent>
    </Card>
  )
}

/**
 * How the team stands, which the contract calls a state: it never makes the day
 * non-empty. So it is a flat panel under the board and not a seventh card — the
 * page keeps one rank for what waits on somebody and a quieter one for how
 * things are.
 *
 * How many is on the scoreboard, so this says only how they divide: one mark
 * per member under each role, the same mark the training notice draws per
 * session. The names and the counts stay in text, so the marks add nothing a
 * reader of the text is missing.
 */
function TeamState({ notice, organizationId }: { notice: TodayTeam; organizationId: string }) {
  const href = noticeHref(notice.link, organizationId)
  const roles = teamRoles(notice.by_role)

  return (
    <section data-today-state aria-labelledby="today-team-heading">
      <div data-today-state-head>
        <h2 id="today-team-heading" data-today-state-title>
          Tu equipo
        </h2>
        {href ? <NoticeAction href={href}>Ver equipo</NoticeAction> : null}
      </div>
      {roles.length > 0 ? (
        <ul data-today-roles>
          {roles.map((role) => (
            <li key={role.role_code} data-today-role>
              <span data-today-role-name>
                <strong data-today-role-count>{role.count}</strong> {role.name}
              </span>
              <Ticks
                marks={role.marks > 0 ? Array.from({ length: role.marks }, () => 'logged') : null}
                slot="role"
              />
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  )
}

/**
 * The count belongs beside the title, because it is the first thing the reader
 * is after and the list below it is capped at five. The heading level is the
 * page's second: the `h1` is the organization, in the shell.
 *
 * `waiting` marks the two notices where a person waits on the organization, the
 * same two the scoreboard raises as its one urgent figure.
 */
function NoticeTitle({
  count,
  waiting = false,
  children,
}: {
  count: number
  waiting?: boolean
  children: string
}) {
  // The last word travels with the count, so a wrapped title never leaves the
  // count alone on a line. A no-break space does not hold a badge in Chromium.
  const lastWord = children.lastIndexOf(' ') + 1

  return (
    <CardTitle role="heading" aria-level={2}>
      {children.slice(0, lastWord)}
      <span data-today-notice-title-end>
        {children.slice(lastWord)}{' '}
        <Badge variant={waiting && count > 0 ? 'warning' : 'secondary'} data-today-notice-count>
          {count}
        </Badge>
      </span>
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
      <span data-today-row-go aria-hidden="true">
        <FoundationIcon name="forward" size="sm" decorative />
      </span>
    </Link>
  )
}

/** Who the row is about, over why she is on this notice. */
function RowText({ subject, detail }: { subject: string; detail: string }) {
  return (
    <span data-today-row-text>
      <strong data-today-row-subject>{subject}</strong>
      <span data-today-row-detail>{detail}</span>
    </span>
  )
}

/** Her initials, as the client directory draws them. The name beside it is the name. */
function PersonMark({ name }: { name: string }) {
  return (
    <Avatar decorative size="sm">
      <AvatarFallback>{clientInitials(name)}</AvatarFallback>
    </Avatar>
  )
}

/**
 * A row of marks: one per session of a week, or one per member of a role.
 *
 * Always hidden from assistive technology. Whatever these count is said in
 * words beside them, so a reader who cannot see them is missing nothing.
 */
function Ticks({
  marks,
  slot,
}: {
  marks: readonly ('logged' | 'missing')[] | null
  slot: 'week' | 'role'
}) {
  if (!marks) return null
  return (
    <span data-today-ticks={slot} aria-hidden="true">
      {marks.map((mark, index) => (
        // Position is identity here: the marks are a count, never reordered.
        <span key={index} data-today-tick={mark} />
      ))}
    </span>
  )
}

/**
 * What the notice covers beyond the rows it listed, as the last row of them.
 *
 * A link when a screen lists the rest, plain text when none does. Saying "y 7
 * más" and leading nowhere is honest; a button to a screen that cannot filter
 * to those seven would not be.
 */
function Remainder({ count, href }: { count: number; href: string | null }) {
  if (count === 0) return null

  const words = `y ${count} más`
  return (
    <li data-today-remainder>
      {href ? (
        <Link href={href} data-today-row data-today-row-link>
          <span data-today-row-text>{words}</span>
          <span data-today-row-go aria-hidden="true">
            <FoundationIcon name="forward" size="sm" decorative />
          </span>
        </Link>
      ) : (
        <p data-today-row>{words}</p>
      )}
    </li>
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
 * The shape the panel will take, not a guess at how much is in it: a scoreboard
 * and two notices, which is what a coach who also administers usually has
 * waiting.
 */
function LoadingPanel() {
  return (
    <div data-today-panel="board">
      <Skeleton data-today-scoreboard-placeholder />
      <div data-today-board>
        <Skeleton data-today-notice-placeholder />
        <Skeleton data-today-notice-placeholder />
      </div>
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
