/**
 * Offering a first program with the invitation.
 *
 * Criteria 2, 6 and 7 of `HU-STUDIO-023`, which arrived after this screen had
 * already shipped. Everything below was read out of
 * `organizations.create_client_invitation` rather than inferred, because five
 * of its refusals are `22023` and **the API drops PostgreSQL's `detail`**: the
 * field list the function carefully attaches (`["program"]`, `["scopes"]`,
 * `["program-starts-on"]`, `["program-version"]`) never reaches the browser. A
 * refusal therefore cannot be pointed at a field, so the form has to prevent
 * each one instead of explaining it afterwards.
 *
 * What the function requires, in its own order:
 *
 * - **A program is a version, a start and a time zone, or it is not proposed.**
 *   Two of the three is `22023`.
 * - **`relationship_training` at `contribute` must be among the offered
 *   scopes** — *«without her training at contribute the program could never be
 *   created»*. This is the one place the invitation stops asking only to read,
 *   and the form makes the raised scope visible rather than adding it behind
 *   the reader's back: a request the professional cannot see ticked is exactly
 *   what the `read`-only rule in `client-invitations.ts` exists to prevent.
 * - **The start is today or later in the proposal's own zone.** The zone is the
 *   browser's, so the comparison here has to be made in it too.
 * - **The version is published, ours, and its program not archived**, checked
 *   under `for share` so a retirement cannot slip in. The picker offers exactly
 *   that set, and a race is the only refusal left for the copy to carry.
 * - **`assign_programs`**, because *«proposing a program is assigning one»*.
 *   Only `coach` holds it, so an owner or admin inviting sees no program block.
 */

import type { OfferableScope, OrganizationRole } from './studio-api'

const ASSIGN_PROGRAMS = 'assign_programs'

/** The scope the program cannot start without. */
/*
 * Both of these moved to shared modules once a second screen needed them, and
 * are re-exported here so this module stays the one place the invitation's
 * program rules are read from.
 */
export { todayIn } from './calendar-day'
export { proposableVersions, type ProposableVersion } from './program-versions'

export const TRAINING_SCOPE = 'relationship_training'

/** Everything else stays at `read`; this one is raised only while proposing. */
export const CONTRIBUTE = 'contribute' as const

export interface ProgramDraft {
  /** Empty means no program is being proposed. */
  versionId: string
  /** `yyyy-mm-dd`, as the date input gives it. */
  startsOn: string
}

export const noProgram: ProgramDraft = { versionId: '', startsOn: '' }

export type ProgramDraftErrors = Partial<Record<'version' | 'startsOn', string>>

export function canProposeProgram(
  roles: readonly string[],
  catalog: readonly OrganizationRole[] | undefined,
): boolean {
  if (!catalog?.length) return false
  return roles.some((role) =>
    catalog
      .find((entry) => entry.code === role)
      ?.capabilities.some((capability) => capability.code === ASSIGN_PROGRAMS),
  )
}

/**
 * A program whose scope the gym cannot ask for is not proposable, whatever the
 * capability says. The catalogue is curated in Backoffice, so this is a real
 * state rather than a defensive check.
 */
export function trainingScopeOffered(catalog: readonly OfferableScope[]): boolean {
  return catalog.some((scope) => scope.scope_code === TRAINING_SCOPE)
}

/**
 * The same set the function will accept: a published version of a program that
 * is not archived. A deprecated version is a retired one and is left out.
 */
export function isProposing(draft: ProgramDraft): boolean {
  return draft.versionId !== ''
}

/**
 * `todayInZone` is `yyyy-mm-dd` in the zone the proposal will carry, which is
 * the comparison the function makes. Comparing against the device's local date
 * would refuse a valid start, or send one the server rejects, whenever the two
 * disagree — which is most of a day for somebody travelling.
 */
export function validateProgramDraft(draft: ProgramDraft, todayInZone: string): ProgramDraftErrors {
  const errors: ProgramDraftErrors = {}
  if (!isProposing(draft)) {
    // Not proposing is always valid, even with a date left behind in the field.
    return errors
  }
  if (!draft.startsOn) {
    errors.startsOn = 'Elige cuándo empieza. Un programa sin fecha no se puede proponer.'
  } else if (draft.startsOn < todayInZone) {
    errors.startsOn = 'Esa fecha ya pasó. Elige hoy o un día posterior.'
  }
  return errors
}

/**
 * The zone the proposal carries. The server falls back to Studio's own when a
 * proposal has none, but it never guesses the professional's, so sending the
 * browser's is what makes «today» mean the same thing on both sides.
 */
export function proposalTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone
}

/**
 * Why the invitation stops asking only to read, in the professional's words
 * rather than the scope's. Said where the program is chosen, because that is
 * the decision that causes it.
 */
export const PROGRAM_RAISES_TRAINING =
  'Para que el programa pueda arrancar, la invitación pedirá permiso para registrar su entrenamiento, no solo para leerlo. Ella lo decide por separado: si acepta la relación y rechaza esto, queda vinculada y el programa no arranca.'

/** Criterion 7, from her side, once the invitation is away. */
export const PROGRAM_NEEDS_THREE_YESES =
  'El programa solo arranca si acepta la relación, acepta la propuesta y concede ese permiso.'

/**
 * The one refusal left after the form has checked everything. Any `422` that
 * still arrives means the list this form offered is no longer true — somebody
 * retired the version, or the zone this device reports is not one PostgreSQL
 * knows — so the only useful instruction is to read it again.
 */
export const PROGRAM_REFUSED =
  'El servidor rechazó el programa propuesto. Puede que alguien haya retirado esa versión mientras llenabas el formulario: vuelve a cargar la página y elígela otra vez. La invitación no se envió.'
