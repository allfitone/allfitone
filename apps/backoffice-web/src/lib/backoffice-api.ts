import type { AllfitV1Schemas } from '@allfitone/contracts'

export type BackofficeAuthenticationAttempt = AllfitV1Schemas['BackofficeAuthenticationAttempt']
export type BackofficeSession = AllfitV1Schemas['BackofficeSession']
export type BackofficeLogoutReason = 'manual' | 'inactivity' | 'recovery'
export type PlatformRoleAssignment = AllfitV1Schemas['PlatformRoleAssignment']
export type PlatformDutyAssignment = AllfitV1Schemas['PlatformDutyAssignment']
export type PlatformDutyCode = AllfitV1Schemas['PlatformDutyCode']
export type PlatformRoleAssignmentPage = AllfitV1Schemas['PlatformRoleAssignmentPage']
export type PlatformDutyAssignmentPage = AllfitV1Schemas['PlatformDutyAssignmentPage']

export type BackofficeGlobalCatalogue = AllfitV1Schemas['BackofficeGlobalCatalogue']
export type GlobalCatalogueEntry = AllfitV1Schemas['GlobalCatalogueEntry']
export type CataloguePublication = AllfitV1Schemas['CataloguePublication']
export type CatalogueActivityTypePublication = AllfitV1Schemas['CatalogueActivityTypePublication']
export type CatalogueMovementPublication = AllfitV1Schemas['CatalogueMovementPublication']
export type GlobalCatalogueEquipment = AllfitV1Schemas['GlobalCatalogueEquipment']
export type CatalogueEquipmentPublication = AllfitV1Schemas['CatalogueEquipmentPublication']
export type CatalogueMovementEquipment = AllfitV1Schemas['CatalogueMovementEquipment']
export type CatalogDiscipline = AllfitV1Schemas['CatalogDiscipline']
export type CatalogActivityType = AllfitV1Schemas['CatalogActivityType']
export type ActivityTypeResultContract = AllfitV1Schemas['ActivityTypeResultContract']
export type AccessEventPage = AllfitV1Schemas['AccessEventPage']
export type ErasureRequestPage = AllfitV1Schemas['ErasureRequestPage']
export type LegalHold = AllfitV1Schemas['LegalHold']
export type LegalHoldApplication = AllfitV1Schemas['LegalHoldApplication']
export type LegalHoldPage = AllfitV1Schemas['LegalHoldPage']
export type LegalHoldState = AllfitV1Schemas['LegalHoldState']
export type BackofficeOrganizationSummary = AllfitV1Schemas['BackofficeOrganizationSummary']
export type BackofficeOrganizationPage = AllfitV1Schemas['BackofficeOrganizationPage']
export type OrganizationHandover = AllfitV1Schemas['OrganizationHandover']
export type BackofficeOrganizationFile = AllfitV1Schemas['BackofficeOrganizationFile']
export type OrganizationHandoverCreate = AllfitV1Schemas['OrganizationHandoverCreate']
export type OrganizationGuestQuota = AllfitV1Schemas['OrganizationGuestQuota']
export type OrganizationGuestQuotaDecision = AllfitV1Schemas['OrganizationGuestQuotaDecision']
export type BackofficeClientInvitation = AllfitV1Schemas['BackofficeClientInvitation']
export type BackofficeClientInvitationList = AllfitV1Schemas['BackofficeClientInvitationList']
export type BackofficeClientInvitationResend = AllfitV1Schemas['BackofficeClientInvitationResend']
export type BackofficeTeamInvitation = AllfitV1Schemas['BackofficeTeamInvitation']
export type BackofficeTeamInvitationList = AllfitV1Schemas['BackofficeTeamInvitationList']
export type BackofficeTeamInvitationResend = AllfitV1Schemas['BackofficeTeamInvitationResend']
export type CredentialVerificationRequest = AllfitV1Schemas['CredentialVerificationRequest']
export type CredentialVerificationOutcome = AllfitV1Schemas['CredentialVerificationOutcome']
export type CredentialVerificationDecisionCreate =
  AllfitV1Schemas['CredentialVerificationDecisionCreate']
export type CredentialRenewalDue = AllfitV1Schemas['CredentialRenewalDue']
export type BreakGlassRequest = AllfitV1Schemas['BreakGlassRequest']
export type BreakGlassRequestCreate = AllfitV1Schemas['BreakGlassRequestCreate']
export type BreakGlassExerciseOutcome = AllfitV1Schemas['BreakGlassExerciseOutcome']
export type BreakGlassReview = AllfitV1Schemas['BreakGlassReview']
export type OrganizationSuspension = AllfitV1Schemas['OrganizationSuspension']
export type OrganizationSuspensionReason = AllfitV1Schemas['OrganizationSuspensionReason']
export type BreakGlassReviewOutcome = AllfitV1Schemas['BreakGlassReviewOutcome']
export type ScopeDefinition = AllfitV1Schemas['ScopeDefinition']
export type ScopeDefinitionPublication = AllfitV1Schemas['ScopeDefinitionPublication']
export type SupportOperation = AllfitV1Schemas['SupportOperation']
export type SupportOperationPage = AllfitV1Schemas['SupportOperationPage']
export type SupportDeliveryCircuit = AllfitV1Schemas['SupportDeliveryCircuit']
export type SupportAttentionPanel = AllfitV1Schemas['SupportAttentionPanel']
export type SupportBusinessPanel = AllfitV1Schemas['SupportBusinessPanel']
export type SupportBusinessMetric = AllfitV1Schemas['SupportBusinessMetric']
export type PlatformPlanCatalogue = AllfitV1Schemas['PlatformPlanCatalogue']
export type PlatformPlan = AllfitV1Schemas['PlatformPlan']
export type PlatformPlanCreate = AllfitV1Schemas['PlatformPlanCreate']
export type PlatformPlanVersionProposal = AllfitV1Schemas['PlatformPlanVersionProposal']
export type SupportPersonMetadata = AllfitV1Schemas['SupportPersonMetadata']
export type SupportPersonPayments = AllfitV1Schemas['SupportPersonPayments']
export type SupportBillingFollowUp = AllfitV1Schemas['SupportBillingFollowUp']
export type SupportJobHealth = AllfitV1Schemas['SupportJobHealth']
export type ResultContractVersionList = AllfitV1Schemas['ResultContractVersionList']
export type BackofficeAccountRecovery = AllfitV1Schemas['BackofficeAccountRecovery']
export type BackofficeAccountRecoveryRequest = AllfitV1Schemas['BackofficeAccountRecoveryRequest']
export type SupportPeopleSearch = AllfitV1Schemas['SupportPeopleSearch']
export type ResultContract = AllfitV1Schemas['ResultContract']
export type ResultContractPublication = AllfitV1Schemas['ResultContractPublication']

export interface PlatformDutyFilters {
  personId?: string
  dutyCode?: PlatformDutyCode
  status?: PlatformDutyAssignment['status']
  cursor?: string
}

export interface BackofficeCommand {
  idempotencyKey: string
  commandId: string
}

const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8080').replace(/\/$/, '')

export class BackofficeApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly retryAfterMs?: number,
  ) {
    super(code)
    this.name = 'BackofficeApiError'
  }
}

export class BackofficeNetworkError extends Error {
  constructor() {
    super('network-unavailable')
    this.name = 'BackofficeNetworkError'
  }
}

export const backofficeApi = {
  apiUrl: API_URL,

  password: (email: string, password: string) =>
    requestJson<BackofficeAuthenticationAttempt>('/backoffice/v1/auth/password', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),

  attempt: (signal?: AbortSignal) =>
    requestJson<BackofficeAuthenticationAttempt>(
      '/backoffice/v1/auth/attempt',
      signal ? { signal } : {},
    ),

  verifyTotp: (code: string, command: BackofficeCommand) =>
    requestVoid('/backoffice/v1/auth/totp/verification', {
      method: 'POST',
      headers: commandHeaders(command),
      body: JSON.stringify({ code }),
    }),

  session: (signal?: AbortSignal) =>
    requestJson<BackofficeSession>('/backoffice/v1/session', signal ? { signal } : {}),

  logout: (reason: BackofficeLogoutReason) =>
    requestVoid('/backoffice/v1/auth/logout', {
      method: 'POST',
      body: JSON.stringify({ reason }),
    }),

  platformRoles: (cursor?: string, signal?: AbortSignal) =>
    requestJson<PlatformRoleAssignmentPage>(
      `/backoffice/v1/platform/role-assignments${query({ cursor })}`,
      signal ? { signal } : {},
    ),

  platformDuties: (filters: PlatformDutyFilters = {}, signal?: AbortSignal) =>
    requestJson<PlatformDutyAssignmentPage>(
      `/backoffice/v1/platform/duty-assignments${query({
        person_id: filters.personId,
        duty_code: filters.dutyCode,
        status: filters.status,
        cursor: filters.cursor,
      })}`,
      signal ? { signal } : {},
    ),

  grantPlatformRole: (personId: string, command: BackofficeCommand) =>
    requestJson<PlatformRoleAssignment>('/backoffice/v1/platform/role-assignments', {
      method: 'POST',
      headers: commandHeaders(command),
      body: JSON.stringify({ person_id: personId, platform_role: 'allfit_admin' }),
    }),

  revokePlatformRole: (assignmentId: string, command: BackofficeCommand) =>
    requestJson<PlatformRoleAssignment>(
      `/backoffice/v1/platform/role-assignments/${assignmentId}/revocation`,
      { method: 'POST', headers: commandHeaders(command), body: '{}' },
    ),

  grantPlatformDuty: (
    input: { personId: string; dutyCode: PlatformDutyCode; validTo: string; reasonCode: string },
    command: BackofficeCommand,
  ) =>
    requestJson<PlatformDutyAssignment>('/backoffice/v1/platform/duty-assignments', {
      method: 'POST',
      headers: commandHeaders(command),
      body: JSON.stringify({
        person_id: input.personId,
        duty_code: input.dutyCode,
        valid_to: input.validTo,
        reason_code: input.reasonCode,
      }),
    }),

  suspendPlatformDuty: (assignmentId: string, command: BackofficeCommand) =>
    requestJson<PlatformDutyAssignment>(
      `/backoffice/v1/platform/duty-assignments/${assignmentId}/suspension`,
      { method: 'POST', headers: commandHeaders(command), body: '{}' },
    ),

  revokePlatformDuty: (assignmentId: string, command: BackofficeCommand) =>
    requestJson<PlatformDutyAssignment>(
      `/backoffice/v1/platform/duty-assignments/${assignmentId}/revocation`,
      { method: 'POST', headers: commandHeaders(command), body: '{}' },
    ),

  recertifyPlatformDuty: (assignmentId: string, command: BackofficeCommand) =>
    requestJson<PlatformDutyAssignment>(
      `/backoffice/v1/platform/duty-assignments/${assignmentId}/recertification`,
      { method: 'POST', headers: commandHeaders(command), body: '{}' },
    ),

  // The curator's view: published and archived alike, unlike /backoffice/v1/catalog.
  globalCatalogue: (signal?: AbortSignal) =>
    requestJson<BackofficeGlobalCatalogue>('/backoffice/v1/catalogue', signal ? { signal } : {}),

  publishCatalogueDiscipline: (publication: CataloguePublication, command: BackofficeCommand) =>
    requestJson<GlobalCatalogueEntry>('/backoffice/v1/catalogue/disciplines', {
      method: 'POST',
      headers: commandHeaders(command),
      body: JSON.stringify(publication),
    }),

  publishCatalogueActivityType: (
    publication: CatalogueActivityTypePublication,
    command: BackofficeCommand,
  ) =>
    requestJson<GlobalCatalogueEntry>('/backoffice/v1/catalogue/activity-types', {
      method: 'POST',
      headers: commandHeaders(command),
      body: JSON.stringify(publication),
    }),

  publishCatalogueMovement: (
    publication: CatalogueMovementPublication,
    command: BackofficeCommand,
  ) =>
    requestJson<GlobalCatalogueEntry>('/backoffice/v1/catalogue/movements', {
      method: 'POST',
      headers: commandHeaders(command),
      body: JSON.stringify(publication),
    }),

  publishCatalogueEquipment: (
    publication: CatalogueEquipmentPublication,
    command: BackofficeCommand,
  ) =>
    requestJson<GlobalCatalogueEquipment>('/backoffice/v1/catalogue/equipment', {
      method: 'POST',
      headers: commandHeaders(command),
      body: JSON.stringify(publication),
    }),

  archiveCatalogueEquipment: (code: string, command: BackofficeCommand) =>
    requestJson<GlobalCatalogueEquipment>(`/backoffice/v1/catalogue/equipment/${code}/archival`, {
      method: 'POST',
      headers: commandHeaders(command),
      body: '{}',
    }),

  // The movement's whole list: what the curator sees is exactly what is stored.
  setCatalogueMovementEquipment: (
    movementId: string,
    body: CatalogueMovementEquipment,
    command: BackofficeCommand,
  ) =>
    requestJson<GlobalCatalogueEntry>(
      `/backoffice/v1/catalogue/movements/${movementId}/equipment`,
      {
        method: 'POST',
        headers: commandHeaders(command),
        body: JSON.stringify(body),
      },
    ),

  // No body: archiving takes only which entry, so nothing else can travel with it.
  archiveCatalogueEntry: (
    entry: { kind: 'discipline' | 'activity_type' | 'movement'; id: string; code: string | null },
    command: BackofficeCommand,
  ) =>
    requestJson<GlobalCatalogueEntry>(
      `/backoffice/v1/catalogue/${catalogueSegment(entry.kind)}/${entry.code ?? entry.id}/archival`,
      { method: 'POST', headers: commandHeaders(command), body: '{}' },
    ),

  publishResultContract: (publication: ResultContractPublication, command: BackofficeCommand) =>
    requestJson<ResultContract>('/backoffice/v1/result-contracts', {
      method: 'POST',
      headers: commandHeaders(command),
      body: JSON.stringify(publication),
    }),

  // The curator's view: every version, published and deprecated, newest first.
  resultContractVersions: (activityTypeId: string, signal?: AbortSignal) =>
    requestJson<ResultContractVersionList>(
      `/backoffice/v1/result-contracts${query({ activity_type_id: activityTypeId })}`,
      signal ? { signal } : {},
    ),

  deprecateResultContract: (contractId: string, command: BackofficeCommand) =>
    requestJson<ResultContract>(`/backoffice/v1/result-contracts/${contractId}/deprecation`, {
      method: 'POST',
      headers: commandHeaders(command),
      body: '{}',
    }),

  // The published global catalogue, read on this surface because the session
  // cookie travels nowhere else.
  catalogDisciplines: (signal?: AbortSignal) =>
    requestJson<{ items: CatalogDiscipline[] }>(
      '/backoffice/v1/catalog/disciplines',
      signal ? { signal } : {},
    ),

  catalogActivityTypes: (signal?: AbortSignal) =>
    requestJson<{ items: CatalogActivityType[] }>(
      '/backoffice/v1/catalog/activity-types',
      signal ? { signal } : {},
    ),

  catalogActivityTypeResultContracts: (activityTypeId: string, signal?: AbortSignal) =>
    requestJson<{ items: ActivityTypeResultContract[] }>(
      `/backoffice/v1/catalog/activity-types/${activityTypeId}/result-contracts`,
      signal ? { signal } : {},
    ),

  // The case reference travels on every support read: the server records it
  // beside the query, so a read nobody can trace back to a case is refused.
  searchSupportPeople: (
    input: { caseReference: string; kind: 'identifier' | 'email' | 'phone'; value: string },
    signal?: AbortSignal,
  ) =>
    requestJson<SupportPeopleSearch>(
      `/backoffice/v1/support/people${query({
        case_reference: input.caseReference,
        [input.kind]: input.value,
      })}`,
      signal ? { signal } : {},
    ),

  supportPersonMetadata: (personId: string, caseReference: string, signal?: AbortSignal) =>
    requestJson<SupportPersonMetadata>(
      `/backoffice/v1/support/people/${personId}${query({ case_reference: caseReference })}`,
      signal ? { signal } : {},
    ),

  // Its own read because it is its own duty: `view_billing_metadata` opens this and
  // the duty that opens the card does not.
  supportPersonPayments: (personId: string, caseReference: string, signal?: AbortSignal) =>
    requestJson<SupportPersonPayments>(
      `/backoffice/v1/support/people/${personId}/payments${query({ case_reference: caseReference })}`,
      signal ? { signal } : {},
    ),

  // Names payers, so it carries the case like one person's payments.
  billingFollowUp: (caseReference: string, limit: number, signal?: AbortSignal) =>
    requestJson<SupportBillingFollowUp>(
      `/backoffice/v1/support/billing-follow-up${query({ case_reference: caseReference, limit: String(limit) })}`,
      signal ? { signal } : {},
    ),

  accountRecovery: (personId: string, caseReference: string, signal?: AbortSignal) =>
    requestJson<BackofficeAccountRecovery>(
      `/backoffice/v1/people/${personId}/account-recovery${query({ case_reference: caseReference })}`,
      signal ? { signal } : {},
    ),

  // Only the case travels: the person, the address and the flow come from the server.
  startAccountRecovery: (personId: string, caseReference: string, command: BackofficeCommand) =>
    requestJson<BackofficeAccountRecoveryRequest>(
      `/backoffice/v1/people/${personId}/account-recoveries`,
      {
        method: 'POST',
        headers: commandHeaders(command),
        body: JSON.stringify({ case_reference: caseReference }),
      },
    ),

  resendAccountRecovery: (
    personId: string,
    recoveryId: string,
    caseReference: string,
    command: BackofficeCommand,
  ) =>
    requestJson<BackofficeAccountRecoveryRequest>(
      `/backoffice/v1/people/${personId}/account-recoveries/${recoveryId}/resends`,
      {
        method: 'POST',
        headers: commandHeaders(command),
        body: JSON.stringify({ case_reference: caseReference }),
      },
    ),

  cancelAccountRecovery: (
    personId: string,
    recoveryId: string,
    caseReference: string,
    command: BackofficeCommand,
  ) =>
    requestJson<BackofficeAccountRecoveryRequest>(
      `/backoffice/v1/people/${personId}/account-recoveries/${recoveryId}/cancellation`,
      {
        method: 'POST',
        headers: commandHeaders(command),
        body: JSON.stringify({ case_reference: caseReference }),
      },
    ),

  // No case reference here, unlike the other support reads: this feed has no
  // subject, so there is nothing to trace back to a case.
  supportOperations: (
    filters: { source?: string; state?: string; aggregateId?: string; cursor?: string } = {},
    signal?: AbortSignal,
  ) =>
    requestJson<SupportOperationPage>(
      `/backoffice/v1/support/operations${query({
        source: filters.source,
        state: filters.state,
        aggregate_id: filters.aggregateId,
        cursor: filters.cursor,
      })}`,
      signal ? { signal } : {},
    ),

  // No subject and no case: when each scheduled job last ran (HU-BO-031 c2).
  supportJobHealth: (signal?: AbortSignal) =>
    requestJson<SupportJobHealth>('/backoffice/v1/support/job-health', signal ? { signal } : {}),

  supportDeliveryCircuits: (signal?: AbortSignal) =>
    requestJson<{ items: SupportDeliveryCircuit[] }>(
      '/backoffice/v1/support/delivery-circuits',
      signal ? { signal } : {},
    ),

  supportAttention: (signal?: AbortSignal) =>
    requestJson<SupportAttentionPanel>(
      '/backoffice/v1/support/attention',
      signal ? { signal } : {},
    ),

  platformPlans: (signal?: AbortSignal) =>
    requestJson<PlatformPlanCatalogue>('/backoffice/v1/platform-plans', signal ? { signal } : {}),

  createPlatformPlan: (plan: PlatformPlanCreate, command: BackofficeCommand) =>
    requestJson<PlatformPlan>('/backoffice/v1/platform-plans', {
      method: 'POST',
      headers: commandHeaders(command),
      body: JSON.stringify(plan),
    }),

  proposePlatformPlanVersion: (
    planId: string,
    proposal: PlatformPlanVersionProposal,
    command: BackofficeCommand,
  ) =>
    requestJson<PlatformPlan>(`/backoffice/v1/platform-plans/${planId}/versions`, {
      method: 'POST',
      headers: commandHeaders(command),
      body: JSON.stringify(proposal),
    }),

  publishPlatformPlanVersion: (planId: string, versionId: string, command: BackofficeCommand) =>
    requestJson<PlatformPlan>(
      `/backoffice/v1/platform-plans/${planId}/versions/${versionId}/publication`,
      { method: 'POST', headers: commandHeaders(command), body: '{}' },
    ),

  withdrawPlatformPlanVersion: (planId: string, versionId: string, command: BackofficeCommand) =>
    requestJson<PlatformPlan>(
      `/backoffice/v1/platform-plans/${planId}/versions/${versionId}/withdrawal`,
      { method: 'POST', headers: commandHeaders(command), body: '{}' },
    ),

  supportBusiness: (signal?: AbortSignal) =>
    requestJson<SupportBusinessPanel>('/backoffice/v1/support/business', signal ? { signal } : {}),

  verificationRequests: (signal?: AbortSignal) =>
    requestJson<{ items: CredentialVerificationRequest[] }>(
      '/backoffice/v1/verification-requests',
      signal ? { signal } : {},
    ),

  decideVerification: (
    decision: CredentialVerificationDecisionCreate,
    command: BackofficeCommand,
  ) =>
    requestJson<CredentialVerificationOutcome>('/backoffice/v1/verifications', {
      method: 'POST',
      headers: commandHeaders(command),
      body: JSON.stringify(decision),
    }),

  verificationRenewals: (signal?: AbortSignal) =>
    requestJson<{ items: CredentialRenewalDue[] }>(
      '/backoffice/v1/verification-renewals',
      signal ? { signal } : {},
    ),

  openVerificationRenewal: (credentialId: string, command: BackofficeCommand) =>
    requestJson<CredentialVerificationOutcome>('/backoffice/v1/verification-renewals', {
      method: 'POST',
      headers: commandHeaders(command),
      body: JSON.stringify({ credential_id: credentialId }),
    }),

  applyLegalHold: (application: LegalHoldApplication, command: BackofficeCommand) =>
    requestJson<LegalHold>('/backoffice/v1/legal-holds', {
      method: 'POST',
      headers: commandHeaders(command),
      body: JSON.stringify(application),
    }),

  legalHolds: (filters: { status?: LegalHoldState | undefined } = {}, signal?: AbortSignal) =>
    requestJson<LegalHoldPage>(
      `/backoffice/v1/legal-holds${query(filters)}`,
      signal ? { signal } : {},
    ),

  releaseLegalHold: (holdId: string, command: BackofficeCommand) =>
    requestJson<LegalHold>(`/backoffice/v1/legal-holds/${holdId}/release`, {
      method: 'POST',
      headers: commandHeaders(command),
    }),

  erasureRequests: (
    filters: {
      status?: string | undefined
      cursor_at?: string | undefined
      cursor_id?: string | undefined
    } = {},
    signal?: AbortSignal,
  ) =>
    requestJson<ErasureRequestPage>(
      `/backoffice/v1/erasure-requests${query(filters)}`,
      signal ? { signal } : {},
    ),

  accessEvents: (
    filters: {
      actor_person_id?: string | undefined
      subject_person_id?: string | undefined
      from?: string | undefined
      to?: string | undefined
      cursor?: string | undefined
    },
    signal?: AbortSignal,
  ) =>
    requestJson<AccessEventPage>(
      `/backoffice/v1/access-events${query(filters)}`,
      signal ? { signal } : {},
    ),

  organizations: (
    filters: {
      q?: string | undefined
      status?: string | undefined
      cursor?: string | undefined
    } = {},
    signal?: AbortSignal,
  ) =>
    requestJson<BackofficeOrganizationPage>(
      `/backoffice/v1/organizations${query(filters)}`,
      signal ? { signal } : {},
    ),

  createOrganizationHandover: (body: OrganizationHandoverCreate, command: BackofficeCommand) =>
    requestJson<OrganizationHandover>('/backoffice/v1/organizations', {
      method: 'POST',
      headers: commandHeaders(command),
      body: JSON.stringify(body),
    }),

  organizationFile: (organizationId: string, signal?: AbortSignal) =>
    requestJson<BackofficeOrganizationFile>(
      `/backoffice/v1/organizations/${organizationId}`,
      signal ? { signal } : {},
    ),

  organizationHandover: (organizationId: string, signal?: AbortSignal) =>
    requestJson<OrganizationHandover>(
      `/backoffice/v1/organizations/${organizationId}/handover`,
      signal ? { signal } : {},
    ),

  organizationTeamInvitations: (organizationId: string, signal?: AbortSignal) =>
    requestJson<BackofficeTeamInvitationList>(
      `/backoffice/v1/organizations/${organizationId}/team-invitations`,
      signal ? { signal } : {},
    ),

  organizationClientInvitations: (organizationId: string, signal?: AbortSignal) =>
    requestJson<BackofficeClientInvitationList>(
      `/backoffice/v1/organizations/${organizationId}/client-invitations`,
      signal ? { signal } : {},
    ),

  // No body: the contact, the gym and the scopes asked for come from the invitation.
  resendClientInvitation: (
    organizationId: string,
    invitationId: string,
    command: BackofficeCommand,
  ) =>
    requestJson<BackofficeClientInvitationResend>(
      `/backoffice/v1/organizations/${organizationId}/client-invitations/${invitationId}/resends`,
      { method: 'POST', headers: commandHeaders(command), body: '{}' },
    ),

  // No body: the contact, the role and the gym all come from the invitation itself.
  resendTeamInvitation: (
    organizationId: string,
    invitationId: string,
    command: BackofficeCommand,
  ) =>
    requestJson<BackofficeTeamInvitationResend>(
      `/backoffice/v1/organizations/${organizationId}/team-invitations/${invitationId}/resends`,
      { method: 'POST', headers: commandHeaders(command), body: '{}' },
    ),

  // No body: the resend always goes to the address the handover was created with.
  resendOrganizationHandover: (organizationId: string, command: BackofficeCommand) =>
    requestJson<OrganizationHandover>(
      `/backoffice/v1/organizations/${organizationId}/handover/resends`,
      { method: 'POST', headers: commandHeaders(command) },
    ),

  setOrganizationGuestQuota: (
    organizationId: string,
    decision: OrganizationGuestQuotaDecision,
    command: BackofficeCommand,
  ) =>
    requestJson<OrganizationGuestQuota>(
      `/backoffice/v1/organizations/${organizationId}/guest-quota`,
      {
        method: 'POST',
        headers: commandHeaders(command),
        body: JSON.stringify(decision),
      },
    ),

  cancelOrganizationHandover: (organizationId: string, command: BackofficeCommand) =>
    requestJson<OrganizationHandover>(
      `/backoffice/v1/organizations/${organizationId}/cancellation`,
      { method: 'POST', headers: commandHeaders(command) },
    ),

  scopeDefinitions: (signal?: AbortSignal) =>
    requestJson<{ items: ScopeDefinition[] }>(
      '/backoffice/v1/scope-definitions',
      signal ? { signal } : {},
    ),

  publishScopeDefinition: (publication: ScopeDefinitionPublication, command: BackofficeCommand) =>
    requestJson<ScopeDefinition>('/backoffice/v1/scope-definitions', {
      method: 'POST',
      headers: commandHeaders(command),
      body: JSON.stringify(publication),
    }),

  breakGlassRequests: (filters: { mine?: boolean; status?: string } = {}, signal?: AbortSignal) =>
    requestJson<{ items: BreakGlassRequest[] }>(
      `/backoffice/v1/break-glass/requests${query({
        mine: filters.mine === undefined ? undefined : String(filters.mine),
        status: filters.status,
      })}`,
      signal ? { signal } : {},
    ),

  requestBreakGlass: (publication: BreakGlassRequestCreate, command: BackofficeCommand) =>
    requestJson<BreakGlassRequest>('/backoffice/v1/break-glass/requests', {
      method: 'POST',
      headers: commandHeaders(command),
      body: JSON.stringify(publication),
    }),

  decideBreakGlass: (
    requestId: string,
    decision: { decision: 'approved' | 'rejected'; reason_code: string },
    command: BackofficeCommand,
  ) =>
    requestJson<BreakGlassRequest>(`/backoffice/v1/break-glass/requests/${requestId}/decisions`, {
      method: 'POST',
      headers: commandHeaders(command),
      body: JSON.stringify(decision),
    }),

  // No command identifiers: each attempt is a new event rather than a command to
  // converge, so there is nothing to replay.
  exerciseBreakGlass: (
    requestId: string,
    exercise: { category: string; resource_type: string; resource_id?: string },
  ) =>
    requestJson<BreakGlassExerciseOutcome>(
      `/backoffice/v1/break-glass/requests/${requestId}/reads`,
      { method: 'POST', body: JSON.stringify(exercise) },
    ),

  suspendOrganization: (
    organizationId: string,
    reason: OrganizationSuspensionReason,
    command: BackofficeCommand,
  ) =>
    requestJson<OrganizationSuspension>(
      `/backoffice/v1/organizations/${organizationId}/suspension`,
      {
        method: 'POST',
        headers: commandHeaders(command),
        body: JSON.stringify({ reason_code: reason }),
      },
    ),

  reactivateOrganization: (organizationId: string, command: BackofficeCommand) =>
    requestJson<OrganizationSuspension>(
      `/backoffice/v1/organizations/${organizationId}/reactivation`,
      { method: 'POST', headers: commandHeaders(command), body: '{}' },
    ),

  breakGlassReviewQueue: (signal?: AbortSignal) =>
    requestJson<{ items: BreakGlassReview[] }>(
      '/backoffice/v1/break-glass/reviews',
      signal ? { signal } : {},
    ),

  reviewBreakGlass: (
    requestId: string,
    outcome: BreakGlassReviewOutcome,
    command: BackofficeCommand,
  ) =>
    requestJson<BreakGlassReview>(`/backoffice/v1/break-glass/requests/${requestId}/review`, {
      method: 'POST',
      headers: commandHeaders(command),
      body: JSON.stringify({ outcome }),
    }),

  closeBreakGlass: (requestId: string, command: BackofficeCommand) =>
    requestJson<BreakGlassRequest>(`/backoffice/v1/break-glass/requests/${requestId}/closure`, {
      method: 'POST',
      headers: commandHeaders(command),
      body: '{}',
    }),

  passwordReset: (email: string) =>
    requestVoid('/backoffice/v1/auth/password-resets', {
      method: 'POST',
      body: JSON.stringify({ email }),
      acceptedStatus: 202,
    }),
}

export function newBackofficeCommand(): BackofficeCommand {
  return { idempotencyKey: crypto.randomUUID(), commandId: uuidV7() }
}

export function parseRetryAfter(value: string | null, now = Date.now()): number | undefined {
  if (!value) return undefined
  const seconds = Number(value)
  if (Number.isFinite(seconds) && seconds >= 0) return Math.ceil(seconds * 1000)
  const date = Date.parse(value)
  if (!Number.isFinite(date)) return undefined
  return Math.max(0, date - now)
}

function uuidV7(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  let timestamp = Date.now()
  for (let index = 5; index >= 0; index -= 1) {
    bytes[index] = timestamp & 0xff
    timestamp = Math.floor(timestamp / 256)
  }
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x70
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

async function requestJson<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetchApi(path, init)
  return (await response.json()) as T
}

async function requestVoid(
  path: string,
  init: RequestInit & { acceptedStatus?: number } = {},
): Promise<void> {
  const { acceptedStatus, ...requestInit } = init
  const response = await fetchApi(path, requestInit)
  if (acceptedStatus !== undefined && response.status !== acceptedStatus) {
    throw await responseError(response)
  }
}

async function fetchApi(path: string, init: RequestInit): Promise<Response> {
  let response: Response
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
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error
    throw new BackofficeNetworkError()
  }
  if (!response.ok) throw await responseError(response)
  return response
}

function catalogueSegment(kind: 'discipline' | 'activity_type' | 'movement'): string {
  if (kind === 'discipline') return 'disciplines'
  return kind === 'activity_type' ? 'activity-types' : 'movements'
}

async function responseError(response: Response): Promise<BackofficeApiError> {
  const payload: unknown = await response.json().catch(() => undefined)
  return new BackofficeApiError(
    response.status,
    errorCode(payload) ?? `http-${response.status}`,
    parseRetryAfter(response.headers.get('Retry-After')),
  )
}

function commandHeaders(command: BackofficeCommand): HeadersInit {
  return {
    'Idempotency-Key': command.idempotencyKey,
    'Command-Id': command.commandId,
  }
}

function errorCode(value: unknown): string | undefined {
  if (!value || typeof value !== 'object') return undefined
  if ('error' in value) {
    const error = value.error
    if (!error || typeof error !== 'object' || !('code' in error)) return undefined
    return typeof error.code === 'string' ? error.code : undefined
  }
  // RFC 9457: the code is the last segment of the problem type.
  if ('type' in value && typeof value.type === 'string') {
    const code = value.type.split('/').pop()
    return code && code.length > 0 ? code : undefined
  }
  return undefined
}

/** Absent filters are omitted, so an empty value never becomes a literal filter. */
function query(parameters: Record<string, string | undefined>): string {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(parameters)) {
    if (value !== undefined && value !== '') search.set(key, value)
  }
  const serialized = search.toString()
  return serialized ? `?${serialized}` : ''
}
