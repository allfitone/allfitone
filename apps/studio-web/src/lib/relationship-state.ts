/**
 * The words this screen uses for a relationship, kept out of the component so
 * the component only arranges them.
 *
 * One rule shapes most of what follows: **a permission is not the data it
 * covers**. This screen may say that somebody shared their health context; it
 * may never show a line of it. Everything here names states and categories, and
 * nothing reaches for content.
 */

import type { RelationshipGrant, RelationshipState, RelationshipSubstitution } from './studio-api'

/**
 * How much the organization may still do with each category, most first:
 * granted, then the ones it keeps what it already had of, then the ones it has
 * nothing of. Sorting the last two alphabetically instead put "Retirado" above
 * "Sin nuevos datos", which reads as no order at all.
 *
 * A permission that stopped still belongs on the screen — it is the record that
 * the person said no — but never among the live ones as though it were one.
 */
const GRANT_RANK: Record<RelationshipGrant['status'], number> = {
  active: 0,
  frozen: 1,
  revoked: 2,
}

export function orderGrants(grants: readonly RelationshipGrant[]): readonly RelationshipGrant[] {
  return [...grants].sort((left, right) => {
    const byStanding = GRANT_RANK[left.status] - GRANT_RANK[right.status]
    return byStanding !== 0 ? byStanding : left.scope_code.localeCompare(right.scope_code, 'es')
  })
}

export function grantStatusLabel(status: RelationshipGrant['status']): string {
  if (status === 'active') return 'Concedido'
  // Not "congelado": the word describes the mechanism, not what it means for
  // the reader. What matters is that nothing new is reaching the organization.
  if (status === 'frozen') return 'Sin nuevos datos'
  return 'Retirado'
}

export function grantStatusTone(status: RelationshipGrant['status']): 'success' | 'secondary' {
  return status === 'active' ? 'success' : 'secondary'
}

/**
 * `contribute` means the professional may add to this category, not merely read
 * it. Worth saying plainly: an organization that can write into somebody's
 * record holds more than one that can only look.
 */
export function accessLevelLabel(level: RelationshipGrant['access_level']): string {
  return level === 'contribute' ? 'Puede leer y registrar' : 'Solo lectura'
}

export function substitutionStatusLabel(status: RelationshipSubstitution['status']): string {
  if (status === 'proposed') return 'Esperando respuesta'
  if (status === 'active') return 'Cubriendo'
  return 'Terminada'
}

export function substitutionStatusTone(
  status: RelationshipSubstitution['status'],
): 'success' | 'warning' | 'secondary' {
  if (status === 'proposed') return 'warning'
  if (status === 'active') return 'success'
  return 'secondary'
}

/**
 * Whether this reader attends the person, which is the same as asking whether
 * her card will answer them.
 *
 * `OP-REL-019` answers the professional in charge and anybody covering for
 * them, and answers everybody else the `404` it answers for a person who does
 * not exist. So this decides whether a way through to her card can be offered
 * at all: for a reader it is not meant for, the link would be a dead end that
 * also tells them she exists.
 *
 * **Only while the link is live.** A coach who lost her still reads the card
 * for thirty days — it explains why rather than disappearing — and after that
 * it is gone. Offering the link on an ended relationship would work for a
 * month and then stop, which is worse than not offering it.
 *
 * **A cover counts only once she has accepted it.** `status` is the server's
 * word on that, dates included; a proposed cover grants nothing yet, so its
 * reader is not attending her.
 */
export function readerAttendsHer(
  relationship: Pick<RelationshipState, 'status' | 'holder' | 'substitutions'>,
  membershipId: string,
): boolean {
  if (relationship.status !== 'active') return false
  if (relationship.holder?.membership_id === membershipId) return true
  return relationship.substitutions.some(
    (cover) => cover.status === 'active' && cover.membership_id === membershipId,
  )
}
