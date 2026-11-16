/**
 * What a gym has made: its session templates and its programs.
 *
 * `HU-STUDIO-044`, and the first screen of a block with nine more behind it.
 * Its three criteria are all about telling things apart and keeping them in,
 * and two of the three are the database's job rather than this screen's:
 *
 * 1. **The draft is distinguished from the published versions, explicitly.**
 *    That is this file's work. A template or a program is one row with an
 *    optional draft and N immutable versions, and those are different kinds of
 *    thing: a draft is what somebody is writing and can still change, a version
 *    is frozen and is what an assignment can point at.
 * 2. **Only this organization's content, never another's.** Enforced by
 *    `planning.list_session_templates` and its program sibling, which take the
 *    organization and are `security definer`. Nothing here filters by
 *    organization, because a screen that filtered would be a second place for
 *    that rule to be wrong.
 * 3. **And no permission over a person's history reaches a gym's programs.**
 *    Also the database's: `20261103150000_organization_content_stays_in_the_organization.sql`
 *    exists because an audit found a coach could put a private Space routine
 *    into her gym's program, which would have crossed exactly that line.
 *
 * `manage_content` is what the server asks for, and all three roles the story
 * names hold it: the base catalogue gives it to `coach`, and the content
 * block's own migration adds `owner` and `admin`.
 */

import type { OrganizationRole, Program, SessionTemplate } from './studio-api'

const MANAGE_CONTENT = 'manage_content'

/** A template or a program, in the one shape this screen reads them both in. */
export interface ContentItem {
  id: string
  title: string
  /** Null when nothing is being written. */
  draft: ContentDraft | null
  versions: ContentVersion[]
  archived: boolean
}

export interface ContentDraft {
  title: string
  updated_at: string
  /**
   * The version this draft started from, when it is an adaptation of one.
   *
   * **Templates only.** The contract carries `derived_from_version_id` on
   * `SessionTemplateDraft` and `SessionTemplateVersion` and nowhere else: a
   * program is composed of template versions rather than adapted from another
   * program, and «partir de una versión publicada» (`HU-STUDIO-039`) is a
   * template story. A program's items therefore always carry null, and the
   * screen shows no lineage for them because there is none to show.
   */
  derived_from_version_id: string | null
}

export interface ContentVersion {
  id: string
  version_number: number
  /**
   * Null for a template, and that is the contract rather than an omission: the
   * listing gives templates a `SessionTemplateVersionSummary`, which carries no
   * title, while it gives programs the whole `ProgramVersion`. A row's name
   * therefore comes from its draft — see `titleOf`.
   */
  title: string | null
  retired: boolean
  published_at: string
  derived_from_version_id: string | null
}

/**
 * One capability reads the library and writes it: `planning.assert_manage_content`
 * guards listing, creating, editing and publishing alike. Retiring is the
 * exception, and asks for the owner or admin role on its own.
 */
export function canManageContent(
  roles: readonly string[],
  catalog: readonly OrganizationRole[] | undefined,
): boolean {
  if (!catalog?.length) return false
  return roles.some((role) =>
    catalog
      .find((entry) => entry.code === role)
      ?.capabilities.some((capability) => capability.code === MANAGE_CONTENT),
  )
}

/**
 * The name to show, which is the draft's.
 *
 * **The draft survives publishing**, verified in
 * `planning.publish_session_template_version`: it inserts the version and then
 * only clears the draft's `derived_from_version_id`, never deletes it. So
 * everything in this list has a draft to take a name from, except a program
 * whose draft was discarded — that one falls back to its newest version, which
 * programs do carry a title on.
 *
 * A renamed draft over older versions shows the new name, and the state line
 * next to it says there is an unpublished draft. For a library whose job is
 * «encontrar y reutilizar lo que ya tenemos», the name somebody last typed is
 * the one they will look for.
 */
function titleOf(draftTitle: string | undefined, versions: readonly ContentVersion[]): string {
  if (draftTitle) return draftTitle
  return versions.at(0)?.title ?? 'Sin título'
}

/** Newest first, which is the order a person reads versions in. */
function versionsOf(
  versions: readonly {
    id: string
    version_number: number
    title?: string
    status: string
    published_at: string
    derived_from_version_id?: string | null
  }[],
): ContentVersion[] {
  return versions
    .map((version) => ({
      id: version.id,
      version_number: version.version_number,
      title: version.title ?? null,
      retired: version.status === 'deprecated',
      published_at: version.published_at,
      derived_from_version_id: version.derived_from_version_id ?? null,
    }))
    .toSorted((left, right) => right.version_number - left.version_number)
}

export function templateItems(templates: readonly SessionTemplate[]): ContentItem[] {
  return templates.map((template) => {
    const versions = versionsOf(template.versions)
    return {
      id: template.id,
      title: titleOf(template.draft?.content.title, versions),
      draft: template.draft
        ? {
            title: template.draft.content.title,
            updated_at: template.draft.updated_at,
            derived_from_version_id: template.draft.derived_from_version_id ?? null,
          }
        : null,
      versions,
      archived: template.status === 'archived',
    }
  })
}

export function programItems(programs: readonly Program[]): ContentItem[] {
  return programs.map((program) => {
    const versions = versionsOf(program.versions)
    return {
      id: program.id,
      title: titleOf(program.draft?.content.title, versions),
      draft: program.draft
        ? {
            title: program.draft.content.title,
            updated_at: program.draft.updated_at,
            // A program is never an adaptation: see `ContentDraft`.
            derived_from_version_id: null,
          }
        : null,
      versions,
      archived: program.status === 'archived',
    }
  })
}

/**
 * Criterion 1, as one line per item.
 *
 * Says the two things separately and never adds them up: a draft is not a
 * version, and «3 versiones» would hide that one of them is retired and cannot
 * be assigned any more.
 */
export function stateOf(item: ContentItem): string {
  const live = item.versions.filter((version) => !version.retired).length
  const retired = item.versions.length - live
  const parts: string[] = []
  if (item.draft) parts.push('Borrador sin publicar')
  if (live === 1) parts.push('1 versión publicada')
  else if (live > 1) parts.push(`${live} versiones publicadas`)
  if (retired === 1) parts.push('1 retirada')
  else if (retired > 1) parts.push(`${retired} retiradas`)
  // A row with neither cannot come back from the server — a template exists
  // because somebody drafted it — but saying so beats an empty line.
  if (parts.length === 0) return 'Sin contenido todavía'
  return parts.join(' · ')
}

/** Whether anything here was adapted from another version (ADR-009). */
export function isAdaptation(item: ContentItem): boolean {
  if (item.draft?.derived_from_version_id) return true
  return item.versions.some((version) => version.derived_from_version_id !== null)
}

/** Archived content is kept out of the main list and counted for a disclosure. */
export function livingItems(items: readonly ContentItem[]): ContentItem[] {
  return items
    .filter((item) => !item.archived)
    .toSorted((left, right) => left.title.localeCompare(right.title, 'es'))
}

export function archivedItems(items: readonly ContentItem[]): ContentItem[] {
  return items
    .filter((item) => item.archived)
    .toSorted((left, right) => left.title.localeCompare(right.title, 'es'))
}
