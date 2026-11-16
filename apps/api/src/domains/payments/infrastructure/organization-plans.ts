/**
 * PostgreSQL access for a gym's plans.
 *
 * Every call runs as the acting person; the closed functions resolve `manage_billing` or
 * the membership from that actor, and the row policies decide what the projection sees.
 * The projection arrives as one JSON document per plan and is copied field by field, so
 * nothing the database adds later reaches the wire without the contract saying so.
 */

import { database } from '../../../platform/db/index.js'
import type {
  OrganizationPlanDatabase,
  OrganizationPlanResult,
  PublishedPlanResult,
  StudioOrganizationPlan,
  StudioPlanVersion,
} from '../domain/organization-plans.js'
import { asPerson, page } from './transaction.js'

type VersionDocument = Omit<StudioPlanVersion, 'amount_minor'> & { amount_minor: number | string }
type PlanDocument = Omit<StudioOrganizationPlan, 'current_version' | 'versions'> & {
  current_version: VersionDocument | null
  versions: VersionDocument[]
}

type ListRow = { plan: PlanDocument }
type CommandRow = { result: PlanDocument; replayed: boolean }
type PublishRow = CommandRow & { created: boolean }

export function createOrganizationPlanDatabase(): OrganizationPlanDatabase {
  const sql = database()

  return {
    list: (input) =>
      asPerson(sql, input.personId, input.requestId, async (transaction) => {
        const rows = await transaction<ListRow[]>`
          select plan from payments.list_organization_plans_for_team(
            ${input.personId}::uuid, ${input.organizationId}::uuid,
            ${input.limit + 1}::integer,
            ${input.cursorStatus ?? null}::text,
            ${input.cursorName ?? null}::text,
            ${input.cursorPlanId ?? null}::uuid
          )
        `
        return page(rows, input.limit, (row) => presentPlan(row.plan))
      }),

    create: (input) =>
      asPerson(sql, input.personId, input.requestId, async (transaction) => {
        const rows = await transaction<CommandRow[]>`
          select result, replayed from payments.create_organization_plan(
            ${input.personId}::uuid, ${input.organizationId}::uuid, ${input.name}::text,
            ${input.idempotencyKey}::uuid, ${input.commandId}::uuid, ${input.requestHash}
          )
        `
        return command(rows, 'create the plan')
      }),

    rename: (input) =>
      asPerson(sql, input.personId, input.requestId, async (transaction) => {
        const rows = await transaction<CommandRow[]>`
          select result, replayed from payments.rename_organization_plan(
            ${input.personId}::uuid, ${input.organizationId}::uuid, ${input.planId}::uuid,
            ${input.name}::text,
            ${input.idempotencyKey}::uuid, ${input.commandId}::uuid, ${input.requestHash}
          )
        `
        return command(rows, 'rename the plan')
      }),

    publish: (input) =>
      asPerson(sql, input.personId, input.requestId, async (transaction) => {
        const rows = await transaction<PublishRow[]>`
          select result, created, replayed from payments.publish_plan_version(
            ${input.personId}::uuid, ${input.organizationId}::uuid, ${input.planId}::uuid,
            ${input.version.amount_minor}::bigint, ${input.version.currency_code}::text,
            ${input.version.billing_period}::text, ${input.version.delivery_mode}::text,
            ${input.idempotencyKey}::uuid, ${input.commandId}::uuid, ${input.requestHash}
          )
        `
        const [row] = rows
        if (!row) throw new Error('PostgreSQL did not publish the plan version')
        const published: PublishedPlanResult = {
          resource: presentPlan(row.result),
          created: row.created,
          replayed: row.replayed,
        }
        return published
      }),

    deprecate: (input) =>
      asPerson(sql, input.personId, input.requestId, async (transaction) => {
        const rows = await transaction<CommandRow[]>`
          select result, replayed from payments.deprecate_plan_version(
            ${input.personId}::uuid, ${input.organizationId}::uuid, ${input.planId}::uuid,
            ${input.planVersionId}::uuid,
            ${input.idempotencyKey}::uuid, ${input.commandId}::uuid, ${input.requestHash}
          )
        `
        return command(rows, 'retire the plan version')
      }),
  }
}

function command(rows: CommandRow[], operation: string): OrganizationPlanResult {
  const [row] = rows
  if (!row) throw new Error(`PostgreSQL did not ${operation}`)
  return { resource: presentPlan(row.result), replayed: row.replayed }
}

function presentPlan(document: PlanDocument): StudioOrganizationPlan {
  return {
    plan_id: document.plan_id,
    name: document.name,
    status: document.status,
    on_sale: document.on_sale,
    created_at: new Date(document.created_at).toISOString(),
    current_version: document.current_version ? presentVersion(document.current_version) : null,
    versions: document.versions.map(presentVersion),
  }
}

// A timestamp inside JSON keeps the session's offset; the wire always says UTC.
function presentVersion(document: VersionDocument): StudioPlanVersion {
  return {
    plan_version_id: document.plan_version_id,
    version_number: document.version_number,
    amount_minor: Number(document.amount_minor),
    currency_code: document.currency_code,
    billing_period: document.billing_period,
    delivery_mode: document.delivery_mode,
    status: document.status,
    published_at: new Date(document.published_at).toISOString(),
    deprecated_at: document.deprecated_at ? new Date(document.deprecated_at).toISOString() : null,
  }
}
