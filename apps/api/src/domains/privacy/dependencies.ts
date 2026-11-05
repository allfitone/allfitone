import {
  createAccessLogService,
  createErasureRequestService,
  createLegalHoldService,
  createAuthorizedScopeService,
  createMyConsentService,
  createOfferableScopeService,
  createScopeDefinitionService,
  createSessionVisibilityService,
  type AccessLogService,
  type ErasureRequestService,
  type LegalHoldService,
  type AuthorizedScopeService,
  type MyConsentService,
  type OfferableScopeService,
  type ScopeDefinitionService,
  type SessionVisibilityService,
} from './application/index.js'
import {
  createAccessLogDatabase,
  createErasureRequestDatabase,
  createLegalHoldDatabase,
  createAuthorizedScopeDatabase,
  createMyConsentDatabase,
  createOfferableScopeDatabase,
  createScopeDefinitionDatabase,
  createSessionVisibilityDatabase,
} from './infrastructure/index.js'

let cachedScopes: ScopeDefinitionService | undefined
let cachedLog: AccessLogService | undefined
let cachedErasure: ErasureRequestService | undefined
let cachedHolds: LegalHoldService | undefined
let cachedOfferable: OfferableScopeService | undefined
let cachedConsents: MyConsentService | undefined
let cachedAuthorized: AuthorizedScopeService | undefined
let cachedVisibility: SessionVisibilityService | undefined

export function scopeDefinitionService(): ScopeDefinitionService {
  cachedScopes ??= createScopeDefinitionService(createScopeDefinitionDatabase())
  return cachedScopes
}

export function accessLogService(): AccessLogService {
  cachedLog ??= createAccessLogService(createAccessLogDatabase())
  return cachedLog
}

export function erasureRequestService(): ErasureRequestService {
  cachedErasure ??= createErasureRequestService(createErasureRequestDatabase())
  return cachedErasure
}

export function legalHoldService(): LegalHoldService {
  cachedHolds ??= createLegalHoldService(createLegalHoldDatabase())
  return cachedHolds
}

export function offerableScopeService(): OfferableScopeService {
  cachedOfferable ??= createOfferableScopeService(createOfferableScopeDatabase())
  return cachedOfferable
}

export function myConsentService(): MyConsentService {
  cachedConsents ??= createMyConsentService(createMyConsentDatabase())
  return cachedConsents
}

export function authorizedScopeService(): AuthorizedScopeService {
  cachedAuthorized ??= createAuthorizedScopeService(createAuthorizedScopeDatabase())
  return cachedAuthorized
}

export function sessionVisibilityService(): SessionVisibilityService {
  cachedVisibility ??= createSessionVisibilityService(createSessionVisibilityDatabase())
  return cachedVisibility
}
