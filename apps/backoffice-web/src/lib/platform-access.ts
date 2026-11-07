/**
 * Presentation rules for the platform access inventory.
 *
 * Everything here is derived from what the API already returned. Nothing in this
 * file decides access: the inventory is evidence of who reaches the data, never
 * a cache of authorization, so a screen must not infer from it what the operator
 * may do. Every action is attempted and the API answers.
 */

import type { PlatformDutyAssignment, PlatformDutyCode } from './backoffice-api'

export type PlatformDutyStatus = PlatformDutyAssignment['status']
export type PlatformActorMode = PlatformDutyAssignment['actor_mode']
export type PlatformRoleStatus = 'active' | 'revoked'

/** The closed catalogue of ADR-028, in the order an operator reads it. */
export const PLATFORM_DUTY_CODES: readonly PlatformDutyCode[] = [
  'view_platform_metrics',
  'diagnose_support_metadata',
  'view_billing_metadata',
  'manage_organization_lifecycle',
  'request_break_glass',
  'verify_professional_credentials',
  'curate_global_catalog',
  'manage_platform_commercial',
  'manage_platform_access',
  'audit_platform_access',
  'approve_break_glass',
  'audit_break_glass',
  'manage_privacy_requests',
]

const DUTY_LABELS: Record<PlatformDutyCode, string> = {
  view_platform_metrics: 'Ver métricas de plataforma',
  diagnose_support_metadata: 'Diagnosticar metadatos de soporte',
  view_billing_metadata: 'Ver metadatos de cobro',
  manage_organization_lifecycle: 'Administrar el ciclo de vida de gimnasios',
  request_break_glass: 'Solicitar acceso excepcional',
  verify_professional_credentials: 'Verificar credenciales profesionales',
  curate_global_catalog: 'Curar el catálogo global',
  manage_platform_commercial: 'Administrar lo comercial de la plataforma',
  manage_platform_access: 'Administrar accesos de plataforma',
  audit_platform_access: 'Auditar accesos de plataforma',
  approve_break_glass: 'Aprobar acceso excepcional',
  audit_break_glass: 'Auditar acceso excepcional',
  manage_privacy_requests: 'Gestionar solicitudes de privacidad',
}

// ADR-037: modes derived from the duty exercised, never organizational roles.
const ACTOR_MODE_LABELS: Record<PlatformActorMode, string> = {
  A10: 'Soporte y operación',
  A11: 'Curaduría y verificación',
  A12: 'Seguridad y privacidad',
}

const DUTY_STATUS_LABELS: Record<PlatformDutyStatus, string> = {
  scheduled: 'Programado',
  active: 'Vigente',
  suspended: 'Suspendido',
  expired: 'Vencido',
  revoked: 'Revocado',
}

const ROLE_STATUS_LABELS: Record<PlatformRoleStatus, string> = {
  active: 'Vigente',
  revoked: 'Retirado',
}

export type StatusTone = 'success' | 'warning' | 'secondary' | 'destructive'

const DUTY_STATUS_TONES: Record<PlatformDutyStatus, StatusTone> = {
  scheduled: 'secondary',
  active: 'success',
  suspended: 'warning',
  expired: 'secondary',
  revoked: 'destructive',
}

export function dutyLabel(code: PlatformDutyCode): string {
  return DUTY_LABELS[code]
}

export function actorModeLabel(mode: PlatformActorMode): string {
  return ACTOR_MODE_LABELS[mode]
}

export function dutyStatusLabel(status: PlatformDutyStatus): string {
  return DUTY_STATUS_LABELS[status]
}

export function dutyStatusTone(status: PlatformDutyStatus): StatusTone {
  return DUTY_STATUS_TONES[status]
}

export function roleStatusLabel(status: PlatformRoleStatus): string {
  return ROLE_STATUS_LABELS[status]
}

export function roleStatusTone(status: PlatformRoleStatus): StatusTone {
  return status === 'active' ? 'success' : 'destructive'
}

/**
 * A duty that is neither effective nor scheduled cannot be suspended or revoked
 * again. This is presentation only — the command refuses it regardless.
 */
export function isDutyClosed(status: PlatformDutyStatus): boolean {
  return status === 'expired' || status === 'revoked'
}

/**
 * ADR-046: the admin role brings every duty and they last as long as it does. Such a
 * duty is never suspended, revoked or recertified alone; withdrawing the role ends it.
 */
export function isHeldThroughRole(assignment: Pick<PlatformDutyAssignment, 'basis'>): boolean {
  return assignment.basis === 'admin_role'
}

/** The far `valid_to` of a duty the role brings is storage, not a date to read. */
export function dutyWindowLabel(
  assignment: Pick<PlatformDutyAssignment, 'basis' | 'valid_from' | 'valid_to'>,
): string {
  if (isHeldThroughRole(assignment)) return 'Permanente · rol admin'
  return `${formatInstant(assignment.valid_from)} → ${formatInstant(assignment.valid_to)}`
}

/**
 * HU-BO-028 c4: only a duty in force is attested as still needed. A suspended one is
 * reinstated and a closed one granted again; the command refuses them either way.
 */
export function canRecertify(status: PlatformDutyStatus): boolean {
  return status === 'active'
}

/** HU-BO-029 c2: every effective state the API filters on, and none. */
export const DUTY_STATUS_FILTERS: readonly { value: PlatformDutyStatus | ''; label: string }[] = [
  { value: '', label: 'Todos los estados' },
  { value: 'active', label: DUTY_STATUS_LABELS.active },
  { value: 'scheduled', label: DUTY_STATUS_LABELS.scheduled },
  { value: 'suspended', label: DUTY_STATUS_LABELS.suspended },
  { value: 'expired', label: DUTY_STATUS_LABELS.expired },
  { value: 'revoked', label: DUTY_STATUS_LABELS.revoked },
]

/**
 * The identifier is what an operator quotes in a case, and a full UUID is
 * unreadable in a table. The short form is for reading, never for matching: the
 * full value stays available for copying.
 */
export function shortIdentifier(id: string): string {
  return id.length <= 13 ? id : `${id.slice(0, 8)}…${id.slice(-4)}`
}

/** Unknown is shown as absent, never as a zero or a false. */
export function formatInstant(value: string | null | undefined): string {
  if (!value) return '—'
  const parsed = Date.parse(value)
  if (Number.isNaN(parsed)) return '—'
  return new Intl.DateTimeFormat('es-CO', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(parsed))
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export function isValidPersonId(value: string): boolean {
  return UUID.test(value)
}

/**
 * What the operator is told when a command is refused.
 *
 * `forbidden` is the interesting one. An admin holds every duty (ADR-046), so it means
 * an order about oneself, which nobody may give, or a role withdrawn mid-session.
 */
export function platformAccessMessage(code: string): string {
  const messages: Record<string, string> = {
    forbidden:
      'No se aplicó. Nadie se otorga ni se retira a sí mismo un rol o un deber: si la persona eras tú, pídeselo al otro administrador. Si era otra persona, tu sesión ya no tiene el rol de administrador: puede haber sido retirado.',
    'not-found': 'La asignación ya no existe.',
    conflict:
      'La base de datos rechazó el cambio: puede ser el último administrador base, una asignación ya cerrada o un deber que llega con el rol de administrador, que sólo se retira retirando el rol.',
    'validation-failed': 'Revisa los datos: alguno no cumple el catálogo cerrado o la vigencia.',
    'invalid-request': 'Falta un identificador de comando. Vuelve a intentarlo.',
    'idempotency-in-progress': 'El comando anterior sigue procesándose. Reintenta en un momento.',
    unauthenticated: 'Tu sesión terminó. Vuelve a iniciar sesión.',
    'upstream-unavailable': 'El servicio no respondió. Reintenta en un momento.',
    'network-unavailable': 'No hay conexión con el API.',
  }
  return messages[code] ?? 'No se pudo completar la operación.'
}
