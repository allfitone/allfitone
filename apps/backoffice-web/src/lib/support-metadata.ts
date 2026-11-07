/**
 * Presentation rules for the support projection.
 *
 * Nothing here decides access and nothing here hides data: the server already
 * removed what must not travel. What lives here is the vocabulary an operator
 * reads, and one distinction worth keeping — the difference between "this person
 * has none" and "the screen was not told". A block the server did not send reads
 * as unknown, never as zero (`HU-BO-007` criterion 5).
 */

import type { AllfitV1Schemas } from '@allfitone/contracts'

export type SupportPersonMetadata = AllfitV1Schemas['SupportPersonMetadata']
export type SupportPeopleSearch = AllfitV1Schemas['SupportPeopleSearch']

const CASE_REFERENCE = /^[A-Z][A-Z0-9_-]{2,63}$/

/** What the API accepts as a search term, checked here so a typo is not a recorded search. */
export const SEARCH_QUERY = { min: 2, max: 100 } as const

export function isSearchable(value: string): boolean {
  const term = value.trim()
  return term.length >= SEARCH_QUERY.min && term.length <= SEARCH_QUERY.max
}

export function isValidCaseReference(value: string): boolean {
  return CASE_REFERENCE.test(value.trim())
}

/** A read may name no case (ADR-046); one given in free text is still refused. */
export function isValidOptionalCaseReference(value: string): boolean {
  return value.trim() === '' || isValidCaseReference(value)
}

export interface FileFact {
  label: string
  value: string
}

const UNKNOWN = 'Sin dato'

const PLAN_STATUS: Record<'active' | 'grace' | 'suspended' | 'ended', string> = {
  active: 'De pago, al día',
  grace: 'De pago, en periodo de gracia',
  suspended: 'De pago, suspendido por un cobro que no llegó',
  ended: 'Gratis · su suscripción terminó',
}

/**
 * `HU-BO-007` criterion 2: that each block exists, its state and its dates, never
 * which gym, which permission or how much. Partial on purpose: a server older than
 * the screen answers without the blocks, and that reads as unknown, not as none.
 */
export function fileFacts(
  metadata: Partial<SupportPersonMetadata>,
  day: (instant: string) => string,
): FileFact[] {
  const { professional_profile: profile, relationships, permissions, plan, pro } = metadata
  const dated = (parts: (string | false)[]) => parts.filter(Boolean).join(' · ')

  const profileValue = !profile
    ? UNKNOWN
    : !profile.exists
      ? 'No tiene'
      : profile.created_at !== null
        ? `Existe desde ${day(profile.created_at)}`
        : 'Existe'

  const relationshipsValue = !relationships
    ? UNKNOWN
    : relationships.active + relationships.ended === 0
      ? 'Nunca ha estado en un gimnasio'
      : dated([
          relationships.active > 0
            ? `Entrena en ${String(relationships.active)}`
            : 'No entrena en ninguno ahora',
          relationships.ended > 0 && `dejó ${String(relationships.ended)}`,
          relationships.last_started_at !== null &&
            `último ingreso ${day(relationships.last_started_at)}`,
          relationships.last_ended_at !== null &&
            `última salida ${day(relationships.last_ended_at)}`,
        ])

  const permissionsValue = !permissions
    ? UNKNOWN
    : permissions.active + permissions.frozen + permissions.revoked === 0
      ? 'No ha concedido ninguno'
      : dated([
          `${String(permissions.active)} ${permissions.active === 1 ? 'vigente' : 'vigentes'}`,
          permissions.frozen > 0 &&
            `${String(permissions.frozen)} ${permissions.frozen === 1 ? 'congelado' : 'congelados'}`,
          permissions.revoked > 0 &&
            `${String(permissions.revoked)} ${permissions.revoked === 1 ? 'retirado' : 'retirados'}`,
          permissions.last_granted_at !== null &&
            `último concedido ${day(permissions.last_granted_at)}`,
          permissions.last_revoked_at !== null &&
            `último retirado ${day(permissions.last_revoked_at)}`,
        ])

  const planValue = !plan
    ? UNKNOWN
    : plan.status === null
      ? 'Gratis · nunca se suscribió'
      : dated([
          PLAN_STATUS[plan.status],
          plan.status === 'active' && plan.started_at !== null && `desde ${day(plan.started_at)}`,
          plan.status === 'active' &&
            plan.current_period_end !== null &&
            `periodo hasta ${day(plan.current_period_end)}`,
        ])

  const proValue = !pro
    ? UNKNOWN
    : pro.source === 'subscription'
      ? `Sí, por su suscripción${pro.until !== null ? `, hasta ${day(pro.until)}` : ''}`
      : pro.source === 'organization'
        ? 'Sí, se lo da un gimnasio mientras siga en él'
        : 'No'

  return [
    { label: 'Perfil profesional', value: profileValue },
    { label: 'Gimnasios', value: relationshipsValue },
    { label: 'Permisos concedidos', value: permissionsValue },
    { label: 'Plan', value: planValue },
    { label: 'Pro', value: proValue },
  ]
}

export function verificationLabel(verifiedAt: string | null): string {
  return verifiedAt ? 'Verificado' : 'Sin verificar'
}

/**
 * What the operator is told when a read is refused. `forbidden` is the common
 * one and deserves the whole explanation: the duty is temporary by design, so
 * "it worked yesterday" is the expected experience rather than a bug.
 */
export function supportMetadataMessage(code: string): string {
  const messages: Record<string, string> = {
    forbidden:
      'Tu sesión no tiene vigente el deber de diagnóstico de soporte. Los deberes llegan con el rol de administrador: si se negó, tu rol ya no está vigente y otro administrador debe otorgártelo de nuevo.',
    'not-found': 'No hay ninguna persona con ese identificador.',
    'invalid-request':
      'La búsqueda necesita al menos dos caracteres, y la referencia del caso, si la escribes, va como CASE-2026-001.',
    'validation-failed': 'El servidor rechazó la referencia del caso. Revisa su formato.',
    unauthenticated: 'Tu sesión terminó. Vuelve a iniciar sesión.',
    'upstream-unavailable': 'El servicio no respondió. Reintenta en un momento.',
    'network-unavailable': 'No hay conexión con el API.',
  }
  return messages[code] ?? 'No se pudo leer la información de soporte.'
}
