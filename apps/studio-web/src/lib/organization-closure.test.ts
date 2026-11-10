import { describe, expect, test } from 'bun:test'

import {
  ALL_OR_NOTHING,
  CLIENTS_ARE_NOT_TOLD,
  WHAT_CLOSING_DOES,
  WHAT_CLOSING_DOES_NOT_DO,
  WHAT_IS_KEPT,
  blockingSubscriptions,
  canCloseOrganization,
  closedSummary,
  closureBlockedReason,
  closureRefusalDescription,
  closureRefusalFor,
  closureRefusalTitle,
} from './organization-closure'
import type { OrganizationRole, OrganizationSubscription } from './studio-api'

function role(code: string, capabilities: string[]): OrganizationRole {
  return {
    code,
    name: code,
    capabilities: capabilities.map((capability) => ({ code: capability, name: capability })),
    fitness_data_access_policy: 'not_granted_by_role',
  } as OrganizationRole
}

/*
 * One row in the catalogue: `('owner', 'close_organization')`. An admin holds
 * everything else an administrator does and not this.
 */
const OWNER = role('owner', ['manage_organization', 'close_organization'])
const ADMIN = role('admin', ['manage_organization', 'manage_roles'])

function subscription(status: 'active' | 'suspended' | 'ended'): OrganizationSubscription {
  return { subscription_id: `s-${status}`, status } as OrganizationSubscription
}

describe('who may close the organization', () => {
  test('the owner, and only because the catalogue says so', () => {
    expect(canCloseOrganization(['owner'], [OWNER, ADMIN])).toBe(true)
  })

  test('not an admin, who may change everything else about it', () => {
    expect(canCloseOrganization(['admin'], [OWNER, ADMIN])).toBe(false)
  })

  test('nobody while the catalogue is unknown', () => {
    expect(canCloseOrganization(['owner'], undefined)).toBe(false)
  })
})

/*
 * `payments.check_organization_closure` refuses while any subscription is not
 * `ended`, so a suspended one blocks as much as an active one. This is the
 * assertion that keeps the screen from showing nothing in the way and then
 * being refused.
 */
describe('what stands in the way', () => {
  test('a suspended subscription blocks the closure, not only an active one', () => {
    expect(blockingSubscriptions([subscription('suspended')])).toHaveLength(1)
  })

  test('an ended one does not', () => {
    expect(blockingSubscriptions([subscription('ended')])).toEqual([])
  })

  test('nothing in the way means no reason to show', () => {
    expect(closureBlockedReason([subscription('ended')])).toBe(null)
  })

  test('the reason counts the two kinds apart and says why suspended counts', () => {
    const reason = closureBlockedReason([
      subscription('active'),
      subscription('suspended'),
      subscription('ended'),
    ])
    expect(reason).toContain('1 suscripción activa y 1 suspendida')
    expect(reason).toContain('Una suspendida cuenta igual')
    // And it says where to go, because the reader cannot act on this screen.
    expect(reason).toContain('Cobros')
  })

  test('the plural reads as a count, not as a list', () => {
    const reason = closureBlockedReason([subscription('active'), subscription('active')])
    expect(reason).toContain('2 suscripciones activas')
  })
})

/*
 * The four promises, and the two that would have been wrong if written from the
 * story alone rather than from the function.
 */
describe('what the dialog promises', () => {
  test('criterion 1: the full effect, including the reader own membership', () => {
    expect(WHAT_CLOSING_DOES).toContain('congelado')
    expect(WHAT_CLOSING_DOES).toContain('los programas se desacoplan')
    expect(WHAT_CLOSING_DOES).toContain('incluida la tuya')
  })

  test('criterion 2: nothing of anybody is deleted', () => {
    expect(WHAT_CLOSING_DOES_NOT_DO).toContain('No se borra el Fitness ID de nadie')
    expect(WHAT_CLOSING_DOES_NOT_DO).toContain('ni las sesiones')
  })

  /*
   * Criterion 3 asks for a purpose **and a term**. The migration says the
   * retention period is a legal decision not yet taken, so the copy gives the
   * purpose and no deadline. This test exists to keep a well-meaning edit from
   * inventing one.
   */
  test('criterion 3: the purpose, and no term it cannot keep', () => {
    expect(WHAT_IS_KEPT).toContain('evidencia mínima')
    expect(WHAT_IS_KEPT).toContain('responder por lo que hizo')
    expect(WHAT_IS_KEPT).toContain('Conservar no es seguir teniendo acceso')
    for (const invented of ['días', 'meses', 'años', 'plazo de']) {
      expect(WHAT_IS_KEPT).not.toContain(invented)
    }
  })

  test('criteria 4 and 6: there is no half-closure', () => {
    expect(ALL_OR_NOTHING).toContain('no se cierra nada')
    expect(ALL_OR_NOTHING).toContain('sigue abierta')
  })

  /*
   * The closure enqueues the relationship notice and no worker delivers it —
   * the delivery-coverage test names `relationship.terminated.v1` as open. So
   * the screen says the opposite of a promise: tell them yourself.
   */
  test('and says plainly that nobody tells the clients', () => {
    expect(CLIENTS_ARE_NOT_TOLD).toContain('no les avisa nadie')
    expect(CLIENTS_ARE_NOT_TOLD).toContain('decírselo tú')
  })
})

describe('what the screen says when the closure refuses', () => {
  test('403 is somebody who is no longer the owner', () => {
    expect(closureRefusalFor(403)).toBe('not-allowed')
    expect(closureRefusalDescription('not-allowed')).toContain('transferir la propiedad')
  })

  // The one the screen tries to prevent: a subscription revived mid-form.
  test('422 points back at what was not finished, and says nothing closed', () => {
    expect(closureRefusalFor(422)).toBe('subscriptions')
    expect(closureRefusalTitle('subscriptions')).toBe('No se pudo cerrar todavía')
    expect(closureRefusalDescription('subscriptions')).toContain('sigue abierta')
  })

  test('409 is another operation in flight, and nothing was closed', () => {
    expect(closureRefusalFor(409)).toBe('conflict')
    expect(closureRefusalDescription('conflict')).toContain('No se cerró nada')
  })

  /*
   * Anything unmapped is temporary, and the reassurance has to be explicit:
   * after asking to close a gym, «falló» without «no se terminó ninguna
   * relación» leaves the worst possible doubt.
   */
  test('an unmapped failure says no relationship was ended', () => {
    expect(closureRefusalFor(undefined)).toBe('unavailable')
    expect(closureRefusalDescription('unavailable')).toContain('no se terminó ninguna relación')
  })
})

/*
 * The number the earlier closure dialogs could not give: the response carries
 * `relationships_terminated`, so the confirmation reports it instead of
 * leaving the owner to guess what just happened.
 */
describe('what the confirmation reports', () => {
  test('none, said plainly rather than as a zero', () => {
    expect(closedSummary(0)).toBe('No había ninguna relación activa que terminar.')
  })

  test('one, in the singular', () => {
    expect(closedSummary(1)).toContain('Se terminó 1 relación')
  })

  test('and the count when there were several', () => {
    expect(closedSummary(12)).toContain('Se terminaron 12 relaciones')
  })
})
