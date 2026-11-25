/**
 * The native half of push (`NT-4`, `OP-IDN-072`/`OP-IDN-073`): `expo-notifications`,
 * the app config, the keychain and the API. The decisions live in `push.ts`.
 *
 * **`expo-notifications` is loaded on first use, as `rest-alert.ts` loads it**: a build
 * made before the native module existed throws while evaluating it, and that must cost
 * push, not the app.
 *
 * **No config plugin.** The library's plugin adds the push entitlement, and the free
 * signing profile this app is built with cannot carry it (see `rest-alert.ts`). Asking
 * for permission needs no plugin. An Expo push token needs both the entitlement and an
 * EAS project id, and this build has neither yet: without the id `enable` answers
 * `unavailable` and nothing is asked of the phone at all.
 *
 * **Retiring uses the stored token without renewing it**, like the revocation in
 * `sign-out-transport.ts`: renewing a session in order to leave it would mint a new one.
 */

import { uuidV4 } from '@allfitone/contracts/commands'
import Constants from 'expo-constants'
import * as Crypto from 'expo-crypto'
import * as SecureStore from 'expo-secure-store'
import { Platform } from 'react-native'

import { getLocale } from '../i18n/locale-store'
import { textFor } from '../i18n'
import { authorizedSend } from './index'
import { command } from './preferences-transport'
import {
  createPushFlow,
  easProjectId,
  keptInstallationId,
  pushPlatform,
  type PushFlow,
  type PushPermission,
} from './push'
import { authenticated, readSession } from './session'
import type { AllfitV1Schemas } from '@allfitone/contracts'

type NotificationsModule = typeof import('expo-notifications')

const INSTALLATION_KEY = 'allfit.space.push.installation'
const CHANNEL = 'notices'

let loaded: Promise<NotificationsModule> | undefined
const notifications = (): Promise<NotificationsModule> => {
  loaded ??= import('expo-notifications')
  return loaded
}

function permissionOf(answer: {
  granted: boolean
  canAskAgain: boolean
  status: string
}): PushPermission {
  if (answer.granted) return 'granted'
  if (answer.status === 'undetermined' || answer.canAskAgain) return 'undetermined'
  return 'denied'
}

const readStoredId = () => SecureStore.getItemAsync(INSTALLATION_KEY)

/** The one push flow of the app. */
export const spacePush: PushFlow = createPushFlow({
  projectId: easProjectId(Constants.expoConfig, Constants.easConfig),
  platform: pushPlatform(Platform.OS),
  readPermission: async () => permissionOf(await (await notifications()).getPermissionsAsync()),
  requestPermission: async () => {
    const Notifications = await notifications()
    // Android 13 shows the prompt only once a channel exists to post to.
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync(CHANNEL, {
        name: textFor(getLocale()).notices.title,
        importance: Notifications.AndroidImportance.DEFAULT,
      })
    }
    return permissionOf(await Notifications.requestPermissionsAsync())
  },
  expoToken: async (projectId) =>
    (await (await notifications()).getExpoPushTokenAsync({ projectId })).data,
  installationId: () =>
    keptInstallationId({
      read: readStoredId,
      write: (value) => SecureStore.setItemAsync(INSTALLATION_KEY, value),
      make: () => uuidV4(Crypto.getRandomValues(new Uint8Array(16))),
    }),
  storedInstallationId: readStoredId,
  register: (deviceId, registration) =>
    authenticated((token) =>
      authorizedSend<AllfitV1Schemas['SpacePushDevice']>(
        'PUT',
        `/space/v1/me/push-devices/${deviceId}`,
        command(),
        registration,
        token,
      ),
    ),
  retire: async (deviceId) => {
    const stored = await readSession()
    if (!stored) return
    await authorizedSend<undefined>(
      'DELETE',
      `/space/v1/me/push-devices/${deviceId}`,
      command(),
      undefined,
      stored.accessToken,
    )
  },
})
