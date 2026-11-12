import { describe, expect, test } from 'bun:test'

import {
  availableActions,
  canManageBilling,
  confirmationDescription,
  confirmationDetails,
  formatAmount,
  formatPeriodEnd,
  personInitials,
  refusalDescription,
  refusalFor,
  refusalTitle,
  statusLabel,
} from './organization-billing'
import type { OrganizationRole } from './studio-api'

function catalog(capabilities: string[]): OrganizationRole[] {
  return [
    {
      code: 'owner',
      name: 'Propietario',
      capabilities: capabilities.map((code) => ({ code, name: code })),
    },
  ] as OrganizationRole[]
}

describe('who may administer the cobros', () => {
  test('reads the capability from the published catalogue, never from a role code', () => {
    expect(canManageBilling(['owner'], catalog(['manage_billing']))).toBe(true)
    // The role is called `owner` in both cases. What differs is the grant, which is the
    // only thing PostgreSQL will honour.
    expect(canManageBilling(['owner'], catalog(['view_directory']))).toBe(false)
  })

  test('closes the screen when the catalogue has not arrived', () => {
    expect(canManageBilling(['owner'], undefined)).toBe(false)
    expect(canManageBilling(['owner'], [])).toBe(false)
  })

  test('a role the catalogue does not know grants nothing', () => {
    expect(canManageBilling(['coach'], catalog(['manage_billing']))).toBe(false)
  })
})

describe('which actions a subscription takes', () => {
  test('an active plan can be paused or ended, never reactivated', () => {
    expect(availableActions('active')).toEqual(['suspend', 'end'])
  })

  test('a paused plan can be reactivated or ended, never paused again', () => {
    expect(availableActions('suspended')).toEqual(['reactivate', 'end'])
  })

  /*
   * The one that matters. An ended subscription is a record of what was charged, and
   * every command refuses it — offering any action there spends a click to reach a
   * refusal.
   */
  test('an ended plan takes nothing at all', () => {
    expect(availableActions('ended')).toEqual([])
  })

  test('says where each one stands in the words the screen uses', () => {
    expect(statusLabel('active')).toBe('Al día')
    expect(statusLabel('suspended')).toBe('En pausa')
    expect(statusLabel('ended')).toBe('Terminada')
  })
})

describe('what the confirmation promises', () => {
  /*
   * These assertions are about the product rule, not the copy. Suspending opens a
   * reversible cause and revokes nothing, and a confirmation that implied otherwise would
   * describe an operation this platform deliberately does not have.
   */
  function said(action: 'suspend' | 'reactivate' | 'end') {
    return [confirmationDescription(action), ...confirmationDetails(action)].join(' ')
  }

  // HU-079 criteria 1 and 2: what pausing stops, and what it leaves alone.
  test('pausing says what it stops and what it leaves alone', () => {
    const text = said('suspend')
    expect(text).toContain('no puede registrar ni cambiar nada')
    expect(text).toContain('las sesiones futuras del programa que le asignaron quedan en pausa')
    expect(text).toContain('no se le quita ningún permiso')
    expect(text).toContain('su programa sigue asignado')
    expect(text).toContain('la relación con la organización sigue igual')
  })

  test('pausing says she keeps her history and can train on her own', () => {
    expect(said('suspend')).toContain(
      'Conserva todo su historial y puede seguir entrenando por su cuenta.',
    )
  })

  /*
   * HU-079 criteria 4 to 7. Reactivating closes this one pause and recalculates from what
   * is true now, so neither dialog may promise that everything comes back as it was.
   */
  test('reactivating restores nothing, and says what does come back', () => {
    const text = said('reactivate')
    expect(text).toContain('Levanta solo la pausa de este plan')
    expect(text).toContain('No devuelve las cosas a como estaban')
    expect(text).toContain(
      'Vuelven las sesiones futuras que no se hayan iniciado ni cancelado, si la relación y la asignación siguen vigentes.',
    )
  })

  test('reactivating says what changed during the pause stays changed', () => {
    expect(said('reactivate')).toContain(
      'Lo que cambió durante la pausa no vuelve: un permiso retirado, una relación terminada, una asignación cambiada o una sesión cancelada, iniciada o que ya pasó.',
    )
  })

  test('no new acceptance only while the permission holds, and another block still pauses', () => {
    const text = said('reactivate')
    expect(text).toContain('mientras su permiso siga vigente')
    expect(text).toContain('como la organización suspendida')
  })

  test('neither dialog promises that everything comes back as it was', () => {
    for (const text of [said('suspend'), said('reactivate')]) {
      expect(text).not.toContain('todo vuelve')
      expect(text).not.toContain('como siempre')
      expect(text).not.toContain('nunca se le quitó nada')
    }
  })

  test('ending says it does not end the vínculo or retire the permisos', () => {
    const text = confirmationDescription('end')
    expect(text).toContain('no termina el vínculo')
    expect(text).toContain('ni retira los permisos')
  })

  test('all three say the person is told', () => {
    expect(said('suspend')).toContain('avisar por correo')
    expect(said('reactivate')).toContain('avisar por correo')
    expect(said('end')).toContain('avisar por correo')
  })
})

describe('what the screen says when PostgreSQL refuses', () => {
  test('maps each status to something the reader can act on', () => {
    expect(refusalFor(409)).toBe('conflict')
    expect(refusalFor(403)).toBe('not-allowed')
    expect(refusalFor(404)).toBe('gone')
    expect(refusalFor(503)).toBe('unavailable')
    expect(refusalFor(undefined)).toBe('unavailable')
  })

  test('a conflict on reactivation is not described as a race, because it is not one', () => {
    const text = refusalDescription('reactivate', 'conflict')
    expect(text).toContain('no tiene una causa abierta que cerrar')
    expect(text).toContain('no un reintento')
  })

  test('a conflict on the other two is a race, and says to refresh', () => {
    expect(refusalDescription('suspend', 'conflict')).toContain('Actualiza')
    expect(refusalDescription('end', 'conflict')).toContain('Actualiza')
  })

  test('only the temporary failure offers a retry, and says nothing was written', () => {
    const text = refusalDescription('suspend', 'unavailable')
    expect(text).toContain('No se cambió nada y no se avisó a la persona')
    expect(text).toContain('otra vez')
  })

  test('names the action it refused', () => {
    expect(refusalTitle('suspend', 'conflict')).toContain('pausar')
    expect(refusalTitle('end', 'conflict')).toContain('terminó')
    expect(refusalTitle('reactivate', 'not-allowed')).toContain('administrar los cobros')
  })
})

describe('reading an amount and a date', () => {
  /*
   * The assertion that stops a $120.000 plan from being shown as $12.000.000 on the
   * screen where somebody decides whether to suspend it.
   */
  test('divides by the ISO minor unit, not by what Intl would display', () => {
    expect(formatAmount(12000000, 'COP')).toContain('120.000')
    expect(formatAmount(12000000, 'COP')).not.toContain('12.000.000')
  })

  test('a period end that nothing has reported is said to be absent, not guessed', () => {
    expect(formatPeriodEnd(null)).toBe('Sin cobro reportado')
  })

  /*
   * Parsed by its parts, not handed to `new Date('2026-11-11')`, which reads the string as
   * midnight UTC and then renders it in the browser's zone — turning the 11th into the
   * 10th for anybody west of Greenwich.
   */
  test('a date is the day it says, in any timezone', () => {
    expect(formatPeriodEnd('2026-11-11')).toBe('11 de noviembre de 2026')
  })

  test('initials come from the first two words, uppercased for es-CO', () => {
    expect(personInitials('carla cliente')).toBe('CC')
    expect(personInitials('  Ana  ')).toBe('A')
  })
})
