import type { AllfitV1Schemas } from '@allfitone/contracts'
import { newCommand as createCommand, type CommandHeaders } from '@allfitone/contracts/commands'
import type { ClientOperation } from '@allfitone/telemetry'

import { notifyStudioAuthenticated, notifyStudioUnauthenticated } from './session-activity'
import { captureStudioApiRequest, setStudioTelemetryIdentity } from './telemetry'

export type StudioSession = AllfitV1Schemas['StudioSession']
export type StudioEntryContext = AllfitV1Schemas['StudioEntryContext']
export type OnboardingAttempt = AllfitV1Schemas['StudioOnboardingAttempt']
export type AdultEligibilityEvidence = AllfitV1Schemas['AdultEligibilityEvidence']
export type Membership = AllfitV1Schemas['StudioMembership']
export type OrganizationType = AllfitV1Schemas['OrganizationType']
export type OrganizationCreate = AllfitV1Schemas['OrganizationCreate']
export type OrganizationCreated = AllfitV1Schemas['OrganizationCreated']
export type Completion = AllfitV1Schemas['StudioOnboardingCompletion']
export type StudioMe = AllfitV1Schemas['StudioMe']
export type ProfessionalCatalogItem = AllfitV1Schemas['ProfessionalCatalogItem']
export type ProfessionalProfile = AllfitV1Schemas['ProfessionalProfile']
export type ProfessionalProfilePut = AllfitV1Schemas['ProfessionalProfilePut']
export type ProfessionalCredential = AllfitV1Schemas['ProfessionalCredential']
export type ProfessionalCredentialWrite = AllfitV1Schemas['ProfessionalCredentialWrite']
export type TeamInvitationCreate = AllfitV1Schemas['TeamInvitationCreate']
export type TeamInvitation = AllfitV1Schemas['TeamInvitation']
export type TeamInvitationPresentation = AllfitV1Schemas['TeamInvitationPresentation']
export type TeamInvitationDecisionCreate = AllfitV1Schemas['TeamInvitationDecisionCreate']
export type TeamInvitationDecisionResult = AllfitV1Schemas['TeamInvitationDecisionResult']
export type OwnershipInvitationPresentation = AllfitV1Schemas['OwnershipInvitationPresentation']
export type OwnershipInvitationDecisionCreate = AllfitV1Schemas['OwnershipInvitationDecisionCreate']
export type OwnershipInvitationDecisionResult = AllfitV1Schemas['OwnershipInvitationDecisionResult']
export type TeamInvitationPage = AllfitV1Schemas['TeamInvitationPage']
export type TeamInvitationListItem = AllfitV1Schemas['TeamInvitationListItem']
export type TeamInvitationStatus = AllfitV1Schemas['TeamInvitationStatus']
export type OrganizationMembership = AllfitV1Schemas['OrganizationMembershipListItem']
export type OrganizationMembershipPage = AllfitV1Schemas['OrganizationMembershipPage']
export type OrganizationMembershipStatus = AllfitV1Schemas['OrganizationMembershipStatus']
export type OfferableScopeCatalog = AllfitV1Schemas['OfferableScopeCatalog']
export type InformationCategoryList = AllfitV1Schemas['CatalogInformationCategoryList']
export type InformationCategory = AllfitV1Schemas['CatalogInformationCategory']
export type OfferableScope = AllfitV1Schemas['OfferableScope']
export type ClientInvitationCreate = AllfitV1Schemas['ClientInvitationCreate']
export type ClientInvitation = AllfitV1Schemas['ClientInvitation']
export type Program = AllfitV1Schemas['Program']
export type ProgramPage = AllfitV1Schemas['ProgramPage']
export type ProgramVersion = AllfitV1Schemas['ProgramVersion']
export type ProgramAssignmentCreate = AllfitV1Schemas['ProgramAssignmentCreate']
export type ProgramAssignment = AllfitV1Schemas['ProgramAssignment']
export type ProgramCreate = AllfitV1Schemas['ProgramCreate']
export type ProgramDraft = AllfitV1Schemas['ProgramDraft']
export type ProgramDraftContent = AllfitV1Schemas['ProgramDraftContent']
export type ProgramSessionContent = AllfitV1Schemas['ProgramVersionSessionCreate']
export type SessionTemplate = AllfitV1Schemas['SessionTemplate']
export type SessionTemplatePage = AllfitV1Schemas['SessionTemplatePage']
export type SessionTemplateVersion = AllfitV1Schemas['SessionTemplateVersion']
export type SessionTemplateCreate = AllfitV1Schemas['SessionTemplateCreate']
export type CatalogDiscipline = AllfitV1Schemas['CatalogDiscipline']
export type CatalogDisciplineList = AllfitV1Schemas['CatalogDisciplineList']
export type CatalogActivityType = AllfitV1Schemas['CatalogActivityType']
export type CatalogActivityTypeList = AllfitV1Schemas['CatalogActivityTypeList']
export type ActivityFamily = AllfitV1Schemas['ActivityFamily']
export type SessionTemplateDraft = AllfitV1Schemas['SessionTemplateDraft']
export type SessionTemplateDraftContent = AllfitV1Schemas['SessionTemplateDraftContent']
export type PlannedStepContent = AllfitV1Schemas['PlannedStepContent']
export type PlannedSetContent = AllfitV1Schemas['PlannedSetContent']
export type OrganizationMovement = AllfitV1Schemas['OrganizationMovement']
export type OrganizationMovementCreate = AllfitV1Schemas['OrganizationMovementCreate']
export type OrganizationMovementUpdate = AllfitV1Schemas['OrganizationMovementUpdate']
export type MovementRelation = AllfitV1Schemas['MovementRelation']
export type StudioMovement = AllfitV1Schemas['StudioMovement']
export type StudioMovementPage = AllfitV1Schemas['StudioMovementPage']
export type ClientDirectoryPage = AllfitV1Schemas['ClientDirectoryPage']
export type StudioGuestQuota = AllfitV1Schemas['StudioGuestQuota']
export type AuthorizedScopeItem = AllfitV1Schemas['AuthorizedScopeItem']
export type AuthorizedScopePage = AllfitV1Schemas['AuthorizedScopePage']
export type ClientDirectoryItem = AllfitV1Schemas['ClientDirectoryItem']
export type ClientDirectoryRelationship = AllfitV1Schemas['ClientDirectoryRelationship']
export type ClientDirectoryInvitation = AllfitV1Schemas['ClientDirectoryInvitation']
export type ClientDirectoryGroup = AllfitV1Schemas['ClientDirectoryGroup']
export type AccessLevel = AllfitV1Schemas['AccessLevel']
export type ClientTrainingProfile = AllfitV1Schemas['ClientTrainingProfile']
export type AuthorizedExecutionPage = AllfitV1Schemas['AuthorizedExecutionPage']
export type ClientProgress = AllfitV1Schemas['ClientProgress']
export type ClientProgressPeriod = AllfitV1Schemas['ClientProgressPeriod']
export type ClientProgressMovement = AllfitV1Schemas['ClientProgressMovement']
export type SpacePeriodMuscle = AllfitV1Schemas['SpacePeriodMuscle']
export type ProgressPeriod = 'week' | 'month'
export type AuthorizedExecutionSummary = AllfitV1Schemas['AuthorizedExecutionSummary']
export type AuthorizedExecution = AllfitV1Schemas['AuthorizedExecution']
export type ExecutionDetailSegment = AllfitV1Schemas['ExecutionDetailSegment']
export type ExecutionDetailStrengthSet = AllfitV1Schemas['ExecutionDetailStrengthSet']
export type ExecutionDetailEnduranceLap = AllfitV1Schemas['ExecutionDetailEnduranceLap']
export type ExecutionDetailIntervalResult = AllfitV1Schemas['ExecutionDetailIntervalResult']
export type ExecutionDetailRoundResult = AllfitV1Schemas['ExecutionDetailRoundResult']
export type ExecutionDetailMobilityResult = AllfitV1Schemas['ExecutionDetailMobilityResult']
export type ProfessionalObservation = AllfitV1Schemas['ProfessionalObservation']
export type CompletenessLevel = AllfitV1Schemas['CompletenessLevel']
export type ClientProfileClaim = AllfitV1Schemas['ClientProfileClaim']
export type ClientBiologicalSex = AllfitV1Schemas['ClientBiologicalSex']
export type Provenance = AllfitV1Schemas['Provenance']
export type AppliedScope = AllfitV1Schemas['AppliedScope']
export type ClientCard = AllfitV1Schemas['StudioClientCard']
export type AttendedClientCard = AllfitV1Schemas['StudioAttendedClientCard']
export type FormerClientCard = AllfitV1Schemas['StudioFormerClientCard']
export type ClientCardSection = AllfitV1Schemas['StudioClientCardSection']
export type ClientCardWithdrawal = AllfitV1Schemas['StudioClientCardWithdrawal']
export type ClientLossReason = AllfitV1Schemas['StudioClientLossReason']
export type ScopeCode = AllfitV1Schemas['ScopeCode']
export type RelationshipState = AllfitV1Schemas['RelationshipState']
export type RelationshipHistoryPage = AllfitV1Schemas['RelationshipHistoryPage']
export type RelationshipHistoryEvent = AllfitV1Schemas['RelationshipHistoryEvent']
export type RelationshipProfessional = AllfitV1Schemas['RelationshipProfessional']
export type RelationshipSubstitution = AllfitV1Schemas['RelationshipSubstitution']
export type RelationshipGrant = AllfitV1Schemas['RelationshipGrant']
export type RelationshipHolder = AllfitV1Schemas['RelationshipHolder']
export type RelationshipHolderAssignment = AllfitV1Schemas['RelationshipHolderAssignment']
export type RelationshipReassignment = AllfitV1Schemas['RelationshipReassignment']
export type RelationshipSubstitutionProposalCreate =
  AllfitV1Schemas['RelationshipSubstitutionProposalCreate']
export type RelationshipSubstitutionProposal = AllfitV1Schemas['RelationshipSubstitutionProposal']
export type RelationshipTermination = AllfitV1Schemas['RelationshipTermination']
export type RelationshipTerminationCreate = AllfitV1Schemas['RelationshipTerminationCreate']
export type RelationshipSubstitutionTermination =
  AllfitV1Schemas['RelationshipSubstitutionTermination']
export type RelationshipAssignmentPage = AllfitV1Schemas['RelationshipAssignmentPage']
export type RelationshipAssignment = AllfitV1Schemas['RelationshipAssignment']
export type RelationshipAssignmentSession = AllfitV1Schemas['RelationshipAssignmentSession']
export type Organization = AllfitV1Schemas['Organization']
export type OrganizationUpdate = AllfitV1Schemas['OrganizationUpdate']
export type OrganizationSite = AllfitV1Schemas['OrganizationSite']
export type OrganizationSiteStatus = AllfitV1Schemas['OrganizationSiteStatus']
export type OrganizationSiteCreate = AllfitV1Schemas['OrganizationSiteCreate']
export type OrganizationSiteUpdate = AllfitV1Schemas['OrganizationSiteUpdate']
export type OrganizationRole = AllfitV1Schemas['OrganizationRole']
export type OrganizationRoleCatalog = AllfitV1Schemas['OrganizationRoleCatalog']
export type OrganizationRoleCode = AllfitV1Schemas['OrganizationRoleCode']
export type OrganizationRoleGrant = AllfitV1Schemas['OrganizationRoleGrant']
export type OrganizationRoleGrantCreate = AllfitV1Schemas['OrganizationRoleGrantCreate']
export type OrganizationRoleRevocation = AllfitV1Schemas['OrganizationRoleRevocation']
export type OrganizationMembershipTermination = AllfitV1Schemas['OrganizationMembershipTermination']
export type OrganizationClosure = AllfitV1Schemas['OrganizationClosure']
export type OrganizationMembershipResignation = AllfitV1Schemas['OrganizationMembershipResignation']
export type AssignableOrganizationRoleCode = AllfitV1Schemas['AssignableOrganizationRoleCode']
export type OrganizationSubscriptionPage = AllfitV1Schemas['OrganizationSubscriptionPage']
export type OrganizationSubscription = AllfitV1Schemas['OrganizationSubscription']
export type SubscriptionStatus = AllfitV1Schemas['SubscriptionStatus']
export type OrganizationPlan = AllfitV1Schemas['StudioOrganizationPlan']
export type OrganizationPlanPage = AllfitV1Schemas['StudioOrganizationPlanPage']
export type PlanVersion = AllfitV1Schemas['StudioPlanVersion']
export type PlanVersionPublish = AllfitV1Schemas['StudioPlanVersionPublish']
export type PlanDeliveryMode = AllfitV1Schemas['PlanDeliveryMode']
export type SubscriptionTransition = AllfitV1Schemas['SubscriptionTransition']
export type HistoricalAccessPurpose = AllfitV1Schemas['HistoricalAccessPurpose']
export type HistoricalAccessCase = AllfitV1Schemas['HistoricalAccessCase']
export type HistoricalAccessCasePage = AllfitV1Schemas['HistoricalAccessCasePage']
export type HistoricalAccessCaseCreate = AllfitV1Schemas['HistoricalAccessCaseCreate']
export type HistoricalCaseMember = AllfitV1Schemas['HistoricalCaseMember']
export type HistoricalRelationship = AllfitV1Schemas['HistoricalRelationship']
export type FrozenExecutionSummary = AllfitV1Schemas['FrozenExecutionSummary']
export type FrozenExecutionPage = AllfitV1Schemas['FrozenExecutionPage']
export type FrozenBodyProgressPage = AllfitV1Schemas['FrozenBodyProgressPage']
export type ClientBodyProgressRecord = AllfitV1Schemas['ClientBodyProgressRecord']
export type BodyProgressMetricCode = AllfitV1Schemas['BodyProgressMetricCode']
export type BodyProgressUnitCode = AllfitV1Schemas['BodyProgressUnitCode']
export type FrozenNutritionGoalVersion = AllfitV1Schemas['FrozenNutritionGoalVersion']
export type FrozenNutritionGoalVersionPage = AllfitV1Schemas['FrozenNutritionGoalVersionPage']
export type ClientNutritionGoalTarget = AllfitV1Schemas['ClientNutritionGoalTarget']
export type ClientNutritionGoalDecision = AllfitV1Schemas['ClientNutritionGoalDecision']
export type NutrientCode = AllfitV1Schemas['NutrientCode']

const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8080').replace(/\/$/, '')

/** One thing a problem answer says is wrong, named by a stable code. */
export interface StudioApiIssue {
  code: string
  path: string
}

export class StudioApiError extends Error {
  /**
   * What an RFC 9457 answer lists under `errors`, such as everything a draft
   * still lacks before it can be published. Empty for the legacy envelope.
   */
  readonly issues: readonly StudioApiIssue[]
  /**
   * The state somebody else saved, which a stale-draft conflict hands back so
   * the editor can show it instead of losing either version.
   */
  readonly currentState: unknown

  constructor(
    readonly status: number,
    readonly code: string,
    readonly detail?: string,
    extensions: { issues?: readonly StudioApiIssue[]; currentState?: unknown } = {},
  ) {
    super(code)
    this.name = 'StudioApiError'
    this.issues = extensions.issues ?? []
    this.currentState = extensions.currentState
  }
}

export const studioApi = {
  apiUrl: API_URL,

  session: async () => {
    const session = await request<StudioSession>('/studio/v1/session')
    setStudioTelemetryIdentity(session.analytics?.distinct_id ?? null)
    return session
  },

  entryContext: async () => {
    const context = await request<StudioEntryContext>('/studio/v1/entry-context')
    setStudioTelemetryIdentity(context.analytics?.distinct_id ?? null)
    return context
  },

  startAttempt: (command: CommandHeaders, invitationToken?: string) =>
    request<OnboardingAttempt>('/studio/v1/onboarding-attempts', {
      method: 'POST',
      headers: commandHeaders(command),
      ...(invitationToken ? { body: JSON.stringify({ invitation_token: invitationToken }) } : {}),
    }),

  recordAdultEligibility: (attemptId: string, declaredAdult: boolean, command: CommandHeaders) =>
    request<AdultEligibilityEvidence>(
      `/studio/v1/onboarding-attempts/${attemptId}/eligibility-evidence`,
      {
        method: 'POST',
        headers: commandHeaders(command),
        body: JSON.stringify({ declared_adult: declaredAdult }),
      },
    ),

  completeOnboarding: (attemptId: string, body: Completion, command: CommandHeaders) =>
    request<AllfitV1Schemas['StudioOnboardingCompletionResult']>(
      `/studio/v1/onboarding-attempts/${attemptId}/completion`,
      {
        method: 'POST',
        headers: commandHeaders(command),
        body: JSON.stringify(body),
      },
    ),

  memberships: (signal?: AbortSignal) =>
    request<AllfitV1Schemas['StudioMembershipList']>(
      '/studio/v1/me/memberships',
      signal ? { signal } : {},
    ),

  organizationTypes: (signal?: AbortSignal) =>
    request<AllfitV1Schemas['OrganizationTypeList']>(
      '/studio/v1/organization-types',
      signal ? { signal } : {},
    ),

  me: (signal?: AbortSignal) => request<StudioMe>('/studio/v1/me', signal ? { signal } : {}),

  professionalSpecialties: (signal?: AbortSignal) =>
    request<AllfitV1Schemas['ProfessionalSpecialtyList']>(
      '/studio/v1/professional-specialties',
      signal ? { signal } : {},
    ),

  professionalCredentialTypes: (signal?: AbortSignal) =>
    request<AllfitV1Schemas['ProfessionalCredentialTypeList']>(
      '/studio/v1/professional-credential-types',
      signal ? { signal } : {},
    ),

  updateProfessionalProfile: (
    body: ProfessionalProfilePut,
    command: CommandHeaders,
    signal?: AbortSignal,
  ) =>
    request<ProfessionalProfile>('/studio/v1/me/professional-profile', {
      method: 'PUT',
      headers: commandHeaders(command),
      body: JSON.stringify(body),
      ...(signal ? { signal } : {}),
    }),

  declareProfessionalCredential: (
    body: ProfessionalCredentialWrite,
    command: CommandHeaders,
    signal?: AbortSignal,
  ) =>
    request<ProfessionalCredential>('/studio/v1/me/professional-credentials', {
      method: 'POST',
      headers: commandHeaders(command),
      body: JSON.stringify(body),
      ...(signal ? { signal } : {}),
    }),

  reviseProfessionalCredential: (
    credentialId: string,
    body: ProfessionalCredentialWrite,
    command: CommandHeaders,
    signal?: AbortSignal,
  ) =>
    request<ProfessionalCredential>(
      `/studio/v1/me/professional-credentials/${credentialId}/revisions`,
      {
        method: 'POST',
        headers: commandHeaders(command),
        body: JSON.stringify(body),
        ...(signal ? { signal } : {}),
      },
    ),

  retireProfessionalCredential: (
    credentialId: string,
    command: CommandHeaders,
    signal?: AbortSignal,
  ) =>
    request<ProfessionalCredential>(
      `/studio/v1/me/professional-credentials/${credentialId}/retirement`,
      {
        method: 'POST',
        headers: commandHeaders(command),
        ...(signal ? { signal } : {}),
      },
    ),

  createOrganization: (body: OrganizationCreate, command: CommandHeaders) =>
    request<OrganizationCreated>('/studio/v1/organizations', {
      method: 'POST',
      headers: commandHeaders(command),
      body: JSON.stringify(body),
    }),

  createTeamInvitation: (
    organizationId: string,
    body: TeamInvitationCreate,
    command: CommandHeaders,
    signal?: AbortSignal,
  ) =>
    request<TeamInvitation>(`/studio/v1/organizations/${organizationId}/invitations`, {
      method: 'POST',
      headers: commandHeaders(command),
      body: JSON.stringify(body),
      ...(signal ? { signal } : {}),
    }),

  resolveTeamInvitation: (token: string) =>
    request<TeamInvitationPresentation>('/studio/v1/invitations/resolve', {
      method: 'POST',
      body: JSON.stringify({ token }),
    }),

  decideTeamInvitation: (body: TeamInvitationDecisionCreate, command: CommandHeaders) =>
    request<TeamInvitationDecisionResult>(
      '/studio/v1/invitations/decisions',
      {
        method: 'POST',
        headers: commandHeaders(command),
        body: JSON.stringify(body),
      },
      telemetryContext(invitationDecisionFlowStep(body.decisions[0]?.decision)),
    ),

  // An organization Allfit hands over arrives at the same invitation page, so the page
  // asks for it when the token is not a team invitation.
  resolveOwnershipInvitation: (token: string) =>
    request<OwnershipInvitationPresentation>('/studio/v1/ownership-invitations/resolve', {
      method: 'POST',
      body: JSON.stringify({ token }),
    }),

  decideOwnershipInvitation: (body: OwnershipInvitationDecisionCreate, command: CommandHeaders) =>
    request<OwnershipInvitationDecisionResult>(
      '/studio/v1/ownership-invitations/decisions',
      {
        method: 'POST',
        headers: commandHeaders(command),
        body: JSON.stringify(body),
      },
      telemetryContext(invitationDecisionFlowStep(body.decision)),
    ),

  teamInvitations: (
    organizationId: string,
    options: { status?: TeamInvitationStatus; limit?: number; cursor?: string } = {},
    signal?: AbortSignal,
  ) => {
    const query = new URLSearchParams()
    if (options.status) query.set('status', options.status)
    if (options.limit) query.set('limit', String(options.limit))
    if (options.cursor) query.set('cursor', options.cursor)
    const suffix = query.size ? `?${query.toString()}` : ''
    return request<TeamInvitationPage>(
      `/studio/v1/organizations/${organizationId}/invitations${suffix}`,
      signal ? { signal } : {},
    )
  },

  organizationMemberships: (
    organizationId: string,
    options: { status?: OrganizationMembershipStatus; limit?: number; cursor?: string } = {},
    signal?: AbortSignal,
  ) => {
    const query = new URLSearchParams()
    if (options.status) query.set('status', options.status)
    if (options.limit) query.set('limit', String(options.limit))
    if (options.cursor) query.set('cursor', options.cursor)
    const suffix = query.size ? `?${query.toString()}` : ''
    return request<OrganizationMembershipPage>(
      `/studio/v1/organizations/${organizationId}/memberships${suffix}`,
      {
        cache: 'no-store',
        ...(signal ? { signal } : {}),
      },
    )
  },

  /*
   * The two reads the content screen is built on (OP-PLN-019 and OP-PLN-020).
   * Both are organization-scoped in PostgreSQL, so nothing here filters: a
   * second place for that rule is a second place for it to be wrong.
   */
  organizationSessionTemplates: (
    organizationId: string,
    limit: number,
    signal?: AbortSignal,
    cursor?: string,
  ) => {
    const query = new URLSearchParams({ limit: String(limit) })
    if (cursor) query.set('cursor', cursor)
    return request<SessionTemplatePage>(
      `/studio/v1/organizations/${organizationId}/session-templates?${query.toString()}`,
      signal ? { signal } : {},
    )
  },

  /**
   * OP-PLN-023: the draft in the shape it is edited in, with the ETag the
   * next save has to send. Another organization's draft and one that never
   * existed answer the same 404.
   */
  organizationSessionTemplateDraft: (
    organizationId: string,
    templateId: string,
    signal?: AbortSignal,
  ) =>
    request<SessionTemplateDraft>(
      `/studio/v1/organizations/${organizationId}/session-templates/${templateId}/draft`,
      { cache: 'no-store', ...(signal ? { signal } : {}) },
    ),

  /**
   * OP-PLN-002. Replaces the whole draft. The ETag goes in `If-Match`, which the
   * route requires (428 without it), unlike the site edit below that moved its
   * revision into the body: the API is served by the load balancer directly
   * (`behind_cdn = false`), so no edge answers the condition before the route.
   * A stale ETag is a `409` carrying the current draft.
   */
  replaceOrganizationSessionTemplateDraft: (
    organizationId: string,
    templateId: string,
    content: SessionTemplateDraftContent,
    etag: string,
    command: CommandHeaders,
    signal?: AbortSignal,
  ) =>
    request<SessionTemplateDraft>(
      `/studio/v1/organizations/${organizationId}/session-templates/${templateId}/draft`,
      {
        method: 'PUT',
        headers: { ...commandHeaders(command), 'If-Match': etag },
        body: JSON.stringify(content),
        ...(signal ? { signal } : {}),
      },
    ),

  /**
   * OP-PLN-003. Publishes the draft as the server has it saved, conditioned on
   * its ETag. No body: one is refused with 415. An incomplete draft answers 422
   * listing what is missing; the same content as the newest version answers
   * that version rather than a new one.
   */
  publishOrganizationSessionTemplateVersion: (
    organizationId: string,
    templateId: string,
    etag: string,
    command: CommandHeaders,
    signal?: AbortSignal,
  ) =>
    request<SessionTemplateVersion>(
      `/studio/v1/organizations/${organizationId}/session-templates/${templateId}/versions`,
      {
        method: 'POST',
        headers: { ...commandHeaders(command), 'If-Match': etag },
        ...(signal ? { signal } : {}),
      },
    ),

  /**
   * OP-CAT-008. Every published global activity type with the family of target
   * its steps take, read under `/studio/v1` like the disciplines.
   */
  catalogActivityTypes: (signal?: AbortSignal) =>
    request<CatalogActivityTypeList>('/studio/v1/catalog/activity-types', {
      cache: 'no-store',
      ...(signal ? { signal } : {}),
    }),

  /** OP-CAT-010: one movement the organization can use, to name a step. */
  organizationMovement: (organizationId: string, movementId: string, signal?: AbortSignal) =>
    request<OrganizationMovement>(
      `/studio/v1/organizations/${organizationId}/movements/${movementId}`,
      { cache: 'no-store', ...(signal ? { signal } : {}) },
    ),

  /**
   * OP-CAT-001. A movement of the organization's own, published at once and
   * seen by nobody else. The server takes the command id as the movement's id.
   * A repeated name is a `409` whose first issue is `name-taken`.
   */
  createOrganizationMovement: (
    organizationId: string,
    body: OrganizationMovementCreate,
    command: CommandHeaders,
    signal?: AbortSignal,
  ) =>
    request<OrganizationMovement>(`/studio/v1/organizations/${organizationId}/movements`, {
      method: 'POST',
      headers: commandHeaders(command),
      body: JSON.stringify(body),
      ...(signal ? { signal } : {}),
    }),

  /**
   * OP-CAT-002. A partial edit: the fields present replace what was there, and
   * `expected_revision` names the revision read. A newer one answers `409
   * stale-draft`; a rename a published version forbids, `409` `movement-in-use`.
   */
  updateOrganizationMovement: (
    organizationId: string,
    movementId: string,
    body: OrganizationMovementUpdate,
    command: CommandHeaders,
    signal?: AbortSignal,
  ) =>
    request<OrganizationMovement>(
      `/studio/v1/organizations/${organizationId}/movements/${movementId}`,
      {
        method: 'PATCH',
        headers: commandHeaders(command),
        body: JSON.stringify(body),
        ...(signal ? { signal } : {}),
      },
    ),

  /**
   * OP-CAT-003. Owners and admins only (`archive_movements`); a coach is `403`.
   * No body. It converges: archiving it again answers the archived movement,
   * and there is no way back.
   */
  archiveOrganizationMovement: (
    organizationId: string,
    movementId: string,
    command: CommandHeaders,
    signal?: AbortSignal,
  ) =>
    request<OrganizationMovement>(
      `/studio/v1/organizations/${organizationId}/movements/${movementId}/archival`,
      { method: 'POST', headers: commandHeaders(command), ...(signal ? { signal } : {}) },
    ),

  organizationPrograms: (
    organizationId: string,
    limit: number,
    signal?: AbortSignal,
    cursor?: string,
  ) => {
    const query = new URLSearchParams({ limit: String(limit) })
    if (cursor) query.set('cursor', cursor)
    return request<ProgramPage>(
      `/studio/v1/organizations/${organizationId}/programs?${query.toString()}`,
      signal ? { signal } : {},
    )
  },

  /*
   * OP-PLN-006. The program belongs to the organization, the caller is its
   * author, and its first draft opens empty in the same transaction.
   */
  createOrganizationProgram: (
    organizationId: string,
    body: ProgramCreate,
    command: CommandHeaders,
    signal?: AbortSignal,
  ) =>
    request<Program>(`/studio/v1/organizations/${organizationId}/programs`, {
      method: 'POST',
      headers: commandHeaders(command),
      body: JSON.stringify(body),
      ...(signal ? { signal } : {}),
    }),

  /**
   * OP-PLN-007. Replaces the whole draft under its ETag, like a template's: 428
   * without `If-Match`, and a stale one is a `409` carrying the current draft.
   * There is no read of a program draft on its own; the listing carries it.
   */
  replaceOrganizationProgramDraft: (
    organizationId: string,
    programId: string,
    content: ProgramDraftContent,
    etag: string,
    command: CommandHeaders,
    signal?: AbortSignal,
  ) =>
    request<ProgramDraft>(
      `/studio/v1/organizations/${organizationId}/programs/${programId}/draft`,
      {
        method: 'PUT',
        headers: { ...commandHeaders(command), 'If-Match': etag },
        body: JSON.stringify(content),
        ...(signal ? { signal } : {}),
      },
    ),

  /**
   * OP-PLN-004. Replaces the template's draft with one of its published
   * versions and records which. Conditioned on the draft's ETag like a save,
   * with no body. A retired version, or another organization's, answers 404.
   */
  deriveOrganizationSessionTemplateVersion: (
    organizationId: string,
    templateId: string,
    versionNumber: number,
    etag: string,
    command: CommandHeaders,
    signal?: AbortSignal,
  ) =>
    request<SessionTemplateDraft>(
      `/studio/v1/organizations/${organizationId}/session-templates/${templateId}/versions/${versionNumber}/derivation`,
      {
        method: 'POST',
        headers: { ...commandHeaders(command), 'If-Match': etag },
        ...(signal ? { signal } : {}),
      },
    ),

  /**
   * OP-PLN-005. Owners and admins only, by role; a coach is `403`. No body. It
   * converges, and there is no way back. Nothing that already uses the version
   * changes: only new content can no longer take it.
   */
  deprecateOrganizationSessionTemplateVersion: (
    organizationId: string,
    templateId: string,
    versionNumber: number,
    command: CommandHeaders,
    signal?: AbortSignal,
  ) =>
    request<SessionTemplateVersion>(
      `/studio/v1/organizations/${organizationId}/session-templates/${templateId}/versions/${versionNumber}/deprecation`,
      { method: 'POST', headers: commandHeaders(command), ...(signal ? { signal } : {}) },
    ),

  /**
   * OP-PLN-021. One published template version, whole. Another organization's
   * version and one that never existed answer the same 404.
   */
  organizationSessionTemplateVersion: (
    organizationId: string,
    templateId: string,
    versionNumber: number,
    signal?: AbortSignal,
  ) =>
    request<SessionTemplateVersion>(
      `/studio/v1/organizations/${organizationId}/session-templates/${templateId}/versions/${versionNumber}`,
      signal ? { signal } : {},
    ),

  /**
   * OP-PLN-009. Owners and admins only, by role. No body. It converges, has no
   * way back, and cancels nothing: only new assignments stop.
   */
  deprecateOrganizationProgramVersion: (
    organizationId: string,
    programId: string,
    versionNumber: number,
    command: CommandHeaders,
    signal?: AbortSignal,
  ) =>
    request<ProgramVersion>(
      `/studio/v1/organizations/${organizationId}/programs/${programId}/versions/${versionNumber}/deprecation`,
      { method: 'POST', headers: commandHeaders(command), ...(signal ? { signal } : {}) },
    ),

  /** OP-PLN-021. One published program version, whole; the read is audited. */
  organizationProgramVersion: (
    organizationId: string,
    programId: string,
    versionNumber: number,
    signal?: AbortSignal,
  ) =>
    request<ProgramVersion>(
      `/studio/v1/organizations/${organizationId}/programs/${programId}/versions/${versionNumber}`,
      signal ? { signal } : {},
    ),

  /**
   * OP-PLN-008. Publishes the program draft as the server has it saved, under
   * its ETag and with no body (415 with one). An empty draft answers 422; the
   * same content as the newest version answers that version again.
   */
  publishOrganizationProgramVersion: (
    organizationId: string,
    programId: string,
    etag: string,
    command: CommandHeaders,
    signal?: AbortSignal,
  ) =>
    request<ProgramVersion>(
      `/studio/v1/organizations/${organizationId}/programs/${programId}/versions`,
      {
        method: 'POST',
        headers: { ...commandHeaders(command), 'If-Match': etag },
        ...(signal ? { signal } : {}),
      },
    ),

  /*
   * OP-PLN-001. The template belongs to the organization; the server records the
   * caller as its author and opens its first draft in the same transaction.
   */
  createOrganizationSessionTemplate: (
    organizationId: string,
    body: SessionTemplateCreate,
    command: CommandHeaders,
    signal?: AbortSignal,
  ) =>
    request<SessionTemplate>(`/studio/v1/organizations/${organizationId}/session-templates`, {
      method: 'POST',
      headers: commandHeaders(command),
      body: JSON.stringify(body),
      ...(signal ? { signal } : {}),
    }),

  /**
   * `OP-CAT-007`. The disciplines Backoffice has published, read under
   * `/studio/v1` for the same reason as the information categories: the session
   * cookie travels nowhere else. Empty until one is published, and then no
   * template can be created.
   */
  /*
   * OP-CAT-009. The global library and the organization's own in one list, each
   * saying whose it is. Archived movements come only when asked for.
   */
  organizationMovements: (
    organizationId: string,
    options: {
      search?: string
      discipline?: string
      includeArchived?: boolean
      limit?: number
      cursor?: string
    } = {},
    signal?: AbortSignal,
  ) => {
    const query = new URLSearchParams()
    if (options.search) query.set('q', options.search)
    if (options.discipline) query.set('discipline', options.discipline)
    if (options.includeArchived) query.set('include_archived', 'true')
    if (options.limit) query.set('limit', String(options.limit))
    if (options.cursor) query.set('cursor', options.cursor)
    const suffix = query.size ? `?${query.toString()}` : ''
    return request<StudioMovementPage>(
      `/studio/v1/organizations/${organizationId}/movements${suffix}`,
      { cache: 'no-store', ...(signal ? { signal } : {}) },
    )
  },

  catalogDisciplines: (signal?: AbortSignal) =>
    request<CatalogDisciplineList>('/studio/v1/catalog/disciplines', {
      cache: 'no-store',
      ...(signal ? { signal } : {}),
    }),

  organizationClients: (
    organizationId: string,
    options: {
      status?: ClientDirectoryGroup
      limit?: number
      cursor?: string
      search?: string
    } = {},
    signal?: AbortSignal,
  ) => {
    const query = new URLSearchParams()
    if (options.status) query.set('status', options.status)
    // `q` on the wire, because that is what the route reads.
    if (options.search) query.set('q', options.search)
    if (options.limit) query.set('limit', String(options.limit))
    if (options.cursor) query.set('cursor', options.cursor)
    const suffix = query.size ? `?${query.toString()}` : ''
    return request<ClientDirectoryPage>(
      `/studio/v1/organizations/${organizationId}/clients${suffix}`,
      {
        cache: 'no-store',
        ...(signal ? { signal } : {}),
      },
    )
  },

  authorizedScopes: (
    organizationId: string,
    options: { limit?: number; cursor?: string } = {},
    signal?: AbortSignal,
  ) => {
    const query = new URLSearchParams()
    if (options.limit) query.set('limit', String(options.limit))
    if (options.cursor) query.set('cursor', options.cursor)
    const suffix = query.size ? `?${query.toString()}` : ''
    return request<AuthorizedScopePage>(
      `/studio/v1/organizations/${organizationId}/authorized-scopes${suffix}`,
      {
        cache: 'no-store',
        ...(signal ? { signal } : {}),
      },
    )
  },

  organizationSubscriptions: (
    organizationId: string,
    options: { status?: SubscriptionStatus; limit?: number; cursor?: string } = {},
    signal?: AbortSignal,
  ) => {
    const query = new URLSearchParams()
    if (options.status) query.set('status', options.status)
    if (options.limit) query.set('limit', String(options.limit))
    if (options.cursor) query.set('cursor', options.cursor)
    const suffix = query.size ? `?${query.toString()}` : ''
    return request<OrganizationSubscriptionPage>(
      `/studio/v1/organizations/${organizationId}/subscriptions${suffix}`,
      {
        cache: 'no-store',
        ...(signal ? { signal } : {}),
      },
    )
  },

  /**
   * OP-PAY-006. Every plan the organization sells, drafts included, published
   * first and then by name. The whole team reads it: a price is nobody's
   * personal data.
   */
  organizationPlans: (
    organizationId: string,
    limit: number,
    signal?: AbortSignal,
    cursor?: string,
  ) => {
    const query = new URLSearchParams({ limit: String(limit) })
    if (cursor) query.set('cursor', cursor)
    return request<OrganizationPlanPage>(
      `/studio/v1/organizations/${organizationId}/plans?${query.toString()}`,
      { cache: 'no-store', ...(signal ? { signal } : {}) },
    )
  },

  /** OP-PAY-002. A plan with a name and no price; owner and admin only. */
  createOrganizationPlan: (
    organizationId: string,
    body: { name: string },
    command: CommandHeaders,
    signal?: AbortSignal,
  ) =>
    request<OrganizationPlan>(`/studio/v1/organizations/${organizationId}/plans`, {
      method: 'POST',
      headers: commandHeaders(command),
      body: JSON.stringify(body),
      ...(signal ? { signal } : {}),
    }),

  /** OP-PAY-003. A draft and a plan on sale are renamed alike; the last write wins. */
  renameOrganizationPlan: (
    organizationId: string,
    planId: string,
    body: { name: string },
    command: CommandHeaders,
    signal?: AbortSignal,
  ) =>
    request<OrganizationPlan>(`/studio/v1/organizations/${organizationId}/plans/${planId}`, {
      method: 'PATCH',
      headers: commandHeaders(command),
      body: JSON.stringify(body),
      ...(signal ? { signal } : {}),
    }),

  /**
   * OP-PAY-004. Puts a price on sale and retires the previous one in the same command.
   * The price already on sale answers `200` with the plan unchanged.
   */
  publishOrganizationPlanVersion: (
    organizationId: string,
    planId: string,
    body: PlanVersionPublish,
    command: CommandHeaders,
    signal?: AbortSignal,
  ) =>
    request<OrganizationPlan>(
      `/studio/v1/organizations/${organizationId}/plans/${planId}/versions`,
      {
        method: 'POST',
        headers: commandHeaders(command),
        body: JSON.stringify(body),
        ...(signal ? { signal } : {}),
      },
    ),

  /**
   * OP-PAY-005. Takes one version off sale, without a body. Nobody subscribed to it is
   * cancelled, suspended or moved; retiring a version already replaced changes nothing.
   */
  deprecateOrganizationPlanVersion: (
    organizationId: string,
    planId: string,
    planVersionId: string,
    command: CommandHeaders,
    signal?: AbortSignal,
  ) =>
    request<OrganizationPlan>(
      `/studio/v1/organizations/${organizationId}/plans/${planId}/versions/${planVersionId}/deprecation`,
      {
        method: 'POST',
        headers: commandHeaders(command),
        ...(signal ? { signal } : {}),
      },
    ),

  /*
   * The three transitions carry no body: the subscription is in the path and there is
   * nothing to choose. They are separate methods rather than one with a verb argument so
   * that a typo cannot send `terminate` where `suspend` was meant and get a 404 instead
   * of a type error.
   */
  suspendSubscription: (organizationId: string, subscriptionId: string, command: CommandHeaders) =>
    request<SubscriptionTransition>(
      `/studio/v1/organizations/${organizationId}/subscriptions/${subscriptionId}/suspension`,
      { method: 'POST', headers: commandHeaders(command) },
    ),

  reactivateSubscription: (
    organizationId: string,
    subscriptionId: string,
    command: CommandHeaders,
  ) =>
    request<SubscriptionTransition>(
      `/studio/v1/organizations/${organizationId}/subscriptions/${subscriptionId}/reactivation`,
      { method: 'POST', headers: commandHeaders(command) },
    ),

  endSubscription: (organizationId: string, subscriptionId: string, command: CommandHeaders) =>
    request<SubscriptionTransition>(
      `/studio/v1/organizations/${organizationId}/subscriptions/${subscriptionId}/termination`,
      { method: 'POST', headers: commandHeaders(command) },
    ),

  relationshipState: (organizationId: string, relationshipId: string, signal?: AbortSignal) =>
    request<RelationshipState>(
      `/studio/v1/organizations/${organizationId}/relationships/${relationshipId}`,
      {
        cache: 'no-store',
        ...(signal ? { signal } : {}),
      },
    ),

  /**
   * `OP-REL-019`. An index of what this caller may read about her, never the
   * data itself: opening it reads nothing of hers and records no access, and
   * each operation it names records its own.
   *
   * Keyed by the person and not by the relationship, which is why it does not
   * sit beside `relationshipState` above.
   */
  clientCard: (organizationId: string, personId: string, signal?: AbortSignal) =>
    request<ClientCard>(`/studio/v1/organizations/${organizationId}/clients/${personId}`, {
      cache: 'no-store',
      ...(signal ? { signal } : {}),
    }),

  /**
   * `OP-IDN-018`. The training claims she shares with this caller, each with
   * where it came from. 404 for anybody who does not attend her; 403 when she
   * shares nothing, and that refusal is recorded like a read.
   */
  clientTrainingProfile: (organizationId: string, personId: string, signal?: AbortSignal) =>
    request<ClientTrainingProfile>(
      `/studio/v1/organizations/${organizationId}/clients/${personId}/profile`,
      {
        cache: 'no-store',
        ...(signal ? { signal } : {}),
      },
    ),

  /**
   * `OP-EXE-017`. Her completed, valid sessions newest first, a page at a time,
   * mixing what she trained with this gym and what she trained alone. 404 for
   * anybody who does not attend her; an empty page when she shares neither
   * category, and that refusal is recorded like a read.
   */
  clientExecutions: (
    organizationId: string,
    personId: string,
    query: { limit: number; cursor?: string },
    signal?: AbortSignal,
  ) => {
    const search = new URLSearchParams({ limit: String(query.limit) })
    if (query.cursor) search.set('cursor', query.cursor)
    return request<AuthorizedExecutionPage>(
      `/studio/v1/organizations/${organizationId}/clients/${personId}/executions?${search}`,
      {
        cache: 'no-store',
        ...(signal ? { signal } : {}),
      },
    )
  },

  /**
   * `OP-EXE-018`. One of her sessions with what was recorded in it: sets, laps,
   * intervals, rounds and holds, plus what this relationship's coaches noted.
   *
   * **It never carries heart rate, pain, body weight or the capture device.**
   * Pain and weight are read through their own categories, so their absence
   * here is the contract and not a gap to fill.
   *
   * `403` only when she shares neither training category; every other reason a
   * coach may not see a session — hidden, unfinished, annulled, another
   * relationship's, another person's, or none at all — is the same `404`.
   */
  clientExecution: (
    organizationId: string,
    personId: string,
    executionId: string,
    signal?: AbortSignal,
  ) =>
    request<AuthorizedExecution>(
      `/studio/v1/organizations/${organizationId}/clients/${personId}/executions/${executionId}`,
      {
        cache: 'no-store',
        ...(signal ? { signal } : {}),
      },
    ),

  /**
   * `OP-PLN-018`. The programs this relationship gave her, newest first, each
   * with the calendar planted for it. Never what she took on her own nor what
   * another organization gave her — the operation is keyed by the relationship,
   * which is what makes that true at the source instead of by filtering here.
   *
   * `403` is only ever `scope-required`: she stopped sharing her training, or
   * never shared it. The attempt is recorded either way.
   */
  relationshipAssignments: (
    organizationId: string,
    relationshipId: string,
    query: { limit: number; cursor?: string },
    signal?: AbortSignal,
  ) => {
    const search = new URLSearchParams({ limit: String(query.limit) })
    if (query.cursor) search.set('cursor', query.cursor)
    return request<RelationshipAssignmentPage>(
      `/studio/v1/organizations/${organizationId}/relationships/${relationshipId}/assignments?${search}`,
      {
        cache: 'no-store',
        ...(signal ? { signal } : {}),
      },
    )
  },

  /**
   * `OP-PLN-010`. Gives her a published version of one of this organization's
   * programs through the relationship, and plants its calendar in the same
   * transaction (ADR-032): a finite version whole, an open-ended one its first
   * week.
   *
   * Needs `relationship_training` at `contribute`, so `read` answers 403
   * `scope-required`; staff and administrators who do not coach her answer 403
   * `forbidden`, and a paused service 409. Three different `422` cases arrive
   * as issues: the version cannot be assigned, the day already passed in her
   * zone, or no zone is known for her.
   */
  assignProgramVersion: (
    organizationId: string,
    relationshipId: string,
    body: ProgramAssignmentCreate,
    command: CommandHeaders,
    signal?: AbortSignal,
  ) =>
    request<ProgramAssignment>(
      `/studio/v1/organizations/${organizationId}/relationships/${relationshipId}/assignments`,
      {
        method: 'POST',
        headers: commandHeaders(command),
        body: JSON.stringify(body),
        ...(signal ? { signal } : {}),
      },
    ),

  /**
   * `OP-EXE-019`. How her training is going, computed when it is read from the
   * sessions this caller may see. The three query parameters are required by the
   * contract: the zone decides which week or month a session falls in, so the
   * same sessions answer different periods under different zones.
   */
  clientProgress: (
    organizationId: string,
    personId: string,
    query: { timezone: string; period: ProgressPeriod; count: number },
    signal?: AbortSignal,
  ) => {
    const search = new URLSearchParams({
      timezone: query.timezone,
      period: query.period,
      count: String(query.count),
    })
    return request<ClientProgress>(
      `/studio/v1/organizations/${organizationId}/clients/${personId}/progress?${search}`,
      {
        cache: 'no-store',
        ...(signal ? { signal } : {}),
      },
    )
  },

  relationshipHistory: (
    organizationId: string,
    relationshipId: string,
    query: { limit: number; cursor?: string },
    signal?: AbortSignal,
  ) => {
    const search = new URLSearchParams({ limit: String(query.limit) })
    if (query.cursor) search.set('cursor', query.cursor)
    return request<RelationshipHistoryPage>(
      `/studio/v1/organizations/${organizationId}/relationships/${relationshipId}/events?${search}`,
      {
        cache: 'no-store',
        ...(signal ? { signal } : {}),
      },
    )
  },

  /**
   * `OP-PRV-025`. Every case of the organization for `manage_historical_access`,
   * only the ones that authorize the caller for anybody else. Newest first; a case
   * whose time ran out reads `expired` before anyone closes it.
   */
  historicalAccessCases: (
    organizationId: string,
    query: { limit: number; cursor?: string },
    signal?: AbortSignal,
  ) => {
    const search = new URLSearchParams({ limit: String(query.limit) })
    if (query.cursor) search.set('cursor', query.cursor)
    return request<HistoricalAccessCasePage>(
      `/studio/v1/organizations/${organizationId}/historical-access-cases?${search}`,
      {
        cache: 'no-store',
        ...(signal ? { signal } : {}),
      },
    )
  },

  /**
   * `OP-PRV-018`. Needs a sign-in at most ten minutes old: 403
   * `reauthentication-required` otherwise. 409 is either nothing left frozen or an
   * equal case already open; 422 a member who cannot hold the case.
   */
  openHistoricalAccessCase: (
    organizationId: string,
    body: HistoricalAccessCaseCreate,
    command: CommandHeaders,
    signal?: AbortSignal,
  ) =>
    request<HistoricalAccessCase>(
      `/studio/v1/organizations/${organizationId}/historical-access-cases`,
      {
        method: 'POST',
        headers: commandHeaders(command),
        body: JSON.stringify(body),
        ...(signal ? { signal } : {}),
      },
    ),

  /**
   * `OP-PRV-019`. No body and no recent sign-in. It converges: a closed case answers
   * as it stands, and one whose time ran out closes as expired.
   */
  closeHistoricalAccessCase: (
    organizationId: string,
    caseId: string,
    command: CommandHeaders,
    signal?: AbortSignal,
  ) =>
    request<HistoricalAccessCase>(
      `/studio/v1/organizations/${organizationId}/historical-access-cases/${caseId}/closure`,
      {
        method: 'POST',
        headers: commandHeaders(command),
        ...(signal ? { signal } : {}),
      },
    ),

  /**
   * `OP-PRV-020`. The relationship as the case froze it: whose it was, the cut,
   * the case, and the categories that stayed readable. Only the member the case
   * names, while it is open, with a sign-in at most ten minutes old; anything
   * else reads 404 and is recorded against her.
   */
  historicalRelationship: (
    organizationId: string,
    relationshipId: string,
    caseId: string,
    signal?: AbortSignal,
  ) =>
    request<HistoricalRelationship>(
      `/studio/v1/organizations/${organizationId}/historical-relationships/${relationshipId}`,
      {
        cache: 'no-store',
        headers: historicalCaseHeaders(caseId),
        ...(signal ? { signal } : {}),
      },
    ),

  /** `OP-PRV-020`. Her sessions by the cut, newest first; empty with no training frozen. */
  frozenExecutions: (
    organizationId: string,
    relationshipId: string,
    caseId: string,
    query: { limit: number; cursor?: string },
    signal?: AbortSignal,
  ) =>
    request<FrozenExecutionPage>(
      `/studio/v1/organizations/${organizationId}/historical-relationships/${relationshipId}/executions?${pageSearch(query)}`,
      {
        cache: 'no-store',
        headers: historicalCaseHeaders(caseId),
        ...(signal ? { signal } : {}),
      },
    ),

  /** `OP-PRV-020`. Her measurements by the cut; 403 `scope-required` when not frozen. */
  frozenBodyProgress: (
    organizationId: string,
    relationshipId: string,
    caseId: string,
    query: { limit: number; cursor?: string },
    signal?: AbortSignal,
  ) =>
    request<FrozenBodyProgressPage>(
      `/studio/v1/organizations/${organizationId}/historical-relationships/${relationshipId}/body-progress?${pageSearch(query)}`,
      {
        cache: 'no-store',
        headers: historicalCaseHeaders(caseId),
        ...(signal ? { signal } : {}),
      },
    ),

  /** `OP-NUT-011`. What this relationship proposed by the cut, as it stood then. */
  frozenGoalVersions: (
    organizationId: string,
    relationshipId: string,
    caseId: string,
    query: { limit: number; cursor?: string },
    signal?: AbortSignal,
  ) =>
    request<FrozenNutritionGoalVersionPage>(
      `/studio/v1/organizations/${organizationId}/historical-relationships/${relationshipId}/nutrition/goal-versions?${pageSearch(query)}`,
      {
        cache: 'no-store',
        headers: historicalCaseHeaders(caseId),
        ...(signal ? { signal } : {}),
      },
    ),

  offerableScopes: (signal?: AbortSignal) =>
    request<OfferableScopeCatalog>('/studio/v1/offerable-scopes', {
      cache: 'no-store',
      ...(signal ? { signal } : {}),
    }),

  /**
   * `OP-PRV-022`. The global wording, read under `/studio/v1` because the session
   * cookie travels nowhere else: on `/catalog/v1` it answered 401 and ended the
   * session. Unlike `offerableScopes` it answers before anyone curates the
   * permission catalogue: it reads the wording alone.
   */
  informationCategories: (signal?: AbortSignal) =>
    request<InformationCategoryList>('/studio/v1/catalog/information-categories', {
      cache: 'no-store',
      ...(signal ? { signal } : {}),
    }),

  createClientInvitation: (
    organizationId: string,
    body: ClientInvitationCreate,
    command: CommandHeaders,
  ) =>
    request<ClientInvitation>(`/studio/v1/organizations/${organizationId}/client-invitations`, {
      method: 'POST',
      headers: commandHeaders(command),
      body: JSON.stringify(body),
    }),

  assignRelationshipHolder: (
    organizationId: string,
    relationshipId: string,
    body: RelationshipHolderAssignment,
    command: CommandHeaders,
  ) =>
    request<RelationshipHolder>(
      `/studio/v1/organizations/${organizationId}/relationships/${relationshipId}/professional-assignments`,
      {
        method: 'POST',
        headers: commandHeaders(command),
        body: JSON.stringify(body),
      },
    ),

  reassignRelationshipHolder: (
    organizationId: string,
    relationshipId: string,
    body: RelationshipHolderAssignment,
    command: CommandHeaders,
  ) =>
    request<RelationshipReassignment>(
      `/studio/v1/organizations/${organizationId}/relationships/${relationshipId}/professional-assignments/reassignment`,
      {
        method: 'POST',
        headers: commandHeaders(command),
        body: JSON.stringify(body),
      },
    ),

  proposeRelationshipSubstitution: (
    organizationId: string,
    relationshipId: string,
    body: RelationshipSubstitutionProposalCreate,
    command: CommandHeaders,
  ) =>
    request<RelationshipSubstitutionProposal>(
      `/studio/v1/organizations/${organizationId}/relationships/${relationshipId}/substitutions`,
      {
        method: 'POST',
        headers: commandHeaders(command),
        body: JSON.stringify(body),
      },
    ),

  /**
   * `OP-REL-006`. No body: what the command acts on is entirely in the path, so
   * the request hash that makes it idempotent is derived there too.
   */
  endRelationshipSubstitution: (
    organizationId: string,
    relationshipId: string,
    substitutionId: string,
    command: CommandHeaders,
  ) =>
    request<RelationshipSubstitutionTermination>(
      `/studio/v1/organizations/${organizationId}/relationships/${relationshipId}` +
        `/substitutions/${substitutionId}/termination`,
      {
        method: 'POST',
        headers: commandHeaders(command),
      },
    ),

  /**
   * `OP-REL-008`. The body is optional and carries at most a reason: a gym owes
   * the system no justification for ending a relationship.
   */
  terminateRelationship: (
    organizationId: string,
    relationshipId: string,
    body: RelationshipTerminationCreate,
    command: CommandHeaders,
  ) =>
    request<RelationshipTermination>(
      `/studio/v1/organizations/${organizationId}/relationships/${relationshipId}/termination`,
      {
        method: 'POST',
        headers: commandHeaders(command),
        body: JSON.stringify(body),
      },
    ),

  grantMembershipRole: (
    organizationId: string,
    membershipId: string,
    body: OrganizationRoleGrantCreate,
    command: CommandHeaders,
  ) =>
    request<OrganizationRoleGrant>(
      `/studio/v1/organizations/${organizationId}/memberships/${membershipId}/roles`,
      {
        method: 'POST',
        headers: commandHeaders(command),
        body: JSON.stringify(body),
      },
    ),

  /*
   * The role travels in the path, not in a body: `DELETE` is what the contract
   * publishes for `OP-ORG-008`, and a body on a DELETE is ignored by enough
   * intermediaries that it cannot carry the one argument the command needs.
   */
  revokeMembershipRole: (
    organizationId: string,
    membershipId: string,
    roleCode: AssignableOrganizationRoleCode,
    command: CommandHeaders,
  ) =>
    request<OrganizationRoleRevocation>(
      `/studio/v1/organizations/${organizationId}/memberships/${membershipId}/roles/${roleCode}`,
      {
        method: 'DELETE',
        headers: commandHeaders(command),
      },
    ),

  /*
   * No body: the membership and the organization are the whole command, and
   * the contract says so. Converges without effect on a membership that was
   * already terminated.
   */
  terminateMembership: (organizationId: string, membershipId: string, command: CommandHeaders) =>
    request<OrganizationMembershipTermination>(
      `/studio/v1/organizations/${organizationId}/memberships/${membershipId}/termination`,
      {
        method: 'POST',
        headers: commandHeaders(command),
      },
    ),

  /*
   * No membership id in the path, and that is the whole difference: the command
   * resolves your own active membership from the person in the session, so this
   * route cannot be pointed at anybody else.
   */
  resignMembership: (organizationId: string, command: CommandHeaders) =>
    request<OrganizationMembershipResignation>(
      `/studio/v1/organizations/${organizationId}/me/membership/resignation`,
      {
        method: 'POST',
        headers: commandHeaders(command),
      },
    ),

  /*
   * OP-ORG-012. No body: the organization comes from the path and the actor
   * from the session, and one transaction coordinates six domains — so there
   * is nothing to parameterise and nothing partial to undo.
   */
  closeOrganization: (organizationId: string, command: CommandHeaders) =>
    request<OrganizationClosure>(`/studio/v1/organizations/${organizationId}/closure`, {
      method: 'POST',
      headers: commandHeaders(command),
    }),

  organization: (organizationId: string, signal?: AbortSignal) =>
    request<Organization>(`/studio/v1/organizations/${organizationId}`, signal ? { signal } : {}),

  updateOrganization: (
    organizationId: string,
    body: OrganizationUpdate,
    expectedRevision: number,
    command: CommandHeaders,
    signal?: AbortSignal,
  ) =>
    request<Organization>(`/studio/v1/organizations/${organizationId}`, {
      method: 'PATCH',
      headers: commandHeaders(command),
      // The revision in the body, not in `If-Match`, for the reason spelled out
      // on `updateOrganizationSite` below: the Edge answers a conditional write
      // before the function runs.
      body: JSON.stringify({ ...body, expected_revision: expectedRevision }),
      ...(signal ? { signal } : {}),
    }),

  createOrganizationSite: (
    organizationId: string,
    body: OrganizationSiteCreate,
    command: CommandHeaders,
    signal?: AbortSignal,
  ) =>
    request<OrganizationSite>(`/studio/v1/organizations/${organizationId}/sites`, {
      method: 'POST',
      headers: commandHeaders(command),
      body: JSON.stringify(body),
      ...(signal ? { signal } : {}),
    }),

  updateOrganizationSite: (
    organizationId: string,
    siteId: string,
    body: OrganizationSiteUpdate,
    expectedRevision: number,
    command: CommandHeaders,
    signal?: AbortSignal,
  ) =>
    request<OrganizationSite>(`/studio/v1/organizations/${organizationId}/sites/${siteId}`, {
      method: 'PATCH',
      headers: commandHeaders(command),
      /*
       * The revision this edit was based on, in the body and not in `If-Match`.
       * Without it the server answers 428 rather than guessing the screen was
       * current.
       *
       * It used to be a header, and that broke the screen in production: this
       * API is one function mounted at `/`, and Vercel's Edge evaluates
       * conditional requests against that single cache key before the function
       * runs. A write carrying `If-Match` was answered `412` by the Edge after
       * the row had already been written, and with no CORS headers, so this
       * client could not read the refusal and reported a failure for a change
       * that was saved.
       */
      body: JSON.stringify({ ...body, expected_revision: expectedRevision }),
      ...(signal ? { signal } : {}),
    }),

  organizationRoles: (organizationId: string, signal?: AbortSignal) =>
    request<OrganizationRoleCatalog>(
      `/studio/v1/organizations/${organizationId}/roles`,
      signal ? { signal } : {},
    ),

  revokeTeamInvitation: (
    organizationId: string,
    invitationId: string,
    command: CommandHeaders,
    signal?: AbortSignal,
  ) =>
    request<AllfitV1Schemas['TeamInvitationRevoked']>(
      `/studio/v1/organizations/${organizationId}/invitations/${invitationId}/revocation`,
      {
        method: 'POST',
        headers: commandHeaders(command),
        body: JSON.stringify({}),
        ...(signal ? { signal } : {}),
      },
    ),
}

export type { CommandHeaders }

/**
 * The formats live in the contract package because Space needs them too, and an
 * app may never import another app. Only the web sources of randomness and time
 * stay here.
 */
export function newCommand(): CommandHeaders {
  return createCommand(
    { randomBytes: (length) => crypto.getRandomValues(new Uint8Array(length)) },
    Date.now(),
  )
}

interface RequestTelemetryContext {
  flowStep?: 'invitation_accepted' | 'invitation_rejected'
}

async function request<T>(
  path: string,
  init: RequestInit = {},
  telemetry: RequestTelemetryContext = {},
): Promise<T> {
  const response = await fetchApi(path, init, telemetry)
  if (!response.ok) throw await responseError(response)
  return (await response.json()) as T
}

async function fetchApi(
  path: string,
  init: RequestInit = {},
  telemetry: RequestTelemetryContext = {},
): Promise<Response> {
  const startedAt = performance.now()
  const method = requestMethod(init.method)
  const operation = studioOperation(path, method)
  let response: Response | undefined
  try {
    response = await fetch(`${API_URL}${path}`, {
      ...init,
      credentials: 'include',
      headers: {
        Accept: 'application/json',
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        ...init.headers,
      },
    })
    if (response.status === 401) {
      setStudioTelemetryIdentity(null)
      notifyStudioUnauthenticated()
    } else if (response.ok) {
      notifyStudioAuthenticated()
    }
    return response
  } finally {
    if (operation) {
      captureStudioApiRequest({
        operation,
        method,
        durationMs: performance.now() - startedAt,
        ...telemetry,
        ...(response ? { response } : {}),
      })
    }
  }
}

export function invitationDecisionFlowStep(
  decision: string | undefined,
): RequestTelemetryContext['flowStep'] {
  if (decision === 'accepted') return 'invitation_accepted'
  if (decision === 'rejected') return 'invitation_rejected'
  return undefined
}

function telemetryContext(flowStep: RequestTelemetryContext['flowStep']): RequestTelemetryContext {
  return flowStep ? { flowStep } : {}
}

function requestMethod(method: string | undefined): 'DELETE' | 'GET' | 'PATCH' | 'POST' | 'PUT' {
  return method === 'DELETE' || method === 'PATCH' || method === 'POST' || method === 'PUT'
    ? method
    : 'GET'
}

function studioOperation(
  path: string,
  method: 'DELETE' | 'GET' | 'PATCH' | 'POST' | 'PUT',
): ClientOperation | undefined {
  const pathname = path.split('?')[0] ?? ''
  const exact: Record<string, ClientOperation> = {
    '/studio/v1/session': 'studio.session',
    '/studio/v1/entry-context': 'studio.entry_context',
    '/studio/v1/onboarding-attempts': 'studio.onboarding.start',
    '/studio/v1/me/memberships': 'studio.memberships',
    '/studio/v1/organization-types': 'studio.catalog.organization_types',
    '/studio/v1/me': 'studio.me',
    '/studio/v1/professional-specialties': 'studio.catalog.professional_specialties',
    '/studio/v1/professional-credential-types': 'studio.catalog.credential_types',
    '/studio/v1/me/professional-profile': 'studio.professional.profile_update',
    '/studio/v1/me/professional-credentials': 'studio.professional.credential_declare',
    '/studio/v1/organizations': 'studio.organization.create',
    '/studio/v1/invitations/resolve': 'studio.invitation.resolve',
    '/studio/v1/invitations/decisions': 'studio.invitation.decide',
    '/studio/v1/ownership-invitations/resolve': 'studio.invitation.resolve',
    '/studio/v1/ownership-invitations/decisions': 'studio.invitation.decide',
  }
  if (exact[pathname]) return exact[pathname]
  if (/^\/studio\/v1\/onboarding-attempts\/[^/]+\/eligibility-evidence$/.test(pathname)) {
    return 'studio.onboarding.eligibility'
  }
  if (/^\/studio\/v1\/onboarding-attempts\/[^/]+\/completion$/.test(pathname)) {
    return 'studio.onboarding.complete'
  }
  if (/^\/studio\/v1\/me\/professional-credentials\/[^/]+\/revisions$/.test(pathname)) {
    return 'studio.professional.credential_revise'
  }
  if (/^\/studio\/v1\/me\/professional-credentials\/[^/]+\/retirement$/.test(pathname)) {
    return 'studio.professional.credential_retire'
  }
  if (/^\/studio\/v1\/organizations\/[^/]+\/memberships$/.test(pathname)) {
    return 'studio.organization.memberships'
  }
  if (/^\/studio\/v1\/organizations\/[^/]+\/roles$/.test(pathname)) {
    return 'studio.catalog.organization_roles'
  }
  if (/^\/studio\/v1\/organizations\/[^/]+\/invitations\/[^/]+\/revocation$/.test(pathname)) {
    return 'studio.invitation.revoke'
  }
  if (/^\/studio\/v1\/organizations\/[^/]+\/invitations$/.test(pathname)) {
    return method === 'POST' ? 'studio.invitation.create' : 'studio.invitation.list'
  }
  return undefined
}

async function responseError(response: Response): Promise<StudioApiError> {
  const payload = await response.json().catch(() => undefined)
  return new StudioApiError(
    response.status,
    errorCode(payload) ?? problemCode(payload) ?? `http-${response.status}`,
    errorDetail(payload),
    { issues: problemIssues(payload), currentState: problemField(payload, 'current_state') },
  )
}

/** An RFC 9457 problem is named by the last segment of its `type`. */
function problemCode(value: unknown): string | undefined {
  const type = problemField(value, 'type')
  if (typeof type !== 'string') return undefined
  const code = type.split('/').at(-1)
  return code ? code : undefined
}

function problemIssues(value: unknown): StudioApiIssue[] {
  const errors = problemField(value, 'errors')
  if (!Array.isArray(errors)) return []
  return errors.flatMap((issue: unknown) => {
    if (!issue || typeof issue !== 'object') return []
    const code = 'code' in issue ? issue.code : undefined
    const path = 'path' in issue ? issue.path : undefined
    return typeof code === 'string' ? [{ code, path: typeof path === 'string' ? path : '' }] : []
  })
}

function problemField(value: unknown, field: string): unknown {
  if (!value || typeof value !== 'object' || !(field in value)) return undefined
  return (value as Record<string, unknown>)[field]
}

function commandHeaders(command: CommandHeaders): HeadersInit {
  return {
    'Idempotency-Key': command.idempotencyKey,
    'Command-Id': command.commandId,
  }
}

/* Every read through a case names it: the access record says which case it went through. */
function historicalCaseHeaders(caseId: string): HeadersInit {
  return { 'X-Historical-Access-Case': caseId }
}

function pageSearch(query: { limit: number; cursor?: string }): URLSearchParams {
  const search = new URLSearchParams({ limit: String(query.limit) })
  if (query.cursor) search.set('cursor', query.cursor)
  return search
}

function errorCode(value: unknown): string | undefined {
  if (!value || typeof value !== 'object' || !('error' in value)) return undefined
  const error = value.error
  if (!error || typeof error !== 'object' || !('code' in error)) return undefined
  return typeof error.code === 'string' ? error.code : undefined
}

function errorDetail(value: unknown): string | undefined {
  if (!value || typeof value !== 'object' || !('error' in value)) return undefined
  const error = value.error
  if (!error || typeof error !== 'object' || !('detail' in error)) return undefined
  return typeof error.detail === 'string' ? error.detail : undefined
}
