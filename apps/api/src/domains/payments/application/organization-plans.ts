/**
 * A gym's plans — data in, data out.
 *
 * Thin for the same reason the subscription use cases are: who may change a price,
 * what replacing one does and whether a name is taken are answered inside each closed
 * function. This layer adds the actor the handler resolved from the session.
 */

import type { PaymentsCommandContext } from '../domain/index.js'
import type {
  OrganizationPlanCursor,
  OrganizationPlanDatabase,
  OrganizationPlanResult,
  PublishedPlanResult,
  StudioOrganizationPlan,
  StudioPlanVersionPublish,
} from '../domain/organization-plans.js'
import type { Page } from '../domain/subscriptions.js'

type Command<T> = PaymentsCommandContext & { organizationId: string } & T

export interface OrganizationPlanService {
  list(
    personId: string,
    input: {
      organizationId: string
      limit: number
      requestId: string
    } & Partial<OrganizationPlanCursor>,
  ): Promise<Page<StudioOrganizationPlan>>
  create(personId: string, input: Command<{ name: string }>): Promise<OrganizationPlanResult>
  rename(
    personId: string,
    input: Command<{ planId: string; name: string }>,
  ): Promise<OrganizationPlanResult>
  publish(
    personId: string,
    input: Command<{ planId: string; version: StudioPlanVersionPublish }>,
  ): Promise<PublishedPlanResult>
  deprecate(
    personId: string,
    input: Command<{ planId: string; planVersionId: string }>,
  ): Promise<OrganizationPlanResult>
}

export function createOrganizationPlanService(
  database: OrganizationPlanDatabase,
): OrganizationPlanService {
  return {
    list: (personId, input) => database.list({ personId, ...input }),
    create: (personId, input) => database.create({ personId, ...input }),
    rename: (personId, input) => database.rename({ personId, ...input }),
    publish: (personId, input) => database.publish({ personId, ...input }),
    deprecate: (personId, input) => database.deprecate({ personId, ...input }),
  }
}
