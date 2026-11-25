/**
 * Why a save did not land, said in a way somebody can act on.
 *
 * Every failure used to read «revisa tu conexión», which is true of exactly one of
 * them. A stale draft is not a connection problem — something else saved first and the
 * screen is holding a version of the truth that no longer exists — and no amount of
 * checking the wifi fixes it. Saying so is the difference between a message somebody
 * can act on and one they learn to ignore.
 *
 * A malformed request is a defect of ours and says so plainly. Somebody staring at
 * «revisa tu conexión» on a perfectly good connection is being told to go and look for
 * a problem that is not theirs.
 */

import type { Dictionary } from '../i18n'
import { ApiError } from './api-error'

type SaveWords = Dictionary['training']['save']

export function saveFailure(cause: unknown, text: SaveWords): string {
  if (!(cause instanceof ApiError)) return text.offline
  if (cause.failure === 'unauthenticated') return text.expired
  if (cause.failure === 'conflict') return text.stale
  if (cause.failure === 'not-found') return text.gone
  if (cause.failure === 'invalid-request') return text.refused
  if (cause.failure === 'validation-failed') return text.refused
  return text.offline
}

/**
 * Por qué una rutina no se descartó.
 *
 * **Un programa no puede quedarse sin rutinas**, así que descartar la única que le queda
 * a alguno se rechaza. El texto lo dice y propone lo único que funciona: añadirle otra.
 *
 * Antes decía «quítala de ahí primero», que era un callejón sin salida — un programa
 * publicado no se puede vaciar ni descartar, así que quien siguiera el consejo daba
 * vueltas. Un mensaje que manda a hacer algo imposible es peor que uno genérico.
 *
 * Nombra el programa cuando la rutina está en uno solo, porque entonces no hay duda de
 * cuál es. Con varios, el cliente no sabe cuál se quedaría vacío —eso depende de lo que
 * haya dentro de cada uno— y decir un nombre al azar sería peor que no decir ninguno.
 */
export function discardFailure(
  cause: unknown,
  programs: readonly { title: string }[],
  text: SaveWords,
): string {
  if (!(cause instanceof ApiError) || cause.failure !== 'conflict') return text.discardFailed
  const only = programs.length === 1 ? programs[0]?.title : undefined
  if (only) return text.lastRoutineOf(only)
  return text.lastRoutine
}
