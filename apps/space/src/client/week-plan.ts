/**
 * What the training tab decides on its own.
 *
 * The week is the unit and the day inside it is a suggestion, so the screen's job
 * is not to say what today is: it is to say **which routine to reach for next**,
 * and to make every other one just as reachable.
 *
 * **Suggested is today's, or the next day's that is still pending.** The same rule
 * Hoy opens its carousel on, so the two screens never point at different days. A
 * session left behind earlier in the week keeps its place but is not suggested
 * again. It orients; it never decides.
 *
 * **Done marks, it does not bar.** A routine already closed keeps its place and
 * offers to be done again: repeating is legitimate, the repeat is another attempt,
 * and the first one keeps what it earned. A screen that hid it would be telling
 * somebody they cannot do what they are about to do anyway.
 *
 * **A gym's program can be held back**: while the gym is suspended (HU-BO-016), or
 * while it has paused her plan for a pending payment (HU-SP-083). Its sessions stay in
 * view and say why they do not start: `paused` while the cause lasts, `missed` for a
 * day that passed while it did. The server decides both, and the cause it names, and
 * refuses the start anyway.
 */

import { intlLocale, type Dictionary, type Locale } from '../i18n'
import { massIn, type MassUnit } from '../units/units'
import type { PreviewFigure } from './home-preview'
import type { WeekPlan, WeekRoutine } from './programs'

type WeekWords = Dictionary['training']['week']

export type { WeekPlan, WeekRoutine }

export type RoutineState = 'suggested' | 'pending' | 'done' | 'open' | 'paused' | 'missed'

/** What holds a session of a gym's program, and why. */
export type RoutineHold = NonNullable<WeekRoutine['hold']>

export interface RoutineCard {
  readonly routine: WeekRoutine
  readonly state: RoutineState
}

/**
 * The week's routines, each with the one thing the screen renders differently.
 *
 * An open attempt outranks everything: coming back to something left half-done is
 * more urgent than starting the next thing, and offering the next thing would
 * strand it.
 */
export function cardsFor(plan: WeekPlan | undefined, today: number): readonly RoutineCard[] {
  if (!plan) return []
  const open = plan.sessions.find((session) => session.open_execution_id !== null)
  // Only what can start is suggested: a session the gym holds back cannot.
  const pending = plan.sessions.filter((session) => !session.done && !session.hold)
  const suggested = pending[nearestFrom(pending, today)]

  return plan.sessions.map((routine) => ({
    routine,
    state: stateOf(routine, open !== undefined, suggested),
  }))
}

/** An attempt already open is finished whatever the gym: stranding it would lose it. */
function stateOf(
  routine: WeekRoutine,
  anotherOpen: boolean,
  suggested: WeekRoutine | undefined,
): RoutineState {
  if (routine.open_execution_id !== null) return 'open'
  if (routine.hold) return routine.hold.state
  if (!anotherOpen && routine === suggested) return 'suggested'
  return routine.done ? 'done' : 'pending'
}

/** The session left open, which Hoy keeps in view while it is minimised. */
export function sessionInProgress(cards: readonly RoutineCard[]): RoutineCard | undefined {
  return cards.find((card) => card.state === 'open')
}

export type WeekPlanFailure = 'expired' | 'unassigned' | 'failed'

/**
 * What a failed week read means to the tab.
 *
 * `unassigned` is not an error: somebody who follows no programme gets the catalogue,
 * **drawn in the tab**. It used to be answered by navigating there, and from inside a
 * tab that meant replacing the tab navigator's own entry on the root stack — the dock
 * disappeared and going back reported that no navigator would handle it.
 */
export function weekPlanFailure(failure: string | undefined): WeekPlanFailure {
  if (failure === 'unauthenticated') return 'expired'
  if (failure === 'not-found') return 'unassigned'
  return 'failed'
}

/** De lunes a domingo, como los cuenta el programa: 1 es lunes y 7 domingo. */
/**
 * Qué día es hoy en el mismo sistema que usa el programa.
 *
 * `Date.getDay()` cuenta desde el domingo y el programa desde el lunes, y esa diferencia
 * de un día es la que pondría «HOY» en la tarjeta equivocada.
 */
export function programDayOf(date: Date): number {
  const sundayFirst = date.getDay()
  return sundayFirst === 0 ? 7 : sundayFirst
}

/**
 * El rótulo del chip de una tarjeta: su día, o «HOY» cuando toca hoy.
 *
 * El día y no la fecha: el carrusel enseña la semana entera y lo que distingue una
 * tarjeta de otra es el día que el programa le puso, no cuándo cae en el calendario.
 */
/** `program_day` runs from 1, Monday, to 7, Sunday; `text.days` starts at Monday. */
export function dayChip(programDay: number, today: number, text: WeekWords): string {
  if (programDay === today) return text.today
  return text.days[programDay - 1] ?? ''
}

/**
 * La tarjeta en la que abre el carrusel: la de hoy, o la del próximo día que pida algo.
 *
 * **Se desplaza, no se reordena.** La semana sigue en el orden del programa, porque es
 * la forma de la semana; lo que cambia es dónde se para al abrir. Pasada la última
 * sesión, la siguiente es la primera de la semana que viene.
 */
export function firstCardShown(cards: readonly RoutineCard[], today: number): number {
  return nearestFrom(
    cards.map((card) => card.routine),
    today,
  )
}

/** Which session comes first counting from today, wrapping past Sunday; ties keep order. */
function nearestFrom(sessions: readonly WeekRoutine[], today: number): number {
  let best = 0
  let nearest = Number.POSITIVE_INFINITY
  sessions.forEach((session, index) => {
    const ahead = (session.program_day - today + 7) % 7
    if (ahead < nearest) {
      nearest = ahead
      best = index
    }
  })
  return best
}

export interface WeekDay {
  readonly day: number
  /** El programa pide algo ese día. */
  readonly planned: boolean
  readonly done: boolean
  readonly today: boolean
}

/**
 * La semana como siete días y no como tres barras.
 *
 * **Siete tramos, uno por día**, que es lo que el diseño dibuja y lo que deja ver la
 * forma de la semana: dónde están los días de entrenar y dónde los libres. Una barra por
 * sesión decía cuántas van de cuántas —eso ya lo dice la marcha de al lado— pero no
 * cuándo.
 */
export function weekDays(cards: readonly RoutineCard[], today: number): readonly WeekDay[] {
  return [1, 2, 3, 4, 5, 6, 7].map((day) => {
    const planned = cards.filter((card) => card.routine.program_day === day)
    return {
      day,
      planned: planned.length > 0,
      done: planned.length > 0 && planned.every((card) => card.routine.done),
      today: day === today,
    }
  })
}

/**
 * Qué dice el botón de empezar, que no siempre empieza.
 *
 * Un intento abierto se continúa y una sesión cerrada se repite: prometer «empezar» sobre
 * algo a medias es lo que hace que alguien pierda lo que llevaba.
 */
export function startLabel(state: RoutineState, text: WeekWords): string {
  if (state === 'open') return text.start.open
  if (state === 'paused') return text.start.paused
  if (state === 'missed') return text.start.missed
  return state === 'done' ? text.start.done : text.start.start
}

/** Whether the button starts anything: a session the gym holds back does not. */
export function startable(state: RoutineState): boolean {
  return state !== 'paused' && state !== 'missed'
}

/**
 * Why a gym's session does not start, said next to the button that does not. Nothing
 * for one that starts, including one held but already open, which is finished.
 */
export function heldNotice(card: RoutineCard | undefined, text: WeekWords): string | undefined {
  const hold = card?.routine.hold
  if (!card || !hold || startable(card.state)) return undefined
  return text.held[hold.cause][hold.state]
}

/** Cómo fue la última vez que se hizo esta rutina, tal y como la responde la agenda. */
export type RoutineLastTime = NonNullable<WeekRoutine['last_time']>

export interface LastTimeShown {
  /** «LA ÚLTIMA VEZ, HACE 6 DÍAS», que es el rótulo sobre las cifras. */
  readonly when: string
  readonly figures: readonly PreviewFigure[]
}

/** Cuántos días de calendario separan dos fechas, sin que la hora del día opine. */
function daysBetween(trainedOn: string, today: Date): number {
  const [year, month, day] = trainedOn.split('-').map(Number)
  if (year === undefined || month === undefined || day === undefined) return 0
  const then = Date.UTC(year, month - 1, day)
  const now = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate())
  return Math.round((now - then) / 86_400_000)
}

/** Above a tonne kilos read as tonnes; pounds stay whole, grouped as the locale groups. */
export function tonnageFigure(
  kilograms: number,
  unit: MassUnit,
  locale: Locale,
): { readonly value: string; readonly unit: 't' | MassUnit } {
  const figure = (value: number, digits: number) =>
    value.toLocaleString(intlLocale(locale), {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    })
  if (unit === 'kg' && kilograms >= 1000) return { value: figure(kilograms / 1000, 1), unit: 't' }
  return { value: figure(Math.round(massIn(kilograms, unit)), 0), unit }
}

/**
 * What the back of the card writes about the last time.
 *
 * **What was not answered is left out, never drawn as zero.** A routine that is not
 * strength has no tonnage, and an execution nobody closed has no duration.
 */
export function lastTimeShown(
  last: RoutineLastTime | null | undefined,
  today: Date,
  mass: MassUnit,
  locale: Locale,
  text: WeekWords,
): LastTimeShown | undefined {
  if (!last) return undefined

  const days = daysBetween(last.trained_on, today)
  // No «today»: the label alone already says it; yesterday and older add something.
  const when =
    days <= 0 ? text.lastTime.label : days === 1 ? text.lastTime.yesterday : text.lastTime.ago(days)

  const figures: PreviewFigure[] = []

  if (last.tonnage_kg !== null && last.tonnage_kg > 0) {
    const tonnage = tonnageFigure(last.tonnage_kg, mass, locale)
    figures.push({ value: tonnage.value, unit: text.lastTime.tonnage[tonnage.unit] })
  }

  if (last.seconds !== null && last.seconds > 0) {
    // A minute is the floor: forty seconds lasted something, «0 minutes» says it did not.
    const minutes = Math.max(1, Math.round(last.seconds / 60))
    figures.push({ value: String(minutes), unit: text.lastTime.minutes(minutes) })
  }

  if (last.sets > 0) {
    figures.push({ value: String(last.sets), unit: text.lastTime.sets(last.sets) })
  }

  return { when, figures }
}
