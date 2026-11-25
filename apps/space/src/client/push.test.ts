import { describe, expect, test } from 'bun:test'

import {
  createPushFlow,
  easProjectId,
  keptInstallationId,
  pushPlatform,
  type PushDependencies,
  type PushPermission,
} from './push'

const DEVICE = '3f1c2b4a-5d6e-4f70-8a9b-0c1d2e3f4a5b'

function harness(
  overrides: Partial<PushDependencies> = {},
  permission: PushPermission = 'granted',
) {
  const calls: string[] = []
  const flow = createPushFlow({
    projectId: 'project-1',
    platform: 'ios',
    readPermission: async () => permission,
    requestPermission: async () => {
      calls.push('ask')
      return 'granted'
    },
    expoToken: async (projectId) => `ExponentPushToken[${projectId}]`,
    installationId: async () => DEVICE,
    storedInstallationId: async () => DEVICE,
    register: async (deviceId, registration) => {
      calls.push(`put ${deviceId} ${registration.platform} ${registration.token}`)
    },
    retire: async (deviceId) => {
      calls.push(`delete ${deviceId}`)
    },
    ...overrides,
  })
  return { flow, calls }
}

describe('what this build can do (TECH-44, ADR-054)', () => {
  test('T-SPC-UNIT-740 only iOS and Android have push', () => {
    expect(pushPlatform('ios')).toBe('ios')
    expect(pushPlatform('android')).toBe('android')
    expect(pushPlatform('web')).toBeNull()
  })

  test('T-SPC-UNIT-741 the EAS project id is read from the config, and blank is none', () => {
    expect(easProjectId({ extra: { eas: { projectId: 'abc' } } }, null)).toBe('abc')
    expect(easProjectId({}, { projectId: 'from-build' })).toBe('from-build')
    expect(easProjectId({ extra: { eas: { projectId: '  ' } } }, null)).toBeUndefined()
    expect(easProjectId(null, null)).toBeUndefined()
  })

  test('T-SPC-UNIT-742 without a project id nothing is asked and push is unavailable', async () => {
    const { flow, calls } = harness({ projectId: undefined })
    expect(flow.supported).toBe(false)
    expect(await flow.enable()).toBe('unavailable')
    expect(await flow.refresh()).toBe('skipped')
    expect(calls).toEqual([])
  })
})

describe('the installation id', () => {
  test('T-SPC-UNIT-743 is made once and kept', async () => {
    let held: string | null = null
    let made = 0
    const storage = {
      read: async () => held,
      write: async (value: string) => {
        held = value
      },
      make: () => {
        made += 1
        return DEVICE
      },
    }
    expect(await keptInstallationId(storage)).toBe(DEVICE)
    expect(await keptInstallationId(storage)).toBe(DEVICE)
    expect(made).toBe(1)
  })
})

describe('registering this phone', () => {
  test('T-SPC-UNIT-744 refresh registers silently when permission already holds', async () => {
    const { flow, calls } = harness()
    expect(await flow.refresh()).toBe('registered')
    expect(calls).toEqual([`put ${DEVICE} ios ExponentPushToken[project-1]`])
  })

  test('T-SPC-UNIT-745 refresh never prompts', async () => {
    const { flow, calls } = harness({}, 'undetermined')
    expect(await flow.refresh()).toBe('skipped')
    expect(calls).toEqual([])
  })

  test('T-SPC-UNIT-746 enable asks, then registers', async () => {
    const { flow, calls } = harness({}, 'undetermined')
    expect(await flow.enable()).toBe('registered')
    expect(calls).toEqual(['ask', `put ${DEVICE} ios ExponentPushToken[project-1]`])
  })

  test('T-SPC-UNIT-747 a no is denied, and nothing is sent', async () => {
    const { flow, calls } = harness({ requestPermission: async () => 'denied' }, 'undetermined')
    expect(await flow.enable()).toBe('denied')
    expect(calls).toEqual([])
  })

  test('T-SPC-UNIT-748 a token or API failure is a failure to retry, never a throw', async () => {
    const noToken = harness({
      expoToken: async () => {
        throw new Error('no aps-environment entitlement')
      },
    })
    expect(await noToken.flow.enable()).toBe('failed')
    const refused = harness({
      register: async () => {
        throw new Error('503')
      },
    })
    expect(await refused.flow.refresh()).toBe('failed')
  })
})

describe('retiring this phone on sign-out', () => {
  test('T-SPC-UNIT-749 retires the id kept, and nothing when none was ever made', async () => {
    const kept = harness()
    await kept.flow.retire()
    expect(kept.calls).toEqual([`delete ${DEVICE}`])

    const never = harness({ storedInstallationId: async () => null })
    await never.flow.retire()
    expect(never.calls).toEqual([])
  })

  test('T-SPC-UNIT-750 a failed retirement never throws, even in a build without push', async () => {
    const { flow } = harness({
      projectId: undefined,
      retire: async () => {
        throw new Error('offline')
      },
    })
    await expect(flow.retire()).resolves.toBeUndefined()
  })
})
