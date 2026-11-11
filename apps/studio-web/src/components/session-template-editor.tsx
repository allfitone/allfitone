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
 */

import { Alert, AlertAction, AlertDescription, AlertTitle } from '@allfitone/react/components/alert'
import { Button, buttonVariants } from '@allfitone/react/components/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@allfitone/react/components/card'
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@allfitone/react/components/empty'
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from '@allfitone/react/components/field'
import { Input } from '@allfitone/react/components/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@allfitone/react/components/select'
import { Spinner } from '@allfitone/react/components/spinner'
import { FoundationIcon } from '@allfitone/react/icons'
import { useInfiniteQuery, useQueries, useQuery, useQueryClient } from '@tanstack/react-query'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'

import { useOrganizationContext } from './organization-context'
import { TemplateStepCard } from './session-template-step'
import { useStudioSessionMutation } from './studio-query-provider'
import { WorkspacePageHeader } from './workspace-page-header'
import { createCommandIntentManager } from '@/lib/command-intent'
import { derivedFromLabel } from '@/lib/content-version'
import { disciplineName } from '@/lib/movement-search'
import { canManageContent } from '@/lib/organization-content'
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
  const [publishResult, setPublishResult] = useState<ReturnType<typeof publishOutcome>>()
  const [publishFailure, setPublishFailure] = useState<string>()
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
          Volver al contenido
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
              No existe o no es de {current.display_name}. Vuelve al contenido para elegir otra.
            </EmptyDescription>
          </EmptyHeader>
          <Link
            href={contentPath}
            className={buttonVariants({ variant: 'outline' })}
            data-variant="outline"
            data-slot="button"
          >
            Volver al contenido
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
        <div data-content-catalog-state>
          <Spinner label="Abriendo el borrador" />
          <p>Abriendo el borrador…</p>
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
    setPublishResult(undefined)
    setPublishFailure(undefined)
  }

  const latest = latestVersionNumber(template.versions)
  const publishBlocked = publishBlockedReason({ dirty, conflict: conflict !== null })

  async function publishDraft() {
    if (!base || publish.isPending || publishBlocked) return
    setPublishIssues([])
    setPublishResult(undefined)
    setPublishFailure(undefined)
    try {
      const version = await publish.mutateAsync({ etag: base.etag })
      setPublishResult(publishOutcome(latest, version))
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
      setSavedAt(formatTime(saved.updated_at))
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
    queryClient.setQueryData(
      studioQueryKeys.sessionTemplateDraft(organizationId, templateId),
      conflict,
    )
  }

  return (
    <section data-content-page aria-label="Plantilla">
      <WorkspacePageHeader
        description={`El borrador de «${editor.title || 'sin nombre'}». Solo el borrador se edita, y nada de lo que guardes aquí se puede asignar hasta publicarlo.`}
        actions={
          <Link
            href={contentPath}
            className={buttonVariants({ variant: 'outline' })}
            data-variant="outline"
            data-slot="button"
          >
            Volver al contenido
          </Link>
        }
      />

      <Card>
        <CardHeader>
          <CardTitle role="heading" aria-level={2}>
            Datos de la plantilla
          </CardTitle>
          <CardDescription>
            Disciplina: {disciplineName(template.discipline_code, disciplinesQuery.data?.items)}. No
            se cambia.
            {/* HU-039 criterion 1: the draft keeps where it came from. */}
            {derivedFrom ? ` ${derivedFrom}` : ''}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FieldGroup>
            <Field data-invalid={Boolean(titleProblem)}>
              <FieldLabel htmlFor="template-title">Nombre</FieldLabel>
              <Input
                id="template-title"
                maxLength={160}
                value={editor.title}
                aria-invalid={Boolean(titleProblem)}
                onChange={(event) => edit({ ...editor, title: event.target.value })}
              />
              {titleProblem ? <FieldError>{titleProblem}</FieldError> : null}
            </Field>
            <Field>
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
              {/* Criterion 3, said before it can be broken. */}
              <FieldDescription>
                Decide qué objetivos lleva cada paso.
                {editor.steps.length > 0
                  ? ' Con pasos escritos solo puedes cambiarlo por uno de la misma familia.'
                  : ''}
              </FieldDescription>
            </Field>
          </FieldGroup>
        </CardContent>
      </Card>

      {editor.steps.length > 0 ? (
        <ol data-template-steps aria-label="Pasos">
          {editor.steps.map((step, index) => (
            <li key={step.key}>
              <TemplateStepCard
                step={step}
                position={index + 1}
                count={editor.steps.length}
                movementName={
                  step.movementId
                    ? (movementNames.get(step.movementId) ?? pickedNames.get(step.movementId))
                    : undefined
                }
                problems={problems?.steps[step.key] ?? []}
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
        <p data-template-no-steps>
          {family
            ? 'Todavía no hay pasos. Agrega el primero para construir la sesión.'
            : 'Elige un tipo de actividad para poder agregar pasos.'}
        </p>
      )}

      <div data-template-save-bar>
        <Button
          type="button"
          variant="outline"
          disabled={!family}
          onClick={() => edit({ ...editor, steps: addStep(editor, activityTypes, newStepKey) })}
        >
          Agregar un paso
        </Button>
      </div>

      {/* Answers to a save sit beside the button that sent it. At the top of a
          long draft they were out of sight of whoever had just pressed it. */}
      {conflict ? (
        <Alert variant="warning" live="assertive" data-template-conflict>
          <AlertTitle>Alguien guardó este borrador mientras lo editabas</AlertTitle>
          <AlertDescription>
            Lo guardado ahora se llama «{conflict.content.title}», tiene{' '}
            {stepsCount(conflict.content.steps.length)} y se guardó a las{' '}
            {formatTime(conflict.updated_at)}. Tus cambios siguen aquí sin guardar: puedes cargar lo
            guardado y perderlos, o guardar los tuyos encima.
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

      <div data-template-save-bar>
        {problems ? (
          <FieldError data-template-save-error>
            Revisa lo que se marca arriba: el borrador no se guardó.
          </FieldError>
        ) : null}
        {failure ? <FieldError data-template-save-error>{failure}</FieldError> : null}

        <Button type="button" size="lg" disabled={save.isPending} onClick={() => void submit()}>
          {save.isPending ? <Spinner label="Guardando el borrador" /> : null}
          {save.isPending ? 'Guardando…' : 'Guardar borrador'}
        </Button>
        <p data-template-save-status role="status" aria-live="polite">
          {savedAt
            ? `Borrador guardado a las ${savedAt}.`
            : dirty
              ? 'Hay cambios sin guardar.'
              : 'Sin cambios desde que lo abriste.'}
        </p>
      </div>

      {/* HU-STUDIO-038. Criteria 1 and 2 are the server's, and said here
          before the click: a version is final and moves nothing already using
          an older one. */}
      <Card data-template-publish>
        <CardHeader>
          <CardTitle role="heading" aria-level={2}>
            Publicar una versión
          </CardTitle>
          <CardDescription>
            {latest === undefined
              ? 'Todavía no se ha publicado ninguna versión.'
              : `La versión más reciente es la ${latest}.`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div data-template-save-bar>
            <p data-template-publish-note>
              Una versión publicada no se edita nunca: corregirla es publicar otra. Los programas y
              las asignaciones que ya usan una versión anterior siguen en ella.
            </p>

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
            {publishFailure ? (
              <FieldError data-template-publish-error>{publishFailure}</FieldError>
            ) : null}
            {publishBlocked ? <FieldDescription>{publishBlocked}</FieldDescription> : null}

            <Button
              type="button"
              variant="outline"
              disabled={Boolean(publishBlocked) || publish.isPending}
              onClick={() => void publishDraft()}
            >
              {publish.isPending ? <Spinner label="Publicando la versión" /> : null}
              {publish.isPending ? 'Publicando…' : 'Publicar versión'}
            </Button>
            <p data-template-publish-status role="status" aria-live="polite">
              {publishResult?.message ?? ''}
            </p>
          </div>
        </CardContent>
      </Card>
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

function formatTime(value: string): string {
  return new Intl.DateTimeFormat('es-CO', { timeStyle: 'short' }).format(new Date(value))
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
