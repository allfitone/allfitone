/**
 * «Avisos» (`NT-1`, `NT-2`): what each notice says, how it is marked, when it happened,
 * and where it opens. HU-SP-091, ADR-054.
 *
 * **A notice holds no words.** The API answers a kind, the subject it points to and, at
 * most, three names; the sentence is written here from the dictionary in her language.
 * A name the API could not give (a gym renamed away, a professional gone) falls back to
 * «Tu gimnasio» or «Tu coach» rather than leaving a hole in the sentence.
 *
 * **«Awaits your decision» is the API's to say**, read from the subject at list time. A
 * notice that awaited and no longer does keeps its title and says so in its line, and
 * loses its action word: a «Decidir» on something already decided is a lie.
 *
 * **Where a notice opens is chosen by its subject, not its kind.** An invitation still
 * pending opens its own screen; one already answered opens the gyms, where its outcome
 * lives. A notice with nowhere better to go opens nothing rather than a guess.
 *
 * Times are calendar days in her zone: «Ayer» is the day before today where she is,
 * not twenty-four hours ago.
 */

import type { AllfitV1Schemas } from '@allfitone/contracts'
import type { IconName } from '@allfitone/icons'

import type { Dictionary } from '../i18n'

export type Notice = AllfitV1Schemas['SpaceNotice']
export type NoticePage = AllfitV1Schemas['SpaceNoticePage']
export type NoticeKind = AllfitV1Schemas['SpaceNoticeKind']
export type NoticeFilter = 'all' | 'awaiting'

type NoticesText = Dictionary['notices']

/** The tile's tone, from the design system's badge tones; `quiet` is the plain tile. */
export type NoticeTone = 'accent' | 'warning' | 'sport' | 'success' | 'quiet'

const LOOK: Readonly<Record<NoticeKind, { icon: IconName; tone: NoticeTone }>> = {
  client_invitation: { icon: 'organization', tone: 'accent' },
  cover_proposed: { icon: 'people', tone: 'warning' },
  correction_proposed: { icon: 'edit', tone: 'sport' },
  goal_proposed: { icon: 'target', tone: 'success' },
  professional_changed: { icon: 'person', tone: 'quiet' },
  relationship_ended: { icon: 'organization', tone: 'quiet' },
  plan_paused: { icon: 'warning', tone: 'warning' },
  plan_resumed: { icon: 'organization', tone: 'quiet' },
  plan_ended: { icon: 'organization', tone: 'quiet' },
  program_assigned: { icon: 'weight', tone: 'quiet' },
  password_changed: { icon: 'permissions', tone: 'quiet' },
  email_changed: { icon: 'permissions', tone: 'quiet' },
}

/** The glyph and the tint of its tile: the kinds that ask for a decision are coloured. */
export function noticeLook(kind: NoticeKind): {
  readonly icon: IconName
  readonly tone: NoticeTone
} {
  return LOOK[kind]
}

export interface NoticeWords {
  readonly title: string
  readonly line: string
  /** The word on the row's action, only while the notice awaits her. */
  readonly action?: string
}

/** The sentence of a notice in her language, from its kind and the names it carries. */
export function noticeWords(notice: Notice, text: NoticesText): NoticeWords {
  const gym = notice.names.organization ?? text.fallback.gym
  const professional = notice.names.professional ?? text.fallback.professional
  const kinds = text.kinds
  const waiting = (title: string, line: string, action: string): NoticeWords =>
    notice.awaiting ? { title, line, action } : { title, line: text.closed }

  switch (notice.kind) {
    case 'client_invitation':
      return waiting(
        kinds.client_invitation.title(notice.names.organization ?? text.fallback.aGym),
        kinds.client_invitation.line,
        text.actions.see,
      )
    case 'cover_proposed':
      return waiting(
        kinds.cover_proposed.title,
        kinds.cover_proposed.line(professional, gym),
        text.actions.decide,
      )
    case 'correction_proposed':
      return waiting(
        kinds.correction_proposed.title(professional),
        kinds.correction_proposed.line,
        text.actions.review,
      )
    case 'goal_proposed':
      return waiting(
        kinds.goal_proposed.title,
        kinds.goal_proposed.line(professional),
        text.actions.decide,
      )
    case 'professional_changed':
      return {
        title: kinds.professional_changed.title,
        line: kinds.professional_changed.line(professional, gym),
      }
    case 'relationship_ended':
      return { title: kinds.relationship_ended.title(gym), line: kinds.relationship_ended.line }
    case 'plan_paused':
      return { title: kinds.plan_paused.title(gym), line: kinds.plan_paused.line }
    case 'plan_resumed':
      return { title: kinds.plan_resumed.title(gym), line: kinds.plan_resumed.line }
    case 'plan_ended':
      return { title: kinds.plan_ended.title(gym), line: kinds.plan_ended.line }
    case 'program_assigned':
      return {
        title: kinds.program_assigned.title,
        line: kinds.program_assigned.line(notice.names.program),
      }
    case 'password_changed':
      return { title: kinds.password_changed.title, line: kinds.password_changed.line }
    case 'email_changed':
      return { title: kinds.email_changed.title, line: kinds.email_changed.line }
  }
}

/** The calendar date an instant falls on in a zone; `en-CA` writes it as `2026-11-25`. */
function partsIn(instant: Date, timeZone: string) {
  const [year, month, day] = new Intl.DateTimeFormat('en-CA', { timeZone })
    .format(instant)
    .split('-')
    .map(Number)
  return { year: year ?? 1970, month: month ?? 1, day: day ?? 1 }
}

/** That date as a count of days since 1970, so two dates subtract into calendar days. */
function dayNumber(instant: Date, timeZone: string): number {
  const { year, month, day } = partsIn(instant, timeZone)
  return Math.round(Date.UTC(year, month - 1, day) / 86_400_000)
}

const MINUTE = 60_000
const HOUR = 60 * MINUTE

/** «Ahora», «Hace 5 min», «Hace 2 h», «Ayer», «Lun 28» within the week, «20 sep» before. */
export function noticeTime(
  occurredAt: string,
  now: Date,
  timeZone: string,
  text: NoticesText,
  months: readonly string[],
): string {
  const at = new Date(occurredAt)
  const elapsed = Math.max(0, now.getTime() - at.getTime())
  const days = dayNumber(now, timeZone) - dayNumber(at, timeZone)
  if (days <= 0) {
    if (elapsed < MINUTE) return text.time.now
    if (elapsed < HOUR) return text.time.minutes(Math.floor(elapsed / MINUTE))
    return text.time.hours(Math.floor(elapsed / HOUR))
  }
  if (days === 1) return text.time.yesterday
  const parts = partsIn(at, timeZone)
  if (days < 7) {
    const weekday = new Date(Date.UTC(parts.year, parts.month - 1, parts.day)).getUTCDay()
    return text.time.weekday(text.time.weekdays[weekday] ?? '', parts.day)
  }
  const sameYear = partsIn(now, timeZone).year === parts.year
  return text.time.date(parts.day, months[parts.month - 1] ?? '', sameYear ? null : parts.year)
}

/** «Vence en 29 días» while it awaits and has an expiry; nothing otherwise. */
export function expiryLine(
  notice: Pick<Notice, 'awaiting' | 'expires_at'>,
  now: Date,
  timeZone: string,
  text: NoticesText,
): string | undefined {
  if (!notice.awaiting || notice.expires_at === null) return undefined
  const days = dayNumber(new Date(notice.expires_at), timeZone) - dayNumber(now, timeZone)
  if (days <= 0) return text.expires.today
  if (days === 1) return text.expires.tomorrow
  return text.expires.days(days)
}

/** The row's last line: when it happened and, while it awaits, when it stops waiting. */
export function noticeMeta(
  notice: Notice,
  now: Date,
  timeZone: string,
  text: NoticesText,
  months: readonly string[],
): string {
  const time = noticeTime(notice.occurred_at, now, timeZone, text, months)
  const expiry = expiryLine(notice, now, timeZone, text)
  return expiry ? `${time} · ${expiry}` : time
}

export interface NoticeGroups {
  readonly awaiting: readonly Notice[]
  readonly informational: readonly Notice[]
}

/** «Esperan tu decisión» first and «Para que sepas» after, each newest first as listed. */
export function groupNotices(items: readonly Notice[]): NoticeGroups {
  return {
    awaiting: items.filter((notice) => notice.awaiting),
    informational: items.filter((notice) => !notice.awaiting),
  }
}

/** The listing's path; the cursor is opaque and travels as the API gave it, encoded. */
export function noticesPath(filter: NoticeFilter, cursor?: string | null): string {
  const after = cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''
  return `/space/v1/notices?filter=${filter}${after}`
}

/** A further page appended to what is held, never listing a notice twice. */
export function appendNotices(held: readonly Notice[], page: readonly Notice[]): Notice[] {
  const seen = new Set(held.map((notice) => notice.id))
  return [...held, ...page.filter((notice) => !seen.has(notice.id))]
}

/** The list with one notice replaced by what the API answered for it. */
export function replaceNotice(items: readonly Notice[], updated: Notice): Notice[] {
  return items.map((notice) => (notice.id === updated.id ? updated : notice))
}

/** Whether the bell carries its dot: something waits on her decision. */
export function bellHasDot(page: Pick<NoticePage, 'awaiting_count'> | undefined): boolean {
  return (page?.awaiting_count ?? 0) > 0
}

/** Where a notice opens, as a route the app has; null when it opens nothing. */
export type NoticeDestination =
  | { readonly pathname: '/invitation'; readonly params: { readonly id: string } }
  | { readonly pathname: '/gyms' }
  | {
      readonly pathname: '/gyms/[relationshipId]'
      readonly params: { readonly relationshipId: string }
    }
  | { readonly pathname: '/subscriptions' }
  | {
      readonly pathname: '/subscriptions/[organizationId]'
      readonly params: { readonly organizationId: string }
    }
  | { readonly pathname: '/programs' }
  | { readonly pathname: '/corrections' }
  | {
      readonly pathname: '/corrections/[proposalId]'
      readonly params: { readonly proposalId: string }
    }
  | { readonly pathname: '/nutrition/proposal/[id]'; readonly params: { readonly id: string } }
  | { readonly pathname: '/nutrition/goal' }
  | { readonly pathname: '/me/identity' }

export function noticeDestination(notice: Notice): NoticeDestination | null {
  const { type, id } = notice.subject
  switch (type) {
    case 'invitation':
      return notice.awaiting ? { pathname: '/invitation', params: { id } } : { pathname: '/gyms' }
    // A cover is answered from the gyms, where every proposed cover waits on her.
    case 'relationship_professional_assignment':
      return { pathname: '/gyms' }
    case 'service_relationship':
      return { pathname: '/gyms/[relationshipId]', params: { relationshipId: id } }
    case 'plan_subscription':
      return notice.organization_id
        ? {
            pathname: '/subscriptions/[organizationId]',
            params: { organizationId: notice.organization_id },
          }
        : { pathname: '/subscriptions' }
    case 'program_assignment':
      return { pathname: '/programs' }
    case 'correction_proposal':
      return notice.awaiting
        ? { pathname: '/corrections/[proposalId]', params: { proposalId: id } }
        : { pathname: '/corrections' }
    case 'nutrition_goal_version':
      return notice.awaiting
        ? { pathname: '/nutrition/proposal/[id]', params: { id } }
        : { pathname: '/nutrition/goal' }
    case 'password_change':
    case 'identity_action_request':
      return { pathname: '/me/identity' }
  }
}

/** The name a screen reader says for a row: its words, its state and when. */
export function noticeLabel(
  words: NoticeWords,
  meta: string,
  unread: boolean,
  text: NoticesText,
): string {
  return [unread ? text.unread : undefined, words.title, words.line, meta, words.action]
    .filter((part): part is string => part !== undefined)
    .join('. ')
}
