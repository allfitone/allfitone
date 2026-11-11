/**
 * A gym's own movement, written and corrected: `HU-STUDIO-064` and
 * `HU-STUDIO-065`, and who may archive one (`HU-STUDIO-066`).
 *
 * The rules are `catalog.create_organization_movement` and
 * `update_organization_movement`'s, checked here first so a field can be named
 * before anything is sent:
 *
 * - A name is compared the way `catalog.normalize_movement_name` compares it:
 *   case and spacing, never accents. That decides a repeated name, an other
 *   name that repeats the name, and what a locked name may still become.
 * - A variant is always of a published global movement; the picker only offers
 *   those, and the server checks it again.
 * - Equipment is not offered: Studio has no read of the equipment catalogue,
 *   so its codes cannot be chosen here. A new movement has none, and an edit
 *   leaves the existing ones untouched because it sends only what changed.
 *
 * `HU-065` criterion 1 is the lock: once a published version uses the
 * movement (`name_locked`), the name accepts only case and spacing and the
 * discipline is fixed, so a version keeps meaning what it meant.
 */

import type {
  MovementRelation,
  OrganizationMovement,
  OrganizationMovementCreate,
  OrganizationMovementUpdate,
  OrganizationRole,
} from './studio-api'

const NAME_LIMIT = 120
const ALIAS_LIMIT = 10
const NOTE_LIMIT = 200
const ARCHIVE_MOVEMENTS = 'archive_movements'

export const RELATION_LABEL: Record<MovementRelation, string> = {
  variant: 'Variante',
  regression: 'Regresión',
  progression: 'Progresión',
}

export interface MovementVariantDraft {
  movementId: string
  /** Shown beside the choice; never sent. */
  movementName: string
  relation: MovementRelation
  note: string
}

export interface MovementFormDraft {
  disciplineCode: string
  name: string
  /** One other name per line. */
  aliasesText: string
  variant: MovementVariantDraft | null
}

export interface MovementFormErrors {
  discipline?: string
  name?: string
  aliases?: string
  variant?: string
}

export function emptyMovementForm(): MovementFormDraft {
  return { disciplineCode: '', name: '', aliasesText: '', variant: null }
}

export function normalizeMovementName(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLocaleLowerCase('es-CO')
}

function tidy(name: string): string {
  return name.trim().replace(/\s+/g, ' ')
}

export function parseAliases(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map(tidy)
    .filter((alias) => alias !== '')
}

export function movementFormErrors(
  draft: MovementFormDraft,
  options: { lockedName?: string } = {},
): MovementFormErrors {
  const errors: MovementFormErrors = {}
  if (!draft.disciplineCode) errors.discipline = 'Elige la disciplina del movimiento.'
  const name = normalizeMovementName(draft.name)
  if (!name) errors.name = 'Escribe el nombre del movimiento.'
  else if (name.length > NAME_LIMIT) errors.name = 'El nombre admite hasta 120 caracteres.'
  else if (options.lockedName !== undefined && name !== normalizeMovementName(options.lockedName)) {
    errors.name =
      'Una versión publicada ya lo usa: el nombre solo admite cambios de mayúsculas o espacios.'
  }

  const aliases = parseAliases(draft.aliasesText).map(normalizeMovementName)
  if (aliases.length > ALIAS_LIMIT) errors.aliases = 'Admite hasta 10 nombres alternativos.'
  else if (aliases.some((alias) => alias.length > NAME_LIMIT)) {
    errors.aliases = 'Cada nombre alternativo admite hasta 120 caracteres.'
  } else if (aliases.includes(name) || new Set(aliases).size !== aliases.length) {
    errors.aliases = 'Un nombre alternativo no puede repetir el nombre ni otro nombre alternativo.'
  }

  if (draft.variant && draft.variant.note.trim().length > NOTE_LIMIT) {
    errors.variant = 'La nota de la variante admite hasta 200 caracteres.'
  }
  return errors
}

function variantRequest(variant: MovementVariantDraft | null) {
  if (!variant) return null
  const note = variant.note.trim()
  return { movement_id: variant.movementId, relation: variant.relation, note: note || null }
}

export function movementCreateRequest(draft: MovementFormDraft): OrganizationMovementCreate {
  return {
    discipline_code: draft.disciplineCode,
    name: tidy(draft.name),
    aliases: parseAliases(draft.aliasesText),
    variant: variantRequest(draft.variant),
  }
}

export function movementFormFrom(movement: OrganizationMovement): MovementFormDraft {
  return {
    disciplineCode: movement.discipline_code,
    name: movement.name,
    aliasesText: movement.aliases.join('\n'),
    variant: movement.variant_of
      ? {
          movementId: movement.variant_of.id,
          movementName: movement.variant_of.name,
          relation: movement.variant_of.relation,
          note: movement.variant_of.note ?? '',
        }
      : null,
  }
}

/**
 * The fields that changed, and only those: a partial edit leaves the rest as
 * it was. `expected_revision` is added by the caller with the revision read.
 */
export function movementChanges(
  movement: OrganizationMovement,
  draft: MovementFormDraft,
): Omit<OrganizationMovementUpdate, 'expected_revision'> {
  const changes: Omit<OrganizationMovementUpdate, 'expected_revision'> = {}
  if (tidy(draft.name) !== movement.name) changes.name = tidy(draft.name)
  if (draft.disciplineCode !== movement.discipline_code) {
    changes.discipline_code = draft.disciplineCode
  }
  const aliases = parseAliases(draft.aliasesText)
  if (aliases.join('\n') !== movement.aliases.join('\n')) changes.aliases = aliases
  const before = variantRequest(
    movement.variant_of
      ? {
          movementId: movement.variant_of.id,
          movementName: movement.variant_of.name,
          relation: movement.variant_of.relation,
          note: movement.variant_of.note ?? '',
        }
      : null,
  )
  const after = variantRequest(draft.variant)
  if (JSON.stringify(before) !== JSON.stringify(after)) changes.variant = after
  return changes
}

/**
 * The codes the three commands answer with, in the reader's words: field codes
 * from a `422`, and the named conflicts of a `409`.
 */
const ISSUE_MESSAGE: Record<string, string> = {
  discipline_code: 'La disciplina ya no está publicada.',
  name: 'El nombre está vacío o es demasiado largo.',
  aliases:
    'Revisa los nombres alternativos: hasta 10, sin repetir el nombre ni repetirse entre sí.',
  equipment: 'El equipo del movimiento ya no está en el catálogo.',
  variant: 'La variante tiene que ser de un movimiento publicado del catálogo de Allfit.',
  changes: 'No hay ningún cambio que guardar.',
  'name-taken': 'Ya hay un movimiento de tu organización con ese nombre.',
  'movement-in-use':
    'Una versión publicada ya lo usa: el nombre solo admite cambios de mayúsculas o espacios, y la disciplina no cambia.',
  'movement-archived': 'El movimiento se archivó mientras lo editabas, y ya no se edita.',
}

export function movementIssueMessages(codes: readonly string[]): string[] {
  return [...new Set(codes)].map(
    (code) => ISSUE_MESSAGE[code] ?? `El servidor rechazó un dato del movimiento (${code}).`,
  )
}

/** HU-066 is the owner's and the admin's: the capability, never the role name. */
export function canArchiveMovements(
  roles: readonly string[],
  catalog: readonly OrganizationRole[] | undefined,
): boolean {
  if (!catalog?.length) return false
  return roles.some((role) =>
    catalog
      .find((entry) => entry.code === role)
      ?.capabilities.some((capability) => capability.code === ARCHIVE_MOVEMENTS),
  )
}

/**
 * Why an archive was refused. A coach is never offered it, so a `403` means the
 * role changed after the page was read; a `404`, that the movement is gone.
 */
export function movementArchiveFailure(status: number): string {
  if (status === 403) {
    return 'Archivar movimientos corresponde a propietario y administración, y tu rol ya no lo permite.'
  }
  if (status === 404) return 'Este movimiento ya no está disponible para tu organización.'
  if (status === 409 || status === 429) {
    return 'Ese archivado ya está en curso. Espera un momento y reintenta.'
  }
  if (status === 503) return 'Archivar está pausado temporalmente. Reintenta más tarde.'
  return 'No pudimos archivar el movimiento. Reintenta en un momento.'
}
