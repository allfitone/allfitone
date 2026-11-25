/**
 * «Perfil fitness» and «Identidad y acceso» as data (TECH-43): what each datum is
 * called, what its value reads as, where it came from, and which section it lives in.
 *
 * **Every question is listed, answered or not.** A profile that only showed what was
 * answered would hide what is still missing, and «Sin responder» is how the person
 * finds the four questions the onboarding never asked.
 *
 * **The names are the onboarding's.** Somebody who chose «Construir músculo» there must
 * read the same words here, so the goal, the level and the zones reuse its vocabulary
 * instead of the prototype's wording.
 *
 * **The discipline is not listed** while strength is the only one (TECH-47): a row with
 * a single possible answer is not a question.
 */

import type { AllfitV1Schemas } from '@allfitone/contracts'

import type { Dictionary } from '../i18n'
import { readLevel } from './experience-form'
import { FOCUS_ZONES, WHOLE_BODY } from './focus-form'
import type { TrainingGoal } from './goal-form'

export type FitnessProfile = AllfitV1Schemas['SpaceFitnessProfile']
export type ProfileEntry = AllfitV1Schemas['SpaceProfileAttribute']
export type Provenance = AllfitV1Schemas['Provenance']
export type SpaceIdentity = AllfitV1Schemas['SpaceIdentity']
export type OwnName = AllfitV1Schemas['SpaceOwnName']
export type ContactPhone = AllfitV1Schemas['SpaceContactPhone']
export type EmailChange = AllfitV1Schemas['SpaceEmailChange']
export type SessionDuration = AllfitV1Schemas['SessionDuration']
export type TrainingPlace = AllfitV1Schemas['TrainingPlace']
export type EquipmentPiece = AllfitV1Schemas['AvailableEquipmentPiece']
export type TrainingDays = AllfitV1Schemas['TrainingDaysPerWeek']

type FitnessText = Dictionary['fitness']

export function provenanceLine(entry: Pick<ProfileEntry, 'provenance'>, text: FitnessText): string {
  return text.provenance[entry.provenance]
}

/** «+1 versión» when the profile holds others than the one shown; nothing otherwise. */
export function versionsLine(
  entry: Pick<ProfileEntry, 'alternatives'>,
  text: FitnessText,
): string | undefined {
  const others = entry.alternatives.length
  if (others === 0) return undefined
  return text.otherVersions(others)
}

/** The goals the profile can name, in the order it lists them. */
export const GOAL_CHOICES: readonly TrainingGoal[] = [
  'lose_weight',
  'build_muscle',
  'get_fit',
  'maintain',
]

export const DURATION_CHOICES: readonly {
  readonly value: SessionDuration
  readonly figure: string
  /** How much of the ring is lit: the share of an hour. */
  readonly share: number
}[] = [
  { value: 'up_to_30_min', figure: '30', share: 0.5 },
  { value: '30_to_45_min', figure: '45', share: 0.75 },
  { value: '45_to_60_min', figure: '60', share: 1 },
  { value: 'over_60_min', figure: '60+', share: 1 },
]

export const PLACE_CHOICES: readonly TrainingPlace[] = ['gym', 'home', 'outdoors', 'multiple']

export const EQUIPMENT_CHOICES: readonly EquipmentPiece[] = [
  'bodyweight',
  'dumbbell',
  'kettlebell',
  'barbell',
  'bench',
  'pull_up_bar',
  'cable',
  'machine',
  'cardio_machine',
]

export function daysLine(days: number, text: FitnessText): string {
  return text.days(days)
}

/** One step of the days stepper; with nothing chosen yet it starts from three. */
export function stepDays(current: number | undefined, delta: 1 | -1): number {
  if (current === undefined) return 3
  return Math.min(7, Math.max(1, current + delta))
}

/** «A, b y c»: the first keeps its capital, the rest read inside the sentence. */
function listed(names: readonly string[], text: FitnessText): string | undefined {
  if (names.length === 0) return undefined
  const words = names.map((name, index) => (index === 0 ? name : name.toLowerCase()))
  if (words.length === 1) return words[0]
  return text.list(words.slice(0, -1), words.at(-1) ?? '')
}

/** The names of the chosen codes, in the order of `choices` rather than of `values`. */
function named<T extends string>(
  choices: readonly T[],
  names: Readonly<Record<T, string>>,
  values: readonly string[],
  text: FitnessText,
): string | undefined {
  return listed(
    choices.filter((choice) => values.includes(choice)).map((choice) => names[choice]),
    text,
  )
}

/** What a value reads as; undefined for one this app does not know, never a raw code. */
export function valueLine(
  code: string,
  values: readonly string[],
  text: FitnessText,
): string | undefined {
  const [first] = values
  switch (code) {
    case 'primary_training_goal':
      return listed(
        GOAL_CHOICES.filter((goal) => values.includes(goal)).map((goal) => text.goals[goal].name),
        text,
      )
    case 'training_experience': {
      const level = readLevel(first)
      return level ? text.experience.levels[level].name : undefined
    }
    case 'focus_areas':
      if (values.includes(WHOLE_BODY)) return text.focus.wholeBody
      return named(
        FOCUS_ZONES.map((zone) => zone.zone),
        text.focus.zones,
        values,
        text,
      )
    case 'training_days_per_week': {
      const days = Number(first)
      return Number.isInteger(days) && days >= 1 && days <= 7 ? daysLine(days, text) : undefined
    }
    case 'session_duration': {
      const duration = DURATION_CHOICES.find((choice) => choice.value === first)
      return duration ? text.durations[duration.value].line : undefined
    }
    case 'training_place':
      return named(PLACE_CHOICES, text.places, values, text)
    case 'available_equipment':
      return named(EQUIPMENT_CHOICES, text.equipment, values, text)
    default:
      return undefined
  }
}

export type Editor = 'goal' | 'focus' | 'experience' | 'routine' | 'place'

/** The codes «Perfil fitness» lists, which are also the keys of their titles. */
type RowCode =
  | 'primary_training_goal'
  | 'focus_areas'
  | 'training_experience'
  | 'training_days_per_week'
  | 'session_duration'
  | 'training_place'
  | 'available_equipment'

export interface FitnessRow {
  readonly code: string
  readonly title: string
  /** Undefined reads «Sin responder». */
  readonly value: string | undefined
  readonly provenance: string | undefined
  readonly versions: string | undefined
  readonly entry: ProfileEntry | undefined
  readonly editor: Editor
}

export interface FitnessSection {
  readonly title: string
  readonly rows: readonly FitnessRow[]
}

const LAYOUT: readonly {
  readonly section: 'goal' | 'start' | 'routine'
  readonly rows: readonly { code: RowCode; editor: Editor }[]
}[] = [
  {
    section: 'goal',
    rows: [
      { code: 'primary_training_goal', editor: 'goal' },
      { code: 'focus_areas', editor: 'focus' },
    ],
  },
  { section: 'start', rows: [{ code: 'training_experience', editor: 'experience' }] },
  {
    section: 'routine',
    rows: [
      { code: 'training_days_per_week', editor: 'routine' },
      { code: 'session_duration', editor: 'routine' },
      { code: 'training_place', editor: 'place' },
      { code: 'available_equipment', editor: 'place' },
    ],
  },
]

export function entryOf(
  profile: FitnessProfile | undefined,
  code: string,
): ProfileEntry | undefined {
  return profile?.attributes.find((one) => one.attribute_code === code)
}

export function fitnessSections(
  profile: FitnessProfile | undefined,
  text: FitnessText,
): FitnessSection[] {
  return LAYOUT.map((section) => ({
    title: text.sections[section.section],
    rows: section.rows.map((row) => {
      const entry = entryOf(profile, row.code)
      const value = entry ? valueLine(row.code, entry.values, text) : undefined
      return {
        ...row,
        title: text.rows[row.code],
        value,
        provenance: entry && value ? provenanceLine(entry, text) : undefined,
        versions: entry && value ? versionsLine(entry, text) : undefined,
        entry,
      }
    }),
  }))
}

/** A little equipment at home is worth saying: the plan leans on the body and on those. */
export const FEW_PIECES = 3

export function fewEquipmentAtHome(
  place: TrainingPlace | undefined,
  equipment: readonly EquipmentPiece[],
): boolean {
  return place === 'home' && equipment.length > 0 && equipment.length <= FEW_PIECES
}

export function identityInitials(given: string, family: string): string {
  return [given, family].map((part) => part.trim().charAt(0).toUpperCase()).join('')
}

/** «Founding Member #037»: three digits, as the emails and the waitlist page write it. */
export function foundingMemberLabel(value: number | null | undefined): string | undefined {
  if (typeof value !== 'number') return undefined
  return `Founding Member #${String(value).padStart(3, '0')}`
}

/** «3 jul 2026», «Jul 3, 2026», on the calendar of the device. */
export function activeSince(instant: string, common: Dictionary['common']): string {
  const date = new Date(instant)
  return common.date(date.getDate(), common.months[date.getMonth()] ?? '', date.getFullYear())
}

const USERNAME = /^[a-z][a-z0-9_]{2,29}$/i
const MAX_NAME = 80

/** The handle as typed, without the «@» the field draws in front of it. */
export function cleanUsername(typed: string): string {
  return typed.trim().replace(/^@/, '')
}

const NAME_FIELDS = ['given_name', 'family_name', 'username'] as const

function fieldRefused(name: OwnName, field: keyof OwnName): boolean {
  if (field === 'username') return !USERNAME.test(cleanUsername(name.username))
  const part = name[field].trim()
  return part === '' || part.length > MAX_NAME
}

/** The first of `fields` the server would refuse; a sheet only answers for what it edits. */
export function nameProblem(
  name: OwnName,
  fields: readonly (keyof OwnName)[] = NAME_FIELDS,
): keyof OwnName | undefined {
  return NAME_FIELDS.find((field) => fields.includes(field) && fieldRefused(name, field))
}

const E164 = /^\+[1-9][0-9]{7,14}$/

/** The phone as the server keeps it; null for an empty field, undefined if it is not E.164. */
export function typedPhone(typed: string): string | null | undefined {
  const phone = typed.replace(/[\s().-]/g, '')
  if (phone === '') return null
  return E164.test(phone) ? phone : undefined
}

export type ContactState = 'verified' | 'unverified' | 'missing'

export function contactState(contact: {
  readonly value: string | null
  readonly verified: boolean
}): ContactState {
  if (contact.value === null) return 'missing'
  return contact.verified ? 'verified' : 'unverified'
}

export type EmailRowState = 'verified' | 'unverified' | 'awaiting_code' | 'applying'

/** The email row of «Identidad y acceso»: its state, its line, and where a tap leads. */
export function emailRow(
  email: SpaceIdentity['email'],
  text: Dictionary['identity']['emailRow'],
): {
  state: EmailRowState
  caption: string
  route: '/me/email' | '/me/email-code' | undefined
} {
  if (email.pending?.status === 'awaiting_code') {
    return {
      state: 'awaiting_code',
      caption: text.awaitingCode(email.pending.address),
      route: '/me/email-code',
    }
  }
  if (email.pending?.status === 'applying') {
    return {
      state: 'applying',
      caption: text.applying(email.pending.address),
      route: undefined,
    }
  }
  return {
    state: email.verified ? 'verified' : 'unverified',
    caption: text.signsIn,
    route: '/me/email',
  }
}

const EMAIL_SHAPE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

/** Only what the phone can tell: the server refuses the rest with the same words. */
export function newEmailProblem(
  typed: string,
  current: string | null,
): 'shape' | 'same' | undefined {
  const email = typed.trim().toLowerCase()
  if (!EMAIL_SHAPE.test(email)) return 'shape'
  if (email === current?.toLowerCase()) return 'same'
  return undefined
}

/**
 * Where a confirmed change stands: done once the new address is the one in force, failed
 * once nothing is pending and the old one stayed, waiting meanwhile.
 */
export function emailChangeProgress(
  email: SpaceIdentity['email'],
  target: string,
): 'waiting' | 'done' | 'failed' {
  if (email.address?.toLowerCase() === target.toLowerCase()) return 'done'
  return email.pending ? 'waiting' : 'failed'
}

/** The line that warns a new request replaces the code still waiting; none otherwise. */
export function replacedCodeNote(
  pending: EmailChange | null,
  text: Dictionary['identity'],
): string | undefined {
  if (pending?.status !== 'awaiting_code') return undefined
  return text.replacedCode(pending.address)
}

export type StepState = 'done' | 'now' | 'todo'

/**
 * The steps of an email change being applied. The app only knows «still applying» or
 * «done», so the second step stays current until the end and nothing claims more.
 */
export function emailChangeSteps(
  done: boolean,
  text: Dictionary['identity']['emailSteps'],
): readonly { readonly label: string; readonly state: StepState }[] {
  return [
    { label: text.confirmed, state: 'done' },
    { label: text.updatingSignIn, state: done ? 'done' : 'now' },
    { label: text.closingSessions, state: done ? 'done' : 'todo' },
  ]
}
