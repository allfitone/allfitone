/**
 * The historical access case, as Studio uses it (HU-STUDIO-061..063).
 *
 * Thin on purpose. Who may open, whom a case authorizes, how recent the sign-in must be
 * and what stayed readable after the cut are PostgreSQL's decisions, taken inside the
 * transaction that also writes the access record. This layer holds the member and the
 * access session to every call, so no caller can read through a case without them.
 */

import type { HistoricalAccessDatabase } from '../domain/historical-access.js'

export type HistoricalAccessService = HistoricalAccessDatabase

export function createHistoricalAccessService(
  database: HistoricalAccessDatabase,
): HistoricalAccessService {
  return {
    open: (actor, input) => database.open(actor, input),
    close: (actor, input) => database.close(actor, input),
    list: (actor, query) => database.list(actor, query),
    readRelationship: (actor, target) => database.readRelationship(actor, target),
    listExecutions: (actor, target, page) => database.listExecutions(actor, target, page),
    readExecution: (actor, target, executionId) =>
      database.readExecution(actor, target, executionId),
    listBodyProgress: (actor, target, page) => database.listBodyProgress(actor, target, page),
  }
}
