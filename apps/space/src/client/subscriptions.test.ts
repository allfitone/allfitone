import { describe, expect, test } from 'bun:test'

import type { CommandHeaders } from '@allfitone/contracts/commands'

import { textFor } from '../i18n'

import {
  cancelRefusalMessage,
  cancellationExplanation,
  createSubscriptionFlow,
  formatPrice,
  pausedExplanation,
  payableRelationships,
  periodLabel,
  statusLabel,
  subscribeRefusalFor,
  subscribeRefusalMessage,
  type MyRelationship,
  type PlanOffer,
  type Subscription,
  type SubscriptionTransport,
} from './subscriptions'

const es = textFor('es').plans.gym
const en = textFor('en').plans.gym
const GYM_ONE = '019c8000-0000-7000-8000-000000000101'
const GYM_TWO = '019c8000-0000-7000-8000-000000000102'
const VERSION_ONE = '019c8000-0000-7000-8000-000000000501'
const VERSION_TWO = '019c8000-0000-7000-8000-000000000502'
const SUBSCRIPTION = '019c8000-0000-7000-8000-000000000601'

function relationship(overrides: Partial<MyRelationship> = {}): MyRelationship {
  return {
    relationship_id: '019c8000-0000-7000-8000-000000000201',
    organization_id: GYM_ONE,
    organization_name: 'Gimnasio Uno',
    organization_type_code: 'gym',
    status: 'active',
    started_at: '2026-07-01T14:00:00.000Z',
    ended_at: null,
    previous_relationship_id: null,
    holder_name: null,
    ...overrides,
  }
}

function offer(overrides: Partial<PlanOffer> = {}): PlanOffer {
  return {
    plan_id: '019c8000-0000-7000-8000-000000000401',
    plan_version_id: VERSION_ONE,
    plan_name: 'Mensual',
    version_number: 2,
    amount_minor: 12000000,
    currency_code: 'COP',
    billing_period: 'month',
    published_at: '2026-10-01T12:00:00.000Z',
    ...overrides,
  }
}

function subscription(overrides: Partial<Subscription> = {}): Subscription {
  return {
    subscription_id: SUBSCRIPTION,
    organization_id: GYM_ONE,
    organization_name: 'Gimnasio Uno',
    plan_name: 'Mensual',
    plan_version_id: VERSION_ONE,
    amount_minor: 12000000,
    currency_code: 'COP',
    billing_period: 'month',
    status: 'active',
    current_period_end: null,
    started_at: '2026-10-01T14:00:00.000Z',
    suspended_at: null,
    blocked_since: null,
    ...overrides,
  }
}

function flowWith(overrides: Partial<SubscriptionTransport> = {}) {
  const commands: CommandHeaders[] = []
  const sent: Array<{ operation: string; id: string; command: CommandHeaders }> = []
  let issued = 0
  const transport: SubscriptionTransport = {
    readMyRelationships: async () => ({
      data: [relationship()],
      page: { has_more: false, next_cursor: null },
    }),
    readPlans: async () => ({
      data: [offer()],
      page: { has_more: false, next_cursor: null },
    }),
    readMySubscriptions: async () => ({ data: [subscription()] }),
    subscribe: async (command, planVersionId) => {
      sent.push({ operation: 'subscribe', id: planVersionId, command })
      return {
        subscription_id: SUBSCRIPTION,
        organization_id: GYM_ONE,
        plan_version_id: planVersionId,
        plan_name: 'Mensual',
        amount_minor: 12000000,
        currency_code: 'COP',
        billing_period: 'month',
        provider: 'mercado_pago',
      }
    },
    cancel: async (command, subscriptionId) => {
      sent.push({ operation: 'cancel', id: subscriptionId, command })
      return { subscription_id: subscriptionId, status: 'ended' }
    },
    ...overrides,
  }
  const flow = createSubscriptionFlow({
    transport,
    newCommand: () => {
      issued += 1
      const command = {
        idempotencyKey: `key-${String(issued)}`,
        commandId: `command-${String(issued)}`,
      } as CommandHeaders
      commands.push(command)
      return command
    },
  })
  return { flow, commands, sent }
}

describe('the key a subscription is created with', () => {
  /*
   * Pressing "Suscribirme" twice on a slow connection. Both attempts have to carry the
   * same key or the second creates a parallel subscription, and the person ends up paying
   * one gym twice.
   */
  test('a retry of the same plan reuses the key', async () => {
    const failing = flowWith({
      subscribe: async () => {
        throw new Error('timeout')
      },
    })
    await expect(failing.flow.subscribe(VERSION_ONE)).rejects.toThrow()
    await expect(failing.flow.subscribe(VERSION_ONE)).rejects.toThrow()
    expect(failing.commands).toHaveLength(1)
  })

  test('a different plan is a different intention and gets its own key', async () => {
    const failing = flowWith({
      subscribe: async () => {
        throw new Error('timeout')
      },
    })
    await expect(failing.flow.subscribe(VERSION_ONE)).rejects.toThrow()
    await expect(failing.flow.subscribe(VERSION_TWO)).rejects.toThrow()
    expect(failing.commands).toHaveLength(2)
    expect(failing.commands[0]?.idempotencyKey).not.toBe(failing.commands[1]?.idempotencyKey)
  })

  /*
   * And once it has landed, the key is dropped. Coming back to the same screen a month
   * later and subscribing again is a new intention, not a replay of something that already
   * happened — which the server would answer with the old subscription.
   */
  test('a key is not kept after the command lands', async () => {
    const landing = flowWith()
    await landing.flow.subscribe(VERSION_ONE)
    await landing.flow.subscribe(VERSION_ONE)
    expect(landing.commands).toHaveLength(2)
  })

  test('cancelling two subscriptions never shares one key', async () => {
    const failing = flowWith({
      cancel: async () => {
        throw new Error('timeout')
      },
    })
    await expect(failing.flow.cancel(SUBSCRIPTION)).rejects.toThrow()
    await expect(failing.flow.cancel('019c8000-0000-7000-8000-000000000602')).rejects.toThrow()
    expect(failing.commands).toHaveLength(2)
  })

  test('and a retry of the same cancellation does', async () => {
    const failing = flowWith({
      cancel: async () => {
        throw new Error('timeout')
      },
    })
    await expect(failing.flow.cancel(SUBSCRIPTION)).rejects.toThrow()
    await expect(failing.flow.cancel(SUBSCRIPTION)).rejects.toThrow()
    expect(failing.commands).toHaveLength(1)
  })
})

describe('which gyms can be offered a plan', () => {
  test('only the ones she still trains at', () => {
    const gyms = [
      relationship(),
      relationship({
        relationship_id: '019c8000-0000-7000-8000-000000000202',
        organization_id: GYM_TWO,
        organization_name: 'Gimnasio Dos',
        status: 'terminated',
        ended_at: '2026-08-01T10:00:00.000Z',
      }),
    ]
    expect(payableRelationships(gyms, []).map((gym) => gym.organization_name)).toEqual([
      'Gimnasio Uno',
    ])
  })

  /*
   * And not the one she already pays. The command refuses a second live subscription with
   * the same gym, so offering it spends a tap to reach a conflict.
   */
  test('and not one she already pays', () => {
    expect(payableRelationships([relationship()], [subscription()])).toEqual([])
  })

  /*
   * A paused plan still counts as one she has: the gym is owed money, and the way back is
   * the gym reactivating it, not her taking a second plan with the same gym — which the
   * command refuses anyway.
   */
  test('a paused plan still counts as a plan she has', () => {
    const paused = subscription({
      status: 'suspended',
      suspended_at: '2026-10-20T09:00:00.000Z',
      blocked_since: '2026-10-20T09:00:00.000Z',
    })
    expect(payableRelationships([relationship()], [paused])).toEqual([])
  })

  test('a gym she pays and another she only trains at offers only the second', () => {
    const second = relationship({
      relationship_id: '019c8000-0000-7000-8000-000000000202',
      organization_id: GYM_TWO,
      organization_name: 'Gimnasio Dos',
    })
    expect(
      payableRelationships([relationship(), second], [subscription()]).map(
        (gym) => gym.organization_name,
      ),
    ).toEqual(['Gimnasio Dos'])
  })
})

describe('what the screen says', () => {
  /*
   * The assertion that keeps a $120.000 plan from reading as $12.000.000 on the screen
   * where somebody agrees to pay it.
   */
  test('a price comes from the minor unit, not from the integer', () => {
    expect(formatPrice(12000000, 'COP', 'es')).toContain('120.000')
    expect(formatPrice(12000000, 'COP', 'es')).not.toContain('12.000.000')
  })

  test('T-SPC-UNIT-358 in English the price is written the way English writes money', () => {
    expect(formatPrice(12000000, 'COP', 'en')).toMatch(/^COP\s120,000\.00$/)
  })

  test('a period reads as a person would say it', () => {
    expect(periodLabel('month', es)).toBe('al mes')
    expect(periodLabel('year', es)).toBe('al año')
    expect(periodLabel('month', en)).toBe('per month')
  })

  test('each state has a word', () => {
    expect(statusLabel('active', es)).toBe('Al día')
    expect(statusLabel('suspended', es)).toBe('En pausa')
    expect(statusLabel('ended', es)).toBe('Terminada')
    expect(statusLabel('suspended', en)).toBe('Paused')
  })

  /*
   * "En pausa" on its own is read as having lost everything. These two explanations exist
   * to say what did not happen, which is the part nobody would guess.
   */
  test('a pause says the history and the permissions are intact', () => {
    const text = pausedExplanation('Gimnasio Uno', es)
    expect(text).toContain('no se borró nada')
    expect(text).toContain('los permisos que diste siguen en pie')
    expect(text).toContain('sin que tengas que aceptar nada otra vez')
  })

  test('cancelling says it ends the money and nothing else', () => {
    const text = cancellationExplanation('Gimnasio Uno', es)
    expect(text).toContain('siguen siendo tuyos')
    expect(text).toContain('no termina tu vínculo')
    expect(text).toContain('ni le retira los permisos')
    expect(cancellationExplanation('Gimnasio Uno', en)).toContain(
      "doesn't end your relationship with the gym",
    )
  })
})

describe('what she is told when it is refused', () => {
  test('a gym with nowhere to be paid is not something she can fix', () => {
    expect(subscribeRefusalFor('conflict')).toBe('cannot-charge')
    const text = subscribeRefusalMessage('cannot-charge', 'Gimnasio Uno', es)
    expect(text).toContain('Habla con el gimnasio')
    expect(text).toContain('no es algo que puedas resolver desde aquí')
  })

  test('a plan that is gone sends her back to the list', () => {
    expect(subscribeRefusalFor('not-found')).toBe('not-offered')
    expect(subscribeRefusalMessage('not-offered', 'Gimnasio Uno', es)).toContain(
      'Vuelve a cargar los planes',
    )
  })

  test('only the temporary failure says nothing was charged and offers a retry', () => {
    expect(subscribeRefusalFor('unavailable')).toBe('unavailable')
    const text = subscribeRefusalMessage('unavailable', 'Gimnasio Uno', es)
    expect(text).toContain('No se te cobró nada')
    expect(text).toContain('otra vez')
  })

  test('a cancellation that cannot find the plan says to reload rather than retry', () => {
    expect(cancelRefusalMessage('not-found', es)).toContain('Vuelve a cargar')
    expect(cancelRefusalMessage('unavailable', es)).toContain('No se cambió nada')
    expect(cancelRefusalMessage('unavailable', en)).toBe(
      "We couldn't cancel the plan. Nothing changed, so you can try again.",
    )
  })
})
