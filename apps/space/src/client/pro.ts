/**
 * Allfit Pro on the phone: `HU-SP-084..088` (ADR-043), the pure half.
 *
 * The API resolves Pro and the store charges for it; what lives here is what the screens
 * say about that, and the one command the app sends. Keeping the wording out of the
 * screens is what lets it be tested: which source decides, when the paid period ends,
 * whether paying would only stop depending on a gym.
 *
 * **A purchase is presented once per purchase.** The command is held by the purchase's
 * own token, so the retry after a dropped connection — or the same purchase coming back
 * from a restore — reuses it, and the server answers the same subscription.
 */

import type { AllfitV1Schemas } from '@allfitone/contracts'
import type { CommandHeaders } from '@allfitone/contracts/commands'
import type { IconName } from '@allfitone/icons'

import { DEFAULT_LOCALE, intlLocale, textFor, type Dictionary, type Locale } from '../i18n'

export type ProStatus = AllfitV1Schemas['SpaceProStatus']
export type ProPlanCatalogue = AllfitV1Schemas['SpaceProPlanCatalogue']
export type ProPlan = AllfitV1Schemas['SpaceProPlan']
export type ProPayments = AllfitV1Schemas['SpaceProPayments']
export type ProPayment = AllfitV1Schemas['SpaceProPayment']
export type ProPurchase = AllfitV1Schemas['SpaceProPurchase']
export type ProSource = AllfitV1Schemas['SpaceProSource']
export type ProFeature = AllfitV1Schemas['SpaceProFeature']
export type ProStore = AllfitV1Schemas['SpaceProStore']

export type SubscriptionSource = Extract<ProSource, { kind: 'subscription' }>
export type OrganizationSource = Extract<ProSource, { kind: 'organization' }>

export interface ProTransport {
  read(): Promise<ProStatus>
  plans(): Promise<ProPlanCatalogue>
  payments(): Promise<ProPayments>
  purchase(command: CommandHeaders, purchase: ProPurchase): Promise<ProStatus>
}

export interface ProFlow {
  read(): Promise<ProStatus>
  plans(): Promise<ProPlanCatalogue>
  payments(): Promise<ProPayments>
  /** Presents a purchase the store finished; the same purchase reuses its command. */
  present(purchase: ProPurchase): Promise<ProStatus>
}

const purchaseKey = (purchase: ProPurchase) =>
  purchase.store === 'app_store' ? purchase.signed_transaction : purchase.purchase_token

export function createProFlow(dependencies: {
  readonly transport: ProTransport
  readonly newCommand: () => CommandHeaders
}): ProFlow {
  const { transport, newCommand } = dependencies
  const held = new Map<string, CommandHeaders>()

  return {
    read: () => transport.read(),
    plans: () => transport.plans(),
    payments: () => transport.payments(),
    async present(purchase) {
      const key = purchaseKey(purchase)
      const command = held.get(key) ?? newCommand()
      held.set(key, command)
      const answer = await transport.purchase(command, purchase)
      held.delete(key)
      return answer
    },
  }
}

// ———————————————————————————————————————— what the screens say

type PlansText = Dictionary['plans']

const STORE_NAME: Record<ProStore, string> = { app_store: 'Apple', google_play: 'Google Play' }

export const storeName = (store: ProStore) => STORE_NAME[store]

/** «3 oct», «Oct 3», in the phone's own time zone. */
// The default serves the invitation and gym-affiliation code, which still reads Spanish.
export function shortDate(instant: string, locale: Locale = DEFAULT_LOCALE): string {
  const date = new Date(instant)
  const text = textFor(locale)
  return text.plans.dayMonth(date.getDate(), text.common.months[date.getMonth()] ?? '')
}

export const subscriptionOf = (status: ProStatus): SubscriptionSource | undefined =>
  status.sources.find((source): source is SubscriptionSource => source.kind === 'subscription')

export const gymsOf = (status: ProStatus): OrganizationSource[] =>
  status.sources.filter((source): source is OrganizationSource => source.kind === 'organization')

/** The line under the plan's name: who pays for it, or that nobody does. */
export function sourceLine(status: ProStatus, text: Dictionary['pro']): string {
  const subscription = subscriptionOf(status)
  const [gym] = gymsOf(status)
  if (status.effective_source === 'subscription' && subscription) {
    return text.paidWith(storeName(subscription.store))
  }
  if (status.effective_source === 'organization' && gym)
    return text.includedBy(gym.organization_name)
  return text.freeForever
}

/** What happens at the end of the paid period, in one line. */
export function renewalLine(
  subscription: SubscriptionSource,
  text: PlansText,
  locale: Locale,
): string {
  if (subscription.status === 'grace' && subscription.grace_until) {
    return text.renewal.grace(shortDate(subscription.grace_until, locale))
  }
  if (subscription.status === 'suspended') return text.renewal.suspended
  const day = shortDate(subscription.current_period_end, locale)
  return subscription.auto_renews ? text.renewal.renews(day) : text.renewal.ends(day)
}

/** `HU-SP-085` criterion 6: said before charging, never after. */
export function gymWarning(status: ProStatus, text: PlansText): string | undefined {
  if (status.effective_source !== 'organization') return undefined
  const [gym] = gymsOf(status)
  if (!gym) return undefined
  return text.gymWarning(gym.organization_name)
}

/** One function as a sentence; undefined for one the plan leaves out with nothing instead. */
export function featureSentence(feature: ProFeature, text: PlansText): string | undefined {
  // A function left out names only what the person still has instead, if anything.
  const without: Readonly<Record<string, string>> = text.without
  if (!feature.enabled) return without[feature.code]
  const sentences: Readonly<Record<string, (limit: number | null) => string>> = text.feature
  const sentence = sentences[feature.code]
  if (sentence) return sentence(feature.limit_value)
  return text.unknownFeature(feature.name, feature.limit_value)
}

const FEATURE_ICONS: Readonly<Record<string, IconName>> = {
  active_personal_programs: 'training',
  own_routines: 'checklist',
  routine_duplication: 'duplicate',
  full_program_catalogue: 'explore',
  training_history_months: 'history',
  nutrition_history_months: 'nutrition',
  period_analysis: 'progress',
  body_measurements: 'weight',
  body_photos: 'image',
  meal_photo_recognition: 'camera',
}

/** The icon of a function; one the app does not know yet gets a neutral mark. */
export const featureIcon = (code: string): IconName => FEATURE_ICONS[code] ?? 'check'

const MINOR_DIGITS: Readonly<Record<string, number>> = { CLP: 0, JPY: 0, KRW: 0, PYG: 0 }

/** «$24.900» in pesos, «$9,99 USD» elsewhere: what a receipt says, not a ledger. */
export function money(
  amountMinor: number | null,
  currency: string | null,
  locale: Locale,
): string | undefined {
  if (amountMinor === null || !currency) return undefined
  const digits = MINOR_DIGITS[currency] ?? 2
  const cents = amountMinor % 10 ** digits
  const figure = (amountMinor / 10 ** digits).toLocaleString(intlLocale(locale), {
    minimumFractionDigits: cents === 0 ? 0 : digits,
    maximumFractionDigits: digits,
  })
  return currency === 'COP' ? `$${figure}` : `$${figure} ${currency}`
}

/** The latest charge that went through, to show what the person pays. */
export const lastPaid = (payments: readonly ProPayment[]): ProPayment | undefined =>
  payments.find((payment) => payment.result === 'succeeded')

/** How a version is billed, read from the catalogue rather than assumed to be monthly. */
export function billingOf(
  catalogue: ProPlanCatalogue | undefined,
  versionId: string,
  text: PlansText,
): { readonly fee: string; readonly per: string } {
  const period = catalogue?.plans.find((plan) => plan.version_id === versionId)?.billing_period
  if (period === 'month' || period === 'year') return text.period[period]
  return { fee: text.otherFee, per: '' }
}

export const proPlanOf = (catalogue: ProPlanCatalogue): ProPlan | undefined =>
  catalogue.plans.find((plan) => plan.code === 'pro')

export const freePlanOf = (catalogue: ProPlanCatalogue): ProPlan | undefined =>
  catalogue.plans.find((plan) => plan.kind === 'free')

/** The product that sells Pro in this phone's store, if Allfit sells it there. */
export function productFor(plan: ProPlan, store: ProStore): string | undefined {
  return plan.store_products.find((product) => product.store === store)?.product_id
}
