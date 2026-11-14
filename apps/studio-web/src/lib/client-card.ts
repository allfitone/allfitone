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

/** The operations a card's section can name, as the contract types them. */
type CardRead = ClientCardSection['reads'][number]

export interface SectionDoor {
  readonly read: CardRead
  readonly label: string
  readonly href: string
}

/*
 * The reads this app can serve, and the screen each one lives in. A category's
 * doors come from the operations the card itself names, not from its scope code:
 * the projection says which reads belong to which category, and hardcoding that
 * here would be a second source of truth for it.
 */
const DOORS: readonly { read: CardRead; label: string; segment: string }[] = [
  { read: 'getAuthorizedClientTrainingProfile', label: 'Ver el perfil', segment: 'profile' },
  { read: 'listAuthorizedClientExecutions', label: 'Ver las sesiones', segment: 'executions' },
  { read: 'getAuthorizedClientProgress', label: 'Ver el progreso', segment: 'progress' },
  { read: 'listRelationshipAssignments', label: 'Ver sus programas', segment: 'programs' },
  {
    read: 'listAuthorizedClientHealthContext',
    label: 'Ver el contexto de salud',
    segment: 'health-context',
  },
  // Her photos are the second read of this screen, so they open no door of their own.
  {
    read: 'listAuthorizedClientBodyProgress',
    label: 'Ver el progreso corporal',
    segment: 'body-progress',
  },
  // Her daily totals are read on this screen too, above the meals: no door of their own.
  { read: 'listAuthorizedClientNutritionMeals', label: 'Ver sus comidas', segment: 'nutrition' },
]

/**
 * The doors to draw on each category she shares, keyed by scope code.
 *
 * **Deduplicated by destination, not offered per category.** One operation can
 * belong to two categories — `listAuthorizedClientExecutions` is named by both
 * `relationship_training` and `prior_training_history`, because the sessions
 * screen mixes what she trained with us and what she trained alone. Two buttons
 * to one screen would make a reader look for the difference between them, so
 * the first category that names a read keeps it, in the order the card answers.
 */
export function doorsBySection(
  sections: readonly ClientCardSection[],
  reader: { organizationId: string; personId: string },
): ReadonlyMap<string, readonly SectionDoor[]> {
  const base = clientCardPath(reader.organizationId, reader.personId)
  const taken = new Set<CardRead>()
  const doors = new Map<string, readonly SectionDoor[]>()
  for (const section of sections) {
    const mine: SectionDoor[] = []
    for (const door of DOORS) {
      if (taken.has(door.read) || !section.reads.includes(door.read)) continue
      taken.add(door.read)
      mine.push({ read: door.read, label: door.label, href: `${base}/${door.segment}` })
    }
    if (mine.length > 0) doors.set(section.scope_code, mine)
  }
  return doors
}

/** Where that profile lives: a child of the card, as it is a child of its path. */
export function clientTrainingProfilePath(organizationId: string, personId: string): string {
  return `${clientCardPath(organizationId, personId)}/profile`
}

/** And her sessions, beside it. */
export function clientExecutionsPath(organizationId: string, personId: string): string {
  return `${clientCardPath(organizationId, personId)}/executions`
}

/** And her progress, beside both. */
export function clientProgressPath(organizationId: string, personId: string): string {
  return `${clientCardPath(organizationId, personId)}/progress`
}

/**
 * One of those sessions, in full. A child of the sessions list rather than of
 * the card: it is reached from a row, and the row is what says which one.
 */
export function clientExecutionPath(
  organizationId: string,
  personId: string,
  executionId: string,
): string {
  return `${clientExecutionsPath(organizationId, personId)}/${executionId}`
}

/**
 * And the programs this relationship gave her, beside the other three.
 *
 * The operation behind it is the only one of the card's reads keyed by the
 * relationship rather than by the person, but the screen stays a child of the
 * card: the four doors belong together, and the relationship's id is in the
 * card the screen already has to open.
 */
export function clientProgramsPath(organizationId: string, personId: string): string {
  return `${clientCardPath(organizationId, personId)}/programs`
}

/** Where a person's card lives. One string, so the directory and the card agree. */
export function clientCardPath(organizationId: string, personId: string): string {
  return `/organizations/${organizationId}/clients/people/${personId}`
}

/** Her health context, beside the training screens: a category of its own. */
export function clientHealthContextPath(organizationId: string, personId: string): string {
  return `${clientCardPath(organizationId, personId)}/health-context`
}

/** Her measurements and the photos she shows this gym: one category, one screen. */
export function clientBodyProgressPath(organizationId: string, personId: string): string {
  return `${clientCardPath(organizationId, personId)}/body-progress`
}

/** What she eats: her meals, and each day's totals beside them. */
export function clientNutritionPath(organizationId: string, personId: string): string {
  return `${clientCardPath(organizationId, personId)}/nutrition`
}
