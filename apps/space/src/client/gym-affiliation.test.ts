import { describe, expect, test } from 'bun:test'

import { textFor } from '../i18n'
import { ApiError } from './api-error'
import {
  accessLevelLabel,
  calendarDay,
  createInvitationFlow,
  decisionFailure,
  decisionOf,
  historyLine,
  invitationExpiry,
  pendingCovers,
  programAnswer,
  programNeedLine,
  programNote,
  programOutcomeLine,
  programSpan,
  programStanding,
  type ProgramOffer,
  type ProgramOutcome,
  scopeDescription,
  scopeName,
  scopeTitle,
  sharedSummary,
  tokenFromLink,
  coverSpan,
  endedSpan,
  type InvitationDecisionBody,
  type InvitationTransport,
} from './gym-affiliation'

const es = textFor('es')
const en = textFor('en')

const INTENT = '019b3000-0000-7000-8000-000000000041'
const INVITATION = '019b3000-0000-7000-8000-000000000031'

function transport(overrides: Partial<InvitationTransport> = {}) {
  const keys: string[] = []
  const base: InvitationTransport = {
    listMine: async () => ({ data: [] }),
    readMine: async () => {
      throw new Error('not used')
    },
    resolve: async () => {
      throw new Error('not used')
    },
    decide: async (command) => {
      keys.push(command.idempotencyKey)
      return {
        invitation_id: INVITATION,
        invitation_status: 'completed',
        organization_id: 'org',
        invitation_intent_id: INTENT,
        intent_status: 'accepted',
        relationship_id: 'rel',
        granted_scope_codes: ['relationship_training'],
        program_proposal: null,
        replayed: false,
      }
    },
    ...overrides,
  }
  let issued = 0
  const flow = createInvitationFlow({
    transport: base,
    newCommand: () => {
      issued += 1
      return { idempotencyKey: `key-${issued}`, commandId: `command-${issued}` }
    },
  })
  return { flow, keys }
}

describe('a gym invitation, as Space says it', () => {
  test('T-SPC-UNIT-311 each category reads by the name the gym sent, or a plain name', () => {
    // What Studio freezes into the invitation: the catalogue's own words.
    const sent = {
      scope_code: 'body_progress',
      presented_snapshot: {
        display_name: 'Progreso corporal',
        description:
          'Medidas, composición corporal y tendencias. No incluye tus fotos, ni datos de salud.',
        version_number: 1,
      },
    }
    expect(scopeTitle(sent, es.gyms)).toBe('Progreso corporal')
    // The gym's own words are data: English shows them as they were sent.
    expect(scopeTitle(sent, en.gyms)).toBe('Progreso corporal')
    expect(scopeTitle({ scope_code: 'health_context', presented_snapshot: {} }, es.gyms)).toBe(
      'Dolor y limitaciones',
    )
    expect(scopeTitle({ scope_code: 'health_context', presented_snapshot: {} }, en.gyms)).toBe(
      'Pain and limitations',
    )
    expect(
      scopeTitle(
        { scope_code: 'body_progress', presented_snapshot: { display_name: ' ' } },
        es.gyms,
      ),
    ).toBe('Tu progreso corporal')
  })

  test('T-SPC-UNIT-336 she reads where each category stops, never a boundary Space wrote', () => {
    expect(
      scopeDescription({
        scope_code: 'body_progress',
        presented_snapshot: { description: ' No incluye tus fotos. ' },
      }),
    ).toBe('No incluye tus fotos.')
    expect(scopeDescription({ scope_code: 'body_progress', presented_snapshot: {} })).toBeNull()
    expect(
      scopeDescription({ scope_code: 'body_progress', presented_snapshot: { description: 7 } }),
    ).toBeNull()
  })

  test('T-SPC-UNIT-337 on her side no category promises photos it does not share', () => {
    expect(scopeName('body_progress', es.gyms)).toBe('Tu progreso corporal')
    expect(scopeName('nutrition_intake', es.gyms)).toBe('Tus comidas')
    expect(scopeName('unknown_scope', es.gyms)).toBe('unknown_scope')
    expect(scopeName('body_progress', en.gyms)).toBe('Your body progress')
    expect(scopeName('nutrition_intake', en.gyms)).toBe('Your meals')
    expect(scopeName('unknown_scope', en.gyms)).toBe('unknown_scope')
  })

  test('T-SPC-UNIT-338 contributing reads as changes to her plan, not as proposals', () => {
    expect(accessLevelLabel('contribute', es.gyms)).toBe('Lectura y cambios a tu plan')
    expect(accessLevelLabel('read', es.gyms)).toBe('Lectura')
    // An unknown level never reads as more than the least a gym can hold.
    expect(accessLevelLabel(null, es.gyms)).toBe('Lectura')
    expect(accessLevelLabel('contribute', en.gyms)).toBe('View and change your plan')
    expect(accessLevelLabel(null, en.gyms)).toBe('View only')
  })

  test('T-SPC-UNIT-312 what she shares is counted out of what was asked', () => {
    const decisions = { relationship_training: 'accepted', body_progress: 'rejected' } as const
    expect(sharedSummary(decisions, 3, es.invitation)).toBe('Compartes 1 de 3')
    expect(sharedSummary({}, 0, es.invitation)).toBe('No pide ningún dato')
    expect(sharedSummary(decisions, 3, en.invitation)).toBe('Sharing 1 of 3')
    expect(sharedSummary({}, 0, en.invitation)).toBe("Doesn't ask for any data")
  })

  test('T-SPC-UNIT-313 the expiry reads as a date', () => {
    expect(invitationExpiry('2026-10-15T17:00:00.000Z', es.invitation, 'es')).toBe(
      'vence el 15 oct',
    )
    expect(invitationExpiry('2026-10-15T17:00:00.000Z', en.invitation, 'en')).toBe('expires Oct 15')
  })

  test('T-SPC-UNIT-314 deciding by id, a retry reuses its command', async () => {
    let fail = true
    const { flow, keys } = transport({
      decide: async (command) => {
        keys.push(command.idempotencyKey)
        if (fail) {
          fail = false
          throw new Error('offline')
        }
        return {
          invitation_id: INVITATION,
          invitation_status: 'completed',
          organization_id: 'org',
          invitation_intent_id: INTENT,
          intent_status: 'accepted',
          relationship_id: 'rel',
          granted_scope_codes: [],
          program_proposal: null,
          replayed: false,
        }
      },
    })
    const decision = {
      invitation: { invitationId: INVITATION },
      intentId: INTENT,
      relationship: 'accepted' as const,
      scopes: {},
    }
    await expect(flow.decide(decision)).rejects.toThrow('offline')
    await flow.decide(decision)
    expect(keys).toEqual(['key-1', 'key-1'])
  })
})

describe('her gyms, as Space says them', () => {
  test('T-SPC-UNIT-315 only covers still waiting on her answer are asked about', () => {
    const covers = [
      { assignment_id: 'a', status: 'proposed', ends_on: '2099-01-01' },
      { assignment_id: 'b', status: 'active', ends_on: '2099-01-01' },
      { assignment_id: 'c', status: 'proposed', ends_on: '2000-01-01' },
    ]
    expect(
      pendingCovers(covers, new Date('2026-10-21T12:00:00Z')).map((cover) => cover.assignment_id),
    ).toEqual(['a'])
  })

  test('T-SPC-UNIT-316 each moment of the relationship reads as a sentence', () => {
    const line = (type: string, detail: Record<string, unknown> = {}) => ({
      es: historyLine({ type, detail }, es.gyms),
      en: historyLine({ type, detail }, en.gyms),
    })
    expect(line('relationship_started')).toEqual({
      es: 'Aceptaste la invitación',
      en: 'You accepted the invitation',
    })
    expect(line('holder_assigned', { display_name: 'Laura Gómez' })).toEqual({
      es: 'Laura Gómez es tu coach',
      en: 'Laura Gómez is your coach',
    })
    expect(line('substitution_proposed', { display_name: 'Daniel Mora' })).toEqual({
      es: 'Daniel Mora propone cubrirte',
      en: 'Daniel Mora offered to cover for your coach',
    })
    expect(line('relationship_ended', { declared_by_us: true })).toEqual({
      es: 'Terminaste la relación',
      en: 'You ended the relationship',
    })
    expect(line('relationship_ended', { declared_by_us: false })).toEqual({
      es: 'El gimnasio terminó la relación',
      en: 'The gym ended the relationship',
    })
    expect(line('consent_decided', { scope_code: 'body_progress', decision: 'accepted' })).toEqual({
      es: 'Compartiste tu progreso corporal',
      en: 'You shared your body progress',
    })
    expect(line('consent_decided', { scope_code: 'unknown', decision: 'rejected' })).toEqual({
      es: 'No compartiste una categoría',
      en: "You didn't share a category",
    })
    expect(line('holder_ended')).toEqual({
      es: 'Alguien dejó de ser tu coach',
      en: 'Someone is no longer your coach',
    })
  })
})

describe('tokenFromLink', () => {
  test('T-SPC-UNIT-318 the token is read from the fragment, never from the query', () => {
    const token = 'A'.repeat(43)
    expect(tokenFromLink(`allfitspace://client-invitations#token=${token}`)).toBe(token)
    expect(tokenFromLink(`allfitspace://client-invitations?token=${token}`)).toBeUndefined()
    expect(tokenFromLink('allfitspace://client-invitations#token=')).toBeUndefined()
    expect(tokenFromLink(null)).toBeUndefined()
  })
})

describe('the lines of «Tus gimnasios»', () => {
  test('T-SPC-UNIT-319 a cover reads its dates, and a day is never shifted by the zone', () => {
    const bounded = { valid_from: '2026-10-06T15:00:00Z', ends_on: '2026-10-20' }
    const open = { valid_from: '2026-10-06T15:00:00Z', ends_on: null }
    expect(coverSpan(bounded, es.gyms, 'es')).toBe('del 6 oct al 20 oct')
    expect(coverSpan(open, es.gyms, 'es')).toBe('desde el 6 oct')
    expect(coverSpan(bounded, en.gyms, 'en')).toBe('Oct 6 to Oct 20')
    expect(coverSpan(open, en.gyms, 'en')).toBe('from Oct 6')
  })

  test('T-SPC-UNIT-320 an ended relationship says that they see nothing new', () => {
    const ended = { started_at: '2026-02-04T15:00:00Z', ended_at: '2026-06-03T15:00:00Z' }
    expect(endedSpan(ended, es.gyms, 'es')).toBe('Del 4 feb al 3 jun · ya no ven nada nuevo')
    expect(endedSpan(ended, en.gyms, 'en')).toBe("Feb 4 to Jun 3 · they don't see anything new")
    expect(endedSpan({ ...ended, ended_at: null }, es.gyms, 'es')).toBe(
      'Del 4 feb · ya no ven nada nuevo',
    )
  })
})

describe('the history after taking a category back', () => {
  test('T-SPC-UNIT-327 the relationship says she stopped sharing it', () => {
    const revoked = { type: 'grant_revoked', detail: { scope_code: 'nutrition_intake' } }
    expect(historyLine(revoked, es.gyms)).toBe('Dejaste de compartir tus comidas')
    expect(historyLine(revoked, en.gyms)).toBe('You stopped sharing your meals')
  })
})

describe('why answering an invitation did not land', () => {
  test('T-SPC-UNIT-GYM-02 a gym that cannot take her now says so, and that the invitation waits', () => {
    expect(decisionFailure(new ApiError('organization-not-operating'), es.invitation)).toBe(
      'Este gimnasio no está recibiendo personas nuevas por ahora. Tu invitación sigue abierta: inténtalo más tarde.',
    )
    expect(decisionFailure(new ApiError('guest-quota-exhausted'), es.invitation)).toBe(
      'Este gimnasio no tiene lugares libres por ahora. Tu invitación sigue abierta: inténtalo más tarde.',
    )
    expect(decisionFailure(new ApiError('guest-quota-exhausted'), en.invitation)).toBe(
      'This gym has no free spots right now. Your invitation is still open: try again later.',
    )
  })

  test('T-SPC-UNIT-GYM-03 anything else keeps the message it had', () => {
    const generic = 'No pudimos guardar tus decisiones. Revisa tu conexión e inténtalo de nuevo.'
    expect(decisionFailure(new ApiError('unavailable'), es.invitation)).toBe(generic)
    expect(decisionFailure(new Error('offline'), es.invitation)).toBe(generic)
    expect(decisionFailure(new Error('offline'), en.invitation)).toBe(
      "We couldn't save your decisions. Check your connection and try again.",
    )
  })
})

describe('the answer a yes/no control gives back (TECH-327)', () => {
  test('T-SPC-UNIT-343 only «accepted» accepts; anything else is a no', () => {
    expect(decisionOf('accepted')).toBe('accepted')
    expect(decisionOf('rejected')).toBe('rejected')
    expect(decisionOf('')).toBe('rejected')
  })
})

const OFFER: ProgramOffer = {
  invitation_intent_id: '019b3000-0000-7000-8000-000000000051',
  program_version_id: '00000000-0000-4000-8000-000000000001',
  title: 'Fuerza base',
  version_number: 1,
  weeks: 8,
  repeats_forever: false,
  starts_on: '2026-12-01',
  required_scope: { scope_code: 'relationship_training', access_level: 'contribute' },
  decision: null,
}

describe('the program an invitation offers (TECH-362)', () => {
  test('T-SPC-UNIT-344 it opens only once the permission it needs is shared', () => {
    expect(programStanding(OFFER, 'accepted', {})).toBe('locked')
    expect(programStanding(OFFER, 'accepted', { body_progress: 'accepted' })).toBe('locked')
    expect(programStanding(OFFER, 'accepted', { relationship_training: 'rejected' })).toBe('locked')
    expect(programStanding(OFFER, 'accepted', { relationship_training: 'accepted' })).toBe('open')
    expect(programStanding(OFFER, 'rejected', { relationship_training: 'accepted' })).toBe('off')
  })

  test('T-SPC-UNIT-345 locked or off, her answer is a no whatever she chose before', () => {
    expect(programAnswer('open', 'accepted')).toBe('accepted')
    expect(programAnswer('open', 'rejected')).toBe('rejected')
    expect(programAnswer('locked', 'accepted')).toBe('rejected')
    expect(programAnswer('off', 'accepted')).toBe('rejected')
  })

  test('T-SPC-UNIT-346 its span says its length and the day it starts', () => {
    const span = (offer: ProgramOffer, today: string) =>
      programSpan(offer, today, es.invitation, 'es')
    expect(calendarDay('2026-12-01', 'es')).toBe('mar 1 dic')
    expect(calendarDay('2026-12-01', 'en')).toBe('Tue, Dec 1')
    expect(span(OFFER, '2026-11-24')).toBe('8 semanas · empieza el mar 1 dic')
    expect(span({ ...OFFER, weeks: 1 }, '2026-11-24')).toBe('1 semana · empieza el mar 1 dic')
    expect(span({ ...OFFER, weeks: null, repeats_forever: true }, '2026-11-24')).toBe(
      'Se repite cada semana · empieza el mar 1 dic',
    )
    expect(programSpan(OFFER, '2026-11-24', en.invitation, 'en')).toBe(
      '8 weeks · starts Tue, Dec 1',
    )
    expect(programSpan({ ...OFFER, weeks: 1 }, '2026-11-24', en.invitation, 'en')).toBe(
      '1 week · starts Tue, Dec 1',
    )
    expect(
      programSpan(
        { ...OFFER, weeks: null, repeats_forever: true },
        '2026-11-24',
        en.invitation,
        'en',
      ),
    ).toBe('Repeats every week · starts Tue, Dec 1')
  })

  test('T-SPC-UNIT-347 a proposed start already past reads as today', () => {
    expect(programSpan(OFFER, '2026-12-03', es.invitation, 'es')).toBe(
      '8 semanas · empieza el jue 3 dic',
    )
  })

  test('T-SPC-UNIT-348 the note says what unlocks it, then what accepting does', () => {
    const name = 'Tu entrenamiento con ellos'
    const note = (standing: 'off' | 'locked' | 'open', chosen: 'accepted' | 'rejected') =>
      programNote(OFFER, standing, chosen, name, '2026-11-24', es.invitation, 'es')
    expect(note('off', 'rejected')).toBeNull()
    expect(note('locked', 'rejected')).toBe(
      'Para que te lo pongan, primero comparte «Tu entrenamiento con ellos».',
    )
    expect(note('open', 'rejected')).toBe('Decide si quieres empezarlo.')
    expect(note('open', 'accepted')).toBe('Si confirmas, lo verás en Entrenar desde el mar 1 dic.')
    expect(programNeedLine(OFFER, es.invitation)).toBe('Lo necesitan para ponerte «Fuerza base».')

    const english = (standing: 'off' | 'locked' | 'open', chosen: 'accepted' | 'rejected') =>
      programNote(
        OFFER,
        standing,
        chosen,
        'Your training with them',
        '2026-11-24',
        en.invitation,
        'en',
      )
    expect(english('locked', 'rejected')).toBe(
      'Share “Your training with them” first so they can assign it.',
    )
    expect(english('open', 'rejected')).toBe('Decide whether you want to start it.')
    expect(english('open', 'accepted')).toBe(
      "If you confirm, you'll see it in Training from Tue, Dec 1.",
    )
    // The program's title is the gym's: it is never translated.
    expect(programNeedLine(OFFER, en.invitation)).toBe('They need it to assign you “Fuerza base”.')
  })

  test('T-SPC-UNIT-349 the last screen reports what became of it, and nothing for a no', () => {
    const outcome = {
      invitation_intent_id: OFFER.invitation_intent_id,
      intent_status: 'accepted' as const,
      assignment_id: null,
      unmaterialized_reason: null,
    }
    const line = (
      offer: ProgramOffer | null,
      result: ProgramOutcome | null,
      locale: 'es' | 'en' = 'es',
    ) => programOutcomeLine(offer, result, '2026-11-24', textFor(locale).invitation, locale)
    expect(line(null, null)).toBeNull()
    expect(line(OFFER, { ...outcome, intent_status: 'rejected' })).toBeNull()
    expect(line(OFFER, { ...outcome, assignment_id: OFFER.program_version_id })).toBe(
      'Empieza el mar 1 dic · lo verás en Entrenar',
    )
    expect(line(OFFER, { ...outcome, unmaterialized_reason: 'training_not_granted' })).toBe(
      'No quedó puesto: no compartiste tu entrenamiento',
    )
    expect(line(OFFER, { ...outcome, unmaterialized_reason: 'program_unavailable' })).toBe(
      'Tu gimnasio retiró este programa antes de que respondieras',
    )
    expect(line(OFFER, { ...outcome, assignment_id: OFFER.program_version_id }, 'en')).toBe(
      "Starts Tue, Dec 1 · you'll see it in Training",
    )
    expect(line(OFFER, { ...outcome, unmaterialized_reason: 'training_not_granted' }, 'en')).toBe(
      "It wasn't assigned: you didn't share your training",
    )
    expect(line(OFFER, { ...outcome, unmaterialized_reason: 'program_unavailable' }, 'en')).toBe(
      'Your gym withdrew this program before you answered',
    )
  })

  test('T-SPC-UNIT-350 the program answer and her zone go out only when one is offered', async () => {
    const bodies: InvitationDecisionBody[] = []
    const { flow } = transport({
      decide: async (_command, body) => {
        bodies.push(body)
        return {
          invitation_id: INVITATION,
          invitation_status: 'completed',
          organization_id: 'org',
          invitation_intent_id: INTENT,
          intent_status: 'accepted',
          relationship_id: 'rel',
          granted_scope_codes: [],
          program_proposal: null,
          replayed: false,
        }
      },
    })
    const base = {
      invitation: { token: 't'.repeat(43) },
      intentId: INTENT,
      relationship: 'accepted' as const,
      scopes: { relationship_training: 'accepted' as const },
    }
    await flow.decide(base)
    await flow.decide({ ...base, program: { decision: 'accepted', timezone: 'America/Bogota' } })
    expect(bodies[0]).not.toHaveProperty('program_decision')
    expect(bodies[0]).not.toHaveProperty('timezone')
    expect(bodies[1]).toMatchObject({ program_decision: 'accepted', timezone: 'America/Bogota' })
  })
})
