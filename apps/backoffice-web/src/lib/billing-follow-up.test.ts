import { describe, expect, test } from 'bun:test'

import {
  followUpDetail,
  followUpHref,
  followUpMessage,
  followUpStateLabel,
  followUpSummary,
  followUpTone,
  type BillingFollowUp,
  type BillingFollowUpItem,
} from './billing-follow-up'

const PERSON = '019b4000-0000-7000-8000-000000000011'

function item(overrides: Partial<BillingFollowUpItem> = {}): BillingFollowUpItem {
  return {
    person_id: PERSON,
    subscription_status: 'suspended',
    plan_name: 'Pro',
    store: 'google_play',
    grace_until: null,
    suspended_at: '2026-10-31T12:00:00.000Z',
    failed_charges: 0,
    last_failed_charge: null,
    ...overrides,
  }
}

function page(overrides: Partial<BillingFollowUp> = {}): BillingFollowUp {
  return {
    generated_at: '2026-11-04T12:00:00.000Z',
    window_days: 30,
    items: [item()],
    has_more: false,
    ...overrides,
  }
}

describe('the charges to follow up (HU-BO-005, HU-BO-020)', () => {
  test('the state reads as a word, and a suspension never looks like a payer in good standing', () => {
    expect(followUpStateLabel(item())).toBe('Suspendida')
    expect(followUpStateLabel(item({ subscription_status: 'grace' }))).toBe('En gracia')
    expect(followUpStateLabel(item({ subscription_status: 'active' }))).toBe('Activa')
    expect(followUpStateLabel(item({ subscription_status: null }))).toBe('Sin suscripción')
    expect(followUpTone(item())).toBe('destructive')
    expect(followUpTone(item({ subscription_status: 'grace' }))).toBe('warning')
    expect(followUpTone(item({ subscription_status: 'active' }))).toBe('secondary')
  })

  test('the detail says since when, until when, and why the last charge failed', () => {
    expect(followUpDetail(item())).toContain('Suspendida desde')
    expect(
      followUpDetail(
        item({
          subscription_status: 'grace',
          suspended_at: null,
          grace_until: '2026-11-07T12:00:00.000Z',
        }),
      ),
    ).toContain('Conserva Pro hasta')
    const failed = followUpDetail(
      item({
        subscription_status: 'active',
        suspended_at: null,
        failed_charges: 2,
        last_failed_charge: {
          occurred_at: '2026-11-02T12:00:00.000Z',
          failure_code: 'billing_retry',
          amount_minor: 1990000,
          currency_code: 'COP',
        },
      }),
    )
    expect(failed).toContain('2 cobros fallidos en 30 días')
    expect(failed).toContain('billing_retry')
  })

  test('each row leads to the person’s payments under the same case', () => {
    expect(followUpHref(item(), 'CASE-2026-FU')).toBe(
      `/people/${PERSON}?case_reference=CASE-2026-FU`,
    )
  })

  test('the summary counts who is listed and says when the list is cut', () => {
    expect(followUpSummary(page())).toBe('1 persona por seguir.')
    expect(followUpSummary(page({ items: [item(), item()], has_more: true }))).toBe(
      '2 personas por seguir. Hay más: la lista muestra las primeras 2.',
    )
    expect(followUpSummary(page({ items: [] }))).toBe(
      'Nadie por seguir: ninguna suscripción suspendida ni en gracia, y ningún cobro fallido en 30 días.',
    )
  })

  test('a refusal names the duty it needs', () => {
    expect(followUpMessage('forbidden')).toContain('view_billing_metadata')
    expect(followUpMessage('anything')).toBe('No se pudo leer la lista de seguimiento.')
  })
})
