/**
 * Closing a historical access case: `HU-STUDIO-063`.
 *
 * `OP-PRV-019` closes it for `manage_historical_access`, needs no recent sign-in
 * (ending access is never harder than granting it) and converges: closing a closed
 * case answers it as it stands, and one whose time ran out closes as expired.
 *
 * The three criteria are things to say, not to decide:
 *
 * 1. **A case also stops serving on its own** when its time runs out. So a case
 *    has three states, and the expired one is said as the deadline doing its job,
 *    never as an error.
 * 2. **Closing deletes no record of access.** The reads already made stay
 *    recorded against her, with this case.
 * 3. **A closed case never reopens.** Reading again needs a new case, with its
 *    own justification, so the screen offers nothing to reopen.
 */
import { caseState, memberName } from './historical-access'
import type { HistoricalAccessCase } from './studio-api'

export function closeTitle(entry: Pick<HistoricalAccessCase, 'person'>): string {
  return `¿Cerrar el caso sobre ${memberName(entry.person)}?`
}

export function closeConsequences(entry: Pick<HistoricalAccessCase, 'expires_at'>): string[] {
  const until = new Intl.DateTimeFormat('es-CO', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(entry.expires_at))
  return [
    'No se borra ningún registro: las consultas que ya se hicieron siguen registradas con este caso.',
    'Un caso cerrado no se reabre. Para volver a consultar hay que abrir uno nuevo, con su propia justificación.',
    // No full stop: the hour already ends in «p. m.».
    `Si no lo cierras, deja de servir solo el ${until}`,
  ]
}

export function closedReasonLine(
  entry: Pick<HistoricalAccessCase, 'status' | 'closed_reason' | 'closed_by' | 'authorized'>,
): string | null {
  const state = caseState(entry)
  if (state === 'open') return null
  if (state === 'expired') return 'Se cumplió el plazo: ya no deja consultar nada.'
  if (entry.closed_reason === 'grant_revoked') {
    return 'Se cerró porque la persona retiró el permiso congelado.'
  }
  if (entry.closed_reason === 'membership_ineligible') {
    return `Se cerró porque ${memberName(entry.authorized)} dejó de poder recibirlo.`
  }
  return entry.closed_by ? `Lo cerró ${memberName(entry.closed_by)}.` : 'Se cerró a mano.'
}

export function closeOutcome(
  after: Pick<HistoricalAccessCase, 'status' | 'closed_reason' | 'person'>,
): string {
  const name = memberName(after.person)
  if (caseState(after) === 'expired') {
    return `El caso sobre ${name} ya había vencido: se cerró por plazo.`
  }
  return `Cerraste el caso sobre ${name}. Ya no deja consultar nada.`
}

export function closeFailure(status: number): string {
  if (status === 403) return 'Tu rol ya no cierra casos en esta organización.'
  if (status === 404) return 'Ese caso ya no existe en esta organización.'
  return 'No pudimos cerrar el caso por un problema de conexión. Inténtalo de nuevo.'
}
