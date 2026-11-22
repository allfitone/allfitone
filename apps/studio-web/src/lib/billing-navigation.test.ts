import { describe, expect, test } from 'bun:test'

import {
  billingCreateFromQuery,
  billingCreatePath,
  billingPath,
  billingTabFromQuery,
  planPath,
} from './billing-navigation'

const ORGANIZATION = '01991600-7000-7000-8000-000000000001'

describe('the tab the address names', () => {
  test('no tab, or one that does not exist, opens on who pays', () => {
    expect(billingTabFromQuery(undefined)).toBe('subscriptions')
    expect(billingTabFromQuery('prices')).toBe('subscriptions')
  })

  test('a named tab is the one that opens, also when it is said twice', () => {
    expect(billingTabFromQuery('plans')).toBe('plans')
    expect(billingTabFromQuery(['plans', 'subscriptions'])).toBe('plans')
  })

  // The way back from a plan: it must land on the plans, not on who pays.
  test('the address of the plans names its tab, and the first tab needs none', () => {
    expect(billingPath(ORGANIZATION)).toBe(`/organizations/${ORGANIZATION}/billing`)
    expect(billingPath(ORGANIZATION, 'plans')).toBe(
      `/organizations/${ORGANIZATION}/billing?tab=plans`,
    )
    expect(billingTabFromQuery('plans')).toBe('plans')
  })
})

describe('a request to create a plan', () => {
  test('its address opens the dialog on the plans', () => {
    const query = new URL(billingCreatePath(ORGANIZATION), 'https://studio.test').searchParams
    const tab = billingTabFromQuery(query.get('tab') ?? undefined)
    expect(tab).toBe('plans')
    expect(billingCreateFromQuery(query.get('new') ?? undefined, tab)).toBe(true)
  })

  test('nothing is created from who pays, whatever the address says', () => {
    expect(billingCreateFromQuery('1', 'subscriptions')).toBe(false)
    expect(billingCreateFromQuery(undefined, 'plans')).toBe(false)
    expect(billingCreateFromQuery('yes', 'plans')).toBe(false)
  })
})

test('a plan has an address of its own', () => {
  expect(planPath(ORGANIZATION, 'p1')).toBe(`/organizations/${ORGANIZATION}/billing/plans/p1`)
})
