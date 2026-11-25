/**
 * The corrections a professional proposes to her sets (`HU-SP-062`, `HU-SP-063`), as
 * «Correcciones» (`NT-6`) lists them and «Corrección propuesta» (`NT-5`) decides one.
 *
 * **Nothing changes until she accepts.** This module only words what the server holds;
 * the decision is hers and travels as a command (`corrections-transport.ts`). A proposal
 * past its thirty days reads as expired here too, even while the screen was open, so
 * silence is never offered as something she can still accept.
 *
 * **A proposal names one field of one set.** `current` and `proposed` say only that
 * field; the rest of the set, the session's name and its date come from the session's
 * own detail, read beside it. Without that detail the figures still read, alone. The
 * set is numbered within its exercise, as the session detail numbers it, because the
 * contract's `set_order` counts the whole session and «serie 7» would name nothing she
 * recognises.
 *
 * **Loads show in her unit** (`HU-SP-094`): a value proposed in pounds and read in kilos
 * is converted only to be drawn. Dates are said in the zone she trains in, with the
 * dictionary's month names, so a row reads the same on the phone and in the test.
 */

import type { AllfitV1Schemas } from '@allfitone/contracts'

import { ApiError } from './api-error'
import type { FinishedExecution, FinishedSet } from './execution'
import type { Dictionary, Locale } from '../i18n'
import { intlLocale } from '../i18n/locale'
import { isMassUnit, kilogramsFrom, massLabel, type Units } from '../units/units'

export type CorrectionProposal = AllfitV1Schemas['CorrectionProposal']
export type CorrectionPage = AllfitV1Schemas['CorrectionProposalPage']
export type CorrectionStatus = CorrectionProposal['status']
export type CorrectionDecision = 'accept' | 'reject'

type Words = Dictionary['corrections']
type Months = Dictionary['common']['months']

const DAY_MS = 86_400_000

/** Its state as she should read it now: pending past its expiry has expired. */
export function statusOf(proposal: CorrectionProposal, now: Date): CorrectionStatus {
  if (proposal.status !== 'pending') return proposal.status
  return Date.parse(proposal.expires_at) <= now.getTime() ? 'expired' : 'pending'
}

/** When it stopped waiting: settled, or its expiry when no sweep marked it yet. */
export function decidedAt(proposal: CorrectionProposal): string {
  return proposal.settled_at ?? proposal.expires_at
}

/** Pending soonest to expire first; the rest, the most recently settled first. */
export function correctionSections(
  proposals: readonly CorrectionProposal[],
  now: Date,
): { readonly pending: CorrectionProposal[]; readonly decided: CorrectionProposal[] } {
  const pending = proposals
    .filter((one) => statusOf(one, now) === 'pending')
    .sort((a, b) => Date.parse(a.expires_at) - Date.parse(b.expires_at))
  const decided = proposals
    .filter((one) => statusOf(one, now) !== 'pending')
    .sort((a, b) => Date.parse(decidedAt(b)) - Date.parse(decidedAt(a)))
  return { pending, decided }
}

export function findProposal(
  proposals: readonly CorrectionProposal[],
  proposalId: string,
): CorrectionProposal | undefined {
  return proposals.find((one) => one.id === proposalId)
}

export type CorrectionTone = 'warning' | 'success' | 'neutral'

/** Pending waits on her, accepted went through; the other three only end it. */
export function statusBadge(
  status: CorrectionStatus,
  words: Words,
): { readonly label: string; readonly tone: CorrectionTone } {
  const tone: CorrectionTone =
    status === 'pending' ? 'warning' : status === 'accepted' ? 'success' : 'neutral'
  return { label: words.status[status], tone }
}

interface LocalDay {
  readonly year: number
  readonly month: number
  readonly day: number
  readonly weekday: number
}

/** The calendar day an instant falls on in her zone. */
function localDay(iso: string, timeZone: string): LocalDay {
  const [year = 1970, month = 1, day = 1] = new Intl.DateTimeFormat('en-CA', { timeZone })
    .format(new Date(iso))
    .split('-')
    .map(Number)
  return { year, month, day, weekday: new Date(Date.UTC(year, month - 1, day)).getUTCDay() }
}

const dayNumber = (day: LocalDay) => Date.UTC(day.year, day.month - 1, day.day) / DAY_MS

/** Whole calendar days from one instant to another, in her zone. */
export function calendarDaysBetween(from: string, to: string, timeZone: string): number {
  return dayNumber(localDay(to, timeZone)) - dayNumber(localDay(from, timeZone))
}

/** «30 oct». */
export function shortDate(iso: string, timeZone: string, words: Words, months: Months): string {
  const day = localDay(iso, timeZone)
  return words.day(day.day, months[day.month - 1] ?? '')
}

/** «Vence en 29 días», counted in calendar days so midnight, not the hour, moves it. */
export function expiryLabel(
  proposal: CorrectionProposal,
  now: Date,
  timeZone: string,
  words: Words,
): string {
  return words.expiresIn(calendarDaysBetween(now.toISOString(), proposal.expires_at, timeZone))
}

/** «hoy», «ayer», or the day it was proposed. */
export function proposedWhen(
  proposal: CorrectionProposal,
  now: Date,
  timeZone: string,
  words: Words,
  months: Months,
): string {
  const ago = calendarDaysBetween(proposal.created_at, now.toISOString(), timeZone)
  if (ago <= 0) return words.today
  if (ago === 1) return words.yesterday
  return shortDate(proposal.created_at, timeZone, words, months)
}

/** The set inside the session's detail, by the order the proposal names. */
export function setOf(
  detail: FinishedExecution | undefined,
  setOrder: number,
): { readonly set: FinishedSet; readonly number: number } | undefined {
  for (const exercise of detail?.exercises ?? []) {
    const index = exercise.sets.findIndex((one) => one.set_order === setOrder)
    const set = exercise.sets[index]
    if (set) return { set, number: index + 1 }
  }
  return undefined
}

/** «Sentadilla · serie 3», or the exercise alone when the session could not be read. */
export function proposalTitle(
  proposal: CorrectionProposal,
  setNumber: number | undefined,
  words: Words,
): string {
  const exercise = proposal.movement_name ?? words.anExercise
  return setNumber === undefined ? exercise : words.set(exercise, setNumber)
}

/**
 * «Laura Gómez · vence el 30 oct» while it waits; who and when once it ended. One cancelled
 * because the relationship ended names the gym, which is what ended.
 */
export function proposalCaption(
  proposal: CorrectionProposal,
  now: Date,
  timeZone: string,
  words: Words,
  months: Months,
): string {
  const status = statusOf(proposal, now)
  if (status === 'pending') {
    return `${proposal.proposer_name} · ${words.expiresOn(shortDate(proposal.expires_at, timeZone, words, months))}`
  }
  const who =
    proposal.cancel_reason === 'relationship_terminated'
      ? proposal.organization_name
      : proposal.proposer_name
  return `${who} · ${shortDate(decidedAt(proposal), timeZone, words, months)}`
}

/** «Pierna · vie 22 ago · Sentadilla · serie 3». */
export function contextLine(
  proposal: CorrectionProposal,
  detail: FinishedExecution | undefined,
  timeZone: string,
  words: Words,
  months: Months,
): string {
  const exercise = proposalTitle(proposal, setOf(detail, proposal.set_order)?.number, words)
  if (!detail) return exercise
  const day = localDay(detail.started_at, timeZone)
  const when = words.sessionDay(
    words.weekdays[day.weekday] ?? '',
    day.day,
    months[day.month - 1] ?? '',
  )
  return [detail.title ?? words.freeSession, when, exercise].join(' · ')
}

/** A load in her unit; a unit the app does not know reads as it was written. */
function loadLabel(value: number, unit: string | null, units: Units, locale: Locale): string {
  const written = unit ?? 'kg'
  if (isMassUnit(written)) return massLabel(kilogramsFrom(value, written), units.mass, locale)
  return `${value.toLocaleString(intlLocale(locale), { maximumFractionDigits: 2 })} ${written}`
}

type Value = CorrectionProposal['current']

/**
 * What she logged and what is proposed, each as the set reads: «100 kg × 6» → «100 kg × 8».
 * The field the proposal names takes its value from the proposal; the rest, from the set.
 */
export function comparison(
  proposal: CorrectionProposal,
  set: FinishedSet | undefined,
  units: Units,
  locale: Locale,
  words: Words,
): { readonly registered: string; readonly proposed: string } {
  const read = (value: Value): string => {
    if (proposal.field === 'rpe') {
      return words.proposal.rpe(
        value.value.toLocaleString(intlLocale(locale), { maximumFractionDigits: 1 }),
      )
    }
    const setLoad = set?.load_value ?? null
    const load =
      proposal.field === 'load'
        ? loadLabel(value.value, value.unit, units, locale)
        : setLoad === null
          ? null
          : loadLabel(setLoad, set?.load_unit_code ?? null, units, locale)
    const reps = proposal.field === 'achieved_reps' ? value.value : (set?.achieved_reps ?? null)
    if (load !== null && reps !== null) return `${load} × ${String(reps)}`
    if (load !== null) return load
    return reps === null ? '—' : words.proposal.reps(reps)
  }
  return { registered: read(proposal.current), proposed: read(proposal.proposed) }
}

/** What became of one that no longer waits, said in place of the buttons. */
export function outcomeLine(
  proposal: CorrectionProposal,
  now: Date,
  timeZone: string,
  words: Words,
  months: Months,
): string | undefined {
  const status = statusOf(proposal, now)
  const on = shortDate(decidedAt(proposal), timeZone, words, months)
  const said = words.proposal
  if (status === 'accepted') return said.accepted(on)
  if (status === 'rejected') return said.rejected(on)
  if (status === 'expired') return said.expired(on)
  if (status === 'cancelled') {
    const reason = proposal.cancel_reason
    if (reason === 'target_changed') return said.cancelled.target_changed
    if (reason === 'session_annulled') return said.cancelled.session_annulled
    if (reason === 'session_hidden')
      return said.cancelled.session_hidden(proposal.organization_name)
    if (reason === 'relationship_terminated') {
      return said.cancelled.relationship_terminated(proposal.organization_name)
    }
    return said.cancelled.other
  }
  return undefined
}

/** A refused decision means the proposal moved on: read it again to show what it became. */
export function decisionMovedOn(cause: unknown): boolean {
  return (
    cause instanceof ApiError && (cause.failure === 'conflict' || cause.failure === 'not-found')
  )
}

/** Why her decision did not land, in words she can act on. */
export function decisionFailure(cause: unknown, words: Words): string {
  if (!(cause instanceof ApiError)) return words.failure.offline
  if (cause.failure === 'conflict') return words.failure.closed
  if (cause.failure === 'not-found') return words.failure.gone
  if (cause.failure === 'unauthenticated') return words.failure.session
  if (cause.failure === 'invalid-request' || cause.failure === 'forbidden') {
    return words.failure.refused
  }
  return words.failure.offline
}
