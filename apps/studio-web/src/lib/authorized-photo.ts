/**
 * How Studio shows a photo a client shares: her body photos (`HU-STUDIO-052`)
 * and the photo of a meal (`HU-STUDIO-072`). Both are served the same way, and
 * neither is an ordinary image.
 *
 * **The image travels through the authenticated API, and only through it.**
 * There is no redirect, no signed storage address and no link that keeps
 * working afterwards; where it is kept never leaves the API. That is what makes
 * a link "temporary and not shareable": there is no link. The routes also check
 * the request's `Origin`, which an `<img src>` pointing at the API never sends —
 * so the screen asks for the bytes with the session and shows them from memory.
 *
 * **Every request is an access she can read**, allowed or not, and the grant is
 * checked again on each one. So a photo is asked for only when somebody opens
 * it: no thumbnails, no prefetch, no retry loop.
 *
 * **Every refusal reads the same.** A missing photo, a revoked permission, an
 * ended relationship and an expired credential all answer one 404, and the
 * screen says one thing for the four.
 */
import { StudioApiError } from './studio-api'

export type PhotoFailure = 'unavailable' | 'retry'

export function photoFailure(error: unknown): PhotoFailure {
  if (error instanceof StudioApiError && (error.status === 403 || error.status === 404)) {
    return 'unavailable'
  }
  return 'retry'
}
