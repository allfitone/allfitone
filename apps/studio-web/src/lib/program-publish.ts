/**
 * Publishing a program's draft: `HU-STUDIO-042`.
 *
 * Like a template, the command takes no body and publishes the draft as the
 * server has it saved, under that draft's ETag; the screen asks for a save
 * first. The four criteria, and who holds them:
 *
 * 1. **Every position points to a published template version.** The server's,
 *    and already true of every draft this editor writes: a session can only
 *    name a version, and a draft is not one. `program_content_errors` checks it
 *    again on publishing (`template-version`).
 * 2. **A published version is immutable; a new template means a new program
 *    version.** There is no write route for a version. The screen says so
 *    before the click.
 * 3. **A program v1 fixed to template v1 stays there when v2 exists.** A
 *    session stores a version id, so nothing ever moves it. Said beside the
 *    button with criterion 2.
 * 4. **Equivalent publications converge.** As built, against the newest
 *    version only: the same content returns that version. Told apart here by
 *    the number, as for templates.
 *
 * `HU-STUDIO-041` criterion 3 lands here too: publishing warns about the
 * retired versions the draft keeps, from the list the server derives for the
 * saved draft (`deprecated_template_version_ids`).
 */

import type { TemplateVersionChoice } from './program-editor'
import type { ProgramVersion } from './studio-api'

export function programPublishOutcome(
  previousLatest: number | undefined,
  version: Pick<ProgramVersion, 'version_number'>,
): { kind: 'published' | 'unchanged'; message: string } {
  if (previousLatest !== undefined && version.version_number <= previousLatest) {
    return {
      kind: 'unchanged',
      message: `El borrador es igual a la versión ${version.version_number}, así que no se creó una versión nueva.`,
    }
  }
  return {
    kind: 'published',
    message: `Publicada la versión ${version.version_number}. Ya se puede asignar a una persona.`,
  }
}

/** Each retired version the saved draft uses, named once, for the warning. */
export function retiredVersionsInDraft(
  ids: readonly string[],
  index: ReadonlyMap<string, TemplateVersionChoice>,
): string[] {
  return [
    ...new Set(
      ids.map((id) => {
        const version = index.get(id)
        return version
          ? `${version.templateTitle} · versión ${version.versionNumber}`
          : 'Una versión de plantilla que ya no está disponible'
      }),
    ),
  ]
}
