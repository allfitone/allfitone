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

import { EXPERIENCE_LEVELS } from './experience-form'
import { FOCUS_ZONES } from './focus-form'

export type FitnessProfile = AllfitV1Schemas['SpaceFitnessProfile']
export type ProfileEntry = AllfitV1Schemas['SpaceProfileAttribute']
export type Provenance = AllfitV1Schemas['Provenance']
export type SpaceIdentity = AllfitV1Schemas['SpaceIdentity']
export type OwnName = AllfitV1Schemas['SpaceOwnName']
export type ContactPhone = AllfitV1Schemas['SpaceContactPhone']
export type SessionDuration = AllfitV1Schemas['SessionDuration']
export type TrainingPlace = AllfitV1Schemas['TrainingPlace']
export type EquipmentPiece = AllfitV1Schemas['AvailableEquipmentPiece']
export type TrainingDays = AllfitV1Schemas['TrainingDaysPerWeek']

const PROVENANCE: Record<Provenance, string> = {
  person_declared: 'Declarado por ti',
  professional_observation: 'Observado por tu coach',
  device_observed: 'Medido por un dispositivo',
  system_inferred: 'Calculado por Allfit',
  authority_verified: 'Verificado',
}

export function provenanceLine(entry: Pick<ProfileEntry, 'provenance'>): string {
  return PROVENANCE[entry.provenance]
}

/** «+1 versión» when the profile holds others than the one shown; nothing otherwise. */
export function versionsLine(entry: Pick<ProfileEntry, 'alternatives'>): string | undefined {
  const others = entry.alternatives.length
  if (others === 0) return undefined
  return others === 1 ? '+1 versión' : `+${String(others)} versiones`
}

export const GOAL_CHOICES = [
  { value: 'lose_weight', name: 'Bajar de peso', detail: 'Perder grasa sin perder fuerza.' },
  { value: 'build_muscle', name: 'Construir músculo', detail: 'Más masa, con cargas que suben.' },
  { value: 'get_fit', name: 'Ponerme en forma', detail: 'Moverme mejor y con más energía.' },
  { value: 'maintain', name: 'Mantenerme', detail: 'Conservar lo que ya tengo.' },
] as const

export const DURATION_CHOICES: readonly {
  readonly value: SessionDuration
  readonly figure: string
  readonly caption: string
  readonly line: string
  /** How much of the ring is lit: the share of an hour. */
  readonly share: number
}[] = [
  {
    value: 'up_to_30_min',
    figure: '30',
    caption: 'Hasta 30 min',
    line: 'Hasta 30 min',
    share: 0.5,
  },
  {
    value: '30_to_45_min',
    figure: '45',
    caption: '30 a 45 min',
    line: 'Entre 30 y 45 min',
    share: 0.75,
  },
  {
    value: '45_to_60_min',
    figure: '60',
    caption: '45 a 60 min',
    line: 'Entre 45 y 60 min',
    share: 1,
  },
  { value: 'over_60_min', figure: '60+', caption: 'Más de 60', line: 'Más de 60 min', share: 1 },
]

export const PLACE_CHOICES: readonly { readonly value: TrainingPlace; readonly name: string }[] = [
  { value: 'gym', name: 'En el gimnasio' },
  { value: 'home', name: 'En casa' },
  { value: 'outdoors', name: 'Al aire libre' },
  { value: 'multiple', name: 'En varios sitios' },
]

export const EQUIPMENT_CHOICES: readonly {
  readonly value: EquipmentPiece
  readonly name: string
}[] = [
  { value: 'bodyweight', name: 'Peso corporal' },
  { value: 'dumbbell', name: 'Mancuernas' },
  { value: 'kettlebell', name: 'Kettlebell' },
  { value: 'barbell', name: 'Barra olímpica' },
  { value: 'bench', name: 'Banco' },
  { value: 'pull_up_bar', name: 'Barra fija' },
  { value: 'cable', name: 'Polea' },
  { value: 'machine', name: 'Máquina' },
  { value: 'cardio_machine', name: 'Cardio' },
]

const WHOLE_BODY = 'Todo el cuerpo'

export function daysLine(days: number): string {
  return days === 1 ? '1 día' : `${String(days)} días`
}

/** One step of the days stepper; with nothing chosen yet it starts from three. */
export function stepDays(current: number | undefined, delta: 1 | -1): number {
  if (current === undefined) return 3
  return Math.min(7, Math.max(1, current + delta))
}

/** «A, b y c»: the first keeps its capital, the rest read inside the sentence. */
function listed(names: readonly string[]): string | undefined {
  if (names.length === 0) return undefined
  const words = names.map((name, index) => (index === 0 ? name : name.toLowerCase()))
  if (words.length === 1) return words[0]
  return `${words.slice(0, -1).join(', ')} y ${words.at(-1) ?? ''}`
}

function named<T extends string>(
  choices: readonly { readonly value: T; readonly name: string }[],
  values: readonly string[],
): string | undefined {
  return listed(
    choices.filter((choice) => values.includes(choice.value)).map((choice) => choice.name),
  )
}

/** What a value reads as; undefined for one this app does not know, never a raw code. */
export function valueLine(code: string, values: readonly string[]): string | undefined {
  const [first] = values
  switch (code) {
    case 'primary_training_goal':
      return named(GOAL_CHOICES, values)
    case 'training_experience':
      return EXPERIENCE_LEVELS.find((level) => level.level === first)?.name
    case 'focus_areas':
      if (values.includes('whole_body')) return WHOLE_BODY
      return listed(
        FOCUS_ZONES.filter((zone) => values.includes(zone.zone)).map((zone) => zone.name),
      )
    case 'training_days_per_week': {
      const days = Number(first)
      return Number.isInteger(days) && days >= 1 && days <= 7 ? daysLine(days) : undefined
    }
    case 'session_duration':
      return DURATION_CHOICES.find((choice) => choice.value === first)?.line
    case 'training_place':
      return named(PLACE_CHOICES, values)
    case 'available_equipment':
      return named(EQUIPMENT_CHOICES, values)
    default:
      return undefined
  }
}

export type Editor = 'goal' | 'focus' | 'experience' | 'routine' | 'place'

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
  readonly title: string
  readonly rows: readonly { code: string; title: string; editor: Editor }[]
}[] = [
  {
    title: 'Lo que buscas',
    rows: [
      { code: 'primary_training_goal', title: 'Objetivo', editor: 'goal' },
      { code: 'focus_areas', title: 'Zonas de foco', editor: 'focus' },
    ],
  },
  {
    title: 'Tu punto de partida',
    rows: [{ code: 'training_experience', title: 'Experiencia', editor: 'experience' }],
  },
  {
    title: 'Cómo entrenas',
    rows: [
      { code: 'training_days_per_week', title: 'Días por semana', editor: 'routine' },
      { code: 'session_duration', title: 'Tiempo por sesión', editor: 'routine' },
      { code: 'training_place', title: 'Dónde entrenas', editor: 'place' },
      { code: 'available_equipment', title: 'Equipo con el que cuentas', editor: 'place' },
    ],
  },
]

export function entryOf(
  profile: FitnessProfile | undefined,
  code: string,
): ProfileEntry | undefined {
  return profile?.attributes.find((one) => one.attribute_code === code)
}

export function fitnessSections(profile: FitnessProfile | undefined): FitnessSection[] {
  return LAYOUT.map((section) => ({
    title: section.title,
    rows: section.rows.map((row) => {
      const entry = entryOf(profile, row.code)
      const value = entry ? valueLine(row.code, entry.values) : undefined
      return {
        ...row,
        value,
        provenance: entry && value ? provenanceLine(entry) : undefined,
        versions: entry && value ? versionsLine(entry) : undefined,
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

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

/** «3 jul 2026», on the calendar of the device. */
export function activeSince(instant: string): string {
  const date = new Date(instant)
  return `${String(date.getDate())} ${MONTHS[date.getMonth()] ?? ''} ${String(date.getFullYear())}`
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
