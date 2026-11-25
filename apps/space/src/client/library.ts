/**
 * Lo que la biblioteca de Entrenar dice de cada cosa, sin dibujarla.
 *
 * Todo aquí es una frase o un filtro: la pantalla decide dónde va y con qué tipografía,
 * y estas funciones deciden qué dice. Separado porque cada caso raro —una rutina en dos
 * programas, una sin ninguno, un programa de Allfit que no se puede editar— es una línea
 * de texto que hay que poder afirmar en una prueba en vez de juzgarla en una captura.
 */

import type { Dictionary } from '../i18n'
import type { MyProgram } from './programs'
import type { MyRoutine } from './content'

type LibraryWords = Dictionary['training']['library']

/** Las tres solapas de la biblioteca de rutinas. */
export type RoutineFilter = 'all' | 'in-program' | 'standalone'

/**
 * El día que el programa le puso a una sesión, en tres letras.
 *
 * **Del programa y no del calendario.** La materialización adelanta las sesiones de la
 * primera semana que caerían antes del día de la asignación, así que una sesión de lunes
 * tomada un jueves está agendada el jueves; leer el día de su fecha diría «Jue» de la
 * sesión que la persona puso en lunes. `program_day` es la ranura, que es lo que la
 * pantalla nombra.
 */
export function dayName(programDay: number, text: LibraryWords): string {
  return text.days[programDay - 1] ?? ''
}

/**
 * Qué es un programa, en una línea.
 *
 * `editable` es lo que distingue el propio del tomado de Allfit: uno bifurcado nunca
 * recibió borrador, así que no se puede abrir, y decir «Tuyo» de algo que no se puede
 * editar sería mentir sobre lo que se puede hacer con él.
 */
export function programCaption(program: MyProgram, text: LibraryWords, week?: number): string {
  const origin = program.editable ? text.yours : text.allfits
  const parts = [
    origin,
    program.weeks === null ? text.noEnd : text.weeks(program.weeks),
    text.dayCount(program.days_per_week),
  ]
  // Sin fin se dice en qué semana vas y se calla el «de»: un programa que no termina no
  // tiene una semana final contra la que medirse, y «semana 3 de null» es lo que salía.
  if (week !== undefined) {
    parts.push(program.weeks === null ? text.week(week) : text.weekOf(week, program.weeks))
  }
  return parts.join(' · ')
}

/**
 * Dónde se usa una rutina.
 *
 * Dos programas se dicen con «y» y no con coma, porque son dos y no una lista. Con tres
 * o más la coma vuelve, que es como se enumera en castellano.
 *
 * **Sin programa no es un error.** Una rutina suelta es una rutina que existe para
 * entrenarla cuando toque, y callarlo dejaría la fila con un hueco donde las demás
 * tienen una frase.
 */
export function whereUsed(
  routine: MyRoutine,
  text: LibraryWords,
): { text: string; loose: boolean } {
  const titles = routine.programs.map((program) => program.title)
  if (titles.length === 0) return { text: text.noProgram, loose: true }
  return {
    text: text.inPrograms(titles.slice(0, -1), titles[titles.length - 1] ?? ''),
    loose: false,
  }
}

/**
 * Las cifras de una rutina, que es lo que dice cuánto pesa sin abrirla.
 *
 * **Cero series no se dice.** Una sesión de carrera no tiene ninguna, y «· 0 series»
 * sería ruido que además parece un error. Toma la forma mínima porque la semana y la
 * biblioteca cuentan lo mismo con dos tipos distintos.
 */
export function routineFigures(
  routine: { readonly exercise_count: number; readonly set_count: number },
  text: LibraryWords,
): string {
  const exercises = text.exercises(routine.exercise_count)
  if (routine.set_count === 0) return exercises
  return `${exercises} · ${text.sets(routine.set_count)}`
}

/** La solapa elegida, aplicada. `todas` no filtra: es la lista entera y no una vista. */
export function filteredRoutines(
  routines: readonly MyRoutine[],
  filter: RoutineFilter,
): readonly MyRoutine[] {
  if (filter === 'all') return routines
  const wanted = filter === 'in-program'
  return routines.filter((routine) => routine.programs.length > 0 === wanted)
}

/**
 * Cuántas hay detrás de cada solapa, para que el número esté antes de tocarla.
 *
 * Se cuentan siempre sobre la lista entera y nunca sobre la ya filtrada, o cada solapa
 * diría el total de la que está abierta.
 */
export function routineCounts(routines: readonly MyRoutine[]): Record<RoutineFilter, number> {
  const inProgram = routines.filter((routine) => routine.programs.length > 0).length
  return { all: routines.length, 'in-program': inProgram, standalone: routines.length - inProgram }
}

/**
 * Qué decir cuando no hay nada que listar.
 *
 * Corto y llano. «Ninguna rutina en esta solapa» describía la pantalla —quien lo lee ya
 * ve que está vacía— y además sonaba a que algo había fallado. Lo que hace falta es
 * nombrar lo que falta, que en las tres solapas es lo mismo con un matiz distinto.
 */
export function emptyReason(filter: RoutineFilter, text: LibraryWords): string {
  return text.empty[filter]
}

/**
 * Qué pasa si descartas una rutina, dicho antes de que pase.
 *
 * Descartar una que está en un programa **lo republica sin ella** y muda la asignación
 * sola, así que quien la estuviera entrenando sigue con el programa y una sesión menos.
 * Eso hay que decirlo: es un cambio en algo que la persona no tiene delante.
 *
 * Lo que el cliente no puede saber es si dejaría algún programa vacío — eso depende de
 * lo que haya en cada uno —, así que esa la responde el servidor y la pantalla la
 * traduce. Ver `discardFailure`.
 */
export function discardWarning(routine: MyRoutine, text: LibraryWords): string {
  if (routine.programs.length === 0) return text.discard.loose
  if (routine.programs.length === 1) return text.discard.inOne(routine.programs[0]?.title ?? '')
  return text.discard.inMany(routine.programs.length)
}

/**
 * Sin tildes y en minúscula, para comparar lo que alguien teclea con lo que escribió.
 *
 * Quien busca «tiron» quiere encontrar «Tirón», y en un teclado de móvil la tilde es un
 * toque largo: exigirla es exigir que se escriba mejor que el nombre que se busca.
 */
function plainly(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

/**
 * Las rutinas cuyo nombre contiene lo tecleado. Vacío devuelve todas: buscar estrecha
 * algo que ya está, no rellena una pantalla vacía.
 */
export function routinesNamed(routines: readonly MyRoutine[], query: string): readonly MyRoutine[] {
  const typed = plainly(query.trim())
  if (typed === '') return routines
  return routines.filter((routine) => plainly(routine.title).includes(typed))
}

/**
 * Qué rutinas se lleva un programa al eliminarse, y cuáles se quedan.
 *
 * **Sólo las que ningún otro programa usa.** Llevarse una compartida rompería el otro
 * programa, y `OP-PLN-028` ya se niega a dejar uno sin una sola sesión: sería pedirle al
 * dominio justo lo que prohíbe. El cliente puede responderlo solo porque cada rutina ya
 * viene diciendo en qué programas está.
 */
export function routinesLostWith(
  program: MyProgram,
  routines: readonly MyRoutine[],
): { going: readonly MyRoutine[]; staying: readonly MyRoutine[] } {
  const inside = routines.filter((routine) =>
    routine.programs.some((one) => one.program_id === program.program_id),
  )
  return {
    going: inside.filter((routine) => routine.programs.length === 1),
    staying: inside.filter((routine) => routine.programs.length > 1),
  }
}

/**
 * Qué se pierde al eliminar un programa, dicho antes de perderlo.
 *
 * **Lo entrenado se conserva, y se dice siempre.** «Eliminar» es la palabra que la gente
 * espera, pero lo que ocurre es que el programa sale de la biblioteca y de la agenda: las
 * sesiones que ya hizo alguien son su historia y no se tocan. Prometer menos de lo que se
 * cumple asusta; prometer más miente.
 */
export function removalWarning(
  program: MyProgram,
  routines: readonly MyRoutine[],
  text: LibraryWords,
): string {
  const { going, staying } = routinesLostWith(program, routines)
  const kept = text.removal.kept
  const leaves = text.removal.leaves

  if (going.length === 0 && staying.length === 0) return `${leaves} ${kept}`

  const alsoGoing =
    going.length === 0
      ? ''
      : going.length === 1
        ? text.removal.goingOne(going[0]?.title ?? '')
        : text.removal.goingMany(going.length)

  // Nombrar la que se queda, y por qué. Callarlo dejaría a alguien contando rutinas
  // después de borrar, que es cuando ya no se puede preguntar.
  const alsoStaying =
    staying.length === 0
      ? ''
      : staying.length === 1
        ? text.removal.stayingOne(staying[0]?.title ?? '')
        : text.removal.stayingMany(staying.length)

  return [leaves, alsoGoing, alsoStaying, kept].filter((part) => part !== '').join(' ')
}

/**
 * La rutina que una semana puso en un día.
 *
 * **Por plantilla y no por versión.** La semana guarda la versión exacta que compuso, y
 * republicar la rutina acuña otra: buscar la que tenga esa versión *como última* la
 * perdía en cuanto alguien la editaba, y el día se veía vacío en un programa donde la
 * rutina está puesta. Se mira si la versión guardada es **alguna** de las suyas.
 *
 * Nada se reescribe: el programa sigue componiendo la versión que eligió, que es lo que
 * `ADR-009` congela.
 */
export function routineOfVersion(
  routines: readonly MyRoutine[],
  versionId: string | null,
): MyRoutine | undefined {
  if (versionId === null) return undefined
  return routines.find((routine) => routine.versions.includes(versionId))
}

/** Si el día tiene una versión que ya no es la última de su rutina. */
export function showsOlderVersion(routine: MyRoutine, versionId: string): boolean {
  return routine.template_version_id !== null && routine.template_version_id !== versionId
}
