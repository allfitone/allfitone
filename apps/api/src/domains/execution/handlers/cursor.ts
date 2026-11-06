/**
 * The opaque cursor both execution surfaces hand out for a keyset page: an instant and an
 * id, as JSON in base64url. The instant travels as PostgreSQL gave it, so the next page
 * starts exactly after the last row shown; anything that does not decode is not a page.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export function encodeCursor(cursor: object): string {
  return Buffer.from(JSON.stringify(cursor)).toString('base64url')
}

/** The instant under `key` and the id, or undefined. */
export function decodeCursor(raw: string, key: string): { at: string; id: string } | undefined {
  try {
    const parsed: unknown = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'))
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return undefined
    const at: unknown = Reflect.get(parsed, key)
    const id: unknown = Reflect.get(parsed, 'id')
    if (typeof at !== 'string' || Number.isNaN(Date.parse(at))) return undefined
    return typeof id === 'string' && UUID.test(id) ? { at, id } : undefined
  } catch {
    return undefined
  }
}
