/**
 * Pushing each notice to the person's phones (ADR-054 decision 7, scenario 7).
 *
 * The projection left one pending push per notice and active phone. This claims the due
 * ones (`system.claim_push_deliveries`, which leases them, so a second claim does not take
 * them again, and skips any whose phone was retired or changed hands), words each from its
 * kind in her language with no personal data (`NT-3`), sends them through the push port
 * and settles each with what the provider answered (`system.settle_push_delivery`). A
 * token reported unregistered retires its phone. A request refused whole leaves every push
 * of it pending for another turn when the refusal is worth retrying, and failed when not.
 *
 * **Off unless `PUSH_DELIVERY_ENABLED=true`.** Until the project has APNs and FCM
 * credentials nothing is claimed and nothing is sent; the pushes wait, pending, and the
 * notices are in her inbox all the same. The ninety-day purge of settled pushes and
 * retired phones runs either way, because it sends nothing.
 */

import {
  NotificationDeliveryError,
  isPushNoticeKind,
  renderPushNotice,
  type PushMessage,
  type PushNoticeKind,
  type PushSender,
} from '@allfitone/notifications'
import type postgres from 'postgres'

export interface ClaimedPush {
  deliveryId: string
  notificationId: string
  pushToken: string
  kind: string
  organizationName: string | null
  locale: string | null
}

export type PushSettlement = 'sent' | 'failed' | 'retry' | 'unregistered'

export interface PushDeliveryDatabase {
  claim(limit: number): Promise<ClaimedPush[]>
  settle(push: ClaimedPush, outcome: PushSettlement, errorCode: string | null): Promise<void>
  purge(limit: number): Promise<number>
}

export interface PushDeliveryResult {
  claimed: number
  delivered: number
  deadOrDelayed: number
  unregistered: number
  purged: number
}

// Expo takes 100 messages per request; one request per turn keeps the turn short.
const CLAIM_LIMIT = 100
const PURGE_LIMIT = 1000

export function createPushDeliveryDatabase(sql: postgres.Sql): PushDeliveryDatabase {
  return {
    claim: (limit) =>
      asWorker(sql, async (transaction) => {
        const rows = await transaction<
          Array<{
            delivery_id: string
            notification_id: string
            push_token: string
            kind: string
            organization_name: string | null
            locale: string | null
          }>
        >`
          select delivery_id, notification_id, push_token, kind, organization_name, locale
          from system.claim_push_deliveries(${limit}::integer)
        `
        return rows.map((row) => ({
          deliveryId: row.delivery_id,
          notificationId: row.notification_id,
          pushToken: row.push_token,
          kind: row.kind,
          organizationName: row.organization_name,
          locale: row.locale,
        }))
      }),
    settle: (push, outcome, errorCode) =>
      asWorker(sql, async (transaction) => {
        await transaction`
          select system.settle_push_delivery(
            ${push.deliveryId}::uuid, ${outcome}, ${errorCode}, ${push.pushToken}
          )
        `
      }),
    purge: (limit) =>
      asWorker(sql, async (transaction) => {
        const [row] = await transaction<{ purged: number }[]>`
          select system.purge_notification_records(${limit}::integer) as purged
        `
        if (!row) throw new Error('PostgreSQL did not answer the notification purge')
        return row.purged
      }),
  }
}

export function createPushDeliveryProcessor(dependencies: {
  database: PushDeliveryDatabase
  push: PushSender
  enabled: boolean
}): () => Promise<PushDeliveryResult> {
  return async () => {
    const purged = await dependencies.database.purge(PURGE_LIMIT)
    const result: PushDeliveryResult = {
      claimed: 0,
      delivered: 0,
      deadOrDelayed: 0,
      unregistered: 0,
      purged,
    }
    if (!dependencies.enabled) return result

    const claimed = await dependencies.database.claim(CLAIM_LIMIT)
    result.claimed = claimed.length
    if (claimed.length === 0) return result

    const sendable: Array<{ push: ClaimedPush; kind: PushNoticeKind }> = []
    for (const push of claimed) {
      if (isPushNoticeKind(push.kind)) {
        sendable.push({ push, kind: push.kind })
        continue
      }
      // A kind this worker cannot word is a deploy behind the database: never sent blank.
      await dependencies.database.settle(push, 'failed', 'unknown_notice_kind')
      result.deadOrDelayed += 1
    }
    if (sendable.length === 0) return result

    let outcomes
    try {
      outcomes = await dependencies.push.send(sendable.map(message))
    } catch (error) {
      const retryable = !(error instanceof NotificationDeliveryError) || error.retryable
      const code = error instanceof NotificationDeliveryError ? error.code : 'worker_error'
      for (const { push } of sendable) {
        await dependencies.database.settle(push, retryable ? 'retry' : 'failed', code)
      }
      result.deadOrDelayed += sendable.length
      return result
    }

    for (const [index, { push }] of sendable.entries()) {
      const outcome = outcomes[index]
      if (outcome?.kind === 'accepted') {
        await dependencies.database.settle(push, 'sent', null)
        result.delivered += 1
      } else if (outcome?.kind === 'unregistered') {
        await dependencies.database.settle(push, 'unregistered', 'DeviceNotRegistered')
        result.unregistered += 1
        result.deadOrDelayed += 1
      } else {
        await dependencies.database.settle(push, 'failed', outcome?.reason ?? 'no_outcome')
        result.deadOrDelayed += 1
      }
    }
    return result
  }
}

function message({ push, kind }: { push: ClaimedPush; kind: PushNoticeKind }): PushMessage {
  const words = renderPushNotice({
    kind,
    organizationName: push.organizationName,
    locale: push.locale,
  })
  // Identifiers only: the app opens the notice and reads the rest as her.
  return {
    token: push.pushToken,
    ...words,
    data: { notice_id: push.notificationId, kind: push.kind },
  }
}

async function asWorker<T>(
  sql: postgres.Sql,
  operation: (transaction: postgres.TransactionSql) => Promise<T>,
): Promise<T> {
  const result = await sql.begin(async (transaction) => {
    await transaction`select set_config('app.actor_kind', 'worker', true)`
    return { value: await operation(transaction) }
  })
  return result.value
}
