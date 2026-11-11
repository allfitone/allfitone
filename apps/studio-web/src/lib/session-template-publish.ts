/**
 * Publishing a session template's draft: `HU-STUDIO-038`.
 *
 * The command takes no body. It publishes the draft as the server has it saved,
 * conditioned on that draft's ETag, so what the coach sees unsaved on the
 * screen is not what would be published: the screen asks for a save first.
 *
 * The four criteria, and who holds them:
 *
 * 1. **A published version is complete and immutable.** The server's: there is
 *    no write route for a version, and publishing refuses an incomplete draft.
 *    The screen says so beside the button, so nobody publishes expecting to
 *    correct it afterwards.
 * 2. **Publishing does not move programs or assignments.** The server's too: a
 *    program position names a version id. The screen says it, for the same
 *    reason.
 * 3. **An incomplete draft answers with what is missing.** The `422` lists the
 *    codes, which `saveIssueMessages` turns into sentences.
 * 4. **The same content twice does not make two versions.** As built, the
 *    server compares with the newest version only: identical to it, it returns
 *    that one. This file tells the two answers apart by the number.
 */

import type { SessionTemplateVersion } from './studio-api'

export function latestVersionNumber(
  versions: ReadonlyArray<{ version_number: number; status: string }>,
): number | undefined {
  if (versions.length === 0) return undefined
  return Math.max(...versions.map((version) => version.version_number))
}

export function publishOutcome(
  previousLatest: number | undefined,
  version: Pick<SessionTemplateVersion, 'version_number'>,
): { kind: 'published' | 'unchanged'; message: string } {
  if (previousLatest !== undefined && version.version_number <= previousLatest) {
    return {
      kind: 'unchanged',
      message: `El borrador es igual a la versión ${version.version_number}, así que no se creó una versión nueva.`,
    }
  }
  return {
    kind: 'published',
    message: `Publicada la versión ${version.version_number}. Ya se puede usar en programas.`,
  }
}

export function publishBlockedReason(state: {
  dirty: boolean
  conflict: boolean
}): string | undefined {
  if (state.conflict) return 'Resuelve primero el aviso de que alguien guardó este borrador.'
  if (state.dirty) {
    return 'Guarda el borrador antes de publicar: se publica lo guardado, no lo que ves sin guardar.'
  }
  return undefined
}
