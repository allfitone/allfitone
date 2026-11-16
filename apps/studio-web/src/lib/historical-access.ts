/**
 * Opening a case to read a relationship the organization ended: `HU-STUDIO-061`,
 * and how a case stands once it exists.
 *
 * `OP-PRV-018` decides everything that matters, in PostgreSQL. This module only
 * keeps the screen from offering what the command would refuse, and says the
 * refusals it cannot prevent in words a manager can act on.
 *
 * **Opening is not reading** (criterion 1). `manage_historical_access` opens a
 * case and reads nothing; only the membership the case names reads, while the
 * case is open. So the capability is read from the role catalogue, as every other
 * screen does, and it never decides whether the history can be read.
 *
 * **The purposes are a closed list** (criteria 2 and 3). The five here are the
 * contract's enum. The invalid ones are not offered, not even as examples to
 * avoid: naming them would put them on the screen.
 *
 * **The duration is chosen, never defaulted** (criterion 4). The contract needs
 * one to twenty-four hours, and a default would choose for the person.
 *
 * **One membership, and only two can be it** (criterion 5). The opener, or the
 * coach who held the relationship when it ended. No read names that coach, but
 * ending a relationship closes the holder's assignment at the same instant
 * (`terminate` sets `valid_to = ended_at`), so the history's `holder_ended` at the
 * cut is that coach. Whether they still qualify, and that staff never does, is the
 * database's check; the screen says it when the answer is 422.
 *
 * **A sign-in less than ten minutes old** (criterion 6). The command answers 403
 * `reauthentication-required`, and the screen sends the person to sign in again
 * instead of showing an error with no way out.
 */
import type {
  HistoricalAccessCase,
  HistoricalAccessCaseCreate,
  HistoricalAccessPurpose,
  HistoricalCaseMember,
  OrganizationRole,
  RelationshipHistoryEvent,
} from './studio-api'

const MANAGE_HISTORICAL_ACCESS = 'manage_historical_access'

export function canManageHistoricalAccess(
  roles: readonly string[],
  catalog: readonly OrganizationRole[] | undefined,
): boolean {
  if (!catalog?.length) return false
  return roles.some((role) =>
    catalog
      .find((entry) => entry.code === role)
      ?.capabilities.some((capability) => capability.code === MANAGE_HISTORICAL_ACCESS),
  )
}

export const HISTORICAL_PURPOSES: readonly {
  value: HistoricalAccessPurpose
  label: string
  hint: string
}[] = [
  {
    value: 'service_dispute',
    label: 'Disputa del servicio',
    hint: 'Un reclamo sobre lo que se le prestó o se le cobró.',
  },
  {
    value: 'legal_or_regulatory_obligation',
    label: 'Obligación legal o regulatoria',
    hint: 'Un requerimiento de una autoridad o una obligación que nos impone la ley.',
  },
  {
    value: 'customer_support_request',
    label: 'Solicitud de soporte de la persona',
    hint: 'La propia persona nos pidió revisar algo de su historial.',
  },
  {
    value: 'security_investigation',
    label: 'Investigación de seguridad',
    hint: 'Un incidente de seguridad que hay que esclarecer.',
  },
  {
    value: 'authorized_quality_review',
    label: 'Revisión de calidad autorizada',
    hint: 'Una revisión del servicio aprobada formalmente.',
  },
]

export function purposeLabel(purpose: HistoricalAccessPurpose): string {
  return HISTORICAL_PURPOSES.find((entry) => entry.value === purpose)?.label ?? purpose
}

export function isHistoricalPurpose(value: unknown): value is HistoricalAccessPurpose {
  return HISTORICAL_PURPOSES.some((entry) => entry.value === value)
}

export const HISTORICAL_DURATIONS: readonly number[] = Array.from(
  { length: 24 },
  (_, index) => index + 1,
)

export function durationLabel(hours: number): string {
  return hours === 1 ? '1 hora' : `${String(hours)} horas`
}

export interface CaseDraftRelationship {
  readonly id: string
  readonly name: string
  readonly endedAt: string
}

export interface CaseDraft {
  readonly relationship: CaseDraftRelationship | null
  /** The membership the case authorizes. */
  readonly authorized: string | null
  readonly purpose: HistoricalAccessPurpose | null
  readonly reference: string
  readonly justification: string
  readonly hours: number | null
}

export function emptyCaseDraft(): CaseDraft {
  return {
    relationship: null,
    authorized: null,
    purpose: null,
    reference: '',
    justification: '',
    hours: null,
  }
}

export const REFERENCE_MAX = 120
export const JUSTIFICATION_MAX = 2000

export type CaseDraftField =
  'relationship' | 'authorized' | 'purpose' | 'reference' | 'justification' | 'hours'

export function caseDraftProblems(draft: CaseDraft): Partial<Record<CaseDraftField, string>> {
  const problems: Partial<Record<CaseDraftField, string>> = {}
  if (!draft.relationship)
    problems.relationship = 'Elige la relación terminada que vas a consultar.'
  if (!draft.authorized) problems.authorized = 'Elige a quién autoriza el caso.'
  if (!draft.purpose) problems.purpose = 'Elige el propósito del caso.'
  const reference = draft.reference.trim()
  if (!reference) problems.reference = 'Escribe la referencia del caso.'
  else if (reference.length > REFERENCE_MAX)
    problems.reference = `La referencia admite hasta ${String(REFERENCE_MAX)} caracteres.`
  const justification = draft.justification.trim()
  if (!justification) problems.justification = 'Escribe por qué hace falta consultar el historial.'
  else if (justification.length > JUSTIFICATION_MAX)
    problems.justification = `La justificación admite hasta ${String(JUSTIFICATION_MAX)} caracteres.`
  if (draft.hours === null) problems.hours = 'Elige cuántas horas dura el caso.'
  return problems
}

export function openCaseRequest(draft: CaseDraft): HistoricalAccessCaseCreate | null {
  const { relationship, authorized, purpose, hours } = draft
  if (Object.keys(caseDraftProblems(draft)).length > 0) return null
  if (!relationship || !authorized || !purpose || hours === null) return null
  return {
    relationship_id: relationship.id,
    authorized_membership_id: authorized,
    purpose,
    case_reference: draft.reference.trim(),
    justification: draft.justification.trim(),
    duration_hours: hours,
  }
}

export interface FormerHolder {
  readonly membershipId: string
  readonly name: string
}

/**
 * The coach whose assignment ended at the cut, which is the only coach a case may
 * authorize. One replaced before the end ended earlier, so it never matches.
 */
export function formerHolder(
  events: readonly RelationshipHistoryEvent[],
  endedAt: string,
): FormerHolder | null {
  const cut = Date.parse(endedAt)
  for (const entry of events) {
    if (entry.type !== 'holder_ended' || Date.parse(entry.occurred_at) !== cut) continue
    const membershipId = entry.detail.membership_id
    const name = entry.detail.display_name
    if (typeof membershipId === 'string' && membershipId) {
      return { membershipId, name: typeof name === 'string' && name ? name : 'Su coach' }
    }
  }
  return null
}

export interface AuthorizationChoice {
  readonly value: string
  readonly label: string
  readonly hint: string
}

export function authorizationChoices(
  myMembershipId: string,
  holder: FormerHolder | null,
): AuthorizationChoice[] {
  const me: AuthorizationChoice = {
    value: myMembershipId,
    label: 'A ti',
    hint: 'Tú abres el caso y tú consultas el historial.',
  }
  if (!holder || holder.membershipId === myMembershipId) return [me]
  return [
    me,
    {
      value: holder.membershipId,
      label: holder.name,
      hint: 'La atendía cuando terminó la relación, y es quien consulta el historial.',
    },
  ]
}

export type OpenCaseFailure = { kind: 'reauthenticate' } | { kind: 'message'; text: string }

export function openCaseFailure(status: number, code: string): OpenCaseFailure {
  if (status === 403 && code === 'reauthentication-required') return { kind: 'reauthenticate' }
  if (status === 403) {
    return {
      kind: 'message',
      text: 'Tu rol ya no abre casos en esta organización. Lo hacen propietario y administración.',
    }
  }
  if (status === 404) {
    return {
      kind: 'message',
      text: 'No encontramos esa relación terminada en esta organización. Vuelve a elegirla.',
    }
  }
  if (status === 409) {
    return {
      kind: 'message',
      text: 'No se abrió. O la relación no conservó ningún permiso congelado, y entonces no hay nada que consultar, o ya hay un caso abierto para la misma relación, la misma persona y el mismo propósito.',
    }
  }
  if (status === 422) {
    return {
      kind: 'message',
      text: 'La persona que elegiste no puede recibir el caso: tiene que seguir en la organización como propietario, administración o coach. Staff nunca puede.',
    }
  }
  return {
    kind: 'message',
    text: 'No pudimos abrir el caso por un problema de conexión. Inténtalo de nuevo.',
  }
}

export type CaseState = 'open' | 'expired' | 'closed'

/**
 * Three states, not two. A case whose time ran out reads `expired` until somebody
 * closes it, and `closed` as `expired` afterwards: the same fact either way, and
 * not an error — it is the deadline doing its job.
 */
export function caseState(
  entry: Pick<HistoricalAccessCase, 'status' | 'closed_reason'>,
): CaseState {
  if (entry.status === 'open') return 'open'
  if (entry.status === 'expired' || entry.closed_reason === 'expired') return 'expired'
  return 'closed'
}

const STATE_LABELS: Record<CaseState, string> = {
  open: 'Abierto',
  expired: 'Vencido',
  closed: 'Cerrado',
}

export function caseStateLabel(state: CaseState): string {
  return STATE_LABELS[state]
}

const WHEN = { dateStyle: 'medium', timeStyle: 'short' } as const

function when(value: string): string {
  return new Intl.DateTimeFormat('es-CO', WHEN).format(new Date(value))
}

export function caseWindowLine(
  entry: Pick<HistoricalAccessCase, 'status' | 'closed_reason' | 'expires_at' | 'closed_at'>,
): string {
  const state = caseState(entry)
  if (state === 'open') return `Vence el ${when(entry.expires_at)}`
  if (state === 'expired') return `Venció el ${when(entry.expires_at)}`
  return `Se cerró el ${when(entry.closed_at ?? entry.expires_at)}`
}

/** A member of the team, or the person whose history it is: both carry the two names. */
export function memberName(
  member: Pick<HistoricalCaseMember, 'given_name' | 'family_name'>,
): string {
  return `${member.given_name} ${member.family_name}`.trim()
}

export function endedOnLine(endedAt: string): string {
  return `Terminó el ${new Intl.DateTimeFormat('es-CO', { dateStyle: 'medium' }).format(new Date(endedAt))}`
}
