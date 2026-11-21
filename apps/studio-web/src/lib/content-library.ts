/**
 * How the library is browsed: the tab it opens on, the view its lists take and
 * what its filters keep.
 *
 * The library is the screen the other registers copy, so what is decided here
 * is decided once: the address names the tab, so a link back lands where the
 * reader came from; a list is cards or rows by the reader's choice, kept in
 * this browser; and a state is one word on a badge, where it used to be a
 * sentence to parse.
 *
 * Nothing here filters by organization. The server scopes both listings, and a
 * second filter would be a second place for that rule to be wrong.
 */

import { archivedItems, livingItems, type ContentItem } from './organization-content'

export type LibraryTab = 'templates' | 'programs' | 'movements'
export type LibraryView = 'cards' | 'rows'
export type ContentKind = 'templates' | 'programs'
export type ContentStateFilter = 'current' | 'draft' | 'published' | 'archived'

const TABS: readonly LibraryTab[] = ['templates', 'programs', 'movements']
const DEFAULT_TAB: LibraryTab = 'templates'
const DEFAULT_VIEW: LibraryView = 'cards'

function single(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value
}

/** An address that names no tab, or one that does not exist, opens the first. */
export function libraryTabFromQuery(value: string | string[] | undefined): LibraryTab {
  const named = single(value)
  return TABS.find((tab) => tab === named) ?? DEFAULT_TAB
}

/** `?new=1` opens the creation dialog of the tab the address names. */
export function libraryCreateFromQuery(
  value: string | string[] | undefined,
  tab: LibraryTab,
): LibraryTab | null {
  return single(value) === '1' ? tab : null
}

export function libraryPath(organizationId: string, tab: LibraryTab = DEFAULT_TAB): string {
  const base = `/organizations/${organizationId}/content`
  return tab === DEFAULT_TAB ? base : `${base}?tab=${tab}`
}

export function libraryCreatePath(organizationId: string, tab: LibraryTab): string {
  return `/organizations/${organizationId}/content?tab=${tab}&new=1`
}

export const LIBRARY_VIEW_STORAGE_KEY = 'allfit-studio-library-view:v1'

// What she chose in this visit wins, so the choice holds where storage is blocked.
let chosenView: LibraryView | undefined
const viewListeners = new Set<() => void>()

function rememberedLibraryView(): LibraryView {
  if (typeof localStorage === 'undefined') return DEFAULT_VIEW
  try {
    return localStorage.getItem(LIBRARY_VIEW_STORAGE_KEY) === 'rows' ? 'rows' : DEFAULT_VIEW
  } catch {
    return DEFAULT_VIEW
  }
}

export function shownLibraryView(): LibraryView {
  return chosenView ?? rememberedLibraryView()
}

export function chooseLibraryView(view: LibraryView): void {
  chosenView = view
  try {
    localStorage.setItem(LIBRARY_VIEW_STORAGE_KEY, view)
  } catch {
    // Kept for this visit only.
  }
  for (const listener of viewListeners) listener()
}

export function subscribeToLibraryView(listener: () => void): () => void {
  function followOtherTab(event: StorageEvent) {
    if (event.key !== LIBRARY_VIEW_STORAGE_KEY) return
    chosenView = undefined
    listener()
  }
  viewListeners.add(listener)
  window.addEventListener('storage', followOtherTab)
  return () => {
    viewListeners.delete(listener)
    window.removeEventListener('storage', followOtherTab)
  }
}

export type ContentStatus =
  | { kind: 'archived' }
  | { kind: 'published'; version: number }
  | { kind: 'retired' }
  | { kind: 'draft' }

/**
 * The one state an item shows. Published names the newest version that can
 * still be assigned: content with only retired ones is not published any more.
 */
export function contentStatus(item: ContentItem): ContentStatus {
  if (item.archived) return { kind: 'archived' }
  const live = item.versions.find((version) => !version.retired)
  if (live) return { kind: 'published', version: live.version_number }
  if (item.versions.length > 0) return { kind: 'retired' }
  return { kind: 'draft' }
}

/** «Plantilla» is feminine and «programa» is not, so the word follows the kind. */
export function contentStatusLabel(status: ContentStatus, kind: ContentKind): string {
  const feminine = kind === 'templates'
  switch (status.kind) {
    case 'archived':
      return feminine ? 'Archivada' : 'Archivado'
    case 'published':
      return `${feminine ? 'Publicada' : 'Publicado'} v${status.version}`
    case 'retired':
      return feminine ? 'Retirada' : 'Retirado'
    case 'draft':
      return 'Borrador'
  }
}

export interface ContentFilters {
  term: string
  /** Null for every discipline, and always null for programs, which have none. */
  disciplineCode: string | null
  state: ContentStateFilter
}

export const NO_CONTENT_FILTERS: ContentFilters = {
  term: '',
  disciplineCode: null,
  state: 'current',
}

export function filtersNarrow(filters: ContentFilters): boolean {
  return (
    filters.term.trim() !== '' || filters.disciplineCode !== null || filters.state !== 'current'
  )
}

// A name is found whatever its capitals and accents: «movil» finds «Movilidad».
function fold(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim()
}

/**
 * What the list shows under its filters, in the order the library keeps.
 * Archived content is its own state and never mixed in with the rest.
 */
export function filterContent(
  items: readonly ContentItem[],
  filters: ContentFilters,
): ContentItem[] {
  const term = fold(filters.term)
  const pool = filters.state === 'archived' ? archivedItems(items) : livingItems(items)
  return pool.filter((item) => {
    const status = contentStatus(item).kind
    if (filters.state === 'draft' && status !== 'draft') return false
    if (filters.state === 'published' && status !== 'published') return false
    if (filters.disciplineCode && item.disciplineCode !== filters.disciplineCode) return false
    return term === '' || fold(item.title).includes(term)
  })
}

/** Where pressing an item leads: its draft while it can be edited, else its newest version. */
export function contentHref(basePath: string, item: ContentItem): string | undefined {
  if (item.draft && !item.archived) return `${basePath}/${item.id}`
  const newest = item.versions.at(0)
  return newest ? `${basePath}/${item.id}/versions/${newest.version_number}` : undefined
}

/** When it last changed: the draft's last save, else the newest publication. */
export function editedAt(item: ContentItem): string | undefined {
  return item.draft?.updated_at ?? item.versions.at(0)?.published_at
}

export function programShape(sessions: { count: number; weeks: number } | null): string {
  if (!sessions || sessions.count === 0) return 'Sin sesiones'
  const count = sessions.count === 1 ? '1 sesión' : `${sessions.count} sesiones`
  const weeks = sessions.weeks === 1 ? '1 semana' : `${sessions.weeks} semanas`
  return `${count} en ${weeks}`
}
