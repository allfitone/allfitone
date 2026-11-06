/**
 * Presentation rules for technical diagnosis.
 *
 * The vocabulary matters more than usual here. An operator scanning this list is
 * deciding whether to keep digging or to stop, and the difference between "not
 * sent yet" and "tried and failed" is exactly that decision. Flattening the
 * states into "error / ok" would turn a healthy queue into a wall of red.
 */

import type { AllfitV1Schemas } from '@allfitone/contracts'

export type SupportOperation = AllfitV1Schemas['SupportOperation']
export type SupportOperationState = AllfitV1Schemas['SupportOperationState']
export type SupportOperationSourceKind = AllfitV1Schemas['SupportOperationSourceKind']
export type SupportDeliveryCircuit = AllfitV1Schemas['SupportDeliveryCircuit']
export type SupportJobHealthItem = AllfitV1Schemas['SupportJobHealthItem']

export const SUPPORT_OPERATION_SOURCES: readonly SupportOperationSourceKind[] = [
  'notification',
  'command',
  'job',
  'store_notification',
]

export const SUPPORT_OPERATION_STATES: readonly SupportOperationState[] = [
  'pending',
  'retrying',
  'delivered',
  'dead_lettered',
  'processing',
  'stalled',
  'succeeded',
  'rejected_final',
  'failed',
]

const SOURCE_LABELS: Record<SupportOperationSourceKind, string> = {
  notification: 'Aviso',
  command: 'Comando',
  job: 'Tarea programada',
  store_notification: 'Aviso de la tienda',
}

const STATE_LABELS: Record<SupportOperationState, string> = {
  pending: 'Sin enviar todavía',
  retrying: 'Reintentando',
  delivered: 'Entregado',
  dead_lettered: 'Se rindió',
  processing: 'En curso',
  stalled: 'Atascado',
  succeeded: 'Terminado',
  rejected_final: 'Rechazado',
  failed: 'Falló',
}

export function sourceLabel(source: SupportOperationSourceKind): string {
  return SOURCE_LABELS[source]
}

export function operationStateLabel(state: SupportOperationState): string {
  return STATE_LABELS[state]
}

/** What each closed filter says, including when it filters nothing. */
export function sourceFilterLabel(source: SupportOperationSourceKind | 'any'): string {
  return source === 'any' ? 'Todo' : SOURCE_LABELS[source]
}

export function operationStateFilterLabel(state: SupportOperationState | 'any'): string {
  return state === 'any' ? 'Todo' : STATE_LABELS[state]
}

export type StateTone = 'success' | 'destructive' | 'warning' | 'secondary'

/**
 * Only the three states that mean somebody has to act read as failures.
 * `retrying` is warned about rather than alarmed about — the platform is still
 * working on it — and `pending` is not a problem at all.
 */
export function operationStateTone(state: SupportOperationState): StateTone {
  if (
    state === 'dead_lettered' ||
    state === 'stalled' ||
    state === 'rejected_final' ||
    state === 'failed'
  )
    return 'destructive'
  if (state === 'retrying') return 'warning'
  if (state === 'delivered' || state === 'succeeded') return 'success'
  return 'secondary'
}

export function needsAttention(operation: SupportOperation): boolean {
  return operationStateTone(operation.state) === 'destructive'
}

/** The worker runs every minute; a job silent for this long has stopped. */
export const SILENT_JOB_MINUTES = 10

const JOB_LABELS: Record<string, string> = {
  invitation_delivery: 'Envío de invitaciones y avisos',
  backoffice_auth_cleanup: 'Cierre de sesiones del Backoffice',
  account_recovery_delivery: 'Recuperación de cuentas',
  platform_duty_lapse: 'Vencimiento de deberes',
  privacy_disposition: 'Eliminaciones de privacidad',
  correction_proposal_expiry: 'Vencimiento de propuestas de corrección',
}

/** A known job reads as what it does; a new one is named by its code until it has words. */
export function jobLabel(jobName: string): string {
  return JOB_LABELS[jobName] ?? jobName
}

function minutesSince(instant: string, now: number): number {
  return Math.max(0, Math.round((now - Date.parse(instant)) / 60_000))
}

function isSilent(job: SupportJobHealthItem, now: number): boolean {
  return minutesSince(job.last_run_at, now) >= SILENT_JOB_MINUTES
}

export function jobHealthLine(job: SupportJobHealthItem, now = Date.now()): string {
  const minutes = minutesSince(job.last_run_at, now)
  if (isSilent(job, now)) {
    return `No corre desde hace ${minutes} min: el worker puede haberse detenido.`
  }
  const ran = `Corrió hace ${minutes} min`
  const failures =
    job.failures_24h === 0
      ? ''
      : ` ${job.failures_24h} fallo${job.failures_24h === 1 ? '' : 's'} en 24 horas.`
  if (job.last_outcome === 'failed') {
    return `${ran} y falló (${job.last_error_code ?? 'sin código'}).${failures}`
  }
  return `${ran} y terminó bien.${failures}`
}

export function jobHealthTone(job: SupportJobHealthItem, now = Date.now()): StateTone {
  if (job.last_outcome === 'failed') return 'destructive'
  if (isSilent(job, now)) return 'warning'
  return 'success'
}

/** Jobs that stopped running: nothing else in the Backoffice would say so. */
export function silentJobs(jobs: readonly SupportJobHealthItem[], now = Date.now()): string[] {
  return jobs.filter((job) => isSilent(job, now)).map((job) => job.job_name)
}

export function circuitTone(state: string): StateTone {
  if (state === 'open') return 'destructive'
  if (state === 'half_open') return 'warning'
  return 'success'
}

/**
 * A tripped circuit is the answer to most "the notification never arrived"
 * cases, so it is said in one line before anyone reads the feed.
 */
export function circuitSummary(circuits: readonly SupportDeliveryCircuit[]): string | null {
  const tripped = circuits.filter((circuit) => circuit.state !== 'closed')
  if (tripped.length === 0) return null
  if (tripped.length === 1) {
    return `La entrega de ${tripped[0]?.event_type} está interrumpida. Antes de revisar avisos uno por uno, el canal es la causa más probable.`
  }
  return `Hay ${tripped.length} canales de entrega interrumpidos. Antes de revisar avisos uno por uno, esa es la causa más probable.`
}

const IDENTIFIER = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Short enough for a row; the whole identifier travels in the element's title. */
export function shortIdentifier(id: string): string {
  return `${id.slice(0, 8)}…`
}

/** What the operation is about: the kind of thing and which one. */
export function subjectLine(operation: SupportOperation): string {
  if (!operation.subject_kind || !operation.subject_id) return 'Sin sujeto'
  return `${operation.subject_kind} ${shortIdentifier(operation.subject_id)}`
}

/** Checked before the search travels, so a typo is refused instead of answering nothing. */
export function isValidOperationIdentifier(value: string): boolean {
  return IDENTIFIER.test(value.trim())
}

export function supportDiagnosisMessage(code: string): string {
  const messages: Record<string, string> = {
    forbidden:
      'Tu sesión no tiene vigente el deber de diagnóstico de soporte. Los deberes vencen por diseño: pide que te lo asignen de nuevo.',
    'invalid-request': 'Uno de los filtros no es válido. Vuelve a cargar la página.',
    unauthenticated: 'Tu sesión terminó. Vuelve a iniciar sesión.',
    'upstream-unavailable': 'El servicio no respondió. Reintenta en un momento.',
    'network-unavailable': 'No hay conexión con el API.',
  }
  return messages[code] ?? 'No se pudo leer el estado técnico.'
}
