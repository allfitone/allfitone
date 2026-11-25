/**
 * «Lo que compartes» (N-8b) and taking one category back (N-8c) — HU-SP-030, HU-SP-031.
 *
 * Every category a gym asked her for, with how it stands now: shared since a date,
 * declined, taken back, or kept by a gym she no longer trains with. Each is its own
 * permission, so the sheet says plainly that taking one back changes nothing else and
 * deletes nothing of hers — and that it cannot be undone.
 *
 * Categories are named in her voice here, not in the gym's: the catalogue says
 * «Entrenamiento con nosotros», and on her own list that would read as the gym talking.
 */

import type { AllfitV1Schemas } from '@allfitone/contracts'

import type { Dictionary, Locale } from '../i18n'
import { accessLevelLabel, scopeName } from './gym-affiliation'
import { shortDate } from './pro'

export type Consent = AllfitV1Schemas['SpaceConsent']

export interface SharingGroup {
  readonly relationshipId: string
  readonly organizationName: string
  readonly status: Consent['relationship_status']
  readonly startedAt: string
  readonly endedAt: string | null
  readonly training: readonly Consent[]
  readonly nutrition: readonly Consent[]
}

// The order the designs list them in, nutrition on a card of its own.
const TRAINING = [
  'relationship_training',
  'body_progress',
  'prior_training_history',
  'health_context',
]
const NUTRITION = ['nutrition_intake', 'nutrition_media', 'nutrition_guidance']

const rank = (order: readonly string[], code: string) => {
  const at = order.indexOf(code)
  return at < 0 ? order.length : at
}

export function groupConsents(consents: readonly Consent[]): SharingGroup[] {
  const byRelationship = new Map<string, Consent[]>()
  for (const consent of consents) {
    const list = byRelationship.get(consent.relationship_id) ?? []
    list.push(consent)
    byRelationship.set(consent.relationship_id, list)
  }
  const groups = [...byRelationship.values()].flatMap((list) => {
    const [first] = list
    if (!first) return []
    const of = (order: readonly string[]) =>
      list
        .filter((item) => order.includes(item.scope_code))
        .sort((left, right) => rank(order, left.scope_code) - rank(order, right.scope_code))
    return [
      {
        relationshipId: first.relationship_id,
        organizationName: first.organization_name,
        status: first.relationship_status,
        startedAt: first.started_at,
        endedAt: first.ended_at,
        training: of(TRAINING),
        nutrition: of(NUTRITION),
      },
    ]
  })
  // The gyms she trains at first; among each kind, the most recent first.
  return groups.sort(
    (left, right) =>
      Number(left.status !== 'active') - Number(right.status !== 'active') ||
      right.startedAt.localeCompare(left.startedAt),
  )
}

type SharingText = Dictionary['sharing']

export function consentLine(consent: Consent, text: SharingText, locale: Locale): string {
  const date = (instant: string | null) => shortDate(instant ?? consent.decided_at, locale)
  switch (consent.grant_status) {
    case 'active':
      return text.line.active(accessLevelLabel(consent.access_level), date(consent.granted_at))
    case 'frozen':
      return text.line.frozen(date(consent.frozen_at))
    case 'revoked':
      return text.line.revoked(date(consent.revoked_at))
    default:
      return text.line.declined
  }
}

/** Only what a gym can still read, or still keeps, can be taken back. */
export const canRevoke = (consent: Consent): boolean =>
  consent.grant_status === 'active' || consent.grant_status === 'frozen'

export function groupCaption(group: SharingGroup, text: SharingText, locale: Locale): string {
  if (group.status !== 'active') {
    return text.caption.ended(shortDate(group.endedAt ?? group.startedAt, locale))
  }
  const all = [...group.training, ...group.nutrition]
  const shared = all.filter((item) => item.grant_status === 'active').length
  return text.caption.active(shortDate(group.startedAt, locale), shared, all.length)
}

const inSentence = (title: string) => title.charAt(0).toLowerCase() + title.slice(1)

export function revokeCopy(
  consent: Consent,
  text: SharingText,
): { title: string; lines: string[] } {
  const what = inSentence(scopeName(consent.scope_code))
  return {
    title: text.revoke.title(what, consent.organization_name),
    lines: [
      consent.grant_status === 'frozen' ? text.revoke.kept(what) : text.revoke.seen(what),
      text.revoke.apart,
      text.revoke.nothingDeleted,
      text.revoke.final,
    ],
  }
}
