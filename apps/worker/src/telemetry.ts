import {
  createPostHogServerTelemetry,
  type ServerTelemetryAdapter,
} from '@allfitone/telemetry/posthog-node'
import {
  createPostHogOtlpLogs,
  type OperationalLogAdapter,
} from '@allfitone/telemetry/posthog-otlp-logs'
import { telemetryEnvironmentFromRuntime } from '@allfitone/telemetry/node'

let cached: ServerTelemetryAdapter | undefined
let cachedLogs: OperationalLogAdapter | undefined

export function workerTelemetry(): ServerTelemetryAdapter {
  if (cached) return cached
  const apiKey = serverApiKey()
  const host = process.env.POSTHOG_HOST
  cached = createPostHogServerTelemetry({
    ...(apiKey ? { apiKey } : {}),
    ...(host ? { host } : {}),
  })
  return cached
}

export function workerOperationalLogs(): OperationalLogAdapter {
  if (cachedLogs) return cachedLogs
  const apiKey = serverApiKey()
  const host = process.env.POSTHOG_HOST
  cachedLogs = createPostHogOtlpLogs({
    ...(apiKey ? { apiKey } : {}),
    ...(host ? { host } : {}),
    serviceName: 'allfit-worker',
  })
  return cachedLogs
}

export async function shutdownWorkerTelemetry(): Promise<void> {
  await Promise.all([cached?.shutdown(), cachedLogs?.shutdown()])
}

function serverApiKey(): string | undefined {
  return telemetryEnvironmentFromRuntime() === 'production' &&
    process.env.ANALYTICS_SERVER_ENABLED === 'true'
    ? process.env.POSTHOG_SERVER_API_KEY
    : undefined
}
