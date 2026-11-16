import { describe, expect, test } from 'bun:test'

import {
  deliveryLabel,
  planStateLine,
  planVersionLine,
  priceLabel,
  versionStatusLabel,
} from './plan-catalog'
import type { OrganizationPlan, PlanVersion } from './studio-api'

function version(overrides: Partial<PlanVersion> = {}): PlanVersion {
  return {
    plan_version_id: '01991600-e000-7000-8000-000000000021',
    version_number: 2,
    amount_minor: 12_000_000,
    currency_code: 'COP',
    billing_period: 'month',
    delivery_mode: 'in_person',
    status: 'published',
    published_at: '2026-11-01T14:00:00.000Z',
    deprecated_at: null,
    ...overrides,
  }
}

function plan(overrides: Partial<OrganizationPlan> = {}): OrganizationPlan {
  const current = version()
  return {
    plan_id: '01991600-e000-7000-8000-000000000001',
    name: 'Mensual ilimitado',
    status: 'published',
    on_sale: true,
    created_at: '2026-10-01T14:00:00.000Z',
    current_version: current,
    versions: [current],
    ...overrides,
  }
}

describe('a price', () => {
  // 120000 COP travels as 12000000. Chromium writes no decimals and Bun writes ",00".
  test('reads in pesos, with its period', () => {
    expect(priceLabel(version())).toMatch(/^\$\s?120\.000(,00)? al mes$/)
    expect(priceLabel(version({ billing_period: 'year' }))).toMatch(/al año$/)
  })

  test('says how the plan is followed', () => {
    expect(deliveryLabel('in_person')).toBe('presencial')
    expect(deliveryLabel('remote')).toBe('remoto')
  })
})

describe('the state of a plan', () => {
  /*
   * Criterion 1: drafts are told apart from published versions. A draft has
   * a name and no price, and the line says it cannot be sold yet.
   */
  test('a draft has no price, so nobody can buy it yet', () => {
    expect(
      planStateLine(plan({ status: 'draft', on_sale: false, current_version: null, versions: [] })),
    ).toBe('Borrador: todavía no tiene precio, así que nadie puede suscribirse.')
  })

  test('a plan on sale names its price and how it is followed', () => {
    expect(planStateLine(plan())).toMatch(/^A la venta: \$\s?120\.000(,00)? al mes · presencial$/)
  })

  // Retiring the price on sale takes the plan off sale until another is published.
  test('a published plan with no price on sale says so', () => {
    expect(
      planStateLine(
        plan({
          on_sale: false,
          current_version: null,
          versions: [version({ status: 'deprecated', deprecated_at: '2026-11-05T10:00:00.000Z' })],
        }),
      ),
    ).toBe('Fuera de venta: no tiene ningún precio a la venta ahora.')
  })
})

describe('a version', () => {
  test('is named by number, price and delivery', () => {
    expect(planVersionLine(version())).toMatch(
      /^Versión 2 · \$\s?120\.000(,00)? al mes · presencial$/,
    )
  })

  // `deprecated` is kept for whoever pays it, never offered again.
  test('is on sale or retired', () => {
    expect(versionStatusLabel(version())).toBe('A la venta')
    expect(versionStatusLabel(version({ status: 'deprecated' }))).toBe('Retirada')
  })
})
