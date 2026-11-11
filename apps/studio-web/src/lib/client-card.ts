/**
 * What the client card screen needs to decide before it shows anything.
 *
 * `OP-REL-019` answers an index, never her data: who she is, since when the link
 * exists, how this caller attends her, each category she shares now and each one
 * she withdrew. It carries no counts on purpose, so nothing here can be made to
 * say whether there is anything behind a category.
 *
 * **The absences are the story.** A category she never shared, or refused,
 * arrives in neither list, and the screen must leave it out rather than draw it
 * empty or locked. That is the opposite of the information-category catalogue,
 * which checks that all seven arrive and treats a missing one as a defect —
 * there a gap is a bug, here a gap is the point.
 */
import type {
  AccessLevel,
  ClientCardSection,
  ClientCardWithdrawal,
  ClientLossReason,
  InformationCategory,
  ScopeCode,
} from './studio-api'

/**
 * The words the person was shown, read from the catalogue rather than written
 * here. `CatalogInformationCategory` is the product's vocabulary and says so:
 * it carries no version and must not move under the reader's feet, which is
 * exactly what a label beside a permission needs.
 *
 * The scope code stands in when the catalogue does not name it. A coach should
 * never see that, and seeing it means the catalogue came back without one of its
 * own codes — worth noticing rather than papering over with a second vocabulary
 * kept in the client.
 */
export function categoryName(
  code: ScopeCode,
  catalog: readonly InformationCategory[] | undefined,
): string {
  return catalog?.find((category) => category.scope_code === code)?.display_name ?? code
}

/** The one line written for the professional deciding, when the catalogue has one. */
export function categorySummary(
  code: ScopeCode,
  catalog: readonly InformationCategory[] | undefined,
): string | null {
  return catalog?.find((category) => category.scope_code === code)?.summary ?? null
}

/**
 * Said to the coach about himself, which is why this is not
 * `accessLevelLabel` from the relationship screen. That one speaks about the
 * organization to somebody administering it ("Puede leer y registrar"); here the
 * reader is the professional the permission was given to. Same meaning, other
 * voice — and the catalogue screen already keeps those two voices apart on
 * purpose.
 */
export function cardAccessLabel(level: AccessLevel): string {
  return level === 'contribute' ? 'Puedes leer y registrar' : 'Solo puedes leer'
}

/**
 * Newest first. The contract promises an order for the categories she shares
 * and none for the ones she withdrew, and the useful order for a withdrawal is
 * recency: what stopped being visible most recently is what a coach is looking
 * for an explanation of.
 */
export function withdrawalsNewestFirst(
  withdrawn: readonly ClientCardWithdrawal[],
): readonly ClientCardWithdrawal[] {
  return [...withdrawn].sort((left, right) => right.withdrawn_at.localeCompare(left.withdrawn_at))
}

/**
 * Why the caller stopped attending her, kept apart from each other because the
 * story asks for exactly that: being taken off a client is not the same as the
 * client leaving the gym.
 *
 * None of the three says who decided it or why. The contract does not carry
 * that, and a sentence that guessed would be inventing a reason the server
 * deliberately withheld.
 */
export function lossReasonSentence(reason: ClientLossReason): string {
  if (reason === 'relationship_ended') return 'Su vínculo con el gimnasio terminó.'
  if (reason === 'assignment_ended') {
    return 'Dejaste de ser quien la atiende. Su vínculo con el gimnasio sigue.'
  }
  return 'Terminó la suplencia con la que la cubrías.'
}

/*
 * Four things the panel of categories can be, named rather than nested: an
 * empty list is not a failure, and a list whose names have not arrived is not
 * an empty list.
 */
export type SectionsState =
  | { kind: 'none' }
  | { kind: 'naming' }
  | { kind: 'ready'; catalog: readonly InformationCategory[] }
  | { kind: 'unnamed' }

/**
 * Nothing shared comes first, before anything about the catalogue: when she
 * authorized nothing there is nothing to name, so the screen says so at once
 * instead of waiting on a read it will not use.
 */
export function sectionsState(
  sections: readonly ClientCardSection[],
  catalog: readonly InformationCategory[] | undefined,
  catalogPending: boolean,
): SectionsState {
  if (sections.length === 0) return { kind: 'none' }
  if (catalog) return { kind: 'ready', catalog }
  return catalogPending ? { kind: 'naming' } : { kind: 'unnamed' }
}

/**
 * Which section opens the training profile, decided by the operations the card
 * itself names rather than by the scope code. The projection says which reads
 * belong to each category; reading that is one source of truth, hardcoding
 * `relationship_training` here would be a second.
 */
export function sectionOpensTrainingProfile(section: ClientCardSection): boolean {
  return section.reads.includes('getAuthorizedClientTrainingProfile')
}

/** Where that profile lives: a child of the card, as it is a child of its path. */
export function clientTrainingProfilePath(organizationId: string, personId: string): string {
  return `${clientCardPath(organizationId, personId)}/profile`
}

/** Where a person's card lives. One string, so the directory and the card agree. */
export function clientCardPath(organizationId: string, personId: string): string {
  return `/organizations/${organizationId}/clients/people/${personId}`
}
