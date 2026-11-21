/**
 * What the billing screen needs to know before it offers anything.
 *
 * Permission is read from the role catalogue the server publishes rather than from a list
 * of role codes written here. PostgreSQL opens this through `manage_billing`, and a copy
 * of that mapping in the client is a second source of truth that drifts silently the day
 * the grant changes.
 *
 * **Suspending is not revoking, and the screen has to say so.** The database opens a
 * reversible cause and touches no permission, no assignment and no relationship. A
 * confirmation that said "se le quitará el acceso" would describe a different operation
 * and scare somebody out of using the one that exists — so the wording here is part of
 * the behaviour, not decoration.
 */

import type { OrganizationRole, OrganizationSubscription, SubscriptionStatus } from './studio-api'

const MANAGE_BILLING = 'manage_billing'

export function canManageBilling(
  roles: readonly string[],
  catalog: readonly OrganizationRole[] | undefined,
): boolean {
  if (!catalog?.length) return false
  return roles.some((role) =>
    catalog
      .find((entry) => entry.code === role)
      ?.capabilities.some((capability) => capability.code === MANAGE_BILLING),
  )
}

export type SubscriptionAction = 'suspend' | 'reactivate' | 'end'

/**
 * Which actions the command would actually accept, given where the subscription stands.
 *
 * Offering one it would refuse spends a click to reach a 409. An ended subscription takes
 * nothing at all: it is a record of what was charged, and coming back is a new
 * subscription the person creates from the app.
 */
export function availableActions(status: SubscriptionStatus): readonly SubscriptionAction[] {
  if (status === 'active') return ['suspend', 'end']
  if (status === 'suspended') return ['reactivate', 'end']
  return []
}

export function statusLabel(status: SubscriptionStatus): string {
  if (status === 'active') return 'Al día'
  if (status === 'suspended') return 'En pausa'
  return 'Terminada'
}

export function actionLabel(action: SubscriptionAction): string {
  if (action === 'suspend') return 'Pausar'
  if (action === 'reactivate') return 'Reactivar'
  return 'Terminar'
}

/** What a row's menu calls each action: the verb, and what it acts on. */
export function menuActionLabel(action: SubscriptionAction): string {
  return `${actionLabel(action)} el plan`
}

/** What the screen says once the command went through, in the state the row now shows. */
export function transitionDone(action: SubscriptionAction, personName: string): string {
  if (action === 'suspend') return `El plan de ${personName} quedó en pausa.`
  if (action === 'reactivate') return `El plan de ${personName} volvió a estar al día.`
  return `El plan de ${personName} terminó.`
}

export function confirmationTitle(action: SubscriptionAction, personName: string): string {
  if (action === 'suspend') return `¿Pausar el plan de ${personName}?`
  if (action === 'reactivate') return `¿Reactivar el plan de ${personName}?`
  return `¿Terminar el plan de ${personName}?`
}

/**
 * Each dialog says what the action does **and** what it leaves alone, because what it
 * leaves alone is the part nobody would guess and the part that makes it safe to use.
 *
 * `HU-STUDIO-079` is mostly about what does not happen. Pausing opens one reversible
 * cause; reactivating closes that cause and recalculates from what is true now, never
 * from a snapshot (`OP-PAY-009`). So reactivating cannot promise that everything comes
 * back: a permission she revoked, a relationship that ended or a session whose day passed
 * during the pause stays as it is now.
 *
 * `HU-STUDIO-080` separates two bonds. Ending the plan closes the paying one and leaves
 * the relationship standing (`OP-REL-008` ends that). It also closes the pause's cause,
 * because a cause left open on an ended plan could never be closed by anything.
 *
 * Plain strings throughout: the dialog renders text, so markdown reaches the reader as
 * asterisks.
 */
export function confirmationDescription(action: SubscriptionAction): string {
  if (action === 'suspend') return 'Pausa este plan sin quitarle nada a la persona.'
  if (action === 'reactivate') {
    return 'Levanta solo la pausa de este plan. No devuelve las cosas a como estaban: el acceso se vuelve a calcular con lo que es cierto hoy.'
  }
  return 'Cierra el cobro de este plan: deja de cobrarse y no se puede volver atrás. Si vuelve a pagar, será una suscripción nueva desde la app.'
}

const NOTICE = 'Le vamos a avisar por correo.'

/**
 * What the dialog says under its two headings, «Qué pasa» and «Qué no cambia»,
 * and the line that closes it. Five paragraphs in a row hid which sentence was
 * the one that mattered; which half a sentence sits in is now part of what it says.
 */
export interface ConfirmationSections {
  happens: string[]
  stays: string[]
  notice: string
}

export function confirmationSections(
  action: SubscriptionAction,
  status: SubscriptionStatus,
): ConfirmationSections {
  if (action === 'suspend') {
    return {
      // HU-079 criterion 2, then HU-080 criterion 3.
      happens: [
        'Su profesional sigue viendo lo que la persona comparte, pero no puede registrar ni cambiar nada, y las sesiones futuras del programa que le asignaron quedan en pausa.',
        'La pausa dura hasta que la reactives o termines el plan: nunca se convierte sola en terminación.',
      ],
      // HU-079 criteria 1 and 3.
      stays: [
        'No se le quita ningún permiso, su programa sigue asignado y la relación con la organización sigue igual.',
        'Conserva todo su historial y puede seguir entrenando por su cuenta.',
      ],
      notice: NOTICE,
    }
  }
  if (action === 'end') {
    return {
      happens: [
        ...(status === 'suspended'
          ? [
              'Como está en pausa, terminar también levanta la pausa: su profesional vuelve a poder registrar cambios, salvo que haya otro bloqueo.',
            ]
          : []),
        'Queda registrado que lo decidiste tú: ningún proceso automático termina un plan.',
      ],
      stays: [
        'Sigue en pie la relación con la organización: terminar el plan no termina la relación, no retira los permisos que la persona dio y no borra su historial. Para terminar la relación hay otra acción, con sus propios efectos.',
      ],
      notice: NOTICE,
    }
  }
  return {
    // HU-079 criteria 7 and 6.
    happens: [
      'Vuelven las sesiones futuras que no se hayan iniciado ni cancelado, si la relación y la asignación siguen vigentes.',
      'No tiene que aceptar nada de nuevo mientras su permiso siga vigente. Si hay otro bloqueo, como la organización suspendida, su profesional sigue sin poder registrar cambios y esas sesiones siguen en pausa.',
    ],
    // HU-079 criterion 5.
    stays: [
      'Lo que cambió durante la pausa no vuelve: un permiso retirado, una relación terminada, una asignación cambiada o una sesión cancelada, iniciada o que ya pasó.',
    ],
    notice: NOTICE,
  }
}

export type BillingRefusal = 'conflict' | 'not-allowed' | 'gone' | 'unavailable'

export function refusalFor(status: number | undefined): BillingRefusal {
  if (status === 409) return 'conflict'
  if (status === 403) return 'not-allowed'
  if (status === 404) return 'gone'
  return 'unavailable'
}

export function refusalTitle(action: SubscriptionAction, refusal: BillingRefusal): string {
  if (refusal === 'not-allowed') return 'No puedes administrar los cobros'
  if (refusal === 'gone') return 'Esta suscripción ya no está'
  if (refusal === 'conflict') {
    if (action === 'suspend') return 'Este plan ya no se puede pausar'
    if (action === 'reactivate') return 'Este plan no se puede reactivar'
    return 'Este plan ya terminó'
  }
  return `No pudimos ${actionLabel(action).toLowerCase()} el plan`
}

export function refusalDescription(action: SubscriptionAction, refusal: BillingRefusal): string {
  if (refusal === 'not-allowed') {
    return 'Tu rol en esta organización no incluye administrar cobros y suscripciones.'
  }
  if (refusal === 'gone') {
    return 'Puede que la hayan terminado mientras tenías esta pantalla abierta. Actualiza para ver cómo está la lista ahora.'
  }
  if (refusal === 'conflict') {
    if (action === 'reactivate') {
      // The one refusal that is not a race. It means the database cannot find the cause
      // this suspension opened, which is a state these operations cannot produce.
      return 'La pausa no tiene una causa abierta que cerrar, o el plan ya terminó. Actualiza para ver cómo está; si sigue así, es algo que hay que revisar y no un reintento.'
    }
    return 'Alguien lo cambió mientras tenías esta pantalla abierta. Actualiza para ver cómo está ahora.'
  }
  // Nothing was written and nobody was emailed, which is what makes offering a retry
  // honest here.
  return 'La conexión falló de forma temporal. No se cambió nada y no se avisó a la persona, así que puedes intentarlo otra vez.'
}

/**
 * Money as somebody reads it, from the minor unit the API returns.
 *
 * The divisor is the **ISO 4217 exponent** and not what `Intl` would choose: for COP it
 * resolves to 0 decimals because Colombians do not write centavos, while the standard
 * minor unit is still 1/100. Dividing by the display preference turns a $120.000 plan into
 * $12.000.000 on the screen where somebody decides whether to suspend it.
 */
const MINOR_UNIT_EXPONENT = 2

export function formatAmount(amountMinor: number, currencyCode: string): string {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: currencyCode,
  }).format(amountMinor / 10 ** MINOR_UNIT_EXPONENT)
}

export function formatPeriod(billingPeriod: OrganizationSubscription['billing_period']): string {
  return billingPeriod === 'month' ? 'al mes' : 'al año'
}

/**
 * The next cut-off, or the honest absence of one. It is null until the gateway reports a
 * charge, and showing a dash rather than today's date keeps somebody from reading a
 * guess as a fact.
 */
export function formatPeriodEnd(currentPeriodEnd: string | null): string {
  if (!currentPeriodEnd) return 'Sin cobro reportado'
  const parts = currentPeriodEnd.split('-')
  const instant = Date.UTC(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]))
  return shortDay(new Date(instant), 'UTC')
}

/**
 * «1 dic 2026»: a row is one line, and a date written out took a third of it.
 * Put together by hand because the locale's own short forms differ by engine:
 * «1/12/2026» in one and «1 de dic de 2026» in another.
 */
function shortDay(date: Date, timeZone?: string, withYear = true): string {
  const part = (options: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat('es-CO', { ...options, timeZone }).format(date)
  const month = part({ month: 'short' }).replace('.', '')
  const day = `${part({ day: 'numeric' })} ${month}`
  return withYear ? `${day} ${part({ year: 'numeric' })}` : day
}

/** The day of an instant, as the reader's own clock has it. */
export function formatDay(instant: string): string {
  return shortDay(new Date(instant))
}

/** From one day to another: «1 sep – 1 oct 2026», the year said once when they share it. */
export function formatDaySpan(from: string, to: string): string {
  const start = new Date(from)
  const end = new Date(to)
  const sameYear = start.getFullYear() === end.getFullYear()
  return `${shortDay(start, undefined, !sameYear)} – ${shortDay(end)}`
}

/**
 * The one date a row shows, which depends on where the plan stands: the next
 * charge while it is in good standing, since when for a pause, the day for an
 * ending. A next charge beside a paused plan would promise one nobody will make.
 */
export function subscriptionDateLine(subscription: OrganizationSubscription): string {
  if (subscription.status === 'suspended' && subscription.suspended_at) {
    return `Desde el ${formatDay(subscription.suspended_at)}`
  }
  if (subscription.status === 'ended' && subscription.ended_at) {
    return `El ${formatDay(subscription.ended_at)}`
  }
  return formatPeriodEnd(subscription.current_period_end)
}

export interface BillingSummary {
  active: number
  suspended: number
  ended: number
  /** What the plans in good standing add up to in a month; null when there is no sum to give. */
  monthly: { amountMinor: number; currencyCode: string } | null
}

const MONTHS_IN_A_YEAR = 12

/**
 * The figures over the list. They are counted from the list itself, so they are
 * true only of a list read whole: the screen reads every page before it shows them.
 */
export function billingSummary(subscriptions: readonly OrganizationSubscription[]): BillingSummary {
  const standing = subscriptions.filter((subscription) => subscription.status === 'active')
  const currencies = new Set(standing.map((subscription) => subscription.currency_code))
  const [currencyCode] = currencies
  // Two currencies cannot be added, and half a sum would read as the whole.
  const monthly =
    currencies.size === 1 && currencyCode
      ? {
          currencyCode,
          amountMinor: Math.round(
            standing.reduce(
              (sum, subscription) =>
                sum +
                (subscription.billing_period === 'year'
                  ? subscription.amount_minor / MONTHS_IN_A_YEAR
                  : subscription.amount_minor),
              0,
            ),
          ),
        }
      : null
  return {
    active: standing.length,
    suspended: subscriptions.filter((subscription) => subscription.status === 'suspended').length,
    ended: subscriptions.filter((subscription) => subscription.status === 'ended').length,
    monthly,
  }
}

export type SubscriptionStateFilter = SubscriptionStatus | 'all'

export interface SubscriptionFilters {
  term: string
  status: SubscriptionStateFilter
}

export const NO_SUBSCRIPTION_FILTERS: SubscriptionFilters = { term: '', status: 'all' }

/** A name is found whatever its capitals and accents: «alvarez» finds «Álvarez». */
export function foldText(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim()
}

export function filterSubscriptions(
  subscriptions: readonly OrganizationSubscription[],
  filters: SubscriptionFilters,
): OrganizationSubscription[] {
  const term = foldText(filters.term)
  return subscriptions.filter((subscription) => {
    if (filters.status !== 'all' && subscription.status !== filters.status) return false
    return term === '' || foldText(subscription.person_name).includes(term)
  })
}

export function personInitials(personName: string): string {
  return personName
    .trim()
    .split(/\s+/u)
    .slice(0, 2)
    .map((part) => Array.from(part)[0]?.toLocaleUpperCase('es-CO') ?? '')
    .join('')
}
