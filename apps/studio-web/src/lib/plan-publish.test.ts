import { describe, expect, test } from 'bun:test'

import {
  amountError,
  initialPublishDraft,
  parsePesos,
  publishConsequences,
  publishOutcome,
  publishRequest,
  publishWriteFailure,
  sameAsOnSale,
} from './plan-publish'
import type { OrganizationPlan, PlanVersion } from './studio-api'

function version(overrides: Partial<PlanVersion> = {}): PlanVersion {
  return {
    plan_version_id: '01991600-e100-7000-8000-000000000002',
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

function plan(overrides: Partial<OrganizationPlan> = {}): OrganizationPlan {
  const current = version()
  return {
    plan_id: '01991600-e000-7000-8000-000000000001',
    name: 'Mensual ilimitado',
    status: 'published',
    on_sale: true,
    created_at: '2026-10-01T10:00:00.000Z',
    current_version: current,
    versions: [current],
    ...overrides,
  }
}

const draft = plan({ status: 'draft', on_sale: false, current_version: null, versions: [] })

describe('parsePesos', () => {
  test('reads whole pesos written plainly or with thousands dots', () => {
    expect(parsePesos('120000')).toBe(120000)
    expect(parsePesos(' $ 120.000 ')).toBe(120000)
    expect(parsePesos('1.200.000')).toBe(1200000)
  })

  test('refuses centavos and anything that is not grouped like a thousand', () => {
    expect(parsePesos('120000,50')).toBeUndefined()
    expect(parsePesos('120.5')).toBeUndefined()
    expect(parsePesos('12.00.000')).toBeUndefined()
    expect(parsePesos('ciento veinte')).toBeUndefined()
    expect(parsePesos('')).toBeUndefined()
  })
})

describe('amountError', () => {
  test('asks for a price, whole pesos, at least one and at most a thousand million', () => {
    expect(amountError('')).toBe('Escribe el precio en pesos.')
    expect(amountError('99,5')).toMatch(/pesos enteros/)
    expect(amountError('0')).toMatch(/al menos un peso/)
    expect(amountError('1000000001')).toMatch(/no puede pasar/)
    expect(amountError('1.000.000.000')).toBeUndefined()
    expect(amountError('120.000')).toBeUndefined()
  })
})

describe('publishRequest', () => {
  test('sends pesos in the minor unit, in COP, with the period and the delivery chosen', () => {
    expect(publishRequest({ amount: '130.000', period: 'year', delivery: 'remote' })).toEqual({
      amount_minor: 13000000,
      currency_code: 'COP',
      billing_period: 'year',
      delivery_mode: 'remote',
    })
  })
})

describe('initialPublishDraft', () => {
  test('starts from the price on sale, so changing it is changing one field', () => {
    expect(initialPublishDraft(plan())).toEqual({
      amount: '120000',
      period: 'month',
      delivery: 'in_person',
    })
  })

  test('starts empty, monthly and in person for a plan with nothing on sale', () => {
    expect(initialPublishDraft(draft)).toEqual({
      amount: '',
      period: 'month',
      delivery: 'in_person',
    })
  })
})

describe('sameAsOnSale', () => {
  test('is the price on sale only when amount, period and delivery all match', () => {
    const request = publishRequest({ amount: '120000', period: 'month', delivery: 'in_person' })
    expect(sameAsOnSale(plan(), request)).toBe(true)
    expect(sameAsOnSale(plan(), { ...request, billing_period: 'year' })).toBe(false)
    expect(sameAsOnSale(plan(), { ...request, delivery_mode: 'remote' })).toBe(false)
    expect(sameAsOnSale(draft, request)).toBe(false)
  })
})

describe('publishConsequences', () => {
  const newPrice = publishRequest({ amount: '130000', period: 'month', delivery: 'in_person' })

  test('replacing a price says the old one is retired and nobody subscribed pays more', () => {
    const lines = publishConsequences(plan(), newPrice).join(' ')
    expect(lines).toMatch(/Se retira el precio que está a la venta ahora: .*120\.000/)
    expect(lines).toContain('Quien ya está suscrito conserva el precio que aceptó')
    expect(lines).toContain('no se edita nunca')
  })

  test('a first price says people can subscribe in Space from then on', () => {
    const lines = publishConsequences(draft, newPrice).join(' ')
    expect(lines).toContain('Desde ese momento se ofrece en Allfit Space')
    expect(lines).not.toContain('Se retira')
    expect(lines).not.toContain('Quien ya está suscrito')
  })

  test('a remote price says it is not offered in Space and cannot be charged yet', () => {
    const remote = { ...newPrice, delivery_mode: 'remote' as const }
    const lines = publishConsequences(draft, remote).join(' ')
    expect(lines).toContain('no se ofrece en Allfit Space')
    expect(lines).toContain('todavía no está disponible')
    expect(lines).not.toContain('Desde ese momento se ofrece')
  })
})

describe('publishOutcome', () => {
  test('a new version on sale is said by its number', () => {
    const after = plan({ current_version: version({ plan_version_id: 'v3', version_number: 3 }) })
    expect(publishOutcome(plan(), after)).toBe('Publicado: la versión 3 está a la venta.')
  })

  test('the same version still on sale is said as nothing changed', () => {
    expect(publishOutcome(plan(), plan())).toBe('Ese precio ya estaba a la venta; no cambió nada.')
  })
})

describe('publishWriteFailure', () => {
  test('a conflict is somebody else changing the prices at the same moment', () => {
    expect(publishWriteFailure(409)).toMatch(/al mismo tiempo/)
  })

  test('a refusal names the roles that may publish', () => {
    expect(publishWriteFailure(403)).toMatch(/propietario y administración/)
  })

  test('an unknown plan, a refused price and a pause each say so', () => {
    expect(publishWriteFailure(404)).toMatch(/ya no está disponible/)
    expect(publishWriteFailure(422)).toMatch(/pesos enteros/)
    expect(publishWriteFailure(503)).toMatch(/pausados/)
    expect(publishWriteFailure(0)).toMatch(/No pudimos/)
  })
})
