import { beforeEach, describe, expect, test } from 'bun:test'
import { allfitV1ContractManifest, type AllfitV1Schemas } from '@allfitone/contracts'
import { Hono } from 'hono'

import { STUDIO_SESSION_COOKIE, type StudioSessionService } from '../../identity/index.js'
import type { StudioPlanningService } from '../application/index.js'
import { mountSurfaces } from '../../../surfaces.js'
import { studioPlanningRoutes } from './studio.js'

const ORGANIZATION_ID = '019d0000-0000-7000-8000-000000000101'
const TEMPLATE_ID = '019d0000-0000-7000-8000-000000000401'
const TEMPLATE_DRAFT_ID = '019d0000-0000-7000-8000-000000000402'
const TEMPLATE_VERSION_ID = '019d0000-0000-7000-8000-000000000403'
const PROGRAM_ID = '019d0000-0000-7000-8000-000000000501'
const PROGRAM_DRAFT_ID = '019d0000-0000-7000-8000-000000000502'
const PROGRAM_VERSION_ID = '019d0000-0000-7000-8000-000000000503'
const PERSON_ID = '019d0000-0000-7000-8000-000000000001'
const RELATIONSHIP_ID = '019d0000-0000-7000-8000-000000000701'
const ASSIGNMENT_ID = '019d0000-0000-7000-8000-000000000801'
const PLANNED_SESSION_ID = '019d0000-0000-7000-8000-000000000802'
const PLANNED_STEP_ID = '019d0000-0000-7000-8000-000000000803'
const REVISION_ID = '019d0000-0000-7000-8000-000000000804'
const ETAG = `"sha256:${'A'.repeat(43)}"`
const IDEMPOTENCY_KEY = '11111111-1111-4111-8111-111111111111'
const COMMAND_ID = '019d0000-0000-7000-8000-000000000301'
const NOW = '2026-08-17T12:00:00.000Z'

type TargetFamilySample =
  | AllfitV1Schemas['StrengthTarget']
  | AllfitV1Schemas['EnduranceTarget']
  | AllfitV1Schemas['IntervalTarget']
  | AllfitV1Schemas['MobilityTarget']

const targetFamilySamples = [
  { family: 'strength', target_sets: 3, target_reps: 8 },
  { family: 'endurance', target_duration_seconds: 600 },
  { family: 'interval', rounds: 4, work_duration_seconds: 30 },
  { family: 'mobility', sequence_position: 1, hold_duration_seconds: 30, side: 'bilateral' },
] as const satisfies readonly TargetFamilySample[]
const plannedStep: AllfitV1Schemas['PlannedStepContent'] = {
  position: 1,
  movement_id: null,
  activity_type_id: null,
  notes: null,
  target: targetFamilySamples[0],
}
const templateDraftContent: AllfitV1Schemas['SessionTemplateDraftContent'] = {
  title: 'Strength A',
  activity_type_id: '019d0000-0000-7000-8000-000000000601',
  steps: [plannedStep],
}
const templateDraft: AllfitV1Schemas['SessionTemplateDraft'] = {
  id: TEMPLATE_DRAFT_ID,
  template_id: TEMPLATE_ID,
  content_schema_version: 1,
  content: templateDraftContent,
  derived_from_version_id: null,
  etag: ETAG,
  updated_at: NOW,
}
const templateVersion: AllfitV1Schemas['SessionTemplateVersion'] = {
  id: TEMPLATE_VERSION_ID,
  template_id: TEMPLATE_ID,
  version_number: 1,
  discipline_code: 'test_strength',
  activity_type_id: '019d0000-0000-7000-8000-000000000601',
  derived_from_version_id: null,
  title: 'Strength A',
  status: 'published',
  published_at: NOW,
  steps: [plannedStep],
}
const sessionTemplate: AllfitV1Schemas['SessionTemplate'] = {
  id: TEMPLATE_ID,
  organization_id: ORGANIZATION_ID,
  discipline_code: 'test_strength',
  status: 'published',
  author_person_id: PERSON_ID,
  draft: templateDraft,
  versions: [
    {
      id: TEMPLATE_VERSION_ID,
      template_id: TEMPLATE_ID,
      version_number: 1,
      status: 'published',
      published_at: NOW,
    },
  ],
}
const programDraftContent: AllfitV1Schemas['ProgramDraftContent'] = {
  title: 'Program A',
  notes: null,
  sessions: [{ position: 1, week: 1, day: 1, template_version_id: TEMPLATE_VERSION_ID }],
}
const programDraft: AllfitV1Schemas['ProgramDraft'] = {
  id: PROGRAM_DRAFT_ID,
  program_id: PROGRAM_ID,
  content_schema_version: 1,
  content: programDraftContent,
  etag: ETAG,
  updated_at: NOW,
  deprecated_template_version_ids: [],
}
const programVersion: AllfitV1Schemas['ProgramVersion'] = {
  id: PROGRAM_VERSION_ID,
  program_id: PROGRAM_ID,
  version_number: 1,
  status: 'published',
  title: 'Program A',
  notes: null,
  repeats_forever: true,
  sessions: programDraftContent.sessions,
  published_at: NOW,
  session_count: 1,
  deprecated_template_version_ids: [TEMPLATE_VERSION_ID],
}
const program: AllfitV1Schemas['Program'] = {
  id: PROGRAM_ID,
  organization_id: ORGANIZATION_ID,
  status: 'published',
  author_person_id: PERSON_ID,
  draft: programDraft,
  versions: [programVersion],
}

const programAssignment: AllfitV1Schemas['ProgramAssignment'] = {
  id: ASSIGNMENT_ID,
  status: 'active',
  origin_relationship_id: RELATIONSHIP_ID,
  program_version_id: PROGRAM_VERSION_ID,
  starts_on: '2026-08-17',
  timezone: 'America/Bogota',
  management: { relationship_id: RELATIONSHIP_ID, since: NOW },
  planned_sessions_created: 1,
  schedule_overlaps: false,
}
const managedSession: AllfitV1Schemas['RelationshipAssignmentSession'] = {
  id: PLANNED_SESSION_ID,
  template_version_id: TEMPLATE_VERSION_ID,
  title: 'Strength A',
  week_starts_on: '2026-08-17',
  program_day: 1,
  scheduled_on: '2026-08-19',
  status: 'scheduled',
  started: false,
  revision_number: 1,
}
const prescriptionRevision: AllfitV1Schemas['PrescriptionRevision'] = {
  id: REVISION_ID,
  assignment_id: ASSIGNMENT_ID,
  planned_step_id: PLANNED_STEP_ID,
  kind: 'target_load',
  value: 70,
  unit_code: 'kg',
  revised_at: NOW,
}
const assignmentCancellation: AllfitV1Schemas['AssignmentCancellation'] = {
  id: ASSIGNMENT_ID,
  status: 'cancelled',
  cancelled_at: NOW,
  sessions_cancelled: 3,
}
const relationshipAssignment: AllfitV1Schemas['RelationshipAssignment'] = {
  id: ASSIGNMENT_ID,
  status: 'active',
  program_version: {
    id: PROGRAM_VERSION_ID,
    program_id: PROGRAM_ID,
    version_number: 1,
    title: 'Program A',
    repeats_forever: true,
  },
  starts_on: '2026-08-17',
  timezone: 'America/Bogota',
  assigned_at: NOW,
  management: { relationship_id: RELATIONSHIP_ID, since: NOW },
  sessions: [
    {
      id: PLANNED_SESSION_ID,
      template_version_id: TEMPLATE_VERSION_ID,
      title: 'Strength A',
      week_starts_on: '2026-08-17',
      program_day: 1,
      scheduled_on: '2026-08-17',
      status: 'scheduled',
      started: false,
      revision_number: 0,
    },
  ],
  adjustments: [prescriptionRevision],
}
const SESSION_PATH = `/organizations/${ORGANIZATION_ID}/planned-sessions/${PLANNED_SESSION_ID}`
const REVISIONS_PATH = `/organizations/${ORGANIZATION_ID}/assignments/${ASSIGNMENT_ID}/prescription-revisions`
const CANCELLATION_PATH = `/organizations/${ORGANIZATION_ID}/assignments/${ASSIGNMENT_ID}/cancellation`
const rescheduleBody = { scheduled_on: '2026-08-19', expected_revision: 0 }
const revisionBody = {
  planned_step_id: PLANNED_STEP_ID,
  kind: 'target_load',
  value: 70,
  unit_code: 'kg',
}
const ASSIGNMENTS_PATH = `/organizations/${ORGANIZATION_ID}/relationships/${RELATIONSHIP_ID}/assignments`
const assignmentBody = {
  program_version_id: PROGRAM_VERSION_ID,
  starts_on: '2026-08-17',
  timezone: 'America/Bogota',
}

interface CapturedCall {
  operation: string
  input: Record<string, unknown>
}

interface EndpointCase {
  operation: string
  method: string
  path: string
  service: string
  status: number
  body?: unknown
  ifMatch?: boolean
  expectedId: string
  expectedInput: Record<string, unknown>
  expectedHeaders?: Record<string, string>
  expectedDeprecatedWarning?: boolean
}

beforeEach(() => {
  process.env.STUDIO_WEB_URL = 'https://studio.example.test'
  process.env.BACKOFFICE_WEB_URL = 'https://backoffice.example.test'
  process.env.API_PUBLIC_URL = 'https://api.example.test'
})

describe('Studio planning API contract', () => {
  test('T-PLN-API-00 generated target DTOs preserve every lowercase contract discriminator', () => {
    expect(targetFamilySamples.map((target) => target.family)).toEqual([
      'strength',
      'endurance',
      'interval',
      'mobility',
    ])
  })

  test('T-PLN-API-01 mounts every approved Planning operation with its contract method', () => {
    const approved = new Set([
      'OP-PLN-001',
      'OP-PLN-002',
      'OP-PLN-003',
      'OP-PLN-004',
      'OP-PLN-005',
      'OP-PLN-006',
      'OP-PLN-007',
      'OP-PLN-008',
      'OP-PLN-009',
      // Giving a client a program, and reading back what this relationship gave.
      'OP-PLN-010',
      'OP-PLN-018',
      // Managing what was given: moving a session, adjusting it, stopping the program.
      'OP-PLN-012',
      'OP-PLN-013',
      'OP-PLN-014',
      'OP-PLN-019',
      'OP-PLN-020',
      'OP-PLN-021',
      // Reading a draft back in the shape it is edited in.
      'OP-PLN-023',
    ])
    // Scoped to the Studio surface: `OP-PLN-020` now answers on `/space/v1` as well,
    // and this assertion is about what **this** router mounts.
    const contract = allfitV1ContractManifest.operations
      .filter(
        (operation) =>
          approved.has(operation.allfitOperation) && operation.path.startsWith('/studio/v1'),
      )
      .map((operation) => `${operation.method} ${colonPath(operation.path)}`)
      .sort()
    const mounted = studioPlanningRoutes()
      .routes.filter((route) => route.method !== 'ALL')
      .map((route) => `${route.method} ${route.path}`)
      .sort()
    expect(mounted).toEqual(contract)
  })

  const endpoints: EndpointCase[] = [
    {
      operation: 'OP-PLN-019',
      method: 'GET',
      service: 'listSessionTemplates',
      status: 200,
      path: `/organizations/${ORGANIZATION_ID}/session-templates?limit=1`,
      expectedId: TEMPLATE_ID,
      expectedInput: { organizationId: ORGANIZATION_ID, limit: 1 },
      expectedHeaders: { 'cache-control': 'private, max-age=0, must-revalidate' },
    },
    {
      operation: 'OP-PLN-001',
      method: 'POST',
      service: 'createSessionTemplate',
      status: 201,
      path: `/organizations/${ORGANIZATION_ID}/session-templates`,
      body: { discipline_code: 'test_strength', title: ' Strength A ' },
      expectedId: TEMPLATE_ID,
      expectedInput: {
        organizationId: ORGANIZATION_ID,
        disciplineCode: 'test_strength',
        title: 'Strength A',
      },
      expectedHeaders: {
        etag: ETAG,
        location: `/studio/v1/organizations/${ORGANIZATION_ID}/session-templates/${TEMPLATE_ID}/draft`,
      },
    },
    {
      operation: 'OP-PLN-002',
      method: 'PUT',
      service: 'replaceSessionTemplateDraft',
      status: 200,
      path: `/organizations/${ORGANIZATION_ID}/session-templates/${TEMPLATE_ID}/draft`,
      body: templateDraftContent,
      ifMatch: true,
      expectedId: TEMPLATE_DRAFT_ID,
      expectedInput: {
        organizationId: ORGANIZATION_ID,
        templateId: TEMPLATE_ID,
        expectedEtag: ETAG,
        content: templateDraftContent,
      },
      expectedHeaders: { etag: ETAG },
    },
    {
      operation: 'OP-PLN-003',
      method: 'POST',
      service: 'publishSessionTemplateVersion',
      status: 201,
      path: `/organizations/${ORGANIZATION_ID}/session-templates/${TEMPLATE_ID}/versions`,
      ifMatch: true,
      expectedId: TEMPLATE_VERSION_ID,
      expectedInput: {
        organizationId: ORGANIZATION_ID,
        templateId: TEMPLATE_ID,
        expectedEtag: ETAG,
      },
      expectedHeaders: {
        location: `/organizations/${ORGANIZATION_ID}/session-templates/${TEMPLATE_ID}/versions/1`,
      },
    },
    {
      operation: 'OP-PLN-021',
      method: 'GET',
      service: 'readSessionTemplateVersion',
      status: 200,
      path: `/organizations/${ORGANIZATION_ID}/session-templates/${TEMPLATE_ID}/versions/1`,
      expectedId: TEMPLATE_VERSION_ID,
      expectedInput: { organizationId: ORGANIZATION_ID, templateId: TEMPLATE_ID, versionNumber: 1 },
      expectedHeaders: { 'cache-control': 'private, max-age=0, must-revalidate' },
    },
    {
      operation: 'OP-PLN-004',
      method: 'POST',
      service: 'deriveSessionTemplateVersion',
      status: 200,
      path: `/organizations/${ORGANIZATION_ID}/session-templates/${TEMPLATE_ID}/versions/1/derivation`,
      ifMatch: true,
      expectedId: TEMPLATE_DRAFT_ID,
      expectedInput: {
        organizationId: ORGANIZATION_ID,
        templateId: TEMPLATE_ID,
        versionNumber: 1,
        expectedEtag: ETAG,
      },
      expectedHeaders: { etag: ETAG },
    },
    {
      operation: 'OP-PLN-005',
      method: 'POST',
      service: 'deprecateSessionTemplateVersion',
      status: 200,
      path: `/organizations/${ORGANIZATION_ID}/session-templates/${TEMPLATE_ID}/versions/1/deprecation`,
      expectedId: TEMPLATE_VERSION_ID,
      expectedInput: { organizationId: ORGANIZATION_ID, templateId: TEMPLATE_ID, versionNumber: 1 },
    },
    {
      operation: 'OP-PLN-020',
      method: 'GET',
      service: 'listPrograms',
      status: 200,
      path: `/organizations/${ORGANIZATION_ID}/programs?limit=1`,
      expectedId: PROGRAM_ID,
      expectedInput: { organizationId: ORGANIZATION_ID, limit: 1 },
      expectedHeaders: { 'cache-control': 'private, max-age=0, must-revalidate' },
    },
    {
      operation: 'OP-PLN-006',
      method: 'POST',
      service: 'createProgram',
      status: 201,
      path: `/organizations/${ORGANIZATION_ID}/programs`,
      body: { title: ' Program A ' },
      expectedId: PROGRAM_ID,
      expectedInput: { organizationId: ORGANIZATION_ID, title: 'Program A' },
      expectedHeaders: {
        etag: ETAG,
        location: `/studio/v1/organizations/${ORGANIZATION_ID}/programs/${PROGRAM_ID}/draft`,
      },
    },
    {
      operation: 'OP-PLN-007',
      method: 'PUT',
      service: 'replaceProgramDraft',
      status: 200,
      path: `/organizations/${ORGANIZATION_ID}/programs/${PROGRAM_ID}/draft`,
      body: programDraftContent,
      ifMatch: true,
      expectedId: PROGRAM_DRAFT_ID,
      expectedInput: {
        organizationId: ORGANIZATION_ID,
        programId: PROGRAM_ID,
        expectedEtag: ETAG,
        content: programDraftContent,
      },
      expectedHeaders: { etag: ETAG },
    },
    {
      operation: 'OP-PLN-008',
      method: 'POST',
      service: 'publishProgramVersion',
      status: 201,
      path: `/organizations/${ORGANIZATION_ID}/programs/${PROGRAM_ID}/versions`,
      ifMatch: true,
      expectedId: PROGRAM_VERSION_ID,
      expectedDeprecatedWarning: true,
      expectedInput: { organizationId: ORGANIZATION_ID, programId: PROGRAM_ID, expectedEtag: ETAG },
      expectedHeaders: {
        location: `/organizations/${ORGANIZATION_ID}/programs/${PROGRAM_ID}/versions/1`,
      },
    },
    {
      operation: 'OP-PLN-009',
      method: 'POST',
      service: 'deprecateProgramVersion',
      status: 200,
      path: `/organizations/${ORGANIZATION_ID}/programs/${PROGRAM_ID}/versions/1/deprecation`,
      expectedId: PROGRAM_VERSION_ID,
      expectedInput: { organizationId: ORGANIZATION_ID, programId: PROGRAM_ID, versionNumber: 1 },
    },
    {
      operation: 'OP-PLN-018',
      method: 'GET',
      service: 'listRelationshipAssignments',
      status: 200,
      path: `${ASSIGNMENTS_PATH}?limit=1`,
      expectedId: ASSIGNMENT_ID,
      expectedInput: { organizationId: ORGANIZATION_ID, relationshipId: RELATIONSHIP_ID, limit: 1 },
      expectedHeaders: { 'cache-control': 'private, no-store' },
    },
    {
      operation: 'OP-PLN-010',
      method: 'POST',
      service: 'assignProgram',
      status: 201,
      path: ASSIGNMENTS_PATH,
      body: assignmentBody,
      expectedId: ASSIGNMENT_ID,
      expectedInput: {
        organizationId: ORGANIZATION_ID,
        relationshipId: RELATIONSHIP_ID,
        programVersionId: PROGRAM_VERSION_ID,
        startsOn: '2026-08-17',
        timezone: 'America/Bogota',
      },
      expectedHeaders: {
        'cache-control': 'no-store',
        location: `/studio/v1${ASSIGNMENTS_PATH}`,
      },
    },
    {
      operation: 'OP-PLN-012',
      method: 'PATCH',
      service: 'reschedulePlannedSession',
      status: 200,
      path: SESSION_PATH,
      body: rescheduleBody,
      expectedId: PLANNED_SESSION_ID,
      expectedInput: {
        organizationId: ORGANIZATION_ID,
        plannedSessionId: PLANNED_SESSION_ID,
        scheduledOn: '2026-08-19',
        expectedRevision: 0,
      },
      expectedHeaders: { 'cache-control': 'no-store' },
    },
    {
      operation: 'OP-PLN-013',
      method: 'POST',
      service: 'revisePrescription',
      status: 201,
      path: REVISIONS_PATH,
      body: revisionBody,
      expectedId: REVISION_ID,
      expectedInput: {
        organizationId: ORGANIZATION_ID,
        assignmentId: ASSIGNMENT_ID,
        plannedStepId: PLANNED_STEP_ID,
        kind: 'target_load',
        value: 70,
        unitCode: 'kg',
      },
      expectedHeaders: { 'cache-control': 'no-store' },
    },
    {
      operation: 'OP-PLN-014',
      method: 'POST',
      service: 'cancelAssignment',
      status: 200,
      path: CANCELLATION_PATH,
      expectedId: ASSIGNMENT_ID,
      expectedInput: { organizationId: ORGANIZATION_ID, assignmentId: ASSIGNMENT_ID },
      expectedHeaders: { 'cache-control': 'no-store' },
    },
  ]

  for (const endpoint of endpoints) {
    test(`T-PLN-API-${endpoint.operation.slice(-3)} exercises ${endpoint.operation} status, DTO, headers and input`, async () => {
      const calls: CapturedCall[] = []
      const response = await studioPlanningRoutes(planningService(calls), sessionService()).request(
        endpoint.path,
        requestInit(endpoint),
      )
      expect(response.status).toBe(endpoint.status)
      const contractOperation = allfitV1ContractManifest.operations.find(
        (operation) => operation.allfitOperation === endpoint.operation,
      )
      const contractResponses: readonly string[] = contractOperation?.responses ?? []
      expect(contractResponses).toContain(String(endpoint.status))
      expect(response.headers.get('content-type')).toContain('application/json')
      for (const [name, value] of Object.entries(endpoint.expectedHeaders ?? {})) {
        expect(response.headers.get(name)).toBe(value)
      }
      if (endpoint.method !== 'GET') expect(response.headers.get('idempotent-replay')).toBe('true')
      const responseBody: unknown = await response.json()
      expect(responseResourceId(responseBody)).toBe(endpoint.expectedId)
      if (endpoint.expectedDeprecatedWarning) {
        expect(responseBody).toMatchObject({
          deprecated_template_version_ids: [TEMPLATE_VERSION_ID],
        })
      }
      expect(calls).toHaveLength(1)
      expect(calls[0]?.operation).toBe(endpoint.service)
      expect(calls[0]?.input).toMatchObject(endpoint.expectedInput)
      if (endpoint.method === 'GET') expect(calls[0]?.input.requestId).toBeString()
      else expect(Buffer.isBuffer(calls[0]?.input.requestHash)).toBeTrue()
    })
  }

  test('T-PLN-API-030 normalizes command hashes and binds them to method and path', async () => {
    const calls: CapturedCall[] = []
    const app = studioPlanningRoutes(planningService(calls), sessionService())
    await app.request(
      `/organizations/${ORGANIZATION_ID}/session-templates`,
      requestInit({
        method: 'POST',
        body: { title: 'Strength A', discipline_code: 'test_strength' },
      }),
    )
    await app.request(
      `/organizations/${ORGANIZATION_ID}/session-templates`,
      requestInit({
        method: 'POST',
        body: { discipline_code: 'test_strength', title: 'Strength A' },
      }),
    )
    await app.request(
      `/organizations/${ORGANIZATION_ID}/programs`,
      requestInit({
        method: 'POST',
        body: { title: 'Strength A' },
      }),
    )
    await app.request(
      `/organizations/${ORGANIZATION_ID}/programs/${PROGRAM_ID}/draft`,
      requestInit({ method: 'PUT', body: programDraftContent, ifMatch: ETAG }),
    )
    await app.request(
      `/organizations/${ORGANIZATION_ID}/programs/${PROGRAM_ID}/draft`,
      requestInit({
        method: 'PUT',
        body: programDraftContent,
        ifMatch: `"sha256:${'B'.repeat(43)}"`,
      }),
    )
    const hashes = calls.map((call) => call.input.requestHash)
    expect(Buffer.isBuffer(hashes[0])).toBeTrue()
    expect(hashes[0]).toEqual(hashes[1])
    expect(hashes[0]).not.toEqual(hashes[2])
    expect(hashes[3]).not.toEqual(hashes[4])
  })

  test('T-PLN-API-031 returns template publication issues as contract ValidationIssue DTOs', async () => {
    const response = await studioPlanningRoutes(
      planningService([], { incompleteTemplate: true }),
      sessionService(),
    ).request(
      `/organizations/${ORGANIZATION_ID}/session-templates/${TEMPLATE_ID}/versions`,
      requestInit({ method: 'POST', ifMatch: true }),
    )
    expect(response.status).toBe(422)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(await response.json()).toMatchObject({
      errors: [
        { code: 'title', path: '/title', message: 'A non-empty title is required.' },
        { code: 'steps', path: '/steps', message: 'At least one planned step is required.' },
        {
          code: 'activity-type',
          path: '/activity_type_id',
          message: 'A published compatible activity type is required.',
        },
      ],
    })
  })

  test('T-PLN-API-032 returns program publication issues as contract ValidationIssue DTOs', async () => {
    const response = await studioPlanningRoutes(
      planningService([], { incompleteProgram: true }),
      sessionService(),
    ).request(
      `/organizations/${ORGANIZATION_ID}/programs/${PROGRAM_ID}/versions`,
      requestInit({ method: 'POST', ifMatch: true }),
    )
    expect(response.status).toBe(422)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(await response.json()).toMatchObject({
      errors: [
        { code: 'sessions', path: '/sessions', message: 'At least one session is required.' },
      ],
    })
  })

  test('T-PLN-API-033 keeps authentication and precondition errors non-cacheable', async () => {
    const missingSession = await studioPlanningRoutes().request(
      `/organizations/${ORGANIZATION_ID}/session-templates`,
      { headers: { origin: 'https://studio.example.test' } },
    )
    expect(missingSession.status).toBe(401)
    expect(missingSession.headers.get('cache-control')).toBe('no-store')
    const missingPrecondition = await studioPlanningRoutes().request(
      `/organizations/${ORGANIZATION_ID}/programs/${PROGRAM_ID}/draft`,
      {
        method: 'PUT',
        headers: { origin: 'https://studio.example.test', 'content-type': 'application/json' },
      },
    )
    expect(missingPrecondition.status).toBe(428)
    expect(missingPrecondition.headers.get('cache-control')).toBe('no-store')
  })

  test('T-PLN-API-034 declares every status emitted by Planning handlers', () => {
    const expected: Record<string, string[]> = {
      'OP-PLN-019': ['200', '400', '401', '403', '404', '422', '503'],
      'OP-PLN-001': ['201', '400', '401', '403', '404', '409', '415', '422', '503'],
      'OP-PLN-002': ['200', '400', '401', '403', '404', '409', '415', '422', '428', '503'],
      'OP-PLN-003': ['201', '400', '401', '403', '404', '409', '415', '422', '428', '503'],
      'OP-PLN-021': ['200', '400', '401', '403', '404', '503'],
      'OP-PLN-004': ['200', '400', '401', '403', '404', '409', '415', '428', '503'],
      'OP-PLN-005': ['200', '400', '401', '403', '404', '409', '415', '503'],
      'OP-PLN-020': ['200', '400', '401', '403', '404', '422', '503'],
      'OP-PLN-006': ['201', '400', '401', '403', '404', '409', '415', '422', '503'],
      'OP-PLN-007': ['200', '400', '401', '403', '404', '409', '415', '422', '428', '503'],
      'OP-PLN-008': ['201', '400', '401', '403', '404', '409', '415', '422', '428', '503'],
      'OP-PLN-009': ['200', '400', '401', '403', '404', '409', '415', '503'],
      'OP-PLN-010': ['201', '400', '401', '403', '404', '409', '415', '422', '503'],
      'OP-PLN-018': ['200', '400', '401', '403', '404', '422', '503'],
      'OP-PLN-012': ['200', '400', '401', '403', '404', '409', '415', '422', '503'],
      'OP-PLN-013': ['201', '400', '401', '403', '404', '409', '415', '422', '503'],
      'OP-PLN-014': ['200', '400', '401', '403', '404', '409', '503'],
    }
    for (const [operationId, statuses] of Object.entries(expected)) {
      const operation = allfitV1ContractManifest.operations.find(
        (candidate) =>
          candidate.allfitOperation === operationId && candidate.path.startsWith('/studio/v1'),
      )
      const actual: readonly string[] = operation?.responses ?? []
      expect(actual).toEqual(statuses.sort())
    }
  })

  test('T-PLN-API-035 mounts Planning below the real Studio surface prefix', async () => {
    const app = new Hono()
    mountSurfaces(app)
    const response = await app.request(
      `/studio/v1/organizations/${ORGANIZATION_ID}/session-templates`,
      { headers: { origin: 'https://studio.example.test' } },
    )
    expect(response.status).toBe(401)
    expect(response.status).not.toBe(404)
  })

  test('T-PLN-API-036 emits the declared database failure states as problem responses', async () => {
    const cases: Array<{ error: unknown; status: number }> = [
      { error: databaseError('P0002'), status: 404 },
      { error: databaseError('42501'), status: 403 },
      { error: databaseError('23505'), status: 409 },
      { error: new Error('connection unavailable'), status: 503 },
    ]
    for (const testCase of cases) {
      const response = await studioPlanningRoutes(
        planningService([], { failure: testCase.error }),
        sessionService(),
      ).request(
        `/organizations/${ORGANIZATION_ID}/programs/${PROGRAM_ID}/draft`,
        requestInit({ method: 'PUT', body: programDraftContent, ifMatch: true }),
      )
      expect(response.status).toBe(testCase.status)
      expect(response.headers.get('content-type')).toContain('application/problem+json')
      expect(response.headers.get('cache-control')).toBe('no-store')
    }
    const invalidPath = await studioPlanningRoutes(planningService([]), sessionService()).request(
      '/organizations/not-a-uuid/programs',
      requestInit({ method: 'GET' }),
    )
    expect(invalidPath.status).toBe(400)
  })

  test('T-PLN-API-037 omits Idempotent-Replay on first execution and emits true on replay', async () => {
    const path = `/organizations/${ORGANIZATION_ID}/programs`
    const first = await studioPlanningRoutes(
      planningService([], { replayed: false }),
      sessionService(),
    ).request(path, requestInit({ method: 'POST', body: { title: 'Program A' } }))
    const replay = await studioPlanningRoutes(planningService([]), sessionService()).request(
      path,
      requestInit({ method: 'POST', body: { title: 'Program A' } }),
    )
    expect(first.headers.get('idempotent-replay')).toBeNull()
    expect(replay.headers.get('idempotent-replay')).toBe('true')
  })

  test('T-PLN-API-038 requires the canonical JSON representation on a command that carries a body', async () => {
    const response = await studioPlanningRoutes(planningService([]), sessionService()).request(
      `/organizations/${ORGANIZATION_ID}/programs`,
      {
        method: 'POST',
        headers: { ...commandHeaders(), 'content-type': 'text/plain' },
        body: JSON.stringify({ title: 'Program A' }),
      },
    )
    expect(response.status).toBe(415)
    expect(response.headers.get('cache-control')).toBe('no-store')
  })

  test('T-PLN-API-041 accepts a bodyless command without a media type and refuses a payload', async () => {
    const calls: CapturedCall[] = []
    const path = `/organizations/${ORGANIZATION_ID}/programs/${PROGRAM_ID}/versions/1/deprecation`
    const app = studioPlanningRoutes(planningService(calls), sessionService())
    const bodyless = await app.request(path, { method: 'POST', headers: commandHeaders() })
    expect(bodyless.status).toBe(200)
    const declared = await app.request(path, {
      method: 'POST',
      headers: { ...commandHeaders(), 'content-type': 'application/json' },
    })
    expect(declared.status).toBe(200)
    // The contract declares no body here, so the media type is not part of the
    // command and must not split one logical command across two receipts.
    expect(calls[0]?.input.requestHash).toEqual(calls[1]?.input.requestHash)
    const withPayload = await studioPlanningRoutes(planningService([]), sessionService()).request(
      path,
      {
        method: 'POST',
        headers: { ...commandHeaders(), 'content-type': 'application/json' },
        body: JSON.stringify({ unexpected: true }),
      },
    )
    expect(withPayload.status).toBe(415)
    expect(withPayload.headers.get('cache-control')).toBe('no-store')
  })

  test('T-PLN-API-042 ignores a precondition header the bodyless command does not declare', async () => {
    const calls: CapturedCall[] = []
    const path = `/organizations/${ORGANIZATION_ID}/session-templates/${TEMPLATE_ID}/versions/1/deprecation`
    const app = studioPlanningRoutes(planningService(calls), sessionService())
    await app.request(path, { method: 'POST', headers: commandHeaders() })
    await app.request(path, {
      method: 'POST',
      headers: { ...commandHeaders(), 'if-match': ETAG },
    })
    expect(calls[0]?.input.requestHash).toEqual(calls[1]?.input.requestHash)
  })

  test('T-PLN-API-039 exposes Retry-After for an in-progress idempotent command', async () => {
    const response = await studioPlanningRoutes(
      planningService([], { failure: databaseError('40001') }),
      sessionService(),
    ).request(
      `/organizations/${ORGANIZATION_ID}/programs/${PROGRAM_ID}/draft`,
      requestInit({ method: 'PUT', body: programDraftContent, ifMatch: true }),
    )
    expect(response.status).toBe(409)
    expect(response.headers.get('retry-after')).toBe('1')
  })

  test('T-PLN-API-043 reads the program version publishing names in Location', async () => {
    const calls: CapturedCall[] = []
    const app = studioPlanningRoutes(planningService(calls), sessionService())
    const published = await app.request(
      `/organizations/${ORGANIZATION_ID}/programs/${PROGRAM_ID}/versions`,
      requestInit({ method: 'POST', ifMatch: true }),
    )
    const location = published.headers.get('location')
    expect(location).toBe(`/organizations/${ORGANIZATION_ID}/programs/${PROGRAM_ID}/versions/1`)

    const response = await app.request(location ?? '', requestInit({ method: 'GET' }))
    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('private, max-age=0, must-revalidate')
    expect(response.headers.get('etag')).toBeString()
    expect(await response.json()).toEqual(programVersion)
    expect(calls[1]?.operation).toBe('readProgramVersion')
    expect(calls[1]?.input).toMatchObject({
      organizationId: ORGANIZATION_ID,
      programId: PROGRAM_ID,
      versionNumber: 1,
    })
    expect(calls[1]?.input.requestId).toBeString()
  })

  test('T-PLN-API-044 answers a program version it cannot show as absent, and validates the path', async () => {
    const path = `/organizations/${ORGANIZATION_ID}/programs/${PROGRAM_ID}/versions/1`
    const absent = await studioPlanningRoutes(
      planningService([], { failure: databaseError('P0002') }),
      sessionService(),
    ).request(path, requestInit({ method: 'GET' }))
    expect(absent.status).toBe(404)
    expect(absent.headers.get('content-type')).toContain('application/problem+json')

    const calls: CapturedCall[] = []
    const app = studioPlanningRoutes(planningService(calls), sessionService())
    const zero = await app.request(
      `/organizations/${ORGANIZATION_ID}/programs/${PROGRAM_ID}/versions/0`,
      requestInit({ method: 'GET' }),
    )
    const foreignOrigin = await app.request(path, {
      method: 'GET',
      headers: { ...commandHeaders(), origin: 'https://elsewhere.example.test' },
    })
    expect(zero.status).toBe(400)
    expect(foreignOrigin.status).toBe(403)
    expect(calls).toHaveLength(0)
  })

  test('T-PLN-API-045 hands a stale editor the current draft with its conflict', async () => {
    const current = { ...templateDraft, etag: 'W/"current"' }
    const stale = Object.assign(new Error('stale-draft'), {
      code: '40001',
      detail: JSON.stringify(current),
    })
    const response = await studioPlanningRoutes(
      planningService([], { failure: stale }),
      sessionService(),
    ).request(
      `/organizations/${ORGANIZATION_ID}/programs/${PROGRAM_ID}/draft`,
      requestInit({ method: 'PUT', body: programDraftContent, ifMatch: true }),
    )
    expect(response.status).toBe(409)
    expect(response.headers.get('retry-after')).toBeNull()
    expect(await response.json()).toMatchObject({ status: 409, current_state: current })
  })

  test('T-PLN-API-046 names the grant a missing permission needs, for assigning and for reading', async () => {
    const missing = (level: string) =>
      Object.assign(new Error('the person does not share her training at this level'), {
        code: 'AF430',
        detail: `relationship_training:${level}`,
      })
    const assigning = await studioPlanningRoutes(
      planningService([], { failure: missing('contribute') }),
      sessionService(),
    ).request(ASSIGNMENTS_PATH, requestInit({ method: 'POST', body: assignmentBody }))
    const reading = await studioPlanningRoutes(
      planningService([], { failure: missing('read') }),
      sessionService(),
    ).request(ASSIGNMENTS_PATH, requestInit({ method: 'GET' }))
    for (const [response, level] of [
      [assigning, 'contribute'],
      [reading, 'read'],
    ] as const) {
      expect(response.status).toBe(403)
      expect(response.headers.get('content-type')).toContain('application/problem+json')
      expect(response.headers.get('cache-control')).toBe('no-store')
      expect(await response.json()).toMatchObject({
        type: 'https://errors.allfit.invalid/scope-required',
        required_scope: { code: 'relationship_training', level },
      })
    }
  })

  test('T-PLN-API-047 refuses an assignment body outside the contract before reaching PostgreSQL', async () => {
    const calls: CapturedCall[] = []
    const app = studioPlanningRoutes(planningService(calls), sessionService())
    const invalid = [
      { starts_on: '2026-08-17' },
      { ...assignmentBody, starts_on: '2026-02-30' },
      { ...assignmentBody, starts_on: '17/08/2026' },
      { ...assignmentBody, program_version_id: 'not-a-uuid' },
      { ...assignmentBody, timezone: 'Bogota' },
      { ...assignmentBody, title: 'unexpected' },
    ]
    for (const body of invalid) {
      const response = await app.request(ASSIGNMENTS_PATH, requestInit({ method: 'POST', body }))
      expect(response.status).toBe(422)
    }
    expect(calls).toHaveLength(0)

    const withoutZone = await app.request(
      ASSIGNMENTS_PATH,
      requestInit({
        method: 'POST',
        body: { program_version_id: PROGRAM_VERSION_ID, starts_on: '2026-08-17' },
      }),
    )
    expect(withoutZone.status).toBe(201)
    expect(calls[0]?.input).not.toHaveProperty('timezone')
  })

  test('T-PLN-API-048 points each assignment refusal at the field it concerns', async () => {
    const response = await studioPlanningRoutes(
      planningService([], {
        failure: databaseValidationError(['program-version', 'starts-on', 'timezone']),
      }),
      sessionService(),
    ).request(ASSIGNMENTS_PATH, requestInit({ method: 'POST', body: assignmentBody }))
    expect(response.status).toBe(422)
    expect(await response.json()).toMatchObject({
      errors: [
        { code: 'program-version', path: '/program_version_id' },
        { code: 'starts-on', path: '/starts_on' },
        { code: 'timezone', path: '/timezone' },
      ],
    })
  })

  test('T-PLN-API-049 a relationship that ended in the meantime is a conflict', async () => {
    const response = await studioPlanningRoutes(
      planningService([], { failure: databaseError('55000') }),
      sessionService(),
    ).request(ASSIGNMENTS_PATH, requestInit({ method: 'POST', body: assignmentBody }))
    expect(response.status).toBe(409)
    const invalidPath = await studioPlanningRoutes(planningService([]), sessionService()).request(
      `/organizations/${ORGANIZATION_ID}/relationships/not-a-uuid/assignments`,
      requestInit({ method: 'GET' }),
    )
    expect(invalidPath.status).toBe(400)
  })

  test('T-PLN-API-176 hands a coach who read an old revision the session as it is now', async () => {
    const stale = Object.assign(new Error('stale-draft'), {
      code: '40001',
      detail: JSON.stringify(managedSession),
    })
    const response = await studioPlanningRoutes(
      planningService([], { failure: stale }),
      sessionService(),
    ).request(SESSION_PATH, requestInit({ method: 'PATCH', body: rescheduleBody }))
    expect(response.status).toBe(409)
    expect(await response.json()).toMatchObject({
      type: 'https://errors.allfit.invalid/stale-draft',
      current_state: managedSession,
    })
  })

  test('T-PLN-API-177 refuses a move outside the contract before reaching PostgreSQL', async () => {
    const calls: CapturedCall[] = []
    const app = studioPlanningRoutes(planningService(calls), sessionService())
    const invalid = [
      { scheduled_on: '2026-08-19' },
      { expected_revision: 0 },
      { ...rescheduleBody, scheduled_on: '2026-02-30' },
      { ...rescheduleBody, expected_revision: -1 },
      { ...rescheduleBody, expected_revision: 1.5 },
      { ...rescheduleBody, expected_revision: '0' },
      { ...rescheduleBody, status: 'cancelled' },
    ]
    for (const body of invalid) {
      const response = await app.request(SESSION_PATH, requestInit({ method: 'PATCH', body }))
      expect(response.status).toBe(422)
    }
    const invalidPath = await app.request(
      `/organizations/${ORGANIZATION_ID}/planned-sessions/not-a-uuid`,
      requestInit({ method: 'PATCH', body: rescheduleBody }),
    )
    expect(invalidPath.status).toBe(400)
    expect(calls).toHaveLength(0)
  })

  test('T-PLN-API-178 refuses an adjustment outside the contract, and passes each typed value', async () => {
    const calls: CapturedCall[] = []
    const app = studioPlanningRoutes(planningService(calls), sessionService())
    const invalid = [
      { kind: 'target_load', value: 70 },
      { ...revisionBody, planned_step_id: 'not-a-uuid' },
      { ...revisionBody, kind: 'tempo' },
      { ...revisionBody, value: true },
      { ...revisionBody, value: { amount: 70 } },
      { ...revisionBody, value: null },
      { ...revisionBody, unit_code: 7 },
      { ...revisionBody, unit_code: '' },
      { ...revisionBody, reason: 'deload' },
    ]
    for (const body of invalid) {
      const response = await app.request(REVISIONS_PATH, requestInit({ method: 'POST', body }))
      expect(response.status).toBe(422)
    }
    expect(calls).toHaveLength(0)

    const note = await app.request(
      REVISIONS_PATH,
      requestInit({
        method: 'POST',
        body: { planned_step_id: PLANNED_STEP_ID, kind: 'notes', value: 'Easy', unit_code: null },
      }),
    )
    expect(note.status).toBe(201)
    expect(calls[0]?.input).toMatchObject({ kind: 'notes', value: 'Easy', unitCode: null })
  })

  test('T-PLN-API-179 points each move and adjustment refusal at the field it concerns', async () => {
    const moving = await studioPlanningRoutes(
      planningService([], {
        failure: databaseValidationError(['scheduled-on', 'scheduled-on-week']),
      }),
      sessionService(),
    ).request(SESSION_PATH, requestInit({ method: 'PATCH', body: rescheduleBody }))
    expect(moving.status).toBe(422)
    expect(await moving.json()).toMatchObject({
      errors: [
        { code: 'scheduled-on', path: '/scheduled_on' },
        { code: 'scheduled-on-week', path: '/scheduled_on' },
      ],
    })
    const adjusting = await studioPlanningRoutes(
      planningService([], {
        failure: databaseValidationError(['planned-step', 'kind', 'value', 'unit-code']),
      }),
      sessionService(),
    ).request(REVISIONS_PATH, requestInit({ method: 'POST', body: revisionBody }))
    expect(adjusting.status).toBe(422)
    expect(await adjusting.json()).toMatchObject({
      errors: [
        { code: 'planned-step', path: '/planned_step_id' },
        { code: 'kind', path: '/kind' },
        { code: 'value', path: '/value' },
        { code: 'unit-code', path: '/unit_code' },
      ],
    })
  })

  test('T-PLN-API-180 a cancellation takes no payload, names the missing grant, and conflicts once unmanaged', async () => {
    const calls: CapturedCall[] = []
    const withPayload = await studioPlanningRoutes(
      planningService(calls),
      sessionService(),
    ).request(CANCELLATION_PATH, requestInit({ method: 'POST', body: { reason: 'moved away' } }))
    expect(withPayload.status).toBe(415)
    expect(calls).toHaveLength(0)

    const missing = Object.assign(
      new Error('the person does not share her training at this level'),
      {
        code: 'AF430',
        detail: 'relationship_training:contribute',
      },
    )
    const withoutGrant = await studioPlanningRoutes(
      planningService([], { failure: missing }),
      sessionService(),
    ).request(CANCELLATION_PATH, requestInit({ method: 'POST' }))
    expect(withoutGrant.status).toBe(403)
    expect(await withoutGrant.json()).toMatchObject({
      required_scope: { code: 'relationship_training', level: 'contribute' },
    })

    const unmanaged = await studioPlanningRoutes(
      planningService([], { failure: databaseError('55000') }),
      sessionService(),
    ).request(CANCELLATION_PATH, requestInit({ method: 'POST' }))
    expect(unmanaged.status).toBe(409)
  })

  test('T-PLN-API-181 lets Studio send a move from the browser', async () => {
    const response = await studioPlanningRoutes(planningService([]), sessionService()).request(
      SESSION_PATH,
      {
        method: 'OPTIONS',
        headers: {
          origin: 'https://studio.example.test',
          'access-control-request-method': 'PATCH',
        },
      },
    )
    expect(response.headers.get('access-control-allow-methods')).toContain('PATCH')
  })

  test('T-PLN-API-040 rejects an originally overlong padded title', async () => {
    const response = await studioPlanningRoutes(planningService([]), sessionService()).request(
      `/organizations/${ORGANIZATION_ID}/programs`,
      requestInit({ method: 'POST', body: { title: `Program${' '.repeat(154)}` } }),
    )
    expect(response.status).toBe(422)
  })
})

function commandHeaders(): Record<string, string> {
  return {
    origin: 'https://studio.example.test',
    cookie: `${STUDIO_SESSION_COOKIE}=opaque-session`,
    'idempotency-key': IDEMPOTENCY_KEY,
    'command-id': COMMAND_ID,
  }
}

function requestInit(input: {
  method: string
  body?: unknown
  ifMatch?: boolean | string
}): RequestInit {
  const headers: Record<string, string> = {
    origin: 'https://studio.example.test',
    cookie: `${STUDIO_SESSION_COOKIE}=opaque-session`,
  }
  if (input.method !== 'GET') {
    headers['idempotency-key'] = IDEMPOTENCY_KEY
    headers['command-id'] = COMMAND_ID
    if (input.body !== undefined) headers['content-type'] = 'application/json'
  }
  if (input.ifMatch) headers['if-match'] = typeof input.ifMatch === 'string' ? input.ifMatch : ETAG
  return {
    method: input.method,
    headers,
    ...(input.body === undefined ? {} : { body: JSON.stringify(input.body) }),
  }
}

function responseResourceId(value: unknown): unknown {
  if (typeof value !== 'object' || value === null) return undefined
  if ('id' in value) return value.id
  if ('data' in value && Array.isArray(value.data)) return value.data[0]?.id
  return undefined
}

function planningService(
  calls: CapturedCall[],
  errors: {
    incompleteTemplate?: boolean
    incompleteProgram?: boolean
    failure?: unknown
    replayed?: boolean
    missingDraft?: boolean
  } = {},
): StudioPlanningService {
  const capture = <T>(operation: string, input: object, resource: T) => {
    calls.push({ operation, input: input as Record<string, unknown> })
    return Promise.resolve({ resource, replayed: errors.replayed ?? true })
  }
  return {
    createSessionTemplate: (_actor, input) =>
      capture('createSessionTemplate', input, sessionTemplate),
    replaceSessionTemplateDraft: (_actor, input) =>
      capture('replaceSessionTemplateDraft', input, templateDraft),
    publishSessionTemplateVersion: (_actor, input) => {
      if (errors.incompleteTemplate) {
        throw databaseValidationError(['title', 'steps', 'activity-type'])
      }
      return capture('publishSessionTemplateVersion', input, templateVersion)
    },
    deriveSessionTemplateVersion: (_actor, input) =>
      capture('deriveSessionTemplateVersion', input, templateDraft),
    deprecateSessionTemplateVersion: (_actor, input) =>
      capture('deprecateSessionTemplateVersion', input, templateVersion),
    createProgram: (_actor, input) => capture('createProgram', input, program),
    replaceProgramDraft: (_actor, input) => {
      if (errors.failure) throw errors.failure
      return capture('replaceProgramDraft', input, programDraft)
    },
    publishProgramVersion: (_actor, input) => {
      if (errors.incompleteProgram) throw databaseValidationError(['sessions'])
      return capture('publishProgramVersion', input, programVersion)
    },
    deprecateProgramVersion: (_actor, input) => {
      if (errors.failure) throw errors.failure
      return capture('deprecateProgramVersion', input, programVersion)
    },
    assignProgram: (_actor, input) => {
      if (errors.failure) throw errors.failure
      return capture('assignProgram', input, programAssignment)
    },
    reschedulePlannedSession: (_actor, input) => {
      if (errors.failure) throw errors.failure
      return capture('reschedulePlannedSession', input, managedSession)
    },
    revisePrescription: (_actor, input) => {
      if (errors.failure) throw errors.failure
      return capture('revisePrescription', input, prescriptionRevision)
    },
    cancelAssignment: (_actor, input) => {
      if (errors.failure) throw errors.failure
      return capture('cancelAssignment', input, assignmentCancellation)
    },
    listRelationshipAssignments: (_actor, input) => {
      if (errors.failure) return Promise.reject(errors.failure)
      calls.push({
        operation: 'listRelationshipAssignments',
        input: input as Record<string, unknown>,
      })
      return Promise.resolve({ items: [relationshipAssignment], hasMore: false })
    },
    listSessionTemplates: (_actor, input) => {
      calls.push({ operation: 'listSessionTemplates', input: input as Record<string, unknown> })
      return Promise.resolve({ items: [sessionTemplate], hasMore: false })
    },
    listPrograms: (_actor, input) => {
      calls.push({ operation: 'listPrograms', input: input as Record<string, unknown> })
      return Promise.resolve({ items: [program], hasMore: false })
    },
    readSessionTemplateVersion: (_actor, input) => {
      calls.push({
        operation: 'readSessionTemplateVersion',
        input: input as Record<string, unknown>,
      })
      return Promise.resolve(templateVersion)
    },
    readSessionTemplateDraft: (_actor, input) => {
      calls.push({
        operation: 'readSessionTemplateDraft',
        input: input as Record<string, unknown>,
      })
      return Promise.resolve(errors.missingDraft ? null : templateDraft)
    },
    readProgramVersion: (_actor, input) => {
      if (errors.failure) return Promise.reject(errors.failure)
      calls.push({ operation: 'readProgramVersion', input: input as Record<string, unknown> })
      return Promise.resolve(programVersion)
    },
  }
}

function sessionService(): StudioSessionService {
  const unused = async (): Promise<never> => {
    throw new Error('This session operation is outside the Planning handler test')
  }
  return {
    completeCode: unused,
    readSession: unused,
    resolveActor: async () => ({
      accountId: '019d0000-0000-7000-8000-000000000002',
      personId: PERSON_ID,
    }),
    resolveAccountIdentity: unused,
    logout: unused,
  }
}

function databaseValidationError(errors: string[]): Error & { code: string; detail: string } {
  return Object.assign(new Error('incomplete draft'), {
    code: '22023',
    detail: JSON.stringify(errors),
  })
}

function databaseError(code: string): Error & { code: string } {
  return Object.assign(new Error('database failure'), { code })
}

function colonPath(path: string): string {
  return path.replaceAll(/\{([^}]+)\}/g, ':$1').replace('/studio/v1', '')
}
