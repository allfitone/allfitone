/**
 * Lo que la previa de Home dice de una rutina que todavía se está escribiendo.
 *
 * La pantalla de portada promete «así se verá tu Home el día de esta rutina», y una
 * promesa así sólo vale si lo que enseña es la rutina de verdad. Por eso todo sale del
 * borrador que hay en pantalla y nada de la última versión publicada: quien acaba de
 * añadir un ejercicio tiene que verlo ahí.
 *
 * **Las series se le cuentan al músculo primario y a ninguno más.** El catálogo
 * devuelve los músculos de un movimiento con el primero delante, y repartir una serie de
 * press de banca entre pecho, hombro y tríceps convierte trece series en treinta y una:
 * el número deja de ser el trabajo que hiciste y pasa a ser un recuento de menciones.
 */

import type { Dictionary } from '../i18n'
import type { Movement, MuscleTerm } from './content'
import type { WorkingStep } from './routine-draft'

export interface MuscleLoad {
  readonly code: string
  readonly name: string
  readonly sets: number
}

/** Cuántas caben en la tarjeta sin que ninguna se corte. */
export const MUSCLES_SHOWN = 3

/**
 * Cuánto trabaja cada músculo, de más a menos.
 *
 * Un ejercicio sin músculos curados no aporta a nadie. Es el estado normal de un
 * catálogo que crece, y contarlo como «otros» sería inventar un grupo muscular.
 */
export function setsPerMuscle(
  steps: readonly WorkingStep[],
  movements: readonly Movement[],
  muscles: readonly MuscleTerm[],
): readonly MuscleLoad[] {
  const byId = new Map(movements.map((movement) => [movement.id, movement]))
  const named = new Map(muscles.map((muscle) => [muscle.code, muscle.name]))
  const load = new Map<string, number>()

  for (const step of steps) {
    const code = byId.get(step.movementId)?.muscles[0]
    if (code === undefined) continue
    load.set(code, (load.get(code) ?? 0) + step.sets.length)
  }

  return (
    [...load.entries()]
      .map(([code, sets]) => ({ code, name: named.get(code) ?? code, sets }))
      .filter((one) => one.sets > 0)
      // El nombre desempata para que dos músculos con las mismas series no bailen entre
      // dos renders: la previa se redibuja con cada tecla del nombre.
      .sort((one, other) => other.sets - one.sets || one.name.localeCompare(other.name, 'es'))
  )
}

/**
 * «3 ejercicios · 13 series», y sólo lo que hay.
 *
 * Una rutina recién abierta no tiene ninguna de las dos cosas, y «0 ejercicios · 0
 * series» es una tarjeta que dice que está vacía dos veces.
 */
export function previewFigures(
  steps: readonly WorkingStep[],
  text: Dictionary['training']['library'],
  empty: string,
): string {
  if (steps.length === 0) return empty
  const sets = steps.reduce((total, step) => total + step.sets.length, 0)
  const exercises = text.exercises(steps.length)
  if (sets === 0) return exercises
  return `${exercises} · ${text.sets(sets)}`
}

/** What a routine is called before it is called anything. */
export function previewTitle(title: string, unnamed: string): string {
  return title.trim() === '' ? unnamed : title.trim()
}

/**
 * De qué mitad del cuerpo va la rutina, para saber por dónde recortar la figura.
 *
 * La tarjeta de Hoy no enseña un monigote entero de cien puntos —a ese tamaño el
 * músculo encendido es un píxel—: enseña un recorte grande. Cuál, lo decide lo que la
 * rutina trabaja, o un recorte de torso dejaría en blanco una rutina de pierna.
 *
 * `general` no inclina nada: el abdomen sale en los dos recortes.
 */
export function dominantRegion(
  worked: readonly string[],
  muscles: readonly MuscleTerm[],
): 'upper' | 'lower' {
  const region = new Map(muscles.map((muscle) => [muscle.code, muscle.region]))
  let upper = 0
  let lower = 0
  for (const code of worked) {
    if (region.get(code) === 'upper') upper += 1
    if (region.get(code) === 'lower') lower += 1
  }
  // Empate al torso: es donde está el pecho de una rutina que no dijo nada más.
  return lower > upper ? 'lower' : 'upper'
}

/** A figure on the back of the card: the number, its unit, and the change when it has one. */
export interface PreviewFigure {
  readonly value: string
  readonly unit: string
  /** La mejora contra la vez anterior, cuando la cifra admite una. */
  readonly delta?: string
}

/** Lo que la tarjeta dibuja de la última vez, cuando alguien puede responderlo. */
export interface PreviewHistory {
  readonly when: string
  readonly session: string
  readonly figures: readonly PreviewFigure[]
}
