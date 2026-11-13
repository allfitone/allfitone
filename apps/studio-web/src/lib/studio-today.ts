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
import type { StudioToday, TodayLink, TodayTeam, TodayTraining } from './studio-api'

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
 * The team by role, in the order the server sent it.
 *
 * The role catalogue is the server's. A code this app has no word for means the
 * catalogue grew, so the code itself stands in — the same answer the client
 * card gives for a category the catalogue did not name.
 */
export function teamRoleSummary(byRole: TodayTeam['by_role']): string {
  return byRole.map((role) => `${role.count} ${organizationRoleName(role.role_code)}`).join(' · ')
}
