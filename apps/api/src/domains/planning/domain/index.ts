import type { AllfitV1Schemas } from '@allfitone/contracts'

export type SessionTemplate = AllfitV1Schemas['SessionTemplate']
export type SessionTemplateDraft = AllfitV1Schemas['SessionTemplateDraft']
export type SessionTemplateDraftContent = AllfitV1Schemas['SessionTemplateDraftContent']
export type SessionTemplateVersion = AllfitV1Schemas['SessionTemplateVersion']
export type Program = AllfitV1Schemas['Program']
export type ProgramDraft = AllfitV1Schemas['ProgramDraft']
export type ProgramDraftContent = AllfitV1Schemas['ProgramDraftContent']
export type ProgramVersion = AllfitV1Schemas['ProgramVersion']
export type ProgramAssignment = AllfitV1Schemas['ProgramAssignment']
export type RelationshipAssignment = AllfitV1Schemas['RelationshipAssignment']
export type RelationshipAssignmentSession = AllfitV1Schemas['RelationshipAssignmentSession']
export type PrescriptionAdjustmentKind = AllfitV1Schemas['PrescriptionAdjustmentKind']
export type PrescriptionRevision = AllfitV1Schemas['PrescriptionRevision']
export type AssignmentCancellation = AllfitV1Schemas['AssignmentCancellation']

export interface PlanningCommand {
  idempotencyKey: string
  commandId: string
  requestHash: Buffer
}

export interface PlanningCommandResult<T> {
  resource: T
  replayed: boolean
}

export interface PlanningPage<T> {
  items: T[]
  hasMore: boolean
  nextCursor?: { updatedAt: string; id: string }
}

export interface PlanningDatabase {
  createSessionTemplate(
    input: PlanningCommand & {
      personId: string
      organizationId: string
      disciplineCode: string
      title: string
    },
  ): Promise<PlanningCommandResult<SessionTemplate>>
  replaceSessionTemplateDraft(
    input: PlanningCommand & {
      personId: string
      organizationId: string
      templateId: string
      expectedEtag: string
      content: SessionTemplateDraftContent
    },
  ): Promise<PlanningCommandResult<SessionTemplateDraft>>
  publishSessionTemplateVersion(
    input: PlanningCommand & {
      personId: string
      organizationId: string
      templateId: string
      expectedEtag: string
    },
  ): Promise<PlanningCommandResult<SessionTemplateVersion>>
  deriveSessionTemplateVersion(
    input: PlanningCommand & {
      personId: string
      organizationId: string
      templateId: string
      versionNumber: number
      expectedEtag: string
    },
  ): Promise<PlanningCommandResult<SessionTemplateDraft>>
  deprecateSessionTemplateVersion(
    input: PlanningCommand & {
      personId: string
      organizationId: string
      templateId: string
      versionNumber: number
    },
  ): Promise<PlanningCommandResult<SessionTemplateVersion>>
  createProgram(
    input: PlanningCommand & { personId: string; organizationId: string; title: string },
  ): Promise<PlanningCommandResult<Program>>
  replaceProgramDraft(
    input: PlanningCommand & {
      personId: string
      organizationId: string
      programId: string
      expectedEtag: string
      content: ProgramDraftContent
    },
  ): Promise<PlanningCommandResult<ProgramDraft>>
  publishProgramVersion(
    input: PlanningCommand & {
      personId: string
      organizationId: string
      programId: string
      expectedEtag: string
    },
  ): Promise<PlanningCommandResult<ProgramVersion>>
  deprecateProgramVersion(
    input: PlanningCommand & {
      personId: string
      organizationId: string
      programId: string
      versionNumber: number
    },
  ): Promise<PlanningCommandResult<ProgramVersion>>
  /** OP-PLN-010. `timezone` is a fallback; the person's device zone wins when known. */
  assignProgram(
    input: PlanningCommand & {
      personId: string
      organizationId: string
      relationshipId: string
      programVersionId: string
      startsOn: string
      timezone?: string
    },
  ): Promise<PlanningCommandResult<ProgramAssignment>>
  /** OP-PLN-012. Only the day moves, inside its week; a stale revision is refused. */
  reschedulePlannedSession(
    input: PlanningCommand & {
      personId: string
      organizationId: string
      plannedSessionId: string
      scheduledOn: string
      expectedRevision: number
    },
  ): Promise<PlanningCommandResult<RelationshipAssignmentSession>>
  /** OP-PLN-013. Typed by `kind` in PostgreSQL; the latest revision of each kind is in force. */
  revisePrescription(
    input: PlanningCommand & {
      personId: string
      organizationId: string
      assignmentId: string
      plannedStepId: string
      kind: PrescriptionAdjustmentKind
      value: number | string
      unitCode: string | null
    },
  ): Promise<PlanningCommandResult<PrescriptionRevision>>
  /** OP-PLN-014. Cancelling twice answers the same cancellation. */
  cancelAssignment(
    input: PlanningCommand & { personId: string; organizationId: string; assignmentId: string },
  ): Promise<PlanningCommandResult<AssignmentCancellation>>
  /** OP-PLN-018. Logged in the same transaction before anything is returned. */
  listRelationshipAssignments(input: {
    personId: string
    organizationId: string
    relationshipId: string
    requestId: string
    limit: number
    cursor?: { updatedAt: string; id: string }
  }): Promise<PlanningPage<RelationshipAssignment>>
  listSessionTemplates(input: {
    personId: string
    organizationId: string
    requestId: string
    limit: number
    cursor?: { updatedAt: string; id: string }
  }): Promise<PlanningPage<SessionTemplate>>
  listPrograms(input: {
    personId: string
    organizationId: string
    requestId: string
    limit: number
    cursor?: { updatedAt: string; id: string }
  }): Promise<PlanningPage<Program>>
  /** Null when the draft is outside the caller's organization, discarded, or gone. */
  readSessionTemplateDraft(input: {
    personId: string
    organizationId: string
    templateId: string
    requestId: string
  }): Promise<SessionTemplateDraft | null>
  readSessionTemplateVersion(input: {
    personId: string
    organizationId: string
    templateId: string
    versionNumber: number
    requestId: string
  }): Promise<SessionTemplateVersion>
  readProgramVersion(input: {
    personId: string
    organizationId: string
    programId: string
    versionNumber: number
    requestId: string
  }): Promise<ProgramVersion>
}
