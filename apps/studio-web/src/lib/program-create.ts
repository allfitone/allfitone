/**
 * Creating a program: a name, and nothing else.
 *
 * The first half of `HU-STUDIO-041`. `planning.create_program` takes only a
 * title: the program belongs to the organization, the caller is recorded as its
 * author, and its first draft opens empty in the same transaction. Unlike a
 * template, a program has no discipline, because each session names its own
 * template version and that version already carries one.
 */

import type { ProgramCreate, StudioApiError } from './studio-api'

const TITLE_LIMIT = 160

export function programCreateError(title: string): string | undefined {
  const trimmed = title.trim()
  if (!trimmed) return 'Escribe el nombre del programa.'
  if (trimmed.length > TITLE_LIMIT) return 'El nombre admite hasta 160 caracteres.'
  return undefined
}

export function programCreateRequest(title: string): ProgramCreate {
  return { title: title.trim() }
}

export const PROGRAM_CREATE_UNKNOWN_ERROR =
  'No pudimos crear el programa. Conservamos el intento para que puedas reintentar.'

/**
 * Lacking `manage_content` and an organization that is no longer active both
 * arrive as the same `404` from `planning.assert_manage_content`.
 */
export function programCreateMessage(error: StudioApiError): string {
  if (error.status === 403 || error.status === 404) {
    return 'Tu rol ya no crea contenido en esta organización, o la organización no está activa.'
  }
  if (error.status === 422) return 'Revisa el nombre: no puede estar vacío.'
  if (error.status === 409 || error.status === 429) {
    return 'Esa creación ya está en curso. Espera un momento y reintenta sin cambiar el nombre.'
  }
  if (error.status === 503) {
    return 'La creación de contenido está pausada temporalmente. Reintenta más tarde.'
  }
  return PROGRAM_CREATE_UNKNOWN_ERROR
}
