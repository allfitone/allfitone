'use client'

/**
 * A session template's draft, edited: `HU-STUDIO-037`.
 *
 * The screen holds its own copy of the draft and sends it whole when the coach
 * saves, because that is what the command is: a replacement guarded by the
 * draft's ETag. Saving is explicit rather than automatic. The server checks
 * every step on every save, so an automatic save would answer each half-typed
 * number with a refusal; here a step that cannot be saved yet says why, and
 * nothing is sent until every step can be.
 *
 * Criterion 4 is the conflict. A save whose ETag is stale is answered `409`
 * with the draft as it now is; the screen shows that beside the unsaved work
 * and lets the coach choose, so neither version is lost by accident.
 *
 * The discipline is not in the draft. The editor finds the template in the
 * library to read it, which is also where the template's name in the list
 * comes from.
 *
 * The shape is the one every editor of the library takes. The way back is a
 * trail, the name is the title, and saving and publishing stay in sight at the
 * top while the page scrolls, with the answer to each beside them. The steps
 * are lines that open, so the session is read whole before any of it is
 * changed. Publishing is final, so it is confirmed, and the confirmation is
 * where criteria 1 and 2 of `HU-STUDIO-038` are said.
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
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@allfitone/react/components/empty'
import { Field, FieldError, FieldLabel } from '@allfitone/react/components/field'
import { IconButton } from '@allfitone/react/components/icon-button'
import { Input } from '@allfitone/react/components/input'
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from '@allfitone/react/components/popover'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@allfitone/react/components/select'
import { Skeleton } from '@allfitone/react/components/skeleton'
import { toast } from '@allfitone/react/components/sonner'
import { Spinner } from '@allfitone/react/components/spinner'
import { Tooltip, TooltipContent, TooltipTrigger } from '@allfitone/react/components/tooltip'
import { FoundationIcon } from '@allfitone/react/icons'
import { useInfiniteQuery, useQueries, useQuery, useQueryClient } from '@tanstack/react-query'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'

import { ContentStatusBadge, LibraryToaster, LibraryTrail } from './library-views'
import { useOrganizationContext } from './organization-context'
import { TemplateStep } from './session-template-step'
import { useStudioSessionMutation } from './studio-query-provider'
import { createCommandIntentManager } from '@/lib/command-intent'
import { derivedFromLabel } from '@/lib/content-version'
import { disciplineName } from '@/lib/movement-search'
import { canManageContent, templateItems } from '@/lib/organization-content'
import { savedAtTime } from '@/lib/saved-at'
import {
  activityTypeChoices,
  addStep,
  buildDraftContent,
  editorFromContent,
  familyOf,
  moveStep,
  removeStep,
  saveIssueMessages,
  type DraftProblems,
  type EditorDraft,
} from '@/lib/session-template-editor'
import {
  latestVersionNumber,
  publishBlockedReason,
  publishOutcome,
} from '@/lib/session-template-publish'
import {
  StudioApiError,
  newCommand,
  studioApi,
  type SessionTemplateDraft,
  type SessionTemplateDraftContent,
} from '@/lib/studio-api'
import {
  catalogActivityTypesQueryOptions,
  catalogDisciplinesQueryOptions,
  isStudioNotFound,
  isStudioQuerySessionCancelled,
  organizationMovementQueryOptions,
  organizationRolesQueryOptions,
  organizationSessionTemplatePagesQueryOptions,
  sessionTemplateDraftQueryOptions,
  studioQueryKeys,
} from '@/lib/studio-query'

const LIBRARY_PAGE_SIZE = 50
const SKELETON_STEPS = [0, 1, 2]

function newStepKey(): string {
  return crypto.randomUUID()
}

export function SessionTemplateEditor() {
  const params = useParams<{ templateId: string }>()
  const templateId = params.templateId
  const queryClient = useQueryClient()
  const { current } = useOrganizationContext()
  const organizationId = current.organization_id
  const contentPath = `/organizations/${organizationId}/content`

  const rolesQuery = useQuery(organizationRolesQueryOptions(organizationId))
  const libraryQuery = useInfiniteQuery(
    organizationSessionTemplatePagesQueryOptions(organizationId, LIBRARY_PAGE_SIZE),
  )
  const draftQuery = useQuery(sessionTemplateDraftQueryOptions(organizationId, templateId))
  const activityTypesQuery = useQuery(catalogActivityTypesQueryOptions())
  const disciplinesQuery = useQuery(catalogDisciplinesQueryOptions())

  const template = libraryQuery.data?.pages
    .flatMap((page) => page.data)
    .find((candidate) => candidate.id === templateId)
  const searchingLibrary = !template && libraryQuery.hasNextPage

  // The draft carries no discipline, so the library is read until the template turns up.
  useEffect(() => {
    if (searchingLibrary && !libraryQuery.isFetchingNextPage) void libraryQuery.fetchNextPage()
  }, [searchingLibrary, libraryQuery])

  const [base, setBase] = useState<SessionTemplateDraft | null>(null)
  const [editor, setEditor] = useState<EditorDraft | null>(null)
  const [dirty, setDirty] = useState(false)
  const [problems, setProblems] = useState<DraftProblems | null>(null)
  const [serverIssues, setServerIssues] = useState<string[]>([])
  const [failure, setFailure] = useState<string>()
  const [conflict, setConflict] = useState<SessionTemplateDraft | null>(null)
  const [savedAt, setSavedAt] = useState<string>()
  const [intents] = useState(() => createCommandIntentManager(newCommand))
  // Its own manager: one holds a single intent, and a save between two clicks of
  // «Publicar» must not give the second click a new command.
  const [publishIntents] = useState(() => createCommandIntentManager(newCommand))
  const [publishIssues, setPublishIssues] = useState<string[]>([])
  const [publishFailure, setPublishFailure] = useState<string>()
  const [confirmingPublish, setConfirmingPublish] = useState(false)
  // Steps open one by one and start closed, so the session is read before it is edited.
  const [openSteps, setOpenSteps] = useState<ReadonlySet<string>>(new Set())
  // Names of movements picked here, so a new step is named before its own read returns.
  const [pickedNames, setPickedNames] = useState<ReadonlyMap<string, string>>(new Map())

  // The first answer becomes the base an edit starts from; later reads never replace it.
  if (draftQuery.data && !base) {
    setBase(draftQuery.data)
    setEditor(editorFromContent(draftQuery.data.content, newStepKey))
  }

  const activityTypes = useMemo(
    () => activityTypesQuery.data?.items ?? [],
    [activityTypesQuery.data],
  )
  const movementIds = [
    ...new Set(editor?.steps.flatMap((step) => (step.movementId ? [step.movementId] : [])) ?? []),
  ]
  const movementQueries = useQueries({
    queries: movementIds.map((movementId) =>
      organizationMovementQueryOptions(organizationId, movementId),
    ),
  })
  const movementNames = new Map(
    movementQueries.flatMap((query) => (query.data ? [[query.data.id, query.data.name]] : [])),
  )

  const save = useStudioSessionMutation({
    mutationFn: (
      { content, etag }: { content: SessionTemplateDraftContent; etag: string },
      signal,
    ) =>
      studioApi.replaceOrganizationSessionTemplateDraft(
        organizationId,
        templateId,
        content,
        etag,
        intents.commandFor({
          operation: 'replace-session-template-draft',
          resourceId: templateId,
          payload: { content, etag },
        }),
        signal,
      ),
    onSuccess: (saved) => {
      queryClient.setQueryData(
        studioQueryKeys.sessionTemplateDraft(organizationId, templateId),
        saved,
      )
      // The library shows the draft's name, which this save may have changed.
      void queryClient.invalidateQueries({
        queryKey: studioQueryKeys.organizationSessionTemplatesRoot(organizationId),
      })
    },
  })

  const publish = useStudioSessionMutation({
    mutationFn: ({ etag }: { etag: string }, signal) =>
      studioApi.publishOrganizationSessionTemplateVersion(
        organizationId,
        templateId,
        etag,
        publishIntents.commandFor({
          operation: 'publish-session-template-version',
          resourceId: templateId,
          payload: { etag },
        }),
        signal,
      ),
    onSuccess: () => {
      // The library lists the versions, and this one may be new.
      void queryClient.invalidateQueries({
        queryKey: studioQueryKeys.organizationSessionTemplatesRoot(organizationId),
      })
    },
  })

  const allowed = canManageContent(current.roles, rolesQuery.data?.items)

  if (!rolesQuery.isPending && !allowed) {
    return (
      <section data-template-create-refusal>
        <Alert variant="warning" live="polite">
          <AlertTitle>Tu rol no edita contenido</AlertTitle>
          <AlertDescription>
            Editar plantillas corresponde a quienes tienen el rol de coach, administración o
            propietario en {current.display_name}.
          </AlertDescription>
        </Alert>
        <Link
          href={contentPath}
          className={buttonVariants({ variant: 'outline' })}
          data-variant="outline"
          data-slot="button"
        >
          Volver a la biblioteca
        </Link>
      </section>
    )
  }

  const notFound =
    isStudioNotFound(draftQuery.error) ||
    (!template && libraryQuery.isSuccess && !libraryQuery.hasNextPage)
  if (notFound) {
    return (
      <section data-content-page aria-label="Plantilla">
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <FoundationIcon name="overview" decorative />
            </EmptyMedia>
            <EmptyTitle>No encontramos esta plantilla</EmptyTitle>
            <EmptyDescription>
              No existe o no es de {current.display_name}. Vuelve a la biblioteca para elegir otra.
            </EmptyDescription>
          </EmptyHeader>
          <Link
            href={contentPath}
            className={buttonVariants({ variant: 'outline' })}
            data-variant="outline"
            data-slot="button"
          >
            Volver a la biblioteca
          </Link>
        </Empty>
      </section>
    )
  }

  const failedRead = draftQuery.isError || libraryQuery.isError || activityTypesQuery.isError
  if (failedRead) {
    return (
      <section data-content-page aria-label="Plantilla">
        <Alert variant="danger" live="polite">
          <AlertTitle>No pudimos abrir el borrador</AlertTitle>
          <AlertDescription>
            La conexión falló de forma temporal. Nada se muestra hasta comprobarlo de nuevo.
          </AlertDescription>
          <AlertAction>
            <Button
              variant="outline"
              onClick={() => {
                void draftQuery.refetch()
                void libraryQuery.refetch()
                void activityTypesQuery.refetch()
              }}
            >
              Reintentar
            </Button>
          </AlertAction>
        </Alert>
      </section>
    )
  }

  if (!editor || !base || !template || activityTypesQuery.isPending) {
    return (
      <section data-content-page aria-label="Plantilla">
        <div data-editor-skeleton role="status" aria-label="Abriendo el borrador">
          <Skeleton data-editor-skeleton-bar />
          {SKELETON_STEPS.map((slot) => (
            <Skeleton key={slot} data-editor-skeleton-step />
          ))}
        </div>
      </section>
    )
  }

  const family = familyOf(editor.activityTypeId, activityTypes)
  const choices = activityTypeChoices(activityTypes, template.discipline_code, editor.steps)
  const titleProblem = problems?.draft[0]
  const derivedFrom = derivedFromLabel(base.derived_from_version_id, template.versions)

  function edit(next: EditorDraft) {
    setEditor(next)
    setDirty(true)
    setProblems(null)
    setServerIssues([])
    setFailure(undefined)
    setSavedAt(undefined)
    setPublishIssues([])
    setPublishFailure(undefined)
  }

  function showStep(key: string, open: boolean) {
    setOpenSteps((previous) => {
      const next = new Set(previous)
      if (open) next.add(key)
      else next.delete(key)
      return next
    })
  }

  function addNewStep() {
    if (!editor) return
    const steps = addStep(editor, activityTypes, newStepKey)
    const added = steps.at(-1)
    // A new step opens: it is the one about to be written.
    if (added && steps.length > editor.steps.length) showStep(added.key, true)
    edit({ ...editor, steps })
  }

  const latest = latestVersionNumber(template.versions)
  const publishBlocked = publishBlockedReason({ dirty, conflict: conflict !== null })

  async function publishDraft() {
    if (!base || publish.isPending || publishBlocked) return
    setPublishIssues([])
    setPublishFailure(undefined)
    try {
      const version = await publish.mutateAsync({ etag: base.etag })
      const outcome = publishOutcome(latest, version)
      if (outcome.kind === 'published') toast.success(outcome.message)
      else toast.info(outcome.message)
      publishIntents.reset()
    } catch (caught) {
      if (isStudioQuerySessionCancelled(caught)) return
      if (caught instanceof StudioApiError && caught.code === 'stale-draft') {
        const theirs = draftFrom(caught.currentState)
        if (theirs) {
          setConflict(theirs)
          return
        }
      }
      // Criterion 3: what the draft still lacks, as the server listed it.
      if (caught instanceof StudioApiError && caught.status === 422 && caught.issues.length > 0) {
        setPublishIssues(saveIssueMessages(caught.issues.map((issue) => issue.code)))
        return
      }
      setPublishFailure(
        caught instanceof StudioApiError ? publishFailureMessage(caught) : PUBLISH_UNKNOWN_FAILURE,
      )
    }
  }

  async function submit() {
    if (!editor || !base || save.isPending) return
    const built = buildDraftContent(editor, activityTypes)
    if ('problems' in built) {
      setProblems(built.problems)
      // What cannot be saved is said inside its step, so those steps open.
      setOpenSteps((previous) => new Set([...previous, ...Object.keys(built.problems.steps)]))
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
        const theirs = draftFrom(caught.currentState)
        if (theirs) {
          setConflict(theirs)
          return
        }
      }
      if (caught instanceof StudioApiError && caught.status === 422 && caught.issues.length > 0) {
        setServerIssues(saveIssueMessages(caught.issues.map((issue) => issue.code)))
        return
      }
      setFailure(caught instanceof StudioApiError ? saveFailure(caught) : SAVE_UNKNOWN_FAILURE)
    }
  }

  function loadTheirs() {
    if (!conflict) return
    setBase(conflict)
    setEditor(editorFromContent(conflict.content, newStepKey))
    setConflict(null)
    setDirty(false)
    setProblems(null)
    setOpenSteps(new Set())
    queryClient.setQueryData(
      studioQueryKeys.sessionTemplateDraft(organizationId, templateId),
      conflict,
    )
  }

  const [item] = templateItems([template])
  const needsSaving = dirty || conflict !== null

  return (
    <section data-content-page="editor" aria-label="Plantilla">
      <LibraryToaster />
      <LibraryTrail
        organizationId={organizationId}
        tab="templates"
        current={editor.title.trim() || 'Sin nombre'}
      />

      {/* Stays in sight while the steps scroll: saving and publishing are never a scroll away. */}
      <header data-editor-bar>
        <div data-editor-title>
          <Input
            aria-label="Nombre"
            placeholder="Nombre de la plantilla"
            maxLength={160}
            value={editor.title}
            aria-invalid={Boolean(titleProblem)}
            onChange={(event) => edit({ ...editor, title: event.target.value })}
            data-editor-name
          />
          {item ? <ContentStatusBadge item={item} kind="templates" /> : null}
        </div>
        <div data-editor-actions>
          <p id="template-save-status" data-template-save-status role="status" aria-live="polite">
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
            <TooltipTrigger render={<span data-template-publish-action />}>
              <Button
                type="button"
                variant={needsSaving ? 'outline' : 'default'}
                disabled={Boolean(publishBlocked) || publish.isPending}
                aria-describedby={publishBlocked ? 'template-save-status' : undefined}
                onClick={() => setConfirmingPublish(true)}
              >
                {publish.isPending ? <Spinner label="Publicando la versión" /> : null}
                {publish.isPending ? 'Publicando…' : 'Publicar'}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom" align="end" data-template-publish-blocked>
              {publishBlocked}
            </TooltipContent>
          </Tooltip>
        </div>
      </header>

      <div data-editor-meta>
        <Field orientation="horizontal" data-template-inline-field>
          <FieldLabel htmlFor="template-activity-type">Tipo de actividad</FieldLabel>
          <Select
            value={editor.activityTypeId}
            onValueChange={(value) => edit({ ...editor, activityTypeId: value ?? null })}
            items={choices}
          >
            <SelectTrigger id="template-activity-type" data-studio-select-trigger>
              <SelectValue placeholder="Elige un tipo de actividad" />
            </SelectTrigger>
            <SelectContent align="start">
              {choices.map((choice) => (
                <SelectItem key={choice.value} value={choice.value} disabled={choice.disabled}>
                  {choice.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {/* Criterion 3, said before it can be broken, and out of the way until asked. */}
          <Popover>
            <PopoverTrigger
              render={
                <IconButton
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Para qué sirve el tipo de actividad"
                />
              }
            >
              <FoundationIcon name="info" decorative />
            </PopoverTrigger>
            <PopoverContent align="start" data-editor-help>
              {/* The title is what names the popover to a screen reader. */}
              <PopoverHeader>
                <PopoverTitle>Tipo de actividad</PopoverTitle>
                <PopoverDescription>
                  Decide qué objetivos lleva cada paso. Con pasos escritos solo puedes cambiarlo por
                  uno de la misma familia.
                </PopoverDescription>
              </PopoverHeader>
            </PopoverContent>
          </Popover>
        </Field>
        <p data-editor-meta-note>
          Disciplina: {disciplineName(template.discipline_code, disciplinesQuery.data?.items)}
          {/* HU-039 criterion 1: the draft keeps where it came from. */}
          {derivedFrom ? ` · ${derivedFrom}` : ''}
        </p>
      </div>

      {titleProblem ? <FieldError data-template-save-error>{titleProblem}</FieldError> : null}

      {/* Answers to a save or a publication sit under the buttons that sent them. */}
      {conflict ? (
        <Alert variant="warning" live="assertive" data-template-conflict>
          <AlertTitle>Alguien guardó este borrador mientras lo editabas</AlertTitle>
          <AlertDescription>
            Lo guardado ahora se llama «{conflict.content.title}», tiene{' '}
            {stepsCount(conflict.content.steps.length)} y se guardó a las{' '}
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
        <Alert variant="danger" live="polite" data-template-save-issues>
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
        <Alert variant="warning" live="polite" data-template-publish-issues>
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

      {problems ? (
        <FieldError data-template-save-error>
          Revisa los pasos marcados: el borrador no se guardó.
        </FieldError>
      ) : null}
      {failure ? <FieldError data-template-save-error>{failure}</FieldError> : null}
      {publishFailure ? (
        <FieldError data-template-publish-error>{publishFailure}</FieldError>
      ) : null}

      {editor.steps.length > 0 ? (
        <ol data-template-steps aria-label="Pasos">
          {editor.steps.map((step, index) => (
            <li key={step.key}>
              <TemplateStep
                step={step}
                position={index + 1}
                count={editor.steps.length}
                movementName={
                  step.movementId
                    ? (movementNames.get(step.movementId) ?? pickedNames.get(step.movementId))
                    : undefined
                }
                problems={problems?.steps[step.key] ?? []}
                open={openSteps.has(step.key)}
                onOpenChange={(open) => showStep(step.key, open)}
                organizationId={organizationId}
                disciplineCode={template.discipline_code}
                onChange={(next) =>
                  edit({
                    ...editor,
                    steps: editor.steps.map((candidate) =>
                      candidate.key === step.key ? next : candidate,
                    ),
                  })
                }
                onMove={(delta) => edit({ ...editor, steps: moveStep(editor.steps, index, delta) })}
                onRemove={() => edit({ ...editor, steps: removeStep(editor.steps, step.key) })}
                onMovementPicked={(movement) => {
                  setPickedNames((previous) => new Map(previous).set(movement.id, movement.name))
                  edit({
                    ...editor,
                    steps: editor.steps.map((candidate) =>
                      candidate.key === step.key
                        ? { ...candidate, movementId: movement.id }
                        : candidate,
                    ),
                  })
                }}
              />
            </li>
          ))}
        </ol>
      ) : (
        <Empty data-template-no-steps>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <FoundationIcon name="checklist" decorative />
            </EmptyMedia>
            <EmptyTitle>Todavía no hay pasos</EmptyTitle>
            <EmptyDescription>
              {family
                ? 'Agrega el primero para construir la sesión.'
                : 'Elige un tipo de actividad para poder agregar pasos.'}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}

      <div data-editor-add>
        <Button type="button" variant="outline" disabled={!family} onClick={addNewStep}>
          <FoundationIcon name="add" decorative />
          Agregar paso
        </Button>
      </div>

      {/* HU-STUDIO-038. Criteria 1 and 2 are the server's, and said here before
          the click: a version is final and moves nothing using an older one. */}
      <AlertDialog open={confirmingPublish} onOpenChange={setConfirmingPublish}>
        <AlertDialogContent data-template-publish>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Publicar una versión?</AlertDialogTitle>
            <AlertDialogDescription>
              {latest === undefined
                ? 'Todavía no se ha publicado ninguna versión.'
                : `La versión más reciente es la ${latest}.`}{' '}
              Una versión publicada no se edita nunca: corregirla es publicar otra. Los programas y
              las asignaciones que ya usan una versión anterior siguen en ella.
            </AlertDialogDescription>
          </AlertDialogHeader>
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

const PUBLISH_UNKNOWN_FAILURE =
  'No pudimos publicar la versión. El borrador sigue guardado; reintenta en un momento.'

function publishFailureMessage(error: StudioApiError): string {
  if (error.status === 403 || error.status === 404) {
    return 'Ya no puedes publicar esta plantilla: tu rol cambió o la organización no está activa.'
  }
  if (error.status === 409 || error.status === 429) {
    return 'Esa publicación ya está en curso. Espera un momento y reintenta.'
  }
  if (error.status === 503) return 'La publicación está pausada temporalmente. Reintenta más tarde.'
  return PUBLISH_UNKNOWN_FAILURE
}

function stepsCount(count: number): string {
  return count === 1 ? '1 paso' : `${count} pasos`
}

/** The draft a stale-draft conflict carries, when it carries one in the expected shape. */
function draftFrom(value: unknown): SessionTemplateDraft | null {
  if (!value || typeof value !== 'object') return null
  const candidate = value as Partial<SessionTemplateDraft>
  if (typeof candidate.etag !== 'string' || typeof candidate.updated_at !== 'string') return null
  const content = candidate.content
  if (!content || typeof content.title !== 'string' || !Array.isArray(content.steps)) return null
  return value as SessionTemplateDraft
}

const SAVE_UNKNOWN_FAILURE =
  'No pudimos guardar el borrador. Tus cambios siguen aquí para que puedas reintentar.'

function saveFailure(error: StudioApiError): string {
  if (error.status === 403 || error.status === 404) {
    return 'Ya no puedes editar esta plantilla: tu rol cambió o la organización no está activa.'
  }
  if (error.status === 409 || error.status === 429) {
    return 'Ese guardado ya está en curso. Espera un momento y reintenta sin cambiar nada.'
  }
  if (error.status === 503) {
    return 'El guardado está pausado temporalmente. Tus cambios siguen aquí; reintenta más tarde.'
  }
  return SAVE_UNKNOWN_FAILURE
}
