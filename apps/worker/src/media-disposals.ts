/**
 * `HU-BO-033`: a photo that is no longer used leaves the store even when nobody was there
 * to remove it.
 *
 * The API removes a meal or body photo right after the commit that disposes of it. Two
 * paths never reached that step: a meal the worker deletes when a legal hold ends, and a
 * removal the store refused. This sweeps both queues. PostgreSQL decides what is due and
 * how long a refusal waits (`nutrition.claim_media_disposals`,
 * `identity.claim_body_photo_disposals`); this removes each object and seals its row.
 *
 * Remove, then seal, in that order: a crash in between removes the object again on the
 * next turn, which the store answers as done. Sealing first could keep a photo for good.
 *
 * The store is built only when a photo is due. Until the worker's environment has store
 * settings, an empty queue runs as it always did, and a due photo fails this job by name,
 * last in the batch, so every other job has already run.
 */

import { ObjectStoreError, type ObjectStore } from '@allfitone/object-store'
import type postgres from 'postgres'

import { mapWithConcurrency } from './invitations.js'

export type PhotoQueue = 'meal' | 'body'

export interface PhotoDisposal {
  id: string
  mediaRef: string
}

export interface MediaDisposalDatabase {
  claim(queue: PhotoQueue, limit: number): Promise<PhotoDisposal[]>
  seal(queue: PhotoQueue, disposalId: string): Promise<void>
}

export interface MediaDisposalResult {
  claimed: number
  deadOrDelayed: number
  removed: number
}

const QUEUES: readonly PhotoQueue[] = ['meal', 'body']

// Each removal may wait out the store's deadline; this bounds what a hung store delays.
const SWEEP_LIMIT = 20
const CONCURRENCY = 5

export function createMediaDisposalDatabase(sql: postgres.Sql): MediaDisposalDatabase {
  return {
    claim: (queue, limit) =>
      asWorker(sql, async (transaction) => {
        const rows =
          queue === 'meal'
            ? await transaction<Array<{ id: string; media_ref: string }>>`
                select id, media_ref from nutrition.claim_media_disposals(${limit}::integer)
              `
            : await transaction<Array<{ id: string; media_ref: string }>>`
                select id, media_ref from identity.claim_body_photo_disposals(${limit}::integer)
              `
        return rows.map((row) => ({ id: row.id, mediaRef: row.media_ref }))
      }),
    seal: (queue, disposalId) =>
      asWorker(sql, async (transaction) => {
        if (queue === 'meal') {
          await transaction`select nutrition.seal_swept_media_disposal(${disposalId}::uuid)`
        } else {
          await transaction`select identity.seal_swept_body_photo_disposal(${disposalId}::uuid)`
        }
      }),
  }
}

export function createMediaDisposalProcessor(options: {
  database: MediaDisposalDatabase
  store: () => ObjectStore
}): () => Promise<MediaDisposalResult> {
  return async () => {
    const result: MediaDisposalResult = { claimed: 0, deadOrDelayed: 0, removed: 0 }
    for (const queue of QUEUES) {
      const due = await options.database.claim(queue, SWEEP_LIMIT)
      if (due.length === 0) continue
      const store = options.store()
      const removed = await mapWithConcurrency(due, CONCURRENCY, async (disposal) => {
        try {
          await store.remove(disposal.mediaRef)
        } catch (error) {
          // A refusal waits its next turn; anything else is a fault and fails the job.
          if (error instanceof ObjectStoreError) return false
          throw error
        }
        await options.database.seal(queue, disposal.id)
        return true
      })
      const count = removed.filter(Boolean).length
      result.claimed += due.length
      result.removed += count
      result.deadOrDelayed += due.length - count
    }
    return result
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
