/**
 * Creating a plan, and renaming one: `HU-STUDIO-074`.
 *
 * Its three criteria, and who holds them:
 *
 * 1. **A plan exists with a name before it has a price.** `OP-PAY-002` takes
 *    the name and nothing else; the price lives in a version (`HU-STUDIO-075`).
 * 2. **A draft is sold to nobody.** Space offers only versions on sale, and a
 *    draft has none. The plan list says so under its name.
 * 3. **No two plans with the same name.** A unique index that ignores case, so
 *    the server's `409` is said as a repeated name.
 *
 * Renaming (`OP-PAY-003`) takes the same name rules, for a draft and a plan on
 * sale alike; whoever pays a renamed plan reads the new name. There is no
 * `If-Match`: the name is the only field, so the last write wins.
 *
 * The payments routes still answer the legacy `{ error }` envelope, so a `422`
 * names no field: the form checks the name first, and the server's refusal is
 * read by its status.
 */

import type { StudioApiError } from './studio-api'

const NAME_LIMIT = 80

export function planNameError(name: string): string | undefined {
  const trimmed = name.trim()
  if (!trimmed) return 'Escribe el nombre del plan.'
  if (trimmed.length > NAME_LIMIT) return 'El nombre admite hasta 80 caracteres.'
  return undefined
}

export function planNameRequest(name: string): { name: string } {
  return { name: name.trim() }
}

export function planWriteFailure(status: StudioApiError['status']): string {
  if (status === 409) {
    return 'Ya hay un plan con ese nombre, aunque esté escrito con otras mayúsculas.'
  }
  if (status === 403) {
    return 'Crear y cambiar planes corresponde a propietario y administración, y tu rol ya no lo permite.'
  }
  if (status === 404) return 'Este plan ya no está disponible para tu organización.'
  if (status === 422) return 'Revisa el nombre: de 1 a 80 caracteres.'
  if (status === 503) return 'Los planes están pausados temporalmente. Reintenta más tarde.'
  return 'No pudimos guardar el plan. Conservamos lo que escribiste para que puedas reintentar.'
}
