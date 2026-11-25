/**
 * T-WRK-LANG-01..05 — each notice email is written in the language the database names for
 * its event (ADR-054 decision 8): English for a person who chose it, Spanish for one who
 * chose nothing or for an address nobody holds yet. The rule itself is PostgreSQL's
 * (`identity.email_locale_for_event`, T-IDN-NOTICES-04); this proves every consumer asks it
 * about the event it delivers and writes what it answers.
 */

import { describe, expect, test } from 'bun:test'
import type { EmailLanguage, EmailMessage } from '@allfitone/notifications'
import type { Queue, QueueMessage } from '@allfitone/queue'

import { createClientInvitationBatchProcessor } from './client-invitations.js'
import { createCorrectionProposalBatchProcessor } from './correction-proposals.js'
import { createReassignmentBatchProcessor } from './professional-reassignments.js'
import { createSubscriptionNoticeBatchProcessor } from './subscription-notices.js'
import { createSubstitutionBatchProcessor } from './substitution-proposals.js'

const BRAND = 'https://space.allfit.one/email/allfit-one-lockup-on-light.png'
const EVENT = '019b9100-0000-7000-8000-0000000000e1'

function queueOf(topic: string, payload: unknown): Queue {
  return {
    claim: async (claimed: string): Promise<QueueMessage[]> =>
      claimed === topic ? [{ id: EVENT, topic, payload, attempt: 1 }] : [],
    ack: async () => undefined,
    nack: async () => undefined,
  } as unknown as Queue
}

interface Shared {
  email: { send: (message: EmailMessage) => Promise<void> }
  emailAllowed: () => Promise<boolean>
  emailLocale: (eventId: string) => Promise<EmailLanguage>
}

/** Runs one delivery with the database answering `locale`, and returns what was sent. */
async function sentIn(
  locale: EmailLanguage,
  build: (dependencies: Shared) => () => Promise<unknown>,
): Promise<{ asked: string[]; sent: EmailMessage[] }> {
  const asked: string[] = []
  const sent: EmailMessage[] = []
  await build({
    email: {
      send: async (message) => {
        sent.push(message)
      },
    },
    emailAllowed: async () => true,
    emailLocale: async (eventId) => {
      asked.push(eventId)
      return locale
    },
  })()
  return { asked, sent }
}

describe('each notice email speaks the language the database names', () => {
  test('T-WRK-LANG-01 the client invitation', async () => {
    const build = (dependencies: Shared) =>
      createClientInvitationBatchProcessor({
        ...dependencies,
        queue: queueOf('relationship.client_invited.v1', {}),
        database: {
          prepare: async () => ({
            state: 'ready' as const,
            invitationId: '019b9100-0000-7000-8000-000000000501',
            contact: 'client@example.test',
            organizationName: 'Entrena Norte',
            tokenKeyVersion: 1,
            expiresAt: new Date('2026-10-11T12:00:00.000Z'),
          }),
        },
        publicBaseUrl: 'http://localhost:3000/',
        environment: {
          NODE_ENV: 'development',
          INVITATION_TOKEN_KEY_V1: Buffer.alloc(32, 7).toString('base64'),
        },
      })

    const english = await sentIn('en', build)
    expect(english.asked).toEqual([EVENT])
    expect(english.sent[0]?.subject).toBe('Entrena Norte invited you as a client on Allfit One')

    const spanish = await sentIn('es', build)
    expect(spanish.sent[0]?.subject).toBe('Entrena Norte te invitó como cliente en Allfit One')
  })

  test('T-WRK-LANG-02 the professional reassignment', async () => {
    const build = (dependencies: Shared) =>
      createReassignmentBatchProcessor({
        ...dependencies,
        queue: queueOf('relationship.professional_reassigned.v1', {
          contact: 'ana@example.test',
          organization_name: 'Allfit Gym',
          professional_name: 'Daniela Hoyos',
          previous_professional_name: 'Camilo Restrepo',
        }),
        brandAssetUrl: BRAND,
      })

    const english = await sentIn('en', build)
    expect(english.asked).toEqual([EVENT])
    expect(english.sent[0]?.subject).toBe('Daniela Hoyos is now your professional at Allfit Gym')

    const spanish = await sentIn('es', build)
    expect(spanish.sent[0]?.subject).toBe('Daniela Hoyos es ahora tu profesional en Allfit Gym')
  })

  test('T-WRK-LANG-03 the cover proposal', async () => {
    const build = (dependencies: Shared) =>
      createSubstitutionBatchProcessor({
        ...dependencies,
        queue: queueOf('relationship.substitution_proposed.v1', {
          contact: 'ana@example.test',
          organization_name: 'Allfit Gym',
          substitute_name: 'Daniela Hoyos',
          holder_name: 'Camilo Restrepo',
          starts_on: '2026-11-02',
          ends_on: '2026-11-09',
        }),
        brandAssetUrl: BRAND,
      })

    const english = await sentIn('en', build)
    expect(english.asked).toEqual([EVENT])
    expect(english.sent[0]?.subject).toBe(
      'Will you let Daniela Hoyos work with you while Camilo Restrepo is away?',
    )

    const spanish = await sentIn('es', build)
    expect(spanish.sent[0]?.subject).toBe(
      '¿Aceptas que Daniela Hoyos te atienda mientras Camilo Restrepo no está?',
    )
  })

  test('T-WRK-LANG-04 the correction proposal', async () => {
    const build = (dependencies: Shared) =>
      createCorrectionProposalBatchProcessor({
        ...dependencies,
        queue: queueOf('execution.correction_proposed.v1', {
          contact: 'ana@example.test',
          proposer_name: 'Camilo Restrepo',
          organization_name: 'Allfit Gym',
          expires_at: '2026-12-06T03:00:00.123456+00:00',
        }),
        brandAssetUrl: BRAND,
      })

    const english = await sentIn('en', build)
    expect(english.asked).toEqual([EVENT])
    expect(english.sent[0]?.subject).toBe(
      'Camilo Restrepo proposes correcting something in your training',
    )

    const spanish = await sentIn('es', build)
    expect(spanish.sent[0]?.subject).toBe(
      'Camilo Restrepo propone corregir un dato de tu entrenamiento',
    )
  })

  test('T-WRK-LANG-05 the plan notices', async () => {
    const build = (dependencies: Shared) =>
      createSubscriptionNoticeBatchProcessor({
        ...dependencies,
        queue: queueOf('payments.subscription_ended.v1', {
          contact: 'carla@example.test',
          organization_name: 'Gimnasio Uno',
          plan_name: 'Mensual',
          amount_minor: 12000000,
          currency_code: 'COP',
        }),
        brandAssetUrl: BRAND,
      })

    const english = await sentIn('en', build)
    expect(english.asked).toEqual([EVENT])
    expect(english.sent[0]?.subject).toBe('Your plan with Gimnasio Uno ended')

    const spanish = await sentIn('es', build)
    expect(spanish.sent[0]?.subject).toBe('Tu plan con Gimnasio Uno terminó')
  })
})
