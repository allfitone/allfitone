/**
 * Giving a person a published program version: `HU-STUDIO-046`.
 *
 * Its six criteria, and who holds each one:
 *
 * 1. **Without the training permission in force, nothing can be assigned, and
 *    the coach is told which permission is missing.** The level needed is
 *    `contribute`, not `read`, and her card already says which one she granted.
 *    So the screen decides before asking rather than offering a button the
 *    server will refuse — and the refusal is still handled, because she can
 *    withdraw it between the read and the click.
 * 2. **The version must be published, not retired, and ours.** Only published
 *    versions are offered; the other two the server answers `program-version`,
 *    because a version can be retired while the form is open.
 * 3. **The whole calendar is planted when it is assigned, in her zone and not
 *    ours.** Nothing here plants anything — the point of this rule for the
 *    screen is the day: `starts_on` is read in her zone, which this screen only
 *    ever guesses (see `plantedZone`), so the server stays the authority.
 * 4. **The relationship that originated it is recorded and never changes.**
 *    Server-side, and said in the dialog because it is not undoable.
 * 5. **No limit of simultaneous programs: an overlap warns and never blocks.**
 *    So nothing here refuses a second program, and the answer's
 *    `schedule_overlaps` is reported without ever saying with what — the
 *    contract deliberately does not say.
 * 6. **Retrying creates no second assignment.** The command headers are minted
 *    per intent, so the same version on the same day reuses them and a changed
 *    one does not.
 */

import { todayIn } from './calendar-day'
import type { ProposableVersion } from './program-versions'
import {
  StudioApiError,
  type ProgramAssignment,
  type ProgramAssignmentCreate,
  type RelationshipAssignment,
} from './studio-api'

/**
 * Whether this coach may assign at all, which criterion 1 asks the screen to
 * answer before it asks the server.
 *
 * Three answers and not two, because «she shared her training only to read» and
 * «she never shared her training» are different facts and the coach can act on
 * the first by asking her for the level. Her card carries the level she
 * granted, so none of this is guessed — and the refusal is still handled,
 * because she can withdraw it while the form is open.
 */
export type AssignPermission = 'granted' | 'read-only' | 'absent'

export function assignPermission(
  sections: readonly { scope_code: string; access_level: string }[],
): AssignPermission {
  const training = sections.find((section) => section.scope_code === 'relationship_training')
  if (!training) return 'absent'
  return training.access_level === 'contribute' ? 'granted' : 'read-only'
}

/** Why the action is not offered, in the coach's words. Null when it is. */
export function assignPermissionNote(permission: AssignPermission): string | null {
  if (permission === 'granted') return null
  if (permission === 'read-only') {
    return 'Te autorizó su entrenamiento solo para leerlo, así que todavía no le puedes asignar un programa. Hace falta que lo suba a nivel de registro, y eso lo decide ella.'
  }
  return 'No te autorizó su entrenamiento, así que no le puedes asignar un programa. El permiso que hace falta es el de entrenamiento, en nivel de registro.'
}

export interface AssignmentDraft {
  programVersionId: string
  startsOn: string
}

/*
 * Which versions may be given is `proposableVersions`, shared with the client
 * invitation: the same question asked of the same answer. It was moved out of
 * that screen rather than copied, because its rule is not obvious — a
 * published version of an archived program is not offerable.
 */

/**
 * How the version reads in the picker: its title, which version it is, and how
 * long it lasts.
 *
 * The session count is said only for a finite version. An open-ended one plants
 * one week at a time, so its `session_count` is the week's length and not the
 * program's — saying "4 sesiones" about a program with no end would be read as
 * its total.
 */
export function versionChoiceLabel(version: ProposableVersion): string {
  const name = `${version.title} · versión ${String(version.version_number)}`
  if (version.repeats_forever) return `${name} · sin fecha de final`
  const sessions =
    version.session_count === 1 ? '1 sesión' : `${String(version.session_count)} sesiones`
  return `${name} · ${sessions}`
}

/**
 * Said under a version that keeps retired templates, and null otherwise.
 *
 * `deprecated_template_version_ids` is the contract's own words: "published
 * template versions retained in this composition but already deprecated". The
 * server assigns it anyway, so this warns and never blocks — but a coach
 * choosing between two versions deserves to know which one carries them.
 */
export function retiredTemplatesNote(version: ProposableVersion): string | null {
  const count = version.deprecated_template_version_ids.length
  if (count === 0) return null
  return count === 1
    ? 'Incluye una plantilla que ya fue retirada.'
    : `Incluye ${String(count)} plantillas que ya fueron retiradas.`
}

/**
 * The zone her calendar is most likely read in.
 *
 * Her real zone lives in the database — whatever her device last sent — and no
 * operation hands it to Studio. What the screen has is the zone each assignment
 * was planted in, which is that same value at the time it was planted, so the
 * newest one is the best guess available. With no assignment at all, the
 * reader's zone is the fallback, which is the gym's and therefore where she
 * trains.
 *
 * It is a guess either way, and the form says so: the server refuses a day
 * before her today with `starts-on`, and that refusal is the authority.
 */
export function plantedZone(
  assignments: readonly RelationshipAssignment[],
  reader: string | null,
): { readonly zone: string | null; readonly fromHer: boolean } {
  const newest = [...assignments].sort((left, right) =>
    right.assigned_at.localeCompare(left.assigned_at),
  )[0]
  const hers = typeof newest?.timezone === 'string' && newest.timezone.length > 0
  if (hers && newest) return { zone: newest.timezone, fromHer: true }
  return { zone: reader, fromHer: false }
}

/**
 * With no zone to read her day in, the date is left empty rather than prefilled
 * with ours: a day that looks chosen is a day nobody checked, and the server
 * compares against hers.
 */
export function initialAssignmentDraft(zone: string | null, now: Date): AssignmentDraft {
  return { programVersionId: '', startsOn: zone ? todayIn(zone, now) : '' }
}

/**
 * Why the draft cannot be sent yet, or null when it can.
 *
 * The day is only checked against the day the screen believes it is in her
 * zone. That belief can be wrong — see `plantedZone` — so this catches the
 * ordinary mistake of picking a past date and never claims more than that.
 */
export function assignmentDraftError(draft: AssignmentDraft, today: string): string | null {
  if (draft.programVersionId === '') return 'Elige la versión del programa que le vas a asignar.'
  if (draft.startsOn === '') return 'Elige el día en que empieza.'
  // An empty `today` is «we do not know her day», so there is nothing to
  // compare against and the server decides alone.
  if (today !== '' && draft.startsOn < today) {
    return 'El programa empieza hoy o después, en el día de ella.'
  }
  return null
}

/**
 * The body the command takes.
 *
 * **The zone travels even though it is only a fallback.** The function refuses
 * with `timezone` when no zone is known for a person who never opened Space,
 * and that refusal is unexplainable to a coach — he cannot know whether she
 * installed the app. Sending ours removes the case: the server ignores it
 * whenever her device has sent one.
 */
export function assignmentRequest(
  draft: AssignmentDraft,
  fallbackZone: string | null,
): ProgramAssignmentCreate {
  return {
    program_version_id: draft.programVersionId,
    starts_on: draft.startsOn,
    ...(fallbackZone ? { timezone: fallbackZone } : {}),
  } as ProgramAssignmentCreate
}

export interface AssignmentOutcome {
  readonly title: string
  readonly description: string
  /** True when another program she follows has a session inside this one's span. */
  readonly overlaps: boolean
}

/**
 * What to say once it is done.
 *
 * Criterion 5 is the whole shape of this: an overlap is reported and never
 * presented as a problem, and **it never says which program it overlaps with**
 * — the contract says the answer does not carry that, so a sentence naming one
 * would be invented.
 */
export function assignmentOutcome(assignment: ProgramAssignment): AssignmentOutcome {
  const planted =
    assignment.planned_sessions_created === 1
      ? 'Le quedó sembrada 1 sesión'
      : `Le quedaron sembradas ${String(assignment.planned_sessions_created)} sesiones`
  return {
    title: 'Ya tiene el programa asignado',
    description: assignment.schedule_overlaps
      ? `${planted}. Algunas caen en los días de otro programa que ya sigue, y eso no impide nada: puede tener varios a la vez.`
      : `${planted}, en su propia zona horaria.`,
    overlaps: assignment.schedule_overlaps,
  }
}

/**
 * What to tell the coach when the command refuses.
 *
 * The three `422` cases are told apart by their issue code, because they ask
 * the coach for three different things: pick another version, pick another day,
 * or nothing he can do. They all arrive as `validation-failed`, so the status
 * alone cannot separate them.
 */
export function assignmentWriteFailure(error: unknown): string {
  if (!(error instanceof StudioApiError)) {
    return 'La conexión falló y no se asignó nada. Puedes volver a intentarlo.'
  }
  if (error.status === 422) {
    const codes = new Set(error.issues.map((issue) => issue.code))
    if (codes.has('program-version')) {
      return 'Esa versión ya no se puede asignar: la retiraron mientras elegías. Vuelve a elegir una publicada.'
    }
    if (codes.has('starts-on')) {
      return 'Ese día ya pasó en la zona horaria de ella. Elige hoy o un día posterior.'
    }
    if (codes.has('timezone')) {
      return 'No sabemos en qué zona horaria está esta persona, así que no se puede sembrar su agenda. Hace falta que abra Space al menos una vez.'
    }
    return 'El servidor no aceptó los datos. Revisa la versión y el día.'
  }
  if (error.status === 403 && error.code === 'scope-required') {
    return 'No te autorizó registrar su entrenamiento. Hace falta el permiso de entrenamiento en nivel de registro, no solo de lectura.'
  }
  if (error.status === 403) {
    return 'Asignar programas es de quien la atiende. Tu membresía no lo permite aquí.'
  }
  if (error.status === 409) {
    return 'Su servicio con el gimnasio está pausado, así que no se le puede asignar nada hasta que se reactive.'
  }
  if (error.status === 404) {
    return 'No encontramos a esta persona entre las que atiendes.'
  }
  return 'No se pudo asignar en este momento y no se creó nada. Puedes volver a intentarlo.'
}

/**
 * What the dialog says before the click, because none of it is on the form and
 * none of it can be undone from here.
 *
 * A finite version is planted whole the day it is assigned; an open-ended one
 * grows a week at a time. That is the difference a coach has to understand
 * before confirming, because it decides what he will see in her calendar one
 * minute later.
 */
export function assignmentConsequences(version: ProposableVersion): readonly string[] {
  return [
    version.repeats_forever
      ? 'Su agenda empieza con la primera semana. Las siguientes se van sembrando a medida que ella llega, porque el programa no tiene final.'
      : 'Toda su agenda queda sembrada ahora mismo, no más tarde: se crea en el momento de asignar.',
    'Los días se resuelven en la zona horaria de ella, no en la tuya.',
    'Queda registrado que esta asignación salió de este vínculo, y eso no cambia nunca.',
    'Si se le cruza con otro programa que ya sigue, te avisamos pero no se bloquea: puede tener varios a la vez.',
  ]
}
