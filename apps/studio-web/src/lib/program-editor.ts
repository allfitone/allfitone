/**
 * A program's draft, edited: `HU-STUDIO-041`.
 *
 * A program is a list of sessions, each on a week and a day and each naming one
 * template version. The three criteria, and where each one is held:
 *
 * 1. **Every position names an exact template version, never «the latest».**
 *    The contract has no other way to say it: a session carries a
 *    `template_version_id`. The picker lists versions by number so the choice
 *    is visibly one version, and nothing here ever resolves «newest».
 * 2. **A template draft cannot be composed.** A draft is not a version and has
 *    no version id, so `composableTemplates` only offers published versions,
 *    and a template with nothing published is not offered at all.
 * 3. **Retired versions already in the program stay editable.**
 *    `planning.replace_program_draft` refuses only a *new* reference to a
 *    retired version (`template-version-deprecated`) and keeps those already
 *    there; the picker therefore shows retired versions disabled, and the
 *    sessions holding one are named so publishing can warn about them.
 *
 * Day 1 is the first day of the program for whoever receives it: an assignment
 * places a session on `starts_on + (week - 1) * 7 + day - 1`. It is not a
 * weekday, which is why the screen says «Día 3» and never «miércoles».
 */

import type { ProgramDraftContent, ProgramSessionContent, SessionTemplate } from './studio-api'

const TITLE_LIMIT = 160
const NOTES_LIMIT = 2000
const SESSION_LIMIT = 730
export const WEEK_LIMIT = 104
export const DAY_OPTIONS = [1, 2, 3, 4, 5, 6, 7] as const

/** One published template version, as the editor names it. */
export interface TemplateVersionChoice {
  id: string
  templateId: string
  templateTitle: string
  versionNumber: number
  retired: boolean
  publishedAt: string
}

export interface ComposableTemplate {
  id: string
  title: string
  /** Newest first; a retired one is listed but cannot be added. */
  versions: TemplateVersionChoice[]
}

export interface ProgramEditorSession {
  /** Stable across edits, so a moved session keeps its row. */
  key: string
  week: number
  day: number
  templateVersionId: string
}

export interface ProgramEditorDraft {
  title: string
  notes: string
  repeatsForever: boolean
  sessions: ProgramEditorSession[]
}

export interface ProgramDraftProblems {
  title?: string
  notes?: string
  sessions?: string
}

// ------------------------------------------------------------- the versions

function choicesOf(template: SessionTemplate): TemplateVersionChoice[] {
  return template.versions
    .map((version) => ({
      id: version.id,
      templateId: template.id,
      // A template version carries no title: the name is the template's.
      templateTitle: template.draft.content.title,
      versionNumber: version.version_number,
      retired: version.status === 'deprecated',
      publishedAt: version.published_at,
    }))
    .toSorted((left, right) => right.versionNumber - left.versionNumber)
}

/** Every published version of these templates, by id, to name a session. */
export function templateVersionIndex(
  templates: readonly SessionTemplate[],
): Map<string, TemplateVersionChoice> {
  return new Map(
    templates.flatMap((template) => choicesOf(template).map((choice) => [choice.id, choice])),
  )
}

/**
 * The templates a new session can come from: not archived, with at least one
 * version that is not retired. Criterion 2 is this filter.
 */
export function composableTemplates(templates: readonly SessionTemplate[]): ComposableTemplate[] {
  return templates
    .filter((template) => template.status !== 'archived')
    .map((template) => ({
      id: template.id,
      title: template.draft.content.title,
      versions: choicesOf(template),
    }))
    .filter((template) => template.versions.some((version) => !version.retired))
    .toSorted((left, right) => left.title.localeCompare(right.title, 'es'))
}

// ------------------------------------------------------------- the sessions

export function programEditorFromContent(
  content: ProgramDraftContent,
  newKey: () => string,
): ProgramEditorDraft {
  return {
    title: content.title,
    notes: content.notes ?? '',
    repeatsForever: content.repeats_forever ?? false,
    sessions: content.sessions
      .toSorted((left, right) => left.position - right.position)
      .map((session) => ({
        key: newKey(),
        week: session.week,
        day: session.day,
        templateVersionId: session.template_version_id,
      })),
  }
}

/**
 * Week, then day, then the order they were added in. The sort is stable, so
 * two sessions on one day keep the order the coach gave them.
 */
export function orderedSessions(sessions: readonly ProgramEditorSession[]): ProgramEditorSession[] {
  return sessions.toSorted((left, right) => left.week - right.week || left.day - right.day)
}

export function sessionsByWeek(
  sessions: readonly ProgramEditorSession[],
): Array<{ week: number; sessions: ProgramEditorSession[] }> {
  const weeks = new Map<number, ProgramEditorSession[]>()
  for (const session of orderedSessions(sessions)) {
    weeks.set(session.week, [...(weeks.get(session.week) ?? []), session])
  }
  return [...weeks].map(([week, entries]) => ({ week, sessions: entries }))
}

export function addSession(
  draft: ProgramEditorDraft,
  session: Omit<ProgramEditorSession, 'key'>,
  newKey: () => string,
): ProgramEditorDraft {
  return { ...draft, sessions: [...draft.sessions, { ...session, key: newKey() }] }
}

export function moveSession(
  draft: ProgramEditorDraft,
  key: string,
  to: { week?: number; day?: number },
): ProgramEditorDraft {
  return {
    ...draft,
    sessions: draft.sessions.map((session) =>
      session.key === key ? { ...session, ...to } : session,
    ),
  }
}

export function removeSession(draft: ProgramEditorDraft, key: string): ProgramEditorDraft {
  return { ...draft, sessions: draft.sessions.filter((session) => session.key !== key) }
}

/** Where a new session most likely goes: the day after the last one. */
export function nextSlot(draft: ProgramEditorDraft): { week: number; day: number } {
  const last = orderedSessions(draft.sessions).at(-1)
  if (!last) return { week: 1, day: 1 }
  if (last.day < 7) return { week: last.week, day: last.day + 1 }
  if (last.week < WEEK_LIMIT) return { week: last.week + 1, day: 1 }
  return { week: last.week, day: last.day }
}

/** The weeks in use and the next one, so a program grows a week at a time. */
export function weekOptions(sessions: readonly ProgramEditorSession[]): number[] {
  const last = Math.max(0, ...sessions.map((session) => session.week))
  const count = Math.min(WEEK_LIMIT, last + 1)
  return Array.from({ length: count }, (_, index) => index + 1)
}

/** The sessions that hold a retired version: kept, and warned about on publishing. */
export function retiredSessions(
  sessions: readonly ProgramEditorSession[],
  index: ReadonlyMap<string, TemplateVersionChoice>,
): ProgramEditorSession[] {
  return orderedSessions(sessions).filter(
    (session) => index.get(session.templateVersionId)?.retired === true,
  )
}

// ------------------------------------------------------------- saving

/**
 * What the replacement sends, or why it cannot be sent yet.
 *
 * An empty program saves: `program_content_errors` asks for a session only
 * when publishing. Positions are numbered here, continuous across the whole
 * program in week and day order, because the server only checks they differ.
 */
export function buildProgramContent(
  draft: ProgramEditorDraft,
): { content: ProgramDraftContent } | { problems: ProgramDraftProblems } {
  const problems: ProgramDraftProblems = {}
  const title = draft.title.trim()
  if (!title) problems.title = 'Escribe el nombre del programa.'
  else if (title.length > TITLE_LIMIT) problems.title = 'El nombre admite hasta 160 caracteres.'
  const notes = draft.notes.trim()
  if (notes.length > NOTES_LIMIT) problems.notes = 'Las notas admiten hasta 2000 caracteres.'
  if (draft.sessions.length > SESSION_LIMIT) {
    problems.sessions = 'Un programa admite hasta 730 sesiones.'
  }
  if (Object.keys(problems).length > 0) return { problems }

  const sessions: ProgramSessionContent[] = orderedSessions(draft.sessions).map(
    (session, index) => ({
      position: index + 1,
      week: session.week,
      day: session.day,
      template_version_id: session.templateVersionId,
    }),
  )
  return {
    content: {
      title,
      notes: notes || null,
      repeats_forever: draft.repeatsForever,
      sessions,
    },
  }
}

// ------------------------------------------------------------- answering

/**
 * The codes `planning.program_content_errors` and `replace_program_draft`
 * raise, in the reader's words. `sessions` is the one code with two meanings:
 * too many on a save, none at all on publishing.
 */
const ISSUE_MESSAGE: Record<string, string> = {
  'invalid-content-shape': 'El borrador tiene una forma que el servidor no reconoce.',
  'invalid-content-value': 'El borrador tiene un valor que el servidor no pudo leer.',
  notes: 'Las notas admiten hasta 2000 caracteres.',
  repeats_forever: 'La opción de volver a empezar no tiene un valor válido.',
  'session-shape': 'Una sesión tiene una semana, un día o una plantilla que no son válidos.',
  'template-version':
    'Una sesión usa una versión de plantilla que no es de esta organización o ya no existe.',
  'template-version-deprecated':
    'Agregaste una versión retirada. Las que el programa ya tenía se conservan, pero no se pueden sumar nuevas.',
  'duplicate-session-position': 'Dos sesiones quedaron en la misma posición.',
}

export function programIssueMessages(
  codes: readonly string[],
  context: 'save' | 'publish',
): string[] {
  return [...new Set(codes)].map((code) => {
    if (code === 'sessions') {
      return context === 'publish'
        ? 'El programa necesita al menos una sesión para publicarse.'
        : 'Un programa admite hasta 730 sesiones.'
    }
    return ISSUE_MESSAGE[code] ?? `El servidor rechazó un valor del borrador (${code}).`
  })
}
