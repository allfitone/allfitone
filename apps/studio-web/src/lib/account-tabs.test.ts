import { describe, expect, test } from 'bun:test'

import { accountPath, accountTabFromQuery, isAccountTab } from './account-tabs'

describe('accountTabFromQuery', () => {
  test('reads each of the three sections', () => {
    expect(accountTabFromQuery('profile')).toBe('profile')
    expect(accountTabFromQuery('spaces')).toBe('spaces')
    expect(accountTabFromQuery('preferences')).toBe('preferences')
  })

  /*
   * The distinction the screen depends on: an address naming nothing has to
   * come back as nothing, so the account itself decides which tab opens.
   * Answering «profile» here would open the profile tab for somebody who has
   * no profile.
   */
  test('says nothing when the address names no tab', () => {
    expect(accountTabFromQuery(undefined)).toBeNull()
    expect(accountTabFromQuery('')).toBeNull()
  })

  test('says nothing for a tab that is not ours, rather than guessing', () => {
    expect(accountTabFromQuery('credentials')).toBeNull()
    expect(accountTabFromQuery('PROFILE')).toBeNull()
  })

  // `?tab=spaces&tab=profile` reaches Next as an array.
  test('takes the first when the address repeats the parameter', () => {
    expect(accountTabFromQuery(['spaces', 'profile'])).toBe('spaces')
    expect(accountTabFromQuery(['nope', 'profile'])).toBeNull()
  })
})

describe('accountPath', () => {
  test('names the tab, including the one the account opens on by itself', () => {
    expect(accountPath('profile')).toBe('/account?tab=profile')
    expect(accountPath('spaces')).toBe('/account?tab=spaces')
    expect(accountPath('preferences')).toBe('/account?tab=preferences')
  })

  test('round-trips through the reader', () => {
    for (const tab of ['profile', 'spaces', 'preferences'] as const) {
      const named = new URL(accountPath(tab), 'https://studio.test').searchParams.get('tab')
      expect(accountTabFromQuery(named ?? undefined)).toBe(tab)
    }
  })
})

describe('isAccountTab', () => {
  test('accepts the three and refuses everything else', () => {
    expect(isAccountTab('profile')).toBe(true)
    expect(isAccountTab('spaces')).toBe(true)
    expect(isAccountTab('preferences')).toBe(true)
    expect(isAccountTab('billing')).toBe(false)
    expect(isAccountTab(null)).toBe(false)
    expect(isAccountTab(undefined)).toBe(false)
  })
})
