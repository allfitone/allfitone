/**
 * A gym from the person's side (HU-SP-016..020, HU-SP-095): the invitation she answers,
 * the gyms she trains at, the covers proposed to her and the story of each relationship.
 *
 * Accepting the relationship shares nothing by itself, and each category is answered on
 * its own; a category she does not touch is a no. The flow keeps one command per
 * invitation until it is answered, so a retry after a dropped connection is the same
 * answer and never a second relationship.
 */

import type { AllfitV1Schemas } from '@allfitone/contracts'
import type { CommandHeaders } from '@allfitone/contracts/commands'

import { ApiError } from './api-error'
import { shortDate } from './pro'

export type InvitationPresentation = AllfitV1Schemas['ClientInvitationPresentation']
export type InvitationScopeOption = AllfitV1Schemas['ClientInvitationScopeOption']
export type PendingInvitationList = AllfitV1Schemas['ClientInvitationPendingList']
export type PendingInvitation = AllfitV1Schemas['ClientInvitationPending']
export type InvitationDecisionResult = AllfitV1Schemas['ClientInvitationDecisionResult']
export type InvitationDecisionBody = AllfitV1Schemas['ClientInvitationDecisionCreate']
export type ProgramOffer = AllfitV1Schemas['ClientInvitationProgramOffer']
export type ProgramOutcome = AllfitV1Schemas['ClientInvitationProgramOutcome']
export type Decision = 'accepted' | 'rejected'

/** What a yes/no control gave back, as a decision: only «accepted» accepts. */
export function decisionOf(value: string): Decision {
  return value === 'accepted' ? 'accepted' : 'rejected'
}

/** How an invitation is named: the emailed token, or the id of a pending one. */
export type InvitationKey = { readonly token: string } | { readonly invitationId: string }

export interface InvitationTransport {
  listMine(): Promise<PendingInvitationList>
  readMine(invitationId: string): Promise<InvitationPresentation>
  resolve(token: string): Promise<InvitationPresentation>
  decide(command: CommandHeaders, body: InvitationDecisionBody): Promise<InvitationDecisionResult>
}

export interface InvitationFlow {
  listMine(): Promise<readonly PendingInvitation[]>
  read(key: InvitationKey): Promise<InvitationPresentation>
  decide(decision: {
    readonly invitation: InvitationKey
    readonly intentId: string
    readonly relationship: Decision
    readonly scopes: Readonly<Record<string, Decision>>
    /** Only for an invitation that offers a program: the API refuses it otherwise. */
    readonly program?: { readonly decision: Decision; readonly timezone: string }
  }): Promise<InvitationDecisionResult>
}

export function createInvitationFlow(dependencies: {
  transport: InvitationTransport
  newCommand: () => CommandHeaders
}): InvitationFlow {
  // One per invitation until it is answered: a retry is the same answer.
  const pending = new Map<string, CommandHeaders>()
  return {
    listMine: async () => (await dependencies.transport.listMine()).data,
    read: (key) =>
      'token' in key
        ? dependencies.transport.resolve(key.token)
        : dependencies.transport.readMine(key.invitationId),
    async decide(decision) {
      const name =
        'token' in decision.invitation
          ? decision.invitation.token
          : decision.invitation.invitationId
      const command = pending.get(name) ?? dependencies.newCommand()
      pending.set(name, command)
      const body: InvitationDecisionBody = {
        ...('token' in decision.invitation
          ? { token: decision.invitation.token }
          : { invitation_id: decision.invitation.invitationId }),
        invitation_intent_id: decision.intentId,
        relationship_decision: decision.relationship,
        scope_decisions: { ...decision.scopes },
        ...(decision.program
          ? { program_decision: decision.program.decision, timezone: decision.program.timezone }
          : {}),
      }
      const result = await dependencies.transport.decide(command, body)
      pending.delete(name)
      return result
    },
  }
}

// Her side of each category, in her voice. `body_progress` promises no photos: the
// published scope excludes them.
const SCOPE_NAME: Record<string, string> = {
  relationship_training: 'Tu entrenamiento con ellos',
  prior_training_history: 'Tu historial previo',
  body_progress: 'Tu progreso corporal',
  health_context: 'Dolor y limitaciones',
  nutrition_intake: 'Tus comidas',
  nutrition_guidance: 'Metas de nutrición',
  nutrition_media: 'Fotos de tus comidas',
}

/** A category as she names it on her side, once it is shared or declined. */
export function scopeName(scopeCode: string): string {
  return SCOPE_NAME[scopeCode] ?? scopeCode
}

interface PresentedOption {
  readonly scope_code: string
  readonly presented_snapshot: Readonly<Record<string, unknown>>
}

function presented(option: PresentedOption, key: 'display_name' | 'description'): string | null {
  const value = option.presented_snapshot[key]
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null
}

/**
 * A category by the name the gym sent it with: the catalogue's `display_name`, frozen
 * into the invitation when it was sent. Her own name only when the snapshot has none.
 */
export function scopeTitle(option: PresentedOption): string {
  return presented(option, 'display_name') ?? scopeName(option.scope_code)
}

/**
 * What the category covers and where it stops, in the words the gym sent. Null when
 * it sent none: Space never writes its own version of a permission's boundary.
 */
export function scopeDescription(option: PresentedOption): string | null {
  return presented(option, 'description')
}

/**
 * The level a gym asks for, or holds, in her words. Contributing is offerable only where
 * the published scope admits it, which in V1 is her training with them: assigning
 * programs, moving sessions, adjusting and cancelling. "Propuestas" said less than that.
 */
export function accessLevelLabel(level: string | null): string {
  return level === 'contribute' ? 'Lectura y cambios a tu plan' : 'Lectura'
}

export function sharedSummary(
  decisions: Readonly<Record<string, Decision>>,
  asked: number,
): string {
  if (asked === 0) return 'No pide ningún dato'
  const accepted = Object.values(decisions).filter((decision) => decision === 'accepted').length
  return `Compartes ${String(accepted)} de ${String(asked)}`
}

/**
 * Where the offered program stands on «Tu invitación». It depends on a permission, so
 * until she shares that one it is locked, and without the relationship it is off.
 */
export type ProgramStanding = 'off' | 'locked' | 'open'

export function programStanding(
  offer: ProgramOffer,
  relationship: Decision,
  scopes: Readonly<Record<string, Decision>>,
): ProgramStanding {
  if (relationship === 'rejected') return 'off'
  return scopes[offer.required_scope.scope_code] === 'accepted' ? 'open' : 'locked'
}

/** Her answer counts only while the program is open; locked or off, it is a no. */
export const programAnswer = (standing: ProgramStanding, chosen: Decision): Decision =>
  standing === 'open' ? chosen : 'rejected'

const WEEKDAYS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb']
const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

/** «lun 1 dic» from a calendar date, without a zone to move it. */
export function calendarDay(date: string): string {
  const [year = 1970, month = 1, day = 1] = date.split('-').map(Number)
  const weekday = WEEKDAYS[new Date(Date.UTC(year, month - 1, day)).getUTCDay()] ?? ''
  return `${weekday} ${String(day)} ${MONTHS[month - 1] ?? ''}`
}

/** The phone's calendar date, «2026-11-24». */
export function localDate(now: Date = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${String(now.getFullYear())}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

/** The proposed start is tentative: accepted later, it starts the day she accepts. */
export const programStart = (offer: ProgramOffer, today: string): string =>
  offer.starts_on > today ? offer.starts_on : today

/** «8 semanas · empieza el lun 1 dic», or «Se repite cada semana · …». */
export function programSpan(offer: ProgramOffer, today: string): string {
  const length =
    offer.repeats_forever || offer.weeks === null
      ? 'Se repite cada semana'
      : `${String(offer.weeks)} ${offer.weeks === 1 ? 'semana' : 'semanas'}`
  return `${length} · empieza el ${calendarDay(programStart(offer, today))}`
}

/** What the program row says under it, for each standing and answer. */
export function programNote(
  offer: ProgramOffer,
  standing: ProgramStanding,
  chosen: Decision,
  requiredTitle: string,
  today: string,
): string | null {
  if (standing === 'off') return null
  if (standing === 'locked') return `Para que te lo pongan, primero comparte «${requiredTitle}».`
  return chosen === 'accepted'
    ? `Si confirmas, lo verás en Entrenar desde el ${calendarDay(programStart(offer, today))}.`
    : 'Decide si quieres empezarlo.'
}

/** Under the permission the program needs, on «Decide qué pueden ver». */
export const programNeedLine = (offer: ProgramOffer): string =>
  `Lo necesitan para ponerte «${offer.title}».`

/**
 * What became of the program, for «Ya entrenas con…». Nothing when she declined it or
 * none was offered: the screen only reports what accepting did.
 */
export function programOutcomeLine(
  offer: ProgramOffer | null,
  outcome: ProgramOutcome | null,
  today: string,
): string | null {
  if (!offer || !outcome) return null
  if (outcome.assignment_id) {
    return `Empieza el ${calendarDay(programStart(offer, today))} · lo verás en Entrenar`
  }
  if (outcome.unmaterialized_reason === 'training_not_granted') {
    return 'No quedó puesto: no compartiste tu entrenamiento'
  }
  if (outcome.unmaterialized_reason === 'program_unavailable') {
    return 'Tu gimnasio retiró este programa antes de que respondieras'
  }
  return null
}

export const invitationExpiry = (instant: string): string => `vence el ${shortDate(instant)}`

const DECISION_FAILED =
  'No pudimos guardar tus decisiones. Revisa tu conexión e inténtalo de nuevo.'
const LATER = 'Tu invitación sigue abierta: inténtalo más tarde.'

/**
 * Why her answer did not land. A gym that cannot take her now is not a connection
 * problem, and the invitation it sent is still open; why the gym is paused is not hers.
 */
export function decisionFailure(cause: unknown): string {
  if (!(cause instanceof ApiError)) return DECISION_FAILED
  if (cause.failure === 'organization-not-operating') {
    return `Este gimnasio no está recibiendo personas nuevas por ahora. ${LATER}`
  }
  if (cause.failure === 'guest-quota-exhausted') {
    return `Este gimnasio no tiene lugares libres por ahora. ${LATER}`
  }
  return DECISION_FAILED
}

/** Covers still waiting on her: proposed, and not already past their last day. */
export function pendingCovers<
  T extends { readonly status: string; readonly ends_on: string | null },
>(covers: readonly T[], now: Date = new Date()): T[] {
  const today = now.toISOString().slice(0, 10)
  return covers.filter(
    (cover) => cover.status === 'proposed' && (cover.ends_on === null || cover.ends_on >= today),
  )
}

/** One moment of a relationship, said as she would say it. */
export function historyLine(event: {
  readonly type: string
  readonly detail: Readonly<Record<string, unknown>>
}): string {
  const name = typeof event.detail.display_name === 'string' ? event.detail.display_name : 'Alguien'
  switch (event.type) {
    case 'relationship_started':
      return 'Aceptaste la invitación'
    case 'holder_assigned':
      return `${name} es tu coach`
    case 'holder_ended':
      return `${name} dejó de ser tu coach`
    case 'substitution_proposed':
      return `${name} propone cubrirte`
    case 'substitution_accepted':
      return `Aceptaste que ${name} te cubra`
    case 'substitution_ended':
      return `${name} dejó de cubrirte`
    case 'consent_decided': {
      const named = SCOPE_NAME[String(event.detail.scope_code)]
      // Inside a sentence, so the name loses its capital.
      const scope = named ? named.charAt(0).toLowerCase() + named.slice(1) : 'una categoría'
      return event.detail.decision === 'accepted'
        ? `Compartiste ${scope}`
        : `No compartiste ${scope}`
    }
    case 'grant_revoked': {
      const named = SCOPE_NAME[String(event.detail.scope_code)]
      return `Dejaste de compartir ${named ? named.charAt(0).toLowerCase() + named.slice(1) : 'una categoría'}`
    }
    case 'relationship_ended':
      // Seen from Space, «declared by us» is her own decision.
      return event.detail.declared_by_us === true
        ? 'Terminaste la relación'
        : 'El gimnasio terminó la relación'
    default:
      return 'Cambió la relación'
  }
}

/** The emailed token, read from the fragment so it never reaches a server log. */
export function tokenFromLink(url: string | null): string | undefined {
  const fragment = url?.split('#')[1]
  if (!fragment) return undefined
  const token = new URLSearchParams(fragment).get('token')
  return token ? token : undefined
}

// A calendar day read at noon, so no zone moves it to the day before.
const day = (date: string): string => shortDate(`${date}T12:00:00`)

/** When a cover runs: from the day it starts to its last day, if it has one. */
export function coverSpan(cover: {
  readonly valid_from: string
  readonly ends_on: string | null
}): string {
  const from = shortDate(cover.valid_from)
  return cover.ends_on ? `del ${from} al ${day(cover.ends_on)}` : `desde el ${from}`
}

export function endedSpan(relationship: {
  readonly started_at: string
  readonly ended_at: string | null
}): string {
  const until = relationship.ended_at ? ` al ${shortDate(relationship.ended_at)}` : ''
  return `Del ${shortDate(relationship.started_at)}${until} · ya no ven nada nuevo`
}
