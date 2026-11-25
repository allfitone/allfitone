/**
 * «Avisos» in the profile (`PF-13`): which channel carries each kind of notice.
 * HU-SP-078, ADR-054, `OP-IDN-023`/`OP-IDN-024`.
 *
 * **The server's answer is the table.** Twelve pairs — six categories by email and push —
 * each with what she chose, whether it is `locked` (security) and whether the channel is
 * `available` (a verified email; a registered phone). This module only lays them out for
 * the design system's `SwitchTable` and writes the body of a change; it decides nothing
 * the database would decide again.
 *
 * **A change sends the whole set.** `PUT` replaces all twelve, so one switch moved is
 * the set read back with that one pair flipped. Keeping a value she already has is never
 * turning it on, which is why an unavailable channel left on does not refuse the save.
 *
 * Push is drawn first and email second, as `PF-13` draws them. A column with no channel
 * available at all is disabled whole: push before any phone of hers is registered.
 */

import type { AllfitV1Schemas } from '@allfitone/contracts'

import type { Dictionary } from '../i18n'

export type ChannelPreference = AllfitV1Schemas['SpaceNotificationPreference']
export type ChannelChoice = AllfitV1Schemas['SpaceNotificationPreferenceChoice']
export type ChannelCategory = AllfitV1Schemas['SpaceNotificationCategory']
export type Channel = AllfitV1Schemas['SpaceNotificationChannel']

type ChannelsText = Dictionary['preferences']['channels']

export const CHANNEL_COLUMNS: readonly Channel[] = ['push', 'email']

export const CHANNEL_CATEGORIES: readonly ChannelCategory[] = [
  'relationship',
  'assignment',
  'consent',
  'correction',
  'nutrition',
  'security',
]

export interface ChannelCell {
  readonly value: boolean
  readonly disabled?: boolean
  readonly locked?: boolean
}

export interface ChannelTable {
  readonly columns: readonly { key: Channel; label: string; disabled?: boolean }[]
  readonly rows: readonly {
    key: ChannelCategory
    label: string
    caption?: string
    cells: Partial<Record<Channel, ChannelCell>>
  }[]
}

function find(
  preferences: readonly ChannelPreference[],
  category: ChannelCategory,
  channel: Channel,
): ChannelPreference | undefined {
  return preferences.find((one) => one.category === category && one.channel === channel)
}

/** The set laid out as `SwitchTable` reads it: columns, rows and one cell per pair. */
export function channelTable(
  preferences: readonly ChannelPreference[],
  text: ChannelsText,
): ChannelTable {
  const columns = CHANNEL_COLUMNS.map((channel) => {
    const usable = preferences.some((one) => one.channel === channel && one.available)
    return {
      key: channel,
      label: text.columns[channel],
      ...(usable ? {} : { disabled: true }),
    }
  })
  const rows = CHANNEL_CATEGORIES.map((category) => {
    const cells: Partial<Record<Channel, ChannelCell>> = {}
    let locked = false
    for (const channel of CHANNEL_COLUMNS) {
      const pair = find(preferences, category, channel)
      if (!pair) continue
      locked ||= pair.locked
      cells[channel] = {
        value: pair.enabled,
        ...(pair.available ? {} : { disabled: true }),
        ...(pair.locked ? { locked: true } : {}),
      }
    }
    return {
      key: category,
      label: text.categories[category],
      ...(locked ? { caption: text.alwaysOn } : {}),
      cells,
    }
  })
  return { columns, rows }
}

/** The whole set to send when one pair changes, every other pair kept as it was. */
export function channelChoices(
  preferences: readonly ChannelPreference[],
  category: ChannelCategory,
  channel: Channel,
  enabled: boolean,
): ChannelChoice[] {
  return preferences.map((one) => ({
    category: one.category,
    channel: one.channel,
    enabled: one.category === category && one.channel === channel ? enabled : one.enabled,
  }))
}

/** What the screen draws while the change travels: the same set with that pair moved. */
export function withChoice(
  preferences: readonly ChannelPreference[],
  category: ChannelCategory,
  channel: Channel,
  enabled: boolean,
): ChannelPreference[] {
  return preferences.map((one) =>
    one.category === category && one.channel === channel ? { ...one, enabled } : one,
  )
}

/** Whether a press on that pair may change anything: not locked, and the channel can carry. */
export function canChange(
  preferences: readonly ChannelPreference[],
  category: ChannelCategory,
  channel: Channel,
): boolean {
  const pair = find(preferences, category, channel)
  return pair !== undefined && !pair.locked && pair.available
}

/** Whether a phone of hers can receive push, so the screen offers to set this one up. */
export function pushAvailable(preferences: readonly ChannelPreference[]): boolean {
  return preferences.some((one) => one.channel === 'push' && one.available)
}

export function isCategory(value: string): value is ChannelCategory {
  return (CHANNEL_CATEGORIES as readonly string[]).includes(value)
}
