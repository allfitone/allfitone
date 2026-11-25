/**
 * The native half of her units, language and channels (`OP-IDN-023`, `OP-IDN-024`,
 * `OP-IDN-070`, `OP-IDN-071`): the stored session, the bearer header and `expo-crypto`.
 * Split from `preferences.ts` and `notification-channels.ts` so they stay testable.
 *
 * A fresh command per change: each press is a new intention, and the whole set it sends
 * converges, so a retry the person makes herself is safe as a new one.
 *
 * `startPersonSession` is what sign-in and every start call once the session holds: it
 * reads her units and language into the stores and refreshes this phone's push token.
 * Neither may hold up the app, so both fail quietly; the app then speaks as the phone.
 */

import { newCommand } from '@allfitone/contracts/commands'
import * as Crypto from 'expo-crypto'

import { setLocale } from '../i18n/locale-store'
import { setUnits } from '../units/units-store'
import { authorizedGet, authorizedSend } from './index'
import type { ChannelChoice, ChannelPreference } from './notification-channels'
import { applyPreferences, NO_PREFERENCES, type SpacePreferences } from './preferences'
import type { AllfitV1Schemas } from '@allfitone/contracts'
import { authenticated } from './session'

type ChannelSet = AllfitV1Schemas['SpaceNotificationPreferences']

export const command = () =>
  newCommand(
    { randomBytes: (length) => Crypto.getRandomValues(new Uint8Array(length)) },
    Date.now(),
  )

export const preferenceStores = { setLocale, setUnits }

export const preferencesApi = {
  read: (): Promise<SpacePreferences> =>
    authenticated((token) => authorizedGet<SpacePreferences>('/space/v1/me/preferences', token)),

  save: (next: SpacePreferences): Promise<SpacePreferences> =>
    authenticated((token) =>
      authorizedSend<SpacePreferences>('PUT', '/space/v1/me/preferences', command(), next, token),
    ),
}

export const channelsApi = {
  read: async (): Promise<readonly ChannelPreference[]> =>
    (
      await authenticated((token) =>
        authorizedGet<ChannelSet>('/space/v1/me/notification-preferences', token),
      )
    ).preferences,

  save: async (choices: readonly ChannelChoice[]): Promise<readonly ChannelPreference[]> =>
    (
      await authenticated((token) =>
        authorizedSend<ChannelSet>(
          'PUT',
          '/space/v1/me/notification-preferences',
          command(),
          { preferences: choices },
          token,
        ),
      )
    ).preferences,
}

/** Reads her units and language into the stores; the phone's answer stands if it fails. */
export async function loadPreferences(): Promise<void> {
  try {
    applyPreferences(await preferencesApi.read(), preferenceStores)
  } catch {
    // Unread is unchosen: the phone's language and kilos stay until the next start.
  }
}

/** Back to the phone's language and kilos, for a phone nobody is signed in to. */
export function forgetPreferences(): void {
  applyPreferences(NO_PREFERENCES, preferenceStores)
}
