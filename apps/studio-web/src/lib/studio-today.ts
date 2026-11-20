/**
 * What the panel of «qué necesita atención hoy» decides before it draws
 * anything.
 *
 * `OP-REL-020` sends one notice per thing the caller's roles let her resolve
 * and nothing for what they do not. **An absent notice is the answer, not a
 * gap.** So this screen renders what arrived and never re-asks a role of its
 * own: a second opinion here would be a second source of truth for a decision
 * PostgreSQL already made, and the one the client could reach is the weaker of
 * the two.
 *
 * Each notice names the operation that resolves it. The contract can say that
 * much and no more, because where an operation lives is a fact of this app —
 * which is the one thing this module owns.
 */
import { clientCardPath } from './client-card'
import { relationshipPath } from './client-directory'
import { organizationRoleName } from './team-directory'
import type {
  StudioToday,
  TodayLink,
  TodayProfessionalLoad,
  TodayRelationshipChanges,
  TodayTeam,
  TodayTraining,
  TodayTrainingAdherence,
} from './studio-api'

export type TodayNoticeKind = keyof StudioToday['notices']

type TodayOperation = TodayLink['operation_id']

/**
 * The order the panel reads them in, which is an order of debt rather than of
 * novelty: somebody waiting on us comes before our own paperwork, and a state
 * nobody has to act on comes last.
 *
 * `Record<TodayNoticeKind, …>` is load-bearing. A notice the contract adds and
 * this table forgets would stop the build here instead of never rendering.
 */
const READING_ORDER: Readonly<Record<TodayNoticeKind, number>> = {
  // A person accepted and has nobody attending her. She is already waiting.
  unassigned_relationships: 1,
  termination_requests: 2,
  client_invitations: 3,
  training: 4,
  team_invitations: 5,
  new_relationships: 6,
  // A state, and the contract says it never makes the day non-empty.
  team: 7,
}

/**
 * The notices that arrived, in that order.
 *
 * Only the keys that are there, because `exactOptionalPropertyTypes` makes a
 * present key a present notice: what the caller's roles did not allow is
 * missing from the object, never sitting in it empty.
 */
export function noticesInReadingOrder(notices: StudioToday['notices']): readonly TodayNoticeKind[] {
  return (Object.keys(notices) as TodayNoticeKind[]).sort(
    (left, right) => READING_ORDER[left] - READING_ORDER[right],
  )
}

/*
 * Where each operation a notice can name lives in this app, and whether it
 * opens a list or acts on one thing.
 *
 * Three open a list, and the notice's own query narrows it — dropping that
 * query would promise a filtered screen and deliver an unfiltered one. The
 * other three act on one thing, so the destination belongs to the row and the
 * notice as a whole has none: no screen in Studio lists the links nobody
 * attends, which is why the remainder beyond five rows is text there, never a
 * button to somewhere that does not exist.
 */
type Destination =
  | { readonly opens: 'list'; readonly path: (organizationId: string) => string }
  | { readonly opens: 'relationship' }
  | { readonly opens: 'person' }

const DESTINATIONS: Readonly<Record<TodayOperation, Destination>> = {
  listStudioOrganizationClients: {
    opens: 'list',
    path: (organizationId) => `/organizations/${organizationId}/clients`,
  },
  listStudioTeamInvitations: {
    opens: 'list',
    path: (organizationId) => `/organizations/${organizationId}/team/invitations`,
  },
  listStudioOrganizationMemberships: {
    opens: 'list',
    path: (organizationId) => `/organizations/${organizationId}/team`,
  },
  assignRelationshipHolder: { opens: 'relationship' },
  terminateRelationship: { opens: 'relationship' },
  getStudioClientCard: { opens: 'person' },
}

/** Where the whole notice leads, when its operation opens a list. */
export function noticeHref(link: TodayLink, organizationId: string): string | null {
  const destination = DESTINATIONS[link.operation_id]
  if (destination.opens !== 'list') return null

  const query = new URLSearchParams(link.query).toString()
  const path = destination.path(organizationId)
  return query ? `${path}?${query}` : path
}

/** Where one row leads, when the operation acts on one thing. */
export function noticeRowHref(
  link: TodayLink,
  organizationId: string,
  row: { relationship_id: string; person_id: string },
): string | null {
  const destination = DESTINATIONS[link.operation_id]
  if (destination.opens === 'relationship') {
    return relationshipPath(organizationId, row.relationship_id)
  }
  if (destination.opens === 'person') return clientCardPath(organizationId, row.person_id)
  return null
}

/**
 * How many the notice covers beyond the rows it listed. The contract caps every
 * notice at five items while counting everything, so the difference is real
 * information and not a rounding of it.
 */
export function hiddenCount(notice: { count: number; items: readonly unknown[] }): number {
  return Math.max(0, notice.count - notice.items.length)
}

/**
 * Why one client is on the training notice, in one line.
 *
 * The contract puts her here for either of two reasons and can send both at
 * once, so both clauses are optional and neither may be assumed. A row with
 * neither would be a server defect; it still has to read as a sentence rather
 * than as a blank.
 */
export function trainingRowSentence(item: TodayTraining['items'][number]): string {
  const clauses: string[] = []
  const week = item.closed_week

  if (week && week.not_logged > 0) {
    const sessions = week.planned === 1 ? 'sesión' : 'sesiones'
    clauses.push(`${week.not_logged} de ${week.planned} ${sessions} sin registrar`)
  }
  if (item.recent_results.count > 0) {
    const results = item.recent_results.count === 1 ? 'resultado nuevo' : 'resultados nuevos'
    clauses.push(`${item.recent_results.count} ${results}`)
  }

  return clauses.length > 0 ? clauses.join(' · ') : 'Sin nada pendiente esta semana'
}

/** Whether an invitation is still waiting for an answer or ran out of time. */
export function invitationStateLabel(state: 'awaiting' | 'lapsed'): string {
  return state === 'awaiting' ? 'Sin responder' : 'Vencida'
}

/**
 * Said about the deadline, in the tense its state puts it in. A lapsed
 * invitation's date is in the past, and "vence" read as a promise that it still
 * had time left.
 */
export function invitationExpiryPhrase(state: 'awaiting' | 'lapsed'): string {
  return state === 'awaiting' ? 'Vence el' : 'Venció el'
}

/**
 * One figure at the head of the panel.
 *
 * `urgent` is the one tone the scoreboard raises, and only a decision the
 * organization owes somebody earns it: an invitation waits on the other
 * person, and a team is a state.
 */
export interface TodayFigure {
  readonly key: 'decisions' | 'training' | 'invitations' | 'new_clients' | 'team'
  readonly value: number
  readonly label: string
  readonly detail: string
  readonly urgent: boolean
}

/**
 * The scoreboard: the counts the notices already carry, grouped by what the
 * reader does about them and in the same order of debt as the cards below.
 *
 * Seven notices make five figures, because two pairs are one question each —
 * who is waiting on a decision, and which invitations are still open. A group
 * with no notice has no figure: what the caller's roles do not allow is absent
 * here exactly as it is absent from the answer.
 */
export function todayFigures(notices: StudioToday['notices']): readonly TodayFigure[] {
  const figures: TodayFigure[] = []

  const unassigned = notices.unassigned_relationships
  const terminations = notices.termination_requests
  if (unassigned || terminations) {
    const value = (unassigned?.count ?? 0) + (terminations?.count ?? 0)
    figures.push({
      key: 'decisions',
      value,
      label: 'Por decidir',
      detail:
        parts([
          [unassigned?.count ?? 0, 'sin profesional'],
          [terminations?.count ?? 0, 'por terminar'],
        ]) || 'nada pendiente',
      urgent: value > 0,
    })
  }

  if (notices.training) {
    const { count } = notices.training
    figures.push({
      key: 'training',
      value: count,
      label: 'Por revisar',
      detail: count === 1 ? 'cliente tuyo esta semana' : 'clientes tuyos esta semana',
      urgent: false,
    })
  }

  const invited = [notices.client_invitations, notices.team_invitations].filter(
    (notice) => notice !== undefined,
  )
  if (invited.length > 0) {
    const awaiting = invited.reduce((sum, notice) => sum + notice.awaiting, 0)
    const lapsed = invited.reduce((sum, notice) => sum + notice.lapsed, 0)
    figures.push({
      key: 'invitations',
      value: invited.reduce((sum, notice) => sum + notice.count, 0),
      label: 'Invitaciones',
      detail:
        parts([
          [awaiting, 'sin responder'],
          [lapsed, lapsed === 1 ? 'vencida' : 'vencidas'],
        ]) || 'nada pendiente',
      urgent: false,
    })
  }

  if (notices.new_relationships) {
    figures.push({
      key: 'new_clients',
      value: notices.new_relationships.count,
      label: 'Clientes nuevos',
      detail: 'en los últimos 7 días',
      urgent: false,
    })
  }

  if (notices.team) {
    const { count } = notices.team
    figures.push({
      key: 'team',
      value: count,
      label: 'Equipo',
      detail: count === 1 ? 'integrante con rol vigente' : 'integrantes con rol vigente',
      urgent: false,
    })
  }

  return figures
}

/** The parts of a figure that count something, joined as this module joins. */
function parts(counted: readonly (readonly [count: number, words: string])[]): string {
  return counted
    .filter(([count]) => count > 0)
    .map(([count, words]) => `${count} ${words}`)
    .join(' · ')
}

/** Past three sessions a day the marks stop being countable at a glance. */
const MOST_TICKS = 21

/**
 * A client's last closed week as one mark per session that was due: the ones
 * she logged, then the ones she did not.
 *
 * `null` when there is no week to draw. The row's sentence carries the same
 * count in words, so a week this does not draw is still said.
 */
export function weekTicks(
  week: TodayTraining['items'][number]['closed_week'],
): readonly ('logged' | 'missing')[] | null {
  if (!week || week.planned > MOST_TICKS) return null

  const missing = Math.min(week.planned, Math.max(0, week.not_logged))
  return [
    ...Array.from({ length: week.planned - missing }, () => 'logged' as const),
    ...Array.from({ length: missing }, () => 'missing' as const),
  ]
}

/**
 * The team by role, in the order the server sent it, one mark per member who
 * holds it.
 *
 * The role catalogue is the server's. A code this app has no word for means the
 * catalogue grew, so the code itself stands in — the same answer the client
 * card gives for a category the catalogue did not name.
 *
 * The mark is the one the training notice draws per session, so the panel
 * counts people and sessions in one vocabulary. A role too large to count at a
 * glance keeps its number and draws nothing: a row capped at twenty-one would
 * say twenty-one.
 */
export function teamRoles(byRole: TodayTeam['by_role']): readonly {
  readonly role_code: string
  readonly name: string
  readonly count: number
  readonly marks: number
}[] {
  return byRole.map((role) => ({
    role_code: role.role_code,
    name: organizationRoleName(role.role_code),
    count: role.count,
    marks: role.count > MOST_TICKS ? 0 : role.count,
  }))
}

/*
 * The indicators: how the organization is doing, which the contract sends
 * beside the notices and under the same rule. One the caller's roles do not
 * open is absent, and an answer from a database older than the indicators has
 * none at all. Both are answers, so nothing below invents a value for either.
 *
 * Dates arrive as calendar dates (`2026-09-21`, `2026-12`) and are read as
 * such, by their digits. Passing them through a `Date` would hand them to the
 * browser's timezone, and a Monday would become a Sunday west of Greenwich.
 * The month names are spelled here for the same reason a test can pin them:
 * what `Intl` abbreviates «septiembre» to differs from one engine to the next.
 */
const MONTHS = [
  ['ene', 'enero'],
  ['feb', 'febrero'],
  ['mar', 'marzo'],
  ['abr', 'abril'],
  ['may', 'mayo'],
  ['jun', 'junio'],
  ['jul', 'julio'],
  ['ago', 'agosto'],
  ['sep', 'septiembre'],
  ['oct', 'octubre'],
  ['nov', 'noviembre'],
  ['dic', 'diciembre'],
] as const

/** The month a `YYYY-MM` or `YYYY-MM-DD` value names, with its year and day. */
function calendar(value: string): {
  readonly year: string
  readonly short: string
  readonly long: string
  readonly day: number | null
} | null {
  const match = /^(\d{4})-(\d{2})(?:-(\d{2}))?$/.exec(value)
  const names = match ? MONTHS[Number(match[2]) - 1] : undefined
  if (!match || !names) return null
  return {
    year: match[1] ?? '',
    short: names[0],
    long: names[1],
    day: match[3] ? Number(match[3]) : null,
  }
}

/**
 * One closed week of the adherence chart.
 *
 * A type and not an interface: the chart takes rows it can index by any key,
 * and an interface has no index signature to offer it.
 */
export type AdherenceWeek = {
  /** The Monday it began on, as the contract sent it. */
  starts_on: string
  /** That Monday as an axis has room for it: «21 sep». */
  week: string
  /** Logged out of due, as a whole percentage. `null` when nothing was due. */
  rate: number | null
  planned: number
  logged: number
}

/**
 * The weeks the server sent, each with its rate.
 *
 * **Nothing due is not zero.** A week that asked for no session has no rate,
 * and the chart leaves a gap there: nobody fell short of a week with nothing
 * in it.
 *
 * **Rounding never changes the answer to «all of them?» or «none?».** 199 of
 * 200 is 99 and one of 300 is 1, because 100 and 0 are the two figures a coach
 * reads as a fact about every session.
 */
export function adherenceWeeks(adherence: TodayTrainingAdherence): readonly AdherenceWeek[] {
  return adherence.weeks.map((week) => {
    const date = calendar(week.week_starts_on)
    return {
      starts_on: week.week_starts_on,
      week: date?.day ? `${date.day} ${date.short}` : week.week_starts_on,
      rate: adherenceRate(week.planned, week.logged),
      planned: week.planned,
      logged: week.logged,
    }
  })
}

function adherenceRate(planned: number, logged: number): number | null {
  if (planned <= 0) return null
  if (logged >= planned) return 100
  if (logged <= 0) return 0
  return Math.min(99, Math.max(1, Math.round((logged / planned) * 100)))
}

/** Whether any week has a rate, which is whether there is a line to draw. */
export function adherenceHasSessions(weeks: readonly AdherenceWeek[]): boolean {
  return weeks.some((week) => week.rate !== null)
}

/** A week named in full, for the tooltip and for who reads the table. */
export function adherenceWeekName(week: AdherenceWeek): string {
  const date = calendar(week.starts_on)
  return `Semana del ${date?.day ? `${date.day} de ${date.long}` : week.starts_on}`
}

/** The rate with the two counts it came from, which the axis has no room for. */
export function adherenceWeekValue(week: AdherenceWeek): string {
  const sessions = week.planned === 1 ? 'sesión' : 'sesiones'
  return `${week.rate ?? 0} % · ${week.logged} de ${week.planned} ${sessions}`
}

/** One month of relationships begun and ended. A type, as `AdherenceWeek` is. */
export type RelationshipMonth = {
  /** The month as the contract sent it: `2026-06`. */
  key: string
  /** As an axis has room for it: «jun». */
  month: string
  started: number
  ended: number
}

/** The months the server sent, oldest first, each with a name for the axis. */
export function relationshipMonths(
  changes: TodayRelationshipChanges,
): readonly RelationshipMonth[] {
  return changes.months.map((month) => ({
    key: month.month,
    month: calendar(month.month)?.short ?? month.month,
    started: month.started,
    ended: month.ended,
  }))
}

/**
 * A month named in full with its year: six months can cross a new year. It
 * opens a tooltip and a table row, so it takes the capital a sentence would.
 */
export function relationshipMonthName(month: RelationshipMonth): string {
  const date = calendar(month.key)
  if (!date) return month.key
  return `${date.long.charAt(0).toUpperCase()}${date.long.slice(1)} de ${date.year}`
}

/** Whether anything began or ended. Six months of zeros are said, not plotted. */
export function relationshipsChanged(months: readonly RelationshipMonth[]): boolean {
  return months.some((month) => month.started > 0 || month.ended > 0)
}

/**
 * The clients each professional holds, in the order the server sent: most
 * first, and whoever holds nobody still listed, because that is who the next
 * client can be given to.
 */
export function professionalLoadRows(
  load: TodayProfessionalLoad,
): readonly { readonly id: string; readonly label: string; readonly value: number }[] {
  return load.items.map((item) => ({
    id: item.membership_id,
    label: item.display_name,
    value: item.clients,
  }))
}
