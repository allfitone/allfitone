import { describe, expect, test } from 'bun:test'

import type { ProStatus, SubscriptionSource } from './pro'
import { initialsOf, paymentsCaption, planCaption, profileRowLook } from './profile'

const subscription: SubscriptionSource = {
  kind: 'subscription',
  store: 'app_store',
  status: 'active',
  auto_renews: true,
  current_period_end: '2026-11-12T15:00:00Z',
  grace_until: null,
  version_id: '019f1000-0000-7000-8000-000000000302',
}
const gym = {
  kind: 'organization' as const,
  organization_id: '019f1000-0000-7000-8000-000000000401',
  organization_name: 'Bodytech Chicó',
}
const status = (over: Partial<ProStatus>): ProStatus => ({
  generated_at: '2026-10-12T12:00:00Z',
  account_token: '019f1000-0000-7000-8000-000000000001',
  effective_source: 'free',
  is_pro: false,
  plan: null,
  features: [],
  sources: [],
  ...over,
})

describe('what the profile says', () => {
  test('T-SPC-UNIT-296 the avatar shows the initials of the name the person gave', () => {
    expect(initialsOf('Walberto')).toBe('W')
    expect(initialsOf('  ana   maría ')).toBe('AM')
    expect(initialsOf('Juan Pablo Andrés')).toBe('JP')
    expect(initialsOf('')).toBe(undefined)
  })

  test('T-SPC-UNIT-297 the plan row says which plan and who pays for it', () => {
    expect(
      planCaption(status({ effective_source: 'organization', is_pro: true, sources: [gym] })),
    ).toBe('Pro · incluido por tu gimnasio')
    expect(
      planCaption(
        status({ effective_source: 'subscription', is_pro: true, sources: [subscription, gym] }),
      ),
    ).toBe('Pro · pagado con Apple')
    expect(planCaption(status({}))).toBe('Gratis · sin costo')
  })

  test('T-SPC-UNIT-298 the payments row never suggests a charge where there is none', () => {
    expect(paymentsCaption(status({ effective_source: 'organization', sources: [gym] }))).toBe(
      'Sin pagos: tu plan viene del gimnasio',
    )
    expect(
      paymentsCaption(status({ effective_source: 'subscription', sources: [subscription] })),
    ).toBe('Tus cobros de Allfit Pro con Apple')
    expect(paymentsCaption(status({}))).toBe('Tus cobros de Allfit Pro')
  })
})

describe('how each profile row is drawn with the design system row (TECH-327)', () => {
  test('T-SPC-UNIT-339 a row opens only when it has somewhere to go', () => {
    expect(profileRowLook({ end: 'open', opens: true })).toEqual({
      opens: true,
      iconTone: 'quiet',
      trailing: { kind: 'chevron' },
    })
    expect(profileRowLook({ end: 'open', opens: false }).opens).toBe(false)
    expect(profileRowLook({ end: 'none', opens: true })).toEqual({
      opens: false,
      iconTone: 'quiet',
      trailing: { kind: 'none' },
    })
  })

  test('T-SPC-UNIT-340 a part not built yet says «Pronto» in the outlined badge', () => {
    expect(profileRowLook({ end: 'soon', opens: true })).toEqual({
      opens: false,
      iconTone: 'quiet',
      trailing: { kind: 'badge', label: 'Pronto' },
    })
  })

  test('T-SPC-UNIT-341 a live state is the tonal badge in caps with its dot', () => {
    expect(profileRowLook({ end: 'active', opens: false }).trailing).toEqual({
      kind: 'badge',
      label: 'Activo',
      tone: 'success',
      variant: 'tonal',
      dot: true,
    })
  })

  test('T-SPC-UNIT-342 a figure lights the glyph in the accent and the pain row stays red', () => {
    expect(profileRowLook({ end: 'open', opens: true, value: '70,0 kg' }).iconTone).toBeUndefined()
    expect(profileRowLook({ end: 'open', opens: true, alert: true }).iconTone).toBe('danger')
  })
})
