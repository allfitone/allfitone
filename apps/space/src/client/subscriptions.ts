/**
 * What I pay a gym, and what it offers — kept loadable by the test runner.
 *
 * Same split as the programs flow: this holds what must be true, the transport holds the
 * fetch and the stored session.
 *
 * What has to be true here is one thing, and it is the thing an app gets wrong: **the key
 * is held per intention and never renewed on a retry.** Pressing "Suscribirme" twice on a
 * slow connection must be one subscription, and pressing it on a different plan must be a
 * different command. Cancelling one subscription and then another must not share a key
 * either, or the second cancellation comes back as a replay of the first and the screen
 * says something ended that did not.
 *
 * **Nothing here touches a card.** The checkout is opened against the organization's own
 * gateway with its own credential, which no client ever receives; what comes back is the
 * price and which provider, so the app knows which flow to open next.
 */

import type { AllfitV1Schemas } from '@allfitone/contracts'
import type { CommandHeaders } from '@allfitone/contracts/commands'
import { intlLocale, type Dictionary, type Locale } from '../i18n'

export type MyRelationship = AllfitV1Schemas['SpaceRelationship']
export type RelationshipPage = AllfitV1Schemas['SpaceRelationshipPage']
export type PlanOffer = AllfitV1Schemas['OrganizationPlanOffer']
export type PlanOfferPage = AllfitV1Schemas['OrganizationPlanOfferPage']
export type Subscription = AllfitV1Schemas['Subscription']
export type SubscriptionList = AllfitV1Schemas['SubscriptionList']
export type SubscriptionCheckout = AllfitV1Schemas['SubscriptionCheckout']
export type SubscriptionTransition = AllfitV1Schemas['SubscriptionTransition']

export interface SubscriptionTransport {
  readMyRelationships(): Promise<RelationshipPage>
  readPlans(organizationId: string): Promise<PlanOfferPage>
  readMySubscriptions(): Promise<SubscriptionList>
  subscribe(command: CommandHeaders, planVersionId: string): Promise<SubscriptionCheckout>
  cancel(command: CommandHeaders, subscriptionId: string): Promise<SubscriptionTransition>
}

export interface SubscriptionFlowDependencies {
  transport: SubscriptionTransport
  newCommand: () => CommandHeaders
}

export interface SubscriptionFlow {
  readMyRelationships(): Promise<readonly MyRelationship[]>
  readPlans(organizationId: string): Promise<readonly PlanOffer[]>
  readMySubscriptions(): Promise<readonly Subscription[]>
  subscribe(planVersionId: string): Promise<SubscriptionCheckout>
  cancel(subscriptionId: string): Promise<SubscriptionTransition>
}

export function createSubscriptionFlow(
  dependencies: SubscriptionFlowDependencies,
): SubscriptionFlow {
  /*
   * Per plan version and per subscription. Pressing one plan and then another is two
   * intentions and must not share a key; pressing the same one twice is one. The key is
   * dropped once the command has landed, so coming back to the same screen later is a new
   * intention rather than a replay of something that already happened.
   */
  const subscribing = new Map<string, CommandHeaders>()
  const cancelling = new Map<string, CommandHeaders>()

  function keyFor(pending: Map<string, CommandHeaders>, id: string): CommandHeaders {
    const held = pending.get(id)
    if (held) return held
    const fresh = dependencies.newCommand()
    pending.set(id, fresh)
    return fresh
  }

  return {
    readMyRelationships: async () => (await dependencies.transport.readMyRelationships()).data,
    readPlans: async (organizationId) =>
      (await dependencies.transport.readPlans(organizationId)).data,
    readMySubscriptions: async () => (await dependencies.transport.readMySubscriptions()).data,
    async subscribe(planVersionId) {
      const result = await dependencies.transport.subscribe(
        keyFor(subscribing, planVersionId),
        planVersionId,
      )
      subscribing.delete(planVersionId)
      return result
    },
    async cancel(subscriptionId) {
      const result = await dependencies.transport.cancel(
        keyFor(cancelling, subscriptionId),
        subscriptionId,
      )
      cancelling.delete(subscriptionId)
      return result
    },
  }
}

/**
 * The gyms worth offering a plan for: the ones she still trains at.
 *
 * A relationship that ended takes no subscription — the command refuses it, because a
 * plan is something a gym sells to its clients. Showing it would spend a tap to reach a
 * refusal, and a list that mixes the two reads as if the old gym were still hers.
 */
export function payableRelationships(
  relationships: readonly MyRelationship[],
  subscriptions: readonly Subscription[],
): readonly MyRelationship[] {
  const owing = new Set(subscriptions.map((subscription) => subscription.organization_id))
  return relationships.filter(
    (relationship) => relationship.status === 'active' && !owing.has(relationship.organization_id),
  )
}

/**
 * Money as somebody reads it, from the minor unit the API sends.
 *
 * The divisor is the ISO 4217 exponent and not what `Intl` would choose: for COP it
 * resolves to 0 decimals because Colombians do not write centavos, while the standard
 * minor unit is still 1/100. Dividing by the display preference shows a $120.000 plan as
 * $12.000.000 on the screen where somebody agrees to pay it.
 */
const MINOR_UNIT_EXPONENT = 2

export function formatPrice(amountMinor: number, currencyCode: string, locale: Locale): string {
  return new Intl.NumberFormat(intlLocale(locale), {
    style: 'currency',
    currency: currencyCode,
  }).format(amountMinor / 10 ** MINOR_UNIT_EXPONENT)
}

type GymPlansText = Dictionary['plans']['gym']

export function periodLabel(
  billingPeriod: PlanOffer['billing_period'],
  text: GymPlansText,
): string {
  return billingPeriod === 'month' ? text.perMonth : text.perYear
}

export function statusLabel(status: Subscription['status'], text: GymPlansText): string {
  if (status === 'active') return text.status.active
  if (status === 'suspended') return text.status.suspended
  return text.status.ended
}

/**
 * What a paused subscription means for her, which is not what the word suggests.
 *
 * Nothing was taken away: her permissions stand, her history is intact and her gym is
 * still her gym. What stops is the training going forward. Saying only "en pausa" leaves
 * her to guess, and the guess people make is that they lost everything.
 */
export function pausedExplanation(organizationName: string, text: GymPlansText): string {
  return text.paused(organizationName)
}

/**
 * What cancelling does, and the three things it does not do.
 *
 * The last one is the point. Somebody who stops paying has not withdrawn consent, and
 * telling her that cancelling also cuts the gym's access would be telling her something
 * false about her own data.
 */
export function cancellationExplanation(organizationName: string, text: GymPlansText): string {
  return text.cancellation(organizationName)
}

export type SubscribeRefusal = 'not-offered' | 'cannot-charge' | 'already-paying' | 'unavailable'

/**
 * Each failure named after what she can do about it.
 *
 * `cannot-charge` is the one worth separating: the gym has not connected a gateway, so
 * there is nowhere for the money to go. It is not her problem to fix and retrying will not
 * help, so the screen says to talk to the gym instead of offering a button.
 */
export function subscribeRefusalFor(failure: string): SubscribeRefusal {
  if (failure === 'not-found') return 'not-offered'
  if (failure === 'conflict') return 'cannot-charge'
  return 'unavailable'
}

export function subscribeRefusalMessage(
  refusal: SubscribeRefusal,
  organizationName: string,
  text: GymPlansText,
): string {
  if (refusal === 'not-offered') return text.refusal.notOffered
  if (refusal === 'cannot-charge') return text.refusal.cannotCharge(organizationName)
  if (refusal === 'already-paying') return text.refusal.alreadyPaying(organizationName)
  return text.refusal.unavailable
}

export function cancelRefusalMessage(failure: string, text: GymPlansText): string {
  if (failure === 'not-found') return text.cancelRefusal.notFound
  // Nothing was written, which is what makes offering a retry honest.
  return text.cancelRefusal.unavailable
}
