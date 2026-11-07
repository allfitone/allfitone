/**
 * `HU-BO-033` — the legal holds an officer answers for, and the form that applies one.
 *
 * A hold names a person and kinds of their data. It is applied when the order arrives,
 * before anyone asks to delete anything, so the form starts from a person and not from
 * a request: what the person later asks to delete while it lasts stays, and they are
 * told why and until when.
 *
 * **Only what the platform deletes can be held.** Body, health and nutrition are the
 * kinds a person's deletion reaches; offering any other would promise a protection no
 * deletion ever needs.
 *
 * **Every hold ends.** The form refuses one without a date, and the list says how long
 * each has left. A hold past its date reads as ended even before the worker records it,
 * because it already keeps nothing new; the last week is marked so a renewal is filed in
 * time. Renewing is applying a second hold over the same data: what the first one kept
 * passes to it without a gap.
 *
 * The person is an identifier here, as in the erasure panel: this screen governs what is
 * kept, it does not open anyone's file.
 */

import type { AllfitV1Schemas } from '@allfitone/contracts'

export type LegalHold = AllfitV1Schemas['LegalHold']
export type LegalHoldPage = AllfitV1Schemas['LegalHoldPage']
export type LegalHoldState = AllfitV1Schemas['LegalHoldState']
export type LegalHoldReason = AllfitV1Schemas['LegalHoldReason']
export type LegalHoldApplication = AllfitV1Schemas['LegalHoldApplication']
export type HoldableCategory = LegalHoldApplication['data_classification_codes'][number]
type DataClassificationCode = AllfitV1Schemas['DataClassificationCode']

/** The last days of a hold, marked so a renewal is filed before it ends. */
export const ENDS_SOON_DAYS = 7

const DAY = 24 * 60 * 60 * 1000
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export const HOLDABLE_CATEGORIES: readonly HoldableCategory[] = ['body', 'health', 'nutrition']

const CATEGORY_LABELS: Record<DataClassificationCode, string> = {
  operational: 'Operación',
  audit: 'Auditoría',
  identity_pii: 'Identidad',
  training: 'Entrenamiento',
  body: 'Cuerpo',
  nutrition: 'Nutrición',
  health: 'Salud',
}

export function categoryLabel(code: DataClassificationCode): string {
  return CATEGORY_LABELS[code]
}

const HOLD_REASON_LABELS: Record<LegalHoldReason, string> = {
  judicial_order: 'orden judicial',
  regulatory_request: 'requerimiento de autoridad',
  service_dispute: 'disputa por el servicio',
  tax_or_accounting_obligation: 'obligación contable o tributaria',
}

export function holdReasonLabel(reason: LegalHoldReason): string {
  return HOLD_REASON_LABELS[reason]
}

export const HOLD_REASONS: readonly LegalHoldReason[] = [
  'judicial_order',
  'regulatory_request',
  'service_dispute',
  'tax_or_accounting_obligation',
]

// ---------------------------------------------------------------- the form

export interface HoldDraft {
  subjectPersonId: string
  categories: HoldableCategory[]
  scopeDescription: string
  reasonCode: LegalHoldReason
  caseReference: string
  validTo: string
}

export function emptyHold(subjectPersonId = '', categories: HoldableCategory[] = []): HoldDraft {
  return {
    subjectPersonId,
    categories,
    scopeDescription: '',
    reasonCode: 'judicial_order',
    caseReference: '',
    validTo: '',
  }
}

export type HoldIssue = 'subject' | 'categories' | 'scope' | 'case' | 'vigency'

/** The first thing missing, in the order the form shows its fields. */
export function holdIssue(draft: HoldDraft, now = Date.now()): HoldIssue | undefined {
  if (!UUID.test(draft.subjectPersonId.trim())) return 'subject'
  if (draft.categories.length === 0) return 'categories'
  if (draft.scopeDescription.trim().length < 3) return 'scope'
  if (draft.caseReference.trim().length < 3) return 'case'
  const ends = Date.parse(`${draft.validTo}T23:59:59`)
  if (!draft.validTo || Number.isNaN(ends) || ends <= now) return 'vigency'
  return undefined
}

export function holdIssueMessage(issue: HoldIssue): string {
  const messages: Record<HoldIssue, string> = {
    subject: 'Pega el identificador de la persona, tal como aparece en su ficha o en la solicitud.',
    categories: 'Marca al menos un tipo de dato que haya que conservar.',
    scope: 'Describe qué cubre la retención, con tus palabras.',
    case: 'Anota la referencia del requerimiento u orden que la sustenta.',
    vigency: 'Di hasta cuándo. No existen suspensiones indefinidas, y una fecha pasada no sirve.',
  }
  return messages[issue]
}

/** What travels: trimmed, and ending at the close of the day the officer chose. */
export function holdApplication(draft: HoldDraft): LegalHoldApplication {
  return {
    subject_person_id: draft.subjectPersonId.trim().toLowerCase(),
    data_classification_codes: [...draft.categories],
    scope_description: draft.scopeDescription.trim(),
    reason_code: draft.reasonCode,
    case_reference: draft.caseReference.trim(),
    valid_to: new Date(`${draft.validTo}T23:59:59`).toISOString(),
  }
}

// ---------------------------------------------------------------- the list

export type HoldState = 'active' | 'due_soon' | 'lapsed' | 'released'

export interface HoldRow {
  id: string
  subject: string | null
  kinds: string
  reason: string
  reference: string
  scope: string
  state: HoldState
  stateLabel: string
  holding: string
  releasable: boolean
}

export function holdStateOf(hold: LegalHold, now = Date.now()): HoldState {
  if (hold.status === 'released') return 'released'
  const remaining = Date.parse(hold.valid_to) - now
  if (hold.status === 'lapsed' || remaining <= 0) return 'lapsed'
  return remaining <= ENDS_SOON_DAYS * DAY ? 'due_soon' : 'active'
}

export type HoldTone = 'warning' | 'secondary' | 'success'

export function holdTone(state: HoldState): HoldTone {
  if (state === 'due_soon') return 'warning'
  return state === 'active' ? 'success' : 'secondary'
}

export function holdRows(page: LegalHoldPage, now = Date.now()): HoldRow[] {
  return page.items.map((hold) => {
    const state = holdStateOf(hold, now)
    return {
      id: hold.id,
      subject: hold.subject_person_id,
      kinds: hold.data_classification_codes.map(categoryLabel).join(' · ') || '—',
      reason: holdReasonLabel(hold.reason_code),
      reference: hold.case_reference,
      scope: hold.scope_description,
      state,
      stateLabel: stateLabel(hold, state, now),
      holding:
        hold.suspended_items > 0
          ? plural(hold.suspended_items, 'borrado detenido', 'borrados detenidos')
          : 'Ningún borrado detenido todavía',
      releasable: state === 'active' || state === 'due_soon',
    }
  })
}

function stateLabel(hold: LegalHold, state: HoldState, now: number): string {
  if (state === 'released') return `Liberada el ${formatDay(hold.released_at ?? hold.valid_to)}`
  if (state === 'lapsed') return `Venció el ${formatDay(hold.valid_to)}`
  const days = Math.ceil((Date.parse(hold.valid_to) - now) / DAY)
  return days <= 1 ? 'Vence hoy' : `Vence en ${days} días`
}

export function holdsSummary(page: LegalHoldPage, state: LegalHoldState, now = Date.now()): string {
  const total = page.items.length
  if (total === 0) {
    return state === 'active' ? 'Ninguna retención vigente.' : 'Ninguna retención terminada.'
  }
  const sentences = [
    state === 'active'
      ? plural(total, 'retención vigente', 'retenciones vigentes')
      : plural(total, 'retención terminada', 'retenciones terminadas'),
  ]
  const soon = page.items.filter((hold) => holdStateOf(hold, now) === 'due_soon').length
  if (state === 'active' && soon > 0) {
    sentences.push(`${soon} vence${soon === 1 ? '' : 'n'} esta semana`)
  }
  const summary = `${sentences.join(', ')}.`
  return page.has_more ? `${summary} Hay más de las que caben en esta página.` : summary
}

export function holdsEmptyMessage(state: LegalHoldState): string {
  return state === 'active'
    ? 'No hay retenciones vigentes. Cuando llegue una orden, aplica una desde aquí.'
    : 'Todavía no ha terminado ninguna retención.'
}

export function holdMessage(code: string): string {
  const messages: Record<string, string> = {
    forbidden:
      'Tu sesión no tiene vigente el deber manage_privacy_requests. Los deberes llegan con el rol de administrador: si se negó, tu rol ya no está vigente y otro administrador debe otorgártelo de nuevo.',
    'separation-of-duties':
      'Pediste o aprobaste un acceso excepcional a los datos de esta persona, así que no puedes decidir qué se conserva de ella. Pídeselo a alguien del equipo que no haya participado.',
    conflict:
      'Esa retención ya terminó: alguien la liberó o venció su fecha. Vuelve a abrir la página para ver el estado actual.',
    'not-found': 'No hay ninguna persona con ese identificador, o la retención ya no existe.',
    'validation-failed':
      'La retención no cumple el contrato. Revisa la persona, los tipos de dato y la vigencia.',
    'idempotency-in-progress': 'El comando anterior sigue procesándose. Reintenta en un momento.',
    'invalid-request': 'La consulta no es válida. Vuelve a abrir la página.',
    unauthenticated: 'Tu sesión terminó. Vuelve a iniciar sesión.',
    'upstream-unavailable': 'El servicio no respondió. Reintenta en un momento.',
    'network-unavailable': 'No hay conexión con el API.',
  }
  return messages[code] ?? 'No se pudieron leer las retenciones.'
}

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`
}

function formatDay(value: string): string {
  const parsed = Date.parse(value)
  if (Number.isNaN(parsed)) return '—'
  return new Intl.DateTimeFormat('es-CO', { dateStyle: 'medium' }).format(parsed)
}
