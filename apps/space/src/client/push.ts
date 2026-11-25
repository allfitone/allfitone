/**
 * Getting this phone ready for push (`NT-4`), and letting it go on sign-out.
 * ADR-054, `OP-IDN-072`/`OP-IDN-073`.
 *
 * **An installation id, made once.** The API knows a phone by a UUID the app generates
 * the first time it is needed and keeps; signing out and in again is the same phone, so
 * the token moves rather than piling up. The id says nothing about her.
 *
 * **Three things must hold before a token exists**: the phone said yes, the build knows
 * its EAS project (the Expo push service names every token after one), and the platform
 * is iOS or Android. Without the project id the app cannot ask for a token at all, and
 * that is a state of this build, not a failure: `enable` answers `unavailable` and the
 * screens say push is not here yet. Push delivery is off server-side until the project
 * has Apple and Google credentials (ADR-054 §7), so nothing is lost meanwhile.
 *
 * **Asking is the person's move; refreshing is not.** `refresh` runs on sign-in and on
 * every start and never shows a prompt: it registers only when permission is already
 * granted, which keeps the token current as the contract asks. `enable` is what `NT-4`
 * calls when she presses «Activar avisos», and only it asks.
 *
 * Every native piece is injected, so the whole decision runs under `bun test`.
 */

import type { AllfitV1Schemas } from '@allfitone/contracts'

export type PushPlatform = AllfitV1Schemas['SpacePushPlatform']
export type PushRegistration = AllfitV1Schemas['SpacePushDeviceRegistration']

export type PushPermission = 'granted' | 'undetermined' | 'denied'

export type PushOutcome =
  /** The token reached the API: push can be turned on. */
  | 'registered'
  /** She said no, or said no before and the phone will not ask again. */
  | 'denied'
  /** This build cannot get a token: no EAS project id, or not a phone. */
  | 'unavailable'
  /** The phone or the API failed; trying again may work. */
  | 'failed'

export interface PushDependencies {
  /** The EAS project id this build carries; undefined when it has none. */
  readonly projectId: string | undefined
  readonly platform: PushPlatform | null
  readonly readPermission: () => Promise<PushPermission>
  /** Shows the system prompt; answers what she chose. */
  readonly requestPermission: () => Promise<PushPermission>
  readonly expoToken: (projectId: string) => Promise<string>
  readonly installationId: () => Promise<string>
  /** The id kept by an earlier run, without making one; null if none was ever made. */
  readonly storedInstallationId: () => Promise<string | null>
  readonly register: (deviceId: string, registration: PushRegistration) => Promise<unknown>
  readonly retire: (deviceId: string) => Promise<void>
}

export interface PushFlow {
  /** Whether the screens can offer push at all, before asking anything. */
  readonly supported: boolean
  /** Registers silently when permission already holds; never prompts, never throws. */
  refresh(): Promise<PushOutcome | 'skipped'>
  /** Asks if it may, then registers. */
  enable(): Promise<PushOutcome>
  /** Tells the API this phone stops receiving push; never throws. */
  retire(): Promise<void>
}

/** `ios` and `android`; anything else (web, a test runner) has no push. */
export function pushPlatform(os: string): PushPlatform | null {
  return os === 'ios' || os === 'android' ? os : null
}

/**
 * The EAS project id from the app config, where `eas init` writes it, or from the
 * build's own EAS config. Empty or absent is undefined.
 */
export function easProjectId(
  expoConfig: { readonly extra?: { readonly eas?: { readonly projectId?: unknown } } } | null,
  easConfig: { readonly projectId?: unknown } | null,
): string | undefined {
  const candidates = [expoConfig?.extra?.eas?.projectId, easConfig?.projectId]
  const found = candidates.find(
    (value): value is string => typeof value === 'string' && value.trim() !== '',
  )
  return found
}

/** The installation id kept under `read`/`write`, made with `make` the first time. */
export async function keptInstallationId(storage: {
  readonly read: () => Promise<string | null>
  readonly write: (value: string) => Promise<void>
  readonly make: () => string
}): Promise<string> {
  const held = await storage.read()
  if (held) return held
  const made = storage.make()
  await storage.write(made)
  return made
}

export function createPushFlow(dependencies: PushDependencies): PushFlow {
  const { projectId, platform } = dependencies
  const supported = projectId !== undefined && platform !== null

  const register = async (): Promise<PushOutcome> => {
    if (projectId === undefined || platform === null) return 'unavailable'
    try {
      const token = await dependencies.expoToken(projectId)
      const deviceId = await dependencies.installationId()
      await dependencies.register(deviceId, { token, platform })
      return 'registered'
    } catch {
      return 'failed'
    }
  }

  return {
    supported,
    async refresh() {
      if (!supported) return 'skipped'
      const permission = await dependencies.readPermission().catch(() => 'denied' as const)
      if (permission !== 'granted') return 'skipped'
      return register()
    },
    async enable() {
      if (!supported) return 'unavailable'
      try {
        const current = await dependencies.readPermission()
        const answer = current === 'granted' ? current : await dependencies.requestPermission()
        if (answer !== 'granted') return 'denied'
      } catch {
        return 'failed'
      }
      return register()
    },
    async retire() {
      try {
        const deviceId = await dependencies.storedInstallationId()
        if (deviceId) await dependencies.retire(deviceId)
      } catch {
        // Signing out must not fail on this: the push job retires a token Expo calls dead.
      }
    },
  }
}
