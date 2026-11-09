import {
  createClientCardService,
  createClientDirectoryService,
  createStudioTodayService,
  type ClientCardService,
  type StudioTodayService,
  createMyRelationshipCommandService,
  createMyRelationshipService,
  createHolderAssignmentService,
  createHolderReassignmentService,
  createRelationshipHistoryService,
  createRelationshipStateService,
  createSubstitutionProposalService,
  createSubstitutionTerminationService,
  createSubstitutionListService,
  createRelationshipTerminationService,
  createTerminationRequestService,
  type ClientDirectoryService,
  type MyRelationshipCommandService,
  type MyRelationshipService,
  type HolderAssignmentService,
  type HolderReassignmentService,
  type RelationshipHistoryService,
  type RelationshipStateService,
  type SubstitutionProposalService,
  type SubstitutionTerminationService,
  type SubstitutionListService,
  type RelationshipTerminationService,
  type TerminationRequestService,
} from './application/index.js'
import {
  createClientCardDatabase,
  createClientDirectoryDatabase,
  createStudioTodayDatabase,
  createMyRelationshipCommandDatabase,
  createMyRelationshipDatabase,
  createHolderAssignmentDatabase,
  createHolderReassignmentDatabase,
  createRelationshipHistoryDatabase,
  createRelationshipStateDatabase,
  createSubstitutionProposalDatabase,
  createSubstitutionTerminationDatabase,
  createSubstitutionListDatabase,
  createRelationshipTerminationDatabase,
  createTerminationRequestDatabase,
} from './infrastructure/index.js'

let cached: ClientDirectoryService | undefined
let cachedMine: MyRelationshipService | undefined
let cachedMineCommands: MyRelationshipCommandService | undefined

export function myRelationshipCommandService(): MyRelationshipCommandService {
  cachedMineCommands ??= createMyRelationshipCommandService(
    createRelationshipHistoryDatabase(),
    createMyRelationshipCommandDatabase(),
  )
  return cachedMineCommands
}
let cachedHolders: HolderAssignmentService | undefined
let cachedStates: RelationshipStateService | undefined
let cachedReassignments: HolderReassignmentService | undefined
let cachedHistories: RelationshipHistoryService | undefined
let cachedSubstitutions: SubstitutionProposalService | undefined
let cachedTerminations: SubstitutionTerminationService | undefined
let cachedSubstitutionPages: SubstitutionListService | undefined
let cachedTerminatedRelationships: RelationshipTerminationService | undefined
let cachedTerminationRequests: TerminationRequestService | undefined

export function clientDirectoryService(): ClientDirectoryService {
  cached ??= createClientDirectoryService(createClientDirectoryDatabase())
  return cached
}

export function holderAssignmentService(): HolderAssignmentService {
  cachedHolders ??= createHolderAssignmentService(createHolderAssignmentDatabase())
  return cachedHolders
}

export function holderReassignmentService(): HolderReassignmentService {
  cachedReassignments ??= createHolderReassignmentService(createHolderReassignmentDatabase())
  return cachedReassignments
}

export function relationshipStateService(): RelationshipStateService {
  cachedStates ??= createRelationshipStateService(createRelationshipStateDatabase())
  return cachedStates
}

export function relationshipHistoryService(): RelationshipHistoryService {
  cachedHistories ??= createRelationshipHistoryService(createRelationshipHistoryDatabase())
  return cachedHistories
}

export function substitutionProposalService(): SubstitutionProposalService {
  cachedSubstitutions ??= createSubstitutionProposalService(createSubstitutionProposalDatabase())
  return cachedSubstitutions
}

export function substitutionTerminationService(): SubstitutionTerminationService {
  cachedTerminations ??= createSubstitutionTerminationService(
    createSubstitutionTerminationDatabase(),
  )
  return cachedTerminations
}

export function substitutionListService(): SubstitutionListService {
  cachedSubstitutionPages ??= createSubstitutionListService(createSubstitutionListDatabase())
  return cachedSubstitutionPages
}

export function relationshipTerminationService(): RelationshipTerminationService {
  cachedTerminatedRelationships ??= createRelationshipTerminationService(
    createRelationshipTerminationDatabase(),
  )
  return cachedTerminatedRelationships
}

export function terminationRequestService(): TerminationRequestService {
  cachedTerminationRequests ??= createTerminationRequestService(createTerminationRequestDatabase())
  return cachedTerminationRequests
}

export function myRelationshipService(): MyRelationshipService {
  cachedMine ??= createMyRelationshipService(createMyRelationshipDatabase())
  return cachedMine
}

let cachedCards: ClientCardService | undefined
let cachedToday: StudioTodayService | undefined

export function clientCardService(): ClientCardService {
  cachedCards ??= createClientCardService(createClientCardDatabase())
  return cachedCards
}

export function studioTodayService(): StudioTodayService {
  cachedToday ??= createStudioTodayService(createStudioTodayDatabase())
  return cachedToday
}
