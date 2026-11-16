/**
 * Presentation rules for the Allfit Space waitlist (`HU-BO-035`).
 *
 * The screen answers "who joined, through where, and who should not count?". Four
 * things shape it that the schema cannot carry.
 *
 * **A stored value is never shown raw.** A channel arrives as whatever a link said, in
 * lower case: `instagram` is read «Instagram», and a source nobody listed keeps its
 * own spelling with a capital rather than being dropped into «otros».
 *
 * **Not counting is not fraud.** A sign-up discarded when it joined (the inviter's own
 * device, or a device that already counted) is told apart from one a person of the team
 * marked: only the second is a decision, and only it carries a reason.
 *
 * **A shared connection is a signal, not a verdict.** A gym, a family or an office
 * share one. The screen says how many, and that a person has to look.
 *
 * **A mark changes more than a label**, so what it does to this particular sign-up is
 * spelled out before the command, never after. So is what taking it back does: the
 * sign-up counts again, but the number it gave up is not reserved for it.
 */

import type { AllfitV1Schemas } from '@allfitone/contracts'

export type WaitlistSignup = AllfitV1Schemas['BackofficeWaitlistSignup']
export type WaitlistSignupPage = AllfitV1Schemas['BackofficeWaitlistSignupPage']
export type WaitlistTotals = AllfitV1Schemas['BackofficeWaitlistTotals']
export type WaitlistChannel = AllfitV1Schemas['BackofficeWaitlistChannel']
export type WaitlistFilter = 'confirmed' | 'unconfirmed' | 'founding_members' | 'discarded'

export const FOUNDING_MEMBER_NUMBERS = 100

/** Confirmed first: it is what the team is usually counting. */
export const WAITLIST_FILTERS: readonly WaitlistFilter[] = [
  'confirmed',
  'unconfirmed',
  'founding_members',
  'discarded',
]

const FILTER_LABELS: Record<WaitlistFilter, string> = {
  confirmed: 'Confirmaron su correo',
  unconfirmed: 'Sin confirmar',
  founding_members: 'Founding Members',
  discarded: 'No cuentan',
}

/** What the closed filter says, including when it filters nothing. */
export function filterLabel(filter: WaitlistFilter | 'any'): string {
  return filter === 'any' ? 'Todas' : FILTER_LABELS[filter]
}

// The spelling each network uses for itself. Anything else keeps its own, capitalised.
const SOURCE_NAMES: Record<string, string> = {
  instagram: 'Instagram',
  ig: 'Instagram',
  tiktok: 'TikTok',
  facebook: 'Facebook',
  fb: 'Facebook',
  whatsapp: 'WhatsApp',
  youtube: 'YouTube',
  linkedin: 'LinkedIn',
  twitter: 'X',
  x: 'X',
  google: 'Google',
  telegram: 'Telegram',
  email: 'Correo',
  newsletter: 'Newsletter',
}

export function sourceLabel(source: string): string {
  const known = SOURCE_NAMES[source.trim().toLowerCase()]
  if (known) return known
  const trimmed = source.trim()
  return trimmed === '' ? 'Sin nombre' : trimmed.charAt(0).toUpperCase() + trimmed.slice(1)
}

export function channelLabel(channel: WaitlistChannel): string {
  if (channel.kind === 'source') return sourceLabel(channel.source ?? '')
  if (channel.kind === 'referral') return 'Referido'
  if (channel.kind === 'direct') return 'Directo'
  return 'Otros canales'
}

export function channelMeaning(channel: WaitlistChannel): string {
  if (channel.kind === 'source') return 'El link con el que llegó nombraba este canal.'
  if (channel.kind === 'referral') return 'Llegó con el link de otra persona de la lista.'
  if (channel.kind === 'direct') return 'Llegó sin link de canal y sin invitación.'
  return 'Los canales más pequeños, sumados.'
}

export type DiscardReason = NonNullable<WaitlistSignup['discard_reason']>

const DISCARD_LABELS: Record<DiscardReason, string> = {
  self_referral: 'No cuenta',
  same_device: 'No cuenta',
  fraud: 'Fraude',
}

// Why the list discarded it on joining. A fraud mark has its own reason, written by a person.
const DISCARD_DETAILS: Record<DiscardReason, string | undefined> = {
  self_referral: 'Mismo dispositivo que quien la invitó',
  same_device: 'Dispositivo repetido',
  fraud: undefined,
}

const DISCARD_MEANINGS: Record<DiscardReason, string> = {
  self_referral:
    'Se inscribió desde el mismo dispositivo que la persona que la invitó. No suma como referido.',
  same_device:
    'Se inscribió desde un dispositivo que ya había sumado un referido para la misma persona. No suma otra vez.',
  fraud: 'Una persona del equipo la marcó como fraude. No suma como referido ni tiene número.',
}

export function discardLabel(reason: DiscardReason): string {
  return DISCARD_LABELS[reason]
}

export function discardDetail(reason: DiscardReason): string | undefined {
  return DISCARD_DETAILS[reason]
}

export function discardMeaning(reason: DiscardReason): string {
  return DISCARD_MEANINGS[reason]
}

/** Undefined for a sign-up that holds no number: the screen draws nothing, not a dash. */
export function foundingLabel(number: number | null): string | undefined {
  return number === null ? undefined : `Founding Member N.º ${number}`
}

export function referralsLabel(count: number): string {
  return count === 1 ? '1 referido' : `${count} referidos`
}

/** Whether the sign-up already has its Allfit Space account, as the column says it. */
export function accountLabel(signup: WaitlistSignup): string {
  return signup.has_space_account ? 'Sí' : 'No'
}

/** Undefined when nothing is shared, so the screen draws no signal at all. */
export function sharedConnectionLabel(count: number): string | undefined {
  if (count <= 0) return undefined
  return count === 1 ? '1 comparte conexión' : `${count} comparten conexión`
}

export const SHARED_CONNECTION_MEANING =
  'Personas que invitó y que se inscribieron desde su misma conexión, o desde la misma entre ellas. Un gimnasio o una casa comparten conexión: es una señal para revisar, no un descarte.'

export interface WaitlistFilters {
  query: string
  filter: WaitlistFilter | 'any'
}

export const EMPTY_WAITLIST_FILTERS: WaitlistFilters = { query: '', filter: 'any' }

export type WaitlistFilterIssue = 'short-query' | 'long-query'

const MIN_QUERY = 2
/** The longest an email address is. */
const MAX_QUERY = 254

export function waitlistFilterIssue(filters: WaitlistFilters): WaitlistFilterIssue | undefined {
  const length = [...filters.query.trim()].length
  if (length !== 0 && length < MIN_QUERY) return 'short-query'
  if (length > MAX_QUERY) return 'long-query'
  return undefined
}

const FILTER_ISSUE_MESSAGES: Record<WaitlistFilterIssue, string> = {
  'short-query':
    'Escribe al menos dos caracteres del nombre, del correo o del código. Con uno solo, la búsqueda sería la lista completa.',
  'long-query': 'La búsqueda es demasiado larga. Usa solo una parte del nombre o del correo.',
}

export function waitlistFilterIssueMessage(issue: WaitlistFilterIssue): string {
  return FILTER_ISSUE_MESSAGES[issue]
}

/** The query the API expects, with the empty fields left out rather than sent blank. */
export function toWaitlistQuery(
  filters: WaitlistFilters,
  cursor?: string,
): { q?: string; filter?: WaitlistFilter; cursor?: string } {
  const query = filters.query.trim()
  return {
    ...(query === '' ? {} : { q: query }),
    ...(filters.filter === 'any' ? {} : { filter: filters.filter }),
    ...(cursor ? { cursor } : {}),
  }
}

export function isFiltered(filters: WaitlistFilters): boolean {
  return filters.query.trim() !== '' || filters.filter !== 'any'
}

/**
 * What the screen says about the answer as a whole. "There are more" is said outright,
 * so a partial first page is never read as the whole list.
 */
export function waitlistAnswer(shown: number, hasMore: boolean, filters: WaitlistFilters): string {
  if (shown === 0) {
    return isFiltered(filters)
      ? 'Ninguna inscripción coincide con esta búsqueda.'
      : 'Todavía no hay nadie en la lista de espera.'
  }
  const count = shown === 1 ? '1 inscripción' : `${shown} inscripciones`
  return hasMore
    ? `${count} por ahora, de la más reciente a la más antigua. Hay más: cárgalas al final de la lista.`
    : `${count}, de la más reciente a la más antigua.`
}

export interface TotalFigure {
  key: 'signups' | 'confirmed' | 'with_account' | 'founding_members' | 'marked_as_fraud'
  label: string
  value: string
  note: string
}

/** A share of a whole as a rounded percentage, or undefined when there is no whole. */
export function shareLabel(part: number, whole: number): string | undefined {
  if (whole <= 0) return undefined
  return `${Math.round((part / whole) * 100)} %`
}

export function totalFigures(totals: WaitlistTotals): TotalFigure[] {
  const confirmedShare = shareLabel(totals.confirmed, totals.signups)
  const free = Math.max(FOUNDING_MEMBER_NUMBERS - totals.founding_members, 0)
  return [
    {
      key: 'signups',
      label: 'Inscritos',
      value: String(totals.signups),
      note: 'Todas las inscripciones, confirmadas o no.',
    },
    {
      key: 'confirmed',
      label: 'Confirmaron su correo',
      value: String(totals.confirmed),
      note: confirmedShare
        ? `${confirmedShare} de los inscritos.`
        : 'Nadie se ha inscrito todavía.',
    },
    {
      key: 'with_account',
      label: 'Con cuenta',
      value: String(totals.with_account),
      note: 'Ya crearon su cuenta de Allfit Space.',
    },
    {
      key: 'founding_members',
      label: 'Founding Members',
      value: `${totals.founding_members} de ${FOUNDING_MEMBER_NUMBERS}`,
      note:
        free === 0
          ? 'Los cien números están tomados.'
          : free === 1
            ? 'Queda 1 número libre.'
            : `Quedan ${free} números libres.`,
    },
    {
      key: 'marked_as_fraud',
      label: 'Marcadas como fraude',
      value: String(totals.marked_as_fraud),
      note: 'No suman como referido ni tienen número.',
    },
  ]
}

export const MIN_FRAUD_REASON = 4
export const MAX_FRAUD_REASON = 200

/** The reason as it will be stored, or undefined when it is not one line of 4 to 200. */
export function parseFraudReason(text: string): string | undefined {
  const trimmed = text.trim()
  const length = [...trimmed].length
  if (length < MIN_FRAUD_REASON || length > MAX_FRAUD_REASON) return undefined
  // C0, DEL and C1: the same text the API and the database refuse.
  const control = [...trimmed].some((character) => {
    const code = character.codePointAt(0) ?? 0
    return code < 0x20 || (code >= 0x7f && code <= 0x9f)
  })
  return control ? undefined : trimmed
}

export const FRAUD_REASON_REQUIRED = `Escribe el motivo en una línea, de ${MIN_FRAUD_REASON} a ${MAX_FRAUD_REASON} caracteres. Queda en el registro de la marca.`

/** What the mark does to this sign-up, said before the command. */
export function fraudConsequences(signup: WaitlistSignup): string[] {
  const consequences: string[] = []
  if (signup.invited_by && signup.discard_reason === null) {
    consequences.push(
      signup.confirmed_at === null
        ? `No sumará como referido de ${signup.invited_by.name}, aunque confirme su correo.`
        : `Deja de sumar como referido de ${signup.invited_by.name}.`,
    )
  }
  if (signup.founding_number !== null) {
    consequences.push(
      `Pierde el número ${signup.founding_number} de Founding Member, que pasa a la siguiente persona confirmada que espera uno.`,
    )
  } else {
    consequences.push('No recibirá un número de Founding Member.')
  }
  consequences.push(
    'Queda registrado con tu nombre y con el motivo. La marca se puede quitar después.',
  )
  return consequences
}

/** What happened, read from the sign-up as it was before the mark. */
export function fraudOutcomeMessage(before: WaitlistSignup): string {
  const parts = [`La inscripción de ${before.name} quedó marcada como fraude.`]
  if (before.founding_number !== null) {
    parts.push(
      `Su número ${before.founding_number} quedó libre para la siguiente persona confirmada.`,
    )
  }
  if (before.invited_by && before.discard_reason === null && before.confirmed_at !== null) {
    parts.push(`Ya no suma como referido de ${before.invited_by.name}.`)
  }
  return parts.join(' ')
}

export const WITHDRAWAL_REASON_REQUIRED = `Escribe el motivo en una línea, de ${MIN_FRAUD_REASON} a ${MAX_FRAUD_REASON} caracteres. Queda en el registro de por qué se quitó la marca.`

function lowerFirst(text: string): string {
  return text.charAt(0).toLowerCase() + text.slice(1)
}

/** What taking the mark back does to this sign-up, said before the command. */
export function withdrawalConsequences(signup: WaitlistSignup): string[] {
  const consequences: string[] = []
  const previous = signup.fraud?.previous_discard_reason ?? null
  const before = previous ? discardDetail(previous) : undefined
  if (signup.invited_by) {
    if (before) {
      consequences.push(
        `Sigue sin sumar como referido de ${signup.invited_by.name}: la lista la descartó al entrar (${lowerFirst(before)}).`,
      )
    } else if (signup.confirmed_at === null) {
      consequences.push(
        `Sumará como referido de ${signup.invited_by.name} cuando confirme su correo.`,
      )
    } else {
      consequences.push(
        `Vuelve a sumar como referido de ${signup.invited_by.name}, salvo que otra inscripción del mismo dispositivo ya cuente para esa persona.`,
      )
    }
  }
  consequences.push(
    signup.confirmed_at === null
      ? 'Podrá recibir un número de Founding Member cuando confirme su correo.'
      : 'Vuelve a la fila de Founding Members y recibe el siguiente número que quede libre; el que tenía antes de la marca no se le reserva.',
  )
  consequences.push('Queda registrado con tu nombre y con el motivo.')
  return consequences
}

/** What happened, read from the sign-up as the answer left it. */
export function withdrawalOutcomeMessage(after: WaitlistSignup): string {
  const parts = [`Se quitó la marca de fraude de la inscripción de ${after.name}.`]
  if (after.founding_number !== null) {
    parts.push(`Recibió el número ${after.founding_number} de Founding Member.`)
  } else if (after.confirmed_at !== null) {
    parts.push('Espera el siguiente número de Founding Member que quede libre.')
  }
  if (after.invited_by) {
    const detail = after.discard_reason ? discardDetail(after.discard_reason) : undefined
    if (detail) {
      parts.push(
        `Sigue sin sumar como referido de ${after.invited_by.name}: ${lowerFirst(detail)}.`,
      )
    } else if (after.discard_reason === null && after.confirmed_at !== null) {
      parts.push(`Vuelve a sumar como referido de ${after.invited_by.name}.`)
    }
  }
  return parts.join(' ')
}

export function waitlistMessage(code: string): string {
  const messages: Record<string, string> = {
    forbidden:
      'Tu sesión no tiene vigente el deber que permite ver la lista de espera: administrar lo comercial de la plataforma. Los deberes llegan con el rol de administrador: si se negó, tu rol ya no está vigente y otro administrador debe otorgártelo de nuevo.',
    'invalid-request':
      'Alguno de los filtros no se pudo leer. Se rechaza en vez de ignorarlo, porque ignorarlo ampliaría la búsqueda.',
    'validation-failed': 'La búsqueda no cumple el contrato. Revisa lo que escribiste.',
    unauthenticated: 'Tu sesión terminó. Vuelve a iniciar sesión.',
    'upstream-unavailable': 'El servicio no respondió. Reintenta en un momento.',
    'network-unavailable': 'No hay conexión con el API.',
  }
  return messages[code] ?? 'No se pudo leer la lista de espera.'
}

export function fraudMessage(code: string): string {
  const messages: Record<string, string> = {
    forbidden:
      'Tu sesión no tiene vigente el deber que permite marcar fraude: administrar lo comercial de la plataforma.',
    'not-found': 'Esta inscripción ya no está en la lista: la persona pudo haberse retirado.',
    conflict: 'Esta inscripción ya estaba marcada como fraude. Recarga la lista para verla al día.',
    'validation-failed': FRAUD_REASON_REQUIRED,
    'invalid-request': 'La orden no se pudo leer. Recarga la pantalla e inténtalo de nuevo.',
    'idempotency-in-progress':
      'La marca anterior todavía se está procesando. Espera un momento y reintenta.',
    unauthenticated: 'Tu sesión terminó. Vuelve a iniciar sesión.',
    'upstream-unavailable': 'El servicio no respondió. Reintenta: la marca no se hará dos veces.',
    'network-unavailable':
      'No hay conexión con el API. Reintenta: si la marca ya se había hecho, no se hará dos veces.',
  }
  return messages[code] ?? 'No se pudo marcar la inscripción.'
}

export function withdrawalMessage(code: string): string {
  const messages: Record<string, string> = {
    forbidden:
      'Tu sesión no tiene vigente el deber que permite quitar una marca de fraude: administrar lo comercial de la plataforma.',
    'not-found': 'Esta inscripción ya no está en la lista: la persona pudo haberse retirado.',
    conflict:
      'Esta inscripción ya no estaba marcada como fraude. Recarga la lista para verla al día.',
    'validation-failed': WITHDRAWAL_REASON_REQUIRED,
    'invalid-request': 'La orden no se pudo leer. Recarga la pantalla e inténtalo de nuevo.',
    'idempotency-in-progress':
      'La orden anterior todavía se está procesando. Espera un momento y reintenta.',
    unauthenticated: 'Tu sesión terminó. Vuelve a iniciar sesión.',
    'upstream-unavailable':
      'El servicio no respondió. Reintenta: la marca no se quitará dos veces.',
    'network-unavailable':
      'No hay conexión con el API. Reintenta: si la marca ya se había quitado, no se quitará dos veces.',
  }
  return messages[code] ?? 'No se pudo quitar la marca de fraude.'
}
