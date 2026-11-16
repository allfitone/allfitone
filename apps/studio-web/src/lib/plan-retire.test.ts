import { describe, expect, test } from 'bun:test'

import { retireConsequences, retireOutcome, retireTitle, retireWriteFailure } from './plan-retire'
import type { OrganizationPlan, PlanVersion } from './studio-api'

function version(overrides: Partial<PlanVersion> = {}): PlanVersion {
  return {
    plan_version_id: 'v2',
    version_number: 2,
    amount_minor: 12000000,
    currency_code: 'COP',
    billing_period: 'month',
    delivery_mode: 'in_person',
    status: 'published',
    published_at: '2026-11-01T10:00:00.000Z',
    deprecated_at: null,
    ...overrides,
  }
}

function plan(current: PlanVersion | null): OrganizationPlan {
  return {
    plan_id: 'p1',
    name: 'Mensual ilimitado',
    status: 'published',
    on_sale: current !== null,
    created_at: '2026-10-01T10:00:00.000Z',
    current_version: current,
    versions: current ? [current] : [],
  }
}

describe('retireTitle', () => {
  test('names the version and its price', () => {
    expect(retireTitle(version())).toMatch(
      /^¿Retirar la versión 2: \$\s?120\.000(,00)? al mes · presencial\?$/,
    )
  })
})

describe('retireConsequences', () => {
  test('says both halves: nobody new subscribes, nobody subscribed is touched', () => {
    const lines = retireConsequences().join(' ')
    expect(lines).toContain('Nadie más podrá suscribirse a este precio')
    expect(lines).toContain('no se cancela, no se suspende y no cambia de plan a nadie')
    expect(lines).toContain('queda fuera de venta hasta que publiques otro precio')
  })
})

describe('retireOutcome', () => {
  test('the price retired leaves the plan off sale', () => {
    expect(retireOutcome(version(), plan(null))).toBe(
      'Retirado: el plan queda fuera de venta hasta que publiques otro precio.',
    )
  })

  test('a newer price published a moment earlier stays on sale, and says so', () => {
    const newer = version({ plan_version_id: 'v3', version_number: 3 })
    expect(retireOutcome(version(), plan(newer))).toBe(
      'Ese precio ya se había reemplazado por la versión 3, que sigue a la venta.',
    )
  })
})

describe('retireWriteFailure', () => {
  test('a conflict and a refusal read as they do when publishing', () => {
    expect(retireWriteFailure(409)).toMatch(/al mismo tiempo/)
    expect(retireWriteFailure(403)).toMatch(/propietario y administración/)
  })

  test('an unknown price, a pause and anything else each say so', () => {
    expect(retireWriteFailure(404)).toMatch(/Este precio ya no está disponible/)
    expect(retireWriteFailure(503)).toMatch(/pausados/)
    expect(retireWriteFailure(0)).toMatch(/No pudimos retirar el precio/)
  })
})
