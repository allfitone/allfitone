/**
 * Published permission definitions: what a person is agreeing to.
 *
 * A scope version says which resources and fields a permission covers, and which
 * it excludes. Nothing here re-implements the rules that make that safe — the
 * immutability of a published version, the server-assigned version number, the
 * refusal of a version that includes nothing — because all of them live in
 * PostgreSQL and a second answer in this layer could disagree with the one that
 * decides.
 *
 * The one thing worth repeating here is the closed vocabulary, so a malformed
 * request is answered 422 rather than becoming a database error.
 */

import type { AllfitV1Schemas } from '@allfitone/contracts'

export type ScopeDefinition = AllfitV1Schemas['ScopeDefinition']
export type ScopeDefinitionPublication = AllfitV1Schemas['ScopeDefinitionPublication']
export type ScopeResourceRule = AllfitV1Schemas['ScopeResourceRule']
export type ScopeCode = AllfitV1Schemas['ScopeCode']
export type AccessLevel = AllfitV1Schemas['AccessLevel']
export type AccessEvent = AllfitV1Schemas['AccessEvent']
export type AccessEventPage = AllfitV1Schemas['AccessEventPage']
export type ErasureRequest = AllfitV1Schemas['ErasureRequest']
export type ErasureRequestPage = AllfitV1Schemas['ErasureRequestPage']
export type ErasureRequestState = AllfitV1Schemas['ErasureRequestState']
export type LegalHold = AllfitV1Schemas['LegalHold']
export type LegalHoldApplication = AllfitV1Schemas['LegalHoldApplication']
export type LegalHoldPage = AllfitV1Schemas['LegalHoldPage']
export type LegalHoldState = AllfitV1Schemas['LegalHoldState']
export type HoldableClassification = LegalHoldApplication['data_classification_codes'][number]
export type LegalHoldReason = AllfitV1Schemas['LegalHoldReason']
export type AuthorizedScope = AllfitV1Schemas['AuthorizedScopeItem']
export type AuthorizedScopePage = AllfitV1Schemas['AuthorizedScopePage']

export const MAX_AUTHORIZED_SCOPE_PAGE = 100
export const DEFAULT_AUTHORIZED_SCOPE_PAGE = 50

/**
 * Keyset, not offset. The register is ordered by the person's name and then by
 * the grant, so a page resumes from the last pair it handed out rather than
 * from a count that shifts the moment anybody revokes anything.
 */
export interface AuthorizedScopeCursor {
  name: string
  id: string
}

export interface AuthorizedScopeQuery {
  organizationId: string
  limit: number
  cursor?: AuthorizedScopeCursor | undefined
}

export const SCOPE_CODES: readonly ScopeCode[] = [
  'relationship_training',
  'prior_training_history',
  'body_progress',
  'health_context',
  'nutrition_intake',
  'nutrition_guidance',
  'nutrition_media',
]

export const ACCESS_LEVELS: readonly AccessLevel[] = ['read', 'contribute']

/** The sensitivity catalogue seeded by the privacy migration. */
export const DATA_CLASSIFICATIONS: readonly string[] = [
  'operational',
  'audit',
  'identity_pii',
  'training',
  'body',
  'nutrition',
  'health',
]

export interface PrivacyCurator {
  actorPersonId: string
  actorSessionId: string
}

export interface ScopeCommandContext {
  idempotencyKey: string
  commandId: string
  requestId: string
  requestHash: Buffer
}

export interface ScopeCommandResult {
  resource: ScopeDefinition
  replayed: boolean
}

/**
 * What an auditor may narrow the log by. Every filter is resolved in the
 * database — a filter applied after the rows arrive would mean reading more of
 * the log than the question needed.
 */
export interface AccessEventFilters {
  filterActorPersonId?: string | undefined
  filterSubjectPersonId?: string | undefined
  from?: string | undefined
  to?: string | undefined
  limit?: number | undefined
  cursor?: AccessEventCursor | undefined
}

export const DEFAULT_ACCESS_EVENT_PAGE = 50
export const MAX_ACCESS_EVENT_PAGE = 200

/**
 * The last record a page showed (HU-BO-030). Both halves, because one read writes
 * several records in the same instant and time alone would skip or repeat them.
 */
export interface AccessEventCursor {
  at: string
  id: string
}

const RECORD_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
// Microseconds, as PostgreSQL stores them: a Date would round them off and skip records.
const RECORD_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?Z$/

export function encodeAccessEventCursor(cursor: AccessEventCursor): string {
  return Buffer.from(JSON.stringify({ at: cursor.at, id: cursor.id }), 'utf8').toString('base64url')
}

/** It feeds a sort key the database trusts, so anything malformed is no cursor at all. */
export function decodeAccessEventCursor(value: string): AccessEventCursor | undefined {
  if (value.length < 16 || value.length > 1024) return undefined
  try {
    const parsed: unknown = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'))
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return undefined
    const at: unknown = 'at' in parsed ? parsed.at : undefined
    const id: unknown = 'id' in parsed ? parsed.id : undefined
    if (typeof at !== 'string' || !RECORD_INSTANT.test(at) || Number.isNaN(Date.parse(at))) {
      return undefined
    }
    if (typeof id !== 'string' || !RECORD_ID.test(id)) return undefined
    return { at, id }
  } catch {
    return undefined
  }
}

export const ERASURE_REQUEST_STATES: readonly ErasureRequestState[] = ['open', 'closed']

export const MAX_ERASURE_PAGE = 100
export const DEFAULT_ERASURE_PAGE = 25

export interface ErasureRequestCursor {
  at: string
  id: string
}

export interface ErasureRequestFilters {
  status: ErasureRequestState
  limit: number
  cursor?: ErasureRequestCursor | undefined
}

export const LEGAL_HOLD_REASONS: readonly LegalHoldReason[] = [
  'judicial_order',
  'regulatory_request',
  'service_dispute',
  'tax_or_accounting_obligation',
]

/** Only what the platform disposes of: a hold over anything else would keep nothing. */
export const HOLDABLE_CLASSIFICATIONS: readonly HoldableClassification[] = [
  'body',
  'health',
  'nutrition',
]
export const LEGAL_HOLD_STATES: readonly LegalHoldState[] = ['active', 'ended']
export const DEFAULT_HOLD_PAGE = 50
export const MAX_HOLD_PAGE = 100
export const MAX_HOLD_SCOPE = 500
export const MAX_HOLD_CASE_REFERENCE = 120

export interface LegalHoldResult {
  resource: LegalHold
  replayed: boolean
}

export interface LegalHoldFilters {
  status: LegalHoldState
  limit: number
}

export interface LegalHoldDatabase {
  list(input: PrivacyCurator & { requestId: string } & LegalHoldFilters): Promise<LegalHoldPage>
  apply(
    input: PrivacyCurator &
      ScopeCommandContext & { requestId: string; application: LegalHoldApplication },
  ): Promise<LegalHoldResult>
  release(
    input: PrivacyCurator & ScopeCommandContext & { requestId: string; holdId: string },
  ): Promise<LegalHoldResult>
}

export interface ErasureRequestDatabase {
  list(
    input: PrivacyCurator & { requestId: string } & ErasureRequestFilters,
  ): Promise<ErasureRequestPage>
}

export interface AccessLogDatabase {
  read(input: PrivacyCurator & { requestId: string } & AccessEventFilters): Promise<AccessEventPage>
}

export interface ScopeDefinitionDatabase {
  publish(
    input: PrivacyCurator & ScopeCommandContext & { publication: ScopeDefinitionPublication },
  ): Promise<ScopeCommandResult>
  list(input: PrivacyCurator & { requestId: string }): Promise<ScopeDefinition[]>
}

/**
 * A permission as a professional meets it when building an invitation: the
 * words for it, and the contract version an offer has to be frozen against.
 *
 * Distinct from `ScopeDefinition`, which carries the rule set — which fields of
 * which resources a scope reaches. That is what Backoffice curates and says
 * nothing to the person being asked, so Studio never receives it.
 */
export type OfferableScope = AllfitV1Schemas['OfferableScope']

export interface OfferableScopeDatabase {
  listOfferable(input: { actorPersonId: string; requestId: string }): Promise<OfferableScope[]>
}

/**
 * One category a gym asked her for (`OP-PRV-013`): her answer and, where she said
 * yes, how that grant stands now. The wire shape, because nothing here reshapes it.
 */
export type MyConsent = AllfitV1Schemas['SpaceConsent']

export interface GrantRevocation {
  grantId: string
  status: 'revoked'
  revokedAt: string
}

// Declared here, not borrowed from another domain: see the note in relationships.
export interface MyConsentCommand {
  personId: string
  grantId: string
  idempotencyKey: string
  commandId: string
  requestHash: Uint8Array
}

export interface MyConsentDatabase {
  listMine(personId: string): Promise<MyConsent[]>
  revoke(command: MyConsentCommand): Promise<{ resource: GrantRevocation; replayed: boolean }>
}

export interface AuthorizedScopeDatabase {
  list(
    personId: string,
    query: AuthorizedScopeQuery,
  ): Promise<{ items: AuthorizedScope[]; hasMore: boolean }>
}
