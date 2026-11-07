/**
 * Presentation rules for the minimised support projection.
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

export type SupportLookupKind = 'identifier' | 'email' | 'phone'

export const SUPPORT_LOOKUP_KINDS: readonly SupportLookupKind[] = ['identifier', 'email', 'phone']

const LOOKUP_LABELS: Record<SupportLookupKind, string> = {
  identifier: 'Identificador',
  email: 'Correo exacto',
  phone: 'Teléfono exacto',
}

const LOOKUP_PLACEHOLDERS: Record<SupportLookupKind, string> = {
  identifier: '019a5000-0000-7000-8000-000000000005',
  email: 'persona@ejemplo.com',
  phone: '+573001234567',
}

export function lookupLabel(kind: SupportLookupKind): string {
  return LOOKUP_LABELS[kind]
}

export function lookupPlaceholder(kind: SupportLookupKind): string {
  return LOOKUP_PLACEHOLDERS[kind]
}

const CASE_REFERENCE = /^[A-Z][A-Z0-9_-]{2,63}$/
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const EMAIL = /^[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)+$/
const PHONE = /^\+[1-9][0-9]{6,14}$/

export function isValidCaseReference(value: string): boolean {
  return CASE_REFERENCE.test(value.trim())
}

/**
 * Checked before the request travels so a typo is not recorded as a search. The
 * database refuses the same shapes; this exists to answer the operator sooner,
 * never to let something through that the server would reject.
 */
export function isValidLookup(kind: SupportLookupKind, value: string): boolean {
  const trimmed = value.trim()
  if (kind === 'identifier') return UUID.test(trimmed)
  if (kind === 'email') return EMAIL.test(trimmed)
  return PHONE.test(trimmed)
}

export function lookupIssueMessage(kind: SupportLookupKind): string {
  if (kind === 'identifier') return 'El identificador no tiene la forma de un UUID.'
  if (kind === 'email') return 'Escribe el correo completo, tal como la persona lo entregó.'
  return 'El teléfono va en formato internacional, empezando por «+».'
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
    'invalid-request': 'Falta la referencia del caso o el dato buscado no tiene la forma esperada.',
    'validation-failed': 'El servidor rechazó la referencia del caso. Revisa su formato.',
    unauthenticated: 'Tu sesión terminó. Vuelve a iniciar sesión.',
    'upstream-unavailable': 'El servicio no respondió. Reintenta en un momento.',
    'network-unavailable': 'No hay conexión con el API.',
  }
  return messages[code] ?? 'No se pudo leer la información de soporte.'
}
