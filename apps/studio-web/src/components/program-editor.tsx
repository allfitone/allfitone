'use client'

/**
 * A program's draft, edited: `HU-STUDIO-041`.
 *
 * Built like the template editor: the screen keeps its own copy of the draft
 * and sends it whole under the draft's ETag when the coach saves, and a stale
 * ETag comes back `409` with the draft as it now is, shown beside the unsaved
 * work. Saving is explicit for the same reason too: the server checks every
 * session on every save.
 *
 * A program draft has no read of its own (there is no `GET .../draft`): the
 * listing carries each program with its draft, so the editor finds the program
 * there. The templates are read whole as well, because every session is named
 * by its template version and a version id alone means nothing to a coach.
 *
 * The shape is the one every editor of the library takes: the trail back, the
 * name as the title, and saving and publishing in sight at the top with the
 * answer to each beside them. What is its own is the grid, the program drawn
 * as the weeks it is. Publishing is final, so it is confirmed, and the
 * confirmation is where criteria 2 and 3 of `HU-STUDIO-042` are said.
 */

import { Alert, AlertAction, AlertDescription, AlertTitle } from '@allfitone/react/components/alert'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@allfitone/react/components/alert-dialog'
import { Button, buttonVariants } from '@allfitone/react/components/button'
import { Checkbox } from '@allfitone/react/components/checkbox'
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@allfitone/react/components/empty'
import { Field, FieldDescription, FieldError, FieldLabel } from '@allfitone/react/components/field'
import { Input } from '@allfitone/react/components/input'
import { Skeleton } from '@allfitone/react/components/skeleton'
import { toast } from '@allfitone/react/components/sonner'
import { Spinner } from '@allfitone/react/components/spinner'
import { Textarea } from '@allfitone/react/components/textarea'
import { Tooltip, TooltipContent, TooltipTrigger } from '@allfitone/react/components/tooltip'
import { FoundationIcon } from '@allfitone/react/icons'
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useEffect, useState } from 'react'

import { ContentStatusBadge, LibraryToaster, LibraryTrail } from './library-views'
import { useOrganizationContext } from './organization-context'
import { ProgramGrid } from './program-grid'
import { useStudioSessionMutation } from './studio-query-provider'
import { createCommandIntentManager } from '@/lib/command-intent'
import { libraryPath } from '@/lib/content-library'
import { canManageContent, programItems } from '@/lib/organization-content'
import {
  addSession,
  buildProgramContent,
  composableTemplates,
  moveSession,
  programEditorFromContent,
  programIssueMessages,
  removeSession,
  retiredSessions,
  templateVersionIndex,
  type ProgramDraftProblems,
  type ProgramEditorDraft,
} from '@/lib/program-editor'
import { programPublishOutcome, retiredVersionsInDraft } from '@/lib/program-publish'
import { savedAtTime } from '@/lib/saved-at'
import { latestVersionNumber, publishBlockedReason } from '@/lib/session-template-publish'
import {
  StudioApiError,
  newCommand,
  studioApi,
  type ProgramDraft,
  type ProgramDraftContent,
} from '@/lib/studio-api'
import {
  isStudioQuerySessionCancelled,
  organizationProgramPagesQueryOptions,
  organizationRolesQueryOptions,
  organizationSessionTemplatePagesQueryOptions,
  studioQueryKeys,
} from '@/lib/studio-query'

const LIBRARY_PAGE_SIZE = 50
const SKELETON_WEEKS = [0, 1, 2]

function newSessionKey(): string {
  return crypto.randomUUID()
}

export function ProgramEditor() {
  const params = useParams<{ programId: string }>()
  const programId = params.programId
  const queryClient = useQueryClient()
  const { current } = useOrganizationContext()
  const organizationId = current.organization_id
  const contentPath = `/organizations/${organizationId}/content`

  const rolesQuery = useQuery(organizationRolesQueryOptions(organizationId))
  const programsQuery = useInfiniteQuery(
    organizationProgramPagesQueryOptions(organizationId, LIBRARY_PAGE_SIZE),
  )
  const templatesQuery = useInfiniteQuery(
    organizationSessionTemplatePagesQueryOptions(organizationId, LIBRARY_PAGE_SIZE),
  )

  const program = programsQuery.data?.pages
    .flatMap((page) => page.data)
    .find((candidate) => candidate.id === programId)
  const searchingPrograms = !program && programsQuery.hasNextPage
  // Every template is needed: a session names any of them by its version.
  const readingTemplates = templatesQuery.hasNextPage

  useEffect(() => {
    if (searchingPrograms && !programsQuery.isFetchingNextPage) void programsQuery.fetchNextPage()
  }, [searchingPrograms, programsQuery])
  useEffect(() => {
    if (readingTemplates && !templatesQuery.isFetchingNextPage) void templatesQuery.fetchNextPage()
  }, [readingTemplates, templatesQuery])

  const [base, setBase] = useState<ProgramDraft | null>(null)
  const [editor, setEditor] = useState<ProgramEditorDraft | null>(null)
  const [dirty, setDirty] = useState(false)
  const [problems, setProblems] = useState<ProgramDraftProblems | null>(null)
  const [serverIssues, setServerIssues] = useState<string[]>([])
  const [failure, setFailure] = useState<string>()
  const [conflict, setConflict] = useState<ProgramDraft | null>(null)
  const [savedAt, setSavedAt] = useState<string>()
  const [intents] = useState(() => createCommandIntentManager(newCommand))
  // Its own manager, so a save between two clicks of «Publicar» keeps the command.
  const [publishIntents] = useState(() => createCommandIntentManager(newCommand))
  const [publishIssues, setPublishIssues] = useState<string[]>([])
  const [publishFailure, setPublishFailure] = useState<string>()
  const [confirmingPublish, setConfirmingPublish] = useState(false)
  // Counts the drafts loaded over this one: the grid starts again with each.
  const [loaded, setLoaded] = useState(0)

  // The first answer becomes the base an edit starts from; later reads never replace it.
  if (program && !base) {
    setBase(program.draft)
    setEditor(programEditorFromContent(program.draft.content, newSessionKey))
  }

  const save = useStudioSessionMutation({
    mutationFn: ({ content, etag }: { content: ProgramDraftContent; etag: string }, signal) =>
      studioApi.replaceOrganizationProgramDraft(
        organizationId,
        programId,
        content,
        etag,
        intents.commandFor({
          operation: 'replace-program-draft',
          resourceId: programId,
          payload: { content, etag },
        }),
        signal,
      ),
    onSuccess: () => {
      // The library shows the draft's name, which this save may have changed.
      void queryClient.invalidateQueries({
        queryKey: studioQueryKeys.organizationProgramsRoot(organizationId),
      })
    },
  })

  const publish = useStudioSessionMutation({
    mutationFn: ({ etag }: { etag: string }, signal) =>
      studioApi.publishOrganizationProgramVersion(
        organizationId,
        programId,
        etag,
        publishIntents.commandFor({
          operation: 'publish-program-version',
          resourceId: programId,
          payload: { etag },
        }),
        signal,
      ),
    onSuccess: () => {
      // The library lists the versions, and the invitation form offers them.
      void queryClient.invalidateQueries({
        queryKey: studioQueryKeys.organizationProgramsRoot(organizationId),
      })
    },
  })

  const allowed = canManageContent(current.roles, rolesQuery.data?.items)

  if (!rolesQuery.isPending && !allowed) {
    return (
      <section data-program-create-refusal>
        <Alert variant="warning" live="polite">
          <AlertTitle>Tu rol no edita contenido</AlertTitle>
          <AlertDescription>
            Editar programas corresponde a quienes tienen el rol de coach, administración o
            propietario en {current.display_name}.
          </AlertDescription>
        </Alert>
        <BackToContent href={libraryPath(organizationId, 'programs')} />
      </section>
    )
  }

  if (!program && programsQuery.isSuccess && !programsQuery.hasNextPage) {
    return (
      <section data-content-page aria-label="Programa">
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <FoundationIcon name="overview" decorative />
            </EmptyMedia>
            <EmptyTitle>No encontramos este programa</EmptyTitle>
            <EmptyDescription>
              No existe o no es de {current.display_name}. Vuelve a la biblioteca para elegir otro.
            </EmptyDescription>
          </EmptyHeader>
          <BackToContent href={libraryPath(organizationId, 'programs')} />
        </Empty>
      </section>
    )
  }

  if (programsQuery.isError || templatesQuery.isError) {
    return (
      <section data-content-page aria-label="Programa">
        <Alert variant="danger" live="polite">
          <AlertTitle>No pudimos abrir el borrador</AlertTitle>
          <AlertDescription>
            La conexión falló de forma temporal. Nada se muestra hasta comprobarlo de nuevo.
          </AlertDescription>
          <AlertAction>
            <Button
              variant="outline"
              onClick={() => {
                void programsQuery.refetch()
                void templatesQuery.refetch()
              }}
            >
              Reintentar
            </Button>
          </AlertAction>
        </Alert>
      </section>
    )
  }

  const templates = templatesQuery.data?.pages.flatMap((page) => page.data)
  if (!editor || !base || !templates || readingTemplates) {
    return (
      <section data-content-page="program" aria-label="Programa">
        <div data-editor-skeleton role="status" aria-label="Abriendo el borrador">
          <Skeleton data-editor-skeleton-bar />
          {SKELETON_WEEKS.map((slot) => (
            <Skeleton key={slot} data-program-skeleton-week />
          ))}
        </div>
      </section>
    )
  }

  const index = templateVersionIndex(templates)
  const composable = composableTemplates(templates)
  const hiddenTemplates =
    templates.filter((template) => template.status !== 'archived').length - composable.length
  const retired = retiredSessions(editor.sessions, index)
  const latest = latestVersionNumber(program?.versions ?? [])
  const publishBlocked = publishBlockedReason({ dirty, conflict: conflict !== null })
  const retiredInSaved = retiredVersionsInDraft(base.deprecated_template_version_ids ?? [], index)

  function edit(next: ProgramEditorDraft) {
    setEditor(next)
    setDirty(true)
    setProblems(null)
    setServerIssues([])
    setFailure(undefined)
    setSavedAt(undefined)
    setPublishIssues([])
    setPublishFailure(undefined)
  }

  async function publishDraft() {
    if (!base || publish.isPending || publishBlocked) return
    setPublishIssues([])
    setPublishFailure(undefined)
    try {
      const version = await publish.mutateAsync({ etag: base.etag })
      const outcome = programPublishOutcome(latest, version)
      if (outcome.kind === 'published') toast.success(outcome.message)
      else toast.info(outcome.message)
      publishIntents.reset()
    } catch (caught) {
      if (isStudioQuerySessionCancelled(caught)) return
      if (caught instanceof StudioApiError && caught.code === 'stale-draft') {
        const theirs = programDraftFrom(caught.currentState)
        if (theirs) {
          setConflict(theirs)
          return
        }
      }
      // What the draft still lacks, as the server listed it.
      if (caught instanceof StudioApiError && caught.status === 422 && caught.issues.length > 0) {
        setPublishIssues(
          programIssueMessages(
            caught.issues.map((issue) => issue.code),
            'publish',
          ),
        )
        return
      }
      setPublishFailure(
        caught instanceof StudioApiError ? publishFailureMessage(caught) : PUBLISH_UNKNOWN_FAILURE,
      )
    }
  }

  async function submit() {
    if (!editor || !base || save.isPending) return
    const built = buildProgramContent(editor)
    if ('problems' in built) {
      setProblems(built.problems)
      return
    }
    setProblems(null)
    setServerIssues([])
    setFailure(undefined)
    try {
      const saved = await save.mutateAsync({
        content: built.content,
        etag: conflict?.etag ?? base.etag,
      })
      setBase(saved)
      setConflict(null)
      setDirty(false)
      setSavedAt(savedAtTime(saved.updated_at))
      intents.reset()
    } catch (caught) {
      if (isStudioQuerySessionCancelled(caught)) return
      if (caught instanceof StudioApiError && caught.code === 'stale-draft') {
        const theirs = programDraftFrom(caught.currentState)
        if (theirs) {
          setConflict(theirs)
          return
        }
      }
      if (caught instanceof StudioApiError && caught.status === 422 && caught.issues.length > 0) {
        setServerIssues(
          programIssueMessages(
            caught.issues.map((issue) => issue.code),
            'save',
          ),
        )
        return
      }
      setFailure(caught instanceof StudioApiError ? saveFailure(caught) : SAVE_UNKNOWN_FAILURE)
    }
  }

  function loadTheirs() {
    if (!conflict) return
    setBase(conflict)
    setEditor(programEditorFromContent(conflict.content, newSessionKey))
    setConflict(null)
    setDirty(false)
    setProblems(null)
    setLoaded((count) => count + 1)
  }

  const [item] = program ? programItems([program]) : []
  const needsSaving = dirty || conflict !== null

  return (
    <section data-content-page="program" aria-label="Programa">
      <LibraryToaster />
      <LibraryTrail
        organizationId={organizationId}
        tab="programs"
        current={editor.title.trim() || 'Sin nombre'}
      />

      {/* Stays in sight while the weeks scroll: saving and publishing are never a scroll away. */}
      <header data-editor-bar>
        <div data-editor-title>
          <Input
            aria-label="Nombre"
            placeholder="Nombre del programa"
            maxLength={160}
            value={editor.title}
            aria-invalid={Boolean(problems?.title)}
            onChange={(event) => edit({ ...editor, title: event.target.value })}
            data-editor-name
          />
          {item ? <ContentStatusBadge item={item} kind="programs" /> : null}
        </div>
        <div data-editor-actions>
          <p id="program-save-status" data-program-save-status role="status" aria-live="polite">
            {savedAt
              ? `Borrador guardado a las ${savedAt}.`
              : dirty
                ? 'Hay cambios sin guardar.'
                : 'Sin cambios desde que lo abriste.'}
          </p>
          {/* One of the two is the next thing to do, and that one is the filled button. */}
          <Button
            type="button"
            variant={needsSaving ? 'default' : 'outline'}
            disabled={!needsSaving || save.isPending}
            onClick={() => void submit()}
          >
            {save.isPending ? <Spinner label="Guardando el borrador" /> : null}
            {save.isPending ? 'Guardando…' : 'Guardar'}
          </Button>
          {/* Why it is off shows on the button itself: a line under the bar moved the page. */}
          <Tooltip disabled={!publishBlocked}>
            <TooltipTrigger render={<span data-program-publish-action />}>
              <Button
                type="button"
                variant={needsSaving ? 'outline' : 'default'}
                disabled={Boolean(publishBlocked) || publish.isPending}
                aria-describedby={publishBlocked ? 'program-save-status' : undefined}
                onClick={() => setConfirmingPublish(true)}
              >
                {publish.isPending ? <Spinner label="Publicando la versión" /> : null}
                {publish.isPending ? 'Publicando…' : 'Publicar'}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom" align="end" data-program-publish-blocked>
              {publishBlocked}
            </TooltipContent>
          </Tooltip>
        </div>
      </header>

      <div data-editor-meta>
        <Field orientation="horizontal" data-editor-inline-field>
          <Checkbox
            id="program-repeats"
            checked={editor.repeatsForever}
            onCheckedChange={(checked) => edit({ ...editor, repeatsForever: checked === true })}
          />
          <FieldLabel htmlFor="program-repeats">
            Al terminar la última semana, vuelve a empezar
          </FieldLabel>
        </Field>
        <p data-editor-meta-note>
          El día 1 es el primer día del programa para quien lo recibe, no un día de la semana.
        </p>
      </div>

      {/* What stops a save is said under the button that was pressed. */}
      {problems?.title ? <FieldError data-program-save-error>{problems.title}</FieldError> : null}
      {problems?.notes ? <FieldError data-program-save-error>{problems.notes}</FieldError> : null}
      {problems?.sessions ? (
        <FieldError data-program-save-error>{problems.sessions}</FieldError>
      ) : null}

      {/* Answers to a save or a publication sit under the buttons that sent them. */}
      {conflict ? (
        <Alert variant="warning" live="assertive" data-program-conflict>
          <AlertTitle>Alguien guardó este borrador mientras lo editabas</AlertTitle>
          <AlertDescription>
            Lo guardado ahora se llama «{conflict.content.title}», tiene{' '}
            {sessionsCount(conflict.content.sessions.length)} y se guardó a las{' '}
            {savedAtTime(conflict.updated_at)}. Tus cambios siguen aquí sin guardar: puedes cargar
            lo guardado y perderlos, o guardar los tuyos encima.
          </AlertDescription>
          <AlertAction>
            <Button variant="outline" onClick={loadTheirs}>
              Cargar lo guardado
            </Button>
            <Button onClick={() => void submit()} disabled={save.isPending}>
              Guardar mis cambios encima
            </Button>
          </AlertAction>
        </Alert>
      ) : null}

      {serverIssues.length > 0 ? (
        <Alert variant="danger" live="polite" data-program-save-issues>
          <AlertTitle>El servidor no aceptó el borrador</AlertTitle>
          <AlertDescription>
            <ul>
              {serverIssues.map((issue) => (
                <li key={issue}>{issue}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      ) : null}

      {publishIssues.length > 0 ? (
        <Alert variant="warning" live="polite" data-program-publish-issues>
          <AlertTitle>Al borrador le falta esto para publicarse</AlertTitle>
          <AlertDescription>
            <ul>
              {publishIssues.map((issue) => (
                <li key={issue}>{issue}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      ) : null}

      {failure ? <FieldError data-program-save-error>{failure}</FieldError> : null}
      {publishFailure ? <FieldError data-program-publish-error>{publishFailure}</FieldError> : null}

      {/* Criterion 3: what stays, said before publishing has to warn about it. */}
      {retired.length > 0 ? (
        <Alert variant="warning" data-program-retired>
          <AlertTitle>
            {retired.length === 1
              ? 'Una sesión usa una versión retirada'
              : `${retired.length} sesiones usan versiones retiradas`}
          </AlertTitle>
          <AlertDescription>
            Puedes seguir editando el programa y conservarlas; al publicarlo se te advertirá. Para
            dejar de usarlas, quita esas sesiones y agrégalas con una versión vigente.
          </AlertDescription>
        </Alert>
      ) : null}

      {/* Criterion 2, when it leaves nothing to add: said once, over the grid it turns off. */}
      {composable.length === 0 ? (
        <Alert variant="warning" data-program-no-templates>
          <AlertTitle>Todavía no hay versiones de plantilla que usar</AlertTitle>
          <AlertDescription>
            Un programa se compone de versiones publicadas de plantillas, y ninguna plantilla tiene
            una vigente. Publica una plantilla y vuelve aquí.
          </AlertDescription>
        </Alert>
      ) : editor.sessions.length === 0 ? (
        <p data-program-no-sessions>
          Todavía no hay sesiones. Agrega la primera para empezar a componer el programa.
        </p>
      ) : null}

      <ProgramGrid
        key={loaded}
        sessions={editor.sessions}
        index={index}
        templates={composable}
        hiddenTemplates={hiddenTemplates}
        contentPath={contentPath}
        onAdd={(session) => edit(addSession(editor, session, newSessionKey))}
        onMove={(key, to) => edit(moveSession(editor, key, to))}
        onRemove={(key) => edit(removeSession(editor, key))}
      />

      <Field data-invalid={Boolean(problems?.notes)} data-program-notes>
        <FieldLabel htmlFor="program-notes">Notas</FieldLabel>
        <Textarea
          id="program-notes"
          maxLength={2000}
          value={editor.notes}
          aria-invalid={Boolean(problems?.notes)}
          onChange={(event) => edit({ ...editor, notes: event.target.value })}
        />
        <FieldDescription>Opcional. Lo que conviene saber antes de empezarlo.</FieldDescription>
      </Field>

      {/* HU-STUDIO-042. Criteria 2 and 3 are the server's, and said here before
          the click, with the retired versions the saved draft would publish. */}
      <AlertDialog open={confirmingPublish} onOpenChange={setConfirmingPublish}>
        <AlertDialogContent data-program-publish>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Publicar una versión?</AlertDialogTitle>
            <AlertDialogDescription>
              {latest === undefined
                ? 'Todavía no se ha publicado ninguna versión.'
                : `La versión más reciente es la ${latest}.`}{' '}
              Una versión publicada no se edita nunca. Cada sesión queda fijada a la versión de
              plantilla que nombra: si esa plantilla publica otra, este programa sigue en la suya
              hasta que publiques otra versión del programa.
            </AlertDialogDescription>
          </AlertDialogHeader>

          {/* HU-041 criterion 3, from what the server says the saved draft holds. */}
          {retiredInSaved.length > 0 ? (
            <Alert variant="warning" data-program-publish-retired>
              <AlertTitle>Vas a publicar versiones retiradas</AlertTitle>
              <AlertDescription>
                <p>
                  El borrador guardado usa estas versiones, que ya no se pueden sumar a contenido
                  nuevo. Se publicarán tal como están; si prefieres evitarlo, cámbialas antes por
                  una versión vigente.
                </p>
                <ul>
                  {retiredInSaved.map((label) => (
                    <li key={label}>{label}</li>
                  ))}
                </ul>
              </AlertDescription>
            </Alert>
          ) : null}

          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setConfirmingPublish(false)
                void publishDraft()
              }}
            >
              Publicar versión
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  )
}

function BackToContent({ href }: { href: string }) {
  return (
    <Link
      href={href}
      className={buttonVariants({ variant: 'outline' })}
      data-variant="outline"
      data-slot="button"
    >
      Volver a la biblioteca
    </Link>
  )
}

function sessionsCount(count: number): string {
  return count === 1 ? '1 sesión' : `${count} sesiones`
}

/** The draft a stale-draft conflict carries, when it carries one in the expected shape. */
function programDraftFrom(value: unknown): ProgramDraft | null {
  if (!value || typeof value !== 'object') return null
  const candidate = value as Partial<ProgramDraft>
  if (typeof candidate.etag !== 'string' || typeof candidate.updated_at !== 'string') return null
  const content = candidate.content
  if (!content || typeof content.title !== 'string' || !Array.isArray(content.sessions)) return null
  return value as ProgramDraft
}

const PUBLISH_UNKNOWN_FAILURE =
  'No pudimos publicar la versión. El borrador sigue guardado; reintenta en un momento.'

function publishFailureMessage(error: StudioApiError): string {
  if (error.status === 403 || error.status === 404) {
    return 'Ya no puedes publicar este programa: tu rol cambió o la organización no está activa.'
  }
  if (error.status === 409 || error.status === 429) {
    return 'Esa publicación ya está en curso. Espera un momento y reintenta.'
  }
  if (error.status === 503) return 'La publicación está pausada temporalmente. Reintenta más tarde.'
  return PUBLISH_UNKNOWN_FAILURE
}

const SAVE_UNKNOWN_FAILURE =
  'No pudimos guardar el borrador. Tus cambios siguen aquí para que puedas reintentar.'

function saveFailure(error: StudioApiError): string {
  if (error.status === 403 || error.status === 404) {
    return 'Ya no puedes editar este programa: tu rol cambió o la organización no está activa.'
  }
  if (error.status === 409 || error.status === 429) {
    return 'Ese guardado ya está en curso. Espera un momento y reintenta sin cambiar nada.'
  }
  if (error.status === 503) {
    return 'El guardado está pausado temporalmente. Tus cambios siguen aquí; reintenta más tarde.'
  }
  return SAVE_UNKNOWN_FAILURE
}
