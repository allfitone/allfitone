/**
 * «Dolor y limitaciones» (TECH-326, `HU-SP-014`, `HU-SP-028`, `HU-SP-022`): the words, the
 * sections and the drafts of the person's health context, apart from the screens so they
 * can be tested.
 *
 * **Not a clinical record.** Three types, a body area from fourteen, her own words and
 * when it started. The side of the body goes in her words: the areas have none.
 *
 * **Only a recovery has an end.** Somebody seldom knows when a pain or a limitation will
 * stop, so the form offers «hasta» for a recovery alone, and a draft that is not one never
 * sends an end.
 *
 * **The list reads by what is true today:** pains and limitations, then what is healing,
 * then whatever already ended. An ended claim is still hers, so it stays, dimmed.
 *
 * **Dates are local days.** «Hoy», «Esta semana» and «Este mes» are the start of that
 * day, week (Monday) or month where she is, and so is a day chosen on the wheel.
 */

import type { AllfitV1Schemas } from '@allfitone/contracts'

import { ApiError } from './api-error'

export type HealthClaim = AllfitV1Schemas['HealthContextClaim']
export type HealthPage = AllfitV1Schemas['HealthContextPage']
export type HealthDeletion = AllfitV1Schemas['HealthContextDeletion']
export type HealthType = HealthClaim['context_type']
export type HealthArea = NonNullable<HealthClaim['body_area']>
export type HealthClaimInput = AllfitV1Schemas['HealthContextClaimCreate']

export const MAX_DESCRIPTION = 500

export const HEALTH_TYPES: readonly {
  readonly type: HealthType
  readonly label: string
  readonly caption: string
}[] = [
  { type: 'pain', label: 'Dolor', caption: 'Algo te duele' },
  { type: 'limitation', label: 'Limitación', caption: 'Algo no puedes hacer' },
  { type: 'recovery', label: 'Recuperación', caption: 'Vienes de una lesión' },
]

const TYPE_LABEL: Record<HealthType, string> = {
  pain: 'Dolor',
  limitation: 'Limitación',
  recovery: 'Recuperación',
}

export const AREA_LABEL: Record<HealthArea, string> = {
  neck: 'Cuello',
  shoulder: 'Hombro',
  chest: 'Pecho',
  upper_back: 'Espalda alta',
  arm: 'Brazo',
  elbow: 'Codo',
  wrist_hand: 'Muñeca y mano',
  abdomen: 'Abdomen',
  lower_back: 'Espalda baja',
  hip: 'Cadera',
  thigh: 'Muslo',
  knee: 'Rodilla',
  lower_leg: 'Pierna',
  ankle_foot: 'Tobillo y pie',
}

export const AREA_GROUPS: readonly {
  readonly title: string
  readonly areas: readonly HealthArea[]
}[] = [
  {
    title: 'Tren superior',
    areas: ['neck', 'shoulder', 'chest', 'upper_back', 'arm', 'elbow', 'wrist_hand'],
  },
  { title: 'Tronco', areas: ['abdomen', 'lower_back', 'hip'] },
  { title: 'Tren inferior', areas: ['thigh', 'knee', 'lower_leg', 'ankle_foot'] },
]

export function typeLabel(type: HealthType): string {
  return TYPE_LABEL[type]
}

/** What a row is called: its area, or its type when she named no area. */
export function claimTitle(claim: Pick<HealthClaim, 'context_type' | 'body_area'>): string {
  return claim.body_area ? AREA_LABEL[claim.body_area] : TYPE_LABEL[claim.context_type]
}

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

/** «9 oct», with the year only when it is not this one. */
export function dayLine(date: Date, now: Date): string {
  const day = `${String(date.getDate())} ${MONTHS[date.getMonth()] ?? ''}`
  return date.getFullYear() === now.getFullYear() ? day : `${day} ${String(date.getFullYear())}`
}

/** «9 oct 2026», always with its year: what the wheel and the detail show. */
export function fullDayLine(date: Date): string {
  return `${String(date.getDate())} ${MONTHS[date.getMonth()] ?? ''} ${String(date.getFullYear())}`
}

export function hasEnded(claim: Pick<HealthClaim, 'valid_to'>, now: Date): boolean {
  return claim.valid_to !== null && Date.parse(claim.valid_to) <= now.getTime()
}

/** What a row says under its title. */
export function claimCaption(claim: HealthClaim, now: Date): string {
  if (claim.valid_to && hasEnded(claim, now)) {
    return `${TYPE_LABEL[claim.context_type]} · terminó el ${dayLine(new Date(claim.valid_to), now)}`
  }
  return `Desde el ${dayLine(new Date(claim.valid_from), now)} · ${claim.description}`
}

export interface HealthSections {
  readonly active: readonly HealthClaim[]
  readonly healing: readonly HealthClaim[]
  readonly ended: readonly HealthClaim[]
}

/** The order the API answers in, the most recent start first, kept inside each section. */
export function healthSections(claims: readonly HealthClaim[], now: Date): HealthSections {
  return {
    active: claims.filter((claim) => claim.context_type !== 'recovery' && !hasEnded(claim, now)),
    healing: claims.filter((claim) => claim.context_type === 'recovery' && !hasEnded(claim, now)),
    ended: claims.filter((claim) => hasEnded(claim, now)),
  }
}

// ---------------------------------------------------------------- dates as local days

export function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days)
}

/** Whole local days from `from` to `to`, unaffected by a daylight-saving hour. */
export function daysBetween(from: Date, to: Date): number {
  const utc = (date: Date) => Date.UTC(date.getFullYear(), date.getMonth(), date.getDate())
  return Math.round((utc(to) - utc(from)) / 86_400_000)
}

export type SinceChoice = 'today' | 'week' | 'month' | 'other'

export const SINCE_CHOICES: readonly { readonly choice: SinceChoice; readonly label: string }[] = [
  { choice: 'today', label: 'Hoy' },
  { choice: 'week', label: 'Esta semana' },
  { choice: 'month', label: 'Este mes' },
  { choice: 'other', label: 'Otra fecha' },
]

export function sinceDate(choice: Exclude<SinceChoice, 'other'>, now: Date): Date {
  const today = startOfDay(now)
  if (choice === 'today') return today
  if (choice === 'month') return new Date(today.getFullYear(), today.getMonth(), 1)
  // Monday starts the week here, as it does on a Colombian calendar.
  return addDays(today, -((today.getDay() + 6) % 7))
}

/** «Hoy», «Hace 33 días», «Mañana», «En 12 días». */
export function relativeDayLine(offset: number): string {
  if (offset === 0) return 'Hoy'
  if (offset === -1) return 'Ayer'
  if (offset === 1) return 'Mañana'
  return offset < 0 ? `Hace ${String(-offset)} días` : `En ${String(offset)} días`
}

/** The wheel's run of days: two years back for a start, one year ahead for an end. */
export function wheelOffsets(kind: 'since' | 'until'): number[] {
  return kind === 'since'
    ? Array.from({ length: 731 }, (_, index) => index - 730)
    : Array.from({ length: 365 }, (_, index) => index + 1)
}

// ---------------------------------------------------------------- the draft

export interface HealthDraft {
  readonly type: HealthType | undefined
  readonly area: HealthArea | null
  readonly description: string
  readonly since: SinceChoice
  /** The day chosen on the wheel, when `since` is `other`. */
  readonly sinceDay: Date | null
  /** Only a recovery keeps one, and only while «Sé cuándo termina» is on. */
  readonly until: Date | null
}

export const EMPTY_DRAFT: HealthDraft = {
  type: undefined,
  area: null,
  description: '',
  since: 'today',
  sinceDay: null,
  until: null,
}

export function draftOf(claim: HealthClaim): HealthDraft {
  return {
    type: claim.context_type,
    area: claim.body_area,
    description: claim.description,
    since: 'other',
    sinceDay: startOfDay(new Date(claim.valid_from)),
    until:
      claim.context_type === 'recovery' && claim.valid_to
        ? startOfDay(new Date(claim.valid_to))
        : null,
  }
}

export function draftSince(draft: HealthDraft, now: Date): Date {
  if (draft.since === 'other') return draft.sinceDay ?? startOfDay(now)
  return sinceDate(draft.since, now)
}

export function asksForEnd(draft: HealthDraft): boolean {
  return draft.type === 'recovery'
}

export function canSaveDraft(draft: HealthDraft, now: Date): boolean {
  const words = draft.description.trim()
  if (!draft.type || words === '' || words.length > MAX_DESCRIPTION) return false
  if (draft.since === 'other' && !draft.sinceDay) return false
  if (asksForEnd(draft) && draft.until) {
    return draft.until.getTime() > draftSince(draft, now).getTime()
  }
  return true
}

/** What the API is sent. Undefined while the draft cannot be saved. */
export function claimInput(draft: HealthDraft, now: Date): HealthClaimInput | undefined {
  if (!canSaveDraft(draft, now) || !draft.type) return undefined
  return {
    context_type: draft.type,
    description: draft.description.trim(),
    body_area: draft.area,
    valid_from: draftSince(draft, now).toISOString(),
    valid_to: asksForEnd(draft) && draft.until ? draft.until.toISOString() : null,
  }
}

// ---------------------------------------------------------------- refusals

export function saveFailure(cause: unknown): string {
  if (cause instanceof ApiError && cause.failure === 'conflict') {
    return 'Ahora no se puede cambiar: una retención legal mantiene tus datos de salud como están.'
  }
  if (cause instanceof ApiError && cause.failure === 'not-found') {
    return 'Ese registro ya no está. Vuelve a tu lista.'
  }
  if (cause instanceof ApiError && cause.failure === 'unavailable') {
    return 'No pudimos conectar. Revisa tu conexión e inténtalo otra vez.'
  }
  return 'No pudimos guardarlo. Inténtalo otra vez.'
}

/** Undefined when the claim is gone; otherwise why it stays. */
export function deletionNote(deletion: HealthDeletion, now: Date): string | undefined {
  if (deletion.status === 'deleted') return undefined
  if (deletion.status === 'suspended' && deletion.hold) {
    return `Una retención legal mantiene tus datos de salud hasta el ${dayLine(new Date(deletion.hold.valid_to), now)}. Lo eliminamos en cuanto termine.`
  }
  return 'Lo eliminamos en unos minutos.'
}

// ---------------------------------------------------------------- choices that travel back

let chosenArea: HealthArea | null | undefined
let chosenDay: { readonly kind: 'since' | 'until'; readonly day: Date } | undefined

/** The area picked on its own screen, read once by the form when it shows again. */
export function chooseArea(area: HealthArea | null): void {
  chosenArea = area
}

export function takeChosenArea(): HealthArea | null | undefined {
  const taken = chosenArea
  chosenArea = undefined
  return taken
}

export function chooseDay(kind: 'since' | 'until', day: Date): void {
  chosenDay = { kind, day }
}

export function takeChosenDay():
  { readonly kind: 'since' | 'until'; readonly day: Date } | undefined {
  const taken = chosenDay
  chosenDay = undefined
  return taken
}
