/**
 * What the authorized training profile screen needs to decide, and the words it
 * says things in.
 *
 * `OP-IDN-018` answers the claims in force for the training attributes she
 * shares, each with where it came from. Three things about that answer shape
 * everything here, and only the first is in the story.
 *
 * **A field the version leaves out is null, exactly like one never declared.**
 * The database gates `value_text`, `provenance` and `valid_from` each on their
 * own, so a claim can arrive naming its attribute with no readable value, or a
 * value with no origin. The screen says what is missing and never why: it cannot
 * tell "she declined" from "your version does not carry it", and guessing would
 * blame her for the gym's permission version.
 *
 * **Several claims of one attribute coexist, and all of them are shown.** She
 * may have declared she is starting while a professional observed she is
 * experienced. Both are in force; picking one would be inventing a winner the
 * server did not name.
 *
 * **The names are the database catalogue's**, which already writes them for a
 * reader who is not the person: "Dónde entrena", "Equipo con el que cuenta".
 * They are copied rather than read, because no operation publishes them — the
 * same deliberate copy `relationship-history.ts` keeps of the scope wording.
 */
import type { ClientProfileClaim, Provenance } from './studio-api'

/**
 * The order the screen reads in: what she trains, then what for, then how
 * practised, then where the emphasis goes, then the shape of her week. The
 * operation answers alphabetically, which puts the emphasis zones first and the
 * discipline in the middle.
 */
const ATTRIBUTE_ORDER = [
  'training_discipline',
  'primary_training_goal',
  'training_experience',
  'focus_areas',
  'training_days_per_week',
  'session_duration',
  'training_place',
  'available_equipment',
] as const

/*
 * `identity.profile_attributes.name`, verbatim. Eight codes carry
 * `data_classification_code = 'training'`, so all eight can travel here even
 * though the story names four — and a raw code on screen would be the defect.
 */
const ATTRIBUTE_NAMES: Record<string, string> = {
  training_discipline: 'Disciplina principal de entrenamiento',
  primary_training_goal: 'Objetivo principal de entrenamiento',
  training_experience: 'Experiencia de entrenamiento',
  focus_areas: 'Zonas de énfasis',
  training_days_per_week: 'Días de entrenamiento por semana',
  session_duration: 'Tiempo por sesión',
  training_place: 'Dónde entrena',
  available_equipment: 'Equipo con el que cuenta',
}

/*
 * Said about her, which is why these are not Space's words. There the person
 * reads her own answers and the vocabulary is hers — "Estoy empezando",
 * "Ponerme en forma". Here a coach reads about somebody else, and that voice
 * would make the goal his own.
 */
const GOALS: Record<string, string> = {
  lose_weight: 'Bajar de peso',
  build_muscle: 'Construir músculo',
  get_fit: 'Ponerse en forma',
  run_a_race: 'Correr una carrera',
  maintain: 'Mantenerse',
  // The catalogue holds it and this operation refuses it; labelled so that the
  // day it stops being refused nobody reads a code.
  improve_performance: 'Mejorar el rendimiento',
}

const EXPERIENCE: Record<string, string> = {
  starting: 'Está empezando',
  some_practice: 'Tiene algo de práctica',
  experienced: 'Tiene experiencia',
}

const DISCIPLINES: Record<string, string> = { strength: 'Fuerza' }

const FOCUS_AREAS: Record<string, string> = {
  chest: 'Pecho',
  back: 'Espalda',
  shoulders: 'Hombros',
  arms: 'Brazos',
  abs: 'Abdomen',
  glutes: 'Glúteos',
  legs: 'Piernas',
  whole_body: 'Todo el cuerpo',
}

const DURATIONS: Record<string, string> = {
  up_to_30_min: 'Hasta 30 min',
  '30_to_45_min': 'Entre 30 y 45 min',
  '45_to_60_min': 'Entre 45 y 60 min',
  over_60_min: 'Más de 60 min',
}

const PLACES: Record<string, string> = {
  gym: 'En el gimnasio',
  home: 'En casa',
  outdoors: 'Al aire libre',
  multiple: 'En varios sitios',
}

const EQUIPMENT: Record<string, string> = {
  bodyweight: 'Peso corporal',
  dumbbell: 'Mancuernas',
  kettlebell: 'Kettlebell',
  barbell: 'Barra olímpica',
  bench: 'Banco',
  pull_up_bar: 'Barra fija',
  cable: 'Polea',
  machine: 'Máquina',
  cardio_machine: 'Cardio',
}

const VALUES_BY_ATTRIBUTE: Record<string, Record<string, string>> = {
  primary_training_goal: GOALS,
  training_experience: EXPERIENCE,
  training_discipline: DISCIPLINES,
  focus_areas: FOCUS_AREAS,
  session_duration: DURATIONS,
  training_place: PLACES,
  available_equipment: EQUIPMENT,
}

/** The catalogue's name, or the code when the catalogue has grown past this copy. */
export function attributeName(code: string): string {
  return ATTRIBUTE_NAMES[code] ?? code
}

/**
 * Said to the coach about her. Space's wording is the person's own ("Declarado
 * por ti", "Observado por tu coach") and cannot be reused for a reader who is
 * neither.
 *
 * Five, not the four the story names: the contract also carries
 * `authority_verified`. A null is the version withholding the column, and it is
 * said as missing rather than guessed at.
 */
const PROVENANCES: Record<Provenance, string> = {
  person_declared: 'Lo declaró ella',
  professional_observation: 'Lo observó un profesional',
  device_observed: 'Lo midió un dispositivo',
  system_inferred: 'Lo calculó Allfit',
  authority_verified: 'Lo verificó una autoridad',
}

export function provenanceLine(provenance: Provenance | null): string {
  return provenance ? PROVENANCES[provenance] : 'Sin origen disponible'
}

/**
 * What a claim reads as, or null when nothing readable arrived.
 *
 * Null is the honest answer in two cases the screen must not tell apart: the
 * version did not carry the value columns, and the claim genuinely holds no
 * value. Returning the code instead would show `some_practice` to a coach.
 */
export function claimValueLine(claim: ClientProfileClaim): string | null {
  const { attribute_code, value_text, value_numeric, unit_code } = claim
  if (value_text !== null) {
    return VALUES_BY_ATTRIBUTE[attribute_code]?.[value_text] ?? value_text
  }
  if (value_numeric === null) return null
  const figure = String(value_numeric)
  if (attribute_code === 'training_days_per_week') {
    return value_numeric === 1 ? '1 día' : `${figure} días`
  }
  return unit_code ? `${figure} ${unit_code}` : figure
}

export interface ProfileAttributeGroup {
  readonly code: string
  readonly name: string
  readonly claims: readonly ClientProfileClaim[]
}

/**
 * One group per attribute she shares, in reading order, each keeping the order
 * the operation answered its claims in — newest first.
 *
 * An attribute this copy does not know still gets a group, at the end: it means
 * the catalogue grew, and dropping it would hide something she shared.
 */
export function groupClaims(
  attributes: readonly ClientProfileClaim[],
): readonly ProfileAttributeGroup[] {
  const groups = new Map<string, ClientProfileClaim[]>()
  for (const claim of attributes) {
    const existing = groups.get(claim.attribute_code)
    if (existing) existing.push(claim)
    else groups.set(claim.attribute_code, [claim])
  }
  const rank = (code: string) => {
    const index = ATTRIBUTE_ORDER.indexOf(code as (typeof ATTRIBUTE_ORDER)[number])
    return index === -1 ? ATTRIBUTE_ORDER.length : index
  }
  return [...groups.entries()]
    .sort(([left], [right]) => rank(left) - rank(right) || left.localeCompare(right))
    .map(([code, claims]) => ({ code, name: attributeName(code), claims }))
}

export interface ReadableClaim {
  readonly claim: ClientProfileClaim
  readonly value: string
}

/**
 * The claims of a group that have something to show, each with the line it
 * shows. An empty result does not mean the group is empty: she shares an
 * attribute of that kind and the version withheld its value, which is the
 * difference criterion 4 is about — so the screen still names it.
 *
 * Paired with its value rather than returning the claims alone, because the
 * count on screen has to be the count of rows drawn. Counting the claims that
 * arrived put "2 vigentes" above one line.
 */
export function readableClaims(group: ProfileAttributeGroup): readonly ReadableClaim[] {
  return group.claims.flatMap((claim) => {
    const value = claimValueLine(claim)
    return value === null ? [] : [{ claim, value }]
  })
}

const BIOLOGICAL_SEX: Record<string, string> = { male: 'Hombre', female: 'Mujer' }

export function biologicalSexLine(value: string): string {
  return BIOLOGICAL_SEX[value] ?? value
}

/**
 * The scope version the answer was built from. Said as a sentence rather than a
 * bare number, and worth saying here when the card deliberately leaves it out:
 * this is the screen where it explains something — two gyms on two versions read
 * two shapes of the same person.
 */
export function appliedVersionLine(version: number): string {
  return `Versión ${String(version)} del permiso de entrenamiento`
}
