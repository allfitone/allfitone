'use client'

/**
 * Correcting a gym's own movement: `HU-STUDIO-065`.
 *
 * The edit is partial and conditioned on the revision read: only the fields
 * that changed are sent, with `expected_revision`, and a newer revision answers
 * `409 stale-draft` without the current state, so the screen reads the movement
 * again and shows it beside the unsaved work.
 *
 * Its two criteria:
 *
 * 1. **Editing never reinterprets history.** Versions and sessions keep only
 *    the movement's id, so once a published version uses it (`name_locked`)
 *    the discipline is fixed and the name accepts only case and spacing;
 *    anything else is checked here first and refused by the server as
 *    `movement-in-use`. The other names and the variant stay editable.
 * 2. **A global movement is never edited here.** This editor is only mounted
 *    for the organization's own, and the server answers 404 for a global one.
 */

import { Alert, AlertAction, AlertDescription, AlertTitle } from '@allfitone/react/components/alert'
import { Button } from '@allfitone/react/components/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@allfitone/react/components/card'
import { FieldError } from '@allfitone/react/components/field'
import { Spinner } from '@allfitone/react/components/spinner'
import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'

import { MovementFields } from './movement-fields'
import { useStudioSessionMutation } from './studio-query-provider'
import { createCommandIntentManager } from '@/lib/command-intent'
import {
  movementChanges,
  movementFormErrors,
  movementFormFrom,
  movementIssueMessages,
  type MovementFormDraft,
} from '@/lib/movement-form'
import {
  StudioApiError,
  newCommand,
  studioApi,
  type OrganizationMovement,
  type OrganizationMovementUpdate,
} from '@/lib/studio-api'
import {
  isStudioQuerySessionCancelled,
  organizationMovementQueryOptions,
  studioQueryKeys,
} from '@/lib/studio-query'

export function MovementEditor({
  movement,
  organizationId,
  disciplines,
}: {
  movement: OrganizationMovement
  organizationId: string
  disciplines: ReadonlyArray<{ value: string; label: string }>
}) {
  const queryClient = useQueryClient()
  const [base, setBase] = useState(movement)
  const [draft, setDraft] = useState<MovementFormDraft>(() => movementFormFrom(movement))
  const [submitted, setSubmitted] = useState(false)
  const [nameRefusal, setNameRefusal] = useState<string>()
  const [issues, setIssues] = useState<string[]>([])
  const [failure, setFailure] = useState<string>()
  const [conflict, setConflict] = useState<OrganizationMovement | null>(null)
  const [status, setStatus] = useState<string>()
  const [intents] = useState(() => createCommandIntentManager(newCommand))

  const save = useStudioSessionMutation({
    mutationFn: ({ body }: { body: OrganizationMovementUpdate }, signal) =>
      studioApi.updateOrganizationMovement(
        organizationId,
        movement.id,
        body,
        intents.commandFor({
          operation: 'update-organization-movement',
          resourceId: movement.id,
          payload: body,
        }),
        signal,
      ),
    onSuccess: (saved) => {
      queryClient.setQueryData(
        studioQueryKeys.organizationMovement(organizationId, saved.id),
        saved,
      )
      // The search lists the name and whose it is, which this edit may have changed.
      void queryClient.invalidateQueries({
        queryKey: studioQueryKeys.organizationMovementsRoot(organizationId),
      })
    },
  })

  const lock = base.name_locked ? { lockedName: base.name } : {}
  const checked = submitted ? movementFormErrors(draft, lock) : {}
  const errors = nameRefusal ? { ...checked, name: nameRefusal } : checked

  function change(patch: Partial<MovementFormDraft>) {
    setDraft((previous) => ({ ...previous, ...patch }))
    setNameRefusal(undefined)
    setIssues([])
    setFailure(undefined)
    setStatus(undefined)
  }

  async function submit(against: OrganizationMovement) {
    setSubmitted(true)
    if (save.isPending || Object.keys(movementFormErrors(draft, lock)).length > 0) return
    const changes = movementChanges(against, draft)
    if (Object.keys(changes).length === 0) {
      setStatus('No hay cambios que guardar.')
      return
    }
    setIssues([])
    setFailure(undefined)
    try {
      const saved = await save.mutateAsync({
        body: { expected_revision: against.revision, ...changes },
      })
      setBase(saved)
      setDraft(movementFormFrom(saved))
      setConflict(null)
      setSubmitted(false)
      setStatus(`Cambios guardados a las ${formatTime(new Date())}.`)
      intents.reset()
    } catch (caught) {
      if (isStudioQuerySessionCancelled(caught)) return
      if (!(caught instanceof StudioApiError)) {
        setFailure(SAVE_UNKNOWN_FAILURE)
        return
      }
      // The answer carries no current state, so the movement is read again to show it.
      if (caught.code === 'stale-draft') {
        const current = await queryClient.fetchQuery({
          ...organizationMovementQueryOptions(organizationId, movement.id),
          staleTime: 0,
        })
        setConflict(current)
        return
      }
      const codes = caught.issues.map((issue) => issue.code)
      const nameCode = codes.find((code) => code === 'name-taken' || code === 'movement-in-use')
      if (nameCode) {
        setNameRefusal(movementIssueMessages([nameCode])[0])
        return
      }
      if (codes.includes('movement-archived')) {
        // Archived meanwhile: read it again, and the page stops offering the edit.
        void queryClient.invalidateQueries({
          queryKey: studioQueryKeys.organizationMovement(organizationId, movement.id),
        })
        setFailure(movementIssueMessages(['movement-archived'])[0])
        return
      }
      if (caught.status === 422 && codes.length > 0) {
        setIssues(movementIssueMessages(codes))
        return
      }
      setFailure(saveFailure(caught))
    }
  }

  function loadTheirs() {
    if (!conflict) return
    setBase(conflict)
    setDraft(movementFormFrom(conflict))
    setConflict(null)
    setSubmitted(false)
    setStatus(undefined)
  }

  return (
    <Card data-movement-editor>
      <CardHeader>
        <CardTitle role="heading" aria-level={2}>
          Editar el movimiento
        </CardTitle>
        {/* Criterion 1, before anything is changed. */}
        <CardDescription>
          Editarlo no cambia el historial: las versiones publicadas y las sesiones guardan el
          movimiento por su identificador y conservan lo que significaban. El equipo no se edita
          aquí y se conserva tal como está.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form
          data-studio-form
          noValidate
          onSubmit={(event) => {
            event.preventDefault()
            void submit(conflict ?? base)
          }}
        >
          <MovementFields
            draft={draft}
            errors={errors}
            disciplines={disciplines}
            organizationId={organizationId}
            locked={base.name_locked}
            onChange={change}
          />

          <div data-program-save-bar>
            {conflict ? (
              <Alert variant="warning" live="assertive" data-movement-conflict>
                <AlertTitle>Alguien cambió este movimiento mientras lo editabas</AlertTitle>
                <AlertDescription>
                  Ahora se llama «{conflict.name}» y tiene{' '}
                  {conflict.aliases.length === 1
                    ? '1 nombre alternativo'
                    : `${conflict.aliases.length} nombres alternativos`}
                  . Tus cambios siguen aquí sin guardar: puedes cargar lo guardado y perderlos, o
                  guardar los tuyos encima.
                </AlertDescription>
                <AlertAction>
                  <Button type="button" variant="outline" onClick={loadTheirs}>
                    Cargar lo guardado
                  </Button>
                  <Button type="submit" disabled={save.isPending}>
                    Guardar mis cambios encima
                  </Button>
                </AlertAction>
              </Alert>
            ) : null}

            {issues.length > 0 ? (
              <Alert variant="danger" live="polite" data-movement-issues>
                <AlertTitle>El servidor no aceptó los cambios</AlertTitle>
                <AlertDescription>
                  <ul>
                    {issues.map((issue) => (
                      <li key={issue}>{issue}</li>
                    ))}
                  </ul>
                </AlertDescription>
              </Alert>
            ) : null}
            {failure ? <FieldError data-movement-error>{failure}</FieldError> : null}

            <Button type="submit" size="lg" disabled={save.isPending}>
              {save.isPending ? <Spinner label="Guardando los cambios" /> : null}
              {save.isPending ? 'Guardando…' : 'Guardar cambios'}
            </Button>
            <p data-movement-save-status role="status" aria-live="polite">
              {status ?? ''}
            </p>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}

function formatTime(value: Date): string {
  return new Intl.DateTimeFormat('es-CO', { timeStyle: 'short' }).format(value)
}

const SAVE_UNKNOWN_FAILURE =
  'No pudimos guardar los cambios. Siguen aquí para que puedas reintentar.'

function saveFailure(error: StudioApiError): string {
  if (error.status === 403 || error.status === 404) {
    return 'Ya no puedes editar este movimiento: tu rol cambió o la organización no está activa.'
  }
  if (error.status === 409 || error.status === 429) {
    return 'Ese guardado ya está en curso. Espera un momento y reintenta sin cambiar nada.'
  }
  if (error.status === 503) {
    return 'El guardado está pausado temporalmente. Tus cambios siguen aquí; reintenta más tarde.'
  }
  return SAVE_UNKNOWN_FAILURE
}
