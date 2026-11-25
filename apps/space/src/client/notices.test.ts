import { describe, expect, test } from 'bun:test'

import { textFor } from '../i18n'
import {
  appendNotices,
  bellHasDot,
  expiryLine,
  groupNotices,
  noticeDestination,
  noticeLabel,
  noticeLook,
  noticeMeta,
  noticesPath,
  noticeTime,
  noticeWords,
  replaceNotice,
  type Notice,
  type NoticeKind,
} from './notices'

const es = textFor('es')
const en = textFor('en')
const ZONE = 'America/Bogota'

const SUBJECT_OF: Record<NoticeKind, Notice['subject']['type']> = {
  client_invitation: 'invitation',
  cover_proposed: 'relationship_professional_assignment',
  professional_changed: 'relationship_professional_assignment',
  relationship_ended: 'service_relationship',
  plan_paused: 'plan_subscription',
  plan_resumed: 'plan_subscription',
  plan_ended: 'plan_subscription',
  program_assigned: 'program_assignment',
  correction_proposed: 'correction_proposal',
  goal_proposed: 'nutrition_goal_version',
  password_changed: 'password_change',
  email_changed: 'identity_action_request',
}

const KINDS = Object.keys(SUBJECT_OF) as NoticeKind[]

function notice(kind: NoticeKind, overrides: Partial<Notice> = {}): Notice {
  return {
    id: '019f9000-0000-7000-8000-000000000001',
    kind,
    category: 'relationship',
    subject: { type: SUBJECT_OF[kind], id: '0b6f2f4e-1c1d-4a2b-8c3d-000000000002' },
    organization_id: '0b6f2f4e-1c1d-4a2b-8c3d-000000000003',
    occurred_at: '2026-11-25T14:00:00.000Z',
    read_at: null,
    awaiting: false,
    expires_at: null,
    names: {
      organization: 'Bodytech Chicó',
      professional: 'Laura Gómez',
      program: 'Torso y pierna',
    },
    ...overrides,
  }
}

describe('what each notice says (TECH-44, HU-SP-091)', () => {
  test('T-SPC-UNIT-700 every kind reads whole in both languages, with its names', () => {
    for (const kind of KINDS) {
      for (const text of [es.notices, en.notices]) {
        const words = noticeWords(notice(kind), text)
        expect(words.title.trim()).not.toBe('')
        expect(words.line.trim()).not.toBe('')
      }
    }
    expect(noticeWords(notice('client_invitation', { awaiting: true }), es.notices)).toEqual({
      title: 'Bodytech Chicó te invita',
      line: 'Decide si aceptas y qué pueden ver.',
      action: 'Ver',
    })
    expect(noticeWords(notice('client_invitation', { awaiting: true }), en.notices).title).toBe(
      'Bodytech Chicó invites you',
    )
    expect(noticeWords(notice('program_assigned'), es.notices).line).toBe(
      '«Torso y pierna» ya está en tu agenda.',
    )
    expect(noticeWords(notice('professional_changed'), en.notices).line).toBe(
      'Laura Gómez now trains you at Bodytech Chicó.',
    )
  })

  test('T-SPC-UNIT-701 a missing name falls back to words that still make a sentence', () => {
    const nameless = { organization: null, professional: null, program: null }
    expect(
      noticeWords(notice('client_invitation', { awaiting: true, names: nameless }), es.notices)
        .title,
    ).toBe('Un gimnasio te invita')
    expect(
      noticeWords(notice('cover_proposed', { awaiting: true, names: nameless }), es.notices).line,
    ).toBe('Tu coach, en Tu gimnasio. Sin tu respuesta no ve nada.')
    expect(noticeWords(notice('program_assigned', { names: nameless }), en.notices).line).toBe(
      "It's now in your schedule.",
    )
  })

  test('T-SPC-UNIT-702 only what awaits carries an action, and the right word for it', () => {
    const action = (kind: NoticeKind) =>
      noticeWords(notice(kind, { awaiting: true }), es.notices).action
    expect(action('client_invitation')).toBe('Ver')
    expect(action('cover_proposed')).toBe('Decidir')
    expect(action('correction_proposed')).toBe('Revisar')
    expect(action('goal_proposed')).toBe('Decidir')
    expect(noticeWords(notice('password_changed'), es.notices).action).toBeUndefined()
  })

  test('T-SPC-UNIT-703 once decided it says so, and offers nothing to decide', () => {
    const words = noticeWords(notice('cover_proposed', { awaiting: false }), es.notices)
    expect(words.action).toBeUndefined()
    expect(words.line).toBe('Ya no espera tu respuesta.')
    expect(words.title).toBe('Un coach propone cubrirte')
  })

  test('T-SPC-UNIT-704 the kinds that ask for a decision are tinted; the rest are quiet', () => {
    expect(noticeLook('client_invitation')).toEqual({ icon: 'organization', tone: 'accent' })
    expect(noticeLook('cover_proposed').tone).toBe('warning')
    expect(noticeLook('correction_proposed').tone).toBe('sport')
    expect(noticeLook('goal_proposed').tone).toBe('success')
    expect(noticeLook('password_changed')).toEqual({ icon: 'permissions', tone: 'quiet' })
  })
})

describe('when it happened, in her zone', () => {
  const now = new Date('2026-11-25T15:00:00.000Z') // 10:00 in Bogotá, a Wednesday
  const time = (at: string, text = es.notices) => noticeTime(at, now, ZONE, text, es.common.months)

  test('T-SPC-UNIT-705 minutes and hours today, then yesterday', () => {
    expect(time('2026-11-25T14:59:40.000Z')).toBe('Ahora')
    expect(time('2026-11-25T14:55:00.000Z')).toBe('Hace 5 min')
    expect(time('2026-11-25T13:00:00.000Z')).toBe('Hace 2 h')
    expect(time('2026-11-25T13:00:00.000Z', en.notices)).toBe('2 h ago')
    // 23:00 the day before in Bogotá is yesterday, though only eleven hours ago.
    expect(time('2026-11-25T04:00:00.000Z')).toBe('Ayer')
  })

  test('T-SPC-UNIT-706 the weekday within the week, the date before it, the year when it differs', () => {
    expect(time('2026-11-23T15:00:00.000Z')).toBe('Lun 23')
    expect(time('2026-11-23T15:00:00.000Z', en.notices)).toBe('Mon 23')
    expect(time('2026-09-20T15:00:00.000Z')).toBe('20 sep')
    expect(time('2025-09-20T15:00:00.000Z')).toBe('20 sep 2025')
    expect(noticeTime('2026-09-20T15:00:00.000Z', now, ZONE, en.notices, en.common.months)).toBe(
      'Sep 20',
    )
  })

  test('T-SPC-UNIT-707 «Vence en N días» only while it awaits, counted in calendar days', () => {
    const awaiting = { awaiting: true, expires_at: '2026-12-24T20:00:00.000Z' }
    expect(expiryLine(awaiting, now, ZONE, es.notices)).toBe('Vence en 29 días')
    expect(expiryLine(awaiting, now, ZONE, en.notices)).toBe('Expires in 29 days')
    expect(
      expiryLine({ awaiting: true, expires_at: '2026-11-26T20:00:00.000Z' }, now, ZONE, es.notices),
    ).toBe('Vence mañana')
    expect(
      expiryLine({ awaiting: true, expires_at: '2026-11-25T22:00:00.000Z' }, now, ZONE, es.notices),
    ).toBe('Vence hoy')
    expect(expiryLine({ awaiting: false, expires_at: null }, now, ZONE, es.notices)).toBeUndefined()
    expect(expiryLine({ awaiting: true, expires_at: null }, now, ZONE, es.notices)).toBeUndefined()
  })

  test('T-SPC-UNIT-708 the last line joins when and how long it still waits', () => {
    const waiting = notice('correction_proposed', {
      awaiting: true,
      occurred_at: '2026-11-24T15:00:00.000Z',
      expires_at: '2026-12-24T20:00:00.000Z',
    })
    expect(noticeMeta(waiting, now, ZONE, es.notices, es.common.months)).toBe(
      'Ayer · Vence en 29 días',
    )
  })
})

describe('the inbox', () => {
  test('T-SPC-UNIT-709 what awaits her comes first, the rest after, each in the order listed', () => {
    const a = notice('client_invitation', { id: 'a', awaiting: true })
    const b = notice('password_changed', { id: 'b' })
    const c = notice('goal_proposed', { id: 'c', awaiting: true })
    expect(groupNotices([a, b, c])).toEqual({ awaiting: [a, c], informational: [b] })
  })

  test('T-SPC-UNIT-710 a further page never lists a notice twice, and a read one is replaced', () => {
    const a = notice('client_invitation', { id: 'a' })
    const b = notice('password_changed', { id: 'b' })
    expect(appendNotices([a], [a, b]).map((one) => one.id)).toEqual(['a', 'b'])
    const read = { ...a, read_at: '2026-11-25T15:00:00.000Z' }
    expect(replaceNotice([a, b], read)).toEqual([read, b])
  })

  test('T-SPC-UNIT-711 the bell carries a dot only when something awaits her', () => {
    expect(bellHasDot({ awaiting_count: 2 })).toBe(true)
    expect(bellHasDot({ awaiting_count: 0 })).toBe(false)
    expect(bellHasDot(undefined)).toBe(false)
  })

  test('T-SPC-UNIT-712 the listing path carries the filter and the opaque cursor, encoded', () => {
    expect(noticesPath('all')).toBe('/space/v1/notices?filter=all')
    expect(noticesPath('awaiting', 'abc+/=')).toBe(
      '/space/v1/notices?filter=awaiting&cursor=abc%2B%2F%3D',
    )
  })

  test('T-SPC-UNIT-713 a screen reader hears the state, the words, when, and the action', () => {
    expect(
      noticeLabel({ title: 'T', line: 'L', action: 'Ver' }, 'Hace 5 min', true, es.notices),
    ).toBe('Sin leer. T. L. Hace 5 min. Ver')
    expect(noticeLabel({ title: 'T', line: 'L' }, 'Yesterday', false, en.notices)).toBe(
      'T. L. Yesterday',
    )
  })
})

describe('where each notice opens', () => {
  const id = '0b6f2f4e-1c1d-4a2b-8c3d-000000000002'

  test('T-SPC-UNIT-714 a pending decision opens where it is decided', () => {
    expect(noticeDestination(notice('client_invitation', { awaiting: true }))).toEqual({
      pathname: '/invitation',
      params: { id },
    })
    expect(noticeDestination(notice('cover_proposed', { awaiting: true }))).toEqual({
      pathname: '/gyms',
    })
    expect(noticeDestination(notice('correction_proposed', { awaiting: true }))).toEqual({
      pathname: '/corrections/[proposalId]',
      params: { proposalId: id },
    })
    expect(noticeDestination(notice('goal_proposed', { awaiting: true }))).toEqual({
      pathname: '/nutrition/proposal/[id]',
      params: { id },
    })
  })

  test('T-SPC-UNIT-715 a decided one opens where its outcome lives', () => {
    expect(noticeDestination(notice('client_invitation'))).toEqual({ pathname: '/gyms' })
    expect(noticeDestination(notice('correction_proposed'))).toEqual({ pathname: '/corrections' })
    expect(noticeDestination(notice('goal_proposed'))).toEqual({ pathname: '/nutrition/goal' })
  })

  test('T-SPC-UNIT-716 the informational ones open their natural screen', () => {
    expect(noticeDestination(notice('relationship_ended'))).toEqual({
      pathname: '/gyms/[relationshipId]',
      params: { relationshipId: id },
    })
    expect(noticeDestination(notice('plan_paused'))).toEqual({
      pathname: '/subscriptions/[organizationId]',
      params: { organizationId: '0b6f2f4e-1c1d-4a2b-8c3d-000000000003' },
    })
    expect(noticeDestination(notice('plan_ended', { organization_id: null }))).toEqual({
      pathname: '/subscriptions',
    })
    expect(noticeDestination(notice('program_assigned'))).toEqual({ pathname: '/programs' })
    expect(noticeDestination(notice('password_changed'))).toEqual({ pathname: '/me/identity' })
    expect(noticeDestination(notice('email_changed'))).toEqual({ pathname: '/me/identity' })
  })
})
