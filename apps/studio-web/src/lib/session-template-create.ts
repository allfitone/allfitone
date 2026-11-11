/**
 * Creating a session template: a discipline and a name, and nothing else.
 *
 * `HU-STUDIO-036`. Its three criteria are the server's: the template belongs to
 * the organization with the caller recorded as author, it exists as a stable
 * identity before anything is published, and it has exactly one owner. What
 * this screen adds is the two questions the command asks, and the answers it
 * can give back.
 *
 * The discipline is chosen once. It decides which activity types and which
 * movements the draft can hold, and the contract offers no way to change it
 * afterwards, so the form says so before the click.
 */

import type { CatalogDiscipline, SessionTemplateCreate, StudioApiError } from './studio-api'

const TITLE_LIMIT = 160

export interface TemplateCreateDraft {
  disciplineCode: string
  title: string
}

export interface TemplateCreateErrors {
  discipline?: string
  title?: string
}

export function templateCreateErrors(draft: TemplateCreateDraft): TemplateCreateErrors {
  const errors: TemplateCreateErrors = {}
  if (!draft.disciplineCode) errors.discipline = 'Elige la disciplina de la plantilla.'
  const title = draft.title.trim()
  if (!title) errors.title = 'Escribe el nombre de la plantilla.'
  else if (title.length > TITLE_LIMIT) errors.title = 'El nombre admite hasta 160 caracteres.'
  return errors
}

export function templateCreateRequest(draft: TemplateCreateDraft): SessionTemplateCreate {
  return { discipline_code: draft.disciplineCode, title: draft.title.trim() }
}

export function disciplineOptions(
  disciplines: readonly CatalogDiscipline[],
): Array<{ value: string; label: string }> {
  return disciplines
    .map((discipline) => ({ value: discipline.code, label: discipline.name }))
    .toSorted((left, right) => left.label.localeCompare(right.label, 'es'))
}

export const TEMPLATE_CREATE_UNKNOWN_ERROR =
  'No pudimos crear la plantilla. Conservamos el intento para que puedas reintentar.'

/**
 * One message per answer the command gives. Lacking `manage_content` and an
 * organization that is no longer active both arrive as the same `404` from
 * `planning.assert_manage_content`, so the message cannot tell them apart.
 */
export function templateCreateMessage(error: StudioApiError): string {
  if (error.status === 403 || error.status === 404) {
    return 'Tu rol ya no crea contenido en esta organización, o la organización no está activa.'
  }
  if (error.status === 422) {
    return 'Revisa la disciplina y el nombre. La disciplina tiene que seguir publicada.'
  }
  if (error.status === 409 || error.status === 429) {
    return 'Esa creación ya está en curso. Espera un momento y reintenta sin cambiar los datos.'
  }
  if (error.status === 503) {
    return 'La creación de contenido está pausada temporalmente. Reintenta más tarde.'
  }
  return TEMPLATE_CREATE_UNKNOWN_ERROR
}
