/**
 * Public interface of the intelligence domain: the assistant, for Space and Studio
 * (ADR-053). Today it is the AI consent a person gives and withdraws in Space.
 */

export { spaceIntelligenceRoutes } from './handlers/space.js'
export { spaceIntelligenceService } from './dependencies.js'
export type { SpaceIntelligenceService } from './application/index.js'
export type { IntelligenceConsent } from './domain/index.js'
