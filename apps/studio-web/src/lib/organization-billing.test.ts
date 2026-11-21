import { describe, expect, test } from 'bun:test'

import {
  availableActions,
  billingSummary,
  canManageBilling,
  confirmationDescription,
  confirmationSections,
  filterSubscriptions,
  formatAmount,
  formatPeriodEnd,
  menuActionLabel,
  personInitials,
  refusalDescription,
  refusalFor,
  refusalTitle,
  statusLabel,
  subscriptionDateLine,
  transitionDone,
} from './organization-billing'
import type { OrganizationRole, OrganizationSubscription } from './studio-api'

function subscription(patch: Partial<OrganizationSubscription>): OrganizationSubscription {
  return {
    subscription_id: '01991600-7000-7000-8000-000000000601',
    person_id: '01991600-7000-7000-8000-000000000201',
    person_name: 'Ana Álvarez',
    plan_name: 'Mensual',
    plan_version_id: '01991600-7000-7000-8000-000000000501',
    amount_minor: 12000000,
    currency_code: 'COP',
    billing_period: 'month',
    status: 'active',
    current_period_end: null,
    started_at: '2026-10-01T15:12:44.118Z',
    suspended_at: null,
    ended_at: null,
    ...patch,
  }
}

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

  test('the menu names the verb and what it acts on', () => {
    expect(menuActionLabel('suspend')).toBe('Pausar el plan')
    expect(menuActionLabel('reactivate')).toBe('Reactivar el plan')
    expect(menuActionLabel('end')).toBe('Terminar el plan')
  })

  // The answer uses the word of the state the row now shows, so the two agree.
  test('what is said afterwards names the state the row moved to', () => {
    expect(transitionDone('suspend', 'Ana Álvarez')).toContain(
      statusLabel('suspended').toLowerCase(),
    )
    expect(transitionDone('reactivate', 'Ana Álvarez')).toContain(
      statusLabel('active').toLowerCase(),
    )
    expect(transitionDone('end', 'Ana Álvarez')).toBe('El plan de Ana Álvarez terminó.')
  })
})

describe('what the confirmation promises', () => {
  /*
   * These assertions are about the product rule, not the copy. Suspending opens a
   * reversible cause and revokes nothing, and a confirmation that implied otherwise would
   * describe an operation this platform deliberately does not have.
   */
  function said(
    action: 'suspend' | 'reactivate' | 'end',
    status: 'active' | 'suspended' = action === 'reactivate' ? 'suspended' : 'active',
  ) {
    const { happens, stays, notice } = confirmationSections(action, status)
    return [confirmationDescription(action), ...happens, ...stays, notice].join(' ')
  }

  // HU-079 criteria 1 and 2: what pausing stops, and what it leaves alone.
  test('pausing says what it stops and what it leaves alone', () => {
    const text = said('suspend')
    expect(text).toContain('no puede registrar ni cambiar nada')
    expect(text).toContain('las sesiones futuras del programa que le asignaron quedan en pausa')
    // The sentence opens its own line now that «Qué no cambia» is a heading over it.
    expect(text).toContain('No se le quita ningún permiso')
    expect(text).toContain('su programa sigue asignado')
    expect(text).toContain('la relación con la organización sigue igual')
  })

  /*
   * The two halves are told apart by where they sit, so a sentence in the wrong
   * half says the opposite of the rule: what stops must never read as untouched.
   */
  test('what stops and what is left alone sit under their own heading', () => {
    const pause = confirmationSections('suspend', 'active')
    expect(pause.happens.join(' ')).toContain('no puede registrar ni cambiar nada')
    expect(pause.happens.join(' ')).toContain('nunca se convierte sola en terminación')
    expect(pause.stays.join(' ')).toContain('No se le quita ningún permiso')
    expect(pause.stays.join(' ')).toContain('Conserva todo su historial')

    const end = confirmationSections('end', 'suspended')
    expect(end.happens.join(' ')).toContain('terminar también levanta la pausa')
    expect(end.happens.join(' ')).toContain('Queda registrado que lo decidiste tú')
    expect(end.stays.join(' ')).toContain('Sigue en pie la relación con la organización')

    const back = confirmationSections('reactivate', 'suspended')
    expect(back.happens.join(' ')).toContain('Vuelven las sesiones futuras')
    expect(back.stays.join(' ')).toContain('Lo que cambió durante la pausa no vuelve')
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

  // HU-080 criterion 1: what closes, and what stays standing, told apart.
  test('ending says what closes and what stays standing', () => {
    expect(confirmationDescription('end')).toContain('Cierra el cobro de este plan')
    const text = said('end')
    expect(text).toContain('Sigue en pie la relación con la organización')
    expect(text).toContain('terminar el plan no termina la relación')
    expect(text).toContain('no retira los permisos que la persona dio')
    expect(text).toContain('Para terminar la relación hay otra acción')
  })

  test('ending says a person decided it, never a process', () => {
    expect(said('end')).toContain('Queda registrado que lo decidiste tú')
  })

  // Ending closes the pause's cause too: left open, nothing could ever close it.
  test('ending a paused plan says the pause lifts with it, and only then', () => {
    expect(said('end', 'suspended')).toContain('terminar también levanta la pausa')
    expect(said('end', 'active')).not.toContain('levanta la pausa')
  })

  // HU-080 criterion 3, said where it matters: when somebody pauses.
  test('pausing says a pause never turns into an ending by itself', () => {
    expect(said('suspend')).toContain('nunca se convierte sola en terminación')
  })

  test('no dialog shows markdown a reader would see as asterisks', () => {
    for (const action of ['suspend', 'reactivate', 'end'] as const) {
      for (const status of ['active', 'suspended'] as const) {
        expect(said(action, status)).not.toContain('**')
      }
    }
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
    // Short, so a row stays one line; some engines abbreviate the month with a point.
    expect(formatPeriodEnd('2026-11-11')).toMatch(/^11 nov\.? 2026$/)
  })

  test('initials come from the first two words, uppercased for es-CO', () => {
    expect(personInitials('carla cliente')).toBe('CC')
    expect(personInitials('  Ana  ')).toBe('A')
  })
})

describe('the summary over the list', () => {
  const list = [
    subscription({ subscription_id: 'a' }),
    subscription({ subscription_id: 'b', amount_minor: 9000000 }),
    subscription({ subscription_id: 'c', amount_minor: 120000000, billing_period: 'year' }),
    subscription({ subscription_id: 'd', status: 'suspended' }),
    subscription({ subscription_id: 'e', status: 'ended' }),
    subscription({ subscription_id: 'f', status: 'ended' }),
  ]

  test('counts each state', () => {
    const summary = billingSummary(list)
    expect(summary.active).toBe(3)
    expect(summary.suspended).toBe(1)
    expect(summary.ended).toBe(2)
  })

  /*
   * Only what is in good standing: a paused plan is not being charged and an
   * ended one never will be. A yearly plan adds a twelfth of its price.
   */
  test('the month adds the plans in good standing, a yearly one by its twelfth', () => {
    expect(billingSummary(list).monthly).toEqual({
      amountMinor: 12000000 + 9000000 + 10000000,
      currencyCode: 'COP',
    })
  })

  test('nobody in good standing is no figure, not a zero in a guessed currency', () => {
    expect(billingSummary([subscription({ status: 'ended' })]).monthly).toBeNull()
    expect(billingSummary([]).monthly).toBeNull()
  })

  // Two currencies cannot be added, and half a sum would read as the whole.
  test('two currencies in good standing are not added up', () => {
    const mixed = [subscription({}), subscription({ subscription_id: 'usd', currency_code: 'USD' })]
    expect(billingSummary(mixed).monthly).toBeNull()
  })
})

describe('finding somebody in the list', () => {
  const list = [
    subscription({ subscription_id: 'a', person_name: 'Ana Álvarez' }),
    subscription({ subscription_id: 'b', person_name: 'Bruno Bedoya', status: 'suspended' }),
    subscription({ subscription_id: 'c', person_name: 'Carla Castro', status: 'ended' }),
  ]

  test('a name is found whatever its capitals and accents', () => {
    const found = filterSubscriptions(list, { term: 'alvarez', status: 'all' })
    expect(found.map((entry) => entry.person_name)).toEqual(['Ana Álvarez'])
  })

  test('a state narrows the list and keeps its order', () => {
    expect(filterSubscriptions(list, { term: '', status: 'all' })).toHaveLength(3)
    const paused = filterSubscriptions(list, { term: '', status: 'suspended' })
    expect(paused.map((entry) => entry.person_name)).toEqual(['Bruno Bedoya'])
  })

  test('the search and the state narrow together', () => {
    expect(filterSubscriptions(list, { term: 'ana', status: 'ended' })).toEqual([])
  })
})

describe('the date a row shows', () => {
  test('a plan in good standing shows its next charge, or says none was reported', () => {
    expect(subscriptionDateLine(subscription({ current_period_end: '2026-12-01' }))).toMatch(
      /^1 dic\.? 2026$/,
    )
    expect(subscriptionDateLine(subscription({}))).toBe('Sin cobro reportado')
  })

  // A paused plan is not being charged, so a next charge there would be a promise.
  test('a paused plan says since when, never a next charge', () => {
    const line = subscriptionDateLine(
      subscription({
        status: 'suspended',
        current_period_end: '2026-12-01',
        suspended_at: '2026-11-14T15:00:00.000Z',
      }),
    )
    expect(line).toMatch(/^Desde el 14 nov\.? 2026$/)
  })

  test('an ended plan says the day it ended', () => {
    const line = subscriptionDateLine(
      subscription({ status: 'ended', ended_at: '2026-10-30T15:00:00.000Z' }),
    )
    expect(line).toMatch(/^El 30 oct\.? 2026$/)
  })
})
