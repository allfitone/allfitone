/**
 * The plans a gym sells to its clients — `OP-PAY-002..006`, `HU-STUDIO-074..077`.
 *
 * The shapes are repeated from the contract only so a malformed request is answered 422
 * before it reaches the database. What makes a plan safe is decided in PostgreSQL: one
 * price on sale per plan, a published price that never moves, whole pesos in COP, and
 * `manage_billing` for every change (`20261120090000_a_gym_sells_its_plans.sql`).
 */

import type { AllfitV1Schemas } from '@allfitone/contracts'

import type { PaymentsCommandContext, PaymentsCommandResult } from './index.js'
import type { Page } from './subscriptions.js'

export type StudioOrganizationPlan = AllfitV1Schemas['StudioOrganizationPlan']
export type StudioPlanVersion = AllfitV1Schemas['StudioPlanVersion']
export type StudioPlanVersionPublish = AllfitV1Schemas['StudioPlanVersionPublish']
export type PlanDeliveryMode = AllfitV1Schemas['PlanDeliveryMode']
export type PlanBillingPeriod = AllfitV1Schemas['BillingPeriod']
export type OrganizationPlanStatus = StudioOrganizationPlan['status']

export const ORGANIZATION_PLAN_STATUSES: readonly OrganizationPlanStatus[] = ['draft', 'published']
export const PLAN_DELIVERY_MODES: readonly PlanDeliveryMode[] = ['in_person', 'remote']
export const PLAN_BILLING_PERIODS: readonly PlanBillingPeriod[] = ['month', 'year']
// Mercado Pago Colombia charges in pesos, and nobody prices a gym in centavos.
export const PLAN_CURRENCY = 'COP'
export const PLAN_AMOUNT_STEP = 100

export interface OrganizationPlanCursor {
  cursorStatus: OrganizationPlanStatus
  cursorName: string
  cursorPlanId: string
}

export type OrganizationPlanResult = PaymentsCommandResult<StudioOrganizationPlan>

/** `created` is false when the price on sale already said exactly this. */
export interface PublishedPlanResult extends OrganizationPlanResult {
  created: boolean
}

type PlanCommand<T> = PaymentsCommandContext & {
  personId: string
  organizationId: string
} & T

export interface OrganizationPlanDatabase {
  list(
    input: {
      personId: string
      organizationId: string
      limit: number
      requestId: string
    } & Partial<OrganizationPlanCursor>,
  ): Promise<Page<StudioOrganizationPlan>>
  create(input: PlanCommand<{ name: string }>): Promise<OrganizationPlanResult>
  rename(input: PlanCommand<{ planId: string; name: string }>): Promise<OrganizationPlanResult>
  publish(
    input: PlanCommand<{ planId: string; version: StudioPlanVersionPublish }>,
  ): Promise<PublishedPlanResult>
  deprecate(
    input: PlanCommand<{ planId: string; planVersionId: string }>,
  ): Promise<OrganizationPlanResult>
}
