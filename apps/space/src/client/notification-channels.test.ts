import { describe, expect, test } from 'bun:test'

import { textFor } from '../i18n'
import {
  CHANNEL_CATEGORIES,
  canChange,
  channelChoices,
  channelTable,
  pushAvailable,
  withChoice,
  type Channel,
  type ChannelPreference,
} from './notification-channels'

const es = textFor('es').preferences.channels
const en = textFor('en').preferences.channels

/** The twelve pairs as the API answers them: email verified, no phone registered. */
function preferences(available: Partial<Record<Channel, boolean>> = {}): ChannelPreference[] {
  return CHANNEL_CATEGORIES.flatMap((category) =>
    (['email', 'push'] as const).map((channel) => ({
      category,
      channel,
      enabled: true,
      locked: category === 'security',
      available: available[channel] ?? channel === 'email',
    })),
  )
}

describe('the channels table (TECH-44, HU-SP-078)', () => {
  test('T-SPC-UNIT-720 push then email, six rows, named in her language, without SMS', () => {
    const table = channelTable(preferences(), es)
    expect(table.columns.map((column) => column.label)).toEqual(['Push', 'Correo'])
    expect(table.rows.map((row) => row.label)).toEqual([
      'Tus gimnasios',
      'Programas asignados',
      'Permisos',
      'Correcciones',
      'Nutrición',
      'Seguridad',
    ])
    expect(channelTable(preferences(), en).columns.map((column) => column.label)).toEqual([
      'Push',
      'Email',
    ])
  })

  test('T-SPC-UNIT-721 security is locked on and says it is always on', () => {
    const security = channelTable(preferences(), es).rows.find((row) => row.key === 'security')
    expect(security?.caption).toBe('Siempre activo')
    expect(security?.cells.email).toEqual({ value: true, locked: true })
    expect(canChange(preferences(), 'security', 'email')).toBe(false)
  })

  test('T-SPC-UNIT-722 push is disabled whole until a phone of hers is registered', () => {
    const before = channelTable(preferences(), es)
    expect(before.columns[0]).toEqual({ key: 'push', label: 'Push', disabled: true })
    expect(before.rows[0]?.cells.push).toEqual({ value: true, disabled: true })
    expect(pushAvailable(preferences())).toBe(false)

    const after = channelTable(preferences({ push: true }), es)
    expect(after.columns[0]).toEqual({ key: 'push', label: 'Push' })
    expect(pushAvailable(preferences({ push: true }))).toBe(true)
  })

  test('T-SPC-UNIT-723 email cannot be changed until it is verified', () => {
    const unverified = preferences({ email: false })
    expect(canChange(unverified, 'relationship', 'email')).toBe(false)
    expect(channelTable(unverified, es).columns[1]?.disabled).toBe(true)
    expect(canChange(preferences(), 'relationship', 'email')).toBe(true)
  })

  test('T-SPC-UNIT-724 a change sends all twelve pairs, only the one moved', () => {
    const held = preferences()
    const body = channelChoices(held, 'assignment', 'email', false)
    expect(body).toHaveLength(12)
    expect(body.filter((one) => !one.enabled)).toEqual([
      { category: 'assignment', channel: 'email', enabled: false },
    ])
    expect(Object.keys(body[0] ?? {}).sort()).toEqual(['category', 'channel', 'enabled'])
  })

  test('T-SPC-UNIT-725 the screen draws the move at once, keeping each pair’s flags', () => {
    const moved = withChoice(preferences(), 'nutrition', 'email', false)
    expect(moved.find((one) => one.category === 'nutrition' && one.channel === 'email')).toEqual({
      category: 'nutrition',
      channel: 'email',
      enabled: false,
      locked: false,
      available: true,
    })
    expect(moved.filter((one) => !one.enabled)).toHaveLength(1)
  })
})
