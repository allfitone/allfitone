import { beforeEach, expect, test } from 'bun:test'

import { createWorkerApp } from './main.js'
import type { TelemetryEventFor } from '@allfitone/telemetry'
import type { ServerTelemetryAdapter } from '@allfitone/telemetry/posthog-node'
import type { OperationalLogAdapter } from '@allfitone/telemetry/posthog-otlp-logs'
import type { InvitationBatchResult } from './invitations.js'
import type { BackofficeAuthBatchResult } from './backoffice-auth.js'
import type { AccountRecoveryBatchResult } from './account-recovery.js'
import type { PlatformDutyLapseResult } from './platform-duties.js'
import type { PrivacyDispositionResult } from './privacy-dispositions.js'
import type { JobRun, WorkerJobProcessors } from './index.js'

type WorkerEvent = TelemetryEventFor<'worker.job.completed.v1'>

beforeEach(() => {
  process.env.CRON_SECRET = 'cron-test-secret'
})

test('rejects cron requests without the exact bearer secret', async () => {
  const response = await createWorkerApp(successfulProcessors()).request('/cron/outbox')
  expect(response.status).toBe(401)
  expect(response.headers.get('cache-control')).toBe('no-store')
  expect(response.headers.has('access-control-allow-origin')).toBeFalse()
})

test('serves the batch on one path only', async () => {
  const response = await createWorkerApp(successfulProcessors()).request('/api/cron/outbox', {
    headers: { authorization: 'Bearer cron-test-secret' },
  })
  expect(response.status).toBe(404)
})

test('runs the batch after authenticating the scheduler', async () => {
  const captured: unknown[] = []
  const telemetry: ServerTelemetryAdapter = {
    capture: (event) => captured.push(event),
    shutdown: async () => undefined,
  }
  const response = await createWorkerApp(
    successfulProcessors(),
    telemetry,
    operationalLogs(),
  ).request('/cron/outbox', {
    headers: { authorization: 'Bearer cron-test-secret' },
  })
  expect(response.status).toBe(200)
  await expect(response.json()).resolves.toEqual({
    invitations: invitationResult(),
    backofficeAuthentication: backofficeResult(),
    accountRecovery: recoveryResult(),
    platformDuties: lapseResult(),
    privacyDispositions: dispositionResult(),
  })
  expect(captured).toHaveLength(6)
  for (const job of [
    'invitation_delivery',
    'backoffice_auth_cleanup',
    'account_recovery_delivery',
    'platform_duty_lapse',
    'privacy_disposition',
  ]) {
    expect(captured).toContainEqual(
      expect.objectContaining({
        event: 'worker.job.completed.v1',
        properties: expect.objectContaining({ job, outcome: 'completed', item_count: 0 }),
      }),
    )
  }
  expect(captured[5]).toMatchObject({
    event: 'worker.job.completed.v1',
    properties: { job: 'outbox_batch', outcome: 'completed', item_count: 0 },
  })
})

test('lapses the legal holds past their date and executes the deletions they let go', async () => {
  // HU-BO-033 criteria 1 and 4: nothing else ends a hold, or deletes what it kept.
  const captured: WorkerEvent[] = []
  const telemetry: ServerTelemetryAdapter = {
    capture: (event) => {
      if (event.event === 'worker.job.completed.v1') captured.push(event)
    },
    shutdown: async () => undefined,
  }
  const processors = successfulProcessors()
  processors.privacyDisposition = async () =>
    dispositionResult({ claimed: 3, lapsed: 1, executed: 2 })

  const response = await createWorkerApp(processors, telemetry, operationalLogs()).request(
    '/cron/outbox',
    { headers: { authorization: 'Bearer cron-test-secret' } },
  )

  expect(response.status).toBe(200)
  await expect(response.json()).resolves.toMatchObject({
    privacyDispositions: { claimed: 3, deadOrDelayed: 0, lapsed: 1, executed: 2 },
  })
  expect(captured).toContainEqual(
    expect.objectContaining({
      properties: expect.objectContaining({
        job: 'privacy_disposition',
        outcome: 'completed',
        item_count: 3,
      }),
    }),
  )
})

test('lapses the platform duties past their window every minute, and counts them', async () => {
  // HU-BO-028 criterion 5: nothing else notices a duty running out of time.
  const captured: WorkerEvent[] = []
  const telemetry: ServerTelemetryAdapter = {
    capture: (event) => {
      if (event.event === 'worker.job.completed.v1') captured.push(event)
    },
    shutdown: async () => undefined,
  }
  const processors = successfulProcessors()
  processors.platformDutyLapse = async () => lapseResult({ claimed: 2, lapsed: 2 })

  const response = await createWorkerApp(processors, telemetry, operationalLogs()).request(
    '/cron/outbox',
    { headers: { authorization: 'Bearer cron-test-secret' } },
  )

  expect(response.status).toBe(200)
  await expect(response.json()).resolves.toMatchObject({
    platformDuties: { claimed: 2, deadOrDelayed: 0, lapsed: 2 },
  })
  expect(captured).toContainEqual(
    expect.objectContaining({
      properties: expect.objectContaining({
        job: 'platform_duty_lapse',
        outcome: 'completed',
        item_count: 2,
      }),
    }),
  )
})

test('marks individual and aggregate jobs as retrying when work was delayed', async () => {
  const captured: WorkerEvent[] = []
  const telemetry: ServerTelemetryAdapter = {
    capture: (event) => {
      if (event.event === 'worker.job.completed.v1') captured.push(event)
    },
    shutdown: async () => undefined,
  }
  const processors = successfulProcessors()
  processors.accountRecoveryDelivery = async () => recoveryResult({ claimed: 2, deadOrDelayed: 1 })

  const response = await createWorkerApp(processors, telemetry, operationalLogs()).request(
    '/cron/outbox',
    { headers: { authorization: 'Bearer cron-test-secret' } },
  )

  expect(response.status).toBe(200)
  expect(captured.map(({ properties }) => [properties?.job, properties?.outcome])).toEqual([
    ['invitation_delivery', 'completed'],
    ['backoffice_auth_cleanup', 'completed'],
    ['account_recovery_delivery', 'retrying'],
    ['platform_duty_lapse', 'completed'],
    ['privacy_disposition', 'completed'],
    ['outbox_batch', 'retrying'],
  ])
  expect(captured[5]?.properties.item_count).toBe(2)
})

test('emits failed job and aggregate events without unreliable item counts', async () => {
  const captured: WorkerEvent[] = []
  const logged: unknown[] = []
  let recoveryRuns = 0
  const telemetry: ServerTelemetryAdapter = {
    capture: (event) => {
      if (event.event === 'worker.job.completed.v1') captured.push(event)
    },
    shutdown: async () => undefined,
  }
  const processors = successfulProcessors()
  processors.backofficeAuthCleanup = async () => Promise.reject(new Error('provider unavailable'))
  processors.accountRecoveryDelivery = async () => {
    recoveryRuns += 1
    return recoveryResult()
  }

  const response = await createWorkerApp(processors, telemetry, operationalLogs(logged)).request(
    '/cron/outbox',
    { headers: { authorization: 'Bearer cron-test-secret' } },
  )

  expect(response.status).toBe(503)
  expect(recoveryRuns).toBe(0)
  expect(captured.map(({ properties }) => [properties?.job, properties?.outcome])).toEqual([
    ['invitation_delivery', 'completed'],
    ['backoffice_auth_cleanup', 'failed'],
    ['outbox_batch', 'failed'],
  ])
  expect(captured[1]?.properties).not.toHaveProperty('item_count')
  expect(captured[2]?.properties).not.toHaveProperty('item_count')
  expect(logged).toHaveLength(2)
})

test('stops sequential execution when invitation delivery fails and logs both failures', async () => {
  const captured: WorkerEvent[] = []
  const logged: unknown[] = []
  let cleanupRuns = 0
  const telemetry: ServerTelemetryAdapter = {
    capture: (event) => {
      if (event.event === 'worker.job.completed.v1') captured.push(event)
    },
    shutdown: async () => undefined,
  }
  const processors = successfulProcessors()
  processors.invitationDelivery = async () => Promise.reject(new Error('queue unavailable'))
  processors.backofficeAuthCleanup = async () => {
    cleanupRuns += 1
    return backofficeResult()
  }

  const response = await createWorkerApp(processors, telemetry, operationalLogs(logged)).request(
    '/cron/outbox',
    { headers: { authorization: 'Bearer cron-test-secret' } },
  )

  expect(response.status).toBe(503)
  expect(cleanupRuns).toBe(0)
  expect(captured.map(({ properties }) => [properties?.job, properties?.outcome])).toEqual([
    ['invitation_delivery', 'failed'],
    ['outbox_batch', 'failed'],
  ])
  expect(captured.every(({ properties }) => !('item_count' in properties))).toBeTrue()
  expect(logged).toHaveLength(2)
})

function successfulProcessors(): WorkerJobProcessors {
  return {
    invitationDelivery: async () => invitationResult(),
    backofficeAuthCleanup: async () => backofficeResult(),
    accountRecoveryDelivery: async () => recoveryResult(),
    platformDutyLapse: async () => lapseResult(),
    privacyDisposition: async () => dispositionResult(),
    recordJobRun: async () => undefined,
  }
}

// HU-BO-031 c2: the jobs reported to telemetry only, so their failures were visible
// nowhere in the Backoffice. Each run now leaves a row the diagnosis reads.
test('records each job it ran, and the one that failed with its error code', async () => {
  const runs: JobRun[] = []
  const processors = successfulProcessors()
  processors.recordJobRun = async (run) => {
    runs.push(run)
  }
  processors.accountRecoveryDelivery = async () => Promise.reject(new Error('provider down'))

  const response = await createWorkerApp(
    processors,
    { capture: () => undefined, shutdown: async () => undefined },
    operationalLogs([]),
  ).request('/cron/outbox', { headers: { authorization: 'Bearer cron-test-secret' } })

  expect(response.status).toBe(503)
  expect(runs.map((run) => [run.job, run.outcome, run.errorCode])).toEqual([
    ['invitation_delivery', 'succeeded', null],
    ['backoffice_auth_cleanup', 'succeeded', null],
    ['account_recovery_delivery', 'failed', 'account_recovery_delivery_failed'],
  ])
  expect(runs.every((run) => run.startedAt instanceof Date)).toBeTrue()
})

test('a run that cannot be recorded never changes what the batch did', async () => {
  const processors = successfulProcessors()
  processors.recordJobRun = async () => Promise.reject(new Error('database down'))

  const response = await createWorkerApp(
    processors,
    { capture: () => undefined, shutdown: async () => undefined },
    operationalLogs([]),
  ).request('/cron/outbox', { headers: { authorization: 'Bearer cron-test-secret' } })

  expect(response.status).toBe(200)
})

function dispositionResult(
  overrides: Partial<PrivacyDispositionResult> = {},
): PrivacyDispositionResult {
  return { claimed: 0, deadOrDelayed: 0, lapsed: 0, executed: 0, ...overrides }
}

function lapseResult(overrides: Partial<PlatformDutyLapseResult> = {}): PlatformDutyLapseResult {
  return { claimed: 0, deadOrDelayed: 0, lapsed: 0, ...overrides }
}

function invitationResult(overrides: Partial<InvitationBatchResult> = {}): InvitationBatchResult {
  return { claimed: 0, delivered: 0, deadOrDelayed: 0, skipped: 0, expired: 0, ...overrides }
}

function backofficeResult(
  overrides: Partial<BackofficeAuthBatchResult> = {},
): BackofficeAuthBatchResult {
  return {
    expired: 0,
    sessionsExpired: 0,
    claimed: 0,
    completed: 0,
    deadOrDelayed: 0,
    skipped: 0,
    ...overrides,
  }
}

function recoveryResult(
  overrides: Partial<AccountRecoveryBatchResult> = {},
): AccountRecoveryBatchResult {
  return { claimed: 0, delivered: 0, deadOrDelayed: 0, skipped: 0, ...overrides }
}

function operationalLogs(captured: unknown[] = []): OperationalLogAdapter {
  return {
    emit: (_kind, event) => captured.push(event),
    shutdown: async () => undefined,
  }
}
