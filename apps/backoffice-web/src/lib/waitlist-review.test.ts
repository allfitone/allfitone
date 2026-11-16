import { describe, expect, test } from 'bun:test'

import {
  accountLabel,
  channelLabel,
  discardDetail,
  discardLabel,
  discardMeaning,
  filterLabel,
  foundingLabel,
  fraudConsequences,
  fraudMessage,
  fraudOutcomeMessage,
  parseFraudReason,
  referralsLabel,
  sharedConnectionLabel,
  shareLabel,
  sourceLabel,
  toWaitlistQuery,
  totalFigures,
  waitlistAnswer,
  waitlistFilterIssue,
  waitlistMessage,
  withdrawalConsequences,
  withdrawalMessage,
  withdrawalOutcomeMessage,
  type WaitlistSignup,
} from './waitlist-review'

function signup(overrides: Partial<WaitlistSignup> = {}): WaitlistSignup {
  return {
    id: '019ab000-0000-7000-8000-000000000901',
    name: 'Bruno Díaz',
    email: 'bruno@example.com',
    language: 'es',
    referral_code: 'KEVN7QHX',
    joined_at: '2026-11-14T15:00:00.000Z',
    confirmed_at: '2026-11-14T15:02:00.000Z',
    founding_number: 2,
    channel: { kind: 'source', source: 'instagram' },
    invited_by: { name: 'Ana Ruiz', referral_code: 'ANAR2Q7M' },
    discard_reason: null,
    fraud: null,
    fraud_withdrawal: null,
    referrals: 0,
    referrals_sharing_connection: 0,
    has_space_account: false,
    ...overrides,
  }
}

describe('a channel is never shown as it is stored', () => {
  test('a network reads with the spelling it uses for itself', () => {
    expect(sourceLabel('instagram')).toBe('Instagram')
    expect(sourceLabel('tiktok')).toBe('TikTok')
    expect(sourceLabel('whatsapp')).toBe('WhatsApp')
    expect(sourceLabel(' YouTube ')).toBe('YouTube')
  })

  test('a source nobody listed keeps its own spelling, capitalised', () => {
    expect(sourceLabel('embajador-juan')).toBe('Embajador-juan')
    expect(sourceLabel('podcast')).toBe('Podcast')
  })

  test('the kinds that name no source say what they are', () => {
    expect(channelLabel({ kind: 'source', source: 'instagram' })).toBe('Instagram')
    expect(channelLabel({ kind: 'referral', source: null })).toBe('Referido')
    expect(channelLabel({ kind: 'direct', source: null })).toBe('Directo')
    expect(channelLabel({ kind: 'other', source: null })).toBe('Otros canales')
  })
})

describe('what a sign-up reads as', () => {
  test('a discard says why, and a fraud mark is told apart from one made on joining', () => {
    expect(discardLabel('fraud')).toBe('Fraude')
    expect(discardLabel('same_device')).toBe('No cuenta')
    expect(discardLabel('self_referral')).toBe('No cuenta')
    expect(discardDetail('same_device')).toBe('Dispositivo repetido')
    expect(discardDetail('self_referral')).toBe('Mismo dispositivo que quien la invitó')
    expect(discardDetail('fraud')).toBeUndefined()
    expect(discardMeaning('fraud')).toContain('persona del equipo')
    expect(discardMeaning('same_device')).not.toContain('fraude')
  })

  test('a number reads with what it is, and its absence draws nothing', () => {
    expect(foundingLabel(7)).toBe('Founding Member N.º 7')
    expect(foundingLabel(null)).toBeUndefined()
  })

  test('referrals agree in number', () => {
    expect(referralsLabel(0)).toBe('0 referidos')
    expect(referralsLabel(1)).toBe('1 referido')
    expect(referralsLabel(4)).toBe('4 referidos')
  })

  test('a shared connection is a signal only when there is one', () => {
    expect(sharedConnectionLabel(0)).toBeUndefined()
    expect(sharedConnectionLabel(1)).toBe('1 comparte conexión')
    expect(sharedConnectionLabel(3)).toBe('3 comparten conexión')
  })

  test('whether a sign-up has an account reads as a word, not as a boolean', () => {
    expect(accountLabel(signup())).toBe('No')
    expect(accountLabel(signup({ has_space_account: true }))).toBe('Sí')
  })
})

describe('the search', () => {
  test('one character is not a question, and neither is more than an address holds', () => {
    expect(waitlistFilterIssue({ query: ' a ', filter: 'any' })).toBe('short-query')
    expect(waitlistFilterIssue({ query: 'a'.repeat(255), filter: 'any' })).toBe('long-query')
    expect(waitlistFilterIssue({ query: 'an', filter: 'any' })).toBeUndefined()
    expect(waitlistFilterIssue({ query: '   ', filter: 'confirmed' })).toBeUndefined()
  })

  test('empty fields are left out of the query rather than sent blank', () => {
    expect(toWaitlistQuery({ query: '  ', filter: 'any' })).toEqual({})
    expect(toWaitlistQuery({ query: ' ana ', filter: 'founding_members' }, 'abc')).toEqual({
      q: 'ana',
      filter: 'founding_members',
      cursor: 'abc',
    })
  })

  test('the closed filter has a label for every value, and for none', () => {
    expect(filterLabel('any')).toBe('Todas')
    expect(filterLabel('discarded')).toBe('No cuentan')
    expect(filterLabel('founding_members')).toBe('Founding Members')
  })

  test('the answer tells an empty list from a search that found nothing', () => {
    expect(waitlistAnswer(0, false, { query: '', filter: 'any' })).toBe(
      'Todavía no hay nadie en la lista de espera.',
    )
    expect(waitlistAnswer(0, false, { query: 'zz', filter: 'any' })).toBe(
      'Ninguna inscripción coincide con esta búsqueda.',
    )
  })

  test('a partial page is never read as the whole list', () => {
    expect(waitlistAnswer(1, false, { query: '', filter: 'any' })).toBe(
      '1 inscripción, de la más reciente a la más antigua.',
    )
    expect(waitlistAnswer(25, true, { query: '', filter: 'any' })).toContain('Hay más')
  })
})

describe('the totals', () => {
  test('each figure says what it counts', () => {
    const figures = totalFigures({
      signups: 240,
      confirmed: 180,
      founding_members: 100,
      marked_as_fraud: 3,
      with_account: 60,
      channels: [],
    })

    expect(figures.map((figure) => [figure.label, figure.value])).toEqual([
      ['Inscritos', '240'],
      ['Confirmaron su correo', '180'],
      ['Con cuenta', '60'],
      ['Founding Members', '100 de 100'],
      ['Marcadas como fraude', '3'],
    ])
    expect(figures[1]?.note).toBe('75 % de los inscritos.')
    expect(figures[2]?.note).toBe('Ya crearon su cuenta de Allfit Space.')
    expect(figures[3]?.note).toBe('Los cien números están tomados.')
  })

  test('the numbers still free are said, and an empty list divides nothing', () => {
    const empty = totalFigures({
      signups: 0,
      confirmed: 0,
      founding_members: 0,
      marked_as_fraud: 0,
      with_account: 0,
      channels: [],
    })
    expect(empty[1]?.note).toBe('Nadie se ha inscrito todavía.')
    expect(empty[3]?.note).toBe('Quedan 100 números libres.')

    const one = totalFigures({
      signups: 120,
      confirmed: 110,
      founding_members: 99,
      marked_as_fraud: 0,
      with_account: 0,
      channels: [],
    })
    expect(one[3]?.note).toBe('Queda 1 número libre.')
    expect(shareLabel(1, 0)).toBeUndefined()
    expect(shareLabel(1, 3)).toBe('33 %')
  })
})

describe('the reason of a fraud mark', () => {
  test('is one line of four to two hundred characters, trimmed', () => {
    expect(parseFraudReason('  Correos en serie ')).toBe('Correos en serie')
    expect(parseFraudReason('spam')).toBe('spam')
    expect(parseFraudReason('ñ'.repeat(200))).toHaveLength(200)
  })

  test('anything else is not a reason', () => {
    expect(parseFraudReason('')).toBeUndefined()
    expect(parseFraudReason('  no  ')).toBeUndefined()
    expect(parseFraudReason('a'.repeat(201))).toBeUndefined()
    expect(parseFraudReason('Correos en serie\nmismo equipo')).toBeUndefined()
  })
})

describe('what marking fraud does, said before it is done', () => {
  test('a Founding Member who counts for someone loses both', () => {
    expect(fraudConsequences(signup())).toEqual([
      'Deja de sumar como referido de Ana Ruiz.',
      'Pierde el número 2 de Founding Member, que pasa a la siguiente persona confirmada que espera uno.',
      'Queda registrado con tu nombre y con el motivo. La marca se puede quitar después.',
    ])
  })

  test('a sign-up nobody invited and without a number only loses the chance of one', () => {
    expect(fraudConsequences(signup({ invited_by: null, founding_number: null }))).toEqual([
      'No recibirá un número de Founding Member.',
      'Queda registrado con tu nombre y con el motivo. La marca se puede quitar después.',
    ])
  })

  test('a sign-up that already did not count is not said to stop counting', () => {
    const consequences = fraudConsequences(
      signup({ discard_reason: 'same_device', founding_number: null }),
    )
    expect(consequences.join(' ')).not.toContain('Ana Ruiz')
  })

  test('an unconfirmed referral is told in the future', () => {
    expect(fraudConsequences(signup({ confirmed_at: null, founding_number: null }))[0]).toBe(
      'No sumará como referido de Ana Ruiz, aunque confirme su correo.',
    )
  })

  test('the outcome names what changed and nothing that did not', () => {
    expect(fraudOutcomeMessage(signup())).toBe(
      'La inscripción de Bruno Díaz quedó marcada como fraude. Su número 2 quedó libre para la siguiente persona confirmada. Ya no suma como referido de Ana Ruiz.',
    )
    expect(fraudOutcomeMessage(signup({ invited_by: null, founding_number: null }))).toBe(
      'La inscripción de Bruno Díaz quedó marcada como fraude.',
    )
  })
})

describe('what taking a mark back does, said before it is done', () => {
  const marked = (overrides: Partial<WaitlistSignup> = {}) =>
    signup({
      founding_number: null,
      discard_reason: 'fraud',
      fraud: {
        reason: 'Correos en serie desde un mismo equipo',
        marked_at: '2026-11-14T16:00:00.000Z',
        previous_discard_reason: null,
      },
      ...overrides,
    })

  test('a confirmed referral counts again and waits in line for a number', () => {
    expect(withdrawalConsequences(marked())).toEqual([
      'Vuelve a sumar como referido de Ana Ruiz, salvo que otra inscripción del mismo dispositivo ya cuente para esa persona.',
      'Vuelve a la fila de Founding Members y recibe el siguiente número que quede libre; el que tenía antes de la marca no se le reserva.',
      'Queda registrado con tu nombre y con el motivo.',
    ])
  })

  test('a sign-up the list had discarded before the mark is told it still does not count', () => {
    const consequences = withdrawalConsequences(
      marked({
        fraud: {
          reason: 'Mismo equipo que otra inscripción',
          marked_at: '2026-11-14T16:00:00.000Z',
          previous_discard_reason: 'same_device',
        },
      }),
    )
    expect(consequences[0]).toBe(
      'Sigue sin sumar como referido de Ana Ruiz: la lista la descartó al entrar (dispositivo repetido).',
    )
  })

  test('an unconfirmed sign-up is told in the future', () => {
    expect(withdrawalConsequences(marked({ confirmed_at: null }))).toEqual([
      'Sumará como referido de Ana Ruiz cuando confirme su correo.',
      'Podrá recibir un número de Founding Member cuando confirme su correo.',
      'Queda registrado con tu nombre y con el motivo.',
    ])
  })

  test('a sign-up nobody invited is told nothing about referrals', () => {
    expect(withdrawalConsequences(marked({ invited_by: null })).join(' ')).not.toContain('referido')
  })

  test('the outcome is read from the sign-up as the answer left it', () => {
    const withdrawal = {
      reason: 'La persona escribió y es real',
      withdrawn_at: '2026-11-14T17:00:00.000Z',
    }
    expect(
      withdrawalOutcomeMessage(signup({ founding_number: 4, fraud_withdrawal: withdrawal })),
    ).toBe(
      'Se quitó la marca de fraude de la inscripción de Bruno Díaz. Recibió el número 4 de Founding Member. Vuelve a sumar como referido de Ana Ruiz.',
    )
    expect(
      withdrawalOutcomeMessage(signup({ founding_number: null, fraud_withdrawal: withdrawal })),
    ).toBe(
      'Se quitó la marca de fraude de la inscripción de Bruno Díaz. Espera el siguiente número de Founding Member que quede libre. Vuelve a sumar como referido de Ana Ruiz.',
    )
    expect(
      withdrawalOutcomeMessage(
        signup({
          founding_number: null,
          discard_reason: 'same_device',
          fraud_withdrawal: withdrawal,
        }),
      ),
    ).toContain('Sigue sin sumar como referido de Ana Ruiz: dispositivo repetido.')
    expect(
      withdrawalOutcomeMessage(
        signup({
          founding_number: null,
          confirmed_at: null,
          invited_by: null,
          fraud_withdrawal: withdrawal,
        }),
      ),
    ).toBe('Se quitó la marca de fraude de la inscripción de Bruno Díaz.')
  })
})

describe('what a refusal says', () => {
  test('a read names the duty, and an unknown code still says something', () => {
    expect(waitlistMessage('forbidden')).toContain('administrar lo comercial de la plataforma')
    expect(waitlistMessage('teapot')).toBe('No se pudo leer la lista de espera.')
  })

  test('a mark that cannot be made says why, and that a retry is safe', () => {
    expect(fraudMessage('conflict')).toContain('ya estaba marcada')
    expect(fraudMessage('not-found')).toContain('ya no está en la lista')
    expect(fraudMessage('network-unavailable')).toContain('no se hará dos veces')
    expect(fraudMessage('teapot')).toBe('No se pudo marcar la inscripción.')
  })

  test('a mark that cannot be taken back says why, and that a retry is safe', () => {
    expect(withdrawalMessage('conflict')).toContain('ya no estaba marcada')
    expect(withdrawalMessage('forbidden')).toContain('quitar una marca de fraude')
    expect(withdrawalMessage('network-unavailable')).toContain('no se quitará dos veces')
    expect(withdrawalMessage('teapot')).toBe('No se pudo quitar la marca de fraude.')
  })
})
