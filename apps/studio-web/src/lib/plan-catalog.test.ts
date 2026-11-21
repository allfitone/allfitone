import { describe, expect, test } from 'bun:test'

import {
  deliveryLabel,
  deliveryName,
  filterPlans,
  planPriceLine,
  planState,
  planStateLabel,
  planStateNote,
  planVersionLine,
  priceCountLabel,
  priceLabel,
  versionSpan,
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

const draft = plan({ status: 'draft', on_sale: false, current_version: null, versions: [] })
// Retiring the price on sale takes the plan off sale until another is published.
const offSale = plan({
  on_sale: false,
  current_version: null,
  versions: [version({ status: 'deprecated', deprecated_at: '2026-11-05T10:00:00.000Z' })],
})

describe('a price', () => {
  // 120000 COP travels as 12000000. Chromium writes no decimals and Bun writes ",00".
  test('reads in pesos, with its period', () => {
    expect(priceLabel(version())).toMatch(/^\$\s?120\.000(,00)? al mes$/)
    expect(priceLabel(version({ billing_period: 'year' }))).toMatch(/al año$/)
  })

  test('says how the plan is followed, inside a sentence and standing alone', () => {
    expect(deliveryLabel('in_person')).toBe('presencial')
    expect(deliveryLabel('remote')).toBe('remoto')
    expect(deliveryName('in_person')).toBe('Presencial')
    expect(deliveryName('remote')).toBe('Remoto')
  })
})

describe('the state of a plan', () => {
  /*
   * Criterion 1: drafts are told apart from published versions, and a plan
   * that was sold once and has nothing on sale is neither.
   */
  test('is one of three, each with its own word', () => {
    expect(planState(draft)).toBe('draft')
    expect(planState(plan())).toBe('on_sale')
    expect(planState(offSale)).toBe('off_sale')
    expect(planStateLabel('draft')).toBe('Borrador')
    expect(planStateLabel('on_sale')).toBe('A la venta')
    expect(planStateLabel('off_sale')).toBe('Fuera de venta')
  })

  test('a plan on sale shows its price and how it is followed', () => {
    expect(planPriceLine(plan())).toMatch(/^\$\s?120\.000(,00)? al mes · Presencial$/)
    expect(planStateNote(plan())).toBeUndefined()
  })

  // A draft has a name and no price, and its page says it cannot be sold yet.
  test('a draft has no price, so nobody can buy it yet', () => {
    expect(planPriceLine(draft)).toBe('Sin precio')
    expect(planStateNote(draft)).toBe('Todavía no tiene precio, así que nadie puede suscribirse.')
  })

  test('a published plan with no price on sale says so', () => {
    expect(planPriceLine(offSale)).toBe('Sin precio a la venta')
    expect(planStateNote(offSale)).toBe('No tiene ningún precio a la venta ahora.')
  })

  test('counts the prices it has had', () => {
    expect(priceCountLabel(1)).toBe('1 precio')
    expect(priceCountLabel(3)).toBe('3 precios')
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

  test('the one on sale says since when', () => {
    expect(versionSpan(version())).toMatch(/^Desde el 1 nov\.? 2026$/)
  })

  test('a retired one says from when to when, the year once when it is the same', () => {
    expect(
      versionSpan(
        version({
          status: 'deprecated',
          published_at: '2026-09-01T14:00:00.000Z',
          deprecated_at: '2026-10-01T14:00:00.000Z',
        }),
      ),
      // September is «sept» in the locale's own data.
    ).toMatch(/^1 sept? – 1 oct 2026$/)
    expect(
      versionSpan(
        version({
          status: 'deprecated',
          published_at: '2025-12-15T14:00:00.000Z',
          deprecated_at: '2026-01-15T14:00:00.000Z',
        }),
      ),
    ).toBe('15 dic 2025 – 15 ene 2026')
  })
})

describe('finding a plan', () => {
  const plans = [plan(), plan({ plan_id: 'p2', name: 'Anual con nutrición' })]

  test('a name is found whatever its capitals and accents', () => {
    expect(filterPlans(plans, 'NUTRICION').map((entry) => entry.name)).toEqual([
      'Anual con nutrición',
    ])
  })

  test('no search shows every plan', () => {
    expect(filterPlans(plans, '  ')).toHaveLength(2)
  })
})
