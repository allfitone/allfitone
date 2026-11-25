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

import type { Dictionary } from '../i18n'
import { ApiError } from './api-error'

export type HealthClaim = AllfitV1Schemas['HealthContextClaim']
export type HealthPage = AllfitV1Schemas['HealthContextPage']
export type HealthDeletion = AllfitV1Schemas['HealthContextDeletion']
export type HealthType = HealthClaim['context_type']
export type HealthArea = NonNullable<HealthClaim['body_area']>
export type HealthClaimInput = AllfitV1Schemas['HealthContextClaimCreate']

export const MAX_DESCRIPTION = 500

/** The three types, in the order the form offers them; their words are in the dictionary. */
export const HEALTH_TYPES: readonly HealthType[] = ['pain', 'limitation', 'recovery']

export const AREA_GROUPS: readonly {
  readonly group: keyof Dictionary['health']['areaGroups']
  readonly areas: readonly HealthArea[]
}[] = [
  {
    group: 'upper',
    areas: ['neck', 'shoulder', 'chest', 'upper_back', 'arm', 'elbow', 'wrist_hand'],
  },
  { group: 'trunk', areas: ['abdomen', 'lower_back', 'hip'] },
  { group: 'lower', areas: ['thigh', 'knee', 'lower_leg', 'ankle_foot'] },
]

export const HEALTH_AREAS: readonly HealthArea[] = AREA_GROUPS.flatMap((group) => group.areas)

export function typeLabel(type: HealthType, text: Dictionary['health']): string {
  return text.types[type].label
}

/** What a row is called: its area, or its type when she named no area. */
export function claimTitle(
  claim: Pick<HealthClaim, 'context_type' | 'body_area'>,
  text: Dictionary['health'],
): string {
  return claim.body_area ? text.areas[claim.body_area] : typeLabel(claim.context_type, text)
}

const monthOf = (date: Date, text: Dictionary) => text.common.months[date.getMonth()] ?? ''

/** «9 oct», with the year only when it is not this one. */
export function dayLine(date: Date, now: Date, text: Dictionary): string {
  return date.getFullYear() === now.getFullYear()
    ? text.health.dayMonth(date.getDate(), monthOf(date, text))
    : fullDayLine(date, text)
}

/** «9 oct 2026», always with its year: what the wheel and the detail show. */
export function fullDayLine(date: Date, text: Dictionary): string {
  return text.common.date(date.getDate(), monthOf(date, text), date.getFullYear())
}

export function hasEnded(claim: Pick<HealthClaim, 'valid_to'>, now: Date): boolean {
  return claim.valid_to !== null && Date.parse(claim.valid_to) <= now.getTime()
}

/** What a row says under its title. */
export function claimCaption(claim: HealthClaim, now: Date, text: Dictionary): string {
  if (claim.valid_to && hasEnded(claim, now)) {
    return text.health.caption.ended(
      typeLabel(claim.context_type, text.health),
      dayLine(new Date(claim.valid_to), now, text),
    )
  }
  return text.health.caption.since(
    dayLine(new Date(claim.valid_from), now, text),
    claim.description,
  )
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

export const SINCE_CHOICES: readonly SinceChoice[] = ['today', 'week', 'month', 'other']

export function sinceDate(choice: Exclude<SinceChoice, 'other'>, now: Date): Date {
  const today = startOfDay(now)
  if (choice === 'today') return today
  if (choice === 'month') return new Date(today.getFullYear(), today.getMonth(), 1)
  // Monday starts the week here, as it does on a Colombian calendar.
  return addDays(today, -((today.getDay() + 6) % 7))
}

/** «Hoy», «Hace 33 días», «Mañana», «En 12 días». */
export function relativeDayLine(offset: number, text: Dictionary['health']): string {
  if (offset === 0) return text.relative.today
  if (offset === -1) return text.relative.yesterday
  if (offset === 1) return text.relative.tomorrow
  return offset < 0 ? text.relative.ago(-offset) : text.relative.ahead(offset)
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

export function saveFailure(cause: unknown, text: Dictionary): string {
  if (cause instanceof ApiError && cause.failure === 'conflict') return text.health.failure.held
  if (cause instanceof ApiError && cause.failure === 'not-found') return text.health.failure.gone
  if (cause instanceof ApiError && cause.failure === 'unavailable') {
    return text.health.failure.offline
  }
  return text.common.saveFailed
}

/** Undefined when the claim is gone; otherwise why it stays. */
export function deletionNote(
  deletion: HealthDeletion,
  now: Date,
  text: Dictionary,
): string | undefined {
  if (deletion.status === 'deleted') return undefined
  if (deletion.status === 'suspended' && deletion.hold) {
    return text.health.deletion.held(dayLine(new Date(deletion.hold.valid_to), now, text))
  }
  return text.health.deletion.soon
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
